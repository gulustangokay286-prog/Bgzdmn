#!/usr/bin/env python3
"""
yoklama.coz — `kesilmeSaati` (gun sonu otomatik cikis / devamsizlik kesim saati)
ayarini kurum ayarlarindan gecirir (idempotent).

Motor zaten `p.kesilmeSaati || p.okulCikis` ile calisiyor (otomasyon.js:
gun sonu toplu cikis ve devamsizligiTamamla), fakat coz() bu anahtari
DB'den okumuyordu; deger her zaman okul cikisina dusuyordu. Idare "okul
cikisi 16:30, otomatik cikis ve yoklama kesimi 16:35" istedigi icin
ayrilmasi gerekiyor. Bos birakilirsa davranis eskisi gibi okul cikisidir.

Kullanim: python3 patch_kesilme_saati.py /opt/ial-backend/yoklama.js
"""
from pathlib import Path
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Beklenen {label} blogu bulunamadi; dosya degistirilmedi.")
    return text.replace(old, new, 1)


path = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/ial-backend/yoklama.js')
source = path.read_text(encoding='utf-8')
patched = replace_once(
    source,
    "        gunSonu:               saat(al('gunSonu', 'dayEndHour'), VARSAYILAN.gunSonu),\n",
    "        gunSonu:               saat(al('gunSonu', 'dayEndHour'), VARSAYILAN.gunSonu),\n"
    "        // Gun sonu otomatik cikis + devamsizlik kesimi; bos ise okul cikisi.\n"
    "        kesilmeSaati:          saat(al('kesilmeSaati', 'autoExitHour'), '') || '',\n",
    "gunSonu satiri",
)

if patched == source:
    print('Zaten uygulanmis; degisiklik yok.')
else:
    path.write_text(patched, encoding='utf-8')
    print(f'Uygulandi: {path}')
