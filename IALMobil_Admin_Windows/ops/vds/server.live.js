/**
 * BOGAZICI KOLEJI — VDS SUNUCUSU
 *
 * Mongo ve Firebase kaldirildi; tek veri kaynagi PostgreSQL (`bgz_okul`).
 * Gercek zamanli yayin Firestore onSnapshot yerine LISTEN/NOTIFY -> socket.io.
 *
 * GUVENLIK NOTU — bu surumde kapatilan aciklar
 *   * Onceki authMiddleware, Google dogrulamasi basarisiz olunca JWT imzasini
 *     KONTROL ETMEDEN icerigine guveniyordu; ayrica verifyAdmin "uid varsa
 *     gecir" diyordu. Uydurma jetonla yonetici olunabiliyordu.
 *   * Rotalarin cogunda ara katman HIC yoktu: /api/users okuma, yazma, silme
 *     ve /api/attendance/manual jetonsuz cagirilabiliyordu.
 *   Ikisi de bu dosyada giderildi: her rota acikca isaretli, varsayilan kapali.
 */
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const http    = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');

const { degisiklikleriDinle, tek, hepsi, sorgu, islem } = require('./db');
const islem_ = islem;
const yoklama = require('./yoklama');
const denemeGunleri = require('./denemeGunleri.live.cjs');
const veri = require('./veri');
const K    = require('./kimlik');
const { verifyAuth, verifyAdmin } = require('./authMiddleware');
const { decryptPayload } = require('./cryptoUtil');
const netgsmService = require('./services/netgsmService');
const smsAudit = require('./services/smsAudit');

const app    = express();
const port   = process.env.PORT || 8080;
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET','POST','PUT','DELETE'] } });
app.set('io', io);

app.use(cors());
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.set('trust proxy', true);

/* --- Redis (istege bagli; yoksa sunucu yine calisir) --------------------- */
let redis = null;
(async () => {
    try {
        redis = createClient({ url: process.env.REDIS_URI || 'redis://redis:6379' });
        redis.on('error', (e) => console.log('[REDIS]', e.message));
        await redis.connect();
        console.log('[REDIS] baglandi');
    } catch (e) { console.warn('[REDIS] baglanamadi:', e.message); }
})();

/* --- Gercek zamanli yayin: Postgres -> socket.io ------------------------- */
io.on('connection', (s) => {
    console.log('[SOCKET] baglandi', s.id);
    s.on('disconnect', () => console.log('[SOCKET] ayrildi', s.id));
});
/* --- Cevrimici durumu ve "yaziyor" bilgisi ------------------------------
   Onceden Firebase Realtime Database'in /status ve /typing dallarindaydi.
   Kalici veri degil, anlik bilgi; bu yuzden veritabanina yazilmaz, yalnizca
   bagli istemciler arasinda iletilir. Baglanti kopunca kisi otomatik
   cevrimdisi olur. */
const cevrimici = new Map();   // kisiId -> soket sayisi

io.on('connection', (soket) => {
    let kisiId = null;

    soket.on('durum:giris', (id) => {
        kisiId = String(id || '');
        if (!kisiId) return;
        cevrimici.set(kisiId, (cevrimici.get(kisiId) || 0) + 1);
        io.emit('durum:degisti', { kisiId, cevrimici: true });
    });

    soket.on('durum:sor', () => soket.emit('durum:liste', Array.from(cevrimici.keys())));

    soket.on('yaziyor', ({ sohbetId, kisiId: kim, yaziyor }) => {
        soket.broadcast.emit('yaziyor', { sohbetId, kisiId: kim, yaziyor: Boolean(yaziyor) });
    });

    soket.on('disconnect', () => {
        if (!kisiId) return;
        const kalan = (cevrimici.get(kisiId) || 1) - 1;
        if (kalan > 0) { cevrimici.set(kisiId, kalan); return; }
        cevrimici.delete(kisiId);
        io.emit('durum:degisti', { kisiId, cevrimici: false });
    });
});

degisiklikleriDinle((olay) => {
    // Kurum ayarlari degistiginde kural motorunun onbellegi hemen dusurulur.
    if (olay?.tablo === 'ayarlar') yoklama.onbellegiDusur();
    // Firestore onSnapshot'in karsiligi: tablo adi kanal, istemci onu dinler.
    io.emit('veri_degisti', olay);
    io.emit(`${olay.tablo}:degisti`, olay);
});

const hata = (res, e, kod = 500) => {
    console.error('[HATA]', e?.message || e);
    res.status(kod).json({ success: false, error: e?.message || 'Sunucu hatasi' });
};

/* ======================================================== ACIK UCLAR ==== */

app.get('/api/health', (_req, res) =>
    res.json({ success: true, service: 'bgz-vds', db: 'postgres', time: new Date().toISOString() }));

/** Giris. Kimlik: ogrenci okul no, veli telefon, personel e-posta. */
app.post('/api/auth/login', async (req, res) => {
    try {
        let g = req.body;
        if (g?.payload) { const c = decryptPayload(g.payload); if (c) g = c; }
        const kimlik = g.kimlik || g.identifier || g.username || g.email || g.tc_kimlik || g.school_number;
        const parola = g.parola || g.password;
        if (!kimlik || !parola)
            return res.status(400).json({ success: false, error: 'Kimlik ve parola gerekli.' });

        const kayit = await K.kimlikCoz(kimlik);
        // Kullanici yok ile parola yanlis ayni cevabi verir: hesap sayimini onler.
        if (!kayit || !(await K.parolaDogrula(kayit, parola))) {
            await veri.guvenlik.yaz({ olay: 'giris_basarisiz', detay: { kimlik }, ip: req.ip });
            return res.status(401).json({ success: false, error: 'Kimlik veya parola hatali.' });
        }
        await veri.kullanici.sonGirisiYaz(kayit.kisi_id);
        await veri.guvenlik.yaz({ olay: 'giris', kisiId: kayit.kisi_id, ip: req.ip });
        res.json({ success: true, token: K.jetonUret(kayit), user: temizle(kayit) });
    } catch (e) { hata(res, e); }
});

/** QR gecis ekrani girissiz calisir; kendi guvenlik katmani var. */
/**
 * QR OKUTMA — karar sunucuda verilir.
 *
 * Onceden istemci once kapi durumunu ucayri kaynaktan okuyup (eski VDS,
 * RTDB, Firestore) giris mi cikis mi oldugunu KENDI karar veriyordu; ayrica
 * eslestirme icin tum ogrenci listesini indiriyordu. Ikisi de burada bitti:
 * istemci tek istek atar, ne oldugunu sunucu soyler.
 *
 * `yon`: 'giris' | 'cikis' | yoksa son duruma gore ters cevirir.
 */
app.post('/api/qr/scan', async (req, res) => {
    try {
        const { nonce, okulNo, tamAd, rol, cihazId, yon, onay } = req.body || {};

        /* Karekodun kendisi bir yetki belgesidir; tazelik kontrolu istemciye
           birakilamaz. Eski site surumleri `timestamp` alanini govdeye
           koymadigi icin kisa gecis doneminde Referer sorgusundan da okunur.
           Kontrol kisi aramasindan ve herhangi bir veri yazimindan ONCE
           yapilir: suresi dolmus/uydurulmus baglanti gecis ya da SMS uretemez. */
        let qrTimestamp = Number(req.body?.timestamp);
        if (!Number.isFinite(qrTimestamp) || qrTimestamp <= 0) {
            try {
                const referer = req.get('referer');
                qrTimestamp = Number(referer ? new URL(referer).searchParams.get('timestamp') : 0);
            } catch { qrTimestamp = 0; }
        }

        const nonceGecerli = typeof nonce === 'string' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(nonce);
        const simdiSn = Math.floor(Date.now() / 1000);
        const yasSn = simdiSn - Math.trunc(qrTimestamp);
        if (!nonceGecerli || !Number.isFinite(qrTimestamp) || qrTimestamp <= 0 || yasSn > 300 || yasSn < -60) {
            return res.status(409).json({
                success: false,
                izin: false,
                kod: 'QR_SURESI_DOLDU',
                baslik: 'Karekodun Süresi Doldu',
                mesaj: 'Bu bağlantı artık geçerli değil.',
                ayrinti: 'Lütfen ekrandaki güncel karekodu yeniden okutunuz.',
            });
        }

        const bulunan = await veri.kullanici.ara({ okulNo, tamAd, rol });
        if (!bulunan.length) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı.' });
        if (bulunan.length > 1) return res.json({ success: true, adaylar: bulunan.map(temizle) });
        const k = bulunan[0];

        const sonuc = await gecisIsle({
            kisi: k, istenenYon: yon, onay, manuel: false, cihazId, ip: req.ip, nonce,
        });
        res.status(sonuc.http || 200).json({ ...sonuc.govde, user: temizle(k) });
    } catch (e) { hata(res, e); }
});

