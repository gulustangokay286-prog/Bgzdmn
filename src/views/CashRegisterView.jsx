import React, { useState, useEffect } from 'react';
import { Wallet, PlusCircle, RefreshCcw, TrendingUp, TrendingDown, Search, Users, Banknote, Edit3, X, CheckCircle2, Lock, Unlock, FileText, ArrowRightLeft } from 'lucide-react';
import { financeService } from '../services/financeService';
import { firebaseService } from '../services/firebase';
import StudentSearch from '../components/StudentSearch';

const CashRegisterView = () => {
    const [activeTab, setActiveTab] = useState('transactions'); 
    const [registers, setRegisters] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [definitions, setDefinitions] = useState([]);
    const [loading, setLoading] = useState(false);
    
    const [formType, setFormType] = useState('income');
    const [formAmount, setFormAmount] = useState('');
    const [formTitle, setFormTitle] = useState('');
    const [formCategory, setFormCategory] = useState('');
    const [formRegister, setFormRegister] = useState('');
    const [formPaymentMethod, setFormPaymentMethod] = useState('Nakit Kasa');
    
    const [users, setUsers] = useState([]);
    const [studentId, setStudentId] = useState(null);
    const [studentName, setStudentName] = useState(null);
    const [studentData, setStudentData] = useState(null);

    useEffect(() => {
        fetchData();
        const fetchStudents = async () => {
            const data = await firebaseService.fetchAllUsers();
            const students = data.filter(u => {
                const role = u.fields?.role?.stringValue?.toLowerCase() || '';
                return role === 'student' || role === 'öğrenci';
            });
            setUsers(students);
        };
        fetchStudents();
    }, []);

    useEffect(() => {
        if (studentId) {
            loadStudentFinanceData(studentId);
        }
    }, [studentId]);

    const fetchData = async () => {
        setLoading(true);
        const [reg, tx, defs] = await Promise.all([
            financeService.getCashRegisters(),
            financeService.getCashTransactions(),
            financeService.getDefinitions()
        ]);
        setRegisters(reg || []);
        
        const txArray = tx || [];
        txArray.sort((a, b) => new Date(b?.date || 0) - new Date(a?.date || 0));
        setTransactions(txArray);
        setDefinitions(defs || []);
        setLoading(false);
    };

    const loadStudentFinanceData = async (sid) => {
        const record = await financeService.initOrGetStudentPayment(sid);
        setStudentData(record);
    };

    const handleTransactionSave = async (e) => {
        e.preventDefault();
        if(!formTitle || !formAmount || !formRegister) return;
        
        const success = await financeService.addCashTransaction(
            formRegister, 
            formTitle, 
            formAmount, 
            formType, 
            formCategory, 
            formPaymentMethod, 
            new Date().toISOString().split('T')[0], 
            '-'
        );
        if(success) {
            setActiveTab('transactions');
            setFormTitle(''); setFormAmount('');
            fetchData();
        }
    };

    const handleStudentPaymentSave = async (e) => {
        e.preventDefault();
        if(!studentId || !formAmount) return;
        
        const success = await financeService.addStudentPayment(studentId, formAmount, formPaymentMethod, studentName, new Date().toISOString().split('T')[0]);
        if(success) {
            setFormAmount('');
            fetchData();
            loadStudentFinanceData(studentId);
        }
    };

    const handleRegisterSave = async (e) => {
        e.preventDefault();
        if(!formTitle) return;
        const success = await financeService.addCashRegister(formTitle, formType, formAmount || 0);
        if(success) {
            setActiveTab('definitions');
            setFormTitle(''); setFormAmount('');
            fetchData();
        }
    };

    const totalBalance = financeService.calculateBalance(transactions);
    const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <div className="absolute inset-0 bg-[#FAFAFA] dark:bg-[#0b1120] z-40 overflow-y-auto overflow-x-hidden font-sans custom-scrollbar flex flex-col p-6 md:p-10 text-slate-900 dark:text-slate-100 transition-colors">
            <div className="w-full max-w-[1600px] flex flex-col flex-1 min-h-0 mx-auto">

                { }
                <div className="flex flex-col shrink-0 mb-6">
                    <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-widest">{currentDate}</span>
                    <h1 className="text-[32px] font-bold text-slate-900 dark:text-white tracking-tight leading-none flex items-center gap-3">
                        <Wallet size={32} className="text-indigo-500"/> Kasa Yönetimi
                    </h1>
                </div>

                { }
                <div className="w-full flex items-center justify-between px-5 py-4 bg-white dark:bg-[#0f172a] border border-slate-200/70 dark:border-slate-800/80 rounded-[24px] mb-6 shadow-sm shrink-0">
                    <div className="flex items-center gap-6">
                        <div>
                            <span className="text-[12px] font-bold text-slate-500 dark:text-slate-400 uppercase">Toplam Kasa Bakiyesi</span>
                            <div className="text-[24px] font-bold text-indigo-600 dark:text-indigo-400 font-mono">₺{totalBalance.toLocaleString('tr-TR')}</div>
                        </div>
                        <div className="h-10 w-px bg-slate-200 dark:bg-slate-700"></div>
                        <div>
                            <span className="text-[12px] font-bold text-slate-400 uppercase">Toplam Kasa Sayısı</span>
                            <div className="text-[20px] font-bold text-slate-700 dark:text-slate-300">{registers.length}</div>
                        </div>
                    </div>
                </div>

                { }
                <div className="flex items-center gap-2 mb-6 border-b border-slate-200 dark:border-slate-800 pb-4 shrink-0 overflow-x-auto custom-scrollbar">
                    <TabButton active={activeTab==='transactions'} onClick={() => setActiveTab('transactions')} icon={ArrowRightLeft} label="Kasa İşlemleri" />
                    <TabButton active={activeTab==='definitions'} onClick={() => setActiveTab('definitions')} icon={FileText} label="Kasa Tanımları" />
                    <TabButton active={activeTab==='student'} onClick={() => setActiveTab('student')} icon={Users} label="Öğrenci Tahsilat" />
                    <TabButton active={activeTab==='session'} onClick={() => setActiveTab('session')} icon={Lock} label="Kasa Açma/Kapatma" />
                </div>

                { }
                {activeTab === 'transactions' && (
                    <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-[#0f172a]">
                            <h3 className="font-bold text-[15px]">İşlem Geçmişi</h3>
                            <button onClick={() => {setFormType('income'); setActiveTab('create_tx');}} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[13px] font-bold hover:bg-indigo-700 transition-colors">
                                <PlusCircle size={16}/> Yeni İşlem
                            </button>
                        </div>
                        <div className="flex-1 overflow-x-auto">
                            <table className="w-full text-left min-w-[700px]">
                                <thead className="bg-slate-50 dark:bg-[#1e293b] sticky top-0">
                                    <tr>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 dark:text-slate-300 uppercase">Kasa</th>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 dark:text-slate-300 uppercase">İşlem Detayı</th>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 dark:text-slate-300 uppercase">Kategori</th>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 dark:text-slate-300 uppercase">Tarih</th>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 dark:text-slate-300 uppercase text-right">Tutar</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    {transactions.map((tx, idx) => {
                                        const isInc = tx.type === 'income';
                                        const regName = registers.find(r => r.id === tx.registerId)?.name || 'Genel Kasa';
                                        return (
                                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                <td className="py-4 px-6 font-medium text-[13px] text-slate-600 dark:text-slate-400">{regName}</td>
                                                <td className="py-4 px-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isInc ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                                            {isInc ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}
                                                        </div>
                                                        <span className="font-bold text-[14px] text-slate-900 dark:text-white">{tx.title}</span>
                                                    </div>
                                                </td>
                                                <td className="py-4 px-6 text-[13px] text-slate-500">{tx.category}</td>
                                                <td className="py-4 px-6 text-[13px] text-slate-500">{tx.date?.split('T')[0] || '-'}</td>
                                                <td className="py-4 px-6 text-right font-mono font-bold text-[15px]">
                                                    <span className={isInc ? 'text-emerald-500' : 'text-slate-800 dark:text-slate-200'}>
                                                        {isInc ? '+' : '-'}₺{(Number(tx.amount)).toLocaleString()}
                                                    </span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {transactions.length === 0 && (
                                        <tr><td colSpan="5" className="py-10 text-center text-slate-400">İşlem kaydı bulunmuyor.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'definitions' && (
                    <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200/80 dark:border-slate-800/80 shadow-sm p-6 flex-1 overflow-y-auto min-h-0">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                            <h3 className="font-bold text-[16px]">Kayıtlı Kasalar</h3>
                            <button onClick={() => setActiveTab('create_register')} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[13px] font-bold transition-colors">
                                <PlusCircle size={16}/> Kasa Ekle
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {registers.map(reg => (
                                <div key={reg.id} className="border border-slate-200 dark:border-slate-700 p-5 rounded-2xl flex flex-col gap-2 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-bl-full -mr-8 -mt-8"></div>
                                    <span className="text-[11px] font-bold text-slate-400 uppercase">{reg.type}</span>
                                    <span className="text-[18px] font-bold text-slate-900 dark:text-white">{reg.name}</span>
                                    <span className="text-[14px] text-slate-500">Açılış Bakiyesi: ₺{reg.openingBalance}</span>
                                    <div className="mt-2 text-[12px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1 rounded-lg w-max">{reg.status}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'student' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                        <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200/80 dark:border-slate-800/80 shadow-sm p-5 flex flex-col h-full">
                            <h3 className="text-[13px] font-bold text-slate-500 uppercase tracking-wider mb-4">Öğrenci Seçimi</h3>
                            <div className="flex-1 overflow-y-auto">
                                <StudentSearch users={users} selectedId={studentId} onSelect={(id, name) => { setStudentId(id); setStudentName(name); }} />
                            </div>
                        </div>
                        <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200/80 dark:border-slate-800/80 shadow-sm p-8">
                            {studentData ? (
                                <div className="flex flex-col gap-6">
                                    <h2 className="text-[22px] font-bold text-slate-900 dark:text-white">{studentName}</h2>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
                                            <span className="text-[11px] font-bold text-slate-400 uppercase">Eğitim Planı</span>
                                            <div className="text-[16px] font-bold text-slate-900 dark:text-white mt-1">₺{(studentData.total || 0).toLocaleString()}</div>
                                        </div>
                                        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl">
                                            <span className="text-[11px] font-bold text-emerald-500 uppercase">Tahsil Edilen</span>
                                            <div className="text-[20px] font-extrabold text-emerald-600 mt-1 font-mono">₺{(studentData.paid || 0).toLocaleString()}</div>
                                        </div>
                                        <div className="p-4 bg-rose-50 dark:bg-rose-900/10 rounded-2xl">
                                            <span className="text-[11px] font-bold text-rose-500 uppercase">Kalan Bakiye</span>
                                            <div className="text-[20px] font-extrabold text-rose-600 mt-1 font-mono">₺{Math.max(0, (studentData.total||0)-(studentData.paid||0)).toLocaleString()}</div>
                                        </div>
                                    </div>
                                    <div className="mt-4 p-6 border border-slate-200 dark:border-slate-700 rounded-2xl">
                                        <h3 className="font-bold mb-4">Tahsilat Al</h3>
                                        <form onSubmit={handleStudentPaymentSave} className="flex gap-4 items-end">
                                            <div className="flex-1">
                                                <label className="block text-[12px] text-slate-500 font-bold mb-1">Tutar (₺)</label>
                                                <input type="number" required value={formAmount} onChange={e=>setFormAmount(e.target.value)} className="w-full px-4 py-2 bg-slate-100 dark:bg-[#0b1120] border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-indigo-500 transition-colors"/>
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-[12px] text-slate-500 font-bold mb-1">Ödeme Yöntemi</label>
                                                <select value={formPaymentMethod} onChange={e=>setFormPaymentMethod(e.target.value)} className="w-full px-4 py-2 bg-slate-100 dark:bg-[#0b1120] border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-indigo-500 transition-colors">
                                                    <option>Nakit Kasa</option><option>Kredi Kartı</option><option>Havale</option>
                                                </select>
                                            </div>
                                            <button type="submit" className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-xl h-[40px]">Tahsil Et</button>
                                        </form>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center text-slate-400 py-20">Lütfen soldan bir öğrenci seçin.</div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'session' && (
                    <div className="flex flex-col items-center justify-center p-20 bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
                        <Lock size={48} className="text-slate-300 mb-4"/>
                        <h2 className="text-[20px] font-bold mb-2">Gün Sonu Kasa Mutabakatı</h2>
                        <p className="text-slate-500 text-[14px] max-w-md text-center mb-6">Kasanızdaki fiziksel parayı sayıp sistemdeki bakiye ile eşleştirerek gün sonu kapatma işlemi yapabilirsiniz.</p>
                        <button className="px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl">Kasa Kapatma İşlemi Başlat</button>
                    </div>
                )}

                {activeTab === 'create_tx' && (
                    <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200 dark:border-slate-800 p-6 flex-1 flex flex-col shadow-sm max-w-xl mx-auto w-full mt-10">
                        <h2 className="font-bold text-[18px] mb-6">Yeni Kasa İşlemi</h2>
                        <form onSubmit={handleTransactionSave} className="flex flex-col gap-5 flex-1">
                            <div className="grid grid-cols-2 gap-3 mb-2">
                                <button type="button" onClick={()=>setFormType('income')} className={`py-3 rounded-xl font-bold transition-colors border ${formType==='income'?'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700/50':'bg-slate-50 text-slate-500 border-slate-200 dark:bg-[#0b1120] dark:border-slate-800'}`}>Gelir (+)</button>
                                <button type="button" onClick={()=>setFormType('expense')} className={`py-3 rounded-xl font-bold transition-colors border ${formType==='expense'?'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700/50':'bg-slate-50 text-slate-500 border-slate-200 dark:bg-[#0b1120] dark:border-slate-800'}`}>Gider (-)</button>
                            </div>
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Açıklama</label><input required value={formTitle} onChange={e=>setFormTitle(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors"/></div>
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Tutar (₺)</label><input type="number" required value={formAmount} onChange={e=>setFormAmount(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono focus:border-indigo-500 transition-colors"/></div>
                            <div>
                                <label className="text-[12px] text-slate-500 font-bold block mb-1">Kasa Seçimi</label>
                                <select required value={formRegister} onChange={e=>setFormRegister(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors">
                                    <option value="">Seçiniz...</option>
                                    {registers.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
                                    <option value="Genel">Genel Kasa</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 mt-auto pt-6 border-t border-slate-200 dark:border-slate-800">
                                <button type="button" onClick={()=>setActiveTab('transactions')} className="px-6 py-2.5 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">İptal Et</button>
                                <button type="submit" className="px-6 py-2.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm">Kaydet</button>
                            </div>
                        </form>
                    </div>
                )}

                {activeTab === 'create_register' && (
                    <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200 dark:border-slate-800 p-6 flex-1 flex flex-col shadow-sm max-w-xl mx-auto w-full mt-10">
                        <h2 className="font-bold text-[18px] mb-6">Yeni Kasa Tanımla</h2>
                        <form onSubmit={handleRegisterSave} className="flex flex-col gap-5 flex-1">
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Kasa Adı</label><input required value={formTitle} onChange={e=>setFormTitle(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors" placeholder="Örn: Merkez Kasa"/></div>
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Kasa Tipi</label><select value={formType} onChange={e=>setFormType(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors"><option>Nakit</option><option>Kredi Kartı</option></select></div>
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Açılış Bakiyesi (₺)</label><input type="number" required value={formAmount} onChange={e=>setFormAmount(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono focus:border-indigo-500 transition-colors"/></div>
                            <div className="flex justify-end gap-3 mt-auto pt-6 border-t border-slate-200 dark:border-slate-800">
                                <button type="button" onClick={()=>setActiveTab('definitions')} className="px-6 py-2.5 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">İptal Et</button>
                                <button type="submit" className="px-6 py-2.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm">Oluştur</button>
                            </div>
                        </form>
                    </div>
                )}

            </div>
        </div>
    );
};

const TabButton = ({ active, onClick, icon: Icon, label }) => (
    <button onClick={onClick} className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-bold transition-all whitespace-nowrap ${active ? 'bg-indigo-600 text-white shadow-md' : 'bg-white dark:bg-[#0f172a] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
        <Icon size={16}/> {label}
    </button>
);

export default CashRegisterView;
