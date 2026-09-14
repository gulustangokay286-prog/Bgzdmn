import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock, CalendarClock, Users, Sliders, CheckCircle2, AlertTriangle,
  ShieldCheck, Search, ArrowRight, Save, RotateCcw, UserCheck, UserX,
  MessageSquare, BellOff, RefreshCw, Layers, Check, ChevronRight, X,
  Sun, Moon, ArrowLeftRight, LayoutGrid, Columns2, ListFilter
} from 'lucide-react';
import { api } from '../services/api';
import { Panel, PanelHeader, Button, Badge, Segmented, Toast, Input, Select } from '../components/ui/panel';
import { cx, hairline } from '../components/ui/tokens';

const GUNLER = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

const SEKMELER = [
  { id: 'dagilim', label: '1. Sabah & Akşam Dağılım Panosu', icon: LayoutGrid },
  { id: 'atamalar', label: '2. Sınıf & Öğrenci Atamaları', icon: Users },
  { id: 'gruplar', label: '3. Grup Saatleri (Sabah / Akşam)', icon: Clock },
  { id: 'bireysel', label: '4. Bireysel Öğrenci İstisnaları', icon: Sliders },
  { id: 'canli', label: '5. Canlı Takip & SMS Simülasyonu', icon: MessageSquare }
];

