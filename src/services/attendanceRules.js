/**
 * ============================================================================
 *  YOKLAMA & DEVAMSIZLIK KURAL MOTORU  (Attendance Rules Engine)
 * ============================================================================
 *  Saf (pure) fonksiyonlardan oluşur. Firebase / DOM / Node bağımlılığı YOKTUR.
 *  Bu sayede aynı dosya üç yerde birden çalışır:
 *
 *    1) BGZ Mobil Web App  (QRCodeRedirect.jsx - öğrencinin karekod okuttuğu ekran)
 *    2) IALMobil Admin Windows (Electron paneli - geçiş, devamsızlık, rapor ekranları)
 *    3) VDS Backend (ial-backend/attendanceRules.cjs - otomatik üretilen CommonJS kopyası)
 *
 *  Üç taraf da BİREBİR aynı kararı üretir; bu yüzden mobil ile masaüstü asla
 *  çelişmez. Backend kopyası `scripts/build-backend-rules.cjs` ile üretilir.
 * ============================================================================
 */

/* -------------------------------------------------------------------------- */
/*  Varsayılan kurum yapılandırması                                            */
/* -------------------------------------------------------------------------- */

export const DEFAULT_ATTENDANCE_CONFIG = {
  timeZone: 'Europe/Istanbul',

  // Gün sınırları: bu saatlerin dışındaki okutmalar "mesai dışı" sayılır.
  dayStartHour: '06:00',

  // Sabah oturumu
  morningEntryHour: '09:00',
  morningGraceMinutes: 10,          // 09:10'a kadar serbest, 09:11 -> rehberlik

  // Öğle çıkışı
  lunchExitHour: '12:00',
  lunchExitGraceMinutes: 10,        // 12:10'a kadar bekle, okutmadıysa otomatik çıkış

  // Öğleden sonra oturumu
  afternoonEntryHour: '13:00',
  afternoonGraceMinutes: 10,        // 13:10'a kadar serbest, 13:11 -> rehberlik

  // Okul çıkış saati (kurum ayarlarından değiştirilebilir)
  schoolExitHour: '16:00',

  // Yarım gün sınırı: bu saatten ÖNCE gelen "sabah var" sayılır.
  halfDayCutoffHour: '12:00',

  // Otomasyon anahtarları
  autoAttendanceEnabled: true,      // otomatik yarım/tam gün yok yazma
  autoLunchExitEnabled: true,       // 12:10 otomatik çıkış
  autoSchoolExitEnabled: true,      // okul çıkış saatinde otomatik çıkış
  lateRequiresCounselorApproval: true, // geç kalan rehber öğretmene yönlendirilsin

  // Takvim
  closedDays: ['Pazar'],            // haftalık kapalı günler
  holidays: [],                     // ['2026-04-23', ...] tatil günleri

  // Geriye dönük uyumluluk (eski kurum ayarları ekranı)
  openingHour: '08:00',
  closingHour: '18:00',
  lunchBreakStart: '12:00',
  lunchBreakEnd: '13:00'
};

export const TURKISH_DAY_NAMES = [
  'Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'
];

export const SESSION_MORNING = 'morning';
export const SESSION_AFTERNOON = 'afternoon';

/* -------------------------------------------------------------------------- */
/*  Zaman yardımcıları                                                         */
/* -------------------------------------------------------------------------- */

/** "09:05" -> 545 dakika. Geçersizse null. */
export const timeToMinutes = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(24 * 60 - 1, Math.round(value)));
  }
  const match = String(value).trim().match(/^(\d{1,2}):(\d{1,2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
};

/** 545 -> "09:05" */
export const minutesToTime = (minutes) => {
  if (!Number.isFinite(minutes)) return '--:--';
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Verilen tarihin, hedef saat diliminde (varsayılan Europe/Istanbul) gece
 * yarısından itibaren kaçıncı dakika olduğunu döner.
 * Sunucu UTC'de çalışsa bile Türkiye saatine göre karar verilmesini sağlar.
 */
export const getMinutesInTimeZone = (date, timeZone) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || DEFAULT_ATTENDANCE_CONFIG.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(d);
    const hour = Number(parts.find(p => p.type === 'hour')?.value);
    const minute = Number(parts.find(p => p.type === 'minute')?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) throw new Error('bad parts');
    return (hour % 24) * 60 + minute;
  } catch {
    return d.getHours() * 60 + d.getMinutes();
  }
};

/** Hedef saat diliminde "YYYY-MM-DD" gün anahtarı. */
export const getDateKeyInTimeZone = (date, timeZone) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || DEFAULT_ATTENDANCE_CONFIG.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  } catch {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
};

