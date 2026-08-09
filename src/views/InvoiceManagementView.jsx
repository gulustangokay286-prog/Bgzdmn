import React, { useState, useEffect } from 'react';
import { FileText, PlusCircle, CheckCircle2, XCircle } from 'lucide-react';
import { invoiceService } from '../services/invoiceService';
import { financeService } from '../services/financeService';

const InvoiceManagementView = ({ onClose }) => {
    const [invoices, setInvoices] = useState([]);
    const [cashRegisters, setCashRegisters] = useState([]);
    const [bankAccounts, setBankAccounts] = useState([]);
    
    const [activeTab, setActiveTab] = useState('list');
    const [selectedInvoiceId, setSelectedInvoiceId] = useState('');

    // Form
    const [invNo, setInvNo] = useState('');
    const [invName, setInvName] = useState('');
    const [invTax, setInvTax] = useState('');
    const [invOffice, setInvOffice] = useState('');
    const [invBase, setInvBase] = useState('');
    const [invVat, setInvVat] = useState('20');

    // Pay Form
    const [payTargetType, setPayTargetType] = useState('cash'); // cash or bank
    const [payTargetId, setPayTargetId] = useState('');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        const [invs, cash, banks] = await Promise.all([
            invoiceService.getInvoices(),
            financeService.getCashRegisters(),
            financeService.getBankAccounts()
        ]);
        setInvoices(invs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
        setCashRegisters(cash);
        setBankAccounts(banks);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        await invoiceService.addInvoice(invNo, invName, invTax, invOffice, invBase, invVat);
        setActiveTab('list');
        setInvNo(''); setInvName(''); setInvTax(''); setInvOffice(''); setInvBase('');
        fetchData();
    };

    const handlePay = async (e) => {
        e.preventDefault();
        if (!payTargetId) return alert('Lütfen hedef kasa/banka seçin.');
        await invoiceService.payInvoice(selectedInvoiceId, payTargetType, payTargetId);
        setActiveTab('list');
        fetchData();
    };

    const handleCancel = async (id) => {
        if(window.confirm('Bu faturayı iptal etmek istediğinize emin misiniz?')) {
            await invoiceService.cancelInvoice(id);
            fetchData();
        }
    };

    return (
        <div className="absolute inset-0 bg-[#FAFAFA] dark:bg-[#0b1120] z-40 overflow-y-auto overflow-x-hidden font-sans custom-scrollbar flex flex-col p-4 md:p-10 text-slate-900 dark:text-slate-100 transition-colors">
            <div className="w-full max-w-[1600px] flex flex-col flex-1 min-h-0 mx-auto">
                
                {activeTab === 'list' && (
                    <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-[#0f172a]">
                            <h3 className="font-bold text-[18px] flex items-center gap-2 text-slate-900 dark:text-white"><FileText className="text-indigo-500"/> Tahsilat Makbuzu & Fatura Yönetimi</h3>
                            <div className="flex gap-2">
                                <button onClick={() => window.print()} className="hidden md:flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 dark:bg-[#0b1120] dark:text-slate-300 dark:border dark:border-slate-800 rounded-xl text-[13px] font-bold hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
                                    Muhasebeye Aktar (Excel)
                                </button>
                                <button onClick={() => setActiveTab('create')} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[13px] font-bold hover:bg-indigo-700 transition-colors">
                                    <PlusCircle size={16}/> Yeni Makbuz/Fatura
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-x-auto">
                            <table className="w-full text-left min-w-[700px]">
                                <thead className="bg-slate-50 dark:bg-[#1e293b] sticky top-0">
                                    <tr>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 dark:text-slate-300 uppercase">Fatura No</th>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 dark:text-slate-300 uppercase">Müşteri / Kurum</th>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 dark:text-slate-300 uppercase">Vergi Dairesi/No</th>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 dark:text-slate-300 uppercase text-right">Tutar & KDV</th>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 dark:text-slate-300 uppercase text-center">Durum</th>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 dark:text-slate-300 uppercase text-right">İşlem</th>
                                    </tr>
                                </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                            {invoices.map(inv => (
                                <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                    <td className="py-4 px-6 font-mono font-bold text-[14px]">{inv.invoiceNo}</td>
                                    <td className="py-4 px-6 font-bold text-[13px]">{inv.customerName}</td>
                                    <td className="py-4 px-6 text-[12px] text-slate-500 dark:text-slate-400">{inv.taxOffice} - {inv.taxNo}</td>
                                    <td className="py-4 px-6 text-right flex flex-col items-end">
                                        <span className="font-bold text-[15px] font-mono text-emerald-600 dark:text-emerald-400">₺{Number(inv.totalAmount).toLocaleString()}</span>
                                        <span className="text-[11px] text-slate-400 font-mono">Matrah: ₺{Number(inv.baseAmount).toLocaleString()} (+%${inv.vatRate} KDV)</span>
                                    </td>
                                    <td className="py-4 px-6 text-center">
                                        <span className={`text-[12px] font-bold px-3 py-1 rounded-lg ${
                                            inv.status === 'Ödendi' ? 'bg-emerald-100 text-emerald-700' : 
                                            inv.status === 'İptal' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                                        }`}>{inv.status}</span>
                                    </td>
                                    <td className="py-4 px-6 text-right">
                                        {inv.status === 'Bekliyor' && (
                                            <div className="flex items-center justify-end gap-2">
                                                <button onClick={()=>{setSelectedInvoiceId(inv.id); setActiveTab('pay');}} className="p-2 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"><CheckCircle2 size={16}/></button>
                                                <button onClick={()=>handleCancel(inv.id)} className="p-2 bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors"><XCircle size={16}/></button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'create' && (
                    <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200 dark:border-slate-800 p-6 flex-1 flex flex-col shadow-sm overflow-y-auto">
                        <h2 className="font-bold text-[18px] mb-1">Yeni Tahsilat Makbuzu / Fatura Kes</h2>
                        <p className="text-[12px] text-slate-500 mb-6">Vergi No veya Dairesi girmek zorunlu değildir. Veliye verilecek yasal makbuzlar için buraları boş bırakabilirsiniz.</p>
                        
                        <form onSubmit={handleSave} className="flex flex-col gap-5 flex-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Makbuz/Fatura Seri No</label><input required value={invNo} onChange={e=>setInvNo(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl font-mono border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors"/></div>
                                <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Öğrenci Veli / Müşteri Adı</label><input required value={invName} onChange={e=>setInvName(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors"/></div>
                                <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Vergi Dairesi (Opsiyonel)</label><input value={invOffice} onChange={e=>setInvOffice(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors"/></div>
                                <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Vergi / TC No (Opsiyonel)</label><input value={invTax} onChange={e=>setInvTax(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl font-mono border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors"/></div>
                                <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Matrah (KDV Hariç Tutar ₺)</label><input type="number" required value={invBase} onChange={e=>setInvBase(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl font-mono border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors"/></div>
                                <div>
                                    <label className="text-[12px] text-slate-500 font-bold block mb-1">KDV Oranı (%)</label>
                                    <select value={invVat} onChange={e=>setInvVat(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors">
                                        <option value="0">%0 KDV (Sadece Tahsilat)</option><option value="1">%1 KDV</option><option value="10">%10 KDV</option><option value="20">%20 KDV</option>
                                    </select>
                                </div>
                            </div>
                            <div className="p-5 bg-indigo-50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-800/30 flex justify-between items-center mt-2">
                                <span className="font-bold text-indigo-800 dark:text-indigo-400">Genel Toplam (KDV Dahil):</span>
                                <span className="text-[24px] font-bold font-mono text-indigo-700 dark:text-indigo-400">
                                    ₺{(Number(invBase||0) + (Number(invBase||0) * (Number(invVat)/100))).toLocaleString()}
                                </span>
                            </div>
                            <div className="flex justify-end gap-3 mt-auto pt-6 border-t border-slate-200 dark:border-slate-800">
                                <button type="button" onClick={()=>setActiveTab('list')} className="px-6 py-2.5 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">İptal Et</button>
                                <button type="submit" className="px-6 py-2.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm">Makbuzu Kes</button>
                            </div>
                        </form>
                    </div>
                )}

                {activeTab === 'pay' && (
                    <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200 dark:border-slate-800 p-6 flex-1 flex flex-col shadow-sm max-w-2xl mx-auto w-full mt-10">
                        <h2 className="font-bold text-[18px] mb-2">Fatura Tahsilatı</h2>
                        <p className="text-[13px] text-slate-500 mb-6">Tahsil edilen tutar doğrudan seçili hesaba "Gelir" olarak işlenecektir.</p>
                        <form onSubmit={handlePay} className="flex flex-col gap-5 flex-1">
                            <div className="grid grid-cols-2 gap-3">
                                <button type="button" onClick={()=>{setPayTargetType('cash'); setPayTargetId('');}} className={`py-3 rounded-xl font-bold transition-colors border ${payTargetType==='cash'?'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700/50':'bg-slate-50 text-slate-500 border-slate-200 dark:bg-[#0b1120] dark:border-slate-800'}`}>Kasa'ya Aktar</button>
                                <button type="button" onClick={()=>{setPayTargetType('bank'); setPayTargetId('');}} className={`py-3 rounded-xl font-bold transition-colors border ${payTargetType==='bank'?'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700/50':'bg-slate-50 text-slate-500 border-slate-200 dark:bg-[#0b1120] dark:border-slate-800'}`}>Banka'ya Aktar</button>
                            </div>
                            <div>
                                <label className="text-[12px] text-slate-500 font-bold block mb-1">Hedef Seçimi</label>
                                <select required value={payTargetId} onChange={e=>setPayTargetId(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors">
                                    <option value="">Seçiniz...</option>
                                    {payTargetType === 'cash' 
                                        ? cashRegisters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)
                                        : bankAccounts.map(b=><option key={b.id} value={b.id}>{b.bankName}</option>)
                                    }
                                </select>
                            </div>
                            <div className="flex justify-end gap-3 mt-auto pt-6 border-t border-slate-200 dark:border-slate-800">
                                <button type="button" onClick={()=>setActiveTab('list')} className="px-6 py-2.5 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">İptal Et</button>
                                <button type="submit" className="px-6 py-2.5 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-sm">Tahsil Et</button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InvoiceManagementView;
