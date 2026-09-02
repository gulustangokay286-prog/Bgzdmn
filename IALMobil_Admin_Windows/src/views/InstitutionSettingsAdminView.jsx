import React, { useState, useEffect, useMemo } from 'react';
import {
  Save, Building, Clock, CalendarOff, LogOut, Timer, ShieldCheck,
  AlertTriangle, CheckCircle2, Sunrise, Sunset, CalendarPlus, X, Info
} from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  DEFAULT_ATTENDANCE_CONFIG,
  resolveAttendanceConfig,
  getAttendanceWindows,
  minutesToTime
} from '../services/attendanceRules';

const TONE = {
  emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
  orange:  'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400',
  blue:    'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
  rose:    'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400',
  indigo:  'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
};

const ALL_DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

const timeInputStyle = {
  display: 'block',
  width: '100%',
  padding: '13px 14px',
  borderRadius: '12px',
  fontSize: '15px',
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums'
};

const Field = ({ label, hint, children }) => (
  <div className="flex flex-col gap-2 w-full max-w-[300px]">
    <label className="text-[12px] font-bold text-slate-700 dark:text-slate-300 tracking-wider uppercase">{label}</label>
    {children}
    {hint && <span className="text-[11.5px] text-slate-500 leading-snug">{hint}</span>}
  </div>
);

