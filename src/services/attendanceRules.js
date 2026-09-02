

export const DEFAULT_ATTENDANCE_CONFIG = {
  timeZone: 'Europe/Istanbul',

  dayStartHour: '06:00',

  morningEntryHour: '09:00',
  morningGraceMinutes: 10,          

  lunchExitHour: '12:00',
  lunchExitGraceMinutes: 10,        

  afternoonEntryHour: '13:00',
  afternoonGraceMinutes: 10,        

  schoolExitHour: '16:00',

  halfDayCutoffHour: '12:00',

  autoAttendanceEnabled: true,      
  autoLunchExitEnabled: true,       
  autoSchoolExitEnabled: true,      
  lateRequiresCounselorApproval: true, 

  closedDays: ['Pazar'],            
  holidays: [],                     

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

export const minutesToTime = (minutes) => {
  if (!Number.isFinite(minutes)) return '--:--';
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

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

export const getDayNameInTimeZone = (date, timeZone) => {
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

export const sortAndDedupeScans = (scans) => {
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

export const ABSENCE_STATUS = {
  PENDING: 'BEKLEMEDE',
  PRESENT: 'MEVCUT',
  HALF_DAY: 'YARIM_GUN',
  FULL_DAY: 'TAM_GUN',
  EXCUSED: 'RAPORLU'
};

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

export const buildAutoAbsenceId = (dateKey, studentId) =>
  `auto_${dateKey}_${studentId}`;

export const buildLegacyAutoAbsenceIds = (dateKey, studentId) => [
  `auto_${dateKey}_${studentId}_morning`,
  `auto_${dateKey}_${studentId}_afternoon`
];

export const buildLateApprovalId = (dateKey, studentId, session) =>
  `${dateKey}_${studentId}_${session}`;

export const SESSION_LABELS = {
  morning: 'Sabah',
  afternoon: 'Öğleden Sonra'
};

export const describeMissingSessions = (sessions) => {
  const list = sessions || [];
  if (list.length >= 2) return 'Sabah + Öğleden Sonra';
  if (list.includes(SESSION_MORNING)) return SESSION_LABELS.morning;
  if (list.includes(SESSION_AFTERNOON)) return SESSION_LABELS.afternoon;
  return '';
};

export const buildAutoAbsenceRecord = (options) => {
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

export const describeAbsenceWeight = (weight) => {
  if (!weight) return 'Devamsızlık Yok';
  if (weight >= 1) return 'Tam Gün Yok (1.0)';
  return 'Yarım Gün Yok (0.5)';
};

export const formatDayCount = (value) => {
  const n = Number(value) || 0;
  return (Math.round(n * 2) / 2).toFixed(1).replace('.0', '').replace('.', ',');
};
