

import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, writeBatch,
  query, where, onSnapshot, serverTimestamp, Timestamp
} from 'firebase/firestore';
import {
  ref, push, update, get, onValue, serverTimestamp as rtdbServerTimestamp, runTransaction
} from 'firebase/database';
import { db, rtdb } from './firebaseConfig';
import { sendWhatsAppNotification, resolveParentPhone } from './whatsappService';
import {
  resolveAttendanceConfig,
  getAttendanceWindows,
  getMinutesInTimeZone,
  getDateKeyInTimeZone,
  isClosedDay,
  evaluateEntryAttempt,
  evaluatePersonDay,
  isStaffRole,
  ATTENDANCE_ROLES,
  normalizeScanRecord,
  sortAndDedupeScans,
  buildAutoAbsenceRecord,
  buildAutoAbsenceId,
  buildLegacyAutoAbsenceIds,
  buildLateApprovalId,
  minutesToTime,
  SESSION_LABELS
} from './attendanceRules';

export const VDS_ENDPOINT = 'http://213.142.159.36:8080';

let cachedConfig = resolveAttendanceConfig({});
let cachedConfigAt = 0;

export const getCachedAttendanceConfig = () => cachedConfig;

export const loadAttendanceConfig = async (force = false) => {
  if (!force && Date.now() - cachedConfigAt < 30_000) return cachedConfig;
  try {
    const snap = await getDoc(doc(db, 'config', 'institution'));
    cachedConfig = resolveAttendanceConfig(snap.exists() ? snap.data() : {});
  } catch (err) {
    console.warn('[attendance] Kurum ayarları okunamadı, varsayılan kullanılıyor:', err?.message);
    cachedConfig = resolveAttendanceConfig({});
  }
  cachedConfigAt = Date.now();
  return cachedConfig;
};

export const subscribeAttendanceConfig = (callback) => {
  return onSnapshot(
    doc(db, 'config', 'institution'),
    (snap) => {
      cachedConfig = resolveAttendanceConfig(snap.exists() ? snap.data() : {});
      cachedConfigAt = Date.now();
      callback(cachedConfig);
    },
    (err) => {
      console.warn('[attendance] Ayar dinleyici hatası:', err?.message);
      callback(cachedConfig);
    }
  );
};

export const buildTimeContext = (config, now = new Date()) => {
  const cfg = config || cachedConfig;
  return {
    config: cfg,
    now,
    dateKey: getDateKeyInTimeZone(now, cfg.timeZone),
    nowMinutes: getMinutesInTimeZone(now, cfg.timeZone),
    isClosedDay: isClosedDay(now, cfg),
    windows: getAttendanceWindows(cfg)
  };
};

export const readGateStatus = async (studentId, dateKey) => {
  try {
    const snap = await get(ref(rtdb, `qr_system/gate_status/${studentId}`));
    if (snap.exists()) {
      const data = snap.val();
      if (data?.date === dateKey) return data.status === 'entry' ? 'entry' : 'exit';
    }
  } catch {  }

  try {
    const snap = await getDoc(doc(db, 'gate_status', studentId));
    if (snap.exists()) {
      const data = snap.data();
      if (data?.date === dateKey) return data.status === 'entry' ? 'entry' : 'exit';
    }
  } catch {  }

  return 'outside';
};

