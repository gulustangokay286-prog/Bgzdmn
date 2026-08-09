import React, { useState, useEffect } from 'react';
import { Save, Moon, Sun } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useTheme } from '../contexts/ThemeContext';

const SettingsView = () => {
  const { theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const [settings, setSettings] = useState({
    schoolName: 'Boğaziçi Koleji',
    academicYear: '2025-2026',
    activeTerm: '1',
    maintenanceMode: false,
    whatsappNotifications: true,
    smsNotifications: false,
    emailNotifications: true,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'system_settings', 'general');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSettings(docSnap.data());
        }
      } catch (error) {
        console.error("Ayarlar yüklenemedi:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccessMsg('');
    try {
      await setDoc(doc(db, 'system_settings', 'general'), settings);
      setSuccessMsg('Ayarlar başarıyla kaydedildi.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (error) {
      console.error("Ayarlar kaydedilemedi:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="absolute inset-0 bg-[var(--bg-base)] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-slate-200 dark:border-white/10 border-t-slate-900 animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-[var(--bg-base)] z-40 overflow-y-auto overflow-x-hidden font-sans custom-scrollbar flex flex-col p-8 md:p-12 lg:px-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end w-full shrink-0 gap-6 mb-16 border-b border-slate-200 dark:border-white/10 pb-8">
        <div className="flex flex-col">
          <h1 className="text-[42px] font-medium text-slate-900 dark:text-white tracking-tight leading-none mb-3">Ayarlar</h1>
          <p className="text-[15px] text-slate-500">Sistem yapılandırmasını ve kurum tercihlerini yönetin.</p>
        </div>

        <div className="flex items-center gap-4">
          {successMsg && (
            <span className="text-[13px] font-medium text-emerald-600 animate-pulse">{successMsg}</span>
          )}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-6 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-[14px] font-medium rounded-lg transition-all"
            title="Temayı Değiştir"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {theme === 'dark' ? 'Açık Tema' : 'Karanlık Tema'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-900 dark:text-white text-[14px] font-medium rounded-lg transition-all disabled:opacity-50"
          >
            {saving ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : <Save size={16} />}
            Kaydet
          </button>
        </div>
      </div>

      <div className="flex flex-col max-w-4xl gap-16 pb-12">

        {/* Kurum Parametreleri */}
        <section className="flex flex-col md:flex-row gap-8 md:gap-16">
          <div className="md:w-1/3 shrink-0">
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white mb-2">Kurum Bilgileri</h2>
            <p className="text-[13px] text-slate-500 leading-relaxed">Uygulamanın genelinde görünecek kurum bilgileri ve akademik takvim detayları.</p>
          </div>
          <div className="md:w-2/3 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Kurum Adı</label>
              <input
                type="text"
                name="schoolName"
                value={settings.schoolName}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-transparent border-b border-slate-300 focus:border-slate-900 outline-none text-[15px] text-slate-900 dark:text-white transition-colors placeholder:text-slate-600 dark:text-slate-400"
              />
            </div>

            <div className="flex gap-6">
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Eğitim Öğretim Yılı</label>
                <input
                  type="text"
                  name="academicYear"
                  value={settings.academicYear}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-transparent border-b border-slate-300 focus:border-slate-900 outline-none text-[15px] text-slate-900 dark:text-white transition-colors"
                />
              </div>

              <div className="flex flex-col gap-2 flex-1">
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Aktif Dönem</label>
                <select
                  name="activeTerm"
                  value={settings.activeTerm}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-transparent border-b border-slate-300 focus:border-slate-900 outline-none text-[15px] text-slate-900 dark:text-white transition-colors appearance-none cursor-pointer"
                >
                  <option value="1">1. Dönem</option>
                  <option value="2">2. Dönem</option>
                  <option value="3">Yaz Dönemi</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <hr className="border-slate-200 dark:border-white/10" />

        {/* Kurum Konum Ayarları */}
        <section className="flex flex-col md:flex-row gap-8 md:gap-16">
          <div className="md:w-1/3 shrink-0">
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white mb-2">GPS Konum Tanımı</h2>
            <p className="text-[13px] text-slate-500 leading-relaxed">Öğrencilerin QR sistemine giriş yapabilmesi için zorunlu olan kurum koordinatlarını ayarlayın.</p>
          </div>
          <div className="md:w-2/3 flex flex-col gap-6">
            <div className="flex gap-6">
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Enlem (Latitude)</label>
                <input
                  type="text"
                  name="institutionLat"
                  value={settings.institutionLat || ''}
                  onChange={handleChange}
                  placeholder="41.0422"
                  className="w-full px-4 py-2.5 bg-transparent border-b border-slate-300 focus:border-slate-900 outline-none text-[15px] text-slate-900 dark:text-white transition-colors"
                />
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Boylam (Longitude)</label>
                <input
                  type="text"
                  name="institutionLng"
                  value={settings.institutionLng || ''}
                  onChange={handleChange}
                  placeholder="29.0083"
                  className="w-full px-4 py-2.5 bg-transparent border-b border-slate-300 focus:border-slate-900 outline-none text-[15px] text-slate-900 dark:text-white transition-colors"
                />
              </div>
            </div>

            <button
              onClick={() => {
                if (navigator.geolocation) {
                  setSuccessMsg('Konum aranıyor...');
                  navigator.geolocation.getCurrentPosition(
                    (position) => {
                      setSettings(prev => ({
                        ...prev,
                        institutionLat: position.coords.latitude,
                        institutionLng: position.coords.longitude
                      }));
                      setSuccessMsg('Konumunuz başarıyla alındı. Lütfen sağ üstten kaydedin.');
                    },
                    (error) => {
                      console.error(error);
                      setSuccessMsg('Konum alınamadı, tarayıcı izinlerini kontrol edin.');
                    }
                  );
                }
              }}
              className="mt-2 w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[14px] font-semibold rounded-xl border border-blue-200 transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
              Mevcut Konumumu Kurum Konumu Olarak Ayarla
            </button>
            <p className="text-[12.5px] text-slate-600 dark:text-slate-400 mt-1">Bu butona bastığınızda şu an bulunduğunuz fiziksel konum sistemin ana konumu olarak kabul edilir. Sadece bu konumun 50 metre çapındaki cihazlar QR yoklama sistemine giriş yapabilir.</p>
          </div>
        </section>

        <hr className="border-slate-200 dark:border-white/10" />

        {/* Bildirim Yönetimi */}
        <section className="flex flex-col md:flex-row gap-8 md:gap-16">
          <div className="md:w-1/3 shrink-0">
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white mb-2">Bildirimler</h2>
            <p className="text-[13px] text-slate-500 leading-relaxed">Kullanıcılara gönderilecek SMS, e-posta ve WhatsApp bildirimlerini yönetin.</p>
          </div>
          <div className="md:w-2/3 flex flex-col gap-6">

            <label className="flex items-start justify-between cursor-pointer group">
              <div className="flex flex-col">
                <span className="text-[15px] font-medium text-slate-900 dark:text-white">WhatsApp Bildirimleri</span>
                <span className="text-[13px] text-slate-500 mt-1">Velilere otomatik geçiş bildirimlerini aktif et</span>
              </div>
              <div className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out mt-1 ${settings.whatsappNotifications ? 'bg-slate-900' : 'bg-slate-300'}`}>
                <div className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-[#0f172a] shadow ring-0 transition duration-200 ease-in-out ${settings.whatsappNotifications ? 'translate-x-4.5' : 'translate-x-1'}`} />
              </div>
              <input type="checkbox" name="whatsappNotifications" checked={settings.whatsappNotifications} onChange={handleChange} className="hidden" />
            </label>

            <label className="flex items-start justify-between cursor-pointer group">
              <div className="flex flex-col">
                <span className="text-[15px] font-medium text-slate-900 dark:text-white">E-Posta Özetleri</span>
                <span className="text-[13px] text-slate-500 mt-1">Yönetime günlük sistem raporu gönderimi</span>
              </div>
              <div className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out mt-1 ${settings.emailNotifications ? 'bg-slate-900' : 'bg-slate-300'}`}>
                <div className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-[#0f172a] shadow ring-0 transition duration-200 ease-in-out ${settings.emailNotifications ? 'translate-x-4.5' : 'translate-x-1'}`} />
              </div>
              <input type="checkbox" name="emailNotifications" checked={settings.emailNotifications} onChange={handleChange} className="hidden" />
            </label>

            <label className="flex items-start justify-between cursor-pointer group">
              <div className="flex flex-col">
                <span className="text-[15px] font-medium text-slate-900 dark:text-white">SMS Bildirimleri</span>
                <span className="text-[13px] text-slate-500 mt-1">Acil durumlarda veliye SMS gönderimi onayı</span>
              </div>
              <div className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out mt-1 ${settings.smsNotifications ? 'bg-slate-900' : 'bg-slate-300'}`}>
                <div className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-[#0f172a] shadow ring-0 transition duration-200 ease-in-out ${settings.smsNotifications ? 'translate-x-4.5' : 'translate-x-1'}`} />
              </div>
              <input type="checkbox" name="smsNotifications" checked={settings.smsNotifications} onChange={handleChange} className="hidden" />
            </label>

          </div>
        </section>

        <hr className="border-slate-200 dark:border-white/10" />

        {/* Sistem Durumu */}
        <section className="flex flex-col md:flex-row gap-8 md:gap-16">
          <div className="md:w-1/3 shrink-0">
            <h2 className="text-[16px] font-semibold text-rose-600 mb-2">Tehlikeli Alan</h2>
            <p className="text-[13px] text-slate-500 leading-relaxed">Sistemin erişilebilirliğiyle ilgili kritik ayarlamalar.</p>
          </div>
          <div className="md:w-2/3 flex flex-col gap-6">
            <label className="flex items-start justify-between cursor-pointer group p-4 -ml-4 rounded-xl hover:bg-rose-50/50 transition-colors">
              <div className="flex flex-col">
                <span className="text-[15px] font-medium text-rose-600">Bakım Modu</span>
                <span className="text-[13px] text-slate-500 mt-1 max-w-sm">Bu seçenek aktif edildiğinde, veli ve öğrenci girişleri durdurulur. Yalnızca yöneticiler sisteme erişebilir.</span>
              </div>
              <div className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out mt-1 ${settings.maintenanceMode ? 'bg-rose-600' : 'bg-slate-300'}`}>
                <div className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-[#0f172a] shadow ring-0 transition duration-200 ease-in-out ${settings.maintenanceMode ? 'translate-x-4.5' : 'translate-x-1'}`} />
              </div>
              <input type="checkbox" name="maintenanceMode" checked={settings.maintenanceMode} onChange={handleChange} className="hidden" />
            </label>
          </div>
        </section>

      </div>
    </div>
  );
};

export default SettingsView;
