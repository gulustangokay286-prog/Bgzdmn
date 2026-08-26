/**
 * ============================================================================
 *  UÇTAN UCA YOKLAMA TESTİ — GERÇEK ALTYAPI
 * ============================================================================
 *  Sahte veritabanı YOKTUR. Test doğrudan canlı sisteme bağlanır:
 *
 *    • Firestore  (bgz-mobil)              — users, gate_status, attendance,
 *                                            attendance_logs, late_approvals
 *    • Realtime DB(bgz-mobil-default-rtdb) — qr_system/*
 *    • VDS        (213.142.159.36:8080)    — /api/health, /api/qr/scan
 *
 *  GÜVENLİK: Test yalnızca "__E2E_TEST_ÖĞRENCİ__" adlı geçici bir öğrenci
 *  üzerinde çalışır. Otomasyon `onlyStudentIds` ile bu öğrenciye kilitlenir,
 *  gerçek öğrencilere ASLA dokunulmaz. Test sonunda ürettiği her kayıt silinir.
 *
 *  Çalıştırma:  node tests/e2e-attendance.mjs
 * ============================================================================
 */

import {
  collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where
} from 'firebase/firestore';
import { ref, get, update, remove, push, runTransaction } from 'firebase/database';
import { db, rtdb } from '../src/services/firebaseConfig.js';

import {
  resolveAttendanceConfig,
  getAttendanceWindows,
  getDateKeyInTimeZone,
  minutesToTime,
  timeToMinutes,
  buildAutoAbsenceId,
  buildLegacyAutoAbsenceIds,
  buildLateApprovalId,
  classifyScanMinutes,
  ABSENCE_STATUS
} from '../src/services/attendanceRules.js';

import {
  loadAttendanceConfig,
  buildTimeContext,
  recordGatePassage,
  processStudentScan,
  readGateStatus,
  fetchDayScans,
  fetchDayAttendanceRecords,
  runAttendanceAutomation,
  approveLateEntry,
  resolveLateApproval,
  tryAcquireAutomationLease,
  VDS_ENDPOINT
} from '../src/services/attendanceService.js';

/* -------------------------------------------------------------------------- */
/*  Test altyapısı                                                             */
/* -------------------------------------------------------------------------- */

const TEST_STUDENT_ID = 'zz-e2e-attendance-test-student';
const TEST_STUDENT = {
  id: TEST_STUDENT_ID,
  name: '__E2E_TEST_ÖĞRENCİ__',
  tc: '00000000000',
  schoolNumber: 'E2E-000',
  photo: ''
};

let passed = 0;
let failed = 0;
const failures = [];

const check = (label, condition, extra = '') => {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(label + (extra ? ` — ${extra}` : ''));
    console.log(`  ✖ ${label}${extra ? ` — ${extra}` : ''}`);
  }
};

const section = (title) => console.log(`\n\x1b[1m${title}\x1b[0m`);
const info = (msg) => console.log(`  · ${msg}`);

/* -------------------------------------------------------------------------- */
/*  Temizlik                                                                   */
/* -------------------------------------------------------------------------- */

async function cleanup(dateKey) {
  const tasks = [];

  tasks.push(deleteDoc(doc(db, 'users', TEST_STUDENT_ID)).catch(() => {}));
  tasks.push(deleteDoc(doc(db, 'gate_status', TEST_STUDENT_ID)).catch(() => {}));

  tasks.push(deleteDoc(doc(db, 'attendance', buildAutoAbsenceId(dateKey, TEST_STUDENT_ID))).catch(() => {}));
  for (const id of buildLegacyAutoAbsenceIds(dateKey, TEST_STUDENT_ID)) {
    tasks.push(deleteDoc(doc(db, 'attendance', id)).catch(() => {}));
  }
  for (const session of ['morning', 'afternoon']) {
    tasks.push(deleteDoc(doc(db, 'late_approvals', buildLateApprovalId(dateKey, TEST_STUDENT_ID, session))).catch(() => {}));
  }

  // Test öğrencisine ait tüm attendance / attendance_logs kayıtları
  for (const col of ['attendance', 'attendance_logs']) {
    try {
      const snap = await getDocs(query(collection(db, col), where('studentId', '==', TEST_STUDENT_ID)));
      snap.forEach(d => tasks.push(deleteDoc(doc(db, col, d.id)).catch(() => {})));
    } catch (e) { /* yok say */ }
  }

  await Promise.all(tasks);

  // RTDB temizliği
  await remove(ref(rtdb, `qr_system/gate_status/${TEST_STUDENT_ID}`)).catch(() => {});
  await remove(ref(rtdb, `qr_system/late_approvals/${dateKey}`)).catch(() => {});

  // Günlük geçiş defterinden yalnızca test öğrencisinin kayıtları
  try {
    const snap = await get(ref(rtdb, `qr_system/attendance_logs/${dateKey}`));
    if (snap.exists()) {
      const updates = {};
      const val = snap.val();
      Object.keys(val).forEach(k => {
        if (val[k]?.studentId === TEST_STUDENT_ID) {
          updates[`qr_system/attendance_logs/${dateKey}/${k}`] = null;
          updates[`qr_system/live_scans/${k}`] = null;
        }
      });
      if (Object.keys(updates).length) await update(ref(rtdb), updates);
    }
  } catch (e) { /* yok say */ }

  // live_scans içinde kalmış olabilecekler
  try {
    const snap = await get(ref(rtdb, 'qr_system/live_scans'));
    if (snap.exists()) {
      const updates = {};
      const val = snap.val();
      Object.keys(val).forEach(k => {
        if (val[k]?.studentId === TEST_STUDENT_ID) updates[`qr_system/live_scans/${k}`] = null;
      });
      if (Object.keys(updates).length) await update(ref(rtdb), updates);
    }
  } catch (e) { /* yok say */ }
}

