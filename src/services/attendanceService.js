/**
 * ============================================================================
 *  YOKLAMA SERVİSİ  (Attendance Service)
 * ============================================================================
 *  Kural motorunu (attendanceRules.js) Firebase'e bağlayan TEK yazma noktası.
 *
 *  Kritik: Daha önce mobil web (QRCodeRedirect) yalnızca Firestore `gate_status`
 *  yazıyordu, Admin paneli ise yalnızca RTDB `qr_system/gate_status` okuyordu.
 *  Bu yüzden karekod okutan öğrenci panelde "Kurum Dışında" görünüyordu.
 *  Artık her geçiş HER İKİ kaynağa birden yazılır -> mobil web ile
 *  IALMobil Admin Windows tam senkron çalışır.
 * ============================================================================
 */

import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, writeBatch,
  query, where, onSnapshot, serverTimestamp, Timestamp
} from 'firebase/firestore';
import {
  ref, push, update, get, onValue, serverTimestamp as rtdbServerTimestamp, runTransaction
} from 'firebase/database';
import { db, rtdb } from './firebaseConfig';
import { sendWhatsAppNotification } from './whatsappService';
import {
  resolveAttendanceConfig,
  getAttendanceWindows,
  getMinutesInTimeZone,
  getDateKeyInTimeZone,
  isClosedDay,
  evaluateEntryAttempt,
  evaluateStudentDay,
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

/* -------------------------------------------------------------------------- */
/*  Yapılandırma                                                               */
/* -------------------------------------------------------------------------- */

let cachedConfig = resolveAttendanceConfig({});
let cachedConfigAt = 0;

export const getCachedAttendanceConfig = () => cachedConfig;

/** Kurum ayarlarını okur (30 sn önbellekli). */
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

/** Kurum ayarlarını canlı dinler. Aboneliği iptal eden fonksiyon döner. */
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

/* -------------------------------------------------------------------------- */
/*  Zaman bağlamı                                                              */
/* -------------------------------------------------------------------------- */

/** O anın kurum saatine göre bağlamını üretir. */
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

/* -------------------------------------------------------------------------- */
/*  Geçiş durumu (gate status) — çift kaynak okuma                             */
/* -------------------------------------------------------------------------- */

/**
 * Öğrencinin bugünkü kurum içi/dışı durumunu okur.
 * Önce RTDB (anlık), yoksa Firestore'a düşer.
 */
export const readGateStatus = async (studentId, dateKey) => {
  try {
    const snap = await get(ref(rtdb, `qr_system/gate_status/${studentId}`));
    if (snap.exists()) {
      const data = snap.val();
      if (data?.date === dateKey) return data.status === 'entry' ? 'entry' : 'exit';
    }
  } catch { /* RTDB erişilemedi, Firestore'a düş */ }

  try {
    const snap = await getDoc(doc(db, 'gate_status', studentId));
    if (snap.exists()) {
      const data = snap.data();
      if (data?.date === dateKey) return data.status === 'entry' ? 'entry' : 'exit';
    }
  } catch { /* yok say */ }

  return 'outside';
};

/* -------------------------------------------------------------------------- */
/*  Geçiş kaydı — TEK yazma noktası                                            */
/* -------------------------------------------------------------------------- */

/**
 * Bir giriş/çıkış hareketini tüm kaynaklara yazar:
 *   • Firestore gate_status/{id}        (mobil web'in okuduğu yer)
 *   • RTDB qr_system/gate_status/{id}   (admin panelinin okuduğu yer)
 *   • Firestore attendance_logs         (rapor geçmişi)
 *   • RTDB qr_system/attendance_logs/{gün}/{id}  (günlük geçiş defteri)
 *   • RTDB qr_system/live_scans/{id}    (canlı akış)
 *   • VDS /api/qr/scan                  (socket.io canlı yayın — best effort)
 *   • WhatsApp veli bildirimi           (best effort)
 */
export const recordGatePassage = async (options) => {
  const {
    student,
    action,                    // 'entry' | 'exit'
    method = 'qr',             // 'qr' | 'manual_admin' | 'auto'
    isManualApproval = false,
    approvedBy = null,
    autoKind = null,           // 'lunch_exit' | 'school_exit'
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

  const logData = {
    studentId: student.id,
    userId: student.id,
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

  // --- 1+2) RTDB ve Firestore'a PARALEL yazma -------------------------------
  //
  // Öğrencinin turnikede beklediği süre bu iki yazmanın toplamı değil, en
  // yavaşı kadardır. Sıralı bekleme okutma başına ~2,3 sn sürüyordu.
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
    // Durum ve log da birbirini beklemez.
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

  // --- 3) VDS canlı yayın (best effort) -------------------------------------
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
    }).catch(() => { /* VDS kapalıysa akış Firebase üzerinden devam eder */ });
  }

  // --- 4) Veli bildirimi (best effort) --------------------------------------
  if (notifyParent) {
    Promise.resolve()
      .then(() => sendWhatsAppNotification(student.id, student.name, normalizedAction, now))
      .catch(err => console.warn('[attendance] WhatsApp bildirimi gönderilemedi:', err?.message));
  }

  return { ok: rtdbOk || firestoreOk, rtdbOk, firestoreOk, log: logData, time: timeStr, dateKey };
};

