/**
 * ALAN KATMANI
 *
 * Rotalar SQL yazmaz; buradaki adlandirilmis islevleri cagirir. Mongo ve
 * Firestore cagrilarinin tamami bu dosyadaki karsiliklarla degistirilmistir.
 *
 * `api_users` gorunumu istemcilerin bekledigi alan adlarini (full_name,
 * school_number, parent_phone …) uretir; iliskisel semayi istemciye sizdirmaz.
 */
const { hepsi, tek, sorgu, islem } = require('./db');

/* ----------------------------------------------------------- KULLANICI --- */
/**
 * Istemciden gelen rolu veritabani rollerine cevirir.
 * Personel havuzlari BIRLIKTE dondurulur: ogretmen ve idare ayrimi ekran
 * sekmesidir, kiminin ikisi birden olabilir ve ikisinden de gecebilmelidir.
 */
const ROL_KUMESI = {
    ogrenci: ['ogrenci'], student: ['ogrenci'],
    veli: ['veli'],       parent:  ['veli'],
    ogretmen: ['ogretmen', 'idare'], teacher: ['ogretmen', 'idare'],
    idare:    ['ogretmen', 'idare'], admin:   ['ogretmen', 'idare'],
    yonetici: ['ogretmen', 'idare'], staff:   ['ogretmen', 'idare', 'personel'],
    personel: ['personel'], personnel: ['personel'],
};
const rolKumesi = (rol) => ROL_KUMESI[String(rol || '').toLowerCase().trim()] || null;

const KULLANICI_SEC = `
    SELECT u.*, COALESCE(u.branch, u.subject) AS branch,
           COALESCE((
             SELECT array_agg(btrim(kt.telefon::text) ORDER BY kt.id)
               FROM kisi_telefonlari kt
              WHERE kt.kisi_id = u.kisi_id
           ), ARRAY[]::text[]) AS additional_phones,
           p.unvan AS "teacherTitle",
           p.atanan_siniflar AS "assignedClasses",
           p.notlar AS notes
      FROM api_users u
 LEFT JOIN personel p ON p.kisi_id = u.kisi_id`;

const kullanici = {
    async listele({ rol, limit = 1000 } = {}) {
        return rol
            ? hepsi(`SELECT * FROM (${KULLANICI_SEC}) users WHERE $1 = ANY(roles) ORDER BY full_name LIMIT $2`, [rol, limit])
            : hepsi(`${KULLANICI_SEC} ORDER BY u.full_name LIMIT $1`, [limit]);
    },

    /** Kimlikte "usr_12" da, ham "12" de, okul numarasi da kabul edilir. */
    async bul(kimlik) {
        const s = String(kimlik || '').trim();
        if (!s) return null;
        const kid = /^usr_(\d+)$/.test(s) ? s.slice(4) : (/^\d+$/.test(s) ? s : null);
        if (kid) {
            const k = await tek(`SELECT * FROM (${KULLANICI_SEC}) users WHERE kisi_id = $1`, [kid]);
            if (k) return k;
        }
        return tek(
            `SELECT * FROM (${KULLANICI_SEC}) users
              WHERE school_number = $1 OR tc_kimlik = $1 OR lower(email) = lower($1)
              LIMIT 1`, [s]);
    },

    /**
     * Okul numarasi ya da tam ad ile arama — QR ve manuel gecis kullanir.
     *
     * ROL: istemci Ingilizce yaziyor ('teacher', 'admin'), veritabani Turkce
     * ('ogretmen', 'idare'). Esitlik aranınca personel HICBIR ZAMAN
     * bulunamiyordu; ogrenciler okul numarasiyla gectigi icin sorun yalnizca
     * personelde goruluyordu. Artik rol bir KUMEYE cevriliyor ve kisinin
     * rollerinden herhangi biri tutarsa yeterli. Ogretmen ile idare ayni
     * kumede: hem ogretmen hem idareci olan biri iki ekrandan da okutabilmeli.
     *
     * AD: tam esitlik yerine KELIME ALT KUMESI. "Busra Kokcu Oksuz" kaydi
     * "busra oksuz", "busra kokcu", "oksuz busra" ile de bulunur; yazilan her
     * kelimenin kayitta gecmesi yeterli, sira onemli degil. tr_ad() Turkce
     * harfleri katladigi icin buyuk/kucuk ve I/ı ayrimi da sorun cikarmaz.
     */
    async ara({ okulNo, tamAd, rol }) {
        if (okulNo) {
            return hepsi(
                `SELECT * FROM api_users WHERE school_number = $1 AND 'ogrenci' = ANY(roles)`,
                [String(okulNo).trim()]);
        }
        if (tamAd) {
            const kelime = String(tamAd).trim().split(/\s+/).filter(Boolean);
            /* Alt kume eslesmesi gevsek oldugu icin cok kisa girdi tek kisiye
               dusup ISTEMEDEN gecis yazabilir. Uc harften kisa arama yapilmaz. */
            if (!kelime.length || kelime.join('').length < 3) return [];
            return hepsi(
                `SELECT * FROM api_users
                  WHERE ($1::text[] IS NULL OR roles && $1::text[])
                    AND tr_ad(full_name) LIKE ALL (
                          SELECT '%' || tr_ad(k) || '%' FROM unnest($2::text[]) AS k)
               ORDER BY length(full_name), full_name LIMIT 10`,
                [rolKumesi(rol), kelime]);
        }
        return [];
    },

    async sonGirisiYaz(kisiId) {
        // Kimlik satiri her kisi icin zaten var; INSERT'e gerek yok.
        // (Onceki surumde $1 hem bigint hem metin olarak kullanildigi icin
        //  Postgres parametre tipini cozemiyordu.)
        await sorgu(`UPDATE kimlik SET son_giris = now() WHERE kisi_id = $1`, [kisiId]);
    },
};

