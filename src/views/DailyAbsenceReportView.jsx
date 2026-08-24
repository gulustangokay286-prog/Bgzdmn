import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Download, Printer, Search, Users, UserX, UserCheck, 
  AlertCircle, RefreshCcw, Filter, ChevronDown, FileText, CheckCircle, 
  Clock, Timer, Activity, Sparkles, ShieldCheck
} from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { db, rtdb } from '../services/firebaseConfig';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';

const DailyAbsenceReportView = () => {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [allStudents, setAllStudents] = useState([]);
  const [rtdbLogs, setRtdbLogs] = useState({});
  const [firestoreLogs, setFirestoreLogs] = useState({});
  const [manualAttendance, setManualAttendance] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');

  // 1. Gerçek Zamanlı Öğrenci Listesi Dinleyicisi (Firestore 'users')
  useEffect(() => {
    setLoading(true);
    const usersCol = collection(db, 'users');
    const unsubUsers = onSnapshot(usersCol, (snap) => {
      const studentList = [];
      snap.forEach(d => {
        const data = d.data();
        const role = (data.role || '').toLowerCase();
        // Sadece öğrenciler ve onaylı veya onay aşamasındaki kayıtlar
        if (role === 'student' || role === 'öğrenci') {
          const name = data.full_name || data.fullName || data.name || data.displayName || 'İsimsiz Öğrenci';
          const profileImage = data.profile_image || data.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=103A69&color=fff&size=100&bold=true`;
          const tc = data.tc_kimlik || data.tcKimlik || data.tc || '';
          const schoolNumber = data.school_number || data.schoolNumber || data.no || '-';
          const classId = (data.class_id || data.classId || data.grade || '9').toString().replace(/[^0-9]/g, '') || '9';

          studentList.push({
            id: d.id,
            name,
            tc,
            schoolNumber,
            classId,
            profileImage,
            status: data.status || 'approved'
          });
        }
      });
      setAllStudents(studentList);
      setLoading(false);
    }, (err) => {
      console.error("Firestore users dinleme hatası:", err);
      setLoading(false);
    });

    return () => unsubUsers();
  }, []);

  // 2. Gerçek Zamanlı Turnike & QR Geçiş Logları Dinleyicisi (RTDB 'qr_system/attendance_logs')
  useEffect(() => {
    const rtdbPath = ref(rtdb, `qr_system/attendance_logs/${selectedDate}`);
    const unsubRtdb = onValue(rtdbPath, (snapshot) => {
      if (snapshot.exists()) {
        setRtdbLogs(snapshot.val());
      } else {
        setRtdbLogs({});
      }
    });

    return () => unsubRtdb();
  }, [selectedDate]);

  // 3. Gerçek Zamanlı Firestore Logları Dinleyicisi (Firestore 'attendance_logs' & 'attendance')
  useEffect(() => {
    const fsAttLogsQuery = query(collection(db, 'attendance_logs'), where('date', '==', selectedDate));
    const unsubFsLogs = onSnapshot(fsAttLogsQuery, (snap) => {
      const logs = {};
      snap.forEach(d => {
        const data = d.data();
        if (data.studentId) {
          if (!logs[data.studentId]) logs[data.studentId] = [];
          logs[data.studentId].push(data);
        }
      });
      setFirestoreLogs(logs);
    });

    const fsManualQuery = collection(db, 'attendance');
    const unsubFsManual = onSnapshot(fsManualQuery, (snap) => {
      const manuals = {};
      snap.forEach(d => {
        const data = d.data();
        const rDate = data.date ? (data.date.toDate ? data.date.toDate().toISOString().split('T')[0] : new Date(data.date).toISOString().split('T')[0]) : null;
        if (rDate === selectedDate && data.studentId) {
          manuals[data.studentId] = data;
        }
      });
      setManualAttendance(manuals);
    });

    return () => {
      unsubFsLogs();
      unsubFsManual();
    };
  }, [selectedDate]);

  const hasAnyActivity = useMemo(() => {
    const hasRtdb = Object.keys(rtdbLogs).length > 0;
    const hasFsLogs = Object.keys(firestoreLogs).length > 0;
    const hasManual = Object.keys(manualAttendance).length > 0;
    return hasRtdb || hasFsLogs || hasManual;
  }, [rtdbLogs, firestoreLogs, manualAttendance]);

  // 4. Öğrencilerin Güncel Turnike Geçişi ve Devamsızlık Durumunu Analiz Etme Motoru
  const analyzedStudents = useMemo(() => {
    // Eğer o gün için henüz hiçbir turnike veya manuel yoklama verisi yoksa (sıfırlanmış / gün başlamamış)
    if (!hasAnyActivity) {
      return allStudents.map(student => ({
        ...student,
        absenceStatus: 'BEKLEMEDE',
        absenceWeight: 0,
        statusLabel: 'Turnike Girişi Bekleniyor',
        detailNote: 'Henüz turnike kaydı oluşmadı',
        isLate: false,
        isTurnstilePresent: false
      }));
    }

    return allStudents.map(student => {
      // 1. Manuel Yönetici Kararı Varsa
      if (manualAttendance[student.id]) {
        const manual = manualAttendance[student.id];
        const cName = manual.courseName || '';
        const isYarim = cName.includes('Yarım Gün') || manual.periodIndex === -0.5;
        const isRaporlu = manual.status === 'excused' || cName.includes('Raporlu');
        return {
          ...student,
          absenceStatus: isRaporlu ? 'RAPORLU' : isYarim ? 'YARIM_GUN' : 'TAM_GUN',
          absenceWeight: isRaporlu ? 0 : (isYarim ? 0.5 : 1.0),
          statusLabel: isRaporlu ? 'İzinli / Raporlu' : isYarim ? 'Yarım Gün Devamsız (0.5)' : 'Tam Gün Devamsız (1.0)',
          detailNote: cName || 'İdare Tarafından İşlendi',
          isLate: false,
          isTurnstilePresent: false
        };
      }

      // 2. Turnike & QR Geçişlerini Tara
      const studentScans = [];

      // RTDB turnike logları
      Object.values(rtdbLogs).forEach(log => {
        if (log.studentId === student.id || (student.tc && log.studentTc === student.tc)) {
          studentScans.push(log);
        }
      });

      // Firestore ek logları
      if (firestoreLogs[student.id]) {
        firestoreLogs[student.id].forEach(log => studentScans.push(log));
      }

      if (studentScans.length === 0) {
        return {
          ...student,
          absenceStatus: 'TAM_GUN',
          absenceWeight: 1.0,
          statusLabel: 'Tam Gün Devamsız (1.0)',
          detailNote: 'Turnikeden Geçiş Yapılmadı',
          isLate: false,
          isTurnstilePresent: false
        };
      }

      // Sabah (07:00 - 12:30) ve Öğle (12:30 - 18:00) Turnike Girişlerini Belirle
      let hasMorningEntry = false;
      let hasAfternoonEntry = false;
      let morningLate = false;
      let afternoonLate = false;
      let scanTimes = [];

      studentScans.forEach(s => {
        let hour = 9, min = 0;
        if (s.time) {
          const parts = s.time.split(':').map(Number);
          hour = parts[0]; min = parts[1];
        } else if (s.timestamp) {
          const d = new Date(s.timestamp);
          hour = d.getHours(); min = d.getMinutes();
        }
        const timeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        scanTimes.push(timeStr);
        const totalMin = hour * 60 + min;

        // 09:00 sabah toleransı 09:05'e kadar, 12:30'a kadar olanlar sabah girişidir
        if (totalMin < 12 * 60 + 30) {
          hasMorningEntry = true;
          if (totalMin > 9 * 60 + 5 || s.isLate) morningLate = true;
        } else {
          // 12:30 sonrası öğle girişidir, 13:05 sonrası geç kalmadır
          hasAfternoonEntry = true;
          if (totalMin > 13 * 60 + 5 || s.isLate) afternoonLate = true;
        }
      });

      const isLate = morningLate || afternoonLate;

      if (hasMorningEntry && hasAfternoonEntry) {
        return {
          ...student,
          absenceStatus: 'MEVCUT',
          absenceWeight: 0,
          statusLabel: isLate ? 'Mevcut (Geç Kaldı)' : 'Tam Gün Mevcut',
          detailNote: `Turnike Girişleri: ${scanTimes.join(', ')}`,
          isLate,
          isTurnstilePresent: true
        };
      } else if (hasMorningEntry && !hasAfternoonEntry) {
        return {
          ...student,
          absenceStatus: 'YARIM_GUN',
          absenceWeight: 0.5,
          statusLabel: 'Yarım Gün Devamsız (0.5)',
          detailNote: `Sabah Giriş: ${scanTimes.join(', ')} (Öğleden sonra gelmedi)`,
          isLate,
          isTurnstilePresent: true
        };
      } else if (!hasMorningEntry && hasAfternoonEntry) {
        return {
          ...student,
          absenceStatus: 'YARIM_GUN',
          absenceWeight: 0.5,
          statusLabel: 'Yarım Gün Devamsız (0.5)',
          detailNote: `Öğle Giriş: ${scanTimes.join(', ')} (Sabahtan gelmedi)`,
          isLate,
          isTurnstilePresent: true
        };
      }

      return {
        ...student,
        absenceStatus: 'TAM_GUN',
        absenceWeight: 1.0,
        statusLabel: 'Tam Gün Devamsız (1.0)',
        detailNote: 'Turnikeden Giriş Yapılmadı',
        isLate: false,
        isTurnstilePresent: false
      };
    });
  }, [allStudents, rtdbLogs, firestoreLogs, manualAttendance, hasAnyActivity]);

  // Sadece Devamsız (Tam Gün veya Yarım Gün) Olan Öğrenciler
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
  const presentCount = analyzedStudents.filter(s => s.isTurnstilePresent).length;
  const totalAbsentDays = (fullDayAbsentCount * 1.0 + halfDayAbsentCount * 0.5).toFixed(1).replace('.0', '').replace('.', ',');
  const absencePercentage = totalCount > 0 && hasAnyActivity ? (((fullDayAbsentCount + halfDayAbsentCount * 0.5) / totalCount) * 100).toFixed(1) : 0;

  // CSV İndir (UTF-8 BOM ile Excel Uyumlu)
  const handleExportCSV = () => {
    if (absentStudents.length === 0) {
      alert("Seçilen tarihte indirilecek devamsız öğrenci bulunmamaktadır.");
      return;
    }

    const headers = ["Tarih", "Sınıf", "Okul Numarası", "TC Kimlik No", "Öğrenci Adı Soyadı", "Devamsızlık Tipi", "Devamsızlık Süresi (Gün)", "Açıklama / Turnike Bilgisi"];
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

  const formattedDisplayDate = new Date(selectedDate).toLocaleDateString('tr-TR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Profesyonel Resmi PDF / Yazdırma Penceresi Açıcı
  const handlePrintPDF = () => {
    const printWindow = window.open('', '_blank', 'width=1000,height=900');
    
    let tableContent = '';
    if (filteredAbsents.length === 0) {
      tableContent = `
        <tr>
          <td colspan="6" style="padding: 30px; text-align: center; color: #16a34a; font-weight: bold; font-size: 13.5px; border: 1px solid #cbd5e1;">
            ✓ Bu tarihte (${selectedDate}) devamsız öğrenci bulunmamaktadır. Tüm öğrenciler kurumdadır veya turnike kaydı beklenmektedir.
          </td>
        </tr>
      `;
    } else {
      Object.keys(groupedByClass).forEach(classKey => {
        const studentsInClass = groupedByClass[classKey];
        tableContent += `
          <tr style="background-color: #f1f5f9; border-top: 2px solid #cbd5e1;">
            <td colspan="6" style="padding: 10px 14px; font-weight: 800; font-size: 13px; color: #103A69; border: 1px solid #cbd5e1;">
              📚 ${classKey}. SINIF DEVAMSIZ ÖĞRENCİLER (${studentsInClass.length} Öğrenci)
            </td>
          </tr>
        `;
        studentsInClass.forEach((s, idx) => {
          const badgeBg = s.absenceStatus === 'YARIM_GUN' ? '#fef3c7' : '#fee2e2';
          const badgeColor = s.absenceStatus === 'YARIM_GUN' ? '#b45309' : '#b91c1c';
          const badgeText = s.absenceStatus === 'YARIM_GUN' ? 'Yarım Gün (0.5)' : 'Tam Gün (1.0)';
          tableContent += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 9px 12px; text-align: center; color: #64748b; font-size: 12px; border: 1px solid #e2e8f0;">${idx + 1}</td>
              <td style="padding: 9px 12px; font-family: monospace; font-weight: 700; font-size: 13px; border: 1px solid #e2e8f0;">${s.schoolNumber}</td>
              <td style="padding: 9px 12px; font-family: monospace; color: #475569; font-size: 12px; border: 1px solid #e2e8f0;">${s.tc || '-'}</td>
              <td style="padding: 9px 12px; font-weight: 700; font-size: 13px; color: #0f172a; border: 1px solid #e2e8f0;">${s.name}</td>
              <td style="padding: 9px 12px; text-align: center; border: 1px solid #e2e8f0;">
                <span style="display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 800; background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeColor}33;">
                  ${badgeText}
                </span>
              </td>
              <td style="padding: 9px 12px; font-size: 12px; color: #475569; border: 1px solid #e2e8f0;">${s.detailNote}</td>
            </tr>
          `;
        });
      });
    }

    const html = `
      <!DOCTYPE html>
      <html lang="tr">
      <head>
        <meta charset="utf-8">
        <title>Bogazici_Devamsizlik_Cizelgesi_${selectedDate}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 15mm;
          }
          * { box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', -apple-system, Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
            margin: 0;
            padding: 24px;
            font-size: 13px;
          }
          .header-box {
            border-bottom: 2px solid #103A69;
            padding-bottom: 14px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .header-title h1 {
            margin: 0 0 4px 0;
            font-size: 18px;
            font-weight: 900;
            color: #103A69;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .header-title h2 {
            margin: 0;
            font-size: 13.5px;
            font-weight: 800;
            color: #dc2626;
            text-transform: uppercase;
          }
          .header-meta {
            text-align: right;
            font-size: 12px;
          }
          .header-meta .date {
            font-weight: 800;
            color: #1e293b;
            font-size: 13px;
          }
          .header-meta .stats {
            color: #64748b;
            margin-top: 4px;
            font-weight: 600;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          th {
            background-color: #103A69;
            color: #ffffff;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 10px 12px;
            text-align: left;
            border: 1px solid #103A69;
          }
          .signatures {
            margin-top: 50px;
            display: flex;
            justify-content: space-between;
            page-break-inside: avoid;
          }
          .sign-col {
            text-align: center;
            width: 220px;
          }
          .sign-title {
            font-weight: 800;
            font-size: 12px;
            color: #1e293b;
          }
          .sign-line {
            margin-top: 45px;
            font-size: 11px;
            color: #64748b;
            border-top: 1px dashed #94a3b8;
            padding-top: 4px;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div class="header-title">
            <h1>ÇORUM BOĞAZİÇİ EĞİTİM KURUMLARI</h1>
            <h2>GÜNLÜK ÖĞRENCİ DEVAMSIZLIK ÇİZELGESİ (TURNİKE RAPORU)</h2>
          </div>
          <div class="header-meta">
            <div class="date">${formattedDisplayDate}</div>
            <div class="stats">Devamsız: ${filteredAbsents.length} Öğrenci (${totalAbsentDays} Gün)</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 35px; text-align: center;">#</th>
              <th style="width: 80px;">Okul No</th>
              <th style="width: 110px;">T.C. Kimlik</th>
              <th>Öğrenci Adı Soyadı</th>
              <th style="width: 140px; text-align: center;">Devamsızlık Durumu</th>
              <th>Turnike / Giriş Açıklaması</th>
            </tr>
          </thead>
          <tbody>
            ${tableContent}
          </tbody>
        </table>

        <div class="signatures">
          <div class="sign-col">
            <div class="sign-title">Nöbetçi Müdür Yardımcısı</div>
            <div class="sign-line">İmza / Mühür</div>
          </div>
          <div class="sign-col">
            <div class="sign-title">Okul Müdürü</div>
            <div class="sign-line">İmza / Onay</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.focus();
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } else {
      window.print();
    }
  };

  return (
    <div className="daily-absence-container font-sans w-full pb-10">
      
      {/* Üst Başlık & Kontroller (Yazdırılmaz) */}
      <div className="no-print mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[12px] font-bold text-slate-500 uppercase tracking-widest">Akademik Raporlama</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Turnike Canlı Bağlantı
              </span>
            </div>
            <h1 className="text-[28px] md:text-[32px] font-extrabold text-slate-900 dark:text-white tracking-tight">
              Günlük Devamsızlık Takip & Rapor Merkezi
            </h1>
            <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-1">
              Turnikeden karekod okutmayan veya yarım gün giriş yapan tüm öğrencilerin sınıf bazlı canlı çizelgesi.
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

        {/* Metrik Kartları (Kusursuz Koyu & Açık Tema) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          
          {/* Rapor Tarihi */}
          <div className="bg-white dark:bg-[#111C38] border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Rapor Tarihi</span>
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-[#103A69] dark:text-blue-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-50 dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-[14px] font-bold text-slate-800 dark:text-white outline-none cursor-pointer"
              />
            </div>
          </div>

          {/* Toplam Öğrenci */}
          <div className="bg-white dark:bg-[#111C38] border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Kayıtlı Öğrenci</span>
            <div className="flex items-baseline justify-between">
              <span className="text-[26px] font-black text-slate-900 dark:text-white">{totalCount}</span>
              <Users size={22} className="text-slate-400 dark:text-slate-500" />
            </div>
          </div>

          {/* Giriş Yapanlar */}
          <div className="bg-white dark:bg-[#111C38] border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/10 rounded-2xl p-4 shadow-sm">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block mb-1">Turnikeden Girenler</span>
            <div className="flex items-baseline justify-between">
              <span className="text-[26px] font-black text-emerald-600 dark:text-emerald-400">{presentCount}</span>
              <UserCheck size={22} className="text-emerald-500" />
            </div>
          </div>

          {/* Toplam Devamsız */}
          <div className="bg-white dark:bg-[#111C38] border border-red-200 dark:border-red-900/40 bg-red-50/10 rounded-2xl p-4 shadow-sm">
            <span className="text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider block mb-1">Toplam Devamsız (%{absencePercentage})</span>
            <div className="flex items-baseline justify-between">
              <span className="text-[26px] font-black text-red-600 dark:text-red-400">{absentStudents.length}</span>
              <UserX size={22} className="text-red-500" />
            </div>
          </div>
        </div>

        {/* Filtre ve Arama Barı */}
        <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4 bg-white dark:bg-[#111C38] p-4 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm w-full">
          <div className="relative flex-1 w-full min-w-[250px]">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-300" />
            <input
              type="text"
              placeholder="Devamsız öğrenci ara (İsim, Okul No, TC)..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700/60 rounded-xl text-[14px] font-medium outline-none text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto min-w-[150px]">
            <span className="text-[13px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Sınıf Seçimi:</span>
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className="flex-1 bg-slate-50 dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-[14px] font-bold text-slate-700 dark:text-white outline-none cursor-pointer"
            >
              <option value="all">Tüm Sınıflar</option>
              <option value="9">9. Sınıf</option>
              <option value="10">10. Sınıf</option>
              <option value="11">11. Sınıf</option>
              <option value="12">12. Sınıf</option>
            </select>
          </div>
        </div>
      </div>

      {/* Rapor İçeriği & Tablolar */}
      <div className="printable-report bg-white dark:bg-[#111C38] border border-slate-200 dark:border-white/10 rounded-2xl p-6 md:p-8 shadow-sm">
        
        {/* Kurumsal Başlık */}
        <div className="border-b-2 border-slate-800 dark:border-slate-700 pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-[20px] font-black text-slate-900 dark:text-white tracking-tight uppercase">ÇORUM BOĞAZİÇİ EĞİTİM KURUMLARI</h2>
              <h3 className="text-[15px] font-bold text-red-600 dark:text-red-400">GÜNLÜK ÖĞRENCİ DEVAMSIZLIK ÇİZELGESİ (TURNİKE RAPORU)</h3>
            </div>
            <div className="text-right">
              <span className="text-[13px] font-bold text-slate-700 dark:text-slate-300 block">{formattedDisplayDate}</span>
              <span className="text-[11.5px] text-slate-500 dark:text-slate-400 font-semibold">Devamsız: {absentStudents.length} Öğrenci ({totalAbsentDays} Gün)</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <RefreshCcw size={32} className="animate-spin mb-3 text-[#103A69] dark:text-blue-400" />
            <p className="text-[14px] font-semibold">Turnike ve devamsızlık verileri taranıyor...</p>
          </div>
        ) : filteredAbsents.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-emerald-500/10 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mb-3 border border-emerald-500/20">
              <CheckCircle size={32} />
            </div>
            <h4 className="text-[17px] font-bold text-slate-800 dark:text-white mb-1">
              {searchText || selectedClassFilter !== 'all' 
                ? 'Aramanıza Uygun Devamsız Öğrenci Bulunamadı' 
                : !hasAnyActivity 
                  ? 'Henüz Turnike / Devamsızlık Kaydı Yok (Sistem Temiz)' 
                  : 'Mükemmel! Bugün Tüm Öğrenciler Turnikeden Giriş Yaptı'}
            </h4>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 max-w-md">
              {!hasAnyActivity 
                ? `Seçilen tarihte (${selectedDate}) kayıtlı bir turnike geçişi veya idari devamsızlık bulunmuyor. Sistem başarıyla sıfırlandı; yarın sabah saat 09:00 itibarıyla turnike girişleri başladığında anlık olarak devamsızlıklar çizelgeye yansıyacaktır.`
                : `Seçilen tarihte (${selectedDate}) tüm öğrenciler kurumda tam gün olarak bulunmaktadır.`}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.keys(groupedByClass).map(classKey => {
              const studentsInClass = groupedByClass[classKey];
              return (
                <div key={classKey} className="class-group-block">
                  {/* Sınıf Başlığı */}
                  <div className="flex items-center justify-between bg-slate-100 dark:bg-[#1E293B] px-4 py-2.5 rounded-xl mb-3 border border-slate-200/50 dark:border-white/5">
                    <span className="text-[14px] font-extrabold text-[#103A69] dark:text-blue-400 uppercase tracking-wide">
                      📚 {classKey}. Sınıf Devamsız Öğrenciler
                    </span>
                    <span className="text-[12px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 px-3 py-0.5 rounded-full border border-red-200 dark:border-red-900/60">
                      {studentsInClass.length} Öğrenci Gelmedi
                    </span>
                  </div>

                  {/* Sınıf Tablosu (Koyu Modda Kusursuz Başlık ve Satır Kontrastı) */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#111C38] shadow-sm">
                    <table className="w-full text-left text-[13px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-[#152238] text-slate-700 dark:text-slate-200 font-extrabold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700/60">
                          <th className="py-3.5 px-3 w-12 text-center text-slate-500 dark:text-slate-400 font-bold">#</th>
                          <th className="py-3.5 px-3 w-28 text-slate-700 dark:text-slate-200 font-bold">Okul No</th>
                          <th className="py-3.5 px-3 w-36 text-slate-700 dark:text-slate-200 font-bold">T.C. Kimlik</th>
                          <th className="py-3.5 px-3 text-slate-700 dark:text-slate-200 font-bold">Öğrenci Adı Soyadı (A-Z)</th>
                          <th className="py-3.5 px-3 w-48 text-center text-slate-700 dark:text-slate-200 font-bold">Devamsızlık Durumu</th>
                          <th className="py-3.5 px-3 text-slate-700 dark:text-slate-200 font-bold">Turnike / Giriş Açıklaması</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-[#111C38]">
                        {studentsInClass.map((student, idx) => (
                          <tr key={student.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors bg-white dark:bg-[#111C38]">
                            <td className="py-3.5 px-3 text-center text-slate-400 dark:text-slate-400 font-medium">{idx + 1}</td>
                            <td className="py-3.5 px-3 font-bold text-slate-800 dark:text-white font-mono text-[13.5px]">{student.schoolNumber}</td>
                            <td className="py-3.5 px-3 font-mono text-slate-600 dark:text-slate-300 text-[13px]">{student.tc || '-'}</td>
                            <td className="py-3.5 px-3 font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
                              <img
                                src={student.profileImage}
                                alt=""
                                className="w-7 h-7 rounded-full object-cover no-print border border-slate-200 dark:border-slate-700 shadow-sm"
                              />
                              <span className="text-[13.5px]">{student.name}</span>
                            </td>
                            <td className="py-3.5 px-3 text-center">
                              {student.absenceStatus === 'YARIM_GUN' ? (
                                <span className="inline-flex items-center px-3 py-1 rounded-lg text-[11.5px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  YARIM GÜN (0.5)
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-3 py-1 rounded-lg text-[11.5px] font-black bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                                  TAM GÜN (1.0)
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-3 text-slate-600 dark:text-slate-300 text-[12.5px] font-medium">
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
        .dark .daily-absence-container th,
        [data-theme='dark'] .daily-absence-container th {
          background-color: #152238 !important;
          color: #e2e8f0 !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
        }
        .dark .daily-absence-container td,
        [data-theme='dark'] .daily-absence-container td {
          border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
        }
        .dark .daily-absence-container tr:hover td,
        [data-theme='dark'] .daily-absence-container tr:hover td {
          background-color: rgba(255, 255, 255, 0.04) !important;
        }
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
