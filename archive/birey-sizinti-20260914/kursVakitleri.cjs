/**
 * KURS MERKEZI VAKITLERI VE OZEL GELIS SAATLERI MODULU
 * 
 * Kurs merkezinin coklu vardiya (Sabah Grubu / Aksam Grubu) ve
 * ogrenci bazli bireysel giris-cikis-mola saatlerini yonetir.
 * 
 * SMS GUVENLIK KURALI:
 * Kullanicinin kesin talimati geregi SMS gonderimi sistem genelinde
 * KILITLIDIR. Canli izlemede SMS taslaklari yalnizca simulasyon
 * ve onizleme olarak gosterilir; disari fiziksel SMS ATILMAZ.
 */

const { hepsi, tek, sorgu } = require('./db');

module.exports = function attachKursVakitleri(app, { verifyAdmin, verifyAuth, yoklama, denemeGunleri }) {
    // 1. Gruplari listele
    app.get('/api/vakitler/gruplar', verifyAuth, async (_req, res) => {
        try {
            const rows = await hepsi(`
                SELECT * FROM kurs_vardiyalari
                 ORDER BY CASE WHEN id='sabah' THEN 1 WHEN id='aksam' THEN 2 ELSE 3 END, ad ASC`);
            res.json({ success: true, gruplar: rows });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 2. Grup kaydet / guncelle
    app.put('/api/vakitler/gruplar', verifyAdmin, async (req, res) => {
        try {
            const g = req.body || {};
            if (!g.id || !g.ad || !g.sabah_giris || !g.okul_cikis) {
                return res.status(400).json({ success: false, error: 'Grup kimliği, adı, giriş ve çıkış saatleri zorunludur.' });
            }
            const r = await tek(`
                INSERT INTO kurs_vardiyalari (
                    id, ad, sabah_giris, sabah_musaade_dk,
                    ogle_cikis, ogle_musaade_dk, ogleden_sonra_giris, ogleden_sonra_musaade_dk,
                    okul_cikis, kesilme_saati, aktif, varsayilan, guncellendi
                ) VALUES (
                    $1, $2, $3, COALESCE($4, 15),
                    $5, COALESCE($6, 10), $7, COALESCE($8, 15),
                    $9, COALESCE($10, $9), COALESCE($11, true), COALESCE($12, false), now()
                )
                ON CONFLICT (id) DO UPDATE SET
                    ad = EXCLUDED.ad,
                    sabah_giris = EXCLUDED.sabah_giris,
                    sabah_musaade_dk = EXCLUDED.sabah_musaade_dk,
                    ogle_cikis = EXCLUDED.ogle_cikis,
                    ogle_musaade_dk = EXCLUDED.ogle_musaade_dk,
                    ogleden_sonra_giris = EXCLUDED.ogleden_sonra_giris,
                    ogleden_sonra_musaade_dk = EXCLUDED.ogleden_sonra_musaade_dk,
                    okul_cikis = EXCLUDED.okul_cikis,
                    kesilme_saati = EXCLUDED.kesilme_saati,
                    aktif = EXCLUDED.aktif,
                    varsayilan = EXCLUDED.varsayilan,
                    guncellendi = now()
                RETURNING *
            `, [
                g.id, g.ad, g.sabah_giris, g.sabah_musaade_dk,
                g.ogle_cikis, g.ogle_musaade_dk, g.ogleden_sonra_giris, g.ogleden_sonra_musaade_dk,
                g.okul_cikis, g.kesilme_saati || g.okul_cikis, g.aktif !== false, Boolean(g.varsayilan)
            ]);
            yoklama.onbellegiDusur();
            res.json({ success: true, grup: r });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 3. Grup sil
    app.delete('/api/vakitler/gruplar/:id', verifyAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            if (['sabah', 'aksam'].includes(id)) {
                return res.status(400).json({ success: false, error: 'Sabah ve Akşam ana grupları silinemez.' });
            }
            await sorgu(`UPDATE ogrenci_vakitleri SET vardiya_id = 'sabah' WHERE vardiya_id = $1`, [id]);
            await sorgu(`DELETE FROM kurs_vardiyalari WHERE id = $1`, [id]);
            yoklama.onbellegiDusur();
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 4. Tum ogrencilerin vakit ve grup durumunu listele
    app.get('/api/vakitler/ogrenciler', verifyAuth, async (_req, res) => {
        try {
            const rows = await hepsi(`
                SELECT u.kisi_id, u.full_name, u.school_number, u.class_info, u.branch,
                       u.parent_phone, u.phone,
                       COALESCE(ov.vardiya_id, 'sabah') AS vardiya_id,
                       COALESCE(v.ad, 'Sabah Grubu') AS vardiya_adi,
                       COALESCE(ov.bireysel_aktif, false) AS bireysel_aktif,
                       ov.ozel_giris, ov.ozel_cikis, ov.ozel_mola_baslangic, ov.ozel_mola_bitis,
                       ov.ozel_tolerans_dk, ov.ozel_kesilme_saati, ov.gecerli_gunler, ov.aciklama,
                       v.sabah_giris AS grup_giris, v.okul_cikis AS grup_cikis,
                       v.sabah_musaade_dk AS grup_tolerans, v.kesilme_saati AS grup_kesilme
                  FROM api_users u
             LEFT JOIN ogrenci_vakitleri ov ON ov.kisi_id = u.kisi_id
             LEFT JOIN kurs_vardiyalari v ON v.id = COALESCE(ov.vardiya_id, 'sabah')
                 WHERE 'ogrenci' = ANY(u.roles)
              ORDER BY u.class_info, u.full_name
            `);
            res.json({ success: true, ogrenciler: rows });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 5. Tek ogrenci icin grup ve ozel vakit kaydet
    app.put('/api/vakitler/ogrenci/:kisiId', verifyAdmin, async (req, res) => {
        try {
            const kisiId = req.params.kisiId;
            const b = req.body || {};
            const r = await tek(`
                INSERT INTO ogrenci_vakitleri (
                    kisi_id, vardiya_id, bireysel_aktif,
                    ozel_giris, ozel_cikis, ozel_mola_baslangic, ozel_mola_bitis,
                    ozel_tolerans_dk, ozel_kesilme_saati, gecerli_gunler, aciklama, guncellendi
                ) VALUES (
                    $1, COALESCE($2, 'sabah'), COALESCE($3, false),
                    $4, $5, $6, $7,
                    COALESCE($8, 15), $9, COALESCE($10, ARRAY['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi']),
                    $11, now()
                )
                ON CONFLICT (kisi_id) DO UPDATE SET
                    vardiya_id = EXCLUDED.vardiya_id,
                    bireysel_aktif = EXCLUDED.bireysel_aktif,
                    ozel_giris = EXCLUDED.ozel_giris,
                    ozel_cikis = EXCLUDED.ozel_cikis,
                    ozel_mola_baslangic = EXCLUDED.ozel_mola_baslangic,
                    ozel_mola_bitis = EXCLUDED.ozel_mola_bitis,
                    ozel_tolerans_dk = EXCLUDED.ozel_tolerans_dk,
                    ozel_kesilme_saati = EXCLUDED.ozel_kesilme_saati,
                    gecerli_gunler = EXCLUDED.gecerli_gunler,
                    aciklama = EXCLUDED.aciklama,
                    guncellendi = now()
                RETURNING *
            `, [
                kisiId, b.vardiya_id || 'sabah', Boolean(b.bireysel_aktif),
                b.ozel_giris || null, b.ozel_cikis || null,
                b.ozel_mola_baslangic || null, b.ozel_mola_bitis || null,
                b.ozel_tolerans_dk || 15, b.ozel_kesilme_saati || null,
                b.gecerli_gunler || null, b.aciklama || null
            ]);
            yoklama.onbellegiDusur();
            res.json({ success: true, kayit: r });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 6. Toplu atama (secilen ogrencilere veya siniflara grup ata)
    app.post('/api/vakitler/toplu-ata', verifyAdmin, async (req, res) => {
        try {
            const { kisi_ids = [], siniflar = [], vardiya_id = 'sabah' } = req.body || {};
            let targets = [...new Set(kisi_ids.map(String))];
            if (siniflar.length > 0) {
                const classStudents = await hepsi(`
                    SELECT kisi_id FROM api_users
                     WHERE 'ogrenci' = ANY(roles) AND (class_info = ANY($1) OR branch = ANY($1))
                `, [siniflar]);
                for (const s of classStudents) targets.push(String(s.kisi_id));
                targets = [...new Set(targets)];
            }
            if (targets.length === 0) {
                return res.status(400).json({ success: false, error: 'Atanacak en az bir öğrenci veya sınıf seçin.' });
            }

            for (const kid of targets) {
                await sorgu(`
                    INSERT INTO ogrenci_vakitleri (kisi_id, vardiya_id, guncellendi)
                    VALUES ($1, $2, now())
                    ON CONFLICT (kisi_id) DO UPDATE SET
                        vardiya_id = EXCLUDED.vardiya_id,
                        guncellendi = now()
                `, [kid, vardiya_id]);
            }
            yoklama.onbellegiDusur();
            res.json({ success: true, count: targets.length });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // 7. Canli Saat & SMS Simulasyon Durumu
    app.get('/api/vakitler/canli-durum', verifyAuth, async (_req, res) => {
        try {
            const cfg = await yoklama.ayarlariAl();
            const simdi = new Date();
            const bugun = yoklama.gunAnahtari(simdi, cfg.saatDilimi);
            const dk = yoklama.dakikaDilimde(simdi, cfg.saatDilimi);

            const ogrenciler = await hepsi(`
                SELECT u.kisi_id, u.full_name, u.school_number, u.class_info, u.branch,
                       u.parent_phone, u.phone
                  FROM api_users u
                 WHERE 'ogrenci' = ANY(u.roles)
                 ORDER BY u.class_info, u.full_name
            `);

            const gecisler = await hepsi(`
                SELECT kisi_id, yon, zaman, TO_CHAR(zaman AT TIME ZONE $1, 'HH24:MI') as saat
                  FROM gecisler
                 WHERE tarih = $2::date
                 ORDER BY zaman ASC
            `, [cfg.saatDilimi || 'Europe/Istanbul', bugun]);

            const gecisMap = new Map();
            for (const g of gecisler) {
                const kid = String(g.kisi_id);
                if (!gecisMap.has(kid)) gecisMap.set(kid, []);
                gecisMap.get(kid).push(g);
            }

            const liste = [];
            const ozet = {
                toplam: ogrenciler.length,
                sabah: 0,
                aksam: 0,
                bireysel: 0,
                iceride: 0,
                tamamladi: 0,
                gec_giren: 0,
                beklenen: 0,
                devamsiz: 0,
                simulasyon_sms_sayisi: 0,
            };

            for (const o of ogrenciler) {
                const resolved = denemeGunleri.resolveForPerson(cfg, bugun, o);
                const rCfg = resolved.config;
                const p = yoklama.pencereler(rCfg);
                const kisiGecisler = gecisMap.get(String(o.kisi_id)) || [];
                const ilkGiris = kisiGecisler.find(g => g.yon === 'giris');
                const sonCikis = [...kisiGecisler].reverse().find(g => g.yon === 'cikis');
                const iceride = Boolean(ilkGiris && (!sonCikis || new Date(sonCikis.zaman) < new Date(ilkGiris.zaman)));

                const vardiyaTuru = rCfg.vardiyaTuru || 'sabah';
                if (vardiyaTuru === 'bireysel') ozet.bireysel++;
                else if (vardiyaTuru === 'aksam') ozet.aksam++;
                else ozet.sabah++;

                const girisDk = ilkGiris ? yoklama.dakikaDilimde(new Date(ilkGiris.zaman), cfg.saatDilimi) : null;
                const gecGirdi = girisDk !== null && girisDk > p.sabahMusaadeSonu;
                const gecikmeDk = gecGirdi ? Math.max(0, girisDk - p.sabah) : 0;

                const kesilmeDk = yoklama.dkCevir(rCfg.kesilmeSaati || rCfg.okulCikis);
                const devamsiz = !ilkGiris && dk >= kesilmeDk && !resolved.closed;
                const beklenen = !ilkGiris && dk < kesilmeDk && !resolved.closed;

                let durum = 'bekleniyor';
                let durumEtiketi = 'Bekleniyor';
                let durumTone = 'neutral';

                if (resolved.closed) {
                    durum = 'kapali';
                    durumEtiketi = 'Tatil / Kapalı';
                    durumTone = 'neutral';
                } else if (iceride) {
                    durum = gecGirdi ? 'iceride_gec' : 'iceride';
                    durumEtiketi = gecGirdi ? `İçeride (${gecikmeDk} dk geç)` : 'İçeride (Normal)';
                    durumTone = gecGirdi ? 'warning' : 'success';
                    ozet.iceride++;
                    if (gecGirdi) ozet.gec_giren++;
                } else if (sonCikis && ilkGiris) {
                    durum = 'ayrildi';
                    durumEtiketi = 'Ayrıldı / Çıkış Yaptı';
                    durumTone = 'neutral';
                    ozet.tamamladi++;
                } else if (devamsiz) {
                    durum = 'devamsiz';
                    durumEtiketi = 'Gelmedi (Devamsız)';
                    durumTone = 'danger';
                    ozet.devamsiz++;
                } else {
                    durum = 'bekleniyor';
                    durumEtiketi = 'Ders Saati Bekleniyor';
                    durumTone = 'neutral';
                    ozet.beklenen++;
                }

                // SMS Simulasyon Metni (Fiziksel gonderim yapilmaz)
                let smsTaslak = null;
                if (gecGirdi) {
                    smsTaslak = `Sayın Velimiz, ${o.full_name} bugün saat ${ilkGiris.saat}'te kurs merkezine ${gecikmeDk} dakika gecikmeli giriş yapmıştır. [SİMÜLASYON]`;
                    ozet.simulasyon_sms_sayisi++;
                } else if (devamsiz) {
                    smsTaslak = `Sayın Velimiz, ${o.full_name} bugün kurs merkezine gelmemiştir. (Hedef ders başı: ${rCfg.sabahGiris}) [SİMÜLASYON]`;
                    ozet.simulasyon_sms_sayisi++;
                } else if (ilkGiris && !gecGirdi) {
                    smsTaslak = `Sayın Velimiz, ${o.full_name} saat ${ilkGiris.saat}'te kurs merkezine giriş yapmıştır. [SİMÜLASYON]`;
                }

                liste.push({
                    kisi_id: o.kisi_id,
                    full_name: o.full_name,
                    school_number: o.school_number,
                    class_info: o.class_info,
                    branch: o.branch,
                    parent_phone: o.parent_phone,
                    vardiyaTuru,
                    vardiyaAdi: rCfg.vardiyaAdi || (vardiyaTuru === 'aksam' ? 'Akşam Grubu' : 'Sabah Grubu'),
                    hedefGiris: rCfg.sabahGiris,
                    musaadeDk: rCfg.sabahMusaadeDk,
                    hedefCikis: rCfg.okulCikis,
                    kesilmeSaati: rCfg.kesilmeSaati || rCfg.okulCikis,
                    ilkGirisSaat: ilkGiris ? ilkGiris.saat : null,
                    sonCikisSaat: sonCikis ? sonCikis.saat : null,
                    gecikmeDk,
                    durum,
                    durumEtiketi,
                    durumTone,
                    smsTaslak,
                    smsGonderildiMi: false, // Daima false: SMS gonderimi kilitli!
                    smsKilitSebebi: 'Kullanıcı talimatıyla SMS gönderimi sistem genelinde KİLİTLİ (dry-run).',
                });
            }

            res.json({
                success: true,
                tarih: bugun,
                suAn: yoklama.saatCevir(dk),
                ozet,
                ogrenciler: liste,
                smsKilidiAktif: true
            });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });
};
