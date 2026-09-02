import React, { useState, useEffect, useMemo } from 'react';
import {
  Send, MessageSquare, Bell, Smartphone, Users, AlertCircle,
  CheckCircle2, RefreshCw, Key, Settings, ShieldCheck, Sparkles,
  HelpCircle, UserCheck, Layers, FileText, ChevronRight
} from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { netgsmService, calculateSmsParts, formatPhoneNumber } from '../services/netgsmService';

const TARGET_OPTIONS = [
  { id: 'all_parents', label: 'Tüm Veliler', icon: Users, desc: 'Sistemde kayıtlı veli telefonları' },
  { id: 'all_students', label: 'Tüm Öğrenciler', icon: UserCheck, desc: 'Öğrenci cep telefonları' },
  { id: 'all_teachers', label: 'Tüm Öğretmenler', icon: Layers, desc: 'Öğretmen ve akademisyen kadrosu' },
  { id: 'all_personnel', label: 'Tüm Personel', icon: ShieldCheck, desc: 'İdari ve kurum personeli' },
  { id: 'custom_numbers', label: 'Özel Numara Listesi', icon: Smartphone, desc: 'Manuel girilen telefon numaraları' }
];

const TEMPLATES = [
  {
    name: 'Kar Tatili',
    title: 'Kar Tatili Bilgilendirmesi',
    message: 'Olumsuz hava kosullari nedeniyle okulumuzda egitim-ogretime 1 gun sureyle ara verilmistir. Bilgilerinize sunariz.'
  },
  {
    name: 'Veli Toplantısı',
    title: 'Donem Veli Toplantisi',
    message: 'Sayin Velimiz, ogrencimizin akademik ve sosyal gelisimini degerlendirmek uzere veli toplantimiz bu hafta sonu yapilacaktir.'
  },
  {
    name: 'Sınav Duyurusu',
    title: 'Yazılı Sınav Takvimi',
    message: 'Sayin Velimiz, ogrencilerimizin 1. Donem ortak yazili sinav takvimi yayinlanmistir. Basarilar dileriz.'
  },
  {
    name: 'Genel Hatırlatma',
    title: 'Onemli Duyuru',
    message: 'Sayin Velimiz, kurumumuzdaki etkinlik ve bilgilendirme detaylarina mobil uygulamamiz uzerinden ulasabilirsiniz.'
  }
];