export const recordGatePassage = async (options) => {
  const {
    student,
    action,                    
    method = 'qr',             
    isManualApproval = false,
    approvedBy = null,
    autoKind = null,           
    session = null,
    isLate = false,
    sessionId = 'web_fallback',
    qrType = 'institution',
    notifyParent = true,
    config = null,
    now = new Date()
  } = options || {};

  if (!student?.id) throw new Error('recordGatePassage: öğrenci kimliği gerekli');

  const cfg = config || cachedConfig;
  const dateKey = getDateKeyInTimeZone(now, cfg.timeZone);
  const minutes = getMinutesInTimeZone(now, cfg.timeZone);
  const timeStr = minutesToTime(minutes);
  const normalizedAction = action === 'exit' ? 'exit' : 'entry';

  const personRole = student.role || (student.isStaff ? 'personnel' : 'student');
  const staff = student.isStaff !== undefined ? Boolean(student.isStaff) : isStaffRole(personRole);

  const logData = {
    studentId: student.id,
    userId: student.id,
    userRole: personRole,
    isStaff: staff,
    studentName: student.name || 'İsimsiz Öğrenci',
    userName: student.name || 'İsimsiz Öğrenci',
    studentTc: student.tc || '',
    profileImageUrl: student.photo || student.profileImage || '',
    type: qrType,
    action: normalizedAction,
    status: normalizedAction,
    session: session || null,
    sessionId,
    method,
    isLate: Boolean(isLate),
    isManualApproval: Boolean(isManualApproval),
    approvedBy: approvedBy || null,
    auto: Boolean(autoKind),
    autoKind: autoKind || null,
    time: timeStr,
    minutes,
    date: dateKey
  };

  const rtdbWrite = (async () => {
    const logRef = push(ref(rtdb, `qr_system/attendance_logs/${dateKey}`));
    const logId = logRef.key || `${Date.now()}_${student.id}`;
    const updates = {};
    updates[`qr_system/attendance_logs/${dateKey}/${logId}`] = { ...logData, timestamp: rtdbServerTimestamp() };
    updates[`qr_system/live_scans/${logId}`] = { ...logData, timestamp: rtdbServerTimestamp() };
    updates[`qr_system/gate_status/${student.id}`] = {
      status: normalizedAction,
      lastAction: normalizedAction,
      date: dateKey,
      time: timeStr,
      session: session || null,
      isLate: Boolean(isLate),
      method,
      timestamp: rtdbServerTimestamp()
    };
    await update(ref(rtdb), updates);
  })();

  const firestoreWrite = (async () => {
    
    await Promise.all([
      setDoc(doc(db, 'gate_status', student.id), {
        status: normalizedAction,
        lastAction: normalizedAction,
        date: dateKey,
        time: timeStr,
        session: session || null,
        isLate: Boolean(isLate),
        method,
        timestamp: serverTimestamp()
      }),
      addDoc(collection(db, 'attendance_logs'), { ...logData, timestamp: serverTimestamp() })
    ]);
  })();

  const [rtdbResult, firestoreResult] = await Promise.allSettled([rtdbWrite, firestoreWrite]);

  const rtdbOk = rtdbResult.status === 'fulfilled';
  const firestoreOk = firestoreResult.status === 'fulfilled';
  if (!rtdbOk) console.error('[attendance] RTDB yazma hatası:', rtdbResult.reason?.message);
  if (!firestoreOk) console.error('[attendance] Firestore yazma hatası:', firestoreResult.reason?.message);

  if (method !== 'auto') {
    fetch(`${VDS_ENDPOINT}/api/qr/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tc: student.tc || student.id,
        sessionId,
        qrType,
        action: normalizedAction,
        isManualAdmin: isManualApproval || method === 'manual_admin',
        deviceId: method === 'manual_admin' ? 'admin_panel' : (student.deviceId || 'web')
      })
    }).catch(() => {  });
  }

  // `autoGateSms` ayari Ayarlar ekraninda vardi ama hicbir yerde okunmuyordu;
  // artik gecis bildirimini gercekten aciyor/kapatiyor.
  if (notifyParent && cfg.autoGateSms !== false) {
    Promise.resolve()
      .then(() => sendWhatsAppNotification(student.id, student.name, normalizedAction, now))
      .catch(err => console.warn('[attendance] WhatsApp bildirimi gönderilemedi:', err?.message));
  }

  return { ok: rtdbOk || firestoreOk, rtdbOk, firestoreOk, log: logData, time: timeStr, dateKey };
};

export const processStudentScan = async (options) => {
  const { student, requestedAction = 'toggle', sessionId = 'web_fallback', qrType = 'institution', now = new Date() } = options || {};
  const cfg = await loadAttendanceConfig();
  const ctx = buildTimeContext(cfg, now);
  const currentStatus = await readGateStatus(student.id, ctx.dateKey);

  const wantsExit = requestedAction === 'exit' || (requestedAction === 'toggle' && currentStatus === 'entry');

  if (wantsExit) {
    if (currentStatus !== 'entry') {
      return {
        recorded: false,
        kind: 'warning',
        title: 'Bir Saniye!',
        message: currentStatus === 'exit' ? 'Zaten çıkış yapıldı.' : 'Önce kuruma giriş yapmalısınız.',
        detail: 'Giriş yapmadan çıkış yapamazsınız.',
        decision: null
      };
    }
    await recordGatePassage({
      student, action: 'exit', method: 'qr', sessionId, qrType, config: cfg, now
    });
    return {
      recorded: true,
      kind: 'exit',
      title: 'Görüşmek Üzere',
      message: 'Kurumdan çıkıldı.',
      detail: `Çıkış saati: ${minutesToTime(ctx.nowMinutes)}`,
      decision: null
    };
  }

  const scanRole = student.role || (student.isStaff ? 'personnel' : 'student');

  const decision = evaluateEntryAttempt({
    minutes: ctx.nowMinutes,
    config: cfg,
    currentStatus,
    isClosedDay: ctx.isClosedDay,
    role: scanRole,
    isStaff: student.isStaff !== undefined ? Boolean(student.isStaff) : isStaffRole(scanRole)
  });

  if (decision.requiresCounselor) {
    await createLateApprovalRequest({ student, decision, ctx });
    return {
      recorded: false,
      kind: 'counselor',
      title: decision.title,
      message: decision.message,
      detail: decision.detail,
      decision
    };
  }

  if (!decision.allowed) {
    return {
      recorded: false,
      kind: 'warning',
      title: decision.title,
      message: decision.message,
      detail: decision.detail,
      decision
    };
  }

  await recordGatePassage({
    student,
    action: 'entry',
    method: 'qr',
    session: decision.session,
    isLate: decision.isLate,
    sessionId,
    qrType,
    config: cfg,
    now
  });

  return {
    recorded: true,
    kind: 'entry',
    title: decision.title,
    message: decision.message,
    detail: decision.detail,
    decision
  };
};

export const createLateApprovalRequest = async ({ student, decision, ctx }) => {
  const id = buildLateApprovalId(ctx.dateKey, student.id, decision.session || 'morning');
  const payload = {
    id,
    studentId: student.id,
    studentName: student.name || 'İsimsiz Öğrenci',
    studentPhoto: student.photo || student.profileImage || '',
    schoolNumber: student.schoolNumber || '',
    tc: student.tc || '',
    date: ctx.dateKey,
    session: decision.session || 'morning',
    sessionLabel: SESSION_LABELS[decision.session] || 'Sabah',
    requestedTime: decision.time,
    requestedMinutes: decision.minutes,
    lateByMinutes: decision.lateByMinutes,
    reason: decision.message,
    status: 'pending',
    createdAtMs: Date.now()
  };

  try {
    await setDoc(doc(db, 'late_approvals', id), { ...payload, createdAt: serverTimestamp() });
  } catch (err) {
    console.error('[attendance] Geç giriş talebi (Firestore) yazılamadı:', err?.message);
  }
  try {
    await update(ref(rtdb), {
      [`qr_system/late_approvals/${ctx.dateKey}/${id}`]: { ...payload, createdAt: rtdbServerTimestamp() }
    });
  } catch (err) {
    console.error('[attendance] Geç giriş talebi (RTDB) yazılamadı:', err?.message);
  }
  return payload;
};

export const subscribeLateApprovals = (dateKey, callback) => {
  const path = ref(rtdb, `qr_system/late_approvals/${dateKey}`);
  return onValue(
    path,
    (snap) => {
      const list = [];
      if (snap.exists()) {
        const val = snap.val();
        Object.keys(val).forEach(key => {
          const item = val[key];
          if (item && item.status === 'pending') list.push({ ...item, id: item.id || key });
        });
      }
      list.sort((a, b) => (a.requestedMinutes || 0) - (b.requestedMinutes || 0));
      callback(list);
    },
    (err) => {
      console.warn('[attendance] Geç giriş talepleri dinlenemedi:', err?.message);
      callback([]);
    }
  );
};

export const subscribeLateApprovalStatus = (dateKey, requestId, callback) => {
  return onValue(
    ref(rtdb, `qr_system/late_approvals/${dateKey}/${requestId}`),
    (snap) => callback(snap.exists() ? snap.val() : null),
    () => callback(null)
  );
};

export const approveLateEntry = async ({ request, approvedBy = 'Görevli Öğretmen', now = new Date() }) => {
  const cfg = await loadAttendanceConfig();
  const ctx = buildTimeContext(cfg, now);

  const decision = evaluateEntryAttempt({
    minutes: ctx.nowMinutes,
    config: cfg,
    isManualApproval: true,
    isClosedDay: ctx.isClosedDay
  });

  await recordGatePassage({
    student: {
      id: request.studentId,
      name: request.studentName,
      tc: request.tc,
      photo: request.studentPhoto,
      schoolNumber: request.schoolNumber
    },
    action: 'entry',
    method: 'manual_admin',
    isManualApproval: true,
    approvedBy,
    session: decision.session || request.session,
    isLate: true,
    sessionId: 'manual_approval',
    config: cfg,
    now
  });

  await resolveLateApproval({ request, status: 'approved', resolvedBy: approvedBy, dateKey: request.date || ctx.dateKey });
  return decision;
};

export const resolveLateApproval = async ({ request, status, resolvedBy, dateKey }) => {
  const key = dateKey || request.date;
  const patch = { status, resolvedBy: resolvedBy || null, resolvedAtMs: Date.now() };
  try {
    await updateDoc(doc(db, 'late_approvals', request.id), { ...patch, resolvedAt: serverTimestamp() });
  } catch {
    
    try { await setDoc(doc(db, 'late_approvals', request.id), { ...request, ...patch }, { merge: true }); }
    catch (e) { console.error('[attendance] Talep kapatılamadı (Firestore):', e?.message); }
  }
  try {
    await update(ref(rtdb, `qr_system/late_approvals/${key}/${request.id}`), patch);
  } catch (err) {
    console.error('[attendance] Talep kapatılamadı (RTDB):', err?.message);
  }
};

export const subscribeDayScans = (dateKey, config, callback) => {
  return onValue(
    ref(rtdb, `qr_system/attendance_logs/${dateKey}`),
    (snap) => {
      const byStudent = {};
      if (snap.exists()) {
        const val = snap.val();
        Object.keys(val).forEach(logId => {
          const raw = { ...val[logId], id: logId };
          const sid = raw.studentId || raw.userId;
          if (!sid) return;
          const normalized = normalizeScanRecord(raw, config);
          if (!normalized) return;
          if (!byStudent[sid]) byStudent[sid] = [];
          byStudent[sid].push({ ...normalized, studentId: sid, source: 'rtdb' });
        });
      }
      Object.keys(byStudent).forEach(sid => {
        byStudent[sid] = sortAndDedupeScans(byStudent[sid]);
      });
      callback(byStudent);
    },
    (err) => {
      console.warn('[attendance] Günlük geçişler dinlenemedi:', err?.message);
      callback({});
    }
  );
};

export const fetchDayScans = async (dateKey, config) => {
  const byStudent = {};

  try {
    const snap = await get(ref(rtdb, `qr_system/attendance_logs/${dateKey}`));
    if (snap.exists()) {
      const val = snap.val();
      Object.keys(val).forEach(logId => {
        const raw = { ...val[logId], id: logId };
        const sid = raw.studentId || raw.userId;
        if (!sid) return;
        const normalized = normalizeScanRecord(raw, config);
        if (!normalized) return;
        if (!byStudent[sid]) byStudent[sid] = [];
        byStudent[sid].push({ ...normalized, studentId: sid, source: 'rtdb' });
      });
    }
  } catch (err) {
    console.warn('[attendance] RTDB geçişleri okunamadı:', err?.message);
  }

  try {
    const snap = await getDocs(query(collection(db, 'attendance_logs'), where('date', '==', dateKey)));
    snap.forEach(d => {
      const raw = { ...d.data(), id: d.id };
      const sid = raw.studentId || raw.userId;
      if (!sid) return;
      const normalized = normalizeScanRecord(raw, config);
      if (!normalized) return;
      if (!byStudent[sid]) byStudent[sid] = [];
      byStudent[sid].push({ ...normalized, studentId: sid, source: 'firestore' });
    });
  } catch (err) {
    
    console.warn('[attendance] Firestore geçişleri okunamadı:', err?.message);
  }

  Object.keys(byStudent).forEach(sid => {
    byStudent[sid] = sortAndDedupeScans(byStudent[sid]);
  });

  return byStudent;
};

export const fetchDayAttendanceRecords = async (dateKey, now = new Date()) => {
  const byStudent = {};
  const seen = new Set();

  const absorb = (id, data) => {
    if (seen.has(id)) return;
    seen.add(id);
    const sid = data.studentId;
    if (!sid) return;
    if (!byStudent[sid]) byStudent[sid] = [];
    byStudent[sid].push({ ...data, id });
  };

  try {
    const snap = await getDocs(query(collection(db, 'attendance'), where('date', '==', dateKey)));
    snap.forEach(d => absorb(d.id, d.data()));
  } catch (err) {
    console.warn('[attendance] Tarihli devamsızlık sorgusu başarısız:', err?.message);
  }

  try {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    const snap = await getDocs(query(
      collection(db, 'attendance'),
      where('timestamp', '>=', Timestamp.fromDate(start)),
      where('timestamp', '<=', Timestamp.fromDate(end))
    ));
    snap.forEach(d => absorb(d.id, d.data()));
  } catch (err) {
    console.warn('[attendance] Zaman damgalı devamsızlık sorgusu başarısız:', err?.message);
  }

  return byStudent;
};

export const hasExcuseRecord = (records) =>
  (records || []).some(r => r.status === 'excused' || String(r.courseName || '').includes('Raporlu') || String(r.courseName || '').includes('İzinli'));

export const hasManualAbsenceRecord = (records) =>
  (records || []).some(r => r && !r.autoGenerated && r.status === 'absent');

export const writeAutoAbsence = async (record) => {
  await setDoc(doc(db, 'attendance', record.id), {
    studentId: record.studentId,
    studentName: record.studentName,
    className: record.className || '',
    schoolNumber: record.schoolNumber || '',
    courseName: record.courseName,
    periodIndex: record.periodIndex,
    absenceWeight: record.absenceWeight,
    session: record.session,
    sessionLabel: record.sessionLabel,
    missingSessions: record.missingSessions,
    status: record.status,
    autoGenerated: true,
    recordedBy: record.recordedBy,
    reason: record.reason,
    date: record.date,
    timestamp: serverTimestamp()
  }, { merge: true });

  await clearLegacyAutoAbsences(record.date, record.studentId);
};

export const clearLegacyAutoAbsences = async (dateKey, studentId) => {
  await Promise.all(
    buildLegacyAutoAbsenceIds(dateKey, studentId).map(id =>
      deleteDoc(doc(db, 'attendance', id)).catch(() => {  })
    )
  );
};

export const removeAutoAbsence = async (dateKey, studentId) => {
  await deleteDoc(doc(db, 'attendance', buildAutoAbsenceId(dateKey, studentId)))
    .catch(() => {  });
  await clearLegacyAutoAbsences(dateKey, studentId);
};

const FIRESTORE_BATCH_LIMIT = 450;   
const RTDB_PATHS_PER_UPDATE = 500;

const commitInBatches = async (operations) => {
  let committed = 0;
  for (let i = 0; i < operations.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    operations.slice(i, i + FIRESTORE_BATCH_LIMIT).forEach(op => {
      if (op.kind === 'set') batch.set(op.ref, op.data, op.options || {});
      else if (op.kind === 'delete') batch.delete(op.ref);
    });
    await batch.commit();
    committed += Math.min(FIRESTORE_BATCH_LIMIT, operations.length - i);
  }
  return committed;
};

const updateInChunks = async (updates) => {
  const keys = Object.keys(updates);
  for (let i = 0; i < keys.length; i += RTDB_PATHS_PER_UPDATE) {
    const chunk = {};
    keys.slice(i, i + RTDB_PATHS_PER_UPDATE).forEach(k => { chunk[k] = updates[k]; });
    await update(ref(rtdb), chunk);
  }
  return keys.length;
};

export const recordGatePassagesBulk = async (passages, config, now = new Date()) => {
  if (!passages.length) return { count: 0 };

  const cfg = config || cachedConfig;
  const dateKey = getDateKeyInTimeZone(now, cfg.timeZone);
  const minutes = getMinutesInTimeZone(now, cfg.timeZone);
  const timeStr = minutesToTime(minutes);
  const nowMs = now.getTime();

  const rtdbUpdates = {};
  const fsOps = [];

  for (const p of passages) {
    const action = p.action === 'exit' ? 'exit' : 'entry';
    const logData = {
      studentId: p.student.id,
      userId: p.student.id,
      studentName: p.student.name || 'İsimsiz Öğrenci',
      userName: p.student.name || 'İsimsiz Öğrenci',
      studentTc: p.student.tc || '',
      profileImageUrl: p.student.photo || '',
      type: 'institution',
      action,
      status: action,
      session: p.session || null,
      sessionId: 'automation',
      method: 'auto',
      isLate: false,
      auto: true,
      autoKind: p.autoKind || null,
      time: timeStr,
      minutes,
      date: dateKey
    };

    const logId = push(ref(rtdb, `qr_system/attendance_logs/${dateKey}`)).key
      || `${nowMs}_${p.student.id}`;

    rtdbUpdates[`qr_system/attendance_logs/${dateKey}/${logId}`] = { ...logData, timestamp: nowMs };
    rtdbUpdates[`qr_system/live_scans/${logId}`] = { ...logData, timestamp: nowMs };
    rtdbUpdates[`qr_system/gate_status/${p.student.id}`] = {
      status: action,
      lastAction: action,
      date: dateKey,
      time: timeStr,
      session: p.session || null,
      isLate: false,
      method: 'auto',
      timestamp: nowMs
    };

    fsOps.push({
      kind: 'set',
      ref: doc(db, 'gate_status', p.student.id),
      data: {
        status: action, lastAction: action, date: dateKey, time: timeStr,
        session: p.session || null, isLate: false, method: 'auto',
        timestamp: serverTimestamp()
      }
    });
    fsOps.push({
      kind: 'set',
      ref: doc(collection(db, 'attendance_logs')),
      data: { ...logData, timestamp: serverTimestamp() }
    });
  }

  await updateInChunks(rtdbUpdates);
  await commitInBatches(fsOps);

  return { count: passages.length };
};

export const applyAutoAbsencesBulk = async (writes, removals) => {
  const ops = [];

  for (const record of writes) {
    ops.push({
      kind: 'set',
      ref: doc(db, 'attendance', record.id),
      options: { merge: true },
      data: {
        studentId: record.studentId,
        studentName: record.studentName,
        className: record.className || '',
        schoolNumber: record.schoolNumber || '',
        courseName: record.courseName,
        periodIndex: record.periodIndex,
        absenceWeight: record.absenceWeight,
        session: record.session,
        sessionLabel: record.sessionLabel,
        missingSessions: record.missingSessions,
        status: record.status,
        autoGenerated: true,
        recordedBy: record.recordedBy,
        reason: record.reason,
        date: record.date,
        timestamp: serverTimestamp()
      }
    });
    
    for (const legacyId of buildLegacyAutoAbsenceIds(record.date, record.studentId)) {
      ops.push({ kind: 'delete', ref: doc(db, 'attendance', legacyId) });
    }
  }

  for (const { dateKey, studentId } of removals) {
    ops.push({ kind: 'delete', ref: doc(db, 'attendance', buildAutoAbsenceId(dateKey, studentId)) });
    for (const legacyId of buildLegacyAutoAbsenceIds(dateKey, studentId)) {
      ops.push({ kind: 'delete', ref: doc(db, 'attendance', legacyId) });
    }
  }

  await commitInBatches(ops);
  return { writes: writes.length, removals: removals.length };
};

export const runAttendanceAutomation = async (options = {}) => {
  const now = options.now || new Date();
  const cfg = options.config || await loadAttendanceConfig(true);
  const ctx = buildTimeContext(cfg, now);

  const result = {
    dateKey: ctx.dateKey,
    nowMinutes: ctx.nowMinutes,
    time: minutesToTime(ctx.nowMinutes),
    skipped: null,
    autoExits: 0,
    absencesWritten: 0,
    absencesRemoved: 0,
    absenceSmsSent: 0,
    absenceSmsSkipped: 0,
    absenceSmsFailed: 0,
    studentsProcessed: 0,
    errors: []
  };

  if (ctx.isClosedDay) {
    result.skipped = 'Kurum bugün kapalı (kapalı gün / tatil).';
    return result;
  }

  const earliestAction = Math.min(
    w.morningLateCutoff || 551,
    w.halfDayCutoff || 730,
    w.lunchExitAutoAt || 730
  );
  if (ctx.nowMinutes < earliestAction) {
    result.skipped = `Henüz işlem saati gelmedi (ilk eşik ${minutesToTime(earliestAction)}).`;
    return result;
  }

  const onlyIds = options.onlyStudentIds ? new Set(options.onlyStudentIds) : null;

  let students;
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', ATTENDANCE_ROLES)));
    students = snap.docs.filter(d => !onlyIds || onlyIds.has(d.id)).map(d => {
      const data = d.data();
      return {
        id: d.id,
        name: data.full_name || data.fullName || data.name || data.displayName || 'İsimsiz Öğrenci',
        tc: data.tc_kimlik || data.tcKimlik || data.tc || '',
        schoolNumber: data.school_number || data.schoolNumber || data.no || '',
        className: data.class_id || data.classId || data.grade || '',
        photo: data.profile_image || data.profileImageUrl || data.profileImage || '',
        status: data.status || 'approved'
      };
    });
  } catch (err) {
    result.errors.push(`Öğrenciler okunamadı: ${err?.message}`);
    return result;
  }

  const scansByStudent = await fetchDayScans(ctx.dateKey, cfg);
  const recordsByStudent = await fetchDayAttendanceRecords(ctx.dateKey, now);

  const plannedPassages = [];
  const plannedWrites = [];
  const plannedRemovals = [];

  for (const student of students) {
    try {
      const scans = scansByStudent[student.id] || [];
      const records = recordsByStudent[student.id] || [];

      const evaluation = evaluatePersonDay({
        scans,
        nowMinutes: ctx.nowMinutes,
        config: cfg,
        isClosedDay: ctx.isClosedDay,
        role: student.role,
        isStaff: student.isStaff
      });

      if (evaluation.needsAutoLunchExit) {
        plannedPassages.push({ student, action: 'exit', autoKind: 'lunch_exit', session: 'morning' });
      } else if (evaluation.needsAutoSchoolExit) {
        plannedPassages.push({ student, action: 'exit', autoKind: 'school_exit', session: 'afternoon' });
      }

      const autoRecord = buildAutoAbsenceRecord({
        config: cfg,
        evaluation,
        dateKey: ctx.dateKey,
        studentId: student.id,
        studentName: student.name,
        className: String(student.className || ''),
        schoolNumber: student.schoolNumber,
        hasExcuse: hasExcuseRecord(records),
        hasManualRecord: hasManualAbsenceRecord(records),
        isClosedDay: ctx.isClosedDay
      });

      const existingAuto = records.find(r => r.autoGenerated);

      if (autoRecord) {
        const changed = !existingAuto ||
          existingAuto.absenceWeight !== autoRecord.absenceWeight ||
          existingAuto.courseName !== autoRecord.courseName ||
          existingAuto.id !== autoRecord.id;
        if (changed) plannedWrites.push(autoRecord);
      } else if (existingAuto) {
        plannedRemovals.push({ dateKey: ctx.dateKey, studentId: student.id });
      }

      result.studentsProcessed++;
    } catch (err) {
      result.errors.push(`${student.name}: ${err?.message}`);
    }
  }

  if (plannedPassages.length) {
    try {
      await recordGatePassagesBulk(plannedPassages, cfg, now);
      result.autoExits = plannedPassages.length;
    } catch (err) {
      result.errors.push(`Toplu otomatik çıkış yazılamadı: ${err?.message}`);
    }
  }

  if (plannedWrites.length || plannedRemovals.length) {
    try {
      await applyAutoAbsencesBulk(plannedWrites, plannedRemovals);
      result.absencesWritten = plannedWrites.length;
      result.absencesRemoved = plannedRemovals.length;

      if (cfg.notifyParentsOnAbsence !== false && plannedWrites.length) {
        const stat = await notifyParentsOnAbsence(plannedWrites, cfg);
        result.absenceSmsSent = stat.sent;
        result.absenceSmsSkipped = stat.skipped;
        result.absenceSmsFailed = stat.failed;
      }
    } catch (err) {
      result.errors.push(`Toplu devamsızlık yazılamadı: ${err?.message}`);
    }
  }

  if (cfg.notifyParentsOnAutoExit !== false) {
    const lunchExits = plannedPassages.filter(p => p.autoKind === 'lunch_exit');
    if (lunchExits.length) notifyParentsThrottled(lunchExits, now);
  }

  if (onlyIds) return result;

  try {
    await setDoc(doc(db, 'attendance_automation', ctx.dateKey), {
      date: ctx.dateKey,
      lastRunAt: serverTimestamp(),
      lastRunTime: result.time,
      lastRunMinutes: ctx.nowMinutes,
      studentsProcessed: result.studentsProcessed,
      totalAutoExits: result.autoExits,
      totalAbsencesWritten: result.absencesWritten,
      totalAbsencesRemoved: result.absencesRemoved,
      configSnapshot: {
        morningEntryHour: cfg.morningEntryHour,
        morningGraceMinutes: cfg.morningGraceMinutes,
        lunchExitHour: cfg.lunchExitHour,
        lunchExitGraceMinutes: cfg.lunchExitGraceMinutes,
        afternoonEntryHour: cfg.afternoonEntryHour,
        afternoonGraceMinutes: cfg.afternoonGraceMinutes,
        schoolExitHour: cfg.schoolExitHour,
        halfDayCutoffHour: cfg.halfDayCutoffHour
      }
    }, { merge: true });
  } catch (err) {
    result.errors.push(`Tur kaydı yazılamadı: ${err?.message}`);
  }

  return result;
};

/**
 * Devamsızlık yazıldığında veliye NetGSM üzerinden SMS gönderir.
 *
 * Yalnızca `plannedWrites` içindeki kayıtlar için çalışır; o liste sadece
 * yeni ya da ağırlığı değişen kayıtları taşıdığı için aynı devamsızlık için
 * ikinci kez mesaj gitmez (yarım gün → tam güne çıkarsa yeniden bilgilendirir).
 */
const notifyParentsOnAbsence = async (records, cfg) => {
  if (!records.length) return { sent: 0, skipped: 0, failed: 0 };

  const { netgsmService } = await import('./netgsmService');
  const stat = { sent: 0, skipped: 0, failed: 0 };

  const worker = async (queue) => {
    while (queue.length) {
      const rec = queue.shift();
      try {
        const { phone } = await resolveParentPhone(rec.studentId);
        if (!phone) { stat.skipped++; continue; }

        const isFull = Number(rec.absenceWeight) >= 1;
        const who = rec.isStaff ? 'personelimiz' : 'öğrencimiz';
        const what = isFull
          ? 'bugün kuruma giriş yapmamıştır ve tam gün devamsız olarak işlenmiştir'
          : 'bugün yarım gün devamsız olarak işlenmiştir';

        await netgsmService.sendSms({
          phones: [phone],
          title: 'Devamsızlık Bildirimi',
          message: `Sayin Velimiz, ${who} ${rec.studentName} ${what}. Bilgilerinize sunariz.`
        });
        stat.sent++;
      } catch (err) {
        stat.failed++;
        console.warn(`[DEVAMSIZLIK SMS] ${rec.studentName}: ${err?.message}`);
      }
    }
  };

  const queue = [...records];
  await Promise.all(Array.from({ length: Math.min(NOTIFY_CONCURRENCY, queue.length) }, () => worker(queue)));
  return stat;
};

const NOTIFY_CONCURRENCY = 5;

const notifyParentsThrottled = (passages, now) => {
  let index = 0;
  const worker = async () => {
    while (index < passages.length) {
      const p = passages[index++];
      try {
        await sendWhatsAppNotification(p.student.id, p.student.name, 'exit', now);
      } catch {
        
      }
    }
  };
  
  Promise.all(Array.from({ length: NOTIFY_CONCURRENCY }, worker))
    .catch(() => {  });
};

const LEASE_PATH = 'qr_system/automation_lease';
const LEASE_TTL_MS = 5 * 60_000; 

export const tryAcquireAutomationLease = async (ownerId) => {
  try {
    const res = await runTransaction(ref(rtdb, LEASE_PATH), (current) => {
      const nowMs = Date.now();
      if (current && current.expiresAt > nowMs && current.ownerId !== ownerId) {
        return; 
      }
      return { ownerId, acquiredAt: nowMs, expiresAt: nowMs + LEASE_TTL_MS };
    });
    return Boolean(res.committed && res.snapshot.val()?.ownerId === ownerId);
  } catch {
    
    return true;
  }
};
