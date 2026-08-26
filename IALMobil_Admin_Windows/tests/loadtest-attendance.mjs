/**
 * ============================================================================
 *  1000 ÖĞRENCİ YÜK TESTİ — GERÇEK ALTYAPI
 * ============================================================================
 *  Sahte veri tabanı yok. Gerçek Firestore + RTDB üzerinde:
 *
 *    1) N geçici öğrenci oluşturur ("zz-load-...")
 *    2) Peş peşe karekod okutmasını simüle eder (gerçek yazma yolu)
 *    3) Otomasyon turunu çalıştırıp SÜRESİNİ ölçer
 *    4) Doğruluğu kontrol eder: her öğrenciye doğru kayıt, mükerrer yok
 *    5) Her şeyi temizler
 *
 *  Otomasyon `onlyStudentIds` ile SADECE yük testi öğrencilerine kilitlenir;
 *  kurumun gerçek öğrencilerine dokunulmaz.
 *
 *  Kullanım:  node tests/run-loadtest.mjs [öğrenciSayısı]
 * ============================================================================
 */

import {
  collection, doc, setDoc, getDocs, deleteDoc, query, where, writeBatch
} from 'firebase/firestore';
import { ref, get, update, remove, runTransaction } from 'firebase/database';
import { db, rtdb } from '../src/services/firebaseConfig.js';
import {
  getDateKeyInTimeZone, getMinutesInTimeZone, minutesToTime, timeToMinutes,
  getAttendanceWindows, buildAutoAbsenceId
} from '../src/services/attendanceRules.js';
import {
  loadAttendanceConfig, runAttendanceAutomation, recordGatePassage,
  processStudentScan, fetchDayScans, fetchDayAttendanceRecords
} from '../src/services/attendanceService.js';

const N = Number(process.argv[2] || 1000);
const PREFIX = 'zz-load-';
const ids = Array.from({ length: N }, (_, i) => `${PREFIX}${String(i).padStart(4, '0')}`);