/** Hedef saat diliminde Türkçe gün adı ("Pazartesi"). */
export const getDayNameInTimeZone = (date, timeZone) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const name = new Intl.DateTimeFormat('tr-TR', {
      timeZone: timeZone || DEFAULT_ATTENDANCE_CONFIG.timeZone,
      weekday: 'long'
    }).format(d);
    // Bazı ICU sürümleri küçük harf döndürebiliyor -> baş harfi büyüt.
    return name.charAt(0).toLocaleUpperCase('tr-TR') + name.slice(1);
  } catch {
    return TURKISH_DAY_NAMES[d.getDay()];
  }
};

/* -------------------------------------------------------------------------- */
/*  Yapılandırma çözümleme                                                     */
/* -------------------------------------------------------------------------- */

const coerceTime = (raw, fallback) => {
  const parsed = timeToMinutes(raw);
  return parsed === null ? timeToMinutes(fallback) : parsed;
};

const coerceInt = (raw, fallback, min, max) => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
};

const coerceBool = (raw, fallback) => {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  const s = String(raw).trim().toLowerCase();
  if (['true', '1', 'evet', 'yes', 'acik', 'açık', 'on'].includes(s)) return true;
  if (['false', '0', 'hayir', 'hayır', 'no', 'kapali', 'kapalı', 'off'].includes(s)) return false;
  return fallback;
};

/**
 * Firestore `config/institution` dökümanını güvenli, tutarlı ve tam bir
 * yapılandırmaya dönüştürür. Eksik alanlar varsayılanla doldurulur, geçersiz
 * saatler düzeltilir, sıralama bozuksa mantıklı biçimde onarılır.
 *
 * Sıra kuralı: dayStart <= morningEntry <= halfDayCutoff(=lunchExit) <=
 *              afternoonEntry <= schoolExit
 */
export const resolveAttendanceConfig = (raw) => {
  const src = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_ATTENDANCE_CONFIG;

  const timeZone = typeof src.timeZone === 'string' && src.timeZone ? src.timeZone : d.timeZone;

  let dayStart = coerceTime(src.dayStartHour, d.dayStartHour);
  let morningEntry = coerceTime(src.morningEntryHour, d.morningEntryHour);
  let lunchExit = coerceTime(src.lunchExitHour !== undefined ? src.lunchExitHour : src.lunchBreakStart, d.lunchExitHour);
  let afternoonEntry = coerceTime(src.afternoonEntryHour !== undefined ? src.afternoonEntryHour : src.lunchBreakEnd, d.afternoonEntryHour);
  let schoolExit = coerceTime(src.schoolExitHour !== undefined ? src.schoolExitHour : src.closingHour, d.schoolExitHour);
  let halfDayCutoff = coerceTime(src.halfDayCutoffHour, null);
  if (halfDayCutoff === null) halfDayCutoff = lunchExit;

  const morningGrace = coerceInt(src.morningGraceMinutes, d.morningGraceMinutes, 0, 240);
  const lunchGrace = coerceInt(src.lunchExitGraceMinutes, d.lunchExitGraceMinutes, 0, 240);
  const afternoonGrace = coerceInt(src.afternoonGraceMinutes, d.afternoonGraceMinutes, 0, 240);

  // --- Tutarlılık onarımı (kullanıcı saatleri ters girerse sistem kilitlenmesin) ---
  if (morningEntry < dayStart) dayStart = morningEntry;
  if (lunchExit <= morningEntry) lunchExit = Math.min(24 * 60 - 1, morningEntry + 60);
  if (halfDayCutoff < morningEntry) halfDayCutoff = lunchExit;
  if (halfDayCutoff > 24 * 60 - 1) halfDayCutoff = 24 * 60 - 1;
  if (afternoonEntry < halfDayCutoff) afternoonEntry = halfDayCutoff;
  if (schoolExit <= afternoonEntry) schoolExit = Math.min(24 * 60 - 1, afternoonEntry + 60);

  const closedDays = Array.isArray(src.closedDays)
    ? src.closedDays.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim())
    : d.closedDays.slice();

  const holidays = Array.isArray(src.holidays)
    ? src.holidays.filter(x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.trim())).map(x => x.trim())
    : [];

  return {
    timeZone,

    dayStartHour: minutesToTime(dayStart),
    morningEntryHour: minutesToTime(morningEntry),
    morningGraceMinutes: morningGrace,
    lunchExitHour: minutesToTime(lunchExit),
    lunchExitGraceMinutes: lunchGrace,
    afternoonEntryHour: minutesToTime(afternoonEntry),
    afternoonGraceMinutes: afternoonGrace,
    schoolExitHour: minutesToTime(schoolExit),
    halfDayCutoffHour: minutesToTime(halfDayCutoff),

    autoAttendanceEnabled: coerceBool(src.autoAttendanceEnabled, d.autoAttendanceEnabled),
    autoLunchExitEnabled: coerceBool(src.autoLunchExitEnabled, d.autoLunchExitEnabled),
    autoSchoolExitEnabled: coerceBool(src.autoSchoolExitEnabled, d.autoSchoolExitEnabled),
    lateRequiresCounselorApproval: coerceBool(src.lateRequiresCounselorApproval, d.lateRequiresCounselorApproval),

    closedDays,
    holidays,

    // Eski alanlar korunur (başka ekranlar kullanıyor olabilir)
    openingHour: typeof src.openingHour === 'string' ? src.openingHour : d.openingHour,
    closingHour: minutesToTime(schoolExit),
    lunchBreakStart: minutesToTime(lunchExit),
    lunchBreakEnd: minutesToTime(afternoonEntry)
  };
};