/* -------------------------------------------------------------------------- */
/*  Karekod okutma akışı (mobil web)                                           */
/* -------------------------------------------------------------------------- */

/**
 * Öğrenci karekod okuttuğunda çağrılır.
 * Kural motoruna danışır; geç kalınmışsa giriş YAZILMAZ, rehberlik talebi açılır.
 */
export const processStudentScan = async (options) => {
  const { student, requestedAction = 'toggle', sessionId = 'web_fallback', qrType = 'institution', now = new Date() } = options || {};
  const cfg = await loadAttendanceConfig();
  const ctx = buildTimeContext(cfg, now);
  const currentStatus = await readGateStatus(student.id, ctx.dateKey);

  // --- Çıkış istekleri: kural motoru gerektirmez ---------------------------
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

  // --- Giriş istekleri: kural motoru karar verir ---------------------------
  const decision = evaluateEntryAttempt({
    minutes: ctx.nowMinutes,
    config: cfg,
    currentStatus,
    isClosedDay: ctx.isClosedDay
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

/* -------------------------------------------------------------------------- */
/*  Rehberlik onayı bekleyen geç girişler                                      */
/* -------------------------------------------------------------------------- */

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

/** Belirli günün bekleyen geç giriş taleplerini canlı dinler. */
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

/**
 * Tek bir geç giriş talebinin durumunu canlı dinler.
 * Öğrencinin telefonu, görevli öğretmen onay verdiği anda ekranını günceller.
 */
export const subscribeLateApprovalStatus = (dateKey, requestId, callback) => {
  return onValue(
    ref(rtdb, `qr_system/late_approvals/${dateKey}/${requestId}`),
    (snap) => callback(snap.exists() ? snap.val() : null),
    () => callback(null)
  );
};

/**
 * Görevli/nöbetçi öğretmenin geç giriş talebini onaylaması.
 * Onaylanınca giriş kaydı manuel onaylı olarak yazılır.
 */
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

/** Talebi kapatır (onaylandı / reddedildi). */
export const resolveLateApproval = async ({ request, status, resolvedBy, dateKey }) => {
  const key = dateKey || request.date;
  const patch = { status, resolvedBy: resolvedBy || null, resolvedAtMs: Date.now() };
  try {
    await updateDoc(doc(db, 'late_approvals', request.id), { ...patch, resolvedAt: serverTimestamp() });
  } catch {
    // Döküman yoksa (yalnızca RTDB'ye yazılmışsa) oluşturarak kapat.
    try { await setDoc(doc(db, 'late_approvals', request.id), { ...request, ...patch }, { merge: true }); }
    catch (e) { console.error('[attendance] Talep kapatılamadı (Firestore):', e?.message); }
  }
  try {
    await update(ref(rtdb, `qr_system/late_approvals/${key}/${request.id}`), patch);
  } catch (err) {
    console.error('[attendance] Talep kapatılamadı (RTDB):', err?.message);
  }
};

/* -------------------------------------------------------------------------- */
/*  Günlük geçiş kayıtlarını okuma                                             */
/* -------------------------------------------------------------------------- */

/** Bir günün RTDB geçiş defterini canlı dinler; öğrenciye göre gruplar. */
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

/** Bir günün geçişlerini tek seferlik okur (otomasyon için). */
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
    // `date` alanı olmayan eski kayıtlar için sessizce geç
    console.warn('[attendance] Firestore geçişleri okunamadı:', err?.message);
  }

  // Her geçiş HEM RTDB'ye HEM Firestore'a yazıldığı için aynı okutma iki kez
  // gelir. İkisi de aynı `minutes` değerini taşıdığından tekilleştirme kesindir.
  Object.keys(byStudent).forEach(sid => {
    byStudent[sid] = sortAndDedupeScans(byStudent[sid]);
  });

  return byStudent;
};

/* -------------------------------------------------------------------------- */
/*  Günlük devamsızlık kayıtlarını okuma                                       */
/* -------------------------------------------------------------------------- */

/** `attendance` koleksiyonundaki bir günün kayıtlarını öğrenciye göre gruplar. */
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

  // 1) String tarihli kayıtlar (otomatik + backend cron)
  try {
    const snap = await getDocs(query(collection(db, 'attendance'), where('date', '==', dateKey)));
    snap.forEach(d => absorb(d.id, d.data()));
  } catch (err) {
    console.warn('[attendance] Tarihli devamsızlık sorgusu başarısız:', err?.message);
  }

  // 2) Timestamp tarihli manuel kayıtlar (Hızlı İşlem butonları)
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

/** Bir öğrencinin o gün raporlu/izinli olup olmadığı. */
export const hasExcuseRecord = (records) =>
  (records || []).some(r => r.status === 'excused' || String(r.courseName || '').includes('Raporlu') || String(r.courseName || '').includes('İzinli'));

/** İdarenin o gün için elle girdiği devamsızlık kaydı var mı? (otomatiği ezer) */
export const hasManualAbsenceRecord = (records) =>
  (records || []).some(r => r && !r.autoGenerated && r.status === 'absent');

/* -------------------------------------------------------------------------- */
/*  Otomatik devamsızlık işleyicisi                                            */
/* -------------------------------------------------------------------------- */

/**
 * Günlük otomatik devamsızlık kaydını yazar/günceller (idempotent).
 * Aynı kimlik kullanıldığı için 12:00'de açılan "Yarım Gün Yok" kaydı, okul
 * çıkışında aynı kayıt üzerinde "Tam Gün Yok"a yükseltilir — mükerrer satır olmaz.
 */
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

  // Eski şemadan (oturum başına ayrı kayıt) kalan satırları temizle.
  await clearLegacyAutoAbsences(record.date, record.studentId);
};

