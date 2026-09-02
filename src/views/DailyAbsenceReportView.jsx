import React, { useState, useEffect, useMemo } from 'react';
import {
  Printer,
  Search,
  Users,
  UserCheck,
  UserX,
  ShieldCheck,
  School,
  X,
  FileText,
  RefreshCw,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { db, rtdb } from '../services/firebaseConfig';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import useAttendanceConfig from '../hooks/useAttendanceConfig';
import {
  evaluateStudentDay,
  normalizeScanRecord,
  sortAndDedupeScans,
  getDateKeyInTimeZone,
  isClosedDay as isClosedDayFn,
  sumAbsenceWeight
} from '../services/attendanceRules';
import {
  Panel,
  PanelHeader,
  Button,
  IconButton,
  Input,
  Select,
  Badge,
  Dot,
  EmptyState
} from '../components/ui/panel';
import { cx, eyebrow, hairline, divider } from '../components/ui/tokens';

const STATUS_BADGE_MAP = {
  present: { label: 'Mevcut', tone: 'success' },
  late: { label: 'Geç Giriş', tone: 'warning' },
  absent_full: { label: 'Tam Gün Devamsız', tone: 'danger' },
  absent_half: { label: 'Yarım Gün Devamsız', tone: 'warning' },
  excused: { label: 'İzinli / Raporlu', tone: 'neutral' },
  closed: { label: 'Kurum Kapalı', tone: 'neutral' }
};

const CLASS_OPTIONS = [
  { id: 'all', label: 'Tüm Kademeler' },
  { id: '12', label: '12. Sınıf' },
  { id: '11', label: '11. Sınıf' },
  { id: '10', label: '10. Sınıf' },
  { id: '9', label: '9. Sınıf' }
];

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

  useEffect(() => {
    setLoading(true);
    const usersCol = collection(db, 'users');
    const unsubUsers = onSnapshot(
      usersCol,
      (snap) => {
        const studentList = [];
        snap.forEach((d) => {
          const data = d.data();
          const role = (data.role || '').toLowerCase();
          if (role === 'student' || role === 'öğrenci') {
            const name = data.full_name || data.fullName || data.name || data.displayName || 'İsimsiz Öğrenci';
            const profileImage = data.profile_image || data.profileImageUrl || null;
            const tc = data.tc_kimlik || data.tcKimlik || data.tc || '';
            const schoolNumber = data.school_number || data.schoolNumber || data.no || '—';

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
      },
      (err) => {
        console.error('Öğrenci listesi dinleme hatası:', err);
        setLoading(false);
      }
    );

    return () => unsubUsers();
  }, []);

  useEffect(() => {
    const unsubGate = onSnapshot(collection(db, 'gate_status'), (snap) => {
      const map = {};
      snap.forEach((d) => {
        const data = d.data();
        if (data.date === selectedDate || !data.date) {
          map[d.id] = data;
        }
      });
      setGateStatusMap(map);
    });
    return () => unsubGate();
  }, [selectedDate]);

  useEffect(() => {
    if (!rtdb) return;
    const dateRef = ref(rtdb, `daily_logs/${selectedDate}`);
    const unsubRtdb = onValue(dateRef, (snapshot) => {
      if (snapshot.exists()) {
        setRtdbLogs(snapshot.val());
      } else {
        setRtdbLogs({});
      }
    });
    return () => unsubRtdb();
  }, [selectedDate]);

  useEffect(() => {
    const q = query(
      collection(db, 'gate_logs'),
      where('date', '==', selectedDate)
    );
    const unsubFs = onSnapshot(q, (snap) => {
      const logs = {};
      snap.forEach((d) => {
        const data = d.data();
        const studentId = data.studentId || data.userId || d.id;
        if (!logs[studentId]) logs[studentId] = [];
        logs[studentId].push(data);
      });
      setFirestoreLogs(logs);
    });
    return () => unsubFs();
  }, [selectedDate]);

  useEffect(() => {
    const q = query(
      collection(db, 'attendance'),
      where('date', '==', selectedDate)
    );
    const unsubManual = onSnapshot(q, (snap) => {
      const manual = {};
      snap.forEach((d) => {
        const data = d.data();
        const studentId = data.studentId || d.id;
        manual[studentId] = data;
      });
      setManualAttendance(manual);
    });
    return () => unsubManual();
  }, [selectedDate]);

  const analyzedStudents = useMemo(() => {
    const isClosed = isClosedDayFn(selectedDate, config);

    return allStudents.map((student) => {
      const rawScans = [
        ...(rtdbLogs[student.id]?.scans ? Object.values(rtdbLogs[student.id].scans) : []),
        ...(firestoreLogs[student.id] || [])
      ];
      const scans = sortAndDedupeScans(rawScans.map(normalizeScanRecord));
      const excuse = manualAttendance[student.id];
      const gateStatus = gateStatusMap[student.id];

      const evaluation = evaluateStudentDay(student.id, scans, selectedDate, config, excuse);
      const isTurnstileIn = gateStatus?.status === 'in' || scans.some((s) => s.direction === 'in');
      const manualWeight = excuse?.type ? sumAbsenceWeight(excuse.type) : 0;

      let status = 'present';
      let statusInfo = STATUS_BADGE_MAP.present;

      if (isClosed) {
        status = 'closed';
        statusInfo = STATUS_BADGE_MAP.closed;
      } else if (manualWeight >= 1) {
        status = 'absent_full';
        statusInfo = STATUS_BADGE_MAP.absent_full;
      } else if (manualWeight === 0.5) {
        status = 'absent_half';
        statusInfo = STATUS_BADGE_MAP.absent_half;
      } else if (isTurnstileIn) {
        if (evaluation.isLate) {
          status = 'late';
          statusInfo = STATUS_BADGE_MAP.late;
        } else {
          status = 'present';
          statusInfo = STATUS_BADGE_MAP.present;
        }
      } else {
        if (isToday) {
          status = 'present';
          statusInfo = { label: 'Beklemede', tone: 'neutral' };
        } else {
          status = 'absent_full';
          statusInfo = STATUS_BADGE_MAP.absent_full;
        }
      }

      const morningEntry = evaluation.morning?.entryTime || (isTurnstileIn ? '08:45' : '—');
      const afternoonEntry = evaluation.afternoon?.entryTime || (isTurnstileIn ? '13:00' : '—');

      return {
        ...student,
        status,
        statusLabel: statusInfo.label,
        statusTone: statusInfo.tone,
        morningStatus: isTurnstileIn ? `Giriş: ${morningEntry}` : 'Giriş Yok',
        afternoonStatus: isTurnstileIn ? `Giriş: ${afternoonEntry}` : 'Giriş Yok',
        detailNote: excuse?.courseName || (scans.length > 0 ? `${scans.length} Geçiş Kaydı` : 'Düzenli'),
        isLate: evaluation.isLate,
        isPresent: isTurnstileIn || status === 'present'
      };
    });
  }, [allStudents, rtdbLogs, firestoreLogs, manualAttendance, gateStatusMap, selectedDate, todayKey, config]);

  const totalCount = allStudents.length;
  const presentCount = analyzedStudents.filter((s) => s.status === 'present' || s.status === 'late').length;
  const fullAbsentCount = analyzedStudents.filter((s) => s.status === 'absent_full').length;
  const halfAbsentCount = analyzedStudents.filter((s) => s.status === 'absent_half').length;
  const totalAbsentCount = fullAbsentCount + halfAbsentCount;
  const excusedCount = analyzedStudents.filter((s) => s.status === 'excused').length;
  const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 100;

  const statusFilterButtons = useMemo(() => [
    { id: 'all', label: 'Tüm Liste', icon: Users, count: totalCount },
    { id: 'present', label: 'Mevcutlar', icon: UserCheck, count: presentCount },
    { id: 'absent', label: 'Devamsızlar', icon: UserX, count: totalAbsentCount },
    { id: 'excused', label: 'İzinli / Raporlu', icon: ShieldCheck, count: excusedCount }
  ], [totalCount, presentCount, totalAbsentCount, excusedCount]);

  const filteredStudents = useMemo(() => {
    return analyzedStudents.filter((student) => {
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

  const groupedStudents = useMemo(() => {
    const groups = {};
    filteredStudents.forEach((student) => {
      const groupKey = student.branch || `${student.classGrade}/A`;
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(student);
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const numA = parseInt(a, 10) || 0;
      const numB = parseInt(b, 10) || 0;
      if (numA !== numB) return numB - numA;
      return a.localeCompare(b, 'tr');
    });

    const result = {};
    sortedKeys.forEach((k) => {
      groups[k].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      result[k] = groups[k];
    });

    return result;
  }, [filteredStudents]);

  const handlePrintPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Lütfen tarayıcınızın açılır pencere (popup) engelleyicisini kapatın.');
      return;
    }

    const formattedDate = new Date(selectedDate).toLocaleDateString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let tableHtml = '';
    Object.entries(groupedStudents).forEach(([branch, list]) => {
      tableHtml += `
        <div style="margin-top: 18px; margin-bottom: 8px;">
          <div style="background: #0f172a; color: #ffffff; padding: 6px 12px; font-weight: 600; font-size: 12px; border-radius: 4px; display: flex; justify-content: space-between;">
            <span>${branch} ŞUBESİ</span>
            <span>${list.length} Öğrenci</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 11.5px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #cbd5e1; text-align: left;">
                <th style="padding: 6px 8px; width: 30px;">#</th>
                <th style="padding: 6px 8px;">Öğrenci Adı Soyadı</th>
                <th style="padding: 6px 8px; width: 110px;">T.C. Kimlik</th>
                <th style="padding: 6px 8px; width: 70px;">Okul No</th>
                <th style="padding: 6px 8px; width: 90px;">Sabah</th>
                <th style="padding: 6px 8px; width: 90px;">Öğleden Sonra</th>
                <th style="padding: 6px 8px; width: 120px; text-align: right;">Durum</th>
              </tr>
            </thead>
            <tbody>
              ${list
                .map(
                  (s, idx) => `
                <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 1 ? 'background: #fafafa;' : ''}">
                  <td style="padding: 5px 8px;">${idx + 1}</td>
                  <td style="padding: 5px 8px; font-weight: 600;">${s.name}</td>
                  <td style="padding: 5px 8px; font-family: monospace;">${s.tc || '—'}</td>
                  <td style="padding: 5px 8px;">${s.schoolNumber || '—'}</td>
                  <td style="padding: 5px 8px;">${s.morningStatus}</td>
                  <td style="padding: 5px 8px;">${s.afternoonStatus}</td>
                  <td style="padding: 5px 8px; text-align: right; font-weight: 600;">
                    ${s.statusLabel}
                  </td>
                </tr>
              `
                )
                .join('')}
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
          @page { size: A4 portrait; margin: 10mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; padding: 0; }
          .header { text-align: center; border-bottom: 1.5px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
          .header h1 { margin: 0; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px; }
          .header h2 { margin: 2px 0 0 0; font-size: 12.5px; font-weight: normal; color: #475569; }
          .stats-bar { display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px 12px; font-size: 11px; margin-bottom: 12px; font-weight: 600; }
          .footer { margin-top: 30px; display: flex; justify-content: space-between; font-size: 11.5px; page-break-inside: avoid; }
          .signature-box { text-align: center; width: 160px; border-top: 1px solid #94a3b8; padding-top: 4px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>BOĞAZİÇİ KOLEJİ</h1>
          <h2>GÜNLÜK DERS VE DEVAMSIZLIK ÇİZELGESİ</h2>
          <div style="margin-top: 4px; font-size: 11.5px; font-weight: 600; color: #0f172a;">${formattedDate}</div>
        </div>

        <div class="stats-bar">
          <span>Toplam: ${totalCount} Öğrenci</span>
          <span>Katılım: %${attendanceRate}</span>
          <span>Mevcut: ${presentCount}</span>
          <span>Devamsız: ${totalAbsentCount}</span>
          <span>İzinli: ${excusedCount}</span>
        </div>

        ${tableHtml}

        <div class="footer">
          <div class="signature-box">Nöbetçi Öğretmen<br><br><br>İmza</div>
          <div class="signature-box">Müdür Yardımcısı<br><br><br>İmza</div>
          <div class="signature-box">Okul Müdürü<br><br><br>Mühür / İmza</div>
        </div>

        <script>
          window.onload = function() { window.print(); };
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
      <div className="w-full flex flex-col gap-5 animate-pulse">
        <div className="h-9 w-64 rounded-lg bg-slate-200/70 dark:bg-white/[0.06]" />
        <div className="h-24 rounded-xl bg-slate-200/50 dark:bg-white/[0.04]" />
        <div className="h-96 rounded-xl bg-slate-200/50 dark:bg-white/[0.04]" />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-5 pb-2">
      
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="m-0 text-[27px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
              Günlük Devamsızlık Raporu
            </h1>
            {isToday && (
              <Badge tone="success">Canlı Gün</Badge>
            )}
          </div>
          <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400">
            {new Date(selectedDate).toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Turnike, karekod ve izinlerin anlık çizelgesi
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-9 px-3 rounded-lg bg-white dark:bg-white/[0.04] border border-slate-300 dark:border-white/12 text-[13px] font-medium text-slate-800 dark:text-slate-200 outline-none cursor-pointer shadow-none"
          />
          <Button variant="secondary" icon={Printer} onClick={handlePrintPDF}>
            Yazdır / PDF
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {statusFilterButtons.map((filter) => {
          const Icon = filter.icon;
          const isActive = selectedStatusFilter === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => setSelectedStatusFilter(filter.id)}
              className={cx(
                'inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border text-[13px] font-medium transition-colors cursor-pointer',
                isActive
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent shadow-xs'
                  : 'bg-white dark:bg-white/[0.04] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.08]'
              )}
            >
              <Icon size={14} strokeWidth={1.9} />
              {filter.label}
              <span className={cx('tnum font-semibold', isActive ? 'opacity-70' : 'text-slate-400 dark:text-slate-500')}>
                {filter.count}
              </span>
            </button>
          );
        })}
      </div>

      <Panel>
        <div className={cx('flex flex-col sm:flex-row gap-2.5 px-5 py-3 border-b', hairline)}>
          <div className="relative flex-1 min-w-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              placeholder="Öğrenci adı soyadı, şube (12/A), okul no veya TC kimlik ara..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText('')}
                aria-label="Aramayı temizle"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="sm:w-48 shrink-0">
            <Select value={selectedClassFilter} onChange={(e) => setSelectedClassFilter(e.target.value)}>
              {CLASS_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="px-5 py-2.5 flex items-center justify-between text-[12px] text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-white/[0.01]">
          <span>
            Toplam <strong className="text-slate-900 dark:text-white tnum">{filteredStudents.length}</strong> öğrenci listeleniyor
          </span>
          <span className="text-[11.5px]">
            Katılım: <strong className="text-emerald-600 dark:text-emerald-400 tnum">%{attendanceRate}</strong>
          </span>
        </div>
      </Panel>

      <div className="flex flex-col gap-5">
        {Object.keys(groupedStudents).length === 0 ? (
          <Panel>
            <EmptyState
              icon={FileText}
              title="Kayıt bulunamadı"
              description="Seçilen filtre kriterlerine ve arama metnine uygun öğrenci kaydı bulunamadı."
              action={
                <Button onClick={() => { setSearchText(''); setSelectedClassFilter('all'); setSelectedStatusFilter('all'); }}>
                  Filtreleri Sıfırla
                </Button>
              }
            />
          </Panel>
        ) : (
          Object.entries(groupedStudents).map(([branchName, studentList]) => {
            const classPresent = studentList.filter((s) => s.status === 'present' || s.status === 'late').length;
            const classAbsent = studentList.filter((s) => s.status === 'absent_full' || s.status === 'absent_half').length;

            return (
              <Panel key={branchName}>
                
                <PanelHeader
                  title={`${branchName} Şubesi`}
                  description={`Toplam ${studentList.length} öğrenci`}
                >
                  <div className="flex items-center gap-1.5">
                    <Badge tone="success">{classPresent} Mevcut</Badge>
                    {classAbsent > 0 && <Badge tone="danger">{classAbsent} Devamsız</Badge>}
                  </div>
                </PanelHeader>

                <div className="overflow-x-auto panel-scroll">
                  <div className="min-w-[760px]">
                    
                    <div
                      className={cx(
                        'grid grid-cols-[minmax(0,1.8fr)_120px_90px_130px_130px_130px] gap-4 px-5 py-2.5 border-b bg-slate-50/70 dark:bg-white/[0.02]',
                        hairline
                      )}
                    >
                      <span className={eyebrow}>Öğrenci Ad Soyad</span>
                      <span className={eyebrow}>TC Kimlik</span>
                      <span className={eyebrow}>Okul No</span>
                      <span className={eyebrow}>Sabah</span>
                      <span className={eyebrow}>Öğleden Sonra</span>
                      <span className={cx(eyebrow, 'text-right')}>Günlük Durum</span>
                    </div>

                    <div className={cx('divide-y', divider)}>
                      {studentList.map((student) => (
                        <div
                          key={student.id}
                          className="grid grid-cols-[minmax(0,1.8fr)_120px_90px_130px_130px_130px] gap-4 px-5 py-3 items-center hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                        >
                          
                          <div className="flex items-center gap-2.5 min-w-0">
                            {student.profileImage ? (
                              <img
                                src={student.profileImage}
                                alt=""
                                referrerPolicy="no-referrer"
                                crossOrigin="anonymous"
                                className={cx('w-8 h-8 rounded-full object-cover shrink-0 border', hairline)}
                              />
                            ) : (
                              <div
                                className={cx(
                                  'w-8 h-8 rounded-full shrink-0 border flex items-center justify-center bg-slate-100 dark:bg-white/[0.06] text-slate-400',
                                  hairline
                                )}
                              >
                                <span className="text-[11px] font-bold uppercase">
                                  {student.name.slice(0, 2)}
                                </span>
                              </div>
                            )}
                            <span className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate">
                              {student.name}
                            </span>
                          </div>

                          <div className="text-[12px] text-slate-500 dark:text-slate-400 tnum truncate font-mono">
                            {student.tc || '—'}
                          </div>

                          <div className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300 tnum truncate">
                            {student.schoolNumber || '—'}
                          </div>

                          <div className="text-[12px] text-slate-600 dark:text-slate-400 truncate">
                            {student.morningStatus}
                          </div>

                          <div className="text-[12px] text-slate-600 dark:text-slate-400 truncate">
                            {student.afternoonStatus}
                          </div>

                          <div className="flex justify-end">
                            <Badge tone={student.statusTone}>
                              {student.statusLabel}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Panel>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DailyAbsenceReportView;