/* -------------------------------------------------------------------------- */
/*  Zaman pencereleri                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Çözümlenmiş yapılandırmadan dakika cinsinden tüm eşikleri üretir.
 */
export const getAttendanceWindows = (config) => {
  const cfg = config && config.morningEntryHour ? config : resolveAttendanceConfig(config);

  const dayStart = timeToMinutes(cfg.dayStartHour);
  const morningStart = timeToMinutes(cfg.morningEntryHour);
  const morningGraceEnd = morningStart + cfg.morningGraceMinutes;
  const halfDayCutoff = timeToMinutes(cfg.halfDayCutoffHour);
  const lunchExitStart = timeToMinutes(cfg.lunchExitHour);
  const lunchExitAutoAt = lunchExitStart + cfg.lunchExitGraceMinutes;
  const afternoonStart = timeToMinutes(cfg.afternoonEntryHour);
  const afternoonGraceEnd = afternoonStart + cfg.afternoonGraceMinutes;
  const schoolExit = timeToMinutes(cfg.schoolExitHour);

  return {
    config: cfg,
    dayStart,
    morningStart,
    morningGraceEnd,
    halfDayCutoff,
    lunchExitStart,
    lunchExitAutoAt,
    afternoonStart,
    afternoonGraceEnd,
    schoolExit
  };
};

/** Verilen gün kurum takvimine göre kapalı mı? */
export const isClosedDay = (date, config) => {
  const cfg = config && config.morningEntryHour ? config : resolveAttendanceConfig(config);
  const dayName = getDayNameInTimeZone(date, cfg.timeZone);
  const dateKey = getDateKeyInTimeZone(date, cfg.timeZone);
  const closedByWeekday = (cfg.closedDays || []).some(
    d => String(d).toLocaleLowerCase('tr-TR') === String(dayName).toLocaleLowerCase('tr-TR')
  );
  const closedByHoliday = (cfg.holidays || []).includes(dateKey);
  return closedByWeekday || closedByHoliday;
};

/* -------------------------------------------------------------------------- */
/*  Okutma (scan) sınıflandırma                                                */
/* -------------------------------------------------------------------------- */

/**
 * Bir okutma anının hangi oturuma denk geldiğini ve geç kalınıp
 * kalınmadığını belirler.
 */
export const classifyScanMinutes = (minutes, config) => {
  const w = getAttendanceWindows(config);

  if (!Number.isFinite(minutes)) {
    return { session: null, isLate: false, lateByMinutes: 0, phase: 'unknown' };
  }

  if (minutes < w.dayStart) {
    return { session: null, isLate: false, lateByMinutes: 0, phase: 'before_school' };
  }

  if (minutes < w.halfDayCutoff) {
    const isLate = minutes > w.morningGraceEnd;
    return {
      session: SESSION_MORNING,
      isLate,
      lateByMinutes: isLate ? minutes - w.morningGraceEnd : 0,
      phase: minutes < w.morningStart ? 'early_morning' : (isLate ? 'late_morning' : 'on_time_morning')
    };
  }

  if (minutes <= w.schoolExit) {
    const isLate = minutes > w.afternoonGraceEnd;
    return {
      session: SESSION_AFTERNOON,
      isLate,
      lateByMinutes: isLate ? minutes - w.afternoonGraceEnd : 0,
      phase: minutes < w.afternoonStart ? 'lunch_window' : (isLate ? 'late_afternoon' : 'on_time_afternoon')
    };
  }

  return { session: null, isLate: false, lateByMinutes: 0, phase: 'after_school' };
};

