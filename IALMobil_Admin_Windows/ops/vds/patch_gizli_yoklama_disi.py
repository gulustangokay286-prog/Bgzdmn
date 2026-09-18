#!/usr/bin/env python3
"""
GIZLI KISILER YOKLAMA DISI (idempotent).

`kisiler.gizli` isaretli hesaplar (or. "Acil Sistem Yöneticisi", id 383)
Kullanicilar ekraninda zaten gosterilmiyor (veri.js) ama gunluk rapor
kadrosuna ve otomasyonun devamsizlik turetmesine giriyordu; her gun
"Gün boyunca geçiş kaydı yok" devamsizligi aliyor ve raporda gorunuyordu.

  services/attendanceReport.cjs : rapor kadrosu gizli kisiyi almaz
  otomasyon.js                  : canliYoklama + devamsizligiTamamla gizli kisiyi atlar

Kullanim: python3 patch_gizli_yoklama_disi.py /opt/ial-backend
"""
from pathlib import Path
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Beklenen {label} blogu bulunamadi; dosya degistirilmedi.")
    return text.replace(old, new, 1)


root = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/ial-backend')

# ------------------------------------------------ services/attendanceReport.cjs
p = root / 'services' / 'attendanceReport.cjs'
s = p.read_text(encoding='utf-8')
s2 = replace_once(
    s,
    "               JOIN kisiler k ON k.id = o.kisi_id AND k.aktif\n",
    "               JOIN kisiler k ON k.id = o.kisi_id AND k.aktif AND NOT COALESCE(k.gizli, false)\n",
    "ogrenci kadrosu",
)
s2 = replace_once(
    s2,
    "              WHERE k.aktif AND r.rol IN ('ogretmen', 'idare')\n",
    "              WHERE k.aktif AND NOT COALESCE(k.gizli, false) AND r.rol IN ('ogretmen', 'idare')\n",
    "personel kadrosu",
)
if s2 != s:
    p.write_text(s2, encoding='utf-8'); print(f'Uygulandi: {p}')
else:
    print(f'Zaten uygulanmis: {p}')

# ---------------------------------------------------------------- otomasyon.js
p = root / 'otomasyon.js'
s = p.read_text(encoding='utf-8')
s2 = replace_once(
    s,
    "           FROM kisiler k JOIN kisi_rolleri r ON r.kisi_id = k.id\n"
    "          WHERE k.aktif AND r.rol IN ('ogrenci', 'ogretmen', 'idare', 'personel')`);\n",
    "           FROM kisiler k JOIN kisi_rolleri r ON r.kisi_id = k.id\n"
    "          WHERE k.aktif AND NOT COALESCE(k.gizli, false)\n"
    "            AND r.rol IN ('ogrenci', 'ogretmen', 'idare', 'personel')`);\n",
    "devamsizligiTamamla kadrosu",
)
s2 = replace_once(
    s2,
    "        FROM kisiler k JOIN kisi_rolleri r ON r.kisi_id=k.id\n"
    "        WHERE k.aktif AND r.rol IN ('ogrenci','ogretmen','idare','personel')`);\n",
    "        FROM kisiler k JOIN kisi_rolleri r ON r.kisi_id=k.id\n"
    "        WHERE k.aktif AND NOT COALESCE(k.gizli, false)\n"
    "          AND r.rol IN ('ogrenci','ogretmen','idare','personel')`);\n",
    "canliYoklama kadrosu",
)
if s2 != s:
    p.write_text(s2, encoding='utf-8'); print(f'Uygulandi: {p}')
else:
    print(f'Zaten uygulanmis: {p}')
