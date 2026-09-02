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
  { id: 'all', label: 'Tümü', roles: null, icon: Users },
  { id: 'student', label: 'Öğrenci', roles: ['student', 'öğrenci'], icon: GraduationCap },
  { id: 'parent', label: 'Veli', roles: ['parent', 'veli'], icon: UserPlus },
  { id: 'teacher', label: 'Öğretmen', roles: ['teacher', 'öğretmen'], icon: UserSquare },
  { id: 'personnel', label: 'Personel', roles: ['personnel', 'personel'], icon: Briefcase }
];

const RegistrationApprovalView = () => {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const data = await firebaseService.fetchAllUsers();
      if (Array.isArray(data)) {
        const filtered = data.filter((u) => {
          const status = u?.fields?.status?.stringValue?.toLowerCase();
          const role = roleOf(u);
          const email = u?.fields?.email?.stringValue?.toLowerCase() || '';
          if (role === 'patron' || email.includes('patron')) return false;
          return status === 'pending' || status === 'awaiting_approval';
        });
        setPendingUsers(filtered);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setIsFirstLoad(false);
    }
  };

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 10000);
    return () => clearInterval(interval);
  }, []);

  const countFor = (group) => {
    if (!group.roles) return pendingUsers.length;
    return pendingUsers.filter((u) => group.roles.includes(roleOf(u))).length;
  };

  const filteredUsers = useMemo(() => {
    let result = pendingUsers;

    if (selectedRole !== 'all') {
      const group = ROLE_SUMMARY.find((g) => g.id === selectedRole);
      if (group?.roles) {
        result = result.filter((u) => group.roles.includes(roleOf(u)));
      }
    }

    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter((u) => {
        const f = u.fields || {};
        const name = (f.full_name?.stringValue || f.fullName?.stringValue || f.name?.stringValue || '').toLowerCase();
        const tc = (f.tc_kimlik?.stringValue || f.tcKimlik?.stringValue || '').toLowerCase();
        const email = (f.email?.stringValue || '').toLowerCase();
        const phone = (f.phone?.stringValue || '').toLowerCase();
        return name.includes(q) || tc.includes(q) || email.includes(q) || phone.includes(q);
      });
    }

    return result;
  }, [pendingUsers, selectedRole, searchText]);

  const handleApproveAll = async () => {
    setBulkRunning(true);
    try {
      await Promise.all(
        filteredUsers.map((u) => {
          const uid = u.name ? u.name.split('/').pop() : u.id;
          return updateDoc(doc(firestoreDb, 'users', uid), { status: 'approved' });
        })
      );
      setBulkConfirm(false);
      await fetchPending();
    } catch (err) {
      console.error('Toplu onay hatası:', err);
    } finally {
      setBulkRunning(false);
    }
  };

  const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const hasFilters = Boolean(searchText.trim()) || selectedRole !== 'all';

  return (
    <div className="w-full flex flex-col gap-5 pb-2">
      
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[27px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
            Onay Bekleyenler
          </h1>
          <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400">
            {today} ·{' '}
            {pendingUsers.length === 0
              ? 'kuyruk boş'
              : `${pendingUsers.length} hesap onay bekliyor`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {filteredUsers.length > 0 && (
            <Button
              variant="primary"
              onClick={() => setBulkConfirm(true)}
              disabled={bulkRunning}
              icon={bulkRunning ? RefreshCw : CheckCircle2}
              className="bg-emerald-600 hover:bg-emerald-700 text-white border-transparent"
            >
              {bulkRunning ? 'Onaylanıyor…' : `Tümünü Kabul Et (${filteredUsers.length})`}
            </Button>
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

      <div className="flex flex-wrap gap-1.5">
        {ROLE_SUMMARY.map((group) => {
          const count = countFor(group);
          const isSelected = selectedRole === group.id;
          const Icon = group.icon;
          return (
            <button
              key={group.id}
              onClick={() => setSelectedRole(group.id)}
              className={cx(
                'inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border text-[13px] font-medium transition-colors cursor-pointer',
                isSelected
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                  : 'bg-white dark:bg-white/[0.04] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.08]'
              )}
            >
              <Icon size={14} strokeWidth={1.9} />
              {group.label}
              <span className={cx('tnum', isSelected ? 'opacity-60' : 'text-slate-400 dark:text-slate-500')}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <Panel className="min-h-[580px]">
        
        <div className={cx('flex items-center px-5 py-3 border-b overflow-hidden', hairline)}>
          <div className="relative flex-1 min-w-0">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              placeholder="İsim, TC kimlik, e-posta veya telefon ara..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="!w-full pl-9 pr-9 box-border"
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
              (pendingUsers.length > 0 && hasFilters) ? (
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