/**
 * Farklı kaynaklardan (RTDB / Firestore / VDS) gelen ham geçiş kaydını
 * tek tip hale getirir.
 */
export const normalizeScanRecord = (raw, config) => {
  if (!raw || typeof raw !== 'object') return null;
  const cfg = config && config.morningEntryHour ? config : resolveAttendanceConfig(config);

  let minutes = null;

  if (typeof raw.minutes === 'number' && Number.isFinite(raw.minutes)) {
    minutes = raw.minutes;
  } else if (raw.timestamp && typeof raw.timestamp === 'object' && typeof raw.timestamp.seconds === 'number') {
    minutes = getMinutesInTimeZone(new Date(raw.timestamp.seconds * 1000), cfg.timeZone);
  } else if (raw.timestamp && typeof raw.timestamp.toDate === 'function') {
    minutes = getMinutesInTimeZone(raw.timestamp.toDate(), cfg.timeZone);
  } else if (typeof raw.timestamp === 'number' && raw.timestamp > 0) {
    minutes = getMinutesInTimeZone(new Date(raw.timestamp), cfg.timeZone);
  } else if (typeof raw.timestamp === 'string' && raw.timestamp) {
    const parsed = new Date(raw.timestamp);
    if (!Number.isNaN(parsed.getTime())) minutes = getMinutesInTimeZone(parsed, cfg.timeZone);
  }

  // Zaman damgası yoksa "HH:MM" alanına düş.
  if (minutes === null) minutes = timeToMinutes(raw.time);
  if (minutes === null) return null;

  const rawAction = String(raw.action || raw.status || 'entry').toLowerCase();
  const action = (rawAction === 'exit' || rawAction === 'outside' || rawAction === 'cikis' || rawAction === 'çıkış')
    ? 'exit'
    : 'entry';

  const classification = classifyScanMinutes(minutes, cfg);

  return {
    id: raw.id || raw.logId || null,
    studentId: raw.studentId || raw.userId || null,
    minutes,
    time: minutesToTime(minutes),
    action,
    session: classification.session,
    isLate: Boolean(raw.isLate) || classification.isLate,
    lateByMinutes: classification.lateByMinutes,
    auto: Boolean(raw.auto || raw.autoGenerated),
    autoKind: raw.autoKind || null,
    method: raw.method || (raw.isManualAdmin ? 'manual_admin' : 'qr'),
    approvedBy: raw.approvedBy || null,
    source: raw.source || null
  };
};

/** Okutmaları zaman sırasına dizip tekrarları temizler. */
export const sortAndDedupeScans = (scans) => {
  const list = (scans || []).filter(Boolean).slice();
  list.sort((a, b) => a.minutes - b.minutes);
  const out = [];
  for (const scan of list) {
    const prev = out[out.length - 1];
    // Aynı dakikada aynı yönde tekrar eden kayıtlar tek sayılır.
    if (prev && prev.action === scan.action && Math.abs(prev.minutes - scan.minutes) < 1) continue;
    out.push(scan);
  }
  return out;
};

/* -------------------------------------------------------------------------- */
/*  Giriş denemesi kararı (mobil web + turnike)                                */
/* -------------------------------------------------------------------------- */

export const ENTRY_DECISION = {
  OK: 'OK',
  OK_MANUAL: 'OK_MANUAL',
  LATE_MORNING: 'LATE_MORNING',
  LATE_AFTERNOON: 'LATE_AFTERNOON',
  OUT_OF_HOURS: 'OUT_OF_HOURS',
  CLOSED_DAY: 'CLOSED_DAY',
  ALREADY_INSIDE: 'ALREADY_INSIDE'
};

export const COUNSELOR_TITLE = 'Rehber Öğretmeninizle Görüşün';

/**
 * Öğrenci karekod okuttuğunda girişin kabul edilip edilmeyeceğini belirler.
 *
 * Geç kalma durumunda giriş OTOMATİK YAPILMAZ; öğrenciye rehberlik ekranı
 * gösterilir ve nöbetçi/görevli öğretmenin "Öğrenci Geçiş" ekranından manuel
 * "Giriş Yap" butonuna basması beklenir.
 */