/* --------------------------------------------------------------- GECIS --- */
const gecis = {
    async ekle({ kisiId, yon, kaynak, kapi, isleyenId, cihazId, ip, not }) {
        return tek(
            `INSERT INTO gecisler (kisi_id, yon, kaynak, kapi, isleyen_id, cihaz_id, ip, not_)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [kisiId, yon, kaynak, kapi || null, isleyenId || null, cihazId || null, ip || null, not || null]);
    },

    /** Bugunku son durum — `kapi_durumu` gorunumu son geciste esittir. */
    durum(kisiId) {
        return tek(`SELECT * FROM kapi_durumu WHERE kisi_id = $1`, [kisiId]);
    },

    /**
     * Herkesin ANLIK kapi durumu.
     *
     * `kapi_durumu` gorunumunde tarih suzgeci YOKTUR: kisinin en son gecisi
     * neyse onu doner. Dun girip cikis yapmayan biri bugun de "iceride"
     * gorunuyordu ve manuel gecis ekraninda iceridekiler fazla cikiyordu.
     * Burada gunu isaretliyoruz: BUGUNE ait olmayan giris "disarida" sayilir.
     */
    tumDurumlar() {
        return hepsi(
            `SELECT *,
                    (tarih = (now() AT TIME ZONE 'Europe/Istanbul')::date) AS bugun,
                    CASE WHEN yon = 'giris'
                          AND tarih = (now() AT TIME ZONE 'Europe/Istanbul')::date
                         THEN 'inside' ELSE 'outside' END AS gecerli_durum
               FROM kapi_durumu ORDER BY zaman DESC`);
    },

    async gunluk({ tarih, limit = 500 }) {
        return hepsi(
            /* ROL de gelir. Canli gecis ekrani rolu kendi tahmin ediyordu;
               kayitta rol olmadigi icin HERKES ogrenci gorunuyordu. */
            `SELECT g.*, k.tam_ad, o.okul_no, s.ad AS sinif,
                    (CASE WHEN EXISTS (SELECT 1 FROM kisi_rolleri r WHERE r.kisi_id = k.id AND r.rol = 'idare')    THEN 'idare'
                       WHEN EXISTS (SELECT 1 FROM kisi_rolleri r WHERE r.kisi_id = k.id AND r.rol = 'ogretmen') THEN 'ogretmen'
                       WHEN EXISTS (SELECT 1 FROM kisi_rolleri r WHERE r.kisi_id = k.id AND r.rol = 'personel') THEN 'personel'
                       WHEN EXISTS (SELECT 1 FROM kisi_rolleri r WHERE r.kisi_id = k.id AND r.rol = 'ogrenci')  THEN 'ogrenci'
                       ELSE 'veli' END) AS rol
               FROM gecisler g
               JOIN kisiler k ON k.id = g.kisi_id
          LEFT JOIN ogrenciler o ON o.kisi_id = k.id
          LEFT JOIN siniflar s ON s.id = o.sinif_id
              WHERE g.tarih = COALESCE($1::date, (now() AT TIME ZONE 'Europe/Istanbul')::date)
           ORDER BY g.zaman DESC LIMIT $2`, [tarih || null, limit]);
    },
};

/* ---------------------------------------------------------------- QR ----- */
const qr = {
    /**
     * Jetonu KISI BASINA tuketir.
     *
     * Ayni karekodu ayni kisi iki kez kullanamaz; farkli kisiler kullanabilir.
     * Duvarda asili bir karekodu bir sinifin tamami okuttugu icin genel tek
     * kullanim yanlis olurdu — ilk okutan disindaki herkes reddedilirdi.
     *
     * Fotografla sonradan kullanma, karekodun donmesi ve istemcideki zaman
     * damgasi tazelik kontroluyle engellenir.
     *
     * Kisi bilinmiyorsa (kimlik henuz cozulmemisse) tuketim yapilmaz.
     */
    async jetonTuket(nonce, kisiId) {
        if (!nonce) return true;
        if (!kisiId) return true;
        const r = await sorgu(
            `INSERT INTO qr_jeton_kullanim (nonce, kisi_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING nonce`,
            [String(nonce), kisiId]);
        return r.rowCount > 0;
    },

    /** Ogrenci gun icinde tek cihazdan gecebilir. */
    async gunlukKilit({ ogrenciId, cihazId, stabilId, isletim, ip }) {
        const bugun = `(now() AT TIME ZONE 'Europe/Istanbul')::date`;
        const mevcut = await tek(
            `SELECT * FROM gunluk_kilit WHERE ogrenci_id = $1 AND tarih = ${bugun}`, [ogrenciId]);
        if (mevcut) return { uygun: mevcut.cihaz_id === cihazId, kilit: mevcut };
        await sorgu(
            `INSERT INTO gunluk_kilit (ogrenci_id, tarih, cihaz_id, stabil_id, isletim, ip)
             VALUES ($1, ${bugun}, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
            [ogrenciId, cihazId || null, stabilId || null, isletim || null, ip || null]);
        return { uygun: true, kilit: null };
    },
};

/* -------------------------------------------------------------- CIHAZ ---- */
const cihaz = {
    listele(limit = 200) {
        return hepsi(
            `SELECT c.*, k.tam_ad AS sahip_ad, o.okul_no
               FROM cihazlar c
          LEFT JOIN kisiler k ON k.id = c.sahip_id
          LEFT JOIN ogrenciler o ON o.kisi_id = k.id
           ORDER BY c.son_gorulme DESC LIMIT $1`, [limit]);
    },
    gor({ donanimId, sahipId, isletim, ip, ekran, gizliSkor }) {
        return tek(
            `INSERT INTO cihazlar (donanim_id, sahip_id, isletim, ip, ekran, gizli_skor)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (donanim_id) DO UPDATE
               SET son_gorulme = now(),
                   sahip_id = COALESCE(EXCLUDED.sahip_id, cihazlar.sahip_id),
                   ip = COALESCE(EXCLUDED.ip, cihazlar.ip)
             RETURNING *`,
            [donanimId, sahipId || null, isletim || null, ip || null, ekran || null, gizliSkor ?? null]);
    },
    async sifirla(kisiId) {
        await sorgu(`UPDATE cihazlar SET sahip_id = NULL WHERE sahip_id = $1`, [kisiId]);
        await sorgu(`DELETE FROM gunluk_kilit WHERE ogrenci_id = $1`, [kisiId]);
    },
};

/* ------------------------------------------------------------ GUVENLIK --- */
const guvenlik = {
    yaz({ olay, kisiId, detay, ip }) {
        return sorgu(
            `INSERT INTO guvenlik_log (olay, kisi_id, detay, ip) VALUES ($1,$2,$3,$4)`,
            [olay, kisiId || null, detay ? JSON.stringify(detay) : null, ip || null]);
    },
    listele(limit = 100) {
        return hepsi(
            `SELECT g.*, k.tam_ad FROM guvenlik_log g
          LEFT JOIN kisiler k ON k.id = g.kisi_id
           ORDER BY g.zaman DESC LIMIT $1`, [limit]);
    },
};

/* --------------------------------------------------------- DEVAMSIZLIK --- */
const devamsizlik = {
    gunluk(tarih) {
        return hepsi(
            `SELECT d.*, k.tam_ad, o.okul_no, s.ad AS sinif
               FROM devamsizlik d
               JOIN kisiler k ON k.id = d.ogrenci_id
          LEFT JOIN ogrenciler o ON o.kisi_id = k.id
          LEFT JOIN siniflar s ON s.id = o.sinif_id
              WHERE d.tarih = COALESCE($1::date, (now() AT TIME ZONE 'Europe/Istanbul')::date)
           ORDER BY s.ad, k.tam_ad`, [tarih || null]);
    },
    yaz({ ogrenciId, tarih, durum, dersSaati, agirlik, sebep, otomatik, kaydedenId }) {
        return tek(
            `INSERT INTO devamsizlik (ogrenci_id, tarih, durum, ders_saati, agirlik, sebep, otomatik, kaydeden_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (ogrenci_id, tarih, ders_saati)
               DO UPDATE SET durum = EXCLUDED.durum, agirlik = EXCLUDED.agirlik, sebep = EXCLUDED.sebep, otomatik = EXCLUDED.otomatik
             RETURNING *`,
            [ogrenciId, tarih, durum, dersSaati ?? 0, Number(agirlik ?? (durum === 'yok' ? 1 : 0)), sebep || null, !!otomatik, kaydedenId || null]);
    },
    /** Arsiv: gecmis Firebase kayitlari. Canli tabloya karistirilmaz. */
    arsiv(tarih) {
        return hepsi(
            `SELECT * FROM arsiv.devamsizlik WHERE ($1::text IS NULL OR tarih = $1) ORDER BY tarih DESC LIMIT 1000`,
            [tarih || null]);
    },
};

module.exports = { kullanici, gecis, qr, cihaz, guvenlik, devamsizlik };
