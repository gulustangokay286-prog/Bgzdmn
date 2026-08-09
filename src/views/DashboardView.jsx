import React, { useState, useEffect } from 'react';
import { GraduationCap, UserSquare, UserPlus, Hourglass, TrendingUp, TrendingDown, Wallet, Activity, CalendarDays, MoreHorizontal, ArrowRight, ArrowUpRight, ArrowDownRight, CheckCircle2, BarChart3, AlertCircle, Download, FileSpreadsheet, Filter } from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { financeService } from '../services/financeService';
import dashboardIcon from '../assets/dashboard_icon.png';
import { useLicense } from '../hooks/useLicense';


const Sparkline = ({ type }) => {
  const isPositive = type === 'positive';
  const color = isPositive ? '#10b981' : '#f43f5e';
  const fillUrl = isPositive ? 'url(#spark-pos)' : 'url(#spark-neg)';

  const pathPos = "M0,40 C10,35 20,40 30,25 C40,10 50,20 60,15 C70,10 80,5 90,0 L100,0 L100,50 L0,50 Z";
  const linePos = "M0,40 C10,35 20,40 30,25 C40,10 50,20 60,15 C70,10 80,5 90,0 L100,0";

  const pathNeg = "M0,10 C10,15 20,10 30,25 C40,40 50,30 60,35 C70,40 80,45 90,50 L100,50 L100,50 L0,50 Z";
  const lineNeg = "M0,10 C10,15 20,10 30,25 C40,40 50,30 60,35 C70,40 80,45 90,50 L100,50";

  return (
    <div className="absolute bottom-0 left-0 right-0 h-16 opacity-30 pointer-events-none">
      <svg viewBox="0 0 100 50" className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="spark-pos" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <linearGradient id="spark-neg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={isPositive ? pathPos : pathNeg} fill={fillUrl} />
        <path d={isPositive ? linePos : lineNeg} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, trend }) => (
  <div className="bg-white dark:bg-[#0f172a] rounded-[24px] p-6 border border-slate-200 dark:border-white/10 flex flex-col justify-between relative overflow-hidden group">
    <div className="flex justify-between items-start mb-6 relative z-10">
      <div className="flex items-center justify-center text-slate-700 dark:text-slate-300">
        <Icon size={24} strokeWidth={2} />
      </div>
      {trend !== undefined && (
        <div className={`text-[12px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 backdrop-blur-md ${trend > 0 ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10'}`}>
          {trend > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {Math.abs(trend)}%
        </div>
      )}
    </div>

    <div className="relative z-10">
      <div className="text-[32px] font-semibold text-slate-900 dark:text-white mb-1 tracking-tight leading-none">{value}</div>
      <div className="text-[13px] font-medium text-slate-600 dark:text-slate-400 mt-2">{title}</div>
    </div>

    {trend !== undefined && <Sparkline type={trend > 0 ? 'positive' : 'negative'} />}
  </div>
);


const MainChart = ({ records }) => {
  const [hoveredMonth, setHoveredMonth] = useState(null);

  const monthlyData = Array(12).fill(0).map(() => ({ income: 0, expense: 0 }));
  records.forEach(r => {

    const dStr = r.fields?.date?.stringValue || r.fields?.date?.timestampValue;
    const date = dStr ? new Date(dStr) : new Date();
    const month = date.getMonth();
    const amount = Number(r.fields?.amount?.doubleValue || r.fields?.amount?.integerValue || 0);
    if (r.fields?.type?.stringValue === 'income') {
      monthlyData[month].income += amount;
    } else {
      monthlyData[month].expense += amount;
    }
  });

  const maxVal = Math.max(...monthlyData.map(d => Math.max(d.income, d.expense)), 5000);

  const getPoints = (type) => {
    return monthlyData.map((d, i) => {
      const x = (i / 11) * 800;
      const y = 240 - ((d[type] / maxVal) * 200);
      return `${x},${y}`;
    });
  };

  const incomePoints = getPoints('income');
  const expensePoints = getPoints('expense');

  const pathIncomeArea = `M0,240 L${incomePoints.join(' L')} L800,240 Z`;
  const pathIncomeLine = `M${incomePoints.join(' L')}`;

  const pathExpenseArea = `M0,240 L${expensePoints.join(' L')} L800,240 Z`;
  const pathExpenseLine = `M${expensePoints.join(' L')}`;

  const months = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

  return (
    <div className="w-full h-[240px] mt-6 relative">
      <svg viewBox="0 0 800 240" className="w-full h-full overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="area-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0f172a" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="area-gradient-2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#94a3b8" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 60, 120, 180, 240].map(y => (
          <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}

        { }
        <path d={pathExpenseArea} fill="url(#area-gradient-2)" />
        <path d={pathExpenseLine} fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6,4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

        { }
        <path d={pathIncomeArea} fill="url(#area-gradient)" />
        <path d={pathIncomeLine} fill="none" stroke="#0f172a" strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />

        { }
        {incomePoints.map((pt, i) => {
          const [x, y] = pt.split(',');
          return (
            <circle
              key={`inc-${i}`} cx={x} cy={y} r="5"
              fill={hoveredMonth === i ? "#0f172a" : "#fff"}
              stroke="#0f172a" strokeWidth="2"
              onMouseEnter={() => setHoveredMonth(i)}
              onMouseLeave={() => setHoveredMonth(null)}
              className="transition-all cursor-pointer"
            />
          );
        })}
      </svg>

      { }
      {hoveredMonth !== null && (
        <div
          className="absolute top-[20px] bg-slate-900 text-white text-[11px] font-medium px-4 py-2 rounded-lg shadow-xl shadow-slate-900/20 flex flex-col gap-1 items-center transform -translate-x-1/2 z-10 pointer-events-none"
          style={{ left: `${(hoveredMonth / 11) * 100}%` }}
        >
          <span className="text-emerald-400 font-bold">+₺{monthlyData[hoveredMonth].income.toLocaleString('tr-TR')}</span>
          <span className="text-rose-400 font-bold">-₺{monthlyData[hoveredMonth].expense.toLocaleString('tr-TR')}</span>
          <span className="text-slate-600 dark:text-slate-400 text-[10px] uppercase tracking-wider">{months[hoveredMonth]}</span>
          <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45"></div>
        </div>
      )}

      <div className="flex justify-between mt-4 px-2 text-[11px] font-medium text-slate-600 dark:text-slate-400 relative z-0">
        {months.map((m, i) => <span key={m} className={hoveredMonth === i ? 'text-slate-900 dark:text-white font-bold' : ''}>{m}</span>)}
      </div>
    </div>
  );
};