export const evaluateEntryAttempt = (options) => {
  const opts = options || {};
  const cfg = opts.config && opts.config.morningEntryHour
    ? opts.config
    : resolveAttendanceConfig(opts.config);
  const w = getAttendanceWindows(cfg);
  const minutes = Number.isFinite(opts.minutes) ? opts.minutes : null;
  const currentStatus = opts.currentStatus || 'outside';
  const isManualApproval = Boolean(opts.isManualApproval);

  const base = {
    session: null,
    minutes,
    time: minutes === null ? '--:--' : minutesToTime(minutes),
    isLate: false,
    lateByMinutes: 0,
    requiresCounselor: false,
    recordEntry: false,
    allowed: false,
    code: ENTRY_DECISION.OUT_OF_HOURS,
    title: 'Geçiş Yapılamadı',
    message: 'Geçiş kaydı oluşturulamadı.',
    detail: ''
  };

  if (minutes === null) {
    return { ...base, message: 'Geçiş saati okunamadı. Lütfen görevli öğretmene başvurun.' };
  }

  // Kapalı gün kontrolü (manuel onay bunu da aşabilir)
  if (!isManualApproval && opts.isClosedDay) {
    return {
      ...base,
      code: ENTRY_DECISION.CLOSED_DAY,
      title: 'Kurum Bugün Kapalı',
      message: 'Bugün kurum takvimine göre kapalıdır, yoklama alınmamaktadır.',
      detail: 'Kapalı günlerde otomatik devamsızlık da işlenmez.'
    };
  }

  const classification = classifyScanMinutes(minutes, cfg);

  // Nöbetçi öğretmen manuel onayı: saat ne olursa olsun giriş kaydedilir.
  if (isManualApproval) {
    return {
      ...base,
      session: classification.session || (minutes < w.halfDayCutoff ? SESSION_MORNING : SESSION_AFTERNOON),
      isLate: classification.isLate,
      lateByMinutes: classification.lateByMinutes,
      recordEntry: true,
      allowed: true,
      code: ENTRY_DECISION.OK_MANUAL,
      title: 'Giriş Onaylandı',
      message: classification.isLate
        ? `Görevli öğretmen onayıyla geç giriş yapıldı (${minutesToTime(minutes)}).`
        : 'Görevli öğretmen tarafından giriş yapıldı.',
      detail: 'Manuel onaylı geçiş'
    };
  }

  if (currentStatus === 'entry' || currentStatus === 'inside') {
    return {
      ...base,
      session: classification.session,
      code: ENTRY_DECISION.ALREADY_INSIDE,
      title: 'Bir Saniye!',
      message: 'Zaten giriş yapıldı.',
      detail: 'Bu işlem zaten kayıt altına alınmış. Çift geçiş yapmanıza gerek yoktur.'
    };
  }

  if (classification.phase === 'before_school') {
    return {
      ...base,
      code: ENTRY_DECISION.OUT_OF_HOURS,
      title: 'Henüz Erken',
      message: `Kurum girişleri saat ${cfg.dayStartHour} itibarıyla başlamaktadır.`,
      detail: `Sabah yoklaması ${cfg.morningEntryHour} - ${minutesToTime(w.morningGraceEnd)} arasında alınır.`
    };
  }

  if (classification.phase === 'after_school') {
    return {
      ...base,
      code: ENTRY_DECISION.OUT_OF_HOURS,
      title: 'Okul Saati Sona Erdi',
      message: `Okul çıkış saati (${cfg.schoolExitHour}) geçtiği için giriş alınamaz.`,
      detail: 'Giriş yapmanız gerekiyorsa görevli öğretmene başvurun.'
    };
  }

  if (classification.isLate && cfg.lateRequiresCounselorApproval) {
    const isMorning = classification.session === SESSION_MORNING;
    const limit = isMorning ? w.morningGraceEnd : w.afternoonGraceEnd;
    return {
      ...base,
      session: classification.session,
      isLate: true,
      lateByMinutes: classification.lateByMinutes,
      requiresCounselor: true,
      recordEntry: false,
      allowed: false,
      code: isMorning ? ENTRY_DECISION.LATE_MORNING : ENTRY_DECISION.LATE_AFTERNOON,
      title: COUNSELOR_TITLE,
      message: `Saat ${minutesToTime(minutes)} — ${isMorning ? 'sabah' : 'öğleden sonra'} giriş toleransı (${minutesToTime(limit)}) doldu.`,
      detail: 'Girişinizin yapılabilmesi için Rehber Öğretmeninizle görüşmeniz, ardından görevli öğretmenin “Öğrenci Geçiş” ekranından manuel olarak giriş yapması gerekmektedir.'
    };
  }

  return {
    ...base,
    session: classification.session,
    isLate: classification.isLate,
    lateByMinutes: classification.lateByMinutes,
    recordEntry: true,
    allowed: true,
    code: ENTRY_DECISION.OK,
    title: 'Hoş geldiniz',
    message: 'Kurum girişi yapıldı.',
    detail: classification.session === SESSION_MORNING ? 'Sabah yoklaması alındı.' : 'Öğleden sonra yoklaması alındı.'
  };
};

