import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  HeartPulse, Stethoscope, Ambulance, UserCheck, Search, X,
  RefreshCw, LogOut, Radar, ShieldAlert, Users
} from 'lucide-react';
import { db } from '../services/firebaseConfig';
import {
  collection, query, where, getDocs, addDoc, doc, setDoc,
  updateDoc, onSnapshot, serverTimestamp
} from 'firebase/firestore';
import { netgsmService } from '../services/netgsmService';
import useAttendanceConfig from '../hooks/useAttendanceConfig';
import { getDateKeyInTimeZone } from '../services/attendanceRules';
import {
  Panel, PanelHeader, PanelFooter, Button, IconButton, Field, FieldRows,
  Input, Textarea, Select, Switch, Badge, Segmented, StatStrip, Stat,
  EmptyState, Modal, Toast
} from '../components/ui/panel';
import { cx, eyebrow, hairline, divider } from '../components/ui/tokens';

const TABS = [
  { id: 'infirmary', label: 'Revir' },
  { id: 'handover', label: 'Veli Teslimi' },
  { id: 'radar', label: 'Kaçak Radarı' }
];

const RELATIONS = ['Anne', 'Baba', 'Vasi', 'Büyükanne / Büyükbaba', 'Kardeş', 'Diğer'];
const HANDOVER_REASONS = [
  'Hastalık / Rahatsızlık',
  'Doktor randevusu',
  'Ailevi sebep',
  'Resmî işlem',
  'Diğer'
];

/**
 * Revirde geçen süre. `nowMs` disaridan verilir ki bilesen her dakika
 * yeniden ciziminde sure guncellensin.
 */
const formatDuration = (admittedAtMs, nowMs) => {
  if (!admittedAtMs) return 'süre yok';
  const mins = Math.max(0, Math.round((nowMs - admittedAtMs) / 60000));
  if (mins < 1) return 'az önce';
  if (mins < 60) return `${mins} dk`;
  return `${Math.floor(mins / 60)} sa ${mins % 60} dk`;
};

/**
 * Ogrenci secici.
 *
 * Bilesen govdesinin ICINDE tanimlanirsa her tus vurusunda yeniden monte olur
 * ve arama kutusu odagi kaybeder; bu yuzden modul duzeyinde durur.
 */
