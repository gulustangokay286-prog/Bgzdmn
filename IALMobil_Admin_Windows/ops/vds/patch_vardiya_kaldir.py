#!/usr/bin/env python3
"""
VARDIYA (Sabah/Aksam Grubu, bireysel ozel vakit) KAVRAMI BOGAZICI'NDEN SOKULUR.

Bu kavram Birey kurs merkezine aittir; dosya karisikliginda Bogazici backend'ine
sizmisti ve vardiyasi atanmamis her ogrenciye "Sabah Grubu" (08:30-13:30)
uygulanip Kurum Kurallari eziliyordu. Idare: "Bogazici'nde sabah/aksam grubu
diye bir kavram yok — kaldir."

  yoklama.js              : kurs_vardiyalari / ogrenci_vakitleri onbellek yuklemesi kalkar
  denemeGunleri.live.cjs  : resolveForPerson'daki vardiya cozumu kalkar; saatler dogrudan
                            Kurum Kurallari'ndan; kesim: ogrenci=kesilmeSaati, personel=17:00
  server.js               : kursVakitleri rotalari (/api/vakitler/*) kaydi kalkar
  otomasyon.js            : yorumlar (kurs/vardiya) sadeleşir
DB tarafi ayri SQL'dir (api_users gorunumu + iki tablo).

Kullanim: python3 patch_vardiya_kaldir.py /opt/ial-backend
"""
from pathlib import Path
import re
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text and (old not in text or old == new):
        return text
    if old not in text:
        raise SystemExit(f"Beklenen {label} blogu bulunamadi; dosya degistirilmedi.")
    return text.replace(old, new, 1)


root = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/ial-backend')

# ---------------------------------------------------------------- yoklama.js
p = root / 'yoklama.js'
s = p.read_text(encoding='utf-8')
s2 = replace_once(
    s,
    "    onbellek = coz(ham);\n"
    "\n"
    "    try {\n"
    "        const vardiyalar = await hepsi(\"SELECT * FROM kurs_vardiyalari WHERE aktif\");\n"
    "        const shifts = {};\n"
    "        for (const v of (vardiyalar || [])) shifts[v.id] = v;\n"
    "        onbellek.shifts = shifts;\n"
    "\n"
    "        const ov = await hepsi(\"SELECT * FROM ogrenci_vakitleri\");\n"
    "        const studentSchedules = {};\n"
    "        for (const s of (ov || [])) studentSchedules[String(s.kisi_id)] = s;\n"
    "        onbellek.studentSchedules = studentSchedules;\n"
    "    } catch (_eVardiya) {\n"
    "        onbellek.shifts = onbellek.shifts || {};\n"
    "        onbellek.studentSchedules = onbellek.studentSchedules || {};\n"
    "    }\n"
    "\n"
    "    onbellekZamani = Date.now();\n",
    "    onbellek = coz(ham);\n"
    "    onbellekZamani = Date.now();\n",
    "yoklama vardiya onbellegi",
)
if s2 != s:
    p.write_text(s2, encoding='utf-8'); print(f'Uygulandi: {p}')
else:
    print(f'Zaten uygulanmis: {p}')