/* -------------------------------------------------------------------------- */
/*  Günlük devamsızlık hesabı                                                  */
/* -------------------------------------------------------------------------- */

export const ABSENCE_STATUS = {
  PENDING: 'BEKLEMEDE',
  PRESENT: 'MEVCUT',
  HALF_DAY: 'YARIM_GUN',
  FULL_DAY: 'TAM_GUN',
  EXCUSED: 'RAPORLU'
};

/**
 * Bir öğrencinin bir gününü, o ana kadarki okutmalarına göre değerlendirir.
 *
 * Kurallar (kullanıcının tanımladığı şekliyle):
 *  - Yarım gün sınırından (12:00) ÖNCE giriş yaptıysa "sabah var".
 *  - Saat 12:00 olduğunda sabah oturumu kesinleşir: gelmeyene 0,5 gün yazılır.
 *  - Öğleden sonra gelirse ikinci yarım gün silinir  => toplam 0,5 (yarım gün yok).
 *  - Okul çıkış saatinde (varsayılan 16:00) öğleden sonra oturumu kesinleşir:
 *    hiç gelmeyene bir yarım gün daha yazılır => 1,0 (tam gün yok).
 */
export const evaluateStudentDay = (options) => {
  const opts = options || {};
  const cfg = opts.config && opts.config.morningEntryHour
    ? opts.config
    : resolveAttendanceConfig(opts.config);
  const w = getAttendanceWindows(cfg);
  const nowMinutes = Number.isFinite(opts.nowMinutes) ? opts.nowMinutes : 0;
  const closed = Boolean(opts.isClosedDay);

  const scans = sortAndDedupeScans(
    (opts.scans || []).map(s => (s && Number.isFinite(s.minutes) ? s : normalizeScanRecord(s, cfg))).filter(Boolean)
  );

  const entries = scans.filter(s => s.action === 'entry');
  const morningEntries = entries.filter(s => s.minutes < w.halfDayCutoff && s.minutes >= w.dayStart);
  const afternoonEntries = entries.filter(s => s.minutes >= w.halfDayCutoff && s.minutes <= w.schoolExit);

  const morningPresent = morningEntries.length > 0;
  const afternoonPresent = afternoonEntries.length > 0;

  const firstMorningEntry = morningPresent ? morningEntries[0] : null;
  const firstAfternoonEntry = afternoonPresent ? afternoonEntries[0] : null;

  const morningFinalized = !closed && nowMinutes >= w.halfDayCutoff;
  const afternoonFinalized = !closed && nowMinutes >= w.schoolExit;

  // İçeride mi? Son okutma yönüne bakılır.
  const lastScan = scans.length ? scans[scans.length - 1] : null;
  const isInside = Boolean(lastScan && lastScan.action === 'entry');
  const lastEntry = entries.length ? entries[entries.length - 1] : null;

  const hasAutoLunchExit = scans.some(s => s.action === 'exit' && s.autoKind === 'lunch_exit');
  const hasAutoSchoolExit = scans.some(s => s.action === 'exit' && s.autoKind === 'school_exit');

  // 12:10 otomatik çıkış: sabah girmiş, hâlâ içeride görünüyor, çıkış okutmamış.
  const needsAutoLunchExit = Boolean(
    cfg.autoLunchExitEnabled &&
    !closed &&
    nowMinutes >= w.lunchExitAutoAt &&
    morningPresent &&
    isInside &&
    lastEntry && lastEntry.minutes < w.halfDayCutoff &&
    !hasAutoLunchExit
  );

  // Okul çıkışında hâlâ içeride görünenler kapatılır.
  const needsAutoSchoolExit = Boolean(
    cfg.autoSchoolExitEnabled &&
    !closed &&
    nowMinutes >= w.schoolExit &&
    isInside &&
    !needsAutoLunchExit &&
    !hasAutoSchoolExit
  );

  // --- Devamsızlık ağırlığı -------------------------------------------------
  let absenceWeight = 0;
  const missingSessions = [];
  if (morningFinalized && !morningPresent) { absenceWeight += 0.5; missingSessions.push(SESSION_MORNING); }
  if (afternoonFinalized && !afternoonPresent) { absenceWeight += 0.5; missingSessions.push(SESSION_AFTERNOON); }

  // Gün bitince oluşacak nihai ağırlık (öngörü)
  const projectedWeight = (morningPresent ? 0 : 0.5) + (afternoonPresent ? 0 : 0.5);

  const isLate = Boolean(
    (firstMorningEntry && firstMorningEntry.isLate) ||
    (firstAfternoonEntry && firstAfternoonEntry.isLate)
  );

  // --- Durum etiketi --------------------------------------------------------
  let status;
  let statusLabel;

  if (closed) {
    status = ABSENCE_STATUS.PENDING;
    statusLabel = 'Kurum Kapalı (Devamsızlık İşlenmez)';
  } else if (absenceWeight >= 1) {
    status = ABSENCE_STATUS.FULL_DAY;
    statusLabel = 'Tam Gün Devamsız (1.0)';
  } else if (absenceWeight === 0.5) {
    status = ABSENCE_STATUS.HALF_DAY;
    statusLabel = 'Yarım Gün Devamsız (0.5)';
  } else if (morningPresent || afternoonPresent) {
    status = ABSENCE_STATUS.PRESENT;
    statusLabel = isLate ? 'Mevcut (Geç Kaldı)' : 'Mevcut';
  } else {
    status = ABSENCE_STATUS.PENDING;
    statusLabel = `Giriş Bekleniyor (${cfg.halfDayCutoffHour} sonrası kesinleşir)`;
  }

  // --- Açıklama -------------------------------------------------------------
  const parts = [];
  if (firstMorningEntry) parts.push(`Sabah giriş: ${firstMorningEntry.time}${firstMorningEntry.isLate ? ' (geç)' : ''}`);
  else if (morningFinalized) parts.push('Sabah gelmedi');
  if (firstAfternoonEntry) parts.push(`Öğleden sonra giriş: ${firstAfternoonEntry.time}${firstAfternoonEntry.isLate ? ' (geç)' : ''}`);
  else if (afternoonFinalized) parts.push('Öğleden sonra gelmedi');
  if (!parts.length) parts.push('Henüz geçiş kaydı yok');

  return {
    scans,
    morning: {
      present: morningPresent,
      finalized: morningFinalized,
      entryTime: firstMorningEntry ? firstMorningEntry.time : null,
      entryMinutes: firstMorningEntry ? firstMorningEntry.minutes : null,
      isLate: Boolean(firstMorningEntry && firstMorningEntry.isLate)
    },
    afternoon: {
      present: afternoonPresent,
      finalized: afternoonFinalized,
      entryTime: firstAfternoonEntry ? firstAfternoonEntry.time : null,
      entryMinutes: firstAfternoonEntry ? firstAfternoonEntry.minutes : null,
      isLate: Boolean(firstAfternoonEntry && firstAfternoonEntry.isLate)
    },
    missingSessions,
    absenceWeight,
    projectedWeight,
    status,
    statusLabel,
    detailNote: parts.join(' • '),
    isLate,
    isInside,
    isPresentToday: morningPresent || afternoonPresent,
    needsAutoLunchExit,
    needsAutoSchoolExit,
    windows: w
  };
};