/** Eski oturum bazlı otomatik kayıtları siler. */
export const clearLegacyAutoAbsences = async (dateKey, studentId) => {
  await Promise.all(
    buildLegacyAutoAbsenceIds(dateKey, studentId).map(id =>
      deleteDoc(doc(db, 'attendance', id)).catch(() => { /* yoksa sorun değil */ })
    )
  );
};

/**
 * Öğrenci sonradan geldiyse (ör. öğleden sonra giriş yaptı) hatalı kalan
 * otomatik kaydı siler. Sistem kendi kendini düzeltir.
 */
export const removeAutoAbsence = async (dateKey, studentId) => {
  await deleteDoc(doc(db, 'attendance', buildAutoAbsenceId(dateKey, studentId)))
    .catch(() => { /* yoksa sorun değil */ });
  await clearLegacyAutoAbsences(dateKey, studentId);
};

/* -------------------------------------------------------------------------- */
/*  Toplu yazma altyapısı (1000+ öğrenci için)                                 */
/* -------------------------------------------------------------------------- */

const FIRESTORE_BATCH_LIMIT = 450;   // Firestore sınırı 500; pay bırakıldı
const RTDB_PATHS_PER_UPDATE = 500;

/** Firestore işlemlerini 450'lik gruplar hâlinde commit eder. */
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

