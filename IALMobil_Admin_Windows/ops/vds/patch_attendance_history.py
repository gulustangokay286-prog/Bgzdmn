"""Idempotent server integration; raw attendance routes/tables are untouched."""
from pathlib import Path
import sys

path = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/ial-backend/server.js')
source = path.read_text()
if "app.get('/api/yoklama/gecmis/:kisiId'" not in source:
    start = source.index('function uzlastirmaKarari(rows) {')
    end = source.index('/** Bir ogrencinin o gunku durumu', start)
    replacement = """const attendanceReport = require('./services/attendanceReport.cjs')({ hepsi, yoklama });
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

"""
    source = source[:start] + replacement + source[end:]
    path.write_text(source)
print('Attendance history routes ready')
