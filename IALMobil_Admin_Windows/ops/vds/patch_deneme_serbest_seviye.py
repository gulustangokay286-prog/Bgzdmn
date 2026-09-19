#!/usr/bin/env python3
"""
DENEME GUNUNDE SERBEST SEVIYE (idempotent).

Deneme kurali yalnizca `sinifSeviyeleri`ni kapsiyordu; kapsam disi ogrenci
kapali gunde (Cumartesi) kapidan GECEMIYORDU. 19 Eylul: 12'lerin denemesi var,
11'ler de okula gelecek ama yoklama/SMS istenmiyor. Kurala `serbestSeviyeler`
eklendi:

  { "tarih": "2026-09-19", "sinifSeviyeleri": ["12"], "serbestSeviyeler": ["11"], ... }

  serbest seviye : gecis SERBEST, yoklama KAPALI, veli SMS KAPALI, otomatik cikis YOK
  kapsam seviye  : deneme programi (yoklama + SMS acik; kapali gunde de SMS acik)
  digerleri      : eskisi gibi (kapali gunde gecemez)

Kullanim: python3 patch_deneme_serbest_seviye.py /opt/ial-backend/denemeGunleri.live.cjs
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
s = path.read_text(encoding='utf-8')

s2 = replace_once(
    s,
    "        byDate.set(tarih, {\n"
    "            tarih,\n"
    "            ad: String(item.ad || item.name || 'Deneme Sınavı').trim().slice(0, 80) || 'Deneme Sınavı',\n"
    "            sinifSeviyeleri,\n",
    "        /* Serbest seviyeler: kapsam disi ama kapidan gecebilen siniflar;\n"
    "           yoklama ve veli SMS'i onlar icin kapali. Kapsamla cakisan atilir. */\n"
    "        const serbestSeviyeler = [...new Set((item.serbestSeviyeler || item.freeGrades || [])\n"
    "            .map((grade) => String(grade).replace(/\\D/g, ''))\n"
    "            .filter((grade) => SINIFLAR.includes(grade) && !sinifSeviyeleri.includes(grade)))]\n"
    "            .sort((a, b) => Number(a) - Number(b));\n"
    "\n"
    "        byDate.set(tarih, {\n"
    "            tarih,\n"
    "            ad: String(item.ad || item.name || 'Deneme Sınavı').trim().slice(0, 80) || 'Deneme Sınavı',\n"
    "            sinifSeviyeleri,\n"
    "            serbestSeviyeler,\n",
    "normalizeRules",
)
s2 = replace_once(
    s2,
    "    const examIncluded = Boolean(rule && (!ogrenci || rule.sinifSeviyeleri.includes(grade)));\n",
    "    const examIncluded = Boolean(rule && (!ogrenci || rule.sinifSeviyeleri.includes(grade)));\n"
    "    const examFree = Boolean(rule && ogrenci && !examIncluded\n"
    "        && Array.isArray(rule.serbestSeviyeler) && rule.serbestSeviyeler.includes(grade));\n",
    "examFree",
)
s2 = replace_once(
    s2,
    "    if (rule) {\n"
    "        transitionAllowed = examIncluded || !closed;\n"
    "        attendanceEnabled = examIncluded;\n",
    "    if (rule) {\n"
    "        transitionAllowed = examIncluded || examFree || !closed;\n"
    "        attendanceEnabled = examIncluded;\n",
    "transitionAllowed",
)
s2 = replace_once(
    s2,
    "    const smsAllowed = !ogrenci || Boolean(\n"
    "        !holidayRule\n"
    "        && (customRule ? customIncluded && customRule.ogrenciSms : !closed)\n"
    "    );\n",
    "    /* Deneme kapsamindaki ogrenciye kapali gunde de SMS gider; serbest\n"
    "       seviyeye hic gitmez. Diger durumlar eskisi gibi. */\n"
    "    const smsAllowed = !ogrenci || Boolean(\n"
    "        !holidayRule && !examFree\n"
    "        && ((rule && examIncluded) || (customRule ? customIncluded && customRule.ogrenciSms : !closed))\n"
    "    );\n",
    "smsAllowed",
)

s2 = replace_once(
    s2,
    "            config: {\n"
    "                ...ortakConfig, denemeGunu: true, denemeKural: rule,\n"
    "                denemeSinifSeviyesi: grade, yoklamaKapali: true,\n"
    "            },\n",
    "            config: {\n"
    "                ...ortakConfig, denemeGunu: true, denemeKural: rule,\n"
    "                denemeSinifSeviyesi: grade, yoklamaKapali: true,\n"
    "                /* Serbest seviye esnek saatte gelir: gec giris engeli/onayi/\n"
    "                   rehberlik uyarisi uygulanmaz. */\n"
    "                ...(examFree ? { gecGirisEngelle: false, gecGirisOnayIster: false,\n"
    "                                 gecGirisRehberlikUyar: false } : {}),\n"
    "            },\n",
    "excluded config",
)

if s2 == s:
    print('Zaten uygulanmis; degisiklik yok.')
else:
    path.write_text(s2, encoding='utf-8')
    print(f'Uygulandi: {path}')

# ------------------------------------------------------------------ yoklama.js
yp = path.parent / 'yoklama.js'
ys = yp.read_text(encoding='utf-8')
ys2 = replace_once(
    ys,
    "    const c = sinifla(dk, cfg);\n"
    "    const temel = { izin: false, onay_gerekli: false, yon, oturum: c.oturum, gec: c.gec,\n",
    "    const c = sinifla(dk, cfg);\n"
    "    /* Yoklamasi kapali kisi (deneme gununde serbest seviye, tatilde izinli rol)\n"
    "       icin gecikme kavrami yoktur: kapida gec/rehberlik uyarisi ve notu dusmez. */\n"
    "    if (cfg.yoklamaKapali) { c.gec = false; c.gecikme = 0; }\n"
    "    const temel = { izin: false, onay_gerekli: false, yon, oturum: c.oturum, gec: c.gec,\n",
    "kararVer sinifla",
)
if ys2 == ys:
    print(f'Zaten uygulanmis: {yp}')
else:
    yp.write_text(ys2, encoding='utf-8')
    print(f'Uygulandi: {yp}')