/** RTDB çok yollu güncellemeleri parçalar hâlinde uygular. */
const updateInChunks = async (updates) => {
  const keys = Object.keys(updates);
  for (let i = 0; i < keys.length; i += RTDB_PATHS_PER_UPDATE) {
    const chunk = {};
    keys.slice(i, i + RTDB_PATHS_PER_UPDATE).forEach(k => { chunk[k] = updates[k]; });
    await update(ref(rtdb), chunk);
  }
  return keys.length;
};

/**
 * Otomatik giriş/çıkışları TOPLU yazar.
 *
 * Tek tek `recordGatePassage` çağırmak 1000 öğrenci için ~5000 ağ turu demek
 * (ölçüldü: 100 öğrenci = 143 sn). Burada tüm hareketler önce bellekte
 * hazırlanır, sonra RTDB'ye çok yollu tek güncelleme ve Firestore'a toplu
 * yazma olarak gönderilir — birkaç ağ turu yeterli olur.
 */
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

/** Otomatik devamsızlık kayıtlarını toplu yazar / kaldırır. */
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
    // Eski oturum bazlı şemadan kalan satırları temizle
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

/**
 * Otomasyonun ana turu. Dakikada bir çağrılması güvenlidir (idempotent).
 *
 *  • 12:10 — sabah okutup çıkış okutmayanlara otomatik çıkış
 *  • 12:00 — sabah gelmeyenlere yarım gün yok
 *  • Okul çıkış saati — gelmeyenlere ikinci yarım gün (toplam tam gün yok)
 *  • Okul çıkış saati — hâlâ içeride görünenlere otomatik çıkış
 */
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
    studentsProcessed: 0,
    errors: []
  };

  if (ctx.isClosedDay) {
    result.skipped = 'Kurum bugün kapalı (kapalı gün / tatil).';
    return result;
  }

  const w = ctx.windows;
  // İşin en erken tetiklendiği an: öğle otomatik çıkışı veya yarım gün sınırı
  const earliestAction = Math.min(w.halfDayCutoff, w.lunchExitAutoAt);
  if (ctx.nowMinutes < earliestAction) {
    result.skipped = `Henüz işlem saati gelmedi (ilk eşik ${minutesToTime(earliestAction)}).`;
    return result;
  }

  // --- Veriyi topla ---------------------------------------------------------
  // `onlyStudentIds` verilirse yalnızca o öğrenciler işlenir. Uçtan uca testler
  // ve tek bir öğrencinin gününü yeniden işlemek için kullanılır.
  const onlyIds = options.onlyStudentIds ? new Set(options.onlyStudentIds) : null;

  let students;
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['student', 'öğrenci'])));
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

  /* ------------------------------------------------------------------------
   *  FAZ 1 — Değerlendirme (saf, ağ erişimi yok)
   *
   *  Tüm öğrenciler bellekte değerlendirilir; hiçbir yazma yapılmaz.
   *  1000 öğrenci için bu faz milisaniyeler sürer.
   * ---------------------------------------------------------------------- */
  const plannedPassages = [];
  const plannedWrites = [];
  const plannedRemovals = [];

  for (const student of students) {
    try {
      const scans = scansByStudent[student.id] || [];
      const records = recordsByStudent[student.id] || [];

      const evaluation = evaluateStudentDay({
        scans,
        nowMinutes: ctx.nowMinutes,
        config: cfg,
        isClosedDay: ctx.isClosedDay
      });

      // Otomatik çıkışlar
      if (evaluation.needsAutoLunchExit) {
        plannedPassages.push({ student, action: 'exit', autoKind: 'lunch_exit', session: 'morning' });
      } else if (evaluation.needsAutoSchoolExit) {
        plannedPassages.push({ student, action: 'exit', autoKind: 'school_exit', session: 'afternoon' });
      }

      // Devamsızlık — günde TEK kayıt, gün ilerledikçe güncellenir
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

  /* ------------------------------------------------------------------------
   *  FAZ 2 — Toplu yazma
   *
   *  Tüm hareketler RTDB'ye çok yollu tek güncelleme, Firestore'a 450'lik
   *  gruplar hâlinde gönderilir. Öğrenci sayısından bağımsız olarak birkaç
   *  ağ turu yeterlidir.
   * ---------------------------------------------------------------------- */
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
    } catch (err) {
      result.errors.push(`Toplu devamsızlık yazılamadı: ${err?.message}`);
    }
  }

  // Veli bildirimleri: öğle otomatik çıkışlarında, akışı bloklamadan ve
  // servisi boğmadan gönderilir.
  if (cfg.notifyParentsOnAutoExit !== false) {
    const lunchExits = plannedPassages.filter(p => p.autoKind === 'lunch_exit');
    if (lunchExits.length) notifyParentsThrottled(lunchExits, now);
  }

  // --- Tur kaydı ------------------------------------------------------------
  // Hedefli (tek öğrencilik) çalıştırmalar günün genel özetini bozmasın.
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
 * Veli bildirimlerini kısıtlı eş zamanlılıkla, arka planda gönderir.
 * 1000 öğrencilik otomatik çıkışta bildirim servisi boğulmasın diye.
 */
