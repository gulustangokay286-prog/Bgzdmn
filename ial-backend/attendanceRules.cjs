

const DEFAULT_ATTENDANCE_CONFIG = {
  timeZone: 'Europe/Istanbul',

  dayStartHour: '06:00',

  morningEntryHour: '09:00',
  morningGraceMinutes: 11,          

  lunchExitHour: '12:10',
  lunchExitGraceMinutes: 10,        

  afternoonEntryHour: '13:30',
  afternoonGraceMinutes: 10,        

  schoolExitHour: '15:20',

  halfDayCutoffHour: '12:10',

  autoAttendanceEnabled: true,      
  autoLunchExitEnabled: true,       
  autoSchoolExitEnabled: true,      
  lateRequiresCounselorApproval: true, 

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
  ALREADY_INSIDE: 'ALREADY_INSIDE'
};

const COUNSELOR_TITLE = 'Rehber Öğretmeninizle Görüşün';

const evaluateEntryAttempt = (options) => {
  const opts = options || {};
  const cfg = opts.config && opts.config.morningEntryHour ? opts.config : resolveAttendanceConfig(opts.config);
  const w = getAttendanceWindows(cfg);
  const minutes = Number.isFinite(opts.minutes) ? opts.minutes : 540;
  const classification = classifyScanMinutes(minutes, cfg);
  return {
    session: classification.session || (minutes < w.halfDayCutoff ? SESSION_MORNING : SESSION_AFTERNOON),
    minutes,
    time: minutesToTime(minutes),
    isLate: classification.isLate,
    lateByMinutes: classification.lateByMinutes,
    requiresCounselor: false,
    recordEntry: true,
    allowed: true,
    code: ENTRY_DECISION.OK,
    title: 'Hoş geldiniz',
    message: 'Kurum girişi yapıldı.',
    detail: 'Güvenlik duvarları kaldırıldı.'
  };
};


