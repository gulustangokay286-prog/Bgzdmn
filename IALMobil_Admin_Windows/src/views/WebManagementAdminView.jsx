import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import {
  ShoppingBag,
  Globe,
  Plus,
  Trash2,
  Pencil,
  Star,
  RefreshCw,
  ExternalLink,
  Search,
  X,
  Package,
  HelpCircle,
  BarChart3,
  GraduationCap,
  Phone,
  Mail,
  MapPin,
  MessageCircle,
  Clock,
  Inbox,
  Sparkles,
  Save,
  Check
} from 'lucide-react';
import {
  Panel,
  PanelHeader,
  PanelFooter,
  Button,
  IconButton,
  Segmented,
  FieldRows,
  Field,
  Input,
  Textarea,
  Select,
  Switch,
  ImagePicker,
  Badge,
  Dot,
  EmptyState,
  Modal,
  Toast
} from '../components/ui/panel';
import { cx, eyebrow, hairline, divider } from '../components/ui/tokens';

const CATEGORIES = [
  { id: 'all', label: 'Tüm Ürünler' },
  { id: 'uniform', label: 'Okul Kıyafetleri' },
  { id: 'books', label: 'Yayın & Kitap Setleri' },
  { id: 'stationery', label: 'Kırtasiye & Malzeme' },
  { id: 'accessory', label: 'Kolej Aksesuar' },
  { id: 'other', label: 'Diğer Materyaller' }
];

const STOCK_STATUSES = {
  in_stock: { label: 'Stokta Var', tone: 'success' },
  low_stock: { label: 'Kritik Stok', tone: 'warning' },
  out_of_stock: { label: 'Tükendi', tone: 'danger' },
  pre_order: { label: 'Ön Sipariş', tone: 'neutral' }
};

const ORDER_STATUSES = {
  pending: { label: 'Beklemede', tone: 'warning' },
  preparing: { label: 'Hazırlanıyor', tone: 'neutral' },
  delivered: { label: 'Teslim Edildi', tone: 'success' },
  cancelled: { label: 'İptal Edildi', tone: 'danger' }
};

const TAB_OPTIONS = [
  { id: 'products', label: 'Mağaza & Ürünler' },
  { id: 'orders', label: 'Siparişler' },
  { id: 'hero', label: 'Hero & Banner' },
  { id: 'education', label: 'Eğitim Kademeleri' },
  { id: 'stats', label: 'İstatistikler' },
  { id: 'faq', label: 'Sıkça Sorulanlar' },
  { id: 'contact', label: 'İletişim Bilgileri' }
];

const money = (n) => `₺${Number(n || 0).toLocaleString('tr-TR')}`;