/* -------------------------------------------------------------------------- */
/*  Ana akış                                                                   */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log('\x1b[1m\x1b[36m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m\x1b[36m║  YOKLAMA SİSTEMİ — CANLI UÇTAN UCA TEST (gerçek Firebase+VDS) ║\x1b[0m');
  console.log('\x1b[1m\x1b[36m╚══════════════════════════════════════════════════════════════╝\x1b[0m');

  const config = await loadAttendanceConfig(true);
  const ctx = buildTimeContext(config, new Date());
  const dateKey = ctx.dateKey;
  const windows = getAttendanceWindows(config);

  info(`Kurum saat dilimi : ${config.timeZone}`);
  info(`Bugün             : ${dateKey} (${ctx.isClosedDay ? 'KAPALI GÜN' : 'açık'})`);
  info(`Şu an             : ${minutesToTime(ctx.nowMinutes)}`);
  info(`Sabah giriş       : ${config.morningEntryHour} → tolerans ${minutesToTime(windows.morningGraceEnd)}`);
  info(`Öğle çıkışı       : ${config.lunchExitHour} → otomatik ${minutesToTime(windows.lunchExitAutoAt)}`);
  info(`Öğleden sonra     : ${config.afternoonEntryHour} → tolerans ${minutesToTime(windows.afternoonGraceEnd)}`);
  info(`Okul çıkışı       : ${config.schoolExitHour}`);

  /* ---------------------------------------------------------------------- */
  /*  Çalışma kilidi                                                         */
  /*  Aynı test öğrencisi üzerinde iki test aynı anda koşarsa birbirlerinin  */
  /*  verisini ezer ve yanıltıcı sonuç üretirler. Kilit bunu engeller.       */
  /* ---------------------------------------------------------------------- */
  const RUN_ID = `run_${process.pid}_${Date.now()}`;
  const lockRef = ref(rtdb, 'qr_system/zz_e2e_run_lock');
  const lockRes = await runTransaction(lockRef, (current) => {
    const nowMs = Date.now();
    if (current && current.expiresAt > nowMs && current.runId !== RUN_ID) return;
    return { runId: RUN_ID, startedAt: nowMs, expiresAt: nowMs + 10 * 60 * 1000 };
  });

  if (!lockRes.committed || lockRes.snapshot.val()?.runId !== RUN_ID) {
    console.error('\n\x1b[31mBaşka bir uçtan uca test hâlâ çalışıyor.\x1b[0m');
    console.error('Bitmesini bekleyin veya kilidi temizleyin:');
    console.error('  node -e "..." → qr_system/zz_e2e_run_lock');
    process.exit(1);
  }

  const releaseLock = () => remove(lockRef).catch(() => {});

  await cleanup(dateKey);

  /* ---------------------------------------------------------------------- */
  section('1) ALTYAPI BAĞLANTILARI');
  /* ---------------------------------------------------------------------- */

  try {
    const res = await fetch(`${VDS_ENDPOINT}/api/health`, { signal: AbortSignal.timeout(8000) });
    const body = await res.json();
    check('VDS backend ayakta (/api/health)', body.status === 'ok', JSON.stringify(body));
  } catch (err) {
    check('VDS backend ayakta (/api/health)', false, err.message);
  }

  try {
    await setDoc(doc(db, 'users', TEST_STUDENT_ID), {
      role: 'student',
      full_name: TEST_STUDENT.name,
      tc_kimlik: TEST_STUDENT.tc,
      school_number: TEST_STUDENT.schoolNumber,
      class_id: '9',
      status: 'approved',
      __e2eTest: true
    });
    const snap = await getDoc(doc(db, 'users', TEST_STUDENT_ID));
    check('Firestore yazma/okuma çalışıyor', snap.exists() && snap.data().full_name === TEST_STUDENT.name);
  } catch (err) {
    check('Firestore yazma/okuma çalışıyor', false, err.message);
  }

  try {
    await update(ref(rtdb), { [`qr_system/zz_e2e_probe`]: { ok: true, at: Date.now() } });
    const snap = await get(ref(rtdb, 'qr_system/zz_e2e_probe'));
    check('Realtime Database yazma/okuma çalışıyor', snap.exists() && snap.val().ok === true);
    await remove(ref(rtdb, 'qr_system/zz_e2e_probe'));
  } catch (err) {
    check('Realtime Database yazma/okuma çalışıyor', false, err.message);
  }

  /* ---------------------------------------------------------------------- */
  section('2) GEÇİŞ KAYDI — MOBİL WEB ↔ ADMIN WINDOWS SENKRONU');
  /* ---------------------------------------------------------------------- */

  const entryResult = await recordGatePassage({
    student: TEST_STUDENT,
    action: 'entry',
    method: 'manual_admin',
    isManualApproval: true,
    approvedBy: 'E2E Test',
    session: classifyScanMinutes(ctx.nowMinutes, config).session,
    config,
    notifyParent: false
  });

  check('Geçiş kaydı yazıldı', entryResult.ok, JSON.stringify({ rtdb: entryResult.rtdbOk, fs: entryResult.firestoreOk }));

  const fsStatus = await getDoc(doc(db, 'gate_status', TEST_STUDENT_ID));
  check('Firestore gate_status güncellendi (mobil webin okuduğu yer)',
    fsStatus.exists() && fsStatus.data().status === 'entry' && fsStatus.data().date === dateKey);

  const rtStatusSnap = await get(ref(rtdb, `qr_system/gate_status/${TEST_STUDENT_ID}`));
  check('RTDB gate_status güncellendi (Admin panelinin okuduğu yer)',
    rtStatusSnap.exists() && rtStatusSnap.val().status === 'entry' && rtStatusSnap.val().date === dateKey);

  check('İKİ KAYNAK SENKRON — panel ile mobil web aynı durumu görüyor',
    fsStatus.exists() && rtStatusSnap.exists() && fsStatus.data().status === rtStatusSnap.val().status);

  const readBack = await readGateStatus(TEST_STUDENT_ID, dateKey);
  check('readGateStatus "entry" döndürüyor', readBack === 'entry', readBack);

  const dayLogsSnap = await get(ref(rtdb, `qr_system/attendance_logs/${dateKey}`));
  const testLogs = dayLogsSnap.exists()
    ? Object.values(dayLogsSnap.val()).filter(l => l.studentId === TEST_STUDENT_ID)
    : [];
  check('Günlük geçiş defterine yazıldı (RTDB)', testLogs.length >= 1, `${testLogs.length} kayıt`);

  const liveSnap = await get(ref(rtdb, 'qr_system/live_scans'));
  const liveHit = liveSnap.exists() && Object.values(liveSnap.val()).some(l => l.studentId === TEST_STUDENT_ID);
  check('Canlı akışa (live_scans) düştü — Canlı Geçiş Takibi ekranı görür', liveHit);

  const fsLogs = await getDocs(query(collection(db, 'attendance_logs'), where('studentId', '==', TEST_STUDENT_ID)));
  check('Firestore attendance_logs kaydı oluştu', fsLogs.size >= 1, `${fsLogs.size} kayıt`);

  /* ---------------------------------------------------------------------- */
  section('3) GEÇİŞ KAYITLARININ MOTOR TARAFINDAN OKUNMASI');
  /* ---------------------------------------------------------------------- */

  const scans = await fetchDayScans(dateKey, config);
  const myScans = scans[TEST_STUDENT_ID] || [];
  check('fetchDayScans geçişi buluyor', myScans.length >= 1, `${myScans.length} okutma`);
  check('Okutma doğru normalize edildi (yön + saat)',
    myScans.some(s => s.action === 'entry' && /^\d{2}:\d{2}$/.test(s.time)),
    JSON.stringify(myScans.map(s => `${s.time} ${s.action}`)));

  /* ---------------------------------------------------------------------- */
  section('4) ÇIKIŞ VE DURUM DEĞİŞİMİ');
  /* ---------------------------------------------------------------------- */

  await recordGatePassage({
    student: TEST_STUDENT, action: 'exit', method: 'auto', autoKind: 'lunch_exit',
    session: classifyScanMinutes(ctx.nowMinutes, config).session, config, notifyParent: false
  });

  const afterExitFs = await getDoc(doc(db, 'gate_status', TEST_STUDENT_ID));
  const afterExitRt = await get(ref(rtdb, `qr_system/gate_status/${TEST_STUDENT_ID}`));
  check('Otomatik çıkış Firestore\'a işlendi', afterExitFs.data()?.status === 'exit');
  check('Otomatik çıkış RTDB\'ye işlendi', afterExitRt.val()?.status === 'exit');
  check('Otomatik çıkış "lunch_exit" olarak etiketlendi',
    (await fetchDayScans(dateKey, config))[TEST_STUDENT_ID]?.some(s => s.autoKind === 'lunch_exit'));

  /* ---------------------------------------------------------------------- */
  section('5) OTOMATİK DEVAMSIZLIK YAZMA (yalnızca test öğrencisi)');
  /* ---------------------------------------------------------------------- */

  const auto = await runAttendanceAutomation({ config, onlyStudentIds: [TEST_STUDENT_ID] });
  info(`Otomasyon turu: ${auto.time} · işlenen ${auto.studentsProcessed} · ` +
       `otomatik çıkış ${auto.autoExits} · devamsızlık ${auto.absencesWritten}` +
       (auto.skipped ? ` · ATLANDI: ${auto.skipped}` : ''));
  check('Otomasyon turu hatasız tamamlandı', auto.errors.length === 0, auto.errors.join(' | '));
  check('Otomasyon yalnızca test öğrencisini işledi', auto.studentsProcessed <= 1, `${auto.studentsProcessed}`);

  const records = await fetchDayAttendanceRecords(dateKey);
  const myRecords = records[TEST_STUDENT_ID] || [];

  // Öğrenci okutmayı ŞU AN yaptı; hangi oturuma denk geldiğini motor belirler.
  const attendedSession = classifyScanMinutes(ctx.nowMinutes, config).session;
  const missedSession = attendedSession === 'morning' ? 'afternoon' : 'morning';
  const written = myRecords.map(r => `${r.courseName}=${r.absenceWeight}`);
  info(`Okutma "${attendedSession}" oturumuna denk geldi · yazılan kayıtlar: ${written.join(', ') || 'yok'}`);

  if (ctx.isClosedDay) {
    check('Kapalı günde otomatik devamsızlık yazılmadı', myRecords.length === 0, `${myRecords.length} kayıt`);
  } else if (!attendedSession) {
    check('Mesai dışı okutmada oturum devamsızlığı hesabı bozulmadı', auto.errors.length === 0);
  } else {
    // Katıldığı oturuma ASLA devamsızlık yazılmamalı.
    check(`Katıldığı oturuma (${attendedSession}) devamsızlık YAZILMADI`,
      !myRecords.some(r => (r.missingSessions || []).includes(attendedSession)), written.join(', '));

    // Kaçırdığı oturum kesinleşmişse 0,5 yazılmalı, kesinleşmemişse yazılmamalı.
    const missedFinalized = missedSession === 'morning'
      ? ctx.nowMinutes >= windows.halfDayCutoff
      : ctx.nowMinutes >= windows.schoolExit;

    if (missedFinalized) {
      const expectedLabel = `Yarım Gün Yok (${missedSession === 'morning' ? 'Sabah' : 'Öğleden Sonra'})`;
      check(`Katılmadığı oturum için "${expectedLabel}" yazıldı`,
        myRecords.length === 1 && myRecords[0].courseName === expectedLabel, written.join(', '));
      check('Bir oturuma katıldığı için TAM GÜN yazılmadı',
        !myRecords.some(r => r.courseName === 'Tam Gün Yok (Özürsüz)'), written.join(', '));
      check('Toplam devamsızlık 0,5',
        myRecords.reduce((a, r) => a + (Number(r.absenceWeight) || 0), 0) === 0.5, written.join(', '));
    } else {
      check(`Katılmadığı oturum (${missedSession}) henüz kesinleşmedi, devamsızlık yazılmadı`,
        myRecords.length === 0, written.join(', '));
    }
  }

  /* ---------------------------------------------------------------------- */
  section('6) HİÇ GELMEYEN ÖĞRENCİ — TAM GÜN YOK ZİNCİRİ');
  /* ---------------------------------------------------------------------- */

  // Test öğrencisinin bugünkü tüm geçişlerini temizleyip "hiç gelmedi" senaryosunu kur.
  await cleanup(dateKey);
  await setDoc(doc(db, 'users', TEST_STUDENT_ID), {
    role: 'student', full_name: TEST_STUDENT.name, tc_kimlik: TEST_STUDENT.tc,
    school_number: TEST_STUDENT.schoolNumber, class_id: '9', status: 'approved', __e2eTest: true
  });

  const auto2 = await runAttendanceAutomation({ config, onlyStudentIds: [TEST_STUDENT_ID] });
  const records2 = await fetchDayAttendanceRecords(dateKey);
  const noShow = records2[TEST_STUDENT_ID] || [];
  const totalWeight = noShow.reduce((sum, r) => sum + (Number(r.absenceWeight) || 0), 0);

  info(`Hiç gelmeyen öğrenci kayıtları: ${noShow.map(r => `${r.sessionLabel} (${r.absenceWeight})`).join(', ') || 'yok'}`);

  if (ctx.isClosedDay) {
    check('Kapalı günde tam gün yok yazılmadı', noShow.length === 0);
  } else if (ctx.nowMinutes >= windows.schoolExit) {
    check('Okul çıkışında kayıt TAM GÜN YOK olarak yazıldı',
      noShow.length === 1 && noShow[0].courseName === 'Tam Gün Yok (Özürsüz)',
      noShow.map(r => r.courseName).join(' | '));
    check('Ağırlık 1,0 (tam gün)', totalWeight === 1, `toplam ${totalWeight}`);
    check('TEK kayıt — iki ayrı yarım gün satırı YOK', noShow.length === 1, `${noShow.length} kayıt`);
  } else if (ctx.nowMinutes >= windows.halfDayCutoff) {
    check('Yarım gün sınırında YARIM GÜN YOK yazıldı',
      noShow.length === 1 && noShow[0].courseName === 'Yarım Gün Yok (Sabah)',
      noShow.map(r => r.courseName).join(' | '));
    check('Okul çıkışı gelmediği için TAM GÜNE yükseltilmedi',
      !noShow.some(r => r.courseName === 'Tam Gün Yok (Özürsüz)'));
    check('Toplam ağırlık 0,5 (yarım gün yok)', totalWeight === 0.5, `toplam ${totalWeight}`);
    check('Otomasyon turu hatasız', auto2.errors.length === 0, auto2.errors.join(' | '));
  } else {
    check('Yarım gün sınırından önce hiçbir devamsızlık yazılmadı', noShow.length === 0, `${noShow.length} kayıt`);
  }

  // Aynı turu tekrar çalıştır: mükerrer kayıt oluşmamalı
  await runAttendanceAutomation({ config, onlyStudentIds: [TEST_STUDENT_ID] });
  await runAttendanceAutomation({ config, onlyStudentIds: [TEST_STUDENT_ID] });
  const records3 = await fetchDayAttendanceRecords(dateKey);
  const afterRepeat = records3[TEST_STUDENT_ID] || [];
  check('IDEMPOTENT — 3 tur sonrası kayıt sayısı değişmedi',
    afterRepeat.length === noShow.length, `önce ${noShow.length}, sonra ${afterRepeat.length}`);

  const ids = afterRepeat.map(r => r.id);
  check('Günde öğrenci başına TEK deterministik kimlik (mükerrer imkânsız)',
    ids.length === 0 || (ids.length === 1 && ids[0] === buildAutoAbsenceId(dateKey, TEST_STUDENT_ID)),
    ids.join(', '));

  /* ---------------------------------------------------------------------- */
  section('7) GEÇ GİRİŞ → REHBERLİK ONAYI AKIŞI');
  /* ---------------------------------------------------------------------- */

  await cleanup(dateKey);
  await setDoc(doc(db, 'users', TEST_STUDENT_ID), {
    role: 'student', full_name: TEST_STUDENT.name, tc_kimlik: TEST_STUDENT.tc,
    school_number: TEST_STUDENT.schoolNumber, class_id: '9', status: 'approved', __e2eTest: true
  });

  const scanResult = await processStudentScan({
    student: TEST_STUDENT,
    requestedAction: 'entry',
    sessionId: 'e2e_test',
    qrType: 'institution'
  });

  info(`Okutma sonucu: [${scanResult.kind}] ${scanResult.title} — ${scanResult.message}`);

  const inMorningGrace = ctx.nowMinutes >= windows.dayStart && ctx.nowMinutes <= windows.morningGraceEnd;
  const inAfternoonGrace = ctx.nowMinutes >= windows.halfDayCutoff && ctx.nowMinutes <= windows.afternoonGraceEnd;
  const isLateWindow = !ctx.isClosedDay &&
    ((ctx.nowMinutes > windows.morningGraceEnd && ctx.nowMinutes < windows.halfDayCutoff) ||
     (ctx.nowMinutes > windows.afternoonGraceEnd && ctx.nowMinutes <= windows.schoolExit));

  if (isLateWindow) {
    check('GEÇ GİRİŞ: giriş otomatik kaydedilmedi', scanResult.recorded === false);
    check('GEÇ GİRİŞ: "Rehber Öğretmeninizle Görüşün" ekranı döndü',
      scanResult.kind === 'counselor' && scanResult.title === 'Rehber Öğretmeninizle Görüşün',
      scanResult.title);
    check('GEÇ GİRİŞ: yönlendirme metni manuel girişi anlatıyor',
      /Rehber Öğretmen/.test(scanResult.detail) && /manuel/.test(scanResult.detail));

    const session = scanResult.decision?.session || 'morning';
    const approvalId = buildLateApprovalId(dateKey, TEST_STUDENT_ID, session);

    const fsApproval = await getDoc(doc(db, 'late_approvals', approvalId));
    check('Onay talebi Firestore\'a yazıldı', fsApproval.exists() && fsApproval.data().status === 'pending');

    const rtApproval = await get(ref(rtdb, `qr_system/late_approvals/${dateKey}/${approvalId}`));
    check('Onay talebi RTDB\'ye yazıldı — panel anında görür',
      rtApproval.exists() && rtApproval.val().status === 'pending');

    const statusDuringPending = await readGateStatus(TEST_STUDENT_ID, dateKey);
    check('Onay beklerken öğrenci HÂLÂ kurum dışında', statusDuringPending === 'outside', statusDuringPending);

    // Görevli öğretmen onaylıyor
    await approveLateEntry({ request: { ...rtApproval.val(), id: approvalId }, approvedBy: 'E2E Test Öğretmeni' });

    const statusAfter = await readGateStatus(TEST_STUDENT_ID, dateKey);
    check('Onay sonrası giriş kaydedildi', statusAfter === 'entry', statusAfter);

    const rtAfter = await get(ref(rtdb, `qr_system/late_approvals/${dateKey}/${approvalId}`));
    check('Talep "approved" olarak kapatıldı', rtAfter.val()?.status === 'approved', rtAfter.val()?.status);

    const scansAfter = await fetchDayScans(dateKey, config);
    check('Kayıt "geç giriş" olarak işaretlendi',
      (scansAfter[TEST_STUDENT_ID] || []).some(s => s.action === 'entry' && s.isLate));
    check('Kayıt manuel onaylı olarak işaretlendi',
      (scansAfter[TEST_STUDENT_ID] || []).some(s => s.method === 'manual_admin'));
  } else if (inMorningGrace || inAfternoonGrace) {
    check('TOLERANS İÇİNDE: giriş doğrudan kaydedildi', scanResult.recorded === true, scanResult.message);
    check('TOLERANS İÇİNDE: rehberlik ekranı çıkmadı', scanResult.kind !== 'counselor');
    const st = await readGateStatus(TEST_STUDENT_ID, dateKey);
    check('Öğrenci kurum içinde görünüyor', st === 'entry', st);
  } else {
    check('MESAİ DIŞI: giriş kabul edilmedi', scanResult.recorded === false, scanResult.message);
    info(`(Şu an ${minutesToTime(ctx.nowMinutes)} — okul giriş penceresi dışında)`);
  }

  /* ---------------------------------------------------------------------- */
  section('8) VDS /api/qr/scan GEÇ KALMA KURALI');
  /* ---------------------------------------------------------------------- */

  try {
    const res = await fetch(`${VDS_ENDPOINT}/api/qr/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tc: TEST_STUDENT.tc,
        sessionId: 'web_fallback',
        qrType: 'institution',
        action: 'entry',
        deviceId: 'e2e_test_device'
      }),
      signal: AbortSignal.timeout(12000)
    });
    const body = await res.json().catch(() => ({}));
    info(`VDS yanıtı: HTTP ${res.status} — ${body.error || body.message || '(gövde yok)'}`);
    check('VDS /api/qr/scan yanıt veriyor (çökmedi)', res.status !== 500,
      res.status === 500 ? JSON.stringify(body) : '');
  } catch (err) {
    check('VDS /api/qr/scan yanıt veriyor (çökmedi)', false, err.message);
  }

  /* ---------------------------------------------------------------------- */
  section('9) OTOMASYON KİRALAMASI (çift işleme koruması)');
  /* ---------------------------------------------------------------------- */

  const leaseA = await tryAcquireAutomationLease('e2e_owner_A');
  const leaseB = await tryAcquireAutomationLease('e2e_owner_B');
  check('İlk panel kiralamayı aldı', leaseA === true);
  check('İkinci panel aynı anda kiralama alamadı', leaseB === false);
  await remove(ref(rtdb, 'qr_system/automation_lease')).catch(() => {});

  /* ---------------------------------------------------------------------- */
  section('10) KURUM AYARLARI OKUNABİLİRLİĞİ');
  /* ---------------------------------------------------------------------- */

  const cfgSnap = await getDoc(doc(db, 'config', 'institution'));
  if (cfgSnap.exists()) {
    const resolved = resolveAttendanceConfig(cfgSnap.data());
    check('config/institution okunabiliyor ve çözümleniyor', Boolean(resolved.schoolExitHour));
    info(`Kayıtlı okul çıkış saati: ${resolved.schoolExitHour}`);
  } else {
    check('config/institution yoksa varsayılanlar devrede', config.schoolExitHour === '16:00', config.schoolExitHour);
    info('config/institution henüz oluşturulmamış — Kurum Ayarları ekranından kaydedince oluşacak.');
  }

  /* ---------------------------------------------------------------------- */
  section('11) ZAMAN YOLCULUĞU — 12:00 / 12:10 / OKUL ÇIKIŞI EŞİKLERİ');
  /* ---------------------------------------------------------------------- */
  /*  Otomasyon `now` parametresi alır. Gerçek Firebase üzerinde, gerçek     */
  /*  geçiş kayıtlarıyla, günün farklı saatlerinde ne olacağını doğrular.    */

  /** Bugünün belirli saatinde (Türkiye) bir Date üretir. Istanbul = UTC+3.  */
  const atToday = (hhmm) => new Date(`${dateKey}T${hhmm}:00+03:00`);

  /** Gerçek bir karekod okutmasını, geçmiş bir saate yazar. */
  const writeScanAt = async (hhmm, action, extra = {}) => {
    const when = atToday(hhmm);
    const logRef = push(ref(rtdb, `qr_system/attendance_logs/${dateKey}`));
    const logId = logRef.key;
    const data = {
      studentId: TEST_STUDENT_ID,
      userId: TEST_STUDENT_ID,
      studentName: TEST_STUDENT.name,
      userName: TEST_STUDENT.name,
      type: 'institution',
      action,
      status: action,
      method: 'qr',
      isLate: false,
      time: hhmm,
      minutes: timeToMinutes(hhmm),
      date: dateKey,
      timestamp: when.getTime(),
      ...extra
    };
    await update(ref(rtdb), {
      [`qr_system/attendance_logs/${dateKey}/${logId}`]: data,
      [`qr_system/gate_status/${TEST_STUDENT_ID}`]: {
        status: action, lastAction: action, date: dateKey, time: hhmm,
        method: 'qr', timestamp: when.getTime()
      }
    });
    return logId;
  };

  const resetStudent = async () => {
    await cleanup(dateKey);
    await setDoc(doc(db, 'users', TEST_STUDENT_ID), {
      role: 'student', full_name: TEST_STUDENT.name, tc_kimlik: TEST_STUDENT.tc,
      school_number: TEST_STUDENT.schoolNumber, class_id: '9', status: 'approved', __e2eTest: true
    });
  };

  const weightNow = async () => {
    const recs = (await fetchDayAttendanceRecords(dateKey))[TEST_STUDENT_ID] || [];
    return {
      total: recs.reduce((a, r) => a + (Number(r.absenceWeight) || 0), 0),
      sessions: recs.map(r => r.session).sort(),
      labels: recs.map(r => r.courseName),
      ids: recs.map(r => r.id),
      count: recs.length
    };
  };

  const runAt = (hhmm) => runAttendanceAutomation({
    config, now: atToday(hhmm), onlyStudentIds: [TEST_STUDENT_ID]
  });

  const exitLogs = async (kind) => {
    const scans = (await fetchDayScans(dateKey, config))[TEST_STUDENT_ID] || [];
    return scans.filter(sc => sc.action === 'exit' && sc.autoKind === kind);
  };

  // ---- SENARYO A: hiç gelmeyen öğrenci, saat saat ------------------------
  info('SENARYO A — öğrenci hiç gelmedi');
  await resetStudent();

  await runAt('11:59');
  let w = await weightNow();
  check('A · 11:59 — hiçbir devamsızlık yazılmadı', w.count === 0, `${w.count} kayıt`);

  await runAt('12:00');
  w = await weightNow();
  const idAt1200 = w.ids[0];
  check('A · 12:00 — YARIM GÜN YOK yazıldı (0,5)',
    w.count === 1 && w.total === 0.5 && w.labels[0] === 'Yarım Gün Yok (Sabah)', JSON.stringify(w));

  await runAt('15:59');
  w = await weightNow();
  check('A · 15:59 — hâlâ yarım gün, tam güne yükselmedi', w.total === 0.5, JSON.stringify(w));

  await runAt('16:00');
  w = await weightNow();
  check('A · 16:00 — kayıt TAM GÜN YOK a yükseltildi (1,0)',
    w.count === 1 && w.total === 1 && w.labels[0] === 'Tam Gün Yok (Özürsüz)', JSON.stringify(w));
  check('A · TEK kayıt — iki ayrı "yarım gün" satırı YOK', w.count === 1, `${w.count} kayıt: ${w.labels.join(' | ')}`);
  check('A · Aynı döküman güncellendi (kimlik değişmedi)', w.ids[0] === idAt1200, `${idAt1200} -> ${w.ids[0]}`);

  await runAt('16:30');
  await runAt('17:00');
  w = await weightNow();
  check('A · Tekrar çalıştırmada mükerrer kayıt oluşmadı', w.count === 1 && w.total === 1, JSON.stringify(w));

  // ---- SENARYO B: sabah geldi, öğleden sonra gelmedi ---------------------
  info('SENARYO B — sabah geldi (09:02), öğleden sonra gelmedi');
  await resetStudent();
  await writeScanAt('09:02', 'entry');

  await runAt('12:00');
  w = await weightNow();
  check('B · 12:00 — sabah geldiği için devamsızlık YOK', w.count === 0, JSON.stringify(w));

  await runAt('16:00');
  w = await weightNow();
  check('B · 16:00 — öğleden sonra gelmediği için YARIM GÜN YOK (0,5)',
    w.count === 1 && w.total === 0.5 && w.labels[0] === 'Yarım Gün Yok (Öğleden Sonra)', JSON.stringify(w));

  // ---- SENARYO C: 12:10 otomatik çıkış -----------------------------------
  info('SENARYO C — sabah okuttu, çıkış okutmadı (12:10 otomatik çıkış)');
  await resetStudent();
  await writeScanAt('09:00', 'entry');

  await runAt('12:09');
  let autoExits = await exitLogs('lunch_exit');
  check('C · 12:09 — 10 dk müsaade sürüyor, otomatik çıkış YOK', autoExits.length === 0, `${autoExits.length}`);

  const runC = await runAt('12:10');
  autoExits = await exitLogs('lunch_exit');
  check('C · 12:10 — OTOMATİK ÇIKIŞ verildi', autoExits.length === 1, `${autoExits.length} çıkış`);
  check('C · Otomatik çıkış sayacı arttı', runC.autoExits === 1, `${runC.autoExits}`);

  const gateAfterAuto = await get(ref(rtdb, `qr_system/gate_status/${TEST_STUDENT_ID}`));
  check('C · Öğrenci artık "kurum dışında" görünüyor', gateAfterAuto.val()?.status === 'exit', gateAfterAuto.val()?.status);

  const fsGateAfterAuto = await getDoc(doc(db, 'gate_status', TEST_STUDENT_ID));
  check('C · Otomatik çıkış mobil web tarafına da yansıdı (Firestore)',
    fsGateAfterAuto.data()?.status === 'exit', fsGateAfterAuto.data()?.status);

  await runAt('12:15');
  await runAt('12:30');
  autoExits = await exitLogs('lunch_exit');
  check('C · Otomatik çıkış tekrar tekrar yazılmadı', autoExits.length === 1, `${autoExits.length}`);

  // ---- SENARYO D: kullanıcının kuralı — yarım var + yarım yok = yarım yok
  info('SENARYO D — sabah gelmedi, öğleden sonra geldi (13:05)');
  await resetStudent();
  await writeScanAt('13:05', 'entry');

  await runAt('16:00');
  w = await weightNow();
  check('D · Sabah için yarım gün yok yazıldı',
    w.labels[0] === 'Yarım Gün Yok (Sabah)', JSON.stringify(w));
  check('D · Öğleden sonra geldiği için TAM GÜNE YÜKSELTİLMEDİ',
    w.labels[0] !== 'Tam Gün Yok (Özürsüz)', JSON.stringify(w));
  check('D · TOPLAM = yarım gün yok (0,5), tam gün DEĞİL',
    w.count === 1 && w.total === 0.5, `toplam ${w.total}`);

  // ---- SENARYO H: sonradan gelen öğrencinin kaydı kaldırılır -------------
  info('SENARYO H — 12:00 de yok yazıldı, sonra 13:05 te geldi');
  await resetStudent();
  await runAt('12:00');
  w = await weightNow();
  check('H · 12:00 — yarım gün yok yazıldı', w.count === 1 && w.total === 0.5, JSON.stringify(w));

  await writeScanAt('09:05', 'entry');   // geç ulaşan sabah kaydı
  await runAt('12:30');
  w = await weightNow();
  check('H · Sabah kaydı sonradan gelince otomatik devamsızlık KALDIRILDI',
    w.count === 0, JSON.stringify(w));

  // ---- SENARYO E: tam gün mevcut ----------------------------------------
  info('SENARYO E — sabah 08:55 geldi, 12:05 çıktı, 13:02 tekrar geldi');
  await resetStudent();
  await writeScanAt('08:55', 'entry');
  await writeScanAt('12:05', 'exit');
  await writeScanAt('13:02', 'entry');

  await runAt('16:00');
  w = await weightNow();
  check('E · Tam gün mevcut — hiç devamsızlık yazılmadı', w.count === 0, JSON.stringify(w));

  const schoolExitAuto = await exitLogs('school_exit');
  check('E · Okul çıkışında içeride kalan öğrenciye otomatik çıkış verildi',
    schoolExitAuto.length === 1, `${schoolExitAuto.length}`);

  // ---- SENARYO F: okul çıkış saati değiştirilirse -------------------------
  info('SENARYO F — okul çıkış saati 17:30 yapıldığında');
  await resetStudent();
  const cfg1730 = resolveAttendanceConfig({ ...config, schoolExitHour: '17:30' });

  await runAttendanceAutomation({ config: cfg1730, now: atToday('16:00'), onlyStudentIds: [TEST_STUDENT_ID] });
  w = await weightNow();
  check('F · 16:00 — çıkış saati 17:30 iken tam gün YAZILMADI', w.total === 0.5, JSON.stringify(w));

  await runAttendanceAutomation({ config: cfg1730, now: atToday('17:30'), onlyStudentIds: [TEST_STUDENT_ID] });
  w = await weightNow();
  check('F · 17:30 — ayarlanan çıkış saatinde TAM GÜN YOK yazıldı', w.total === 1, JSON.stringify(w));

  // ---- SENARYO G: raporlu öğrenciye otomatik yok yazılmaz ----------------
  info('SENARYO G — raporlu/izinli öğrenci');
  await resetStudent();
  await setDoc(doc(db, 'attendance', `zz_e2e_excuse_${dateKey}`), {
    studentId: TEST_STUDENT_ID,
    studentName: TEST_STUDENT.name,
    courseName: 'Tam Gün (Raporlu / İzinli)',
    status: 'excused',
    absenceWeight: 0,
    recordedBy: 'E2E Test',
    date: dateKey,
    timestamp: new Date()
  });

  await runAt('16:00');
  const excusedRecs = (await fetchDayAttendanceRecords(dateKey))[TEST_STUDENT_ID] || [];
  check('G · Raporlu öğrenciye otomatik devamsızlık YAZILMADI',
    !excusedRecs.some(r => r.autoGenerated), excusedRecs.map(r => r.courseName).join(' | '));
  await deleteDoc(doc(db, 'attendance', `zz_e2e_excuse_${dateKey}`)).catch(() => {});

  /* ---------------------------------------------------------------------- */
  section('TEMİZLİK');
  /* ---------------------------------------------------------------------- */

  await cleanup(dateKey);
  await releaseLock();
  const leftoverUser = await getDoc(doc(db, 'users', TEST_STUDENT_ID));
  const leftoverAttendance = await getDocs(query(collection(db, 'attendance'), where('studentId', '==', TEST_STUDENT_ID)));
  const leftoverRt = await get(ref(rtdb, `qr_system/gate_status/${TEST_STUDENT_ID}`));
  check('Test öğrencisi silindi', !leftoverUser.exists());
  check('Test devamsızlık kayıtları silindi', leftoverAttendance.size === 0, `${leftoverAttendance.size} kaldı`);
  check('Test RTDB kayıtları silindi', !leftoverRt.exists());

  /* ---------------------------------------------------------------------- */
  console.log('\n' + '─'.repeat(64));
  console.log(`\x1b[1mSONUÇ: ${passed} geçti, ${failed} kaldı\x1b[0m`);
  if (failures.length) {
    console.log('\n\x1b[31mBaşarısız kontroller:\x1b[0m');
    failures.forEach(f => console.log(`  • ${f}`));
  }
  console.log('─'.repeat(64));

  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\n\x1b[31mTest çöktü:\x1b[0m', err);
  try {
    await cleanup(getDateKeyInTimeZone(new Date(), 'Europe/Istanbul'));
    await remove(ref(rtdb, 'qr_system/zz_e2e_run_lock')).catch(() => {});
    console.log('Temizlik yapıldı, kilit bırakıldı.');
  } catch (e) { /* yok say */ }
  process.exit(1);
});
