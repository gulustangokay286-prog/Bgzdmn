/**
 * WEB SITESI ROTALARI
 *
 * bogazici_web_and_others (halka acik site) ile admin panelini birlestirir.
 * Firestore karsiliklari:
 *   web_settings     -> web_ayarlar
 *   contact_messages -> iletisim_mesajlari
 *   hr_applications  -> ik_basvurulari
 *   store_products   -> magaza_urunleri
 *   store_orders     -> magaza_siparisleri
 *
 * Iki katman var:
 *   /api/web/...          herkese acik  — site okur, formlar yazar
 *   /api/web/yonetim/...  yalniz idare  — panel okur ve yonetir
 *
 * Halka acik POST uclarinda IP basina hiz siniri vardir; giris istemeyen bir
 * form, sinir konmazsa dogrudan spam kapisidir.
 *
 * Bu dosya HICBIR SMS ya da bildirim GONDERMEZ. Form kaydi yalnizca
 * veritabanina yazilir; yazma NOTIFY ile panele anlik duser.
 */
const bcrypt = require('bcryptjs');
const { hepsi, tek, sorgu, islem } = require('./db');

/* ------------------------------------------------------- hiz siniri ---- */
const PENCERE_MS = 10 * 60 * 1000;   // 10 dakika
const AZAMI      = 5;                // ayni IP'den ayni forma 5 gonderim
const sayac = new Map();             // "ip|form" -> [zaman damgalari]

function hizSiniri(form) {
    return (req, res, next) => {
        const anahtar = `${req.ip}|${form}`;
        const simdi = Date.now();
        const gecmis = (sayac.get(anahtar) || []).filter((t) => simdi - t < PENCERE_MS);
        if (gecmis.length >= AZAMI) {
            return res.status(429).json({ success: false,
                error: 'Çok fazla gönderim yaptınız. Lütfen bir süre sonra tekrar deneyiniz.' });
        }
        gecmis.push(simdi);
        sayac.set(anahtar, gecmis);
        next();
    };
}
// Eski kayitlar birikmesin
setInterval(() => {
    const simdi = Date.now();
    for (const [k, v] of sayac) {
        const kalan = v.filter((t) => simdi - t < PENCERE_MS);
        if (kalan.length) sayac.set(k, kalan); else sayac.delete(k);
    }
}, PENCERE_MS).unref();

/* ---------------------------------------------------------- yardimci --- */
const metin = (v, azami = 2000) => {
    const s = String(v ?? '').trim();
    return s ? s.slice(0, azami) : null;
};

/** Telefonu PostgreSQL'deki 10 haneli 5xxxxxxxxx formatina cevirir. */
function telefonNormalize(v) {
    let s = String(v ?? '').replace(/\D/g, '');
    if (!s) return null;
    if (s.length === 12 && s.startsWith('90')) s = s.slice(2);
    if (s.length === 11 && s.startsWith('0')) s = s.slice(1);
    return /^5\d{9}$/.test(s) ? s : null;
}
const suz = (govde, izin) => {
    const c = {};
    for (const k of izin) if (govde[k] !== undefined) c[k] = govde[k];
    return c;
};

/** Eski Ingilizce rol adlarini sistemdeki Turkce rollere cevirir. */
const ROL_ESLEME = {
    student: 'ogrenci', ogrenci: 'ogrenci',
    teacher: 'ogretmen', ogretmen: 'ogretmen',
    parent: 'veli', veli: 'veli',
    personnel: 'personel', personel: 'personel',
};

/** TC kimlik numarasi saglama toplami. */
function tcGecerli(tc) {
    const s = String(tc || '');
    if (!/^[1-9][0-9]{10}$/.test(s)) return false;
    const r = s.split('').map(Number);
    const tek = r[0] + r[2] + r[4] + r[6] + r[8];
    const cift = r[1] + r[3] + r[5] + r[7];
    if ((tek * 7 - cift) % 10 !== r[9]) return false;
    return r.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === r[10];
}

const guncelle = (tablo, izin) => async (req, res, next) => {
    try {
        const v = suz(req.body || {}, izin);
        const kolon = Object.keys(v);
        if (!kolon.length) return res.status(400).json({ success: false, error: 'Geçerli alan yok.' });
        const r = await tek(
            `UPDATE ${tablo} SET ${kolon.map((k, i) => `${k}=$${i + 2}`).join(',')}
              WHERE id=$1 RETURNING *`, [req.params.id, ...Object.values(v)]);
        if (!r) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı.' });
        res.json({ success: true, kayit: r });
    } catch (e) { next(e); }
};
const sil = (tablo) => async (req, res, next) => {
    try { await sorgu(`DELETE FROM ${tablo} WHERE id=$1`, [req.params.id]);
          res.json({ success: true }); } catch (e) { next(e); }
};

