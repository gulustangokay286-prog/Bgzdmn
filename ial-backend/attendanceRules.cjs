/* ------------------------------------------------------------------------
 *  OTOMATİK ÜRETİLMİŞ DOSYA — ELLE DÜZENLEMEYİN.
 *
 *  Kaynak: IALMobil_Admin_Windows/src/services/attendanceRules.js
 *  Üretim: node scripts/build-backend-rules.cjs
 *
 *  Bu dosya, mobil web ve Admin Windows ile BİREBİR aynı yoklama kurallarını
 *  VDS backend tarafında çalıştırır.
 * ---------------------------------------------------------------------- */


const DEFAULT_ATTENDANCE_CONFIG = {
  timeZone: 'Europe/Istanbul',

  dayStartHour: '06:00',

  morningEntryHour: '09:00',
  morningGraceMinutes: 20, // 09:20'ye kadar serbest giriş müsaadesi

  lunchExitHour: '12:10',
  lunchExitGraceMinutes: 10,        

  afternoonEntryHour: '13:30',
  afternoonGraceMinutes: 10,        

  schoolExitHour: '15:20',

  halfDayCutoffHour: '12:10',

  autoAttendanceEnabled: true,      
  autoLunchExitEnabled: false,       
  autoSchoolExitEnabled: true,      
  lateRequiresCounselorApproval: true, 

  // Personel yoklamasi (ogretmen / yonetici / personel)
  staffAttendanceEnabled: true,
  staffFlexibleHours: true,          // istedigi saatte girebilir, gec sayilmaz
  staffAbsenceCutoffHour: '17:00',   // bu saate kadar okutmayana devamsizlik
  staffAbsenceWeight: 1,             // 1 = tam gun, 0.5 = yarim gun

  // Veli bildirimleri
  autoGateSms: true,                 // turnike giris/cikisinda veliye mesaj
  notifyParentsOnAbsence: true,      // devamsizlik yazilinca veliye SMS

  closedDays: ['Pazar'],            
  holidays: [],                     

  openingHour: '08:00',
  closingHour: '15:20',
  lunchBreakStart: '12:10',
  lunchBreakEnd: '13:30'
};

const TURKISH_DAY_NAMES = [
  'Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'
];

const SESSION_MORNING = 'morning';
const SESSION_AFTERNOON = 'afternoon';