export default function CustomSchedulesAdminView() {
  const [aktifSekme, setAktifSekme] = useState('dagilim');
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', tone: 'success' });

  // Veriler
  const [gruplar, setGruplar] = useState([]);
  const [ogrenciler, setOgrenciler] = useState([]);
  const [canliDurum, setCanliDurum] = useState(null);

  // Dağılım Panosu filtreleri
  const [dagilimGorunum, setDagilimGorunum] = useState('pano'); // 'pano' | 'tablo'
  const [dagilimAramaSabah, setDagilimAramaSabah] = useState('');
  const [dagilimAramaAksam, setDagilimAramaAksam] = useState('');
  const [dagilimSinifSabah, setDagilimSinifSabah] = useState('all');
  const [dagilimSinifAksam, setDagilimSinifAksam] = useState('all');

  // Atama sekmesi filtreleri
  const [aramaMetni, setAramaMetni] = useState('');
  const [seciliSinif, setSeciliSinif] = useState('all');
  const [seciliVardiyaFiltre, setSeciliVardiyaFiltre] = useState('all');
  const [seciliOgrenciler, setSeciliOgrenciler] = useState(new Set());
  const [topluHedefGrup, setTopluHedefGrup] = useState('aksam');

  // Bireysel sekmesi secimi
  const [seciliBireyselId, setSeciliBireyselId] = useState('');
  const [bireyselForm, setBireyselForm] = useState({
    bireysel_aktif: false,
    vardiya_id: 'sabah',
    ozel_giris: '10:00',
    ozel_cikis: '18:00',
    ozel_mola_baslangic: '13:00',
    ozel_mola_bitis: '13:45',
    ozel_tolerans_dk: 15,
    ozel_kesilme_saati: '18:30',
    gecerli_gunler: [...GUNLER],
    aciklama: ''
  });

  const bildir = (message, tone = 'success') => {
    setToast({ open: true, message, tone });
    setTimeout(() => setToast((t) => ({ ...t, open: false })), 3500);
  };

  // Tum verileri yukle
  const verileriYukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const [gRes, oRes, cRes] = await Promise.all([
        api.get('/api/vakitler/gruplar').catch(() => ({ gruplar: [] })),
        api.get('/api/vakitler/ogrenciler').catch(() => ({ ogrenciler: [] })),
        api.get('/api/vakitler/canli-durum').catch(() => null)
      ]);

      if (Array.isArray(gRes?.gruplar)) setGruplar(gRes.gruplar);
      if (Array.isArray(oRes?.ogrenciler)) setOgrenciler(oRes.ogrenciler);
      if (cRes?.success) setCanliDurum(cRes);
    } catch (e) {
      bildir('Veriler alınamadı: ' + (e?.message || 'bağlantı hatası'), 'danger');
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => {
    verileriYukle();
    const interval = setInterval(() => {
      if (aktifSekme === 'canli') {
        api.get('/api/vakitler/canli-durum').then((res) => {
          if (res?.success) setCanliDurum(res);
        }).catch(() => {});
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [verileriYukle, aktifSekme]);

  // Hızlı Tekli Vardiya Değiştirme
  const ogrenciHizliGrupDegistir = async (kisiId, hedefVardiya, ogrenciAdi) => {
    setKaydediliyor(true);
    try {
      await api.put('/api/vakitler/ogrenci/' + kisiId, {
        vardiya_id: hedefVardiya
      });
      bildir((ogrenciAdi || 'Öğrenci') + ' başarıyla ' + (hedefVardiya === 'aksam' ? 'Akşam Grubu' : 'Sabah Grubu') + "'na geçirildi.");
      verileriYukle();
    } catch (e) {
      bildir('İşlem başarısız: ' + (e?.message || 'hata'), 'danger');
    } finally {
      setKaydediliyor(false);
    }
  };

  // 1. GRUP SAATLERI GUNCELLEME
  const grupAlanGuncelle = (grupId, alan, deger) => {
    setGruplar((onceki) =>
      onceki.map((g) => (g.id === grupId ? { ...g, [alan]: deger } : g))
    );
  };

  const grupKaydet = async (grup) => {
    setKaydediliyor(true);
    try {
      await api.put('/api/vakitler/gruplar', grup);
      bildir(grup.ad + ' saatleri başarıyla kaydedildi ve yürürlüğe alındı.');
      verileriYukle();
    } catch (e) {
      bildir('Kaydedilemedi: ' + (e?.message || 'hata'), 'danger');
    } finally {
      setKaydediliyor(false);
    }
  };

  // SINIF VE GRUP HESAPLAMALARI
  const sinifListesi = useMemo(() => {
    const set = new Set();
    ogrenciler.forEach((o) => {
      const sinif = o.class_info || o.branch;
      if (sinif) set.add(sinif);
    });
    return Array.from(set).sort();
  }, [ogrenciler]);

  const sabahOgrencileri = useMemo(() => {
    return ogrenciler.filter((o) => (o.vardiya_id || 'sabah') === 'sabah');
  }, [ogrenciler]);

  const aksamOgrencileri = useMemo(() => {
    return ogrenciler.filter((o) => o.vardiya_id === 'aksam');
  }, [ogrenciler]);

  const bireyselOgrenciler = useMemo(() => {
    return ogrenciler.filter((o) => o.bireysel_aktif);
  }, [ogrenciler]);

  // Dağılım Panosu Arama / Filtreleme
  const filtrelenmisSabah = useMemo(() => {
    return sabahOgrencileri.filter((o) => {
      if (dagilimSinifSabah !== 'all') {
        const sinif = o.class_info || o.branch;
        if (sinif !== dagilimSinifSabah) return false;
      }
      if (dagilimAramaSabah.trim()) {
        const q = dagilimAramaSabah.toLowerCase();
        const ad = (o.full_name || '').toLowerCase();
        const no = (o.school_number || '').toLowerCase();
        const sinif = (o.class_info || o.branch || '').toLowerCase();
        if (!ad.includes(q) && !no.includes(q) && !sinif.includes(q)) return false;
      }
      return true;
    });
  }, [sabahOgrencileri, dagilimSinifSabah, dagilimAramaSabah]);

  const filtrelenmisAksam = useMemo(() => {
    return aksamOgrencileri.filter((o) => {
      if (dagilimSinifAksam !== 'all') {
        const sinif = o.class_info || o.branch;
        if (sinif !== dagilimSinifAksam) return false;
      }
      if (dagilimAramaAksam.trim()) {
        const q = dagilimAramaAksam.toLowerCase();
        const ad = (o.full_name || '').toLowerCase();
        const no = (o.school_number || '').toLowerCase();
        const sinif = (o.class_info || o.branch || '').toLowerCase();
        if (!ad.includes(q) && !no.includes(q) && !sinif.includes(q)) return false;
      }
      return true;
    });
  }, [aksamOgrencileri, dagilimSinifAksam, dagilimAramaAksam]);

  // Atama Sekmesi Filtrelenmiş Öğrenciler
  const filtrelenmisOgrenciler = useMemo(() => {
    return ogrenciler.filter((o) => {
      if (seciliSinif !== 'all') {
        const sinif = o.class_info || o.branch;
        if (sinif !== seciliSinif) return false;
      }
      if (seciliVardiyaFiltre !== 'all') {
        if (seciliVardiyaFiltre === 'bireysel' && !o.bireysel_aktif) return false;
        if (seciliVardiyaFiltre !== 'bireysel' && (o.vardiya_id !== seciliVardiyaFiltre || o.bireysel_aktif)) return false;
      }
      if (aramaMetni.trim()) {
        const q = aramaMetni.toLowerCase();
        const ad = (o.full_name || '').toLowerCase();
        const no = (o.school_number || '').toLowerCase();
        const sinif = (o.class_info || o.branch || '').toLowerCase();
        if (!ad.includes(q) && !no.includes(q) && !sinif.includes(q)) return false;
      }
      return true;
    });
  }, [ogrenciler, seciliSinif, seciliVardiyaFiltre, aramaMetni]);

  const toggleOgrenciSecim = (kisiId) => {
    setSeciliOgrenciler((prev) => {
      const next = new Set(prev);
      if (next.has(kisiId)) next.delete(kisiId);
      else next.add(kisiId);
      return next;
    });
  };

  const toggleTumunuSec = () => {
    if (seciliOgrenciler.size === filtrelenmisOgrenciler.length) {
      setSeciliOgrenciler(new Set());
    } else {
      setSeciliOgrenciler(new Set(filtrelenmisOgrenciler.map((o) => o.kisi_id)));
    }
  };

  const topluGrupAta = async (hedefVardiya) => {
    if (seciliOgrenciler.size === 0) {
      return bildir('Lütfen en az bir öğrenci seçin.', 'danger');
    }
    setKaydediliyor(true);
    try {
      await api.post('/api/vakitler/toplu-ata', {
        kisi_ids: Array.from(seciliOgrenciler),
        vardiya_id: hedefVardiya
      });
      bildir(seciliOgrenciler.size + ' öğrenci başarıyla ' + (hedefVardiya === 'aksam' ? 'Akşam Grubu' : 'Sabah Grubu') + "'na atandı.");
      setSeciliOgrenciler(new Set());
      verileriYukle();
    } catch (e) {
      bildir('Atama başarısız: ' + (e?.message || 'hata'), 'danger');
    } finally {
      setKaydediliyor(false);
    }
  };

  const sinifaGrupAta = async (sinifAdi, hedefVardiya) => {
    if (!sinifAdi) return;
    setKaydediliyor(true);
    try {
      await api.post('/api/vakitler/toplu-ata', {
        siniflar: [sinifAdi],
        vardiya_id: hedefVardiya
      });
      bildir(sinifAdi + ' sınıfındaki tüm öğrenciler ' + (hedefVardiya === 'aksam' ? 'Akşam Grubu' : 'Sabah Grubu') + "'na atandı.");
      verileriYukle();
    } catch (e) {
      bildir('Atama başarısız: ' + (e?.message || 'hata'), 'danger');
    } finally {
      setKaydediliyor(false);
    }
  };

  // 3. BIREYSEL SAAT AYARLARI
  const seciliOgrenciDetay = useMemo(() => {
    return ogrenciler.find((o) => String(o.kisi_id) === String(seciliBireyselId));
  }, [ogrenciler, seciliBireyselId]);

  useEffect(() => {
    if (seciliOgrenciDetay) {
      setBireyselForm({
        bireysel_aktif: Boolean(seciliOgrenciDetay.bireysel_aktif),
        vardiya_id: seciliOgrenciDetay.vardiya_id || 'sabah',
        ozel_giris: seciliOgrenciDetay.ozel_giris || seciliOgrenciDetay.grup_giris || '10:00',
        ozel_cikis: seciliOgrenciDetay.ozel_cikis || seciliOgrenciDetay.grup_cikis || '18:00',
        ozel_mola_baslangic: seciliOgrenciDetay.ozel_mola_baslangic || '13:00',
        ozel_mola_bitis: seciliOgrenciDetay.ozel_mola_bitis || '13:45',
        ozel_tolerans_dk: seciliOgrenciDetay.ozel_tolerans_dk != null ? seciliOgrenciDetay.ozel_tolerans_dk : 15,
        ozel_kesilme_saati: seciliOgrenciDetay.ozel_kesilme_saati || seciliOgrenciDetay.grup_kesilme || '18:30',
        gecerli_gunler: Array.isArray(seciliOgrenciDetay.gecerli_gunler) ? seciliOgrenciDetay.gecerli_gunler : [...GUNLER],
        aciklama: seciliOgrenciDetay.aciklama || ''
      });
    }
  }, [seciliOgrenciDetay]);

  const bireyselKaydet = async () => {
    if (!seciliBireyselId) return bildir('Lütfen bir öğrenci seçin.', 'danger');
    setKaydediliyor(true);
    try {
      await api.put('/api/vakitler/ogrenci/' + seciliBireyselId, bireyselForm);
      bildir((seciliOgrenciDetay?.full_name || 'Öğrenci') + ' için özel saat ayarları kaydedildi.');
      verileriYukle();
    } catch (e) {
      bildir('Kaydedilemedi: ' + (e?.message || 'hata'), 'danger');
    } finally {
      setKaydediliyor(false);
    }
  };

  const bireyselSifirla = async () => {
    if (!seciliBireyselId) return;
    setKaydediliyor(true);
    try {
      await api.put('/api/vakitler/ogrenci/' + seciliBireyselId, {
        vardiya_id: bireyselForm.vardiya_id || 'sabah',
        bireysel_aktif: false,
        ozel_giris: null,
        ozel_cikis: null,
        ozel_mola_baslangic: null,
        ozel_mola_bitis: null,
        aciklama: null
      });
      bildir('Özel istisna kaldırıldı; öğrenci grup saatlerine döndürüldü.');
      verileriYukle();
    } catch (e) {
      bildir('İşlem başarısız: ' + (e?.message || 'hata'), 'danger');
    } finally {
      setKaydediliyor(false);
    }
  };

  if (yukleniyor) {
    return (
      <div className="flex h-full items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-900 border-t-transparent dark:border-white dark:border-t-transparent" />
          <span className="text-xs text-slate-500 font-medium">Özel vakitler ve grup saatleri yükleniyor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-20">
      <Toast open={toast.open} message={toast.message} tone={toast.tone} />

      {/* HEADER */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="m-0 text-[26px] font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
              Özel Geliş Vakitleri
            </h1>
            <Badge tone="indigo">Kurs Merkezi Modu</Badge>
          </div>
          <p className="m-0 mt-2 max-w-2xl text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
            Sabah Grubu / Akşam Grubu çalışma saatlerini belirleyin, öğrencilere grup veya bireysel özel saat atayın.
            Tüm saatler turnike, QR ve devamsızlık hesaplamasına anında yansır.
          </p>
        </div>

        {/* SMS GÜVENLİK BİLGİSİ */}
        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          <BellOff size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
          <span>SMS Gönderimi Kesin Olarak Kilitli (0 SMS Gönderilir · Canlı Simülasyon Aktif)</span>
        </div>
      </header>

      {/* SEKME SECIMI */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-white/10 pb-3">
        {SEKMELER.map((s) => {
          const Icon = s.icon;
          const aktif = aktifSekme === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setAktifSekme(s.id)}
              className={cx(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all cursor-pointer',
                aktif
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-white dark:bg-white/[0.04] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.08] border border-slate-200 dark:border-white/10'
              )}
            >
              <Icon size={16} />
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 1. SEKME: SABAH & AKSAM TOPLU DAGILIM PANOSU                              */}
      {/* ========================================================================= */}
      {aktifSekme === 'dagilim' && (
        <div className="flex flex-col gap-6">
          {/* GRUP ISTATISTIK KARTLARI */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Sabah Grubu Ozeti */}
            <Panel className="p-4 border-l-4 border-l-sky-500 border-slate-200 dark:border-white/10 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-300 flex items-center justify-center">
                    <Sun size={18} />
                  </div>
                  <span className="font-semibold text-slate-900 dark:text-white text-sm">
                    Sabah Grubu
                  </span>
                </div>
                <Badge tone="info">{sabahOgrencileri.length} Öğrenci</Badge>
              </div>
              <div className="mt-3 text-xs text-slate-500 space-y-1">
                <div>Ders Saati: <span className="font-semibold text-slate-700 dark:text-slate-300">08:30 – 13:30</span></div>
                <div>Öğle / Yemek: <span className="font-semibold text-slate-700 dark:text-slate-300">12:00 – 12:45</span> (10 dk tol.)</div>
                <div>Kesilme Saati: <span className="font-mono text-slate-600 dark:text-slate-400">14:00</span></div>
              </div>
            </Panel>

            {/* Aksam Grubu Ozeti */}
            <Panel className="p-4 border-l-4 border-l-purple-500 border-slate-200 dark:border-white/10 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300 flex items-center justify-center">
                    <Moon size={18} />
                  </div>
                  <span className="font-semibold text-slate-900 dark:text-white text-sm">
                    Akşam Grubu
                  </span>
                </div>
                <Badge tone="purple">{aksamOgrencileri.length} Öğrenci</Badge>
              </div>
              <div className="mt-3 text-xs text-slate-500 space-y-1">
                <div>Ders Saati: <span className="font-semibold text-slate-700 dark:text-slate-300">16:30 – 21:30</span></div>
                <div>Akşam Molası: <span className="font-semibold text-slate-700 dark:text-slate-300">19:00 – 19:30</span> (15 dk tol.)</div>
                <div>Kesilme Saati: <span className="font-mono text-slate-600 dark:text-slate-400">22:00</span></div>
              </div>
            </Panel>

            {/* Bireysel Ozel Saat Ozeti */}
            <Panel className="p-4 border-l-4 border-l-amber-500 border-slate-200 dark:border-white/10 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-300 flex items-center justify-center">
                    <Sliders size={18} />
                  </div>
                  <span className="font-semibold text-slate-900 dark:text-white text-sm">
                    Özel Saat İstisnası
                  </span>
                </div>
                <Badge tone="warning">{bireyselOgrenciler.length} Öğrenci</Badge>
              </div>
              <div className="mt-3 text-xs text-slate-500 space-y-1">
                <div>Gruptan bağımsız öğrenciye özel saat tanımlanmış kişi sayısı.</div>
                <div className="text-[11px] text-amber-700 dark:text-amber-400">
                  Özel saat tanımlı öğrenciler ilgili grubun saatleri yerine kendi özel saatlerine tabidir.
                </div>
              </div>
            </Panel>
          </div>

          {/* GORUNUM SECICI & BILGILENDIRME */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white m-0">
                Sabah ve Akşam Grubu Toplu Dağılım Listesi
              </h2>
              <p className="text-xs text-slate-500 m-0 mt-0.5">
                Öğrencilerin 1. Sınıfı (Normal Şubesi) ve 2. Sınıfı (Kurs Grubu) yan yana gösterilmektedir.
                Tek tıkla öğrenciyi Sabah &lt;-&gt; Akşam grubuna geçirebilirsiniz.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setDagilimGorunum('pano')}
                className={cx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
                  dagilimGorunum === 'pano'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                    : 'bg-white dark:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10'
                )}
              >
                <Columns2 size={14} />
                <span>Yan Yana Pano</span>
              </button>
              <button
                onClick={() => setDagilimGorunum('tablo')}
                className={cx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
                  dagilimGorunum === 'tablo'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                    : 'bg-white dark:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10'
                )}
              >
                <ListFilter size={14} />
                <span>Geniş Liste Tablosu</span>
              </button>
            </div>
          </div>

          {/* 1. SECENEK: YAN YANA PANO GORUNUMU */}
          {dagilimGorunum === 'pano' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* SOL KOLON: ☀️ Sabah Grubu */}
              <Panel className="p-4 flex flex-col gap-4 border border-sky-200 dark:border-sky-900/40 bg-sky-50/20 dark:bg-sky-950/10">
                <div className="flex items-center justify-between pb-3 border-b border-sky-100 dark:border-sky-900/30">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-sky-500 text-white flex items-center justify-center font-bold">
                      <Sun size={17} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white m-0">
                        Sabah Grubu Öğrencileri
                      </h3>
                      <span className="text-[11px] text-slate-500">
                        08:30 – 13:30 (Mola 12:00 – 12:45)
                      </span>
                    </div>
                  </div>
                  <Badge tone="info">{filtrelenmisSabah.length} Öğrenci</Badge>
                </div>

                {/* Filtreler */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Sabah grubunda ara..."
                      value={dagilimAramaSabah}
                      onChange={(e) => setDagilimAramaSabah(e.target.value)}
                      className="pl-8 text-xs bg-white dark:bg-white/5"
                    />
                  </div>
                  <Select
                    value={dagilimSinifSabah}
                    onChange={(e) => setDagilimSinifSabah(e.target.value)}
                    className="w-32 text-xs bg-white dark:bg-white/5"
                  >
                    <option value="all">Tüm Sınıflar</option>
                    {sinifListesi.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </div>

                {/* Sabah Ogrenci Kartlari */}
                <div className="max-h-[620px] overflow-y-auto space-y-2.5 pr-1">
                  {filtrelenmisSabah.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      Sabah grubunda aranan kriterde öğrenci bulunamadı.
                    </div>
                  ) : (
                    filtrelenmisSabah.map((o) => (
                      <div
                        key={o.kisi_id}
                        className="p-3 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 flex items-center justify-between gap-3 shadow-xs hover:border-sky-300 dark:hover:border-sky-700 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[13px] text-slate-900 dark:text-white truncate">
                              {o.full_name}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">
                              #{o.school_number || '—'}
                            </span>
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 font-medium">
                              1. Sınıf: <strong className="font-semibold">{o.class_info || o.branch || '—'}</strong>
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 font-semibold border border-sky-200 dark:border-sky-800/40">
                              2. Sınıf: ☀️ Sabah Grubu
                            </span>
                            {o.bireysel_aktif && (
                              <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-semibold">
                                ⚡ Özel Saat ({o.ozel_giris} – {o.ozel_cikis})
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => ogrenciHizliGrupDegistir(o.kisi_id, 'aksam', o.full_name)}
                          disabled={kaydediliyor}
                          title="Akşam Grubuna Taşı"
                          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-xs font-semibold border border-purple-200 dark:border-purple-800/40 transition-colors cursor-pointer"
                        >
                          <span>Akşam'a Taşı</span>
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </Panel>

              {/* SAĞ KOLON: 🌙 Akşam Grubu */}
              <Panel className="p-4 flex flex-col gap-4 border border-purple-200 dark:border-purple-900/40 bg-purple-50/20 dark:bg-purple-950/10">
                <div className="flex items-center justify-between pb-3 border-b border-purple-100 dark:border-purple-900/30">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold">
                      <Moon size={17} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white m-0">
                        Akşam Grubu Öğrencileri
                      </h3>
                      <span className="text-[11px] text-slate-500">
                        16:30 – 21:30 (Mola 19:00 – 19:30)
                      </span>
                    </div>
                  </div>
                  <Badge tone="purple">{filtrelenmisAksam.length} Öğrenci</Badge>
                </div>

                {/* Filtreler */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Akşam grubunda ara..."
                      value={dagilimAramaAksam}
                      onChange={(e) => setDagilimAramaAksam(e.target.value)}
                      className="pl-8 text-xs bg-white dark:bg-white/5"
                    />
                  </div>
                  <Select
                    value={dagilimSinifAksam}
                    onChange={(e) => setDagilimSinifAksam(e.target.value)}
                    className="w-32 text-xs bg-white dark:bg-white/5"
                  >
                    <option value="all">Tüm Sınıflar</option>
                    {sinifListesi.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </div>

                {/* Akşam Ogrenci Kartlari */}
                <div className="max-h-[620px] overflow-y-auto space-y-2.5 pr-1">
                  {filtrelenmisAksam.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      Akşam grubunda aranan kriterde öğrenci bulunamadı.
                    </div>
                  ) : (
                    filtrelenmisAksam.map((o) => (
                      <div
                        key={o.kisi_id}
                        className="p-3 rounded-xl bg-white dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 flex items-center justify-between gap-3 shadow-xs hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[13px] text-slate-900 dark:text-white truncate">
                              {o.full_name}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">
                              #{o.school_number || '—'}
                            </span>
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 font-medium">
                              1. Sınıf: <strong className="font-semibold">{o.class_info || o.branch || '—'}</strong>
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 font-semibold border border-purple-200 dark:border-purple-800/40">
                              2. Sınıf: 🌙 Akşam Grubu
                            </span>
                            {o.bireysel_aktif && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-semibold">
                                ⚡ Özel Saat ({o.ozel_giris} – {o.ozel_cikis})
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => ogrenciHizliGrupDegistir(o.kisi_id, 'sabah', o.full_name)}
                          disabled={kaydediliyor}
                          title="Sabah Grubuna Taşı"
                          className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 text-xs font-semibold border border-sky-200 dark:border-sky-800/40 transition-colors cursor-pointer"
                        >
                          <ArrowLeftRight size={13} />
                          <span>Sabah'a Taşı</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            </div>
          ) : (
            /* 2. SECENEK: GENIS LISTE TABLOSU */
            <Panel className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-white/10">
                    <tr>
                      <th className="py-3 px-4">Okul No</th>
                      <th className="py-3 px-4">Öğrenci Adı Soyadı</th>
                      <th className="py-3 px-4">1. Sınıf (Şube)</th>
                      <th className="py-3 px-4">2. Sınıf (Kurs Grubu)</th>
                      <th className="py-3 px-4">Geçerli Giriş / Çıkış</th>
                      <th className="py-3 px-4">Mola / Yemek</th>
                      <th className="py-3 px-4">Devamsızlık Kesilme</th>
                      <th className="py-3 px-4 text-right">Grup Değiştir</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {ogrenciler.map((o) => {
                      const isAksam = o.vardiya_id === 'aksam';
                      const isBireysel = Boolean(o.bireysel_aktif);
                      const giris = isBireysel ? o.ozel_giris : o.grup_giris;
                      const cikis = isBireysel ? o.ozel_cikis : o.grup_cikis;
                      const kesilme = isBireysel ? o.ozel_kesilme_saati : o.grup_kesilme;
                      const mola = isBireysel ? (o.ozel_mola_baslangic ? (o.ozel_mola_baslangic + ' – ' + o.ozel_mola_bitis) : '—')
                                              : (isAksam ? '19:00 – 19:30 (15 dk)' : '12:00 – 12:45 (10 dk)');

                      return (
                        <tr key={o.kisi_id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-500">
                            {o.school_number || '—'}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                            {o.full_name}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-200">
                            {o.class_info || o.branch || '—'}
                          </td>
                          <td className="py-3 px-4">
                            {isAksam ? (
                              <Badge tone="purple">🌙 Akşam Grubu</Badge>
                            ) : (
                              <Badge tone="info">☀️ Sabah Grubu</Badge>
                            )}
                            {isBireysel && (
                              <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold">(Özel Saat)</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-slate-700 dark:text-slate-300">
                            {(giris || '—') + ' – ' + (cikis || '—')}
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-xs font-mono">
                            {mola}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500">
                            {kesilme || '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {isAksam ? (
                              <Button
                                variant="secondary"
                                onClick={() => ogrenciHizliGrupDegistir(o.kisi_id, 'sabah', o.full_name)}
                                disabled={kaydediliyor}
                              >
                                Sabah Grubuna Al
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                onClick={() => ogrenciHizliGrupDegistir(o.kisi_id, 'aksam', o.full_name)}
                                disabled={kaydediliyor}
                              >
                                Akşam Grubuna Al
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SEKME: SINIF & OGRENCI ATAMALARI                                       */}
      {/* ========================================================================= */}
      {aktifSekme === 'atamalar' && (
        <div className="flex flex-col gap-6">
          {/* Toplu Atama Panelleri */}
          <Panel className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-slate-200 dark:border-white/10">
            {/* Sinif Bazli Toplu Atama */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Sınıf Seçimi:
              </span>
              <Select
                value={seciliSinif}
                onChange={(e) => setSeciliSinif(e.target.value)}
                className="w-44"
              >
                <option value="all">Tüm Sınıflar</option>
                {sinifListesi.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>

              {seciliSinif !== 'all' && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => sinifaGrupAta(seciliSinif, 'sabah')}
                    disabled={kaydediliyor}
                  >
                    {'Tüm ' + seciliSinif + "'yi Sabah Grubuna Ata"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => sinifaGrupAta(seciliSinif, 'aksam')}
                    disabled={kaydediliyor}
                  >
                    {'Tüm ' + seciliSinif + "'yi Akşam Grubuna Ata"}
                  </Button>
                </div>
              )}
            </div>

            {/* Secili Ogrenciler Toplu Atama */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">
                {seciliOgrenciler.size} öğrenci seçili
              </span>
              <Button
                variant="primary"
                disabled={seciliOgrenciler.size === 0 || kaydediliyor}
                onClick={() => topluGrupAta('sabah')}
              >
                Seçilenleri Sabah Grubuna Ata
              </Button>
              <Button
                variant="secondary"
                disabled={seciliOgrenciler.size === 0 || kaydediliyor}
                onClick={() => topluGrupAta('aksam')}
              >
                Seçilenleri Akşam Grubuna Ata
              </Button>
            </div>
          </Panel>

          {/* Filtre ve Arama */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="Öğrenci adı, okul no veya şube ara..."
                value={aramaMetni}
                onChange={(e) => setAramaMetni(e.target.value)}
                className="pl-9 pr-8"
              />
              {aramaMetni && (
                <button
                  onClick={() => setAramaMetni('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={seciliVardiyaFiltre}
                onChange={(e) => setSeciliVardiyaFiltre(e.target.value)}
                className="w-48"
              >
                <option value="all">Tüm Gruplar</option>
                <option value="sabah">Yalnızca Sabah Grubu</option>
                <option value="aksam">Yalnızca Akşam Grubu</option>
                <option value="bireysel">Yalnızca Bireysel Özel Saat</option>
              </Select>
            </div>
          </div>

          {/* Ogrenci Tablosu */}
          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-white/10">
                  <tr>
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={filtrelenmisOgrenciler.length > 0 && seciliOgrenciler.size === filtrelenmisOgrenciler.length}
                        onChange={toggleTumunuSec}
                        className="rounded cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-4">Okul No</th>
                    <th className="py-3 px-4">Öğrenci Adı Soyadı</th>
                    <th className="py-3 px-4">1. Sınıf (Şube)</th>
                    <th className="py-3 px-4">2. Sınıf (Kurs Grubu)</th>
                    <th className="py-3 px-4">Geçerli Giriş / Çıkış</th>
                    <th className="py-3 px-4">Devamsızlık Kesilme</th>
                    <th className="py-3 px-4 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {filtrelenmisOgrenciler.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        Kriterlere uygun öğrenci bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    filtrelenmisOgrenciler.map((o) => {
                      const isSecili = seciliOgrenciler.has(o.kisi_id);
                      const isBireysel = Boolean(o.bireysel_aktif);
                      const isAksam = o.vardiya_id === 'aksam';
                      const giris = isBireysel ? o.ozel_giris : o.grup_giris;
                      const cikis = isBireysel ? o.ozel_cikis : o.grup_cikis;
                      const kesilme = isBireysel ? o.ozel_kesilme_saati : o.grup_kesilme;

                      return (
                        <tr
                          key={o.kisi_id}
                          className={cx(
                            'hover:bg-slate-50/70 dark:hover:bg-white/[0.02] transition-colors',
                            isSecili && 'bg-indigo-50/40 dark:bg-indigo-950/20'
                          )}
                        >
                          <td className="py-3 px-4">
                            <input
                              type="checkbox"
                              checked={isSecili}
                              onChange={() => toggleOgrenciSecim(o.kisi_id)}
                              className="rounded cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">
                            {o.school_number || '—'}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                            {o.full_name}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {o.class_info || o.branch || '—'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {isBireysel ? (
                              <Badge tone="success">Bireysel Özel Saat</Badge>
                            ) : isAksam ? (
                              <Badge tone="purple">🌙 Akşam Grubu</Badge>
                            ) : (
                              <Badge tone="info">☀️ Sabah Grubu</Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-slate-700 dark:text-slate-300">
                            {(giris || '—') + ' – ' + (cikis || '—')}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500">
                            {kesilme || '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                setSeciliBireyselId(o.kisi_id);
                                setAktifSekme('bireysel');
                              }}
                              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                            >
                              Özel Düzenle →
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SEKME: GRUP SAATLERI (SABAH / AKSAM)                                   */}
      {/* ========================================================================= */}
      {aktifSekme === 'gruplar' && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {gruplar.map((g) => {
              const isSabah = g.id === 'sabah';
              return (
                <Panel key={g.id} className="p-6 flex flex-col gap-5 border border-slate-200 dark:border-white/10 shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-4">
                    <div className="flex items-center gap-3">
                      <div className={cx(
                        'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg',
                        isSabah ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                                : 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                      )}>
                        {isSabah ? 'S' : 'A'}
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white m-0">
                          {g.ad}
                        </h2>
                        <span className="text-xs text-slate-400">
                          {isSabah ? 'Gündüz oturumu ve normal ders saatleri' : 'Öğleden sonra & gece etüt oturumu'}
                        </span>
                      </div>
                    </div>
                    <Badge tone={isSabah ? 'info' : 'purple'}>
                      {isSabah ? 'Gündüz Grubu' : 'Akşam Grubu'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Ders Başlangıç / Giriş
                      </label>
                      <Input
                        type="time"
                        value={g.sabah_giris || '08:30'}
                        onChange={(e) => grupAlanGuncelle(g.id, 'sabah_giris', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Giriş Toleransı (Müsaade Dk)
                      </label>
                      <Input
                        type="number"
                        min="0"
                        max="120"
                        value={g.sabah_musaade_dk ?? 15}
                        onChange={(e) => grupAlanGuncelle(g.id, 'sabah_musaade_dk', parseInt(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Öğle / Mola Çıkışı
                      </label>
                      <Input
                        type="time"
                        value={g.ogle_cikis || '12:00'}
                        onChange={(e) => grupAlanGuncelle(g.id, 'ogle_cikis', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Mola Çıkış Toleransı (dk)
                      </label>
                      <Input
                        type="number"
                        min="0"
                        max="60"
                        value={g.ogle_musaade_dk ?? 10}
                        onChange={(e) => grupAlanGuncelle(g.id, 'ogle_musaade_dk', parseInt(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Mola Dönüş Saati
                      </label>
                      <Input
                        type="time"
                        value={g.ogleden_sonra_giris || '12:45'}
                        onChange={(e) => grupAlanGuncelle(g.id, 'ogleden_sonra_giris', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Dönüş Toleransı (dk)
                      </label>
                      <Input
                        type="number"
                        min="0"
                        max="60"
                        value={g.ogleden_sonra_musaade_dk ?? 15}
                        onChange={(e) => grupAlanGuncelle(g.id, 'ogleden_sonra_musaade_dk', parseInt(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Gün Sonu Çıkış Saati
                      </label>
                      <Input
                        type="time"
                        value={g.okul_cikis || '13:30'}
                        onChange={(e) => grupAlanGuncelle(g.id, 'okul_cikis', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Devamsızlık Kesilme Saati
                      </label>
                      <Input
                        type="time"
                        value={g.kesilme_saati || '14:00'}
                        onChange={(e) => grupAlanGuncelle(g.id, 'kesilme_saati', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-end">
                    <Button
                      variant="primary"
                      disabled={kaydediliyor}
                      onClick={() => grupKaydet(g)}
                      className="flex items-center gap-1.5"
                    >
                      <Save size={15} />
                      <span>{g.ad + ' Saatlerini Kaydet'}</span>
                    </Button>
                  </div>
                </Panel>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. SEKME: BIREYSEL OGRENCI ISTISNALARI                                    */}
      {/* ========================================================================= */}
      {aktifSekme === 'bireysel' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Sol: Ogrenci Secici */}
          <Panel className="p-4 flex flex-col gap-4 border border-slate-200 dark:border-white/10 md:col-span-1">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white m-0">
              Öğrenci Seçimi
            </h2>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="Öğrenci ara..."
                value={aramaMetni}
                onChange={(e) => setAramaMetni(e.target.value)}
                className="pl-8 text-xs"
              />
            </div>
            <div className="max-h-[480px] overflow-y-auto flex flex-col gap-1 divide-y divide-slate-100 dark:divide-white/5">
              {filtrelenmisOgrenciler.slice(0, 50).map((o) => {
                const secili = String(o.kisi_id) === String(seciliBireyselId);
                return (
                  <button
                    key={o.kisi_id}
                    onClick={() => setSeciliBireyselId(o.kisi_id)}
                    className={cx(
                      'p-2.5 text-left rounded-lg transition-colors cursor-pointer flex items-center justify-between',
                      secili
                        ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-semibold'
                        : 'hover:bg-slate-50 dark:hover:bg-white/[0.03] text-slate-700 dark:text-slate-300'
                    )}
                  >
                    <div className="min-w-0">
                      <div className="text-xs truncate">{o.full_name}</div>
                      <div className="text-[11px] text-slate-400 font-normal">
                        {'No: ' + (o.school_number || '—') + ' · ' + (o.class_info || o.branch || '—')}
                      </div>
                    </div>
                    {o.bireysel_aktif && (
                      <span className="shrink-0 w-2 h-2 rounded-full bg-amber-500" title="Bireysel saat tanımlı" />
                    )}
                  </button>
                );
              })}
            </div>
          </Panel>

          {/* Sag: Duzenleme Formu */}
          <Panel className="p-6 flex flex-col gap-5 border border-slate-200 dark:border-white/10 md:col-span-2">
            {seciliOgrenciDetay ? (
              <>
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white m-0">
                      {seciliOgrenciDetay.full_name}
                    </h2>
                    <span className="text-xs text-slate-400">
                      {'Okul No: ' + (seciliOgrenciDetay.school_number || '—') + ' · Sınıf: ' + (seciliOgrenciDetay.class_info || seciliOgrenciDetay.branch || '—')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bireyselForm.bireysel_aktif}
                        onChange={(e) => setBireyselForm((prev) => ({ ...prev, bireysel_aktif: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-600"></div>
                      <span className="ml-2 text-xs font-semibold text-slate-900 dark:text-white">
                        Bireysel Özel Saat Aktif
                      </span>
                    </label>
                  </div>
                </div>

                {/* Bagli Oldugu Grup Secimi */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Varsayılan Kurs Grubu
                  </label>
                  <Select
                    value={bireyselForm.vardiya_id}
                    onChange={(e) => setBireyselForm((prev) => ({ ...prev, vardiya_id: e.target.value }))}
                  >
                    <option value="sabah">Sabah Grubu (08:30 – 13:30)</option>
                    <option value="aksam">Akşam Grubu (16:30 – 21:30)</option>
                  </Select>
                </div>

                {/* Ozel Saatler */}
                <div className={cx('flex flex-col gap-4', !bireyselForm.bireysel_aktif && 'opacity-50 pointer-events-none')}>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Özel Giriş / Ders Saati
                      </label>
                      <Input
                        type="time"
                        value={bireyselForm.ozel_giris}
                        onChange={(e) => setBireyselForm((prev) => ({ ...prev, ozel_giris: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Özel Giriş Toleransı (dk)
                      </label>
                      <Input
                        type="number"
                        min="0"
                        max="120"
                        value={bireyselForm.ozel_tolerans_dk}
                        onChange={(e) => setBireyselForm((prev) => ({ ...prev, ozel_tolerans_dk: parseInt(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Özel Yemek / Mola Başlangıç
                      </label>
                      <Input
                        type="time"
                        value={bireyselForm.ozel_mola_baslangic}
                        onChange={(e) => setBireyselForm((prev) => ({ ...prev, ozel_mola_baslangic: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Özel Yemek / Mola Bitiş
                      </label>
                      <Input
                        type="time"
                        value={bireyselForm.ozel_mola_bitis}
                        onChange={(e) => setBireyselForm((prev) => ({ ...prev, ozel_mola_bitis: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Özel Çıkış Saati
                      </label>
                      <Input
                        type="time"
                        value={bireyselForm.ozel_cikis}
                        onChange={(e) => setBireyselForm((prev) => ({ ...prev, ozel_cikis: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Özel Devamsızlık Kesilme Saati
                      </label>
                      <Input
                        type="time"
                        value={bireyselForm.ozel_kesilme_saati}
                        onChange={(e) => setBireyselForm((prev) => ({ ...prev, ozel_kesilme_saati: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      İstisna Açıklaması / Not
                    </label>
                    <Input
                      type="text"
                      placeholder="ör. Staj günleri erken çıkış, haftada 3 gün özel program vb."
                      value={bireyselForm.aciklama}
                      onChange={(e) => setBireyselForm((prev) => ({ ...prev, aciklama: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
                  <Button
                    variant="secondary"
                    onClick={bireyselSifirla}
                    disabled={kaydediliyor || !seciliOgrenciDetay.bireysel_aktif}
                    className="text-rose-600 hover:text-rose-700"
                  >
                    Vardiya Varsayılanına Dön
                  </Button>

                  <Button
                    variant="primary"
                    disabled={kaydediliyor}
                    onClick={bireyselKaydet}
                    className="flex items-center gap-1.5"
                  >
                    <Save size={15} />
                    <span>Özel Saatleri Kaydet</span>
                  </Button>
                </div>
              </>
            ) : (
              <div className="py-24 text-center text-slate-400 text-xs">
                Özel saat ayarlarını düzenlemek için sol listeden bir öğrenci seçin.
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. SEKME: CANLI TAKIP & SMS SIMULASYONU                                   */}
      {/* ========================================================================= */}
      {aktifSekme === 'canli' && (
        <div className="flex flex-col gap-6">
          {/* Durum Ozeti */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Panel className="p-4 flex flex-col gap-1 border border-slate-200 dark:border-white/10">
              <span className="text-xs text-slate-400 font-medium">Toplam Öğrenci</span>
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                {canliDurum?.ozet?.toplamOgrenci || ogrenciler.length}
              </span>
            </Panel>
            <Panel className="p-4 flex flex-col gap-1 border border-emerald-200 dark:border-emerald-900/30 bg-emerald-50/20">
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Şu An Kurumda</span>
              <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {canliDurum?.ozet?.kurumda || 0}
              </span>
            </Panel>
            <Panel className="p-4 flex flex-col gap-1 border border-amber-200 dark:border-amber-900/30 bg-amber-50/20">
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Henüz Gelmedi / Bekleyen</span>
              <span className="text-xl font-bold text-amber-600 dark:text-amber-400">
                {canliDurum?.ozet?.gelmedi || 0}
              </span>
            </Panel>
            <Panel className="p-4 flex flex-col gap-1 border border-rose-200 dark:border-rose-900/30 bg-rose-50/20">
              <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">Geç Kalan / Devamsız</span>
              <span className="text-xl font-bold text-rose-600 dark:text-rose-400">
                {(canliDurum?.ozet?.gec || 0) + (canliDurum?.ozet?.devamsiz || 0)}
              </span>
            </Panel>
          </div>

          {/* Canli Takip Tablosu & SMS Simulasyonu */}
          <Panel className="overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white m-0">
                  Gerçek Zamanlı Öğrenci Durumu &amp; SMS Taslak Simülasyonu
                </h2>
                <span className="text-xs text-slate-400">
                  Her öğrenci kendi vardiyasına göre dinlenir; SMS gönderimi kilitlidir, aşağıdaki mesajlar yalnızca önizlemedir.
                </span>
              </div>
              <Button
                variant="secondary"
                onClick={verileriYukle}
                className="flex items-center gap-1.5 text-xs"
              >
                <RefreshCw size={13} />
                <span>Yenile</span>
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead className="bg-slate-50 dark:bg-white/[0.03] text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-white/10">
                  <tr>
                    <th className="py-3 px-4">Öğrenci</th>
                    <th className="py-3 px-4">1. Sınıf</th>
                    <th className="py-3 px-4">2. Sınıf (Grup)</th>
                    <th className="py-3 px-4">Beklenen Giriş</th>
                    <th className="py-3 px-4">Anlık Durum</th>
                    <th className="py-3 px-4">Gecikme</th>
                    <th className="py-3 px-4">Simüle Edilen SMS Taslağı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {(canliDurum?.durumlar || []).slice(0, 100).map((d) => {
                    const tone = d.durum === 'Kurumda' ? 'success'
                               : d.durum === 'Ayrıldı' ? 'neutral'
                               : d.durum === 'Gecikti' ? 'warning'
                               : d.durum === 'Devamsız' ? 'danger' : 'info';
                    return (
                      <tr key={d.kisi_id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-white">{d.full_name}</div>
                          <div className="font-mono text-[11px] text-slate-400">#{d.school_number || '—'}</div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-600 dark:text-slate-300">
                          {d.class_info || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <Badge tone={d.vardiya_id === 'aksam' ? 'purple' : 'info'}>
                            {d.vardiya_id === 'aksam' ? '🌙 Akşam Grubu' : '☀️ Sabah Grubu'}
                          </Badge>
                          {d.bireysel_aktif && (
                            <span className="ml-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">(Özel)</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                          {(d.beklenenGiris || '—') + ' (tol. ' + d.toleransDk + ' dk)'}
                        </td>
                        <td className="py-3 px-4">
                          <Badge tone={tone}>{d.durum}</Badge>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">
                          {d.gecikmeDk > 0 ? (
                            <span className="text-rose-600 font-semibold">{'+' + d.gecikmeDk + ' dk'}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-slate-500 max-w-xs truncate">
                          {d.simulasyonSms || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