# ------------------------------------------------------ denemeGunleri.live.cjs
p = root / 'denemeGunleri.live.cjs'
s = p.read_text(encoding='utf-8')
baslangic = "    // --- Kurs Merkezi Vardiya & Ozel Vakit Cozumlemesi ---\n"
bitis = "    const ortakConfig = {\n        ...baseConfig,\n"
yeni_blok = (
    "    /* Saatler dogrudan Kurum Kurallari'ndan gelir; kisiye ozel grup/saat yoktur.\n"
    "       Gun sonu kesimi: ogrenci kurumun kesilmeSaati'ni (otomatik cikis),\n"
    "       personel kendi devamsizlik saatini kullanir. */\n"
    "    const kesilmeSaati = ogrenci\n"
    "        ? (baseConfig.kesilmeSaati || baseConfig.okulCikis)\n"
    "        : (baseConfig.staffAbsenceCutoffHour || baseConfig.okulCikis);\n"
    "    const ortakConfig = {\n        ...baseConfig,\n"
)
if baslangic in s:
    i = s.index(baslangic)
    j = s.index(bitis, i)
    s2 = s[:i] + yeni_blok + s[j + len(bitis):]
    s2 = replace_once(
        s2,
        "        sabahGiris: vardiyaGiris,\n"
        "        sabahMusaadeDk: vardiyaMusaadeDk,\n"
        "        ogleCikis: vardiyaOgleCikis,\n"
        "        ogleCikisMusaadeDk: vardiyaOgleMusaadeDk,\n"
        "        ogledenSonraGiris: vardiyaOgledenSonraGiris,\n"
        "        ogledenSonraMusaadeDk: vardiyaOgledenSonraMusaadeDk,\n"
        "        okulCikis: vardiyaOkulCikis,\n"
        "        kesilmeSaati: vardiyaKesilme,\n"
        "        vardiyaTuru,\n"
        "        vardiyaAdi,\n",
        "        kesilmeSaati,\n",
        "ortakConfig vardiya alanlari",
    )
    if 'vardiya' in s2.lower().replace('kesilmesaati', ''):
        kalan = [ln for ln in s2.split('\n') if 'vardiya' in ln.lower()]
        raise SystemExit('denemeGunleri: vardiya izi kaldi:\n' + '\n'.join(kalan[:5]))
    p.write_text(s2, encoding='utf-8'); print(f'Uygulandi: {p}')
else:
    print(f'Zaten uygulanmis: {p}')

# ------------------------------------------------------------------ server.js
p = root / 'server.js'
s = p.read_text(encoding='utf-8')
s2 = re.sub(r"^require\('\./kursVakitleri'\)\(app, \{[^\n]*\n", "", s, count=1, flags=re.M)
if s2 != s:
    p.write_text(s2, encoding='utf-8'); print(f'Uygulandi: {p}')
else:
    print(f'Zaten uygulanmis: {p}')

# --------------------------------------------------------------- otomasyon.js
p = root / 'otomasyon.js'
s = p.read_text(encoding='utf-8')
s2 = s
s2 = s2.replace(
    "   Kurs merkezlerinde Sabah Grubu, Aksam Grubu ve Bireysel Ozel Saatler\n"
    "   bulunur. Otomasyon her ogrencinin kendi vardiya veya ozel saatine gore\n"
    "   calisir; aksam grubu ogrencisi sabah kesilme saatinde devamsiz yazilmaz.\n\n", "")
s2 = s2.replace(" * Kurs vardiyalari ve kisi bazli saatleri dikkate alan toplu cikis.\n",
                " * Tarihe ozel kurali (tatil/deneme/ozel program) dikkate alan toplu cikis.\n")
s2 = s2.replace(" * Her ogrencinin kendi vardiya veya ozel kesilme saati (suAnDk >= kesilme)\n",
                " * Kisinin kesilme saati (suAnDk >= kesilme)\n")
s2 = s2.replace("    // Vardiya ve kisi bazli ogle ve gun sonu cikislari\n", "    // Ogle ve gun sonu otomatik cikislari\n")
s2 = s2.replace("    // Vardiya ve kisi bazli devamsizlik sonlandirma\n", "    // Devamsizlik sonlandirma\n")
if s2 != s:
    p.write_text(s2, encoding='utf-8'); print(f'Uygulandi: {p}')
else:
    print(f'Zaten uygulanmis: {p}')

# ------------------------------------------------------------- kursVakitleri
k = root / 'kursVakitleri.js'
if k.exists():
    k.rename(root / '_arsiv' / 'kursVakitleri.js.birey-kaldirildi-20260914') if (root / '_arsiv').is_dir() \
        else k.rename(root / 'kursVakitleri.js.birey-kaldirildi-20260914')
    print('kursVakitleri.js arsive alindi')
