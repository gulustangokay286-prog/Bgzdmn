/**
 * MODUL ROTALARI  (yalnizca idare)
 *
 * Finans, notlar, rehberlik, saglik, ogretmen islemleri gibi panel
 * modulleri ortak bir tablo bicimini paylasir: cekirdek kolonlar
 * (kisi_id, baslik, durum, tarih, tutar) + module ozgu `veri` JSONB.
 *
 * Tablo adi ISTEMCIDEN GELMEZ; asagidaki eslemede olmayan hicbir ad
 * kabul edilmez. Aksi hâlde uc nokta rastgele tablo okuma araci olurdu.
 *
 * Eski Firestore koleksiyon adlari da kabul edilir; ekranlar tek tek
 * cevrilirken iki ad da calissin diye.
 */
const { hepsi, tek, sorgu } = require('./db');

const TABLOLAR = {
    faturalar: 'faturalar',                       invoices: 'faturalar',
    ogrenci_odemeleri: 'ogrenci_odemeleri',       finance_student_payments: 'ogrenci_odemeleri',
    finans_tanimlari: 'finans_tanimlari',         finance_definitions: 'finans_tanimlari',
    bordro: 'bordro',                             payroll: 'bordro',
    personel_kayitlari: 'personel_kayitlari',     personnel: 'personel_kayitlari',
    notlar: 'notlar',                             grades: 'notlar',
    rehberlik: 'rehberlik',                       counseling: 'rehberlik',
    saglik_kayitlari: 'saglik_kayitlari',         health_logs: 'saglik_kayitlari',
    kontrol_notlari: 'kontrol_notlari',           checks_notes: 'kontrol_notlari',
    gec_gelis_onaylari: 'gec_gelis_onaylari',     late_approvals: 'gec_gelis_onaylari',
    erken_cikis_izinleri: 'erken_cikis_izinleri', early_exit_permits: 'erken_cikis_izinleri',
    devir_teslim: 'devir_teslim',                 handover_logs: 'devir_teslim',
    acil_durum_kayitlari: 'acil_durum_kayitlari', emergency_logs: 'acil_durum_kayitlari',
    ogretmen_gorevleri: 'ogretmen_gorevleri',     teacher_tasks: 'ogretmen_gorevleri',
    ogretmen_etkinlikleri: 'ogretmen_etkinlikleri', teacher_activities: 'ogretmen_etkinlikleri',
    genel_bildirimler: 'genel_bildirimler',       global_notifications: 'genel_bildirimler',
    lisanslar: 'lisanslar',                       licenses: 'lisanslar',
    nova_sohbetleri: 'nova_sohbetleri',           nova_ai_chats: 'nova_sohbetleri',
    yoklama_otomasyonu: 'yoklama_otomasyonu',     attendance_automation: 'yoklama_otomasyonu',
    kasalar: 'kasalar',                           cash_registers: 'kasalar',
    kasa_oturumlari: 'kasa_oturumlari',           cash_sessions: 'kasa_oturumlari',
    kasa_hareketleri: 'kasa_hareketleri',         cash_transactions: 'kasa_hareketleri',
    banka_hesaplari: 'banka_hesaplari',           bank_accounts: 'banka_hesaplari',
    banka_hareketleri: 'banka_hareketleri',       bank_transactions: 'banka_hareketleri',
};

/** Yazilabilir kolonlar. Bunlarin disindaki her alan `veri` icine gider. */
const CEKIRDEK = ['kisi_id', 'baslik', 'durum', 'tarih', 'tutar'];

function ayikla(govde) {
    const c = {}, veri = {};
    for (const [k, v] of Object.entries(govde || {})) {
        if (k === 'id' || k === 'olusturuldu' || k === 'guncellendi') continue;
        if (k === 'veri' && v && typeof v === 'object') Object.assign(veri, v);
        else if (CEKIRDEK.includes(k)) c[k] = v === '' ? null : v;
        else veri[k] = v;
    }
    return { c, veri };
}

/** Istemciye tek duz nesne olarak doner: `veri` alanlari yukari tasinir. */
const duzlestir = (r) => (r ? { ...(r.veri || {}), ...r, veri: undefined } : r);

module.exports = function modulRotalari(app, { verifyAdmin }) {

    const tabloAl = (req, res) => {
        const t = TABLOLAR[String(req.params.tablo || '').toLowerCase()];
        if (!t) { res.status(404).json({ success: false, error: 'Bilinmeyen modül.' }); return null; }
        return t;
    };

    app.get('/api/modul/:tablo', verifyAdmin, async (req, res, next) => {
        try {
            const t = tabloAl(req, res); if (!t) return;
            const limit = Math.min(Number(req.query.limit) || 500, 2000);
            const kosul = [], deger = [];
            if (req.query.kisi_id) { deger.push(req.query.kisi_id); kosul.push(`kisi_id = $${deger.length}`); }
            if (req.query.durum)   { deger.push(req.query.durum);   kosul.push(`durum   = $${deger.length}`); }
            if (req.query.tarih)   { deger.push(req.query.tarih);   kosul.push(`tarih   = $${deger.length}`); }
            deger.push(limit);
            const kayitlar = await hepsi(
                `SELECT * FROM ${t} ${kosul.length ? 'WHERE ' + kosul.join(' AND ') : ''}
                  ORDER BY olusturuldu DESC LIMIT $${deger.length}`, deger);
            res.json({ success: true, kayitlar: kayitlar.map(duzlestir) });
        } catch (e) { next(e); }
    });

    app.get('/api/modul/:tablo/:id', verifyAdmin, async (req, res, next) => {
        try {
            const t = tabloAl(req, res); if (!t) return;
            const r = await tek(`SELECT * FROM ${t} WHERE id = $1`, [req.params.id]);
            if (!r) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı.' });
            res.json({ success: true, kayit: duzlestir(r) });
        } catch (e) { next(e); }
    });

    app.post('/api/modul/:tablo', verifyAdmin, async (req, res, next) => {
        try {
            const t = tabloAl(req, res); if (!t) return;
            const { c, veri } = ayikla(req.body);
            c.veri = JSON.stringify(veri);
            c.olusturan = req.user?.kisi_id || null;
            const kolon = Object.keys(c);
            const r = await tek(
                `INSERT INTO ${t} (${kolon.join(',')})
                 VALUES (${kolon.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`,
                Object.values(c));
            res.json({ success: true, kayit: duzlestir(r) });
        } catch (e) { next(e); }
    });

    app.put('/api/modul/:tablo/:id', verifyAdmin, async (req, res, next) => {
        try {
            const t = tabloAl(req, res); if (!t) return;
            const { c, veri } = ayikla(req.body);
            // `veri` uzerine YAZILMAZ, birlestirilir: bir ekranin gonderdigi
            // kismi guncelleme digerinin alanlarini silmesin.
            const set = Object.keys(c).map((k, i) => `${k}=$${i + 2}`);
            set.push(`veri = veri || $${Object.keys(c).length + 2}::jsonb`);
            const r = await tek(
                `UPDATE ${t} SET ${set.join(',')} WHERE id=$1 RETURNING *`,
                [req.params.id, ...Object.values(c), JSON.stringify(veri)]);
            if (!r) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı.' });
            res.json({ success: true, kayit: duzlestir(r) });
        } catch (e) { next(e); }
    });

    app.delete('/api/modul/:tablo/:id', verifyAdmin, async (req, res, next) => {
        try {
            const t = tabloAl(req, res); if (!t) return;
            await sorgu(`DELETE FROM ${t} WHERE id = $1`, [req.params.id]);
            res.json({ success: true });
        } catch (e) { next(e); }
    });
};
