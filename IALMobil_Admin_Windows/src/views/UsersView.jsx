import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Download, Search, X, Users, GraduationCap, UserSquare, UserPlus, Briefcase } from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { db, mapSdkToRest } from '../services/firebaseConfig';
import { collection, onSnapshot } from 'firebase/firestore';
import UserRow, { UserTableHeader, USER_TABLE_MIN_WIDTH } from '../components/UserRow';
import { Panel, PanelFooter, Button, IconButton, Input, Select, EmptyState } from '../components/ui/panel';
import { cx, hairline, divider } from '../components/ui/tokens';
import { buildRoster, hasPool, POOL } from '../services/roster';

import { vdsUserService } from '../services/vdsUserService';

const ROLE_FILTERS = [
  { id: 'all',       label: 'Tümü',     icon: Users,        pool: null },
  { id: 'student',   label: 'Öğrenci',  icon: GraduationCap, pool: POOL.STUDENT },
  { id: 'teacher',   label: 'Öğretmen', icon: UserSquare,   pool: POOL.TEACHER },
  { id: 'parent',    label: 'Veli',     icon: UserPlus,     pool: POOL.PARENT },
  { id: 'personnel', label: 'İdare',    icon: Briefcase,    pool: POOL.ADMIN }
];

const roleOf = (u) => u?.fields?.role?.stringValue?.toLowerCase() || '';
const statusOf = (u) => u?.fields?.status?.stringValue?.toLowerCase() || '';

const UsersView = () => {
  const [users, setUsers] = useState(() => buildRoster(vdsUserService.users || []));
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  useEffect(() => {
    setLoading(true);
    const unsub = vdsUserService.subscribe((list) => {
      setUsers(buildRoster(list));
      setLoading(false);
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
      const q = searchText.trim().toLowerCase();
      result = result.filter((u) => {
        const f = u.fields || {};
        const name = (f.full_name?.stringValue || f.fullName?.stringValue || f.name?.stringValue || '').toLowerCase();
        const tc = (f.tc_kimlik?.stringValue || f.tcKimlik?.stringValue || '').toLowerCase();
        const mail = (f.email?.stringValue || '').toLowerCase();
        const branch = (f.branch?.stringValue || '').toLowerCase();
        const classId = (f.class_id?.stringValue || '').toLowerCase();
        return name.includes(q) || tc.includes(q) || mail.includes(q) || branch.includes(q) || classId.includes(q);
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

  const today = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const hasFilters = Boolean(searchText.trim()) || selectedRole !== 'all' || selectedStatus !== 'all';

  return (
    <div className="w-full flex flex-col gap-5 pb-2">
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
    </div>
  );
};

export default UsersView;
