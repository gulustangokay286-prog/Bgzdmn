/**
 * VELIYE GECIS BILDIRIMI — TEK KAYNAK.
 *
 * Hem karekod/manuel gecis (server.js) hem de otomatik cikislar (otomasyon.js)
 * bu modulu kullanir. Boylece veli telefonu cozumleme, mesaj metni ve audit
 * kaydi tek yerde tutulur; otomatik cikista veli bilgisiz kalmaz.
 *
 * Gonderim NetGSM tarafinda ayrica SMS_GONDERIM_ACIK kilidinden gecer.
 */
const { hepsi, tek } = require('../db');
const netgsmService = require('./netgsmService');
const smsAudit = require('./smsAudit');
const denemeGunleri = require('../denemeGunleri.live.cjs');

const gunAnahtari = (value = new Date()) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(value instanceof Date ? value : new Date(value));

async function smsPolitikasi(kisi, karar) {
    const row = await tek(`SELECT deger FROM ayarlar WHERE anahtar = 'institution'`);
    let cfg = row?.deger || {};
    if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch { cfg = {}; } }
    const tarih = karar?.tarih || gunAnahtari();
    return denemeGunleri.resolveForPerson(cfg, tarih, kisi);
}

async function veliyeBildir(kisi, karar) {
    const ogrenciMi = (kisi.roles || [kisi.role]).some((r) => String(r).toLowerCase() === 'ogrenci');
    if (!ogrenciMi) return;

    const veliler = await hepsi(
        `SELECT DISTINCT kv.id AS veli_id, kv.tam_ad AS veli_ad, phones.telefon
           FROM veli_ogrenci v
           JOIN kisiler kv ON kv.id = v.veli_id
      LEFT JOIN LATERAL (
             SELECT candidate.telefon
               FROM (
                 SELECT NULLIF(btrim(kv.telefon::text), '') AS telefon
                 UNION
                 SELECT btrim(kt.telefon::text) AS telefon
                   FROM kisi_telefonlari kt
                  WHERE kt.kisi_id = kv.id
               ) candidate
              WHERE candidate.telefon IS NOT NULL
           ) phones ON true
          WHERE v.ogrenci_id = $1
          ORDER BY kv.tam_ad, kv.id, phones.telefon`, [kisi.kisi_id]);
    if (!veliler.length) return;

    const tur = karar.yon === 'cikis' ? 'cikis' : (karar.gec ? 'gec_giris' : 'giris');
    const turMetni = tur === 'cikis' ? 'kurumdan çıkış yaptı' : (tur === 'gec_giris' ? 'geç giriş yaptı' : 'kuruma giriş yaptı');
    const body = `Sayın Velimiz, ${kisi.full_name || kisi.tam_ad || 'Öğrenciniz'} ${turMetni}. Saat: ${karar.saat || '—'}.`;
    const politika = await smsPolitikasi(kisi, karar);
    const politikaEngeli = politika.smsAllowed === false
        ? { success: false, blocked: true,
            error: 'Tatil/kapalı gün veya özel program — öğrenci SMS bildirimi kapalı.' }
        : null;

    await Promise.all(veliler.map(async (veli) => {
        const result = politikaEngeli || (veli.telefon
            ? await netgsmService.sendParentGateSms({
                studentName: kisi.full_name || kisi.tam_ad,
                parentPhone: veli.telefon, tur,
                gecikmeDk: karar.gecikme_dk || 0, saat: karar.saat,
              })
            : { success: false, error: 'Veli telefonu bulunamadı.' });
        await smsAudit.recordDelivery({
            parentId: veli.veli_id, studentId: kisi.kisi_id, phone: veli.telefon,
            body, kind: 'gate', result,
        });
    }));
}


module.exports = { veliyeBildir };
