import React, { useState, useEffect } from 'react';
import { Save, Building, Clock, CalendarOff } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const InstitutionSettingsAdminView = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  const [settings, setSettings] = useState({
    closedDays: ['Pazar'], // Kapalı günler
    openingHour: '08:00',
    closingHour: '18:00',
    lunchBreakStart: '12:00',
    lunchBreakEnd: '13:00',
  });

  const allDays = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'config', 'institution');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSettings(prev => ({...prev, ...docSnap.data()}));
        }
      } catch (error) {
        console.error("Kurum ayarları yüklenemedi:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const toggleDay = (day) => {
    setSettings(prev => {
      const closedDays = prev.closedDays.includes(day)
        ? prev.closedDays.filter(d => d !== day)
        : [...prev.closedDays, day];
      return { ...prev, closedDays };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccessMsg('');
    try {
      await setDoc(doc(db, 'config', 'institution'), settings);
      setSuccessMsg('Kurum kuralları başarıyla kaydedildi.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (error) {
      console.error("Ayarlar kaydedilemedi:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <Building className="text-slate-600 dark:text-slate-400" size={28} />
            Kurum Kuralları & Turnike
          </h1>
          <p className="text-[15px] text-slate-500 mt-2 font-medium">Kurumun çalışma saatleri ve kapalı günlerini buradan yönetin.</p>
        </div>
        
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-900 dark:text-white text-[14px] font-semibold rounded-xl transition-all shadow-sm disabled:opacity-50"
        >
          {saving ? (
             <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save size={18} />
          )}
          {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
        </button>
      </div>

      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="font-medium text-[14px]">{successMsg}</span>
        </div>
      )}

      <div className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-slate-200 dark:border-white/10 p-8 space-y-10">
        
        {/* Mesai Saatleri */}
        <section className="flex flex-col gap-6">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <Clock size={18} className="text-slate-600 dark:text-slate-400" />
              Mesai Saatleri
            </h2>
            <p className="text-[13px] text-slate-500 leading-relaxed">Öğrenci ve personelin giriş yapabileceği temel saat aralığı. Bu saatler dışında turnikeler çalışmaz (cooldown).</p>
          </div>
          
          <div className="flex flex-col gap-10 mt-4">
            {/* Açılış Saati - TEK BAŞINA */}
            <div className="flex flex-col gap-3 w-full max-w-[300px]">
              <label className="text-[13px] font-bold text-slate-700 dark:text-slate-300 tracking-wider">AÇILIŞ SAATİ</label>
              <input 
                type="time" 
                name="openingHour"
                value={settings.openingHour || ''}
                onChange={handleChange}
                style={{ display: 'block', width: '100%', padding: '14px', borderRadius: '12px' }}
              />
            </div>

            {/* Kapanış Saati - TEK BAŞINA */}
            <div className="flex flex-col gap-3 w-full max-w-[300px]">
              <label className="text-[13px] font-bold text-slate-700 dark:text-slate-300 tracking-wider">KAPANIŞ SAATİ</label>
              <input 
                type="time" 
                name="closingHour"
                value={settings.closingHour || ''}
                onChange={handleChange}
                style={{ display: 'block', width: '100%', padding: '14px', borderRadius: '12px' }}
              />
            </div>
          </div>
        </section>

        <hr className="border-slate-200 dark:border-white/10" />

        {/* Öğle Arası */}
        <section className="flex flex-col gap-6">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <Clock size={18} className="text-slate-600 dark:text-slate-400" />
              Öğle Arası (Serbest Geçiş)
            </h2>
            <p className="text-[13px] text-slate-500 leading-relaxed">Öğrenciler bu saatler arasında çıkış yaparken "Emin misiniz?" (erken çıkış) uyarısı almazlar.</p>
          </div>
          
          <div className="flex flex-col gap-10 mt-4">
            {/* Başlangıç Saati - TEK BAŞINA */}
            <div className="flex flex-col gap-3 w-full max-w-[300px]">
              <label className="text-[13px] font-bold text-slate-700 dark:text-slate-300 tracking-wider">BAŞLANGIÇ SAATİ</label>
              <input 
                type="time" 
                name="lunchBreakStart"
                value={settings.lunchBreakStart || ''}
                onChange={handleChange}
                style={{ display: 'block', width: '100%', padding: '14px', borderRadius: '12px' }}
              />
            </div>

            {/* Bitiş Saati - TEK BAŞINA */}
            <div className="flex flex-col gap-3 w-full max-w-[300px]">
              <label className="text-[13px] font-bold text-slate-700 dark:text-slate-300 tracking-wider">BİTİŞ SAATİ</label>
              <input 
                type="time" 
                name="lunchBreakEnd"
                value={settings.lunchBreakEnd || ''}
                onChange={handleChange}
                style={{ display: 'block', width: '100%', padding: '14px', borderRadius: '12px' }}
              />
            </div>
          </div>
        </section>

        <hr className="border-slate-200 dark:border-white/10" />

        {/* Kapalı Günler */}
        <section className="flex flex-col md:flex-row items-start">
          <div className="md:w-[300px] shrink-0 md:mr-10 mb-6 md:mb-0">
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <CalendarOff size={18} className="text-slate-600 dark:text-slate-400" />
              Kapalı Günler
            </h2>
            <p className="text-[13px] text-slate-500 leading-relaxed">Bu günlerde kurum kapalı sayılır. Turnike okutması engellenir, veriler kendini otonom olarak bakıma alır.</p>
          </div>
          <div className="flex-1 flex flex-wrap gap-3 w-full">
            {allDays.map(day => {
              const isClosed = settings.closedDays.includes(day);
              return (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`px-4 py-2 rounded-xl text-[14px] font-medium transition-all ${
                    isClosed
                      ? 'bg-rose-100 text-rose-700 border border-rose-200'
                      : 'bg-slate-50 dark:bg-[#1e293b] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:bg-[#1e293b]'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </section>

      </div>
    </div>
  );
};

export default InstitutionSettingsAdminView;
