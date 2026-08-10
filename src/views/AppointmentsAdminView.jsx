import React, { useState, useEffect, useRef } from 'react';
import { CalendarDays, Clock, MessageSquare, Plus, Trash2, Edit2, Search, User, RefreshCcw, X, Phone, UserCircle, AlignLeft, CalendarCheck, BellRing } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, onSnapshot, updateDoc, doc, deleteDoc, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';

const AppointmentsAdminView = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const prevPendingCountRef = useRef(0);

  const [formData, setFormData] = useState({
    parentName: '',
    studentName: '',
    teacherName: '',
    date: '',
    time: '',
    note: '',
    status: 'pending'
  });

  useEffect(() => {
    
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }

    const q = query(collection(db, 'appointments'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      data.sort((a, b) => {
        if (!a.date || !b.date) return 0;
        const dateA = new Date(a.date + 'T' + (a.time || '00:00'));
        const dateB = new Date(b.date + 'T' + (b.time || '00:00'));
        return dateB - dateA;
      });

      const currentPendingCount = data.filter(a => (a.status || 'pending') === 'pending').length;
      
      if (currentPendingCount > prevPendingCountRef.current && !loading) {
         if ('Notification' in window && Notification.permission === 'granted') {
             new Notification('Yeni Randevu Talebi', {
                 body: 'Sistemde onayınızı bekleyen yeni bir randevu talebi var.',
                 icon: '/favicon.ico'
             });
         }
      }
      prevPendingCountRef.current = currentPendingCount;

      setAppointments(data);
      setLoading(false);
    }, (error) => {
      console.error("Randevular çekilirken hata:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [loading]);

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      await updateDoc(doc(db, 'appointments', id), {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Randevu güncellenirken hata:', error);
      setFormError('Randevu durumu güncellenemedi.');
    }
  };

  const handleDelete = async (id) => {
    setDeleteConfirm(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteDoc(doc(db, 'appointments', deleteConfirm));
    } catch (error) {
      console.error('Randevu silinirken hata:', error);
    }
    setDeleteConfirm(null);
  };

  const openModal = (app = null) => {
    if (app) {
      setEditingId(app.id);
      setFormData({
        parentName: app.parentName || '',
        studentName: app.studentName || '',
        teacherName: app.teacherName || '',
        date: app.date || '',
        time: app.time || '',
        note: app.note || '',
        status: app.status || 'pending'
      });
    } else {
      setEditingId(null);
      const today = new Date().toISOString().split('T')[0];
      setFormData({ parentName: '', studentName: '', teacherName: '', date: today, time: '09:00', note: '', status: 'pending' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const handleSaveAppointment = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, 'appointments', editingId), {
          ...formData,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'appointments'), {
          ...formData,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error('Hata:', error);
      setFormError("İşlem sırasında bir hata oluştu.");
    }
    setIsSaving(false);
  };

  const filteredAppointments = appointments.filter(app => {
    const statusMatch = activeTab === 'all' ? true : (app.status || 'pending') === activeTab;
    const searchMatch = 
      (app.parentName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (app.studentName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (app.teacherName || '').toLowerCase().includes(searchQuery.toLowerCase());
    return statusMatch && searchMatch;
  });

  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const pendingCount = appointments.filter(a => (a.status || 'pending') === 'pending').length;

  return (
    <div className="absolute inset-0 bg-[#FAFAFA] dark:bg-[#0b1120] z-40 overflow-y-auto overflow-x-hidden font-sans custom-scrollbar flex flex-col p-6 md:p-10">
      
      <div className="w-full max-w-[1600px] flex flex-col flex-1 min-h-0">

        { }
        <div className="flex flex-col shrink-0 mb-6">
          <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-widest">{currentDate}</span>
          <h1 className="text-[32px] font-bold text-slate-900 dark:text-white tracking-tight leading-none">Randevular</h1>
        </div>

        {formError && !isModalOpen && (
          <div className="w-full flex items-center justify-between mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-[13px] font-bold rounded-xl">
            <span>{formError}</span>
            <button type="button" onClick={() => setFormError('')} className="text-rose-500 hover:text-rose-800"><X size={16}/></button>
          </div>
        )}

        {selectedAppointment ? (
           
          <div className="flex-1 flex flex-col min-h-0 w-full">
            <button 
              onClick={() => setSelectedAppointment(null)}
              className="flex items-center gap-2 text-[14px] font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors mb-6 self-start"
            >
              <span className="text-[18px] leading-none rotate-180">&rsaquo;</span> Listeye Dön
            </button>
            
            <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm p-8 flex flex-col gap-8 flex-1">
              <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800/60 pb-6">
                <div>
                  <h2 className="text-[24px] font-bold text-slate-900 dark:text-white mb-2">{selectedAppointment.parentName || 'İsimsiz Veli'}</h2>
                  <div className="flex items-center gap-4 text-[14px] font-medium text-slate-500">
                    <span className="flex items-center gap-1.5"><User size={16}/> Öğrenci: {selectedAppointment.studentName || '-'}</span>
                  </div>
                </div>
                <div>
                  {(selectedAppointment.status || 'pending') === 'pending' && <span className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-200 text-[12px] font-bold uppercase tracking-widest">Bekliyor</span>}
                  {(selectedAppointment.status || 'pending') === 'approved' && <span className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 text-[12px] font-bold uppercase tracking-widest">Onaylandı</span>}
                  {(selectedAppointment.status || 'pending') === 'cancelled' && <span className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 text-[12px] font-bold uppercase tracking-widest">İptal</span>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Tarih & Saat</span>
                  <span className="text-[15px] font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <CalendarDays size={18} className="text-indigo-500"/>
                    {selectedAppointment.date ? new Date(selectedAppointment.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '-'} 
                    <span className="text-slate-300 dark:text-slate-700">|</span> 
                    <Clock size={18} className="text-indigo-500"/> {selectedAppointment.time || '-'}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Görüşülecek Öğretmen</span>
                  <span className="text-[15px] font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <UserCircle size={18} className="text-indigo-500"/>
                    {selectedAppointment.teacherName || '-'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
                <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><AlignLeft size={16}/> Veli Notu / Açıklama</span>
                <p className="text-[15px] text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                  {selectedAppointment.note || <span className="italic text-slate-400">Not eklenmemiş.</span>}
                </p>
              </div>

              <div className="mt-auto pt-6 border-t border-slate-100 dark:border-slate-800/60 flex flex-wrap items-center justify-end gap-3">
                <button onClick={() => { setSelectedAppointment(null); openModal(selectedAppointment); }} className="px-5 py-2.5 rounded-xl bg-white dark:bg-[#1e293b] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition-colors text-[14px] font-bold flex items-center gap-2">
                  <Edit2 size={16}/> Düzenle
                </button>
                
                {(selectedAppointment.status || 'pending') === 'pending' && (
                  <>
                    <button onClick={() => { handleUpdateStatus(selectedAppointment.id, 'cancelled'); setSelectedAppointment({...selectedAppointment, status: 'cancelled'}); }} className="px-5 py-2.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors text-[14px] font-bold border border-rose-100">Reddet</button>
                    <button onClick={() => { handleUpdateStatus(selectedAppointment.id, 'approved'); setSelectedAppointment({...selectedAppointment, status: 'approved'}); }} className="px-5 py-2.5 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-colors text-[14px] font-bold shadow-sm">Onayla</button>
                  </>
                )}
                {(selectedAppointment.status || 'pending') === 'approved' && (
                  <button onClick={() => { handleUpdateStatus(selectedAppointment.id, 'cancelled'); setSelectedAppointment({...selectedAppointment, status: 'cancelled'}); }} className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors text-[14px] font-bold">İptal Et</button>
                )}
                {(selectedAppointment.status || 'pending') === 'cancelled' && (
                  <button onClick={() => { handleUpdateStatus(selectedAppointment.id, 'pending'); setSelectedAppointment({...selectedAppointment, status: 'pending'}); }} className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors text-[14px] font-bold">Beklemeye Al</button>
                )}
              </div>
            </div>
          </div>
        ) : (
           
          <div className="w-full flex-1 flex flex-col gap-6 min-h-0">
            
            { }
            {pendingCount > 0 && (
              <div 
                onClick={() => setActiveTab('pending')}
                style={{ width: 'calc(100% - 37px)' }}
                className="flex items-center justify-between px-5 py-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200/80 dark:border-amber-500/20 rounded-2xl cursor-pointer hover:bg-amber-100/70 dark:hover:bg-amber-500/20 transition-colors" 
              >
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                <span className="text-[13.5px] font-medium text-slate-700 dark:text-slate-300">
                  Sistemde onayınızı bekleyen <strong className="font-bold text-slate-900 dark:text-white">{pendingCount} randevu talebi</strong> bulunuyor.
                </span>
              </div>
              <span className="text-[13px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                İncele <span className="text-[15px] leading-none">&rsaquo;</span>
              </span>
            </div>
          )}

          { }
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 w-full mb-6 shrink-0">
            { }
            <div className="flex items-center w-[calc(92%+16px)] sm:w-auto bg-slate-100 dark:bg-[#0f172a]/60 p-1.5 rounded-full border border-slate-200/80 dark:border-slate-700/60 shrink-0">
              {['pending', 'approved', 'all'].map((tab) => {
                const labels = { pending: 'Bekleyenler', approved: 'Onaylananlar', all: 'Tümü' };
                const count = tab === 'pending' ? pendingCount : 0;
                return (
                  <button 
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2 rounded-full text-[12.5px] sm:text-[13px] font-bold transition-all whitespace-nowrap border ${
                      activeTab === tab 
                        ? 'bg-white dark:bg-[#1e293b] text-slate-900 dark:text-white border-slate-200/60 dark:border-slate-600/60 shadow-sm' 
                        : 'bg-transparent text-slate-500 border-transparent hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {labels[tab]}
                    {count > 0 && tab === 'pending' && (
                      <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                        activeTab === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' : 'bg-slate-200 text-slate-500 dark:bg-slate-700'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            { }
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 shrink-0">
              <div className="relative flex items-center flex-1">
                <Search size={15} className="absolute left-3.5 text-slate-400 pointer-events-none" />
                <input 
                  type="text" 
                  placeholder="Veli veya öğrenci ara..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-60 pl-10 pr-8 py-2.5 sm:py-2 bg-white dark:bg-[#0f172a] border border-slate-200/90 dark:border-slate-700/80 rounded-xl sm:rounded-full focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-white/20 focus:border-slate-400 outline-none text-[13px] font-medium text-slate-900 dark:text-white transition-all placeholder:text-slate-400"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                    <X size={14} />
                  </button>
                )}
              </div>

              <button 
                onClick={() => openModal()} 
                className="flex items-center justify-center gap-2 px-5 py-2.5 sm:py-2 bg-white dark:bg-white text-slate-900 dark:text-slate-900 hover:bg-slate-100 active:bg-slate-200 border border-slate-200/90 dark:border-slate-300 text-[13px] font-bold rounded-xl sm:rounded-full transition-all shrink-0 whitespace-nowrap shadow-sm"
              >
                <Plus size={16} strokeWidth={2.5}/> Yeni Randevu
              </button>
            </div>
          </div>

          { }
          <div className="bg-transparent flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-8 flex flex-col gap-2.5">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <div className="w-7 h-7 rounded-full border-2 border-indigo-500/20 border-t-indigo-600 animate-spin mb-2"></div>
                  <span className="text-[13px] font-medium">Yükleniyor...</span>
                </div>
              ) : filteredAppointments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-center">
                  <div className="w-12 h-12 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-center mb-3 shadow-sm">
                    <CalendarDays size={22} className="text-slate-400" />
                  </div>
                  <span className="text-[14px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">Randevu Bulunamadı</span>
                  <span className="text-[13px] font-medium text-slate-400">Arama kriterlerine uygun kayıt yok.</span>
                </div>
              ) : (
                filteredAppointments.map((app) => {
                  const dateObj = app.date ? new Date(app.date) : null;
                  const isPending = (app.status || 'pending') === 'pending';
                  const isApproved = (app.status || 'pending') === 'approved';
                  const isCancelled = (app.status || 'pending') === 'cancelled';

                  const dateFormatted = dateObj 
                    ? dateObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
                    : app.date || '-';

                  return (
                    <div 
                      key={app.id} 
                      className="bg-white dark:bg-[#0f172a] rounded-[16px] border border-slate-200/70 dark:border-slate-800/80 p-3 sm:p-4 flex flex-col sm:flex-row gap-3 sm:gap-4 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-300/90 dark:hover:border-slate-700 transition-all cursor-pointer group" 
                      onClick={() => setSelectedAppointment(app)}
                    >
                      { }
                      <div className="flex justify-between items-start sm:hidden w-full">
                        <div className="flex flex-col gap-1.5 pr-2">
                          <h3 className="font-bold text-[15px] text-slate-900 dark:text-white leading-tight">{app.parentName || 'İsimsiz Veli'}</h3>
                          <div className="flex flex-wrap gap-2 items-center">
                            {isPending && <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-500/20 text-[9px] font-bold uppercase tracking-wider shrink-0">Bekliyor</span>}
                            {isApproved && <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-500/20 text-[9px] font-bold uppercase tracking-wider shrink-0">Onaylandı</span>}
                            {isCancelled && <span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-500/20 text-[9px] font-bold uppercase tracking-wider shrink-0">İptal</span>}
                          </div>
                        </div>
                        <div className="flex flex-col items-end shrink-0">
                          <span className="text-[13px] font-bold text-slate-700 dark:text-slate-300">{app.time || '-'}</span>
                          <span className="text-[11px] font-medium text-slate-400 mt-0.5">{dateFormatted}</span>
                        </div>
                      </div>

                      { }
                      <div className="flex items-center gap-3 sm:gap-4 w-full">
                         { }
                         <div className={`w-11 h-11 shrink-0 rounded-2xl flex flex-col items-center justify-center border shadow-sm ${
                           isApproved ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' :
                           isCancelled ? 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' :
                           'bg-slate-50 dark:bg-[#1e293b] text-slate-800 dark:text-slate-200 border-slate-200/80 dark:border-white/10'
                         }`}>
                           <span className="text-[9px] font-bold uppercase tracking-wider leading-none mb-0.5">
                             {dateObj ? dateObj.toLocaleDateString('tr-TR', { month: 'short' }) : 'AY'}
                           </span>
                           <span className="text-[15px] font-bold leading-none">
                             {dateObj ? dateObj.getDate() : '-'}
                           </span>
                         </div>
                         
                         { }
                         <div className="flex flex-col flex-1 min-w-0 justify-center">
                           <div className="hidden sm:flex items-center gap-2 mb-0.5">
                             <h3 className="font-bold text-[14px] text-slate-900 dark:text-white truncate">{app.parentName || 'İsimsiz Veli'}</h3>
                             {isPending && <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-500/20 text-[9px] font-bold uppercase tracking-wider shrink-0">Bekliyor</span>}
                             {isApproved && <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-500/20 text-[9px] font-bold uppercase tracking-wider shrink-0">Onaylandı</span>}
                             {isCancelled && <span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-500/20 text-[9px] font-bold uppercase tracking-wider shrink-0">İptal</span>}
                           </div>
                           <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-[12px] font-medium text-slate-500 dark:text-slate-400">
                              <span className="flex items-center gap-1.5"><User size={13} className="text-slate-400"/> {app.studentName || 'Bilinmiyor'}</span>
                              <span className="hidden sm:inline text-slate-300 dark:text-slate-700">•</span>
                              <span className="flex items-center gap-1.5"><UserCircle size={13} className="text-slate-400"/> {app.teacherName || '-'}</span>
                           </div>
                         </div>

                         { }
                         <div className="hidden sm:flex flex-col items-end shrink-0 ml-auto mr-3">
                           <span className="text-[13px] font-bold text-slate-700 dark:text-slate-300">{app.time || '-'}</span>
                           <span className="text-[11px] font-medium text-slate-400 mt-0.5">{dateFormatted}</span>
                         </div>

                         { }
                         <div className="w-8 h-8 rounded-full bg-slate-100/70 dark:bg-slate-800 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white group-hover:bg-white dark:group-hover:bg-slate-700 flex items-center justify-center transition-colors shrink-0 border border-slate-200/60 dark:border-slate-700">
                           <span className="text-[16px] leading-none mb-0.5 ml-0.5">&rsaquo;</span>
                         </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-[24px] w-full max-w-[500px] flex flex-col max-h-[90vh] overflow-hidden border border-slate-200/80 dark:border-slate-800/80 shadow-2xl">

            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 dark:border-slate-800/60">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  {editingId ? <Edit2 size={16} /> : <UserCircle size={18} />}
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight">
                    {editingId ? 'Randevuyu Düzenle' : 'Yeni Randevu'}
                  </h2>
                  <p className="text-[12px] text-slate-500 font-medium mt-0.5">Görüşme ve zaman detaylarını belirleyin</p>
                </div>
              </div>
              <button onClick={closeModal} className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-7 overflow-y-auto overflow-x-hidden custom-scrollbar flex-1">
              {formError && (
                <div className="mb-5 p-3.5 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[13px] font-medium rounded-xl flex items-center justify-between">
                  <span>{formError}</span>
                  <button type="button" onClick={() => setFormError('')}><X size={15}/></button>
                </div>
              )}
              
              <form id="appointmentForm" className="flex flex-col gap-6 box-border" onSubmit={handleSaveAppointment}>
                
                <div>
                  <label className="block text-[12.5px] font-medium text-slate-600 dark:text-slate-400 mb-2 ml-0.5">Veli Adı Soyadı *</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-slate-100/70 dark:bg-[#1e293b]/70 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13.5px] font-normal text-slate-900 dark:text-slate-100 transition-all placeholder:text-slate-400/70 box-border" 
                    value={formData.parentName} 
                    onChange={e => setFormData({ ...formData, parentName: e.target.value })} 
                    placeholder="Örn: Ahmet Yılmaz" 
                    required 
                  />
                </div>

                <div>
                  <label className="block text-[12.5px] font-medium text-slate-600 dark:text-slate-400 mb-2 ml-0.5">Öğrenci Adı Soyadı</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-slate-100/70 dark:bg-[#1e293b]/70 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13.5px] font-normal text-slate-900 dark:text-slate-100 transition-all placeholder:text-slate-400/70 box-border" 
                    value={formData.studentName} 
                    onChange={e => setFormData({ ...formData, studentName: e.target.value })} 
                    placeholder="Örn: Ayşe Yılmaz" 
                  />
                </div>

                <div>
                  <label className="block text-[12.5px] font-medium text-slate-600 dark:text-slate-400 mb-2 ml-0.5">Görüşülecek Öğretmen *</label>
                  <input 
                    type="text" 
                    className="w-full px-4 py-3 bg-slate-100/70 dark:bg-[#1e293b]/70 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13.5px] font-normal text-slate-900 dark:text-slate-100 transition-all placeholder:text-slate-400/70 box-border" 
                    value={formData.teacherName} 
                    onChange={e => setFormData({ ...formData, teacherName: e.target.value })} 
                    placeholder="Örn: Matematik Öğretmeni" 
                    required 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 w-full box-border">
                  <div className="min-w-0">
                    <label className="block text-[12.5px] font-medium text-slate-600 dark:text-slate-400 mb-2 ml-0.5">Tarih *</label>
                    <input 
                      type="date" 
                      className="w-full px-3.5 py-3 bg-slate-100/70 dark:bg-[#1e293b]/70 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13.5px] font-normal text-slate-900 dark:text-slate-100 transition-all box-border" 
                      value={formData.date} 
                      onChange={e => setFormData({ ...formData, date: e.target.value })} 
                      required 
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="block text-[12.5px] font-medium text-slate-600 dark:text-slate-400 mb-2 ml-0.5">Saat *</label>
                    <input 
                      type="time" 
                      className="w-full px-3.5 py-3 bg-slate-100/70 dark:bg-[#1e293b]/70 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13.5px] font-normal text-slate-900 dark:text-slate-100 transition-all box-border" 
                      value={formData.time} 
                      onChange={e => setFormData({ ...formData, time: e.target.value })} 
                      required 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[12.5px] font-medium text-slate-600 dark:text-slate-400 mb-2 ml-0.5">Açıklama / Veli Notu</label>
                  <textarea 
                    rows="3" 
                    className="w-full px-4 py-3 bg-slate-100/70 dark:bg-[#1e293b]/70 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13.5px] font-normal text-slate-900 dark:text-slate-100 resize-none transition-all placeholder:text-slate-400/70 box-border" 
                    value={formData.note} 
                    onChange={e => setFormData({ ...formData, note: e.target.value })} 
                    placeholder="Eklemek istediğiniz açıklama veya not..."
                  ></textarea>
                </div>

              </form>
            </div>

            <div className="px-6 py-5 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-[#0f172a] flex justify-end gap-3 rounded-b-[24px]">
              <button 
                type="button" 
                onClick={closeModal} 
                className="px-5 py-2.5 text-[13.5px] font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                İptal Et
              </button>
              <button 
                form="appointmentForm" 
                type="submit" 
                className="px-7 py-2.5 text-[13.5px] font-bold text-white bg-slate-900 dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 active:scale-[0.98] rounded-xl transition-all disabled:opacity-50 min-w-[120px] flex justify-center items-center" 
                disabled={isSaving}
              >
                {isSaving ? 'Kaydediliyor...' : (editingId ? 'Değişiklikleri Kaydet' : 'Randevu Oluştur')}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#0f172a] rounded-[24px] w-full max-w-[400px] shadow-2xl p-6 flex flex-col gap-4 border border-slate-200/80 dark:border-slate-800">
            <h3 className="text-[20px] font-bold text-slate-900 dark:text-white">Randevuyu Sil</h3>
            <p className="text-[14.5px] text-slate-600 dark:text-slate-400 font-medium leading-relaxed">Bu randevuyu sistemden kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.</p>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setDeleteConfirm(null)} className="px-5 py-2.5 text-[13.5px] font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">İptal</button>
              <button onClick={confirmDelete} className="px-5 py-2.5 text-[13.5px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-sm">Kalıcı Olarak Sil</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppointmentsAdminView;