/**
 * KAREKOD EKRANINDA KISI ESLESTIRME.
 *
 * Onceden istemci TUM kullanici listesini indirip eslestirmeyi tarayicida
 * yapiyordu — herkese acik bir sayfada tum ogrenci kadrosu demekti.
 * Artik yalnizca girilen deger gonderilir, eslesme burada yapilir ve
 * geriye sadece eslesenler doner.
 *
 * havuz: 'ogrenci' | 'ogretmen' | 'idare' | 'veli'
 *   ogrenci  -> okul numarasi, bulunamazsa TC'nin son 4 hanesi
 *   veli     -> cocugunun okul numarasi
 *   personel -> ad soyad; sekme yanlis secildiyse diger personel havuzuna da bakar
 */
app.post('/api/qr/kim', async (req, res) => {
    try {
        const havuz = String(req.body?.havuz || req.body?.rol || 'ogrenci').toLowerCase();
        const girdi = String(req.body?.girdi ?? req.body?.okulNo ?? req.body?.tamAd ?? '').trim();
        if (!girdi) return res.status(400).json({ success: false, error: 'Değer giriniz.' });
        const rakam = girdi.replace(/\D/g, '');

        let satirlar = [];

        if (havuz === 'ogrenci') {
            if (rakam) satirlar = await hepsi(
                `SELECT u.* FROM api_users u JOIN ogrenciler o ON o.kisi_id = u.kisi_id
                  WHERE o.okul_no = $1 LIMIT 10`, [rakam]);
            // Okul numarasi girilmemis ogrenciler icin TC'nin son 4 hanesi.
            if (!satirlar.length && /^\d{4}$/.test(rakam)) satirlar = await hepsi(
                `SELECT u.* FROM api_users u JOIN ogrenciler o ON o.kisi_id = u.kisi_id
                  WHERE u.tc_kimlik LIKE $1 LIMIT 10`, ['%' + rakam]);

        } else if (havuz === 'veli') {
            if (rakam) satirlar = await hepsi(
                `SELECT DISTINCT u.* FROM api_users u
                   JOIN veli_ogrenci vo ON vo.veli_id = u.kisi_id
                   JOIN ogrenciler o    ON o.kisi_id  = vo.ogrenci_id
                  WHERE o.okul_no = $1 LIMIT 10`, [rakam]);

        } else {
            // Personel: ad soyad. tr_ad() Turkce harfleri ASCII'ye katlar;
            // aksi hâlde buyuk harfle yazilan 'I' ile kayittaki 'ı' eslesmez.
            /* Kelime ALT KUMESI, sira onemsiz. Onceki desen kelimeleri
               yazildigi SIRAYLA arıyordu; "Oksuz Busra" bulunamiyordu. */
            const kelime = girdi.split(/\s+/).filter(Boolean);
            // Cok kisa girdi butun kadroyu getirir; anlamli bir arama degil.
            if (kelime.join('').length < 3) {
                return res.status(404).json({ success: false, error: 'En az 3 harf giriniz.' });
            }
            const roller = ['ogretmen', 'idare'];
            satirlar = await hepsi(
                `SELECT DISTINCT u.* FROM api_users u
                   JOIN kisi_rolleri r ON r.kisi_id = u.kisi_id
                  WHERE r.rol = ANY($2)
                    AND tr_ad(u.full_name) LIKE ALL (
                          SELECT '%' || tr_ad(k) || '%' FROM unnest($1::text[]) AS k)
               ORDER BY u.full_name LIMIT 10`, [kelime, roller]);
        }

        if (!satirlar.length) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı.' });
        res.json({ success: true, adaylar: satirlar.map(temizle) });
    } catch (e) { hata(res, e); }
});

/* ==================================================== KORUMALI UCLAR ==== */

app.get('/api/auth/me', verifyAuth, (req, res) => res.json({ success: true, user: temizle(req.user) }));

app.get('/api/users', verifyAuth, async (req, res) => {
    try {
        const rol = req.query.role || req.query.rol || null;
        const limit = Math.min(Number(req.query.limit) || 1000, 5000);
        const users = (await veri.kullanici.listele({ rol, limit })).map(temizle);
        res.json({ success: true, count: users.length, users });
    } catch (e) { hata(res, e); }
});

app.get('/api/users/:id', verifyAuth, async (req, res) => {
    try {
        const u = await veri.kullanici.bul(req.params.id);
        if (!u) return res.status(404).json({ success: false, error: 'Kullanici bulunamadi.' });
        res.json({ success: true, user: temizle(u) });
    } catch (e) { hata(res, e); }
});

const KULLANICI_ROLU = {
    student: 'ogrenci', ogrenci: 'ogrenci', 'öğrenci': 'ogrenci',
    parent: 'veli', veli: 'veli',
    teacher: 'ogretmen', ogretmen: 'ogretmen', 'öğretmen': 'ogretmen',
    personnel: 'personel', personel: 'personel', staff: 'personel',
    admin: 'idare', idare: 'idare', yonetici: 'idare', 'yönetici': 'idare',
};

const kullaniciRolu = (value) => KULLANICI_ROLU[String(value || '').toLocaleLowerCase('tr-TR').trim()] || null;
const telefonTemizle = (value) => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    let phone = String(value).replace(/\D/g, '');
    if (phone.startsWith('0090')) phone = phone.slice(4);
    else if (phone.startsWith('90') && phone.length === 12) phone = phone.slice(2);
    else if (phone.startsWith('0') && phone.length === 11) phone = phone.slice(1);
    return phone.length === 10 ? phone : false;
};
const tcTemizle = (value) => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const tc = String(value).replace(/\D/g, '');
    return tc.length === 11 ? tc : false;
};
const adParcala = (value) => {
    const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
    return { ad: parts.shift() || '', soyad: parts.join(' ') };
};
const atanmisDeger = (value) => {
    const text = String(value || '').trim();
    return !text || text.toLocaleLowerCase('tr-TR') === 'atanmamış' ? null : text;
};

