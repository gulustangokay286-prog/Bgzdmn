import React, { useState, useEffect } from 'react';
import { Landmark, PlusCircle, CreditCard, Building, RefreshCcw, FileText, ArrowRightLeft, Percent } from 'lucide-react';
import { financeService } from '../services/financeService';

const BankManagementView = ({ initialTab = 'accounts', onClose }) => {
    const [activeTab, setActiveTab] = useState(initialTab); 
    const [accounts, setAccounts] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [checks, setChecks] = useState([]);
    const [cashRegisters, setCashRegisters] = useState([]); 
    const [loading, setLoading] = useState(false);
    
    const [formBankName, setFormBankName] = useState('');
    const [formIban, setFormIban] = useState('');
    const [formBalance, setFormBalance] = useState('');

    const [txType, setTxType] = useState('income');
    const [txAccount, setTxAccount] = useState('');
    const [txAmount, setTxAmount] = useState('');
    const [txTitle, setTxTitle] = useState('');

    const [chkType, setChkType] = useState('Çek');
    const [chkDir, setChkDir] = useState('Alınan');
    const [chkAmount, setChkAmount] = useState('');
    const [chkDue, setChkDue] = useState('');
    const [chkRelated, setChkRelated] = useState('');

    const [virmFromType, setVirmFromType] = useState('cash'); 
    const [virmFromId, setVirmFromId] = useState('');
    const [virmToType, setVirmToType] = useState('bank');
    const [virmToId, setVirmToId] = useState('');
    const [virmAmount, setVirmAmount] = useState('');
    const [virmDesc, setVirmDesc] = useState('');

    const [posAccount, setPosAccount] = useState('');
    const [posAmount, setPosAmount] = useState('');
    const [posRate, setPosRate] = useState('2.5');
    const [posDesc, setPosDesc] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const [accs, tx, chk, cash] = await Promise.all([
            financeService.getBankAccounts(),
            financeService.getBankTransactions(),
            financeService.getChecksAndNotes(),
            financeService.getCashRegisters()
        ]);
        setAccounts(accs || []);
        setTransactions((tx || []).sort((a,b) => new Date(b?.date || 0) - new Date(a?.date || 0)));
        setChecks(chk || []);
        setCashRegisters(cash || []);
        setLoading(false);
    };

    const handleSaveAccount = async (e) => {
        e.preventDefault();
        await financeService.addBankAccount(formBankName, 'Merkez', formIban, 'Vadesiz', formBalance);
        setActiveTab('accounts');
        setFormBankName(''); setFormIban(''); setFormBalance('');
        fetchData();
    };

    const handleSaveTx = async (e) => {
        e.preventDefault();
        await financeService.addBankTransaction(txAccount, txTitle, txAmount, txType, new Date().toISOString().split('T')[0], 'Manuel İşlem');
        setActiveTab('transactions');
        setTxTitle(''); setTxAmount('');
        fetchData();
    };

    const handleSaveCheck = async (e) => {
        e.preventDefault();
        await financeService.addCheckOrNote(chkType, chkDir, chkAmount, chkDue, chkRelated);
        setActiveTab('checks');
        setChkAmount(''); setChkDue(''); setChkRelated('');
        fetchData();
    };

    const handleCheckStatusChange = async (id, newStatus) => {
        await financeService.updateCheckNoteStatus(id, newStatus);
        fetchData();
    };

    const handleVirmanSave = async (e) => {
        e.preventDefault();
        if(!virmFromId || !virmToId) return alert('Kaynak ve Hedef seçilmelidir.');
        if(virmFromType === virmToType && virmFromId === virmToId) return alert('Aynı hesaplar arası transfer yapılamaz.');
        
        await financeService.transferFunds(virmFromType, virmFromId, virmToType, virmToId, virmAmount, virmDesc);
        setActiveTab('virman');
        setVirmAmount(''); setVirmDesc('');
        fetchData();
    };

    const handlePosSave = async (e) => {
        e.preventDefault();
        if(!posAccount) return alert('Banka seçmelisiniz.');
        await financeService.processPosTransaction(posAccount, posAmount, posRate, posDesc);
        setActiveTab('pos');
        setPosAmount(''); setPosDesc('');
        fetchData();
    };

    const totalBalance = (accounts || []).reduce((sum, acc) => sum + Number(acc.balance || 0), 0);

    return (
        <div className="absolute inset-0 bg-[#FAFAFA] dark:bg-[#0b1120] z-40 overflow-y-auto overflow-x-hidden font-sans custom-scrollbar flex flex-col p-4 md:p-10 text-slate-900 dark:text-slate-100 transition-colors">
            <div className="w-full max-w-[1600px] flex flex-col flex-1 min-h-0 mx-auto">
                <div className="w-full flex items-center justify-between px-5 py-4 bg-white dark:bg-[#0f172a] border border-slate-200/70 dark:border-slate-800/80 rounded-[24px] mb-6 shadow-sm shrink-0">
                    <div className="flex items-center gap-6">
                        <div>
                            <span className="text-[12px] font-bold text-slate-500 dark:text-slate-400 uppercase">Toplam Banka Bakiyesi</span>
                            <div className="text-[24px] font-bold text-emerald-600 dark:text-emerald-500 font-mono">₺{totalBalance.toLocaleString('tr-TR')}</div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 mb-6 border-b border-slate-200 dark:border-slate-800 pb-4 shrink-0 overflow-x-auto custom-scrollbar">
                    <TabButton active={activeTab==='accounts'} onClick={() => setActiveTab('accounts')} icon={Building} label="Banka Hesapları" />
                    <TabButton active={activeTab==='transactions'} onClick={() => setActiveTab('transactions')} icon={RefreshCcw} label="Banka İşlemleri" />
                    <TabButton active={activeTab==='virman'} onClick={() => setActiveTab('virman')} icon={ArrowRightLeft} label="Virman (Transfer)" />
                    <TabButton active={activeTab==='pos'} onClick={() => setActiveTab('pos')} icon={CreditCard} label="POS Çekimleri" />
                    <TabButton active={activeTab==='checks'} onClick={() => setActiveTab('checks')} icon={FileText} label="Çek / Senet Takibi" />
                </div>

                {activeTab === 'accounts' && (
                    <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200/80 dark:border-slate-800/80 shadow-sm p-6 flex-1 min-h-0 overflow-y-auto">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                            <h3 className="font-bold text-[16px]">Kayıtlı Hesaplar</h3>
                            <button onClick={() => setActiveTab('create_account')} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[13px] font-bold hover:bg-indigo-700 transition-colors">
                                <PlusCircle size={16}/> Yeni Hesap Ekle
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {accounts.map(acc => (
                                <div key={acc.id} className="border border-slate-200 dark:border-slate-700 p-5 rounded-2xl flex flex-col gap-2 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-bl-full -mr-8 -mt-8"></div>
                                    <span className="text-[18px] font-bold text-slate-900 dark:text-white">{acc.bankName}</span>
                                    <span className="text-[12px] text-slate-500 font-mono tracking-wider">{acc.iban || 'IBAN Yok'}</span>
                                    <div className="text-[20px] font-bold text-emerald-600 mt-2 font-mono">₺{(Number(acc.balance)||0).toLocaleString()}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {(activeTab === 'transactions' || activeTab === 'virman' || activeTab === 'pos') && (
                    <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-[#0f172a]">
                            <h3 className="font-bold text-[15px]">Banka Hesap Hareketleri</h3>
                            <div className="flex gap-2">
                                {activeTab === 'transactions' && <button onClick={() => setActiveTab('create_tx')} className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-[13px] font-bold transition-colors">Yeni İşlem</button>}
                                {activeTab === 'virman' && <button onClick={() => setActiveTab('create_virman')} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[13px] font-bold hover:bg-indigo-700 transition-colors">Yeni Virman / Transfer</button>}
                                {activeTab === 'pos' && <button onClick={() => setActiveTab('create_pos')} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[13px] font-bold hover:bg-emerald-700 transition-colors">Yeni POS Çekimi</button>}
                            </div>
                        </div>
                        <div className="flex-1 overflow-x-auto">
                            <table className="w-full text-left min-w-[700px]">
                                <thead className="bg-slate-50 dark:bg-[#1e293b] sticky top-0">
                                    <tr>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 dark:text-slate-300 uppercase">Hesap</th>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 dark:text-slate-300 uppercase">İşlem Detayı / Açıklama</th>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 dark:text-slate-300 uppercase">Tarih</th>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 dark:text-slate-300 uppercase text-right">Tutar</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    {transactions.map(tx => {
                                        const accName = accounts.find(a => a.id === tx.accountId)?.bankName || 'Bilinmiyor';
                                        return (
                                            <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                <td className="py-4 px-6 font-medium text-[13px] text-slate-600 dark:text-slate-400">{accName}</td>
                                                <td className="py-4 px-6">
                                                    <span className="font-bold text-[14px] block text-slate-800 dark:text-slate-200">{tx.title}</span>
                                                    {tx.description && <span className="text-[11px] text-slate-500">{tx.description}</span>}
                                                </td>
                                                <td className="py-4 px-6 text-[13px] text-slate-500">{tx.date}</td>
                                                <td className={`py-4 px-6 text-right font-mono font-bold text-[15px] ${tx.type === 'income' ? 'text-emerald-500' : 'text-slate-800 dark:text-slate-200'}`}>
                                                    {tx.type === 'income' ? '+' : '-'}₺{Number(tx.amount).toLocaleString()}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'checks' && (
                    <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-[#0f172a]">
                            <h3 className="font-bold text-[15px]">Çek ve Senet Portföyü</h3>
                            <button onClick={() => setActiveTab('create_check')} className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-[13px] font-bold transition-colors">
                                <PlusCircle size={16}/> Evrak Ekle
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {checks.map(c => (
                                    <div key={c.id} className="border border-slate-200 dark:border-slate-700 p-5 rounded-2xl flex flex-col relative overflow-hidden">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <span className="text-[15px] font-bold text-slate-900 dark:text-white block">{c.type} - {c.direction}</span>
                                                <span className="text-[12px] text-slate-500 font-bold tracking-wider">{c.relatedTo}</span>
                                            </div>
                                            <div className="text-[20px] font-bold font-mono text-indigo-600 dark:text-indigo-400">
                                                ₺{Number(c.amount).toLocaleString()}
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
                                            <span className="text-[12px] text-slate-500">Vade: <strong className="text-slate-900 dark:text-white">{c.dueDate}</strong></span>
                                            <select 
                                                value={c.status}
                                                onChange={(e) => handleCheckStatusChange(c.id, e.target.value)}
                                                className={`text-[12px] font-bold px-3 py-1 rounded-lg outline-none ${
                                                    c.status === 'Tahsil Edildi' ? 'bg-emerald-100 text-emerald-700' :
                                                    c.status === 'Karşılıksız' ? 'bg-rose-100 text-rose-700' :
                                                    'bg-amber-100 text-amber-700'
                                                }`}
                                            >
                                                <option value="Portföyde">Portföyde</option>
                                                <option value="Bankada (Takasta)">Bankada (Takasta)</option>
                                                <option value="Tahsil Edildi">Tahsil Edildi</option>
                                                <option value="Karşılıksız">Karşılıksız</option>
                                                <option value="Ciro Edildi">Ciro Edildi</option>
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            { }
            
            {activeTab === 'create_virman' && (
                <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200 dark:border-slate-800 p-6 flex-1 flex flex-col shadow-sm max-w-2xl mx-auto w-full mt-10">
                    <h2 className="font-bold text-[18px] mb-4">Virman (Transfer İşlemi)</h2>
                    <form onSubmit={handleVirmanSave} className="flex flex-col gap-5 flex-1">
                        <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-800 pb-6">
                            <div className="flex-1">
                                <label className="text-[12px] text-slate-500 font-bold block mb-1">Kaynak (Çıkış)</label>
                                <select value={virmFromType} onChange={e=>{setVirmFromType(e.target.value); setVirmFromId('');}} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-t-xl outline-none text-[13px] border border-slate-200 dark:border-slate-800 border-b-0 focus:border-indigo-500 transition-colors">
                                    <option value="cash">Kasa</option><option value="bank">Banka</option>
                                </select>
                                <select required value={virmFromId} onChange={e=>setVirmFromId(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-b-xl outline-none border border-slate-200 dark:border-slate-800 focus:border-indigo-500 transition-colors">
                                    <option value="">Hesap/Kasa Seçin...</option>
                                    {virmFromType === 'cash' ? cashRegisters.map(c=><option key={c.id} value={c.id}>{c.name}</option>) : accounts.map(b=><option key={b.id} value={b.id}>{b.bankName}</option>)}
                                </select>
                            </div>
                            <ArrowRightLeft className="text-slate-300 dark:text-slate-600 mt-5"/>
                            <div className="flex-1">
                                <label className="text-[12px] text-slate-500 font-bold block mb-1">Hedef (Giriş)</label>
                                <select value={virmToType} onChange={e=>{setVirmToType(e.target.value); setVirmToId('');}} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-t-xl outline-none text-[13px] border border-slate-200 dark:border-slate-800 border-b-0 focus:border-indigo-500 transition-colors">
                                    <option value="bank">Banka</option><option value="cash">Kasa</option>
                                </select>
                                <select required value={virmToId} onChange={e=>setVirmToId(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-b-xl outline-none border border-slate-200 dark:border-slate-800 focus:border-indigo-500 transition-colors">
                                    <option value="">Hesap/Kasa Seçin...</option>
                                    {virmToType === 'cash' ? cashRegisters.map(c=><option key={c.id} value={c.id}>{c.name}</option>) : accounts.map(b=><option key={b.id} value={b.id}>{b.bankName}</option>)}
                                </select>
                            </div>
                        </div>
                        
                        <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Transfer Tutarı (₺)</label><input type="number" required value={virmAmount} onChange={e=>setVirmAmount(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-4 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono text-[18px] focus:border-indigo-500 transition-colors"/></div>
                        <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Açıklama</label><input required value={virmDesc} onChange={e=>setVirmDesc(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors" placeholder="Örn: Kasadan bankaya nakit yatırma"/></div>
                        
                        <div className="flex justify-end gap-3 mt-auto pt-6 border-t border-slate-200 dark:border-slate-800">
                            <button type="button" onClick={()=>setActiveTab('virman')} className="px-6 py-2.5 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">İptal Et</button>
                            <button type="submit" className="px-6 py-2.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm">Transferi Gerçekleştir</button>
                        </div>
                    </form>
                </div>
            )}

            {activeTab === 'create_pos' && (
                <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200 dark:border-slate-800 p-6 flex-1 flex flex-col shadow-sm max-w-2xl mx-auto w-full mt-10">
                    <h2 className="font-bold text-[18px] mb-4">POS İşlemi</h2>
                    <form onSubmit={handlePosSave} className="flex flex-col gap-5 flex-1">
                        <div>
                            <label className="text-[12px] text-slate-500 font-bold block mb-1">Çekilen Banka (POS)</label>
                            <select required value={posAccount} onChange={e=>setPosAccount(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors">
                                <option value="">Banka Seçin...</option>
                                {accounts.map(b=><option key={b.id} value={b.id}>{b.bankName}</option>)}
                            </select>
                        </div>
                        <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Çekilen Brüt Tutar</label><input type="number" required value={posAmount} onChange={e=>setPosAmount(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono focus:border-indigo-500 transition-colors"/></div>
                        <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Banka Komisyon Oranı (%)</label><input type="number" step="0.01" required value={posRate} onChange={e=>setPosRate(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono focus:border-indigo-500 transition-colors"/></div>
                        <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Açıklama</label><input required value={posDesc} onChange={e=>setPosDesc(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors"/></div>
                        
                        {posAmount && (
                            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-800/30 flex justify-between items-center mt-2">
                                <span className="text-[12px] font-bold text-emerald-700 dark:text-emerald-500">Bankaya Geçecek Net:</span>
                                <span className="text-[20px] font-mono font-bold text-emerald-600 dark:text-emerald-400">₺{(Number(posAmount) - (Number(posAmount) * Number(posRate)/100)).toLocaleString()}</span>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 mt-auto pt-6 border-t border-slate-200 dark:border-slate-800">
                            <button type="button" onClick={()=>setActiveTab('pos')} className="px-6 py-2.5 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">İptal Et</button>
                            <button type="submit" className="px-6 py-2.5 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-sm">POS'tan Çek</button>
                        </div>
                    </form>
                </div>
            )}

            {activeTab === 'create_account' && (
                <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200 dark:border-slate-800 p-6 flex-1 flex flex-col shadow-sm max-w-xl mx-auto w-full mt-10">
                    <h2 className="font-bold text-[18px] mb-6">Yeni Banka Hesabı</h2>
                    <form onSubmit={handleSaveAccount} className="flex flex-col gap-5 flex-1">
                        <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Banka Adı</label><input required value={formBankName} onChange={e=>setFormBankName(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors"/></div>
                        <div><label className="text-[12px] text-slate-500 font-bold block mb-1">IBAN</label><input required value={formIban} onChange={e=>setFormIban(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono text-[13px] focus:border-indigo-500 transition-colors"/></div>
                        <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Açılış Bakiyesi (₺)</label><input type="number" required value={formBalance} onChange={e=>setFormBalance(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono focus:border-indigo-500 transition-colors"/></div>
                        
                        <div className="flex justify-end gap-3 mt-auto pt-6 border-t border-slate-200 dark:border-slate-800">
                            <button type="button" onClick={()=>setActiveTab('accounts')} className="px-6 py-2.5 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">İptal Et</button>
                            <button type="submit" className="px-6 py-2.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm">Kaydet</button>
                        </div>
                    </form>
                </div>
            )}

            {activeTab === 'create_tx' && (
                <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200 dark:border-slate-800 p-6 flex-1 flex flex-col shadow-sm max-w-xl mx-auto w-full mt-10">
                    <h2 className="font-bold text-[18px] mb-6">Yeni Banka İşlemi</h2>
                    <form onSubmit={handleSaveTx} className="flex flex-col gap-5 flex-1">
                        <div className="grid grid-cols-2 gap-3 mb-2">
                            <button type="button" onClick={()=>setTxType('income')} className={`py-3 rounded-xl font-bold transition-colors border ${txType==='income'?'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700/50':'bg-slate-50 text-slate-500 border-slate-200 dark:bg-[#0b1120] dark:border-slate-800'}`}>Giriş (+)</button>
                            <button type="button" onClick={()=>setTxType('expense')} className={`py-3 rounded-xl font-bold transition-colors border ${txType==='expense'?'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700/50':'bg-slate-50 text-slate-500 border-slate-200 dark:bg-[#0b1120] dark:border-slate-800'}`}>Çıkış (-)</button>
                        </div>
                        <div>
                            <label className="text-[12px] text-slate-500 font-bold block mb-1">Hesap</label>
                            <select required value={txAccount} onChange={e=>setTxAccount(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors">
                                <option value="">Seçiniz...</option>
                                {accounts.map(a=><option key={a.id} value={a.id}>{a.bankName}</option>)}
                            </select>
                        </div>
                        <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Açıklama</label><input required value={txTitle} onChange={e=>setTxTitle(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors"/></div>
                        <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Tutar (₺)</label><input type="number" required value={txAmount} onChange={e=>setTxAmount(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono focus:border-indigo-500 transition-colors"/></div>
                        
                        <div className="flex justify-end gap-3 mt-auto pt-6 border-t border-slate-200 dark:border-slate-800">
                            <button type="button" onClick={()=>setActiveTab('transactions')} className="px-6 py-2.5 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">İptal Et</button>
                            <button type="submit" className="px-6 py-2.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm">Kaydet</button>
                        </div>
                    </form>
                </div>
            )}

            {activeTab === 'create_check' && (
                <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200 dark:border-slate-800 p-6 flex-1 flex flex-col shadow-sm max-w-xl mx-auto w-full mt-10">
                    <h2 className="font-bold text-[18px] mb-6">Yeni Çek / Senet</h2>
                    <form onSubmit={handleSaveCheck} className="flex flex-col gap-5 flex-1">
                        <div className="grid grid-cols-2 gap-5">
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Evrak Tipi</label><select value={chkType} onChange={e=>setChkType(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors"><option>Çek</option><option>Senet</option></select></div>
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Yön</label><select value={chkDir} onChange={e=>setChkDir(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors"><option>Alınan (Müşteri)</option><option>Verilen (Firma)</option></select></div>
                        </div>
                        <div><label className="text-[12px] text-slate-500 font-bold block mb-1">İlgili Kişi/Kurum</label><input required value={chkRelated} onChange={e=>setChkRelated(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors"/></div>
                        <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Tutar (₺)</label><input type="number" required value={chkAmount} onChange={e=>setChkAmount(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono focus:border-indigo-500 transition-colors"/></div>
                        <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Vade Tarihi</label><input type="date" required value={chkDue} onChange={e=>setChkDue(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors"/></div>
                        
                        <div className="flex justify-end gap-3 mt-auto pt-6 border-t border-slate-200 dark:border-slate-800">
                            <button type="button" onClick={()=>setActiveTab('checks')} className="px-6 py-2.5 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">İptal Et</button>
                            <button type="submit" className="px-6 py-2.5 font-bold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white rounded-xl transition-colors shadow-sm">Kaydet</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

const TabButton = ({ active, onClick, icon: Icon, label }) => (
    <button onClick={onClick} className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-bold transition-all whitespace-nowrap ${active ? 'bg-indigo-600 text-white shadow-md' : 'bg-white dark:bg-[#0f172a] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
        <Icon size={16}/> {label}
    </button>
);

export default BankManagementView;
