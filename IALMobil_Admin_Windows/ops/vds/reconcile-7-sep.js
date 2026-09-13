/*
 * Read-only source + additive reconciliation for 2026-09-07.
 * It never updates/deletes devamsizlik or gecisler rows.
 */
const ROOT = process.env.VDS_ROOT || '/usr/src/app';
const fs = require('fs');
require(`${ROOT}/node_modules/dotenv`).config({ path: `${ROOT}/.env` });
const { hepsi, islem } = require(`${ROOT}/db`);
const yoklama = require(`${ROOT}/yoklama`);

const DATE = '2026-09-07';

const main = async () => {
  const cfg = await yoklama.ayarlariAl();
  const people = await hepsi(`
    SELECT o.kisi_id
      FROM ogrenciler o
      JOIN kisiler k ON k.id = o.kisi_id
     WHERE k.aktif
     ORDER BY o.kisi_id`);

  const resolutions = [];
  for (const person of people) {
    const result = await yoklama.gunuHesapla(person.kisi_id, DATE, cfg);
    const sessions = [
      ['sabah', result.oturumBilgi?.sabah],
      ['ogleden_sonra', result.oturumBilgi?.ogleden_sonra],
    ];
    for (const [oturum, info] of sessions) {
      const present = Boolean(info?.kazandi);
      const late = Boolean(info?.gec);
      resolutions.push({
        kisiId: person.kisi_id,
        oturum,
        durum: present ? (late ? 'gec' : 'var') : 'yok',
        agirlik: present ? 0 : 0.5,
        sebep: present
          ? (late ? `Manuel uzlaştırma: ${oturum} geçişi geç.` : `Manuel uzlaştırma: ${oturum} geçişi mevcut.`)
          : `Manuel uzlaştırma: ${oturum} geçişi bulunamadı.`,
      });
    }
  }

  const beforeRaw = await hepsi(
    `SELECT durum, agirlik, count(*)::int AS count
       FROM devamsizlik WHERE tarih = $1::date
      GROUP BY durum, agirlik ORDER BY durum, agirlik`, [DATE]);
  const beforeReconciliation = await hepsi(
    `SELECT count(*)::int AS count, count(DISTINCT kisi_id)::int AS students
       FROM yoklama_uzlastirma WHERE tarih = $1::date`, [DATE]);

  const inserted = await islem(async (client) => {
    let count = 0;
    for (const row of resolutions) {
      const result = await client.query(`
        INSERT INTO yoklama_uzlastirma
          (kisi_id, tarih, oturum, durum, agirlik, sebep, kaynak, kilitli)
        VALUES ($1,$2::date,$3,$4,$5,$6,'manuel_uzlastirma',true)
        ON CONFLICT (kisi_id, tarih, oturum) DO NOTHING`,
        [row.kisiId, DATE, row.oturum, row.durum, row.agirlik, row.sebep]);
      count += result.rowCount;
    }
    return count;
  });

  const raw = await hepsi(
    `SELECT durum, agirlik, count(*)::int AS count
       FROM devamsizlik WHERE tarih = $1::date
      GROUP BY durum, agirlik ORDER BY durum, agirlik`, [DATE]);
  const resolved = await hepsi(
    `SELECT durum, agirlik, count(*)::int AS count
       FROM yoklama_uzlastirma WHERE tarih = $1::date
      GROUP BY durum, agirlik ORDER BY durum, agirlik`, [DATE]);

  const afterReconciliation = await hepsi(
    `SELECT count(*)::int AS count, count(DISTINCT kisi_id)::int AS students
       FROM yoklama_uzlastirma WHERE tarih = $1::date`, [DATE]);
  const report = {
    date: DATE,
    rawBackup: '/opt/ial-backend/_arsiv/codex-20260907-pre-reconcile.sql',
    rules: { source: 'manuel_uzlastirma', locked: true, automationStarts: '2026-09-08' },
    students: people.length,
    planned: resolutions.length,
    inserted,
    before: { raw: beforeRaw, reconciliation: beforeReconciliation[0] },
    after: { raw, reconciliation: afterReconciliation[0] },
    diff: {
      rawTablesWritten: false,
      rawSummaryUnchanged: JSON.stringify(beforeRaw) === JSON.stringify(raw),
      reconciliationRowsAdded: inserted,
    },
    resolved,
  };
  const reportPath = `${ROOT}/_arsiv/codex-20260907-reconcile-report.json`;
  fs.mkdirSync(`${ROOT}/_arsiv`, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, reportPath }));
};

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