/* -------------------------------------------------------------------------- */
/*  Otomatik devamsızlık kayıtları                                             */
/* -------------------------------------------------------------------------- */

/**
 * Otomatik devamsızlık kaydının deterministik döküman kimliği.
 * Öğrenci başına GÜNDE TEK kayıt tutulur; gün ilerledikçe bu kayıt güncellenir
 * (12:00'de yarım gün olarak açılır, okul çıkışında tam güne yükseltilir).
 */
export const buildAutoAbsenceId = (dateKey, studentId) =>
  `auto_${dateKey}_${studentId}`;

/**
 * Eski (oturum başına ayrı kayıt tutan) şemadan kalan döküman kimlikleri.
 * Yeni tek kayıt yazılırken bunlar temizlenir.
 */
export const buildLegacyAutoAbsenceIds = (dateKey, studentId) => [
  `auto_${dateKey}_${studentId}_morning`,
  `auto_${dateKey}_${studentId}_afternoon`
];

/** Rehberlik onayı bekleyen geç giriş talebinin deterministik kimliği. */
export const buildLateApprovalId = (dateKey, studentId, session) =>
  `${dateKey}_${studentId}_${session}`;

export const SESSION_LABELS = {
  morning: 'Sabah',
  afternoon: 'Öğleden Sonra'
};