let pass = 0, fail = 0;
const failures = [];
const check = (label, ok, extra = '') => {
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(label + (extra ? ` — ${extra}` : '')); console.log(`  ✖ ${label}${extra ? ` — ${extra}` : ''}`); }
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
const info = (m) => console.log(`  · ${m}`);
const ms = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)} sn` : `${Math.round(n)} ms`;

/** Eş zamanlılık sınırlı paralel işleyici. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      try { results[i] = await fn(items[i], i); }
      catch (e) { results[i] = { __error: e?.message || String(e) }; }
    }
  });
  await Promise.all(workers);
  return results;
}

async function seedStudents(config, dateKey) {
  const t0 = performance.now();
  const CHUNK = 400; // Firestore batch üst sınırı 500
  let written = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    slice.forEach((id, k) => {
      batch.set(doc(db, 'users', id), {
        role: 'student',
        full_name: `__YÜK_TESTİ_${i + k}`,
        tc_kimlik: String(90000000000 + i + k),
        school_number: `LT-${i + k}`,
        class_id: String(9 + ((i + k) % 4)),
        status: 'approved',
        __loadTest: true
      });
    });
    await batch.commit();
    written += slice.length;
    process.stdout.write(`\r  · öğrenci oluşturuluyor: ${written}/${N}   `);
  }
  console.log('');
  return performance.now() - t0;
}

async function cleanupAll(dateKey) {
  const t0 = performance.now();

  const delDocs = async (colName, docIds) => {
    for (let i = 0; i < docIds.length; i += 400) {
      const batch = writeBatch(db);
      docIds.slice(i, i + 400).forEach(id => batch.delete(doc(db, colName, id)));
      // Hatalar yutulmaz: temizlik eksik kalırsa görünür olmalı.
      let attempt = 0;
      for (;;) {
        try { await batch.commit(); break; }
        catch (e) {
          if (++attempt >= 3) { console.warn(`  ! ${colName} silme hatası: ${e?.message}`); break; }
          await new Promise(r => setTimeout(r, 400 * attempt));
        }
      }
    }
  };

  /** Kalan varsa sorguyla toplayıp tekrar dener. */
  const sweep = async (colName) => {
    for (let round = 0; round < 3; round++) {
      let leftovers = [];
      try {
        const snap = await getDocs(query(collection(db, colName), where('date', '==', dateKey)));
        leftovers = snap.docs.filter(d => String(d.data().studentId || '').startsWith(PREFIX)).map(d => d.id);
      } catch (e) { break; }
      if (!leftovers.length) break;
      await delDocs(colName, leftovers);
    }
  };

  await delDocs('users', ids);
  await delDocs('gate_status', ids);
  await delDocs('attendance', ids.map(id => buildAutoAbsenceId(dateKey, id)));

  // Sorguyla kalanları topla (attendance_logs rastgele kimlikli)
  await sweep('attendance');
  await sweep('attendance_logs');

  // RTDB
  const rtdbUpdates = {};
  ids.forEach(id => { rtdbUpdates[`qr_system/gate_status/${id}`] = null; });
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = {};
    Object.keys(rtdbUpdates).slice(i, i + 500).forEach(k => { chunk[k] = null; });
    await update(ref(rtdb), chunk).catch(() => {});
  }

  try {
    const snap = await get(ref(rtdb, `qr_system/attendance_logs/${dateKey}`));
    if (snap.exists()) {
      const val = snap.val();
      const keys = Object.keys(val).filter(k => String(val[k]?.studentId || '').startsWith(PREFIX));
      for (let i = 0; i < keys.length; i += 500) {
        const chunk = {};
        keys.slice(i, i + 500).forEach(k => {
          chunk[`qr_system/attendance_logs/${dateKey}/${k}`] = null;
          chunk[`qr_system/live_scans/${k}`] = null;
        });
        await update(ref(rtdb), chunk).catch(() => {});
      }
    }
  } catch (e) { /* yok say */ }

  try {
    const snap = await get(ref(rtdb, 'qr_system/live_scans'));
    if (snap.exists()) {
      const val = snap.val();
      const keys = Object.keys(val).filter(k => String(val[k]?.studentId || '').startsWith(PREFIX));
      for (let i = 0; i < keys.length; i += 500) {
        const chunk = {};
        keys.slice(i, i + 500).forEach(k => { chunk[`qr_system/live_scans/${k}`] = null; });
        await update(ref(rtdb), chunk).catch(() => {});
      }
    }
  } catch (e) { /* yok say */ }

  return performance.now() - t0;
}

async function main() {
  console.log('\x1b[1m\x1b[36m╔════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log(`\x1b[1m\x1b[36m║  ${String(N).padStart(4)} ÖĞRENCİ YÜK TESTİ — GERÇEK FIREBASE            ║\x1b[0m`);
  console.log('\x1b[1m\x1b[36m╚════════════════════════════════════════════════════════════╝\x1b[0m');

  const config = await loadAttendanceConfig(true);
  const now = new Date();
  const dateKey = getDateKeyInTimeZone(now, config.timeZone);
  const w = getAttendanceWindows(config);
  const atToday = (hhmm) => new Date(`${dateKey}T${hhmm}:00+03:00`);

  info(`Gün: ${dateKey} · şu an ${minutesToTime(getMinutesInTimeZone(now, config.timeZone))}`);
  info(`Okul çıkışı: ${config.schoolExitHour} · yarım gün sınırı: ${config.halfDayCutoffHour}`);

  // Kirli kalıntı varsa temizle
  await cleanupAll(dateKey);

  /* ---------------------------------------------------------------- */
  section(`1) ${N} ÖĞRENCİ OLUŞTURULUYOR`);
  const seedMs = await seedStudents(config, dateKey);
  info(`süre: ${ms(seedMs)}`);
  const usersSnap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['student', 'öğrenci'])));
  const loadCount = usersSnap.docs.filter(d => d.id.startsWith(PREFIX)).length;
  check(`${N} öğrenci oluşturuldu`, loadCount === N, `${loadCount} bulundu`);
  info(`veritabanındaki TOPLAM öğrenci: ${usersSnap.size}`);

  /* ---------------------------------------------------------------- */
  section('2) PEŞ PEŞE KAREKOD OKUTMA (gerçek yazma yolu)');
  const SCAN_COUNT = Math.min(N, 200);
  const CONCURRENCY = 25;
  info(`${SCAN_COUNT} öğrenci ${CONCURRENCY} eş zamanlı istekle sabah girişi yapıyor...`);

  const scanT0 = performance.now();
  const scanResults = await mapLimit(ids.slice(0, SCAN_COUNT), CONCURRENCY, async (id, i) =>
    recordGatePassage({
      student: { id, name: `__YÜK_TESTİ_${i}`, tc: String(90000000000 + i) },
      action: 'entry', method: 'qr', session: 'morning',
      config, notifyParent: false, now: atToday('09:02')
    })
  );
  const scanMs = performance.now() - scanT0;
  const scanErrors = scanResults.filter(r => r?.__error || r?.ok === false);
  info(`süre: ${ms(scanMs)}  ·  okutma başına ${ms(scanMs / SCAN_COUNT)}  ·  ${(SCAN_COUNT / (scanMs / 1000)).toFixed(1)} okutma/sn`);
  check('Tüm okutmalar hatasız kaydedildi', scanErrors.length === 0, `${scanErrors.length} hata`);

  const scans = await fetchDayScans(dateKey, config);
  const scannedOk = ids.slice(0, SCAN_COUNT).filter(id => (scans[id] || []).length > 0).length;
  check(`${SCAN_COUNT} okutmanın hepsi geri okunabiliyor`, scannedOk === SCAN_COUNT, `${scannedOk}/${SCAN_COUNT}`);

  const dupes = ids.slice(0, SCAN_COUNT).filter(id => (scans[id] || []).filter(s => s.action === 'entry').length > 1);
  check('Tekilleştirme çalışıyor (çift giriş yok)', dupes.length === 0, `${dupes.length} öğrencide çift kayıt`);

  /* ---------------------------------------------------------------- */
  section('3) OTOMASYON TURU — 12:00 (yarım gün eşiği)');
  const t12 = performance.now();
  const run12 = await runAttendanceAutomation({ config, now: atToday('12:00'), onlyStudentIds: ids });
  const ms12 = performance.now() - t12;
  info(`süre: ${ms(ms12)}  ·  öğrenci başına ${ms(ms12 / N)}`);
  info(`işlenen ${run12.studentsProcessed} · yazılan ${run12.absencesWritten} · çıkış ${run12.autoExits} · hata ${run12.errors.length}`);
  check('12:00 turu hatasız', run12.errors.length === 0, run12.errors.slice(0, 3).join(' | '));
  check(`Tüm ${N} öğrenci işlendi`, run12.studentsProcessed === N, `${run12.studentsProcessed}`);
  check(`Okutmayan ${N - SCAN_COUNT} öğrenciye yarım gün yazıldı`,
    run12.absencesWritten === N - SCAN_COUNT, `${run12.absencesWritten} yazıldı`);
  check('60 sn içinde bitti (cron aralığı)', ms12 < 60_000, ms(ms12));

  /* ---------------------------------------------------------------- */
  section('4) OTOMASYON TURU — OKUL ÇIKIŞI (tam güne yükseltme)');
  const tEx = performance.now();
  const runEx = await runAttendanceAutomation({ config, now: atToday(config.schoolExitHour), onlyStudentIds: ids });
  const msEx = performance.now() - tEx;
  info(`süre: ${ms(msEx)}`);
  info(`yazılan ${runEx.absencesWritten} · kaldırılan ${runEx.absencesRemoved} · çıkış ${runEx.autoExits} · hata ${runEx.errors.length}`);
  check('Okul çıkışı turu hatasız', runEx.errors.length === 0, runEx.errors.slice(0, 3).join(' | '));
  check('60 sn içinde bitti', msEx < 60_000, ms(msEx));

  /* ---------------------------------------------------------------- */
  section('5) DOĞRULUK KONTROLÜ');
  const records = await fetchDayAttendanceRecords(dateKey, atToday(config.schoolExitHour));

  let fullDay = 0, halfDay = 0, missing = 0, duplicated = 0, wrong = 0;
  ids.forEach((id, i) => {
    const recs = (records[id] || []).filter(r => r.autoGenerated);
    if (recs.length > 1) duplicated++;
    if (recs.length === 0) { missing++; return; }
    const r = recs[0];
    const scanned = i < SCAN_COUNT;
    if (scanned) {
      // sabah geldi, öğleden sonra gelmedi -> yarım gün (öğleden sonra)
      if (r.absenceWeight === 0.5 && r.courseName.includes('Öğleden Sonra')) halfDay++;
      else wrong++;
    } else {
      // hiç gelmedi -> tam gün
      if (r.absenceWeight === 1 && r.courseName === 'Tam Gün Yok (Özürsüz)') fullDay++;
      else wrong++;
    }
  });

  info(`tam gün: ${fullDay} · yarım gün: ${halfDay} · eksik: ${missing} · yanlış: ${wrong} · mükerrer: ${duplicated}`);
  check(`Okutmayan ${N - SCAN_COUNT} öğrenci TAM GÜN YOK`, fullDay === N - SCAN_COUNT, `${fullDay}`);
  check(`Sabah okutan ${SCAN_COUNT} öğrenci YARIM GÜN YOK`, halfDay === SCAN_COUNT, `${halfDay}`);
  check('Hiç mükerrer kayıt yok', duplicated === 0, `${duplicated} öğrenci`);
  check('Hiç yanlış etiket yok', wrong === 0, `${wrong} öğrenci`);
  check('Hiç eksik kayıt yok', missing === 0, `${missing} öğrenci`);

  /* ---------------------------------------------------------------- */
  section('6) İDEMPOTANSLIK — tur tekrar çalıştırılıyor');
  const tRe = performance.now();
  const runRe = await runAttendanceAutomation({ config, now: atToday(config.schoolExitHour), onlyStudentIds: ids });
  const msRe = performance.now() - tRe;
  info(`süre: ${ms(msRe)} · yazılan ${runRe.absencesWritten} · kaldırılan ${runRe.absencesRemoved}`);
  check('Tekrar turda HİÇ yazma olmadı', runRe.absencesWritten === 0, `${runRe.absencesWritten} yazıldı`);
  check('Tekrar tur belirgin şekilde daha hızlı', msRe < msEx, `${ms(msRe)} vs ${ms(msEx)}`);

  const after = await fetchDayAttendanceRecords(dateKey, atToday(config.schoolExitHour));
  const totalAfter = ids.reduce((a, id) => a + (after[id] || []).filter(r => r.autoGenerated).length, 0);
  check(`Toplam kayıt hâlâ ${N}`, totalAfter === N, `${totalAfter}`);

  /* ---------------------------------------------------------------- */
  section('7) TEMİZLİK');
  const cleanMs = await cleanupAll(dateKey);
  info(`süre: ${ms(cleanMs)}`);
  const leftUsers = await getDocs(query(collection(db, 'users'), where('role', 'in', ['student', 'öğrenci'])));
  const leftCount = leftUsers.docs.filter(d => d.id.startsWith(PREFIX)).length;
  check('Yük testi öğrencileri silindi', leftCount === 0, `${leftCount} kaldı`);
  const leftRecs = await fetchDayAttendanceRecords(dateKey, now);
  const leftAbs = Object.keys(leftRecs).filter(k => k.startsWith(PREFIX)).length;
  check('Yük testi devamsızlıkları silindi', leftAbs === 0, `${leftAbs} kaldı`);

  /* ---------------------------------------------------------------- */
  console.log('\n' + '═'.repeat(62));
  console.log('\x1b[1mPERFORMANS ÖZETİ\x1b[0m');
  console.log(`  ${N} öğrenci oluşturma      : ${ms(seedMs)}`);
  console.log(`  ${SCAN_COUNT} eş zamanlı okutma    : ${ms(scanMs)}  (${(SCAN_COUNT / (scanMs / 1000)).toFixed(1)}/sn)`);
  console.log(`  12:00 otomasyon turu       : ${ms(ms12)}`);
  console.log(`  Okul çıkışı turu           : ${ms(msEx)}`);
  console.log(`  Tekrar tur (idempotent)    : ${ms(msRe)}`);
  console.log(`  Temizlik                   : ${ms(cleanMs)}`);
  console.log('═'.repeat(62));
  console.log(`\x1b[1mSONUÇ: ${pass} geçti, ${fail} kaldı\x1b[0m`);
  if (failures.length) { console.log('\n\x1b[31mBaşarısız:\x1b[0m'); failures.forEach(f => console.log('  • ' + f)); }
  console.log('═'.repeat(62));
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\n\x1b[31mYük testi çöktü:\x1b[0m', err);
  try {
    const cfg = await loadAttendanceConfig();
    await cleanupAll(getDateKeyInTimeZone(new Date(), cfg.timeZone));
    console.log('Temizlik yapıldı.');
  } catch (e) { console.error('Temizlik başarısız:', e?.message); }
  process.exit(1);
});
