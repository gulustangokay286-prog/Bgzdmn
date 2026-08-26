import React, { useState, useEffect, useMemo } from 'react';
import { 
  GraduationCap, 
  UserSquare, 
  UserPlus, 
  Briefcase, 
  Building2, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Activity, 
  Clock, 
  ArrowRight, 
  ArrowUpRight, 
  ArrowDownRight, 
  CheckCircle2, 
  BarChart3, 
  AlertCircle, 
  Download, 
  FileSpreadsheet, 
  Filter,
  Users,
  CreditCard,
  Layers,
  Sparkles
} from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { financeService } from '../services/financeService';
import { useLicense } from '../hooks/useLicense';
import { db } from '../services/firebaseConfig';
import { collection, onSnapshot } from 'firebase/firestore';

const StatCard = ({ title, value, icon: Icon, ratio, colorClass = "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-900/30" }) => (
  <div className="bg-white dark:bg-[#0f172a] rounded-2xl md:rounded-3xl p-5 border border-slate-200/80 dark:border-white/10 flex flex-col justify-between relative overflow-hidden shadow-xs hover:shadow-md transition-all duration-300 group">
    <div className="flex justify-between items-start mb-4 relative z-10">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-50 dark:bg-[#1e293b] text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-white/5 group-hover:scale-105 transition-transform">
        <Icon size={20} strokeWidth={2} />
      </div>
      {ratio !== undefined && (
        <div className={`text-[11.5px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border ${colorClass}`}>
          %{ratio}
        </div>
      )}
    </div>

    <div className="relative z-10">
      <div className="text-[28px] md:text-[32px] font-bold text-slate-900 dark:text-white tracking-tight leading-none">
        {value}
      </div>
      <div className="text-[12.5px] font-semibold text-slate-500 dark:text-slate-400 mt-2 truncate">
        {title}
      </div>
    </div>
  </div>
);

const CashflowBarChart = ({ records = [] }) => {
  const months = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const currentMonth = new Date().getMonth();

  const monthlyData = useMemo(() => {
    const data = Array(12).fill(0).map(() => ({ income: 0, expense: 0 }));
    records.forEach(r => {
      const dStr = r.fields?.date?.stringValue || r.fields?.date?.timestampValue || r.date;
      const date = dStr ? new Date(dStr) : new Date();
      const month = date.getMonth();
      const amount = Number(r.fields?.amount?.doubleValue || r.fields?.amount?.integerValue || r.amount || 0);
      const type = r.fields?.type?.stringValue || r.type;
      if (type === 'income') {
        data[month].income += amount;
      } else {
        data[month].expense += amount;
      }
    });
    return data;
  }, [records]);

  const maxVal = useMemo(() => {
    const max = Math.max(...monthlyData.map(d => Math.max(d.income, d.expense)), 1000);
    return max;
  }, [monthlyData]);

  return (
    <div className="w-full flex flex-col gap-4 mt-2">
      {/* Chart Grid */}
      <div className="w-full h-44 flex items-end justify-between gap-1.5 sm:gap-3 pt-6 pb-2 px-1 border-b border-slate-100 dark:border-white/5">
        {monthlyData.map((d, i) => {
          const incHeight = maxVal > 0 ? Math.max((d.income / maxVal) * 100, 4) : 4;
          const expHeight = maxVal > 0 ? Math.max((d.expense / maxVal) * 100, 4) : 4;
          const isSelected = i === currentMonth;

          return (
            <div key={months[i]} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group relative">
              {/* Tooltip on hover */}
              <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-lg pointer-events-none z-20 whitespace-nowrap shadow-lg">
                G: ₺{d.income.toLocaleString('tr-TR')} / Ç: ₺{d.expense.toLocaleString('tr-TR')}
              </div>

              <div className="w-full flex items-end justify-center gap-1 h-full">
                {/* Income Bar */}
                <div 
                  style={{ height: `${incHeight}%` }}
                  className={`w-full max-w-[10px] rounded-t-md transition-all duration-500 ${
                    d.income > 0 ? 'bg-indigo-600 dark:bg-indigo-500 group-hover:bg-indigo-400' : 'bg-slate-200/50 dark:bg-white/5'
                  }`}
                  title={`Gelir: ₺${d.income}`}
                />
                {/* Expense Bar */}
                <div 
                  style={{ height: `${expHeight}%` }}
                  className={`w-full max-w-[10px] rounded-t-md transition-all duration-500 ${
                    d.expense > 0 ? 'bg-rose-500 dark:bg-rose-400 group-hover:bg-rose-300' : 'bg-slate-200/40 dark:bg-white/5'
                  }`}
                  title={`Gider: ₺${d.expense}`}
                />
              </div>

              <span className={`text-[10.5px] font-bold truncate ${
                isSelected ? 'text-indigo-600 dark:text-indigo-400 font-extrabold' : 'text-slate-400 dark:text-slate-500'
              }`}>
                {months[i]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const DashboardView = () => {
  const { canAccess, license } = useLicense();
  const [users, setUsers] = useState([]);
  const [financeRecords, setFinanceRecords] = useState([]);
  const [studentPayments, setStudentPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    const loadInitial = async () => {
      try {
        const [fetchedUsers, fetchedFinance, fetchedStudentPays] = await Promise.all([
          firebaseService.fetchAllUsers(),
          financeService.getCashTransactions().catch(() => []),
          financeService.fetchStudentPayments().catch(() => [])
        ]);

        if (!isCancelled) {
          setUsers(fetchedUsers || []);
          setFinanceRecords(fetchedFinance || []);
          setStudentPayments(fetchedStudentPays || []);
          setLoading(false);
        }
      } catch (err) {
        console.error("Dashboard yükleme hatası:", err);
        if (!isCancelled) setLoading(false);
      }
    };

    loadInitial();

    return () => { isCancelled = true; };
  }, []);

  const visibleUsers = useMemo(() => {
    if (!Array.isArray(users)) return [];
    return users.filter(u => {
      if (!u) return false;
      const role = (u.fields?.role?.stringValue || u.role || '').toLowerCase();
      return role !== 'patron';
    });
  }, [users]);

  const students = useMemo(() => {
    return visibleUsers.filter(u => {
      const r = (u.fields?.role?.stringValue || u.role || '').toLowerCase();
      return r === 'student' || r === 'öğrenci';
    }).length;
  }, [visibleUsers]);

  const teachers = useMemo(() => {
    return visibleUsers.filter(u => {
      const r = (u.fields?.role?.stringValue || u.role || '').toLowerCase();
      return r === 'teacher' || r === 'öğretmen';
    }).length;
  }, [visibleUsers]);

  const parents = useMemo(() => {
    return visibleUsers.filter(u => {
      const r = (u.fields?.role?.stringValue || u.role || '').toLowerCase();
      return r === 'parent' || r === 'veli';
    }).length;
  }, [visibleUsers]);

  const personnel = useMemo(() => {
    return visibleUsers.filter(u => {
      const r = (u.fields?.role?.stringValue || u.role || '').toLowerCase();
      return r === 'personnel' || r === 'personel' || r === 'admin' || r === 'yönetici';
    }).length;
  }, [visibleUsers]);

  const totalCount = visibleUsers.length;

  const bal = useMemo(() => financeService.calculateBalance(financeRecords), [financeRecords]);
  const income = useMemo(() => financeRecords.filter(r => r.type === 'income').reduce((acc, r) => acc + Number(r.amount || 0), 0), [financeRecords]);
  const expense = useMemo(() => financeRecords.filter(r => r.type === 'expense').reduce((acc, r) => acc + Number(r.amount || 0), 0), [financeRecords]);

  const delayedPayments = useMemo(() => studentPayments.filter(p => p.status === 'Gecikmiş Ödeme').length, [studentPayments]);
  const paidPayments = useMemo(() => studentPayments.filter(p => p.status === 'Ödendi').length, [studentPayments]);
  const collectionRate = useMemo(() => studentPayments.length > 0 ? Math.round((paidPayments / studentPayments.length) * 100) : 100, [studentPayments, paidPayments]);

  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-[#FAFAFA] dark:bg-[#0b1120] p-12">
        <Activity size={32} className="text-slate-600 dark:text-slate-400 mb-4 animate-spin" strokeWidth={1.5} />
        <span className="text-xs font-semibold text-slate-500">Dashboard yükleniyor...</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex-1 flex flex-col font-sans gap-6 pb-6 overflow-x-hidden">
      
      {/* Üst Başlık & Tarih */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-2 w-full gap-3 shrink-0">
        <div className="flex flex-col">
          <span className="text-[11px] md:text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1">{currentDate}</span>
          <h1 className="text-[26px] md:text-[32px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-none">Genel Yönetim Paneli</h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-[#1e293b] border border-slate-200/80 dark:border-white/10 text-[12px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Toplam {totalCount} Kullanıcı</span>
          </div>
        </div>
      </div>

      {/* 4'LÜ İSTATİSTİK KARTLARI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full shrink-0">
        <StatCard 
          title="Aktif Öğrenciler" 
          value={students} 
          icon={GraduationCap} 
          ratio={totalCount > 0 ? Math.round((students / totalCount) * 100) : 0} 
        />
        <StatCard 
          title="Öğretmen Kadrosu" 
          value={teachers} 
          icon={UserSquare} 
          ratio={totalCount > 0 ? Math.round((teachers / totalCount) * 100) : 0} 
        />
        <StatCard 
          title="Yönetici & Personel Kadrosu" 
          value={personnel} 
          icon={Briefcase} 
          ratio={totalCount > 0 ? Math.round((personnel / totalCount) * 100) : 0} 
        />
        <StatCard 
          title="Kayıtlı Veliler" 
          value={parents} 
          icon={UserPlus} 
          ratio={totalCount > 0 ? Math.round((parents / totalCount) * 100) : 0} 
        />
      </div>

      {/* ANA PANEL IZGARASI (DUVAR GİBİ DENGELİ, TAŞMAYAN LAYOUT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full flex-1">

        {/* SOL/ORTA ALAN (8 Kolon) - Nakit Akışı & Bakiye Kartları */}
        <div className="lg:col-span-8 flex flex-col gap-5">
          
          {/* Nakit Akışı Kartı */}
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl md:rounded-3xl p-5 md:p-6 border border-slate-200/80 dark:border-white/10 shadow-xs flex flex-col justify-between">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-[#1e293b] flex items-center justify-center text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-white/5">
                  <BarChart3 size={18} strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-[17px] font-bold text-slate-900 dark:text-white tracking-tight">Nakit Akışı & Mali Durum</h2>
                  <p className="text-[12px] text-slate-500 font-medium">Aylık gelir ve gider hareketleri</p>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-xs font-bold">
                <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 dark:bg-indigo-500"></span>
                  <span>Gelir</span>
                </div>
                <div className="flex items-center gap-1.5 text-rose-500 dark:text-rose-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 dark:bg-rose-400"></span>
                  <span>Gider</span>
                </div>
              </div>
            </div>

            <CashflowBarChart records={financeRecords} />
          </div>

          {/* İki Küçük Kart (Toplam Bakiye & Tahsilat Performansı) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Toplam Bakiye */}
            <div className="bg-white dark:bg-[#0f172a] rounded-2xl md:rounded-3xl p-5 border border-slate-200/80 dark:border-white/10 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-bold uppercase tracking-wider text-slate-500">Kasa Bakiyesi</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Wallet size={16} />
                </div>
              </div>
              
              <div className="text-[26px] md:text-[30px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-none">
                ₺{bal.toLocaleString('tr-TR')}
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-white/5 text-xs">
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Toplam Gelir</span>
                  <span className="text-emerald-600 font-bold">₺{income.toLocaleString('tr-TR')}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block font-medium">Toplam Gider</span>
                  <span className="text-rose-500 font-bold">₺{expense.toLocaleString('tr-TR')}</span>
                </div>
              </div>
            </div>

            {/* Tahsilat Durumu */}
            <div className="bg-white dark:bg-[#0f172a] rounded-2xl md:rounded-3xl p-5 border border-slate-200/80 dark:border-white/10 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[12px] font-bold uppercase tracking-wider text-slate-500">Tahsilat Durumu</span>
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <CreditCard size={16} />
                </div>
              </div>

              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[26px] md:text-[30px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-none">
                    %{collectionRate}
                  </div>
                  <span className="text-[11.5px] font-semibold text-slate-500 mt-1 block">
                    {delayedPayments > 0 ? `${delayedPayments} Gecikmiş Ödeme` : 'Tüm ödemeler güncel'}
                  </span>
                </div>

                <div className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border ${
                  delayedPayments > 0 
                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 border-rose-200 dark:border-rose-900/40' 
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 border-emerald-200 dark:border-emerald-900/40'
                }`}>
                  {delayedPayments > 0 ? 'Takipte' : 'Kusursuz'}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-100 dark:bg-white/10 h-2 rounded-full mt-4 overflow-hidden">
                <div 
                  style={{ width: `${collectionRate}%` }} 
                  className={`h-full rounded-full transition-all duration-1000 ${
                    collectionRate >= 80 ? 'bg-emerald-500' : collectionRate >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                />
              </div>
            </div>

          </div>

        </div>

        {/* SAĞ ALAN (4 Kolon) - Son İşlemler & Hareket Akışı */}
        <div className="lg:col-span-4 flex flex-col">
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl md:rounded-3xl p-5 border border-slate-200/80 dark:border-white/10 shadow-xs flex flex-col h-full min-h-[380px]">
            
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-white/5">
              <div>
                <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">Son İşlemler</h3>
                <p className="text-[11.5px] text-slate-500 font-medium">Sistemdeki son finansal hareketler</p>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#1e293b] text-[11px] font-bold text-slate-600 dark:text-slate-400">
                {financeRecords.length} Kayıt
              </span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col divide-y divide-slate-100 dark:divide-white/5 max-h-[340px] pr-1">
              {financeRecords.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-[#1e293b] flex items-center justify-center text-slate-400 mb-2">
                    <Activity size={20} strokeWidth={1.5} />
                  </div>
                  <span className="text-[13px] font-bold text-slate-600 dark:text-slate-300">Henüz İşlem Yok</span>
                  <p className="text-[11.5px] text-slate-400 mt-0.5">Finansal hareketler burada listelenecektir.</p>
                </div>
              ) : (
                financeRecords.slice(0, 10).map((record, index) => {
                  const title = record.title || record.description || "İşlem";
                  const amount = Number(record.amount || 0);
                  const type = record.type || "income";
                  const isIncome = type === "income";

                  return (
                    <div key={record.id || index} className="py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50/50 dark:hover:bg-white/5 px-2 rounded-xl transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                          isIncome ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-500'
                        }`}>
                          {isIncome ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-bold text-slate-800 dark:text-slate-200 truncate">{title}</span>
                          <span className="text-[10.5px] text-slate-400 font-medium">{isIncome ? 'Tahsilat / Gelir' : 'Gider Ödemesi'}</span>
                        </div>
                      </div>

                      <div className={`text-[13px] font-bold shrink-0 ${isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                        {isIncome ? '+' : '-'}₺{amount.toLocaleString('tr-TR')}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};

export default DashboardView;
