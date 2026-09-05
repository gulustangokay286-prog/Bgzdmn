/**
 * Canlı QR sayfasındaki toplu geçiş engellerini gevşetir.
 *
 * Neden: 200 kişi AYNI karekodu okutacak. Mevcut kod karekodu "tek kullanımlık"
 * sayıyor; ilk kişiden sonraki herkes engelleniyor. Ayrıca ödünç telefon ve
 * yanlış gizli-sekme tespiti de kapıda insan bırakıyor.
 *
 * Ne yapar (5 değişiklik):
 *   1. consumed_nonces   -> anahtar karekod başına değil, KİŞİ+karekod başına
 *   2. used_qr_sessions  -> aynı şekilde kişi başına
 *   3. incognito skoru   -> ikinci gizli sekme kapısı devre dışı
 *   4. device_locks      -> cihaz mühürleme devre dışı (ödünç telefon)
 *   5. bound_user_tc     -> cihaz-TC bağlama devre dışı
 *
 * Korunanlar: karekod tazeliği, dönen nonce listesi, kişinin AYNI karekodu
 * iki kez okutamaması.
 *
 * Kullanım:
 *   node _eklenecek/qr-gevset.mjs          # yamalar
 *   node _eklenecek/qr-gevset.mjs --geri   # yedekten geri alır
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';

const FILE = 'out/_next/static/chunks/2he_6cwcdv_ao.js';
const BAK = `${FILE}.orijinal`;

if (process.argv.includes('--geri')) {
  if (!existsSync(BAK)) { console.error('Yedek yok:', BAK); process.exit(1); }
  copyFileSync(BAK, FILE);
  console.log('Geri alındı.');
  process.exit(0);
}

if (!existsSync(BAK)) copyFileSync(FILE, BAK);
let s = readFileSync(FILE, 'utf8');
const done = [], missed = [];

const sub = (old, neu, label) => {
  if (s.includes(old)) { s = s.replace(old, neu); done.push(label); }
  else missed.push(label);
};

sub('(0,s.doc)(d.db,"consumed_nonces",r);if((await (0,o.getDoc)(t)).exists())return void S("Bu karekod daha önce okutulmuş. Aynı karekod birden fazla kişi tarafından paylaşılamaz.")',
    '(0,s.doc)(d.db,"consumed_nonces",r+"_"+e.id);if((await (0,o.getDoc)(t)).exists())return void S("Bu karekodu zaten okuttunuz. Lütfen ekrandaki güncel karekodu okutun.")',
    'consumed_nonces kişi başına');

sub('(0,s.doc)(d.db,"used_qr_sessions",r)',
    '(0,s.doc)(d.db,"used_qr_sessions",r+"_"+e.id)',
    'used_qr_sessions kişi başına');

sub('if(R<=50){S("Gizli sekme (incognito',
    'if(!1){S("Gizli sekme (incognito',
    'gizli sekme skor kapısı');

sub('if(t.ownerId!==e.id){S("Güvenlik İhlali: Bu cihaz bugün başka bir öğrenci adına kullanılmış. Cihazınız mühürlenmiştir.")',
    'if(!1){S("Güvenlik İhlali: Bu cihaz bugün başka bir öğrenci adına kullanılmış. Cihazınız mühürlenmiştir.")',
    'cihaz mühürleme');

sub('if(n&&e.tc&&(t=e.tc,n&&t&&String(n).trim()!==String(t).trim()))return void S("Güvenlik Uyarısı: Bu cihaz başka bir kullanıcıya bağlanmıştır.',
    'if(!1)return void S("Güvenlik Uyarısı: Bu cihaz başka bir kullanıcıya bağlanmıştır.',
    'cihaz-TC bağlama');

writeFileSync(FILE, s);
done.forEach(d => console.log('  ✓', d));
missed.forEach(m => console.log('  ✗ bulunamadı:', m));
console.log(`\nYedek: ${BAK}`);
console.log('Sonra:  npx firebase-tools deploy --only hosting --project bgz-mobil');