module.exports = function webRotalari(app, { verifyAdmin }) {

    /* =================================================== HERKESE ACIK === */

    /** Site acilisinda tum bolum ayarlarini tek istekte alir. */
    app.get('/api/web/ayarlar', async (_q, res, next) => {
        try {
            const s = await hepsi(`SELECT anahtar, veri FROM web_ayarlar`);
            res.json({ success: true, ayarlar: Object.fromEntries(s.map((r) => [r.anahtar, r.veri])) });
        } catch (e) { next(e); }
    });

    app.get('/api/web/ayarlar/:anahtar', async (req, res, next) => {
        try {
            const r = await tek(`SELECT veri FROM web_ayarlar WHERE anahtar=$1`, [req.params.anahtar]);
            res.json({ success: true, veri: r ? r.veri : null });
        } catch (e) { next(e); }
    });

    /**
     * Sitede gosterilecek duyurular.
     * Yalnizca web_yayin isaretli olanlar doner: panelden girilen okul ici
     * duyurular halka acik sayfaya DUSMEZ.
     */
    app.get('/api/web/duyurular', async (_q, res, next) => {
        try { res.json({ success: true, kayitlar: await hepsi(
            `SELECT id, baslik, icerik, kategori, sabit, gorsel, olusturuldu
               FROM duyurular WHERE web_yayin
           ORDER BY sabit DESC, olusturuldu DESC LIMIT 60`) }); }
        catch (e) { next(e); }
    });

    /** Magazada yalnizca yayindaki urunler gorunur. */
    app.get('/api/web/urunler', async (_q, res, next) => {
        try { res.json({ success: true, kayitlar: await hepsi(
            `SELECT id, ad, aciklama, fiyat, eski_fiyat, gorsel, kategori, stok,
                    one_cikan, rozet, bedenler
               FROM magaza_urunleri WHERE yayinda
           ORDER BY one_cikan DESC, kategori, ad`) }); }
        catch (e) { next(e); }
    });

    /* ---- Formlar (girissiz yazma, hiz sinirli) --------------------------- */

    app.post('/api/web/iletisim', hizSiniri('iletisim'), async (req, res, next) => {
        try {
            const { ad, eposta, telefon, konu, mesaj } = req.body || {};
            if (!metin(ad) || !metin(mesaj))
                return res.status(400).json({ success: false, error: 'Ad ve mesaj zorunludur.' });
            const r = await tek(
                `INSERT INTO iletisim_mesajlari (ad, eposta, telefon, konu, mesaj, ip)
                 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, olusturuldu`,
                [metin(ad, 120), metin(eposta, 160), metin(telefon, 40),
                 metin(konu, 160), metin(mesaj, 4000), req.ip]);
            res.json({ success: true, id: r.id });
        } catch (e) { next(e); }
    });

    app.post('/api/web/ik-basvuru', hizSiniri('ik'), async (req, res, next) => {
        try {
            const b = req.body || {};
            if (!metin(b.adSoyad) || !metin(b.telefon))
                return res.status(400).json({ success: false, error: 'Ad soyad ve telefon zorunludur.' });
            const r = await tek(
                `INSERT INTO ik_basvurulari
                    (ad_soyad, eposta, telefon, pozisyon, brans, deneyim, cv_baglanti, notlar, ip)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
                [metin(b.adSoyad, 120), metin(b.eposta, 160), metin(b.telefon, 40),
                 metin(b.pozisyon, 80), metin(b.brans, 80), metin(b.deneyim, 80),
                 metin(b.cvBaglanti, 500), metin(b.notlar, 2000), req.ip]);
            res.json({ success: true, id: r.id });
        } catch (e) { next(e); }
    });

    app.post('/api/web/siparis', hizSiniri('siparis'), async (req, res, next) => {
        try {
            const b = req.body || {};
            const kalemler = Array.isArray(b.kalemler) ? b.kalemler : [];
            if (!kalemler.length)
                return res.status(400).json({ success: false, error: 'Sepet boş.' });
            // Tutar istemciden ALINMAZ; urun fiyatlariyla sunucuda hesaplanir.
            const idler = kalemler.map((k) => Number(k.id)).filter(Number.isFinite);
            const fiyatlar = idler.length
                ? await hepsi(`SELECT id, fiyat FROM magaza_urunleri WHERE id = ANY($1)`, [idler])
                : [];
            const fiyat = new Map(fiyatlar.map((u) => [Number(u.id), Number(u.fiyat)]));
            let tutar = 0;
            for (const k of kalemler) {
                const f = fiyat.get(Number(k.id));
                if (f === undefined) return res.status(400).json({ success: false, error: 'Geçersiz ürün.' });
                tutar += f * Math.max(1, Number(k.adet) || 1);
            }
            const r = await tek(
                `INSERT INTO magaza_siparisleri
                    (musteri_ad, musteri_tel, okul_no, sinif, notlar, kalemler, tutar)
                 VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, tutar`,
                [metin(b.musteriAd, 120), metin(b.musteriTel, 40), metin(b.okulNo, 20),
                 metin(b.sinif, 20), metin(b.notlar, 1000), JSON.stringify(kalemler), tutar]);
            res.json({ success: true, id: r.id, tutar: r.tutar });
        } catch (e) { next(e); }
    });

    /* ---- Kendi kendine kayit -------------------------------------------
       Talep dogrudan hesap ACMAZ; idare onaylayana kadar giris yapilamaz. */
    app.post('/api/auth/register', hizSiniri('kayit'), async (req, res, next) => {
        try {
            const b = req.body || {};
            const ad = metin(b.name || b.adSoyad, 120);
            const parola = String(b.password || b.parola || '');
            if (!ad)               return res.status(400).json({ success: false, error: 'Ad soyad zorunludur.' });
            if (parola.length < 8) return res.status(400).json({ success: false, error: 'Şifre en az 8 karakter olmalı.' });

            const tc = metin(b.tc_kimlik || b.tc, 11);
            if (tc && !tcGecerli(tc))
                return res.status(400).json({ success: false, error: 'TC kimlik numarası geçersiz.' });

            const eposta = metin(b.email || b.eposta, 160);
            const telefonGirdisi = metin(b.phone || b.telefon, 80);
            const telefon = telefonNormalize(telefonGirdisi);
            if (telefonGirdisi && !telefon)
                return res.status(400).json({ success: false, error: 'Telefon numarası geçersiz.' });
            // Zaten kayitli bir kisi icin talep alinmaz; ayni kisi iki hesap acamaz.
            if (eposta || tc) {
                const varOlan = await tek(
                    `SELECT 1 FROM kisiler
                      WHERE ($1::text IS NOT NULL AND lower(eposta) = lower($1))
                         OR ($2::text IS NOT NULL AND tc = $2) LIMIT 1`, [eposta, tc]);
                if (varOlan) return res.status(409).json({ success: false,
                    error: 'Bu bilgilerle kayıtlı bir hesap zaten var. Şifrenizi sıfırlayabilirsiniz.' });
            }
            const bekleyen = await tek(
                `SELECT 1 FROM kayit_talepleri WHERE durum = 'bekliyor'
                   AND (($1::text IS NOT NULL AND lower(eposta) = lower($1))
                     OR ($2::text IS NOT NULL AND tc = $2)) LIMIT 1`, [eposta, tc]);
            if (bekleyen) return res.status(409).json({ success: false,
                error: 'Kaydınız zaten onay bekliyor.' });

            // Rol yalnizca TALEPTIR; yetkiyi idare verir.
            const rol = ROL_ESLEME[String(b.role || b.rol || '').toLowerCase()] || 'ogrenci';

            const r = await tek(
                `INSERT INTO kayit_talepleri
                    (ad_soyad, tc, eposta, telefon, okul_no, sinif, sube, bolum,
                     istenen_rol, parola_hash, ip)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
                [ad, tc, eposta, telefon,
                 metin(b.schoolNumber || b.okulNo, 20), metin(b.classId || b.sinif, 20),
                 metin(b.section || b.sube, 10), metin(b.department || b.bolum, 80),
                 rol, await bcrypt.hash(parola, 12), req.ip]);

            res.json({ success: true, id: r.id,
                message: 'Kaydınız alındı. İdare onayından sonra giriş yapabilirsiniz.' });
        } catch (e) { next(e); }
    });

    /* ======================================================== YONETIM === */

    app.get('/api/web/yonetim/kayit-talepleri', verifyAdmin, async (_q, res, next) => {
        try { res.json({ success: true, kayitlar: await hepsi(
            `SELECT id, ad_soyad, tc, eposta, telefon, okul_no, sinif, sube, bolum,
                    istenen_rol, durum, aciklama, olusturuldu, karar_tarihi
               FROM kayit_talepleri ORDER BY
                    CASE durum WHEN 'bekliyor' THEN 0 ELSE 1 END, olusturuldu DESC
              LIMIT 500`) }); }
        catch (e) { next(e); }
    });

    /** Onay: gercek kisi + kimlik + rol tek islemde olusturulur. */
    app.post('/api/web/yonetim/kayit-talepleri/:id/onayla', verifyAdmin, async (req, res, next) => {
        try {
            const t = await tek(`SELECT * FROM kayit_talepleri WHERE id = $1`, [req.params.id]);
            if (!t) return res.status(404).json({ success: false, error: 'Talep bulunamadı.' });
            if (t.durum !== 'bekliyor')
                return res.status(409).json({ success: false, error: 'Bu talep zaten sonuçlandırılmış.' });

            // Rol istemciden degil, idarenin gonderdigi degerden ya da talepten alinir.
            const rol = ROL_ESLEME[String(req.body?.rol || '').toLowerCase()] || t.istenen_rol;
            const [ad, ...kalan] = String(t.ad_soyad).trim().split(/\s+/);
            const soyad = kalan.join(' ') || '-';
            const telefon = telefonNormalize(t.telefon);

            const kisi = await islem(async (c) => {
                /*
                 * Daha once panelden olusturulmus bir hesap icin yeniden
                 * kisi/kimlik acma. Bu, ayni kisinin e-posta/TC/telefon
                 * farkiyla tekrar kayit olmasinda da onay akisinin 23505 ile
                 * kilitlenmesini engeller. Eslesme varsa mevcut hesap korunur,
                 * yalnizca talep onaylandi olarak kapatilir.
                 */
                const mevcut = (await c.query(
                    `SELECT k.id
                       FROM kisiler k
                       LEFT JOIN kisi_rolleri kr ON kr.kisi_id = k.id
                      WHERE (($1::text IS NOT NULL AND NULLIF(btrim(k.eposta), '') IS NOT NULL
                                  AND lower(k.eposta) = lower($1))
                          OR ($2::text IS NOT NULL AND NULLIF(btrim(k.tc), '') IS NOT NULL
                                  AND btrim(k.tc) = btrim($2))
                          OR ($3::text IS NOT NULL AND NULLIF(btrim(k.telefon), '') IS NOT NULL
                                  AND btrim(k.telefon) = btrim($3))
                          OR (upper(k.tam_ad) = upper($4) AND kr.rol = $5))
                      ORDER BY CASE
                          WHEN lower(k.eposta) = lower($1) THEN 0
                          WHEN btrim(k.tc) = btrim($2) THEN 1
                          WHEN btrim(k.telefon) = btrim($3) THEN 2
                          ELSE 3 END
                      LIMIT 1
                      FOR UPDATE OF k`,
                    [t.eposta, t.tc, telefon, t.ad_soyad, rol])).rows[0];

                if (mevcut) {
                    await c.query(`INSERT INTO kisi_rolleri (kisi_id, rol)
                                   VALUES ($1,$2) ON CONFLICT DO NOTHING`, [mevcut.id, rol]);
                    await c.query(
                        `UPDATE kayit_talepleri
                            SET durum='onaylandi', karar_veren=$2, karar_tarihi=now()
                          WHERE id=$1`, [t.id, req.user?.kisi_id || null]);
                    return { id: mevcut.id, reused: true };
                }

                const k = (await c.query(
                    `INSERT INTO kisiler (ad, soyad, tc, telefon, eposta)
                     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
                    [ad, soyad, t.tc, telefon, t.eposta])).rows[0];
                await c.query(`INSERT INTO kimlik (kisi_id, kullanici_adi, parola_hash)
                               VALUES ($1,$2,$3)`,
                              [k.id, t.eposta || t.okul_no || t.tc || String(k.id), t.parola_hash]);
                await c.query(`INSERT INTO kisi_rolleri (kisi_id, rol) VALUES ($1,$2)
                               ON CONFLICT DO NOTHING`, [k.id, rol]);
                await c.query(
                    `UPDATE kayit_talepleri
                        SET durum='onaylandi', karar_veren=$2, karar_tarihi=now()
                      WHERE id=$1`, [t.id, req.user?.kisi_id || null]);
                return k;
            });
            res.json({ success: true, kisi_id: kisi.id, rol, mevcut_hesap: Boolean(kisi.reused) });
        } catch (e) { next(e); }
    });

    app.put('/api/web/yonetim/kayit-talepleri/:id', verifyAdmin, async (req, res, next) => {
        try {
            const durum = req.body?.durum == null ? null : String(req.body.durum);
            if (durum !== null && !['bekliyor', 'onaylandi', 'reddedildi'].includes(durum))
                return res.status(400).json({ success: false, error: 'Geçersiz talep durumu.' });
            const r = await tek(
                `UPDATE kayit_talepleri
                    SET durum = COALESCE($2, durum), aciklama = COALESCE($3, aciklama),
                        karar_veren = $4, karar_tarihi = now()
                  WHERE id = $1 RETURNING id, durum`,
                [req.params.id, durum, req.body?.aciklama || null,
                 req.user?.kisi_id || null]);
            if (!r) return res.status(404).json({ success: false, error: 'Talep bulunamadı.' });
            res.json({ success: true, kayit: r });
        } catch (e) { next(e); }
    });
    app.delete('/api/web/yonetim/kayit-talepleri/:id', verifyAdmin, sil('kayit_talepleri'));


    app.put('/api/web/yonetim/ayarlar/:anahtar', verifyAdmin, async (req, res, next) => {
        try {
            const veri = req.body?.veri ?? req.body ?? {};
            const r = await tek(
                `INSERT INTO web_ayarlar (anahtar, veri) VALUES ($1,$2)
                 ON CONFLICT (anahtar) DO UPDATE SET veri = EXCLUDED.veri, guncellendi = now()
                 RETURNING *`, [req.params.anahtar, JSON.stringify(veri)]);
            res.json({ success: true, kayit: r });
        } catch (e) { next(e); }
    });

    app.get('/api/web/yonetim/iletisim', verifyAdmin, async (_q, res, next) => {
        try { res.json({ success: true, kayitlar: await hepsi(
            `SELECT * FROM iletisim_mesajlari ORDER BY olusturuldu DESC LIMIT 500`) }); }
        catch (e) { next(e); }
    });
    app.put   ('/api/web/yonetim/iletisim/:id', verifyAdmin, guncelle('iletisim_mesajlari', ['durum']));
    app.delete('/api/web/yonetim/iletisim/:id', verifyAdmin, sil('iletisim_mesajlari'));

    app.get('/api/web/yonetim/ik-basvuru', verifyAdmin, async (_q, res, next) => {
        try { res.json({ success: true, kayitlar: await hepsi(
            `SELECT * FROM ik_basvurulari ORDER BY olusturuldu DESC LIMIT 500`) }); }
        catch (e) { next(e); }
    });
    app.put   ('/api/web/yonetim/ik-basvuru/:id', verifyAdmin, guncelle('ik_basvurulari', ['durum', 'notlar']));
    app.delete('/api/web/yonetim/ik-basvuru/:id', verifyAdmin, sil('ik_basvurulari'));

    app.get('/api/web/yonetim/urunler', verifyAdmin, async (_q, res, next) => {
        try { res.json({ success: true, kayitlar: await hepsi(
            `SELECT * FROM magaza_urunleri ORDER BY kategori, ad`) }); }
        catch (e) { next(e); }
    });
    app.post('/api/web/yonetim/urunler', verifyAdmin, async (req, res, next) => {
        try {
            const v = suz(req.body || {}, ['ad','aciklama','fiyat','eski_fiyat','gorsel','kategori','stok','yayinda','one_cikan','rozet','bedenler']);
            if (!v.ad) return res.status(400).json({ success: false, error: 'Ürün adı zorunludur.' });
            const kolon = Object.keys(v);
            const r = await tek(
                `INSERT INTO magaza_urunleri (${kolon.join(',')})
                 VALUES (${kolon.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`,
                Object.values(v));
            res.json({ success: true, kayit: r });
        } catch (e) { next(e); }
    });
    app.put   ('/api/web/yonetim/urunler/:id', verifyAdmin,
               guncelle('magaza_urunleri', ['ad','aciklama','fiyat','eski_fiyat','gorsel','kategori','stok','yayinda','one_cikan','rozet','bedenler']));
    app.delete('/api/web/yonetim/urunler/:id', verifyAdmin, sil('magaza_urunleri'));

    app.get('/api/web/yonetim/siparisler', verifyAdmin, async (_q, res, next) => {
        try { res.json({ success: true, kayitlar: await hepsi(
            `SELECT * FROM magaza_siparisleri ORDER BY olusturuldu DESC LIMIT 500`) }); }
        catch (e) { next(e); }
    });
    app.put('/api/web/yonetim/siparisler/:id', verifyAdmin, guncelle('magaza_siparisleri', ['durum','notlar']));
};
