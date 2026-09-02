import React, { useState, useEffect, useMemo } from 'react';
import {
  Send,
  Trash2,
  Pin,
  PinOff,
  Pencil,
  MessageSquare,
  Heart,
  Megaphone,
  Copy,
  RefreshCw,
  AlertCircle,
  Save,
  Image as ImageIcon,
  Plus,
  Search,
  X,
  Clock,
  Check
} from 'lucide-react';
import { dbService } from '../services/dbService';
import { collection, addDoc, updateDoc, doc, getDocs, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import {
  Panel,
  PanelHeader,
  Button,
  IconButton,
  Badge,
  Input,
  StatStrip,
  Stat,
  EmptyState,
  Modal,
  Switch
} from '../components/ui/panel';
import { cx, eyebrow, hairline, divider } from '../components/ui/tokens';

const TEMPLATES = [
  {
    id: 1,
    title: 'Tatil Bildirimi',
    category: 'İdari',
    content:
      'Sayın Velilerimiz ve Sevgili Öğrencilerimiz,\n\n[Tarih] tarihinde resmi tatil sebebiyle okulumuzda eğitime 1 (bir) gün ara verilecektir.\n\nİyi tatiller dileriz.'
  },
  {
    id: 2,
    title: 'Veli Toplantısı',
    category: 'Toplantı',
    content:
      'Değerli Velimiz,\n\n[Tarih] Cumartesi günü saat [Saat]’da okulumuz konferans salonunda genel veli toplantısı gerçekleştirilecektir. Katılımlarınızı önemle rica ederiz.'
  },
  {
    id: 3,
    title: 'Sınav Takvimi Güncellemesi',
    category: 'Akademik',
    content:
      'Sevgili Öğrenciler,\n\n[Dönem] ara sınav takvimi güncellenmiştir. Yeni takvime öğrenci sisteminizden ulaşabilirsiniz. Başarılar dileriz.'
  },
  {
    id: 4,
    title: 'Kayıt Yenileme Dönemi',
    category: 'Kayıt',
    content:
      'Sayın Velimiz,\n\n[Yıl] eğitim-öğretim yılı için erken kayıt avantajları başlamıştır. Detaylı bilgi için muhasebe birimimizle iletişime geçebilirsiniz.'
  }
];

const REACTION_LABELS = { like: '👍', heart: '❤️', clap: '👏', celebrate: '🎉' };

const AnnouncementsAdminView = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState('all'); 

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createTab, setCreateTab] = useState('form'); 
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [editingDoc, setEditingDoc] = useState(null);

  const [deleteConfirm, setDeleteConfirm] = useState(null);

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
      console.error('Cloudinary yükleme hatası:', error);
      return null;
    }
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'announcements'), (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAtRaw: d.data().createdAt?.toMillis() || d.data().timestamp?.toMillis() || 0
      }));

      data.sort((a, b) => {
        const pinA = a.pinned || a.isPinned ? 1 : 0;
        const pinB = b.pinned || b.isPinned ? 1 : 0;
        if (pinA !== pinB) return pinB - pinA;
        return b.createdAtRaw - a.createdAtRaw;
      });

      setAnnouncements(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const applyTemplate = (template) => {
    setTitle(template.title);
    setContent(template.content);
    setCreateTab('form');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsSaving(true);
    setFormError('');

    let uploadedImageUrl = '';
    if (selectedFile) {
      uploadedImageUrl = await uploadImageToCloudinary(selectedFile);
    }

    const payload = {
      title: title.trim(),
      content: content.trim(),
      category: 'Genel',
      pinned: Boolean(isPinned),
      isPinned: Boolean(isPinned),
      createdAt: serverTimestamp(),
      targetAudience: ['all'],
      authorId: '00000000-0000-0000-0000-000000000000'
    };
    if (uploadedImageUrl) payload.imageUrl = uploadedImageUrl;

    try {
      await addDoc(collection(db, 'announcements'), payload);
      setTitle('');
      setContent('');
      setIsPinned(false);
      setSelectedFile(null);
      setIsCreateModalOpen(false);
    } catch (error) {
      console.error('Duyuru eklenemedi:', error);
      setFormError('Kayıt sırasında bir hata oluştu.');
    }
    setIsSaving(false);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingDoc?.title.trim() || !editingDoc?.content.trim()) return;

    setIsSaving(true);
    setFormError('');

    let finalImageUrl = editingDoc.imageUrl;
    if (editingDoc.newFile) {
      const uploaded = await uploadImageToCloudinary(editingDoc.newFile);
      if (uploaded) finalImageUrl = uploaded;
    }

    try {
      await updateDoc(doc(db, 'announcements', editingDoc.id), {
        title: editingDoc.title.trim(),
        content: editingDoc.content.trim(),
        pinned: Boolean(editingDoc.isPinned),
        isPinned: Boolean(editingDoc.isPinned),
        imageUrl: finalImageUrl || ''
      });
      setEditingDoc(null);
    } catch (error) {
      console.error('Duyuru güncellenemedi:', error);
      setFormError('Güncelleme yapılamadı.');
    }
    setIsSaving(false);
  };

  const handleTogglePin = async (item) => {
    const current = item.pinned ?? item.isPinned ?? false;
    const newPinned = !current;
    try {
      await updateDoc(doc(db, 'announcements', item.id), {
        pinned: newPinned,
        isPinned: newPinned
      });
    } catch (error) {
      console.error('Sabitleme durumu güncellenemedi:', error);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await dbService.deleteDocument('announcements', deleteConfirm.id);
    } catch (error) {
      console.error('Silme hatası:', error);
    }
    setDeleteConfirm(null);
  };

  const openInteractions = async (docId, docTitle) => {
    setViewingInteractions({ id: docId, title: docTitle });
    setInteractions({ reactions: [], comments: [], loading: true });

    try {
      const [reactSnap, commSnap] = await Promise.all([
        getDocs(collection(db, `announcements/${docId}/reactions`)),
        getDocs(collection(db, `announcements/${docId}/comments`))
      ]);
      const reactions = reactSnap.docs.map((d) => d.data());
      const comments = commSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      comments.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setInteractions({ reactions, comments, loading: false });
    } catch (error) {
      console.error('Etkileşimler alınamadı:', error);
      setInteractions({ reactions: [], comments: [], loading: false });
    }
  };

  const pinnedCount = useMemo(() => announcements.filter((a) => a.pinned || a.isPinned).length, [announcements]);
  const withImageCount = useMemo(() => announcements.filter((a) => a.imageUrl).length, [announcements]);
  const lastPublished = useMemo(() => {
    if (announcements.length === 0 || !announcements[0]?.createdAtRaw) return '—';
    return new Date(announcements[0].createdAtRaw).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, [announcements]);

  const filteredAnnouncements = useMemo(() => {
    return announcements.filter((item) => {
      const matchSearch =
        !searchTerm.trim() ||
        item.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.content?.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchSearch) return false;

      if (filterTab === 'pinned') return item.pinned || item.isPinned;
      if (filterTab === 'with_image') return Boolean(item.imageUrl);
      return true;
    });
  }, [announcements, searchTerm, filterTab]);

  const reactionSummary = useMemo(() => {
    const counts = {};
    interactions.reactions.forEach((r) => {
      counts[r.reactionType] = (counts[r.reactionType] || 0) + 1;
    });
    return Object.entries(counts);
  }, [interactions.reactions]);

  return (
    <div className="w-full flex flex-col gap-5 pb-6">
      
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="m-0 text-[26px] font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
            Duyuru Yönetimi
          </h1>
          <p className="m-0 mt-1 text-[13px] text-slate-500 dark:text-slate-400 font-normal">
            Mobil uygulama, veli portalı ve web akışında yayınlanan duyuruları yönetin
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => {
              setFormError('');
              setCreateTab('form');
              setIsCreateModalOpen(true);
            }}
            className="shadow-sm"
          >
            Yeni Duyuru Yayınla
          </Button>
        </div>
      </header>

      <StatStrip>
        <Stat
          label="Toplam Duyuru"
          value={announcements.length}
          hint="Tüm aktif ve arşiv kayıtlar"
        />
        <Stat
          label="Sabitlenmiş"
          value={pinnedCount}
          hint="Akışın en üstünde gösterilen"
          tone={pinnedCount > 0 ? 'accent' : 'neutral'}
        />
        <Stat
          label="Görselli İçerik"
          value={withImageCount}
          hint="Medya içeren duyurular"
        />
        <Stat
          label="Son Yayın"
          value={lastPublished}
          hint="En son paylaşım zamanı"
          last
        />
      </StatStrip>

      <Panel>
        <PanelHeader
          title="Duyuru Akışı"
          description="Sistemde yayınlanan tüm bildirim ve duyurular"
        >
          
          <div className="flex items-center gap-2.5 mr-[60px]">
            
            <div className="flex items-center bg-slate-100 dark:bg-[#1e293b]/70 p-0.5 rounded-full border border-slate-200/60 dark:border-white/5 text-[12.5px] h-8">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={cx(
                  'px-3 h-7 flex items-center rounded-full font-medium transition-all cursor-pointer',
                  filterTab === 'all'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                Tümü
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('pinned')}
                className={cx(
                  'px-3 h-7 flex items-center rounded-full font-medium transition-all cursor-pointer',
                  filterTab === 'pinned'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                Sabit
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('with_image')}
                className={cx(
                  'px-3 h-7 flex items-center rounded-full font-medium transition-all cursor-pointer',
                  filterTab === 'with_image'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                Görselli
              </button>
            </div>

            <div className="relative w-[250px] max-w-full">
              <Search
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <Input
                type="text"
                placeholder="Duyurularda ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-9 h-8 text-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Aramayı Temizle"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </PanelHeader>

        {loading ? (
          <div className={cx('divide-y', divider)}>
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                <div className="w-14 h-14 rounded-xl bg-slate-200/70 dark:bg-white/[0.06] shrink-0" />
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                  <div className="h-4 w-1/4 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
                  <div className="h-3.5 w-3/4 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
                </div>
                <div className="w-24 h-4 rounded bg-slate-200/70 dark:bg-white/[0.06] shrink-0" />
              </div>
            ))}
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title={searchTerm ? 'Arama sonucu bulunamadı' : 'Henüz duyuru yayınlanmadı'}
            description={
              searchTerm
                ? `"${searchTerm}" aramasıyla eşleşen herhangi bir duyuru kaydı bulunamadı.`
                : 'Yeni Duyuru Yayınla butonunu kullanarak hemen ilk duyurunuzu paylaşabilirsiniz.'
            }
          />
        ) : (
          <div className={cx('divide-y', divider)}>
            {filteredAnnouncements.map((item) => {
              const pinned = item.pinned || item.isPinned || false;
              const formattedDate = item.createdAtRaw
                ? new Date(item.createdAtRaw).toLocaleString('tr-TR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : 'Tarih bilgisi yok';

              return (
                <article
                  key={item.id}
                  className={cx(
                    'group flex items-start gap-4 px-5 py-4 transition-colors',
                    pinned
                      ? 'bg-amber-50/25 dark:bg-amber-500/[0.03] hover:bg-amber-50/45 dark:hover:bg-amber-500/[0.05]'
                      : 'hover:bg-slate-50/80 dark:hover:bg-white/[0.02]'
                  )}
                >
                  
                  <div
                    className={cx(
                      'w-14 h-14 rounded-xl shrink-0 overflow-hidden border flex items-center justify-center relative shadow-2xs',
                      pinned
                        ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200/80 dark:border-amber-500/20'
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-white/10'
                    )}
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <Megaphone
                        size={20}
                        strokeWidth={1.75}
                        className={pinned ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}
                      />
                    )}

                    {pinned && (
                      <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          {pinned && (
                            <Badge tone="warning" className="gap-1 px-1.5 py-0.5 text-[11px]">
                              <Pin size={11} className="shrink-0" />
                              Sabitlendi
                            </Badge>
                          )}
                          <h3 className="m-0 text-[14.5px] font-semibold text-slate-900 dark:text-white tracking-[-0.01em] truncate">
                            {item.title || 'İsimsiz Duyuru'}
                          </h3>
                        </div>

                        <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 line-clamp-2 whitespace-pre-wrap font-normal">
                          {item.content}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                        <IconButton
                          label={pinned ? 'Sabitlemeyi Kaldır' : 'Başa Sabitle'}
                          icon={pinned ? PinOff : Pin}
                          onClick={() => handleTogglePin(item)}
                          className={pinned ? 'text-amber-600 dark:text-amber-400' : ''}
                        />
                        <IconButton
                          label="Etkileşimleri İncele"
                          icon={MessageSquare}
                          onClick={() => openInteractions(item.id, item.title)}
                        />
                        <IconButton
                          label="Düzenle"
                          icon={Pencil}
                          onClick={() =>
                            setEditingDoc({
                              id: item.id,
                              title: item.title,
                              content: item.content,
                              isPinned: pinned,
                              imageUrl: item.imageUrl || '',
                              newFile: null
                            })
                          }
                        />
                        <IconButton
                          label="Sil"
                          icon={Trash2}
                          variant="quiet"
                          onClick={() => setDeleteConfirm({ id: item.id, title: item.title })}
                          className="hover:text-rose-600 dark:hover:text-rose-400"
                        />
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center gap-3.5 text-[12px] text-slate-500 dark:text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1.5 font-normal tnum">
                        <Clock size={12.5} className="text-slate-400 dark:text-slate-500" />
                        {formattedDate}
                      </span>

                      {item.imageUrl && (
                        <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          <ImageIcon size={12.5} className="text-slate-400 dark:text-slate-500" />
                          Görsel Ekli
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => openInteractions(item.id, item.title)}
                        className="ml-auto flex items-center gap-1 text-[12px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                      >
                        <Heart size={12.5} className="text-rose-500/80" />
                        Etkileşimler
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>

      <Modal
        open={isCreateModalOpen}
        onClose={() => !isSaving && setIsCreateModalOpen(false)}
        title="Yeni Duyuru Oluştur"
        description="Mobil uygulama ve veli portalı akışında anında yayınlanır"
        width="max-w-xl"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={isSaving}
            >
              Vazgeç
            </Button>
            <Button
              type="submit"
              form="create-announcement-form"
              variant="primary"
              disabled={isSaving || !title.trim() || !content.trim()}
              icon={isSaving ? RefreshCw : Send}
            >
              {isSaving ? 'Yayınlanıyor…' : 'Duyuruyu Yayınla'}
            </Button>
          </>
        }
      >
        <form id="create-announcement-form" onSubmit={handleSave} className="p-5 flex flex-col gap-4 max-w-full overflow-hidden">
          {formError && (
            <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-[12.5px] text-rose-700 dark:text-rose-300">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-semibold tracking-wide uppercase text-slate-400 dark:text-slate-500">
              Hazır Şablonlar (Hızlı Doldur)
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => applyTemplate(tmpl)}
                  className="px-2.5 py-1.5 rounded-lg text-[12px] font-medium bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-white/10 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <Copy size={11.5} className="text-amber-500" />
                  {tmpl.title}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="create-title" className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300">
              Duyuru Başlığı <span className="text-rose-500">*</span>
            </label>
            <input
              id="create-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn: 29 Ekim Cumhuriyet Bayramı Töreni"
              className="w-full h-10 px-3.5 rounded-xl bg-slate-100/80 dark:bg-[#1e293b]/60 border border-transparent focus:border-slate-300 dark:focus:border-white/20 text-[13.5px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-colors box-border"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="create-content" className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300">
              Duyuru İçeriği <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="create-content"
              rows={5}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Duyuru metnini ve detaylarını buraya yazın..."
              className="w-full p-3.5 rounded-xl bg-slate-100/80 dark:bg-[#1e293b]/60 border border-transparent focus:border-slate-300 dark:focus:border-white/20 text-[13.5px] leading-relaxed text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-colors resize-y box-border"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300">
              Görsel / Banner <span className="text-slate-400 font-normal">(İsteğe bağlı)</span>
            </label>

            <div className="p-3 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-lg bg-slate-200/60 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {selectedFile ? (
                    <img
                      src={URL.createObjectURL(selectedFile)}
                      alt="Önizleme"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon size={20} className="text-slate-400 dark:text-slate-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate">
                    {selectedFile ? selectedFile.name : 'Görsel seçilmedi'}
                  </span>
                  <span className="block text-[11.5px] text-slate-400 dark:text-slate-500">
                    {selectedFile ? `${(selectedFile.size / 1024).toFixed(0)} KB · Hazır` : 'JPG veya PNG yükleyebilirsiniz'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {selectedFile && (
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="px-2.5 py-1.5 text-[12px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                  >
                    Kaldır
                  </button>
                )}
                <label className="px-3 py-1.5 text-[12px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-800 dark:text-slate-200 rounded-lg transition-colors cursor-pointer shadow-2xs">
                  {selectedFile ? 'Değiştir' : 'Görsel Seç'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                    }}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          <div
            onClick={() => setIsPinned(!isPinned)}
            className="p-3.5 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div
                className={cx(
                  'w-8 h-8 rounded-lg border flex items-center justify-center transition-colors shrink-0',
                  isPinned
                    ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200/80 dark:border-amber-500/30 text-amber-600 dark:text-amber-400'
                    : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500'
                )}
              >
                <Pin size={15} />
              </div>
              <div>
                <span className="block text-[13px] font-semibold text-slate-900 dark:text-white">
                  Akışın En Üstüne Sabitle
                </span>
                <span className="block text-[11.5px] text-slate-500 dark:text-slate-400">
                  Bu duyuru mobil uygulamada ilk sırada gösterilir
                </span>
              </div>
            </div>

            <div className="pointer-events-none">
              <Switch
                id="create-pinned"
                checked={isPinned}
                onChange={() => {}}
              />
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingDoc)}
        onClose={() => !isSaving && setEditingDoc(null)}
        title="Duyuruyu Düzenle"
        description="Mevcut duyuru metnini ve görselini güncelleyin"
        width="max-w-xl"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setEditingDoc(null)} disabled={isSaving}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              form="edit-announcement-form"
              variant="primary"
              disabled={isSaving}
              icon={isSaving ? RefreshCw : Save}
            >
              {isSaving ? 'Güncelleniyor…' : 'Değişiklikleri Kaydet'}
            </Button>
          </>
        }
      >
        {editingDoc && (
          <form id="edit-announcement-form" onSubmit={handleUpdate} className="p-5 flex flex-col gap-4 max-w-full overflow-hidden">
            {formError && (
              <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-[12.5px] text-rose-700 dark:text-rose-300">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-semibold tracking-wide uppercase text-slate-400 dark:text-slate-500">
                Hazır Şablon İle Değiştir
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => {
                      setEditingDoc({
                        ...editingDoc,
                        title: tmpl.title,
                        content: tmpl.content
                      });
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-[12px] font-medium bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-white/10 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
                  >
                    <Copy size={11.5} className="text-amber-500" />
                    {tmpl.title}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-title" className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300">
                Duyuru Başlığı <span className="text-rose-500">*</span>
              </label>
              <input
                id="edit-title"
                type="text"
                required
                value={editingDoc.title}
                onChange={(e) => setEditingDoc({ ...editingDoc, title: e.target.value })}
                className="w-full h-10 px-3.5 rounded-xl bg-slate-100/80 dark:bg-[#1e293b]/60 border border-transparent focus:border-slate-300 dark:focus:border-white/20 text-[13.5px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-colors box-border"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-content" className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300">
                Duyuru İçeriği <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="edit-content"
                rows={5}
                required
                value={editingDoc.content}
                onChange={(e) => setEditingDoc({ ...editingDoc, content: e.target.value })}
                className="w-full p-3.5 rounded-xl bg-slate-100/80 dark:bg-[#1e293b]/60 border border-transparent focus:border-slate-300 dark:focus:border-white/20 text-[13.5px] leading-relaxed text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-colors resize-y box-border"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300">
                Görsel / Banner
              </label>

              <div className="p-3 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-lg bg-slate-200/60 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                    {editingDoc.newFile ? (
                      <img
                        src={URL.createObjectURL(editingDoc.newFile)}
                        alt="Yeni Görsel"
                        className="w-full h-full object-cover"
                      />
                    ) : editingDoc.imageUrl ? (
                      <img
                        src={editingDoc.imageUrl}
                        alt="Mevcut Görsel"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon size={20} className="text-slate-400 dark:text-slate-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate">
                      {editingDoc.newFile ? editingDoc.newFile.name : editingDoc.imageUrl ? 'Mevcut görsel yüklü' : 'Görsel yok'}
                    </span>
                    <span className="block text-[11.5px] text-slate-400 dark:text-slate-500">
                      {editingDoc.newFile ? `${(editingDoc.newFile.size / 1024).toFixed(0)} KB · Yeni görsel` : 'İsteğe bağlı olarak değiştirebilirsiniz'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {(editingDoc.newFile || editingDoc.imageUrl) && (
                    <button
                      type="button"
                      onClick={() => setEditingDoc({ ...editingDoc, newFile: null, imageUrl: '' })}
                      className="px-2.5 py-1.5 text-[12px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                    >
                      Kaldır
                    </button>
                  )}
                  <label className="px-3 py-1.5 text-[12px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 text-slate-800 dark:text-slate-200 rounded-lg transition-colors cursor-pointer shadow-2xs">
                    {editingDoc.imageUrl || editingDoc.newFile ? 'Değiştir' : 'Görsel Seç'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        if (e.target.files?.[0]) setEditingDoc({ ...editingDoc, newFile: e.target.files[0] });
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div
              onClick={() => setEditingDoc({ ...editingDoc, isPinned: !editingDoc.isPinned })}
              className="p-3.5 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={cx(
                    'w-8 h-8 rounded-lg border flex items-center justify-center transition-colors shrink-0',
                    editingDoc.isPinned
                      ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200/80 dark:border-amber-500/30 text-amber-600 dark:text-amber-400'
                      : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 dark:text-slate-500'
                  )}
                >
                  <Pin size={15} />
                </div>
                <div>
                  <span className="block text-[13px] font-semibold text-slate-900 dark:text-white">
                    Akışın En Üstüne Sabitle
                  </span>
                  <span className="block text-[11.5px] text-slate-500 dark:text-slate-400">
                    Bu duyuru mobil uygulamada ilk sırada gösterilir
                  </span>
                </div>
              </div>

              <div className="pointer-events-none">
                <Switch
                  id="edit-pinned-toggle"
                  checked={editingDoc.isPinned}
                  onChange={() => {}}
                />
              </div>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(viewingInteractions)}
        onClose={() => setViewingInteractions(null)}
        title="Duyuru Etkileşimleri"
        description={viewingInteractions?.title}
        width="max-w-lg"
        footer={
          <Button type="button" variant="secondary" onClick={() => setViewingInteractions(null)}>
            Kapat
          </Button>
        }
      >
        {interactions.loading ? (
          <div className="p-5 flex flex-col gap-3 animate-pulse">
            {[0, 1, 2].map((n) => (
              <div key={n} className="h-12 rounded-xl bg-slate-200/60 dark:bg-white/[0.05]" />
            ))}
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4">
            
            <div className={cx('p-4 rounded-xl border bg-slate-50/50 dark:bg-white/[0.02]', hairline)}>
              <span className={eyebrow}>Kullanıcı Tepkileri ({interactions.reactions.length})</span>
              {reactionSummary.length === 0 ? (
                <p className="m-0 mt-2 text-[13px] text-slate-500 dark:text-slate-400 font-normal">
                  Bu duyuruya henüz bir tepki bırakılmamış.
                </p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {reactionSummary.map(([type, count]) => (
                    <span
                      key={type}
                      className={cx(
                        'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-white dark:bg-slate-900 text-[13px] shadow-2xs',
                        hairline
                      )}
                    >
                      <span className="text-base">{REACTION_LABELS[type] || '👍'}</span>
                      <span className="font-semibold text-slate-900 dark:text-white tnum">{count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2">
                <span className={eyebrow}>Yorumlar ({interactions.comments.length})</span>
              </div>

              {interactions.comments.length === 0 ? (
                <div className={cx('p-6 rounded-xl border text-center bg-slate-50/30 dark:bg-white/[0.01]', hairline)}>
                  <p className="m-0 text-[13px] text-slate-500 dark:text-slate-400">
                    Henüz yorum yapılmamış.
                  </p>
                </div>
              ) : (
                <div className={cx('divide-y border rounded-xl overflow-hidden bg-white dark:bg-slate-900/40', divider, hairline)}>
                  {interactions.comments.map((comment) => (
                    <div key={comment.id} className="p-3.5 flex flex-col gap-1 hover:bg-slate-50/50 dark:hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {comment.userName || 'Öğrenci / Veli'}
                        </span>
                        <span className="text-[11.5px] text-slate-400 dark:text-slate-500 tnum shrink-0">
                          {comment.createdAt?.toMillis
                            ? new Date(comment.createdAt.toMillis()).toLocaleString('tr-TR', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'Az önce'}
                        </span>
                      </div>
                      <p className="m-0 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 font-normal">
                        {comment.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
        title="Duyuruyu Sil"
        description="Bu işlem geri alınamaz"
        width="max-w-md"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDeleteConfirm(null)}>
              Vazgeç
            </Button>
            <Button type="button" variant="danger" onClick={confirmDelete}>
              Duyuruyu Kalıcı Olarak Sil
            </Button>
          </>
        }
      >
        <div className="p-5">
          <p className="m-0 text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-300 font-normal">
            <span className="font-semibold text-slate-900 dark:text-white">"{deleteConfirm?.title}"</span> başlıklı duyuru kalıcı olarak silinecek ve mobil uygulamadan anında kaldırılacaktır.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default AnnouncementsAdminView;
