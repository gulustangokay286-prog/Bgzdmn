// Runs inside ial-api. No gate, attendance-write, SMS, or credit endpoint calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const root = process.cwd();
const db = require(root + '/db');
const yoklama = require(root + '/yoklama');
const createReport = require(process.env.REPORT_MODULE || root + '/services/attendanceReport.cjs');
const report = createReport({ hepsi: db.hepsi, yoklama });
const mode = process.argv[2] || 'verify';
const snapshot = '/tmp/attendance-20260907-fingerprints.json';
(async () => {
  const fingerprints = {};
  for (const table of ['devamsizlik', 'gecisler', 'yoklama_uzlastirma']) {
    fingerprints[table] = await db.tek(`SELECT count(*)::int AS count,
      md5(string_agg(row_to_json(t)::text, '' ORDER BY t.id)) AS hash
      FROM ${table} t WHERE tarih='2026-09-07'`);
  }
  if (mode === 'before') fs.writeFileSync(snapshot, JSON.stringify(fingerprints));
  if (mode === 'after') assert.deepEqual(fingerprints, JSON.parse(fs.readFileSync(snapshot)));
  const admin = await db.tek("SELECT * FROM api_users WHERE 'idare'=ANY(roles) LIMIT 1");
  assert.ok(admin);
  const token = require(root + '/kimlik').jetonUret(admin);
  const get = async path => {
    const response = await fetch('http://127.0.0.1:8080' + path, { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(response.status, 200);
    return response.json();
  };
  const oldDaily = await get('/api/yoklama/gunluk-rapor?tarih=2026-09-07');
  const daily = await report.dailyReport('2026-09-07');
  let nonzero = 0, sum = 0, mismatches = 0;
  const students = daily.kayitlar.filter(r => r.rol === 'ogrenci');
  for (const row of students) {
    const old = oldDaily.kayitlar.find(r => String(r.kisi_id) === String(row.kisi_id));
    assert.ok(old);
    assert.equal(row.durum, old.durum);
    assert.equal(Number(row.agirlik), Number(old.agirlik));
    const h = mode === 'after'
      ? await get('/api/yoklama/gecmis/usr_' + row.kisi_id)
      : await report.history(row.kisi_id);
    const historical = h.kayitlar.find(r => r.tarih === '2026-09-07');
    assert.ok(historical);
    assert.equal(historical.durum, row.durum);
    assert.equal(Number(historical.agirlik), Number(row.agirlik));
    assert.equal(historical.kilitli, true);
    assert.equal(new Set(h.kayitlar.map(r => r.tarih)).size, h.kayitlar.length);
    if (row.gecis_sayisi > 0 && Number(row.agirlik) >= 1) mismatches++;
    if (row.durum === 'yok') { sum += Number(row.agirlik); if (Number(row.agirlik) > 0) nonzero++; }
  }
  assert.equal(mismatches, 0);
  const lock = fs.readFileSync(root + '/services/netgsmService.js', 'utf8');
  assert.match(lock, /const SMS_GONDERIM_ACIK = false/);
  assert.notEqual(process.env.SMS_GONDERIM_ACIK, 'evet');
  console.log(JSON.stringify({ mode, checkedStudents: students.length, nonzeroStudents: nonzero,
    absenceDays: sum, presentButFullDayAbsent: mismatches,
    rawFingerprints: fingerprints, rawUnchanged: mode === 'after', smsHardLock: true }, null, 2));
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.havuz.end());
