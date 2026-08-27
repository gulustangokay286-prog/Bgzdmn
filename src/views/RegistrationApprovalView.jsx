import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Inbox, Search, X, Check, Users, GraduationCap, UserSquare, UserPlus, Briefcase, CheckCircle2 } from 'lucide-react';
import { firebaseService } from '../services/firebase';
import UserRow, { UserTableHeader, USER_TABLE_MIN_WIDTH } from '../components/UserRow';
import { updateDoc, doc, getFirestore } from 'firebase/firestore';
import { app } from '../services/firebaseConfig';
import { Panel, PanelFooter, Button, IconButton, Input, EmptyState, Modal } from '../components/ui/panel';
import { cx, hairline, divider } from '../components/ui/tokens';

const firestoreDb = getFirestore(app);

const roleOf = (u) => u?.fields?.role?.stringValue?.toLowerCase() || '';

const ROLE_SUMMARY = [
  { id: 'student', label: 'Öğrenci', roles: ['student', 'öğrenci'], icon: GraduationCap },
  { id: 'parent', label: 'Veli', roles: ['parent', 'veli'], icon: UserPlus },
  { id: 'teacher', label: 'Öğretmen', roles: ['teacher', 'öğretmen'], icon: UserSquare },
  { id: 'personnel', label: 'Personel', roles: ['personnel', 'personel'], icon: Briefcase }
];

