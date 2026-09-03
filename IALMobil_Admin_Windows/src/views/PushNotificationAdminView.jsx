import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Send, Smartphone, Users, UserCheck, ShieldCheck, Layers,
  RefreshCw, Settings, Wallet, History, Save, AlertCircle
} from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { netgsmService, calculateSmsParts, formatPhoneNumber } from '../services/netgsmService';
import {
  Panel, PanelHeader, PanelFooter, Button, IconButton, Field, FieldRows,
  Input, Textarea, Switch, Badge, StatStrip, Stat,
  EmptyState, Modal, Toast
} from '../components/ui/panel';
import { cx, eyebrow, hairline, divider } from '../components/ui/tokens';

const TARGET_OPTIONS = [
  { id: 'all_parents', label: 'Veliler', icon: Users, desc: 'Kayıtlı veli telefonları' },
  { id: 'all_students', label: 'Öğrenciler', icon: UserCheck, desc: 'Öğrenci cep telefonları' },
  { id: 'all_teachers', label: 'Öğretmenler', icon: Layers, desc: 'Öğretmen kadrosu' },
  { id: 'all_personnel', label: 'Personel', icon: ShieldCheck, desc: 'İdari ve kurum personeli' },
  { id: 'custom_numbers', label: 'Özel liste', icon: Smartphone, desc: 'Manuel girilen numaralar' }
];

const TEMPLATES = [
  { name: 'Kar tatili', title: 'Kar Tatili Bilgilendirmesi', message: 'Sayın Velimiz,\n\nOlumsuz hava koşulları nedeniyle okulumuzda eğitim-öğretime 1 gün süreyle ara verilmiştir.\n\nBoğaziçi Koleji' },
  { name: 'Veli toplantısı', title: 'Dönem Veli Toplantısı', message: 'Sayın Velimiz,\n\nÖğrencimizin akademik ve sosyal gelişimini değerlendirmek üzere veli toplantımız bu hafta sonu yapılacaktır. Katılımınızı rica ederiz.\n\nBoğaziçi Koleji' },
  { name: 'Sınav takvimi', title: 'Yazılı Sınav Takvimi', message: 'Sayın Velimiz,\n\nÖğrencilerimizin 1. Dönem ortak yazılı sınav takvimi yayınlanmıştır. Detaylı bilgi için mobil uygulamamızı inceleyebilirsiniz.\n\nBoğaziçi Koleji' },
  { name: 'Genel duyuru', title: 'Önemli Duyuru', message: 'Sayın Velimiz,\n\nKurumumuzdaki etkinlik ve bilgilendirme detaylarına mobil uygulamamız üzerinden ulaşabilirsiniz.\n\nBoğaziçi Koleji' },
  { name: 'Yarıyıl tatili', title: 'Yarıyıl Tatili', message: 'Sayın Velimiz,\n\nYarıyıl tatili başlamıştır. Yeni dönemde görüşmek üzere, iyi tatiller dileriz.\n\nBoğaziçi Koleji' },
  { name: 'Acil bilgilendirme', title: 'Acil Bilgilendirme', message: 'Sayın Velimiz,\n\nKurum bünyesinde meydana gelen durum hakkında bilgilendirme yapılacaktır. Lütfen iletişim kanallarımızı takip ediniz.\n\nBoğaziçi Koleji' }
];

const nf = new Intl.NumberFormat('tr-TR');