const timeToMinutes = (value) => {
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

const minutesToTime = (minutes) => {
  if (!Number.isFinite(minutes)) return '--:--';
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const getMinutesInTimeZone = (date, timeZone) => {
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

const getDateKeyInTimeZone = (date, timeZone) => {
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

const getDayNameInTimeZone = (date, timeZone) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const name = new Intl.DateTimeFormat('tr-TR', {
      timeZone: timeZone || DEFAULT_ATTENDANCE_CONFIG.timeZone,
      weekday: 'long'
    }).format(d);
    
    return name.charAt(0).toLocaleUpperCase('tr-TR') + name.slice(1);
  } catch {
    return TURKISH_DAY_NAMES[d.getDay()];
  }
};

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

const resolveAttendanceConfig = (raw) => {
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

    staffAttendanceEnabled: coerceBool(src.staffAttendanceEnabled, d.staffAttendanceEnabled),
    staffFlexibleHours: coerceBool(src.staffFlexibleHours, d.staffFlexibleHours),
    staffAbsenceCutoffHour: minutesToTime(Math.max(
      coerceTime(src.staffAbsenceCutoffHour, d.staffAbsenceCutoffHour), schoolExit
    )),
    staffAbsenceWeight: Number(src.staffAbsenceWeight) === 0.5 ? 0.5 : d.staffAbsenceWeight,

    autoGateSms: coerceBool(src.autoGateSms, d.autoGateSms),
    notifyParentsOnAbsence: coerceBool(src.notifyParentsOnAbsence, d.notifyParentsOnAbsence),

    closedDays,
    holidays,

    openingHour: typeof src.openingHour === 'string' ? src.openingHour : d.openingHour,
    closingHour: minutesToTime(schoolExit),
    lunchBreakStart: minutesToTime(lunchExit),
    lunchBreakEnd: minutesToTime(afternoonEntry)
  };
};

const getAttendanceWindows = (config) => {
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

const isClosedDay = (date, config) => {
  const cfg = config && config.morningEntryHour ? config : resolveAttendanceConfig(config);
  const dayName = getDayNameInTimeZone(date, cfg.timeZone);
  const dateKey = getDateKeyInTimeZone(date, cfg.timeZone);
  const closedByWeekday = (cfg.closedDays || []).some(
    d => String(d).toLocaleLowerCase('tr-TR') === String(dayName).toLocaleLowerCase('tr-TR')
  );
  const closedByHoliday = (cfg.holidays || []).includes(dateKey);
  return closedByWeekday || closedByHoliday;
};

const classifyScanMinutes = (minutes, config) => {
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

const normalizeScanRecord = (raw, config) => {
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

const sortAndDedupeScans = (scans) => {
  const list = (scans || []).filter(Boolean).slice();
  list.sort((a, b) => a.minutes - b.minutes);
  const out = [];
  for (const scan of list) {
    const prev = out[out.length - 1];
    
    if (prev && prev.action === scan.action && Math.abs(prev.minutes - scan.minutes) < 1) continue;
    out.push(scan);
  }
  return out;
};

const ENTRY_DECISION = {
  OK: 'OK',
  OK_MANUAL: 'OK_MANUAL',
  LATE_MORNING: 'LATE_MORNING',
  LATE_AFTERNOON: 'LATE_AFTERNOON',
  OUT_OF_HOURS: 'OUT_OF_HOURS',
  CLOSED_DAY: 'CLOSED_DAY',
  ALREADY_INSIDE: 'ALREADY_INSIDE',
  COOLDOWN_ACTIVE: 'COOLDOWN_ACTIVE'
};

const EXIT_DECISION = {
  OK: 'OK',
  OK_MANUAL: 'OK_MANUAL',
  LOCKED_CLASS_HOUR: 'LOCKED_CLASS_HOUR',
  ALREADY_OUTSIDE: 'ALREADY_OUTSIDE',
  COOLDOWN_ACTIVE: 'COOLDOWN_ACTIVE',
  NO_LUNCH_PRIVILEGE: 'NO_LUNCH_PRIVILEGE'
};

const COUNSELOR_TITLE = 'Rehber Öğretmeninizle Görüşün';

const evaluateEntryAttempt = (options) => {
  const opts = options || {};
  const cfg = opts.config && opts.config.morningEntryHour
    ? opts.config
    : resolveAttendanceConfig(opts.config);
  const w = getAttendanceWindows(cfg);
  const minutes = Number.isFinite(opts.minutes) ? opts.minutes : null;
  const currentStatus = opts.currentStatus || 'outside';
  const isManualApproval = Boolean(opts.isManualApproval);
  // Personel icin saat kisiti uygulanmaz; yalnizca o gun okutmasi beklenir.
  const isStaff = opts.isStaff !== undefined ? Boolean(opts.isStaff) : isStaffRole(opts.role);
  const lastScanSeconds = Number(opts.lastScanSeconds) || 0;
  const nowSeconds = Number(opts.nowSeconds) || Math.floor(Date.now() / 1000);

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

  // Anti-Ping-Pong & Rate Limit: Güvenlik duvarları kullanıcı talebiyle tamamen kapatıldı
  const COOLDOWN_SECONDS = 0;

  const classification = classifyScanMinutes(minutes, cfg);

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

  return {
    ...base,
    session: classification.session || (minutes < w.halfDayCutoff ? SESSION_MORNING : SESSION_AFTERNOON),
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

const evaluateExitAttempt = (options) => {
  const opts = options || {};
  const cfg = opts.config && opts.config.morningEntryHour
    ? opts.config
    : resolveAttendanceConfig(opts.config);
  const w = getAttendanceWindows(cfg);
  const minutes = Number.isFinite(opts.minutes) ? opts.minutes : null;
  const currentStatus = opts.currentStatus || 'outside';
  const isManualApproval = Boolean(opts.isManualApproval || opts.allowEarlyExit);
  const lastScanSeconds = Number(opts.lastScanSeconds) || 0;
  const nowSeconds = Number(opts.nowSeconds) || Math.floor(Date.now() / 1000);
  const student = opts.student || {};

  const base = {
    minutes,
    time: minutes === null ? '--:--' : minutesToTime(minutes),
    allowed: false,
    recordExit: false,
    code: EXIT_DECISION.LOCKED_CLASS_HOUR,
    title: 'Çıkış Yapılamadı',
    message: 'Çıkış izni verilmedi.',
    detail: ''
  };

  if (minutes === null) {
    return { ...base, message: 'Geçiş saati okunamadı. Görevli öğretmene başvurun.' };
  }

  // Güvenlik kısıtlamaları ve ders saati çıkış kilitleri kullanıcı talebiyle tamamen kaldırıldı
  return {
    ...base,
    allowed: true,
    recordExit: true,
    code: EXIT_DECISION.OK,
    title: 'İyi Günler',
    message: 'Kurum çıkışınız kaydedildi.',
    detail: 'Çıkış işlemi onaylandı.'
  };
};

const ABSENCE_STATUS = {
  PENDING: 'BEKLEMEDE',
  PRESENT: 'MEVCUT',
  HALF_DAY: 'YARIM_GUN',
  FULL_DAY: 'TAM_GUN',
  EXCUSED: 'RAPORLU'
};

const evaluateStudentDay = (options) => {
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
  const exits = scans.filter(s => s.action === 'exit');

  const morningEntries = entries.filter(s => s.minutes < w.halfDayCutoff && s.minutes >= w.dayStart);
  const morningExits = exits.filter(s => s.minutes < w.halfDayCutoff && s.minutes >= w.dayStart);
  // Sabah mevcudiyeti: sabah giriş taraması, sabah çıkış taraması veya öğleden sonra çıkış taraması
  // (Öğleden sonra çıkış yapılmış olması öğrencinin kurumda bulunduğunun kesin kanıtıdır)
  const morningPresent = morningEntries.length > 0 || morningExits.length > 0 || exits.some(s => s.minutes >= w.afternoonStart);

  // Öğleden sonra giriş ve çıkışları
  const afternoonEntries = entries.filter(s => s.minutes >= w.halfDayCutoff && s.minutes <= (w.schoolExit + 180));
  const afternoonExits = exits.filter(s => s.minutes >= w.afternoonStart);

  // Gerçek (manuel/fiziksel) öğle arası çıkışı: 12:10 - 13:30 arası yapılan gerçek çıkış
  const hasRealLunchExit = exits.some(s =>
    !s.auto && !s.autoKind &&
    s.minutes >= w.lunchExitStart &&
    s.minutes < w.afternoonStart
  );

  // Sabah erken çıkış (öğle arasından önce çıkıp dönmeyenler):
  const hasEarlyDeparture = exits.some(s =>
    !s.auto && !s.autoKind &&
    s.minutes < w.lunchExitStart
  );

  // Öğleden sonra mevcudiyeti:
  // 1) Öğleden sonra açıkça giriş taraması varsa
  // 2) VEYA öğleden sonra (13:30+) çıkış taraması varsa (çıkış yapılması o sırada okulda olunduğunun kesin kanıtıdır)
  // 3) VEYA sabah giriş yapmış, öğle arası veya erken çıkış yapmamışsa (öğrenci gün boyu kurumda derslere devam etmiştir)
  const afternoonPresent = Boolean(
    afternoonEntries.length > 0 ||
    afternoonExits.length > 0 ||
    (morningPresent && !hasRealLunchExit && !hasEarlyDeparture)
  );

  const firstMorningEntry = morningEntries.length ? morningEntries[0] : null;
  const firstAfternoonEntry = afternoonEntries.length ? afternoonEntries[0] : null;

  const morningFinalized = !closed && nowMinutes >= (w.morningLateCutoff || w.halfDayCutoff);
  const afternoonFinalized = !closed && nowMinutes >= (w.afternoonLateCutoff || w.schoolExit);

  const lastScan = scans.length ? scans[scans.length - 1] : null;
  const isInside = Boolean(lastScan && lastScan.action === 'entry');
  const lastEntry = entries.length ? entries[entries.length - 1] : null;

  const hasAutoLunchExit = scans.some(s => s.action === 'exit' && s.autoKind === 'lunch_exit');
  const hasAutoSchoolExit = scans.some(s => s.action === 'exit' && s.autoKind === 'school_exit');

  const needsAutoLunchExit = Boolean(
    cfg.autoLunchExitEnabled &&
    !closed &&
    nowMinutes >= w.lunchExitAutoAt &&
    morningPresent &&
    isInside &&
    lastEntry && lastEntry.minutes < w.halfDayCutoff &&
    !hasAutoLunchExit
  );

  const needsAutoSchoolExit = Boolean(
    cfg.autoSchoolExitEnabled &&
    !closed &&
    nowMinutes >= w.schoolExit &&
    isInside &&
    !needsAutoLunchExit &&
    !hasAutoSchoolExit
  );

  let absenceWeight = 0;
  const missingSessions = [];
  if (morningFinalized && !morningPresent) { absenceWeight += 0.5; missingSessions.push(SESSION_MORNING); }
  if (afternoonFinalized && !afternoonPresent) { absenceWeight += 0.5; missingSessions.push(SESSION_AFTERNOON); }

  const projectedWeight = (morningPresent ? 0 : 0.5) + (afternoonPresent ? 0 : 0.5);

  const isLate = Boolean(
    (firstMorningEntry && firstMorningEntry.isLate) ||
    (firstAfternoonEntry && firstAfternoonEntry.isLate)
  );

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

  const parts = [];
  if (firstMorningEntry) parts.push(`Sabah giriş: ${firstMorningEntry.time}${firstMorningEntry.isLate ? ' (geç)' : ''}`);
  else if (morningFinalized && !morningPresent) parts.push('Sabah gelmedi');
  else if (morningPresent && morningExits.length) parts.push(`Sabah çıkış: ${morningExits[0].time}`);

  if (firstAfternoonEntry) parts.push(`Öğleden sonra giriş: ${firstAfternoonEntry.time}${firstAfternoonEntry.isLate ? ' (geç)' : ''}`);
  else if (afternoonExits.length) parts.push(`Çıkış: ${afternoonExits[afternoonExits.length - 1].time}`);
  else if (afternoonFinalized && !afternoonPresent) parts.push('Öğleden sonra gelmedi');
  else if (morningPresent && afternoonPresent && morningFinalized) parts.push('Tam gün devam');

  if (!parts.length) parts.push('Henüz geçiş kaydı yok');

  return {
    scans,
    morning: {
      present: morningPresent,
      finalized: morningFinalized,
      entryTime: firstMorningEntry ? firstMorningEntry.time : (morningExits.length ? morningExits[0].time : null),
      entryMinutes: firstMorningEntry ? firstMorningEntry.minutes : (morningExits.length ? morningExits[0].minutes : null),
      isLate: Boolean(firstMorningEntry && firstMorningEntry.isLate)
    },
    afternoon: {
      present: afternoonPresent,
      finalized: afternoonFinalized,
      entryTime: firstAfternoonEntry ? firstAfternoonEntry.time : (afternoonExits.length ? afternoonExits[afternoonExits.length - 1].time : null),
      entryMinutes: firstAfternoonEntry ? firstAfternoonEntry.minutes : (afternoonExits.length ? afternoonExits[afternoonExits.length - 1].minutes : null),
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

const buildAutoAbsenceId = (dateKey, studentId) =>
  `auto_${dateKey}_${studentId}`;

const buildLegacyAutoAbsenceIds = (dateKey, studentId) => [
  `auto_${dateKey}_${studentId}_morning`,
  `auto_${dateKey}_${studentId}_afternoon`
];

const buildLateApprovalId = (dateKey, studentId, session) =>
  `${dateKey}_${studentId}_${session}`;

const SESSION_LABELS = {
  morning: 'Sabah',
  afternoon: 'Öğleden Sonra'
};

const describeMissingSessions = (sessions) => {
  const list = sessions || [];
  if (list.length >= 2) return 'Sabah + Öğleden Sonra';
  if (list.includes(SESSION_MORNING)) return SESSION_LABELS.morning;
  if (list.includes(SESSION_AFTERNOON)) return SESSION_LABELS.afternoon;
  return '';
};

const buildAutoAbsenceRecord = (options) => {
  const opts = options || {};
  const cfg = opts.config && opts.config.morningEntryHour
    ? opts.config
    : resolveAttendanceConfig(opts.config);

  if (!cfg.autoAttendanceEnabled) return null;
  if (opts.isClosedDay) return null;
  if (opts.hasExcuse) return null;        
  if (opts.hasManualRecord) return null;  

  const cAt = opts.createdAt || opts.studentCreatedAt;
  if (cAt) {
    try {
      const createdDate = cAt.toDate ? cAt.toDate() : new Date(cAt);
      const createdDateKey = getDateKeyInTimeZone(createdDate, cfg.timeZone);
      if (createdDateKey === opts.dateKey) {
        const createdMinutes = getMinutesInTimeZone(createdDate, cfg.timeZone);
        if (createdMinutes >= 540) { 
          return null;
        }
      }
    } catch (e) {}
  }

  const isStaff = opts.isStaff !== undefined ? Boolean(opts.isStaff) : isStaffRole(opts.role);
  if (isStaff && !cfg.staffAttendanceEnabled) return null;

  const evaluation = opts.evaluation || (isStaff ? evaluateStaffDay(opts) : evaluateStudentDay(opts));
  const dateKey = opts.dateKey;
  const studentId = opts.studentId;
  if (!dateKey || !studentId) return null;

  const missing = evaluation.missingSessions || [];
  if (!missing.length) return null;

  if (isStaff) {
    // Personelde sabah/öğleden sonra ayrımı yok: gün içinde hiç okutma yoksa
    // tek bir kayıt yazılır.
    const weight = evaluation.absenceWeight >= 1 ? 1 : 0.5;
    return {
      id: buildAutoAbsenceId(dateKey, studentId),
      studentId,
      studentName: opts.studentName || 'Bilinmeyen Personel',
      role: opts.role || 'personnel',
      isStaff: true,
      className: opts.className || '',
      schoolNumber: opts.schoolNumber || '',
      missingSessions: ['day'],
      session: 'day',
      sessionLabel: 'Gün İçi',
      courseName: weight >= 1 ? 'Tam Gün Yok (Personel)' : 'Yarım Gün Yok (Personel)',
      periodIndex: weight >= 1 ? -1 : -0.5,
      absenceWeight: weight,
      status: 'absent',
      autoGenerated: true,
      recordedBy: 'Otomatik Yoklama Sistemi',
      reason: `Saat ${cfg.staffAbsenceCutoffHour} itibarıyla gün içinde hiç karekod okutulmadı.`,
      date: dateKey
    };
  }

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
    role: opts.role || 'student',
    isStaff: false,
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

const sumAbsenceWeight = (records) => {
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

const describeAbsenceWeight = (weight) => {
  if (!weight) return 'Devamsızlık Yok';
  if (weight >= 1) return 'Tam Gün Yok (1.0)';
  return 'Yarım Gün Yok (0.5)';
};

const formatDayCount = (value) => {
  const n = Number(value) || 0;
  return (Math.round(n * 2) / 2).toFixed(1).replace('.0', '').replace('.', ',');
};

/** Yoklamasi tutulan ogrenci rolleri. */
const STUDENT_ROLES = ['student', 'öğrenci', 'ogrenci'];

/** Yoklamasi tutulan personel rolleri. */
const STAFF_ROLES = ['teacher', 'öğretmen', 'ogretmen', 'personnel', 'personel', 'staff', 'admin', 'yönetici', 'yonetici', 'superadmin', 'patron'];

/** Veli ve ziyaretci rolleri. */
const PARENT_AND_VISITOR_ROLES = ['parent', 'veli', 'guest', 'misafir', 'visitor', 'ziyaretçi'];

/**
 * Tum roller turnikeden ve yoklamadan gecebilir.
 */
const ATTENDANCE_ROLES = [...STUDENT_ROLES, ...STAFF_ROLES, ...PARENT_AND_VISITOR_ROLES, 'user', 'kullanıcı'];

const isStaffRole = (role) => {
  const r = String(role || '').toLowerCase();
  return STAFF_ROLES.includes(r);
};

const isParentOrVisitorRole = (role) => {
  const r = String(role || '').toLowerCase();
  return PARENT_AND_VISITOR_ROLES.includes(r);
};

/**
 * Personel gunu (ogretmen / yonetici / personel).
 *
 * Ogrenciden tek farki: gun sabah/ogleden sonra diye bolunmez ve gec kalma
 * yoktur. Beklenen tek sey personelin o gun icinde en az bir kez okutmasidir;
 * `staffAbsenceCutoffHour` gectigi hâlde hic okutma yoksa devamsizlik yazilir.
 */
const evaluateStaffDay = (options) => {
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
  const present = entries.length > 0;
  const firstEntry = present ? entries[0] : null;

  const lastScan = scans.length ? scans[scans.length - 1] : null;
  const isInside = Boolean(lastScan && lastScan.action === 'entry');

  const cutoff = timeToMinutes(cfg.staffAbsenceCutoffHour);
  const finalized = !closed && nowMinutes >= cutoff;

  const dayWeight = Number(cfg.staffAbsenceWeight) === 0.5 ? 0.5 : 1;
  const absenceWeight = finalized && !present ? dayWeight : 0;

  const hasAutoSchoolExit = scans.some(s => s.action === 'exit' && s.autoKind === 'school_exit');
  const needsAutoSchoolExit = Boolean(
    cfg.autoSchoolExitEnabled && !closed && nowMinutes >= cutoff && isInside && !hasAutoSchoolExit
  );

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
  } else if (present) {
    status = ABSENCE_STATUS.PRESENT;
    statusLabel = 'Mevcut';
  } else {
    status = ABSENCE_STATUS.PENDING;
    statusLabel = `Giriş Bekleniyor (${cfg.staffAbsenceCutoffHour} sonrası kesinleşir)`;
  }

  const sessionShape = {
    present,
    finalized,
    entryTime: firstEntry ? firstEntry.time : null,
    entryMinutes: firstEntry ? firstEntry.minutes : null,
    isLate: false
  };

  return {
    mode: 'staff',
    scans,
    day: { ...sessionShape, cutoffTime: cfg.staffAbsenceCutoffHour },
    morning: sessionShape,
    afternoon: sessionShape,
    missingSessions: absenceWeight > 0 ? ['day'] : [],
    absenceWeight,
    projectedWeight: present ? 0 : dayWeight,
    status,
    statusLabel,
    detailNote: present
      ? `Gün içi giriş: ${firstEntry.time}`
      : finalized ? 'Gün boyunca karekod okutulmadı' : 'Henüz geçiş kaydı yok',
    isLate: false,
    isInside,
    isPresentToday: present,
    needsAutoLunchExit: false,
    needsAutoSchoolExit,
    windows: w
  };
};

/** Role gore dogru motoru calistirir. */
const evaluatePersonDay = (options) => {
  const opts = options || {};
  const staff = opts.isStaff !== undefined ? Boolean(opts.isStaff) : isStaffRole(opts.role);
  return staff ? evaluateStaffDay(opts) : evaluateStudentDay(opts);
};

module.exports = {
  DEFAULT_ATTENDANCE_CONFIG,
  TURKISH_DAY_NAMES,
  SESSION_MORNING,
  SESSION_AFTERNOON,
  timeToMinutes,
  minutesToTime,
  getMinutesInTimeZone,
  getDateKeyInTimeZone,
  getDayNameInTimeZone,
  resolveAttendanceConfig,
  getAttendanceWindows,
  isClosedDay,
  classifyScanMinutes,
  normalizeScanRecord,
  sortAndDedupeScans,
  ENTRY_DECISION,
  EXIT_DECISION,
  COUNSELOR_TITLE,
  evaluateEntryAttempt,
  evaluateExitAttempt,
  ABSENCE_STATUS,
  evaluateStudentDay,
  buildAutoAbsenceId,
  buildLegacyAutoAbsenceIds,
  buildLateApprovalId,
  SESSION_LABELS,
  describeMissingSessions,
  buildAutoAbsenceRecord,
  sumAbsenceWeight,
  describeAbsenceWeight,
  formatDayCount,
  STUDENT_ROLES,
  STAFF_ROLES,
  PARENT_AND_VISITOR_ROLES,
  ATTENDANCE_ROLES,
  isStaffRole,
  isParentOrVisitorRole,
  evaluateStaffDay,
  evaluatePersonDay
};
