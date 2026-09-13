import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Download, Search, X, Users, GraduationCap, UserSquare, UserPlus, Briefcase, Plus, Check, ShieldCheck } from 'lucide-react';
import { kullaniciServisi } from '../services/kullaniciServisi';
import { modul, ayar, webAyar } from '../services/veri';
import UserRow, { UserTableHeader, USER_TABLE_MIN_WIDTH } from '../components/UserRow';
import { Panel, PanelFooter, Button, IconButton, Input, Select, EmptyState, Modal, FieldRows, Field, Toast } from '../components/ui/panel';
import { cx, hairline, divider } from '../components/ui/tokens';
import { buildRoster, hasPool, POOL } from '../services/roster';
import { matchesSearchQuery } from '../services/search';

import { vdsUserService } from '../services/vdsUserService';

const ROLE_FILTERS = [
  { id: 'all',       label: 'Tümü',     icon: Users,        pool: null },
  { id: 'student',   label: 'Öğrenci',  icon: GraduationCap, pool: POOL.STUDENT },
  { id: 'teacher',   label: 'Öğretmen', icon: UserSquare,   pool: POOL.TEACHER },
  { id: 'personnel', label: 'Personel',  icon: Briefcase,    pool: POOL.PERSONNEL },
  { id: 'parent',    label: 'Veli',     icon: UserPlus,     pool: POOL.PARENT },
  { id: 'admin',     label: 'İdare',    icon: ShieldCheck,  pool: POOL.ADMIN }
];

const STAFF_BRANCH_OPTIONS = [
  'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Türkçe', 'Türk Dili ve Edebiyatı',
  'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü', 'İngilizce', 'Almanca',
  'Beden Eğitimi', 'Müzik', 'Görsel Sanatlar', 'Rehberlik', 'Bilişim Teknolojileri'
];
const CLASS_LIST = ['9', '10', '11', '12'];
const SECTION_LIST = ['A', 'B', 'C', 'D', 'E', 'F'];
const DEPARTMENT_LIST = [
  'İdari İşler', 'Muhasebe & Finans', 'Öğrenci İşleri', 'Halkla İlişkiler & Tanıtım',
  'Kütüphane', 'Teknik Hizmetler', 'Güvenlik', 'Yemekhane'
];

const EMPTY_USER_FORM = {
  full_name: '', role: 'student', tc_kimlik: '', phone: '', email: '', additional_phone: '',
  class_id: '12', section: 'A', school_number: '', address: '',
  parent_name: '', parent_phone: '', parent_additional_phone: '', parent_relation: 'Veli',
  child_school_number: '', branch: '', department: 'İdari İşler',
  teacherTitle: 'Ders Öğretmeni', assignedClasses: '', notes: ''
};

const roleOf = (u) => u?.fields?.role?.stringValue?.toLowerCase() || '';
const statusOf = (u) => u?.fields?.status?.stringValue?.toLowerCase() || '';

