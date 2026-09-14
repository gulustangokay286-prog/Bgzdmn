#!/usr/bin/env python3
"""
VARDIYA VARSAYILANI KAPATILIR — denemeGunleri.live.cjs (idempotent).

Sorun: Kurs merkezi (Birey) icin yazilan vardiya cozumu Bogazici motorunda da
calisiyor ve vardiyasi ATANMAMIS her ogrenciye `'sabah'` vardiyasini varsayiyor:
    const vid = (ozelVakit && ozelVakit.vardiya_id) || person?.vardiya_id || 'sabah';
`kurs_vardiyalari` tablosunda "Sabah Grubu" 08:30 giris / 12:00 ogle / 12:45
ogleden sonra / 13:30 cikis / 14:00 kesim oldugu icin Kurum Kurallari (09:00,
13:00, 14:10, 16:30, 16:35) hic uygulanmiyordu: 09:00'da okutan ogrenci
"35 dakika gec" diye reddediliyor, 12:10'da herkes otomatik cikariliyordu.

Cozum:
  1. Vardiya yalnizca ACIKCA atanmis ogrenciye uygulanir (vid yoksa kurum saati).
  2. Ogrenci kesim saati kurumun `kesilmeSaati`si (16:35), personelinki
     `staffAbsenceCutoffHour` (17:00) olur; onceden ogrenci de 17:00'e dusuyordu.

Kullanim: python3 patch_vardiya_varsayilan.py /opt/ial-backend/denemeGunleri.live.cjs
"""
from pathlib import Path
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Beklenen {label} blogu bulunamadi; dosya degistirilmedi.")
    return text.replace(old, new, 1)


path = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/ial-backend/denemeGunleri.live.cjs')
source = path.read_text(encoding='utf-8')
patched = source

patched = replace_once(
    patched,
    "    let vardiyaKesilme = baseConfig.staffAbsenceCutoffHour || baseConfig.okulCikis;\n",
    "    /* Kesim: ogrenci kurumun gun sonu kesimini (16:35), personel kendi\n"
    "       devamsizlik saatini (17:00) kullanir. */\n"
    "    let vardiyaKesilme = ogrenci\n"
    "        ? (baseConfig.kesilmeSaati || baseConfig.okulCikis)\n"
    "        : (baseConfig.staffAbsenceCutoffHour || baseConfig.okulCikis);\n",
    "kesilme varsayilani",
)

patched = replace_once(
    patched,
    "            const vid = (ozelVakit && ozelVakit.vardiya_id) || person?.vardiya_id || 'sabah';\n"
    "            const sh = shifts[vid] || shifts['sabah'];\n",
    "            /* Vardiya YALNIZCA acikca atanmis ogrenciye uygulanir. Okulda\n"
    "               vardiya yoktur; atanmamis herkes Kurum Kurallari saatindedir. */\n"
    "            const vid = (ozelVakit && ozelVakit.vardiya_id) || person?.vardiya_id || null;\n"
    "            const sh = vid ? shifts[vid] : null;\n",
    "vardiya secimi",
)

if patched == source:
    print('Zaten uygulanmis; degisiklik yok.')
else:
    path.write_text(patched, encoding='utf-8')
    print(f'Uygulandi: {path}')
