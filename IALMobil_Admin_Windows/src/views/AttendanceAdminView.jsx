import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarX2,
  CalendarDays,
  Trash2,
  AlertTriangle,
  Clock,
  FileWarning,
  CheckCircle2,
  ChevronLeft,
  DoorOpen,
  DoorClosed,
  Timer,
  LogIn,
  LogOut
} from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { db, rtdb } from '../services/firebaseConfig';
import { collection, addDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import StudentSearch from '../components/StudentSearch';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import UnsavedBanner from '../components/UnsavedBanner';
import useAttendanceConfig from '../hooks/useAttendanceConfig';
import {
  evaluateStudentDay,
  normalizeScanRecord,
  getDateKeyInTimeZone,
  getMinutesInTimeZone,
  isClosedDay as isClosedDayFn,
  formatDayCount
} from '../services/attendanceRules';
import {
  Panel,
  PanelHeader,
  Button,
  IconButton,
  Badge,
  Segmented,
  StatStrip,
  Stat,
  EmptyState,
  Modal,
  Toast
} from '../components/ui/panel';
import { cx, hairline, divider } from '../components/ui/tokens';

const ROLE_OPTIONS = [
  { id: 'student', label: 'Öğrenci' },
  { id: 'teacher', label: 'Öğretmen' },
  { id: 'personnel', label: 'Personel' }
];

/** Manuel devamsızlık kaydının etiketi ve rengi. */
const recordBadge = (record) => {
  const courseName = record.courseName || '';
  const status = record.status || '';

  if (courseName.includes('Raporlu') || status === 'excused') return { tone: 'neutral', label: 'İzinli / Raporlu' };
  if (courseName.includes('Yarım Gün')) return { tone: 'warning', label: 'Yarım gün (0,5)' };
  if (courseName.includes('Tam Gün') || status === 'absent') return { tone: 'danger', label: 'Tam gün (1,0)' };
  if (status === 'late') return { tone: 'warning', label: 'Geç kaldı' };
  return { tone: 'success', label: 'Mevcut' };
};

const SessionCell = ({ label, session, last }) => {
  const tone = session.present ? 'success' : session.finalized ? 'danger' : 'neutral';
  const text = session.present
    ? `${session.entryTime}${session.isLate ? ' · geç' : ''}`
    : session.finalized
    ? 'Yok (0,5 gün)'
    : 'Bekleniyor';

  return (
    <div className={cx('flex-1 min-w-0 px-5 py-3.5', !last && 'sm:border-r', !last && hairline)}>
      <div className="text-[11.5px] text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1.5 flex items-center gap-2">
        <Badge tone={tone}>{session.present ? 'Var' : session.finalized ? 'Yok' : 'Bekliyor'}</Badge>
        <span className="text-[12.5px] text-slate-600 dark:text-slate-300 tnum truncate">{text}</span>
      </div>
    </div>
  );
};

const AttendanceAdminView = () => {
  const { config } = useAttendanceConfig();
  const [viewMode, setViewMode] = useState('student');
  const [allUsers, setAllUsers] = useState([]);
  const [users, setUsers] = useState([]);

  const [studentId, setStudentId] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast] = useState({ open: false, message: '', tone: 'success' });
  const { isDirty } = useUnsavedChanges();

  const [manualRecords, setManualRecords] = useState([]);
  const [qrLogs, setQrLogs] = useState([]);
  const [loadingPast, setLoadingPast] = useState(false);

  const notify = (message, tone = 'success') => {
    setToast({ open: true, message, tone });
    setTimeout(() => setToast((t) => ({ ...t, open: false })), 3000);
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await firebaseService.fetchAllUsers();
      setAllUsers(data);
    } catch (err) {
      console.error('Kullanıcılar alınamadı:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    const filtered = allUsers.filter((u) => {
      const role = u.fields?.role?.stringValue?.toLowerCase() || '';
      const subRole = u.fields?.sub_role?.stringValue?.toLowerCase() || '';
      if (viewMode === 'student') return role === 'student' || role === 'öğrenci';
      if (viewMode === 'teacher') return role === 'teacher' || role === 'öğretmen';
      return role === 'personel' || subRole === 'personnel';
    });
    setUsers(filtered);
    setStudentId(null);
    setSelectedStudent(null);
    setManualRecords([]);
    setQrLogs([]);
  }, [allUsers, viewMode]);

  // Seçili kişinin devamsızlık ve QR geçişlerini gerçek zamanlı dinle
  useEffect(() => {
    if (!studentId) return undefined;
    setLoadingPast(true);

    const attQuery = query(collection(db, 'attendance'), where('studentId', '==', studentId));
    const unsubFirestore = onSnapshot(
      attQuery,
      (snap) => {
        const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        records.sort((a, b) => {
          const tA = a.date ? (a.date.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime()) : 0;
          const tB = b.date ? (b.date.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime()) : 0;
          return tB - tA;
        });
        setManualRecords(records);
        setLoadingPast(false);
      },
      (err) => {
        console.log('Firestore attendance snapshot error:', err);
        setLoadingPast(false);
      }
    );

    const rtdbAttRef = ref(rtdb, 'qr_system/attendance_logs');
    const unsubRTDB = onValue(
      rtdbAttRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setQrLogs([]);
          return;
        }
        const allDays = snapshot.val();
        const logs = [];
        Object.keys(allDays).forEach((dayKey) => {
          const dayObj = allDays[dayKey];
          Object.keys(dayObj).forEach((logId) => {
            const item = dayObj[logId];
            if (item.studentId === studentId || item.studentTc === selectedStudent?.tc) {
              logs.push({
                id: logId,
                date: item.date || dayKey,
                action: item.action || 'entry',
                status: item.status || 'entry',
                time:
                  item.time ||
                  (item.timestamp
                    ? new Date(item.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                    : '08:50'),
                timestamp: item.timestamp || Date.now(),
                isLate: item.isLate || false,
                type: item.type || 'institution_gate',
                method: item.method || 'qr'
              });
            }
          });
        });
        logs.sort((a, b) => b.timestamp - a.timestamp);
        setQrLogs(logs);
      },
      (err) => console.log('RTDB logs error:', err)
    );

    return () => {
      unsubFirestore();
      unsubRTDB();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  // Devamsızlık özeti — ortak kural motoruyla hesaplanır.
  // Otomatik yazılan yarım günler (0,5 + 0,5) doğru şekilde tam güne toplanır.
  const attendanceSummary = useMemo(() => {
    let ozursuzTotal = 0;
    let raporluTotal = 0;
    let lateCount = 0;
    let autoCount = 0;

    const byDay = {};
    manualRecords.forEach((r) => {
      let key = 'bilinmeyen';
      if (r.date) {
        key = r.date.toDate
          ? getDateKeyInTimeZone(r.date.toDate(), config.timeZone)
          : typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r.date)
          ? r.date.slice(0, 10)
          : getDateKeyInTimeZone(new Date(r.date), config.timeZone);
      }
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(r);
      if (r.autoGenerated) autoCount++;
      if (r.status === 'late') lateCount++;
    });

    Object.values(byDay).forEach((dayRecords) => {
      const excused = dayRecords.filter(
        (r) =>
          r.status === 'excused' ||
          String(r.courseName || '').includes('Raporlu') ||
          String(r.courseName || '').includes('İzinli')
      );

      if (excused.length) {
        // O gün raporlu/izinli sayılır; özürsüz devamsızlık yazılmaz.
        const weight = excused.some(
          (r) => Number(r.absenceWeight) === 0.5 || String(r.courseName || '').includes('Yarım Gün')
        )
          ? 0.5
          : 1.0;
        raporluTotal += weight;
        return;
      }

      let dayWeight = 0;
      dayRecords.forEach((r) => {
        if (Number.isFinite(Number(r.absenceWeight))) dayWeight += Number(r.absenceWeight);
        else if (String(r.courseName || '').includes('Yarım Gün') || r.periodIndex === -0.5) dayWeight += 0.5;
        else dayWeight += 1;
      });
      ozursuzTotal += Math.min(1, dayWeight);
    });

    qrLogs.forEach((l) => {
      if (l.isLate) lateCount++;
    });

    return {
      ozursuzDays: formatDayCount(ozursuzTotal),
      raporluDays: formatDayCount(raporluTotal),
      lateCount,
      autoCount
    };
  }, [manualRecords, qrLogs, config.timeZone]);

  // Kişinin bugünkü canlı durumu (kural motoru ile)
  const todayEvaluation = useMemo(() => {
    if (!studentId) return null;
    const now = new Date();
    const todayKey = getDateKeyInTimeZone(now, config.timeZone);
    const todayScans = qrLogs
      .filter((l) => l.date === todayKey)
      .map((l) => normalizeScanRecord(l, config))
      .filter(Boolean);

    return evaluateStudentDay({
      scans: todayScans,
      nowMinutes: getMinutesInTimeZone(now, config.timeZone),
      config,
      isClosedDay: isClosedDayFn(now, config)
    });
  }, [studentId, qrLogs, config]);

  const handleSaveAttendance = async (typeLabel, isHalfDay, isExcused) => {
    if (!studentId) return;
    setIsSaving(true);
    try {
      const now = new Date();
      await addDoc(collection(db, 'attendance'), {
        studentId,
        studentName: selectedStudent?.name || 'Öğrenci',
        courseName: typeLabel,
        periodIndex: isHalfDay ? -0.5 : -1,
        // Motorun ve raporun ağırlığı doğru toplaması için açıkça yazılır.
        absenceWeight: isExcused ? 0 : isHalfDay ? 0.5 : 1,
        status: isExcused ? 'excused' : 'absent',
        autoGenerated: false,
        recordedBy: 'Admin Panel',
        // Rapor ekranı hem string hem Timestamp tarihi okuyabilir.
        date: getDateKeyInTimeZone(now, config.timeZone),
        timestamp: now
      });
      notify('Kayıt eklendi.');
    } catch (err) {
      console.error('Attendance kaydetme hatası:', err);
      notify('Kayıt eklenemedi.', 'error');
    }
    setIsSaving(false);
  };

  const handleDeleteRecord = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteDoc(doc(db, 'attendance', deleteConfirm.id));
      notify('Kayıt silindi.');
    } catch (err) {
      console.error('Silme hatası:', err);
      notify('Kayıt silinemedi.', 'error');
    }
    setDeleteConfirm(null);
  };

  /** Özürsüz kaydı raporlu/izinliye çevirir. */
  const convertToExcused = async (recordId) => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'attendance', recordId), {
        status: 'excused',
        courseName: 'Tam Gün (Raporlu / İzinli)',
        absenceWeight: 0,
        timestamp: new Date()
      });
      notify('Kayıt raporluya çevrildi.');
    } catch (err) {
      console.error('Rapor işleme hatası:', err);
      notify('İşlem başarısız.', 'error');
    }
    setIsSaving(false);
  };

  /** Manuel kayıtlar ve karekod geçişleri tek bir zaman çizelgesinde birleşir. */
  const timeline = useMemo(() => {
    const manual = manualRecords.map((record) => {
      const millis = record.date
        ? record.date.toDate
          ? record.date.toDate().getTime()
          : new Date(record.date).getTime()
        : 0;
      return { kind: 'manual', key: `m_${record.id}`, millis, record };
    });

    const scans = qrLogs.map((log) => ({
      kind: 'scan',
      key: `q_${log.id}`,
      millis: log.timestamp || 0,
      log
    }));

    return [...manual, ...scans].sort((a, b) => b.millis - a.millis);
  }, [manualRecords, qrLogs]);

  const roleLabel = ROLE_OPTIONS.find((r) => r.id === viewMode)?.label || '';

  return (
    <div className="w-full flex flex-col gap-5 pb-2">
      <Toast open={toast.open} message={toast.message} tone={toast.tone} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[27px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
            Devamsızlık
          </h1>
          <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400">
            Karekod geçişleri, geç kalmalar ve yarım/tam gün devamsızlık kayıtları
          </p>
        </div>
        <Segmented value={viewMode} onChange={setViewMode} options={ROLE_OPTIONS} />
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
        {/* Kişi listesi */}
        <Panel className={cx('h-[600px]', studentId && 'hidden lg:flex')}>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-[12.5px] text-slate-500">Yükleniyor…</div>
          ) : (
            <StudentSearch
              users={users}
              selectedId={studentId}
              viewMode={viewMode}
              onSelect={(id, name) => {
                setStudentId(id);
                const found = users.find((u) => u.name.split('/').pop() === id);
                setSelectedStudent({
                  id,
                  name,
                  tc: found?.fields?.tc_kimlik?.stringValue || '',
                  schoolNumber: found?.fields?.school_number?.stringValue || ''
                });
              }}
            />
          )}
        </Panel>

        {/* Detay */}
        <div className={cx('flex flex-col gap-5 min-w-0', !studentId && 'hidden lg:flex')}>
          {!studentId ? (
            <Panel>
              <EmptyState
                icon={CalendarX2}
                title={`${roleLabel} seçin`}
                description="Devamsızlık ve geçiş hareketlerini incelemek veya yeni kayıt eklemek için soldaki listeden bir kişi seçin."
              />
            </Panel>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <IconButton
                  label="Listeye dön"
                  icon={ChevronLeft}
                  variant="secondary"
                  onClick={() => setStudentId(null)}
                  className="lg:hidden"
                />
                <div className="min-w-0">
                  <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-white truncate">
                    {selectedStudent?.name}
                  </h2>
                  <p className="m-0 mt-1 text-[11.5px] text-slate-500 dark:text-slate-400 truncate">
                    {[
                      selectedStudent?.schoolNumber && `No ${selectedStudent.schoolNumber}`,
                      selectedStudent?.tc && `TC ${selectedStudent.tc}`,
                      roleLabel
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>

              <StatStrip>
                <Stat
                  label="Özürsüz"
                  value={attendanceSummary.ozursuzDays}
                  hint="gün"
                  tone={parseFloat(attendanceSummary.ozursuzDays) > 0 ? 'danger' : 'default'}
                />
                <Stat label="Raporlu" value={attendanceSummary.raporluDays} hint="gün" />
                <Stat label="Geç kalma" value={attendanceSummary.lateCount} />
                <Stat label="Otomatik kayıt" value={attendanceSummary.autoCount} last />
              </StatStrip>

              {/* Bugünkü canlı durum */}
              {viewMode === 'student' && todayEvaluation && (
                <Panel>
                  <PanelHeader
                    title="Bugünkü Durum"
                    description={`Sabah ${config.morningEntryHour} (+${config.morningGraceMinutes}dk) · Öğleden sonra ${config.afternoonEntryHour} (+${config.afternoonGraceMinutes}dk) · Çıkış ${config.schoolExitHour}`}
                  />

                  <div className={cx('flex flex-col sm:flex-row divide-y sm:divide-y-0', divider)}>
                    <SessionCell label="Sabah oturumu" session={todayEvaluation.morning} />
                    <SessionCell label="Öğleden sonra" session={todayEvaluation.afternoon} />
                    <div className={cx('flex-1 min-w-0 px-5 py-3.5 sm:border-r', hairline)}>
                      <div className="text-[11.5px] text-slate-500 dark:text-slate-400">Günün sonucu</div>
                      <div className="mt-1.5 text-[13.5px] font-medium text-slate-900 dark:text-white truncate">
                        {todayEvaluation.statusLabel}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 px-5 py-3.5">
                      <div className="text-[11.5px] text-slate-500 dark:text-slate-400">Konum</div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[13.5px] font-medium text-slate-900 dark:text-white">
                        {todayEvaluation.isInside ? (
                          <DoorClosed size={14} className="text-emerald-500" />
                        ) : (
                          <DoorOpen size={14} className="text-amber-500" />
                        )}
                        {todayEvaluation.isInside ? 'Kurum içinde' : 'Kurum dışında'}
                      </div>
                    </div>
                  </div>

                  {(todayEvaluation.needsAutoLunchExit || todayEvaluation.needsAutoSchoolExit) && (
                    <div
                      className={cx(
                        'flex items-center gap-2 px-5 py-2.5 border-t text-[12px] text-amber-700 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-500/[0.07]',
                        hairline
                      )}
                    >
                      <Timer size={14} className="shrink-0" />
                      Otomatik çıkış sırada: sistem bir sonraki turda çıkışı verecek.
                    </div>
                  )}
                </Panel>
              )}

              {/* Hızlı işlemler */}
              <Panel>
                <PanelHeader title="Hızlı Kayıt" description="Seçili kişi için bugüne devamsızlık işler" />
                <div className="flex flex-wrap gap-2 px-5 py-4">
                  <Button
                    icon={AlertTriangle}
                    onClick={() => handleSaveAttendance('Tam Gün Yok (Özürsüz)', false, false)}
                    disabled={isSaving}
                  >
                    Tam gün yok (1,0)
                  </Button>
                  <Button
                    icon={Clock}
                    onClick={() => handleSaveAttendance('Yarım Gün Yok (Özürsüz)', true, false)}
                    disabled={isSaving}
                  >
                    Yarım gün yok (0,5)
                  </Button>
                  <Button
                    icon={FileWarning}
                    onClick={() => handleSaveAttendance('Tam Gün (Raporlu / İzinli)', false, true)}
                    disabled={isSaving}
                  >
                    Rapor / izin
                  </Button>
                </div>
              </Panel>

              {/* Geçmiş */}
              <Panel>
                <PanelHeader title="Yoklama & Geçiş Geçmişi" description="Manuel kayıtlar ve karekod hareketleri">
                  <span className="text-[11.5px] text-slate-500 dark:text-slate-400 tnum">
                    {timeline.length} kayıt
                  </span>
                </PanelHeader>

                {loadingPast ? (
                  <div className={cx('divide-y', divider)}>
                    {[0, 1, 2].map((n) => (
                      <div key={n} className="px-5 py-3.5 animate-pulse">
                        <div className="h-3 w-52 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
                      </div>
                    ))}
                  </div>
                ) : timeline.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="Kusursuz devam"
                    description="Bu kişiye ait devamsızlık veya geç kalma kaydı bulunmuyor."
                  />
                ) : (
                  <div className={cx('divide-y', divider)}>
                    {timeline.map((entry) => {
                      if (entry.kind === 'manual') {
                        const { record } = entry;
                        const badge = recordBadge(record);
                        const dateLabel = record.date
                          ? (record.date.toDate ? record.date.toDate() : new Date(record.date)).toLocaleDateString(
                              'tr-TR',
                              { day: '2-digit', month: 'long', year: 'numeric' }
                            )
                          : 'Tarih yok';
                        const isExcused = record.status === 'excused';

                        return (
                          <div
                            key={entry.key}
                            className="group flex items-center gap-3.5 px-5 py-3 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                          >
                            <div
                              className={cx(
                                'w-8 h-8 rounded-lg shrink-0 border flex items-center justify-center text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-white/[0.03]',
                                hairline
                              )}
                            >
                              <CalendarDays size={15} strokeWidth={1.8} />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[13px] font-medium text-slate-900 dark:text-white truncate">
                                  {record.courseName || 'Devamsızlık kaydı'}
                                </span>
                                {record.autoGenerated && <Badge tone="neutral">Otomatik</Badge>}
                              </div>
                              <div className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400 truncate">
                                {dateLabel} · {record.recordedBy || 'Admin'}
                                {record.reason ? ` · ${record.reason}` : ''}
                              </div>
                            </div>

                            <Badge tone={badge.tone}>{badge.label}</Badge>

                            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                              {!isExcused && (
                                <IconButton
                                  label="Raporluya çevir"
                                  icon={FileWarning}
                                  onClick={() => convertToExcused(record.id)}
                                  disabled={isSaving}
                                />
                              )}
                              <IconButton
                                label="Kaydı sil"
                                icon={Trash2}
                                variant="quiet"
                                onClick={() =>
                                  setDeleteConfirm({ id: record.id, label: record.courseName || 'Devamsızlık kaydı' })
                                }
                              />
                            </div>
                          </div>
                        );
                      }

                      const { log } = entry;
                      const isEntry = log.action === 'entry' || log.status === 'entry';

                      return (
                        <div key={entry.key} className="flex items-center gap-3.5 px-5 py-3">
                          <div
                            className={cx(
                              'w-8 h-8 rounded-lg shrink-0 border flex items-center justify-center bg-slate-50 dark:bg-white/[0.03]',
                              hairline,
                              log.isLate
                                ? 'text-amber-500'
                                : isEntry
                                ? 'text-emerald-500'
                                : 'text-slate-400 dark:text-slate-500'
                            )}
                          >
                            {log.isLate ? (
                              <Timer size={15} strokeWidth={1.8} />
                            ) : isEntry ? (
                              <LogIn size={15} strokeWidth={1.8} />
                            ) : (
                              <LogOut size={15} strokeWidth={1.8} />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] text-slate-800 dark:text-slate-100 truncate">
                              {isEntry ? 'Kurum girişi' : 'Kurumdan çıkış'}
                              <span className="text-slate-400 dark:text-slate-500">
                                {' '}
                                · {log.method === 'manual_admin' ? 'yönetici' : 'karekod'}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400 tnum truncate">
                              {log.date} · {log.time}
                            </div>
                          </div>

                          {log.isLate ? (
                            <Badge tone="warning">Geç</Badge>
                          ) : (
                            <Badge tone={isEntry ? 'success' : 'neutral'}>{isEntry ? 'Giriş' : 'Çıkış'}</Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </>
          )}
        </div>
      </div>

      <Modal
        open={Boolean(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
        title="Kaydı sil"
        width="max-w-md"
        footer={
          <>
            <Button type="button" onClick={() => setDeleteConfirm(null)}>
              Vazgeç
            </Button>
            <Button type="button" variant="danger" onClick={handleDeleteRecord}>
              Sil
            </Button>
          </>
        }
      >
        <div className="px-5 py-5">
          <p className="m-0 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-900 dark:text-white">{deleteConfirm?.label}</span> kaydı
            silinecek ve devamsızlık toplamı yeniden hesaplanacak. Bu işlem geri alınamaz.
          </p>
        </div>
      </Modal>

      <UnsavedBanner visible={isDirty} />
    </div>
  );
};

export default AttendanceAdminView;
