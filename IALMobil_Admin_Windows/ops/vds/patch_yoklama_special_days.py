#!/usr/bin/env python3
"""Canli yoklama.js dosyasina tarih bazli gun politikasini idempotent ekler."""

from pathlib import Path
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Beklenen {label} blogu bulunamadi; dosya degistirilmedi.")
    return text.replace(old, new, 1)


if len(sys.argv) != 2:
    raise SystemExit("Kullanim: patch_yoklama_special_days.py /opt/ial-backend/yoklama.js")

path = Path(sys.argv[1])
source = path.read_text(encoding="utf-8")
patched = source

patched = replace_once(
    patched,
    "    tatiller: [],\n    denemeGunleri: [],",
    "    tatiller: [],\n    tatilKurallari: [],\n    ozelProgramlar: [],\n    denemeGunleri: [],",
    "varsayilan gun listeleri",
)

patched = replace_once(
    patched,
    "        tatiller:     Array.isArray(al('tatiller', 'holidays')) ? al('tatiller', 'holidays') : VARSAYILAN.tatiller,\n        denemeGunleri: denemeGunleri.normalizeRules(al('denemeGunleri', 'examDays') || []),",
    "        tatiller:     Array.isArray(al('tatiller', 'holidays')) ? al('tatiller', 'holidays') : VARSAYILAN.tatiller,\n        tatilKurallari: denemeGunleri.normalizeHolidayRules(al('tatilKurallari', 'specialDays', 'ozelGunler') || []),\n        ozelProgramlar: denemeGunleri.normalizeCustomRules(al('ozelProgramlar', 'customSchedules', 'dayPrograms') || []),\n        denemeGunleri: denemeGunleri.normalizeRules(al('denemeGunleri', 'examDays') || []),",
    "ayar cozumleyici",
)

patched = replace_once(
    patched,
    "    return (cfg.kapaliGunler || []).some((d) => String(d).toLocaleLowerCase('tr') === ad)\n        || (cfg.tatiller || []).includes(anahtar);",
    "    return (cfg.kapaliGunler || []).some((d) => String(d).toLocaleLowerCase('tr') === ad)\n        || (cfg.tatiller || []).includes(anahtar)\n        || Boolean(denemeGunleri.holidayRuleFor(cfg, anahtar));",
    "kapali gun denetimi",
)

patched = replace_once(
    patched,
    "    const oncekiBugun = onceki && String(onceki.tarih || '').slice(0, 10) === bugun;",
    "    const oncekiTarih = onceki?.tarih ? new Date(onceki.tarih) : null;\n    const oncekiBugun = Boolean(oncekiTarih && !Number.isNaN(oncekiTarih.getTime())\n        && gunAnahtari(oncekiTarih, cfg.saatDilimi) === bugun);",
    "onceki gecis tarihi",
)

if patched == source:
    print("yoklama.js zaten guncel")
else:
    path.write_text(patched, encoding="utf-8")
    print("yoklama.js tarih bazli gun kurallariyla guncellendi")
