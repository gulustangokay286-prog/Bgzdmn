import React, { useState, useEffect } from 'react';
import { PieChart as PieIcon, BarChart4, TrendingUp, TrendingDown, Filter, FileText, ArrowDownToLine } from 'lucide-react';
import { financeService } from '../services/financeService';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

const FinanceReportsView = ({ onClose }) => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [timeFilter, setTimeFilter] = useState('all'); // month, year, all
    
    const handleExportCSV = () => {
        if (!transactions || transactions.length === 0) {
            alert('Dışa aktarılacak veri bulunamadı.');
            return;
        }
        
        const filtered = getFilteredData();
        
        // Define CSV Headers
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // UTF-8 BOM for Excel
        csvContent += "Tarih,Islem Tipi,Kategori,Baslik,Tutar (TL),Kasa ID\n";
        
        filtered.forEach(t => {
            const dateStr = t.date ? t.date.split('T')[0] : '';
            const typeStr = t.type === 'income' ? 'Gelir' : 'Gider';
            const catStr = t.category || '';
            const titleStr = (t.title || '').replace(/,/g, ' '); // Avoid CSV commas
            const amountStr = t.amount || 0;
            const regStr = t.registerId || '';
            
            const row = `${dateStr},${typeStr},${catStr},${titleStr},${amountStr},${regStr}`;
            csvContent += row + "\n";
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Muhasebe_Raporu_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    useEffect(() => {
        const fetchTx = async () => {
            setLoading(true);
            const tx = await financeService.getCashTransactions();
            setTransactions(tx);
            setLoading(false);
        };
        fetchTx();
    }, []);

    // Helper: Filter by time
    const getFilteredData = () => {
        const now = new Date();
        return transactions.filter(t => {
            if(!t.date) return false;
            const tDate = new Date(t.date);
            if(timeFilter === 'month') {
                return tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear();
            }
            if(timeFilter === 'year') {
                return tDate.getFullYear() === now.getFullYear();
            }
            return true;
        });
    };

    const filteredTx = getFilteredData();

    const totalIncome = filteredTx.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalExpense = filteredTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const netBalance = totalIncome - totalExpense;

    // Prepare data for Bar Chart (Monthly Comparison if year/all, Daily if month)
    const getBarChartData = () => {
        const map = {};
        filteredTx.forEach(t => {
            if(!t.date) return;
            // Group by Month (YYYY-MM)
            const label = timeFilter === 'month' ? t.date.split('T')[0] : t.date.substring(0, 7);
            if(!map[label]) map[label] = { name: label, Gelir: 0, Gider: 0 };
            if(t.type === 'income') map[label].Gelir += Number(t.amount);
            else map[label].Gider += Number(t.amount);
        });
        return Object.values(map).sort((a,b) => a.name.localeCompare(b.name));
    };

    // Prepare data for Pie Chart (Expenses by Category)
    const getExpensePieData = () => {
        const map = {};
        filteredTx.filter(t => t.type === 'expense').forEach(t => {
            const cat = t.category || 'Diğer';
            map[cat] = (map[cat] || 0) + Number(t.amount);
        });
        return Object.keys(map).map(k => ({ name: k, value: map[k] }));
    };

    const COLORS = ['#f43f5e', '#8b5cf6', '#f59e0b', '#10b981', '#3b82f6', '#64748b'];

    const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <div className="absolute inset-0 bg-[#FAFAFA] dark:bg-[#0b1120] z-40 overflow-y-auto overflow-x-hidden font-sans custom-scrollbar flex flex-col p-6 md:p-10 text-slate-900 dark:text-slate-100 transition-colors">
            <div className="w-full max-w-[1600px] flex flex-col flex-1 min-h-0 mx-auto">
                
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="flex bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 p-1">
                            <button onClick={()=>setTimeFilter('month')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold ${timeFilter==='month'?'bg-slate-900 dark:bg-white text-white dark:text-slate-900':'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>Bu Ay</button>
                            <button onClick={()=>setTimeFilter('year')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold ${timeFilter==='year'?'bg-slate-900 dark:bg-white text-white dark:text-slate-900':'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>Bu Yıl</button>
                            <button onClick={()=>setTimeFilter('all')} className={`px-4 py-1.5 rounded-lg text-[13px] font-bold ${timeFilter==='all'?'bg-slate-900 dark:bg-white text-white dark:text-slate-900':'text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>Tümü</button>
                        </div>
                    </div>
                    <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-[#0f172a] text-emerald-600 dark:text-emerald-400 rounded-xl text-[13px] font-bold border border-emerald-100 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors shadow-sm">
                        <ArrowDownToLine size={16}/> Muhasebeye Excel Aktar
                    </button>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white dark:bg-[#0f172a] p-6 rounded-[24px] border border-slate-200/80 dark:border-slate-800/80 shadow-sm relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-50 dark:bg-emerald-900/10 rounded-full flex items-center justify-center">
                            <TrendingUp size={32} className="text-emerald-500/20"/>
                        </div>
                        <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-wider mb-2">Toplam Gelir</h3>
                        <div className="text-[32px] font-extrabold text-emerald-600 font-mono">₺{totalIncome.toLocaleString()}</div>
                    </div>
                    <div className="bg-white dark:bg-[#0f172a] p-6 rounded-[24px] border border-slate-200/80 dark:border-slate-800/80 shadow-sm relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-rose-50 dark:bg-rose-900/10 rounded-full flex items-center justify-center">
                            <TrendingDown size={32} className="text-rose-500/20"/>
                        </div>
                        <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-wider mb-2">Toplam Gider</h3>
                        <div className="text-[32px] font-extrabold text-rose-600 font-mono">₺{totalExpense.toLocaleString()}</div>
                    </div>
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 rounded-[24px] shadow-sm relative overflow-hidden">
                        <h3 className="text-[13px] font-bold text-white/70 uppercase tracking-wider mb-2">Net Durum</h3>
                        <div className="text-[32px] font-extrabold text-white font-mono">
                            {netBalance >= 0 ? '+' : '-'}₺{Math.abs(netBalance).toLocaleString()}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                    
                    <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex flex-col p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold text-[16px] flex items-center gap-2"><BarChart4 size={18} className="text-indigo-500"/> Dönemsel Gelir Gider Analizi</h3>
                        </div>
                        <div className="flex-1 min-h-[300px]">
                            {getBarChartData().length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={getBarChartData()}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} tickFormatter={(value) => `₺${(value/1000)}k`} />
                                        <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                        <Legend wrapperStyle={{paddingTop: '20px'}} />
                                        <Bar dataKey="Gelir" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                                        <Bar dataKey="Gider" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={40} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-400">Veri bulunamadı.</div>
                            )}
                        </div>
                    </div>
                    
                    <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex flex-col p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold text-[16px] flex items-center gap-2"><PieIcon size={18} className="text-indigo-500"/> Gider Dağılımı</h3>
                        </div>
                        <div className="flex-1 min-h-[250px] flex flex-col items-center justify-center">
                            {getExpensePieData().length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={getExpensePieData()}
                                            cx="50%" cy="50%"
                                            innerRadius={60}
                                            outerRadius={90}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {getExpensePieData().map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value) => `₺${value.toLocaleString()}`} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="text-slate-400">Gider verisi bulunamadı.</div>
                            )}
                            
                            <div className="mt-4 w-full flex flex-col gap-2">
                                {getExpensePieData().map((entry, index) => (
                                    <div key={index} className="flex items-center justify-between text-[12px]">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS[index % COLORS.length]}}></div>
                                            <span className="text-slate-600 dark:text-slate-400 font-medium">{entry.name}</span>
                                        </div>
                                        <span className="font-bold">₺{entry.value.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default FinanceReportsView;
