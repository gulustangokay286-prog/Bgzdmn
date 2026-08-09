import React, { useState, useEffect } from 'react';
import { ClipboardList, PlusCircle, Trash2, Edit, X, Search, Filter, Tag, Percent, CreditCard } from 'lucide-react';
import { rtdb } from '../services/firebaseConfig';
import { ref, onValue, push, remove } from 'firebase/database';

const CATEGORIES = [
    'Tümü',
    'Eğitim & Öğrenim',
    'Operasyonel & Kırtasiye',
    'Fatura & Kurumsal',
    'Personel & İnsan Kaynakları',
    'Etkinlik & Organizasyon',
    'Genel / Diğer'
];

const FinanceDefinitionsView = () => {
    const [definitions, setDefinitions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Filter & Search states
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Tümü');

    // Form state
    const [formName, setFormName] = useState('');
    const [formCode, setFormCode] = useState('');
    const [formType, setFormType] = useState('income');
    const [formCategory, setFormCategory] = useState('Eğitim & Öğrenim');
    const [formVatRate, setFormVatRate] = useState('20');
    const [formPaymentMethod, setFormPaymentMethod] = useState('Banka / Havale');
    const [formStatus, setFormStatus] = useState('Aktif');
    const [formDescription, setFormDescription] = useState('');

    useEffect(() => {
        const defsRef = ref(rtdb, 'finance_definitions');
        const unsubscribe = onValue(defsRef, (snapshot) => {
            if (snapshot.exists()) {
                const val = snapshot.val();
                const list = Object.keys(val).map(key => ({
                    id: key,
                    ...val[key]
                }));
                setDefinitions(list);
            } else {
                setDefinitions([]);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formName.trim()) return;
        try {
            await push(ref(rtdb, 'finance_definitions'), {
                name: formName.trim(),
                code: formCode.trim(),
                type: formType,
                category: formCategory,
                vatRate: formVatRate,
                paymentMethod: formPaymentMethod,
                status: formStatus,
                description: formDescription.trim(),
                createdAt: new Date().toISOString()
            });
            setIsModalOpen(false);
            resetForm();
        } catch (error) {
            console.error("Tanım eklenemedi:", error);
        }
    };

    const resetForm = () => {
        setFormName(''); 
        setFormCode('');
        setFormType('income');
        setFormCategory('Eğitim & Öğrenim');
        setFormVatRate('20');
        setFormPaymentMethod('Banka / Havale');
        setFormStatus('Aktif');
        setFormDescription('');
    };

    const handleDelete = async (id) => {
        try {
            await remove(ref(rtdb, `finance_definitions/${id}`));
        } catch (error) {
            console.error("Tanım silinemedi:", error);
        }
    };

    // Filtered lists
    const filteredDefs = definitions.filter(d => {
        const matchesSearch = (d.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || 
                              (d.code?.toLowerCase() || '').includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategory === 'Tümü' || d.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const incomeDefs = filteredDefs.filter(d => d.type === 'income');
    const expenseDefs = filteredDefs.filter(d => d.type === 'expense');

    return (
        <div className="w-full h-full font-sans bg-[#0b1120] text-slate-100 overflow-y-auto custom-scrollbar p-4 sm:p-6 md:p-8 flex flex-col items-center">
            {/* Centered Container */}
            <div className="w-full max-w-[760px] flex flex-col gap-8 pb-24">
                
                {/* Header Section */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 border-b border-slate-700/80 pb-6 pt-2">
                    <div>
                        <h1 className="text-[22px] font-bold text-white tracking-tight flex items-center gap-3 uppercase">
                            <ClipboardList size={22} className="text-white"/> Gelir / Gider Tanımları
                        </h1>
                        <p className="text-[13px] text-slate-400 mt-1">Gelişmiş kategori, KDV ve ödeme yöntemli veri tabanı.</p>
                    </div>

                    <button 
                        onClick={() => setIsModalOpen(true)} 
                        className="flex items-center gap-2 px-5 py-2.5 text-white border border-slate-700 hover:bg-slate-800 rounded-xl text-[13px] font-bold transition-colors shrink-0 self-start sm:self-auto"
                    >
                        <PlusCircle size={16}/> Detaylı Tanım Ekle
                    </button>
                </div>

                {/* Filter & Search Bar */}
                <div className="flex flex-col gap-4 w-full">
                    <div className="flex items-center gap-3 bg-[#0b1120] border-b border-slate-700 pb-2">
                        <Search size={16} className="text-slate-400"/>
                        <input 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Tanım adı veya muhasebe kodu ile filtrele..."
                            className="w-full bg-transparent text-white outline-none text-[13px] placeholder:text-slate-500"
                        />
                    </div>

                    {/* Category Filter Pills */}
                    <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all whitespace-nowrap ${selectedCategory === cat ? 'bg-white text-slate-950 shadow' : 'text-slate-400 hover:text-white hover:bg-slate-800/40'}`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Grid Area */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 w-full">
                    
                    {/* Income Column */}
                    <div className="flex flex-col gap-3 w-full">
                        <div className="pb-3 border-b border-slate-700/80 flex items-center justify-between">
                            <h3 className="font-bold text-[13px] text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Gelir Kalemleri
                            </h3>
                            <span className="text-[12px] font-mono text-slate-500 font-bold">{incomeDefs.length} Tanım</span>
                        </div>

                        <div className="flex flex-col gap-2 w-full">
                            {incomeDefs.map(def => (
                                <div 
                                    key={def.id} 
                                    className="flex justify-between items-start py-3.5 px-3 border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors group"
                                >
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-[14px] text-slate-200">{def.name}</span>
                                            {def.category && (
                                                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-medium">
                                                    {def.category}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
                                            <span>KOD: {def.code || '-'}</span>
                                            {def.vatRate && <span>KDV: %{def.vatRate}</span>}
                                            {def.paymentMethod && <span>{def.paymentMethod}</span>}
                                        </div>
                                        {def.description && (
                                            <p className="text-[11px] text-slate-400 italic mt-0.5">{def.description}</p>
                                        )}
                                    </div>
                                    
                                    <button onClick={() => handleDelete(def.id)} className="text-slate-500 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100" title="Sil">
                                        <Trash2 size={15}/>
                                    </button>
                                </div>
                            ))}
                            {incomeDefs.length === 0 && !loading && (
                                <div className="text-center text-slate-500 py-12 text-[13px] italic">Eşleşen gelir kalemi bulunmuyor.</div>
                            )}
                        </div>
                    </div>

                    {/* Expense Column */}
                    <div className="flex flex-col gap-3 w-full">
                        <div className="pb-3 border-b border-slate-700/80 flex items-center justify-between">
                            <h3 className="font-bold text-[13px] text-rose-400 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-rose-500"></span> Gider Kalemleri
                            </h3>
                            <span className="text-[12px] font-mono text-slate-500 font-bold">{expenseDefs.length} Tanım</span>
                        </div>

                        <div className="flex flex-col gap-2 w-full">
                            {expenseDefs.map(def => (
                                <div 
                                    key={def.id} 
                                    className="flex justify-between items-start py-3.5 px-3 border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors group"
                                >
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-[14px] text-slate-200">{def.name}</span>
                                            {def.category && (
                                                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-medium">
                                                    {def.category}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
                                            <span>KOD: {def.code || '-'}</span>
                                            {def.vatRate && <span>KDV: %{def.vatRate}</span>}
                                            {def.paymentMethod && <span>{def.paymentMethod}</span>}
                                        </div>
                                        {def.description && (
                                            <p className="text-[11px] text-slate-400 italic mt-0.5">{def.description}</p>
                                        )}
                                    </div>

                                    <button onClick={() => handleDelete(def.id)} className="text-slate-500 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100" title="Sil">
                                        <Trash2 size={15}/>
                                    </button>
                                </div>
                            ))}
                            {expenseDefs.length === 0 && !loading && (
                                <div className="text-center text-slate-500 py-12 text-[13px] italic">Eşleşen gider kalemi bulunmuyor.</div>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* Rich Detailed Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-[#0b1120] border border-slate-700 p-6 rounded-2xl w-full max-w-md shadow-2xl relative flex flex-col gap-5 max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                            <h2 className="font-bold text-[16px] text-white uppercase tracking-wider">Detaylı Finans Tanımı Ekle</h2>
                            <button onClick={()=>setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X size={18}/></button>
                        </div>
                        
                        <form onSubmit={handleSave} className="flex flex-col gap-5">
                            {/* Tip Seçimi */}
                            <div>
                                <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">İşlem Tipi</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        type="button" 
                                        onClick={()=>setFormType('income')} 
                                        className={`py-2.5 rounded-xl text-[13px] font-bold transition-all border ${formType==='income'?'bg-emerald-950/40 text-emerald-400 border-emerald-800/60':'bg-transparent text-slate-500 border-slate-800 hover:text-slate-300'}`}
                                    >
                                        Gelir Kalemi
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={()=>setFormType('expense')} 
                                        className={`py-2.5 rounded-xl text-[13px] font-bold transition-all border ${formType==='expense'?'bg-rose-950/40 text-rose-400 border-rose-800/60':'bg-transparent text-slate-500 border-slate-800 hover:text-slate-300'}`}
                                    >
                                        Gider Kalemi
                                    </button>
                                </div>
                            </div>

                            {/* Tanım Adı */}
                            <div>
                                <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Tanım Adı *</label>
                                <input 
                                    required 
                                    value={formName} 
                                    onChange={e=>setFormName(e.target.value)} 
                                    className="w-full bg-[#0b1120] border-b border-slate-700 p-2 text-white outline-none focus:border-white transition-colors text-[13px]" 
                                    placeholder="Örn: Kırtasiye & Büro Malzemeleri"
                                />
                            </div>

                            {/* Kategori Seçimi */}
                            <div>
                                <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Ana Kategori</label>
                                <select 
                                    value={formCategory}
                                    onChange={e => setFormCategory(e.target.value)}
                                    className="w-full bg-[#0b1120] border-b border-slate-700 p-2 text-white outline-none text-[13px] focus:border-white transition-colors"
                                >
                                    {CATEGORIES.filter(c => c !== 'Tümü').map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Muhasebe Kodu & KDV Oranı */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Muhasebe Kodu</label>
                                    <input 
                                        value={formCode} 
                                        onChange={e=>setFormCode(e.target.value)} 
                                        className="w-full bg-[#0b1120] border-b border-slate-700 p-2 text-white outline-none font-mono text-[12px] focus:border-white transition-colors" 
                                        placeholder="770.01.002"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Varsayılan KDV (%)</label>
                                    <select 
                                        value={formVatRate}
                                        onChange={e => setFormVatRate(e.target.value)}
                                        className="w-full bg-[#0b1120] border-b border-slate-700 p-2 text-white outline-none font-mono text-[13px] focus:border-white transition-colors"
                                    >
                                        <option value="0">%0 (Muaf)</option>
                                        <option value="1">%1</option>
                                        <option value="10">%10</option>
                                        <option value="20">%20 (Standart)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Varsayılan Ödeme Yöntemi */}
                            <div>
                                <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Varsayılan Ödeme Yöntemi</label>
                                <select 
                                    value={formPaymentMethod}
                                    onChange={e => setFormPaymentMethod(e.target.value)}
                                    className="w-full bg-[#0b1120] border-b border-slate-700 p-2 text-white outline-none text-[13px] focus:border-white transition-colors"
                                >
                                    <option value="Banka / Havale">Banka / Havale</option>
                                    <option value="Nakit Kasa">Nakit Kasa</option>
                                    <option value="Kredi Kartı / POS">Kredi Kartı / POS</option>
                                    <option value="Çek / Senet">Çek / Senet</option>
                                </select>
                            </div>

                            {/* Açıklama / Notlar */}
                            <div>
                                <label className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Açıklama / Notlar (Opsiyonel)</label>
                                <textarea 
                                    rows={2}
                                    value={formDescription}
                                    onChange={e => setFormDescription(e.target.value)}
                                    className="w-full bg-[#0b1120] border border-slate-800 rounded-xl p-2.5 text-white outline-none text-[12px] focus:border-slate-600 transition-colors custom-scrollbar"
                                    placeholder="Bu kalem hakkında kurum içi notlar..."
                                />
                            </div>

                            <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-slate-800">
                                <button type="button" onClick={()=>setIsModalOpen(false)} className="px-4 py-2 font-bold text-slate-400 hover:text-white transition-colors text-[13px]">İptal</button>
                                <button type="submit" className="px-6 py-2 font-bold text-white border border-slate-700 hover:bg-slate-800 rounded-xl text-[13px] transition-colors">Kaydet</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinanceDefinitionsView;
