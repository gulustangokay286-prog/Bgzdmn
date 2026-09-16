import { useState, useEffect, useMemo, useRef } from 'react';
import {
  CalendarX2, AlertTriangle, Clock, FileWarning, ChevronLeft, RefreshCw, LockKeyhole, DoorOpen,
  MessageSquare, MessageSquareOff, CheckSquare, Square, ShieldCheck, Eraser, Undo2, Trash2,
  FileDown, CalendarRange, ChevronRight
} from 'lucide-react';
import { api, soketAl } from '../services/api';
import { vdsUserService } from '../services/vdsUserService';
import StudentSearch from '../components/StudentSearch';
import { attendancePersonId, attendanceDays, summarizeAttendance, attendanceBadge, attendanceSession, watchAttendance } from '../services/attendanceReport';
import { DONEMLER, donemAraligi, donemBasligi, devamsizlikRaporuYazdir } from '../services/attendancePdf';
import { Panel, PanelHeader, Button, IconButton, Badge, Segmented, StatStrip, Stat, EmptyState, Toast, Modal, Input, Select, Textarea } from '../components/ui/panel';
import { cx, hairline, divider } from '../components/ui/tokens';

const ROLE_OPTIONS = [{ id: 'student', label: 'Öğrenci' }, { id: 'teacher', label: 'Öğretmen' }, { id: 'personnel', label: 'Personel' }];
const DURUM_FILTRE = [
  { id: 'tum', label: 'Tüm günler' }, { id: 'yok', label: 'Devamsız' }, { id: 'izinli', label: 'İzinli / raporlu' },
  { id: 'gec', label: 'Geç kalınan' }, { id: 'var', label: 'Mevcut' }, { id: 'sms', label: 'SMS gönderilen' },
];
const TOPLU_ISLEM = {
  izinli:   { baslik: 'Özürlüye çevir',   aciklama: 'Seçili günler izinli / raporlu sayılır; devamsızlık toplamına girmez, o gün veliye eksik mesajı gitmez.', ikon: ShieldCheck, ton: 'primary' },
  mevcut:   { baslik: 'Devamsızlığı sil', aciklama: 'Seçili günlerdeki devamsızlık kaldırılır, gün mevcut sayılır. Geçiş kayıtları silinmez.', ikon: Eraser, ton: 'primary' },
  otomatik: { baslik: 'Otomatiğe döndür', aciklama: 'İdare kaydı kaldırılır; gün yeniden geçişlerden hesaplanır.', ikon: Undo2, ton: 'secondary' },
};
const SMS_TUR = { gate: 'Geçiş', absence: 'Devamsızlık', correction: 'Düzeltme', broadcast: 'Duyuru' };

