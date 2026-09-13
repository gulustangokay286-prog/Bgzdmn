from pathlib import Path

path = Path('/opt/ial-backend/server.js')
s = path.read_text()

anchor = "app.get('/api/yoklama/gunluk-rapor', verifyAuth, async (req, res) => {"
helper = r"""
/* Additive reconciliation has priority over computed automatic rows while
   preserving the original devamsizlik/gecisler tables for audit. */
function uzlastirmaKarari(rows) {
    if (!rows || !rows.length) return null;
    const list = rows;
    const reasons = [...new Set(list.map((r) => r.sebep).filter(Boolean))];
    const locked = list.some((r) => r.kilitli || r.kaynak === 'manuel_uzlastirma');
    const absent = list.filter((r) => r.durum === 'yok');
    const excused = list.find((r) => r.durum === 'izinli');
    const pending = list.find((r) => r.durum === 'beklemede');
    const late = list.find((r) => r.durum === 'gec');
    if (excused) return { durum: 'izinli', agirlik: Number(excused.agirlik) || 0, sebep: reasons.join('; '), locked };
    if (pending && !absent.length) return { durum: 'beklemede', agirlik: 0, sebep: reasons.join('; '), locked };
    if (absent.length) return { durum: 'yok', agirlik: Math.min(1, absent.reduce((n, r) => n + (Number(r.agirlik) || 0.5), 0)), sebep: reasons.join('; '), locked };
    if (late) return { durum: 'gec', agirlik: 0, sebep: reasons.join('; '), locked };
    return { durum: 'var', agirlik: 0, sebep: reasons.join('; '), locked };
}

"""
if helper not in s:
    s = s.replace(anchor, helper + anchor)

old_query = """        const elleKayit = await hepsi(
            `SELECT ogrenci_id, durum, sebep, agirlik FROM devamsizlik
              WHERE tarih = $1::date AND NOT otomatik`, [tarih]);
        const elle = new Map(elleKayit.map((r) => [String(r.ogrenci_id), r]));
"""
new_query = """        const elleKayit = await hepsi(
            `SELECT ogrenci_id, durum, sebep, agirlik FROM devamsizlik
              WHERE tarih = $1::date AND NOT otomatik`, [tarih]);
        const elle = new Map(elleKayit.map((r) => [String(r.ogrenci_id), r]));
        const uzlastirmaKayit = await hepsi(
            `SELECT kisi_id, oturum, durum, agirlik, sebep, kaynak, kilitli
               FROM yoklama_uzlastirma WHERE tarih = $1::date`, [tarih]);
        const uzlastirma = new Map();
        for (const r of uzlastirmaKayit) {
            const key = String(r.kisi_id);
            const list = uzlastirma.get(key) || [];
            list.push(r);
            uzlastirma.set(key, list);
        }
"""
if old_query not in s:
    raise SystemExit('daily report source block not found')
s = s.replace(old_query, new_query, 1)

old_status = """            const el = elle.get(kimlik);
            // Elle girilmis kayit otomatigi EZER; idarenin karari esastir.
            const durum = el ? el.durum : h.durum;
            const agirlik = el ? Number(el.agirlik) : h.agirlik;
"""
new_status = """            const el = elle.get(kimlik);
            const uz = uzlastirmaKarari(uzlastirma.get(kimlik));
            // Priority: explicit raw manual record, locked 7 September
            // reconciliation, then future automatic resolution/computation.
            const resolved = el || uz;
            const durum = resolved ? resolved.durum : h.durum;
            const agirlik = resolved ? Number(resolved.agirlik) : h.agirlik;
"""
if old_status not in s:
    raise SystemExit('daily report status block not found')
s = s.replace(old_status, new_status, 1)
s = s.replace("sebep: el ? el.sebep : h.sebep,", "sebep: resolved ? resolved.sebep : h.sebep,", 1)
s = s.replace("elle: Boolean(el),", "elle: Boolean(el) || Boolean(uz?.locked),", 1)
path.write_text(s)
