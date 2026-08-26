import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calendar, Download, Printer, Search, Users, UserX, UserCheck, 
  AlertCircle, RefreshCcw, Filter, ChevronDown, FileText, CheckCircle2, 
  Clock, Timer, Activity, Sparkles, ShieldCheck, DoorOpen, User,
  FileSpreadsheet, Layers, School, ChevronRight
} from 'lucide-react';
import { db, rtdb } from '../services/firebaseConfig';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import useAttendanceConfig from '../hooks/useAttendanceConfig';
import {
  ABSENCE_STATUS,
  evaluateStudentDay,
  normalizeScanRecord,
  sortAndDedupeScans,
  getDateKeyInTimeZone,
  getMinutesInTimeZone,
  isClosedDay as isClosedDayFn,
  sumAbsenceWeight,
  formatDayCount
} from '../services/attendanceRules';

const DailyAbsenceReportView = () => {
  const { config } = useAttendanceConfig();

  const [selectedDate, setSelectedDate] = useState(() => getDateKeyInTimeZone(new Date(), 'Europe/Istanbul'));
  const [allStudents, setAllStudents] = useState([]);
  const [rtdbLogs, setRtdbLogs] = useState({});
  const [firestoreLogs, setFirestoreLogs] = useState({});
  const [gateStatusMap, setGateStatusMap] = useState({});
  const [manualAttendance, setManualAttendance] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');

  const todayKey = useMemo(() => getDateKeyInTimeZone(new Date(), config.timeZone || 'Europe/Istanbul'), [config.timeZone]);
  const isToday = selectedDate === todayKey;

  // 1. Canlı Öğrenci Listesi (Firestore 'users')
  useEffect(() => {
    setLoading(true);
    const usersCol = collection(db, 'users');
    const unsubUsers = onSnapshot(usersCol, (snap) => {
      const studentList = [];
      snap.forEach(d => {
        const data = d.data();
        const role = (data.role || '').toLowerCase();
        if (role === 'student' || role === 'öğrenci') {
          const name = data.full_name || data.fullName || data.name || data.displayName || 'İsimsiz Öğrenci';
          const profileImage = data.profile_image || data.profileImageUrl || null;
          const tc = data.tc_kimlik || data.tcKimlik || data.tc || '';
          const schoolNumber = data.school_number || data.schoolNumber || data.no || '-';
          
          let branch = data.branch || '';
          let classGrade = '12';
          if (!branch && data.class_id) {
            branch = `${data.class_id}/${data.section || 'A'}`;
          }
          if (branch) {
            const match = branch.match(/\d+/);
            if (match) classGrade = match[0];
          } else {
            branch = '12/A';
          }

          studentList.push({
            id: d.id,
            name,
            tc,
            schoolNumber,
            classGrade,
            branch: branch.toUpperCase(),
            profileImage
          });
        }
      });
      studentList.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      setAllStudents(studentList);
      setLoading(false);
    }, (err) => {
      console.error("Öğrenci listesi dinleme hatası:", err);
      setLoading(false);
    });

    return () => unsubUsers();
  }, []);

  // 2. Canlı Gate Status Dinleyicisi (Turnike / Giriş Durumu)
  useEffect(() => {
    const unsubGate = onSnapshot(collection(db, 'gate_status'), (snap) => {
      const map = {};
      snap.forEach(d => {
        const data = d.data();
        if (data.date === selectedDate || !data.date) {
          map[d.id] = data;
        }
      });
      setGateStatusMap(map);
    });
    return () => unsubGate();
  }, [selectedDate]);

  // 3. RTDB Attendance Logs
  useEffect(() => {
    const rtdbPath = ref(rtdb, `qr_system/attendance_logs/${selectedDate}`);
    const unsubRtdb = onValue(rtdbPath, (snapshot) => {
      setRtdbLogs(snapshot.exists() ? snapshot.val() : {});
    });
    return () => unsubRtdb();
  }, [selectedDate]);

  // 4. Firestore attendance_logs & attendance
  useEffect(() => {
    const fsAttLogsQuery = query(collection(db, 'attendance_logs'), where('date', '==', selectedDate));
    const unsubFsLogs = onSnapshot(fsAttLogsQuery, (snap) => {
      const logs = {};
      snap.forEach(d => {
        const data = d.data();
        if (data.studentId) {
          if (!logs[data.studentId]) logs[data.studentId] = [];
          logs[data.studentId].push({ ...data, id: d.id });
        }
      });
      setFirestoreLogs(logs);
    });

    const fsManualQuery = collection(db, 'attendance');
    const unsubFsManual = onSnapshot(fsManualQuery, (snap) => {
      const manuals = {};
      snap.forEach(d => {
        const data = d.data();
        let rDate = null;
        if (data.date) {
          rDate = data.date.toDate
            ? getDateKeyInTimeZone(data.date.toDate(), 'Europe/Istanbul')
            : (typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(data.date)
              ? data.date.slice(0, 10)
              : getDateKeyInTimeZone(new Date(data.date), 'Europe/Istanbul'));
        }
        if (rDate === selectedDate && data.studentId) {
          if (!manuals[data.studentId]) manuals[data.studentId] = [];
          manuals[data.studentId].push({ ...data, id: d.id });
        }
      });
      setManualAttendance(manuals);
    });

    return () => {
      try { unsubFsLogs(); } catch(e) {}
      try { unsubFsManual(); } catch(e) {}
    };
  }, [selectedDate]);

  // 5. Analiz ve Durum Hesaplama
  const analyzedStudents = useMemo(() => {
    const isPast = selectedDate < todayKey;
    const nowMinutes = isPast ? 1440 : getMinutesInTimeZone(new Date(), config.timeZone || 'Europe/Istanbul');
    const isClosed = isClosedDayFn(new Date(selectedDate), config);

    return allStudents.map(student => {
      const rtdbEntries = Object.values(rtdbLogs).filter(l => l.studentId === student.id || l.userId === student.id);
      const fsEntries = firestoreLogs[student.id] || [];
      const allScansRaw = [...rtdbEntries, ...fsEntries].map(normalizeScanRecord).filter(Boolean);
      const scans = sortAndDedupeScans(allScansRaw);
      const manualRecords = manualAttendance[student.id] || [];
      const gateStatus = gateStatusMap[student.id];

      // A) İzinli / Raporlu
      const excuse = manualRecords.find(r => 
        r.status === 'excused' || 
        String(r.courseName || '').includes('Raporlu') || 
        String(r.courseName || '').includes('İzinli')
      );

      if (excuse) {
        return {
          ...student,
          status: 'excused',
          statusLabel: 'İzinli / Raporlu',
          badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50',
          morningStatus: 'İzinli',
          afternoonStatus: 'İzinli',
          detailNote: excuse.courseName || 'İdare Kaydı'
        };
      }

      // B) Kural Motoru
      const evaluation = evaluateStudentDay({
        scans,
        nowMinutes,
        config,
        isClosedDay: isClosed
      });

      const manualWeight = sumAbsenceWeight(manualRecords);
      const isTurnstileIn = gateStatus?.status === 'entry' || scans.length > 0;

      let status = 'present';
      let statusLabel = 'Tam Gün Mevcut';
      let badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50';

      if (isClosed) {
        status = 'closed';
        statusLabel = 'Kurum Kapalı';
        badgeClass = 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400';
      } else if (manualWeight >= 1) {
        status = 'absent_full';
        statusLabel = 'Tam Gün Devamsız';
        badgeClass = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50';
      } else if (manualWeight === 0.5) {
        status = 'absent_half';
        statusLabel = 'Yarım Gün Devamsız';
        badgeClass = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50';
      } else if (isTurnstileIn) {
        if (evaluation.isLate) {
          status = 'late';
          statusLabel = 'Mevcut (Geç Giriş)';
          badgeClass = 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-900/50';
        } else {
          status = 'present';
          statusLabel = 'Kurumda (Mevcut)';
          badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50';
        }
      } else {
        // Canlı gün ve henüz gün bitmediyse veya yoklama yoksa
        if (isToday) {
          status = 'present';
          statusLabel = 'Kayıtlı / Beklemede';
          badgeClass = 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-[#1e293b] dark:text-slate-300 dark:border-white/10';
        } else {
          status = 'absent_full';
          statusLabel = 'Tam Gün Devamsız';
          badgeClass = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50';
        }
      }

      const morningEntry = evaluation.morning?.entryTime || (isTurnstileIn ? '08:45' : '-');
      const afternoonEntry = evaluation.afternoon?.entryTime || (isTurnstileIn ? '13:00' : '-');

      return {
        ...student,
        status,
        statusLabel,
        badgeClass,
        morningStatus: isTurnstileIn ? `Giriş: ${morningEntry}` : 'Giriş Yok',
        afternoonStatus: isTurnstileIn ? `Giriş: ${afternoonEntry}` : 'Giriş Yok',
        detailNote: excuse?.courseName || (scans.length > 0 ? `${scans.length} Geçiş Kaydı` : 'Düzenli'),
        isLate: evaluation.isLate,
        isPresent: isTurnstileIn || status === 'present'
      };
    });
  }, [allStudents, rtdbLogs, firestoreLogs, manualAttendance, gateStatusMap, selectedDate, todayKey, config]);

  // Filtreleme
  const filteredStudents = useMemo(() => {
    return analyzedStudents.filter(student => {
      if (selectedClassFilter !== 'all' && student.classGrade !== selectedClassFilter) {
        return false;
      }
      if (selectedStatusFilter === 'absent' && !(student.status === 'absent_full' || student.status === 'absent_half')) {
        return false;
      }
      if (selectedStatusFilter === 'present' && !(student.status === 'present' || student.status === 'late')) {
        return false;
      }
      if (selectedStatusFilter === 'excused' && student.status !== 'excused') {
        return false;
      }
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        return (
          student.name.toLowerCase().includes(q) ||
          student.schoolNumber.includes(q) ||
          student.tc.includes(q) ||
          student.branch.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [analyzedStudents, selectedClassFilter, selectedStatusFilter, searchText]);

  // Sınıf / Şube Başlıklarına Göre Gruplama
  const groupedStudents = useMemo(() => {
    const groups = {};
    filteredStudents.forEach(student => {
      const groupKey = student.branch || `${student.classGrade}/A`;
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(student);
    });

    // Grupları sırala: 12/A, 12/B, 12/C, 12/D, 11/A, 11/B, 10/A, 9/A
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const numA = parseInt(a, 10) || 0;
      const numB = parseInt(b, 10) || 0;
      if (numA !== numB) return numB - numA;
      return a.localeCompare(b, 'tr');
    });

    const result = {};
    sortedKeys.forEach(k => {
      groups[k].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      result[k] = groups[k];
    });

    return result;
  }, [filteredStudents]);

  // Metrikler
  const totalCount = allStudents.length;
  const presentCount = analyzedStudents.filter(s => s.status === 'present' || s.status === 'late').length;
  const fullAbsentCount = analyzedStudents.filter(s => s.status === 'absent_full').length;
  const halfAbsentCount = analyzedStudents.filter(s => s.status === 'absent_half').length;
  const excusedCount = analyzedStudents.filter(s => s.status === 'excused').length;
  const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 100;

  // Doğrudan PDF / Baskı Penceresi Oluşturucu
  const handlePrintPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Lütfen tarayıcınızın açılır pencere (popup) engelleyicisini kapatın.');
      return;
    }

    const formattedDate = new Date(selectedDate).toLocaleDateString('tr-TR', { 
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
    });

    let tableHtml = '';
    Object.entries(groupedStudents).forEach(([branch, list]) => {
      tableHtml += `
        <div style="margin-top: 24px; margin-bottom: 8px;">
          <div style="background: #1e293b; color: #ffffff; padding: 6px 12px; font-weight: bold; font-size: 13px; border-radius: 4px; display: flex; justify-content: space-between;">
            <span>${branch} ŞUBESİ</span>
            <span>Toplam: ${list.length} Öğrenci</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 12px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1px solid #cbd5e1; text-align: left;">
                <th style="padding: 6px 8px; width: 40px;">No</th>
                <th style="padding: 6px 8px;">Öğrenci Adı Soyadı</th>
                <th style="padding: 6px 8px; width: 110px;">T.C. Kimlik</th>
                <th style="padding: 6px 8px; width: 80px;">Okul No</th>
                <th style="padding: 6px 8px; width: 100px;">Sabah</th>
                <th style="padding: 6px 8px; width: 100px;">Öğleden Sonra</th>
                <th style="padding: 6px 8px; width: 140px; text-align: right;">Durum</th>
              </tr>
            </thead>
            <tbody>
              ${list.map((s, idx) => `
                <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background: #fafafa;' : ''}">
                  <td style="padding: 6px 8px;">${idx + 1}</td>
                  <td style="padding: 6px 8px; font-weight: 600;">${s.name}</td>
                  <td style="padding: 6px 8px; font-family: monospace;">${s.tc || '-'}</td>
                  <td style="padding: 6px 8px;">${s.schoolNumber || '-'}</td>
                  <td style="padding: 6px 8px;">${s.morningStatus}</td>
                  <td style="padding: 6px 8px;">${s.afternoonStatus}</td>
                  <td style="padding: 6px 8px; text-align: right; font-weight: bold;">
                    ${s.statusLabel}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    });

    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Boğaziçi Koleji - Günlük Ders ve Devamsızlık Raporu (${selectedDate})</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 0; }
          .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
          .header h1 { margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 0.5px; }
          .header h2 { margin: 4px 0 0 0; font-size: 14px; font-weight: normal; color: #475569; }
          .stats-bar { display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 16px; font-size: 12px; margin-bottom: 16px; font-weight: bold; }
          .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; page-break-inside: avoid; }
          .signature-box { text-align: center; width: 200px; border-top: 1px solid #94a3b8; padding-top: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>BOĞAZİÇİ KOLEJİ</h1>
          <h2>GÜNLÜK DERS VE DEVAMSIZLIK ÇİZELGESİ</h2>
          <div style="margin-top: 6px; font-size: 12px; font-weight: bold; color: #0f172a;">${formattedDate}</div>
        </div>

        <div class="stats-bar">
          <span>Toplam Öğrenci: ${totalCount}</span>
          <span>Katılım Oranı: %${attendanceRate}</span>
          <span>Mevcut: ${presentCount}</span>
          <span>Devamsız: ${fullAbsentCount + halfAbsentCount}</span>
          <span>İzinli/Raporlu: ${excusedCount}</span>
        </div>

        ${tableHtml}

        <div class="footer">
          <div class="signature-box">
            Nöbetçi Öğretmen<br><br><br>
            İmza
          </div>
          <div class="signature-box">
            Müdür Yardımcısı<br><br><br>
            İmza
          </div>
          <div class="signature-box">
            Okul Müdürü<br><br><br>
            Mühür / İmza
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(fullHtml);
    printWindow.document.close();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-[#FAFAFA] dark:bg-[#0b1120] p-12">
        <Activity size={32} className="text-slate-600 dark:text-slate-400 mb-4 animate-spin" strokeWidth={1.5} />
        <span className="text-xs font-semibold text-slate-500">Günlük ders raporu hazırlanıyor...</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex-1 flex flex-col font-sans gap-5 pb-6 overflow-x-hidden">
      
      {/* 1. ÜST BAŞLIK & TARİH SEÇİCİ & PDF YAZDIR */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 w-full shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] md:text-[12px] font-bold text-slate-500 uppercase tracking-wider">
              {new Date(selectedDate).toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            {isToday && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 text-[10.5px] font-bold border border-emerald-200 dark:border-emerald-900/40">
                Canlı Gün
              </span>
            )}
          </div>
          <h1 className="text-[26px] md:text-[32px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-none">
            Günlük Ders & Devamsızlık Raporu
          </h1>
        </div>

        {/* Aksiyon Butonları */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <input 
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-4 py-2.5 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 text-[13px] font-bold text-slate-800 dark:text-slate-200 outline-none shadow-xs focus:border-indigo-500 cursor-pointer"
            />
          </div>

          <button 
            onClick={handlePrintPDF}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-bold shadow-md hover:shadow-indigo-500/20 active:scale-95 transition-all shrink-0 cursor-pointer"
          >
            <Printer size={16} />
            <span>PDF İndir / Yazdır</span>
          </button>
        </div>
      </div>

      {/* 2. DÖRT AYRI MODERN İSTATİSTİK KARTI (Fotoğraftaki birleşik bar ayrıldı) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full shrink-0">
        
        {/* Toplam Öğrenci */}
        <div className="bg-white dark:bg-[#0f172a] p-5 rounded-2xl md:rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11.5px] font-bold text-slate-500 uppercase tracking-wider block">Toplam Öğrenci</span>
            <div className="text-[28px] font-extrabold text-slate-900 dark:text-white mt-1 leading-none">{totalCount}</div>
            <span className="text-[11px] text-slate-400 font-semibold mt-1.5 block">Sistemde Kayıtlı</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-slate-50 dark:bg-[#1e293b] text-slate-600 dark:text-slate-300 flex items-center justify-center border border-slate-100 dark:border-white/5">
            <Users size={20} strokeWidth={2} />
          </div>
        </div>

        {/* Katılım Oranı */}
        <div className="bg-white dark:bg-[#0f172a] p-5 rounded-2xl md:rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11.5px] font-bold text-slate-500 uppercase tracking-wider block">Katılım Oranı</span>
            <div className="text-[28px] font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 leading-none">%{attendanceRate}</div>
            <span className="text-[11px] text-emerald-600/80 font-semibold mt-1.5 block">{presentCount} Öğrenci Mevcut</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center border border-emerald-100 dark:border-emerald-900/30">
            <UserCheck size={20} strokeWidth={2} />
          </div>
        </div>

        {/* Devamsızlar */}
        <div className="bg-white dark:bg-[#0f172a] p-5 rounded-2xl md:rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11.5px] font-bold text-slate-500 uppercase tracking-wider block">Devamsızlar</span>
            <div className="text-[28px] font-extrabold text-rose-600 dark:text-rose-400 mt-1 leading-none">
              {fullAbsentCount + halfAbsentCount}
            </div>
            <span className="text-[11px] text-rose-500 font-semibold mt-1.5 block">
              {fullAbsentCount} Tam / {halfAbsentCount} Yarım Gün
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center border border-rose-100 dark:border-rose-900/30">
            <UserX size={20} strokeWidth={2} />
          </div>
        </div>

        {/* İzinli / Raporlu */}
        <div className="bg-white dark:bg-[#0f172a] p-5 rounded-2xl md:rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11.5px] font-bold text-slate-500 uppercase tracking-wider block">İzinli / Raporlu</span>
            <div className="text-[28px] font-extrabold text-blue-600 dark:text-blue-400 mt-1 leading-none">{excusedCount}</div>
            <span className="text-[11px] text-blue-500 font-semibold mt-1.5 block">İdareden Onaylı</span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center border border-blue-100 dark:border-blue-900/30">
            <ShieldCheck size={20} strokeWidth={2} />
          </div>
        </div>

      </div>

      {/* 3. AYRI VE FERAH FİLTRELEME ALANI */}
      <div className="bg-white dark:bg-[#0f172a] p-4 rounded-2xl md:rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3.5 shrink-0">
        
        {/* Arama Inputu */}
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="İsim, şube (12/A), okul no veya TC ile ara..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-[#1e293b] border border-slate-200/80 dark:border-white/10 rounded-2xl text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Filtre Butonları */}
        <div className="flex flex-wrap items-center gap-2.5">
          
          {/* Sınıf Seviyesi */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-[#1e293b] rounded-2xl border border-slate-200/60 dark:border-white/10 text-xs font-bold">
            {['all', '12', '11', '10', '9'].map(cls => (
              <button
                key={cls}
                onClick={() => setSelectedClassFilter(cls)}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  selectedClassFilter === cls 
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {cls === 'all' ? 'Tüm Kademeler' : `${cls}. Sınıf`}
              </button>
            ))}
          </div>

          {/* Durum Filtresi */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-[#1e293b] rounded-2xl border border-slate-200/60 dark:border-white/10 text-xs font-bold">
            {[
              { id: 'all', label: 'Tüm Liste' },
              { id: 'absent', label: 'Devamsızlar' },
              { id: 'present', label: 'Mevcutlar' },
              { id: 'excused', label: 'İzinliler' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  selectedStatusFilter === tab.id 
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

        </div>

      </div>

      {/* 4. SINIF BAŞLIKLARINA GÖRE AYRILMIŞ RAPOR LİSTESİ */}
      <div className="w-full flex-1 flex flex-col gap-5 overflow-y-auto custom-scrollbar pr-1">
        {Object.keys(groupedStudents).length === 0 ? (
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl md:rounded-3xl border border-slate-200/80 dark:border-white/10 p-12 flex flex-col items-center justify-center text-center shadow-xs">
            <FileText size={36} className="text-slate-400 mb-2 opacity-50" />
            <h3 className="text-[15px] font-bold text-slate-700 dark:text-slate-300">Kayıt Bulunamadı</h3>
            <p className="text-[12px] text-slate-400 mt-1 max-w-sm">
              Seçilen tarih ve filtre kriterlerine uygun öğrenci kaydı bulunmamaktadır.
            </p>
          </div>
        ) : (
          Object.entries(groupedStudents).map(([branchName, studentList]) => {
            const classPresent = studentList.filter(s => s.status === 'present' || s.status === 'late').length;
            const classAbsent = studentList.filter(s => s.status === 'absent_full' || s.status === 'absent_half').length;

            return (
              <div 
                key={branchName}
                className="bg-white dark:bg-[#0f172a] rounded-2xl md:rounded-3xl border border-slate-200/80 dark:border-white/10 overflow-hidden shadow-xs"
              >
                {/* Sınıf / Şube Grup Başlığı */}
                <div className="px-6 py-4 bg-slate-50/80 dark:bg-[#1e293b]/60 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-extrabold text-[13px] border border-indigo-100 dark:border-indigo-900/40">
                      {branchName.split('/')[0] || '12'}
                    </div>
                    <div>
                      <h3 className="text-[15.5px] font-extrabold text-slate-900 dark:text-white tracking-tight">
                        {branchName} Şubesi
                      </h3>
                      <span className="text-[11.5px] text-slate-500 font-semibold">
                        Toplam {studentList.length} Kayıtlı Öğrenci
                      </span>
                    </div>
                  </div>

                  {/* Sınıf İçi Özet */}
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-900/40">
                      {classPresent} Mevcut
                    </span>
                    {classAbsent > 0 && (
                      <span className="px-2.5 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/40">
                        {classAbsent} Devamsız
                      </span>
                    )}
                  </div>
                </div>

                {/* Sınıf Öğrenci Tablosu */}
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left min-w-[700px]">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-white/5 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/30 dark:bg-transparent">
                        <th className="py-3 px-6">Öğrenci Bilgisi</th>
                        <th className="py-3 px-4 w-28">Okul No</th>
                        <th className="py-3 px-4 w-36">Sabah Seansı</th>
                        <th className="py-3 px-4 w-36">Öğleden Sonra</th>
                        <th className="py-3 px-6 w-40 text-right">Günlük Durum</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {studentList.map((student) => (
                        <tr 
                          key={student.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          {/* Öğrenci Ad Soyad + Avatar */}
                          <td className="py-3.5 px-6">
                            <div className="flex items-center gap-3 min-w-0">
                              {student.profileImage ? (
                                <img 
                                  src={student.profileImage}
                                  alt={student.name}
                                  referrerPolicy="no-referrer"
                                  crossOrigin="anonymous"
                                  className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-white/10 shrink-0"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <div className={`w-9 h-9 rounded-full bg-slate-50 dark:bg-[#1e293b] text-slate-600 dark:text-slate-400 items-center justify-center border border-slate-200 dark:border-white/10 shadow-xs shrink-0 ${student.profileImage ? 'hidden' : 'flex'}`}>
                                <User size={16} />
                              </div>

                              <div className="flex flex-col min-w-0">
                                <span className="text-[13.5px] font-bold text-slate-900 dark:text-white truncate">{student.name}</span>
                                <span className="text-[11px] font-mono text-slate-400 truncate">{student.tc || ''}</span>
                              </div>
                            </div>
                          </td>

                          {/* Okul No */}
                          <td className="py-3.5 px-4 text-[12.5px] font-semibold text-slate-600 dark:text-slate-400">
                            {student.schoolNumber || '—'}
                          </td>

                          {/* Sabah Seansı */}
                          <td className="py-3.5 px-4 text-[12px] font-medium text-slate-600 dark:text-slate-300">
                            {student.morningStatus}
                          </td>

                          {/* Öğleden Sonra */}
                          <td className="py-3.5 px-4 text-[12px] font-medium text-slate-600 dark:text-slate-300">
                            {student.afternoonStatus}
                          </td>

                          {/* Günlük Durum Rozeti */}
                          <td className="py-3.5 px-6 text-right">
                            <span className={`inline-flex px-2.5 py-1 rounded-xl text-[11.5px] font-bold border ${student.badgeClass}`}>
                              {student.statusLabel}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
};

export default DailyAbsenceReportView;
