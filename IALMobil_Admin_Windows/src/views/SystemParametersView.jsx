import React, { useState, useEffect } from 'react';
import { Settings, Save, Sliders, BellRing, DollarSign, CheckCircle2 } from 'lucide-react';
import { rtdb } from '../services/firebaseConfig';
import { ref, onValue, set } from 'firebase/database';

const SystemParametersView = () => {
    const [params, setParams] = useState({
        institutionName: 'Boğaziçi Eğitim Kurumları',
        academicYear: '2024-2025',
        smsSenderHeader: 'BOGAZICI',
        maintenanceMode: false,
        lateArrivalThresholdMinutes: '15',
        autoSmsOnAbsence: true,
        currency: '₺',
        vatRate: '20',
        latePaymentInterestRate: '2.5'
    });

    const [loading, setLoading] = useState(true);
    const [savedNotice, setSavedNotice] = useState(false);

    useEffect(() => {
        const paramsRef = ref(rtdb, 'system_parameters');
        const unsubscribe = onValue(paramsRef, (snapshot) => {
            if (snapshot.exists()) {
                setParams(prev => ({ ...prev, ...snapshot.val() }));
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        try {
            const paramsRef = ref(rtdb, 'system_parameters');
            await set(paramsRef, params);
            setSavedNotice(true);
            setTimeout(() => setSavedNotice(false), 3000);
        } catch (error) {
            console.error("Parametreler kaydedilemedi:", error);
        }
    };

    const handleChange = (key, value) => {
        setParams(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="w-full h-full font-sans bg-[#0b1120] text-slate-100 overflow-y-auto custom-scrollbar p-4 sm:p-6 md:p-8 flex flex-col items-center">
            { }
            <div className="w-full max-w-[760px] flex flex-col gap-8 pb-24">
                
                { }
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 border-b border-slate-700/80 pb-6 pt-2">
                    <div>
                        <h1 className="text-[22px] font-bold text-white tracking-tight flex items-center gap-3 uppercase">
                            <Settings size={22} className="text-white"/> Sistem Parametreleri
                        </h1>
                        <p className="text-[13px] text-slate-400 mt-1">Tüm sistemin çalışma kurallarını ve genel parametrelerini yönetin.</p>
                    </div>

                    <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
                        {savedNotice && (
                            <span className="flex items-center gap-2 text-emerald-400 text-[12px] font-bold animate-fade-in">
                                <CheckCircle2 size={16}/> Kaydedildi!
                            </span>
                        )}
                        <button 
                            onClick={handleSave} 
                            className="flex items-center gap-2 px-5 py-2.5 text-white border border-slate-700 hover:bg-slate-800 rounded-xl text-[13px] font-bold transition-colors shadow-lg"
                        >
                            <Save size={16}/> Kaydet & Yayınla
                        </button>
                    </div>
                </div>

                { }
                <form onSubmit={handleSave} className="flex flex-col gap-10 w-full">
                    
                    { }
                    <div className="flex flex-col gap-5 w-full">
                        <div className="pb-3 border-b border-slate-700/80">
                            <h3 className="font-bold text-[13px] text-slate-300 uppercase tracking-widest flex items-center gap-2">
                                <Sliders size={16} className="text-white"/> Genel Kurum Ayarları
                            </h3>
                        </div>

                        <div className="flex flex-col gap-5 w-full">
                            <div>
                                <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Kurum Resmi Adı</label>
                                <input 
                                    value={params.institutionName} 
                                    onChange={e => handleChange('institutionName', e.target.value)}
                                    className="w-full bg-[#0b1120] border-b border-slate-700 p-2 text-white outline-none focus:border-white transition-colors text-[13px]"
                                />
                            </div>

                            <div>
                                <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Aktif Eğitim Yılı</label>
                                <input 
                                    value={params.academicYear} 
                                    onChange={e => handleChange('academicYear', e.target.value)}
                                    className="w-full bg-[#0b1120] border-b border-slate-700 p-2 text-white outline-none font-mono text-[13px] focus:border-white transition-colors"
                                />
                            </div>

                            <div>
                                <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">SMS Gönderici Başlığı</label>
                                <input 
                                    value={params.smsSenderHeader} 
                                    onChange={e => handleChange('smsSenderHeader', e.target.value)}
                                    className="w-full bg-[#0b1120] border-b border-slate-700 p-2 text-white outline-none font-mono text-[13px] focus:border-white transition-colors"
                                />
                            </div>

                            { }
                            <div className="pt-2 flex items-center justify-between border-b border-slate-800/60 pb-4">
                                <div className="pr-4">
                                    <span className="text-[13px] font-bold text-white block">Sistem Bakım Modu</span>
                                    <span className="text-[11px] text-slate-500">Açıldığında sadece yetkililer giriş yapabilir.</span>
                                </div>
                                <button 
                                    type="button" 
                                    onClick={() => handleChange('maintenanceMode', !params.maintenanceMode)}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${params.maintenanceMode ? 'bg-amber-500' : 'bg-slate-800'}`}
                                >
                                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${params.maintenanceMode ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        </div>
                    </div>

                    { }
                    <div className="flex flex-col gap-5 w-full">
                        <div className="pb-3 border-b border-slate-700/80">
                            <h3 className="font-bold text-[13px] text-slate-300 uppercase tracking-widest flex items-center gap-2">
                                <BellRing size={16} className="text-white"/> Devam & Bildirim Parametreleri
                            </h3>
                        </div>

                        <div className="flex flex-col gap-5 w-full">
                            <div>
                                <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Geç Kalma Tolerans Süresi (Dakika)</label>
                                <input 
                                    type="number"
                                    value={params.lateArrivalThresholdMinutes} 
                                    onChange={e => handleChange('lateArrivalThresholdMinutes', e.target.value)}
                                    className="w-full bg-[#0b1120] border-b border-slate-700 p-2 text-white outline-none font-mono text-[13px] focus:border-white transition-colors"
                                />
                            </div>

                            { }
                            <div className="pt-2 flex items-center justify-between border-b border-slate-800/60 pb-4">
                                <div className="pr-4">
                                    <span className="text-[13px] font-bold text-white block">Yoklamada Otomatik Veli SMS'i</span>
                                    <span className="text-[11px] text-slate-500">Öğrenci devamsız yazıldığında veliye anında mesaj düşer.</span>
                                </div>
                                <button 
                                    type="button" 
                                    onClick={() => handleChange('autoSmsOnAbsence', !params.autoSmsOnAbsence)}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${params.autoSmsOnAbsence ? 'bg-emerald-500' : 'bg-slate-800'}`}
                                >
                                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${params.autoSmsOnAbsence ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Finans & Ödeme Parametreleri */}
                    <div className="flex flex-col gap-5 w-full">
                        <div className="pb-3 border-b border-slate-700/80">
                            <h3 className="font-bold text-[13px] text-slate-300 uppercase tracking-widest flex items-center gap-2">
                                <DollarSign size={16} className="text-white"/> Finans & Ödeme Parametreleri
                            </h3>
                        </div>

                        <div className="flex flex-col gap-5 w-full">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full">
                                <div>
                                    <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Para Birimi</label>
                                    <select 
                                        value={params.currency} 
                                        onChange={e => handleChange('currency', e.target.value)}
                                        className="w-full bg-[#0b1120] border-b border-slate-700 p-2 text-white outline-none text-[13px] focus:border-white transition-colors"
                                    >
                                        <option value="₺">₺ - Türk Lirası</option>
                                        <option value="$">$ - Dolar</option>
                                        <option value="€">€ - Euro</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Varsayılan KDV Oranı (%)</label>
                                    <input 
                                        type="number"
                                        value={params.vatRate} 
                                        onChange={e => handleChange('vatRate', e.target.value)}
                                        className="w-full bg-[#0b1120] border-b border-slate-700 p-2 text-white outline-none font-mono text-[13px] focus:border-white transition-colors"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Gecikme Faizi Oranı (%)</label>
                                <input 
                                    type="number"
                                    step="0.1"
                                    value={params.latePaymentInterestRate} 
                                    onChange={e => handleChange('latePaymentInterestRate', e.target.value)}
                                    className="w-full bg-[#0b1120] border-b border-slate-700 p-2 text-white outline-none font-mono text-[13px] focus:border-white transition-colors"
                                />
                            </div>
                        </div>
                    </div>

                    { }
                    <div className="pt-6 border-t border-slate-700/80 flex justify-end">
                        <button 
                            type="submit" 
                            className="flex items-center gap-2 px-8 py-3 text-white border border-slate-700 hover:bg-slate-800 rounded-xl text-[13px] font-bold transition-colors shadow-lg"
                        >
                            <Save size={16}/> Ayarları Kaydet
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default SystemParametersView;