const PushNotificationAdminView = () => {
  const [channel, setChannel] = useState('both');
  const [targetGroup, setTargetGroup] = useState('all_parents');
  const [customPhones, setCustomPhones] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  const [netgsmConfig, setNetgsmConfig] = useState({ usercode: '', password: '', header: 'BOGAZICI', autoGateSms: true });
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [balance, setBalance] = useState(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [recipientCount, setRecipientCount] = useState(0);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  const [sendingState, setSendingState] = useState('idle');
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [recentLogs, setRecentLogs] = useState([]);

  const smsStats = useMemo(() => {
    const fullText = title ? `${title}\n\n${message}` : message;
    return calculateSmsParts(fullText);
  }, [title, message]);

  useEffect(() => {
    loadNetgsmConfig();
    fetchRecentLogs();
  }, []);

  useEffect(() => {
    fetchRecipientCount();
  }, [targetGroup]);

  useEffect(() => {
    let interval;
    if (sendingState === 'fetching') {
      setProgressPercent(15);
      interval = setInterval(() => {
        setProgressPercent(prev => (prev < 45 ? prev + 3 : prev));
      }, 50);
    } else if (sendingState === 'sending') {
      interval = setInterval(() => {
        setProgressPercent(prev => (prev < 90 ? prev + 1 : prev));
      }, 40);
    } else if (sendingState === 'success') {
      setProgressPercent(100);
    } else {
      setProgressPercent(0);
    }
    return () => clearInterval(interval);
  }, [sendingState]);

  const loadNetgsmConfig = async () => {
    const cfg = await netgsmService.getConfig();
    setNetgsmConfig(cfg);
  };

  const fetchBalance = async () => {
    setLoadingBalance(true);
    try {
      const res = await netgsmService.getBalance();
      if (res.success && res.balance !== undefined) {
        setBalance(res.balance);
      } else {
        setBalance(null);
      }
    } catch (e) {
    } finally {
      setLoadingBalance(false);
    }
  };

  const fetchRecipientCount = async () => {
    if (targetGroup === 'custom_numbers') return;
    setLoadingRecipients(true);
    try {
      const list = await netgsmService.getRecipientsByRole(targetGroup);
      setRecipientCount(list.length);
    } catch (e) {
    } finally {
      setLoadingRecipients(false);
    }
  };

  const fetchRecentLogs = async () => {
    try {
      const q = query(collection(db, 'sms_logs'), orderBy('timestamp', 'desc'), limit(5));
      const snap = await getDocs(q);
      const logs = [];
      snap.forEach(d => logs.push({ id: d.id, ...d.data() }));
      setRecentLogs(logs);
    } catch (e) {
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setConfigSaving(true);
    try {
      await netgsmService.saveConfig(netgsmConfig);
      setShowConfigModal(false);
      await loadNetgsmConfig();
    } catch (err) {
      alert('Ayarlar kaydedilemedi: ' + err.message);
    } finally {
      setConfigSaving(false);
    }
  };

  const handleApplyTemplate = (tpl) => {
    setTitle(tpl.title);
    setMessage(tpl.message);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    setSendingState('fetching');
    setStatusMessage('Alıcı listesi hazırlanıyor...');

    try {
      let targetPhones = [];

      if (targetGroup === 'custom_numbers') {
        targetPhones = customPhones
          .split(/[\n,;]+/)
          .map(formatPhoneNumber)
          .filter(Boolean);
      } else {
        const recipients = await netgsmService.getRecipientsByRole(targetGroup);
        targetPhones = recipients.map(r => r.phone);
      }

      targetPhones = [...new Set(targetPhones)];

      if ((channel === 'sms' || channel === 'both') && targetPhones.length === 0) {
        throw new Error('Gönderilecek geçerli bir telefon numarası bulunamadı.');
      }

      setSendingState('sending');
      setStatusMessage(`${targetPhones.length} kişiye iletim başlatılıyor...`);

      if (channel === 'push' || channel === 'both') {
        await addDoc(collection(db, 'global_notifications'), {
          title,
          message,
          target: targetGroup,
          channel,
          timestamp: serverTimestamp(),
          sender: localStorage.getItem('adminName') || 'Sistem Yöneticisi',
          readBy: []
        });
      }

      if (channel === 'sms' || channel === 'both') {
        await netgsmService.sendSms({
          phones: targetPhones,
          title,
          message
        });
      }

      setSendingState('success');
      setStatusMessage('Mesajlar başarıyla iletildi.');
      fetchRecentLogs();

      setTimeout(() => {
        setSendingState('idle');
        setTitle('');
        setMessage('');
        setCustomPhones('');
      }, 3500);

    } catch (error) {
      setSendingState('error');
      setStatusMessage(error.message || 'Gönderim sırasında hata oluştu.');
      setTimeout(() => setSendingState('idle'), 4000);
    }
  };

  return (
    <div className="w-full h-full flex-1 flex flex-col font-sans p-4 md:p-6 lg:p-8 overflow-x-hidden box-border">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 shrink-0 gap-4 w-full border-b border-slate-200 dark:border-white/10 pb-5">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2.5 mb-1.5">
            <h1 className="text-[26px] md:text-[30px] font-bold text-slate-900 dark:text-white tracking-tight leading-none truncate">
              Bildirim & NetGSM SMS Merkezi
            </h1>
            <span className="px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60">
              NetGSM v2 API
            </span>
          </div>
          <p className="text-[13px] md:text-[14px] text-slate-500 dark:text-slate-400 font-medium">
            Velilere, öğrencilere ve personele NetGSM SMS altyapısıyla anlık toplu mesaj gönderin.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={fetchBalance}
            disabled={loadingBalance}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 transition-all cursor-pointer"
          >
            <RefreshCw size={13} className={loadingBalance ? 'animate-spin' : ''} />
            <span>{balance !== null ? `${balance} SMS Kredisi` : 'SMS Bakiye'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowConfigModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 transition-all cursor-pointer"
          >
            <Settings size={14} />
            <span>NetGSM Ayarları</span>
          </button>
        </div>
      </div>

      <div className="w-full min-w-0 box-border flex-1 flex flex-col">
        <div className="bg-white dark:bg-[#0f172a] rounded-2xl md:rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-xs flex flex-col lg:flex-row w-full min-w-0 box-border overflow-hidden relative">
          {sendingState !== 'idle' && (
            <div className="absolute inset-0 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md z-30 flex flex-col items-center justify-center transition-all duration-300">
              {sendingState === 'fetching' || sendingState === 'sending' ? (
                <div className="flex flex-col items-center gap-6 w-full max-w-sm px-8">
                  <div className="w-full bg-slate-100 dark:bg-white/10 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="flex flex-col items-center gap-1.5 text-center">
                    <span className="text-[15px] font-bold text-slate-800 dark:text-white">NetGSM İletimi Sürüyor</span>
                    <span className="text-[12.5px] text-slate-500 dark:text-slate-400 font-medium">{statusMessage}</span>
                  </div>
                </div>
              ) : sendingState === 'success' ? (
                <div className="flex flex-col items-center gap-3 animate-in zoom-in duration-500">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm border border-emerald-100 dark:border-emerald-900/50">
                    <CheckCircle2 size={32} />
                  </div>
                  <span className="text-[17px] font-bold text-slate-900 dark:text-white">Mesajlar Başarıyla İletildi</span>
                  <span className="text-[13px] text-slate-500 font-medium">{statusMessage}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 animate-in zoom-in duration-300 px-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-sm border border-rose-100 dark:border-rose-900/50">
                    <AlertCircle size={32} />
                  </div>
                  <span className="text-[17px] font-bold text-slate-900 dark:text-white">Gönderim Başarısız</span>
                  <span className="text-[13px] text-rose-500 font-medium max-w-md">{statusMessage}</span>
                </div>
              )}
            </div>
          )}

          <div className="w-full lg:w-[38%] p-6 md:p-7 flex flex-col gap-6 border-b lg:border-b-0 lg:border-r border-slate-200/80 dark:border-white/10 box-border shrink-0 bg-slate-50/50 dark:bg-slate-900/40">
            <div className="flex flex-col gap-2">
              <label className="text-[11.5px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Gönderim Kanalı
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'both', label: 'Tüm Kanallar', icon: Layers },
                  { id: 'sms', label: 'NetGSM SMS', icon: Smartphone },
                  { id: 'push', label: 'Mobil Push', icon: Bell }
                ].map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setChannel(item.id)}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      channel === item.id
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/20'
                        : 'bg-white dark:bg-[#1e293b] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:border-slate-300'
                    }`}
                  >
                    <item.icon size={16} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-[11.5px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Hedef Kitle
                </label>
                {targetGroup !== 'custom_numbers' && (
                  <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md">
                    {loadingRecipients ? 'Hesaplanıyor...' : `${recipientCount} Alıcı`}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                {TARGET_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTargetGroup(opt.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      targetGroup === opt.id
                        ? 'bg-white dark:bg-[#1e293b] border-blue-500 shadow-xs ring-2 ring-blue-500/10'
                        : 'bg-transparent border-transparent hover:bg-white/60 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <opt.icon size={15} className={targetGroup === opt.id ? 'text-blue-500' : 'text-slate-400'} />
                      <div className="flex flex-col">
                        <span className={`text-xs font-bold ${targetGroup === opt.id ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                          {opt.label}
                        </span>
                        <span className="text-[10.5px] text-slate-400 font-medium leading-tight">
                          {opt.desc}
                        </span>
                      </div>
                    </div>
                    {targetGroup === opt.id && <ChevronRight size={14} className="text-blue-500" />}
                  </button>
                ))}
              </div>
            </div>

            {targetGroup === 'custom_numbers' && (
              <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                <label className="text-[11.5px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Telefon Numaraları (Virgül veya Alt Alta)
                </label>
                <textarea
                  value={customPhones}
                  onChange={e => setCustomPhones(e.target.value)}
                  placeholder="5321234567, 5059876543"
                  className="w-full p-2.5 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 h-20 outline-none focus:border-blue-500 resize-none font-mono"
                />
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2 border-t border-slate-200/60 dark:border-white/5">
              <label className="text-[11.5px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={13} className="text-amber-500" />
                Hızlı Şablonlar
              </label>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATES.map((tpl, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleApplyTemplate(tpl)}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 rounded-lg transition-colors cursor-pointer"
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[62%] p-6 md:p-8 flex flex-col justify-between box-border">
            <form onSubmit={handleSend} className="flex flex-col gap-5 w-full h-full box-border">
              <div className="flex flex-col gap-1.5 w-full box-border">
                <label className="text-[12px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span>Mesaj Başlığı</span>
                  <span className="text-[11px] font-normal text-slate-400">Başlık: {netgsmConfig.header || 'BOGAZICI'}</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full box-border px-4 py-3 bg-white dark:bg-[#1e293b]/50 border border-slate-200 dark:border-white/10 rounded-xl focus:border-blue-500 outline-none text-[13.5px] text-slate-900 dark:text-white transition-all placeholder:text-slate-400 font-medium"
                  placeholder="Örn: Kar Tatili Uyarısı, Önemli Duyuru..."
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5 w-full box-border flex-1">
                <div className="flex items-center justify-between">
                  <label className="text-[12px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Mesaj İçeriği
                  </label>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md font-mono">
                      {smsStats.length} Karakter · {smsStats.smsCount} SMS
                    </span>
                  </div>
                </div>

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full box-border p-4 bg-white dark:bg-[#1e293b]/50 border border-slate-200 dark:border-white/10 rounded-xl focus:border-blue-500 outline-none text-[13.5px] text-slate-900 dark:text-white transition-all placeholder:text-slate-400 min-h-[160px] h-full resize-y font-medium leading-relaxed"
                  placeholder="Göndermek istediğiniz mesaj detayını buraya girin..."
                  required
                />

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>NetGSM altyapısıyla anında iletilir.</span>
                  {smsStats.isTurkish && (
                    <span className="text-amber-500 font-medium">Türkçe karakter içeriyor</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between mt-4 pt-5 border-t border-slate-100 dark:border-white/5 w-full box-border">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <ShieldCheck size={16} className="text-emerald-500 shrink-0" />
                  <span>Güvenli NetGSM Şifreli Gönderim</span>
                </div>

                <button
                  type="submit"
                  disabled={sendingState !== 'idle' || !title.trim() || !message.trim()}
                  className="flex items-center justify-center gap-2 px-7 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 dark:disabled:bg-[#1e293b] text-white disabled:text-slate-400 dark:disabled:text-slate-600 text-[13.5px] font-bold rounded-xl transition-all shadow-md shadow-blue-600/20 disabled:shadow-none cursor-pointer"
                >
                  <Send size={15} />
                  <span>{channel === 'sms' ? 'NetGSM SMS Gönder' : channel === 'push' ? 'Bildirim Yayınla' : 'SMS ve Bildirim Gönder'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {showConfigModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-blue-500" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">NetGSM API Yapılandırması</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">NetGSM Kullanıcı Kodu (Usercode / Abone No)</label>
                <input
                  type="text"
                  value={netgsmConfig.usercode}
                  onChange={e => setNetgsmConfig(prev => ({ ...prev, usercode: e.target.value }))}
                  placeholder="Örn: 850xxxxxxx veya 212xxxxxxx"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">NetGSM API Şifresi (Password)</label>
                <input
                  type="password"
                  value={netgsmConfig.password}
                  onChange={e => setNetgsmConfig(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="NetGSM API Şifreniz"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">SMS Başlığı (Originator / Gönderici Adı)</label>
                <input
                  type="text"
                  value={netgsmConfig.header}
                  onChange={e => setNetgsmConfig(prev => ({ ...prev, header: e.target.value.toUpperCase() }))}
                  placeholder="Örn: BOGAZICI veya IALMOBIL"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/5">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">QR Turnike / Kapı Geçiş SMS'i</span>
                  <span className="text-[10.5px] text-slate-400">Öğrenci giriş-çıkışında veliye anında SMS ilet</span>
                </div>
                <input
                  type="checkbox"
                  checked={netgsmConfig.autoGateSms}
                  onChange={e => setNetgsmConfig(prev => ({ ...prev, autoGateSms: e.target.checked }))}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={configSaving}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-xs cursor-pointer"
                >
                  {configSaving ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PushNotificationAdminView;