const count = value => value.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const dateLabel = date => new Date(String(date).slice(0, 10) + 'T12:00:00+03:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
const timeLabel = date => new Date(date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
const sourceLabel = row => row.kilitli ? 'İdare kaydı (kilitli)' : row.kaynak === 'manuel' ? 'Manuel kayıt' : 'Otomatik hesaplama';
const smsGonderilen = row => (row.sms || []).filter(s => s.durum === 'sent');
const shiftDate = (key, donem, yon) => {
  const d = new Date(key + 'T12:00:00+03:00');
  if (donem === 'gun') d.setDate(d.getDate() + yon);
  else if (donem === 'hafta') d.setDate(d.getDate() + 7 * yon);
  else if (donem === 'ay') d.setMonth(d.getMonth() + yon);
  else d.setFullYear(d.getFullYear() + yon);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};

function SessionCell({ row, sessionKey, label }) {
  const session = attendanceSession(row, sessionKey);
  return <div className={cx('flex-1 min-w-0 px-5 py-3 border-r last:border-r-0', hairline)}>
    <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
    <div className="mt-2"><Badge tone={session.tone}>{session.label}</Badge></div>
    <div className="mt-2 text-xs text-slate-500 tabular-nums">Giriş {session.entry || '—'} · Çıkış {session.exit || '—'}</div>
  </div>;
}

/** O gun veliye giden mesajlarin kisa rozeti; ustune gelince dokumu. */
function SmsChip({ row }) {
  const liste = smsGonderilen(row);
  if (!liste.length) return <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><MessageSquareOff size={12} /> SMS yok</span>;
  const dokum = liste.map(s => `${s.saat} · ${SMS_TUR[s.tur] || s.tur} · ${s.ozet}`).join('\n');
  return <span title={dokum} className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
    <MessageSquare size={12} /> {liste.length} SMS
  </span>;
}

function DayDetail({ row, rawRecords, gates, secili, onToggle, onDeleteRaw, busy }) {
  const badge = attendanceBadge(row);
  const raw = rawRecords.filter(r => String(r.tarih).slice(0, 10) === row.tarih);
  const passages = gates.filter(r => String(r.tarih).slice(0, 10) === row.tarih);
  const sms = smsGonderilen(row);
  return <details className={cx('group px-4 py-3', secili && 'bg-rose-50/60 dark:bg-rose-500/[0.06]')}>
    <summary className="cursor-pointer list-none flex flex-wrap items-center gap-3 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400">
      <button type="button" aria-label={secili ? 'Seçimi kaldır' : 'Günü seç'} onClick={e => { e.preventDefault(); e.stopPropagation(); onToggle(row.tarih); }}
        className={cx('shrink-0 rounded p-0.5', secili ? 'text-rose-600' : 'text-slate-300 hover:text-slate-500')}>
        {secili ? <CheckSquare size={18} /> : <Square size={18} />}
      </button>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900 dark:text-white">{dateLabel(row.tarih)}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">{row.kilitli && <LockKeyhole size={12} />}{sourceLabel(row)}</span>
          <span>{row.gecis_sayisi} geçiş</span>
          <SmsChip row={row} />
        </span>
      </span>
      <span className="flex items-center gap-3"><Badge tone={badge.tone}>{badge.label}</Badge><span className="text-xs text-slate-500 group-open:hidden">Detay ▾</span><span className="hidden text-xs text-slate-500 group-open:inline">Kapat ▴</span></span>
    </summary>
    <div className="mt-3 ml-7 space-y-3 text-xs text-slate-600 dark:text-slate-300">
      <p className="m-0">{row.sebep || 'Günlük rapor sonucu'}</p>
      {row.rol === 'ogrenci' && <div className={cx('flex flex-wrap rounded-lg border', hairline)}>
        <SessionCell row={row} sessionKey="sabah" label="Sabah" />
        <SessionCell row={row} sessionKey="ogleden_sonra" label="Öğleden sonra" />
      </div>}
      <div>
        <h3 className="text-xs font-semibold mb-2">Veliye giden SMS</h3>
        {sms.length === 0 ? <p className="m-0 text-slate-400">Bu gün veliye mesaj gönderilmedi.</p> : <ol className="space-y-1 list-none pl-0">
          {sms.map(s => <li key={s.id} className="flex flex-wrap gap-x-2"><span className="tabular-nums font-medium">{s.saat}</span><Badge tone={s.tur === 'absence' ? 'warning' : s.tur === 'correction' ? 'accent' : 'neutral'}>{SMS_TUR[s.tur] || s.tur}</Badge><span className="text-slate-500">{s.ozet}</span></li>)}
        </ol>}
      </div>
      <div>
        <h3 className="text-xs font-semibold mb-2">Geçiş zaman çizelgesi</h3>
        {passages.length === 0 ? <p className="m-0">Bu tarihte geçiş yok.</p> : <ol className="space-y-1 list-none pl-0">
          {[...passages].reverse().map(g => <li key={g.id}>{timeLabel(g.zaman)} · {g.yon === 'giris' ? 'Giriş' : 'Çıkış'} · {g.kaynak}{g.not_ ? ' · ' + g.not_ : ''}</li>)}
        </ol>}
      </div>
      <details className={cx('rounded-lg border p-3', hairline)}>
        <summary className="cursor-pointer">Ham devamsızlık kayıtları ({raw.length})</summary>
        <p className="mt-2">Denetim geçmişi; yukarıdaki toplama tekrar eklenmez. Bir satırı silersen gün yeniden hesaplanır.</p>
        {raw.map(r => <div key={r.id} className="my-2 flex flex-wrap items-center gap-2">
          <span>#{r.id} · {r.durum} · {count(Number(r.agirlik) || 0)} gün · {r.otomatik ? 'Otomatik' : 'Manuel'} · {r.sebep || 'Sebep belirtilmemiş'}</span>
          <button type="button" disabled={busy} onClick={() => onDeleteRaw(r)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:hover:bg-rose-500/10"><Trash2 size={12} /> Sil</button>
        </div>)}
      </details>
    </div>
  </details>;
}

export default function AttendanceAdminView() {
  const [viewMode, setViewMode] = useState('student');
  const [allUsers, setAllUsers] = useState([]);
  const [usersState, setUsersState] = useState({ loading: true, error: '' });
  const [selection, setSelection] = useState(null);
  const [result, setResult] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', tone: 'success' });
  const [donem, setDonem] = useState('ay');
  const [referans, setReferans] = useState(todayKey);
  const [durumFiltre, setDurumFiltre] = useState('tum');
  const [secili, setSecili] = useState(() => new Set());
  const [topluDialog, setTopluDialog] = useState(null);   // { islem }
  const [topluSebep, setTopluSebep] = useState('');
  const [manuelTarih, setManuelTarih] = useState(todayKey);
  const [manuelSebep, setManuelSebep] = useState('');
  const watcher = useRef(null);
  const personId = attendancePersonId(selection?.id);

  const bildir = (message, tone = 'success') => {
    setToast({ open: true, message, tone });
    setTimeout(() => setToast(t => ({ ...t, open: false })), tone === 'error' ? 6000 : 3500);
  };

  useEffect(() => {
    let active = true;
    const off = vdsUserService.subscribe(users => { if (active) setAllUsers(users); });
    vdsUserService.fetchAllUsers(true).then(() => {
      if (active) setUsersState({ loading: false, error: '' });
    }).catch(() => {
      if (active) setUsersState({ loading: false, error: 'Kişi listesi alınamadı.' });
    });
    return () => { active = false; off(); };
  }, []);

  const users = useMemo(() => allUsers.filter(user => {
    if (user.aktif === false || user.active === false) return false;
    const role = String(user.role || user.fields?.role?.stringValue || '').toLowerCase();
    const roles = [...(Array.isArray(user.roles) ? user.roles : []), role];
    if (viewMode === 'student') return roles.some(r => ['student', 'ogrenci', 'öğrenci'].includes(r));
    if (viewMode === 'teacher') return roles.some(r => ['teacher', 'ogretmen', 'öğretmen'].includes(r));
    return roles.some(r => ['personel', 'personnel', 'staff', 'admin', 'idare'].includes(r));
  }), [allUsers, viewMode]);

  const seciliKisi = useMemo(() => allUsers.find(u => attendancePersonId(u.id || u.name) === personId), [allUsers, personId]);

  useEffect(() => {
    if (!personId) return;
    const subscription = watchAttendance({ api, socket: soketAl(), personId,
      onData: data => setResult({ personId, data, error: '' }),
      onError: error => setResult(previous => ({ personId, data: previous?.personId === personId ? previous.data : null, error: error.message })),
    });
    watcher.current = subscription;
    return () => { subscription.stop(); watcher.current = null; };
  }, [personId]);

  const current = result?.personId === personId ? result : null;
  const data = current?.data;
  const loading = Boolean(personId && !current);
  const days = useMemo(() => attendanceDays(data?.kayitlar), [data]);
  const summary = useMemo(() => summarizeAttendance(days), [days]);
  const smsGunSayisi = useMemo(() => days.filter(r => smsGonderilen(r).length).length, [days]);
  const today = days.find(row => row.tarih === data?.bugun);
  const roleLabel = ROLE_OPTIONS.find(role => role.id === viewMode).label;
  const totalsAvailable = Boolean(data && !current?.error);

  const aralik = useMemo(() => donemAraligi(donem, referans), [donem, referans]);
  const gorunenGunler = useMemo(() => days.filter(r => {
    if (r.tarih < aralik[0] || r.tarih > aralik[1]) return false;
    if (durumFiltre === 'yok') return r.durum === 'yok';
    if (durumFiltre === 'izinli') return r.durum === 'izinli';
    if (durumFiltre === 'gec') return r.durum === 'gec' || r.gec_kalan?.length;
    if (durumFiltre === 'var') return r.durum === 'var' || r.durum === 'gec';
    if (durumFiltre === 'sms') return smsGonderilen(r).length > 0;
    return true;
  }), [days, aralik, durumFiltre]);
  const donemOzet = useMemo(() => summarizeAttendance(gorunenGunler), [gorunenGunler]);

  const toggle = tarih => setSecili(prev => { const n = new Set(prev); n.has(tarih) ? n.delete(tarih) : n.add(tarih); return n; });
  const hepsiniSec = () => setSecili(new Set(gorunenGunler.filter(r => r.durum !== 'beklemede' && r.durum !== 'kapali').map(r => r.tarih)));
  const secimiTemizle = () => setSecili(new Set());

  const manuelKayit = async (isHalfDay, isExcused) => {
    if (!personId || !totalsAvailable) return;
    if (manuelTarih > todayKey()) return bildir('Gelecek tarihe kayıt yazılamaz.', 'error');
    setIsSaving(true);
    try {
      await api.post('/api/devamsizlik', { ogrenciId: personId, tarih: manuelTarih,
        durum: isExcused ? 'izinli' : 'yok', dersSaati: null,
        agirlik: isExcused ? 0 : isHalfDay ? 0.5 : 1,
        sebep: manuelSebep.trim() || (isExcused ? 'Tam gün (raporlu / izinli)' : isHalfDay ? 'Yarım gün yok (özürsüz)' : 'Tam gün yok (özürsüz)'), otomatik: false });
      bildir(`${dateLabel(manuelTarih)} için kayıt yazıldı.`);
      setManuelSebep('');
      await watcher.current?.refresh();
    } catch (error) { bildir('Kayıt eklenemedi: ' + (error?.mesaj || error?.message), 'error'); }
    finally { setIsSaving(false); }
  };

  const topluUygula = async () => {
    if (!topluDialog || !secili.size) return;
    setIsSaving(true);
    try {
      const r = await api.post('/api/devamsizlik/toplu', { ogrenciId: personId, tarihler: [...secili], islem: topluDialog.islem, sebep: topluSebep.trim() });
      bildir(`${TOPLU_ISLEM[topluDialog.islem].baslik}: ${r?.sonuc?.length || secili.size} gün işlendi.`);
      setTopluDialog(null); setTopluSebep(''); setSecili(new Set());
      await watcher.current?.refresh();
    } catch (error) { bildir('İşlem yapılamadı: ' + (error?.mesaj || error?.message), 'error'); }
    finally { setIsSaving(false); }
  };

  const hamSil = async r => {
    if (!window.confirm(`#${r.id} kaydı silinsin mi? Gün yeniden hesaplanır.`)) return;
    setIsSaving(true);
    try {
      await api.del(`/api/devamsizlik/${r.id}`);
      bildir('Kayıt silindi, gün yeniden hesaplandı.');
      await watcher.current?.refresh();
    } catch (error) { bildir('Silinemedi: ' + (error?.mesaj || error?.message), 'error'); }
    finally { setIsSaving(false); }
  };

  const pdfUret = () => {
    try {
      const f = seciliKisi?.fields || {};
      devamsizlikRaporuYazdir({
        ad: selection?.name || f.full_name?.stringValue || 'Öğrenci',
        okulNo: f.school_number?.stringValue || seciliKisi?.school_number || '',
        sinif: f.branch?.stringValue || f.class_id?.stringValue || seciliKisi?.branch || '',
        donem, referans, gunler: days,
      });
    } catch (e) { bildir(e.message, 'error'); }
  };

  return <div className="w-full flex flex-col gap-5 pb-2">
    <Toast {...toast} />
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="m-0 text-[27px] leading-none font-semibold tracking-tight text-slate-900 dark:text-white">Devamsızlık</h1>
        <p className="m-0 mt-2 text-xs text-slate-500 dark:text-slate-400">Günlük raporla ortak canlı sonuçlar · gün seçip toplu düzeltme · dönem bazlı PDF dökümü</p></div>
      <Segmented value={viewMode} onChange={mode => { setViewMode(mode); setSelection(null); }} options={ROLE_OPTIONS} />
    </header>
    <div data-testid="attendance-panels" className={cx('grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-stretch', personId ? 'lg:h-[calc(100dvh-190px)] lg:min-h-[540px]' : 'h-[360px]')}>
      <Panel data-testid="attendance-list" className={cx('h-full min-h-0 overflow-hidden', personId && 'hidden lg:flex')}>
        {usersState.loading ? <div className="p-5 text-sm text-slate-500">Kişiler yükleniyor…</div>
          : usersState.error ? <p role="alert" className="p-5 text-sm text-red-500">{usersState.error}</p>
            : <StudentSearch users={users} selectedId={selection?.id} viewMode={viewMode} onSelect={(id, name) => {
              if (attendancePersonId(id) === personId) { watcher.current?.refresh(); return; }
              setSelection({ id, name }); setResult(null); setSecili(new Set());
            }} />}
      </Panel>
      <div data-testid="attendance-detail" className={cx('h-full min-h-0 min-w-0 flex flex-col gap-4 lg:overflow-y-auto panel-scroll', !personId && 'hidden lg:flex')}>
        {!personId ? <Panel className="h-full flex items-center justify-center"><EmptyState icon={CalendarX2} title={roleLabel + ' seçin'} description="Gerçek devamsızlık toplamı, geçiş geçmişi ve veliye giden SMS'ler için soldaki listeden bir kişi seçin." /></Panel> : <>
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0"><IconButton label="Listeye dön" icon={ChevronLeft} onClick={() => setSelection(null)} className="lg:hidden" />
              <div className="min-w-0"><h2 className="m-0 text-lg font-semibold text-slate-900 dark:text-white truncate">{selection.name}</h2>
                <p className="m-0 mt-1 text-xs text-slate-500">{data ? 'Son güncelleme ' + timeLabel(data.guncellendi) + ' · Canlı' : 'Kayıt geçmişi yükleniyor…'}</p></div></div>
            <div className="flex items-center gap-2">
              <Button variant="primary" icon={FileDown} disabled={!totalsAvailable} onClick={pdfUret}>PDF · {DONEMLER.find(d => d.id === donem)?.label}</Button>
              <IconButton label="Yoklamayı yenile" icon={RefreshCw} onClick={() => watcher.current?.refresh()} />
            </div>
          </div>
          {current?.error && <div role="alert" className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">Veriler güncellenemedi: {current.error} Sonuçlar sıfır kabul edilmedi. Yenile düğmesiyle tekrar deneyin.{data && ' Aşağıdaki geçmiş son başarılı okumadır.'}</div>}
          <div className="shrink-0"><StatStrip>
            <Stat label="Özürsüz" value={totalsAvailable ? count(summary.absent) : '—'} hint="gün · tüm kayıtlar" tone={summary.absent > 0 ? 'danger' : 'default'} />
            <Stat label="Raporlu / izinli" value={totalsAvailable ? count(summary.excused) : '—'} hint="gün" />
            <Stat label="Geç kalınan gün" value={totalsAvailable ? summary.late : '—'} />
            <Stat label="SMS gönderilen gün" value={totalsAvailable ? smsGunSayisi : '—'} hint={data ? `${(data.sms_gecmisi || []).filter(s => s.durum === 'sent').length} mesaj` : ''} last />
          </StatStrip></div>
          {today && <Panel className="shrink-0"><PanelHeader title="Bugünkü durum" description={dateLabel(today.tarih)}>
            <span className="flex items-center gap-3"><SmsChip row={today} /><Badge tone={attendanceBadge(today).tone}>{attendanceBadge(today).label}</Badge></span></PanelHeader>
            <div className="flex flex-wrap">{today.rol === 'ogrenci' ? <>
              <SessionCell row={today} sessionKey="sabah" label="Sabah" /><SessionCell row={today} sessionKey="ogleden_sonra" label="Öğleden sonra" />
            </> : <div className="flex-1 p-5 text-sm text-slate-500">{today.sebep || attendanceBadge(today).label}</div>}
              <div className="px-5 py-3 text-xs text-slate-500"><div>Konum</div><div className="mt-2 flex items-center gap-1 text-slate-800 dark:text-white"><DoorOpen size={14} />{today.iceride ? 'Kurum içinde' : 'Kurum dışında'}</div></div>
            </div>
          </Panel>}
          <Panel className="shrink-0"><PanelHeader title="Manuel kayıt" description="Seçtiğin tarih için idare kaydı yazar; otomatik hesabı ezer. Veliye SMS gitmez." />
            <div className="flex flex-wrap items-end gap-2 px-5 py-3">
              <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-500">Tarih<Input type="date" max={todayKey()} value={manuelTarih} onChange={e => setManuelTarih(e.target.value)} className="tabular-nums max-w-[170px]" /></label>
              <label className="flex flex-1 min-w-[200px] flex-col gap-1 text-[11px] font-medium text-slate-500">Açıklama (isteğe bağlı)<Input value={manuelSebep} onChange={e => setManuelSebep(e.target.value)} placeholder="Örn. Sağlık raporu, veli dilekçesi…" /></label>
              <Button icon={AlertTriangle} disabled={isSaving || !totalsAvailable} onClick={() => manuelKayit(false, false)}>Tam gün yok (1)</Button>
              <Button icon={Clock} disabled={isSaving || !totalsAvailable} onClick={() => manuelKayit(true, false)}>Yarım gün yok (0,5)</Button>
              <Button icon={FileWarning} disabled={isSaving || !totalsAvailable} onClick={() => manuelKayit(false, true)}>Rapor / izin</Button>
            </div></Panel>
          <Panel className="shrink-0">
            <PanelHeader title="Günlük sonuçlar" description={`${donemBasligi(donem, aralik)} · ${gorunenGunler.length} gün · bu dönemde ${count(donemOzet.absent)} özürsüz, ${donemOzet.excused} izinli`}>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented value={donem} onChange={d => { setDonem(d); setSecili(new Set()); }} options={DONEMLER} />
                {donem !== 'tum' && <span className="inline-flex items-center gap-1">
                  <IconButton label="Önceki dönem" icon={ChevronLeft} onClick={() => setReferans(r => shiftDate(r, donem, -1))} />
                  <Input type="date" value={referans} max={todayKey()} onChange={e => e.target.value && setReferans(e.target.value)} className="tabular-nums max-w-[150px]" />
                  <IconButton label="Sonraki dönem" icon={ChevronRight} disabled={referans >= todayKey()} onClick={() => setReferans(r => shiftDate(r, donem, 1))} />
                  <IconButton label="Bugüne dön" icon={CalendarRange} onClick={() => setReferans(todayKey())} />
                </span>}
                <Select dense value={durumFiltre} onChange={e => setDurumFiltre(e.target.value)} className="max-w-[170px]">
                  {DURUM_FILTRE.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </Select>
              </div>
            </PanelHeader>
            <div className={cx('flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs', hairline, secili.size ? 'bg-rose-50/70 dark:bg-rose-500/[0.06]' : 'bg-slate-50/60 dark:bg-white/[0.02]')}>
              <button type="button" onClick={secili.size === gorunenGunler.length && secili.size ? secimiTemizle : hepsiniSec} className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300">
                {secili.size && secili.size === gorunenGunler.length ? <CheckSquare size={15} /> : <Square size={15} />} {secili.size ? `${secili.size} gün seçili` : 'Tümünü seç'}
              </button>
              {secili.size > 0 && <>
                <span className="text-slate-300">|</span>
                {Object.entries(TOPLU_ISLEM).map(([id, t]) => <Button key={id} variant={t.ton} icon={t.ikon} disabled={isSaving} onClick={() => { setTopluSebep(''); setTopluDialog({ islem: id }); }}>{t.baslik}</Button>)}
                <button type="button" onClick={secimiTemizle} className="ml-auto text-slate-500 hover:text-slate-800 dark:hover:text-white">Seçimi temizle</button>
              </>}
            </div>
            {loading ? <div role="status" className="p-5 text-sm text-slate-500">7 Eylül dahil tüm kayıtlı tarihler yükleniyor…</div>
              : !gorunenGunler.length ? <EmptyState icon={CalendarX2} title={current?.error ? 'Yoklama okunamadı' : 'Bu dönemde kayıt yok'} description={days.length ? 'Dönemi ya da süzgeci değiştirin.' : 'Bu durum sıfır devamsızlık anlamına gelmez.'} />
                : <div className={cx('divide-y', divider)}>{gorunenGunler.map(row => <DayDetail key={row.tarih} row={row} rawRecords={data.ham_devamsizlik || []} gates={data.gecisler || []} secili={secili.has(row.tarih)} onToggle={toggle} onDeleteRaw={hamSil} busy={isSaving} />)}</div>}
          </Panel>
        </>}
      </div>
    </div>

    <Modal open={Boolean(topluDialog)} onClose={() => setTopluDialog(null)}
      title={topluDialog ? TOPLU_ISLEM[topluDialog.islem].baslik : ''}
      description={topluDialog ? TOPLU_ISLEM[topluDialog.islem].aciklama : ''}
      footer={<>
        <Button type="button" onClick={() => setTopluDialog(null)}>Vazgeç</Button>
        <Button type="button" variant="primary" disabled={isSaving} icon={topluDialog ? TOPLU_ISLEM[topluDialog.islem].ikon : undefined} onClick={topluUygula}>
          {isSaving ? 'Uygulanıyor…' : `${secili.size} günü uygula`}
        </Button>
      </>}>
      <div className="flex flex-col gap-3">
        <div className={cx('max-h-40 overflow-y-auto rounded-lg border p-3 text-xs', hairline)}>
          {[...secili].sort().map(t => <div key={t} className="flex items-center justify-between py-0.5"><span>{dateLabel(t)}</span><Badge tone={attendanceBadge(days.find(r => r.tarih === t) || {}).tone}>{attendanceBadge(days.find(r => r.tarih === t) || {}).label}</Badge></div>)}
        </div>
        {topluDialog?.islem !== 'otomatik' && <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-500">Açıklama
          <Textarea rows={2} value={topluSebep} onChange={e => setTopluSebep(e.target.value)} placeholder={topluDialog?.islem === 'izinli' ? 'Örn. Sağlık raporu 14–16 Eylül' : 'Örn. Kart okutulmadı, sınıfta bulunduğu öğretmen tarafından teyit edildi'} />
        </label>}
        <p className="m-0 text-[11.5px] text-slate-500">Bu işlemde veliye SMS gönderilmez. Geçiş kayıtları silinmez; yalnızca günün sonucu değişir.</p>
      </div>
    </Modal>
  </div>;
}
