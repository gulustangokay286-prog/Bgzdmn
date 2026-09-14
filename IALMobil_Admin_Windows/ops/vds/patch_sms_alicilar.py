#!/usr/bin/env python3
"""
Toplu SMS alici listesi — VELI BASINA TEK SATIR (idempotent).

Onceden `recipientsByRelation` veli_ogrenci ciftlerini donuyordu: 98 satir
(98 ogrenci), oysa veli 92-93 kisi. Iki cocuklu veliye ayni toplu mesaj IKI
kez gidiyor, panel "Alici 98" gosteriyordu. Idare: "Kullanicilar ekranindan
okumali" — o ekranin kaynagi api_users (role/status). Artik:
  * Veliler   : api_users.role='veli' & status='approved', kisi basina bir satir,
                telefon = ana telefon, yoksa ilk ek telefon; cocuk adlari birlestirilir
  * Ogrenciler / ogretmenler / personel: ayni gorunumden, kisi basina bir satir
Kapi/gun sonu SMS'leri (veliBildirim) bu listeyi kullanmaz; degismedi.

Kullanim: python3 patch_sms_alicilar.py /opt/ial-backend/services/smsAudit.js
"""
from pathlib import Path
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Beklenen {label} blogu bulunamadi; dosya degistirilmedi.")
    return text.replace(old, new, 1)


path = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/ial-backend/services/smsAudit.js')
source = path.read_text(encoding='utf-8')

old_relation_start = "const recipientsByRelation = () => hepsi(`\n"
old_role_end = "     ORDER BY k.tam_ad`, [roles]);\n};\n"
new_block = (
    "/* Veli basina TEK satir; kaynak Kullanicilar ekraniyla ayni (api_users). */\n"
    "const recipientsByRelation = () => hepsi(`\n"
    "  SELECT u.kisi_id AS parent_id,\n"
    "         u.full_name AS parent_name,\n"
    "         NULL::bigint AS student_id,\n"
    "         COALESCE((SELECT string_agg(sk.tam_ad, ', ' ORDER BY sk.tam_ad)\n"
    "                     FROM veli_ogrenci vo JOIN kisiler sk ON sk.id = vo.ogrenci_id AND sk.aktif\n"
    "                    WHERE vo.veli_id = u.kisi_id), '—') AS student_name,\n"
    "         COALESCE(NULLIF(btrim(u.phone), ''),\n"
    "                  (SELECT btrim(kt.telefon) FROM kisi_telefonlari kt\n"
    "                    WHERE kt.kisi_id = u.kisi_id ORDER BY kt.telefon LIMIT 1)) AS phone\n"
    "    FROM api_users u\n"
    "   WHERE u.role = 'veli' AND u.status = 'approved'\n"
    "   ORDER BY u.full_name`);\n"
    "\n"
    "const recipientsByRole = async (target) => {\n"
    "  if (target === 'all_parents') return recipientsByRelation();\n"
    "\n"
    "  const roles = target === 'all_students'\n"
    "    ? ['ogrenci']\n"
    "    : target === 'all_teachers'\n"
    "      ? ['ogretmen']\n"
    "      : ['ogretmen', 'idare', 'personel'];\n"
    "  return hepsi(`\n"
    "    SELECT u.kisi_id AS student_id, u.full_name AS student_name,\n"
    "           NULL::bigint AS parent_id, NULL::text AS parent_name,\n"
    "           NULLIF(btrim(u.phone), '') AS phone\n"
    "      FROM api_users u\n"
    "     WHERE u.status = 'approved' AND u.roles && $1::text[]\n"
    "     ORDER BY u.full_name`, [roles]);\n"
    "};\n"
)

if new_block in source:
    print('Zaten uygulanmis; degisiklik yok.')
    sys.exit(0)

i = source.find(old_relation_start)
j = source.find(old_role_end, i)
if i < 0 or j < 0:
    raise SystemExit('Beklenen recipientsByRelation/recipientsByRole bloklari bulunamadi; dosya degistirilmedi.')
patched = source[:i] + new_block + source[j + len(old_role_end):]
path.write_text(patched, encoding='utf-8')
print(f'Uygulandi: {path}')
