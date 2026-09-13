from pathlib import Path
import re

path = Path('/opt/ial-backend/server.js')
s = path.read_text()
pattern = re.compile(r"async function veliyeBildir\(kisi, karar\) \{.*?\n\}", re.S)
replacement = r"""async function veliyeBildir(kisi, karar) {
    const ogrenciMi = (kisi.roles || [kisi.role]).some((r) => String(r).toLowerCase() === 'ogrenci');
    if (!ogrenciMi) return;

    const veliler = await hepsi(
        `SELECT kv.id AS veli_id, kv.tam_ad AS veli_ad, kv.telefon
           FROM veli_ogrenci v
           JOIN kisiler kv ON kv.id = v.veli_id
          WHERE v.ogrenci_id = $1
          ORDER BY kv.tam_ad, kv.id`, [kisi.kisi_id]);
    if (!veliler.length) return;

    const tur = karar.yon === 'cikis' ? 'cikis' : (karar.gec ? 'gec_giris' : 'giris');
    const turMetni = tur === 'cikis' ? 'kurumdan çıkış yaptı' : (tur === 'gec_giris' ? 'geç giriş yaptı' : 'kuruma giriş yaptı');
    const body = `Sayın Velimiz, ${kisi.full_name || kisi.tam_ad || 'Öğrenciniz'} ${turMetni}. Saat: ${karar.saat || '—'}.`;

    // SMS is intentionally never sent. Each parent receives an audit-only
    // row so the control screen can explain blocked and missing-phone cases.
    await Promise.all(veliler.map((veli) => smsAudit.recordBlocked({
        parentId: veli.veli_id,
        studentId: kisi.kisi_id,
        phone: veli.telefon,
        body,
        kind: 'gate',
        reasonCode: veli.telefon ? 'SMS_DISABLED' : 'MISSING_PARENT_PHONE',
    })));
}"""
new_s, count = pattern.subn(replacement, s, count=1)
if count != 1:
    raise SystemExit('veliyeBildir block not found')
path.write_text(new_s)