const ProgressRing = ({ percentage, color = "#0f172a" }) => {
  const radius = 36;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-[100px] h-[100px]">
      <svg className="transform -rotate-90 w-full h-full" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} stroke="#f1f5f9" strokeWidth="8" fill="transparent" />
        <circle
          cx="50" cy="50" r={radius}
          stroke={color}
          strokeWidth="8"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[22px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none">{percentage}%</span>
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
  const [optionsOpen, setOptionsOpen] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const fetchedUsers = await firebaseService.fetchAllUsers();
        const fetchedFinance = await financeService.getCashTransactions();
        const fetchedStudentPays = await financeService.fetchStudentPayments();

        setUsers(fetchedUsers);
        setFinanceRecords(fetchedFinance);
        setStudentPayments(fetchedStudentPays);
      } catch (error) {
        console.error("Dashboard veri yükleme hatası:", error);
      }
      setLoading(false);
    };
    loadData();
  }, []);

  const pending = users.filter(u => ['pending', 'awaiting_approval'].includes(u.fields?.status?.stringValue?.toLowerCase())).length;
  const students = users.filter(u => u.fields?.role?.stringValue === 'student' || u.fields?.role?.stringValue === 'öğrenci').length;
  const teachers = users.filter(u => u.fields?.role?.stringValue === 'teacher' || u.fields?.role?.stringValue === 'öğretmen').length;
  const parents = users.filter(u => u.fields?.role?.stringValue === 'parent' || u.fields?.role?.stringValue === 'veli').length;

  const bal = financeService.calculateBalance(financeRecords);
  const income = financeRecords.filter(r => r.type === 'income').reduce((acc, r) => acc + Number(r.amount || 0), 0);
  const expense = financeRecords.filter(r => r.type === 'expense').reduce((acc, r) => acc + Number(r.amount || 0), 0);

  const delayedPayments = studentPayments.filter(p => p.status === 'Gecikmiş Ödeme').length;


  const paidPayments = studentPayments.filter(p => p.status === 'Ödendi').length;
  const collectionRate = studentPayments.length > 0 ? Math.round((paidPayments / studentPayments.length) * 100) : 100;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-[#FAFAFA] dark:bg-[#0b1120] relative">
        <Activity size={32} className="text-slate-600 dark:text-slate-400 mb-4 animate-spin" strokeWidth={1.5} />
      </div>
    );
  }

  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Geriye dönük uyumluluk: Eski lisans anahtarlarında hiç '/dashboard/' alt modülü yoksa, hepsine izin ver
  const hasSubModules = license?.modules?.some(m => m.startsWith('/dashboard/'));
  const showWidget = (path) => {
    if (hasSubModules) return canAccess(path);
    return canAccess('/dashboard'); 
  };

  return (
    <div className="w-full flex flex-col font-sans gap-6 pb-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-2 w-full">
        <div className="flex items-center gap-5">
          <div className="flex flex-col">
            <span className="text-[11px] md:text-[13px] font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">{currentDate}</span>
            <h1 className="text-[28px] md:text-[36px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none">Genel Bakış</h1>
          </div>
        </div>
      </div>

      { }
      <div className="w-full flex-1 flex flex-col gap-8">

        { }
        {showWidget('/dashboard/stats') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full shrink-0">
          <StatCard title="Aktif Öğrenciler" value={students} icon={GraduationCap} trend={4.2} />
          <StatCard title="Öğretmen Kadrosu" value={teachers} icon={UserSquare} trend={1.5} />
          <StatCard title="Kayıtlı Veliler" value={parents} icon={UserPlus} trend={8.1} />
          <StatCard title="Bekleyen Talepler" value={pending} icon={Hourglass} trend={-2.4} />
        </div>
        )}

        { }
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 w-full flex-1">

          { }
          <div className="xl:col-span-2 flex flex-col gap-8 h-full">

            { }
            {showWidget('/dashboard/cash-flow') && (
            <div className="bg-white dark:bg-[#0f172a] rounded-3xl md:rounded-[32px] p-5 md:p-8 border border-slate-200 dark:border-white/10 shadow-sm w-full flex flex-col group hover:shadow-[0_10px_30px_-10px_rgba(15,23,42,0.1)] hover:-translate-y-1 transition-all duration-300">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-[#1e293b] group-hover:bg-white flex items-center justify-center text-slate-500 group-hover:text-[#0f172a] transition-colors duration-300">
                    <BarChart3 size={20} strokeWidth={2} />
                  </div>
                  <div>
                    <h2 className="text-[22px] font-semibold text-slate-900 dark:text-white tracking-tight">Nakit Akışı Raporu</h2>
                    <p className="text-[13px] text-slate-500">Gelir ve gider dengesi (Aylık bazda)</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-900"></div>
                    <span className="text-[12px] font-medium text-slate-600 dark:text-slate-400">Gelir</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
                    <span className="text-[12px] font-medium text-slate-600 dark:text-slate-400">Gider</span>
                  </div>
                </div>
              </div>

              <MainChart records={financeRecords} />
            </div>
            )}

            { }
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
              { }
              {showWidget('/dashboard/balance') && (
              <div className="bg-white dark:bg-[#0f172a] rounded-3xl md:rounded-[32px] p-5 md:p-8 border border-slate-200 dark:border-white/10 shadow-sm flex flex-col justify-center group hover:shadow-[0_10px_30px_-10px_rgba(15,23,42,0.1)] hover:-translate-y-1 transition-all duration-300">
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <div className="text-[13px] font-medium text-slate-500 mb-1">Toplam Bakiye</div>
                    <div className="text-[36px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none">₺{bal.toLocaleString('tr-TR')}</div>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-[#1e293b] group-hover:bg-white text-slate-500 group-hover:text-[#0f172a] flex items-center justify-center transition-colors duration-300">
                    <Wallet size={20} strokeWidth={2} />
                  </div>
                </div>

                <hr className="border-slate-200 dark:border-white/10 my-5" />

                <div className="flex justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 text-emerald-600 mb-1">
                      <ArrowUpRight size={14} strokeWidth={2} />
                      <span className="text-[12px] font-semibold">Gelen</span>
                    </div>
                    <div className="text-[16px] font-semibold text-slate-900 dark:text-white">₺{income.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div className="w-px bg-slate-50 dark:bg-[#1e293b] mx-4"></div>
                  <div>
                    <div className="flex items-center gap-1.5 text-rose-500 mb-1">
                      <ArrowDownRight size={14} strokeWidth={2} />
                      <span className="text-[12px] font-semibold">Giden</span>
                    </div>
                    <div className="text-[16px] font-semibold text-slate-900 dark:text-white">₺{expense.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</div>
                  </div>
                </div>
              </div>
              )}

              { }
              {showWidget('/dashboard/collection') && (
              <div className="bg-white dark:bg-[#0f172a] rounded-3xl md:rounded-[32px] p-5 md:p-8 border border-slate-200 dark:border-white/10 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6 group hover:shadow-[0_10px_30px_-10px_rgba(15,23,42,0.1)] hover:-translate-y-1 transition-all duration-300">
                <div className="flex flex-col h-full justify-between w-full sm:w-auto text-center sm:text-left items-center sm:items-start">
                  <div>
                    <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white mb-1 tracking-tight">Tahsilat Performansı</h3>
                    <p className="text-[13px] text-slate-500 max-w-[160px]">Aylık beklenen ödemelerin gerçekleşme oranı.</p>
                  </div>

                  {delayedPayments > 0 ? (
                    <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-rose-50 rounded-xl w-fit">
                      <AlertCircle size={14} className="text-rose-600" />
                      <span className="text-[12px] font-semibold text-rose-700">{delayedPayments} Gecikmiş Ödeme</span>
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-xl w-fit">
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      <span className="text-[12px] font-semibold text-emerald-700">Tümü Tahsil Edildi</span>
                    </div>
                  )}
                </div>

                <div className="flex-shrink-0">
                  <ProgressRing percentage={collectionRate} />
                </div>
              </div>
              )}
            </div>

          </div>

          { }
          {showWidget('/dashboard/recent-transactions') && (
          <div className="xl:col-span-1 flex flex-col w-full h-full">
            <div className="bg-white dark:bg-[#0f172a] rounded-3xl md:rounded-[32px] border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden flex flex-col h-full min-h-[400px] hover:shadow-[0_10px_30px_-10px_rgba(15,23,42,0.1)] transition-all duration-300">

              <div className="px-5 pt-5 pb-3 md:px-8 md:pt-8 md:pb-4 flex justify-between items-end bg-white dark:bg-[#0f172a] z-10 sticky top-0 relative">
                <div>
                  <h2 className="text-[20px] font-semibold text-slate-900 dark:text-white tracking-tight">Son İşlemler</h2>
                  <p className="text-[13px] text-slate-500 mt-1">Sistemdeki son hareketler</p>
                </div>
                <div className="relative">
                  <button 
                    onClick={() => setOptionsOpen(!optionsOpen)}
                    className="w-8 h-8 rounded-full bg-slate-50 dark:bg-[#1e293b] flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-white hover:text-[#0f172a] transition-all duration-300"
                    title="Seçenekler"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {optionsOpen && (
                    <div className="absolute top-[110%] right-0 mt-2 w-48 bg-slate-50 dark:bg-[#1e293b] rounded-2xl p-2 z-[100] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] border border-slate-200 dark:border-white/10 flex flex-col gap-1 origin-top-right animate-in fade-in zoom-in-95 duration-200">
                      <button className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all text-slate-700 dark:text-slate-300 hover:bg-white hover:text-[#0f172a]" onClick={() => setOptionsOpen(false)}><Download size={16} /> PDF İndir</button>
                      <button className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all text-slate-700 dark:text-slate-300 hover:bg-white hover:text-[#0f172a]" onClick={() => setOptionsOpen(false)}><FileSpreadsheet size={16} /> Excel İndir</button>
                      <button className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all text-slate-700 dark:text-slate-300 hover:bg-white hover:text-[#0f172a]" onClick={() => setOptionsOpen(false)}><Filter size={16} /> Gelişmiş Filtrele</button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4 bg-white dark:bg-[#0f172a] relative">
                {financeRecords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-slate-600 dark:text-slate-400">
                    <Activity size={24} className="mb-2 opacity-50" />
                    <span className="text-[13px] font-medium">İşlem bulunamadı.</span>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {financeRecords.slice(0, 15).map((record, index) => {
                      const title = record.title || "İsimsiz İşlem";
                      const amount = Number(record.amount || 0);
                      const type = record.type || "income";
                      const isIncome = type === "income";

                      return (
                        <React.Fragment key={record.id || index}>
                          <div className="flex justify-between items-center px-4 py-4 hover:bg-slate-50/80 dark:bg-[#1e293b]/80 transition-colors rounded-2xl group cursor-pointer">
                            <div className="flex items-center gap-4">
                              <div className={`w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-105 ${isIncome ? 'bg-slate-50 dark:bg-[#1e293b] text-slate-800 dark:text-slate-200 group-hover:bg-white group-hover:text-[#0f172a]' : 'bg-slate-50 dark:bg-[#1e293b] text-slate-500 group-hover:bg-white group-hover:text-[#991b1b]'}`}>
                                {isIncome ? <TrendingUp size={18} strokeWidth={2} /> : <TrendingDown size={18} strokeWidth={2} />}
                              </div>
                              <div className="flex flex-col justify-center">
                                <div className="font-semibold text-[14px] text-slate-900 dark:text-white truncate max-w-[150px] leading-tight" title={title}>
                                  {title.split(' | ')[0]}
                                </div>
                                <div className="text-[12px] font-medium text-slate-500 mt-0.5">{isIncome ? 'Gelir' : 'Gider'}</div>
                              </div>
                            </div>
                            <div className={`font-semibold text-[15px] shrink-0 text-right ${isIncome ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>
                              {isIncome ? '+' : '-'}₺{amount.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
                            </div>
                          </div>
                          { }
                          {index !== financeRecords.slice(0, 15).length - 1 && (
                            <hr className="border-slate-200 dark:border-white/10 mx-4" />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="p-4 bg-white dark:bg-[#0f172a] border-t border-slate-50">
                <button className="w-full py-3 flex items-center justify-center gap-2 text-[13px] font-semibold text-slate-900 dark:text-white bg-slate-50 dark:bg-[#1e293b] hover:bg-white hover:text-[#0f172a] rounded-2xl transition-all duration-300">
                  Tüm İşlemleri Gör <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default DashboardView;
