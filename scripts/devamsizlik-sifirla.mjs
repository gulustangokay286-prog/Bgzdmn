/**
 * Devamsızlık sıfırlama — TEK SEFERLİK, GERİ ALINAMAZ.
 *
 * Siler:
 *   - Firestore `attendance`            (tüm devamsızlık kayıtları)
 *   - RTDB qr_system/gate_status        (kim içeride/dışarıda durumu)
 *   - RTDB qr_system/live_scans         (canlı akış tamponu)
 *   - RTDB qr_system/attendance_logs    (geçiş geçmişi — --gecmisi-koru ile atlanır)
 *
 * Kullanım:
 *   node scripts/devamsizlik-sifirla.mjs --yedek <klasör> [--gecmisi-koru]
 */
const KEY = 'AIzaSyBweBGe__mv1KYPI4PmUjtXY562mjiosbU';
const PROJECT = 'bgz-mobil';
const RTDB = 'https://bgz-mobil-default-rtdb.firebaseio.com';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const args = process.argv.slice(2);
const keepHistory = args.includes('--gecmisi-koru');
const backupDir = args[args.indexOf('--yedek') + 1];

if (!backupDir || backupDir.startsWith('--')) {
  console.error('HATA: --yedek <klasör> zorunlu. Yedek almadan silme yapılmaz.');
  process.exit(1);
}

const { existsSync } = await import('node:fs');
if (!existsSync(`${backupDir}/attendance.json`)) {
  console.error(`HATA: ${backupDir}/attendance.json bulunamadı. Önce yedek alın.`);
  process.exit(1);
}

const q = async (body) => {
  const r = await fetch(`${FS}:runQuery?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Firestore sorgu hatası: HTTP ${r.status}`);
  return r.json();
};

console.log('1/2  Firestore `attendance` temizleniyor…');
const rows = await q({ structuredQuery: { from: [{ collectionId: 'attendance' }], limit: 5000 } });
const names = rows.filter(r => r.document).map(r => r.document.name);
console.log(`     ${names.length} kayıt bulundu`);

let done = 0;
for (let i = 0; i < names.length; i += 400) {
  const chunk = names.slice(i, i + 400);
  const res = await fetch(`${FS}:commit?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: chunk.map(name => ({ delete: name })) })
  });
  if (!res.ok) {
    console.error(`     HATA (parça ${i / 400 + 1}): HTTP ${res.status} — ${await res.text()}`);
    process.exit(1);
  }
  done += chunk.length;
  console.log(`     ${done}/${names.length} silindi`);
}

console.log('2/2  RTDB yolları temizleniyor…');
const paths = ['qr_system/gate_status', 'qr_system/live_scans'];
if (!keepHistory) paths.push('qr_system/attendance_logs');

for (const p of paths) {
  const res = await fetch(`${RTDB}/${p}.json`, { method: 'DELETE' });
  console.log(`     ${p} -> ${res.ok ? 'silindi' : `HATA HTTP ${res.status}`}`);
}

console.log(`\nTamamlandı. Yedek: ${backupDir}`);
if (keepHistory) console.log('Geçiş geçmişi (attendance_logs) korundu.');