const WebManagementAdminView = () => {
  const [activeTab, setActiveTab] = useState('products');

  const [toast, setToast] = useState({ open: false, message: '', tone: 'success' });
  const showToast = (message, tone = 'success') => {
    setToast({ open: true, message, tone });
    setTimeout(() => setToast((prev) => ({ ...prev, open: false })), 3500);
  };

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const [formData, setFormData] = useState({
    title: '',
    price: '',
    originalPrice: '',
    category: 'uniform',
    stockStatus: 'in_stock',
    stockCount: '50',
    sizes: 'XS, S, M, L, XL',
    description: '',
    badge: 'Yeni Sezon',
    imageUrl: '',
    isFeatured: true
  });

  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  const [heroSettings, setHeroSettings] = useState({
    topBannerActive: true,
    topBannerText: '🔔 2026-2027 Eğitim Öğretim Yılı Erken Kayıt Avantajları Başladı! Kontenjanlar Sınırlıdır.',
    badgeText: 'BOĞAZİÇİ KOLEJİ 2026-2027',
    title: 'Daha iyi bir gelecek için Boğaziçi',
    subtitle: 'Deneyimli kadromuz, modern teknoloji odaklı eğitim anlayışımız ve bireysel takip sistemimizle öğrencilerimizi hayata ve üniversiteye hazırlıyoruz.',
    heroImageUrl: '',
    shopShowcaseTitle: 'Okul Kıyafetleri & Yayın Setleri',
    shopShowcaseDesc: 'Kayıtlı öğrencilerimize özel indirimli fiyatlarla resmi okul ürünleri.'
  });
  const [isSavingHero, setIsSavingHero] = useState(false);
  const [heroImageFile, setHeroImageFile] = useState(null);

  const [statsSettings, setStatsSettings] = useState({
    stat1_num: '20',
    stat1_suffix: '+',
    stat1_label: 'Yıllık Tecrübe',
    stat2_num: '98',
    stat2_suffix: '%',
    stat2_label: 'Üniversiteye Yerleşme',
    stat3_num: '1500',
    stat3_suffix: '+',
    stat3_label: 'Mezun Öğrenci',
    stat4_num: '50',
    stat4_suffix: '+',
    stat4_label: 'Uzman Öğretmen'
  });
  const [isSavingStats, setIsSavingStats] = useState(false);

  const [educationSettings, setEducationSettings] = useState({
    kindergarten: 'Erken yaşta yabancı dil, robotik kodlama ve keşif odaklı montessori destekli okul öncesi programı.',
    primary: 'Temel akademik beceriler, okuma kültürü ve sanatsal atölyelerle donatılmış zenginleştirilmiş ilkokul eğitimi.',
    middle: 'LGS odaklı soru çözüm kampları, birebir etütler ve koçluk sistemi ile Türkiye derecesi hedefleyen ortaokul.',
    highschool: 'YKS hazırlık merkezli, üniversite hedeflerine özel Sayısal ve Eşit Ağırlık zümreleri ile Anadolu & Fen Lisesi.'
  });
  const [isSavingEducation, setIsSavingEducation] = useState(false);

  const [faqs, setFaqs] = useState([
    {
      q: 'Boğaziçi Koleji’ne kayıt kabul ve bursluluk şartları nelerdir?',
      a: 'Kurumumuza her yıl düzenlenen Düzey Belirleme ve Bursluluk Sınavları ile öğrenci kabul edilmektedir. Sınavda başarı gösteren öğrencilerimize %100’e varan eğitim bursları sağlanmaktadır.'
    },
    {
      q: 'YKS ve LGS hazırlık süreçlerinde ek ders veya kurs ihtiyacı oluyor mu?',
      a: 'Hayır. Boğaziçi Koleji tam gün eğitim modeli, birebir etüt ofisleri ve deneme kulüpleri sayesinde öğrencilerimizin hiçbir dış kursa ihtiyaç duymadan derece yapmalarını hedefler.'
    },
    {
      q: 'Dijital Portal ve Mobil Uygulama velilere ne gibi imkanlar sunar?',
      a: 'Velilerimiz; akıllı yoklama, turnike geçiş bildirimleri, ödev takipleri, canlı deneme sınavı karne analizleri ve öğretmen randevu sistemine 7/24 mobil uygulama ve web portaldan erişebilirler.'
    }
  ]);
  const [isSavingFaq, setIsSavingFaq] = useState(false);
  const [newFaqModal, setNewFaqModal] = useState(false);
  const [faqForm, setFaqForm] = useState({ q: '', a: '' });

  const [contactSettings, setContactSettings] = useState({
    phone: '0 (364) 666 05 00',
    whatsapp: '905000000000',
    email: 'info@corumbogazici.com',
    address: 'Çorum Boğaziçi Koleji Kampüsü, Merkez / ÇORUM',
    instagram: 'https://instagram.com/corumbogazicikoleji',
    youtube: 'https://youtube.com/@bogazicikoleji',
    workingHours: 'Hafta İçi: 08:30 - 18:00 | Cumartesi: 09:00 - 14:00'
  });
  const [isSavingContact, setIsSavingContact] = useState(false);

  const uploadToCloudinary = async (file, folder = 'ial-web-assets') => {
    const data = new FormData();
    data.append('file', file);
    data.append('upload_preset', 'ml_default');
    data.append('folder', folder);

    try {
      const res = await fetch('https://api.cloudinary.com/v1_1/dbfhcj6px/auto/upload', {
        method: 'POST',
        body: data
      });
      const json = await res.json();
      return json.secure_url || null;
    } catch (err) {
      console.error('Görsel yükleme hatası:', err);
      return null;
    }
  };

  useEffect(() => {
    const unsubProducts = onSnapshot(
      collection(db, 'store_products'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
        setProducts(list);
        setLoadingProducts(false);
      },
      (e) => {
        console.warn('store_products dinleme hatası:', e);
        setLoadingProducts(false);
      }
    );

    const unsubOrders = onSnapshot(
      collection(db, 'store_orders'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
        setOrders(list);
        setLoadingOrders(false);
      },
      (e) => {
        console.warn('store_orders dinleme hatası:', e);
        setLoadingOrders(false);
      }
    );

    const loadAllSettings = async () => {
      try {
        const heroDoc = await getDoc(doc(db, 'web_settings', 'hero'));
        if (heroDoc.exists()) setHeroSettings((prev) => ({ ...prev, ...heroDoc.data() }));

        const statsDoc = await getDoc(doc(db, 'web_settings', 'stats'));
        if (statsDoc.exists()) setStatsSettings((prev) => ({ ...prev, ...statsDoc.data() }));

        const eduDoc = await getDoc(doc(db, 'web_settings', 'education'));
        if (eduDoc.exists()) setEducationSettings((prev) => ({ ...prev, ...eduDoc.data() }));

        const faqDoc = await getDoc(doc(db, 'web_settings', 'faq'));
        if (faqDoc.exists() && Array.isArray(faqDoc.data()?.items)) setFaqs(faqDoc.data().items);

        const contactDoc = await getDoc(doc(db, 'web_settings', 'contact'));
        if (contactDoc.exists()) setContactSettings((prev) => ({ ...prev, ...contactDoc.data() }));
      } catch (err) {
        console.warn('web_settings okuma uyarısı:', err);
      }
    };
    loadAllSettings();

    return () => {
      unsubProducts();
      unsubOrders();
    };
  }, []);

  const openProductModal = (prod = null) => {
    if (prod) {
      setEditingProduct(prod);
      setFormData({
        title: prod.title || '',
        price: prod.price || '',
        originalPrice: prod.originalPrice || '',
        category: prod.category || 'uniform',
        stockStatus: prod.stockStatus || 'in_stock',
        stockCount: prod.stockCount || '50',
        sizes: prod.sizes || '',
        description: prod.description || '',
        badge: prod.badge || '',
        imageUrl: prod.imageUrl || '',
        isFeatured: prod.isFeatured !== undefined ? prod.isFeatured : true
      });
    } else {
      setEditingProduct(null);
      setFormData({
        title: '',
        price: '',
        originalPrice: '',
        category: 'uniform',
        stockStatus: 'in_stock',
        stockCount: '50',
        sizes: 'XS, S, M, L, XL',
        description: '',
        badge: 'Yeni Sezon',
        imageUrl: '',
        isFeatured: true
      });
    }
    setSelectedImageFile(null);
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.price) {
      showToast('Lütfen başlık ve fiyat alanlarını doldurun.', 'danger');
      return;
    }

    setIsSavingProduct(true);
    try {
      let finalImageUrl = formData.imageUrl;
      if (selectedImageFile) {
        const uploaded = await uploadToCloudinary(selectedImageFile, 'ial-market-products');
        if (uploaded) finalImageUrl = uploaded;
      }

      const payload = {
        title: formData.title.trim(),
        price: Number(formData.price),
        originalPrice: formData.originalPrice ? Number(formData.originalPrice) : null,
        category: formData.category,
        stockStatus: formData.stockStatus,
        stockCount: Number(formData.stockCount) || 0,
        sizes: formData.sizes.trim(),
        description: formData.description.trim(),
        badge: formData.badge.trim(),
        imageUrl: finalImageUrl || '',
        isFeatured: Boolean(formData.isFeatured),
        updatedAt: serverTimestamp(),
        createdAtMillis: editingProduct?.createdAtMillis || Date.now()
      };

      if (editingProduct) {
        await updateDoc(doc(db, 'store_products', editingProduct.id), payload);
        showToast('Ürün başarıyla güncellendi.');
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, 'store_products'), payload);
        showToast('Yeni ürün mağazaya eklendi.');
      }

      setProductModalOpen(false);
      setEditingProduct(null);
    } catch (err) {
      console.error('Ürün kaydetme hatası:', err);
      showToast('Kayıt esnasında bir hata oluştu: ' + err.message, 'danger');
    }
    setIsSavingProduct(false);
  };

  const handleDeleteProduct = async (id) => {
    try {
      await deleteDoc(doc(db, 'store_products', id));
      setDeleteConfirmId(null);
      showToast('Ürün mağazadan kaldırıldı.');
    } catch (err) {
      console.error('Ürün silinemedi:', err);
      showToast('Ürün silinemedi.', 'danger');
    }
  };

  const toggleFeatured = async (product) => {
    try {
      await updateDoc(doc(db, 'store_products', product.id), {
        isFeatured: !product.isFeatured
      });
      showToast(product.isFeatured ? 'Ürün vitrinden çıkarıldı.' : 'Ürün anasayfa vitrinine eklendi.');
    } catch (err) {
      console.error('Vitrin durumu güncellenemedi:', err);
    }
  };

  const handleSaveHero = async (e) => {
    e.preventDefault();
    setIsSavingHero(true);
    try {
      let finalHeroUrl = heroSettings.heroImageUrl;
      if (heroImageFile) {
        const uploaded = await uploadToCloudinary(heroImageFile, 'ial-hero-banners');
        if (uploaded) finalHeroUrl = uploaded;
      }
      const payload = {
        ...heroSettings,
        heroImageUrl: finalHeroUrl || '',
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, 'web_settings', 'hero'), payload, { merge: true });
      showToast('Hero ve banner ayarları kaydedildi.');
    } catch (err) {
      console.error('Hero kaydetme hatası:', err);
      showToast('Hero ayarları kaydedilemedi.', 'danger');
    }
    setIsSavingHero(false);
  };

  const handleSaveStats = async (e) => {
    e.preventDefault();
    setIsSavingStats(true);
    try {
      await setDoc(doc(db, 'web_settings', 'stats'), {
        ...statsSettings,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showToast('Okul istatistikleri güncellendi.');
    } catch (err) {
      console.error('Stats kaydetme hatası:', err);
      showToast('İstatistikler kaydedilemedi.', 'danger');
    }
    setIsSavingStats(false);
  };

  const handleSaveEducation = async (e) => {
    e.preventDefault();
    setIsSavingEducation(true);
    try {
      await setDoc(doc(db, 'web_settings', 'education'), {
        ...educationSettings,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showToast('Eğitim kademeleri metinleri güncellendi.');
    } catch (err) {
      console.error('Education kaydetme hatası:', err);
      showToast('Kademeler kaydedilemedi.', 'danger');
    }
    setIsSavingEducation(false);
  };

  const handleSaveFaqs = async (newList) => {
    setIsSavingFaq(true);
    try {
      await setDoc(doc(db, 'web_settings', 'faq'), {
        items: newList,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setFaqs(newList);
      showToast('Soru listesi güncellendi.');
    } catch (err) {
      console.error('FAQ kaydetme hatası:', err);
      showToast('Sorular kaydedilemedi.', 'danger');
    }
    setIsSavingFaq(false);
  };

  const handleAddFaq = (e) => {
    e.preventDefault();
    if (!faqForm.q.trim() || !faqForm.a.trim()) return;
    const updated = [...faqs, { q: faqForm.q.trim(), a: faqForm.a.trim() }];
    handleSaveFaqs(updated);
    setFaqForm({ q: '', a: '' });
    setNewFaqModal(false);
  };

  const handleDeleteFaq = (idx) => {
    const updated = faqs.filter((_, i) => i !== idx);
    handleSaveFaqs(updated);
  };

  const handleSaveContact = async (e) => {
    e.preventDefault();
    setIsSavingContact(true);
    try {
      await setDoc(doc(db, 'web_settings', 'contact'), {
        ...contactSettings,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showToast('İletişim ve kampüs bilgileri kaydedildi.');
    } catch (err) {
      console.error('İletişim kaydetme hatası:', err);
      showToast('İletişim bilgileri kaydedilemedi.', 'danger');
    }
    setIsSavingContact(false);
  };

  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      await updateDoc(doc(db, 'store_orders', orderId), { status: newStatus });
      showToast('Sipariş durumu güncellendi.');
    } catch (e) {
      console.error('Sipariş güncellenemedi:', e);
      showToast('Sipariş güncellenemedi.', 'danger');
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCat = selectedCategoryFilter === 'all' || p.category === selectedCategoryFilter;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        p.title?.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.sizes?.toLowerCase().includes(query);
      return matchesCat && matchesSearch;
    });
  }, [products, selectedCategoryFilter, searchQuery]);

  const tabOptionsWithCount = useMemo(() => {
    return TAB_OPTIONS.map((t) => {
      if (t.id === 'products') return { ...t, count: products.length };
      if (t.id === 'orders') return { ...t, count: orders.length };
      if (t.id === 'faq') return { ...t, count: faqs.length };
      return t;
    });
  }, [products.length, orders.length, faqs.length]);

  return (
    <div className="w-full flex flex-col gap-5 pb-4">
      <Toast open={toast.open} message={toast.message} tone={toast.tone} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[27px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
            Okul Web & Mağaza Yönetimi
          </h1>
          <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-200">bgz-mobil.web.app</span> portalı için canlı içerik, mağaza ve kurumsal parametreler
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://bgz-mobil.web.app"
            target="_blank"
            rel="noopener noreferrer"
            className={cx(
              'inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border text-[13px] font-medium transition-colors',
              'bg-white dark:bg-white/[0.04] text-slate-700 dark:text-slate-200 border-slate-300 dark:border-white/12 hover:bg-slate-50 dark:hover:bg-white/[0.08]'
            )}
          >
            <ExternalLink size={14} />
            <span>Canlı Siteyi Aç</span>
          </a>
        </div>
      </header>

      <div className="overflow-x-auto no-scrollbar">
        <Segmented value={activeTab} onChange={setActiveTab} options={tabOptionsWithCount} />
      </div>

      {activeTab === 'products' && (
        <Panel>
          
          <div className={cx('flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-b', hairline)}>
            <div className="flex flex-1 items-center gap-2.5 w-full sm:w-auto">
              <div className="relative flex-1 min-w-0">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Ürün adı, beden veya açıklama ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    aria-label="Temizle"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="sm:w-48 shrink-0">
                <Select value={selectedCategoryFilter} onChange={(e) => setSelectedCategoryFilter(e.target.value)}>
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <Button variant="primary" icon={Plus} onClick={() => openProductModal()} className="w-full sm:w-auto">
              Yeni Ürün Ekle
            </Button>
          </div>

          {loadingProducts ? (
            <div className={cx('divide-y', divider)}>
              {[0, 1, 2, 3].map((n) => (
                <div key={n} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
                  <div className="w-12 h-12 rounded-lg bg-slate-200/70 dark:bg-white/[0.06]" />
                  <div className="flex-1 h-4 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
                  <div className="w-20 h-4 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title={products.length === 0 ? 'Mağazada ürün bulunmuyor' : 'Eşleşen ürün bulunamadı'}
              description={
                products.length === 0
                  ? 'Okul formaları, kitap setleri ve materyaller eklendikçe burada listelenir.'
                  : 'Arama metnini veya kategori filtresini değiştirerek tekrar deneyin.'
              }
              action={
                products.length === 0 ? (
                  <Button variant="primary" icon={Plus} onClick={() => openProductModal()}>
                    İlk Ürünü Ekle
                  </Button>
                ) : (
                  <Button onClick={() => { setSearchQuery(''); setSelectedCategoryFilter('all'); }}>
                    Filtreleri Temizle
                  </Button>
                )
              }
            />
          ) : (
            <div className="overflow-x-auto panel-scroll">
              <div className="min-w-[840px]">
                
                <div
                  className={cx(
                    'grid grid-cols-[60px_minmax(0,1.8fr)_130px_110px_110px_100px] gap-4 px-5 py-2.5 border-b bg-slate-50/70 dark:bg-white/[0.02]',
                    hairline
                  )}
                >
                  <span className={eyebrow}>Görsel</span>
                  <span className={eyebrow}>Ürün Başlığı</span>
                  <span className={eyebrow}>Kategori</span>
                  <span className={eyebrow}>Durum</span>
                  <span className={cx(eyebrow, 'text-right')}>Fiyat</span>
                  <span className={cx(eyebrow, 'text-right')}>İşlem</span>
                </div>

                <div className={cx('divide-y', divider)}>
                  {filteredProducts.map((p) => {
                    const stock = STOCK_STATUSES[p.stockStatus] || STOCK_STATUSES.in_stock;
                    const catLabel = CATEGORIES.find((c) => c.id === p.category)?.label || 'Diğer';

                    return (
                      <div
                        key={p.id}
                        className="grid grid-cols-[60px_minmax(0,1.8fr)_130px_110px_110px_100px] gap-4 px-5 py-3 items-center hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                      >
                        
                        <div
                          className={cx(
                            'w-11 h-11 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-slate-100 dark:bg-white/[0.04] border',
                            hairline
                          )}
                        >
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Package size={18} className="text-slate-400" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate" title={p.title}>
                              {p.title}
                            </span>
                            {p.badge && (
                              <span className="px-1.5 py-0.5 rounded text-[10.5px] font-semibold bg-[#991b1b]/10 text-[#991b1b] dark:text-rose-300">
                                {p.badge}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400 truncate">
                            {p.sizes ? `Bedenler: ${p.sizes}` : p.description || 'Açıklama yok'}
                          </div>
                        </div>

                        <div className="text-[12.5px] text-slate-600 dark:text-slate-300 truncate">
                          {catLabel}
                        </div>

                        <div>
                          <Badge tone={stock.tone}>{stock.label}</Badge>
                        </div>

                        <div className="text-right">
                          <div className="text-[13.5px] font-semibold text-slate-900 dark:text-white tnum">
                            {money(p.price)}
                          </div>
                          {p.originalPrice && p.originalPrice > p.price && (
                            <div className="text-[11px] text-slate-400 line-through tnum">
                              {money(p.originalPrice)}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            label={p.isFeatured ? 'Vitrinden çıkar' : 'Vitrine ekle'}
                            icon={Star}
                            onClick={() => toggleFeatured(p)}
                            className={p.isFeatured ? 'text-amber-500 hover:text-amber-600' : 'text-slate-400'}
                          />
                          <IconButton label="Düzenle" icon={Pencil} onClick={() => openProductModal(p)} />
                          <IconButton
                            label="Sil"
                            icon={Trash2}
                            variant="quiet"
                            onClick={() => setDeleteConfirmId(p.id)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {products.length > 0 && (
            <PanelFooter>
              <span className="text-[11.5px] text-slate-500 dark:text-slate-400">
                <span className="font-medium text-slate-700 dark:text-slate-200 tnum">{filteredProducts.length}</span> ürün listeleniyor · toplam <span className="tnum">{products.length}</span>
              </span>
            </PanelFooter>
          )}
        </Panel>
      )}

      {activeTab === 'orders' && (
        <Panel>
          <PanelHeader title="Mağaza Siparişleri" description="Veli ve öğrencilerin verdiği resmi okul ürünleri siparişleri">
            <Badge tone="neutral">{orders.length} Sipariş</Badge>
          </PanelHeader>

          {loadingOrders ? (
            <div className={cx('divide-y', divider)}>
              {[0, 1, 2].map((n) => (
                <div key={n} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                  <div className="flex-1 h-4 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
                  <div className="w-28 h-4 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
                </div>
              ))}
            </div>
          ) : orders.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Henüz sipariş kaydı yok"
              description="Web mağazası üzerinden sipariş verildiğinde kayıtlar otomatik olarak bu listede görünür."
            />
          ) : (
            <div className="overflow-x-auto panel-scroll">
              <div className="min-w-[780px]">
                <div
                  className={cx(
                    'grid grid-cols-[minmax(0,1.5fr)_130px_minmax(0,1.6fr)_100px_130px] gap-4 px-5 py-2.5 border-b bg-slate-50/70 dark:bg-white/[0.02]',
                    hairline
                  )}
                >
                  <span className={eyebrow}>Müşteri</span>
                  <span className={eyebrow}>İletişim</span>
                  <span className={eyebrow}>İçerik</span>
                  <span className={cx(eyebrow, 'text-right')}>Toplam</span>
                  <span className={cx(eyebrow, 'text-right')}>Durum</span>
                </div>

                <div className={cx('divide-y', divider)}>
                  {orders.map((o) => {
                    const st = ORDER_STATUSES[o.status] || ORDER_STATUSES.pending;
                    return (
                      <div
                        key={o.id}
                        className="grid grid-cols-[minmax(0,1.5fr)_130px_minmax(0,1.6fr)_100px_130px] gap-4 px-5 py-3.5 items-center hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate">
                            {o.customerName || 'İsimsiz'}
                          </div>
                          {(o.studentClass || o.schoolNumber) && (
                            <div className="text-[11.5px] text-slate-500 dark:text-slate-400 truncate">
                              {o.studentClass ? `${o.studentClass}. Sınıf` : ''} {o.schoolNumber ? `· No: ${o.schoolNumber}` : ''}
                            </div>
                          )}
                        </div>

                        <div className="text-[12.5px] text-slate-600 dark:text-slate-300 tnum truncate">
                          {o.customerPhone || '—'}
                        </div>

                        <div className="text-[12px] text-slate-600 dark:text-slate-400 truncate">
                          {Array.isArray(o.items) && o.items.length > 0
                            ? o.items.map((it) => `${it.title} (${it.quantity}x)`).join(', ')
                            : 'Ürün detayı yok'}
                        </div>

                        <div className="text-right text-[13.5px] font-semibold text-slate-900 dark:text-white tnum">
                          {money(o.totalAmount)}
                        </div>

                        <div className="flex justify-end">
                          <Select
                            dense
                            value={o.status || 'pending'}
                            onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value)}
                            className="w-32 text-[12px]"
                          >
                            <option value="pending">Beklemede</option>
                            <option value="preparing">Hazırlanıyor</option>
                            <option value="delivered">Teslim Edildi</option>
                            <option value="cancelled">İptal Edildi</option>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Panel>
      )}

      {activeTab === 'hero' && (
        <form onSubmit={handleSaveHero}>
          <Panel>
            <PanelHeader
              title="Hero & Manşet Alanı"
              description="Anasayfa açılış başlığı, tanıtım sloganı ve üst duyuru bandı ayarları"
            >
              <Button type="submit" variant="primary" icon={isSavingHero ? RefreshCw : Save} disabled={isSavingHero}>
                {isSavingHero ? 'Kaydediliyor…' : 'Ayarları Kaydet'}
              </Button>
            </PanelHeader>

            <FieldRows>
              <Field label="Üst duyuru bandı" hint="Websitesinin en tepesinde kırmızı/sarı duyuru şeridi.">
                <div className="flex flex-col gap-3">
                  <Switch
                    id="topBannerActive"
                    checked={heroSettings.topBannerActive}
                    onChange={(e) => setHeroSettings({ ...heroSettings, topBannerActive: e.target.checked })}
                    label="Duyuru bandını aktif et"
                  />
                  <Input
                    type="text"
                    value={heroSettings.topBannerText}
                    onChange={(e) => setHeroSettings({ ...heroSettings, topBannerText: e.target.value })}
                    placeholder="Örn: 🔔 2026-2027 Erken Kayıt Avantajları Başladı!"
                  />
                </div>
              </Field>

              <Field label="Hero rozet metni" hint="Ana başlığın hemen üzerindeki etiket.">
                <Input
                  type="text"
                  value={heroSettings.badgeText}
                  onChange={(e) => setHeroSettings({ ...heroSettings, badgeText: e.target.value })}
                  placeholder="BOĞAZİÇİ KOLEJİ 2026-2027"
                />
              </Field>

              <Field label="Büyük ana slogan" hint="Anasayfanın H1 ana başlığı.">
                <Input
                  type="text"
                  value={heroSettings.title}
                  onChange={(e) => setHeroSettings({ ...heroSettings, title: e.target.value })}
                  placeholder="Daha iyi bir gelecek için Boğaziçi"
                />
              </Field>

              <Field label="Alt açıklama metni" hint="Sloganın altındaki 2-3 cümlelik kurumsal özet.">
                <Textarea
                  rows={3}
                  value={heroSettings.subtitle}
                  onChange={(e) => setHeroSettings({ ...heroSettings, subtitle: e.target.value })}
                />
              </Field>

              <Field label="Mağaza vitrin başlığı" hint="Anasayfadaki ürün vitrini bölümünün başlığı.">
                <Input
                  type="text"
                  value={heroSettings.shopShowcaseTitle}
                  onChange={(e) => setHeroSettings({ ...heroSettings, shopShowcaseTitle: e.target.value })}
                />
              </Field>

              <Field label="Hero arka plan görseli" hint="Önerilen boyut: 1920x1080 JPG.">
                <ImagePicker
                  url={heroSettings.heroImageUrl}
                  file={heroImageFile}
                  onSelect={setHeroImageFile}
                  onClear={() => {
                    setHeroImageFile(null);
                    setHeroSettings({ ...heroSettings, heroImageUrl: '' });
                  }}
                />
              </Field>
            </FieldRows>
          </Panel>
        </form>
      )}

      {activeTab === 'education' && (
        <form onSubmit={handleSaveEducation}>
          <Panel>
            <PanelHeader
              title="Eğitim Kademeleri"
              description="Anasayfadaki 4 kademe tanıtım kartının metinleri"
            >
              <Button type="submit" variant="primary" icon={isSavingEducation ? RefreshCw : Save} disabled={isSavingEducation}>
                {isSavingEducation ? 'Kaydediliyor…' : 'Kademeleri Kaydet'}
              </Button>
            </PanelHeader>

            <FieldRows>
              <Field label="1. Anaokulu & Okul Öncesi" hint="3-6 yaş keşif ve yabancı dil programı.">
                <Textarea
                  rows={2}
                  value={educationSettings.kindergarten}
                  onChange={(e) => setEducationSettings({ ...educationSettings, kindergarten: e.target.value })}
                />
              </Field>

              <Field label="2. İlkokul Kademesi" hint="Okuma kültürü ve sanatsal atölyeler.">
                <Textarea
                  rows={2}
                  value={educationSettings.primary}
                  onChange={(e) => setEducationSettings({ ...educationSettings, primary: e.target.value })}
                />
              </Field>

              <Field label="3. Ortaokul & LGS" hint="LGS soru kampları ve birebir etütler.">
                <Textarea
                  rows={2}
                  value={educationSettings.middle}
                  onChange={(e) => setEducationSettings({ ...educationSettings, middle: e.target.value })}
                />
              </Field>

              <Field label="4. Anadolu & Fen Lisesi (YKS)" hint="YKS merkezli üniversite hazırlık.">
                <Textarea
                  rows={2}
                  value={educationSettings.highschool}
                  onChange={(e) => setEducationSettings({ ...educationSettings, highschool: e.target.value })}
                />
              </Field>
            </FieldRows>
          </Panel>
        </form>
      )}

      {activeTab === 'stats' && (
        <form onSubmit={handleSaveStats}>
          <Panel>
            <PanelHeader
              title="Kurumsal İstatistikler"
              description="Websitesi anasayfasında dönen 4 temel başarı göstergesi"
            >
              <Button type="submit" variant="primary" icon={isSavingStats ? RefreshCw : Save} disabled={isSavingStats}>
                {isSavingStats ? 'Kaydediliyor…' : 'İstatistikleri Kaydet'}
              </Button>
            </PanelHeader>

            <FieldRows>
              <Field label="1. İstatistik (Örn: Tecrübe)">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <Input
                    type="number"
                    value={statsSettings.stat1_num}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat1_num: e.target.value })}
                    placeholder="20"
                    className="tnum"
                  />
                  <Input
                    type="text"
                    value={statsSettings.stat1_suffix}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat1_suffix: e.target.value })}
                    placeholder="+"
                  />
                  <Input
                    type="text"
                    value={statsSettings.stat1_label}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat1_label: e.target.value })}
                    placeholder="Yıllık Tecrübe"
                  />
                </div>
              </Field>

              <Field label="2. İstatistik (Örn: Başarı Oranı)">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <Input
                    type="number"
                    value={statsSettings.stat2_num}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat2_num: e.target.value })}
                    placeholder="98"
                    className="tnum"
                  />
                  <Input
                    type="text"
                    value={statsSettings.stat2_suffix}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat2_suffix: e.target.value })}
                    placeholder="%"
                  />
                  <Input
                    type="text"
                    value={statsSettings.stat2_label}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat2_label: e.target.value })}
                    placeholder="Üniversiteye Yerleşme"
                  />
                </div>
              </Field>

              <Field label="3. İstatistik (Örn: Mezun Sayısı)">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <Input
                    type="number"
                    value={statsSettings.stat3_num}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat3_num: e.target.value })}
                    placeholder="1500"
                    className="tnum"
                  />
                  <Input
                    type="text"
                    value={statsSettings.stat3_suffix}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat3_suffix: e.target.value })}
                    placeholder="+"
                  />
                  <Input
                    type="text"
                    value={statsSettings.stat3_label}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat3_label: e.target.value })}
                    placeholder="Mezun Öğrenci"
                  />
                </div>
              </Field>

              <Field label="4. İstatistik (Örn: Öğretmen)">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <Input
                    type="number"
                    value={statsSettings.stat4_num}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat4_num: e.target.value })}
                    placeholder="50"
                    className="tnum"
                  />
                  <Input
                    type="text"
                    value={statsSettings.stat4_suffix}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat4_suffix: e.target.value })}
                    placeholder="+"
                  />
                  <Input
                    type="text"
                    value={statsSettings.stat4_label}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat4_label: e.target.value })}
                    placeholder="Uzman Öğretmen"
                  />
                </div>
              </Field>
            </FieldRows>
          </Panel>
        </form>
      )}

      {activeTab === 'faq' && (
        <Panel>
          <PanelHeader
            title="Sıkça Sorulan Sorular"
            description="Websitesi anasayfasında yer alan akordiyon soru-cevap alanı"
          >
            <Button variant="primary" icon={Plus} onClick={() => setNewFaqModal(true)}>
              Yeni Soru Ekle
            </Button>
          </PanelHeader>

          {faqs.length === 0 ? (
            <EmptyState
              icon={HelpCircle}
              title="Henüz soru eklenmemiş"
              description="Velilerin en çok sorduğu soruları ekleyerek anasayfada listeleyebilirsiniz."
              action={
                <Button variant="primary" icon={Plus} onClick={() => setNewFaqModal(true)}>
                  İlk Soruyu Ekle
                </Button>
              }
            />
          ) : (
            <div className={cx('divide-y', divider)}>
              {faqs.map((faq, idx) => (
                <div key={idx} className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold text-slate-900 dark:text-white">
                      {faq.q}
                    </div>
                    <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-400">
                      {faq.a}
                    </p>
                  </div>
                  <IconButton
                    label="Soruyu sil"
                    icon={Trash2}
                    variant="quiet"
                    onClick={() => handleDeleteFaq(idx)}
                  />
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {activeTab === 'contact' && (
        <form onSubmit={handleSaveContact}>
          <Panel>
            <PanelHeader
              title="İletişim & Kampüs Bilgileri"
              description="Websitesinin üst ve alt çubuklarındaki iletişim kanalları"
            >
              <Button type="submit" variant="primary" icon={isSavingContact ? RefreshCw : Save} disabled={isSavingContact}>
                {isSavingContact ? 'Kaydediliyor…' : 'Bilgileri Kaydet'}
              </Button>
            </PanelHeader>

            <FieldRows>
              <Field label="Santral telefonu" hint="Gelen çağrılar için ana hat.">
                <Input
                  type="text"
                  value={contactSettings.phone}
                  onChange={(e) => setContactSettings({ ...contactSettings, phone: e.target.value })}
                  placeholder="0 (364) 666 05 00"
                />
              </Field>

              <Field label="WhatsApp destek hattı" hint="Ülke kodu ile birlikte (Örn: 905000000000).">
                <Input
                  type="text"
                  value={contactSettings.whatsapp}
                  onChange={(e) => setContactSettings({ ...contactSettings, whatsapp: e.target.value })}
                  placeholder="905000000000"
                />
              </Field>

              <Field label="Resmi e-posta adresi">
                <Input
                  type="email"
                  value={contactSettings.email}
                  onChange={(e) => setContactSettings({ ...contactSettings, email: e.target.value })}
                  placeholder="info@corumbogazici.com"
                />
              </Field>

              <Field label="Instagram sayfası" hint="Tam profil bağlantısı.">
                <Input
                  type="text"
                  value={contactSettings.instagram}
                  onChange={(e) => setContactSettings({ ...contactSettings, instagram: e.target.value })}
                  placeholder="https://instagram.com/..."
                />
              </Field>

              <Field label="YouTube kanalı">
                <Input
                  type="text"
                  value={contactSettings.youtube}
                  onChange={(e) => setContactSettings({ ...contactSettings, youtube: e.target.value })}
                  placeholder="https://youtube.com/@..."
                />
              </Field>

              <Field label="Çalışma saatleri">
                <Input
                  type="text"
                  value={contactSettings.workingHours}
                  onChange={(e) => setContactSettings({ ...contactSettings, workingHours: e.target.value })}
                  placeholder="Hafta İçi: 08:30 - 18:00 | Cumartesi: 09:00 - 14:00"
                />
              </Field>

              <Field label="Kampüs açık adresi">
                <Textarea
                  rows={2}
                  value={contactSettings.address}
                  onChange={(e) => setContactSettings({ ...contactSettings, address: e.target.value })}
                  placeholder="Boğaziçi Koleji Kampüsü..."
                />
              </Field>
            </FieldRows>
          </Panel>
        </form>
      )}

      <Modal
        open={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        title={editingProduct ? 'Ürünü Düzenle' : 'Yeni Ürün Ekle'}
        description={editingProduct ? editingProduct.title : 'Okul mağazasında listelenecek ürün detayları'}
        width="max-w-xl"
        footer={
          <>
            <Button type="button" onClick={() => setProductModalOpen(false)}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              form="product-form"
              variant="primary"
              disabled={isSavingProduct}
              icon={isSavingProduct ? RefreshCw : Check}
            >
              {isSavingProduct ? 'Kaydediliyor…' : editingProduct ? 'Değişiklikleri Kaydet' : 'Ürünü Ekle'}
            </Button>
          </>
        }
      >
        <form id="product-form" onSubmit={handleSaveProduct}>
          <FieldRows>
            <Field label="Ürün başlığı" htmlFor="prod-title">
              <Input
                id="prod-title"
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Örn: 2026 Kolej Polo Yaka Tişört"
              />
            </Field>

            <Field label="Fiyatlar (₺)">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11.5px] text-slate-500 mb-1">Satış Fiyatı *</label>
                  <Input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="450"
                    className="tnum"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] text-slate-500 mb-1">Eski Fiyat (Opsiyonel)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.originalPrice}
                    onChange={(e) => setFormData({ ...formData, originalPrice: e.target.value })}
                    placeholder="600"
                    className="tnum"
                  />
                </div>
              </div>
            </Field>

            <Field label="Kategori ve stok">
              <div className="grid grid-cols-2 gap-2.5">
                <Select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
                  {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
                <Select value={formData.stockStatus} onChange={(e) => setFormData({ ...formData, stockStatus: e.target.value })}>
                  {Object.entries(STOCK_STATUSES).map(([id, st]) => (
                    <option key={id} value={id}>
                      {st.label}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>

            <Field label="Beden / Çeşitler" hint="Virgülle ayırarak girin.">
              <Input
                type="text"
                value={formData.sizes}
                onChange={(e) => setFormData({ ...formData, sizes: e.target.value })}
                placeholder="XS, S, M, L, XL veya 1. Sınıf Seti"
              />
            </Field>

            <Field label="Rozet metni">
              <Input
                type="text"
                value={formData.badge}
                onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                placeholder="Yeni Sezon, %20 İndirim vb."
              />
            </Field>

            <Field label="Açıklama">
              <Textarea
                rows={2}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="%100 pamuklu nefes alabilen kumaş..."
              />
            </Field>

            <Field label="Ürün görseli">
              <ImagePicker
                url={formData.imageUrl}
                file={selectedImageFile}
                onSelect={setSelectedImageFile}
                onClear={() => {
                  setSelectedImageFile(null);
                  setFormData({ ...formData, imageUrl: '' });
                }}
              />
            </Field>

            <Field label="Vitrin durumu">
              <Switch
                id="prod-isFeatured"
                checked={formData.isFeatured}
                onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                label="Anasayfa vitrininde öne çıkar"
                description="Seçilen ürünler web sitesinin anasayfasında vitrin bölümünde gösterilir."
              />
            </Field>
          </FieldRows>
        </form>
      </Modal>

      <Modal
        open={newFaqModal}
        onClose={() => setNewFaqModal(false)}
        title="Yeni Soru & Cevap Ekle"
        width="max-w-lg"
        footer={
          <>
            <Button type="button" onClick={() => setNewFaqModal(false)}>
              Vazgeç
            </Button>
            <Button type="submit" form="faq-form" variant="primary">
              Kaydet
            </Button>
          </>
        }
      >
        <form id="faq-form" onSubmit={handleAddFaq}>
          <FieldRows>
            <Field label="Soru" htmlFor="faq-q">
              <Input
                id="faq-q"
                type="text"
                required
                value={faqForm.q}
                onChange={(e) => setFaqForm({ ...faqForm, q: e.target.value })}
                placeholder="Örn: Servis güzergahları nasıl belirlenir?"
              />
            </Field>

            <Field label="Cevap" htmlFor="faq-a">
              <Textarea
                id="faq-a"
                rows={4}
                required
                value={faqForm.a}
                onChange={(e) => setFaqForm({ ...faqForm, a: e.target.value })}
                placeholder="Açıklayıcı yanıt..."
              />
            </Field>
          </FieldRows>
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteConfirmId)}
        onClose={() => setDeleteConfirmId(null)}
        title="Ürünü Sil"
        width="max-w-md"
        footer={
          <>
            <Button type="button" onClick={() => setDeleteConfirmId(null)}>
              Vazgeç
            </Button>
            <Button type="button" variant="danger" onClick={() => handleDeleteProduct(deleteConfirmId)}>
              Sil
            </Button>
          </>
        }
      >
        <div className="px-5 py-5">
          <p className="m-0 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
            Bu ürün mağazadan ve web sitesinden kalıcı olarak silinecek. Bu işlem geri alınamaz.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default WebManagementAdminView;
