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

import { vdsUserService } from '../services/vdsUserService';
import { io } from 'socket.io-client';
import { VDS_BASE_URL, VDS_SOCKET_URL } from '../services/vdsConfig';

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
  const [loading, setLoading] = useState(() => !(vdsUserService.users && vdsUserService.users.length > 0));
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
      Object.entries(source || {}).forEach(([k, v]) => {
        if (v?.status === 'entry' || v?.status === 'inside' || v?.status === 'present') combined[k] = 'inside';
        else if (v?.status === 'exit' || v?.status === 'outside') combined[k] = 'outside';
      });
    };
    apply(statusFromFirestoreRef.current);
    apply(statusFromRtdbRef.current);
    setStatusMap(prev => ({ ...prev, ...combined }));
  }, []);

  // VDS Kullanıcı Listesi Dinleyicisi
  useEffect(() => {
    let cancelled = false;

    const safetyTimer = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 2500);

    const unsub = vdsUserService.subscribe((userList) => {
      try {
        const rawList = (userList || []).map((data) => {
          if (!data) return null;
          const role = (data.role || data.fields?.role?.stringValue || '').toLowerCase();
          const staff = isStaffRole(role);
          const isParent = role === 'parent' || role === 'veli';

          const resolvedName = (
            data.full_name ||
            data.fullName ||
            data.displayName ||
            (typeof data.name === 'string' && !data.name.startsWith('projects/') ? data.name : '') ||
            data.fields?.full_name?.stringValue ||
            data.fields?.fullName?.stringValue ||
            data.fields?.displayName?.stringValue ||
            (data.fields?.name?.stringValue && !data.fields.name.stringValue.startsWith('projects/') ? data.fields.name.stringValue : '') ||
            (data.first_name ? `${data.first_name} ${data.last_name || ''}`.trim() : '') ||
            ''
          ).trim() || (staff ? 'İsimsiz Personel' : isParent ? 'İsimsiz Veli' : 'İsimsiz Öğrenci');

          const id = String(data.id || data._id || data.canonical_id || data.firebase_uid ||
            (typeof data.name === 'string' && data.name.startsWith('projects/') ? data.name.split('/').pop() : '') ||
            '').trim() || String(Math.random());

          const aliases = Array.from(new Set([
            ...(Array.isArray(data.aliases) ? data.aliases : []),
            id,
            data._id,
            data.id,
            data.canonical_id,
            data.firebase_uid
          ].filter(Boolean)));

          const tc = (data.tc_kimlik || data.tcKimlik || data.tc || data.fields?.tc_kimlik?.stringValue || '').trim();
          const schoolNumber = (data.school_number || data.schoolNumber || data.fields?.school_number?.stringValue || '').trim();
          const branch = (data.branch || data.class_id || data.fields?.branch?.stringValue || data.fields?.class_id?.stringValue || '').trim();

          return {
            id,
            aliases,
            role: role || 'student',
            isStaff: staff,
            isParent,
            name: resolvedName,
            tc,
            schoolNumber,
            group: staff
              ? (data.branch || data.department || data.fields?.branch?.stringValue || 'Personel')
              : isParent
              ? (data.child_name || data.fields?.child_name?.stringValue ? `Veli (${data.child_name || data.fields?.child_name?.stringValue})` : 'Veli')
              : (branch || (data.class_id ? `${data.class_id}/${data.section || 'A'}` : data.fields?.branch?.stringValue || 'Öğrenci')),
            profileImage: data.profile_image || data.profileImageUrl || data.profileImage || null
          };
        }).filter(Boolean);

        // Kesin tekilleştirme: TC, okul no veya (isim+rol) bazında tekil kayıt
        const seen = new Set();
        const list = [];
        for (const p of rawList) {
          if (!p) continue;
          if (p.role === 'patron' || (p.name && p.name.toLowerCase().includes('patron')) || p.name === 'Super Admin') continue;

          const tc = (p.tc || '').trim();
          const sch = (p.schoolNumber || '').trim();
          const nm = (p.name || '').trim().toLowerCase();
          const key = tc && tc.length >= 10 ? `tc:${tc}` : (sch && !p.isStaff ? `sch:${sch}` : `nm:${nm}_${p.role}`);
          if (!seen.has(key)) {
            seen.add(key);
            list.push(p);
          } else {
            const existing = list.find(x => {
              const xTc = (x.tc || '').trim();
              const xSch = (x.schoolNumber || '').trim();
              const xNm = (x.name || '').trim().toLowerCase();
              const xKey = xTc && xTc.length >= 10 ? `tc:${xTc}` : (xSch && !x.isStaff ? `sch:${xSch}` : `nm:${xNm}_${x.role}`);
              return xKey === key;
            });
            if (existing) {
              const combined = new Set([...(existing.aliases || []), ...(p.aliases || []), p.id]);
              existing.aliases = [...combined];
            }
          }
        }

        list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));
        if (!cancelled) {
          setPeople(list);
          setLoading(false);
        }
      } catch (err) {
        console.error('VDS Kişi listesi okunamadı:', err);
        if (!cancelled) setLoading(false);
      }
    });

    vdsUserService.fetchAllUsers().catch(() => {});

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      try { unsub(); } catch { /* dinleyici kapalı */ }
    };
  }, []);

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = (d) => d === dateKey || d === todayStr || !d;

    // VDS Turnike Durumlarını Çek
    const fetchVdsGateStatus = async () => {
      try {
        const res = await fetch(`${VDS_BASE_URL}/api/gate-status`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.map) {
            const vdsMap = {};
            Object.entries(data.map).forEach(([k, v]) => {
              vdsMap[k] = v?.status || (v === 'entry' || v === 'inside' ? 'inside' : 'outside');
            });
            setStatusMap(prev => ({ ...prev, ...vdsMap }));
          }
        }
      } catch (err) {
        console.warn('VDS gate-status notice:', err?.message);
      }
    };
    fetchVdsGateStatus();

    // VDS Socket.io Canlı Güncelleme
    const socket = io(VDS_SOCKET_URL || VDS_BASE_URL || window.location.origin, {
      reconnectionAttempts: 15,
      timeout: 5000
    });

    socket.on('gate_status_updated', ({ studentId, aliases, targetState, status }) => {
      const finalState = targetState || (status === 'entry' ? 'inside' : 'outside');
      const allIds = aliases || [studentId].filter(Boolean);
      setStatusMap(prev => {
        const next = { ...prev };
        allIds.forEach(id => { next[id] = finalState; });
        return next;
      });
    });

    socket.on('new_scan', (data) => {
      const finalState = (data.action === 'entry' || data.status === 'entry') ? 'inside' : 'outside';
      const allIds = data.aliases || [data.studentId, data.userId].filter(Boolean);
      setStatusMap(prev => {
        const next = { ...prev };
        allIds.forEach(id => { next[id] = finalState; });
        return next;
      });
    });

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
      try { socket.disconnect(); } catch { /* kapalı */ }
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

  const getPersonStatus = useCallback((person) => {
    if (!person) return 'outside';
    if (statusMap[person.id]) return statusMap[person.id];
    if (Array.isArray(person.aliases)) {
      for (const a of person.aliases) {
        if (statusMap[a]) return statusMap[a];
      }
    }
    if (person.tc && statusMap[person.tc]) return statusMap[person.tc];
    if (person.schoolNumber && statusMap[person.schoolNumber]) return statusMap[person.schoolNumber];
    return 'outside';
  }, [statusMap]);

  const handleAction = async (person) => {
    if (processingId) return;
    setProcessingId(person.id);

    const currentStatus = getPersonStatus(person);
    const nextAction = currentStatus === 'inside' ? 'exit' : 'entry';
    const targetStatus = nextAction === 'entry' ? 'inside' : 'outside';

    // İyimser anında arayüz tepkisi (tüm alias'ları da güncelle)
    setStatusMap(prev => {
      const next = { ...prev, [person.id]: targetStatus };
      if (Array.isArray(person.aliases)) {
        person.aliases.forEach(a => { next[a] = targetStatus; });
      }
      return next;
    });
    soundManager.playSuccessDing();

    try {
      const nowTime = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

      // 1. VDS Kaydı (erişilebiliyorsa)
      fetch(`${VDS_BASE_URL}/api/attendance/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: person.id,
          aliases: person.aliases,
          action: nextAction,
          studentName: person.name,
          role: person.role || (person.isStaff ? 'teacher' : 'student'),
          schoolNumber: person.schoolNumber,
          tc: person.tc,
          method: 'manual_admin'
        })
      }).catch(e => console.warn('VDS manual attendance log:', e?.message));

      // 2. Firestore ve RTDB birincil garantili kayıt (web ve diğer cihazlarda asla aksamaz)
      const writePromises = [
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
        }).catch(() => {})
      ];

      if (Array.isArray(person.aliases)) {
        person.aliases.forEach(aliasId => {
          if (aliasId && aliasId !== person.id) {
            writePromises.push(
              setDoc(doc(db, 'gate_status', aliasId), {
                status: nextAction,
                lastAction: nextAction,
                date: dateKey,
                time: nowTime,
                studentName: person.name,
                role: person.role,
                timestamp: serverTimestamp()
              }).catch(() => {})
            );
          }
        });
      }

      await Promise.all(writePromises);

      flash('success', nextAction === 'entry'
        ? `${person.name} — kuruma giriş yaptı (Rapor güncellendi).`
        : `${person.name} — kurumdan çıkış yaptı (Rapor güncellendi).`);
    } catch (err) {
      console.error('Geçiş kaydedilemedi:', err);
      setStatusMap(prev => {
        const next = { ...prev, [person.id]: currentStatus };
        if (Array.isArray(person.aliases)) {
          person.aliases.forEach(a => { next[a] = currentStatus; });
        }
        return next;
      });
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
    const q = (searchText || '').trim().toLocaleLowerCase('tr');
    return people.filter(p => {
      if (!p) return false;
      if (roleFilter === 'student' && (p.isStaff || p.isParent)) return false;
      if (roleFilter === 'staff' && !p.isStaff) return false;
      if (roleFilter === 'parent' && !p.isParent) return false;
      if (!q) return true;
      const pName = String(p.name || '').toLocaleLowerCase('tr');
      const pSch = String(p.schoolNumber || '');
      const pTc = String(p.tc || '');
      const pGroup = String(p.group || '').toLocaleLowerCase('tr');
      return (
        pName.includes(q) ||
        pSch.includes(q) ||
        pTc.includes(q) ||
        pGroup.includes(q)
      );
    });
  }, [people, searchText, roleFilter]);

  const insideCount = useMemo(
    () => people.filter(p => getPersonStatus(p) === 'inside').length,
    [people, getPersonStatus]
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
                  const isInside = getPersonStatus(person) === 'inside';
                  const isProcessing = processingId === person.id;
                  const hasPendingRequest = lateRequests.some(r => r.studentId === person.id || (Array.isArray(person.aliases) && person.aliases.includes(r.studentId)));

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
