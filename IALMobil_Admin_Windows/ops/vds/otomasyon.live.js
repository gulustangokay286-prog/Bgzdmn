/* ============================================================================
   GUNLUK OTOMASYON

   Ogrencinin cikis okutmasi beklenmez: ogle arasinda ve gun sonunda hâlâ
   iceride gorunen herkesin kaydi sistem tarafindan kapatilir. Gun bitince de
   devamsizlik herkes icin yeniden turetilir.

   Uc gorev vardir ve her biri GUNDE BIR kez calisir:
     ogle        -> ogle cikisi + musaade  (varsayilan 12:25)
     gun_sonu    -> okul cikisi            (varsayilan 15:20)
     devamsizlik -> gun sonu               (varsayilan 15:30)

   "Gunde bir" garantisi `ayarlar` tablosundaki `otomasyon` anahtarinda
   tutulur; sunucu yeniden baslasa da gorev tekrar etmez. Sunucu tetikleme
   aninda kapaliysa gorev sonradan calisir ama kayda TETIKLEME SAATI yazilir,
   yoksa 12:25'te cikmasi gereken ogrenci 12:40 gibi gorunurdu.
   ========================================================================== */

const { hepsi, tek, sorgu } = require('./db');
const yoklama = require('./yoklama');
const smsAudit = require('./services/smsAudit');
const veliBildirim = require('./services/veliBildirim');
const netgsm = require('./services/netgsmService');
const denemeGunleri = require('./denemeGunleri.live.cjs');

const GOREVLER = ['ogle', 'gun_sonu', 'devamsizlik'];

/** Gorev tetikleme dakikalari — ayarlardan turer. */
function tetikler(cfg) {
    const p = yoklama.pencereler(cfg);
    return {
        ogle:        p.ogleCikisSonu,   // ogle cikisi + musaade
        gun_sonu:    p.okulCikis,
        devamsizlik: p.gunSonu,
    };
}

async function isaretleriOku(gun) {
    const r = await tek(`SELECT deger FROM ayarlar WHERE anahtar = 'otomasyon'`);
    let d = r?.deger || {};
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = {}; } }
    return Array.isArray(d[gun]) ? d[gun] : [];
}

async function isaretYaz(gun, gorev) {
    const yapilan = await isaretleriOku(gun);
    if (yapilan.includes(gorev)) return;
    // Yalnizca BUGUNU sakla; tablo gunlerle sismesin.
    const yeni = { [gun]: [...yapilan, gorev] };
    await sorgu(
        `INSERT INTO ayarlar (anahtar, deger) VALUES ('otomasyon', $1)
         ON CONFLICT (anahtar) DO UPDATE SET deger = $1, guncellendi = now()`,
        [JSON.stringify(yeni)]);
}

/** Su an iceride gorunen herkes (bugune ait acik giris). */
function iceridekiler(gun) {
    return hepsi(
        `SELECT kisi_id FROM kapi_durumu
          WHERE yon = 'giris' AND tarih = $1::date`, [gun]);
}

/** Verilen dakikada otomatik cikis yazar. */
async function cikisYaz(kisiId, gun, dakika, not) {
    const saat = String(Math.floor(dakika / 60)).padStart(2, '0');
    const dk = String(dakika % 60).padStart(2, '0');
    await sorgu(
        `INSERT INTO gecisler (kisi_id, yon, kaynak, zaman, not_)
         VALUES ($1, 'cikis', 'otomatik',
                 (($2::date || ' ' || $3::text)::timestamp AT TIME ZONE 'Europe/Istanbul'), $4)`,
        [kisiId, gun, `${saat}:${dk}`, not]);
}

/**
 * OTOMATIK CIKISTA VELIYE SMS.
 * Ogretmen/personel modul icinde elenir (yalnizca ogrenci velisi bilgilendirilir).
 * Gonderim ayrica NetGSM tarafindaki SMS_GONDERIM_ACIK kilidinden gecer.
 * Bildirim hatasi cikis yazimini asla bozmaz.
 */
async function otomatikCikisBildir(kisiId, dakika, gun) {
    try {
        const kisi = await tek('SELECT * FROM api_users WHERE kisi_id = $1', [kisiId]);
        if (!kisi) return;
        const s = String(Math.floor(dakika / 60)).padStart(2, '0');
        const d = String(dakika % 60).padStart(2, '0');
        await veliBildirim.veliyeBildir(kisi, {
            yon: 'cikis', gec: false, saat: `${s}:${d}`, gecikme_dk: 0, tarih: gun,
        });
    } catch (e) {
        console.error('[OTOMASYON] cikis SMS bildirimi', kisiId, e.message);
    }
}