const UsersView = () => {
  const [users, setUsers] = useState(() => (vdsUserService.users && vdsUserService.users.length > 0 ? buildRoster(vdsUserService.users) : []));
  const [loading, setLoading] = useState(() => !(vdsUserService.users && vdsUserService.users.length > 0));
  const [searchText, setSearchText] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [showAddUser, setShowAddUser] = useState(false);
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);
  const [savingUser, setSavingUser] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', tone: 'success' });

  const notify = (message, tone = 'success') => {
    setToast({ open: true, message, tone });
    // Hata metni (sunucunun dondugu sebep) okunabilsin diye daha uzun kalir.
    setTimeout(() => setToast((value) => ({ ...value, open: false })), tone === 'danger' ? 7000 : 3500);
  };

  useEffect(() => {
    const unsub = vdsUserService.subscribe((list) => {
      if (Array.isArray(list) && list.length > 0) {
        setUsers(buildRoster(list));
        setLoading(false);
      }
    });

    vdsUserService.fetchAllUsers().then((list) => {
      if (Array.isArray(list) && list.length > 0) {
        setUsers(buildRoster(list));
      }
      setLoading(false);
    }).catch(() => setLoading(false));

    return () => {
      unsub();
    };
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await vdsUserService.fetchAllUsers(true);
      if (Array.isArray(data)) setUsers(buildRoster(data));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const visibleUsers = useMemo(() => {
    return users.filter((u) => {
      const role = roleOf(u);
      const email = u?.fields?.email?.stringValue?.toLowerCase() || '';
      if (role === 'patron' || email.includes('patron')) return false;
      // Kisi birden fazla rol tasiyabilir; hicbir rolu yoksa listelenmez.
      if (Array.isArray(u._pools) && u._pools.length === 0) return false;
      return true;
    });
  }, [users]);

  const countFor = (filter) => {
    if (!filter.pool) return visibleUsers.length;
    return visibleUsers.filter((u) => hasPool(u, filter.pool)).length;
  };

  const pendingCount = useMemo(
    () => visibleUsers.filter((u) => ['pending', 'awaiting_approval'].includes(statusOf(u))).length,
    [visibleUsers]
  );

  const filteredUsers = useMemo(() => {
    let result = visibleUsers;

    if (searchText.trim()) {
      result = result.filter((u) => {
        const f = u.fields || {};
        return matchesSearchQuery(searchText, {
          text: [
            f.full_name?.stringValue || f.fullName?.stringValue || f.name?.stringValue,
            f.email?.stringValue,
            f.branch?.stringValue,
            f.class_id?.stringValue
          ],
          identifiers: [
            f.tc_kimlik?.stringValue || f.tcKimlik?.stringValue,
            f.school_number?.stringValue || f.schoolNumber?.stringValue,
            f.phone?.stringValue
          ]
        });
      });
    }

    if (selectedRole !== 'all') {
      const pool = ROLE_FILTERS.find((f) => f.id === selectedRole)?.pool;
      if (pool) result = result.filter((u) => hasPool(u, pool));
    }

    if (selectedStatus !== 'all') {
      result = result.filter((u) =>
        selectedStatus === 'active' ? statusOf(u) === 'approved' : ['pending', 'awaiting_approval'].includes(statusOf(u))
      );
    }

    return result;
  }, [visibleUsers, searchText, selectedRole, selectedStatus]);

  const handleExportCsv = () => {
    const cell = (v) => `"${String(v ?? '—').replace(/"/g, '""')}"`;
    const rows = [['Ad Soyad', 'Rol', 'TC Kimlik', 'Durum', 'E-posta', 'Sınıf/Branş']];
    filteredUsers.forEach((u) => {
      const f = u.fields || {};
      rows.push([
        f.full_name?.stringValue || f.fullName?.stringValue || f.displayName?.stringValue || 'İsimsiz',
        f.role?.stringValue,
        f.tc_kimlik?.stringValue || f.tcKimlik?.stringValue,
        f.status?.stringValue,
        f.email?.stringValue,
        f.branch?.stringValue || f.class_id?.stringValue
      ]);
    });

    const csv = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `kullanicilar-${new Date().toISOString().slice(0, 10)}.csv`;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    if (!userForm.full_name.trim()) return;
    setSavingUser(true);
    try {
      const payload = {
        ...userForm,
        full_name: userForm.full_name.trim(),
        tc_kimlik: userForm.tc_kimlik.trim(),
        phone: userForm.phone.trim(),
        email: userForm.email.trim(),
        branch: userForm.role === 'teacher' ? userForm.branch : userForm.department
      };
      // createUser sunucu hatasini oldugu gibi firlatir; metin toast'a gider.
      await vdsUserService.createUser({
        ...payload,
        status: 'approved'
      });
      setUserForm(EMPTY_USER_FORM);
      setShowAddUser(false);
      notify('Kullanıcı kaydı oluşturuldu.');
    } catch (error) {
      const sebep = error?.message || 'Kayıt oluşturulamadı.';
      notify(error?.durum ? `${sebep} (HTTP ${error.durum})` : sebep, 'danger');
    } finally {
      setSavingUser(false);
    }
  };

  const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const hasFilters = Boolean(searchText.trim()) || selectedRole !== 'all' || selectedStatus !== 'all';

  return (
    <div className="w-full flex flex-col gap-5 pb-2">
      <Toast open={toast.open} message={toast.message} tone={toast.tone} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[27px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
            Kullanıcılar
          </h1>
          <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400">
            {today} · {visibleUsers.length} kayıtlı hesap
            {pendingCount > 0 && ` · ${pendingCount} onay bekliyor`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="primary" icon={Plus} onClick={() => setShowAddUser(true)}>
            Yeni Kullanıcı Ekle
          </Button>
          <Button icon={Download} onClick={handleExportCsv} disabled={filteredUsers.length === 0}>
            Dışa Aktar
          </Button>
          <IconButton
            label="Yenile"
            icon={RefreshCw}
            variant="secondary"
            onClick={refresh}
            disabled={loading}
            className={loading ? '[&_svg]:animate-spin' : ''}
          />
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {ROLE_FILTERS.map((filter) => {
          const Icon = filter.icon;
          const isActive = selectedRole === filter.id;
          return (
            <button
              key={filter.id}
              onClick={() => setSelectedRole(filter.id)}
              className={cx(
                'inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border text-[13px] font-medium transition-colors cursor-pointer',
                isActive
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                  : 'bg-white dark:bg-white/[0.04] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.08]'
              )}
            >
              <Icon size={14} strokeWidth={1.9} />
              {filter.label}
              <span className={cx('tnum', isActive ? 'opacity-60' : 'text-slate-400 dark:text-slate-500')}>
                {countFor(filter)}
              </span>
            </button>
          );
        })}
      </div>

      <Panel className="min-h-[580px]">
        <div className={cx('flex flex-col sm:flex-row gap-4 px-5 py-3 border-b', hairline)}>
          <div className="relative w-full sm:max-w-md sm:mr-auto ml-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              placeholder="İsim, TC kimlik, e-posta, sınıf veya branş ara"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchText && (
              <button
                onClick={() => setSearchText('')}
                aria-label="Aramayı temizle"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="sm:w-48 shrink-0">
            <Select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
              <option value="all">Tüm durumlar</option>
              <option value="active">Onaylı</option>
              <option value="pending">Onay bekleyen</option>
            </Select>
          </div>
        </div>

        {loading && filteredUsers.length === 0 ? (
          <div className={cx('divide-y', divider)}>
            {[0, 1, 2, 3, 4].map((n) => (
              <div key={n} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-slate-200/70 dark:bg-white/[0.06]" />
                <div className="flex-1 h-3 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
                <div className="w-24 h-3 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
              </div>
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            icon={Search}
            title={hasFilters ? 'Eşleşen kullanıcı yok' : 'Henüz kullanıcı yok'}
            description={
              hasFilters
                ? 'Arama metnini veya filtreleri değiştirerek tekrar deneyin.'
                : 'Sisteme kayıt olan hesaplar bu listede görünür.'
            }
            action={
              hasFilters ? (
                <Button
                  onClick={() => {
                    setSearchText('');
                    setSelectedRole('all');
                    setSelectedStatus('all');
                  }}
                >
                  Filtreleri temizle
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="overflow-x-auto panel-scroll">
            <div className={USER_TABLE_MIN_WIDTH}>
              <UserTableHeader />
              <div className={cx('divide-y', divider)}>
                {filteredUsers.map((u, i) => (
                  <UserRow
                    key={u.name || i}
                    document={u}
                    showApprovalActions={['pending', 'awaiting_approval'].includes(statusOf(u))}
                    onUpdate={refresh}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <PanelFooter>
          <span className="text-[11.5px] text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-200 tnum">{filteredUsers.length}</span> kayıt
            gösteriliyor · toplam <span className="tnum">{visibleUsers.length}</span>
          </span>
          {hasFilters && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearchText('');
                setSelectedRole('all');
                setSelectedStatus('all');
              }}
            >
              Filtreleri temizle
            </Button>
          )}
        </PanelFooter>
      </Panel>

      <Modal
        open={showAddUser}
        onClose={() => setShowAddUser(false)}
        title="Yeni Kullanıcı Ekle"
        description="Rolü seçin; o role ait alanlar otomatik olarak açılır."
        width="max-w-xl"
        footer={
          <>
            <Button type="button" onClick={() => setShowAddUser(false)}>Vazgeç</Button>
            <Button type="submit" form="users-add-form" variant="primary" icon={savingUser ? RefreshCw : Check} disabled={savingUser}>
              {savingUser ? 'Kaydediliyor…' : 'Kullanıcıyı Oluştur'}
            </Button>
          </>
        }
      >
        <form id="users-add-form" onSubmit={handleCreateUser}>
          <FieldRows>
            <Field label="Ad soyad *">
              <Input required value={userForm.full_name} onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })} placeholder="Ad Soyad" />
            </Field>

            <Field label="Kullanıcı türü">
              <Select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                <option value="student">Öğrenci</option>
                <option value="parent">Veli</option>
                <option value="teacher">Öğretmen</option>
                <option value="personnel">Personel</option>
                <option value="admin">İdare</option>
              </Select>
            </Field>

            {userForm.role === 'student' && (
              <>
                <Field label="Öğrenci bilgileri" hint="Okul numarası zorunludur; sınıf ve şube VDS ile eşleştirilir.">
                  <div className="grid grid-cols-3 gap-2.5">
                    <Select value={userForm.class_id} onChange={(e) => setUserForm({ ...userForm, class_id: e.target.value })}>
                      {CLASS_LIST.map((item) => <option key={item} value={item}>{item}. Sınıf</option>)}
                    </Select>
                    <Select value={userForm.section} onChange={(e) => setUserForm({ ...userForm, section: e.target.value })}>
                      {SECTION_LIST.map((item) => <option key={item} value={item}>{item} Şubesi</option>)}
                    </Select>
                    <Input required value={userForm.school_number} onChange={(e) => setUserForm({ ...userForm, school_number: e.target.value })} placeholder="Okul no" />
                  </div>
                </Field>
                <Field label="Veli bilgileri" hint="Telefonlar girilirse öğrenci-veli bağı da VDS üzerinde oluşturulur.">
                  <div className="grid grid-cols-2 gap-2.5">
                    <Input value={userForm.parent_name} onChange={(e) => setUserForm({ ...userForm, parent_name: e.target.value })} placeholder="Veli ad soyad" />
                    <Input type="tel" value={userForm.parent_phone} onChange={(e) => setUserForm({ ...userForm, parent_phone: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Veli ana telefonu" />
                    <Input type="tel" value={userForm.parent_additional_phone} onChange={(e) => setUserForm({ ...userForm, parent_additional_phone: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Veli ek telefonu" />
                    <Select value={userForm.parent_relation} onChange={(e) => setUserForm({ ...userForm, parent_relation: e.target.value })}>
                      <option>Veli</option><option>Anne</option><option>Baba</option><option>Vasi</option>
                    </Select>
                  </div>
                </Field>
              </>
            )}

            {userForm.role === 'parent' && (
              <Field label="Veli iletişim ve öğrenci bağı">
                <div className="grid grid-cols-2 gap-2.5">
                  <Input type="tel" value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Ana telefon" />
                  <Input type="tel" value={userForm.additional_phone} onChange={(e) => setUserForm({ ...userForm, additional_phone: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Ek telefon" />
                  <Input value={userForm.child_school_number} onChange={(e) => setUserForm({ ...userForm, child_school_number: e.target.value })} placeholder="Çocuğun okul no (isteğe bağlı)" />
                  <Input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} placeholder="E-posta" />
                </div>
              </Field>
            )}

            {(userForm.role === 'teacher' || userForm.role === 'personnel' || userForm.role === 'admin') && (
              <Field label="Görev / kadro bilgileri">
                <div className="grid grid-cols-2 gap-2.5">
                  {userForm.role === 'teacher' ? (
                    <Select value={userForm.branch} onChange={(e) => setUserForm({ ...userForm, branch: e.target.value })}>
                      <option value="">Atanmamış</option>
                      {STAFF_BRANCH_OPTIONS.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
                    </Select>
                  ) : (
                    <Select value={userForm.department} onChange={(e) => setUserForm({ ...userForm, department: e.target.value })}>
                      {DEPARTMENT_LIST.map((department) => <option key={department} value={department}>{department}</option>)}
                    </Select>
                  )}
                  <Input value={userForm.teacherTitle} onChange={(e) => setUserForm({ ...userForm, teacherTitle: e.target.value })} placeholder="Unvan / görev" />
                </div>
              </Field>
            )}

            {userForm.role !== 'student' && userForm.role !== 'parent' && (
              <Field label="İletişim bilgileri">
                <div className="grid grid-cols-2 gap-2.5">
                  <Input type="tel" value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value.replace(/[^0-9]/g, '') })} placeholder="Telefon" />
                  <Input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} placeholder="E-posta" />
                </div>
              </Field>
            )}

            {(userForm.role === 'teacher' || userForm.role === 'personnel') && (
              <Field label="Atama ve notlar">
                <div className="grid grid-cols-2 gap-2.5">
                  <Input value={userForm.assignedClasses} onChange={(e) => setUserForm({ ...userForm, assignedClasses: e.target.value })} placeholder="Atanan sınıflar (9A, 10B)" />
                  <Input value={userForm.notes} onChange={(e) => setUserForm({ ...userForm, notes: e.target.value })} placeholder="İdari not" />
                </div>
              </Field>
            )}

            <Field label="TC Kimlik No (isteğe bağlı)">
              <Input maxLength={11} value={userForm.tc_kimlik} onChange={(e) => setUserForm({ ...userForm, tc_kimlik: e.target.value.replace(/[^0-9]/g, '') })} placeholder="11 haneli TC kimlik numarası" />
            </Field>
          </FieldRows>
        </form>
      </Modal>
    </div>
  );
};

export default UsersView;
