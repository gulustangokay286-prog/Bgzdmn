from pathlib import Path
import re

veri = Path('/opt/ial-backend/veri.js')
s = veri.read_text()
s = s.replace(
    "yaz({ ogrenciId, tarih, durum, dersSaati, sebep, otomatik, kaydedenId }) {",
    "yaz({ ogrenciId, tarih, durum, dersSaati, agirlik, sebep, otomatik, kaydedenId }) {",
)
s = s.replace(
    "INSERT INTO devamsizlik (ogrenci_id, tarih, durum, ders_saati, sebep, otomatik, kaydeden_id)\n             VALUES ($1,$2,$3,$4,$5,$6,$7)",
    "INSERT INTO devamsizlik (ogrenci_id, tarih, durum, ders_saati, agirlik, sebep, otomatik, kaydeden_id)\n             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
)
s = s.replace(
    "DO UPDATE SET durum = EXCLUDED.durum, sebep = EXCLUDED.sebep\n             RETURNING *`,\n            [ogrenciId, tarih, durum, dersSaati ?? null, sebep || null, !!otomatik, kaydedenId || null]);",
    "DO UPDATE SET durum = EXCLUDED.durum, agirlik = EXCLUDED.agirlik, sebep = EXCLUDED.sebep, otomatik = EXCLUDED.otomatik\n             RETURNING *`,\n            [ogrenciId, tarih, durum, dersSaati ?? 0, Number(agirlik ?? (durum === 'yok' ? 1 : 0)), sebep || null, !!otomatik, kaydedenId || null]);",
)
s = s.replace('dersSaati ?? null', 'dersSaati ?? 0')
veri.write_text(s)

server = Path('/opt/ial-backend/server.js')
s = server.read_text()
s = re.sub(r"(?:const smsAudit = require\('./services/smsAudit'\);\n?)+", "const smsAudit = require('./services/smsAudit');\n", s)
if "const smsAudit = require('./services/smsAudit');" not in s:
    s = s.replace(
        "const netgsmService = require('./services/netgsmService');",
        "const netgsmService = require('./services/netgsmService');\nconst smsAudit = require('./services/smsAudit');",
    )
s = s.replace(
    "const { ogrenciId, tarih, durum, dersSaati, sebep } = req.body || {};",
    "const { ogrenciId, tarih, durum, dersSaati, agirlik, sebep, otomatik } = req.body || {};",
)
s = s.replace(
    "ogrenciId: u.kisi_id, tarih, durum, dersSaati, sebep, kaydedenId: req.user.kisi_id",
    "ogrenciId: u.kisi_id, tarih, durum, dersSaati, agirlik, sebep, otomatik, kaydedenId: req.user.kisi_id",
)

anchor = "/* --- Kalan alan rotalari (duyuru, randevu, ders programi, mesaj, ayar) --- */"
routes = r"""
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

"""
if routes not in s:
    s = s.replace(anchor, routes + anchor)
server.write_text(s)

netgsm = Path('/opt/ial-backend/services/netgsmService.js')
s = netgsm.read_text()
s = s.replace(
    "const SMS_GONDERIM_ACIK = String(process.env.SMS_GONDERIM_ACIK || '').toLowerCase() === 'evet';",
    "const SMS_GONDERIM_ACIK = false; // Kurum kararı: bu deployment'ta gerçek SMS kalıcı olarak kapalı.",
)
netgsm.write_text(s)