async function topluCikis(gun, dakika, not) {
    const kisiler = await iceridekiler(gun);
    for (const k of kisiler) {
        try {
            await cikisYaz(k.kisi_id, gun, dakika, not);
            await yoklama.devamsizligiYaz(k.kisi_id, gun);
            await otomatikCikisBildir(k.kisi_id, dakika, gun);
        } catch (e) {
            console.error('[OTOMASYON] cikis yazilamadi', k.kisi_id, e.message);
        }
    }
    return kisiler.length;
}

/**
 * Deneme gununde yalnizca kuralin kapsadigi ogrenciler otomatik cikarilir.
 * Kapsam disi seviyeler yoklama motoruna hic sokulmaz; mevcut ham gecisleri
 * de degistirmeyiz.
 */
async function denemeTopluCikis(gun, cfg, dakika, not) {
    const rule = denemeGunleri.ruleFor(cfg, gun);
    if (!rule) return 0;
    const inside = await iceridekiler(gun);
    if (!inside.length) return 0;
    const ids = inside.map((row) => row.kisi_id);
    /* Ogrenci + ogretmen/idare/personel: deneme gununde hepsi ayni programa
       tabi oldugundan otomatik cikis da hepsini kapsar. Kapsam karari
       resolveForPerson'a birakilir. */
    const persons = await hepsi(
        `SELECT * FROM api_users WHERE kisi_id = ANY($1::bigint[])`, [ids]);
    const included = new Set(persons
        .filter((person) => denemeGunleri.resolveForPerson(cfg, gun, person).included)
        .map((person) => String(person.kisi_id)));
    let count = 0;
    for (const row of inside) {
        if (!included.has(String(row.kisi_id))) continue;
        try {
            await cikisYaz(row.kisi_id, gun, dakika, not);
            await yoklama.devamsizligiYaz(row.kisi_id, gun, cfg);
            await otomatikCikisBildir(row.kisi_id, dakika, gun);
            count++;
        } catch (e) {
            console.error('[OTOMASYON] deneme cikisi yazilamadi', row.kisi_id, e.message);
        }
    }
    return count;
}

/** Tarihe ozel ders/etut programinda yalnizca secili rol ve siniflar cikar. */
async function ozelProgramTopluCikis(gun, cfg, dakika, not) {
    const program = denemeGunleri.customRuleFor(cfg, gun);
    if (!program) return 0;
    const inside = await iceridekiler(gun);
    if (!inside.length) return 0;
    const ids = inside.map((row) => row.kisi_id);
    const persons = await hepsi(
        `SELECT * FROM api_users WHERE kisi_id = ANY($1::bigint[])`, [ids]);
    const included = new Set(persons
        .filter((person) => denemeGunleri.resolveForPerson(cfg, gun, person).included)
        .map((person) => String(person.kisi_id)));
    let count = 0;
    for (const row of inside) {
        if (!included.has(String(row.kisi_id))) continue;
        try {
            await cikisYaz(row.kisi_id, gun, dakika, not);
            await yoklama.devamsizligiYaz(row.kisi_id, gun, cfg);
            await otomatikCikisBildir(row.kisi_id, dakika, gun);
            count++;
        } catch (e) {
            console.error('[OTOMASYON] ozel program cikisi yazilamadi', row.kisi_id, e.message);
        }
    }
    return count;
}

