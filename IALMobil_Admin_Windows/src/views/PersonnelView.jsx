import React, { useState, useEffect } from 'react';
import { Users, PlusCircle, UserCheck, Calculator, Star, BadgeCheck, CheckCircle2 } from 'lucide-react';
import { personnelService } from '../services/personnelService';

const PersonnelView = ({ initialTab = 'list', onClose }) => {
    const [activeTab, setActiveTab] = useState(initialTab.includes('_') ? initialTab.split('_')[1] : initialTab); 
    const [personnel, setPersonnel] = useState([]);
    const [payrolls, setPayrolls] = useState([]);
    const [loading, setLoading] = useState(false);
    
    const [formTc, setFormTc] = useState('');
    const [formName, setFormName] = useState('');
    const [formPosition, setFormPosition] = useState('Öğretmen');
    const [formContact, setFormContact] = useState('');
    const [formStartDate, setFormStartDate] = useState('');
    const [formSgk, setFormSgk] = useState('');
    const [formBank, setFormBank] = useState('');
    const [formGross, setFormGross] = useState('');
    const [formHourly, setFormHourly] = useState('');

    const [payPerson, setPayPerson] = useState('');
    const [payMonth, setPayMonth] = useState((new Date().getMonth() + 1).toString());
    const [payYear, setPayYear] = useState(new Date().getFullYear().toString());
    const [payType, setPayType] = useState('Aylık Maaş'); 
    const [payGross, setPayGross] = useState('');
    const [payDeduct, setPayDeduct] = useState('');
    const [payExtra, setPayExtra] = useState('');
    const [payNet, setPayNet] = useState('');
    const [payHours, setPayHours] = useState(''); 

    useEffect(() => {
        fetchData();
        
        if(initialTab === 'personnel_list') setActiveTab('list');
        if(initialTab === 'personnel_payroll') setActiveTab('payroll');
        if(initialTab === 'personnel_hourly') { setActiveTab('create_payroll'); setPayType('Saatlik Ücret'); }
        if(initialTab === 'personnel_bonus') { setActiveTab('create_payroll'); setPayType('Prim'); }
    }, [initialTab]);

    const fetchData = async () => {
        setLoading(true);
        const [pers, pay] = await Promise.all([
            personnelService.getPersonnel(),
            personnelService.getPayrolls()
        ]);
        setPersonnel(pers);
        setPayrolls(pay.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
        setLoading(false);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const success = await personnelService.addPersonnel(
            formTc, formName, formPosition, formContact, formStartDate, 
            formSgk, formBank, formGross || 0, formHourly || 0
        );
        if(success) {
            setActiveTab('list');
            setFormTc(''); setFormName(''); setFormContact(''); setFormStartDate(''); setFormSgk(''); setFormBank(''); setFormGross(''); setFormHourly('');
            fetchData();
        }
    };

    const handlePayrollSave = async (e) => {
        e.preventDefault();
        const success = await personnelService.addPayroll(
            payPerson, payMonth, payYear, payGross, payDeduct, payExtra, payNet, payType
        );
        if(success) {
            setActiveTab('payroll');
            fetchData();
        }
    };

    const handleApprovePayroll = async (id) => {
        if(window.confirm('Bu bordroyu onaylayıp kasadan ödemesini yapmak istediğinize emin misiniz?')) {
            await personnelService.approvePayroll(id, 'Genel');
            fetchData();
        }
    };

    useEffect(() => {
        if(payType === 'Saatlik Ücret' && payPerson) {
            const p = personnel.find(x => x.id === payPerson);
            if(p && payHours) {
                const total = Number(p.hourlyRate || 0) * Number(payHours);
                setPayGross(total.toString());
                const net = total - Number(payDeduct || 0) + Number(payExtra || 0);
                setPayNet(net.toString());
            }
        } else if (payGross) {
            const net = Number(payGross) - Number(payDeduct || 0) + Number(payExtra || 0);
            setPayNet(net.toString());
        }
    }, [payGross, payDeduct, payExtra, payType, payPerson, payHours, personnel]);

    const onPersonSelectForPayroll = (e) => {
        const id = e.target.value;
        setPayPerson(id);
        const p = personnel.find(x => x.id === id);
        if(p && payType === 'Aylık Maaş') {
            setPayGross(p.grossSalary);
            
            const sgk = p.grossSalary * 0.15;
            const tax = p.grossSalary * 0.15;
            setPayDeduct((sgk + tax).toFixed(2));
        }
    };

    return (
        <div className="w-full h-full flex flex-col overflow-hidden font-sans bg-[#0b1120] text-slate-900 dark:text-slate-100">
            
            { }
            <div className="w-full px-8 py-6 flex items-center justify-between border-b border-slate-800 shrink-0">
                <h2 className="text-[18px] font-bold text-white tracking-wide flex items-center gap-3 uppercase">
                    <Users size={24} className="text-white" />
                    Personel Yönetimi
                </h2>
            </div>
            
            <div className="flex-1 flex overflow-hidden">
                
                { }
                <div className="w-[260px] flex flex-col shrink-0 border-r border-slate-800 p-6 gap-2">
                    <SidebarTab active={activeTab==='list'} onClick={() => setActiveTab('list')} icon={UserCheck} label="Kayıtlar" />
                    <SidebarTab active={activeTab==='payroll'} onClick={() => setActiveTab('payroll')} icon={Calculator} label="Bordro" />
                </div>

                { }
                <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                
                {activeTab === 'list' && (
                    <div className="flex flex-col h-full min-h-0">
                        <div className="pb-6 flex justify-between items-center shrink-0">
                            <h3 className="font-bold text-[15px] text-slate-300 uppercase tracking-widest">Sistemdeki Personeller</h3>
                            <button onClick={() => setActiveTab('create_personnel')} className="flex items-center gap-2 px-5 py-2.5 text-white border border-slate-700 rounded-xl text-[13px] font-bold hover:bg-slate-800 transition-colors">
                                <PlusCircle size={16}/> Yeni Kayıt
                            </button>
                        </div>
                        <div className="flex-1 overflow-x-auto">
                            <table className="w-full text-left min-w-[700px]">
                                <thead className="bg-transparent sticky top-0">
                                    <tr>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 uppercase border-b border-slate-800">Ad Soyad</th>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 uppercase border-b border-slate-800">Pozisyon</th>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 uppercase border-b border-slate-800">İletişim</th>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 uppercase border-b border-slate-800">Durum</th>
                                        <th className="py-3 px-6 text-[12px] font-bold text-slate-500 uppercase text-right border-b border-slate-800">Maaş / Saatlik</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {personnel.map(p => (
                                        <tr key={p.id} className="hover:bg-slate-800/40 border-b border-slate-800/50">
                                            <td className="py-4 px-6">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-[14px] text-white">{p.name}</span>
                                                    <span className="text-[11px] font-mono text-slate-500">TC: {p.tcNo}</span>
                                                </div>
                                            </td>
                                            <td className="py-4 px-6 text-[13px] text-slate-600 dark:text-slate-400 font-medium">{p.position}</td>
                                            <td className="py-4 px-6 text-[13px] text-slate-500">{p.contact}</td>
                                            <td className="py-4 px-6">
                                                <span className="text-[12px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1 rounded-lg">{p.status}</span>
                                            </td>
                                            <td className="py-4 px-6 text-right flex flex-col items-end justify-center">
                                                <span className="font-mono font-bold text-[14px] text-slate-700 dark:text-slate-300">₺{Number(p.grossSalary || 0).toLocaleString()} (Brüt)</span>
                                                {Number(p.hourlyRate) > 0 && <span className="font-mono text-[11px] text-slate-400">₺{p.hourlyRate}/saat</span>}
                                            </td>
                                        </tr>
                                    ))}
                                    {personnel.length === 0 && (
                                        <tr><td colSpan="5" className="py-10 text-center text-slate-400">Kayıtlı personel bulunmuyor.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'payroll' && (
                    <div className="flex flex-col h-full min-h-0">
                        <div className="pb-6 flex justify-between items-center shrink-0">
                            <h3 className="font-bold text-[15px] text-slate-300 uppercase tracking-widest">Maaş ve Hakediş Bordroları</h3>
                            <button onClick={() => setActiveTab('create_payroll')} className="flex items-center gap-2 px-5 py-2.5 text-white border border-slate-700 rounded-xl text-[13px] font-bold hover:bg-slate-800 transition-colors">
                                <Calculator size={16}/> Bordro Hazırla
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {payrolls.map(pay => {
                                    const p = personnel.find(x => x.id === pay.personnelId);
                                    const isPaid = pay.status === 'Ödendi';
                                    return (
                                        <div key={pay.id} className="border border-slate-200 dark:border-slate-700 p-5 rounded-2xl flex flex-col relative overflow-hidden">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <span className="text-[15px] font-bold text-slate-900 dark:text-white block">{p?.name || 'Bilinmiyor'}</span>
                                                    <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">{pay.month}/{pay.year} • {pay.type}</span>
                                                </div>
                                                <div className={`text-[11px] font-bold px-2 py-1 rounded-lg ${isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {pay.status}
                                                </div>
                                            </div>
                                            
                                            <div className="flex justify-between text-[13px] border-b border-dashed border-slate-200 dark:border-slate-700 pb-2 mb-2">
                                                <span className="text-slate-500">Brüt Hakediş</span>
                                                <span className="font-mono">₺{Number(pay.grossSalary).toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between text-[13px] border-b border-dashed border-slate-200 dark:border-slate-700 pb-2 mb-2">
                                                <span className="text-slate-500">Kesintiler (SGK vb.)</span>
                                                <span className="font-mono text-rose-500">-₺{Number(pay.deductions).toLocaleString()}</span>
                                            </div>
                                            {Number(pay.overtime) > 0 && (
                                                <div className="flex justify-between text-[13px] border-b border-dashed border-slate-200 dark:border-slate-700 pb-2 mb-2">
                                                    <span className="text-slate-500">Ek Ödeme/Mesai</span>
                                                    <span className="font-mono text-emerald-500">+₺{Number(pay.overtime).toLocaleString()}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between text-[15px] font-bold pt-2 mt-2">
                                                <span className="text-slate-900 dark:text-white">Net Ödenecek</span>
                                                <span className="font-mono text-indigo-600 dark:text-indigo-400">₺{Number(pay.netSalary).toLocaleString()}</span>
                                            </div>

                                            {!isPaid && (
                                                <button onClick={() => handleApprovePayroll(pay.id)} className="mt-6 w-full py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-100 transition-colors">
                                                    <CheckCircle2 size={16}/> Onayla ve Öde
                                                </button>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )}
            { }
            {activeTab === 'create_personnel' && (
                <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
                    <h2 className="font-bold text-[15px] text-slate-300 uppercase tracking-widest mb-6 border-b border-slate-800 pb-4">Yeni Personel Kaydı</h2>
                    <form onSubmit={handleSave} className="flex flex-col gap-5 flex-1">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-2 uppercase tracking-wide">Ad Soyad</label><input required value={formName} onChange={e=>setFormName(e.target.value)} className="w-full bg-[#0b1120] p-3 border-b border-slate-800 outline-none focus:border-white transition-colors text-white"/></div>
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-1">TC Kimlik</label><input required value={formTc} onChange={e=>setFormTc(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 dark:focus:border-indigo-500 font-mono transition-colors"/></div>
                            <div>
                                <label className="text-[12px] text-slate-500 font-bold block mb-1">Pozisyon</label>
                                <select value={formPosition} onChange={e=>setFormPosition(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 dark:focus:border-indigo-500 transition-colors">
                                    <option>Öğretmen</option><option>Eğitim Danışmanı</option><option>İdari Personel</option><option>Destek Personeli</option>
                                </select>
                            </div>
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Telefon</label><input value={formContact} onChange={e=>setFormContact(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors"/></div>
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-1">İşe Başlama Tarihi</label><input type="date" value={formStartDate} onChange={e=>setFormStartDate(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors"/></div>
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-1">SGK No</label><input value={formSgk} onChange={e=>setFormSgk(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono focus:border-indigo-500 transition-colors"/></div>
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Aylık Brüt Maaş (₺)</label><input type="number" value={formGross} onChange={e=>setFormGross(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono focus:border-indigo-500 transition-colors"/></div>
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Saatlik Ücret (Varsa)</label><input type="number" value={formHourly} onChange={e=>setFormHourly(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono focus:border-indigo-500 transition-colors"/></div>
                            <div className="lg:col-span-3"><label className="text-[12px] text-slate-500 font-bold block mb-1">Banka IBAN</label><input value={formBank} onChange={e=>setFormBank(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono text-[13px] focus:border-indigo-500 transition-colors" placeholder="TR00 0000..."/></div>
                        </div>
                        
                        <div className="flex justify-end gap-3 mt-auto pt-6 border-t border-slate-200 dark:border-slate-800">
                            <button type="button" onClick={()=>setActiveTab('list')} className="px-6 py-2.5 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">İptal Et</button>
                            <button type="submit" className="px-6 py-2.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm">Kayıt Oluştur</button>
                        </div>
                    </form>
                </div>
            )}

            { }
            {activeTab === 'create_payroll' && (
                <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
                    <h2 className="font-bold text-[15px] text-slate-300 uppercase tracking-widest mb-6 border-b border-slate-800 pb-4">Hakediş & Bordro Hazırlama</h2>
                    <form onSubmit={handlePayrollSave} className="flex flex-col gap-5 flex-1">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="md:col-span-2">
                                <label className="text-[12px] text-slate-500 font-bold block mb-3 uppercase tracking-wide">Bordro Tipi</label>
                                <div className="flex gap-2">
                                    <button type="button" onClick={()=>{setPayType('Aylık Maaş'); setPayGross(''); setPayDeduct(''); setPayHours('');}} className={`flex-1 py-3 rounded-xl font-bold transition-colors border ${payType==='Aylık Maaş'?'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700/50':'bg-slate-50 text-slate-500 border-slate-200 dark:bg-[#0b1120] dark:border-slate-800'}`}>Aylık Maaş</button>
                                    <button type="button" onClick={()=>{setPayType('Saatlik Ücret'); setPayGross(''); setPayDeduct('');}} className={`flex-1 py-3 rounded-xl font-bold transition-colors border ${payType==='Saatlik Ücret'?'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700/50':'bg-slate-50 text-slate-500 border-slate-200 dark:bg-[#0b1120] dark:border-slate-800'}`}>Saatlik Ücret</button>
                                    <button type="button" onClick={()=>{setPayType('Prim'); setPayGross(''); setPayDeduct(''); setPayHours('');}} className={`flex-1 py-3 rounded-xl font-bold transition-colors border ${payType==='Prim'?'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700/50':'bg-slate-50 text-slate-500 border-slate-200 dark:bg-[#0b1120] dark:border-slate-800'}`}>Özel Prim</button>
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-[12px] text-slate-500 font-bold block mb-1">Personel Seçimi</label>
                                <select required value={payPerson} onChange={onPersonSelectForPayroll} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors">
                                    <option value="">Seçiniz...</option>
                                    {personnel.map(p=><option key={p.id} value={p.id}>{p.name} - {p.position}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[12px] text-slate-500 font-bold block mb-1">Dönem Ay</label>
                                <select required value={payMonth} onChange={e=>setPayMonth(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors">
                                    <option value="1">Ocak</option><option value="2">Şubat</option><option value="3">Mart</option><option value="4">Nisan</option>
                                    <option value="5">Mayıs</option><option value="6">Haziran</option><option value="7">Temmuz</option><option value="8">Ağustos</option>
                                    <option value="9">Eylül</option><option value="10">Ekim</option><option value="11">Kasım</option><option value="12">Aralık</option>
                                </select>
                            </div>
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Dönem Yıl</label><input required value={payYear} onChange={e=>setPayYear(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none focus:border-indigo-500 transition-colors"/></div>

                            {payType === 'Saatlik Ücret' && (
                                <div className="md:col-span-2 bg-indigo-50 dark:bg-indigo-900/10 p-5 rounded-xl border border-indigo-100 dark:border-indigo-800/40">
                                    <label className="text-[13px] text-indigo-700 dark:text-indigo-400 font-bold mb-2 block">Bu ay girilen toplam ders saati</label>
                                    <input type="number" required value={payHours} onChange={e=>setPayHours(e.target.value)} className="w-full bg-white dark:bg-[#0b1120] p-3 rounded-xl border border-indigo-200 dark:border-indigo-800 outline-none font-mono focus:border-indigo-500 transition-colors" placeholder="Örn: 45"/>
                                    <p className="text-[12px] text-indigo-600/70 dark:text-indigo-400/70 mt-2 font-medium">Girilen saat, personelin saatlik ücreti ({personnel.find(x=>x.id===payPerson)?.hourlyRate||0}₺) ile çarpılarak brüt hakediş otomatik hesaplanır.</p>
                                </div>
                            )}
                            
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Brüt Hakediş (₺)</label><input type="number" required value={payGross} onChange={e=>setPayGross(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono focus:border-indigo-500 transition-colors"/></div>
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-1">SGK / Vergi Kesintisi (₺)</label><input type="number" value={payDeduct} onChange={e=>setPayDeduct(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono focus:border-indigo-500 transition-colors"/></div>
                            <div><label className="text-[12px] text-slate-500 font-bold block mb-1">Ek Ödeme (Mesai/Yol/Yemek) (₺)</label><input type="number" value={payExtra} onChange={e=>setPayExtra(e.target.value)} className="w-full bg-slate-100 dark:bg-[#0b1120] p-3 rounded-xl border border-slate-200 dark:border-slate-800 outline-none font-mono focus:border-indigo-500 transition-colors"/></div>
                            
                            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800/40 flex flex-col justify-center">
                                <label className="text-[12px] font-bold text-emerald-700 dark:text-emerald-500">Net Ödenecek (₺)</label>
                                <span className="text-[24px] font-extrabold text-emerald-600 dark:text-emerald-400 font-mono mt-1">₺{Number(payNet||0).toLocaleString()}</span>
                            </div>
                        </div>
                        
                        <div className="flex justify-end gap-3 mt-auto pt-6 border-t border-slate-200 dark:border-slate-800">
                            <button type="button" onClick={()=>setActiveTab('payroll')} className="px-6 py-2.5 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">İptal Et</button>
                            <button type="submit" className="px-6 py-2.5 font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm">Bordroyu Taslak Olarak Kaydet</button>
                        </div>
                    </form>
                </div>
            )}
            
            </div>
        </div>
        </div>
    );
};
const SidebarTab = ({ active, onClick, icon: Icon, label }) => (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 text-[13px] font-bold transition-all ${active ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>
        <Icon size={18} />
        {label}
    </button>
);

export default PersonnelView;
