import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Edit, Calendar, UtensilsCrossed, CheckCircle2, X, Salad, ChefHat } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import UnsavedBanner from '../components/UnsavedBanner';

const CafeteriaAdminView = () => {
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);

  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const { markDirty, markClean, isDirty } = useUnsavedChanges();

  const [formData, setFormData] = useState({
    date: '',
    soup: '',
    mainCourse: '',
    sideDish: '',
    dessert: '',
    calories: '',
    allergens: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'cafeteria_menus'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMenus(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const openModal = (menu = null) => {
    if (menu) {
      setEditingId(menu.id);
      setFormData({
        date: menu.date || '',
        soup: menu.soup || '',
        mainCourse: menu.mainCourse || '',
        sideDish: menu.sideDish || '',
        dessert: menu.dessert || '',
        calories: menu.calories || '',
        allergens: menu.allergens || ''
      });
    } else {
      setEditingId(null);
      const today = new Date().toISOString().split('T')[0];
      setFormData({ date: today, soup: '', mainCourse: '', sideDish: '', dessert: '', calories: '', allergens: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    markClean();
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    markDirty();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.date) return;
    setIsSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, 'cafeteria_menus', editingId), { ...formData, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'cafeteria_menus'), { ...formData, createdAt: serverTimestamp() });
      }
      closeModal();
    } catch (error) {
      console.error('Menü kaydedilirken hata:', error);
      setFormError('Kayıt işlemi başarısız oldu.');
    }
    setIsSaving(false);
  };

  const handleDelete = async (id, dateStr) => {
    const formattedDate = new Date(dateStr).toLocaleDateString('tr-TR');
    setDeleteConfirm({ id, formattedDate });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteDoc(doc(db, 'cafeteria_menus', deleteConfirm.id));
    } catch (error) {
      console.error('Silme hatası:', error);
    }
    setDeleteConfirm(null);
  };

  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="w-full h-full flex-1 flex flex-col font-sans overflow-x-hidden overflow-y-auto custom-scrollbar pb-2 md:pb-6 p-4 md:p-12">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 w-full shrink-0 gap-4">
        <div className="flex items-center gap-5">
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">{currentDate}</span>
            <h1 className="text-[36px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none">Yemekhane Menüsü</h1>
          </div>
        </div>
        
        <button onClick={() => openModal()} className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-slate-900 dark:text-white text-[14px] font-semibold rounded-full transition-all shadow-sm shrink-0">
          <Plus size={18} strokeWidth={2.5}/> Yeni Menü Ekle
        </button>
      </div>

      <div className="flex-1 w-full min-h-0 relative">
        {loading ? (
           <div className="flex flex-col items-center justify-center h-48 text-slate-600 dark:text-slate-400">
             <div className="w-8 h-8 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-slate-900 animate-spin mb-4"></div>
             <span className="font-medium text-[13px]">Menüler yükleniyor...</span>
           </div>
         ) : menus.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-[32px] p-12 max-w-2xl mx-auto shadow-sm relative -left-[15px]">
              <div className="w-16 h-16 bg-slate-50 dark:bg-[#1e293b] rounded-full flex items-center justify-center mb-6 border border-slate-200 dark:border-white/10">
                <UtensilsCrossed size={32} className="text-slate-600 dark:text-slate-400" />
              </div>
              <h3 className="text-[20px] font-bold text-slate-800 dark:text-slate-200 mb-2 text-center">Henüz Menü Yok</h3>
              <p className="text-[14px] text-slate-500 font-medium text-center">Yemekhane menüsü eklemek için "Yeni Menü Ekle" butonunu kullanın.</p>
            </div>
         ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 pb-12 relative -left-[15px]">
            {menus.map(menu => {
              const menuDate = new Date(menu.date);
              const formattedDate = menuDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
              
              const isToday = new Date().toISOString().split('T')[0] === menu.date;

              return (
                <div key={menu.id} className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex flex-col relative overflow-hidden group hover:shadow-md transition-all duration-300">
                  {isToday && (
                    <div className="absolute top-0 right-0 px-3 py-1 bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-bl-[12px] z-10 shadow-sm">
                      Bugünün Menüsü
                    </div>
                  )}

                  {/* Header */}
                  <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800/60 flex items-center gap-3.5 bg-slate-50/50 dark:bg-[#1e293b]/40">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0 ${isToday ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20' : 'bg-white dark:bg-[#0f172a] text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800'}`}>
                      <Calendar size={18} />
                    </div>
                    <div>
                      <h2 className="text-[15px] font-bold text-slate-900 dark:text-white tracking-tight leading-tight">{formattedDate.split(' ')[0]} {formattedDate.split(' ')[1]}</h2>
                      <span className="text-[12px] font-medium text-slate-400">{formattedDate.split(' ')[3]}</span>
                    </div>
                  </div>

                  {/* Body Items */}
                  <div className="p-4 sm:p-5 flex-1 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-100 dark:border-amber-500/20 shrink-0">
                         <ChefHat size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-0.5">Çorba</div>
                        <div className="text-[13.5px] font-bold text-slate-800 dark:text-slate-200 leading-tight truncate">{menu.soup || '-'}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-100 dark:border-rose-500/20 shrink-0">
                         <UtensilsCrossed size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-0.5">Ana Yemek</div>
                        <div className="text-[13.5px] font-bold text-slate-800 dark:text-slate-200 leading-tight truncate">{menu.mainCourse || '-'}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20 shrink-0">
                         <Salad size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-0.5">Yardımcı Yemek</div>
                        <div className="text-[13.5px] font-bold text-slate-800 dark:text-slate-200 leading-tight truncate">{menu.sideDish || '-'}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20 shrink-0">
                         <CheckCircle2 size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-0.5">Tatlı / Meyve</div>
                        <div className="text-[13.5px] font-bold text-slate-800 dark:text-slate-200 leading-tight truncate">{menu.dessert || '-'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/70 dark:bg-[#1e293b]/50 flex items-center justify-between gap-3">
                     <div className="text-[12px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-3 min-w-0">
                       <div className="shrink-0">
                         <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mr-1.5">Kalori:</span>
                         <span className="text-slate-800 dark:text-slate-200">{menu.calories || '-'} kcal</span>
                       </div>
                       {menu.allergens && (
                         <div className="text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-100 dark:border-rose-500/20 flex items-center truncate">
                           <span className="text-[9.5px] font-bold uppercase tracking-widest mr-1">Alerjen:</span>
                           <span className="truncate">{menu.allergens}</span>
                         </div>
                       )}
                     </div>
                     <div className="flex gap-1.5 shrink-0">
                       <button onClick={() => openModal(menu)} className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 flex items-center justify-center transition-colors">
                         <Edit size={15} />
                       </button>
                       <button onClick={() => handleDelete(menu.id, menu.date)} className="w-8 h-8 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center justify-center transition-colors">
                         <Trash2 size={15} />
                       </button>
                     </div>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-[24px] w-full max-w-[400px] flex flex-col max-h-[85vh] overflow-hidden border border-slate-200/80 dark:border-slate-800/80 shadow-2xl">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center px-5 py-3.5 border-b border-slate-100 dark:border-slate-800/60">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <UtensilsCrossed size={18} />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight">
                    {editingId ? 'Menüyü Düzenle' : 'Yeni Menü Ekle'}
                  </h2>
                  <p className="text-[12px] text-slate-500 font-medium mt-0.5">Günün yemek ve kalori detaylarını belirleyin</p>
                </div>
              </div>
              <button 
                onClick={closeModal} 
                className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            {/* Modal Form Body */}
            <div className="p-4 sm:p-5 overflow-y-auto overflow-x-hidden custom-scrollbar flex-1">
              {formError && (
                <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 text-[12px] font-bold rounded-xl flex items-center justify-between">
                  <span>{formError}</span>
                  <button type="button" onClick={() => setFormError('')} className="text-rose-500 hover:text-rose-800"><X size={16}/></button>
                </div>
              )}
              <form id="menuForm" onSubmit={handleSave} className="flex flex-col gap-3 box-border">
                
                {/* Tarih */}
                <div className="w-[calc(50%+135px)]">
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Tarih *</label>
                  <input 
                    type="date" 
                    name="date" 
                    value={formData.date} 
                    onChange={handleChange} 
                    required 
                    className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-bold text-slate-700 dark:text-slate-300 transition-all"
                  />
                </div>

                {/* Çorba & Ana Yemek */}
                <div className="grid grid-cols-2 gap-3 w-full box-border min-w-0">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Çorba</label>
                    <input 
                      type="text" 
                      name="soup" 
                      value={formData.soup} 
                      onChange={handleChange} 
                      placeholder="Örn: Mercimek Çorbası" 
                      className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-medium text-slate-900 dark:text-slate-100 transition-all placeholder:text-slate-400/70 box-border"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Ana Yemek</label>
                    <input 
                      type="text" 
                      name="mainCourse" 
                      value={formData.mainCourse} 
                      onChange={handleChange} 
                      placeholder="Örn: Karnıyarık" 
                      className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-medium text-slate-900 dark:text-slate-100 transition-all placeholder:text-slate-400/70 box-border"
                    />
                  </div>
                </div>

                {/* Yardımcı Yemek & Tatlı */}
                <div className="grid grid-cols-2 gap-3 w-full box-border min-w-0">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Yardımcı Yemek</label>
                    <input 
                      type="text" 
                      name="sideDish" 
                      value={formData.sideDish} 
                      onChange={handleChange} 
                      placeholder="Örn: Pirinç Pilavı" 
                      className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-medium text-slate-900 dark:text-slate-100 transition-all placeholder:text-slate-400/70 box-border"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Tatlı / Meyve</label>
                    <input 
                      type="text" 
                      name="dessert" 
                      value={formData.dessert} 
                      onChange={handleChange} 
                      placeholder="Örn: Fırın Sütlaç" 
                      className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-medium text-slate-900 dark:text-slate-100 transition-all placeholder:text-slate-400/70 box-border"
                    />
                  </div>
                </div>

                {/* Kalori & Alerjen */}
                <div className="grid grid-cols-2 gap-3 w-full box-border min-w-0">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Toplam Kalori (kcal)</label>
                    <input 
                      type="number" 
                      name="calories" 
                      value={formData.calories} 
                      onChange={handleChange} 
                      placeholder="Örn: 850" 
                      className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-bold text-slate-900 dark:text-slate-100 transition-all placeholder:text-slate-400/70 box-border text-left"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-rose-600 mb-1 ml-0.5">Alerjen Durumu</label>
                    <input 
                      type="text" 
                      name="allergens" 
                      value={formData.allergens} 
                      onChange={handleChange} 
                      placeholder="Örn: Gluten, Süt" 
                      className="w-full px-3.5 py-2 bg-rose-50/50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 outline-none rounded-xl focus:ring-2 focus:ring-rose-500/20 text-[13px] font-bold text-rose-750 dark:text-rose-400 transition-all placeholder:text-rose-300 box-border"
                    />
                  </div>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 dark:bg-[#0f172a] border-t border-slate-100 dark:border-slate-800/60 flex justify-end items-center gap-2.5 rounded-b-[24px]">
              <button 
                type="button"
                onClick={closeModal} 
                className="px-4 py-2 text-[12px] font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                İptal Et
              </button>
              <button 
                form="menuForm" 
                type="submit" 
                className="px-6 py-2 text-[12px] font-bold text-white bg-slate-900 dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 active:scale-[0.98] rounded-xl transition-all disabled:opacity-50 min-w-[100px] flex justify-center items-center" 
                disabled={isSaving}
              >
                {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {deleteConfirm && createPortal(
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl w-full max-w-sm shadow-2xl p-6 flex flex-col gap-4 border border-slate-200/80 dark:border-slate-800">
            <h3 className="text-[18px] font-bold text-slate-900 dark:text-white">Menüyü Sil</h3>
            <p className="text-[14px] text-slate-600 dark:text-slate-400 font-medium">{deleteConfirm.formattedDate} tarihli menüyü silmek istediğinize emin misiniz?</p>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2.5 text-[13px] font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">İptal</button>
              <button onClick={confirmDelete} className="px-4 py-2.5 text-[13px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors">Sil</button>
            </div>
          </div>
        </div>
      , document.body)}

      <UnsavedBanner visible={isDirty} />
    </div>
  );
};

export default CafeteriaAdminView;