async function devamsizligiTamamla(gun, cfg) {
    /* OGRENCI + PERSONEL. Personel de devamsizlik alir; kurali farklidir
       (gun icinde okutma yoksa personel devamsizlik saatinden sonra yok).
       Onceden yalnizca ogrenciler taraniyordu. */
    const kisiler = await hepsi(
        `SELECT DISTINCT k.id AS kisi_id, k.tam_ad,
                EXISTS (SELECT 1 FROM kisi_rolleri x
                         WHERE x.kisi_id = k.id AND x.rol = 'ogrenci') AS ogrenci
           FROM kisiler k JOIN kisi_rolleri r ON r.kisi_id = k.id
          WHERE k.aktif AND r.rol IN ('ogrenci', 'ogretmen', 'idare', 'personel')`);

    let n = 0;
    const gelmeyen = [];
    for (const o of kisiler) {
        try {
            const h = await yoklama.devamsizligiYaz(o.kisi_id, gun);
            n++;
            /* "Bugun okula GELMEDI" mesaji yalnizca o gun HIC okutmasi
               olmayana gider. `durum === 'yok'` yarim gunu de kapsiyor:
               sabah gelip ogleden sonra donmeyen ogrencinin velisine
               "gelmemistir" yazmak yanlis olurdu. */
            if (o.ogrenci && h.durum === 'yok' && (h.oturumlar || []).length === 0
                && !h.oturumBilgi?.sabah?.giris && !h.oturumBilgi?.ogleden_sonra?.giris) {
                const kisi = await tek('SELECT * FROM api_users WHERE kisi_id = $1', [o.kisi_id]);
                const politika = denemeGunleri.resolveForPerson(cfg, gun,
                    kisi || { kisi_id: o.kisi_id, role: 'ogrenci', roles: ['ogrenci'] });
                gelmeyen.push({ ...o, smsAllowed: politika.smsAllowed !== false });
            }
        } catch (e) {
            console.error('[OTOMASYON] devamsizlik', o.kisi_id, e.message);
        }
    }

    /* VELIYE "GELMEDI" BILDIRIMI.
       Gunde BIR kez calisir: bu gorev `otomasyon` isaretiyle korunuyor, ikinci
       tur mesaj uretmez. Yalnizca ogrenciler; personelin velisi yoktur. */
    for (const o of gelmeyen) {
        const recipients = await hepsi(`
            SELECT DISTINCT v.veli_id, phones.telefon
              FROM veli_ogrenci v
              JOIN kisiler kv ON kv.id=v.veli_id
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
             WHERE v.ogrenci_id=$1
          ORDER BY v.veli_id, phones.telefon`, [o.kisi_id]);
        for (const parent of recipients.length ? recipients : [{}]) {
            const body = o.tam_ad + ' bugün kuruma gelmemiştir. (' + gun + ')';
            /* Gonderim NetGSM tarafindaki SMS_GONDERIM_ACIK kilidinden gecer.
               Telefon yoksa provider'a istek atilmaz; audit kaydi sebebiyle
               birlikte yazilir, gecmis teslimat verisi uydurulmaz. */
            const result = !o.smsAllowed
                ? { success: false, blocked: true,
                    error: 'Tatil/kapalı gün veya özel program — öğrenci SMS bildirimi kapalı.' }
                : parent.telefon
                ? await netgsm.sendSms({ to: parent.telefon, message: body })
                : { success: false, error: 'Veli telefonu bulunamadı.' };
            await smsAudit.recordDelivery({ studentId: o.kisi_id, parentId: parent.veli_id,
                phone: parent.telefon, kind: 'absence', body, result });
        }
    }
    return n;
}

async function canliYoklama(gun, cfg) {
    if (gun < '2026-09-08' || !cfg.autoAttendanceEnabled) return;
    const persons = await hepsi(`SELECT DISTINCT k.id AS kisi_id
        FROM kisiler k JOIN kisi_rolleri r ON r.kisi_id=k.id
        WHERE k.aktif AND r.rol IN ('ogrenci','ogretmen','idare','personel')`);
    for (const person of persons) await yoklama.devamsizligiYaz(person.kisi_id, gun, cfg);
}

