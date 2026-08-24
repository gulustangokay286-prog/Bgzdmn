import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Download, Printer, Search, Users, UserX, UserCheck, AlertCircle, RefreshCcw, Filter, ChevronDown, FileText, CheckCircle } from 'lucide-react';
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

      // 2. Seçilen güne ait RTDB ve Firestore Attendance Loglarını çek
      const recordsMap = {}; // studentId -> { status: 'entry'|'present'|'late', firstScanTime: '08:55', ... }

      try {
        // RTDB check
        const rtdbSnap = await get(ref(rtdb, `qr_system/attendance_logs/${selectedDate}`));
        if (rtdbSnap.exists()) {
          const logs = rtdbSnap.val();
          Object.values(logs).forEach(log => {
            if (log.studentId) {
              recordsMap[log.studentId] = {
                status: log.status || 'entry',
                time: log.timestamp ? new Date(log.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '08:50',
                isLate: log.isLate || false
              };
            }
          });
        }
      } catch (rtdbErr) {
        console.log("RTDB logs load info:", rtdbErr);
      }

      // Firestore check
      try {
        const fsLogsSnap = await getDocs(query(collection(db, 'attendance_logs'), where('date', '==', selectedDate)));
        fsLogsSnap.forEach(d => {
          const data = d.data();
          if (data.studentId && !recordsMap[data.studentId]) {
            recordsMap[data.studentId] = {
              status: data.status || 'present',
              time: data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp)).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '08:50',
              isLate: data.isLate || false
            };
          }
        });
      } catch (fsErr) {
        console.log("Firestore logs load info:", fsErr);
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

  // Öğrencilerin Yoklama Durumunu Belirleme
  const analyzedStudents = useMemo(() => {
    return allStudents.map(student => {
      const record = attendanceRecords[student.id];
      const isPresent = !!record;
      return {
        ...student,
        isPresent,
        statusLabel: isPresent ? (record.isLate ? 'Geç Geldi' : 'Geldi (Giriş Yaptı)') : 'DEVAMSIZ (GELMEDİ)',
        scanTime: isPresent ? record.time : '-'
      };
    });
  }, [allStudents, attendanceRecords]);

  // Sadece Devamsız (Gelmeyen) Öğrenciler
  const absentStudents = useMemo(() => {
    return analyzedStudents.filter(s => !s.isPresent);
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

    // Her sınıf içindeki öğrencileri A'dan Z'ye alfabetik sırala
    Object.keys(groups).forEach(classKey => {
      groups[classKey].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    });

    // Sınıf anahtarlarını sırala (9, 10, 11, 12)
    return Object.keys(groups).sort((a, b) => Number(a) - Number(b)).reduce((acc, key) => {
      acc[key] = groups[key];
      return acc;
    }, {});
  }, [filteredAbsents]);

  // Metrikler
  const totalCount = allStudents.length;
  const presentCount = analyzedStudents.filter(s => s.isPresent).length;
  const absentCount = absentStudents.length;
  const absenceRate = totalCount > 0 ? ((absentCount / totalCount) * 100).toFixed(1) : 0;

  // CSV İndir
  const handleExportCSV = () => {
    if (absentStudents.length === 0) {
      alert("İndirilecek devamsız öğrenci bulunmamaktadır.");
      return;
    }

    const headers = ["Tarih", "Sınıf", "Okul Numarası", "TC Kimlik No", "Öğrenci Adı Soyadı", "Devamsızlık Durumu"];
    const rows = [];

    Object.keys(groupedByClass).forEach(classKey => {
      groupedByClass[classKey].forEach(s => {
        rows.push([
          selectedDate,
          `${classKey}. Sınıf`,
          `"${s.schoolNumber}"`,
          `"${s.tc}"`,
          `"${s.name}"`,
          "DEVAMSIZ"
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

  // PDF / Yazdır
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
      
      {/* Header & Controls (Print edilmez) */}
      <div className="no-print mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Akademik Raporlama</span>
            <h1 className="text-[30px] font-extrabold text-slate-900 dark:text-white tracking-tight">
              Günlük Devamsızlık Takip & Rapor Merkezi
            </h1>
            <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-1">
              Karekod okutmayan veya gün boyunca kuruma giriş yapmayan tüm öğrencilerin sınıf bazlı listesi.
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

        {/* Tarih Seçimi & İstatistik Kartları */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          
          {/* Tarih Kartı */}
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

          {/* Toplam Öğrenci */}
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Toplam Öğrenci</span>
            <div className="flex items-baseline justify-between">
              <span className="text-[24px] font-extrabold text-slate-900 dark:text-white">{totalCount}</span>
              <Users size={20} className="text-slate-400" />
            </div>
          </div>

          {/* Gelen Öğrenci */}
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-xs">
            <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">Giriş Yapanlar</span>
            <div className="flex items-baseline justify-between">
              <span className="text-[24px] font-extrabold text-emerald-600">{presentCount}</span>
              <UserCheck size={20} className="text-emerald-500" />
            </div>
          </div>

          {/* Devamsız Öğrenci */}
          <div className="bg-white dark:bg-[#0f172a] border border-red-200 dark:border-red-900/40 bg-red-50/20 rounded-2xl p-4 shadow-xs">
            <span className="text-[11px] font-bold text-red-600 uppercase tracking-wider block mb-1">Toplam Devamsız (%{absenceRate})</span>
            <div className="flex items-baseline justify-between">
              <span className="text-[24px] font-extrabold text-red-600">{absentCount}</span>
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

      {/* Rapor İçeriği / Yazdırılabilir Bölüm */}
      <div className="printable-report bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-2xl p-6 md:p-8 shadow-sm">
        
        {/* Yazdırma Başlığı */}
        <div className="border-b-2 border-slate-800 pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-[20px] font-black text-slate-900 dark:text-white tracking-tight uppercase">ÇORUM BOĞAZİÇİ EĞİTİM KURUMLARI</h2>
              <h3 className="text-[15px] font-bold text-red-600">GÜNLÜK ÖĞRENCİ DEVAMSIZLIK ÇİZELGESİ</h3>
            </div>
            <div className="text-right">
              <span className="text-[13px] font-bold text-slate-700 dark:text-slate-300 block">{formattedDisplayDate}</span>
              <span className="text-[11px] text-slate-500 font-semibold">Toplam Devamsız: {absentCount} Öğrenci</span>
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
              {searchText || selectedClassFilter !== 'all' ? 'Aramanıza Uygun Devamsız Öğrenci Bulunamadı' : 'Harika! Bugün Tüm Öğrenciler Kurumda'}
            </h4>
            <p className="text-[13px] text-slate-500 max-w-sm">
              Seçilen tarihte ({selectedDate}) listelenecek herhangi bir devamsızlık kaydı bulunmuyor.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.keys(groupedByClass).map(classKey => {
              const studentsInClass = groupedByClass[classKey];
              return (
                <div key={classKey} className="class-group-block">
                  {/* Sınıf Başlığı */}
                  <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-lg mb-3">
                    <span className="text-[14px] font-extrabold text-[#103A69] dark:text-blue-400 uppercase tracking-wide">
                      📚 {classKey}. Sınıf Devamsız Öğrenciler
                    </span>
                    <span className="text-[12px] font-bold text-red-600 bg-red-50 dark:bg-red-950/50 px-2.5 py-0.5 rounded-full border border-red-200 dark:border-red-800">
                      {studentsInClass.length} Öğrenci Gelmedi
                    </span>
                  </div>

                  {/* Sınıf Tablosu */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-bold uppercase text-[11px]">
                          <th className="py-2.5 px-3 w-12 text-center">#</th>
                          <th className="py-2.5 px-3 w-28">Okul No</th>
                          <th className="py-2.5 px-3 w-36">T.C. Kimlik</th>
                          <th className="py-2.5 px-3">Öğrenci Adı Soyadı (A-Z)</th>
                          <th className="py-2.5 px-3 w-36 text-center">Durum</th>
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
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border border-red-200 dark:border-red-800">
                                DEVAMSIZ
                              </span>
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

        {/* Yazdırma Altı İmza Alanı */}
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

      {/* Print Stilleri */}
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
