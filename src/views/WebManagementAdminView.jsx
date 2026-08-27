import React, { useState, useEffect } from 'react';
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
  Image as ImageIcon, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  Star, 
  AlertCircle, 
  UploadCloud, 
  Save, 
  RefreshCw, 
  Eye, 
  Tag, 
  Layers, 
  CheckCircle2, 
  Phone, 
  Mail, 
  MapPin, 
  MessageCircle, 
  ExternalLink,
  Search,
  SlidersHorizontal,
  X,
  Sparkles,
  Shirt,
  BookOpen,
  Package,
  HelpCircle,
  BarChart3,
  GraduationCap,
  Award,
  Clock,
  Send,
  Sliders,
  ChevronRight,
  TrendingUp,
  Inbox
} from 'lucide-react';

const InstagramIcon = ({ size = 16, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
  </svg>
);

const YoutubeIcon = ({ size = 16, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/>
    <polygon points="10 15 15 12 10 9 10 15" fill="currentColor"/>
  </svg>
);

const CATEGORIES = [
  { id: 'all', label: 'Tüm Ürünler' },
  { id: 'uniform', label: 'Okul Kıyafetleri' },
  { id: 'books', label: 'Yayın & Kitap Setleri' },
  { id: 'stationery', label: 'Kırtasiye & Malzeme' },
  { id: 'accessory', label: 'Kolej Aksesuar' },
  { id: 'other', label: 'Diğer Materyaller' }
];

const STOCK_STATUSES = [
  { id: 'in_stock', label: 'Stokta Var', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  { id: 'low_stock', label: 'Kritik Stok', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { id: 'out_of_stock', label: 'Tükendi', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
  { id: 'pre_order', label: 'Ön Sipariş', color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' }
];

const WebManagementAdminView = () => {
  const [activeTab, setActiveTab] = useState('products'); // 'products' | 'hero' | 'education' | 'stats' | 'faq' | 'contact' | 'orders'
  
  // Toast & Saving Feedback
  const [saveStatus, setSaveStatus] = useState({ show: false, message: '', type: 'success' });
  const triggerToast = (msg, type = 'success') => {
    setSaveStatus({ show: true, message: msg, type });
    setTimeout(() => setSaveStatus({ show: false, message: '', type: 'success' }), 4000);
  };

  // 1. Ürünler State
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [productFormError, setProductFormError] = useState('');
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

  // 2. Siparişler State
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // 3. Hero & Slider Settings State
  const [heroSettings, setHeroSettings] = useState({
    topBannerActive: true,
    topBannerText: '🔔 2026-2027 Eğitim Öğretim Yılı Erken Kayıt Avantajları Başladı! Kontenjanlar Sınırlıdır.',
    badgeText: 'BOĞAZİÇİ KOLEJİ 2026-2027',
    title: 'Daha iyi bir gelecek için Boğaziçi',
    subtitle: 'Deneyimli kadromuz, modern teknoloji odaklı eğitim anlayışımız ve bireysel takip sistemimizle öğrencilerimizi hayata ve üniversiteye hazırlıyoruz.',
    heroImageUrl: '',
    shopShowcaseTitle: 'Okul Kıyafetleri & Yayın Setleri',
    shopShowcaseDesc: 'Kayıtlı öğrencilerimize özel indirimli fiyatlarla resmi okul ürünleri.',
    ctaTitle: 'Geleceğinizi Güvenle İnşa Edin',
    ctaDesc: 'Sınırlı kontenjan avantajlarından yararlanmak için ön kayıt formunu doldurun.'
  });
  const [isSavingHero, setIsSavingHero] = useState(false);
  const [heroImageFile, setHeroImageFile] = useState(null);

  // 4. İstatistikler State (Stats)
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

  // 5. Eğitim Kademeleri State
  const [educationSettings, setEducationSettings] = useState({
    kindergarten: 'Erken yaşta yabancı dil, robotik kodlama ve keşif odaklı montessori destekli okul öncesi programı.',
    primary: 'Temel akademik beceriler, okuma kültürü ve sanatsal atölyelerle donatılmış zenginleştirilmiş ilkokul eğitimi.',
    middle: 'LGS odaklı soru çözüm kampları, birebir etütler ve koçluk sistemi ile Türkiye derecesi hedefleyen ortaokul.',
    highschool: 'YKS hazırlık merkezli, üniversite hedeflerine özel Sayısal ve Eşit Ağırlık zümreleri ile Anadolu & Fen Lisesi.'
  });
  const [isSavingEducation, setIsSavingEducation] = useState(false);

  // 6. FAQ State
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

  // 7. İletişim & Okul Bilgileri State
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

  // Cloudinary Upload
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
      return json.secure_url;
    } catch (err) {
      console.error('Görsel yükleme hatası:', err);
      return null;
    }
  };

  // Dinleyiciler: Ürünler, Siparişler ve Web Ayarları
  useEffect(() => {
    // 1. Ürünler
    const unsubProducts = onSnapshot(collection(db, 'store_products'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
      setProducts(list);
      setLoadingProducts(false);
    }, (e) => {
      console.warn("store_products dinleme hatası:", e);
      setLoadingProducts(false);
    });

    // 2. Siparişler
    const unsubOrders = onSnapshot(collection(db, 'store_orders'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
      setOrders(list);
      setLoadingOrders(false);
    }, (e) => {
      console.warn("store_orders dinleme hatası:", e);
      setLoadingOrders(false);
    });

    // 3. Genel Ayarlar (web_settings dokümanları)
    const loadAllSettings = async () => {
      try {
        const heroDoc = await getDoc(doc(db, 'web_settings', 'hero'));
        if (heroDoc.exists()) setHeroSettings(prev => ({ ...prev, ...heroDoc.data() }));

        const statsDoc = await getDoc(doc(db, 'web_settings', 'stats'));
        if (statsDoc.exists()) setStatsSettings(prev => ({ ...prev, ...statsDoc.data() }));

        const eduDoc = await getDoc(doc(db, 'web_settings', 'education'));
        if (eduDoc.exists()) setEducationSettings(prev => ({ ...prev, ...eduDoc.data() }));

        const faqDoc = await getDoc(doc(db, 'web_settings', 'faq'));
        if (faqDoc.exists() && faqDoc.data().items) setFaqs(faqDoc.data().items);

        const contactDoc = await getDoc(doc(db, 'web_settings', 'contact'));
        if (contactDoc.exists()) setContactSettings(prev => ({ ...prev, ...contactDoc.data() }));
      } catch (err) {
        console.warn("web_settings okuma uyarısı:", err);
      }
    };
    loadAllSettings();

    return () => {
      unsubProducts();
      unsubOrders();
    };
  }, []);

  // --- ÜRÜN İŞLEMLERİ ---
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
    setProductFormError('');
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.price) {
      setProductFormError('Lütfen ürün başlığı ve fiyat alanlarını doldurun.');
      return;
    }

    setIsSavingProduct(true);
    setProductFormError('');

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
        triggerToast('Ürün başarıyla güncellendi!');
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, 'store_products'), payload);
        triggerToast('Yeni ürün mağazaya eklendi!');
      }

      setProductModalOpen(false);
      setEditingProduct(null);
    } catch (err) {
      console.error('Ürün kaydetme hatası:', err);
      setProductFormError('Kayıt esnasında bir hata oluştu: ' + err.message);
    }
    setIsSavingProduct(false);
  };

  const handleDeleteProduct = async (id) => {
    try {
      await deleteDoc(doc(db, 'store_products', id));
      setDeleteConfirmId(null);
      triggerToast('Ürün mağazadan kaldırıldı.');
    } catch (err) {
      console.error('Ürün silinemedi:', err);
    }
  };

  const toggleFeatured = async (product) => {
    try {
      await updateDoc(doc(db, 'store_products', product.id), {
        isFeatured: !product.isFeatured
      });
      triggerToast(product.isFeatured ? 'Ürün vitrinden çıkarıldı.' : 'Ürün anasayfa vitrinine eklendi!');
    } catch (err) {
      console.error('Vitrin durumu güncellenemedi:', err);
    }
  };

  // --- AYARLAR KAYDETME FONKSİYONLARI ---
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
      triggerToast('Hero ve banner ayarları canlıya kaydedildi!');
    } catch (err) {
      console.error('Hero kaydetme hatası:', err);
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
      triggerToast('Okul istatistikleri başarıyla güncellendi!');
    } catch (err) {
      console.error('Stats kaydetme hatası:', err);
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
      triggerToast('Eğitim kademeleri açıklamaları güncellendi!');
    } catch (err) {
      console.error('Education kaydetme hatası:', err);
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
      triggerToast('Sıkça Sorulan Sorular güncellendi!');
    } catch (err) {
      console.error('FAQ kaydetme hatası:', err);
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
      triggerToast('İletişim ve okul bilgileri canlıya kaydedildi!');
    } catch (err) {
      console.error('İletişim kaydetme hatası:', err);
    }
    setIsSavingContact(false);
  };

  // Sipariş Durumu Değiştir
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      await updateDoc(doc(db, 'store_orders', orderId), { status: newStatus });
      triggerToast('Sipariş durumu güncellendi.');
    } catch (e) {
      console.error("Sipariş güncellenemedi:", e);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesCat = selectedCategoryFilter === 'all' || p.category === selectedCategoryFilter;
    const matchesSearch = !searchQuery.trim() || 
      p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="w-full min-h-full flex-1 flex flex-col font-sans p-4 md:p-6 lg:p-8 bg-[#0b1120] text-slate-100 box-border">
      
      {/* CANLI TOAST BİLDİRİMİ */}
      {saveStatus.show && (
        <div className="fixed top-6 right-6 z-[9999] flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-emerald-500/90 text-white font-bold text-[13.5px] shadow-2xl backdrop-blur-md border border-emerald-400/40 animate-in slide-in-from-top-4 duration-300">
          <CheckCircle2 size={18} className="text-white" />
          <span>{saveStatus.message}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. ÜST HEADER & BAŞLIK BÖLÜMÜ                                            */}
      {/* ========================================================================= */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 border border-blue-400/30">
              <Globe size={22} />
            </div>
            <div>
              <h1 className="text-[22px] md:text-[26px] font-black text-white tracking-tight flex items-center gap-2.5">
                Okul Web & Mağaza Yönetim Merkezi
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Canlı Senkronize
                </span>
              </h1>
            </div>
          </div>
          <p className="text-[13.5px] text-slate-400 font-medium">
            <span className="text-slate-300 font-bold">bgz-mobil.web.app</span> üzerindeki tüm mağaza ürünlerini, bannerları, eğitim metinlerini, istatistikleri ve okul iletişim bilgilerini anında yönetin.
          </p>
        </div>

        {/* Canlı Siteyi Aç Butonu */}
        <a 
          href="https://bgz-mobil.web.app" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 hover:from-blue-600/30 hover:to-indigo-600/30 text-blue-300 hover:text-white text-[13px] font-bold rounded-xl border border-blue-500/30 transition-all shadow-md shrink-0 cursor-pointer"
        >
          <ExternalLink size={16} />
          <span>Canlı Web Sitesini Aç</span>
        </a>
      </div>

      {/* ========================================================================= */}
      {/* 2. ANA SEKMELER (TABS)                                                   */}
      {/* ========================================================================= */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 shrink-0 no-scrollbar">
        {[
          { id: 'products', label: 'Mağaza & Ürünler', icon: ShoppingBag, count: products.length },
          { id: 'orders', label: 'Siparişler', icon: Inbox, count: orders.length },
          { id: 'hero', label: 'Hero & Bannerlar', icon: ImageIcon },
          { id: 'education', label: 'Eğitim Kademeleri', icon: GraduationCap },
          { id: 'stats', label: 'İstatistikler', icon: BarChart3 },
          { id: 'faq', label: 'Sıkça Sorulanlar (SSS)', icon: HelpCircle, count: faqs.length },
          { id: 'contact', label: 'İletişim & Sosyal Medya', icon: Phone }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[13px] transition-all cursor-pointer shrink-0 border ${
                isActive
                  ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/30'
                  : 'bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800 border-slate-800'
              }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 3. SEKME İÇERİKLERİ                                                      */}
      {/* ========================================================================= */}
      
      {/* ------------------------------------------------------------------------- */}
      {/* SEKME 1: MAĞAZA ÜRÜNLERİ                                                  */}
      {/* ------------------------------------------------------------------------- */}
      {activeTab === 'products' && (
        <div className="flex flex-col gap-6">
          {/* Kontrol Barı */}
          <div className="bg-slate-900/90 rounded-2xl p-4 border border-slate-800 shadow-xl flex flex-col lg:flex-row items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto flex-1">
              <div className="relative w-full sm:w-80">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Ürün adı, beden veya açıklama ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700/80 rounded-xl text-[13.5px] text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="w-full sm:w-auto px-4 py-2.5 bg-slate-800/80 border border-slate-700/80 rounded-xl text-[13.5px] text-slate-200 font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {CATEGORIES.map(c => (
                  <option key={c.id} value={c.id} className="bg-slate-900 text-white">{c.label}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => openProductModal()}
              className="w-full lg:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-[13.5px] shadow-lg shadow-blue-600/30 transition-all cursor-pointer shrink-0"
            >
              <Plus size={18} />
              <span>Yeni Ürün Ekle</span>
            </button>
          </div>

          {/* Ürün Listesi Grid */}
          {loadingProducts ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {[1, 2, 3, 4].map(n => (
                <div key={n} className="bg-slate-900/60 rounded-2xl border border-slate-800 h-80 animate-pulse" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-slate-900/60 rounded-3xl p-14 text-center border border-dashed border-slate-800 flex flex-col items-center justify-center">
              <ShoppingBag size={52} className="text-slate-600 mb-4" />
              <h3 className="text-[18px] font-bold text-white mb-1">Henüz Mağazada Ürün Bulunmuyor</h3>
              <p className="text-[13.5px] text-slate-400 max-w-md mb-6 font-medium">
                Ekleyeceğiniz tüm okul kıyafetleri, soru bankası setleri ve kolej aksesuarları doğrudan web sitesinde canlı listelenecektir.
              </p>
              <button
                onClick={() => openProductModal()}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-[13.5px] transition-all cursor-pointer shadow-lg shadow-blue-600/30"
              >
                <Plus size={16} /> İlk Ürünü Ekle
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredProducts.map(product => {
                const stockInfo = STOCK_STATUSES.find(s => s.id === product.stockStatus) || STOCK_STATUSES[0];
                return (
                  <div 
                    key={product.id}
                    className="bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden shadow-xl hover:border-slate-700 transition-all flex flex-col group relative"
                  >
                    {/* Görsel Alanı */}
                    <div className="relative h-48 bg-slate-950 overflow-hidden flex items-center justify-center">
                      {product.imageUrl ? (
                        <img 
                          src={product.imageUrl} 
                          alt={product.title} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <Package size={44} className="text-slate-700" />
                      )}

                      {/* Rozet */}
                      {product.badge && (
                        <span className="absolute top-3 left-3 px-2.5 py-1 bg-red-600 text-white text-[11px] font-extrabold rounded-lg shadow-md">
                          {product.badge}
                        </span>
                      )}

                      {/* Vitrin / Featured Butonu */}
                      <button
                        onClick={() => toggleFeatured(product)}
                        title={product.isFeatured ? "Anasayfa Vitrininde Gösteriliyor" : "Vitrinde Göster"}
                        className={`absolute top-3 right-3 p-2 rounded-xl backdrop-blur-md transition-all cursor-pointer ${
                          product.isFeatured 
                            ? 'bg-amber-500/90 text-white shadow-lg' 
                            : 'bg-black/50 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Star size={15} fill={product.isFeatured ? "currentColor" : "none"} />
                      </button>
                    </div>

                    {/* İçerik */}
                    <div className="p-4 flex flex-col flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[11px] font-extrabold text-blue-400 uppercase tracking-wide">
                          {CATEGORIES.find(c => c.id === product.category)?.label || 'Genel'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${stockInfo.color}`}>
                          {stockInfo.label}
                        </span>
                      </div>

                      <h3 className="text-[15px] font-bold text-white line-clamp-1 mb-1" title={product.title}>
                        {product.title}
                      </h3>

                      {product.description && (
                        <p className="text-[12.5px] text-slate-400 line-clamp-2 mb-3 font-medium">
                          {product.description}
                        </p>
                      )}

                      {product.sizes && (
                        <div className="text-[11.5px] text-slate-400 font-medium mb-3">
                          Beden/Seçenek: <span className="text-slate-200 font-bold">{product.sizes}</span>
                        </div>
                      )}

                      {/* Fiyat & İşlemler */}
                      <div className="mt-auto pt-3 border-t border-slate-800/80 flex items-center justify-between">
                        <div>
                          <div className="text-[16px] font-black text-white">
                            ₺{product.price?.toLocaleString('tr-TR')}
                          </div>
                          {product.originalPrice && product.originalPrice > product.price && (
                            <div className="text-[11.5px] text-slate-500 line-through font-medium">
                              ₺{product.originalPrice?.toLocaleString('tr-TR')}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openProductModal(product)}
                            className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-colors cursor-pointer"
                            title="Düzenle"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(product.id)}
                            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
                            title="Sil"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------------- */}
      {/* SEKME 2: SİPARİŞLER                                                       */}
      {/* ------------------------------------------------------------------------- */}
      {activeTab === 'orders' && (
        <div className="flex flex-col gap-6">
          <div className="bg-slate-900/90 rounded-2xl p-5 border border-slate-800 shadow-xl flex items-center justify-between">
            <div>
              <h2 className="text-[17px] font-bold text-white mb-0.5">Gelen Mağaza Siparişleri</h2>
              <p className="text-[13px] text-slate-400">Web mağazasından veli ve öğrencilerin verdiği sipariş kayıtları.</p>
            </div>
            <span className="px-3 py-1 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[12px] font-bold">
              {orders.length} Toplam Sipariş
            </span>
          </div>

          {loadingOrders ? (
            <div className="h-64 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse" />
          ) : orders.length === 0 ? (
            <div className="bg-slate-900/60 rounded-3xl p-14 text-center border border-dashed border-slate-800">
              <Inbox size={48} className="text-slate-600 mx-auto mb-3" />
              <h3 className="text-[17px] font-bold text-white mb-1">Henüz Sipariş Bulunmuyor</h3>
              <p className="text-[13px] text-slate-400">Web sitesinden sipariş verildiğinde anlık olarak burada listelenecektir.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {orders.map(order => (
                <div key={order.id} className="bg-slate-900/90 rounded-2xl p-5 border border-slate-800 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-3">
                      <h4 className="text-[16px] font-bold text-white">{order.customerName}</h4>
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                        order.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                        order.status === 'preparing' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                        'bg-blue-500/10 text-blue-400 border-blue-500/30'
                      }`}>
                        {order.status === 'delivered' ? 'Teslim Edildi' : order.status === 'preparing' ? 'Hazırlanıyor' : 'Beklemede'}
                      </span>
                    </div>
                    <div className="text-[12.5px] text-slate-400 flex items-center gap-4 flex-wrap">
                      <span>Tel: <strong className="text-slate-200">{order.customerPhone || '-'}</strong></span>
                      {order.schoolNumber && <span>Okul No: <strong className="text-slate-200">{order.schoolNumber}</strong></span>}
                      {order.studentClass && <span>Sınıf: <strong className="text-slate-200">{order.studentClass}</strong></span>}
                    </div>
                    {order.items && (
                      <div className="mt-2 text-[12px] text-slate-400 bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                        {order.items.map((it, idx) => (
                          <span key={idx} className="mr-3 text-slate-300">
                            • {it.title} ({it.quantity}x {it.size ? `Beden: ${it.size}` : ''})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 shrink-0 justify-between lg:justify-end border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-800">
                    <div className="text-right">
                      <div className="text-[12px] text-slate-400 font-medium">Toplam</div>
                      <div className="text-[18px] font-black text-white">₺{order.totalAmount?.toLocaleString('tr-TR')}</div>
                    </div>

                    <select
                      value={order.status || 'pending'}
                      onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value)}
                      className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-[12.5px] text-white font-bold cursor-pointer focus:outline-none focus:border-blue-500"
                    >
                      <option value="pending">Beklemede</option>
                      <option value="preparing">Hazırlanıyor</option>
                      <option value="delivered">Teslim Edildi</option>
                      <option value="cancelled">İptal Edildi</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------------- */}
      {/* SEKME 3: HERO & BANNERLAR                                                 */}
      {/* ------------------------------------------------------------------------- */}
      {activeTab === 'hero' && (
        <form onSubmit={handleSaveHero} className="flex flex-col gap-6 max-w-4xl">
          <div className="bg-slate-900/90 rounded-3xl p-6 md:p-8 border border-slate-800 shadow-2xl flex flex-col gap-6">
            
            <div className="border-b border-slate-800 pb-4">
              <h2 className="text-[18px] font-bold text-white mb-1">Websitesi Hero & Başlık Alanı</h2>
              <p className="text-[13px] text-slate-400">Anasayfanın ilk açılışındaki manşet başlığı, sloganı ve üst duyuru bandı.</p>
            </div>

            {/* Üst Acil / Tanıtım Bandı */}
            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-[13px] font-bold text-white flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-400" />
                  Websitesi En Üst Duyuru / Kayıt Bandı
                </label>
                <label className="flex items-center gap-2 text-[12.5px] font-bold text-slate-300 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={heroSettings.topBannerActive}
                    onChange={(e) => setHeroSettings({ ...heroSettings, topBannerActive: e.target.checked })}
                    className="rounded bg-slate-800 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
                  />
                  <span>Bandı Göster</span>
                </label>
              </div>
              <input
                type="text"
                value={heroSettings.topBannerText}
                onChange={(e) => setHeroSettings({ ...heroSettings, topBannerText: e.target.value })}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700/80 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
                placeholder="Örn: 🔔 2026-2027 Eğitim Öğretim Yılı Erken Kayıt Avantajları Başladı!"
              />
            </div>

            {/* Hero Rozet & Başlık */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Hero Üst Rozeti</label>
                <input
                  type="text"
                  value={heroSettings.badgeText}
                  onChange={(e) => setHeroSettings({ ...heroSettings, badgeText: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Mağaza Vitrini Başlığı</label>
                <input
                  type="text"
                  value={heroSettings.shopShowcaseTitle}
                  onChange={(e) => setHeroSettings({ ...heroSettings, shopShowcaseTitle: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Büyük Slogan */}
            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Büyük Ana Slogan (Hero Title)</label>
              <input
                type="text"
                value={heroSettings.title}
                onChange={(e) => setHeroSettings({ ...heroSettings, title: e.target.value })}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Açıklama */}
            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Hero Alt Açıklama</label>
              <textarea
                rows={3}
                value={heroSettings.subtitle}
                onChange={(e) => setHeroSettings({ ...heroSettings, subtitle: e.target.value })}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Hero Arka Plan Görseli */}
            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">Hero Kapak Görseli</label>
              <div className="flex items-center gap-4">
                {heroSettings.heroImageUrl && (
                  <img 
                    src={heroSettings.heroImageUrl} 
                    alt="Hero Önizleme" 
                    className="w-24 h-16 object-cover rounded-xl border border-slate-700"
                  />
                )}
                <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-950 border border-dashed border-slate-700 rounded-xl text-[13px] font-bold text-slate-300 hover:bg-slate-800 transition-all cursor-pointer">
                  <UploadCloud size={18} className="text-blue-400" />
                  <span>{heroImageFile ? heroImageFile.name : 'Yeni Hero Görseli Seç (Cloudinary)'}</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={(e) => setHeroImageFile(e.target.files[0])}
                    className="hidden" 
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button
                type="submit"
                disabled={isSavingHero}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-[13.5px] shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
              >
                {isSavingHero ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                <span>{isSavingHero ? 'Kaydediliyor...' : 'Hero Ayarlarını Kaydet'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ------------------------------------------------------------------------- */}
      {/* SEKME 4: EĞİTİM KADEMELERİ                                               */}
      {/* ------------------------------------------------------------------------- */}
      {activeTab === 'education' && (
        <form onSubmit={handleSaveEducation} className="flex flex-col gap-6 max-w-4xl">
          <div className="bg-slate-900/90 rounded-3xl p-6 md:p-8 border border-slate-800 shadow-2xl flex flex-col gap-6">
            <div className="border-b border-slate-800 pb-4">
              <h2 className="text-[18px] font-bold text-white mb-1">Eğitim Kademeleri Tanıtım Metinleri</h2>
              <p className="text-[13px] text-slate-400">Anasayfadaki Anaokulu, İlkokul, Ortaokul ve Lise kartlarının içerikleri.</p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-bold text-blue-400 uppercase">1. Anaokulu & Okul Öncesi</label>
              <textarea
                rows={2}
                value={educationSettings.kindergarten}
                onChange={(e) => setEducationSettings({ ...educationSettings, kindergarten: e.target.value })}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-bold text-emerald-400 uppercase">2. İlkokul Kademesi</label>
              <textarea
                rows={2}
                value={educationSettings.primary}
                onChange={(e) => setEducationSettings({ ...educationSettings, primary: e.target.value })}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-bold text-amber-400 uppercase">3. Ortaokul & LGS Hazırlık</label>
              <textarea
                rows={2}
                value={educationSettings.middle}
                onChange={(e) => setEducationSettings({ ...educationSettings, middle: e.target.value })}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-bold text-rose-400 uppercase">4. Anadolu & Fen Lisesi (YKS)</label>
              <textarea
                rows={2}
                value={educationSettings.highschool}
                onChange={(e) => setEducationSettings({ ...educationSettings, highschool: e.target.value })}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button
                type="submit"
                disabled={isSavingEducation}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-[13.5px] shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
              >
                {isSavingEducation ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                <span>{isSavingEducation ? 'Kaydediliyor...' : 'Kademeleri Kaydet'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ------------------------------------------------------------------------- */}
      {/* SEKME 5: İSTATİSTİKLER (STATS)                                           */}
      {/* ------------------------------------------------------------------------- */}
      {activeTab === 'stats' && (
        <form onSubmit={handleSaveStats} className="flex flex-col gap-6 max-w-4xl">
          <div className="bg-slate-900/90 rounded-3xl p-6 md:p-8 border border-slate-800 shadow-2xl flex flex-col gap-6">
            <div className="border-b border-slate-800 pb-4">
              <h2 className="text-[18px] font-bold text-white mb-1">Websitesi Başarı İstatistikleri</h2>
              <p className="text-[13px] text-slate-400">Anasayfada sayaç şeklinde animasyonla dönen 4 temel kurum istatistiği.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col gap-3">
                <span className="text-[12px] font-bold text-blue-400 uppercase">1. İstatistik</span>
                <div className="grid grid-cols-3 gap-2">
                  <input 
                    type="number" 
                    value={statsSettings.stat1_num}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat1_num: e.target.value })}
                    className="col-span-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold text-[14px]"
                  />
                  <input 
                    type="text" 
                    value={statsSettings.stat1_suffix}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat1_suffix: e.target.value })}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold text-[14px] text-center"
                    placeholder="+"
                  />
                </div>
                <input 
                  type="text" 
                  value={statsSettings.stat1_label}
                  onChange={(e) => setStatsSettings({ ...statsSettings, stat1_label: e.target.value })}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-300 font-medium text-[13px]"
                  placeholder="Etiket"
                />
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col gap-3">
                <span className="text-[12px] font-bold text-emerald-400 uppercase">2. İstatistik</span>
                <div className="grid grid-cols-3 gap-2">
                  <input 
                    type="number" 
                    value={statsSettings.stat2_num}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat2_num: e.target.value })}
                    className="col-span-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold text-[14px]"
                  />
                  <input 
                    type="text" 
                    value={statsSettings.stat2_suffix}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat2_suffix: e.target.value })}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold text-[14px] text-center"
                    placeholder="%"
                  />
                </div>
                <input 
                  type="text" 
                  value={statsSettings.stat2_label}
                  onChange={(e) => setStatsSettings({ ...statsSettings, stat2_label: e.target.value })}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-300 font-medium text-[13px]"
                  placeholder="Etiket"
                />
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col gap-3">
                <span className="text-[12px] font-bold text-amber-400 uppercase">3. İstatistik</span>
                <div className="grid grid-cols-3 gap-2">
                  <input 
                    type="number" 
                    value={statsSettings.stat3_num}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat3_num: e.target.value })}
                    className="col-span-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold text-[14px]"
                  />
                  <input 
                    type="text" 
                    value={statsSettings.stat3_suffix}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat3_suffix: e.target.value })}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold text-[14px] text-center"
                    placeholder="+"
                  />
                </div>
                <input 
                  type="text" 
                  value={statsSettings.stat3_label}
                  onChange={(e) => setStatsSettings({ ...statsSettings, stat3_label: e.target.value })}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-300 font-medium text-[13px]"
                  placeholder="Etiket"
                />
              </div>

              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col gap-3">
                <span className="text-[12px] font-bold text-rose-400 uppercase">4. İstatistik</span>
                <div className="grid grid-cols-3 gap-2">
                  <input 
                    type="number" 
                    value={statsSettings.stat4_num}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat4_num: e.target.value })}
                    className="col-span-2 px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold text-[14px]"
                  />
                  <input 
                    type="text" 
                    value={statsSettings.stat4_suffix}
                    onChange={(e) => setStatsSettings({ ...statsSettings, stat4_suffix: e.target.value })}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-bold text-[14px] text-center"
                    placeholder="+"
                  />
                </div>
                <input 
                  type="text" 
                  value={statsSettings.stat4_label}
                  onChange={(e) => setStatsSettings({ ...statsSettings, stat4_label: e.target.value })}
                  className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-300 font-medium text-[13px]"
                  placeholder="Etiket"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button
                type="submit"
                disabled={isSavingStats}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-[13.5px] shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
              >
                {isSavingStats ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                <span>{isSavingStats ? 'Kaydediliyor...' : 'İstatistikleri Kaydet'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ------------------------------------------------------------------------- */}
      {/* SEKME 6: SIKÇA SORULAN SORULAR (FAQ)                                      */}
      {/* ------------------------------------------------------------------------- */}
      {activeTab === 'faq' && (
        <div className="flex flex-col gap-6 max-w-4xl">
          <div className="bg-slate-900/90 rounded-2xl p-5 border border-slate-800 shadow-xl flex items-center justify-between">
            <div>
              <h2 className="text-[17px] font-bold text-white mb-0.5">Sıkça Sorulan Sorular (SSS)</h2>
              <p className="text-[13px] text-slate-400">Web sitesi anasayfasında yer alan akordiyon soru-cevap alanı.</p>
            </div>
            <button
              onClick={() => setNewFaqModal(true)}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-[13px] shadow-md shadow-blue-600/30 cursor-pointer"
            >
              <Plus size={16} />
              <span>Yeni Soru Ekle</span>
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {faqs.map((faq, idx) => (
              <div key={idx} className="bg-slate-900/90 rounded-2xl p-5 border border-slate-800 shadow-xl flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <HelpCircle size={17} className="text-blue-400 shrink-0" />
                    <h4 className="text-[15px] font-bold text-white">{faq.q}</h4>
                  </div>
                  <p className="text-[13px] text-slate-400 font-medium pl-6 leading-relaxed">{faq.a}</p>
                </div>
                <button
                  onClick={() => handleDeleteFaq(idx)}
                  className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer shrink-0"
                  title="Soruyu Sil"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------------- */}
      {/* SEKME 7: İLETİŞİM & OKUL BİLGİLERİ                                        */}
      {/* ------------------------------------------------------------------------- */}
      {activeTab === 'contact' && (
        <form onSubmit={handleSaveContact} className="flex flex-col gap-6 max-w-4xl">
          <div className="bg-slate-900/90 rounded-3xl p-6 md:p-8 border border-slate-800 shadow-2xl flex flex-col gap-6">
            
            <div className="border-b border-slate-800 pb-4">
              <h2 className="text-[18px] font-bold text-white mb-1">
                Okul İletişim, Sosyal Medya & Kampüs Bilgileri
              </h2>
              <p className="text-[13px] text-slate-400">
                Websitesinin üst çubuğu (Header), alt çubuğu (Footer) ve İletişim sayfasındaki bilgileri anında günceller.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Phone size={14} className="text-blue-400" /> Santral Telefonu
                </label>
                <input
                  type="text"
                  value={contactSettings.phone}
                  onChange={(e) => setContactSettings({ ...contactSettings, phone: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
                  placeholder="0 (364) 666 05 00"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageCircle size={14} className="text-emerald-400" /> WhatsApp Destek Hattı
                </label>
                <input
                  type="text"
                  value={contactSettings.whatsapp}
                  onChange={(e) => setContactSettings({ ...contactSettings, whatsapp: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
                  placeholder="905000000000"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Mail size={14} className="text-rose-400" /> Resmi E-Posta
                </label>
                <input
                  type="email"
                  value={contactSettings.email}
                  onChange={(e) => setContactSettings({ ...contactSettings, email: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
                  placeholder="info@corumbogazici.com"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <InstagramIcon size={14} className="text-pink-400" /> Instagram Sayfası
                </label>
                <input
                  type="text"
                  value={contactSettings.instagram}
                  onChange={(e) => setContactSettings({ ...contactSettings, instagram: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
                  placeholder="https://instagram.com/..."
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <YoutubeIcon size={14} className="text-red-400" /> YouTube Kanalı
                </label>
                <input
                  type="text"
                  value={contactSettings.youtube}
                  onChange={(e) => setContactSettings({ ...contactSettings, youtube: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
                  placeholder="https://youtube.com/..."
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock size={14} className="text-amber-400" /> Çalışma & Danışma Saatleri
                </label>
                <input
                  type="text"
                  value={contactSettings.workingHours}
                  onChange={(e) => setContactSettings({ ...contactSettings, workingHours: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
                  placeholder="Hafta İçi: 08:30 - 18:00"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[12px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin size={14} className="text-red-400" /> Kampüs Açık Adresi
              </label>
              <textarea
                rows={2}
                value={contactSettings.address}
                onChange={(e) => setContactSettings({ ...contactSettings, address: e.target.value })}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-800">
              <button
                type="submit"
                disabled={isSavingContact}
                className="flex items-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-[13.5px] shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
              >
                {isSavingContact ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                <span>{isSavingContact ? 'Kaydediliyor...' : 'İletişim Bilgilerini Kaydet'}</span>
              </button>
            </div>

          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* ÜRÜN EKLE / DÜZENLE MODAL                                                */}
      {/* ========================================================================= */}
      {productModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-[#0f172a] rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-800 shadow-2xl flex flex-col p-6 md:p-8 animate-in zoom-in-95 duration-200">
            
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                  <ShoppingBag size={18} />
                </div>
                <h3 className="text-[17px] font-bold text-white">
                  {editingProduct ? 'Ürünü Düzenle' : 'Yeni Mağaza Ürünü Ekle'}
                </h3>
              </div>
              <button 
                onClick={() => setProductModalOpen(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {productFormError && (
              <div className="mb-5 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[13px] font-medium flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{productFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="flex flex-col gap-4">
              
              {/* Ürün Adı */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-bold text-slate-400 uppercase">Ürün Başlığı *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Örn: 2026 Kolej Polo Yaka Tişört (Lacivert)"
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Fiyat & İndirimsiz Fiyat */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-bold text-slate-400 uppercase">Satış Fiyatı (₺) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="450"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-bold text-slate-400 uppercase">Eski / Liste Fiyatı (₺)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.originalPrice}
                    onChange={(e) => setFormData({ ...formData, originalPrice: e.target.value })}
                    placeholder="600 (Opsiyonel indirimli gösterim)"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Kategori & Stok Durumu */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-bold text-slate-400 uppercase">Kategori</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                      <option key={c.id} value={c.id} className="bg-slate-900">{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-bold text-slate-400 uppercase">Stok Durumu</label>
                  <select
                    value={formData.stockStatus}
                    onChange={(e) => setFormData({ ...formData, stockStatus: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {STOCK_STATUSES.map(s => (
                      <option key={s.id} value={s.id} className="bg-slate-900">{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Bedenler & Rozet */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-bold text-slate-400 uppercase">Beden / Çeşit Seçenekleri</label>
                  <input
                    type="text"
                    value={formData.sizes}
                    onChange={(e) => setFormData({ ...formData, sizes: e.target.value })}
                    placeholder="XS, S, M, L, XL veya 1. Sınıf Seti"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-bold text-slate-400 uppercase">Öne Çıkan Rozet Metni</label>
                  <input
                    type="text"
                    value={formData.badge}
                    onChange={(e) => setFormData({ ...formData, badge: e.target.value })}
                    placeholder="Örn: %20 İndirim, Yeni Sezon, Çok Satan"
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Açıklama */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-bold text-slate-400 uppercase">Ürün Detay Açıklaması</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="%100 Pamuklu, nefes alabilen özel dokuma kolej tişörtü..."
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-[13.5px] text-white font-medium focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Görsel Yükleme */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-bold text-slate-400 uppercase">Ürün Görseli</label>
                <div className="flex items-center gap-3">
                  {(formData.imageUrl || selectedImageFile) && (
                    <img 
                      src={selectedImageFile ? URL.createObjectURL(selectedImageFile) : formData.imageUrl} 
                      alt="Önizleme" 
                      className="w-16 h-16 object-cover rounded-xl border border-slate-700 shrink-0"
                    />
                  )}
                  <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-950 border border-dashed border-slate-700 rounded-xl text-[13px] font-bold text-slate-300 hover:bg-slate-800 transition-all cursor-pointer">
                    <UploadCloud size={16} className="text-blue-400" />
                    <span>{selectedImageFile ? selectedImageFile.name : 'Görsel Dosyası Seç (Cloudinary Bulut)'}</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => setSelectedImageFile(e.target.files[0])}
                      className="hidden" 
                    />
                  </label>
                </div>
              </div>

              {/* Anasayfada Vitrine Çıkar */}
              <div className="p-3.5 bg-slate-950 rounded-xl flex items-center gap-3 border border-slate-800 cursor-pointer">
                <input 
                  type="checkbox"
                  id="isFeatured"
                  checked={formData.isFeatured}
                  onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                  className="rounded bg-slate-800 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="isFeatured" className="text-[13px] font-bold text-slate-300 cursor-pointer flex items-center gap-1.5">
                  <Star size={15} className="text-amber-400" />
                  <span>Anasayfa Vitrininde (ShopShowcase) Öne Çıkar</span>
                </label>
              </div>

              {/* Aksiyon Butonları */}
              <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-[13px] cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isSavingProduct}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-xl font-bold text-[13.5px] shadow-lg shadow-blue-600/30 cursor-pointer"
                >
                  {isSavingProduct ? <RefreshCw size={15} className="animate-spin" /> : <Check size={15} />}
                  <span>{isSavingProduct ? 'Kaydediliyor...' : (editingProduct ? 'Değişiklikleri Güncelle' : 'Ürünü Ekle')}</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* SSS EKLE MODAL */}
      {newFaqModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-[#0f172a] rounded-3xl w-full max-w-lg border border-slate-800 shadow-2xl p-6 md:p-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <h3 className="text-[17px] font-bold text-white">Yeni Soru & Cevap Ekle</h3>
              <button onClick={() => setNewFaqModal(false)} className="text-slate-400 hover:text-white p-2">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddFaq} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-bold text-slate-400 uppercase">Soru *</label>
                <input
                  type="text"
                  required
                  value={faqForm.q}
                  onChange={(e) => setFaqForm({ ...faqForm, q: e.target.value })}
                  placeholder="Örn: Servis güzergahları nasıl belirlenir?"
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-[13.5px]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-bold text-slate-400 uppercase">Cevap *</label>
                <textarea
                  rows={4}
                  required
                  value={faqForm.a}
                  onChange={(e) => setFaqForm({ ...faqForm, a: e.target.value })}
                  placeholder="Cevap metni..."
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white text-[13.5px]"
                />
              </div>
              <div className="flex justify-end gap-3 mt-2">
                <button type="button" onClick={() => setNewFaqModal(false)} className="px-4 py-2 text-slate-400">Vazgeç</button>
                <button type="submit" className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold">Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SİLME ONAY MODAL */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-[#0f172a] rounded-3xl p-6 md:p-7 max-w-sm w-full border border-slate-800 shadow-2xl text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-4 border border-rose-500/30">
              <Trash2 size={26} />
            </div>
            <h3 className="text-[17px] font-bold text-white mb-2">Ürünü Silmek İstiyor musunuz?</h3>
            <p className="text-[13px] text-slate-400 mb-6 font-medium">Bu işlem geri alınamaz. Ürün websiteden anında kaldırılacaktır.</p>
            <div className="flex items-center justify-center gap-3">
              <button 
                onClick={() => setDeleteConfirmId(null)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-[13px] cursor-pointer"
              >
                Vazgeç
              </button>
              <button 
                onClick={() => handleDeleteProduct(deleteConfirmId)}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-[13px] shadow-lg shadow-rose-600/30 cursor-pointer"
              >
                Evet, Sil
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default WebManagementAdminView;