const RegistrationApprovalView = () => {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const users = await firebaseService.fetchAllUsers();
      const pending = users.filter(
        (u) =>
          ['pending', 'awaiting_approval'].includes(u.fields?.status?.stringValue?.toLowerCase()) &&
          roleOf(u) !== 'patron'
      );
      setPendingUsers(pending);
    } catch (err) {
      console.error('Onay listesi alınamadı:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPending();
    // Onay kuyruğu başka bir yöneticiden de dolabildiği için düzenli tazelenir.
    const interval = setInterval(fetchPending, 10000);
    return () => clearInterval(interval);
  }, []);

  const filteredUsers = useMemo(() => {
    let result = pendingUsers;

    // Rol filtresi
    if (selectedRole !== 'all') {
      const targetRoles = ROLE_SUMMARY.find(r => r.id === selectedRole)?.roles || [];
      result = result.filter(u => targetRoles.includes(roleOf(u)));
    }

    // Arama filtresi
    const query = searchText.trim().toLowerCase();
    if (query) {
      result = result.filter((u) => {
        const f = u.fields || {};
        const haystack = [
          f.displayName?.stringValue, f.full_name?.stringValue, f.fullName?.stringValue, f.name?.stringValue,
          f.tc_kimlik?.stringValue, f.tcKimlik?.stringValue, f.tc?.stringValue,
          f.email?.stringValue, f.role?.stringValue, f.phone?.stringValue,
          f.branch?.stringValue, f.class_id?.stringValue
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    return result;
  }, [pendingUsers, searchText, selectedRole]);

  const handleApproveAll = async () => {
    setBulkConfirm(false);
    if (filteredUsers.length === 0) return;

    setBulkRunning(true);
    try {
      await Promise.all(
        filteredUsers.map((u) =>
          updateDoc(doc(firestoreDb, 'users', u.name.split('/').pop()), { status: 'approved' })
        )
      );
      await fetchPending();
    } catch (error) {
      console.error('Toplu onay hatası:', error);
    }
    setBulkRunning(false);
  };

  const isFirstLoad = loading && pendingUsers.length === 0;
  const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="w-full flex flex-col gap-5 pb-2">
      {/* ÜST BAŞLIK */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[27px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
            Onay Bekleyenler
          </h1>
          <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400">
            {today} ·{' '}
            {pendingUsers.length === 0
              ? 'kuyruk boş'
              : `${pendingUsers.length} hesap onayınızı bekliyor`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {filteredUsers.length > 0 && (
            <button
              type="button"
              onClick={() => setBulkConfirm(true)}
              disabled={bulkRunning}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-[13px] shadow-sm shadow-emerald-600/20 transition-all cursor-pointer"
            >
              {bulkRunning ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={16} />}
              <span>{bulkRunning ? 'Onaylanıyor…' : `Tümünü Kabul Et (${filteredUsers.length})`}</span>
            </button>
          )}
          <IconButton
            label="Yenile"
            icon={RefreshCw}
            variant="secondary"
            onClick={fetchPending}
            disabled={loading}
            className={loading ? '[&_svg]:animate-spin' : ''}
          />
        </div>
      </header>

      {/* ROL KARTLARI / DAĞILIM VE FİLTRELEME */}
      {pendingUsers.length > 0 && (
        <div className={cx('flex flex-col sm:flex-row divide-y sm:divide-y-0', divider, 'bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-xs')}>
          {/* Tümü Butonu */}
          <button
            type="button"
            onClick={() => setSelectedRole('all')}
            className={cx(
              'flex-1 px-5 py-3.5 text-left transition-colors cursor-pointer',
              'sm:border-r', hairline,
              selectedRole === 'all' 
                ? 'bg-blue-50/70 dark:bg-blue-500/10' 
                : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'
            )}
          >
            <div className="flex items-center justify-between">
              <span className={cx('text-[12px] font-bold', selectedRole === 'all' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400')}>
                Tüm Bekleyenler
              </span>
              <Users size={14} className={selectedRole === 'all' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'} />
            </div>
            <div className={cx('mt-1 text-[22px] leading-none font-bold tnum', selectedRole === 'all' ? 'text-blue-700 dark:text-blue-300' : 'text-slate-900 dark:text-white')}>
              {pendingUsers.length}
            </div>
          </button>

          {ROLE_SUMMARY.map((group, i) => {
            const count = pendingUsers.filter((u) => group.roles.includes(roleOf(u))).length;
            const isSelected = selectedRole === group.id;
            const Icon = group.icon;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => setSelectedRole(isSelected ? 'all' : group.id)}
                className={cx(
                  'flex-1 px-5 py-3.5 text-left transition-colors cursor-pointer',
                  i < ROLE_SUMMARY.length - 1 && 'sm:border-r', hairline,
                  isSelected 
                    ? 'bg-blue-50/70 dark:bg-blue-500/10' 
                    : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cx('text-[12px] font-bold', isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400')}>
                    {group.label}
                  </span>
                  <Icon size={14} className={isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'} />
                </div>
                <div className={cx('mt-1 text-[22px] leading-none font-bold tnum', isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-900 dark:text-white')}>
                  {count}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ANA TABLO VE ARAMA PANELİ */}
      <Panel>
        {/* ARAMA VE AKSİYON ÇUBUĞU */}
        <div className={cx('flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-b', hairline)}>
          <div className="relative w-full sm:max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              placeholder="İsim, TC kimlik, e-posta veya telefon ara..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-9 pr-9 w-full"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText('')}
                aria-label="Aramayı temizle"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            <span className="text-[12px] text-slate-500 dark:text-slate-400">
              <strong className="text-slate-900 dark:text-white">{filteredUsers.length}</strong> kayıt
            </span>
            {filteredUsers.length > 0 && (
              <button
                type="button"
                onClick={() => setBulkConfirm(true)}
                disabled={bulkRunning}
                className="inline-flex sm:hidden items-center gap-1.5 h-8 px-3 rounded-lg bg-emerald-600 text-white font-bold text-[12px]"
              >
                <Check size={13} strokeWidth={2.5} />
                <span>Tümünü Kabul Et</span>
              </button>
            )}
          </div>
        </div>

        {isFirstLoad ? (
          <div className={cx('divide-y', divider)}>
            {[0, 1, 2].map((n) => (
              <div key={n} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-slate-200/70 dark:bg-white/[0.06]" />
                <div className="flex-1 h-3 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
                <div className="w-24 h-3 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
              </div>
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={pendingUsers.length === 0 ? 'Onay bekleyen hesap yok' : 'Eşleşen kayıt bulunamadı'}
            description={
              pendingUsers.length === 0
                ? 'Sisteme yeni kayıt olan hesaplar burada listelenir ve tek tıkla onaylanır.'
                : 'Arama veya rol filtresini değiştirerek tekrar deneyin.'
            }
            action={
              (pendingUsers.length > 0 && (searchText || selectedRole !== 'all')) ? (
                <Button onClick={() => { setSearchText(''); setSelectedRole('all'); }}>
                  Filtreleri Temizle
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="overflow-x-auto panel-scroll">
            <div className={USER_TABLE_MIN_WIDTH}>
              <UserTableHeader />
              <div className={cx('divide-y', divider)}>
                {filteredUsers.map((u) => (
                  <UserRow key={u.name} document={u} showApprovalActions onUpdate={fetchPending} />
                ))}
              </div>
            </div>
          </div>
        )}

        {pendingUsers.length > 0 && (
          <PanelFooter>
            <span className="text-[11.5px] text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-200 tnum">{filteredUsers.length}</span> kayıt
              gösteriliyor · toplam <span className="tnum">{pendingUsers.length}</span>
            </span>
            <span className="text-[11.5px] text-slate-400 dark:text-slate-500">10 saniyede bir tazelenir</span>
          </PanelFooter>
        )}
      </Panel>

      {/* TOPLU ONAY MODALI */}
      <Modal
        open={bulkConfirm}
        onClose={() => setBulkConfirm(false)}
        title="Tümünü Kabul Et / Onayla"
        width="max-w-md"
        footer={
          <>
            <Button type="button" onClick={() => setBulkConfirm(false)}>
              Vazgeç
            </Button>
            <Button 
              type="button" 
              variant="primary" 
              className="bg-emerald-600 hover:bg-emerald-700 text-white" 
              onClick={handleApproveAll}
            >
              {filteredUsers.length} Hesabı Onayla
            </Button>
          </>
        }
      >
        <div className="px-5 py-5">
          <p className="m-0 text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-300">
            Listelenen{' '}
            <strong className="text-slate-900 dark:text-white tnum">{filteredUsers.length}</strong> hesabın
            tamamı anında onaylanacak ve kullanıcılar mobil uygulama ile portala giriş yapabilecek.
            {searchText.trim() && ' Yalnızca arama sonucundaki kayıtlar onaylanır.'}
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default RegistrationApprovalView;