const Toggle = ({ checked, onChange, title, description }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`flex items-start gap-3 text-left p-4 rounded-xl border transition-all w-full ${
      checked
        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50'
        : 'bg-slate-50 dark:bg-[#1e293b] border-slate-200 dark:border-white/10'
    }`}
  >
    <div className={`mt-0.5 w-10 h-6 shrink-0 rounded-full p-0.5 transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </div>
    <div className="flex flex-col">
      <span className="text-[14px] font-bold text-slate-800 dark:text-slate-200">{title}</span>
      <span className="text-[12.5px] text-slate-500 leading-snug mt-0.5">{description}</span>
    </div>
  </button>
);

const InstitutionSettingsAdminView = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [holidayDraft, setHolidayDraft] = useState('');

  const [settings, setSettings] = useState({ ...DEFAULT_ATTENDANCE_CONFIG });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'config', 'institution');
        const docSnap = await getDoc(docRef);
        const raw = docSnap.exists() ? docSnap.data() : {};
        setSettings({ ...raw, ...resolveAttendanceConfig(raw) });
      } catch (error) {
        console.error('Kurum ayarları yüklenemedi:', error);
        setErrorMsg('Kurum ayarları okunamadı, varsayılan değerler gösteriliyor.');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const preview = useMemo(() => {
    const resolved = resolveAttendanceConfig(settings);
    const w = getAttendanceWindows(resolved);
    return { resolved, w };
  }, [settings]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleNumberChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value === '' ? '' : Number(value) }));
  };

  const setFlag = (name) => (value) => setSettings(prev => ({ ...prev, [name]: value }));

  const toggleDay = (day) => {
    setSettings(prev => {
      const closedDays = (prev.closedDays || []).includes(day)
        ? prev.closedDays.filter(d => d !== day)
        : [...(prev.closedDays || []), day];
      return { ...prev, closedDays };
    });
  };

  const addHoliday = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDraft)) return;
    setSettings(prev => ({
      ...prev,
      holidays: Array.from(new Set([...(prev.holidays || []), holidayDraft])).sort()
    }));
    setHolidayDraft('');
  };

  const removeHoliday = (day) => {
    setSettings(prev => ({ ...prev, holidays: (prev.holidays || []).filter(d => d !== day) }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      
      const normalized = resolveAttendanceConfig(settings);
      await setDoc(doc(db, 'config', 'institution'), normalized, { merge: true });
      setSettings(prev => ({ ...prev, ...normalized }));
      setSuccessMsg(
        `Kaydedildi. Yoklama motoru artık ${normalized.morningEntryHour} (+${normalized.morningGraceMinutes} dk) / ` +
        `${normalized.afternoonEntryHour} (+${normalized.afternoonGraceMinutes} dk) giriş ve ` +
        `${normalized.schoolExitHour} okul çıkışına göre çalışıyor.`
      );
      setTimeout(() => setSuccessMsg(''), 6000);
    } catch (error) {
      console.error('Ayarlar kaydedilemedi:', error);
      setErrorMsg('Ayarlar kaydedilemedi: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 dark:border-white"></div>
      </div>
    );
  }

  const { resolved, w } = preview;

  return (
    <div className="max-w-4xl mx-auto pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <Building className="text-slate-600 dark:text-slate-400" size={28} />
            Kurum Kuralları & Yoklama
          </h1>
          <p className="text-[15px] text-slate-500 mt-2 font-medium">
            Giriş/çıkış saatleri, tolerans süreleri ve otomatik devamsızlık kurallarını buradan yönetin.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 text-[14px] font-semibold rounded-xl transition-all shadow-sm disabled:opacity-50 shrink-0"
        >
          {saving
            ? <div className="w-5 h-5 border-2 border-white/30 border-t-white dark:border-slate-900/30 dark:border-t-slate-900 rounded-full animate-spin" />
            : <Save size={18} />}
          {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
        </button>
      </div>

      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-xl border border-emerald-100 dark:border-emerald-900/50 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <span className="font-medium text-[14px] leading-relaxed">{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 rounded-xl border border-red-100 dark:border-red-900/50 flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span className="font-medium text-[14px]">{errorMsg}</span>
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-slate-200 dark:border-white/10 bg-gradient-to-br from-slate-50 to-white dark:from-[#1e293b] dark:to-[#0f172a] p-6">
        <h2 className="text-[15px] font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
          <Info size={17} className="text-blue-600 dark:text-blue-400" />
          Günlük Akış Önizlemesi
        </h2>
        <p className="text-[12.5px] text-slate-500 mb-5">Aşağıdaki ayarlarla sistemin bugün nasıl davranacağı:</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { icon: Sunrise, tone: TONE.emerald, time: `${resolved.morningEntryHour} – ${minutesToTime(w.morningGraceEnd)}`, label: 'Sabah serbest giriş' },
            { icon: AlertTriangle, tone: TONE.orange, time: `${minutesToTime(w.morningGraceEnd + 1)} sonrası`, label: 'Rehber öğretmen onayı gerekir' },
            { icon: Timer, tone: TONE.blue, time: resolved.halfDayCutoffHour, label: 'Sabah yarım günü kesinleşir' },
            { icon: LogOut, tone: TONE.rose, time: minutesToTime(w.lunchExitAutoAt), label: 'Okutmayana otomatik çıkış' },
            { icon: Sunrise, tone: TONE.emerald, time: `${resolved.afternoonEntryHour} – ${minutesToTime(w.afternoonGraceEnd)}`, label: 'Öğleden sonra serbest giriş' },
            { icon: Sunset, tone: TONE.indigo, time: resolved.schoolExitHour, label: 'Okul çıkışı · tam gün kesinleşir' }
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10">
              <div className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${item.tone}`}>
                <item.icon size={17} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[14px] font-extrabold text-slate-900 dark:text-white tabular-nums">{item.time}</span>
                <span className="text-[11.5px] text-slate-500 font-medium truncate">{item.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-slate-200 dark:border-white/10 p-8 space-y-10">

        <section className="flex flex-col gap-6">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <Sunrise size={18} className="text-slate-600 dark:text-slate-400" />
              Sabah Girişi
            </h2>
            <p className="text-[13px] text-slate-500 leading-relaxed">
              Öğrencilerin sabah kuruma giriş saati ve tanınan müsaade süresi. Tolerans dolduktan sonra karekod
              okutan öğrenciye <strong>“Rehber Öğretmeninizle Görüşün”</strong> ekranı çıkar ve girişi ancak görevli
              öğretmen “Öğrenci Geçiş” ekranından manuel olarak yapabilir.
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-8">
            <Field label="Giriş Saati">
              <input type="time" name="morningEntryHour" value={settings.morningEntryHour || ''} onChange={handleChange} style={timeInputStyle} />
            </Field>
            <Field label="Müsaade (Dakika)" hint={`Son serbest giriş: ${minutesToTime(w.morningGraceEnd)}`}>
              <input type="number" min="0" max="240" name="morningGraceMinutes" value={settings.morningGraceMinutes ?? ''} onChange={handleNumberChange} style={timeInputStyle} />
            </Field>
          </div>
        </section>

        <hr className="border-slate-200 dark:border-white/10" />

        <section className="flex flex-col gap-6">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <LogOut size={18} className="text-slate-600 dark:text-slate-400" />
              Öğle Çıkışı & Otomatik Çıkış
            </h2>
            <p className="text-[13px] text-slate-500 leading-relaxed">
              Öğrenciler bu saatte kurumdan çıkmalıdır. Müsaade süresi dolduğunda (
              <strong>{minutesToTime(w.lunchExitAutoAt)}</strong>) sabah girişi yapmış olup çıkış okutmayan
              öğrencilerin çıkışı sistem tarafından otomatik verilir.
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-8">
            <Field label="Çıkış Saati">
              <input type="time" name="lunchExitHour" value={settings.lunchExitHour || ''} onChange={handleChange} style={timeInputStyle} />
            </Field>
            <Field label="Müsaade (Dakika)" hint={`Otomatik çıkış: ${minutesToTime(w.lunchExitAutoAt)}`}>
              <input type="number" min="0" max="240" name="lunchExitGraceMinutes" value={settings.lunchExitGraceMinutes ?? ''} onChange={handleNumberChange} style={timeInputStyle} />
            </Field>
          </div>
        </section>

        <hr className="border-slate-200 dark:border-white/10" />

        <section className="flex flex-col gap-6">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <Clock size={18} className="text-slate-600 dark:text-slate-400" />
              Öğleden Sonra Girişi
            </h2>
            <p className="text-[13px] text-slate-500 leading-relaxed">
              Öğleden sonraki giriş saati ve müsaade süresi. Tolerans dolduktan sonra okutan öğrenci yine
              rehberlik ekranına yönlendirilir.
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-8">
            <Field label="Giriş Saati">
              <input type="time" name="afternoonEntryHour" value={settings.afternoonEntryHour || ''} onChange={handleChange} style={timeInputStyle} />
            </Field>
            <Field label="Müsaade (Dakika)" hint={`Son serbest giriş: ${minutesToTime(w.afternoonGraceEnd)}`}>
              <input type="number" min="0" max="240" name="afternoonGraceMinutes" value={settings.afternoonGraceMinutes ?? ''} onChange={handleNumberChange} style={timeInputStyle} />
            </Field>
          </div>
        </section>

        <hr className="border-slate-200 dark:border-white/10" />

        <section className="flex flex-col gap-6">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <Sunset size={18} className="text-slate-600 dark:text-slate-400" />
              Okul Çıkış Saati & Devamsızlık Sınırları
            </h2>
            <p className="text-[13px] text-slate-500 leading-relaxed">
              <strong>Okul çıkış saati</strong> günün kapanış anıdır: bu saat geldiğinde o gün hiç gelmeyen
              öğrencilere ikinci yarım gün yazılarak devamsızlıkları <strong>tam gün yok</strong>a tamamlanır ve
              günlük devamsızlık raporuna düşer. Saati değiştirdiğinizde otomatik yoklama da anında yeni saate
              göre çalışır.
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-8">
            <Field
              label="Okul Çıkış Saati"
              hint={`${settings.schoolExitHour || '--:--'} itibarıyla tam gün devamsızlıklar işlenir.`}
            >
              <input type="time" name="schoolExitHour" value={settings.schoolExitHour || ''} onChange={handleChange} style={timeInputStyle} />
            </Field>
            <Field
              label="Yarım Gün Sınırı"
              hint="Bu saatten önce giriş yapan öğrenci “sabah var” sayılır; gelmeyene yarım gün yok yazılır."
            >
              <input type="time" name="halfDayCutoffHour" value={settings.halfDayCutoffHour || ''} onChange={handleChange} style={timeInputStyle} />
            </Field>
          </div>

          <div className="flex flex-col md:flex-row gap-8">
            <Field label="Kurum Açılış Saati" hint="Bu saatten önceki okutmalar mesai dışı sayılır.">
              <input type="time" name="dayStartHour" value={settings.dayStartHour || ''} onChange={handleChange} style={timeInputStyle} />
            </Field>
          </div>
        </section>

        <hr className="border-slate-200 dark:border-white/10" />

        <section className="flex flex-col gap-6">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <ShieldCheck size={18} className="text-slate-600 dark:text-slate-400" />
              Otomasyon
            </h2>
            <p className="text-[13px] text-slate-500 leading-relaxed">
              Sistemin kendi kendine yaptığı işlemler. Kapatırsanız ilgili işlemi yalnızca idare elle yapar.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Toggle
              checked={Boolean(settings.autoAttendanceEnabled)}
              onChange={setFlag('autoAttendanceEnabled')}
              title="Otomatik Devamsızlık Yazma"
              description={`Yarım gün sınırında (${resolved.halfDayCutoffHour}) ve okul çıkışında (${resolved.schoolExitHour}) gelmeyenlere otomatik yok yazılır.`}
            />
            <Toggle
              checked={Boolean(settings.autoLunchExitEnabled)}
              onChange={setFlag('autoLunchExitEnabled')}
              title="Otomatik Öğle Çıkışı"
              description={`${minutesToTime(w.lunchExitAutoAt)} itibarıyla çıkış okutmayanların çıkışı sistem tarafından verilir.`}
            />
            <Toggle
              checked={Boolean(settings.autoSchoolExitEnabled)}
              onChange={setFlag('autoSchoolExitEnabled')}
              title="Gün Sonu Otomatik Çıkış"
              description={`Okul çıkışında (${resolved.schoolExitHour}) hâlâ kurum içinde görünen öğrencilerin kaydı kapatılır.`}
            />
            <Toggle
              checked={Boolean(settings.lateRequiresCounselorApproval)}
              onChange={setFlag('lateRequiresCounselorApproval')}
              title="Geç Girişte Rehberlik Onayı"
              description="Tolerans dolduktan sonra okutan öğrenciye rehberlik ekranı çıkar; giriş yalnızca görevli öğretmenin manuel onayıyla yapılır."
            />
          </div>
        </section>

        <hr className="border-slate-200 dark:border-white/10" />

        <section className="flex flex-col md:flex-row items-start">
          <div className="md:w-[300px] shrink-0 md:mr-10 mb-6 md:mb-0">
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <CalendarOff size={18} className="text-slate-600 dark:text-slate-400" />
              Kapalı Günler
            </h2>
            <p className="text-[13px] text-slate-500 leading-relaxed">
              Bu günlerde kurum kapalı sayılır: karekod girişi alınmaz ve <strong>otomatik devamsızlık işlenmez</strong>.
            </p>
          </div>
          <div className="flex-1 flex flex-wrap gap-3 w-full">
            {ALL_DAYS.map(day => {
              const isClosed = (settings.closedDays || []).includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`px-4 py-2 rounded-xl text-[14px] font-medium transition-all ${
                    isClosed
                      ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60'
                      : 'bg-slate-50 dark:bg-[#1e293b] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10 hover:border-slate-300'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </section>

        <hr className="border-slate-200 dark:border-white/10" />

        <section className="flex flex-col md:flex-row items-start">
          <div className="md:w-[300px] shrink-0 md:mr-10 mb-6 md:mb-0">
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <CalendarPlus size={18} className="text-slate-600 dark:text-slate-400" />
              Tatil Günleri
            </h2>
            <p className="text-[13px] text-slate-500 leading-relaxed">
              Resmî tatil, ara tatil veya idari izin günleri. Bu tarihlerde otomatik devamsızlık yazılmaz.
            </p>
          </div>
          <div className="flex-1 w-full">
            <div className="flex gap-2 mb-4 max-w-[420px]">
              <input
                type="date"
                value={holidayDraft}
                onChange={(e) => setHolidayDraft(e.target.value)}
                style={{ ...timeInputStyle, width: 'auto', flex: 1 }}
              />
              <button
                type="button"
                onClick={addHoliday}
                disabled={!holidayDraft}
                className="px-5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13px] font-bold disabled:opacity-40"
              >
                Ekle
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(settings.holidays || []).length === 0 && (
                <span className="text-[13px] text-slate-400">Henüz tatil günü eklenmedi.</span>
              )}
              {(settings.holidays || []).map(day => (
                <span key={day} className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/50 text-[13px] font-semibold tabular-nums">
                  {day}
                  <button type="button" onClick={() => removeHoliday(day)} className="hover:text-red-600 transition-colors">
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};

export default InstitutionSettingsAdminView;
