/* ============================================================================
   GUNLUK OTOMASYON

   Ogrencinin cikis okutmasi beklenmez: ogle arasinda ve gun sonunda hâlâ
   iceride gorunen herkesin kaydi sistem tarafindan kapatilir. Gun bitince de
   devamsizlik herkes icin yeniden turetilir.

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

async function isaretleriYaz(gun, yeniGorevler) {
    if (!yeniGorevler || !yeniGorevler.length) return;
    const yapilan = await isaretleriOku(gun);
    const set = new Set(yapilan);
    let changed = false;
    for (const g of yeniGorevler) {
        if (!set.has(g)) {
            set.add(g);
            changed = true;
        }
    }
    if (!changed) return;
    const yeni = { [gun]: Array.from(set) };
    await sorgu(
        `INSERT INTO ayarlar (anahtar, deger) VALUES ('otomasyon', $1)
         ON CONFLICT (anahtar) DO UPDATE SET deger = $1, guncellendi = now()`,
        [JSON.stringify(yeni)]);
}

async function isaretYaz(gun, gorev) {
    await isaretleriYaz(gun, [gorev]);
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

/**
 * Tarihe ozel kurali (tatil/deneme/ozel program) dikkate alan toplu cikis.
 */
async function topluCikis(gun, dakika, not, cfg, tip) {
    const kisiler = await iceridekiler(gun);
    let count = 0;
    for (const k of kisiler) {
        try {
            if (cfg && tip) {
                const kisi = await tek('SELECT * FROM api_users WHERE kisi_id = $1', [k.kisi_id]);
                const resolved = denemeGunleri.resolveForPerson(cfg, gun, kisi || { kisi_id: k.kisi_id, role: 'ogrenci' });
                const p = yoklama.pencereler(resolved.config);
                if (tip === 'ogle') {
                    if (dakika < p.ogleCikisSonu || dakika >= p.ogledenSonra) continue;
                } else if (tip === 'gun_sonu') {
                    const cikisSiniri = p.kesilmeSaati || p.okulCikis;
                    if (dakika < cikisSiniri) continue;
                }
            }
            await cikisYaz(k.kisi_id, gun, dakika, not);
            await yoklama.devamsizligiYaz(k.kisi_id, gun, cfg);
            await otomatikCikisBildir(k.kisi_id, dakika, gun);
            count++;
        } catch (e) {
            console.error('[OTOMASYON] cikis yazilamadi', k.kisi_id, e.message);
        }
    }
    return count;
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

/**
 * Devamsizligi tamamla ve veli bildirimlerini yonet.
 * Kisinin kesilme saati (suAnDk >= kesilme)
 * gelmeden devamsizlik sonlandirilmaz ve veli bildirimi uretilmez.
 */
/** Idarenin elle girdigi (ya da kilitledigi) 'izinli' kaydi varsa veliye eksik mesaji gitmez. */
async function izinliMi(kisiId, gun) {
    const r = await tek(
        `SELECT 1 FROM devamsizlik WHERE ogrenci_id=$1 AND tarih=$2::date AND NOT otomatik AND durum='izinli'
         UNION ALL
         SELECT 1 FROM yoklama_uzlastirma WHERE kisi_id=$1 AND tarih=$2::date AND kilitli AND durum='izinli'
         LIMIT 1`, [kisiId, gun]);
    return Boolean(r);
}

/**
 * 13:00 OGLE BILDIRIMI (ogrenci). Sabah oturumu ogle cikisinda biter; o anda:
 *   sabah hic giris yok              -> sabah_gelmedi
 *   giris var ama son giristen sonra -> sabah_gec (saat = ilk giris)
 * Gunde bir kez (ogle_sms_<id> isareti). Tatil / ozel program / izinli korunur.
 */
async function ogleBildirimi(gun, cfg) {
    const ogrenciler = await hepsi(
        `SELECT DISTINCT k.id AS kisi_id, k.tam_ad FROM kisiler k JOIN kisi_rolleri r ON r.kisi_id = k.id
          WHERE k.aktif AND r.rol = 'ogrenci'`);
    const yapilan = await isaretleriOku(gun);
    const yeni = [];
    let gonderilen = 0;
    for (const o of ogrenciler) {
        const isaret = `ogle_sms_${o.kisi_id}`;
        if (yapilan.includes(isaret)) continue;
        try {
            const kisi = await tek('SELECT * FROM api_users WHERE kisi_id = $1', [o.kisi_id]);
            const politika = denemeGunleri.resolveForPerson(cfg, gun, kisi || { kisi_id: o.kisi_id, role: 'ogrenci', roles: ['ogrenci'] });
            yeni.push(isaret);
            if (politika.excluded || politika.closed) continue;
            const h = await yoklama.devamsizligiYaz(o.kisi_id, gun, politika.config);
            if (h.durum === 'kapali') continue;
            const sb = h.oturumBilgi?.sabah || {};
            const tur = !sb.giris ? 'sabah_gelmedi' : (!sb.kazandi ? 'sabah_gec' : null);
            if (!tur) continue;
            if (await izinliMi(o.kisi_id, gun)) continue;
            await veliBildirim.veliyeBildir(kisi || { kisi_id: o.kisi_id, full_name: o.tam_ad, roles: ['ogrenci'] },
                { tur, saat: sb.giris || '', tarih: gun, kind: 'absence' });
            gonderilen++;
        } catch (e) {
            console.error('[OTOMASYON] ogle bildirimi', o.kisi_id, e.message);
        }
    }
    if (yeni.length) await isaretleriYaz(gun, yeni);
    return gonderilen;
}

async function devamsizligiTamamla(gun, cfg, suAnDk) {
    /* OGRENCI + PERSONEL. Personel de devamsizlik alir; kurali farklidir
       (gun icinde okutma yoksa personel devamsizlik saatinden sonra yok). */
    const kisiler = await hepsi(
        `SELECT DISTINCT k.id AS kisi_id, k.tam_ad,
                EXISTS (SELECT 1 FROM kisi_rolleri x
                         WHERE x.kisi_id = k.id AND x.rol = 'ogrenci') AS ogrenci
           FROM kisiler k JOIN kisi_rolleri r ON r.kisi_id = k.id
          WHERE k.aktif AND r.rol IN ('ogrenci', 'ogretmen', 'idare', 'personel')`);

    const yapilan = await isaretleriOku(gun);
    const yeniIsaretler = [];

    let n = 0;
    const gelmeyen = [];
    for (const o of kisiler) {
        try {
            const isaretKey = `devamsizlik_${o.kisi_id}`;
            if (yapilan.includes(isaretKey)) continue;

            const kisi = await tek('SELECT * FROM api_users WHERE kisi_id = $1', [o.kisi_id]);
            const politika = denemeGunleri.resolveForPerson(cfg, gun,
                kisi || { kisi_id: o.kisi_id, role: o.ogrenci ? 'ogrenci' : 'personel', roles: [o.ogrenci ? 'ogrenci' : 'personel'] });
            
            const p = yoklama.pencereler(politika.config);
            const kesilme = p.kesilmeSaati || p.okulCikis || p.gunSonu;

            // Su anki saat bu kisinin kesilme saatinden onceyse henuz vakti gelmemistir
            if (suAnDk !== undefined && suAnDk < kesilme) continue;

            const h = await yoklama.devamsizligiYaz(o.kisi_id, gun, politika.config);
            n++;
            yeniIsaretler.push(isaretKey);

            /* GUN SONU VELI BILDIRIMI (ogrenci). Sabahin eksigi 13:00'te bildirildi;
               burada ogleden sonra ve tam gun degerlendirilir:
                 hic giris yok               -> tam_gun_gelmedi (birlesik mesaj)
                 sabah var, ogleden sonra yok-> ogleden_sonra_gelmedi
                 ogleden sonra 15:00 sonrasi -> ogleden_sonra_gec
                 sabah yok, ogleden sonra var-> mesaj yok (13:00'te bildirildi) */
            if (o.ogrenci && h.durum !== 'kapali') {
                const sb = h.oturumBilgi?.sabah || {};
                const os = h.oturumBilgi?.ogleden_sonra || {};
                const tur = !sb.giris && !os.giris ? 'tam_gun_gelmedi'
                    : sb.giris && !os.giris ? 'ogleden_sonra_gelmedi'
                    : os.giris && !os.kazandi ? 'ogleden_sonra_gec'
                    : null;
                if (tur) gelmeyen.push({ ...o, kisi, tur, saat: os.giris || '' });
            }
        } catch (e) {
            console.error('[OTOMASYON] devamsizlik', o.kisi_id, e.message);
        }
    }

    if (yeniIsaretler.length > 0) {
        await isaretleriYaz(gun, yeniIsaretler);
    }

    /* VELIYE GUN SONU BILDIRIMI.
       Gunde BIR kez calisir (yukaridaki devamsizlik_ ogrenci isaretiyle korunur).
       Alici cozumu, tatil/ozel program politikasi, sablon ve audit tek yerde:
       veliBildirim. Gonderim NetGSM tarafindaki SMS_GONDERIM_ACIK kilidinden gecer. */
    for (const o of gelmeyen) {
        try {
            if (await izinliMi(o.kisi_id, gun)) continue;
            await veliBildirim.veliyeBildir(o.kisi || { kisi_id: o.kisi_id, full_name: o.tam_ad, roles: ['ogrenci'] },
                { tur: o.tur, saat: o.saat, tarih: gun, kind: 'absence' });
        } catch (e) {
            console.error('[OTOMASYON] gun sonu veli bildirimi', o.kisi_id, e.message);
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

    /* Tarihe ozel deneme programi normal ogle/gun sonu saatlerini ezer. */
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

    // 13:00 — sabah oturumu kapandi: ogleden once gelmeyen / gec gelen veliye bildirilir.
    if (cfg.autoAttendanceEnabled && dk >= yoklama.pencereler(cfg).ogleCikis && !yapilan.includes('ogle_sms_tamam')) {
        const n = await ogleBildirimi(gun, cfg);
        console.log(`[OTOMASYON] ${gun} öğle veli bildirimi: ${n} mesaj`);
        await isaretYaz(gun, 'ogle_sms_tamam');
    }

    // Ogle ve gun sonu otomatik cikislari
    if (cfg.autoLunchExitEnabled) {
        await topluCikis(gun, dk, 'Öğle çıkışı — otomatik', cfg, 'ogle');
    }
    if (cfg.autoSchoolExitEnabled) {
        await topluCikis(gun, dk, 'Gün sonu çıkışı — otomatik', cfg, 'gun_sonu');
    }

    // Devamsizlik sonlandirma
    if (cfg.autoAttendanceEnabled) {
        await devamsizligiTamamla(gun, cfg, dk);
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

module.exports = { baslat, tur, tetikler, devamsizligiTamamla, topluCikis };
