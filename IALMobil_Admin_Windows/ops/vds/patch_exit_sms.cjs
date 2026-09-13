/* Otomatik cikislarda veliye SMS. Hicbir mesaj GONDERMEZ; sadece kodu baglar. */
const fs = require('fs');
const ROOT = process.env.IAL_ROOT || '/opt/ial-backend';
const log = (m) => console.log('  ' + m);

/* ---------- 1) server.js: veliyeBildir'i ortak module tasi ---------- */
let srv = fs.readFileSync(ROOT + '/server.js', 'utf8');
if (srv.includes("require('./services/veliBildirim')") || srv.includes('require("./services/veliBildirim")')) {
    log('server.js zaten tasinmis, atlandi');
} else {
    const cmt = '/**\n * Gecis sonrasi veliye SMS.';
    const cs = srv.indexOf(cmt);
    const fs_ = srv.indexOf('async function veliyeBildir(kisi, karar) {');
    if (cs < 0 || fs_ < 0) throw new Error('server.js: veliyeBildir bulunamadi');
    const end = srv.indexOf('\n}\n', fs_);
    if (end < 0) throw new Error('server.js: fonksiyon sonu bulunamadi');
    const yeni = '/**\n * Gecis sonrasi veliye SMS. Ortak modul: karekod/manuel gecis ve otomatik\n'
        + ' * cikislar (otomasyon.js) ayni bildirim yolunu kullanir.\n */\n'
        + "const { veliyeBildir } = require('./services/veliBildirim');\n";
    srv = srv.slice(0, cs) + yeni + srv.slice(end + 3);
    fs.writeFileSync(ROOT + '/server.js', srv);
    log('server.js: veliyeBildir -> services/veliBildirim.js');
}

/* ---------- 2) otomasyon.js: otomatik cikislarda bildirim ---------- */
let oto = fs.readFileSync(ROOT + '/otomasyon.js', 'utf8');

if (!oto.includes("require('./services/veliBildirim')")) {
    const anchor = "const smsAudit = require('./services/smsAudit');";
    if (!oto.includes(anchor)) throw new Error('otomasyon.js: require capasi bulunamadi');
    oto = oto.replace(anchor, anchor + "\nconst veliBildirim = require('./services/veliBildirim');");
    log('otomasyon.js: veliBildirim require eklendi');
}

if (!oto.includes('async function otomatikCikisBildir')) {
    const anchor = 'async function topluCikis(gun, dakika, not) {';
    const helper = `/**
 * OTOMATIK CIKISTA VELIYE SMS.
 * Ogretmen/personel modul icinde elenir (yalnizca ogrenci velisi bilgilendirilir).
 * Gonderim ayrica NetGSM tarafindaki SMS_GONDERIM_ACIK kilidinden gecer.
 * Bildirim hatasi cikis yazimini asla bozmaz.
 */
async function otomatikCikisBildir(kisiId, dakika) {
    try {
        const kisi = await tek('SELECT * FROM api_users WHERE kisi_id = $1', [kisiId]);
        if (!kisi) return;
        const s = String(Math.floor(dakika / 60)).padStart(2, '0');
        const d = String(dakika % 60).padStart(2, '0');
        await veliBildirim.veliyeBildir(kisi, {
            yon: 'cikis', gec: false, saat: \`\${s}:\${d}\`, gecikme_dk: 0,
        });
    } catch (e) {
        console.error('[OTOMASYON] cikis SMS bildirimi', kisiId, e.message);
    }
}

`;
    oto = oto.replace(anchor, helper + anchor);
    log('otomasyon.js: otomatikCikisBildir yardimcisi eklendi');
}

/* Normal gun: ogle + gun sonu cikislari */
const n1 = `            await cikisYaz(k.kisi_id, gun, dakika, not);
            await yoklama.devamsizligiYaz(k.kisi_id, gun);`;
if (oto.includes(n1) && !oto.includes('otomatikCikisBildir(k.kisi_id')) {
    oto = oto.replace(n1, n1 + '\n            await otomatikCikisBildir(k.kisi_id, dakika);');
    log('otomasyon.js: topluCikis (ogle + gun sonu) bildirimi baglandi');
}

/* Deneme gunu cikisi */
const n2 = `            await cikisYaz(row.kisi_id, gun, dakika, not);
            await yoklama.devamsizligiYaz(row.kisi_id, gun, cfg);`;
if (oto.includes(n2) && !oto.includes('otomatikCikisBildir(row.kisi_id')) {
    oto = oto.replace(n2, n2 + '\n            await otomatikCikisBildir(row.kisi_id, dakika);');
    log('otomasyon.js: denemeTopluCikis (13:15) bildirimi baglandi');
}

fs.writeFileSync(ROOT + '/otomasyon.js', oto);
console.log('YAMA TAMAM — hicbir SMS gonderilmedi.');
