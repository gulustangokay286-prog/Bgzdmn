import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Download, Printer, Search, Users, UserX, UserCheck, AlertCircle, RefreshCcw, Filter, ChevronDown, FileText, CheckCircle, Clock, Timer } from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { db, rtdb } from '../services/firebaseConfig';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ref, get } from 'firebase/database';

const DailyAbsenceReportView = () => {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [allStudents, setAllStudents] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');

  const fetchDailyData = async () => {
    setLoading(true);
    try {
      // 1. Tüm öğrencileri çek
      const rawUsers = await firebaseService.fetchAllUsers();
      const studentList = rawUsers.filter(u => {
        const role = u.fields?.role?.stringValue?.toLowerCase() || '';
        return role === 'student' || role === 'öğrenci';
      }).map(u => {
        const id = u.name.split('/').pop();
        const f = u.fields || {};
        const name = f.full_name?.stringValue || f.fullName?.stringValue || f.name?.stringValue || f.displayName?.stringValue || 'İsimsiz Öğrenci';
        const rawPhoto = f.profile_image?.stringValue || f.profileImageUrl?.stringValue || null;
        const profileImage = rawPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=103A69&color=fff&size=100`;
        const tc = f.tc_kimlik?.stringValue || f.tcKimlik?.stringValue || '';
        const schoolNumber = f.school_number?.stringValue || f.schoolNumber?.stringValue || '-';
        const classId = f.class_id?.stringValue || f.classId?.stringValue || f.grade?.stringValue || '9';

        return {
          id,
          name,
          tc,
          schoolNumber,
          classId: classId.replace(/[^0-9]/g, '') || '9',
          profileImage
        };
      });

      // 2. Seçilen güne ait RTDB ve Firestore Loglarını analiz et
      const recordsMap = {}; // studentId -> { morningScan: { time, isLate }, afternoonScan: { time, isLate }, manualRecord: { ... } }

      try {
        // RTDB logs
        const rtdbSnap = await get(ref(rtdb, `qr_system/attendance_logs/${selectedDate}`));
        if (rtdbSnap.exists()) {
          const logs = rtdbSnap.val();
          Object.values(logs).forEach(log => {
            if (log.studentId) {
              if (!recordsMap[log.studentId]) {
                recordsMap[log.studentId] = { scans: [] };
              }
              recordsMap[log.studentId].scans.push(log);
            }
          });
        }
      } catch (rtdbErr) {
        console.log("RTDB logs load info:", rtdbErr);
      }

      // Firestore logs
      try {
        const fsLogsSnap = await getDocs(query(collection(db, 'attendance_logs'), where('date', '==', selectedDate)));
        fsLogsSnap.forEach(d => {
          const data = d.data();
          if (data.studentId) {
            if (!recordsMap[data.studentId]) {
              recordsMap[data.studentId] = { scans: [] };
            }
            recordsMap[data.studentId].scans.push(data);
          }
        });
      } catch (fsErr) {
        console.log("Firestore logs load info:", fsErr);
      }

      // Firestore manual 'attendance' records
      try {
        const fsManualSnap = await getDocs(collection(db, 'attendance'));
        fsManualSnap.forEach(d => {
          const data = d.data();
          const rDate = data.date ? (data.date.toDate ? data.date.toDate().toISOString().split('T')[0] : new Date(data.date).toISOString().split('T')[0]) : null;
          if (rDate === selectedDate && data.studentId) {
            if (!recordsMap[data.studentId]) {
              recordsMap[data.studentId] = { scans: [] };
            }
            recordsMap[data.studentId].manual = data;
          }
        });
      } catch (manualErr) {
        console.log("Manual attendance load info:", manualErr);
      }

      setAllStudents(studentList);
      setAttendanceRecords(recordsMap);
    } catch (err) {
      console.error("Veriler yüklenirken hata:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDailyData();
  }, [selectedDate]);

  // Öğrencilerin Tam Gün / Yarım Gün / Geç Kalma Analizi
  const analyzedStudents = useMemo(() => {
    return allStudents.map(student => {
      const rec = attendanceRecords[student.id];
      
      // Manuel kayıt varsa öncelikli
      if (rec?.manual) {
        const cName = rec.manual.courseName || '';
        const isYarim = cName.includes('Yarım Gün') || rec.manual.periodIndex === -0.5;
        const isRaporlu = rec.manual.status === 'excused' || cName.includes('Raporlu');
        return {
          ...student,
          absenceStatus: isRaporlu ? 'RAPORLU' : isYarim ? 'YARIM_GUN' : 'TAM_GUN',
          absenceWeight: isRaporlu ? 0 : (isYarim ? 0.5 : 1.0),
          statusLabel: isRaporlu ? 'İzinli / Raporlu' : isYarim ? 'Yarım Gün Devamsız (0.5)' : 'Tam Gün Devamsız (1.0)',
          detailNote: rec.manual.courseName || 'Manuel İşlem',
          isLate: false
        };
      }

      const scans = rec?.scans || [];
      if (scans.length === 0) {
        // Hiç tarama yok -> Tam Gün Devamsız
        return {
          ...student,
          absenceStatus: 'TAM_GUN',
          absenceWeight: 1.0,
          statusLabel: 'Tam Gün Devamsız (1.0)',
          detailNote: 'Hiç Giriş Yapmadı',
          isLate: false
        };
      }

      // Sabah (07:00 - 12:30) ve Öğle (12:30 - 18:00) Giriş Taramalarını Ayır
      let hasMorningEntry = false;
      let hasAfternoonEntry = false;
      let morningLate = false;
      let afternoonLate = false;
      let scanTimes = [];

      scans.forEach(s => {
        let hour = 9, min = 0;
        if (s.time) {
          const parts = s.time.split(':').map(Number);
          hour = parts[0]; min = parts[1];
        } else if (s.timestamp) {
          const d = new Date(s.timestamp);
          hour = d.getHours(); min = d.getMinutes();
        }
        scanTimes.push(`${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
        const totalMin = hour * 60 + min;

        if (totalMin < 12 * 60 + 30) {
          hasMorningEntry = true;
          if (totalMin > 9 * 60 + 5 || s.isLate) morningLate = true;
        } else {
          hasAfternoonEntry = true;
          if (totalMin > 13 * 60 + 5 || s.isLate) afternoonLate = true;
        }
      });

      const isLate = morningLate || afternoonLate;

      if (hasMorningEntry && hasAfternoonEntry) {
        // İki yarıda da var -> Tam Gün Mevcut
        return {
          ...student,
          absenceStatus: 'MEVCUT',
          absenceWeight: 0,
          statusLabel: isLate ? 'Mevcut (Geç Kaldı)' : 'Tam Gün Mevcut',
          detailNote: `Girişler: ${scanTimes.join(', ')}`,
          isLate
        };
      } else if (hasMorningEntry && !hasAfternoonEntry) {
        // Sadece sabah var -> Yarım Gün Yok
        return {
          ...student,
          absenceStatus: 'YARIM_GUN',
          absenceWeight: 0.5,
          statusLabel: 'Yarım Gün Devamsız (0.5)',
          detailNote: `Öğleden sonra gelmedi (Sabah: ${scanTimes.join(', ')})`,
          isLate
        };
      } else if (!hasMorningEntry && hasAfternoonEntry) {
        // Sadece öğleden sonra var -> Yarım Gün Yok
        return {
          ...student,
          absenceStatus: 'YARIM_GUN',
          absenceWeight: 0.5,
          statusLabel: 'Yarım Gün Devamsız (0.5)',
          detailNote: `Sabahtan gelmedi (Öğle: ${scanTimes.join(', ')})`,
          isLate
        };
      }

      return {
        ...student,
        absenceStatus: 'TAM_GUN',
        absenceWeight: 1.0,
        statusLabel: 'Tam Gün Devamsız (1.0)',
        detailNote: 'Giriş Kaydı Yok',
        isLate: false
      };
    });
  }, [allStudents, attendanceRecords]);

  // Devamsızlığı olan (Tam Gün veya Yarım Gün) veya Geç Kalan Öğrenciler
  const absentStudents = useMemo(() => {
    return analyzedStudents.filter(s => s.absenceStatus === 'TAM_GUN' || s.absenceStatus === 'YARIM_GUN');
  }, [analyzedStudents]);

  // Filtreleme (Arama & Sınıf)
  const filteredAbsents = useMemo(() => {
    let list = absentStudents;
    if (selectedClassFilter !== 'all') {
      list = list.filter(s => s.classId === selectedClassFilter);
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(s => 
        s.name.toLowerCase().includes(q) || 
        s.schoolNumber.includes(q) || 
        s.tc.includes(q)
      );
    }
    return list;
  }, [absentStudents, selectedClassFilter, searchText]);

  // Sınıflara Göre Gruplama ve Her Grup İçinde A-Z Alfabetik Sıralama
  const groupedByClass = useMemo(() => {
    const groups = {};
    filteredAbsents.forEach(student => {
      const c = student.classId || 'Diğer';
      if (!groups[c]) groups[c] = [];
      groups[c].push(student);
    });

    Object.keys(groups).forEach(classKey => {
      groups[classKey].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    });

    return Object.keys(groups).sort((a, b) => Number(a) - Number(b)).reduce((acc, key) => {
      acc[key] = groups[key];
      return acc;
    }, {});
  }, [filteredAbsents]);

  // Metrikler
  const totalCount = allStudents.length;
  const fullDayAbsentCount = analyzedStudents.filter(s => s.absenceStatus === 'TAM_GUN').length;
  const halfDayAbsentCount = analyzedStudents.filter(s => s.absenceStatus === 'YARIM_GUN').length;
  const totalAbsentDays = (fullDayAbsentCount * 1.0 + halfDayAbsentCount * 0.5).toFixed(1).replace('.0', '').replace('.', ',');
  const presentCount = totalCount - fullDayAbsentCount;

  // CSV İndir
  const handleExportCSV = () => {
    if (absentStudents.length === 0) {
      alert("İndirilecek devamsız öğrenci bulunmamaktadır.");
      return;
    }

    const headers = ["Tarih", "Sınıf", "Okul Numarası", "TC Kimlik No", "Öğrenci Adı Soyadı", "Devamsızlık Tipi", "Devamsızlık Süresi (Gün)", "Açıklama"];
    const rows = [];

    Object.keys(groupedByClass).forEach(classKey => {
      groupedByClass[classKey].forEach(s => {
        rows.push([
          selectedDate,
          `${classKey}. Sınıf`,
          `"${s.schoolNumber}"`,
          `"${s.tc}"`,
          `"${s.name}"`,
          s.absenceStatus === 'YARIM_GUN' ? 'Yarım Gün' : 'Tam Gün',
          s.absenceWeight,
          `"${s.detailNote}"`
        ]);
      });
    });

    const csvContent = "\uFEFF" + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bogazici_Devamsizlik_Listesi_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintPDF = () => {
    window.print();
  };

  const formattedDisplayDate = new Date(selectedDate).toLocaleDateString('tr-TR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="daily-absence-container font-sans w-full pb-10">
      
      {/* Header & Controls */}
      <div className="no-print mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Akademik Raporlama</span>
            <h1 className="text-[30px] font-extrabold text-slate-900 dark:text-white tracking-tight">
              Günlük Devamsızlık Takip & Rapor Merkezi
            </h1>
            <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-1">
              Öğleden önce/sonra gelmeyen (yarım gün) veya gün boyu gelmeyen (tam gün) öğrencilerin sınıf bazlı listesi.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={handleExportCSV}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[13.5px] font-bold flex items-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <Download size={16} />
              <span>CSV İndir</span>
            </button>
            <button
              onClick={handlePrintPDF}
              className="px-4 py-2.5 bg-[#103A69] hover:bg-[#1c528f] text-white rounded-xl text-[13.5px] font-bold flex items-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer"
            >
              <Printer size={16} />
              <span>PDF / Yazdır</span>
            </button>
          </div>
        </div>

        {/* Metrik Kartları */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Rapor Tarihi</span>
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-[#103A69] dark:text-blue-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-[14px] font-bold text-slate-800 dark:text-white outline-none cursor-pointer"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Toplam Öğrenci</span>
            <div className="flex items-baseline justify-between">
              <span className="text-[24px] font-extrabold text-slate-900 dark:text-white">{totalCount}</span>
              <Users size={20} className="text-slate-400" />
            </div>
          </div>

          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-xs">
            <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block mb-1">Yarım Gün Yok (0.5)</span>
            <div className="flex items-baseline justify-between">
              <span className="text-[24px] font-extrabold text-amber-600">{halfDayAbsentCount}</span>
              <Clock size={20} className="text-amber-500" />
            </div>
          </div>

          <div className="bg-white dark:bg-[#0f172a] border border-red-200 dark:border-red-900/40 bg-red-50/20 rounded-2xl p-4 shadow-xs">
            <span className="text-[11px] font-bold text-red-600 uppercase tracking-wider block mb-1">Toplam Devamsız ({totalAbsentDays} Gün)</span>
            <div className="flex items-baseline justify-between">
              <span className="text-[24px] font-extrabold text-red-600">{absentStudents.length}</span>
              <UserX size={20} className="text-red-500" />
            </div>
          </div>
        </div>

        {/* Filtre ve Arama Barı */}
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-white dark:bg-[#0f172a] p-3 rounded-2xl border border-slate-200 dark:border-white/10 shadow-xs">
          <div className="relative flex-1 w-full">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Devamsız öğrenci ara (İsim, Okul No, TC)..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-[13.5px] font-medium outline-none text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-[12px] font-bold text-slate-500 whitespace-nowrap">Sınıf:</span>
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-[13px] font-bold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
            >
              <option value="all">Tüm Sınıflar</option>
              <option value="9">9. Sınıf</option>
              <option value="10">10. Sınıf</option>
              <option value="11">11. Sınıf</option>
              <option value="12">12. Sınıf</option>
            </select>

            <button
              onClick={fetchDailyData}
              disabled={loading}
              className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white bg-slate-50 dark:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Yenile"
            >
              <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* Rapor İçeriği */}
      <div className="printable-report bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-2xl p-6 md:p-8 shadow-sm">
        
        {/* Başlık */}
        <div className="border-b-2 border-slate-800 pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-[20px] font-black text-slate-900 dark:text-white tracking-tight uppercase">ÇORUM BOĞAZİÇİ EĞİTİM KURUMLARI</h2>
              <h3 className="text-[15px] font-bold text-red-600">GÜNLÜK ÖĞRENCİ DEVAMSIZLIK VE GEÇ KALMA ÇİZELGESİ</h3>
            </div>
            <div className="text-right">
              <span className="text-[13px] font-bold text-slate-700 dark:text-slate-300 block">{formattedDisplayDate}</span>
              <span className="text-[11px] text-slate-500 font-semibold">Devamsız: {absentStudents.length} Öğrenci ({totalAbsentDays} Gün)</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <RefreshCcw size={32} className="animate-spin mb-3 text-[#103A69]" />
            <p className="text-[14px] font-semibold">Devamsızlık verileri taranıyor...</p>
          </div>
        ) : filteredAbsents.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-3">
              <CheckCircle size={32} />
            </div>
            <h4 className="text-[16px] font-bold text-slate-800 dark:text-white mb-1">
              {searchText || selectedClassFilter !== 'all' ? 'Aramanıza Uygun Devamsız Öğrenci Bulunamadı' : 'Mükemmel! Bugün Devamsız Öğrenci Yok'}
            </h4>
            <p className="text-[13px] text-slate-500 max-w-sm">
              Seçilen tarihte ({selectedDate}) tüm öğrenciler kurumda tam gün olarak bulunmuştur.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.keys(groupedByClass).map(classKey => {
              const studentsInClass = groupedByClass[classKey];
              return (
                <div key={classKey} className="class-group-block">
                  <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-lg mb-3">
                    <span className="text-[14px] font-extrabold text-[#103A69] dark:text-blue-400 uppercase tracking-wide">
                      📚 {classKey}. Sınıf Devamsız Öğrenciler
                    </span>
                    <span className="text-[12px] font-bold text-red-600 bg-red-50 dark:bg-red-950/50 px-2.5 py-0.5 rounded-full border border-red-200 dark:border-red-800">
                      {studentsInClass.length} Öğrenci
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase text-[11px]">
                          <th className="py-2.5 px-3 w-12 text-center">#</th>
                          <th className="py-2.5 px-3 w-28">Okul No</th>
                          <th className="py-2.5 px-3 w-36">T.C. Kimlik</th>
                          <th className="py-2.5 px-3">Öğrenci Adı Soyadı (A-Z)</th>
                          <th className="py-2.5 px-3 w-48 text-center">Devamsızlık Durumu</th>
                          <th className="py-2.5 px-3">Açıklama / Giriş Saati</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {studentsInClass.map((student, idx) => (
                          <tr key={student.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 px-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-700 dark:text-slate-200">{student.schoolNumber}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-500">{student.tc || '-'}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
                              <img
                                src={student.profileImage}
                                alt=""
                                className="w-6 h-6 rounded-full object-cover no-print"
                              />
                              <span>{student.name}</span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {student.absenceStatus === 'YARIM_GUN' ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                                  YARIM GÜN (0.5)
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border border-red-200 dark:border-red-800">
                                  TAM GÜN (1.0)
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 text-[12px]">
                              {student.detailNote}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Yazdırma İmza Bloğu */}
        <div className="hidden print:block mt-12 pt-6 border-t border-slate-300">
          <div className="flex justify-between text-[12px] font-bold text-slate-800">
            <div>
              <p>Nöbetçi Müdür Yardımcısı</p>
              <p className="mt-8 font-normal">İmza / Mühür</p>
            </div>
            <div>
              <p>Okul Müdürü</p>
              <p className="mt-8 font-normal">İmza / Onay</p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          .no-print, .sidebar, .drag-region-top, header, nav {
            display: none !important;
          }
          .printable-report {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          .class-group-block {
            page-break-inside: avoid;
            margin-bottom: 20px;
          }
        }
      `}</style>
    </div>
  );
};

export default DailyAbsenceReportView;
