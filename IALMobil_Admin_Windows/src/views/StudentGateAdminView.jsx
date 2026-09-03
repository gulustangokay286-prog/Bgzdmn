import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search, User, X, LogIn, LogOut, ShieldAlert, Check, RefreshCw
} from 'lucide-react';
import { db, rtdb } from '../services/firebaseConfig';
import { ref, onValue, update, serverTimestamp as rtdbServerTimestamp } from 'firebase/database';
import { collection, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { soundManager } from '../services/soundManager';
import {
  recordGatePassage,
  subscribeLateApprovals,
  approveLateEntry,
  resolveLateApproval
} from '../services/attendanceService';
import { getDateKeyInTimeZone, isStaffRole } from '../services/attendanceRules';
import useAttendanceConfig from '../hooks/useAttendanceConfig';
import {
  Panel, PanelHeader, Button, Input, Badge, Dot,
  Segmented, StatStrip, Stat, EmptyState, Toast
} from '../components/ui/panel';
import { cx, eyebrow, hairline, divider } from '../components/ui/tokens';

const ROLE_FILTERS = [
  { id: 'all', label: 'Tümü' },
  { id: 'student', label: 'Öğrenci' },
  { id: 'staff', label: 'Personel' },
  { id: 'parent', label: 'Veli' }
];

const ROW_GRID = 'grid grid-cols-[minmax(0,1.6fr)_120px_90px_150px_128px] gap-4 items-center';
const ROW_MIN_WIDTH = 'min-w-[880px]';

const StudentGateAdminView = () => {
  const { config } = useAttendanceConfig();

  const [people, setPeople] = useState([]);
  const [statusMap, setStatusMap] = useState({});
  const [searchText, setSearchText] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [lateRequests, setLateRequests] = useState([]);
  const [toast, setToast] = useState({ open: false, message: '', tone: 'success' });

  const statusFromFirestoreRef = useRef({});
  const statusFromRtdbRef = useRef({});

  const dateKey = useMemo(
    () => getDateKeyInTimeZone(new Date(), config.timeZone || 'Europe/Istanbul'),
    [config.timeZone]
  );
  const currentDate = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const flash = useCallback((tone, message) => {
    setToast({ open: true, message, tone });
    setTimeout(() => setToast(t => ({ ...t, open: false })), 3500);
  }, []);

  /** İki kaynaktan gelen turnike durumlarını birleştirir; RTDB son sözü söyler. */
  const mergeAndSetStatuses = useCallback(() => {
    const combined = {};
    const apply = (source) => {
      Object.entries(source).forEach(([k, v]) => {
        if (v?.status === 'entry') combined[k] = 'inside';
        else if (v?.status === 'exit') combined[k] = 'outside';
      });
    };
    apply(statusFromFirestoreRef.current);
    apply(statusFromRtdbRef.current);
    setStatusMap(prev => ({ ...prev, ...combined }));
  }, []);

  // Öğrenci ve personel birlikte yüklenir; ikisi de turnikeden geçer.
  useEffect(() => {
    let cancelled = false;

    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      try {
        const list = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const role = (data.role || '').toLowerCase();
          const staff = isStaffRole(role);
          const isParent = role === 'parent' || role === 'veli';
          const isStudent = role === 'student' || role === 'öğrenci' || (!staff && !isParent);

          list.push({
            id: docSnap.id,
            role: role || 'student',
            isStaff: staff,
            isParent,
            name: data.full_name || data.fullName || data.name || data.displayName
              || (staff ? 'İsimsiz Personel' : isParent ? 'İsimsiz Veli' : 'İsimsiz Öğrenci'),
            tc: data.tc_kimlik || data.tcKimlik || data.tc || '',
            schoolNumber: data.school_number || data.schoolNumber || '',
            group: staff
              ? (data.branch || data.department || 'Personel')
              : isParent
              ? (data.child_name ? `Veli (${data.child_name})` : 'Veli')
              : (data.branch || (data.class_id ? `${data.class_id}/${data.section || 'A'}` : 'Öğrenci')),
            profileImage: data.profile_image || data.profileImageUrl || data.profileImage || null
          });
        });

        list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
        if (!cancelled) {
          setPeople(list);
          setLoading(false);
        }
      } catch (err) {
        console.error('Kişi listesi okunamadı:', err);
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      try { unsub(); } catch { /* dinleyici kapalı */ }
    };
  }, []);

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = (d) => d === dateKey || d === todayStr || !d;

    const unsubFirestore = onSnapshot(collection(db, 'gate_status'), (snapshot) => {
      const map = {};
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data && isToday(data.date)) map[docSnap.id] = data;
      });
      statusFromFirestoreRef.current = map;
      mergeAndSetStatuses();
    }, (err) => console.warn('Firestore gate_status dinleyici:', err));

    const unsubRtdb = onValue(ref(rtdb, 'qr_system/gate_status'), (snapshot) => {
      const map = {};
      if (snapshot.exists()) {
        snapshot.forEach(child => {
          const data = child.val();
          if (data && isToday(data.date)) map[child.key] = data;
        });
      }
      statusFromRtdbRef.current = map;
      mergeAndSetStatuses();
    }, (err) => console.warn('RTDB gate_status dinleyici:', err));

    return () => {
      try { unsubFirestore(); } catch { /* kapalı */ }
      try { unsubRtdb(); } catch { /* kapalı */ }
    };
  }, [dateKey, mergeAndSetStatuses]);

  useEffect(() => {
    const unsub = subscribeLateApprovals(dateKey, (list) => {
      setLateRequests(prev => {
        if (list.length > prev.length) soundManager.playErrorBuzzer();
        return list;
      });
    });
    return () => { try { unsub(); } catch { /* kapalı */ } };
  }, [dateKey]);

  const handleAction = async (person) => {
    if (processingId) return;
    setProcessingId(person.id);

    const currentStatus = statusMap[person.id] || 'outside';
    const nextAction = currentStatus === 'inside' ? 'exit' : 'entry';
    const targetStatus = nextAction === 'entry' ? 'inside' : 'outside';

    // İyimser güncelleme: buton anında tepki versin.
    setStatusMap(prev => ({ ...prev, [person.id]: targetStatus }));
    statusFromFirestoreRef.current[person.id] = { status: nextAction, date: dateKey };
    statusFromRtdbRef.current[person.id] = { status: nextAction, date: dateKey };
    soundManager.playSuccessDing();

    try {
      const nowTime = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

      await Promise.all([
        setDoc(doc(db, 'gate_status', person.id), {
          status: nextAction,
          lastAction: nextAction,
          date: dateKey,
          time: nowTime,
          studentName: person.name,
          role: person.role,
          timestamp: serverTimestamp()
        }),
        update(ref(rtdb), {
          [`qr_system/gate_status/${person.id}`]: {
            status: nextAction,
            lastAction: nextAction,
            date: dateKey,
            time: nowTime,
            name: person.name,
            role: person.role,
            timestamp: rtdbServerTimestamp()
          }
        }),
        recordGatePassage({
          student: person,
          action: nextAction,
          method: 'manual_admin',
          isManualApproval: nextAction === 'entry',
          approvedBy: 'Görevli Öğretmen (Panel)',
          sessionId: 'manual_admin',
          config
        }).catch(e => console.warn('recordGatePassage log:', e))
      ]);

      flash('success', nextAction === 'entry'
        ? `${person.name} — kuruma giriş yaptı.`
        : `${person.name} — kurumdan çıkış yaptı.`);
    } catch (err) {
      console.error('Geçiş kaydedilemedi:', err);
      setStatusMap(prev => ({ ...prev, [person.id]: currentStatus }));
      flash('error', `Geçiş kaydedilemedi: ${err?.message || 'bağlantı hatası'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveLate = async (request) => {
    if (processingId) return;
    setProcessingId(request.studentId);
    try {
      await approveLateEntry({ request, approvedBy: 'Görevli Öğretmen (Panel)' });
      soundManager.playSuccessDing();
      flash('success', `${request.studentName} — geç girişi onaylandı.`);
    } catch (err) {
      console.error('Onay verilemedi:', err);
      flash('error', `Onay verilemedi: ${err?.message || 'bilinmeyen hata'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectLate = async (request) => {
    if (processingId) return;
    setProcessingId(request.studentId);
    try {
      await resolveLateApproval({ request, status: 'rejected', resolvedBy: 'Görevli Öğretmen (Panel)', dateKey });
      flash('success', `${request.studentName} — talep reddedildi.`);
    } catch (err) {
      flash('error', `Talep kapatılamadı: ${err?.message || 'bilinmeyen hata'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredPeople = useMemo(() => {
    const q = searchText.trim().toLocaleLowerCase('tr');
    return people.filter(p => {
      if (roleFilter === 'student' && (p.isStaff || p.isParent)) return false;
      if (roleFilter === 'staff' && !p.isStaff) return false;
      if (roleFilter === 'parent' && !p.isParent) return false;
      if (!q) return true;
      return (
        p.name.toLocaleLowerCase('tr').includes(q) ||
        (p.schoolNumber || '').includes(q) ||
        (p.tc || '').includes(q) ||
        (p.group || '').toLocaleLowerCase('tr').includes(q)
      );
    });
  }, [people, searchText, roleFilter]);

  const insideCount = useMemo(
    () => people.filter(p => statusMap[p.id] === 'inside').length,
    [people, statusMap]
  );

  if (loading) {
    return (
      <div className="w-full flex flex-col gap-5 animate-pulse">
        <div className="h-9 w-52 rounded-lg bg-slate-200/70 dark:bg-white/[0.06]" />
        <div className="h-[86px] rounded-xl bg-slate-200/50 dark:bg-white/[0.04]" />
        <div className="h-[380px] rounded-xl bg-slate-200/50 dark:bg-white/[0.04]" />
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-5 pb-2">
      <Toast open={toast.open} message={toast.message} tone={toast.tone} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[27px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
            Manuel Geçiş
          </h1>
          <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400 first-letter:uppercase">
            {currentDate} · karekod okutamayanlar için görevli öğretmen geçişi
          </p>
        </div>
        <Segmented value={roleFilter} onChange={setRoleFilter} options={ROLE_FILTERS} />
      </header>

      <StatStrip>
        <Stat label="Kurum içinde" value={insideCount} tone="success" />
        <Stat label="Kurum dışında" value={people.length - insideCount} />
        <Stat
          label="Onay bekleyen"
          value={lateRequests.length}
          tone={lateRequests.length > 0 ? 'danger' : 'default'}
          hint="geç giriş talebi"
        />
        <Stat label="Toplam kayıtlı" value={people.length} last />
      </StatStrip>

      {/* Rehberlik onayı bekleyen geç girişler */}
      {lateRequests.length > 0 && (
        <Panel>
          <PanelHeader
            title="Onay Bekleyen Geç Girişler"
            description="Rehberlik görüşmesi sonrası girişi siz onaylarsınız"
          >
            <span className="flex items-center gap-1.5 text-[11.5px] text-slate-500 dark:text-slate-400">
              <Dot tone="danger" />
              {lateRequests.length} talep
            </span>
          </PanelHeader>

          <div className={cx('divide-y', divider)}>
            {lateRequests.map(request => {
              const busy = processingId === request.studentId;
              return (
                <div
                  key={request.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3.5"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {request.studentPhoto ? (
                      <img
                        src={request.studentPhoto}
                        alt=""
                        referrerPolicy="no-referrer"
                        crossOrigin="anonymous"
                        className={cx('w-9 h-9 rounded-full object-cover shrink-0 border', hairline)}
                      />
                    ) : (
                      <div className={cx(
                        'w-9 h-9 rounded-full shrink-0 border flex items-center justify-center bg-slate-100 dark:bg-white/[0.06] text-slate-400',
                        hairline
                      )}>
                        <User size={16} strokeWidth={1.8} />
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="text-[13.5px] font-medium text-slate-900 dark:text-white truncate">
                        {request.studentName}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-slate-500 dark:text-slate-400">
                        <ShieldAlert size={12} className="shrink-0" />
                        <span className="truncate">
                          {request.session === 'afternoon' ? 'Öğleden sonra' : 'Sabah'} oturumu
                          {request.time ? ` · ${request.time}` : ''}
                          {Number.isFinite(request.lateByMinutes) ? ` · ${request.lateByMinutes} dk geç` : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      icon={busy ? RefreshCw : X}
                      onClick={() => handleRejectLate(request)}
                      disabled={busy}
                    >
                      Reddet
                    </Button>
                    <Button
                      variant="primary"
                      icon={busy ? RefreshCw : Check}
                      onClick={() => handleApproveLate(request)}
                      disabled={busy}
                    >
                      Girişi Onayla
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Kişi listesi */}
      <Panel>
        <div className={cx('px-5 py-3 border-b', hairline)}>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="İsim, sınıf (12B), branş, okul no veya TC ara"
              className="pl-9 pr-9"
            />
            {searchText && (
              <button
                onClick={() => setSearchText('')}
                aria-label="Aramayı temizle"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {filteredPeople.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Eşleşen kayıt yok"
            description="Arama metnini veya rol filtresini değiştirerek tekrar deneyin."
            action={
              searchText || roleFilter !== 'all' ? (
                <Button onClick={() => { setSearchText(''); setRoleFilter('all'); }}>
                  Filtreleri temizle
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="overflow-x-auto panel-scroll">
            <div className={ROW_MIN_WIDTH}>
              <div className={cx(ROW_GRID, 'px-5 py-2.5 border-b bg-slate-50/70 dark:bg-white/[0.02]', hairline)}>
                <span className={eyebrow}>Kişi</span>
                <span className={eyebrow}>Sınıf / Branş</span>
                <span className={eyebrow}>No</span>
                <span className={eyebrow}>Konum</span>
                <span className={cx(eyebrow, 'text-right')}>İşlem</span>
              </div>

              <div className={cx('divide-y', divider)}>
                {filteredPeople.map((person) => {
                  const isInside = statusMap[person.id] === 'inside';
                  const isProcessing = processingId === person.id;
                  const hasPendingRequest = lateRequests.some(r => r.studentId === person.id);

                  return (
                    <div
                      key={person.id}
                      className={cx(
                        ROW_GRID,
                        'px-5 py-2.5 transition-colors',
                        hasPendingRequest
                          ? 'bg-amber-50/60 dark:bg-amber-500/[0.06]'
                          : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {person.profileImage ? (
                          <img
                            src={person.profileImage}
                            alt=""
                            referrerPolicy="no-referrer"
                            crossOrigin="anonymous"
                            className={cx('w-8 h-8 rounded-full object-cover shrink-0 border', hairline)}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              if (e.currentTarget.nextSibling) e.currentTarget.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div className={cx(
                          'w-8 h-8 rounded-full shrink-0 border items-center justify-center bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-slate-500',
                          hairline,
                          person.profileImage ? 'hidden' : 'flex'
                        )}>
                          <User size={15} strokeWidth={1.8} />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[13.5px] font-medium text-slate-900 dark:text-white truncate">
                              {person.name}
                            </span>
                            {person.isStaff && <Badge tone="neutral">Personel</Badge>}
                            {hasPendingRequest && <Badge tone="warning">Onay bekliyor</Badge>}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 tnum truncate">
                            {person.tc || '—'}
                          </div>
                        </div>
                      </div>

                      <span className="text-[12.5px] text-slate-600 dark:text-slate-300 truncate">
                        {person.group || '—'}
                      </span>

                      <span className="text-[12.5px] text-slate-600 dark:text-slate-300 tnum">
                        {person.schoolNumber || '—'}
                      </span>

                      <span>
                        <Badge tone={isInside ? 'success' : 'neutral'}>
                          {isInside ? 'Kurum içinde' : 'Kurum dışında'}
                        </Badge>
                      </span>

                      <div className="flex justify-end">
                        <Button
                          onClick={() => handleAction(person)}
                          disabled={isProcessing}
                          variant={isInside ? 'secondary' : 'primary'}
                          icon={isProcessing ? RefreshCw : isInside ? LogOut : LogIn}
                          className="w-[112px]"
                        >
                          {isProcessing ? '…' : isInside ? 'Çıkış' : 'Giriş'}
                        </Button>
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

export default StudentGateAdminView;
