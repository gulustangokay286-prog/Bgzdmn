import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Save, Clock, CalendarOff, ShieldCheck, Timer, CalendarPlus, X,
  RotateCcw, Check, AlertTriangle, GraduationCap, Users,
  CalendarClock, Pencil, Trash2, BookOpenCheck
} from 'lucide-react';
import { api } from '../services/api';
import {
  DEFAULT_ATTENDANCE_CONFIG,
  resolveAttendanceConfig,
  normalizeExamDays,
  normalizeSpecialDays,
  normalizeCustomSchedules,
  getDateKeyInTimeZone,
  getDayNameInTimeZone,
  minutesToTime,
  timeToMinutes
} from '../services/attendanceRules';
import {
  Panel, PanelHeader, FieldRows, Field, Input, Select, Switch, Badge, Button, Toast
} from '../components/ui/panel';
import { cx, hairline } from '../components/ui/tokens';

/* ============================================================================
   KURUM KURALLARI

   Bu ekran, gecislere uygulanan kural govdesinin TEK duzenleme yeridir.
   Onceki surumde iki sorun vardi:
     1. Ekran, kural motorunun anahtarlarinin ancak yarisini taşiyordu; Kaydet'e
        basildiginda gun sonu, bekleme araligi, gec giris engeli gibi kurallar
        sunucu varsayilanina geri donuyordu.
     2. Kaydedilenin gercekten uygulanip uygulanmadigi ekranda gorunmuyordu.
   Ikisi de burada cozuldu: govde tam gonderilir ve kayittan SONRA sunucunun
   hesapladigi pencereler geri okunup "Sunucuda yururlukte" seridinde
   gosterilir. Ekranda gordugunuz ile kapida uygulanan ayni seydir.
   ========================================================================== */

const GUNLER = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const SINIFLAR = ['9', '10', '11', '12'];
const POLITIKA_ROLLERI = [
  { key: 'student', label: 'Öğrenci' },
  { key: 'teacher', label: 'Öğretmen' },
  { key: 'personnel', label: 'Personel' },
  { key: 'admin', label: 'İdare' },
];

const tarihGoster = (date) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return 'Tarih seçilmedi';
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: 'UTC'
  }).format(new Date(`${date}T12:00:00Z`));
};

const tarihAraligi = (start, end, max = 62) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start) return [];
  const out = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const finish = new Date(`${end}T12:00:00Z`);
  while (cursor <= finish && out.length < max) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
};

/** Sunucudaki pencereler() ile ayni hesap; onizleme icin. */
const pencereleriHesapla = (c) => {
  const dk = (t) => timeToMinutes(t) ?? 0;
  const bir = (Number(c.dersSuresiDk) || 0) + (Number(c.teneffusDk) || 0);
  const sabah = dk(c.morningEntryHour);
  const ogleden = dk(c.afternoonEntryHour);
  return {
    gunBaslangici: dk(c.dayStartHour),
    sabah,
    sabahMusaadeSonu: sabah + (Number(c.morningGraceMinutes) || 0),
    sabahSonGiris: Math.min(dk(c.lunchExitHour),
      c.sabahSonGirisSaati ? dk(c.sabahSonGirisSaati) : sabah + (Number(c.sabahSonGirisDers) || 0) * bir),
    ogleCikis: dk(c.lunchExitHour),
    yarimGunSiniri: dk(c.halfDayCutoffHour),
    ogledenSonra: ogleden,
    ogledenSonraMusaadeSonu: ogleden + (Number(c.afternoonGraceMinutes) || 0),
    ogledenSonraSonGiris: Math.min(dk(c.schoolExitHour),
      c.ogledenSonraSonGirisSaati ? dk(c.ogledenSonraSonGirisSaati)
        : ogleden + (Number(c.ogledenSonraSonGirisDers) || 0) * bir),
    okulCikis: dk(c.schoolExitHour),
    gunSonu: dk(c.gunSonu),
  };
};

const ADIMLAR = [
  { k: 'gunBaslangici',           ad: 'Gün başlangıcı', not: 'öncesi mesai dışı' },
  { k: 'sabah',                   ad: 'Sabah girişi',   not: 'ders başlangıcı' },
  { k: 'sabahMusaadeSonu',        ad: 'Müsaade sonu',   not: 'sonrası geç' },
  { k: 'sabahSonGiris',           ad: 'Sabah son giriş', not: 'sonrası sabah kazanılmaz' },
  { k: 'ogleCikis',               ad: 'Öğle çıkışı',    not: '' },
  { k: 'yarimGunSiniri',          ad: 'Yarım gün sınırı', not: 'oturum ayrımı' },
  { k: 'ogledenSonra',            ad: 'Öğleden sonra',  not: 'ders başlangıcı' },
  { k: 'ogledenSonraMusaadeSonu', ad: 'Müsaade sonu',   not: 'sonrası geç' },
  { k: 'ogledenSonraSonGiris',    ad: 'Son giriş',      not: 'sonrası öğleden sonra kazanılmaz' },
  { k: 'okulCikis',               ad: 'Okul çıkışı',    not: '' },
  { k: 'gunSonu',                 ad: 'Gün sonu',       not: 'sonrası mesai dışı' },
];

