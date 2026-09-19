/**
 * KALAN ALAN ROTALARI
 *
 * Duyuru, randevu, ders programi, yemekhane, servis, mesajlasma, bildirim.
 * Hepsi Postgres'e yazar; her yazma LISTEN/NOTIFY ile socket.io'ya duser,
 * yani ekranlar Firestore onSnapshot'i gibi anlik guncellenir.
 *
 * Kolon listeleri ACIKCA yazilir. Istemciden gelen govdeyi oldugu gibi
 * tabloya gecirmek (generic passthrough) yetki asimina acik kapi birakirdi.
 */
const { hepsi, tek, sorgu } = require('./db');

/** Yalnizca izin verilen kolonlari alir; digerlerini sessizce atar. */
const suz = (govde, izin) => {
    const c = {};
    for (const k of izin) if (govde[k] !== undefined) c[k] = govde[k];
    return c;
};

const ekle = (tablo, izin) => async (req, res, next) => {
    try {
        const v = suz(req.body || {}, izin);
        const kolon = Object.keys(v);
        if (!kolon.length) return res.status(400).json({ success: false, error: 'Gecerli alan yok.' });
        const r = await tek(
            `INSERT INTO ${tablo} (${kolon.join(',')})
             VALUES (${kolon.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`,
            Object.values(v));
        res.json({ success: true, kayit: r });
    } catch (e) { next(e); }
};

const guncelle = (tablo, izin, anahtar = 'id') => async (req, res, next) => {
    try {
        const v = suz(req.body || {}, izin);
        const kolon = Object.keys(v);
        if (!kolon.length) return res.status(400).json({ success: false, error: 'Gecerli alan yok.' });
        const r = await tek(
            `UPDATE ${tablo} SET ${kolon.map((k, i) => `${k}=$${i + 2}`).join(',')}
              WHERE ${anahtar}=$1 RETURNING *`,
            [req.params.id, ...Object.values(v)]);
        if (!r) return res.status(404).json({ success: false, error: 'Kayit bulunamadi.' });
        res.json({ success: true, kayit: r });
    } catch (e) { next(e); }
};

const sil = (tablo, anahtar = 'id') => async (req, res, next) => {
    try {
        await sorgu(`DELETE FROM ${tablo} WHERE ${anahtar}=$1`, [req.params.id]);
        res.json({ success: true });
    } catch (e) { next(e); }
};

