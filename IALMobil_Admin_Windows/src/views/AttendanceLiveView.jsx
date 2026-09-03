import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DoorOpen,
  RadioReceiver,
  GraduationCap,
  UserSquare,
  Briefcase,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Users,
  ShieldCheck,
  Activity
} from 'lucide-react';
import { soundManager } from '../services/soundManager';
import { ref, query as rtdbQuery, limitToLast, onValue } from 'firebase/database';
import { rtdb, db } from '../services/firebaseConfig';
import { collection, getDocs, query, where, onSnapshot } from 'firebase/firestore';
import { firebaseService } from '../services/firebase';
import { io } from 'socket.io-client';
import {
  Panel,
  PanelHeader,
  Segmented,
  StatStrip,
  Stat,
  Badge,
  Dot,
  EmptyState
} from '../components/ui/panel';
import { cx, eyebrow, hairline, divider } from '../components/ui/tokens';

const toMillis = (timestamp) => {
  if (timestamp?.seconds) return timestamp.seconds * 1000;
  if (typeof timestamp === 'number') return timestamp;
  if (typeof timestamp === 'string') {
    const t = new Date(timestamp).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
};

const formatTime = (timestamp) => {
  const ms = toMillis(timestamp);
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const getInitials = (name = '') => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '—';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const FILTER_OPTIONS = [
  { id: 'all', label: 'Tüm Geçişler' },
  { id: 'student', label: 'Öğrenciler' },
  { id: 'personnel', label: 'Personel & Öğretmen' }
];

const AttendanceLiveView = () => {
  const [liveRecords, setLiveRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usersMap, setUsersMap] = useState({});
  const [filterType, setFilterType] = useState('all');

  const mergeRecords = useCallback((incoming) => {
    setLiveRecords((prev) => {
      const byId = new Map();
      [...incoming, ...prev].forEach((r) => {
        if (!r) return;
        byId.set(r.id || `${r.studentId}_${r.timestamp}`, r);
      });

      const deduped = new Map();
      Array.from(byId.values())
        .sort((a, b) => toMillis(b.timestamp) - toMillis(a.timestamp))
        .forEach((r) => {
          const sid = r.studentId || r.userId || 'unknown';
          const minuteKey = Math.floor(toMillis(r.timestamp) / 60000);
          const key = `${sid}_${r.action || r.status || r.type}_${minuteKey}`;
          if (!deduped.has(key)) deduped.set(key, r);
        });

      return Array.from(deduped.values()).slice(0, 50);
    });
  }, []);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const map = {};
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const id = docSnap.id;
          const tc = String(data.tc_kimlik || data.tc || data.tcNo || data.identityNumber || '').trim();
          const schoolNo = String(data.school_number || data.schoolNumber || '').trim();
          const fullName =
            data.full_name ||
            data.fullName ||
            data.name ||
            data.displayName ||
            'Bilinmeyen Kişi';
          const profileImg =
            data.profile_image ||
            data.profileImageUrl ||
            data.profileImage ||
            null;

          const rawRole = String(data.role || data.user_type || data.type || 'student').toLowerCase().trim();
          let role = 'student';
          if (['teacher', 'öğretmen', 'ogretmen'].includes(rawRole)) {
            role = 'teacher';
          } else if (['admin', 'yönetici', 'yonetici', 'manager'].includes(rawRole)) {
            role = 'admin';
          } else if (['personnel', 'personel', 'staff', 'security', 'güvenlik', 'gorevli', 'hizmetli', 'officer'].includes(rawRole)) {
            role = 'personnel';
          }

          const userObj = { id, name: fullName, profileImage: profileImg, role, tc, schoolNo };
          map[id] = userObj;
          if (tc) map[tc] = userObj;
          if (schoolNo) map[schoolNo] = userObj;
        });
        setUsersMap(map);
      } catch (error) {
        console.error('Kullanıcı verileri çekilemedi', error);
      }
    };
    fetchUsers();

    const socket = io('http://213.142.159.36:8080', {
      reconnectionAttempts: 5,
      timeout: 5000
    });

    socket.on('connect', () => {
      setLoading(false);
    });

    socket.on('new_scan', (data) => {
      mergeRecords([{ ...data, id: data.id || `vds_${data.studentId}_${data.timestamp}`, source: 'vds' }]);
      soundManager.playSuccessDing();
    });

    const seenRef = { current: new Set() };
    let firstRtdbBatch = true;
    const liveRef = ref(rtdb, 'qr_system/live_scans');
    const unsubRtdb = onValue(
      liveRef,
      (snapshot) => {
        setLoading(false);
        if (!snapshot.exists()) return;

        const incoming = [];
        snapshot.forEach((child) => {
          const data = child.val();
          if (!data || data.autoKind) return;
          incoming.push({ ...data, id: child.key, source: 'firebase' });
        });

        const fresh = incoming.filter((r) => !seenRef.current.has(r.id));
        incoming.forEach((r) => seenRef.current.add(r.id));
        mergeRecords(incoming);

        if (!firstRtdbBatch && fresh.length) soundManager.playSuccessDing();
        firstRtdbBatch = false;
      },
      () => setLoading(false)
    );

    const todayKey = new Date().toISOString().split('T')[0];
    const todayLogsRef = ref(rtdb, `qr_system/attendance_logs/${todayKey}`);
    const unsubTodayLogs = onValue(todayLogsRef, (snapshot) => {
      setLoading(false);
      if (!snapshot.exists()) return;
      const incoming = [];
      snapshot.forEach((child) => {
        const data = child.val();
        if (data && !data.autoKind) {
          incoming.push({ ...data, id: child.key, source: 'firebase' });
        }
      });
      mergeRecords(incoming);
    });

    const qFs = query(
      collection(db, 'attendance_logs'),
      where('date', '==', todayKey)
    );
    const unsubFs = onSnapshot(qFs, (snap) => {
      setLoading(false);
      const incoming = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data && !data.autoKind) {
          incoming.push({ ...data, id: d.id, source: 'firestore' });
        }
      });
      mergeRecords(incoming);
    });

    const guard = setTimeout(() => setLoading(false), 2500);

    return () => {
      socket.disconnect();
      try {
        unsubRtdb();
        unsubTodayLogs();
        unsubFs();
      } catch {
        
      }
      clearTimeout(guard);
    };
  }, [mergeRecords]);

  const isPersonnelRecord = useCallback((record) => {
    const studentId = record.studentId || record.userId || 'unknown';
    const tc = record.studentTc || record.tc || '';
    const user = usersMap[studentId] || usersMap[tc];
    const rawRole = String(record.userRole || record.role || user?.role || 'student').toLowerCase();
    const type = String(record.type || '').toLowerCase();
    if (type.includes('personnel') || type.includes('teacher') || type.includes('personel') || type.includes('öğretmen')) return true;
    return ['personnel', 'personel', 'teacher', 'öğretmen', 'ogretmen', 'admin', 'yönetici', 'yonetici', 'staff', 'security'].includes(rawRole);
  }, [usersMap]);

  const filteredRecords = useMemo(() => {
    return liveRecords.filter((record) => {
      const isPersonnel = isPersonnelRecord(record);
      if (filterType === 'all') return true;
      if (filterType === 'student') return !isPersonnel;
      if (filterType === 'personnel') return isPersonnel;
      return true;
    });
  }, [liveRecords, filterType, isPersonnelRecord]);

  const studentCount = useMemo(() => liveRecords.filter((r) => !isPersonnelRecord(r)).length, [liveRecords, isPersonnelRecord]);
  const personnelCount = useMemo(() => liveRecords.filter((r) => isPersonnelRecord(r)).length, [liveRecords, isPersonnelRecord]);
  const lastScanTime = useMemo(() => (liveRecords[0] ? formatTime(liveRecords[0].timestamp) : '—'), [liveRecords]);

  const filterOptionsWithCount = useMemo(() => {
    return FILTER_OPTIONS.map((f) => {
      if (f.id === 'all') return { ...f, count: liveRecords.length };
      if (f.id === 'student') return { ...f, count: studentCount };
      if (f.id === 'personnel') return { ...f, count: personnelCount };
      return f;
    });
  }, [liveRecords.length, studentCount, personnelCount]);

  const today = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="w-full flex flex-col gap-5 pb-4">
      
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[27px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
            Canlı Geçiş Takibi
          </h1>
          <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400 first-letter:uppercase">
            {today}
          </p>
        </div>
      </header>

      <StatStrip>
        <Stat label="Toplam Canlı Kayıt" value={liveRecords.length} hint="Son 50 işlem penceresi" />
        <Stat label="Öğrenci Giriş / Çıkış" value={studentCount} hint="Turnike ve kapı taramaları" />
        <Stat label="Personel & Öğretmen" value={personnelCount} hint="Kurum içi personel hareketleri" />
        <Stat label="Son İşlem Saati" value={lastScanTime} hint="En son okunan kart / QR" last />
      </StatStrip>

      <Panel>
        <PanelHeader
          title="Gerçek Zamanlı Kayıt Akışı"
          description="VDS Turnike ve Mobil QR üzerinden anlık okunan geçiş kayıtları"
        >
          <Segmented
            value={filterType}
            onChange={setFilterType}
            options={filterOptionsWithCount}
          />
        </PanelHeader>

        {loading ? (
          <div className={cx('divide-y', divider)}>
            {[0, 1, 2, 3, 4].map((n) => (
              <div key={n} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
                <div className="w-9 h-9 rounded-lg bg-slate-200/70 dark:bg-white/[0.06]" />
                <div className="flex-1 h-4 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
                <div className="w-24 h-4 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
                <div className="w-16 h-4 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
              </div>
            ))}
          </div>
        ) : filteredRecords.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            title={liveRecords.length === 0 ? 'Henüz geçiş kaydı bulunmuyor' : 'Filtreye uygun kayıt yok'}
            description={
              liveRecords.length === 0
                ? 'Turnike veya kapı QR sisteminden kart okutulduğunda kayıtlar anlık olarak burada listelenir.'
                : 'Diğer filtre sekmelerini seçerek geçmiş geçişleri görüntüleyebilirsiniz.'
            }
          />
        ) : (
          <div className="overflow-x-auto panel-scroll">
            <div className="min-w-[700px]">
              
              <div
                className={cx(
                  'grid grid-cols-[minmax(0,1.8fr)_140px_130px_100px] gap-4 px-5 py-2.5 border-b bg-slate-50/70 dark:bg-white/[0.02]',
                  hairline
                )}
              >
                <span className={eyebrow}>Kişi & Rol</span>
                <span className={eyebrow}>İşlem Türü</span>
                <span className={eyebrow}>Kaynak</span>
                <span className={cx(eyebrow, 'text-right')}>Saat</span>
              </div>

              <div className={cx('divide-y', divider)}>
                {filteredRecords.map((record, index) => {
                  const studentId = record.studentId || record.userId || 'unknown';
                  const tc = record.studentTc || record.tc || '';
                  const user = usersMap[studentId] || usersMap[tc];
                  const studentName =
                    record.studentName ||
                    record.userName ||
                    user?.name ||
                    'İsimsiz Kişi';
                  let profileImageUrl =
                    record.profileImageUrl || user?.profileImage || null;
                  if (
                    !profileImageUrl ||
                    profileImageUrl === 'null' ||
                    profileImageUrl.trim() === ''
                  ) {
                    profileImageUrl = null;
                  }

                  const rawRole = String(record.userRole || record.role || user?.role || 'student').toLowerCase();
                  let displayRole = 'Öğrenci';
                  let roleTone = 'neutral';

                  if (['teacher', 'öğretmen', 'ogretmen'].includes(rawRole)) {
                    displayRole = 'Öğretmen';
                    roleTone = 'warning';
                  } else if (['admin', 'yönetici', 'yonetici'].includes(rawRole)) {
                    displayRole = 'Yönetici';
                    roleTone = 'accent';
                  } else if (['personnel', 'personel', 'staff', 'security', 'güvenlik'].includes(rawRole)) {
                    displayRole = 'Personel';
                    roleTone = 'accent';
                  }

                  const type = record.type || 'institution_entry';
                  const isAttendance = type === 'attendance';
                  const isExit = record.action === 'exit';
                  const isVds = record.source === 'vds' || String(record.id).startsWith('vds_');
                  const timeString = formatTime(record.timestamp);

                  return (
                    <div
                      key={record.id || index}
                      className={cx(
                        'grid grid-cols-[minmax(0,1.8fr)_140px_130px_100px] gap-4 px-5 py-3 items-center transition-colors',
                        index === 0
                          ? 'bg-slate-50/80 dark:bg-white/[0.04]'
                          : 'hover:bg-slate-50/60 dark:hover:bg-white/[0.02]'
                      )}
                    >
                      
                      <div className="flex items-center gap-3 min-w-0">
                        {profileImageUrl ? (
                          <img
                            src={profileImageUrl}
                            alt={studentName}
                            className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-white/10 shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-slate-300 font-semibold text-[12px] shrink-0 tnum">
                            {getInitials(studentName)}
                          </div>
                        )}

                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[13.5px] font-medium text-slate-900 dark:text-white truncate">
                            {studentName}
                          </span>
                          <Badge tone={roleTone}>{displayRole}</Badge>
                          {index === 0 && (
                            <Badge tone="success">En Son</Badge>
                          )}
                        </div>
                      </div>

                      <div className="text-[13px] font-medium">
                        {isAttendance ? (
                          <span className="inline-flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                            <DoorOpen size={14} className="text-slate-500 dark:text-slate-400" />
                            Derse Giriş
                          </span>
                        ) : isExit ? (
                          <span className="inline-flex items-center gap-1.5 text-[#991b1b] dark:text-rose-400">
                            <ArrowUpRight size={14} strokeWidth={2} />
                            Kurumdan Çıkış
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                            <ArrowDownLeft size={14} strokeWidth={2} />
                            Kuruma Giriş
                          </span>
                        )}
                      </div>

                      <div>
                        <Badge tone="neutral">
                          {isVds ? 'VDS Turnike' : 'Mobil QR'}
                        </Badge>
                      </div>

                      <div className="text-right">
                        <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300 tnum">
                          {timeString}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
};

export default AttendanceLiveView;