const NOTIFY_CONCURRENCY = 5;

const notifyParentsThrottled = (passages, now) => {
  let index = 0;
  const worker = async () => {
    while (index < passages.length) {
      const p = passages[index++];
      try {
        await sendWhatsAppNotification(p.student.id, p.student.name, 'exit', now);
      } catch {
        // Tek bir bildirim hatası turu bozmasın
      }
    }
  };
  // Bilinçli olarak await edilmez: yoklama akışını bloklamaz.
  Promise.all(Array.from({ length: NOTIFY_CONCURRENCY }, worker))
    .catch(() => { /* yok say */ });
};

/* -------------------------------------------------------------------------- */
/*  Kiralama (lease) — aynı anda tek panelin işlemesi için                     */
/* -------------------------------------------------------------------------- */

const LEASE_PATH = 'qr_system/automation_lease';
const LEASE_TTL_MS = 5 * 60_000; // büyük turlar 90 sn'yi aşabilir

/**
 * Otomasyon turunu tek bir panelin çalıştırmasını sağlar.
 * (Yazma işlemleri zaten idempotent; bu yalnızca gereksiz yükü azaltır.)
 */
export const tryAcquireAutomationLease = async (ownerId) => {
  try {
    const res = await runTransaction(ref(rtdb, LEASE_PATH), (current) => {
      const nowMs = Date.now();
      if (current && current.expiresAt > nowMs && current.ownerId !== ownerId) {
        return; // başkası tutuyor, iptal
      }
      return { ownerId, acquiredAt: nowMs, expiresAt: nowMs + LEASE_TTL_MS };
    });
    return Boolean(res.committed && res.snapshot.val()?.ownerId === ownerId);
  } catch {
    // Kiralama başarısızsa yine de çalıştır (idempotent olduğu için güvenli)
    return true;
  }
};