module.exports = function rotalariBagla(app, { verifyAuth, verifyAdmin }) {

    /* --------------------------------------------------------- DUYURU --- */
    app.get('/api/duyurular', verifyAuth, async (_q, r, n) => {
        try { r.json({ success: true, kayitlar: await hepsi(
            `SELECT d.*, k.tam_ad AS yazar FROM duyurular d
          LEFT JOIN kisiler k ON k.id=d.yazar_id
           ORDER BY d.sabit DESC, d.olusturuldu DESC LIMIT 200`) }); } catch (e) { n(e); } });
    app.post('/api/duyurular',       verifyAdmin, ekle('duyurular', ['baslik','icerik','kategori','hedef','sabit','yazar_id','web_yayin','gorsel']));
    app.put('/api/duyurular/:id',    verifyAdmin, guncelle('duyurular', ['baslik','icerik','kategori','hedef','sabit','web_yayin','gorsel']));
    app.delete('/api/duyurular/:id', verifyAdmin, sil('duyurular'));

    /* -------------------------------------------------------- RANDEVU --- */
    app.get('/api/randevular', verifyAuth, async (_q, r, n) => {
        try { r.json({ success: true, kayitlar: await hepsi(
            `SELECT ra.*, v.tam_ad AS veli, o.tam_ad AS ogretmen, s.tam_ad AS ogrenci,
                    m.tam_ad AS muhatap
               FROM randevular ra
          LEFT JOIN kisiler v ON v.id=ra.veli_id
          LEFT JOIN kisiler o ON o.id=ra.ogretmen_id
          LEFT JOIN kisiler s ON s.id=ra.ogrenci_id
          LEFT JOIN kisiler m ON m.id=ra.muhatap_id
           ORDER BY ra.tarih DESC, ra.saat DESC LIMIT 300`) }); } catch (e) { n(e); } });
    app.post('/api/randevular',       verifyAuth,  ekle('randevular', ['muhatap_id','muhatap_turu','veli_id','ogretmen_id','ogrenci_id','tarih','saat','durum','not_']));
    app.put('/api/randevular/:id',    verifyAuth,  guncelle('randevular', ['muhatap_id','muhatap_turu','veli_id','ogretmen_id','ogrenci_id','tarih','saat','durum','not_']));
    app.delete('/api/randevular/:id', verifyAdmin, sil('randevular'));

    /* -------------------------------------------------- DERS PROGRAMI --- */
    app.get('/api/ders-programi', verifyAuth, async (req, r, n) => {
        try {
            const { sinif, ogretmen } = req.query;
            r.json({ success: true, kayitlar: await hepsi(
                `SELECT dp.*, s.ad AS sinif_ad, k.tam_ad AS ogretmen_ad
                   FROM ders_programi dp
              LEFT JOIN siniflar s ON s.id=dp.sinif_id
              LEFT JOIN kisiler  k ON k.id=dp.ogretmen_id
                  WHERE ($1::text IS NULL OR s.ad = $1)
                    AND ($2::bigint IS NULL OR dp.ogretmen_id = $2)
               ORDER BY dp.gun, dp.baslangic`, [sinif || null, ogretmen || null]) });
        } catch (e) { n(e); } });
    app.post('/api/ders-programi',       verifyAdmin, ekle('ders_programi', ['sinif_id','ogretmen_id','gun','baslangic','bitis','ders','derslik']));
    app.put('/api/ders-programi/:id',    verifyAdmin, guncelle('ders_programi', ['sinif_id','ogretmen_id','gun','baslangic','bitis','ders','derslik']));
    app.delete('/api/ders-programi/:id', verifyAdmin, sil('ders_programi'));

    /* ------------------------------------------------------ YEMEKHANE --- */
    app.get('/api/yemek', verifyAuth, async (_q, r, n) => {
        try { r.json({ success: true, kayitlar: await hepsi(
            `SELECT * FROM yemek_menu WHERE tarih >= current_date - 7 ORDER BY tarih`) }); } catch (e) { n(e); } });
    app.post('/api/yemek', verifyAdmin, async (req, r, n) => {
        try {
            const v = suz(req.body || {}, ['tarih','corba','ana_yemek','yan_yemek','tatli','kalori','alerjenler']);
            const kolon = Object.keys(v);
            r.json({ success: true, kayit: await tek(
                `INSERT INTO yemek_menu (${kolon.join(',')}) VALUES (${kolon.map((_,i)=>'$'+(i+1)).join(',')})
                 ON CONFLICT (tarih) DO UPDATE SET ${kolon.filter(k=>k!=='tarih').map(k=>`${k}=EXCLUDED.${k}`).join(',')}
                 RETURNING *`, Object.values(v)) });
        } catch (e) { n(e); } });

    /* --------------------------------------------------------- SERVIS --- */
    app.get('/api/servisler', verifyAuth, async (_q, r, n) => {
        try { r.json({ success: true, kayitlar: await hepsi(`SELECT * FROM servisler ORDER BY guzergah`) }); } catch (e) { n(e); } });
    app.post('/api/servisler',       verifyAdmin, ekle('servisler', ['guzergah','plaka','surucu','surucu_tel','kapasite','aktif','detay']));
    app.put('/api/servisler/:id',    verifyAdmin, guncelle('servisler', ['guzergah','plaka','surucu','surucu_tel','kapasite','aktif','detay']));
    app.delete('/api/servisler/:id', verifyAdmin, sil('servisler'));

    /* ------------------------------------------------------- BILDIRIM --- */
    /* Yalnizca uygulama ici bildirim yazar. SMS/WhatsApp bu uctan GITMEZ;
       gonderim netgsmService icindeki kilitle ayrica engellidir. */
    app.get('/api/bildirimler', verifyAuth, async (_q, r, n) => {
        try { r.json({ success: true, kayitlar: await hepsi(
            `SELECT b.*, k.tam_ad AS gonderen FROM bildirimler b
          LEFT JOIN kisiler k ON k.id=b.gonderen_id
           ORDER BY b.zaman DESC LIMIT 200`) }); } catch (e) { n(e); } });
    app.post('/api/bildirimler', verifyAdmin, ekle('bildirimler', ['baslik','mesaj','hedef','kanal','gonderen_id']));

    /* ------------------------------------------------------- MESAJLAR --- */
    app.get('/api/sohbetler', verifyAuth, async (req, r, n) => {
        try { r.json({ success: true, kayitlar: await hepsi(
            `SELECT s.*, sk.okunmamis,
                    (SELECT k2.kisi_id FROM sohbet_katilimci k2
                      WHERE k2.sohbet_id = s.id AND k2.kisi_id <> $1 LIMIT 1) AS karsi_kisi_id,
                    sm.icerik AS son_mesaj, sm.zaman AS son_mesaj_zaman, sm.gonderen_id AS son_mesaj_gonderen
               FROM sohbetler s
               JOIN sohbet_katilimci sk ON sk.sohbet_id=s.id AND sk.kisi_id=$1
          LEFT JOIN LATERAL (SELECT icerik, zaman, gonderen_id FROM mesajlar m
                              WHERE m.sohbet_id = s.id ORDER BY m.zaman DESC, m.id DESC LIMIT 1) sm ON true
           ORDER BY s.guncellendi DESC`, [req.user.kisi_id]) }); } catch (e) { n(e); } });
    /** Sohbeti okundu isaretle: cagiranin okunmamis sayaci sifirlanir. */
    app.post('/api/sohbetler/:id/okundu', verifyAuth, async (req, r, n) => {
        try {
            await sorgu(`UPDATE sohbet_katilimci SET okunmamis = 0 WHERE sohbet_id=$1 AND kisi_id=$2`,
                        [req.params.id, req.user.kisi_id]);
            r.json({ success: true });
        } catch (e) { n(e); } });
    /**
     * Sohbet ac ya da var olani getir.
     * Iki kisi arasinda ikinci bir sohbet ACILMAZ; ayni ikili icin hep ayni
     * sohbet dondurulur, yoksa mesajlar iki ayri yere bolunurdu.
     */
    app.post('/api/sohbetler', verifyAuth, async (req, r, n) => {
        try {
            const digerId = Number(req.body?.kisiId);
            if (!digerId) return r.status(400).json({ success: false, error: 'Karsi taraf gerekli.' });
            if (digerId === Number(req.user.kisi_id))
                return r.status(400).json({ success: false, error: 'Kendinizle sohbet acamazsiniz.' });

            const mevcut = await tek(
                `SELECT s.* FROM sohbetler s
                   JOIN sohbet_katilimci a ON a.sohbet_id = s.id AND a.kisi_id = $1
                   JOIN sohbet_katilimci b ON b.sohbet_id = s.id AND b.kisi_id = $2
                  LIMIT 1`, [req.user.kisi_id, digerId]);
            if (mevcut) return r.json({ success: true, kayit: mevcut, yeni: false });

            const sohbet = await tek(`INSERT INTO sohbetler DEFAULT VALUES RETURNING *`);
            await sorgu(`INSERT INTO sohbet_katilimci (sohbet_id, kisi_id) VALUES ($1,$2),($1,$3)`,
                        [sohbet.id, req.user.kisi_id, digerId]);
            r.json({ success: true, kayit: sohbet, yeni: true });
        } catch (e) { n(e); }
    });

    app.get('/api/sohbetler/:id/mesajlar', verifyAuth, async (req, r, n) => {
        try {
            const uye = await tek(`SELECT 1 FROM sohbet_katilimci WHERE sohbet_id=$1 AND kisi_id=$2`,
                                  [req.params.id, req.user.kisi_id]);
            if (!uye) return r.status(403).json({ success: false, error: 'Bu sohbete erisiminiz yok.' });
            r.json({ success: true, kayitlar: await hepsi(
                `SELECT m.*, k.tam_ad AS gonderen FROM mesajlar m
              LEFT JOIN kisiler k ON k.id=m.gonderen_id
                  WHERE m.sohbet_id=$1 ORDER BY m.zaman LIMIT 500`, [req.params.id]) });
        } catch (e) { n(e); } });
    app.post('/api/sohbetler/:id/mesajlar', verifyAuth, async (req, r, n) => {
        try {
            const uye = await tek(`SELECT 1 FROM sohbet_katilimci WHERE sohbet_id=$1 AND kisi_id=$2`,
                                  [req.params.id, req.user.kisi_id]);
            if (!uye) return r.status(403).json({ success: false, error: 'Bu sohbete erisiminiz yok.' });
            const m = await tek(`INSERT INTO mesajlar (sohbet_id, gonderen_id, icerik) VALUES ($1,$2,$3) RETURNING *`,
                                [req.params.id, req.user.kisi_id, String(req.body?.icerik || '').slice(0, 4000)]);
            await sorgu(`UPDATE sohbetler SET guncellendi=now() WHERE id=$1`, [req.params.id]);
            // Karsi tarafin okunmamis rozeti; gonderenin kendi sayaci degismez.
            await sorgu(`UPDATE sohbet_katilimci SET okunmamis = COALESCE(okunmamis, 0) + 1
                          WHERE sohbet_id=$1 AND kisi_id<>$2`, [req.params.id, req.user.kisi_id]);
            r.json({ success: true, kayit: m });
        } catch (e) { n(e); } });

    /* ---------------------------------------------------------- AYAR ---- */
    app.get('/api/ayarlar', verifyAuth, async (_q, r, n) => {
        try {
            const s = await hepsi(`SELECT anahtar, deger FROM ayarlar`);
            r.json({ success: true, ayarlar: Object.fromEntries(s.map(x => [x.anahtar, x.deger])) });
        } catch (e) { n(e); } });
    app.put('/api/ayarlar/:anahtar', verifyAdmin, async (req, r, n) => {
        try {
            r.json({ success: true, kayit: await tek(
                `INSERT INTO ayarlar (anahtar, deger) VALUES ($1,$2)
                 ON CONFLICT (anahtar) DO UPDATE SET deger=$2, guncellendi=now() RETURNING *`,
                [req.params.anahtar, JSON.stringify(req.body?.deger ?? req.body)]) });
        } catch (e) { n(e); } });

    /* -------------------------------------------------------- SINIFLAR -- */
    /* ------------------------------------------------- GUVENLIK LOG --- */
    app.get('/api/guvenlik-log', verifyAdmin, async (req, r, n) => {
        try {
            const limit = Math.min(Number(req.query.limit) || 500, 2000);
            r.json({ success: true, kayitlar: await hepsi(
                `SELECT g.*, k.tam_ad FROM guvenlik_log g
              LEFT JOIN kisiler k ON k.id = g.kisi_id
                 ORDER BY g.zaman DESC LIMIT $1`, [limit]) });
        } catch (e) { n(e); }
    });

    /* -------------------------------------- YEMEK: duzenle / sil ------- */
    /* yemek_menu'nun ayri id kolonu yok; bir gunun menusu tarih PK'sidir. */
    app.put('/api/yemek/:id',    verifyAdmin,
            guncelle('yemek_menu', ['tarih','corba','ana_yemek','yan_yemek','tatli','kalori','alerjenler'], 'tarih'));
    app.delete('/api/yemek/:id', verifyAdmin, sil('yemek_menu', 'tarih'));

    /* --------------------------------------------- SINIF YONETIMI ------ */
    app.post('/api/siniflar',       verifyAdmin, ekle('siniflar', ['ad','seviye','sube']));
    app.put('/api/siniflar/:id',    verifyAdmin, guncelle('siniflar', ['ad','seviye','sube']));
    app.delete('/api/siniflar/:id', verifyAdmin, sil('siniflar'));

    app.get('/api/siniflar', verifyAuth, async (_q, r, n) => {
        try { r.json({ success: true, kayitlar: await hepsi(
            `SELECT s.*, count(o.kisi_id) AS ogrenci_sayisi FROM siniflar s
          LEFT JOIN ogrenciler o ON o.sinif_id=s.id
           GROUP BY s.id ORDER BY s.seviye, s.sube`) }); } catch (e) { n(e); } });
};