async function tur() {
    const cfg = await yoklama.ayarlariAl();
    const simdi = new Date();
    const gun = yoklama.gunAnahtari(simdi, cfg.saatDilimi);
    const deneme = denemeGunleri.ruleFor(cfg, gun);
    const ozelProgram = denemeGunleri.customRuleFor(cfg, gun);
    /* Haftalik kapali gunu yalnizca acikca tarihlendirilmis deneme/etut
       programi acar. Salt tatil kuralinda otomasyon devreye girmez. */
    if (yoklama.kapaliGunMu(simdi, cfg) && !deneme && !ozelProgram) return;

    if (gun < '2026-09-08') return;
    await canliYoklama(gun, cfg);

    const dk = yoklama.dakikaDilimde(simdi, cfg.saatDilimi);
    const yapilan = await isaretleriOku(gun);

    /* Tarihe ozel deneme programi normal ogle/gun sonu saatlerini ezer.
       Etut yoksa tek cikis sinav sonrasi ayarlanan saattir (varsayilan
       13:15); etut varsa sinav cikisi ve etut cikisi ayri otomasyonlardir. */
    if (deneme) {
        const sinavBitis = denemeGunleri.dakika(deneme.sinavBitisSaati);
        const otomatikCikis = denemeGunleri.dakika(deneme.otomatikCikisSaati);
        const etutCikis = denemeGunleri.dakika(deneme.etutCikisSaati);
        if (deneme.etutVar) {
            if (cfg.autoLunchExitEnabled && dk >= sinavBitis && !yapilan.includes('deneme_sinav_cikisi')) {
                const n = await denemeTopluCikis(gun, cfg, sinavBitis, 'Deneme sınavı çıkışı — otomatik');
                console.log(`[OTOMASYON] ${gun} deneme sınav çıkışı: ${n} öğrenci`);
                await isaretYaz(gun, 'deneme_sinav_cikisi');
            }
            if (cfg.autoSchoolExitEnabled && dk >= etutCikis && !yapilan.includes('deneme_etut_cikisi')) {
                const n = await denemeTopluCikis(gun, cfg, etutCikis, 'Etüt çıkışı — otomatik');
                console.log(`[OTOMASYON] ${gun} etüt çıkışı: ${n} öğrenci`);
                await isaretYaz(gun, 'deneme_etut_cikisi');
            }
            if (cfg.autoAttendanceEnabled && dk >= etutCikis && !yapilan.includes('deneme_devamsizlik')) {
                const n = await devamsizligiTamamla(gun, cfg);
                console.log(`[OTOMASYON] ${gun} deneme/etüt devamsızlık tamamlandı: ${n} kişi`);
                await isaretYaz(gun, 'deneme_devamsizlik');
            }
        } else {
            if (cfg.autoSchoolExitEnabled && dk >= otomatikCikis && !yapilan.includes('deneme_gun_sonu')) {
                const n = await denemeTopluCikis(gun, cfg, otomatikCikis, 'Deneme sınavı çıkışı — otomatik');
                console.log(`[OTOMASYON] ${gun} deneme çıkışı: ${n} öğrenci`);
                await isaretYaz(gun, 'deneme_gun_sonu');
            }
            if (cfg.autoAttendanceEnabled && dk >= otomatikCikis && !yapilan.includes('deneme_devamsizlik')) {
                const n = await devamsizligiTamamla(gun, cfg);
                console.log(`[OTOMASYON] ${gun} deneme devamsızlık tamamlandı: ${n} kişi`);
                await isaretYaz(gun, 'deneme_devamsizlik');
            }
        }
        return;
    }

    if (ozelProgram) {
        const ornek = { role: 'ogrenci', roles: ['ogrenci'],
            class_id: ozelProgram.sinifSeviyeleri[0] || '12' };
        const programCfg = denemeGunleri.resolveForPerson(cfg, gun, ornek).config;
        const p = yoklama.pencereler(programCfg);
        if (ozelProgram.oglenOtomatikCikis && dk >= p.ogleCikisSonu
            && !yapilan.includes('ozel_program_ogle')) {
            const n = await ozelProgramTopluCikis(gun, cfg, p.ogleCikisSonu,
                `${ozelProgram.ad} — ders sonu otomatik çıkış`);
            console.log(`[OTOMASYON] ${gun} özel program ders sonu çıkışı: ${n} kişi`);
            await isaretYaz(gun, 'ozel_program_ogle');
        }
        if (ozelProgram.gunSonuOtomatikCikis && dk >= p.okulCikis
            && !yapilan.includes('ozel_program_gun_sonu')) {
            const n = await ozelProgramTopluCikis(gun, cfg, p.okulCikis,
                `${ozelProgram.ad} — gün sonu otomatik çıkış`);
            console.log(`[OTOMASYON] ${gun} özel program gün sonu çıkışı: ${n} kişi`);
            await isaretYaz(gun, 'ozel_program_gun_sonu');
        }
        if (cfg.autoAttendanceEnabled && dk >= p.gunSonu
            && !yapilan.includes('ozel_program_devamsizlik')) {
            const n = await devamsizligiTamamla(gun, cfg);
            console.log(`[OTOMASYON] ${gun} özel program devamsızlık tamamlandı: ${n} kişi`);
            await isaretYaz(gun, 'ozel_program_devamsizlik');
        }
        return;
    }

    const t = tetikler(cfg);

    for (const gorev of GOREVLER) {
        if (yapilan.includes(gorev)) continue;
        if (dk < t[gorev]) continue;

        if (gorev === 'ogle') {
            if (!cfg.autoLunchExitEnabled) { await isaretYaz(gun, gorev); continue; }
            const n = await topluCikis(gun, t.ogle, 'Öğle çıkışı — otomatik');
            console.log(`[OTOMASYON] ${gun} öğle çıkışı: ${n} kişi`);
        } else if (gorev === 'gun_sonu') {
            if (!cfg.autoSchoolExitEnabled) { await isaretYaz(gun, gorev); continue; }
            const n = await topluCikis(gun, t.gun_sonu, 'Gün sonu çıkışı — otomatik');
            console.log(`[OTOMASYON] ${gun} gün sonu çıkışı: ${n} kişi`);
        } else {
            if (!cfg.autoAttendanceEnabled) { await isaretYaz(gun, gorev); continue; }
            const n = await devamsizligiTamamla(gun, cfg);
            console.log(`[OTOMASYON] ${gun} devamsızlık tamamlandı: ${n} öğrenci`);
        }
        await isaretYaz(gun, gorev);
    }
}

function baslat() {
    let running = false;
    const calistir = async () => {
        if (running) return;
        running = true;
        try { await tur(); }
        catch (e) { console.error('[OTOMASYON] tur hatasi:', e.message); }
        finally { running = false; }
    };
    calistir();                       // acilista kacirilmis gorev varsa yakala
    setInterval(calistir, 30_000);
    console.log('[OTOMASYON] gunluk gorevler etkin (30 sn aralikla denetim)');
}

module.exports = { baslat, tur, tetikler };