app.post('/api/users', verifyAdmin, async (req, res) => {
    try {
        const body = req.body || {};
        const role = kullaniciRolu(body.role || 'teacher');
        const { ad, soyad } = adParcala(body.full_name || body.fullName);
        const phone = telefonTemizle(body.phone);
        const additionalPhone = telefonTemizle(body.additional_phone ?? body.additionalPhone);
        const parentPhone = telefonTemizle(body.parent_phone ?? body.parentPhone);
        const parentAdditionalPhone = telefonTemizle(body.parent_additional_phone ?? body.parentAdditionalPhone);
        const tc = tcTemizle(body.tc_kimlik ?? body.tcKimlik);
        const email = String(body.email || '').trim().toLocaleLowerCase('tr-TR') || null;
        const schoolNumber = String(body.school_number || '').trim();
        if (!ad || !soyad) return res.status(400).json({ success: false, error: 'Ad ve soyad gerekli.' });
        if (!role) return res.status(400).json({ success: false, error: 'Geçerli bir rol seçin.' });
        if (phone === false || additionalPhone === false)
            return res.status(400).json({ success: false, error: 'Telefon numarası 10 haneli olmalıdır.' });
        if (parentPhone === false || parentAdditionalPhone === false)
            return res.status(400).json({ success: false, error: 'Veli telefonu 10 haneli olmalıdır.' });
        if (tc === false) return res.status(400).json({ success: false, error: 'TC kimlik numarası 11 haneli olmalıdır.' });
        if (role === 'ogrenci' && !schoolNumber)
            return res.status(400).json({ success: false, error: 'Öğrenci için okul numarası gerekli.' });

        const kisiId = await islem(async (t) => {
            const duplicate = await t.query(
                `SELECT id FROM kisiler
                  WHERE ($1::text IS NOT NULL AND lower(eposta)=lower($1))
                     OR ($2::text IS NOT NULL AND tc=$2)
                  LIMIT 1`, [email, tc]);
            if (duplicate.rowCount) {
                const error = new Error('Bu e-posta veya TC kimlik numarasıyla kayıt zaten var.');
                error.http = 409;
                throw error;
            }

            const created = await t.query(
                `INSERT INTO kisiler (ad,soyad,tc,telefon,eposta,aktif)
                 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
                [ad, soyad, tc, phone, email, !['passive', 'rejected'].includes(String(body.status || '').toLowerCase())]);
            const id = created.rows[0].id;
            await t.query(`INSERT INTO kisi_rolleri (kisi_id,rol) VALUES ($1,$2)`, [id, role]);
            const kimlikSatiri = await t.query(
                `INSERT INTO kimlik (kisi_id,kullanici_adi)
                 VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING kisi_id`,
                [id, email || 'k' + id]);
            if (!kimlikSatiri.rowCount) {
                // Ayni e-posta pasif bir hesabin kullanici adinda kalmis; kisi kimligiyle acilir.
                await t.query(
                    `INSERT INTO kimlik (kisi_id,kullanici_adi) VALUES ($1,$2)`, [id, 'k' + id]);
            }

            if (['ogretmen', 'personel', 'idare'].includes(role)) {
                await t.query(
                    `INSERT INTO personel (kisi_id,brans,unvan,atanan_siniflar,notlar)
                     VALUES ($1,$2,$3,$4,$5)`,
                    [id, atanmisDeger(body.branch || body.department),
                     atanmisDeger(body.teacherTitle) || (role === 'personel' ? 'Personel' : 'Öğretmen'),
                     atanmisDeger(body.assignedClasses), atanmisDeger(body.notes)]);
            }
            if (role === 'ogrenci') {
                let sinifId = null;
                if (body.class_id && body.section) {
                    const sinif = await t.query(
                        `SELECT id FROM siniflar WHERE seviye=$1 AND upper(sube)=upper($2) LIMIT 1`,
                        [Number(body.class_id), String(body.section).trim()]);
                    if (!sinif.rowCount) {
                        const error = new Error('Seçilen sınıf VDS üzerinde bulunamadı.');
                        error.http = 400;
                        throw error;
                    }
                    sinifId = sinif.rows[0].id;
                }
                await t.query(
                    `INSERT INTO ogrenciler (kisi_id,okul_no,sinif_id,adres) VALUES ($1,$2,$3,$4)`,
                    [id, schoolNumber, sinifId, atanmisDeger(body.address)]);
            }

            const parentName = String(body.parent_name || body.parentName || '').trim();
            const relationPhone = parentPhone || null;
            const relationNeeded = role === 'ogrenci' && (parentName || relationPhone || parentAdditionalPhone);
            if (relationNeeded || role === 'veli') {
                let childId = role === 'ogrenci' ? id : null;
                if (role === 'veli' && body.child_school_number) {
                    const child = await t.query(
                        `SELECT kisi_id FROM ogrenciler WHERE okul_no=$1 LIMIT 1`,
                        [String(body.child_school_number).trim()]);
                    childId = child.rows[0]?.kisi_id || null;
                }
                if (relationNeeded && !relationPhone && !parentName && !parentAdditionalPhone) childId = null;
                if (role === 'ogrenci' || childId) {
                    let parentId = null;
                    if (role === 'veli') {
                        parentId = id;
                    } else {
                        const existingParent = relationPhone
                            ? await t.query(`SELECT id FROM kisiler WHERE telefon=$1 AND aktif LIMIT 1`, [relationPhone])
                            : { rowCount: 0, rows: [] };
                        if (existingParent.rowCount) {
                            parentId = existingParent.rows[0].id;
                        } else {
                            const parentParts = adParcala(parentName || `Veli ${ad} ${soyad}`);
                            const createdParent = await t.query(
                                `INSERT INTO kisiler (ad,soyad,telefon,aktif) VALUES ($1,$2,$3,TRUE) RETURNING id`,
                                [parentParts.ad, parentParts.soyad || 'Velisi', relationPhone]);
                            parentId = createdParent.rows[0].id;
                            await t.query(
                                `INSERT INTO kisi_rolleri (kisi_id,rol) VALUES ($1,'veli') ON CONFLICT DO NOTHING`,
                                [parentId]);
                        }
                        await t.query(
                            `INSERT INTO kisi_rolleri (kisi_id,rol) VALUES ($1,'veli') ON CONFLICT DO NOTHING`,
                            [parentId]);
                    }
                    if (parentId && childId) {
                        await t.query(
                            `INSERT INTO veli_ogrenci (veli_id,ogrenci_id,yakinlik)
                             VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
                            [parentId, childId, String(body.parent_relation || body.parentRelation || 'Veli')]);
                    }
                    if (parentId && parentAdditionalPhone && parentAdditionalPhone !== relationPhone) {
                        await t.query(
                            `INSERT INTO kisi_telefonlari (kisi_id,telefon) VALUES ($1,$2)
                             ON CONFLICT DO NOTHING`, [parentId, parentAdditionalPhone]);
                    }
                }
            }
            if (additionalPhone && additionalPhone !== phone) {
                await t.query(
                    `INSERT INTO kisi_telefonlari (kisi_id,telefon) VALUES ($1,$2)
                     ON CONFLICT DO NOTHING`, [id, additionalPhone]);
            }
            return id;
        });

        await veri.guvenlik.yaz({ olay: 'kullanici_olusturuldu', kisiId: req.user.kisi_id,
                                  detay: { yeniKisiId: kisiId, role }, ip: req.ip });
        res.status(201).json({ success: true, user: temizle(await veri.kullanici.bul(kisiId)) });
    } catch (e) {
        console.error('[HATA] kullanici_olustur', e.code || '', e.constraint || '', e.detail || '', e.message);
        if (e.http) return hata(res, e, e.http);
        if (e.code === '23505') {
            const kisit = `${e.constraint || ''} ${e.detail || ''}`.toLowerCase();
            const mesaj = /okul/.test(kisit) ? 'Bu okul numarası zaten kayıtlı.'
                : /\btc\b/.test(kisit) ? 'Bu TC kimlik numarası zaten kayıtlı.'
                : /eposta|kullanici_adi|email/.test(kisit) ? 'Bu e-posta zaten kayıtlı.'
                : /telefon/.test(kisit) ? 'Bu telefon numarası zaten kayıtlı.'
                : 'Bu kayıt zaten var (okul no, TC, e-posta ya da telefon çakışıyor).';
            return res.status(409).json({ success: false, error: mesaj });
        }
        if (e.code === '23502')
            return res.status(409).json({ success: false, error: `Zorunlu alan boş: ${e.column || 'bilinmiyor'}.` });
        if (e.code === '23503')
            return res.status(409).json({ success: false, error: 'İlişkili kayıt (sınıf/veli) bulunamadı.' });
        hata(res, e, 500);
    }
});