/** Kaçırılan oturumları okunabilir etikete çevirir. */
export const describeMissingSessions = (sessions) => {
  const list = sessions || [];
  if (list.length >= 2) return 'Sabah + Öğleden Sonra';
  if (list.includes(SESSION_MORNING)) return SESSION_LABELS.morning;
  if (list.includes(SESSION_AFTERNOON)) return SESSION_LABELS.afternoon;
  return '';
};

/**
 * Bir öğrencinin o günkü devamsızlık kaydını üretir — GÜNDE TEK KAYIT.
 *
 *   • Sabah gelmedi, öğleden sonra henüz kesinleşmedi -> Yarım Gün Yok (Sabah)      0,5
 *   • Sabah geldi, öğleden sonra gelmedi              -> Yarım Gün Yok (Öğleden Sonra) 0,5
 *   • Hiç gelmedi (okul çıkışı geçti)                 -> TAM GÜN YOK               1,0
 *   • Devamsızlık yok                                 -> null (kayıt silinmeli)
 *
 * Deterministik kimlik kullandığı için tekrar tekrar çalıştırmak güvenlidir;
 * kayıt her turda mevcut duruma göre GÜNCELLENİR, yenisi eklenmez.
 */
export const buildAutoAbsenceRecord = (options) => {
  const opts = options || {};
  const cfg = opts.config && opts.config.morningEntryHour
    ? opts.config
    : resolveAttendanceConfig(opts.config);

  if (!cfg.autoAttendanceEnabled) return null;
  if (opts.isClosedDay) return null;
  if (opts.hasExcuse) return null;        // Raporlu/izinli öğrenciye yazılmaz
  if (opts.hasManualRecord) return null;  // İdarenin elle girdiği kayıt önceliklidir

  const evaluation = opts.evaluation || evaluateStudentDay(opts);
  const dateKey = opts.dateKey;
  const studentId = opts.studentId;
  if (!dateKey || !studentId) return null;

  const missing = evaluation.missingSessions || [];
  if (!missing.length) return null;

  const isFullDay = missing.length >= 2;
  const sessionLabel = describeMissingSessions(missing);

  const reason = isFullDay
    ? `Saat ${cfg.halfDayCutoffHour} ve ${cfg.schoolExitHour} itibarıyla hiç giriş yapılmadı.`
    : missing.includes(SESSION_MORNING)
      ? `Saat ${cfg.halfDayCutoffHour} itibarıyla sabah girişi yapılmadı.`
      : `Saat ${cfg.schoolExitHour} itibarıyla öğleden sonra girişi yapılmadı.`;

  return {
    id: buildAutoAbsenceId(dateKey, studentId),
    studentId,
    studentName: opts.studentName || 'Bilinmeyen Öğrenci',
    className: opts.className || '',
    schoolNumber: opts.schoolNumber || '',
    missingSessions: missing,
    session: isFullDay ? 'full' : missing[0],
    sessionLabel,
    courseName: isFullDay ? 'Tam Gün Yok (Özürsüz)' : `Yarım Gün Yok (${sessionLabel})`,
    periodIndex: isFullDay ? -1 : -0.5,
    absenceWeight: isFullDay ? 1 : 0.5,
    status: 'absent',
    autoGenerated: true,
    recordedBy: 'Otomatik Yoklama Sistemi',
    reason,
    date: dateKey
  };
};

/**
 * Bir günün toplam devamsızlık ağırlığını, ilgili kayıtlardan hesaplar.
 * Otomatik yarım günler toplanır: 0.5 + 0.5 = 1.0 (tam gün yok).
 */
export const sumAbsenceWeight = (records) => {
  let total = 0;
  for (const r of records || []) {
    if (!r) continue;
    const cName = r.courseName || '';
    const isExcused = r.status === 'excused' || cName.includes('Raporlu') || cName.includes('İzinli');
    if (isExcused) continue;
    if (Number.isFinite(r.absenceWeight)) {
      total += r.absenceWeight;
    } else if (cName.includes('Yarım Gün') || r.periodIndex === -0.5) {
      total += 0.5;
    } else {
      total += 1;
    }
  }
  return Math.min(1, Math.round(total * 2) / 2);
};

/** Ağırlığı okunabilir Türkçe etikete çevirir. */
export const describeAbsenceWeight = (weight) => {
  if (!weight) return 'Devamsızlık Yok';
  if (weight >= 1) return 'Tam Gün Yok (1.0)';
  return 'Yarım Gün Yok (0.5)';
};

/** Sayıyı Türkçe ondalık gösterimine çevirir: 1.5 -> "1,5" */
export const formatDayCount = (value) => {
  const n = Number(value) || 0;
  return (Math.round(n * 2) / 2).toFixed(1).replace('.0', '').replace('.', ',');
};