const PushNotificationAdminView = () => {
  // Mesaj her zaman hem uygulama bildirimi hem SMS olarak gider.
  const channel = 'both';
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
  const [toast, setToast] = useState({ open: false, message: '', tone: 'success' });

  const flash = useCallback((tone, msg) => {
    setToast({ open: true, message: msg, tone });
    setTimeout(() => setToast(t => ({ ...t, open: false })), 4000);
  }, []);

  const smsStats = useMemo(() => {
    const fullText = title ? `${title}\n\n${message}` : message;
    return calculateSmsParts(fullText);
  }, [title, message]);

  const customPhoneList = useMemo(
    () => [...new Set(customPhones.split(/[\n,;]+/).map(formatPhoneNumber).filter(Boolean))],
    [customPhones]
  );

  const effectiveRecipients = targetGroup === 'custom_numbers' ? customPhoneList.length : recipientCount;
  const isBusy = sendingState === 'fetching' || sendingState === 'sending';

  const loadNetgsmConfig = useCallback(async () => {
    const cfg = await netgsmService.getConfig();
    setNetgsmConfig(cfg);
  }, []);

  const fetchRecentLogs = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'sms_logs'), orderBy('timestamp', 'desc'), limit(8)));
      const logs = [];
      snap.forEach(d => logs.push({ id: d.id, ...d.data() }));
      setRecentLogs(logs);
    } catch (err) {
      console.warn('SMS geçmişi okunamadı:', err?.message);
    }
  }, []);

  useEffect(() => {
    loadNetgsmConfig();
    fetchRecentLogs();
  }, [loadNetgsmConfig, fetchRecentLogs]);

  useEffect(() => {
    if (targetGroup === 'custom_numbers') return undefined;
    let cancelled = false;
    setLoadingRecipients(true);
    netgsmService.getRecipientsByRole(targetGroup)
      .then(list => { if (!cancelled) setRecipientCount(list.length); })
      .catch(err => console.warn('Alıcı sayısı alınamadı:', err?.message))
      .finally(() => { if (!cancelled) setLoadingRecipients(false); });
    return () => { cancelled = true; };
  }, [targetGroup]);

  // Gönderim ilerlemesi: gerçek adım bilinmediği için kademeli olarak yaklaşır.
  useEffect(() => {
    let interval;
    if (sendingState === 'fetching') {
      setProgressPercent(15);
      interval = setInterval(() => setProgressPercent(p => (p < 45 ? p + 3 : p)), 50);
    } else if (sendingState === 'sending') {
      interval = setInterval(() => setProgressPercent(p => (p < 92 ? p + 1 : p)), 40);
    } else if (sendingState === 'success') {
      setProgressPercent(100);
    } else {
      setProgressPercent(0);
    }
    return () => clearInterval(interval);
  }, [sendingState]);

  const fetchBalance = async () => {
    setLoadingBalance(true);
    try {
      const res = await netgsmService.getBalance();
      setBalance(res.success && res.balance !== undefined ? res.balance : null);
      if (!res.success) flash('error', 'Bakiye alınamadı. NetGSM ayarlarını kontrol edin.');
    } catch (err) {
      setBalance(null);
      flash('error', `Bakiye alınamadı: ${err?.message || 'bağlantı hatası'}`);
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setConfigSaving(true);
    try {
      await netgsmService.saveConfig(netgsmConfig);
      setShowConfigModal(false);
      await loadNetgsmConfig();
      flash('success', 'NetGSM ayarları kaydedildi.');
    } catch (err) {
      flash('error', `Ayarlar kaydedilemedi: ${err.message}`);
    } finally {
      setConfigSaving(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    setSendingState('fetching');
    setStatusMessage('Alıcı listesi hazırlanıyor…');

    try {
      let targetPhones = targetGroup === 'custom_numbers'
        ? customPhoneList
        : (await netgsmService.getRecipientsByRole(targetGroup)).map(r => r.phone);

      targetPhones = [...new Set(targetPhones)];

      if (targetPhones.length === 0) {
        throw new Error('Gönderilecek geçerli bir telefon numarası bulunamadı.');
      }

      setSendingState('sending');
      setStatusMessage(`${nf.format(targetPhones.length)} alıcıya iletiliyor…`);

      await addDoc(collection(db, 'global_notifications'), {
          title,
          message,
          target: targetGroup,
          channel,
          timestamp: serverTimestamp(),
          sender: localStorage.getItem('adminName') || 'Sistem Yöneticisi',
        readBy: []
      });

      const smsResult = await netgsmService.sendSms({ phones: targetPhones, title, message });
      if (!smsResult?.success) {
        throw new Error(smsResult?.error || 'SMS gönderilemedi.');
      }

      setSendingState('success');
      setStatusMessage('Gönderim tamamlandı.');
      flash('success', `Mesaj ${nf.format(targetPhones.length)} alıcıya iletildi.`);
      fetchRecentLogs();

      setTimeout(() => {
        setSendingState('idle');
        setTitle('');
        setMessage('');
        setCustomPhones('');
      }, 1800);
    } catch (error) {
      setSendingState('error');
      setStatusMessage(error.message || 'Gönderim sırasında hata oluştu.');
      flash('error', error.message || 'Gönderim sırasında hata oluştu.');
      setTimeout(() => setSendingState('idle'), 3000);
    }
  };

  const lastSent = recentLogs[0]?.timestamp?.toDate
    ? recentLogs[0].timestamp.toDate().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
    : '—';

  const canSend = Boolean(title.trim() && message.trim()) && !isBusy && effectiveRecipients > 0;

  return (
    <div className="w-full flex flex-col gap-5 pb-2">
      <Toast open={toast.open} message={toast.message} tone={toast.tone} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[27px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
            Bildirimler
          </h1>
          <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400">
            Uygulama bildirimi ve NetGSM SMS ile toplu mesaj gönderimi
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button icon={Wallet} onClick={fetchBalance} disabled={loadingBalance}>
            {balance !== null ? `${nf.format(balance)} kredi` : 'Bakiyeyi getir'}
          </Button>
          <IconButton
            label="NetGSM ayarları"
            icon={Settings}
            variant="secondary"
            onClick={() => setShowConfigModal(true)}
          />
        </div>
      </header>

      <StatStrip>
        <Stat
          label="SMS kredisi"
          value={balance !== null ? nf.format(balance) : '—'}
          hint={netgsmConfig.header ? `başlık: ${netgsmConfig.header}` : 'başlık tanımsız'}
          tone={balance !== null && balance < 100 ? 'danger' : 'default'}
        />
        <Stat
          label="Alıcı"
          value={loadingRecipients ? '…' : nf.format(effectiveRecipients)}
          hint={TARGET_OPTIONS.find(t => t.id === targetGroup)?.label}
        />
        <Stat
          label="SMS parçası"
          value={smsStats.smsCount}
          hint={`${smsStats.length} karakter${smsStats.isTurkish ? ' · TR karakter' : ''}`}
          tone={smsStats.smsCount > 3 ? 'danger' : 'default'}
        />
        <Stat label="Son gönderim" value={lastSent} hint={`${recentLogs.length} kayıt`} last />
      </StatStrip>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-5">
        {/* Hedef kitle */}
        <Panel className="h-full">
          <PanelHeader title="Hedef" description="Mesajın kime gideceğini seçin" />

          <div className="p-2">
            <div className="flex flex-col gap-1">
                {TARGET_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const active = targetGroup === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTargetGroup(opt.id)}
                      className={cx(
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors',
                        active
                          ? 'bg-[#991b1b]/[0.08] dark:bg-rose-500/10'
                          : 'hover:bg-slate-100 dark:hover:bg-white/[0.05]'
                      )}
                    >
                      <Icon
                        size={15}
                        strokeWidth={1.9}
                        className={cx(
                          'shrink-0',
                          active ? 'text-[#991b1b] dark:text-rose-300' : 'text-slate-400 dark:text-slate-500'
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cx(
                            'block text-[13px] font-medium truncate',
                            active ? 'text-[#991b1b] dark:text-rose-300' : 'text-slate-800 dark:text-slate-100'
                          )}
                        >
                          {opt.label}
                        </span>
                        <span className="block text-[11.5px] text-slate-500 dark:text-slate-400 truncate">
                          {opt.desc}
                        </span>
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>

          {targetGroup === 'custom_numbers' && (
            <FieldRows className={cx('border-t', hairline)}>
              <Field
                label="Numaralar"
                stacked
                hint={`Satır, virgül veya noktalı virgülle ayırın. ${customPhoneList.length} geçerli numara.`}
              >
                <Textarea
                  rows={4}
                  value={customPhones}
                  onChange={(e) => setCustomPhones(e.target.value)}
                  placeholder={'05321234567\n05339876543'}
                  className="tnum"
                />
              </Field>
            </FieldRows>
          )}
        </Panel>

        {/* Mesaj */}
        <form onSubmit={handleSend} className="min-w-0 flex flex-col">
          <Panel className="flex-1">
            <PanelHeader title="Mesaj" description="Şablon seçebilir veya kendi metninizi yazabilirsiniz" />

            <div className={cx('flex flex-wrap gap-1.5 px-5 py-3 border-b', hairline)}>
              {TEMPLATES.map(tpl => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => { setTitle(tpl.title); setMessage(tpl.message); }}
                  className="h-7 px-2.5 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[12px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.08] hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  {tpl.name}
                </button>
              ))}
            </div>

            <FieldRows>
              <Field label="Başlık" stacked htmlFor="notif-title">
                <Input
                  id="notif-title"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Kar Tatili Bilgilendirmesi"
                />
              </Field>

              <Field
                label="Mesaj"
                stacked
                hint={`${smsStats.length} karakter · ${smsStats.smsCount} SMS parçası · bu parçada ${smsStats.remainingInCurrent} karakter kaldı`}
              >
                <Textarea
                  rows={9}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Mesaj metnini yazın"
                />
              </Field>
            </FieldRows>

            {isBusy && (
              <div className={cx('px-5 py-3 border-t', hairline)}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-[12px] text-slate-600 dark:text-slate-300">{statusMessage}</span>
                  <span className="text-[12px] text-slate-500 dark:text-slate-400 tnum">{progressPercent}%</span>
                </div>
                <div className="h-[3px] rounded-full bg-slate-100 dark:bg-white/[0.07] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#991b1b] dark:bg-rose-400 transition-[width] duration-200"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            <PanelFooter className="mt-auto">
              <span className="text-[11.5px] text-slate-500 dark:text-slate-400">
                {effectiveRecipients === 0
                  ? 'Bu hedefte geçerli numara yok'
                  : `${nf.format(effectiveRecipients)} alıcı · uygulama bildirimi + SMS`}
              </span>
              <Button
                type="submit"
                variant="primary"
                disabled={!canSend}
                icon={isBusy ? RefreshCw : Send}
              >
                {isBusy ? 'Gönderiliyor…' : 'Gönder'}
              </Button>
            </PanelFooter>
          </Panel>
        </form>
      </div>

      {/* Geçmiş */}
      <Panel>
        <PanelHeader title="Son Gönderimler" description="NetGSM üzerinden iletilen toplu mesajlar">
          <IconButton label="Yenile" icon={RefreshCw} variant="secondary" onClick={fetchRecentLogs} />
        </PanelHeader>

        {recentLogs.length === 0 ? (
          <EmptyState
            icon={History}
            title="Gönderim kaydı yok"
            description="Gönderdiğiniz toplu mesajlar burada listelenir."
          />
        ) : (
          <div className="overflow-x-auto panel-scroll">
            <div className="min-w-[620px]">
              <div className={cx('grid grid-cols-[130px_minmax(0,1fr)_100px_120px] gap-4 px-5 py-2.5 border-b bg-slate-50/70 dark:bg-white/[0.02]', hairline)}>
                <span className={eyebrow}>Tarih</span>
                <span className={eyebrow}>Başlık</span>
                <span className={cx(eyebrow, 'text-right')}>Alıcı</span>
                <span className={eyebrow}>Durum</span>
              </div>

              <div className={cx('divide-y', divider)}>
                {recentLogs.map(log => (
                  <div
                    key={log.id}
                    className="grid grid-cols-[130px_minmax(0,1fr)_100px_120px] gap-4 px-5 py-3 items-center hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                  >
                    <span className="text-[12.5px] text-slate-500 dark:text-slate-400 tnum">
                      {log.timestamp?.toDate
                        ? log.timestamp.toDate().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] text-slate-800 dark:text-slate-100 truncate">
                        {log.title || 'Toplu SMS'}
                      </span>
                      <span
                        className={cx(
                          'block mt-0.5 text-[11.5px] truncate',
                          log.error ? 'text-[#991b1b] dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'
                        )}
                        title={log.error || undefined}
                      >
                        {log.error
                          || (log.status === 'unknown' ? 'Sunucu onay kimliği döndürmedi' : null)
                          || log.sender
                          || 'Sistem'}
                      </span>
                    </span>
                    <span className="text-[13px] text-right text-slate-700 dark:text-slate-200 tnum">
                      {nf.format(log.recipientCount || 0)}
                    </span>
                    <span>
                      <Badge
                        tone={
                          log.status === 'delivered' ? 'success'
                            : log.status === 'unknown' ? 'warning'
                            : 'danger'
                        }
                      >
                        {log.status === 'delivered' ? 'İletildi'
                          : log.status === 'unknown' ? 'Doğrulanmadı'
                          : 'Başarısız'}
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Panel>

      {/* NetGSM ayarları */}
      <Modal
        open={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        title="NetGSM Ayarları"
        description="SMS altyapısı kimlik bilgileri"
        width="max-w-lg"
        footer={
          <>
            <Button type="button" onClick={() => setShowConfigModal(false)}>Vazgeç</Button>
            <Button
              type="submit"
              form="netgsm-form"
              variant="primary"
              disabled={configSaving}
              icon={configSaving ? RefreshCw : Save}
            >
              {configSaving ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </>
        }
      >
        <form id="netgsm-form" onSubmit={handleSaveConfig}>
          <FieldRows>
            <Field label="Kullanıcı kodu" hint="NetGSM abone numaranız.">
              <Input
                type="text"
                value={netgsmConfig.usercode}
                onChange={e => setNetgsmConfig(prev => ({ ...prev, usercode: e.target.value }))}
                placeholder="8503021234"
                className="tnum"
              />
            </Field>

            <Field label="Şifre" hint="Şifreli olarak saklanır.">
              <Input
                type="password"
                value={netgsmConfig.password}
                onChange={e => setNetgsmConfig(prev => ({ ...prev, password: e.target.value }))}
                placeholder="••••••••"
              />
            </Field>

            <Field label="Gönderici başlığı" hint="NetGSM panelinde onaylı başlık olmalıdır.">
              <Input
                type="text"
                value={netgsmConfig.header}
                onChange={e => setNetgsmConfig(prev => ({ ...prev, header: e.target.value.toUpperCase() }))}
                placeholder="BOGAZICI"
              />
            </Field>

            <Field label="Otomatik geçiş SMS'i">
              <Switch
                id="auto-gate-sms"
                checked={Boolean(netgsmConfig.autoGateSms)}
                onChange={e => setNetgsmConfig(prev => ({ ...prev, autoGateSms: e.target.checked }))}
                label="Turnike geçişlerinde veliye SMS gönder"
                description="Öğrenci giriş/çıkış yaptığında veli numarasına otomatik bilgilendirme iletilir."
              />
            </Field>
          </FieldRows>

          {!netgsmConfig.usercode && (
            <div className="flex items-start gap-2 mx-5 mb-5 px-3.5 py-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-[12.5px] text-amber-800 dark:text-amber-300">
              <AlertCircle size={15} className="shrink-0 mt-px" />
              <span>Kullanıcı kodu girilmeden SMS gönderilemez; yalnızca uygulama bildirimi çalışır.</span>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
};

export default PushNotificationAdminView;