app.put('/api/users/:id', verifyAdmin, async (req, res) => {
    try {
        const u = await veri.kullanici.bul(req.params.id);
        if (!u) return res.status(404).json({ success: false, error: 'Kullanici bulunamadi.' });
        const body = req.body || {};
        const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
        const { ad, soyad } = adParcala(body.full_name || body.fullName || u.full_name);
        const phone = has('phone') ? telefonTemizle(body.phone) : u.phone;
        const tc = has('tc_kimlik') || has('tcKimlik') ? tcTemizle(body.tc_kimlik ?? body.tcKimlik) : u.tc_kimlik;
        const additionalPhone = has('additional_phone') || has('additionalPhone')
            ? telefonTemizle(body.additional_phone ?? body.additionalPhone) : undefined;
        const role = has('role') ? kullaniciRolu(body.role) : null;
        if (!ad || !soyad) return res.status(400).json({ success: false, error: 'Ad ve soyad gerekli.' });
        if (has('role') && !role) return res.status(400).json({ success: false, error: 'Geçerli bir rol seçin.' });
        if (phone === false || additionalPhone === false)
            return res.status(400).json({ success: false, error: 'Telefon numarası 10 haneli olmalıdır.' });
        if (tc === false) return res.status(400).json({ success: false, error: 'TC kimlik numarası 11 haneli olmalıdır.' });

        await islem(async (t) => {
            // Ayni kisiye iki yonetici eszamanli rol yazarsa son istek tutarli
            // kalsin; kurum rolu ve personel ayrintisi tek transaction'dir.
            await t.query(`SELECT id FROM kisiler WHERE id=$1 FOR UPDATE`, [u.kisi_id]);
            const kilitliRoller = (await t.query(
                `SELECT rol FROM kisi_rolleri WHERE kisi_id=$1 ORDER BY rol`,
                [u.kisi_id])).rows.map((row) => row.rol);
            const email = has('email') ? String(body.email || '').trim().toLocaleLowerCase('tr-TR') || null : u.email;
            const active = has('status')
                ? !['passive', 'rejected', 'inactive'].includes(String(body.status).toLowerCase())
                : u.status !== 'passive';
            await t.query(
                `UPDATE kisiler SET ad=$2,soyad=$3,tc=$4,telefon=$5,eposta=$6,aktif=$7 WHERE id=$1`,
                [u.kisi_id, ad, soyad, tc, phone, email, active]);
            if (has('email') && email) {
                await t.query(`UPDATE kimlik SET kullanici_adi=$2 WHERE kisi_id=$1`, [u.kisi_id, email]);
            }

            if (role) {
                /* Kullanici ekranindaki rol secimi BIRINCIL kurum rolunu
                   degistirir. Eski kod yalnizca gorunen `u.role` satirini ya
                   da ogretmen/personel ikilisini siliyordu. Kisi ogrenci +
                   personel gibi iki satir tasiyorsa ogrenci satiri kalip
                   arayuzde iki havuzda birden gorunuyordu. Veli rolu aile
                   bagi oldugu icin korunur; diger birincil roller teklenir. */
                await t.query(
                    `DELETE FROM kisi_rolleri
                      WHERE kisi_id=$1 AND rol IN ('ogrenci','ogretmen','personel','idare')`,
                    [u.kisi_id]);
                await t.query(`INSERT INTO kisi_rolleri (kisi_id,rol) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.kisi_id, role]);
            }

            const oncekiKurumRolleri = kilitliRoller.filter((r) => ['ogrenci', 'ogretmen', 'personel', 'idare'].includes(r));
            const roleChanged = Boolean(role && (oncekiKurumRolleri.length !== 1 || oncekiKurumRolleri[0] !== role));
            const staffRole = role || kilitliRoller.find((r) => ['ogretmen', 'personel', 'idare'].includes(r));
            if (staffRole && ['ogretmen', 'personel', 'idare'].includes(staffRole)) {
                const staffDetailProvided = has('branch') || has('department');
                const titleProvided = has('teacherTitle');
                const classesProvided = has('assignedClasses');
                const staffTitle = titleProvided
                    ? atanmisDeger(body.teacherTitle)
                    : roleChanged ? (staffRole === 'personel' ? 'Personel' : 'Ders Öğretmeni') : null;
                await t.query(
                    `INSERT INTO personel (kisi_id,brans,unvan,atanan_siniflar,notlar)
                     VALUES ($1,$2,$3,$4,$5)
                     ON CONFLICT (kisi_id) DO UPDATE SET
                       brans=CASE WHEN $6 OR $10 THEN EXCLUDED.brans ELSE personel.brans END,
                       unvan=CASE WHEN $7 OR $10 THEN EXCLUDED.unvan ELSE personel.unvan END,
                       atanan_siniflar=CASE WHEN $8 OR $10 THEN EXCLUDED.atanan_siniflar ELSE personel.atanan_siniflar END,
                       notlar=CASE WHEN $9 THEN EXCLUDED.notlar ELSE personel.notlar END`,
                    [u.kisi_id, atanmisDeger(body.branch || body.department), staffTitle,
                     atanmisDeger(body.assignedClasses), atanmisDeger(body.notes),
                     staffDetailProvided, titleProvided, classesProvided, has('notes'), roleChanged]);
            }

            if (additionalPhone !== undefined) {
                await t.query(`DELETE FROM kisi_telefonlari WHERE kisi_id=$1`, [u.kisi_id]);
                if (additionalPhone && additionalPhone !== phone) {
                    await t.query(`INSERT INTO kisi_telefonlari (kisi_id,telefon) VALUES ($1,$2)`, [u.kisi_id, additionalPhone]);
                }
            }

            if (has('school_number') || has('class_id') || has('section')) {
                const okulNo = has('school_number') ? String(body.school_number || '').trim() : null;
                let sinifId = null;
                if (body.class_id && body.section) {
                    const sinif = await t.query(
                        `SELECT id FROM siniflar WHERE seviye=$1 AND upper(sube)=upper($2) LIMIT 1`,
                        [Number(body.class_id), String(body.section).trim()]);
                    if (!sinif.rowCount) {
                        const error = new Error('Seçilen sınıf VDS üzerinde bulunamadı.');
                        error.http = 400;
                        throw error;
                    }
                    sinifId = sinif.rows[0].id;
                }
                await t.query(
                    `UPDATE ogrenciler
                        SET okul_no=COALESCE(NULLIF($2,''),okul_no), sinif_id=COALESCE($3,sinif_id)
                      WHERE kisi_id=$1`,
                    [u.kisi_id, okulNo, sinifId]);
            }
        });
        await veri.guvenlik.yaz({ olay: 'kullanici_guncellendi', kisiId: req.user.kisi_id,
                                  detay: { hedefKisiId: u.kisi_id, role }, ip: req.ip });
        res.json({ success: true, user: temizle(await veri.kullanici.bul(req.params.id)) });
    } catch (e) { hata(res, e, e.code === '23505' ? 409 : 500); }
});

app.delete('/api/users/:id', verifyAdmin, async (req, res) => {
    try {
        const u = await veri.kullanici.bul(req.params.id);
        if (!u) return res.status(404).json({ success: false, error: 'Kullanici bulunamadi.' });
        if (String(u.kisi_id) === String(req.user.kisi_id))
            return res.status(400).json({ success: false, error: 'Kendi hesabınızı silemezsiniz.' });

        // KALICI SILME. Kisiye ait satirlar CASCADE ile gider; "kim yapti"
        // referanslarindan NO ACTION olan besi once bosaltilir (hepsi NULL kabul eder).
        await islem(async (t) => {
            const id = u.kisi_id;
            await t.query(`UPDATE bildirimler  SET gonderen_id = NULL WHERE gonderen_id = $1`, [id]);
            await t.query(`UPDATE devamsizlik  SET kaydeden_id = NULL WHERE kaydeden_id = $1`, [id]);
            await t.query(`UPDATE duyurular    SET yazar_id    = NULL WHERE yazar_id    = $1`, [id]);
            await t.query(`UPDATE gecisler     SET isleyen_id  = NULL WHERE isleyen_id  = $1`, [id]);
            await t.query(`UPDATE qr_jeton     SET tuketen_id  = NULL WHERE tuketen_id  = $1`, [id]);
            await t.query(`DELETE FROM kisiler WHERE id = $1`, [id]);
        });
        await veri.guvenlik.yaz({ olay: 'kullanici_silindi', kisiId: req.user.kisi_id, ip: req.ip,
                                  detay: { silinenKisiId: u.kisi_id, adSoyad: u.full_name, roller: u.roles } });
        res.json({ success: true, silinen: u.kisi_id });
    } catch (e) {
        console.error('[HATA] kullanici_sil', e.code || '', e.constraint || '', e.detail || '', e.message);
        if (e.code === '23503')
            return res.status(409).json({ success: false, error: `Kayıt başka verilere bağlı, silinemedi (${e.table || e.constraint || 'ilişki'}).` });
        hata(res, e);
    }
});

app.post('/api/users/:id/reset-device', verifyAdmin, async (req, res) => {
    try {
        const u = await veri.kullanici.bul(req.params.id);
        if (!u) return res.status(404).json({ success: false, error: 'Kullanici bulunamadi.' });
        await veri.cihaz.sifirla(u.kisi_id);
        await veri.guvenlik.yaz({ olay: 'cihaz_sifirlandi', kisiId: u.kisi_id, ip: req.ip });
        res.json({ success: true });
    } catch (e) { hata(res, e); }
});

app.get('/api/devices',       verifyAdmin, async (_q, r) => { try { r.json({ success: true, devices: await veri.cihaz.listele() }); } catch (e) { hata(r, e); } });

/**
 * TUM cihaz kilitlerini ve gunluk kilitleri temizler.
 * Onceden panel bunu istemciden dolasarak (koleksiyon gezip tek tek silerek)
 * yapiyordu; yaridan donerse yarim kalmis durum birakiyordu. Tek islemde.
 */
app.post('/api/devices/temizle', verifyAdmin, async (req, res) => {
    try {
        const c = await islem(async (t) => {
            const a = await t.query('DELETE FROM cihazlar');
            const b = await t.query('DELETE FROM gunluk_kilit');
            return { cihaz: a.rowCount, kilit: b.rowCount };
        });
        await veri.guvenlik.yaz({ olay: 'cihaz_kilitleri_temizlendi',
                                  kisiId: req.user.kisi_id, detay: JSON.stringify(c), ip: req.ip });
        res.json({ success: true, ...c });
    } catch (e) { hata(res, e); }
});
app.get('/api/security/logs', verifyAdmin, async (_q, r) => { try { r.json({ success: true, logs: await veri.guvenlik.listele() }); } catch (e) { hata(r, e); } });

app.get('/api/gate-status', verifyAuth, async (_q, r) => {
    try { r.json({ success: true, statuses: await veri.gecis.tumDurumlar() }); } catch (e) { hata(r, e); } });

app.get('/api/gate-status/:id', verifyAuth, async (req, res) => {
    try {
        const u = await veri.kullanici.bul(req.params.id);
        if (!u) return res.status(404).json({ success: false, error: 'Kullanici bulunamadi.' });
        res.json({ success: true, status: (await veri.gecis.durum(u.kisi_id)) || { durum: 'outside' } });
    } catch (e) { hata(res, e); }
});

app.get('/api/attendance/live', verifyAuth, async (req, res) => {
    try { res.json({ success: true, logs: await veri.gecis.gunluk({ tarih: req.query.date || null }) }); }
    catch (e) { hata(res, e); }
});

/** Manuel gecis — yonetim panelinden. */
app.post('/api/attendance/manual', verifyAuth, async (req, res) => {
    try {
        const { studentId, action, onay } = req.body || {};
        if (!studentId) return res.status(400).json({ success: false, error: 'studentId gerekli.' });
        const u = await veri.kullanici.bul(studentId);
        if (!u) return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });

        /* Manuel gecis KAREKODLA AYNI motordan gecer.
           Fark yalnizca `manuel: true`: gorevli onayi saat kisitlarini asar,
           ama "zaten iceride" gibi tutarlilik kurallari yine gecerlidir. */
        const sonuc = await gecisIsle({
            kisi: u, istenenYon: action, onay, manuel: true,
            isleyenId: req.user.kisi_id, ip: req.ip,
        });
        res.status(sonuc.http || 200).json({ ...sonuc.govde, user: temizle(u) });
    } catch (e) { hata(res, e); }
});

app.get('/api/devamsizlik', verifyAuth, async (req, res) => {
    try { res.json({ success: true, kayitlar: await veri.devamsizlik.gunluk(req.query.tarih || null) }); }
    catch (e) { hata(res, e); }
});

/** Arsiv: Firebase'den devralinan gecmis. Canli tabloya karistirilmaz. */
app.get('/api/devamsizlik/arsiv', verifyAuth, async (req, res) => {
    try { res.json({ success: true, kayitlar: await veri.devamsizlik.arsiv(req.query.tarih || null) }); }
    catch (e) { hata(res, e); }
});

app.post('/api/devamsizlik', verifyAdmin, async (req, res) => {
    try {
        const { ogrenciId, tarih, durum, dersSaati, agirlik, sebep, otomatik } = req.body || {};
        const u = await veri.kullanici.bul(ogrenciId);
        if (!u) return res.status(404).json({ success: false, error: 'Ogrenci bulunamadi.' });
        res.json({ success: true, kayit: await veri.devamsizlik.yaz({
            ogrenciId: u.kisi_id, tarih, durum, dersSaati, agirlik, sebep, otomatik, kaydedenId: req.user.kisi_id }) });
    } catch (e) { hata(res, e); }
});

/* ------------------------------------------ DEVAMSIZLIK YONETIMI ------ */
/**
 * Toplu devamsizlik islemi — idare kararini iki yerde kilitler:
 *   yoklama_uzlastirma (kilitli, sabah + ogleden sonra) ve devamsizlik (manuel).
 *   izinli   : gun izinli/raporlu (agirlik 0)
 *   mevcut   : devamsizlik silinir, gun mevcut sayilir
 *   otomatik : idare kaydi kaldirilir, gun gecislerden yeniden hesaplanir
 * SMS gondermez. Izinli gunde otomasyon da veliye mesaj atmaz.
 */
app.post('/api/devamsizlik/toplu', verifyAdmin, async (req, res) => {
    try {
        const { ogrenciId, tarihler, islem, sebep } = req.body || {};
        const u = await veri.kullanici.bul(ogrenciId);
        if (!u) return res.status(404).json({ success: false, error: 'Kişi bulunamadı.' });
        const gunler = [...new Set((Array.isArray(tarihler) ? tarihler : [tarihler])
            .map((t) => String(t || '').slice(0, 10)).filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t)))];
        if (!gunler.length) return res.status(400).json({ success: false, error: 'En az bir tarih seçin.' });
        if (!['izinli', 'mevcut', 'otomatik'].includes(islem))
            return res.status(400).json({ success: false, error: 'Geçersiz işlem.' });
        const cfg = await yoklama.ayarlariAl();
        const bugun = yoklama.gunAnahtari(new Date(), cfg.saatDilimi);
        if (gunler.some((g) => g > bugun)) return res.status(400).json({ success: false, error: 'Gelecek tarihe işlem yapılamaz.' });
        const aciklama = String(sebep || '').trim().slice(0, 200)
            || (islem === 'izinli' ? 'İzinli / raporlu (idare)' : islem === 'mevcut' ? 'Devamsızlık idare tarafından silindi' : '');
        const sonuc = [];
        for (const gun of gunler) {
            await islem_(async (t) => {
                await t.query(`SET LOCAL app.kilit_ac = 'evet'`); // idare kararı: kilitli satırlar bu transaction'da değişebilir
                if (islem === 'otomatik') {
                    await t.query(`DELETE FROM devamsizlik WHERE ogrenci_id=$1 AND tarih=$2::date AND NOT otomatik`, [u.kisi_id, gun]);
                    await t.query(`DELETE FROM yoklama_uzlastirma WHERE kisi_id=$1 AND tarih=$2::date AND kilitli`, [u.kisi_id, gun]);
                    await t.query(`DELETE FROM devamsizlik WHERE ogrenci_id=$1 AND tarih=$2::date AND otomatik`, [u.kisi_id, gun]);
                    await t.query(`DELETE FROM yoklama_uzlastirma WHERE kisi_id=$1 AND tarih=$2::date AND NOT kilitli`, [u.kisi_id, gun]);
                    return;
                }
                const durum = islem === 'izinli' ? 'izinli' : 'var';
                for (const oturum of ['sabah', 'ogleden_sonra']) {
                    await t.query(`INSERT INTO yoklama_uzlastirma (kisi_id,tarih,oturum,durum,agirlik,sebep,kaynak,kilitli,olusturan)
                         VALUES ($1,$2::date,$3,$4,0,$5,'manuel_uzlastirma',true,$6)
                         ON CONFLICT (kisi_id,tarih,oturum) DO UPDATE
                           SET durum=EXCLUDED.durum, agirlik=0, sebep=EXCLUDED.sebep, kaynak='manuel_uzlastirma',
                               kilitli=true, olusturan=EXCLUDED.olusturan, guncellendi=now()`,
                        [u.kisi_id, gun, oturum, durum, aciklama, req.user.kisi_id]);
                }
                await t.query(`DELETE FROM devamsizlik WHERE ogrenci_id=$1 AND tarih=$2::date`, [u.kisi_id, gun]);
                await t.query(`INSERT INTO devamsizlik (ogrenci_id, tarih, durum, ders_saati, agirlik, sebep, otomatik, kaydeden_id)
                     VALUES ($1,$2::date,$3,0,0,$4,false,$5)`, [u.kisi_id, gun, durum, aciklama, req.user.kisi_id]);
            });
            let h = null;
            try { h = await yoklama.devamsizligiYaz(u.kisi_id, gun, cfg); } catch (e) { console.warn('[DEVAMSIZLIK] yeniden hesap', gun, e.message); }
            sonuc.push({ tarih: gun, durum: h?.durum || null });
        }
        await veri.guvenlik.yaz({ olay: 'devamsizlik_toplu', kisiId: req.user.kisi_id, ip: req.ip,
                                  detay: { ogrenciId: u.kisi_id, islem, tarihler: gunler, sebep: aciklama } });
        res.json({ success: true, islem, sonuc });
    } catch (e) { hata(res, e); }
});

/** Tek ham devamsizlik satirini siler; gun gecislerden yeniden hesaplanir. */
app.delete('/api/devamsizlik/:id', verifyAdmin, async (req, res) => {
    try {
        const satir = await tek(`DELETE FROM devamsizlik WHERE id=$1 RETURNING ogrenci_id, tarih::text AS tarih, durum, otomatik`, [Number(req.params.id)]);
        if (!satir) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı.' });
        const kalanManuel = await tek(`SELECT 1 FROM devamsizlik WHERE ogrenci_id=$1 AND tarih=$2::date AND NOT otomatik LIMIT 1`, [satir.ogrenci_id, satir.tarih]);
        if (!kalanManuel) {
            // Idare kaydi kalmadiysa kilitli uzlastirma da kaldirilir; gun otomatige doner.
            await islem_(async (t) => {
                await t.query(`SET LOCAL app.kilit_ac = 'evet'`);
                await t.query(`DELETE FROM yoklama_uzlastirma WHERE kisi_id=$1 AND tarih=$2::date AND kilitli`, [satir.ogrenci_id, satir.tarih]);
            });
        }
        let h = null;
        try { h = await yoklama.devamsizligiYaz(satir.ogrenci_id, satir.tarih); } catch (e) { console.warn('[DEVAMSIZLIK] yeniden hesap', e.message); }
        await veri.guvenlik.yaz({ olay: 'devamsizlik_silindi', kisiId: req.user.kisi_id, ip: req.ip,
                                  detay: { id: Number(req.params.id), ogrenciId: satir.ogrenci_id, tarih: satir.tarih, durum: satir.durum } });
        res.json({ success: true, silinen: satir, yeniDurum: h?.durum || null });
    } catch (e) { hata(res, e); }
});

/* ------------------------------------------------------------ SMS ------ */
/* Gonderim netgsmService icindeki kilitle engellenir (SMS_GONDERIM_ACIK).
   Uclar yine de yalnizca yoneticiye acik. */
app.get('/api/netgsm/balance', verifyAdmin, async (_q, r) => {
    try { r.json(await netgsmService.checkBalance()); } catch (e) { hata(r, e); } });

app.post('/api/netgsm/broadcast-sms', verifyAdmin, async (req, res) => {
    try {
        let g = req.body; if (g?.payload) { const c = decryptPayload(g.payload); if (c) g = c; }
        const { phones, message } = g;
        if (!Array.isArray(phones) || !phones.length)
            return res.status(400).json({ success: false, error: 'Telefon listesi gerekli.' });
        const sonuc = [];
        for (const p of phones) {
            const result = await netgsmService.sendSms({ to: p, message });
            await smsAudit.recordDelivery({ phone: p, body: message, kind: 'broadcast', result });
            sonuc.push(result);
        }
        res.json({ success: true, sonuc });
    } catch (e) { hata(res, e); }
});


/* -------------------------------------------------------- SMS KONTROL --- */
app.get('/api/sms/recipients', verifyAdmin, async (req, res) => {
    try {
        const recipients = await smsAudit.resolveRecipients({ target: req.query.target || 'all_parents' });
        res.json({ success: true, count: recipients.length, recipients });
    } catch (e) { hata(res, e); }
});

app.get('/api/sms/control', verifyAdmin, async (req, res) => {
    try {
        res.json({ success: true, ...(await smsAudit.control({
            date: req.query.date || null,
            status: req.query.status || null,
            search: req.query.search || '',
            limit: req.query.limit || 1000,
        })) });
    } catch (e) { hata(res, e); }
});

app.get('/api/sms/control/:id', verifyAdmin, async (req, res) => {
    try {
        const row = await smsAudit.detail(req.params.id);
        if (!row) return res.status(404).json({ success: false, error: 'SMS audit kaydı bulunamadı.' });
        res.json({ success: true, row });
    } catch (e) { hata(res, e); }
});

/* Bu uç yalnızca alıcı/mesaj audit kaydı oluşturur; NetGSM'e ulaşmaz. */
app.post('/api/sms/audit/plan', verifyAdmin, async (req, res) => {
    try {
        const result = await smsAudit.plan({
            target: req.body?.target || 'all_parents',
            title: req.body?.title || '',
            message: req.body?.message || '',
            phones: req.body?.phones || [],
            kind: req.body?.kind || 'broadcast',
        });
        res.json({ success: true, ...result });
    } catch (e) { hata(res, e); }
});

/* --- Kalan alan rotalari (duyuru, randevu, ders programi, mesaj, ayar) --- */
require('./rotalar')(app, { verifyAuth, verifyAdmin });
require('./sifirlama')(app);   // parola sifirlama (kod e-posta ile gider)
/* --------------------------------------------------- KURUM AYARLARI ---- */
/**
 * Yoklama kurallarinin kaynagi. Kaydedildigi anda onbellek dusurulur ve
 * NOTIFY ile tum ekranlara haber verilir; bir sonraki okutma YENI ayarla
 * degerlendirilir. Onceden bu ayarlar hicbir yere bagli degildi.
 */
app.get('/api/yoklama/ayarlar', verifyAuth, async (_q, res) => {
    try {
        const ayarlar = await yoklama.ayarlariAl(true);
        if (ayarlar && typeof ayarlar === 'object') {
            ayarlar.closedDays = Array.isArray(ayarlar.kapaliGunler) ? ayarlar.kapaliGunler : (ayarlar.closedDays || []);
            ayarlar.kapaliGunler = ayarlar.closedDays;
            ayarlar.holidays = Array.isArray(ayarlar.tatiller) ? ayarlar.tatiller : (ayarlar.holidays || []);
            ayarlar.tatiller = ayarlar.holidays;
            ayarlar.examDays = Array.isArray(ayarlar.denemeGunleri) ? ayarlar.denemeGunleri : (ayarlar.examDays || []);
            ayarlar.denemeGunleri = ayarlar.examDays;
            ayarlar.specialDays = Array.isArray(ayarlar.tatilKurallari) ? ayarlar.tatilKurallari : (ayarlar.specialDays || []);
            ayarlar.tatilKurallari = ayarlar.specialDays;
            ayarlar.customSchedules = Array.isArray(ayarlar.ozelProgramlar) ? ayarlar.ozelProgramlar : (ayarlar.customSchedules || []);
            ayarlar.ozelProgramlar = ayarlar.customSchedules;
            ayarlar.gradeExits = Array.isArray(ayarlar.seviyeCikislari) ? ayarlar.seviyeCikislari : (ayarlar.gradeExits || []);
            ayarlar.seviyeCikislari = ayarlar.gradeExits;
            ayarlar.weekdayHours = Array.isArray(ayarlar.gunSaatleri) ? ayarlar.gunSaatleri : (ayarlar.weekdayHours || []);
            ayarlar.gunSaatleri = ayarlar.weekdayHours;
        }
        res.json({ success: true, ayarlar, pencereler: yoklama.pencereler(ayarlar) });
    }
    catch (e) { hata(res, e); }
});

app.put('/api/yoklama/ayarlar', verifyAdmin, async (req, res) => {
    try {
        const gelen = req.body?.ayarlar ?? req.body ?? {};
        /* GONDERILMEYEN ANAHTAR KAYBOLMAZ.
           PUT eskiden govdeyi YERINE koyuyordu; ekranin gostermedigi bir
           kural (gunSonu, gecGirisEngelle, bekleAralikSn ...) her Kaydet'te
           sessizce varsayilana donuyordu. Once kayitli govde okunur, gelen
           onun UZERINE yazilir; yalnizca gercekten degistirilen alan degisir. */
        let mevcut = (await tek(`SELECT deger FROM ayarlar WHERE anahtar = 'institution'`))?.deger || {};
        if (typeof mevcut === 'string') { try { mevcut = JSON.parse(mevcut); } catch { mevcut = {}; } }
        /* Arayuz Ingilizce, motor Turkce anahtarlarla calisir. Mevcut kayitta
           Turkce anahtar varken yalnizca Ingilizce anahtari birlestirmek,
           eski degerin yeni secimi golgelemesine yol aciyordu. Gelen alanlari
           once motorun asil anahtarina tasiyoruz; boylece panelde yapilan
           degisiklik gercekten DB'ye ve bir sonraki okutmaya yansir. */
        const birlesik = { ...mevcut, ...gelen };
        const alanEsleme = {
            timeZone: 'saatDilimi', dayStartHour: 'gunBaslangici',
            morningEntryHour: 'sabahGiris', morningGraceMinutes: 'sabahMusaadeDk',
            lunchExitHour: 'ogleCikis', lunchExitGraceMinutes: 'ogleCikisMusaadeDk',
            afternoonEntryHour: 'ogledenSonraGiris', afternoonGraceMinutes: 'ogledenSonraMusaadeDk',
            schoolExitHour: 'okulCikis', halfDayCutoffHour: 'yarimGunSiniri',
            dayEndHour: 'gunSonu', lateRequiresCounselorApproval: 'gecGirisOnayIster',
            cooldownSeconds: 'bekleAralikSn', lessonMinutes: 'dersSuresiDk',
            breakMinutes: 'teneffusDk', staffFlexibleHours: 'personelSaatSerbest',
            closedDays: 'kapaliGunler', holidays: 'tatiller', examDays: 'denemeGunleri',
            specialDays: 'tatilKurallari', customSchedules: 'ozelProgramlar',
            gradeExits: 'seviyeCikislari',
            weekdayHours: 'gunSaatleri',
        };
        for (const [istemciAlani, motorAlani] of Object.entries(alanEsleme)) {
            if (Object.prototype.hasOwnProperty.call(gelen, istemciAlani)) {
                birlesik[motorAlani] = gelen[istemciAlani];
            }
        }
        // Gelen govde once cozulur: gecersiz saat/sayi varsayilana duser,
        // boylece bozuk bir deger kaydedilip sistemi kilitleyemez.
        const cozulmus = yoklama.coz(birlesik);

        // Hem istemci (Ingilizce) hem motor (Turkce) anahtarlarini esitle:
        cozulmus.closedDays = Array.isArray(cozulmus.kapaliGunler) ? cozulmus.kapaliGunler : (cozulmus.closedDays || []);
        cozulmus.kapaliGunler = cozulmus.closedDays;
        cozulmus.holidays = Array.isArray(cozulmus.tatiller) ? cozulmus.tatiller : (cozulmus.holidays || []);
        cozulmus.tatiller = cozulmus.holidays;
        cozulmus.examDays = Array.isArray(cozulmus.denemeGunleri) ? cozulmus.denemeGunleri : (cozulmus.examDays || []);
        cozulmus.denemeGunleri = cozulmus.examDays;
        cozulmus.specialDays = Array.isArray(cozulmus.tatilKurallari) ? cozulmus.tatilKurallari : (cozulmus.specialDays || []);
        cozulmus.tatilKurallari = cozulmus.specialDays;
        cozulmus.customSchedules = Array.isArray(cozulmus.ozelProgramlar) ? cozulmus.ozelProgramlar : (cozulmus.customSchedules || []);
        cozulmus.ozelProgramlar = cozulmus.customSchedules;
        cozulmus.gradeExits = Array.isArray(cozulmus.seviyeCikislari) ? cozulmus.seviyeCikislari : (cozulmus.gradeExits || []);
        cozulmus.seviyeCikislari = cozulmus.gradeExits;
        cozulmus.weekdayHours = Array.isArray(cozulmus.gunSaatleri) ? cozulmus.gunSaatleri : (cozulmus.weekdayHours || []);
        cozulmus.gunSaatleri = cozulmus.weekdayHours;

        const r = await tek(
            `INSERT INTO ayarlar (anahtar, deger) VALUES ('institution', $1)
             ON CONFLICT (anahtar) DO UPDATE SET deger = $1, guncellendi = now()
             RETURNING *`, [JSON.stringify(cozulmus)]);
        yoklama.onbellegiDusur();

        // Eger yeni ayarlara gore bugun kapaliysa, bugune ait otomatik devamsizliklari temizle!
        try {
            const bugun = yoklama.gunAnahtari(new Date(), cozulmus.saatDilimi);
            if (denemeGunleri.institutionClosed(cozulmus, bugun)) {
                await sorgu(`DELETE FROM devamsizlik WHERE tarih = $1::date AND otomatik`, [bugun]);
                await sorgu(`DELETE FROM yoklama_uzlastirma WHERE tarih = $1::date AND NOT kilitli AND kaynak = 'otomatik'`, [bugun]);
            }
        } catch (eTemizle) {
            console.warn('[AYARLAR] kapali gun otomatik kayit temizleme uyarisi:', eTemizle.message);
        }

        res.json({ success: true, ayarlar: cozulmus, pencereler: yoklama.pencereler(cozulmus), kayit: r });
    } catch (e) { hata(res, e); }
});

/** Bir gunun devamsizligini gecislerden YENIDEN hesaplar. */
app.post('/api/yoklama/yeniden-hesapla', verifyAdmin, async (req, res) => {
    try {
        const cfg = await yoklama.ayarlariAl();
        const tarih = req.body?.tarih || yoklama.gunAnahtari(new Date(), cfg.saatDilimi);
        if (denemeGunleri.institutionClosed(cfg, tarih)) {
            await sorgu(`DELETE FROM devamsizlik WHERE tarih = $1::date AND otomatik`, [tarih]);
            await sorgu(`DELETE FROM yoklama_uzlastirma WHERE tarih = $1::date AND NOT kilitli AND kaynak = 'otomatik'`, [tarih]);
            const ogrenciler = await hepsi(
                `SELECT o.kisi_id FROM ogrenciler o JOIN kisiler k ON k.id = o.kisi_id WHERE k.aktif`);
            return res.json({ success: true, tarih, ogrenci: ogrenciler.length, mevcut: 0, gec: 0, devamsiz: 0, kapali: true });
        }
        const ogrenciler = await hepsi(
            `SELECT o.kisi_id FROM ogrenciler o JOIN kisiler k ON k.id = o.kisi_id WHERE k.aktif`);
        let var_ = 0, yok = 0, gec = 0;
        for (const o of ogrenciler) {
            const h = await yoklama.devamsizligiYaz(o.kisi_id, tarih);
            if (h.durum === 'var') var_++; else if (h.durum === 'gec') gec++; else yok++;
        }
        res.json({ success: true, tarih, ogrenci: ogrenciler.length, mevcut: var_, gec, devamsiz: yok });
    } catch (e) { hata(res, e); }
});

/**
 * GUNLUK RAPOR — tum ogrencilerin o gunku durumu, TEK hesaptan.
 *
 * Onceden gunluk rapor ekrani ham gecislerden kendi hesabini yapiyordu;
 * devamsizlik ekrani baska, kapi ekrani baska sonuc gosterebiliyordu.
 * Artik uc ekran da bu ucun dondurdugu ayni gercege bakar.
 */

/* Additive reconciliation has priority over computed automatic rows while
   preserving the original devamsizlik/gecisler tables for audit. */
const attendanceReport = require('./services/attendanceReport.cjs')({ hepsi, yoklama });
app.get('/api/yoklama/gunluk-rapor', verifyAuth, async (req, res) => {
    try { res.json(await attendanceReport.dailyReport(req.query.tarih)); }
    catch (e) { hata(res, e); }
});

// History and totals resolve through the exact same report as the daily screen.
app.get('/api/yoklama/gecmis/:kisiId', verifyAdmin, async (req, res) => {
    try {
        if (!/^(usr_)?[0-9]+$/.test(req.params.kisiId))
            return res.status(400).json({ error: 'Geçerli kişi kimliği gerekli.' });
        const user = await veri.kullanici.bul(req.params.kisiId);
        if (!user) return res.status(404).json({ error: 'Kişi bulunamadı.' });
        res.json(await attendanceReport.history(user.kisi_id));
    } catch (e) { hata(res, e); }
});

/** Bir ogrencinin o gunku durumu — ekranlarin ortak dogruluk kaynagi. */
app.get('/api/yoklama/gun/:kisiId', verifyAuth, async (req, res) => {
    try {
        const cfg = await yoklama.ayarlariAl();
        const tarih = req.query.tarih || yoklama.gunAnahtari(new Date(), cfg.saatDilimi);
        res.json({ success: true, tarih,
                   ...(await yoklama.gunuHesapla(req.params.kisiId, tarih, cfg)) });
    } catch (e) { hata(res, e); }
});

require('./web')(app, { verifyAdmin });   // web sitesi: ayarlar, formlar, magaza
require('./moduller')(app, { verifyAdmin });   // panel modulleri: finans, notlar, saglik...

/* --- Ortak hata yakalayici: rotalardaki next(e) buraya duser ------------- */
/**
 * Ortak hata yakalayici.
 *
 * Ham Postgres mesajlari istemciye SIZDIRILMAZ: hem kullaniciya anlamsiz
 * gelir hem de tablo/kisit adlarini disari verir. Bilinen durumlar Turkce
 * mesaja cevrilir, gerisi genel mesaj doner; ayrinti yalnizca gunluge yazilir.
 */
const PG_MESAJ = {
    '23505': 'Bu kayıt zaten var.',
    '23503': 'İlişkili kayıt bulunamadı.',
    '23502': 'Zorunlu alan boş bırakılamaz.',
    '23514': 'Girilen değer kabul edilmiyor.',
    '22P02': 'Geçersiz değer biçimi.',
    '22001': 'Girilen değer çok uzun.',
};
app.use((e, _req, res, _next) => {
    console.error('[HATA]', e?.code || '', e?.message || e);
    const bilinen = PG_MESAJ[e?.code];
    res.status(bilinen ? 409 : 500)
       .json({ success: false, error: bilinen || 'İşlem tamamlanamadı.' });
});

/* ---------------------------------------------------------- GECIS ------ */
/**
 * TEK GECIS ISLEYICISI.
 *
 * Karekod ve manuel gecisin ortak yolu. Karar `yoklama.kararVer` ile verilir,
 * kayit atilir, ardindan o gunun devamsizligi GECISLERDEN yeniden hesaplanir.
 * Boylece devamsizlik ekrani, gunluk rapor ve canli takip ayni gercege bakar.
 */
/**
 * Gecis sonrasi veliye SMS. Ortak modul: karekod/manuel gecis ve otomatik
 * cikislar (otomasyon.js) ayni bildirim yolunu kullanir.
 */
const { veliyeBildir } = require('./services/veliBildirim');

async function gecisIsle({ kisi, istenenYon, onay, manuel, cihazId, isleyenId, ip, nonce }) {
    const onceki = await tek(
        `SELECT * FROM kapi_durumu WHERE kisi_id = $1`, [kisi.kisi_id]);

    /* Tarihe ozel tatil/deneme/etut programi, QR ve manuel gecisin ortak
       giris kapisidir. Kapali bir gunde giris icin istemci onayiyla kural
       delinemez; ancak daha once iceride kalmis birinin CIKISI guvenlik icin
       her zaman kaydedilebilir. */
    const simdi = new Date();
    const cfg = await yoklama.ayarlariAl();
    const tarih = yoklama.gunAnahtari(simdi, cfg.saatDilimi);
    const gunAyari = denemeGunleri.resolveForPerson(cfg, tarih, kisi);
    const oncekiTarihNesnesi = onceki?.tarih instanceof Date
        ? onceki.tarih
        : onceki?.tarih ? new Date(`${String(onceki.tarih).slice(0, 10)}T12:00:00`) : null;
    const oncekiTarih = oncekiTarihNesnesi && !Number.isNaN(oncekiTarihNesnesi.getTime())
        ? yoklama.gunAnahtari(oncekiTarihNesnesi, cfg.saatDilimi) : null;
    const oncekiIceride = onceki?.yon === 'giris' && oncekiTarih === tarih;
    const istenen = String(istenenYon || '').toLocaleLowerCase('tr-TR');
    const cikisIsteniyor = ['cikis', 'çıkış', 'exit'].includes(istenen) || (!istenen && oncekiIceride);
    if (!cikisIsteniyor && gunAyari.transitionDenied) {
        const plan = gunAyari.holidayRule?.ad || gunAyari.customRule?.ad || gunAyari.rule?.ad || 'Kapalı gün';
        return { http: 409, govde: {
            success: false, izin: false, onay_gerekli: false, kod: 'GUN_PLANI_KAPALI',
            baslik: 'Bugün bu kullanıcı için geçiş kapalı',
            mesaj: `${plan} kapsamında bu rol veya sınıf için giriş izni bulunmuyor.`,
            ayrinti: 'Kurum Kuralları > Gün Takvimi bölümünden bu tarihin izinlerini düzenleyebilirsiniz.',
        } };
    }

    const karar = await yoklama.kararVer({
        kisi, istenenYon, onceki, manuel,
        onay: Boolean(onay) || (cikisIsteniyor && gunAyari.transitionDenied), simdi,
    });

    if (!karar.izin) {
        // Onay isteyen durumlar 200 doner: hata degil, kullaniciya sorulacak soru.
        return { http: karar.onay_gerekli ? 200 : 409, govde: { success: false, ...karar } };
    }

    // Karekod jetonu ancak gecis GERCEKTEN yazilacaksa tuketilir; reddedilen
    // denemede jeton yanmaz, kullanici onay verip tekrar okutabilir.
    if (nonce && !(await veri.qr.jetonTuket(nonce, kisi.kisi_id))) {
        return { http: 409, govde: { success: false, izin: false, kod: 'JETON_KULLANILDI',
                 baslik: 'Bu Karekodu Zaten Okuttunuz',
                 mesaj: 'Aynı karekodu ikinci kez kullanamazsınız.',
                 ayrinti: 'Güncel karekodu okutunuz.' } };
    }

    const g = await veri.gecis.ekle({
        kisiId: kisi.kisi_id, yon: karar.yon,
        kaynak: manuel ? 'manuel' : 'qr',
        isleyenId: isleyenId || null, cihazId: cihazId || null, ip,
        /* Alan adi `not` — `not_` yazildigi icin gecikme notu HIC kaydedilmiyordu
           (veri.gecis.ekle govdeyi `not` olarak aliyor). */
        not: karar.not || (karar.gec ? `Geç giriş — ${karar.gecikme_dk} dk` : null),
    });

    /* VELIYE BILDIRIM.
       Gonderim netgsmService icinde IKI kilitten gecer: SMS_GONDERIM_ACIK ve
       SMS_IZINLI_NUMARALAR izin listesi. Buradan cagrilmasi tek basina mesaj
       gitmesi anlamina gelmez; listede olmayan numara engellenir.
       Hata olursa gecis kaydi ETKILENMEZ — SMS asla gecisi bloklamaz. */
    veliyeBildir(kisi, karar).catch((e) => console.error('[SMS] bildirim hatasi:', e.message));

    // Devamsizlik gecislerden yeniden turetilir — gun sonu cikisi devamsizlik
    // URETMEZ, cunku cikis oturumu kapatir, silmez.
    let devamsizlik = null;
    try {
        devamsizlik = await yoklama.devamsizligiYaz(kisi.kisi_id, karar.tarih);
    } catch (e) {
        console.error('[YOKLAMA] devamsizlik hesaplanamadi:', e.message);
    }

    return { http: 200, govde: { success: true, ...karar, gecis: g, devamsizlik } };
}

/* --------------------------------------------------------- yardimci ---- */
/** Ic alanlari istemciye sizdirma. */
function temizle(u) {
    if (!u) return u;
    const { parola_hash, eski_scrypt, eski_salt, ...temiz } = u;
    return temiz;
}

app.use((req, res) => res.status(404).json({ success: false, error: 'Uc nokta bulunamadi: ' + req.path }));

server.listen(port, () => {
    console.log(`[VDS] Bogazici Koleji sunucusu ${port} portunda (PostgreSQL)`);
    /* Ogle ve gun sonu cikislari ile gun sonu devamsizligi buradan yurur;
       ogrencinin cikis okutmasi beklenmez. */
    require('./otomasyon').baslat();
});