const StudentPicker = ({ term, onTerm, selected, onSelect, placeholder, search }) => (
    <div className="flex flex-col gap-2">
      {selected ? (
        <div className={cx('flex items-center gap-2.5 px-3 py-2 rounded-lg border', hairline)}>
          <span className="w-8 h-8 rounded-full shrink-0 border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/[0.06] overflow-hidden flex items-center justify-center text-slate-400">
            {selected.photo
              ? <img src={selected.photo} alt="" className="w-full h-full object-cover" />
              : <Users size={14} strokeWidth={1.8} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-slate-900 dark:text-white truncate">{selected.name}</span>
            <span className="block text-[11.5px] text-slate-500 dark:text-slate-400 truncate">
              {[selected.className, selected.schoolNumber && `No ${selected.schoolNumber}`].filter(Boolean).join(' · ') || '—'}
            </span>
          </span>
          <IconButton label="Seçimi kaldır" icon={X} onClick={() => onSelect(null)} />
        </div>
      ) : (
        <>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              value={term}
              onChange={(e) => onTerm(e.target.value)}
              placeholder={placeholder}
              className="pl-9"
            />
          </div>
          {term.trim() && (
            <div className={cx('rounded-lg border divide-y max-h-56 overflow-y-auto panel-scroll', hairline, divider)}>
              {search(term).length === 0 ? (
                <p className="m-0 px-3 py-2.5 text-[12.5px] text-slate-500 dark:text-slate-400">Eşleşen öğrenci yok.</p>
              ) : search(term).map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { onSelect(s); onTerm(''); }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
                >
                  <span className="block text-[13px] text-slate-800 dark:text-slate-100 truncate">{s.name}</span>
                  <span className="block text-[11.5px] text-slate-500 dark:text-slate-400 truncate">
                    {[s.className, s.schoolNumber && `No ${s.schoolNumber}`].filter(Boolean).join(' · ') || '—'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

export default function HealthAndSafetyAdminView() {
  const { config } = useAttendanceConfig();
  const dateKey = useMemo(
    () => getDateKeyInTimeZone(new Date(), config.timeZone || 'Europe/Istanbul'),
    [config.timeZone]
  );

  const [activeTab, setActiveTab] = useState('infirmary');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const [toast, setToast] = useState({ open: false, message: '', tone: 'success' });
  const flash = useCallback((tone, message) => {
    setToast({ open: true, message, tone });
    setTimeout(() => setToast(t => ({ ...t, open: false })), 4500);
  }, []);

  /* --- Revir --- */
  const [infirmaryList, setInfirmaryList] = useState([]);
  const [dischargedToday, setDischargedToday] = useState([]);
  const [infirmarySearch, setInfirmarySearch] = useState('');
  const [selectedForInfirmary, setSelectedForInfirmary] = useState(null);
  const [complaint, setComplaint] = useState('');
  const [notifyParentInfirmary, setNotifyParentInfirmary] = useState(true);
  const [admitting, setAdmitting] = useState(false);
  const [emergencyTarget, setEmergencyTarget] = useState(null);

  /* --- Veli teslimi --- */
  const [handoverSearch, setHandoverSearch] = useState('');
  const [selectedForHandover, setSelectedForHandover] = useState(null);
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelation, setGuardianRelation] = useState('Anne');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [handoverReason, setHandoverReason] = useState(HANDOVER_REASONS[0]);
  const [submittingHandover, setSubmittingHandover] = useState(false);
  const [handovers, setHandovers] = useState([]);

  /* --- Kaçak radarı --- */
  const [ghosts, setGhosts] = useState([]);
  const [scanningGhosts, setScanningGhosts] = useState(false);
  const [lastScanAt, setLastScanAt] = useState(null);

  // Revirde bekleme süresi canlı ilerlesin
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      const list = [];
      snap.forEach(d => {
        const data = d.data();
        const role = (data.role || '').toLowerCase();
        if (role !== 'student' && role !== 'öğrenci') return;
        list.push({
          id: d.id,
          name: data.full_name || data.fullName || data.name || data.displayName || 'İsimsiz',
          schoolNumber: data.school_number || data.schoolNumber || '',
          className: data.class_id || data.className || data.grade || data.branch || '',
          parentPhone: data.parent_phone || data.parentPhone || data.veli_telefon || data.phone || '',
          photo: data.profile_image || data.profileImageUrl || data.photoURL || ''
        });
      });
      list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      setStudents(list);
      setLoading(false);
    }, (err) => {
      console.error('Öğrenci listesi okunamadı:', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Bugünün tüm revir kayıtları tek dinleyiciyle gelir; ayrım istemcide yapılır.
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'health_logs'), where('date', '==', dateKey)),
      (snap) => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setInfirmaryList(all.filter(r => r.status === 'in_infirmary'));
        setDischargedToday(all.filter(r => r.status === 'discharged'));
      },
      (err) => console.error('Revir kayıtları okunamadı:', err)
    );
    return () => unsub();
  }, [dateKey]);

  // `orderBy` + `where` bileşik indeks istiyordu ve sorgu sessizce boş dönüyordu;
  // sıralama istemcide yapılır.
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'handover_logs'), where('date', '==', dateKey)),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setHandovers(list);
      },
      (err) => console.error('Teslim kayıtları okunamadı:', err)
    );
    return () => unsub();
  }, [dateKey]);

  /** Kapıda içeride görünüp derste yok yazılanlar. */
  const scanGhosts = useCallback(async () => {
    setScanningGhosts(true);
    try {
      const [gateSnap, attSnap] = await Promise.all([
        getDocs(query(collection(db, 'gate_status'), where('status', '==', 'entry'), where('date', '==', dateKey))),
        getDocs(query(collection(db, 'attendance'), where('date', '==', dateKey), where('status', '==', 'absent')))
      ]);
      const insideIds = new Set(gateSnap.docs.map(d => d.id));

      const found = [];
      attSnap.docs.forEach(d => {
        const att = d.data();
        if (!insideIds.has(att.studentId)) return;
        const student = students.find(s => s.id === att.studentId);
        found.push({
          id: att.studentId,
          name: att.studentName || student?.name || 'Öğrenci',
          className: att.className || student?.className || '—',
          reason: att.courseName || 'Ders yoklamasında yok yazıldı',
          photo: student?.photo || ''
        });
      });
      setGhosts(found);
      setLastScanAt(new Date());
    } catch (err) {
      console.error('Kaçak taraması başarısız:', err);
      flash('error', `Tarama yapılamadı: ${err.message}`);
    }
    setScanningGhosts(false);
  }, [dateKey, students, flash]);

  // Radar sekmesi açılınca otomatik tara
  useEffect(() => {
    if (activeTab === 'radar' && !loading) scanGhosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, loading, dateKey]);

  /** SMS gönderimi kaydı geri almaz; hata yalnızca uyarı olarak bildirilir. */
  const trySms = async ({ phones, message, title }) => {
    if (!phones?.[0]) return { sent: false, reason: 'telefon yok' };
    try {
      await netgsmService.sendSms({ phones, message, title });
      return { sent: true };
    } catch (err) {
      console.warn('SMS gönderilemedi:', err?.message);
      return { sent: false, reason: err?.message || 'gönderim hatası' };
    }
  };

  const handleAdmit = async (e) => {
    e.preventDefault();
    if (!selectedForInfirmary) return;
    setAdmitting(true);

    const student = selectedForInfirmary;
    const timeStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    try {
      await addDoc(collection(db, 'health_logs'), {
        studentId: student.id,
        studentName: student.name,
        className: student.className,
        schoolNumber: student.schoolNumber,
        complaint: complaint.trim() || 'Belirtilmedi',
        admittedAt: timeStr,
        admittedAtMs: Date.now(),
        status: 'in_infirmary',
        date: dateKey,
        createdAt: serverTimestamp()
      });

      // Revirdeki öğrenci ders devamsızlığından muaf tutulur.
      await setDoc(doc(db, 'attendance', `${dateKey}_infirmary_${student.id}`), {
        studentId: student.id,
        studentName: student.name,
        className: student.className,
        courseName: 'Revir Kontrolü (İzinli)',
        periodIndex: -1,
        absenceWeight: 0,
        status: 'excused',
        autoGenerated: false,
        recordedBy: 'Revir Masası',
        reason: `Revir kontrolü: ${complaint.trim() || 'Rahatsızlık'}`,
        date: dateKey,
        timestamp: serverTimestamp()
      }, { merge: true });

      let smsNote = '';
      if (notifyParentInfirmary) {
        const res = await trySms({
          phones: [student.parentPhone],
          title: 'Revir Bilgilendirmesi',
          message: `Sayin Velimiz, ogrencimiz ${student.name} saat ${timeStr} itibariyla revirimize alinmistir. Saglik durumu takip edilmektedir.`
        });
        if (!res.sent) smsNote = ` (veli SMS'i gitmedi: ${res.reason})`;
      }

      flash(smsNote ? 'error' : 'success',
        `${student.name} revire alındı, devamsızlıktan muaf tutuldu.${smsNote}`);
      setSelectedForInfirmary(null);
      setComplaint('');
      setInfirmarySearch('');
    } catch (err) {
      console.error('Revir kaydı oluşturulamadı:', err);
      flash('error', `Kayıt oluşturulamadı: ${err.message}`);
    }
    setAdmitting(false);
  };

  const handleDischarge = async (log) => {
    try {
      await updateDoc(doc(db, 'health_logs', log.id), {
        status: 'discharged',
        dischargedAt: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        updatedAt: serverTimestamp()
      });
      flash('success', `${log.studentName} taburcu edildi.`);
    } catch (err) {
      flash('error', `Taburcu edilemedi: ${err.message}`);
    }
  };

  const handleEmergency = async () => {
    const target = emergencyTarget;
    setEmergencyTarget(null);
    if (!target) return;

    const timeStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const student = students.find(s => s.id === target.studentId) || {};
    const phone = student.parentPhone || target.parentPhone;

    try {
      await addDoc(collection(db, 'emergency_logs'), {
        studentId: target.studentId,
        studentName: target.studentName,
        type: 'hospital_ambulance_dispatch',
        time: timeStr,
        date: dateKey,
        createdAt: serverTimestamp()
      });

      const res = await trySms({
        phones: [phone],
        title: 'ACİL SAĞLIK DURUMU',
        message: `ACIL BILGILENDIRME: Sayin Velimiz, ogrencimiz ${target.studentName} saglik durumu sebebiyle ivedilikle saglik kurulusuna yonlendirilmektedir. Lutfen kurum idaresi ile irtibata geciniz.`
      });

      flash(res.sent ? 'success' : 'error',
        res.sent
          ? `Acil sevk kaydedildi, veliye bildirim gönderildi.`
          : `Acil sevk kaydedildi ancak veli SMS'i gitmedi (${res.reason}). Veliyi telefonla arayın.`);
    } catch (err) {
      flash('error', `Acil sevk kaydedilemedi: ${err.message}`);
    }
  };

  const handleHandover = async (e) => {
    e.preventDefault();
    if (!selectedForHandover || !guardianName.trim()) return;
    setSubmittingHandover(true);

    const student = selectedForHandover;
    const timeStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const targetPhone = guardianPhone.trim() || student.parentPhone;

    try {
      await addDoc(collection(db, 'handover_logs'), {
        studentId: student.id,
        studentName: student.name,
        className: student.className,
        guardianName: guardianName.trim(),
        guardianRelation,
        guardianPhone: targetPhone,
        reason: handoverReason,
        handoverTime: timeStr,
        date: dateKey,
        createdAt: serverTimestamp()
      });

      // Turnike 10 dakika boyunca erken çıkışa izin verir.
      await setDoc(doc(db, 'early_exit_permits', student.id), {
        studentId: student.id,
        allowEarlyExit: true,
        grantedAt: serverTimestamp(),
        expiresAtMs: Date.now() + 10 * 60 * 1000,
        guardianName: guardianName.trim(),
        reason: handoverReason
      });

      await setDoc(doc(db, 'gate_status', student.id), {
        status: 'exit',
        lastAction: 'exit',
        date: dateKey,
        time: timeStr,
        method: 'guardian_handover',
        timestamp: serverTimestamp()
      }, { merge: true });

      await setDoc(doc(db, 'attendance', `${dateKey}_handover_${student.id}`), {
        studentId: student.id,
        studentName: student.name,
        className: student.className,
        courseName: 'Veli Teslim (İzinli Çıkış)',
        periodIndex: -0.5,
        absenceWeight: 0,
        status: 'excused',
        autoGenerated: false,
        recordedBy: 'Güvenlik & Veli Masası',
        reason: `Veliye teslim: ${guardianName.trim()} (${guardianRelation})`,
        date: dateKey,
        timestamp: serverTimestamp()
      }, { merge: true });

      const res = await trySms({
        phones: [targetPhone],
        title: 'Veli Teslim Bildirimi',
        message: `Sayin Velimiz, ogrencimiz ${student.name} saat ${timeStr} itibariyla ${guardianName.trim()} (${guardianRelation}) kisisine teslim edilerek kurumdan izinli ayrilmistir.`
      });

      flash(res.sent ? 'success' : 'error',
        res.sent
          ? `${student.name} velisine teslim edildi, çıkış onaylandı.`
          : `${student.name} teslim edildi ancak SMS gitmedi (${res.reason}).`);

      setSelectedForHandover(null);
      setGuardianName('');
      setGuardianPhone('');
      setHandoverSearch('');
    } catch (err) {
      console.error('Teslim kaydı oluşturulamadı:', err);
      flash('error', `İşlem başarısız: ${err.message}`);
    }
    setSubmittingHandover(false);
  };

  const searchStudents = (term) => {
    const q = term.trim().toLocaleLowerCase('tr');
    if (!q) return [];
    return students
      .filter(s =>
        s.name.toLocaleLowerCase('tr').includes(q) ||
        String(s.schoolNumber).includes(q) ||
        String(s.className).toLocaleLowerCase('tr').includes(q))
      .slice(0, 8);
  };

  const todayLabel = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="w-full flex flex-col gap-5 pb-2">
      <Toast open={toast.open} message={toast.message} tone={toast.tone} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[27px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
            Revir & Güvenlik
          </h1>
          <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400">
            {todayLabel} · sağlık kaydı, veli teslimi ve kampüs içi kontrol
          </p>
        </div>
        <Segmented value={activeTab} onChange={setActiveTab} options={TABS} />
      </header>

      <StatStrip>
        <Stat
          label="Revirde"
          value={infirmaryList.length}
          tone={infirmaryList.length > 0 ? 'danger' : 'default'}
          hint="şu an bakımda"
        />
        <Stat label="Bugün taburcu" value={dischargedToday.length} />
        <Stat label="Veli teslimi" value={handovers.length} hint="bugün" />
        <Stat
          label="Kaçak şüphesi"
          value={ghosts.length}
          tone={ghosts.length > 0 ? 'danger' : 'default'}
          hint={lastScanAt ? `${lastScanAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} taraması` : 'taranmadı'}
          last
        />
      </StatStrip>

      {/* ---------------------------------------------------------- REVİR */}
      {activeTab === 'infirmary' && (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-5">
          <form onSubmit={handleAdmit} className="flex flex-col">
            <Panel className="flex-1">
              <PanelHeader title="Revire Al" description="Kayıt açılınca öğrenci devamsızlıktan muaf tutulur" />
              <FieldRows>
                <Field label="Öğrenci" stacked>
                  <StudentPicker
                    term={infirmarySearch}
                    onTerm={setInfirmarySearch}
                    selected={selectedForInfirmary}
                    onSelect={setSelectedForInfirmary}
                    placeholder="Ad, sınıf veya okul no ara"
                    search={searchStudents}
                  />
                </Field>

                <Field label="Şikâyet" stacked hint="Boş bırakılırsa 'Belirtilmedi' kaydedilir.">
                  <Textarea
                    rows={3}
                    value={complaint}
                    onChange={(e) => setComplaint(e.target.value)}
                    placeholder="Baş ağrısı, ateş, mide bulantısı…"
                  />
                </Field>

                <Field label="Veli bildirimi" stacked>
                  <Switch
                    id="notify-parent-infirmary"
                    checked={notifyParentInfirmary}
                    onChange={(e) => setNotifyParentInfirmary(e.target.checked)}
                    label="Veliye SMS gönder"
                    description={
                      selectedForInfirmary && !selectedForInfirmary.parentPhone
                        ? 'Bu öğrencinin kayıtlı veli telefonu yok.'
                        : 'Revire alındığı bilgisi velinin telefonuna iletilir.'
                    }
                  />
                </Field>
              </FieldRows>

              <PanelFooter className="mt-auto">
                <span className="text-[11.5px] text-slate-500 dark:text-slate-400">
                  {selectedForInfirmary ? selectedForInfirmary.name : 'Öğrenci seçilmedi'}
                </span>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!selectedForInfirmary || admitting}
                  icon={admitting ? RefreshCw : Stethoscope}
                >
                  {admitting ? 'Kaydediliyor…' : 'Revire Al'}
                </Button>
              </PanelFooter>
            </Panel>
          </form>

          <Panel>
            <PanelHeader title="Revirdekiler" description="Bakımı süren öğrenciler">
              <span className="text-[11.5px] text-slate-500 dark:text-slate-400 tnum">
                {infirmaryList.length} öğrenci
              </span>
            </PanelHeader>

            {infirmaryList.length === 0 ? (
              <EmptyState
                icon={HeartPulse}
                title="Revirde öğrenci yok"
                description="Revire alınan öğrenciler burada canlı olarak listelenir."
              />
            ) : (
              <div className={cx('divide-y', divider)}>
                {infirmaryList.map(log => (
                  <div key={log.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[13.5px] font-medium text-slate-900 dark:text-white truncate">
                          {log.studentName}
                        </span>
                        <Badge tone={(now - (log.admittedAtMs || now)) > 45 * 60000 ? 'danger' : 'warning'}>
                          {formatDuration(log.admittedAtMs, now)}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400 truncate">
                        {[log.className, log.schoolNumber && `No ${log.schoolNumber}`, `Giriş ${log.admittedAt}`]
                          .filter(Boolean).join(' · ')}
                      </div>
                      <div className="mt-1 text-[12.5px] text-slate-600 dark:text-slate-300 truncate">
                        {log.complaint}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        icon={Ambulance}
                        variant="danger"
                        onClick={() => setEmergencyTarget(log)}
                      >
                        Acil Sevk
                      </Button>
                      <Button icon={LogOut} onClick={() => handleDischarge(log)}>
                        Taburcu
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {dischargedToday.length > 0 && (
              <>
                <div className={cx('px-5 py-2.5 border-t bg-slate-50/70 dark:bg-white/[0.02]', hairline)}>
                  <span className={eyebrow}>Bugün taburcu edilenler</span>
                </div>
                <div className={cx('divide-y', divider)}>
                  {dischargedToday.map(log => (
                    <div key={log.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <span className="min-w-0">
                        <span className="block text-[13px] text-slate-700 dark:text-slate-200 truncate">
                          {log.studentName}
                        </span>
                        <span className="block text-[11.5px] text-slate-500 dark:text-slate-400 truncate">
                          {log.complaint}
                        </span>
                      </span>
                      <span className="text-[11.5px] text-slate-400 dark:text-slate-500 tnum shrink-0">
                        {log.admittedAt} → {log.dischargedAt}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>
        </div>
      )}

      {/* -------------------------------------------------- VELİ TESLİMİ */}
      {activeTab === 'handover' && (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-5">
          <form onSubmit={handleHandover} className="flex flex-col">
            <Panel className="flex-1">
              <PanelHeader title="Veliye Teslim" description="Turnike 10 dakika erken çıkışa açılır" />
              <FieldRows>
                <Field label="Öğrenci" stacked>
                  <StudentPicker
                    term={handoverSearch}
                    onTerm={setHandoverSearch}
                    selected={selectedForHandover}
                    onSelect={setSelectedForHandover}
                    placeholder="Ad, sınıf veya okul no ara"
                    search={searchStudents}
                  />
                </Field>

                <Field label="Teslim alan" stacked>
                  <div className="flex flex-col gap-2.5">
                    <Input
                      type="text"
                      required
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      placeholder="Ad soyad"
                    />
                    <Select value={guardianRelation} onChange={(e) => setGuardianRelation(e.target.value)}>
                      {RELATIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </Select>
                  </div>
                </Field>

                <Field
                  label="Telefon"
                  stacked
                  hint="Boş bırakılırsa öğrencinin kayıtlı veli numarası kullanılır."
                >
                  <Input
                    type="tel"
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder={selectedForHandover?.parentPhone || '05XX XXX XX XX'}
                    className="tnum"
                  />
                </Field>

                <Field label="Gerekçe" stacked>
                  <Select value={handoverReason} onChange={(e) => setHandoverReason(e.target.value)}>
                    {HANDOVER_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </Field>
              </FieldRows>

              <PanelFooter className="mt-auto">
                <span className="text-[11.5px] text-slate-500 dark:text-slate-400">
                  {selectedForHandover ? selectedForHandover.name : 'Öğrenci seçilmedi'}
                </span>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!selectedForHandover || !guardianName.trim() || submittingHandover}
                  icon={submittingHandover ? RefreshCw : UserCheck}
                >
                  {submittingHandover ? 'İşleniyor…' : 'Teslim Et'}
                </Button>
              </PanelFooter>
            </Panel>
          </form>

          <Panel>
            <PanelHeader title="Bugünkü Teslimler" description="Veliye teslim edilen öğrenciler">
              <span className="text-[11.5px] text-slate-500 dark:text-slate-400 tnum">
                {handovers.length} kayıt
              </span>
            </PanelHeader>

            {handovers.length === 0 ? (
              <EmptyState
                icon={UserCheck}
                title="Bugün teslim yok"
                description="Veliye teslim edilen öğrenciler burada listelenir."
              />
            ) : (
              <div className="overflow-x-auto panel-scroll">
                <div className="min-w-[640px]">
                  <div className={cx('grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_80px] gap-4 px-5 py-2.5 border-b bg-slate-50/70 dark:bg-white/[0.02]', hairline)}>
                    <span className={eyebrow}>Öğrenci</span>
                    <span className={eyebrow}>Teslim alan</span>
                    <span className={eyebrow}>Gerekçe</span>
                    <span className={cx(eyebrow, 'text-right')}>Saat</span>
                  </div>
                  <div className={cx('divide-y', divider)}>
                    {handovers.map(h => (
                      <div
                        key={h.id}
                        className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_80px] gap-4 px-5 py-3 items-center"
                      >
                        <span className="min-w-0">
                          <span className="block text-[13px] text-slate-900 dark:text-white truncate">{h.studentName}</span>
                          <span className="block text-[11.5px] text-slate-500 dark:text-slate-400 truncate">{h.className || '—'}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] text-slate-700 dark:text-slate-200 truncate">{h.guardianName}</span>
                          <span className="block text-[11.5px] text-slate-500 dark:text-slate-400 truncate">{h.guardianRelation}</span>
                        </span>
                        <span className="text-[12.5px] text-slate-600 dark:text-slate-300 truncate">{h.reason}</span>
                        <span className="text-[12.5px] text-right text-slate-500 dark:text-slate-400 tnum">{h.handoverTime}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* --------------------------------------------------- KAÇAK RADARI */}
      {activeTab === 'radar' && (
        <Panel>
          <PanelHeader
            title="Kaçak Radarı"
            description="Turnikeden giriş yapmış görünüp derste yok yazılan öğrenciler"
          >
            <Button
              icon={scanningGhosts ? RefreshCw : Radar}
              onClick={scanGhosts}
              disabled={scanningGhosts}
            >
              {scanningGhosts ? 'Taranıyor…' : 'Yeniden Tara'}
            </Button>
          </PanelHeader>

          {scanningGhosts && ghosts.length === 0 ? (
            <div className={cx('divide-y', divider)}>
              {[0, 1, 2].map(n => (
                <div key={n} className="px-5 py-3.5 animate-pulse">
                  <div className="h-3 w-52 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
                </div>
              ))}
            </div>
          ) : ghosts.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="Şüpheli kayıt yok"
              description="Kampüste görünüp derse girmeyen öğrenci tespit edilmedi."
            />
          ) : (
            <div className={cx('divide-y', divider)}>
              {ghosts.map(g => (
                <div key={g.id} className="flex items-center gap-3.5 px-5 py-3">
                  <span className="w-8 h-8 rounded-full shrink-0 border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/[0.06] overflow-hidden flex items-center justify-center text-slate-400">
                    {g.photo
                      ? <img src={g.photo} alt="" className="w-full h-full object-cover" />
                      : <Users size={14} strokeWidth={1.8} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-medium text-slate-900 dark:text-white truncate">{g.name}</span>
                    <span className="block text-[11.5px] text-slate-500 dark:text-slate-400 truncate">
                      {g.className} · {g.reason}
                    </span>
                  </span>
                  <Badge tone="danger">Kampüste ama derste yok</Badge>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* Acil sevk onayı */}
      <Modal
        open={Boolean(emergencyTarget)}
        onClose={() => setEmergencyTarget(null)}
        title="Acil sevk başlat"
        width="max-w-md"
        footer={
          <>
            <Button type="button" onClick={() => setEmergencyTarget(null)}>Vazgeç</Button>
            <Button type="button" variant="danger" icon={Ambulance} onClick={handleEmergency}>
              Sevki Başlat
            </Button>
          </>
        }
      >
        <div className="px-5 py-5">
          <p className="m-0 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-900 dark:text-white">{emergencyTarget?.studentName}</span> için
            acil sevk kaydı açılacak ve veliye <strong>acil durum SMS'i</strong> gönderilecek. Bu bildirim geri alınamaz.
          </p>
        </div>
      </Modal>
    </div>
  );
}
