/* ============================================================================
   18 EYLUL 2026 CUMA — 12:10 OGLE CIKISI (tek seferlik)

   Cuma ogle arasi 12:10-13:30 kurali bugun ogleden sonra devreye alindi;
   otomasyon 13:10'u bekliyordu. Iceride gorunen herkes 12:10'da otomatik
   cikarilir, velilere normal cikis SMS'i (saat 12:10) gider ve
   ogle_cikis_<id> isareti yazilir ki otomasyon ayni kisiyi tekrar cikarmasin.

   Varsayilan KURU CALISMA: yalnizca listeyi ve mesaj taslagini basar.
       node cuma_ogle_cikis_20260918.cjs            -> taslak
       node cuma_ogle_cikis_20260918.cjs --gonder   -> cikis yaz + SMS
   ========================================================================== */
const { hepsi, tek, sorgu, havuz } = require('./db');
const yoklama = require('./yoklama');
const veliBildirim = require('./services/veliBildirim');
const netgsm = require('./services/netgsmService');
const denemeGunleri = require('./denemeGunleri.live.cjs');

const GUN = '2026-09-18';
const DAKIKA = 12 * 60 + 10;
const SAAT = '12:10';
const NOT = 'Öğle çıkışı — otomatik (Cuma 12:10)';
const GONDER = process.argv.includes('--gonder');

async function isaretleriOku(gun) {
    const r = await tek(`SELECT deger FROM ayarlar WHERE anahtar = 'otomasyon'`);
    let d = r?.deger || {};
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
    return Array.isArray(d[gun]) ? d[gun] : [];
}

async function isaretleriYaz(gun, yeni) {
    const set = new Set(await isaretleriOku(gun));
    for (const g of yeni) set.add(g);
    await sorgu(
        `INSERT INTO ayarlar (anahtar, deger) VALUES ('otomasyon', $1)
         ON CONFLICT (anahtar) DO UPDATE SET deger = $1, guncellendi = now()`,
        [JSON.stringify({ [gun]: Array.from(set) })]);
}

(async () => {
    const cfg = await yoklama.ayarlariAl(true);
    const gunCfg = denemeGunleri.gunSaatleriUygula(cfg, GUN);
    console.log('Gun saat kurali:', gunCfg.gunSaatKurali ? gunCfg.gunSaatKurali.ad : 'YOK',
        '| ogleCikis', gunCfg.ogleCikis, '| ogledenSonraGiris', gunCfg.ogledenSonraGiris);

    const iceride = await hepsi(
        `SELECT kd.kisi_id, u.full_name, u.role, u.class_info FROM kapi_durumu kd
           JOIN api_users u ON u.kisi_id = kd.kisi_id
          WHERE kd.yon = 'giris' AND kd.tarih = $1::date
          ORDER BY u.role, u.full_name`, [GUN]);
    /* Isaret filtresi YOK: dagitimdan once otomasyon karismasin diye
       ogle_cikis_<id> isaretleri onceden yazildi; cikis burada yazilir. */
    const hedef = iceride;

    const ogrenciler = hedef.filter((k) => k.role === 'ogrenci');
    const digerleri = hedef.filter((k) => k.role !== 'ogrenci');
    console.log(`Iceride: ${iceride.length} kisi | islenecek: ${hedef.length} (ogrenci ${ogrenciler.length}, personel ${digerleri.length})`);

    const veliler = await hepsi(
        `SELECT vo.ogrenci_id, k.tam_ad AS veli,
                COALESCE(NULLIF(btrim(k.telefon::text), ''),
                         (SELECT btrim(kt.telefon::text) FROM kisi_telefonlari kt
                           WHERE kt.kisi_id = k.id AND NULLIF(btrim(kt.telefon::text), '') IS NOT NULL
                           ORDER BY kt.telefon LIMIT 1)) AS telefon
           FROM veli_ogrenci vo JOIN kisiler k ON k.id = vo.veli_id
          WHERE vo.ogrenci_id = ANY($1::int[])`, [ogrenciler.map((o) => o.kisi_id)]);
    const telefonlu = new Set(veliler.filter((v) => v.telefon).map((v) => String(v.telefon)));
    const telefonsuz = ogrenciler.filter((o) => !veliler.some((v) => v.ogrenci_id === o.kisi_id && v.telefon));

    console.log(`SMS: ${veliler.filter((v) => v.telefon).length} veli kaydi, ${telefonlu.size} farkli telefon; telefonu olmayan ogrenci: ${telefonsuz.length}`);
    for (const o of telefonsuz) console.log('  telefonsuz:', o.kisi_id, o.full_name, o.class_info || '');
    console.log('\n--- MESAJ TASLAGI (ornek) ---');
    console.log(netgsm.veliMesajMetni('cikis', { ad: ogrenciler[0]?.full_name || 'Ad Soyad', zaman: SAAT }));
    console.log('-----------------------------\n');
    console.log('Ogrenciler:');
    for (const o of ogrenciler) console.log(' ', o.kisi_id, o.full_name, '|', o.class_info || '');
    console.log('Personel (SMS yok):');
    for (const o of digerleri) console.log(' ', o.kisi_id, o.full_name, '|', o.role);

    if (!GONDER) { console.log('\nKURU CALISMA — hicbir sey yazilmadi. Gondermek icin --gonder.'); await havuz.end(); return; }

    let cikis = 0, sms = 0;
    const yeniIsaretler = [];
    for (const k of hedef) {
        try {
            await sorgu(
                `INSERT INTO gecisler (kisi_id, yon, kaynak, zaman, not_)
                 VALUES ($1, 'cikis', 'otomatik',
                         (($2::date || ' ' || $3::text)::timestamp AT TIME ZONE 'Europe/Istanbul'), $4)`,
                [k.kisi_id, GUN, SAAT, NOT]);
            cikis++;
            await yoklama.devamsizligiYaz(k.kisi_id, GUN, cfg);
            if (k.role === 'ogrenci') {
                const kisi = await tek('SELECT * FROM api_users WHERE kisi_id = $1', [k.kisi_id]);
                await veliBildirim.veliyeBildir(kisi, {
                    yon: 'cikis', gec: false, saat: SAAT, gecikme_dk: 0, tarih: GUN,
                });
                sms++;
            }
            yeniIsaretler.push(`ogle_cikis_${k.kisi_id}`);
        } catch (e) {
            console.error('HATA', k.kisi_id, k.full_name, e.message);
        }
    }
    await isaretleriYaz(GUN, yeniIsaretler);
    const audit = await tek(
        `SELECT count(*) FILTER (WHERE status = 'sent') AS gonderilen, count(*) AS toplam
           FROM sms_audit WHERE created_at >= now() - interval '10 minutes' AND body LIKE '%12:10%'`);
    console.log(`\nTAMAM: ${cikis} cikis yazildi, ${sms} ogrenci icin veli bildirimi calisti, `
        + `${yeniIsaretler.length} isaret. sms_audit (son 10 dk, 12:10): ${audit.gonderilen}/${audit.toplam}`);
    await havuz.end();
})().catch((e) => { console.error(e); process.exit(1); });
