import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import {
  Briefcase,
  Mail,
  Phone,
  Calendar,
  Search,
  Trash2,
  Eye,
  CheckCircle,
  FileText,
  ExternalLink,
  MessageSquare,
  MessageCircle,
  User,
  GraduationCap,
  Building2,
  Clock,
  Inbox,
  Filter,
  CheckCircle2,
  XCircle,
  Archive,
  RefreshCw,
  X,
  ChevronDown
} from 'lucide-react';
import {
  Panel,
  PanelHeader,
  Button,
  IconButton,
  Segmented,
  Badge,
  Modal,
  Toast,
  EmptyState
} from '../components/ui/panel';
import { cx, eyebrow, hairline } from '../components/ui/tokens';

const formatTrDate = (timestamp) => {
  if (!timestamp) return 'Tarih Yok';
  try {
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  } catch (e) {
    console.error('Date parse error:', e);
  }
  return 'Bilinmiyor';
};

const WebApplicationsAdminView = () => {
  const [activeTab, setActiveTab] = useState('hr');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // HR Applications State
  const [hrApps, setHrApps] = useState([]);
  const [loadingHr, setLoadingHr] = useState(true);
  const [selectedHrApp, setSelectedHrApp] = useState(null);

  // Contact Messages State
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [selectedContact, setSelectedContact] = useState(null);

  // Delete Confirmation
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, collection, name }

  // Toast
  const [toast, setToast] = useState({ open: false, message: '', tone: 'success' });
  const showToast = (message, tone = 'success') => {
    setToast({ open: true, message, tone });
    setTimeout(() => setToast((prev) => ({ ...prev, open: false })), 3500);
  };

  // 1. Subscribe to HR Applications
  useEffect(() => {
    try {
      const q = query(collection(db, 'hr_applications'), orderBy('createdAtMillis', 'desc'));
      const unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data()
        }));
        setHrApps(list);
        setLoadingHr(false);
      }, (err) => {
        console.warn('HR Applications listener fallback without sort:', err);
        // Fallback without orderBy in case index/field is missing
        const unsubFallback = onSnapshot(collection(db, 'hr_applications'), (snapshot) => {
          const list = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data()
          }));
          list.sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
          setHrApps(list);
          setLoadingHr(false);
        });
        return () => unsubFallback();
      });
      return () => unsub();
    } catch (e) {
      console.error('HR apps load error:', e);
      setLoadingHr(false);
    }
  }, []);

  // 2. Subscribe to Contact Messages
  useEffect(() => {
    try {
      const q = query(collection(db, 'contact_messages'), orderBy('createdAtMillis', 'desc'));
      const unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data()
        }));
        setContacts(list);
        setLoadingContacts(false);
      }, (err) => {
        console.warn('Contact messages listener fallback:', err);
        const unsubFallback = onSnapshot(collection(db, 'contact_messages'), (snapshot) => {
          const list = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data()
          }));
          list.sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
          setContacts(list);
          setLoadingContacts(false);
        });
        return () => unsubFallback();
      });
      return () => unsub();
    } catch (e) {
      console.error('Contact messages load error:', e);
      setLoadingContacts(false);
    }
  }, []);

  // Filtered HR
  const filteredHrApps = useMemo(() => {
    return hrApps.filter((app) => {
      const matchesSearch =
        (app.fullName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (app.branch || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (app.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (app.phone || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [hrApps, searchQuery, statusFilter]);

  // Filtered Contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      const matchesSearch =
        (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.subject || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.phone || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.message || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [contacts, searchQuery, statusFilter]);

  // Counts
  const unreadHrCount = hrApps.filter((a) => a.status === 'yeni' || !a.status).length;
  const unreadContactsCount = contacts.filter((c) => c.status === 'yeni' || !c.status).length;

  const tabOptions = [
    {
      id: 'hr',
      label: `İnsan Kaynakları (${unreadHrCount > 0 ? `${unreadHrCount} Yeni / ` : ''}${hrApps.length})`
    },
    {
      id: 'contacts',
      label: `İletişim & Ön Kayıt (${unreadContactsCount > 0 ? `${unreadContactsCount} Yeni / ` : ''}${contacts.length})`
    }
  ];

  // Actions
  const handleUpdateStatus = async (colName, docId, newStatus) => {
    try {
      await updateDoc(doc(db, colName, docId), { status: newStatus });
      showToast(`Durum güncellendi: ${newStatus}`);
      if (selectedHrApp && selectedHrApp.id === docId) {
        setSelectedHrApp((prev) => ({ ...prev, status: newStatus }));
      }
      if (selectedContact && selectedContact.id === docId) {
        setSelectedContact((prev) => ({ ...prev, status: newStatus }));
      }
    } catch (e) {
      console.error('Status update failed:', e);
      showToast('Durum güncellenemedi', 'danger');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, deleteTarget.collection, deleteTarget.id));
      showToast('Kayıt başarıyla silindi');
      setDeleteTarget(null);
      if (selectedHrApp?.id === deleteTarget.id) setSelectedHrApp(null);
      if (selectedContact?.id === deleteTarget.id) setSelectedContact(null);
    } catch (e) {
      console.error('Delete failed:', e);
      showToast('Silinirken hata oluştu', 'danger');
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-16">
      {/* Toast Notification */}
      <Toast
        open={toast.open}
        message={toast.message}
        tone={toast.tone}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className={eyebrow}>WEB PORTAL YÖNETİMİ</div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            Başvuru & İletişim Merkezi
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Web sitesi üzerinden gelen iş başvuruları, öğretmen adayları ve iletişim/ön kayıt taleplerini yönetin.
          </p>
        </div>

        {/* Sleek Minimalist Counter Badges */}
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <span className={`w-2 h-2 rounded-full ${unreadHrCount > 0 ? 'bg-blue-500 animate-pulse' : 'bg-slate-400'}`} />
            <span><strong>{unreadHrCount}</strong> Yeni Başvuru</span>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <span className={`w-2 h-2 rounded-full ${unreadContactsCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span><strong>{unreadContactsCount}</strong> Yeni Mesaj</span>
          </div>
        </div>
      </div>

      {/* Main Panel */}
      <Panel>
        <PanelHeader
          title="Gelen Başvurular ve Mesajlar"
          subtitle="Formlar üzerinden gelen verileri canlı olarak inceleyin ve arşivleyin"
        />

        <div className="p-5 flex flex-col gap-5">
          {/* Top Control Bar: Tabs & Search */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <Segmented
              value={activeTab}
              onChange={(val) => {
                setActiveTab(val);
                setStatusFilter('all');
              }}
              options={tabOptions}
            />

            <div className="flex items-center gap-2">
              {/* Status Filter Dropdown */}
              <div className="relative flex items-center">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="!h-8 !py-0 !pl-3 !pr-7 text-xs font-medium bg-slate-100 dark:bg-[#1e293b] border border-slate-200/80 dark:border-white/10 rounded-lg text-slate-700 dark:text-slate-200 outline-none hover:border-slate-300 dark:hover:border-white/20 focus:border-blue-500 transition-colors appearance-none cursor-pointer leading-normal !m-0"
                >
                  <option value="all">Tüm Durumlar</option>
                  <option value="yeni">Sadece Yeniler</option>
                  <option value="incelendi">İncelenenler</option>
                  <option value="arsiv">Arşivlenenler</option>
                </select>
                <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>

              {/* Compact Search Box */}
              <div className="relative flex items-center w-48 sm:w-56">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder={activeTab === 'hr' ? 'Aday adı, branş...' : 'İsim, konu, mesaj...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full !h-8 !py-0 !pl-8 !pr-7 text-xs bg-slate-100 dark:bg-[#1e293b] border border-slate-200/80 dark:border-white/10 rounded-lg text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none hover:border-slate-300 dark:hover:border-white/20 focus:border-blue-500 transition-colors !m-0"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white p-0.5"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* TAB 1: İNSAN KAYNAKLARI BAŞVURULARI */}
          {activeTab === 'hr' && (
            <div className="flex flex-col gap-3">
              {loadingHr ? (
                <div className="py-16 text-center text-slate-400 text-sm">Başvurular yükleniyor...</div>
              ) : filteredHrApps.length === 0 ? (
                <EmptyState
                  icon={Briefcase}
                  title="Başvuru Bulunamadı"
                  description={
                    searchQuery || statusFilter !== 'all'
                      ? 'Arama kriterlerinize uygun aday başvurusu bulunamadı.'
                      : 'Henüz web sitesi üzerinden gönderilmiş bir iş veya staj başvurusu bulunmuyor.'
                  }
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/5">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                        <th className="py-3 px-4">Aday Adı & Soyadı</th>
                        <th className="py-3 px-4">Kategori & Pozisyon</th>
                        <th className="py-3 px-4">Deneyim</th>
                        <th className="py-3 px-4">İletişim Bilgileri</th>
                        <th className="py-3 px-4">Özgeçmiş (CV)</th>
                        <th className="py-3 px-4">Başvuru Tarihi</th>
                        <th className="py-3 px-4">Durum</th>
                        <th className="py-3 px-4 text-right">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {filteredHrApps.map((item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900 dark:text-white text-sm">
                              {item.fullName}
                            </div>
                            {item.notes && (
                              <div className="text-[11px] text-slate-400 line-clamp-1 max-w-[200px]">
                                {item.notes}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5">
                              {item.positionType === 'teacher' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-bold text-[11px]">
                                  <GraduationCap size={12} /> Öğretmen
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 font-bold text-[11px]">
                                  <Building2 size={12} /> İdari
                                </span>
                              )}
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {item.branch}
                              </span>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 font-medium">
                            {item.experience || '-'}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex flex-col gap-0.5 text-slate-600 dark:text-slate-400">
                              <a
                                href={`tel:${item.phone}`}
                                className="hover:text-blue-600 flex items-center gap-1 font-semibold"
                              >
                                <Phone size={11} className="text-slate-400" /> {item.phone}
                              </a>
                              <a
                                href={`mailto:${item.email}`}
                                className="hover:text-blue-600 flex items-center gap-1"
                              >
                                <Mail size={11} className="text-slate-400" /> {item.email}
                              </a>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            {item.cvUrl ? (
                              <a
                                href={item.cvUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-bold transition-colors"
                              >
                                <FileText size={13} />
                                <span>CV İndir</span>
                                <ExternalLink size={11} />
                              </a>
                            ) : (
                              <span className="text-slate-400 italic">Yüklenmedi</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                            {formatTrDate(item.createdAt)}
                          </td>

                          <td className="py-3.5 px-4">
                            <select
                              value={item.status || 'yeni'}
                              onChange={(e) => handleUpdateStatus('hr_applications', item.id, e.target.value)}
                              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] outline-none cursor-pointer border ${
                                item.status === 'incelendi'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                                  : item.status === 'arsiv'
                                  ? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10'
                                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
                              }`}
                            >
                              <option value="yeni">Yeni Başvuru</option>
                              <option value="incelendi">İncelendi</option>
                              <option value="arsiv">Arşivlendi</option>
                            </select>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <IconButton
                                icon={Eye}
                                size="sm"
                                variant="ghost"
                                title="Detayları İncele"
                                onClick={() => setSelectedHrApp(item)}
                              />
                              <IconButton
                                icon={Trash2}
                                size="sm"
                                variant="danger"
                                title="Başvuruyu Sil"
                                onClick={() =>
                                  setDeleteTarget({
                                    id: item.id,
                                    collection: 'hr_applications',
                                    name: item.fullName
                                  })
                                }
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: İLETİŞİM & ÖN KAYIT MESAJLARI */}
          {activeTab === 'contacts' && (
            <div className="flex flex-col gap-3">
              {loadingContacts ? (
                <div className="py-16 text-center text-slate-400 text-sm">Mesajlar yükleniyor...</div>
              ) : filteredContacts.length === 0 ? (
                <EmptyState
                  icon={Mail}
                  title="Mesaj Bulunamadı"
                  description={
                    searchQuery || statusFilter !== 'all'
                      ? 'Arama kriterlerinize uygun iletişim mesajı bulunamadı.'
                      : 'Henüz web sitesi üzerinden gönderilmiş bir mesaj veya ön kayıt talebi bulunmuyor.'
                  }
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/5">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                        <th className="py-3 px-4">Gönderen</th>
                        <th className="py-3 px-4">Konu Başlığı</th>
                        <th className="py-3 px-4">Mesaj Özeti</th>
                        <th className="py-3 px-4">İletişim</th>
                        <th className="py-3 px-4">Tarih</th>
                        <th className="py-3 px-4">Durum</th>
                        <th className="py-3 px-4 text-right">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {filteredContacts.map((item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white text-sm whitespace-nowrap">
                            {item.name}
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="inline-block px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-bold text-[11px]">
                              {item.subject || 'Genel Bilgi'}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="text-slate-600 dark:text-slate-300 max-w-[280px] line-clamp-2">
                              {item.message}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="flex flex-col gap-0.5">
                              {item.phone && (
                                <a
                                  href={`tel:${item.phone}`}
                                  className="text-slate-700 dark:text-slate-300 font-semibold hover:text-blue-600 flex items-center gap-1"
                                >
                                  <Phone size={11} className="text-slate-400" /> {item.phone}
                                </a>
                              )}
                              <a
                                href={`mailto:${item.email}`}
                                className="text-slate-500 hover:text-blue-600 flex items-center gap-1"
                              >
                                <Mail size={11} className="text-slate-400" /> {item.email}
                              </a>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                            {formatTrDate(item.createdAt)}
                          </td>

                          <td className="py-3.5 px-4">
                            <select
                              value={item.status || 'yeni'}
                              onChange={(e) => handleUpdateStatus('contact_messages', item.id, e.target.value)}
                              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] outline-none cursor-pointer border ${
                                item.status === 'cevaplandi' || item.status === 'incelendi'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
                              }`}
                            >
                              <option value="yeni">Yeni Mesaj</option>
                              <option value="cevaplandi">Yanıtlandı</option>
                              <option value="arsiv">Arşivlendi</option>
                            </select>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {item.phone && (
                                <a
                                  href={`https://wa.me/90${item.phone.replace(/[^0-9]/g, '').replace(/^0/, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                                  title="WhatsApp'tan Yaz"
                                >
                                  <MessageCircle size={15} />
                                </a>
                              )}
                              <IconButton
                                icon={Eye}
                                size="sm"
                                variant="ghost"
                                title="Mesajı Oku"
                                onClick={() => setSelectedContact(item)}
                              />
                              <IconButton
                                icon={Trash2}
                                size="sm"
                                variant="danger"
                                title="Mesajı Sil"
                                onClick={() =>
                                  setDeleteTarget({
                                    id: item.id,
                                    collection: 'contact_messages',
                                    name: `${item.name} (${item.subject})`
                                  })
                                }
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </Panel>

      {/* HR APPLICATION DETAIL MODAL */}
      {selectedHrApp && (
        <Modal
          open={Boolean(selectedHrApp)}
          onClose={() => setSelectedHrApp(null)}
          title="Aday Başvuru Dosyası"
        >
          <div className="flex flex-col gap-4 text-slate-800 dark:text-slate-200">
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {selectedHrApp.fullName}
                </h3>
                <span className="text-xs text-slate-500">
                  {selectedHrApp.positionType === 'teacher' ? 'Öğretmen Kadrosu' : 'İdari & Destek Personeli'} • {selectedHrApp.branch}
                </span>
              </div>
              <Badge tone={selectedHrApp.status === 'incelendi' ? 'success' : 'warning'}>
                {selectedHrApp.status === 'incelendi' ? 'İncelendi' : 'Yeni Başvuru'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 dark:bg-white/5 rounded-lg">
                <span className="text-slate-400 block font-semibold">Telefon</span>
                <a href={`tel:${selectedHrApp.phone}`} className="font-bold text-blue-600 hover:underline">
                  {selectedHrApp.phone}
                </a>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-white/5 rounded-lg">
                <span className="text-slate-400 block font-semibold">E-posta</span>
                <a href={`mailto:${selectedHrApp.email}`} className="font-bold text-blue-600 hover:underline">
                  {selectedHrApp.email}
                </a>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-white/5 rounded-lg">
                <span className="text-slate-400 block font-semibold">Mesleki Deneyim</span>
                <span className="font-bold">{selectedHrApp.experience || '-'}</span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-white/5 rounded-lg">
                <span className="text-slate-400 block font-semibold">Başvuru Tarihi</span>
                <span className="font-bold">{formatTrDate(selectedHrApp.createdAt)}</span>
              </div>
            </div>

            {selectedHrApp.cvUrl && (
              <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                  <FileText size={18} />
                  <span>Özgeçmiş Belgesi Mevcut</span>
                </div>
                <a
                  href={selectedHrApp.cvUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                >
                  <span>CV'yi Aç</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            )}

            {selectedHrApp.notes && (
              <div className="flex flex-col gap-1 text-xs">
                <span className="font-bold text-slate-500">Adayın Ön Yazısı / Notları:</span>
                <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {selectedHrApp.notes}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-white/10">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={selectedHrApp.status === 'incelendi' ? 'secondary' : 'primary'}
                  onClick={() => handleUpdateStatus('hr_applications', selectedHrApp.id, 'incelendi')}
                >
                  İncelendi Olarak İşaretle
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleUpdateStatus('hr_applications', selectedHrApp.id, 'arsiv')}
                >
                  Arşive Kaldır
                </Button>
              </div>

              <Button size="sm" variant="ghost" onClick={() => setSelectedHrApp(null)}>
                Kapat
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* CONTACT MESSAGE DETAIL MODAL */}
      {selectedContact && (
        <Modal
          open={Boolean(selectedContact)}
          onClose={() => setSelectedContact(null)}
          title="İletişim Mesajı Detayı"
        >
          <div className="flex flex-col gap-4 text-slate-800 dark:text-slate-200">
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/5 rounded-xl">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {selectedContact.name}
                </h3>
                <span className="text-xs text-blue-600 dark:text-blue-400 font-bold">
                  {selectedContact.subject || 'Genel Bilgi'}
                </span>
              </div>
              <Badge tone={selectedContact.status === 'cevaplandi' ? 'success' : 'warning'}>
                {selectedContact.status === 'cevaplandi' ? 'Yanıtlandı' : 'Yeni'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 dark:bg-white/5 rounded-lg">
                <span className="text-slate-400 block font-semibold">Telefon Numarası</span>
                <a href={`tel:${selectedContact.phone}`} className="font-bold text-blue-600 hover:underline">
                  {selectedContact.phone || '-'}
                </a>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-white/5 rounded-lg">
                <span className="text-slate-400 block font-semibold">E-posta Adresi</span>
                <a href={`mailto:${selectedContact.email}`} className="font-bold text-blue-600 hover:underline">
                  {selectedContact.email}
                </a>
              </div>
            </div>

            <div className="flex flex-col gap-1 text-xs">
              <span className="font-bold text-slate-500">Mesaj İçeriği:</span>
              <div className="p-3.5 bg-slate-50 dark:bg-white/5 rounded-xl text-slate-700 dark:text-slate-300 leading-relaxed text-sm whitespace-pre-wrap">
                {selectedContact.message}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-white/10">
              <div className="flex gap-2">
                {selectedContact.phone && (
                  <a
                    href={`https://wa.me/90${selectedContact.phone.replace(/[^0-9]/g, '').replace(/^0/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                  >
                    <MessageCircle size={14} />
                    <span>WhatsApp'tan Cevapla</span>
                  </a>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleUpdateStatus('contact_messages', selectedContact.id, 'cevaplandi')}
                >
                  Yanıtlandı İşaretle
                </Button>
              </div>

              <Button size="sm" variant="ghost" onClick={() => setSelectedContact(null)}>
                Kapat
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <Modal
          open={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          title="Kaydı Silmek İstiyor musunuz?"
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <strong>{deleteTarget.name}</strong> kaydını silmek üzeresiniz. Bu işlem geri alınamaz.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
                İptal
              </Button>
              <Button variant="danger" onClick={handleDelete}>
                Evet, Sil
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default WebApplicationsAdminView;
