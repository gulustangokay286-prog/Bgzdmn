import React, { useState, useEffect } from 'react';
import { BellRing, Send, Trash2, Pin, Camera, Edit, MessageSquare, Heart, X, Megaphone, LayoutTemplate, Clock, Copy, PlusCircle, Info, UploadCloud } from 'lucide-react';
import { dbService } from '../services/dbService';
import { collection, addDoc, updateDoc, doc, getDocs, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';

const TEMPLATES = [
  { id: 1, title: 'Tatil Bildirimi', content: 'Sayın Velilerimiz ve Sevgili Öğrencilerimiz,\n\n[Tarih] tarihinde resmi tatil sebebiyle okulumuzda eğitime 1 (bir) gün ara verilecektir. \n\nİyi tatiller dileriz.' },
  { id: 2, title: 'Veli Toplantısı', content: 'Değerli Velimiz,\n\n[Tarih] Cumartesi günü saat [Saat]\'da okulumuz konferans salonunda genel veli toplantısı gerçekleştirilecektir. Katılımlarınızı önemle rica ederiz.' },
  { id: 3, title: 'Sınav Takvimi Güncellemesi', content: 'Sevgili Öğrenciler,\n\n[Dönem] ara sınav takvimi güncellenmiştir. Yeni takvime öğrenci sisteminizden (Pusula) ulaşabilirsiniz. Başarılar dileriz.' },
  { id: 4, title: 'Kayıt Yenileme Dönemi', content: 'Sayın Velimiz,\n\n[Yıl] eğitim-öğretim yılı için erken kayıt avantajları başlamıştır. Detaylı bilgi için muhasebe birimimizle iletişime geçebilirsiniz.' },
];

const AnnouncementsAdminView = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('new');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const [editingDoc, setEditingDoc] = useState(null);

  const [viewingInteractions, setViewingInteractions] = useState(null);
  const [interactions, setInteractions] = useState({ reactions: [], comments: [], loading: false });

  const uploadImageToCloudinary = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'ml_default');
    formData.append('folder', 'ial-mobil/announcements');

    try {
      const response = await fetch('https://api.cloudinary.com/v1_1/dbfhcj6px/auto/upload', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      return data.secure_url;
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      return null;
    }
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'announcements'), (snapshot) => {
      const data = snapshot.docs.map(doc => {
        return {
          id: doc.id,
          ...doc.data(),
          createdAtRaw: doc.data().createdAt?.toMillis() || doc.data().timestamp?.toMillis() || 0
        };
      });

      data.sort((a, b) => b.createdAtRaw - a.createdAtRaw);
      setAnnouncements(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!title || !content) return;

    setIsSaving(true);
    let uploadedImageUrl = '';
    if (selectedFile) {
      uploadedImageUrl = await uploadImageToCloudinary(selectedFile);
    }

    const data = {
      title: title,
      content: content,
      category: 'Genel',
      pinned: isPinned,
      createdAt: serverTimestamp(),
      targetAudience: ['all'],
      authorId: '00000000-0000-0000-0000-000000000000'
    };

    if (uploadedImageUrl) {
      data.imageUrl = uploadedImageUrl;
    }

    try {
      await addDoc(collection(db, 'announcements'), data);
      setTitle('');
      setContent('');
      setIsPinned(false);
      setSelectedFile(null);
    } catch (error) {
      console.error('Error adding document:', error);
      setFormError("Kayıt sırasında bir hata oluştu.");
    }
    setIsSaving(false);
  };

  const handleDelete = async (docId) => {
    setDeleteConfirm(docId);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await dbService.deleteDocument('announcements', deleteConfirm);
    } catch (error) {
      console.error("Silme hatası:", error);
    }
    setDeleteConfirm(null);
  };

  const useTemplate = (template) => {
    setTitle(template.title);
    setContent(template.content);
    setActiveTab('new');
  };

  const openEditModal = (docId, dTitle, dContent, dPinned, dImageUrl, dRawTime) => {
    setEditingDoc({ id: docId, title: dTitle, content: dContent, isPinned: dPinned, imageUrl: dImageUrl, rawTime: dRawTime, newFile: null });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingDoc.title || !editingDoc.content) return;

    setIsSaving(true);
    let finalImageUrl = editingDoc.imageUrl;

    if (editingDoc.newFile) {
      const uploaded = await uploadImageToCloudinary(editingDoc.newFile);
      if (uploaded) finalImageUrl = uploaded;
    }

    try {
      const docRef = doc(db, 'announcements', editingDoc.id);
      const updatePayload = {
        title: editingDoc.title,
        content: editingDoc.content,
        pinned: editingDoc.isPinned,
        imageUrl: finalImageUrl || '',
      };
      await updateDoc(docRef, updatePayload);
      setEditingDoc(null);
    } catch (error) {
      console.error('Error updating document:', error);
      setFormError('HATA: Güncelleme yapılamadı.');
    }
    setIsSaving(false);
  };

  const openInteractions = async (docId, title) => {
    setViewingInteractions({ id: docId, title });
    setInteractions({ reactions: [], comments: [], loading: true });

    try {
      const [reactSnap, commSnap] = await Promise.all([
        getDocs(collection(db, `announcements/${docId}/reactions`)),
        getDocs(collection(db, `announcements/${docId}/comments`))
      ]);
      const reactions = reactSnap.docs.map(d => d.data());
      const comments = commSnap.docs.map(d => {
        const cData = d.data();
        cData.id = d.id;
        return cData;
      });

      comments.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });

      setInteractions({ reactions, comments, loading: false });
    } catch (error) {
      console.error('Etkileşimleri çekerken hata:', error);
      setInteractions({ reactions: [], comments: [], loading: false });
    }
  };

  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="w-full h-full flex-1 flex flex-col font-sans overflow-hidden pb-2 md:pb-6 p-4 md:p-12">
      
      { }
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 w-full shrink-0 gap-6">
        <div className="flex items-center gap-5">
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">{currentDate}</span>
            <h1 className="text-[36px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none">Duyuru Yönetimi</h1>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm flex-1 w-full min-h-0 overflow-hidden">
        
        { }
        <div className="w-full md:w-[380px] lg:w-[420px] flex-shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#1e293b]/50 relative max-h-[50vh] md:max-h-none">

          { }
          <div className="p-4 border-b border-slate-200 dark:border-white/10 shrink-0 bg-white dark:bg-[#0f172a]">
            <div className="flex gap-2 p-1 bg-slate-50/50 dark:bg-[#1e293b]/50 rounded-xl border border-slate-200 dark:border-white/10">
              <button
                onClick={() => setActiveTab('new')}
                className={`flex-1 py-2.5 px-4 text-[13px] font-bold rounded-lg transition-all flex justify-center items-center gap-2 ${activeTab === 'new' ? 'bg-white dark:bg-[#0f172a] text-indigo-600 shadow-sm border border-slate-200 dark:border-white/10/50' : 'text-slate-500 hover:text-slate-700 dark:text-slate-300 hover:bg-slate-50/50 dark:bg-[#1e293b]/50'}`}
              >
                <PlusCircle size={16} /> Yeni Duyuru
              </button>
              <button
                onClick={() => setActiveTab('templates')}
                className={`flex-1 py-2.5 px-4 text-[13px] font-bold rounded-lg transition-all flex justify-center items-center gap-2 ${activeTab === 'templates' ? 'bg-white dark:bg-[#0f172a] text-indigo-600 shadow-sm border border-slate-200 dark:border-white/10/50' : 'text-slate-500 hover:text-slate-700 dark:text-slate-300 hover:bg-slate-50/50 dark:bg-[#1e293b]/50'}`}
              >
                <LayoutTemplate size={16} /> Şablonlar
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50/50 dark:bg-[#1e293b]/50 flex flex-col">
            {activeTab === 'new' ? (
              <div className="flex flex-col flex-1 shrink-0 h-auto">
                {formError && (
                  <div className="mb-4 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-[13px] font-bold rounded-xl flex items-center justify-between">
                    <span>{formError}</span>
                    <button type="button" onClick={() => setFormError('')} className="text-rose-500 hover:text-rose-800"><X size={16} /></button>
                  </div>
                )}
                <form className="flex flex-col gap-5" onSubmit={handleSave}>
                  <div>
                    <label className="block text-[12px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">Başlık *</label>
                    <input
                      type="text"
                      className="w-full p-3.5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-[12px] focus:ring-2 focus:ring-slate-900 outline-none text-[13px] font-bold text-slate-800 dark:text-slate-200 transition-all placeholder:text-slate-600 dark:text-slate-400"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="Örn: Hafta Sonu Etkinliği İptali"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">İçerik *</label>
                    <textarea
                      className="w-full p-3.5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-[12px] focus:ring-2 focus:ring-slate-900 outline-none text-[13px] font-medium text-slate-700 dark:text-slate-300 resize-none transition-all placeholder:text-slate-600 dark:text-slate-400 custom-scrollbar"
                      rows="7"
                      value={content}
                      onChange={e => setContent(e.target.value)}
                      placeholder="Duyuru detaylarını yazın..."
                      required
                    ></textarea>
                  </div>

                  <div>
                    <label className="block text-[12px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">Görsel (Opsiyonel)</label>
                    <div className="flex flex-col gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        id="announcement-image"
                        className="hidden"
                        onChange={e => setSelectedFile(e.target.files[0])}
                      />
                      <label htmlFor="announcement-image" className="cursor-pointer flex items-center justify-center gap-2 w-full bg-white dark:bg-[#0f172a] border border-dashed border-slate-300 hover:border-slate-400 transition-all rounded-[12px] p-4 text-slate-500 text-[13px] font-bold shadow-sm">
                        <UploadCloud size={18} className={selectedFile ? 'text-slate-900 dark:text-white' : ''} />
                        {selectedFile ? selectedFile.name : 'Cihazdan Görsel Seç'}
                      </label>
                      {selectedFile && (
                        <div className="flex justify-end">
                          <span className="cursor-pointer text-rose-500 text-[11px] font-bold uppercase tracking-widest hover:underline" onClick={() => setSelectedFile(null)}>İptal Et</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 bg-white dark:bg-[#0f172a] p-3.5 rounded-[12px] border border-slate-200 dark:border-white/10 shadow-sm mt-1">
                    <input
                      type="checkbox"
                      id="pinned"
                      className="w-4 h-4 text-slate-900 dark:text-white border-slate-300 rounded focus:ring-slate-900 cursor-pointer"
                      checked={isPinned}
                      onChange={e => setIsPinned(e.target.checked)}
                    />
                    <label htmlFor="pinned" className="text-slate-700 dark:text-slate-300 font-bold text-[13px] select-none cursor-pointer flex-1">
                      Akışın En Üstüne Sabitle
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 mt-2 bg-slate-900 hover:bg-slate-800 text-slate-900 dark:text-white rounded-[12px] text-[14px] font-bold transition-all shadow-sm flex justify-center items-center gap-2 disabled:opacity-50"
                    disabled={isSaving}
                  >
                    {isSaving ? 'Yayınlanıyor...' : <><Send size={16} /> Şimdi Yayınla</>}
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-col gap-5 shrink-0 h-auto">
                <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 p-5 rounded-[16px] flex items-start gap-3 shadow-sm">
                  <div className="w-8 h-8 rounded-[10px] bg-slate-50 dark:bg-[#1e293b] text-indigo-500 flex items-center justify-center border border-slate-200 dark:border-white/10 shrink-0">
                    <Info size={16} />
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 text-[12px] font-medium m-0 mt-0.5 leading-relaxed">
                    Şablon seçtiğinizde form otomatik olarak doldurulur. Kendi tercihlerinize göre düzenleyip anında yayınlayabilirsiniz.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  {TEMPLATES.map(template => (
                    <div
                      key={template.id}
                      className="bg-white dark:bg-[#0f172a] rounded-[16px] p-5 border border-slate-200 dark:border-white/10 hover:border-slate-300 hover:shadow-md cursor-pointer transition-all flex flex-col gap-2 shadow-sm group"
                      onClick={() => useTemplate(template)}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <h3 className="text-[14px] font-bold text-slate-900 dark:text-white m-0 group-hover:text-slate-700 dark:text-slate-300 transition-colors">{template.title}</h3>
                        <div className="w-6 h-6 rounded-[8px] bg-slate-50 dark:bg-[#1e293b] flex items-center justify-center text-slate-600 dark:text-slate-400 group-hover:bg-slate-50 dark:bg-[#1e293b] transition-colors">
                          <Copy size={12} />
                        </div>
                      </div>
                      <p className="text-slate-500 text-[12px] font-medium line-clamp-2 m-0 leading-relaxed break-words">{template.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        { }
        <div className="flex-1 flex flex-col bg-white dark:bg-[#0f172a] min-h-0">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 shrink-0 flex justify-between items-center">
            <h2 className="text-[18px] font-bold text-slate-900 dark:text-white m-0 flex items-center gap-2">
              <BellRing size={18} className="text-slate-600 dark:text-slate-400" />
              Duyuru Akışı
            </h2>
            <div className="px-3 py-1.5 bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-[8px] text-[12px] font-bold text-slate-600 dark:text-slate-400 shadow-sm">
              {announcements.length} Kayıt
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 lg:p-8 custom-scrollbar bg-slate-50 dark:bg-[#1e293b]/30">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-600 dark:text-slate-400">
                <div className="w-8 h-8 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-slate-900 animate-spin mb-4"></div>
                <span className="font-medium text-[13px]">Duyurular yükleniyor...</span>
              </div>
            ) : announcements.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 text-[14px] bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-[24px] p-12 text-center mx-auto max-w-sm shadow-sm">
                <Megaphone size={40} className="text-slate-700 dark:text-slate-300 mb-4" />
                <span className="text-[16px] font-bold text-slate-700 dark:text-slate-300 mb-2">Henüz Duyuru Yok</span>
                <span className="font-medium">Sol taraftaki formu kullanarak yeni bir duyuru oluşturun.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-6 pb-8">
                {announcements.map(docData => {
                  const dTitle = docData.title || '-';
                  const dContent = docData.content || '';
                  const dTime = docData.createdAtRaw ? new Date(docData.createdAtRaw).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Bilinmeyen Zaman';
                  const dPinned = docData.pinned || docData.isPinned || false;
                  const dImageUrl = docData.imageUrl || '';

                  return (
                    <div key={docData.id} className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col shadow-sm group hover:shadow-md transition-shadow relative">

                      {dPinned && (
                        <div className="bg-amber-50 text-amber-600 text-[11px] font-bold uppercase tracking-widest py-2.5 px-6 flex items-center gap-2 border-b border-amber-100">
                          <Pin size={14} className="text-amber-500" /> Akışa Sabitlendi
                        </div>
                      )}

                      {dImageUrl && (
                        <div className="w-full h-64 bg-slate-50 dark:bg-[#1e293b] relative overflow-hidden border-b border-slate-200 dark:border-white/10">
                          <img src={dImageUrl} alt={dTitle} className="w-full h-full object-cover" />
                        </div>
                      )}

                      <div className="p-8">
                        <div className="flex justify-between items-start mb-6 gap-4">
                          <h3 className="text-[20px] font-bold text-slate-900 dark:text-white m-0 leading-tight">{dTitle}</h3>
                          <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="w-10 h-10 rounded-[12px] bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 text-rose-500 flex items-center justify-center hover:bg-rose-50 hover:border-rose-200 transition-colors shadow-sm" onClick={() => openInteractions(docData.id, dTitle)} title="Etkileşimler">
                              <Heart size={16} />
                            </button>
                            <button className="w-10 h-10 rounded-[12px] bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 text-indigo-500 flex items-center justify-center hover:bg-indigo-50 hover:border-indigo-200 transition-colors shadow-sm" onClick={() => openEditModal(docData.id, dTitle, dContent, dPinned, dImageUrl, docData.createdAtRaw)} title="Düzenle">
                              <Edit size={16} />
                            </button>
                            <button className="w-10 h-10 rounded-[12px] bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors shadow-sm" onClick={() => handleDelete(docData.id)} title="Sil">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        <div className="text-slate-600 dark:text-slate-400 text-[14px] font-medium whitespace-pre-wrap mb-8 leading-relaxed bg-slate-50 dark:bg-[#1e293b] p-6 rounded-[20px] border border-slate-200 dark:border-white/10">{dContent}</div>

                        <div className="flex justify-between items-center pt-5 border-t border-slate-200 dark:border-white/10">
                          <span className="text-slate-600 dark:text-slate-400 text-[12px] font-bold bg-white dark:bg-[#0f172a] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 shadow-sm">{dTime}</span>
                          <button
                            onClick={() => openInteractions(docData.id, dTitle)}
                            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:bg-[#1e293b] px-5 py-2.5 rounded-[12px] text-[13px] font-bold flex items-center gap-2 transition-all shadow-sm"
                          >
                            <MessageSquare size={16} /> Yorumları Gör
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      { }
      {editingDoc && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-[32px] w-full max-w-xl border border-slate-200 dark:border-white/10 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

            <div className="flex justify-between items-center px-8 py-6 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a]">
              <h2 className="text-[20px] font-bold text-slate-900 dark:text-white m-0 flex items-center gap-3">
                <div className="w-12 h-12 rounded-[16px] bg-slate-50 dark:bg-[#1e293b] text-slate-700 dark:text-slate-300 flex items-center justify-center border border-slate-200 dark:border-white/10 shadow-sm">
                  <Edit size={20} />
                </div>
                Duyuru Düzenle
              </h2>
              <button onClick={() => setEditingDoc(null)} className="w-10 h-10 rounded-full bg-slate-50 dark:bg-[#1e293b] text-slate-600 dark:text-slate-400 flex items-center justify-center hover:bg-slate-50 dark:bg-[#1e293b] hover:text-slate-700 dark:text-slate-300 transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar bg-slate-50/50 dark:bg-[#1e293b]/50">
              {formError && (
                <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-[13px] font-bold rounded-xl flex items-center justify-between">
                  <span>{formError}</span>
                  <button type="button" onClick={() => setFormError('')} className="text-rose-500 hover:text-rose-800"><X size={16} /></button>
                </div>
              )}
              <form id="editForm" className="flex flex-col gap-6" onSubmit={handleUpdate}>
                <div>
                  <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Başlık</label>
                  <input type="text" className="w-full p-4 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 shadow-sm rounded-[16px] focus:ring-2 focus:ring-slate-900 outline-none text-[14px] font-bold transition-all text-slate-800 dark:text-slate-200" value={editingDoc.title} onChange={e => setEditingDoc({ ...editingDoc, title: e.target.value })} required />
                </div>

                <div>
                  <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">İçerik</label>
                  <textarea className="w-full p-4 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 shadow-sm rounded-[16px] focus:ring-2 focus:ring-slate-900 outline-none text-[14px] font-medium resize-none transition-all text-slate-700 dark:text-slate-300" rows="6" value={editingDoc.content} onChange={e => setEditingDoc({ ...editingDoc, content: e.target.value })} required></textarea>
                </div>

                <div>
                  <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Görsel Yönetimi</label>
                  {editingDoc.imageUrl ? (
                    <div className="mb-4 relative rounded-[20px] overflow-hidden border border-slate-200 dark:border-white/10 shadow-sm bg-slate-50 dark:bg-[#1e293b] group">
                      <img src={editingDoc.imageUrl} alt="Mevcut Görsel" className="w-full h-40 object-cover" />
                      <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                        <button type="button" onClick={() => setEditingDoc({ ...editingDoc, imageUrl: '' })} className="bg-white dark:bg-[#0f172a] text-rose-600 px-6 py-3 rounded-[12px] text-[13px] font-bold hover:bg-rose-50 flex items-center gap-2 shadow-sm transition-colors border border-rose-100">
                          <Trash2 size={16} /> Görseli Kaldır
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500 text-[13px] mb-4 font-medium p-6 bg-slate-50 dark:bg-[#1e293b] rounded-[20px] border-2 border-dashed border-slate-200 dark:border-white/10 text-center">Bu duyuruda görsel bulunmuyor.</div>
                  )}

                  <div className="flex flex-col gap-3">
                    <input type="file" accept="image/*" id="edit-image" className="hidden" onChange={e => setEditingDoc({ ...editingDoc, newFile: e.target.files[0] })} />
                    <label htmlFor="edit-image" className="cursor-pointer flex items-center justify-center gap-3 w-full bg-slate-50 dark:bg-[#1e293b] border-2 border-dashed border-slate-200 dark:border-white/10 hover:border-slate-400 hover:bg-white dark:bg-[#0f172a] transition-all rounded-[16px] p-5 text-slate-600 dark:text-slate-400 text-[13px] font-bold shadow-sm">
                      <Camera size={18} className={editingDoc.newFile ? 'text-slate-900 dark:text-white' : ''} />
                      {editingDoc.newFile ? editingDoc.newFile.name : 'Yeni Görsel Seç'}
                    </label>
                    {editingDoc.newFile && (
                      <div className="flex justify-end">
                        <span className="cursor-pointer text-rose-500 text-[11px] font-bold uppercase tracking-widest hover:underline" onClick={() => setEditingDoc({ ...editingDoc, newFile: null })}>İptal Et</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-white dark:bg-[#0f172a] p-4 rounded-[16px] border border-slate-200 dark:border-white/10 shadow-sm mt-2">
                  <input
                    type="checkbox"
                    className="w-5 h-5 text-slate-900 dark:text-white border-slate-300 rounded focus:ring-slate-900 cursor-pointer"
                    checked={editingDoc.isPinned}
                    onChange={e => setEditingDoc({ ...editingDoc, isPinned: e.target.checked })}
                  />
                  <label className="text-slate-700 dark:text-slate-300 font-bold text-[14px] cursor-pointer">Önemli Olarak İşaretle (Akışa Sabitle)</label>
                </div>
              </form>
            </div>

            <div className="px-8 py-6 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1e293b] flex justify-end gap-3 rounded-b-[32px]">
              <button onClick={() => setEditingDoc(null)} className="px-6 py-3.5 text-[14px] font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-[#0f172a] border border-slate-300 shadow-sm rounded-xl hover:bg-slate-50 dark:bg-[#1e293b] transition-colors">
                İptal Et
              </button>
              <button
                form="editForm"
                type="submit"
                className="px-8 py-3.5 text-[14px] font-semibold text-slate-900 dark:text-white bg-slate-900 rounded-xl hover:bg-slate-800 shadow-sm transition-all disabled:opacity-50 min-w-[140px]"
                disabled={isSaving}
              >
                {isSaving ? 'Güncelleniyor...' : 'Değişiklikleri Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      { }
      {viewingInteractions && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-[32px] w-full max-w-md border border-slate-200 dark:border-white/10 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">

            <div className="flex justify-between items-start px-8 py-6 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a]">
              <div>
                <h2 className="text-[20px] font-bold text-slate-900 dark:text-white m-0 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-[16px] bg-rose-50 text-rose-500 flex items-center justify-center border border-rose-100 shadow-sm">
                    <Heart size={20} />
                  </div>
                  Etkileşimler
                </h2>
                <p className="text-[13px] font-bold text-slate-500 mt-2 max-w-[250px] truncate m-0">{viewingInteractions.title}</p>
              </div>
              <button onClick={() => setViewingInteractions(null)} className="w-10 h-10 rounded-full bg-slate-50 dark:bg-[#1e293b] text-slate-600 dark:text-slate-400 flex items-center justify-center hover:bg-slate-50 dark:bg-[#1e293b] hover:text-slate-700 dark:text-slate-300 transition-colors mt-1">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar bg-slate-50/50 dark:bg-[#1e293b]/50">
              {interactions.loading ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-600 dark:text-slate-400">
                  <div className="w-8 h-8 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-slate-900 animate-spin mb-4"></div>
                  <span className="font-medium text-[13px]">Veriler yükleniyor...</span>
                </div>
              ) : (
                <div className="flex flex-col gap-8">

                  { }
                  <div>
                    <h3 className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Heart size={14} className="text-rose-500" /> Tepkiler ({interactions.reactions.length})
                    </h3>
                    {interactions.reactions.length === 0 ? (
                      <div className="text-slate-500 text-[13px] font-medium p-5 bg-slate-50 dark:bg-[#1e293b] rounded-[16px] border border-slate-200 dark:border-white/10 border-dashed text-center">Henüz tepki yok.</div>
                    ) : (
                      <div className="flex gap-3 flex-wrap">
                        {Array.from(new Set(interactions.reactions.map(r => r.reactionType))).map(type => {
                          const count = interactions.reactions.filter(r => r.reactionType === type).length;
                          return (
                            <div key={type} className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 shadow-sm px-4 py-2.5 rounded-[12px] text-[14px] flex items-center gap-2">
                              {type === 'like' ? '👍' : type === 'heart' ? '❤️' : type === 'clap' ? '👏' : type}
                              <span className="text-slate-900 dark:text-white font-bold text-[15px]">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  { }
                  <div>
                    <h3 className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <MessageSquare size={14} className="text-slate-500" /> Yorumlar ({interactions.comments.length})
                    </h3>
                    {interactions.comments.length === 0 ? (
                      <div className="text-slate-500 text-[13px] font-medium p-5 bg-slate-50 dark:bg-[#1e293b] rounded-[16px] border border-slate-200 dark:border-white/10 border-dashed text-center">Henüz yorum yok.</div>
                    ) : (
                      <div className="flex flex-col gap-4">
                        {interactions.comments.map(c => {
                          const cTime = c.createdAt?.toMillis ? new Date(c.createdAt.toMillis()).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '';
                          const author = c.userName || 'Anonim';
                          return (
                            <div key={c.id} className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 shadow-sm p-5 rounded-[20px] flex flex-col gap-3">
                              <div className="flex justify-between items-start">
                                <span className="font-bold text-[13px] text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-[#1e293b] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10">{author}</span>
                                <span className="text-slate-600 dark:text-slate-400 text-[11px] font-bold mt-1.5">{cTime}</span>
                              </div>
                              <div className="text-[14px] text-slate-700 dark:text-slate-300 font-medium leading-relaxed pl-1">
                                {c.text}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="px-8 py-6 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1e293b] flex justify-center rounded-b-[32px]">
              <button onClick={() => setViewingInteractions(null)} className="w-full py-4 text-[14px] font-bold text-slate-900 dark:text-white bg-slate-900 rounded-[16px] hover:bg-slate-800 transition-colors shadow-sm">
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl w-full max-w-sm shadow-2xl p-6 flex flex-col gap-4">
            <h3 className="text-[18px] font-bold text-slate-900 dark:text-white">Duyuruyu Sil</h3>
            <p className="text-[14px] text-slate-600 dark:text-slate-400 font-medium">Bu duyuruyu silmek istediğinize emin misiniz?</p>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2.5 text-[13px] font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-[#1e293b] hover:bg-slate-200 rounded-lg transition-colors">İptal</button>
              <button onClick={confirmDelete} className="px-4 py-2.5 text-[13px] font-bold text-slate-900 dark:text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors">Sil</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnouncementsAdminView;
