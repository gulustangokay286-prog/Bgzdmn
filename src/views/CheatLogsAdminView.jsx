import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  X,
  ArrowRight,
  ChevronDown,
  ShieldAlert,
  ShieldCheck,
  UserX,
  Trash2,
  Clock,
  AlertCircle
} from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, query, orderBy, limit, onSnapshot, getDocs, deleteDoc } from 'firebase/firestore';
import { firebaseService } from '../services/firebase';
import {
  Panel,
  PanelHeader,
  StatStrip,
  Stat,
  Button,
  IconButton,
  Badge,
  Dot,
  EmptyState,
  Input
} from '../components/ui/panel';
import { cx, eyebrow, hairline, divider } from '../components/ui/tokens';

const getInitials = (name = '') => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return '—';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const formatDate = (timestamp) => {
  if (!timestamp) return '—';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatShortDate = (timestamp) => {
  if (!timestamp) return '—';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const optimizePhotoUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  if (url.includes('cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', '/upload/f_auto,q_auto,w_400,c_limit/');
  }
  return url;
};

const CheatLogsAdminView = () => {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const fetchedUsers = await firebaseService.fetchAllUsers();
        setUsers(fetchedUsers || []);
      } catch (err) {
        console.error('Kullanıcılar çekilemedi:', err);
      }
    };
    fetchUsers();

    const q = query(collection(db, 'security_logs'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs
          .map((d) => ({
            id: d.id,
            ...d.data()
          }))
          .filter((log) => log.type === 'cheat_attempt');
        setLogs(data);
        setLoading(false);
      },
      (err) => {
        console.error('Güvenlik logları dinleme hatası:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const findUserByTc = useCallback(
    (tc) => {
      if (!tc) return null;
      return (
        users.find(
          (u) =>
            u.fields?.tc_kimlik?.stringValue === tc ||
            u.fields?.tcKimlik?.stringValue === tc ||
            u.tcKimlik === tc
        ) || null
      );
    },
    [users]
  );

  const getUserNameByTc = useCallback(
    (tc) => {
      const user = findUserByTc(tc);
      if (user) {
        const fullName =
          user.fields?.full_name?.stringValue ||
          user.fields?.fullName?.stringValue ||
          user.fields?.name?.stringValue ||
          user.name ||
          '';
        return fullName.trim().length > 0 ? fullName : null;
      }
      return null;
    },
    [findUserByTc]
  );

  const getUserPhotoByTc = useCallback(
    (tc) => {
      const user = findUserByTc(tc);
      if (user) {
        const photo =
          user.fields?.profile_image?.stringValue ||
          user.fields?.profileImageUrl?.stringValue ||
          user.profileImage ||
          null;
        return optimizePhotoUrl(photo);
      }
      return null;
    },
    [findUserByTc]
  );

  const groupedLogs = useMemo(() => {
    const logsWithNames = logs.map((log) => {
      const origName = getUserNameByTc(log.originalOwnerTc) || log.originalOwnerName;
      const attName = getUserNameByTc(log.attemptedStudentTc) || log.attemptedStudentName;
      const origPhoto = getUserPhotoByTc(log.originalOwnerTc);
      const attPhoto = getUserPhotoByTc(log.attemptedStudentTc);
      return { ...log, computedOrigName: origName, computedAttName: attName, origPhoto, attPhoto };
    });

    const queryStr = searchTerm.trim().toLowerCase();
    const filtered = logsWithNames.filter((log) => {
      if (!queryStr) return true;
      return (
        (log.message || '').toLowerCase().includes(queryStr) ||
        (log.computedOrigName || '').toLowerCase().includes(queryStr) ||
        (log.computedAttName || '').toLowerCase().includes(queryStr) ||
        (log.originalOwnerTc || '').includes(queryStr) ||
        (log.attemptedStudentTc || '').includes(queryStr)
      );
    });

    const map = new Map();
    filtered.forEach((log) => {
      const key = `${log.originalOwnerTc || '?'}_${log.attemptedStudentTc || '?'}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          originalOwnerTc: log.originalOwnerTc,
          attemptedStudentTc: log.attemptedStudentTc,
          computedOrigName: log.computedOrigName,
          computedAttName: log.computedAttName,
          origPhoto: log.origPhoto,
          attPhoto: log.attPhoto,
          entries: []
        });
      }
      map.get(key).entries.push(log);
    });

    return Array.from(map.values()).sort((a, b) => {
      const aTime = a.entries[0]?.timestamp?.toDate?.() || new Date(a.entries[0]?.timestamp || 0);
      const bTime = b.entries[0]?.timestamp?.toDate?.() || new Date(b.entries[0]?.timestamp || 0);
      return bTime - aTime;
    });
  }, [logs, searchTerm, getUserNameByTc, getUserPhotoByTc]);

  const totalViolations = useMemo(
    () => groupedLogs.reduce((sum, g) => sum + g.entries.length, 0),
    [groupedLogs]
  );

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Tüm güvenlik ihlali kayıtları veritabanından kalıcı olarak silinecektir. Emin misiniz?')) {
      return;
    }
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'security_logs'));
      for (const d of snap.docs) {
        await deleteDoc(d.ref).catch(() => {});
      }
      setLogs([]);
    } catch (e) {
      console.error('Silme hatası:', e);
      alert('İhlal kayıtları silinirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const latestViolationTime = useMemo(() => {
    if (!groupedLogs[0]?.entries[0]?.timestamp) return '—';
    return formatShortDate(groupedLogs[0].entries[0].timestamp);
  }, [groupedLogs]);

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
            İhlal Tespitleri
          </h1>
          <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400 first-letter:uppercase">
            Güvenlik denetimi ve QR kod suiistimal kayıtları · {today}
          </p>
        </div>
      </header>

      <StatStrip>
        <Stat
          label="Toplam İhlal Sayısı"
          value={totalViolations}
          hint={totalViolations > 0 ? 'Tespit edilen usulsüz okutma' : 'Kayıt bulunmuyor'}
          tone={totalViolations > 0 ? 'danger' : 'default'}
        />
        <Stat
          label="Etkilenen Öğrenci Çifti"
          value={groupedLogs.length}
          hint="Farklı kart-öğrenci eşleşmesi"
          tone={groupedLogs.length > 0 ? 'danger' : 'default'}
        />
        <Stat
          label="Son İhlal Zamanı"
          value={latestViolationTime}
          hint="En son şüpheli okutma"
        />
        <Stat
          label="Sistem Güvenlik Durumu"
          value={totalViolations === 0 ? 'Güvenli' : 'İnceleme Gerekli'}
          hint={totalViolations === 0 ? 'Anormal işlem tespit edilmedi' : 'Aktif suiistimal tespitleri'}
          tone={totalViolations === 0 ? 'success' : 'danger'}
          last
        />
      </StatStrip>

      <Panel>
        <PanelHeader
          title="Tespit Edilen Güvenlik İhlalleri"
          description="Başka bir öğrenciye ait QR kod ile yetkisiz giriş ve yoklama teşebbüsleri"
        >
          <div className="flex items-center gap-2 mr-[60px]">
            <div className="relative w-[250px] max-w-full">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <Input
                type="text"
                placeholder="İsim veya TC kimlik no ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-9 h-8 text-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  aria-label="Aramayı Temizle"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {logs.length > 0 && (
              <Button
                variant="secondary"
                icon={Trash2}
                onClick={handleClearLogs}
                className="h-8 px-3 text-xs text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/40 hover:bg-rose-50 dark:hover:bg-rose-950/30 shrink-0"
              >
                Kayıtları Temizle
              </Button>
            )}

            {totalViolations > 0 && (
              <Badge tone="danger" className="shrink-0">{totalViolations} İhlal Kaydı</Badge>
            )}
          </div>
        </PanelHeader>

        {loading ? (
          <div className={cx('divide-y', divider)}>
            {[0, 1, 2].map((n) => (
              <div key={n} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="w-10 h-10 rounded-lg bg-slate-200/70 dark:bg-white/[0.06]" />
                <div className="flex-1 h-4 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
                <div className="w-24 h-4 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
              </div>
            ))}
          </div>
        ) : groupedLogs.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={searchTerm ? 'Aramaya uygun ihlal kaydı bulunamadı' : 'Hiç İhlal Girişi Bulunamadı'}
            description={
              searchTerm
                ? 'Farklı bir isim veya TC kimlik numarası ile aramayı deneyebilirsiniz.'
                : 'Sistem şu anda tamamen güvenli. Herhangi bir yetkisiz QR kod okutma veya paylaşım teşebbüsü bulunmuyor.'
            }
            action={
              searchTerm ? (
                <Button onClick={() => setSearchTerm('')}>Aramayı Sıfırla</Button>
              ) : null
            }
          />
        ) : (
          <div className={cx('divide-y', divider)}>
            {groupedLogs.map((group) => {
              const isExpanded = Boolean(expandedGroups[group.key]);
              const count = group.entries.length;
              const latest = group.entries[0];
              const origInitial = getInitials(group.computedOrigName || 'Bilinmiyor');
              const attInitial = getInitials(group.computedAttName || 'Bilinmiyor');

              return (
                <div key={group.key} className="transition-colors">
                  
                  <div
                    onClick={() => toggleGroup(group.key)}
                    className={cx(
                      'flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-3.5 cursor-pointer select-none transition-colors',
                      isExpanded
                        ? 'bg-slate-50/90 dark:bg-white/[0.03]'
                        : 'hover:bg-slate-50/60 dark:hover:bg-white/[0.02]'
                    )}
                  >
                    
                    <div className="flex items-center gap-4 min-w-0">
                      
                      <div className="flex items-center -space-x-2 shrink-0">
                        {group.origPhoto ? (
                          <img
                            src={group.origPhoto}
                            alt=""
                            className="w-8 h-8 rounded-lg object-cover border border-white dark:border-[#0f172a] shadow-xs z-10"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/[0.08] border border-white dark:border-[#0f172a] flex items-center justify-center text-[11px] font-semibold text-slate-700 dark:text-slate-300 z-10 tnum">
                            {origInitial}
                          </div>
                        )}

                        {group.attPhoto ? (
                          <img
                            src={group.attPhoto}
                            alt=""
                            className="w-8 h-8 rounded-lg object-cover border border-white dark:border-[#0f172a] shadow-xs"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-500/20 border border-white dark:border-[#0f172a] flex items-center justify-center text-[11px] font-semibold text-[#991b1b] dark:text-rose-400 tnum">
                            {attInitial}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[13.5px]">
                          <span className="font-medium text-slate-900 dark:text-white truncate">
                            {group.computedOrigName || 'Bilinmeyen Öğrenci'}
                          </span>
                          <ArrowRight size={13} className="text-slate-400 shrink-0" strokeWidth={2} />
                          <span className="font-medium text-[#991b1b] dark:text-rose-400 truncate">
                            {group.computedAttName || 'Bilinmeyen Kişi'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-slate-400 dark:text-slate-500 tnum">
                          <span>TC {group.originalOwnerTc || '—'}</span>
                          <span>→</span>
                          <span>TC {group.attemptedStudentTc || '—'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                      <Badge tone="danger">
                        {count > 1 ? `${count} İhlal` : '1 İhlal'}
                      </Badge>
                      <span className="text-[12px] text-slate-500 dark:text-slate-400 tnum whitespace-nowrap">
                        {formatShortDate(latest?.timestamp)}
                      </span>
                      <ChevronDown
                        size={15}
                        className={cx(
                          'text-slate-400 transition-transform duration-200 shrink-0',
                          isExpanded && 'rotate-180'
                        )}
                      />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className={cx('px-5 py-4 border-t bg-slate-50/40 dark:bg-white/[0.01]', hairline)}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        
                        <div className={cx('p-4 rounded-xl border bg-white dark:bg-[#0f172a]', hairline)}>
                          <div className="flex items-center gap-3.5">
                            {group.origPhoto ? (
                              <img
                                src={group.origPhoto}
                                alt=""
                                className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-white/10 shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 flex items-center justify-center text-[15px] font-semibold text-slate-700 dark:text-slate-300 shrink-0 tnum">
                                {origInitial}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <span className={eyebrow}>Asıl Kart Sahibi</span>
                              <div className="text-[14.5px] font-semibold text-slate-900 dark:text-white truncate mt-0.5">
                                {group.computedOrigName || 'Bilinmiyor'}
                              </div>
                              <div className="text-[12px] text-slate-500 dark:text-slate-400 tnum mt-0.5">
                                TC: {group.originalOwnerTc || '—'}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/5 flex items-center gap-1.5 text-[11.5px] text-slate-600 dark:text-slate-300">
                            <AlertCircle size={13} className="text-amber-500 shrink-0" />
                            <span>Kendi QR kodunu yetkisiz kişiyle paylaştığı tespit edildi.</span>
                          </div>
                        </div>

                        <div className={cx('p-4 rounded-xl border bg-white dark:bg-[#0f172a]', hairline)}>
                          <div className="flex items-center gap-3.5">
                            {group.attPhoto ? (
                              <img
                                src={group.attPhoto}
                                alt=""
                                className="w-12 h-12 rounded-xl object-cover border border-rose-200 dark:border-rose-900/40 shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-900/40 flex items-center justify-center text-[15px] font-semibold text-[#991b1b] dark:text-rose-400 shrink-0 tnum">
                                {attInitial}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <span className={eyebrow}>Yetkisiz Okutan Kişi</span>
                              <div className="text-[14.5px] font-semibold text-[#991b1b] dark:text-rose-400 truncate mt-0.5">
                                {group.computedAttName || 'Bilinmiyor'}
                              </div>
                              <div className="text-[12px] text-slate-500 dark:text-slate-400 tnum mt-0.5">
                                TC: {group.attemptedStudentTc || '—'}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/5 flex items-center gap-1.5 text-[11.5px] text-rose-700 dark:text-rose-300">
                            <UserX size={13} className="text-rose-600 shrink-0" />
                            <span>Başkasına ait QR kod ile kapıdan/turnikeden geçiş yapmaya teşebbüs etti.</span>
                          </div>
                        </div>
                      </div>

                      <div className={cx('rounded-xl border overflow-hidden bg-white dark:bg-[#0f172a]', hairline)}>
                        <div className={cx('flex items-center justify-between px-4 py-2 border-b bg-slate-50/70 dark:bg-white/[0.02]', hairline)}>
                          <span className={eyebrow}>Tespit Geçmişi ({count} İşlem)</span>
                          <span className="text-[11.5px] text-slate-400 dark:text-slate-500 tnum">
                            En Son: {formatShortDate(latest?.timestamp)}
                          </span>
                        </div>
                        <div className={cx('divide-y', divider)}>
                          {group.entries.map((entry) => (
                            <div key={entry.id} className="flex items-center justify-between px-4 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <Dot tone="danger" />
                                <span className="text-[12.5px] text-slate-700 dark:text-slate-200 font-medium tnum">
                                  {formatDate(entry.timestamp)}
                                </span>
                              </div>
                              <Badge tone="danger">Usulsüz Okutma</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
};

export default CheatLogsAdminView;
