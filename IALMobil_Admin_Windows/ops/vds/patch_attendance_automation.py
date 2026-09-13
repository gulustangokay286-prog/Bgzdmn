"""Mechanical integration of transaction writer and server-owned refresh."""
from pathlib import Path
import sys
root = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/ial-backend')
path = root / 'yoklama.js'
source = path.read_text()
if "require('./services/attendanceWriter.cjs')" not in source:
    start = source.index("const OTOMASYON_BASLANGIC = '2026-09-08';")
    end = source.index('\nmodule.exports =', start)
    source = source[:start] + """const devamsizligiYaz = require('./services/attendanceWriter.cjs').createWriter({
    islem: require('./db').islem, compute: gunuHesapla, roleOf: rolTuru,
});
""" + source[end:]
    path.write_text(source)

# Use the transaction connection for re-reading gate state after the lock.
# Acquiring another pool connection here could exhaust the pool during a burst.
source = path.read_text().replace(
    'islem: require(\'./db\').islem, compute: gunuHesapla, roleOf: rolTuru,',
    """islem: require('./db').islem, roleOf: rolTuru,
    prepareConfig: async cfg => cfg || await ayarlariAl(),
    compute: async (personId, date, cfg, client, role) => {
        if (!client) return gunuHesapla(personId, date, cfg);
        const passages = await client.query(`SELECT yon,zaman FROM gecisler
            WHERE kisi_id=$1 AND tarih=$2::date ORDER BY zaman,id`, [personId,date]);
        const now = new Date();
        const instant = date === gunAnahtari(now,cfg.saatDilimi) ? now : null;
        return role === 'ogrenci'
            ? gunuHesaplaGecislerden(passages.rows,cfg,instant)
            : gunuPersonelHesapla(passages.rows,cfg,instant);
    },""")
path.write_text(source)

path = root / 'otomasyon.js'
source = path.read_text()
source = source.replace("const netgsmService = require('./services/netgsmService');", "const smsAudit = require('./services/smsAudit');")
if 'async function canliYoklama' not in source:
    start = source.index('    let smsSayisi = 0;')
    end = source.index('    return n;', start)
    source = source[:start] + """    // Audit only. Never dispatch a parent SMS from attendance automation.
    for (const o of gelmeyen) {
        const recipients = await hepsi(`SELECT v.veli_id, kv.telefon
            FROM veli_ogrenci v JOIN kisiler kv ON kv.id=v.veli_id
            WHERE v.ogrenci_id=$1 ORDER BY v.veli_id`, [o.kisi_id]);
        for (const parent of recipients.length ? recipients : [{}]) {
            await smsAudit.recordBlocked({ studentId: o.kisi_id, parentId: parent.veli_id,
                phone: parent.telefon, kind: 'absence',
                body: o.tam_ad + ' bugün kuruma gelmemiştir. (' + gun + ')' });
        }
    }
""" + source[end:]
    index = source.index('async function tur() {')
    source = source[:index] + """async function canliYoklama(gun, cfg) {
    if (gun < '2026-09-08' || !cfg.autoAttendanceEnabled) return;
    const persons = await hepsi(`SELECT DISTINCT k.id AS kisi_id
        FROM kisiler k JOIN kisi_rolleri r ON r.kisi_id=k.id
        WHERE k.aktif AND r.rol IN ('ogrenci','ogretmen','idare','personel')`);
    for (const person of persons) await yoklama.devamsizligiYaz(person.kisi_id, gun, cfg);
}

""" + source[index:]
    marker = "    const dk = yoklama.dakikaDilimde(simdi, cfg.saatDilimi);"
    source = source.replace(marker, "    if (gun < '2026-09-08') return;\n    await canliYoklama(gun, cfg);\n\n" + marker)
    source = source.replace("    const calistir = () => tur().catch((e) => console.error('[OTOMASYON] tur hatasi:', e.message));", """    let running = false;
    const calistir = async () => {
        if (running) return;
        running = true;
        try { await tur(); }
        catch (e) { console.error('[OTOMASYON] tur hatasi:', e.message); }
        finally { running = false; }
    };""")
    path.write_text(source)
print('VDS attendance automation ready; SMS path is audit-only')
