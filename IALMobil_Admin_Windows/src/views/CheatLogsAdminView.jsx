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
  AlertCircle,
  Radio,
  Unlock,
  RefreshCw,
  Smartphone,
  DoorClosed,
  EyeOff,
  AlertTriangle,
  Flame
} from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, query, orderBy, limit, onSnapshot, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { io } from 'socket.io-client';
import { soundManager } from '../services/soundManager';
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
  Input,
  Segmented
} from '../components/ui/panel';
import { cx, eyebrow, hairline, divider } from '../components/ui/tokens';

const toMillis = (timestamp) => {
  if (timestamp?.seconds) return timestamp.seconds * 1000;
  if (timestamp?.toDate) return timestamp.toDate().getTime();
  if (typeof timestamp === 'number') return timestamp;
  if (typeof timestamp === 'string') {
    const t = new Date(timestamp).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
};

const formatDate = (timestamp) => {
  const ms = toMillis(timestamp);
  if (!ms) return '—';
  return new Date(ms).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const FILTER_TABS = [
  { id: 'all', label: 'Tüm İhlaller' },
  { id: 'device', label: 'Cihaz & Gizli Sekme' },
  { id: 'gate', label: 'Kaçış & Turnike' },
  { id: 'qr_swap', label: 'QR Paylaşımı' }
];

const CheatLogsAdminView = () => {
  const [logs, setLogs] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [vdsConnected, setVdsConnected] = useState(false);
  const [unlockingId, setUnlockingId] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (text) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Fetch Users directly with Firestore SDK
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const map = {};
        snap.forEach((d) => {
          const data = d.data();
          const id = d.id;
          const tc = String(data.tc_kimlik || data.tc || data.tcNo || data.identityNumber || '').trim();
          const name = data.full_name || data.fullName || data.name || data.displayName || 'İsimsiz Kişi';
          const photo = data.profile_image || data.profileImageUrl || data.profileImage || null;
          const branch = data.branch || (data.class_id ? `${data.class_id}/${data.section || 'A'}` : '');
          const role = String(data.role || data.user_type || 'student').toLowerCase();
          const obj = { id, name, photo, tc, branch, role };
          map[id] = obj;
          if (tc) map[tc] = obj;
        });
        setUsersMap(map);
      } catch (err) {
        console.error('Kullanıcılar çekilemedi:', err);
      }
    };
    fetchUsers();
  }, []);

  // 2. Real-time Firestore Security Logs Listener
  useEffect(() => {
    const q = query(collection(db, 'security_logs'), orderBy('timestamp', 'desc'), limit(150));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data()
        }));
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

  // 3. VDS Real-time Socket Connection (213.142.159.36:8080)
  useEffect(() => {
    const socket = io('http://213.142.159.36:8080', {
      reconnectionAttempts: 10,
      timeout: 5000
    });

    socket.on('connect', () => {
      setVdsConnected(true);
    });

    socket.on('disconnect', () => {
      setVdsConnected(false);
    });

    socket.on('cheat_detected', (newViolation) => {
      setLogs((prev) => [newViolation, ...prev.filter((l) => l.id !== newViolation.id)]);
      soundManager.playErrorTone?.();
      showToast(`🚨 Canlı İhlal Uyarısı: ${newViolation.title || 'Yeni İhlal'} (${newViolation.studentName || 'Öğrenci'})`);
    });

    socket.on('security_alert', (newViolation) => {
      setLogs((prev) => [newViolation, ...prev.filter((l) => l.id !== newViolation.id)]);
      soundManager.playErrorTone?.();
    });

    return () => socket.disconnect();
  }, []);

  // Unlock Student Device
  const handleUnlockStudent = async (studentId, studentName) => {
    if (!studentId) return;
    setUnlockingId(studentId);
    try {
      const todayStr = new Date().toLocaleDateString('en-CA');
      await deleteDoc(doc(db, 'student_daily_locks', `${todayStr}_${studentId}`)).catch(() => {});
      showToast(`✅ ${studentName || 'Öğrenci'} cihaz kilidi kaldırıldı. Tekrar QR okutabilir.`);
    } catch (e) {
      showToast(`❌ Kilit kaldırılamadı: ${e.message}`);
    } finally {
      setUnlockingId(null);
    }
  };

  // Clear Logs
  const handleClearLogs = async () => {
    if (!window.confirm('Tüm güvenlik ihlali kayıtları silinecektir. Emin misiniz?')) {
      return;
    }
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'security_logs'));
      for (const d of snap.docs) {
        await deleteDoc(d.ref).catch(() => {});
      }
      setLogs([]);
      showToast('Tüm ihlal kayıtları temizlendi.');
    } catch (e) {
      console.error('Silme hatası:', e);
      alert('İhlal kayıtları silinirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  // Filter & Search Logic
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const type = (log.type || '').toLowerCase();

      // Tab filter
      if (selectedFilter === 'device') {
        if (!['student_multidevice_cheat', 'incognito_blocked'].includes(type)) return false;
      } else if (selectedFilter === 'gate') {
        if (!['unauthorized_exit_attempt', 'gate_spam_blocked', 'late_arrival'].includes(type)) return false;
      } else if (selectedFilter === 'qr_swap') {
        if (!['cheat_attempt'].includes(type)) return false;
      }

      // Search filter
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      const sName = (log.studentName || log.userName || usersMap[log.studentId]?.name || '').toLowerCase();
      const sTc = (log.studentTc || log.tc || '').toLowerCase();
      const msg = (log.message || log.title || '').toLowerCase();

      return sName.includes(q) || sTc.includes(q) || msg.includes(q) || type.includes(q);
    });
  }, [logs, selectedFilter, searchTerm, usersMap]);

  // Statistics
  const deviceCheatCount = useMemo(() => logs.filter((l) => ['student_multidevice_cheat', 'incognito_blocked'].includes(l.type)).length, [logs]);
  const gateViolationCount = useMemo(() => logs.filter((l) => ['unauthorized_exit_attempt', 'gate_spam_blocked'].includes(l.type)).length, [logs]);
  const qrSwapCount = useMemo(() => logs.filter((l) => l.type === 'cheat_attempt').length, [logs]);

  const getViolationBadge = (type) => {
    switch (type) {
      case 'student_multidevice_cheat':
        return { label: 'Çoklu Cihaz / Çift Telefon', icon: Smartphone, tone: 'danger' };
      case 'incognito_blocked':
        return { label: 'Gizli Sekme Kullanımı', icon: EyeOff, tone: 'warning' };
      case 'unauthorized_exit_attempt':
        return { label: 'Ders Saatinde Kaçış Teşebbüsü', icon: DoorClosed, tone: 'danger' };
      case 'gate_spam_blocked':
        return { label: 'Turnike Spam / Cooldown', icon: AlertTriangle, tone: 'warning' };
      case 'cheat_attempt':
        return { label: 'QR Paylaşımı / Sahtecilik', icon: Flame, tone: 'danger' };
      default:
        return { label: 'Güvenlik İhlali', icon: ShieldAlert, tone: 'neutral' };
    }
  };

  const today = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="w-full flex flex-col gap-5 pb-6">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 px-5 py-3 rounded-2xl bg-slate-900 text-white text-[13px] font-bold shadow-2xl border border-white/10 animate-in fade-in slide-in-from-top-3 flex items-center gap-2.5">
          <AlertCircle size={16} className="text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="m-0 text-[27px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
              İhlal & Güvenlik Takibi
            </h1>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold border ${
              vdsConnected
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
            }`}>
              <Radio size={12} className={vdsConnected ? 'text-emerald-500 animate-pulse' : 'text-amber-500'} />
              {vdsConnected ? 'VDS Canlı Güvenlik Motoru Aktif' : 'VDS Bağlantısı Kuruluyor...'}
            </span>
          </div>
          <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400">
            VDS Turnike Denetleyicisi ve Anlık Suiistimal Alarmları · {today}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="danger"
            size="sm"
            onClick={handleClearLogs}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5"
          >
            <Trash2 size={14} />
            Kayıtları Temizle
          </Button>
        </div>
      </header>

      {/* Stats */}
      <StatStrip>
        <Stat
          label="Toplam İhlal Sayısı"
          value={logs.length}
          hint={logs.length > 0 ? 'Kayıtlı güvenlik ihlali' : 'Sistem temiz'}
          tone={logs.length > 0 ? 'danger' : 'default'}
        />
        <Stat
          label="Cihaz & Gizli Sekme"
          value={deviceCheatCount}
          hint="Çift cihaz ve gizli tarayıcı"
          tone={deviceCheatCount > 0 ? 'danger' : 'default'}
        />
        <Stat
          label="Kaçış & Turnike Spamı"
          value={gateViolationCount}
          hint="Ders saati çıkış ve spam"
          tone={gateViolationCount > 0 ? 'danger' : 'default'}
        />
        <Stat
          label="QR Paylaşımı"
          value={qrSwapCount}
          hint="Mükerrer veya takas QR"
          tone={qrSwapCount > 0 ? 'danger' : 'default'}
          last
        />
      </StatStrip>

      {/* Main Panel */}
      <Panel>
        <PanelHeader
          title="Güvenlik İhlali ve Usulsüzlük Kayıtları"
          description="Çift cihaz kullanımı, gizli sekme tespiti, ders saati kaçışları ve mükerrer QR denemeleri anlık listelenir"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={selectedFilter}
              onChange={setSelectedFilter}
              options={FILTER_TABS}
            />

            <div className="relative w-[220px]">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <Input
                type="text"
                placeholder="İsim, TC veya mesaj..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-9 h-8 text-xs"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </PanelHeader>

        {loading ? (
          <div className="p-12 text-center text-slate-500 font-bold text-sm">
            VDS ve Veritabanı İhlal Kayıtları Yükleniyor...
          </div>
        ) : filteredLogs.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={logs.length === 0 ? 'Harika! Herhangi bir güvenlik ihlali bulunmuyor' : 'Filtreye uygun ihlal bulunamadı'}
            description={
              logs.length === 0
                ? 'Turnike ve mobil yoklama denetimleri temiz. Çift cihaz, gizli sekme veya izinsiz kaçış teşebbüsü tespit edilmedi.'
                : 'Farklı bir arama terimi veya filtre seçerek kayıtları görüntüleyebilirsiniz.'
            }
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {filteredLogs.map((log, index) => {
              const studentId = log.studentId || log.userId || '';
              const tc = log.studentTc || log.tc || '';
              const user = usersMap[studentId] || usersMap[tc];
              const studentName = log.studentName || log.userName || user?.name || 'Bilinmeyen Kişi';
              const photo = log.studentPhoto || user?.photo || null;
              const branch = user?.branch || '';
              const violation = getViolationBadge(log.type);
              const ViolationIcon = violation.icon;
              const isUnlocking = unlockingId === studentId;

              return (
                <div
                  key={log.id || index}
                  className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-white/[0.02] transition-colors"
                >
                  {/* Left: User & Violation Details */}
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className="relative shrink-0 mt-0.5">
                      {photo ? (
                        <img
                          src={photo}
                          alt={studentName}
                          className="w-12 h-12 rounded-2xl object-cover border border-slate-200 dark:border-white/10"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-sm border border-rose-200 dark:border-rose-900/50">
                          {studentName.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-sm">
                        <ViolationIcon size={11} />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5 mb-1">
                        <h3 className="font-extrabold text-[15px] text-slate-900 dark:text-white truncate">
                          {studentName}
                        </h3>
                        {branch && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#1e293b] text-slate-700 dark:text-slate-300 text-[11px] font-bold">
                            {branch}
                          </span>
                        )}
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${
                          violation.tone === 'danger'
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/60'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/60'
                        }`}>
                          {violation.label}
                        </span>
                      </div>

                      <p className="text-[13px] text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                        {log.message || log.title || 'Güvenlik ihlali tespit edildi.'}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-[11.5px] text-slate-500 dark:text-slate-400 font-semibold mt-2">
                        {tc && <span>TC: {tc.substring(0, 4)}*******</span>}
                        {log.hardwareId && <span>Cihaz: {log.hardwareId.substring(0, 16)}</span>}
                        {log.clientIp && <span>IP: {log.clientIp}</span>}
                        <span className="flex items-center gap-1 text-slate-400">
                          <Clock size={12} />
                          {formatDate(log.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    {log.type === 'student_multidevice_cheat' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isUnlocking}
                        onClick={() => handleUnlockStudent(studentId, studentName)}
                        className="flex items-center gap-1.5"
                      >
                        <Unlock size={14} className="text-emerald-500" />
                        {isUnlocking ? 'Kilit Açılıyor...' : 'Cihaz Kilidini Aç'}
                      </Button>
                    )}
                  </div>
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
