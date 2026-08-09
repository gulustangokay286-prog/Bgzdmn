import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Bus, User, Phone, Plus, Edit2, Trash2, X, Search, CheckCircle2, AlertCircle, Settings, MapPin, Navigation, Activity, Users, LayoutGrid, List, ChevronRight } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import UnsavedBanner from '../components/UnsavedBanner';

const TransportAdminView = () => {
  const [transports, setTransports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('Tümü');
  const [viewMode, setViewMode] = useState('list'); 

  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const { markDirty, markClean, isDirty } = useUnsavedChanges();

  const [formData, setFormData] = useState({
    routeName: '',
    plateNumber: '',
    driverName: '',
    driverPhone: '',
    vehicleCapacity: '',
    routeDetails: '',
    status: 'Aktif'
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'transport_routes'), (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          ...d,
          status: d.isActive ? 'Aktif' : 'Pasif',
          vehicleCapacity: String(d.capacity || '0')
        };
      });
      data.sort((a, b) => (a.routeName || '').localeCompare(b.routeName || ''));
      setTransports(data);
      setLoading(false);
    }, (error) => {
      console.error("Servis bilgileri çekilirken hata:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const stats = useMemo(() => {
    const total = transports.length;
    const active = transports.filter(t => t.status === 'Aktif').length;
    const capacity = transports.reduce((acc, curr) => acc + (parseInt(curr.vehicleCapacity) || 0), 0);
    const drivers = new Set(transports.map(t => t.driverName).filter(Boolean)).size;
    
    return { total, active, capacity, drivers };
  }, [transports]);

  const openModal = (transport = null) => {
    setFormError('');
    if (transport) {
      setEditingId(transport.id);
      setFormData({
        routeName: transport.routeName || '',
        plateNumber: transport.plateNumber || '',
        driverName: transport.driverName || '',
        driverPhone: transport.driverPhone || '',
        vehicleCapacity: transport.vehicleCapacity || '',
        routeDetails: transport.routeDetails || '',
        status: transport.status || 'Aktif'
      });
    } else {
      setEditingId(null);
      setFormData({ routeName: '', plateNumber: '', driverName: '', driverPhone: '', vehicleCapacity: '', routeDetails: '', status: 'Aktif' });
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
    setIsSaving(true);
    try {
      const payload = {
        routeName: formData.routeName,
        plateNumber: formData.plateNumber,
        driverName: formData.driverName,
        driverPhone: formData.driverPhone,
        capacity: Number(formData.vehicleCapacity),
        isActive: formData.status === 'Aktif',
        routeDetails: formData.routeDetails || ''
      };

      if (editingId) {
        await updateDoc(doc(db, 'transport_routes', editingId), { ...payload, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'transport_routes'), { ...payload, createdAt: serverTimestamp() });
      }
      closeModal();
    } catch (error) {
      console.error('Servis kaydedilirken hata:', error);
      setFormError('Kayıt işlemi başarısız oldu.');
    }
    setIsSaving(false);
  };

  const handleDelete = async (id, plateName) => {
    setDeleteConfirm({ id, plateName });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteDoc(doc(db, 'transport_routes', deleteConfirm.id));
    } catch (error) {
      console.error('Silme hatası:', error);
    }
    setDeleteConfirm(null);
  };

  const filteredTransports = transports.filter(t => {
    const matchesSearch = (t.routeName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (t.plateNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (t.driverName || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'Tümü' || t.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const getStatusColor = (status) => {
    switch(status) {
      case 'Aktif': return 'bg-emerald-500 shadow-emerald-500/30';
      case 'Bakımda': return 'bg-amber-500 shadow-amber-500/30';
      case 'Pasif': return 'bg-rose-500 shadow-rose-500/30';
      default: return 'bg-slate-50 dark:bg-[#1e293b]0 shadow-slate-500/30';
    }
  };

  const getStatusBg = (status) => {
    switch(status) {
      case 'Aktif': return 'bg-emerald-50 text-emerald-700 border-emerald-200/50 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
      case 'Bakımda': return 'bg-amber-50 text-amber-700 border-amber-200/50 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
      case 'Pasif': return 'bg-rose-50 text-rose-700 border-rose-200/50 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20';
      default: return 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/60';
    }
  };

  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="absolute inset-0 bg-[#FAFAFA] dark:bg-[#0b1120] z-40 overflow-y-auto overflow-x-hidden font-sans custom-scrollbar flex flex-col p-6 md:p-10">
      <div className="w-full max-w-[1600px] flex flex-col flex-1 min-h-0">
        
        {/* Title Header */}
        <div className="flex flex-col shrink-0 mb-6">
          <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-widest">{currentDate}</span>
          <h1 className="text-[32px] font-bold text-slate-900 dark:text-white tracking-tight leading-none">Servis & Ulaşım</h1>
        </div>

        {/* Stats Summary Banner */}
        <div className="w-[calc(92%-11px)] sm:w-full flex items-center justify-between px-5 py-4 sm:py-3 bg-white dark:bg-[#0f172a] border border-slate-200/70 dark:border-slate-800/80 rounded-2xl mb-6 shadow-sm">
          <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2.5 sm:gap-6 text-[13px] font-medium text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-2"><Bus size={16} className="text-indigo-500"/> Toplam Servis: <strong className="font-bold text-slate-900 dark:text-white">{stats.total}</strong></span>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">•</span>
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500"/> Aktif Araç: <strong className="font-bold text-slate-900 dark:text-white">{stats.active}</strong></span>
            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">•</span>
            <span className="flex items-center gap-2"><Users size={16} className="text-amber-500"/> Toplam Kapasite: <strong className="font-bold text-slate-900 dark:text-white">{stats.capacity} Kişi</strong></span>
          </div>
        </div>

        {/* Controls Header - Matching Appointments View Exactly */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 w-full mb-6 shrink-0">
          {/* Status Tabs */}
          <div className="flex items-center justify-center sm:justify-start bg-slate-100 dark:bg-slate-800/60 p-1.5 rounded-full border border-slate-200/80 dark:border-slate-700/60 shrink-0">
            {['Tümü', 'Aktif', 'Bakımda', 'Pasif'].map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`flex items-center justify-center gap-1.5 px-5 py-2 rounded-full text-[13px] font-bold transition-all duration-300 hover:scale-[1.08] active:scale-95 whitespace-nowrap ${
                  filterStatus === status 
                    ? 'bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white border border-slate-200/60 dark:border-slate-700/60 shadow-sm' 
                    : 'bg-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-700/40'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Search & Layout Toggle & Action Button */}
          <div className="flex items-center justify-end gap-3 shrink-0">
            <div className="relative flex items-center flex-1 sm:flex-none">
              <Search size={15} className="absolute left-3.5 text-slate-400 pointer-events-none" />
              <input 
                type="text" 
                placeholder="Plaka, şoför, güzergah..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-60 pl-10 pr-8 py-2 bg-white dark:bg-[#0f172a] border border-slate-200/90 dark:border-slate-700/80 rounded-full focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-white/20 focus:border-slate-400 outline-none text-[13px] font-medium text-slate-900 dark:text-white transition-all placeholder:text-slate-400"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <X size={14} />
                </button>
              )}
            </div>

            <button 
              onClick={() => setViewMode(prev => prev === 'list' ? 'grid' : 'list')}
              className="w-9 h-9 flex items-center justify-center bg-white dark:bg-[#0f172a] border border-slate-200/90 dark:border-slate-700/80 rounded-full text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all shrink-0"
              title={viewMode === 'list' ? 'Kart Görünümüne Geç' : 'Liste Görünümüne Geç'}
            >
              {viewMode === 'list' ? <LayoutGrid size={15} /> : <List size={15} />}
            </button>

            <button 
              onClick={() => openModal()} 
              className="flex items-center justify-center gap-2 px-5 py-2 bg-white dark:bg-white text-slate-900 dark:text-slate-900 hover:bg-slate-100 active:bg-slate-200 border border-slate-200/90 dark:border-slate-300 text-[13px] font-bold rounded-full transition-all shrink-0 whitespace-nowrap"
            >
              <Plus size={16} strokeWidth={2.5}/> Yeni Servis
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 w-full relative">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 w-full text-slate-400">
              <div className="w-10 h-10 rounded-full border-4 border-slate-200 dark:border-slate-800 border-t-indigo-600 animate-spin mb-4"></div>
              <span className="text-[14px] font-medium">Servis ağı yükleniyor...</span>
            </div>
          ) : filteredTransports.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-80 text-slate-500 dark:text-slate-400 bg-white dark:bg-[#0f172a] rounded-[40px] border border-slate-200/90 dark:border-slate-800/80 shadow-sm w-full">
              <Navigation size={40} className="text-slate-400 dark:text-slate-500 mb-6" strokeWidth={1.5} />
              <h3 className="text-[18px] font-bold text-slate-700 dark:text-slate-300 mb-2 text-center">Sonuç Bulunamadı</h3>
              <p className="text-[14px] font-medium text-center px-6 max-w-sm">Arama kriterlerinize uygun bir servis aracı bulunmuyor.</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-12 w-full">
              {filteredTransports.map((t) => (
                <div key={t.id} className="group bg-white dark:bg-[#0f172a] rounded-[32px] p-1 border border-slate-200/80 dark:border-slate-800/80 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col relative overflow-hidden">
                  
                  <div className="p-6 pb-5">
                    {/* Top Status & Plate */}
                    <div className="flex justify-between items-start mb-5">
                      <div>
                        <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${getStatusColor(t.status)} shadow-sm`}></div>
                          {t.status}
                        </div>
                        <h2 className="text-[28px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-none font-mono">
                          {t.plateNumber || 'PLK-YOK'}
                        </h2>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button onClick={() => openModal(t)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors p-1">
                          <Edit2 size={16} strokeWidth={2.5}/>
                        </button>
                        <button onClick={() => handleDelete(t.id, t.plateNumber)} className="text-slate-400 hover:text-rose-600 transition-colors p-1">
                          <Trash2 size={16} strokeWidth={2.5}/>
                        </button>
                      </div>
                    </div>

                    {/* Route Details */}
                    <div className="flex items-start gap-3 mb-6 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <MapPin size={18} className="text-indigo-500 shrink-0 mt-0.5" strokeWidth={2.5}/>
                      <div>
                        <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-200 leading-snug">
                          {t.routeName || 'İsimsiz Güzergah'}
                        </h3>
                        {t.routeDetails && (
                          <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                            {t.routeDetails}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Driver & Capacity */}
                    <div className="flex justify-between items-end">
                      <div className="flex items-center gap-2">
                        <User size={18} className="text-slate-400 dark:text-slate-500" strokeWidth={2} />
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Şoför</span>
                          <span className="text-[14px] font-bold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">{t.driverName || 'Atanmadı'}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Users size={18} className="text-slate-400 dark:text-slate-500" strokeWidth={2} />
                        <div className="flex flex-col items-start">
                          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Kapasite</span>
                          <div className="flex items-baseline gap-1">
                            <span className="text-[16px] font-black text-slate-900 dark:text-white leading-none">{t.vehicleCapacity || '0'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Status Indicator Line */}
                  <div className={`h-1.5 w-full mt-auto ${t.status === 'Aktif' ? 'bg-emerald-500' : t.status === 'Bakımda' ? 'bg-amber-500' : 'bg-rose-500'}`}></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3 pb-12 w-full">
              {filteredTransports.map((t) => (
                <div 
                  key={t.id} 
                  className="bg-white dark:bg-[#0f172a] rounded-[16px] border border-slate-200/70 dark:border-slate-800/80 p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-300/90 dark:hover:border-slate-700 transition-all cursor-pointer group"
                  onClick={() => openModal(t)}
                >
                  
                  {/* Unified Responsive Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 w-full">
                    
                    {/* Plate, Status & Mobile Capacity */}
                    <div className="flex flex-col w-full sm:w-[140px] shrink-0">
                      <div className="flex justify-between items-start w-full">
                        <div className="flex flex-col gap-1 pr-2">
                          <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-0.5">
                            <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${getStatusColor(t.status)} shadow-sm`}></div>
                            {t.status}
                          </div>
                          <h3 className="font-bold text-[16px] font-mono text-slate-900 dark:text-white leading-tight">{t.plateNumber || 'PLK-YOK'}</h3>
                        </div>
                        {/* Mobile Capacity Badge */}
                        <div className="flex flex-col items-start shrink-0 sm:hidden">
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[10px] font-bold uppercase tracking-wider mt-1">
                            <Users size={12} />
                            {t.vehicleCapacity || '0'} Kişi
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Route Details */}
                    <div className="flex items-start sm:items-center gap-2 w-full sm:flex-1 min-w-0">
                      <MapPin size={16} className="text-indigo-500 shrink-0 mt-0.5 sm:mt-0"/>
                      <div className="flex flex-col">
                        <span className="font-bold text-[14px] text-slate-800 dark:text-slate-200 leading-snug">{t.routeName || 'İsimsiz Güzergah'}</span>
                      </div>
                    </div>

                    {/* Driver */}
                    <div className="flex items-center gap-2 w-full sm:flex-1 min-w-0 mt-1 sm:mt-0">
                      <User size={16} className="text-slate-400 dark:text-slate-500 shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest hidden sm:block">Şoför</span>
                        <span className="text-[13px] font-bold text-slate-700 dark:text-slate-300 truncate">{t.driverName || 'Atanmadı'}</span>
                      </div>
                    </div>

                    {/* Desktop Capacity */}
                    <div className="hidden sm:flex items-center gap-2 shrink-0 w-[120px]">
                      <Users size={16} className="text-slate-400 dark:text-slate-500 shrink-0" />
                      <div className="flex flex-col items-start">
                        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest hidden sm:block mb-0.5">Kapasite</span>
                        <span className="text-[13px] font-bold text-slate-800 dark:text-slate-200">{t.vehicleCapacity || '0'} Kişi</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 shrink-0 ml-auto sm:ml-4 mt-2 sm:mt-0 border-t border-slate-100 dark:border-slate-800/60 sm:border-0 pt-3 sm:pt-0 w-full sm:w-auto">
                      <button 
                        onClick={(e) => { e.stopPropagation(); openModal(t); }} 
                        className="hidden sm:flex p-2 rounded-full text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Düzenle"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(t.id, t.plateNumber); }} 
                        className="p-2 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                        title="Sil"
                      >
                        <Trash2 size={16} />
                      </button>
                      {/* Mobile Arrow for affordance */}
                      <div className="sm:hidden w-8 h-8 rounded-full bg-slate-100/70 dark:bg-slate-800 text-slate-400 flex items-center justify-center ml-auto">
                        <span className="text-[16px] leading-none mb-0.5 ml-0.5">&rsaquo;</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Centered Modal Popup */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-[24px] w-full max-w-[400px] flex flex-col max-h-[85vh] overflow-hidden border border-slate-200/80 dark:border-slate-800/80 shadow-2xl">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center px-5 py-3.5 border-b border-slate-100 dark:border-slate-800/60">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  {editingId ? <Edit2 size={16} /> : <Bus size={18} />}
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight">
                    {editingId ? 'Servisi Güncelle' : 'Yeni Servis'}
                  </h2>
                  <p className="text-[12px] text-slate-500 font-medium mt-0.5">Servis aracı ve güzergah bilgilerini belirleyin</p>
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
              <form id="transportForm" onSubmit={handleSave} className="flex flex-col gap-3 box-border">
                
                {/* Plaka & Kapasite */}
                <div className="grid grid-cols-2 gap-3 w-full box-border min-w-0">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Araç Plakası *</label>
                    <input 
                      type="text"
                      name="plateNumber"
                      className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-mono font-bold text-slate-900 dark:text-slate-100 uppercase transition-all placeholder:text-slate-400/70 box-border" 
                      placeholder="34 ABC 123"
                      value={formData.plateNumber} 
                      onChange={handleChange} 
                      required 
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Kapasite (Kişi) *</label>
                    <input 
                      type="number"
                      name="vehicleCapacity"
                      className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-bold text-slate-900 dark:text-slate-100 transition-all text-left placeholder:text-slate-400/70 box-border" 
                      placeholder="16"
                      value={formData.vehicleCapacity} 
                      onChange={handleChange} 
                      required 
                    />
                  </div>
                </div>

                {/* Şoför Bilgileri */}
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Şoför Adı Soyadı *</label>
                    <input 
                      type="text"
                      name="driverName"
                      placeholder="Örn: Ahmet Yılmaz"
                      className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-normal text-slate-900 dark:text-slate-100 transition-all placeholder:text-slate-400/70 box-border" 
                      value={formData.driverName} 
                      onChange={handleChange} 
                      required 
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Şoför İletişim Numarası *</label>
                    <input 
                      type="text"
                      name="driverPhone"
                      placeholder="Örn: 0532 123 45 67"
                      className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-normal text-slate-900 dark:text-slate-100 transition-all placeholder:text-slate-400/70 box-border" 
                      value={formData.driverPhone} 
                      onChange={handleChange} 
                      required 
                    />
                  </div>
                </div>

                {/* Güzergah Tanımı */}
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Ana Güzergah *</label>
                    <input 
                      type="text"
                      name="routeName"
                      placeholder="Örn: Kadıköy - Üsküdar - Beşiktaş"
                      className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-normal text-slate-900 dark:text-slate-100 transition-all placeholder:text-slate-400/70 box-border" 
                      value={formData.routeName} 
                      onChange={handleChange} 
                      required 
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Durak / Rota Açıklaması</label>
                    <textarea 
                      name="routeDetails"
                      rows="2" 
                      className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-normal text-slate-900 dark:text-slate-100 resize-none transition-all placeholder:text-slate-400/70 box-border" 
                      value={formData.routeDetails} 
                      onChange={handleChange} 
                      placeholder="Varsa durak bilgileri veya rota notları..."
                    ></textarea>
                  </div>
                </div>

                {/* Servis Durumu */}
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Servis Durumu</label>
                  <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/60 rounded-xl">
                    {['Aktif', 'Bakımda', 'Pasif'].map(status => (
                      <div 
                        key={status}
                        onClick={() => { setFormData(prev => ({...prev, status})); markDirty(); }}
                        className={`cursor-pointer text-center py-2 rounded-lg text-[12px] font-bold transition-all duration-300 hover:scale-[1.08] active:scale-95 ${
                          formData.status === status 
                            ? 'bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white'
                        }`}
                      >
                        {status}
                      </div>
                    ))}
                  </div>
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-[#0f172a] flex justify-end gap-3 rounded-b-[24px]">
              <button 
                type="button"
                onClick={closeModal} 
                className="px-4 py-2 text-[12px] font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                İptal Et
              </button>
              <button 
                form="transportForm" 
                type="submit" 
                className="px-6 py-2 text-[12px] font-bold text-white bg-slate-900 dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 active:scale-[0.98] rounded-xl transition-all disabled:opacity-50 min-w-[100px] flex justify-center items-center" 
                disabled={isSaving}
              >
                {isSaving ? 'Kaydediliyor...' : editingId ? 'Değişiklikleri Kaydet' : 'Servisi Oluştur'}
              </button>
            </div>

          </div>
        </div>
      , document.body)}

      {deleteConfirm && createPortal(
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl w-full max-w-sm shadow-2xl p-6 flex flex-col gap-4 border border-slate-200/80 dark:border-slate-800">
            <h3 className="text-[18px] font-bold text-slate-900 dark:text-white">Servisi Sil</h3>
            <p className="text-[14px] text-slate-600 dark:text-slate-400 font-medium">{deleteConfirm.plateName} plakalı servisi silmek istediğinize emin misiniz?</p>
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

export default TransportAdminView;
