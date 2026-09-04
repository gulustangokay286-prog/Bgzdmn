import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  GraduationCap,
  UserSquare,
  Briefcase,
  Users,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  Landmark
} from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { financeService } from '../services/financeService';
import { vdsUserService } from '../services/vdsUserService';
import { Panel, PanelHeader, IconButton, Badge, Dot, EmptyState } from '../components/ui/panel';
import { cx, eyebrow, hairline, divider } from '../components/ui/tokens';
import { buildRoster, hasPool, POOL } from '../services/roster';

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

const nf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
const nfCompact = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });

const money = (n) => `₺${nf.format(Math.round(Number(n) || 0))}`;
const moneyCompact = (n) => (n === 0 ? '0' : `₺${nfCompact.format(n)}`);

const readField = (record, key) => {
  const f = record?.fields?.[key];
  if (f) return f.stringValue ?? f.timestampValue ?? f.doubleValue ?? f.integerValue ?? null;
  return record?.[key] ?? null;
};

const recordDate = (record) => {
  const raw = readField(record, 'date') || record?.createdAt;
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

const niceCeil = (value) => {
  if (!value || value <= 0) return 1000;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
};

const MetricCell = ({ icon: Icon, label, value, share, last }) => (
  <div className={cx('flex-1 min-w-0 px-5 py-4', !last && 'sm:border-r', !last && hairline)}>
    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
      <Icon size={14} strokeWidth={1.8} />
      <span className={cx(eyebrow, 'truncate')}>{label}</span>
    </div>

    <div className="mt-2.5 flex items-baseline gap-2">
      <span className="text-[26px] leading-none font-semibold tracking-[-0.025em] text-slate-900 dark:text-white tnum">
        {nf.format(value)}
      </span>
      <span className="text-[12px] font-medium text-slate-400 dark:text-slate-500 tnum">%{share}</span>
    </div>

    <div className="mt-3 h-[3px] rounded-full bg-slate-100 dark:bg-white/[0.07] overflow-hidden">
      <div
        className="h-full rounded-full bg-slate-800 dark:bg-slate-300 transition-[width] duration-700"
        style={{ width: `${Math.min(share, 100)}%` }}
      />
    </div>
  </div>
);

const CashflowChart = ({ records }) => {
  const monthly = useMemo(() => {
    const data = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));
    records.forEach((r) => {
      const date = recordDate(r) || new Date();
      const amount = Number(readField(r, 'amount') || 0);
      if (readField(r, 'type') === 'income') data[date.getMonth()].income += amount;
      else data[date.getMonth()].expense += amount;
    });
    return data;
  }, [records]);

  const max = useMemo(
    () => niceCeil(Math.max(...monthly.flatMap((m) => [m.income, m.expense]), 0)),
    [monthly]
  );

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const currentMonth = new Date().getMonth();

  return (
    <div className="px-5 pt-5 pb-4">
      <div className="flex">
        
        <div className="relative w-14 shrink-0 h-[188px]">
          {ticks.map((t, i) => (
            <span
              key={t}
              style={{ bottom: `${(i / 4) * 100}%` }}
              className="absolute right-2.5 translate-y-1/2 text-[10.5px] font-medium text-slate-400 dark:text-slate-500 tnum"
            >
              {moneyCompact(t)}
            </span>
          ))}
        </div>

        <div className="relative flex-1 h-[188px] min-w-0">
          {ticks.map((t, i) => (
            <div
              key={t}
              style={{ bottom: `${(i / 4) * 100}%` }}
              className={cx(
                'absolute inset-x-0 border-t',
                i === 0 ? 'border-slate-300 dark:border-white/20' : 'border-slate-100 dark:border-white/[0.06]'
              )}
            />
          ))}

          <div className="absolute inset-0 flex items-end">
            {monthly.map((m, i) => {
              const h = (v) => `${Math.max((v / max) * 100, v > 0 ? 1.5 : 0)}%`;
              return (
                <div
                  key={MONTHS[i]}
                  className="group relative flex-1 h-full flex items-end justify-center gap-[3px]"
                >
                  <div
                    className={cx(
                      'absolute inset-x-1 inset-y-0 rounded-md transition-colors',
                      i === currentMonth ? 'bg-slate-100/70 dark:bg-white/[0.04]' : 'bg-transparent',
                      'group-hover:bg-slate-100 dark:group-hover:bg-white/[0.06]'
                    )}
                  />

                  <div
                    style={{ height: h(m.income) }}
                    className="relative w-[7px] rounded-t-[2px] bg-slate-800 dark:bg-slate-200 transition-[height] duration-500"
                  />
                  <div
                    style={{ height: h(m.expense) }}
                    className="relative w-[7px] rounded-t-[2px] bg-[#991b1b] dark:bg-rose-400 transition-[height] duration-500"
                  />

                  {(m.income > 0 || m.expense > 0) && (
                    <div className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-20 hidden group-hover:block">
                      <div className="rounded-lg bg-slate-900 dark:bg-white px-2.5 py-1.5 text-[11px] leading-tight text-white dark:text-slate-900 shadow-lg whitespace-nowrap">
                        <div className="font-semibold mb-0.5">{MONTHS[i]}</div>
                        <div className="tnum">Gelir {money(m.income)}</div>
                        <div className="tnum">Gider {money(m.expense)}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex mt-2">
        <div className="w-14 shrink-0" />
        <div className="flex-1 flex min-w-0">
          {MONTHS.map((label, i) => (
            <span
              key={label}
              className={cx(
                'flex-1 text-center text-[10.5px] font-medium',
                i === currentMonth ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'
              )}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

const SummaryRow = ({ label, value, tone = 'default' }) => (
  <div className="flex items-center justify-between gap-3 px-5 py-3">
    <span className="text-[12.5px] text-slate-500 dark:text-slate-400">{label}</span>
    <span
      className={cx(
        'text-[13.5px] font-medium tnum',
        tone === 'positive' && 'text-slate-900 dark:text-white',
        tone === 'negative' && 'text-[#991b1b] dark:text-rose-400',
        tone === 'default' && 'text-slate-700 dark:text-slate-200'
      )}
    >
      {value}
    </span>
  </div>
);

const DashboardView = () => {
  const [users, setUsers] = useState(() => (vdsUserService.users && vdsUserService.users.length > 0 ? buildRoster(vdsUserService.users) : []));
  const [financeRecords, setFinanceRecords] = useState([]);
  const [studentPayments, setStudentPayments] = useState([]);
  const [loading, setLoading] = useState(() => !(vdsUserService.users && vdsUserService.users.length > 0));
  const [refreshing, setRefreshing] = useState(false);
  const [syncedAt, setSyncedAt] = useState(null);

  const load = useCallback(async (force = false) => {
    const [fetchedUsers, fetchedFinance, fetchedPayments] = await Promise.all([
      vdsUserService.fetchAllUsers(force).catch(() => []),
      financeService.getCashTransactions().catch(() => []),
      financeService.fetchStudentPayments().catch(() => [])
    ]);
    const validUsers = (Array.isArray(fetchedUsers) && fetchedUsers.length > 0)
      ? fetchedUsers
      : (Array.isArray(vdsUserService.users) && vdsUserService.users.length > 0 ? vdsUserService.users : null);

    if (validUsers && validUsers.length > 0) {
      setUsers(buildRoster(validUsers));
    }
    setFinanceRecords(fetchedFinance || []);
    setStudentPayments(fetchedPayments || []);
    setSyncedAt(new Date());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unsub = vdsUserService.subscribe((userList) => {
      if (!cancelled && Array.isArray(userList) && userList.length > 0) {
        setUsers(buildRoster(userList));
        setLoading(false);
      }
    });

    (async () => {
      try {
        await load();
      } catch (err) {
        console.error('Dashboard yükleme hatası:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await load(true);
    } catch (err) {
      console.error('Dashboard yenileme hatası:', err);
    }
    setRefreshing(false);
  };

  const roleOf = (u) => (u?.fields?.role?.stringValue || u?.role || '').toLowerCase();
  const nameOf = (u) => (u?.fields?.full_name?.stringValue || u?.fields?.fullName?.stringValue || u?.fields?.name?.stringValue || u?.name || '').toLowerCase();

  // Ayrilanlarin ayiklanmasi services/roster.js icinde yapilir; burada yalnizca
  // patron hesabi gizlenir.
  const visibleUsers = useMemo(
    () => (Array.isArray(users) ? users.filter((u) => u && roleOf(u) !== 'patron') : []),
    [users]
  );

  /*
   * Sayimlar HAVUZA gore yapilir, tek `role` alanina gore degil.
   * Cocugu kurumda okuyan bir ogretmen hem ogretmen hem veli sayilir; tek rol
   * okunsaydi velilerden dusup sayilar tutmazdi. Bu yuzden kisi sayilarinin
   * toplami, toplam kisi sayisindan buyuk olabilir.
   */
  const countByPool = useCallback(
    (pool) => visibleUsers.filter((u) => hasPool(u, pool)).length,
    [visibleUsers]
  );

  const students = countByPool(POOL.STUDENT);
  const teachers = countByPool(POOL.TEACHER);
  const parents = countByPool(POOL.PARENT);
  const personnel = countByPool(POOL.ADMIN);
  const shares = useMemo(() => {
    const raw = [
      { key: 'student', count: students },
      { key: 'teacher', count: teachers },
      { key: 'personnel', count: personnel },
      { key: 'parent', count: parents }
    ];
    const total = raw.reduce((sum, item) => sum + item.count, 0);
    if (total === 0) return { student: 0, teacher: 0, personnel: 0, parent: 0 };

    const exact = raw.map(item => (item.count / total) * 100);
    const floored = exact.map(Math.floor);
    let remainder = 100 - floored.reduce((a, b) => a + b, 0);

    const decimals = exact
      .map((e, i) => ({ i, dec: e - floored[i] }))
      .sort((a, b) => b.dec - a.dec);

    const result = [...floored];
    for (let k = 0; k < remainder; k++) {
      result[decimals[k].i] += 1;
    }

    return {
      student: result[0],
      teacher: result[1],
      personnel: result[2],
      parent: result[3]
    };
  }, [students, teachers, personnel, parents]);

  const balance = useMemo(() => financeService.calculateBalance(financeRecords), [financeRecords]);
  const income = useMemo(
    () => financeRecords.filter((r) => r.type === 'income').reduce((a, r) => a + Number(r.amount || 0), 0),
    [financeRecords]
  );
  const expense = useMemo(
    () => financeRecords.filter((r) => r.type === 'expense').reduce((a, r) => a + Number(r.amount || 0), 0),
    [financeRecords]
  );

  const delayedPayments = useMemo(
    () => studentPayments.filter((p) => p.status === 'Gecikmiş Ödeme').length,
    [studentPayments]
  );
  const paidPayments = useMemo(
    () => studentPayments.filter((p) => p.status === 'Ödendi').length,
    [studentPayments]
  );
  const collectionRate =
    studentPayments.length > 0 ? Math.round((paidPayments / studentPayments.length) * 100) : 100;

  const today = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  if (loading) {
    return (
      <div className="w-full flex flex-col gap-5 animate-pulse">
        <div className="h-9 w-56 rounded-lg bg-slate-200/70 dark:bg-white/[0.06]" />
        <div className="h-[118px] rounded-xl bg-slate-200/50 dark:bg-white/[0.04]" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 h-[300px] rounded-xl bg-slate-200/50 dark:bg-white/[0.04]" />
          <div className="lg:col-span-4 h-[300px] rounded-xl bg-slate-200/50 dark:bg-white/[0.04]" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-5 pb-2">
      
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[27px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
            Yönetim Paneli
          </h1>
          <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400 first-letter:uppercase">
            {today}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {syncedAt && (
            <span className="hidden sm:flex items-center gap-1.5 text-[11.5px] text-slate-400 dark:text-slate-500">
              <Dot tone="success" />
              {syncedAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} itibarıyla
            </span>
          )}
          <IconButton
            label="Verileri yenile"
            icon={RefreshCw}
            variant="secondary"
            onClick={handleRefresh}
            disabled={refreshing}
            className={refreshing ? '[&_svg]:animate-spin' : ''}
          />
        </div>
      </header>

      <div
        className={cx(
          'flex flex-col sm:flex-row divide-y sm:divide-y-0',
          divider,
          'bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-xl'
        )}
      >
        <MetricCell icon={GraduationCap} label="Öğrenci" value={students} share={shares.student} />
        <MetricCell icon={UserSquare} label="Öğretmen" value={teachers} share={shares.teacher} />
        <MetricCell icon={Briefcase} label="Yönetici & Personel" value={personnel} share={shares.personnel} />
        <MetricCell icon={Users} label="Veli" value={parents} share={shares.parent} last />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <Panel className="lg:col-span-8">
          <PanelHeader title="Nakit Akışı" description="Aylık gelir ve gider hareketleri">
            <div className="flex items-center gap-3.5">
              <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-600 dark:text-slate-300">
                <span className="w-2 h-2 rounded-[2px] bg-slate-800 dark:bg-slate-200" />
                Gelir
              </span>
              <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-slate-600 dark:text-slate-300">
                <span className="w-2 h-2 rounded-[2px] bg-[#991b1b] dark:bg-rose-400" />
                Gider
              </span>
            </div>
          </PanelHeader>

          {financeRecords.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="Mali veriler EBOS üzerinden işleniyor"
              description="Öğrenci taksitleri, kasa hareketleri ve muhasebe dökümleri EBOS finans modülüyle senkronize edilir. Kayıtlar oluştukça grafik burada dolar."
            />
          ) : (
            <CashflowChart records={financeRecords} />
          )}
        </Panel>

        <Panel className="lg:col-span-4">
          <PanelHeader title="Mali Özet" />

          <div className="px-5 pt-5 pb-4">
            <span className={eyebrow}>Kasa Bakiyesi</span>
            <div className="mt-2 text-[28px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white tnum">
              {money(balance)}
            </div>
          </div>

          <div className={cx('divide-y border-t', divider, hairline)}>
            <SummaryRow
              label={
                <span className="flex items-center gap-1.5">
                  <ArrowUpRight size={13} strokeWidth={2} /> Toplam Gelir
                </span>
              }
              value={money(income)}
              tone="positive"
            />
            <SummaryRow
              label={
                <span className="flex items-center gap-1.5">
                  <ArrowDownRight size={13} strokeWidth={2} /> Toplam Gider
                </span>
              }
              value={money(expense)}
              tone="negative"
            />
          </div>

          <div className={cx('px-5 py-4 border-t', hairline)}>
            <div className="flex items-center justify-between gap-3">
              <span className={eyebrow}>Tahsilat Oranı</span>
              <Badge tone={delayedPayments > 0 ? 'warning' : 'success'}>
                {delayedPayments > 0 ? `${delayedPayments} gecikme` : 'Güncel'}
              </Badge>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 h-[5px] rounded-full bg-slate-100 dark:bg-white/[0.07] overflow-hidden">
                <div
                  style={{ width: `${collectionRate}%` }}
                  className={cx(
                    'h-full rounded-full transition-[width] duration-700',
                    collectionRate >= 80
                      ? 'bg-emerald-500'
                      : collectionRate >= 50
                      ? 'bg-amber-500'
                      : 'bg-[#991b1b] dark:bg-rose-400'
                  )}
                />
              </div>
              <span className="text-[13.5px] font-medium text-slate-900 dark:text-white tnum">%{collectionRate}</span>
            </div>

            <p className="m-0 mt-2.5 text-[11.5px] text-slate-500 dark:text-slate-400">
              {studentPayments.length > 0
                ? `${paidPayments} / ${studentPayments.length} ödeme tamamlandı`
                : 'Henüz ödeme planı tanımlanmadı'}
            </p>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Son Hareketler" description="Kasa üzerindeki en güncel finansal işlemler">
          <span className="text-[11.5px] font-medium text-slate-500 dark:text-slate-400 tnum">
            {financeRecords.length} kayıt
          </span>
        </PanelHeader>

        {financeRecords.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Henüz işlem yok"
            description="Kasa ve banka hareketleri kaydedildikçe bu listede görüntülenir."
          />
        ) : (
          <div className="overflow-x-auto panel-scroll">
            <div className="min-w-[560px]">
              <div
                className={cx(
                  'grid grid-cols-[110px_minmax(0,1fr)_120px_140px] gap-4 px-5 py-2.5 border-b bg-slate-50/70 dark:bg-white/[0.02]',
                  hairline
                )}
              >
                <span className={eyebrow}>Tarih</span>
                <span className={eyebrow}>Açıklama</span>
                <span className={eyebrow}>Tür</span>
                <span className={cx(eyebrow, 'text-right')}>Tutar</span>
              </div>

              <div className={cx('divide-y', divider)}>
                {financeRecords.slice(0, 12).map((record, index) => {
                  const isIncome = (record.type || 'income') === 'income';
                  const date = recordDate(record);
                  return (
                    <div
                      key={record.id || index}
                      className="grid grid-cols-[110px_minmax(0,1fr)_120px_140px] gap-4 px-5 py-3 items-center hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <span className="text-[12.5px] text-slate-500 dark:text-slate-400 tnum">
                        {date
                          ? date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                          : '—'}
                      </span>
                      <span className="text-[13px] text-slate-800 dark:text-slate-100 truncate">
                        {record.title || record.description || 'İşlem'}
                      </span>
                      <span>
                        <Badge tone={isIncome ? 'neutral' : 'accent'}>{isIncome ? 'Tahsilat' : 'Gider'}</Badge>
                      </span>
                      <span
                        className={cx(
                          'text-[13px] font-medium text-right tnum',
                          isIncome ? 'text-slate-900 dark:text-white' : 'text-[#991b1b] dark:text-rose-400'
                        )}
                      >
                        {isIncome ? '+' : '−'}
                        {money(record.amount)}
                      </span>
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

export default DashboardView;