/** Gunun akisini tek serit halinde gosterir; sirasi bozuksa uyarir. */
const AkisSeridi = ({ p, baslik, vurgu }) => {
  const sirali = ADIMLAR.every((a, i) => i === 0 || p[ADIMLAR[i - 1].k] <= p[a.k]);
  return (
    <div className={cx('rounded-xl border p-4', hairline, vurgu ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : 'bg-slate-50/70 dark:bg-white/[0.02]')}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">{baslik}</span>
        {!sirali && (
          <Badge tone="danger">
            <span className="inline-flex items-center gap-1"><AlertTriangle size={11} /> saatler sıralı değil</span>
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        {ADIMLAR.map((a) => (
          <div key={a.k} className="min-w-[92px]">
            <div className="text-[15px] font-semibold tabular-nums text-slate-900 dark:text-white leading-none">
              {minutesToTime(p[a.k])}
            </div>
            <div className="mt-1 text-[10.5px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{a.ad}</div>
            {a.not && <div className="text-[10px] text-slate-400 dark:text-slate-500">{a.not}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Bugun kapida GERCEKTEN uygulanan deneme programi.
 * Ustteki normal kurum saatleri bu tarihte kapsamdaki herkes icin gecersizdir;
 * ogrenci, ogretmen, idare ve personel ayni saatlere tabidir.
 */
const DenemeSeridi = ({ kural }) => {
  const gecSonrasi = minutesToTime((timeToMinutes(kural.entryHour) ?? 0) + (kural.graceMinutes || 0));
  const adimlar = [
    { ad: 'Sınav girişi', saat: kural.entryHour, not: 'bu saate kadar geç değil' },
    { ad: 'Geç sayılır', saat: gecSonrasi, not: 'sonrası geç giriş' },
    { ad: 'Sınav bitişi', saat: kural.examEndHour, not: 'son giriş' },
    { ad: 'Otomatik çıkış', saat: kural.autoExitHour, not: 'toplu çıkış' },
    kural.studyEnabled
      ? { ad: 'Etüt çıkışı', saat: kural.studyExitHour, not: 'gün sonu' }
      : { ad: 'Etüt', saat: 'yok', not: 'katılan tam gün sayılır' },
  ];
  return (
    <div className={cx('rounded-xl border p-4 bg-amber-50/70 dark:bg-amber-950/20', hairline)}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="warning">bugün yürürlükte</Badge>
        <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-300">
          {kural.name || 'Deneme Sınavı'}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        {adimlar.map((a) => (
          <div key={a.ad} className="min-w-[92px]">
            <div className="text-[15px] font-semibold leading-none tabular-nums text-slate-900 dark:text-white">
              {a.saat}
            </div>
            <div className="mt-1 text-[10.5px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {a.ad}
            </div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500">{a.not}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        Bu saatler {(kural.grades || []).join(', ') || '—'}. sınıf öğrencileri ile tüm öğretmen,
        idare ve personel için geçerlidir; üstteki normal saatler onlara uygulanmaz.
        Kapsam dışı sınıf seviyelerine bugün yoklama işlenmez.
      </div>
    </div>
  );
};

const Bolum = ({ ikon: Ikon, baslik, aciklama, children }) => (
  <Panel>
    <PanelHeader
      title={<span className="inline-flex items-center gap-2"><Ikon size={16} className="text-slate-500" />{baslik}</span>}
      description={aciklama}
    />
    <FieldRows>{children}</FieldRows>
  </Panel>
);

const Saat = (props) => <Input type="time" className="tabular-nums max-w-[160px]" {...props} />;
const Sayi = (props) => <Input type="number" className="tabular-nums max-w-[160px]" {...props} />;

const yeniDenemePlani = () => ({
  date: '',
  name: 'Deneme Sınavı',
  grades: ['12'],
  entryHour: '10:15',
  graceMinutes: 0,
  durationMinutes: 165,
  autoExitHour: '13:15',
  studyEnabled: false,
  studyEntryHour: '13:30',
  studyGraceMinutes: 0,
  studyExitHour: '16:00',
  active: true,
});

const yeniOzelProgram = () => ({
  date: '', name: '4 Ders + Etüt', type: 'lessons_study',
  grades: [...SINIFLAR],
  allowedRoles: ['student', 'teacher', 'personnel', 'admin'],
  attendanceRoles: ['student', 'teacher', 'personnel', 'admin'],
  morningEntryHour: '09:00', morningGraceMinutes: 15,
  lessonCount: 4, lessonMinutes: 40, breakMinutes: 10,
  studyEnabled: true, studyEntryHour: '12:10', studyGraceMinutes: 15,
  schoolExitHour: '15:20', autoLunchExitEnabled: false,
  autoSchoolExitEnabled: true, studentSmsEnabled: false, active: true,
});

const ozelProgramAdi = (type) => type === 'study_only'
  ? 'Yalnız Etüt' : type === 'custom' ? 'Özel Program' : '4 Ders + Etüt';

const InstitutionSettingsAdminView = () => {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', tone: 'success' });
  const [sekme, setSekme] = useState('takvim');
  const [tatilTaslak, setTatilTaslak] = useState({ name: 'Ara Tatil', startDate: '', endDate: '' });
  const [denemeTaslak, setDenemeTaslak] = useState(yeniDenemePlani);
  const [duzenlenenDeneme, setDuzenlenenDeneme] = useState(null);
  const [denemeFormAcik, setDenemeFormAcik] = useState(false);
  const [ozelTaslak, setOzelTaslak] = useState(yeniOzelProgram);
  const [duzenlenenOzel, setDuzenlenenOzel] = useState(null);
  const [ozelFormAcik, setOzelFormAcik] = useState(false);

  const [ayar, setAyar] = useState({ ...DEFAULT_ATTENDANCE_CONFIG });
  /** Sunucudan en son okunan hâl: hem "degisti mi" karsilastirmasi hem de
      "sunucuda gercekten ne var" seridi bunun uzerinden calisir. */
  const [sunucudaki, setSunucudaki] = useState(null);
  const [sunucuPencere, setSunucuPencere] = useState(null);

  const bildir = (message, tone = 'success') => {
    setToast({ open: true, message, tone });
    setTimeout(() => setToast((t) => ({ ...t, open: false })), 3200);
  };

  const oku = useCallback(async () => {
    const d = await api.get('/api/yoklama/ayarlar');
    const cozulmus = resolveAttendanceConfig(d?.ayarlar || {});
    setAyar(cozulmus);
    setSunucudaki(cozulmus);
    setSunucuPencere(d?.pencereler || null);
    return cozulmus;
  }, []);

  useEffect(() => {
    oku()
      .catch((e) => bildir(`Kurum kuralları okunamadı: ${e?.message || 'bağlantı hatası'}`, 'danger'))
      .finally(() => setYukleniyor(false));
  }, [oku]);

  const cozulmus = useMemo(() => resolveAttendanceConfig(ayar), [ayar]);
  /* Sunucuda kayitli plan: kapida gercekten uygulanan kural budur. */
  const bugunkuDeneme = useMemo(() => {
    const bugun = getDateKeyInTimeZone(new Date(), 'Europe/Istanbul');
    return (normalizeExamDays(sunucudaki?.examDays || []) || [])
      .find((plan) => plan.date === bugun && plan.active !== false) || null;
  }, [sunucudaki]);
  const pencere = useMemo(() => pencereleriHesapla(cozulmus), [cozulmus]);
  const yaklasanGunler = useMemo(() => {
    const bugun = getDateKeyInTimeZone(new Date(), cozulmus.timeZone);
    return tarihAraligi(bugun, (() => {
      const d = new Date(`${bugun}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 13);
      return d.toISOString().slice(0, 10);
    })(), 14).map((date) => {
      const exam = (cozulmus.examDays || []).find((item) => item.date === date && item.active !== false);
      const custom = (cozulmus.customSchedules || []).find((item) => item.date === date && item.active !== false);
      const special = (cozulmus.specialDays || []).find((item) => item.date === date && item.active !== false);
      const day = getDayNameInTimeZone(new Date(`${date}T12:00:00Z`), 'UTC');
      const weeklyClosed = (cozulmus.closedDays || []).some((item) =>
        item.toLocaleLowerCase('tr-TR') === day.toLocaleLowerCase('tr-TR'));
      const legacyHoliday = (cozulmus.holidays || []).includes(date);
      let type = 'normal'; let title = 'Normal ders günü'; let detail = `${cozulmus.morningEntryHour}–${cozulmus.schoolExitHour}`;
      if (weeklyClosed || legacyHoliday) { type = 'closed'; title = 'Kurum kapalı'; detail = 'Geçiş ve yoklama kapalı'; }
      if (special) {
        type = 'holiday'; title = special.name;
        detail = special.allowedRoles.length
          ? `${special.allowedRoles.length} rol için QR açık · öğrenci SMS kapalı`
          : 'Tüm roller için kapalı · öğrenci SMS kapalı';
      }
      if (custom) {
        type = 'custom'; title = custom.name;
        detail = `${custom.morningEntryHour}–${custom.schoolExitHour} · ${custom.grades.join(', ')}. sınıflar`;
      }
      if (exam) {
        type = 'exam'; title = exam.name;
        detail = `${exam.entryHour}–${exam.autoExitHour} · ${exam.grades.join(', ')}. sınıflar`;
      }
      return { date, day, type, title, detail };
    });
  }, [cozulmus]);

  /* Degisiklik var mi? Cozulmus govdeler karsilastirilir; boylece kullanicinin
     yazdigi "9:5" gibi bir deger "09:05"e normalize edildikten sonra bakilir
     ve sahte "kaydedilmemis degisiklik" uyarisi cikmaz. */
  const degisti = useMemo(
    () => Boolean(sunucudaki) && JSON.stringify(cozulmus) !== JSON.stringify(sunucudaki),
    [cozulmus, sunucudaki]
  );

  const yaz  = (ad) => (e) => setAyar((o) => ({ ...o, [ad]: e.target.value }));
  const say  = (ad) => (e) => setAyar((o) => ({ ...o, [ad]: e.target.value === '' ? '' : Number(e.target.value) }));
  const anah = (ad) => () => setAyar((o) => ({ ...o, [ad]: !o[ad] }));

  const gunuCevir = (g) => setAyar((o) => {
    const kapali = o.closedDays || [];
    return { ...o, closedDays: kapali.includes(g) ? kapali.filter((x) => x !== g) : [...kapali, g] };
  });

  const tatilEkle = () => {
    const dates = tarihAraligi(tatilTaslak.startDate, tatilTaslak.endDate);
    if (!dates.length) return bildir('Geçerli bir başlangıç ve bitiş tarihi seçin.', 'danger');
    const kurallar = dates.map((date) => {
      const day = getDayNameInTimeZone(new Date(`${date}T12:00:00Z`), 'UTC');
      const haftalikKapali = (cozulmus.closedDays || []).some((item) =>
        item.toLocaleLowerCase('tr-TR') === day.toLocaleLowerCase('tr-TR'));
      const roles = haftalikKapali ? [] : ['teacher', 'personnel', 'admin'];
      return {
        date, name: tatilTaslak.name || 'Tatil / Kapalı Gün',
        allowedRoles: roles, attendanceRoles: roles,
        studentSmsEnabled: false, active: true,
      };
    });
    setAyar((o) => ({
      ...o,
      specialDays: normalizeSpecialDays([
        ...(o.specialDays || []).filter((item) => !dates.includes(item.date)),
        ...kurallar,
      ]),
    }));
    setTatilTaslak({ name: 'Ara Tatil', startDate: '', endDate: '' });
    bildir(`${dates.length} gün taslağa eklendi. Her günün QR ve yoklama izinlerini aşağıdan ayrı ayrı düzenleyebilirsiniz.`, 'warning');
  };

  const tatilRoluCevir = (date, alan, role) => setAyar((o) => ({
    ...o,
    specialDays: normalizeSpecialDays((o.specialDays || []).map((item) => {
      if (item.date !== date) return item;
      const mevcut = item[alan] || [];
      const aciliyor = !mevcut.includes(role);
      if (alan === 'allowedRoles') {
        const allowedRoles = aciliyor ? [...mevcut, role] : mevcut.filter((r) => r !== role);
        return { ...item, allowedRoles,
          attendanceRoles: (item.attendanceRoles || []).filter((r) => allowedRoles.includes(r)) };
      }
      const attendanceRoles = aciliyor ? [...mevcut, role] : mevcut.filter((r) => r !== role);
      return { ...item, attendanceRoles,
        allowedRoles: aciliyor ? [...new Set([...(item.allowedRoles || []), role])] : item.allowedRoles };
    })),
  }));

  const denemeAlani = (ad) => (e) => setDenemeTaslak((o) => ({ ...o, [ad]: e.target.value }));
  const denemeSayisi = (ad) => (e) => setDenemeTaslak((o) => ({
    ...o,
    [ad]: e.target.value === '' ? '' : Number(e.target.value),
  }));
  const denemeSinifiCevir = (seviye) => setDenemeTaslak((o) => ({
    ...o,
    grades: o.grades.includes(seviye)
      ? o.grades.filter((g) => g !== seviye)
      : [...o.grades, seviye].sort((a, b) => Number(a) - Number(b)),
  }));

  const denemePlaniEkle = () => {
    if (!denemeTaslak.grades.length) return bildir('En az bir sınıf seviyesinde yoklamayı açık bırakın.', 'danger');
    const plan = normalizeExamDays([denemeTaslak])[0];
    if (!plan) return bildir('Geçerli bir deneme tarihi seçin.', 'danger');
    setAyar((o) => ({
      ...o,
      examDays: normalizeExamDays([
        ...(o.examDays || []).filter((item) => item.date !== plan.date && item.date !== duzenlenenDeneme),
        plan,
      ]),
    }));
    setDenemeTaslak(yeniDenemePlani());
    setDuzenlenenDeneme(null);
    setDenemeFormAcik(false);
    bildir('Deneme planı taslağa eklendi. Sunucuda yürürlüğe almak için Kuralları Kaydet’e basın.', 'warning');
  };

  const denemePlaniDuzenle = (plan) => {
    setDenemeTaslak({ ...plan, grades: [...plan.grades] });
    setDuzenlenenDeneme(plan.date);
    setDenemeFormAcik(true);
  };

  const denemePlaniSil = (date) => {
    setAyar((o) => ({ ...o, examDays: (o.examDays || []).filter((plan) => plan.date !== date) }));
    if (duzenlenenDeneme === date) {
      setDenemeTaslak(yeniDenemePlani());
      setDuzenlenenDeneme(null);
      setDenemeFormAcik(false);
    }
  };

  const ozelAlani = (ad) => (e) => setOzelTaslak((o) => ({ ...o, [ad]: e.target.value }));
  const ozelSayisi = (ad) => (e) => setOzelTaslak((o) => ({
    ...o, [ad]: e.target.value === '' ? '' : Number(e.target.value),
  }));
  const ozelSinifiCevir = (grade) => setOzelTaslak((o) => ({
    ...o,
    grades: o.grades.includes(grade) ? o.grades.filter((item) => item !== grade)
      : [...o.grades, grade].sort((a, b) => Number(a) - Number(b)),
  }));
  const ozelRoluCevir = (alan, role) => setOzelTaslak((o) => {
    const mevcut = o[alan] || [];
    const aciliyor = !mevcut.includes(role);
    if (alan === 'allowedRoles') {
      const allowedRoles = aciliyor ? [...mevcut, role] : mevcut.filter((item) => item !== role);
      return { ...o, allowedRoles,
        attendanceRoles: (o.attendanceRoles || []).filter((item) => allowedRoles.includes(item)) };
    }
    return { ...o,
      attendanceRoles: aciliyor ? [...mevcut, role] : mevcut.filter((item) => item !== role),
      allowedRoles: aciliyor ? [...new Set([...(o.allowedRoles || []), role])] : o.allowedRoles };
  });
  const ozelTipSec = (type) => setOzelTaslak((o) => ({
    ...o, type, name: ozelProgramAdi(type),
    studyEnabled: type !== 'custom' || o.studyEnabled,
  }));
  const ozelProgramKaydet = () => {
    if (!(ozelTaslak.grades || []).length) return bildir('En az bir sınıf seviyesi seçin.', 'danger');
    if (!(ozelTaslak.allowedRoles || []).length) return bildir('En az bir QR geçiş rolü seçin.', 'danger');
    const program = normalizeCustomSchedules([ozelTaslak])[0];
    if (!program) return bildir('Geçerli bir program tarihi seçin.', 'danger');
    setAyar((o) => ({
      ...o,
      customSchedules: normalizeCustomSchedules([
        ...(o.customSchedules || []).filter((item) => item.date !== program.date && item.date !== duzenlenenOzel),
        program,
      ]),
    }));
    setOzelTaslak(yeniOzelProgram());
    setDuzenlenenOzel(null);
    setOzelFormAcik(false);
    bildir('Özel gün programı taslağa eklendi. Yürürlüğe almak için Kuralları Kaydet’e basın.', 'warning');
  };
  const ozelProgramDuzenle = (program) => {
    setOzelTaslak({ ...program, grades: [...program.grades],
      allowedRoles: [...program.allowedRoles], attendanceRoles: [...program.attendanceRoles] });
    setDuzenlenenOzel(program.date);
    setOzelFormAcik(true);
  };
  const ozelProgramSil = (date) => {
    setAyar((o) => ({ ...o,
      customSchedules: (o.customSchedules || []).filter((program) => program.date !== date) }));
    if (duzenlenenOzel === date) {
      setOzelTaslak(yeniOzelProgram()); setDuzenlenenOzel(null); setOzelFormAcik(false);
    }
  };

  const kaydet = async () => {
    setKaydediliyor(true);
    try {
      await api.put('/api/yoklama/ayarlar', { ayarlar: cozulmus });
      /* KAYITTAN SONRA GERI OKU.
         Gonderdigimizi degil, sunucunun SAKLADIGINI gosteriyoruz; ekranin
         "kaydettim" demesi ile kapida uygulananin ayni oldugu boyle kanitlanir. */
      const geri = await oku();
      const ayni = JSON.stringify(geri) === JSON.stringify(cozulmus);
      bildir(ayni ? 'Kaydedildi ve sunucuda doğrulandı — yeni okutmalar bu kurallarla değerlendirilecek.'
                  : 'Kaydedildi, ancak sunucu bazı değerleri düzeltti. Aşağıdaki “sunucuda yürürlükte” şeridine bakın.',
             ayni ? 'success' : 'warning');
    } catch (e) {
      bildir(`Kaydedilemedi: ${e?.mesaj || e?.message || 'bağlantı hatası'}`, 'danger');
    } finally {
      setKaydediliyor(false);
    }
  };

  if (yukleniyor) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-slate-900 dark:border-white" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-16">
      <Toast open={toast.open} message={toast.message} tone={toast.tone} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[27px] font-semibold leading-none tracking-[-0.03em] text-slate-900 dark:text-white">
            Kurum Kuralları
          </h1>
          <p className="m-0 mt-2 max-w-2xl text-[12.5px] leading-relaxed text-slate-500 dark:text-slate-400">
            Karekod okutma, manuel geçiş ve <strong>bogazicikoleji.chenki.net/qr</strong> ekranı
            aynı kuralları uygular. Kaydettiğiniz an geçerli olur; yeniden başlatma gerekmez.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {degisti && <Badge tone="warning">kaydedilmemiş değişiklik</Badge>}
          {degisti && (
            <Button variant="secondary" icon={RotateCcw} onClick={() => setAyar(sunucudaki)}>
              Geri al
            </Button>
          )}
          <Button variant="primary" icon={kaydediliyor ? Timer : Save} onClick={kaydet} disabled={kaydediliyor || !degisti}>
            {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </header>

      <div className={cx('grid grid-cols-3 gap-1 rounded-xl border bg-slate-100 p-1 dark:bg-white/[0.03]', hairline)}>
        {[
          ['takvim', 'Gün Takvimi'], ['normal', 'Normal Gün'], ['otomasyon', 'Otomasyon']
        ].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setSekme(key)}
            className={cx('rounded-lg px-3 py-2 text-[12.5px] font-semibold transition-colors',
              sekme === key
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200')}>
            {label}
          </button>
        ))}
      </div>

      {sekme === 'normal' && (
        <div className="flex flex-col gap-3">
          <AkisSeridi p={pencere} baslik="Bu ekrandaki ayarlarla günün akışı" />
          {sunucuPencere && (
            <AkisSeridi p={sunucuPencere} vurgu baslik="Sunucuda yürürlükte olan (kapıda uygulanan)" />
          )}
        </div>
      )}

      {sekme === 'takvim' && bugunkuDeneme && <DenemeSeridi kural={bugunkuDeneme} />}

      {sekme === 'takvim' && (
        <Bolum ikon={CalendarClock} baslik="Önümüzdeki 14 Gün"
          aciklama="Her tarihte kapının, yoklamanın ve özel programın hangi kurala göre çalışacağını tek bakışta gösterir.">
          <Field label="Etkin gün planları" stacked>
            <div className={cx('divide-y rounded-lg border', hairline)}>
              {yaklasanGunler.map((gun) => (
                <div key={gun.date} className="grid gap-2 px-3.5 py-3 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-center">
                  <div>
                    <div className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">{gun.day}</div>
                    <div className="text-[11px] tabular-nums text-slate-500">{gun.date}</div>
                  </div>
                  <div>
                    <div className="text-[12.5px] font-medium text-slate-700 dark:text-slate-200">{gun.title}</div>
                    <div className="text-[11px] text-slate-500">{gun.detail}</div>
                  </div>
                  <Badge tone={gun.type === 'normal' ? 'success' : gun.type === 'closed' || gun.type === 'holiday' ? 'danger' : 'warning'}>
                    {gun.type === 'exam' ? 'Deneme' : gun.type === 'custom' ? 'Özel program'
                      : gun.type === 'holiday' ? 'Tatil' : gun.type === 'closed' ? 'Kapalı' : 'Normal'}
                  </Badge>
                </div>
              ))}
            </div>
          </Field>
        </Bolum>
      )}

      {sekme === 'takvim' && <Bolum
        ikon={CalendarClock}
        baslik="Deneme Günleri"
        aciklama="Seçili tarihte normal kurum saatlerini yalnızca belirlediğiniz sınıf seviyeleri için değiştirir. Diğer seviyelere o gün devamsızlık işlenmez."
      >
        <Field label="Deneme planları" stacked>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-[12px] text-slate-500">Pazar dahil herhangi bir tarihi yalnızca seçili sınıflar için açabilirsiniz.</p>
            {!denemeFormAcik && (
              <Button variant="secondary" icon={CalendarPlus} onClick={() => {
                setDenemeTaslak(yeniDenemePlani()); setDuzenlenenDeneme(null); setDenemeFormAcik(true);
              }}>Yeni deneme günü</Button>
            )}
          </div>
        </Field>

        {denemeFormAcik && <>
        <Field label={duzenlenenDeneme ? 'Deneme planını düzenle' : 'Yeni deneme planı'} stacked>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[180px_minmax(0,1fr)]">
            <Input type="date" value={denemeTaslak.date} onChange={denemeAlani('date')} className="tabular-nums" />
            <Input value={denemeTaslak.name} onChange={denemeAlani('name')} placeholder="Örn. 12. sınıf genel denemesi" />
          </div>
        </Field>

        <Field
          label="Yoklama uygulanacak seviyeler"
          hint="Seçili olanlar deneme programına uyar. Seçili olmayan seviyeler o tarihte yoklama dışıdır; devamsızlık yazılmaz."
          stacked
        >
          <div className="flex flex-wrap gap-2">
            {['9', '10', '11', '12'].map((seviye) => {
              const acik = denemeTaslak.grades.includes(seviye);
              return (
                <button
                  key={seviye}
                  type="button"
                  onClick={() => denemeSinifiCevir(seviye)}
                  className={cx(
                    'min-w-[116px] rounded-lg border px-3 py-2 text-left transition-colors',
                    acik
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/30 dark:text-emerald-300'
                      : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-400'
                  )}
                >
                  <span className="block text-[13px] font-semibold">{seviye}. sınıf</span>
                  <span className="mt-0.5 block text-[10.5px]">{acik ? 'Yoklama açık' : 'Yoklama kapalı'}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Sınav başlangıcı ve süresi" hint="Başlangıç saatinden sonra yapılan girişler geç olarak kaydedilir; otomatik reddedilmez.">
          <div className="flex flex-wrap items-center gap-2">
            <Saat value={denemeTaslak.entryHour} onChange={denemeAlani('entryHour')} />
            <Sayi min="30" max="600" value={denemeTaslak.durationMinutes} onChange={denemeSayisi('durationMinutes')} />
            <span className="text-[12px] text-slate-500">dk sınav</span>
            <Badge tone="neutral">Bitiş {normalizeExamDays([denemeTaslak])[0]?.examEndHour || '—'}</Badge>
          </div>
        </Field>

        <Field label="Geç kalma müsaadesi" hint="0 dakika seçildiğinde başlangıç saatinden sonraki her giriş geç sayılır.">
          <div className="flex items-center gap-2">
            <Sayi min="0" max="240" value={denemeTaslak.graceMinutes} onChange={denemeSayisi('graceMinutes')} />
            <span className="text-[12px] text-slate-500">dk</span>
          </div>
        </Field>

        <Field label="Sınav sonrası otomatik çıkış" hint="Sınav biter bitmez değil, burada belirlenen saatte yalnızca deneme kapsamındaki öğrenciler dışarı alınır.">
          <div className="flex flex-wrap items-center gap-2">
            <Saat value={denemeTaslak.autoExitHour} onChange={denemeAlani('autoExitHour')} />
            <span className="text-[12px] text-slate-500">Sınav bitişinden önce olamaz.</span>
          </div>
        </Field>

        <Field label="Öğleden sonra etüt" stacked>
          <Switch
            id="exam-study-enabled"
            checked={Boolean(denemeTaslak.studyEnabled)}
            onChange={() => setDenemeTaslak((o) => ({ ...o, studyEnabled: !o.studyEnabled }))}
            label="Deneme sonrasında etüt var"
            description={denemeTaslak.studyEnabled
              ? 'Sınav ve etüt iki ayrı yoklama oturumu olur; etüt için yeniden giriş beklenir.'
              : 'Etüt yok: sınava giriş yapan öğrenci tam gün mevcut sayılır, öğleden sonra devamsızlığı oluşmaz.'}
          />
        </Field>

        {denemeTaslak.studyEnabled && (
          <Field label="Etüt saatleri" hint="Etüt başlangıcından sonra müsaade süresi aşılırsa öğrenci geç sayılır.">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-slate-500">Giriş</span>
              <Saat value={denemeTaslak.studyEntryHour} onChange={denemeAlani('studyEntryHour')} />
              <span className="text-[12px] text-slate-500">müsaade</span>
              <Sayi min="0" max="240" value={denemeTaslak.studyGraceMinutes} onChange={denemeSayisi('studyGraceMinutes')} />
              <span className="text-[12px] text-slate-500">dk · çıkış</span>
              <Saat value={denemeTaslak.studyExitHour} onChange={denemeAlani('studyExitHour')} />
            </div>
          </Field>
        )}

        <Field label="Plan işlemi" stacked>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" icon={duzenlenenDeneme ? Save : CalendarPlus} onClick={denemePlaniEkle}>
              {duzenlenenDeneme ? 'Planı güncelle' : 'Planı ekle'}
            </Button>
            <Button variant="secondary" icon={X} onClick={() => {
              setDenemeTaslak(yeniDenemePlani()); setDuzenlenenDeneme(null); setDenemeFormAcik(false);
            }}>Vazgeç</Button>
          </div>
        </Field>
        </>}

        <Field label="Tanımlı deneme günleri" stacked>
          {(cozulmus.examDays || []).length === 0 ? (
            <p className="m-0 text-[12.5px] text-slate-500">Henüz tarihe özel deneme planı yok.</p>
          ) : (
            <div className={cx('divide-y rounded-lg border', hairline)}>
              {cozulmus.examDays.map((plan) => (
                <div key={plan.date} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
                  <BookOpenCheck size={15} className="shrink-0 text-slate-400" />
                  <div className="min-w-[180px] flex-1">
                    <div className="text-[13px] font-medium text-slate-800 dark:text-slate-100">{plan.name}</div>
                    <div className="mt-0.5 text-[11.5px] text-slate-500">
                      {tarihGoster(plan.date)} · {plan.grades.map((grade) => `${grade}. sınıf`).join(', ')}
                    </div>
                  </div>
                  <div className="text-[11.5px] tabular-nums text-slate-500">
                    {plan.entryHour}–{plan.examEndHour} · otomatik çıkış {plan.autoExitHour}
                    {plan.studyEnabled ? ` · etüt ${plan.studyEntryHour}–${plan.studyExitHour}` : ' · etüt yok, tam gün mevcut'}
                  </div>
                  <Button variant="secondary" icon={Pencil} onClick={() => denemePlaniDuzenle(plan)}>Düzenle</Button>
                  <Button variant="secondary" icon={Trash2} onClick={() => denemePlaniSil(plan.date)}>Kaldır</Button>
                </div>
              ))}
            </div>
          )}
        </Field>
      </Bolum>}

      {sekme === 'takvim' && <Bolum
        ikon={BookOpenCheck}
        baslik="Cumartesi ve Özel Gün Programları"
        aciklama="Normalde kapalı bir günü tarih bazında açın. Hazır programı seçince yalnızca gerekli alanlar görünür."
      >
        <Field label="Programlar" stacked>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-[12px] text-slate-500">
              Cumartesi kalıcı olarak açılmaz; yalnızca burada kaydedilen tarih çalışır.
            </p>
            {!ozelFormAcik && (
              <Button variant="secondary" icon={CalendarPlus} onClick={() => {
                setOzelTaslak(yeniOzelProgram()); setDuzenlenenOzel(null); setOzelFormAcik(true);
              }}>Yeni özel gün programı</Button>
            )}
          </div>
        </Field>

        {ozelFormAcik && <>
          <Field label="Program türü" stacked>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ['lessons_study', '4 ders + etüt', 'Sabah dersleri, ardından etüt'],
                ['study_only', 'Yalnız etüt', 'Tek giriş ve tek yoklama'],
                ['custom', 'Özel program', 'Ders ve etüt saatlerini serbest ayarla'],
              ].map(([type, label, detail]) => (
                <button key={type} type="button" onClick={() => ozelTipSec(type)}
                  className={cx('rounded-lg border px-3 py-2.5 text-left transition-colors',
                    ozelTaslak.type === type
                      ? 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700/60 dark:bg-sky-950/30 dark:text-sky-200'
                      : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-400')}>
                  <span className="block text-[12.5px] font-semibold">{label}</span>
                  <span className="mt-0.5 block text-[10.5px]">{detail}</span>
                </button>
              ))}
            </div>
          </Field>

          <Field label={duzenlenenOzel ? 'Programı düzenle' : 'Tarih ve ad'} stacked>
            <div className="grid gap-2.5 sm:grid-cols-[180px_minmax(0,1fr)]">
              <Input type="date" value={ozelTaslak.date} onChange={ozelAlani('date')} className="tabular-nums" />
              <Input value={ozelTaslak.name} onChange={ozelAlani('name')} placeholder="Örn. Cumartesi 4 ders + etüt" />
            </div>
          </Field>

          <Field label="Katılacak sınıflar" stacked>
            <div className="flex flex-wrap gap-2">
              {SINIFLAR.map((grade) => {
                const active = ozelTaslak.grades.includes(grade);
                return <button key={grade} type="button" onClick={() => ozelSinifiCevir(grade)}
                  className={cx('rounded-lg border px-3 py-2 text-[12px] font-semibold transition-colors',
                    active
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/30 dark:text-emerald-300'
                      : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-400')}>
                  {grade}. sınıf · {active ? 'açık' : 'kapalı'}
                </button>;
              })}
            </div>
          </Field>

          <Field label="QR ve yoklama izinleri" hint="Yoklama açıldığında aynı rolün QR izni de otomatik açılır." stacked>
            <div className="grid gap-2 sm:grid-cols-2">
              {POLITIKA_ROLLERI.map((role) => (
                <div key={role.key} className={cx('flex items-center justify-between gap-3 rounded-lg border px-3 py-2', hairline)}>
                  <span className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">{role.label}</span>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => ozelRoluCevir('allowedRoles', role.key)}
                      className={cx('rounded-md px-2 py-1 text-[10.5px] font-semibold',
                        ozelTaslak.allowedRoles.includes(role.key)
                          ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                          : 'bg-slate-100 text-slate-400 dark:bg-white/[0.04]')}>QR</button>
                    <button type="button" onClick={() => ozelRoluCevir('attendanceRoles', role.key)}
                      className={cx('rounded-md px-2 py-1 text-[10.5px] font-semibold',
                        ozelTaslak.attendanceRoles.includes(role.key)
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-400 dark:bg-white/[0.04]')}>Yoklama</button>
                  </div>
                </div>
              ))}
            </div>
          </Field>

          <Field label={ozelTaslak.type === 'study_only' ? 'Etüt başlangıcı' : 'Sabah dersleri'} stacked>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-slate-500">Giriş</span>
              <Saat value={ozelTaslak.morningEntryHour} onChange={ozelAlani('morningEntryHour')} />
              <span className="text-[12px] text-slate-500">müsaade</span>
              <Sayi min="0" max="240" value={ozelTaslak.morningGraceMinutes} onChange={ozelSayisi('morningGraceMinutes')} />
              <span className="text-[12px] text-slate-500">dk</span>
            </div>
          </Field>

          {ozelTaslak.type !== 'study_only' && (
            <Field label="Ders düzeni" hint="Ders bitişi, ders ve teneffüs sürelerinden otomatik hesaplanır." stacked>
              <div className="flex flex-wrap items-center gap-2">
                <Sayi min="1" max="12" value={ozelTaslak.lessonCount} onChange={ozelSayisi('lessonCount')} />
                <span className="text-[12px] text-slate-500">ders ·</span>
                <Sayi min="5" max="240" value={ozelTaslak.lessonMinutes} onChange={ozelSayisi('lessonMinutes')} />
                <span className="text-[12px] text-slate-500">dk ders ·</span>
                <Sayi min="0" max="120" value={ozelTaslak.breakMinutes} onChange={ozelSayisi('breakMinutes')} />
                <span className="text-[12px] text-slate-500">dk teneffüs</span>
                <Badge tone="neutral">Ders bitişi {normalizeCustomSchedules([ozelTaslak])[0]?.lessonEndHour || '—'}</Badge>
              </div>
            </Field>
          )}

          {ozelTaslak.type !== 'study_only' && (
            <Field label="Ders sonrası etüt" stacked>
              <Switch id="custom-study-enabled" checked={Boolean(ozelTaslak.studyEnabled)}
                onChange={() => setOzelTaslak((o) => ({ ...o, studyEnabled: !o.studyEnabled }))}
                label="Derslerden sonra etüt yapılacak"
                description="Kapalıysa seçilen ders programı tek oturum kabul edilir." />
            </Field>
          )}

          {(ozelTaslak.type === 'study_only' || ozelTaslak.studyEnabled) && (
            <Field label="Etüt ve gün sonu" stacked>
              <div className="flex flex-wrap items-center gap-2">
                {ozelTaslak.type !== 'study_only' && <>
                  <span className="text-[12px] text-slate-500">Etüt girişi</span>
                  <Saat value={ozelTaslak.studyEntryHour} onChange={ozelAlani('studyEntryHour')} />
                </>}
                <span className="text-[12px] text-slate-500">müsaade</span>
                <Sayi min="0" max="240" value={ozelTaslak.studyGraceMinutes} onChange={ozelSayisi('studyGraceMinutes')} />
                <span className="text-[12px] text-slate-500">dk · çıkış</span>
                <Saat value={ozelTaslak.schoolExitHour} onChange={ozelAlani('schoolExitHour')} />
              </div>
            </Field>
          )}

          <Field label="Otomatik işlemler" stacked>
            <div className="grid gap-3 sm:grid-cols-2">
              {ozelTaslak.type !== 'study_only' && <Switch id="custom-lunch-exit"
                checked={Boolean(ozelTaslak.autoLunchExitEnabled)}
                onChange={() => setOzelTaslak((o) => ({ ...o, autoLunchExitEnabled: !o.autoLunchExitEnabled }))}
                label="Ders bitiminde otomatik çıkış"
                description="Etüde devam edenler yeniden giriş yapar. Genellikle kapalı bırakılır." />}
              <Switch id="custom-day-exit" checked={Boolean(ozelTaslak.autoSchoolExitEnabled)}
                onChange={() => setOzelTaslak((o) => ({ ...o, autoSchoolExitEnabled: !o.autoSchoolExitEnabled }))}
                label="Gün sonunda otomatik çıkış"
                description="İçeride kalan seçili kişilerin kaydı belirlenen çıkışta kapanır." />
            </div>
            <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
              Öğrenci SMS’i bu programda varsayılan olarak kapalıdır. Bu ayar kendiliğinden açılmaz.
            </div>
          </Field>

          <Field label="Program işlemi" stacked>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={duzenlenenOzel ? Save : CalendarPlus} onClick={ozelProgramKaydet}>
                {duzenlenenOzel ? 'Programı güncelle' : 'Programı ekle'}
              </Button>
              <Button variant="secondary" icon={X} onClick={() => {
                setOzelTaslak(yeniOzelProgram()); setDuzenlenenOzel(null); setOzelFormAcik(false);
              }}>Vazgeç</Button>
            </div>
          </Field>
        </>}

        <Field label="Tanımlı özel programlar" stacked>
          {(cozulmus.customSchedules || []).length === 0 ? (
            <p className="m-0 text-[12.5px] text-slate-500">Henüz tarihe özel ders veya etüt programı yok.</p>
          ) : (
            <div className={cx('divide-y rounded-lg border', hairline)}>
              {cozulmus.customSchedules.map((program) => (
                <div key={program.date} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
                  <BookOpenCheck size={15} className="text-slate-400" />
                  <div className="min-w-[190px] flex-1">
                    <div className="text-[13px] font-medium text-slate-800 dark:text-slate-100">{program.name}</div>
                    <div className="mt-0.5 text-[11.5px] text-slate-500">
                      {tarihGoster(program.date)} · {program.grades.join(', ')}. sınıflar
                    </div>
                  </div>
                  <div className="text-[11.5px] text-slate-500">
                    {ozelProgramAdi(program.type)} · {program.morningEntryHour}–{program.schoolExitHour}
                  </div>
                  <Button variant="secondary" icon={Pencil} onClick={() => ozelProgramDuzenle(program)}>Düzenle</Button>
                  <Button variant="secondary" icon={Trash2} onClick={() => ozelProgramSil(program.date)}>Kaldır</Button>
                </div>
              ))}
            </div>
          )}
        </Field>
      </Bolum>}

      {sekme === 'normal' && <Bolum ikon={Clock} baslik="Gün Akışı" aciklama="Kurumun açık olduğu aralık ve ders oturumlarının saatleri.">
        <Field label="Gün başlangıcı" hint="Bu saatten önceki okutmalar mesai dışı sayılır.">
          <Saat value={cozulmus.dayStartHour} onChange={yaz('dayStartHour')} />
        </Field>
        <Field label="Sabah girişi" hint={`Gecikme bu saatten sayılır. Son serbest giriş: ${minutesToTime(pencere.sabahMusaadeSonu)}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Saat value={cozulmus.morningEntryHour} onChange={yaz('morningEntryHour')} />
            <span className="text-[12px] text-slate-500">müsaade</span>
            <Sayi min="0" max="240" value={cozulmus.morningGraceMinutes} onChange={say('morningGraceMinutes')} />
            <span className="text-[12px] text-slate-500">dk</span>
          </div>
        </Field>
        <Field label="Öğle çıkışı" hint="Bu saatten öğleden sonra girişine kadar yapılan çıkışlar öğle çıkışıdır.">
          <div className="flex flex-wrap items-center gap-2">
            <Saat value={cozulmus.lunchExitHour} onChange={yaz('lunchExitHour')} />
            <span className="text-[12px] text-slate-500">müsaade</span>
            <Sayi min="0" max="240" value={cozulmus.lunchExitGraceMinutes} onChange={say('lunchExitGraceMinutes')} />
            <span className="text-[12px] text-slate-500">dk</span>
          </div>
        </Field>
        <Field label="Yarım gün sınırı" hint="Bir okutmanın sabaha mı öğleden sonraya mı sayılacağını bu saat ayırır.">
          <Saat value={cozulmus.halfDayCutoffHour} onChange={yaz('halfDayCutoffHour')} />
        </Field>
        <Field label="Öğleden sonra girişi" hint={`Son serbest giriş: ${minutesToTime(pencere.ogledenSonraMusaadeSonu)}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Saat value={cozulmus.afternoonEntryHour} onChange={yaz('afternoonEntryHour')} />
            <span className="text-[12px] text-slate-500">müsaade</span>
            <Sayi min="0" max="240" value={cozulmus.afternoonGraceMinutes} onChange={say('afternoonGraceMinutes')} />
            <span className="text-[12px] text-slate-500">dk</span>
          </div>
        </Field>
        <Field label="Okul çıkışı" hint="Bu saatten sonraki çıkışlar gün sonu çıkışıdır; devamsızlık oluşturmaz.">
          <Saat value={cozulmus.schoolExitHour} onChange={yaz('schoolExitHour')} />
        </Field>
        <Field label="Gün sonu" hint="Bu saatten sonra hiçbir okutma kabul edilmez.">
          <Saat value={cozulmus.gunSonu} onChange={yaz('gunSonu')} />
        </Field>
      </Bolum>}

      {sekme === 'normal' && <Bolum
        ikon={GraduationCap}
        baslik="Oturum Kuralları"
        aciklama="Bir öğrencinin sabah ya da öğleden sonra oturumunu kazanması için gereken koşullar."
      >
        <Field label="Ders / teneffüs süresi" hint="Son giriş saatleri bu ikisinden hesaplanır.">
          <div className="flex flex-wrap items-center gap-2">
            <Sayi min="5" max="240" value={cozulmus.dersSuresiDk} onChange={say('dersSuresiDk')} />
            <span className="text-[12px] text-slate-500">dk ders</span>
            <Sayi min="0" max="120" value={cozulmus.teneffusDk} onChange={say('teneffusDk')} />
            <span className="text-[12px] text-slate-500">dk teneffüs</span>
          </div>
        </Field>
        <Field
          label="Sabah son giriş"
          hint={`İlk ${cozulmus.sabahSonGirisDers} ders kaçırılırsa öğrenci sonradan gelse bile sabah oturumu kazanılmaz. Hesaplanan saat: ${minutesToTime(pencere.sabahSonGiris)}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Sayi min="0" max="12" value={cozulmus.sabahSonGirisDers} onChange={say('sabahSonGirisDers')} />
            <span className="text-[12px] text-slate-500">ders · ya da sabit saat</span>
            <Saat value={cozulmus.sabahSonGirisSaati} onChange={yaz('sabahSonGirisSaati')} />
          </div>
        </Field>
        <Field
          label="Öğleden sonra son giriş"
          hint={`İlk ${cozulmus.ogledenSonraSonGirisDers} ders kaçırılırsa öğleden sonra oturumu kazanılmaz. Hesaplanan saat: ${minutesToTime(pencere.ogledenSonraSonGiris)}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Sayi min="0" max="12" value={cozulmus.ogledenSonraSonGirisDers} onChange={say('ogledenSonraSonGirisDers')} />
            <span className="text-[12px] text-slate-500">ders · ya da sabit saat</span>
            <Saat value={cozulmus.ogledenSonraSonGirisSaati} onChange={yaz('ogledenSonraSonGirisSaati')} />
          </div>
        </Field>
        <Field label="Oturum asgari süresi" hint="Bir oturumun sayılması için kurumda geçirilmesi gereken en az süre.">
          <div className="flex items-center gap-2">
            <Sayi min="0" max="600" value={cozulmus.oturumAsgariDk} onChange={say('oturumAsgariDk')} />
            <span className="text-[12px] text-slate-500">dk</span>
          </div>
        </Field>
        <Field label="Bekleme aralığı" hint="Aynı kişi bu süre dolmadan tekrar okutamaz; kazara çift okutmayı engeller.">
          <div className="flex items-center gap-2">
            <Sayi min="0" max="3600" value={cozulmus.bekleAralikSn} onChange={say('bekleAralikSn')} />
            <span className="text-[12px] text-slate-500">saniye</span>
          </div>
        </Field>
      </Bolum>}

      {sekme === 'normal' && <Bolum ikon={ShieldCheck} baslik="Geçiş Kuralları" aciklama="Kapıda kimin geçebileceğini ve neyin sorulacağını belirler.">
        <Field label="Geç girişi engelle" stacked>
          <Switch
            id="gecGirisEngelle" checked={Boolean(cozulmus.gecGirisEngelle)} onChange={anah('gecGirisEngelle')}
            label="Karekodla geç giren içeri alınmasın"
            description={`Müsaade dolduktan sonra (${minutesToTime(pencere.sabahMusaadeSonu)}) okutan öğrencinin girişi kaydedilmez; rehberliğe yönlendirilir. Görevli manuel geçişle yine de alabilir — o zaman onay sorulur ve kayıt geç giriş olarak işlenir.`}
          />
        </Field>
        <Field label="Erken çıkışta onay iste" stacked>
          <Switch
            id="erkenCikisOnayIster" checked={Boolean(cozulmus.erkenCikisOnayIster)} onChange={anah('erkenCikisOnayIster')}
            label="Çıkış saatinden önce çıkanlara sorulsun"
            description={`Okul çıkışından (${cozulmus.schoolExitHour}) önce çıkmak isteyene “erken çıktığımı kabul ediyorum” onayı gösterilir.`}
          />
        </Field>
        <Field label="Geç girende rehberlik" stacked>
          <Switch
            id="gecGirisRehberlikUyar" checked={Boolean(cozulmus.gecGirisRehberlikUyar)} onChange={anah('gecGirisRehberlikUyar')}
            label="Rehber öğretmene yönlendir"
            description="Geç kalan öğrenciye derse girmeden önce rehber öğretmenine uğraması söylenir."
          />
        </Field>
        <Field label="Kapalı günler" stacked>
          <Switch
            id="kapaliGunEngelle" checked={Boolean(cozulmus.kapaliGunEngelle)} onChange={anah('kapaliGunEngelle')}
            label="Kapalı gün ve tatillerde geçişi engelle"
            description="Kapatılırsa okutma alınır ama devamsızlık yine işlenmez."
          />
        </Field>
        <Field label="Mesai dışı" stacked>
          <Switch
            id="mesaiDisiEngelle" checked={Boolean(cozulmus.mesaiDisiEngelle)} onChange={anah('mesaiDisiEngelle')}
            label={`Geçiş yalnızca ${cozulmus.dayStartHour} – ${cozulmus.gunSonu} arasında alınsın`}
            description="Bu aralığın dışında okutulduğunda kullanıcıya “yine de kaydedilsin mi?” diye sorulur."
          />
        </Field>
      </Bolum>}

      {sekme === 'normal' && <Bolum ikon={Users} baslik="Personel" aciklama="Öğretmen, yönetici ve personel aynı karekodu kullanır; fark yalnızca saat kısıtıdır.">
        <Field label="Personel devamsızlığı" stacked>
          <Switch
            id="staffAttendanceEnabled" checked={Boolean(cozulmus.staffAttendanceEnabled)} onChange={anah('staffAttendanceEnabled')}
            label="Personel için de devamsızlık tutulsun"
            description="Kapatılırsa personel okutmaya devam eder ama devamsızlık yazılmaz."
          />
        </Field>
        <Field label="Esnek mesai" stacked>
          <Switch
            id="personelSaatSerbest" checked={Boolean(cozulmus.personelSaatSerbest)} onChange={anah('personelSaatSerbest')}
            label="Personel saat kısıtından muaf"
            description="Açıkken personel gün içinde istediği saatte okutabilir, geç sayılmaz ve erken çıkış onayı istenmez."
          />
        </Field>
        <Field label="Personel devamsızlık saati" hint="Bu saate kadar hiç okutmayan personele devamsızlık yazılır.">
          <Saat value={cozulmus.staffAbsenceCutoffHour} onChange={yaz('staffAbsenceCutoffHour')} />
        </Field>
        <Field label="Devamsızlık ağırlığı" hint="Okutmayan personelin gününe kaç gün devamsızlık işleneceği.">
          <Select className="max-w-[200px]" value={String(cozulmus.staffAbsenceWeight)} onChange={yaz('staffAbsenceWeight')}>
            <option value="1">Tam gün (1,0)</option>
            <option value="0.5">Yarım gün (0,5)</option>
          </Select>
        </Field>
      </Bolum>}

      {sekme === 'takvim' && <Bolum ikon={CalendarOff} baslik="Haftalık Kapanış ve Tatil Takvimi"
        aciklama="Tatil aralığını ekleyin; sonra her tarih için öğrenci, öğretmen, personel ve idare izinlerini ayrı ayrı belirleyin.">
        <Field label="Haftalık kapalı günler" stacked>
          <div className="flex flex-wrap gap-2">
            {GUNLER.map((g) => {
              const kapali = (cozulmus.closedDays || []).includes(g);
              return (
                <button
                  key={g} type="button" onClick={() => gunuCevir(g)}
                  className={cx('rounded-lg border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                    kapali
                      ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400')}
                >
                  {g}
                </button>
              );
            })}
          </div>
          <p className="m-0 mt-2 text-[11.5px] text-slate-500">
            Cumartesi ve pazar burada kapalı kalabilir. Deneme veya özel program eklediğiniz tarih, yalnızca seçili kişiler için açılır.
          </p>
        </Field>
        <Field label="Yeni tatil aralığı" hint="Hafta sonları varsayılan olarak tamamen kapalı; açık hafta içlerinde öğretmen, personel ve idare QR/yoklaması açık oluşturulur." stacked>
          <div className="grid gap-2.5 sm:grid-cols-[minmax(160px,1fr)_170px_170px_auto]">
            <Input value={tatilTaslak.name} placeholder="Tatil adı"
              onChange={(e) => setTatilTaslak((o) => ({ ...o, name: e.target.value }))} />
            <Input type="date" value={tatilTaslak.startDate} className="tabular-nums"
              onChange={(e) => setTatilTaslak((o) => ({ ...o, startDate: e.target.value,
                endDate: o.endDate && o.endDate >= e.target.value ? o.endDate : e.target.value }))} />
            <Input type="date" value={tatilTaslak.endDate} className="tabular-nums"
              onChange={(e) => setTatilTaslak((o) => ({ ...o, endDate: e.target.value }))} />
            <Button variant="secondary" icon={CalendarPlus} onClick={tatilEkle}>Günleri oluştur</Button>
          </div>
        </Field>

        <Field label="Tarih bazlı izinler" hint="QR geçişi ve yoklama birbirinden bağımsızdır. Yoklamayı açmak aynı rolün QR iznini de açar." stacked>
          {(cozulmus.specialDays || []).length === 0 ? (
            <p className="m-0 text-[12.5px] text-slate-500">Henüz tarih bazlı tatil kuralı yok.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {cozulmus.specialDays.map((day) => (
                <div key={day.date} className={cx('rounded-xl border p-3.5', hairline)}>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">{day.name}</div>
                      <div className="mt-0.5 text-[11.5px] text-slate-500">{tarihGoster(day.date)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone="danger">Öğrenci SMS kapalı</Badge>
                      <Button variant="secondary" icon={Trash2} onClick={() => setAyar((o) => ({
                        ...o, specialDays: (o.specialDays || []).filter((item) => item.date !== day.date)
                      }))}>Kaldır</Button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {POLITIKA_ROLLERI.map((role) => (
                      <div key={role.key} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/[0.025]">
                        <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{role.label}</span>
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => tatilRoluCevir(day.date, 'allowedRoles', role.key)}
                            className={cx('rounded-md px-2 py-1 text-[10.5px] font-semibold',
                              day.allowedRoles.includes(role.key)
                                ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'
                                : 'bg-slate-200/70 text-slate-400 dark:bg-white/[0.05]')}>QR</button>
                          <button type="button" onClick={() => tatilRoluCevir(day.date, 'attendanceRoles', role.key)}
                            className={cx('rounded-md px-2 py-1 text-[10.5px] font-semibold',
                              day.attendanceRoles.includes(role.key)
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                : 'bg-slate-200/70 text-slate-400 dark:bg-white/[0.05]')}>Yoklama</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Field>

        {(cozulmus.holidays || []).length > 0 && (
          <Field label="Eski tekil kapalı günler" hint="Bu kayıtlar tüm roller için kapalıdır. Ayrıntılı kontrol için aynı tarihi yukarıdaki tatil aralığından oluşturabilirsiniz." stacked>
          {(cozulmus.holidays || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {cozulmus.holidays.map((t) => (
                <span key={t} className={cx('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] tabular-nums', hairline)}>
                  {t}
                  <button type="button" aria-label={`${t} tatilini kaldır`}
                          onClick={() => setAyar((o) => ({ ...o, holidays: (o.holidays || []).filter((x) => x !== t) }))}
                          className="text-slate-400 hover:text-rose-600">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          </Field>
        )}
      </Bolum>}

      {sekme === 'otomasyon' && <Bolum ikon={Timer} baslik="Otomasyon" aciklama="Sistemin kendi kendine yaptığı işlemler.">
        <Field label="Otomatik devamsızlık" stacked>
          <Switch
            id="autoAttendanceEnabled" checked={Boolean(cozulmus.autoAttendanceEnabled)} onChange={anah('autoAttendanceEnabled')}
            label="Oturum kapandığında devamsızlık yazılsın"
            description={`Yarım gün sınırında (${cozulmus.halfDayCutoffHour}) ve okul çıkışında (${cozulmus.schoolExitHour}) gelmeyenlere otomatik işlenir.`}
          />
        </Field>
        <Field label="Otomatik öğle çıkışı" stacked>
          <Switch
            id="autoLunchExitEnabled" checked={Boolean(cozulmus.autoLunchExitEnabled)} onChange={anah('autoLunchExitEnabled')}
            label="Öğle arasında çıkış okutmayanların çıkışı verilsin"
            description={`${minutesToTime(pencere.ogleCikis + (Number(cozulmus.lunchExitGraceMinutes) || 0))} itibarıyla uygulanır.`}
          />
        </Field>
        <Field label="Gün sonu otomatik çıkış" stacked>
          <Switch
            id="autoSchoolExitEnabled" checked={Boolean(cozulmus.autoSchoolExitEnabled)} onChange={anah('autoSchoolExitEnabled')}
            label="Okul çıkışında hâlâ içeride görünenlerin kaydı kapatılsın"
            description={`Okul çıkışı: ${cozulmus.schoolExitHour}.`}
          />
        </Field>
      </Bolum>}

      <div className={cx('flex items-center justify-between gap-3 rounded-xl border p-4', hairline)}>
        <p className="m-0 text-[12px] text-slate-500 dark:text-slate-400">
          {degisti
            ? 'Değişiklikler henüz kaydedilmedi. Kaydettiğinizde sunucudan geri okunup doğrulanır.'
            : (<span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                 <Check size={13} strokeWidth={3} /> Ekrandaki kurallar sunucudakiyle birebir aynı.
               </span>)}
        </p>
        <Button variant="primary" icon={Save} onClick={kaydet} disabled={kaydediliyor || !degisti}>
          {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </div>
    </div>
  );
};

export default InstitutionSettingsAdminView;
