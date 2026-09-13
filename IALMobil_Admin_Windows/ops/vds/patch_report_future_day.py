#!/usr/bin/env python3
"""
Gunluk rapor — GELECEK TARIH onarimi (idempotent).

Sorun: rapor bugun disindaki her tarihi "bitmis gun" kabul ediyordu
(`bugunMu ? simdi : null`). Yarin ya da daha ileri bir tarih acildiginda
motor "hic gecis yok, gun bitti" diye herkese TAM GUN DEVAMSIZ yaziyordu.

Cozum: tarih bugunden ilerideyse motora o gunun 00:00 ani "su an" olarak
verilir; hicbir oturum kapanmadigi icin herkes 'beklemede' olur ve sebep
"Gün henüz gelmedi" yazilir. Panelde ekran degismeden "Beklemede" rozeti
ve bu not gorunur. Yanit govdesine `gelecek: true` de eklenir.

Kullanim: python3 patch_report_future_day.py /opt/ial-backend/services/attendanceReport.cjs
"""
from pathlib import Path
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Beklenen {label} blogu bulunamadi; dosya degistirilmedi.")
    return text.replace(old, new, 1)


path = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/ial-backend/services/attendanceReport.cjs')
source = path.read_text(encoding='utf-8')
patched = source

patched = replace_once(
    patched,
    "        const simdi = new Date();\n"
    "        const bugunMu = tarih === yoklama.gunAnahtari(simdi, cfg.saatDilimi);\n",
    "        const simdi = new Date();\n"
    "        const bugunAnahtari = yoklama.gunAnahtari(simdi, cfg.saatDilimi);\n"
    "        const bugunMu = tarih === bugunAnahtari;\n"
    "        /* GELECEK TARIH: gun daha gelmedi, kimseye devamsizlik yazilmaz.\n"
    "           Motora o gunun 00:00 ani \"su an\" diye verilir; tum oturumlar\n"
    "           bekleyen sayilir. Gecmis gunler eskisi gibi kesinlesmis (null). */\n"
    "        const gelecekMi = tarih > bugunAnahtari;\n"
    "        let an = bugunMu ? simdi : null;\n"
    "        if (gelecekMi) {\n"
    "            const ogle = new Date(`${tarih}T12:00:00Z`);\n"
    "            an = new Date(ogle.getTime() - yoklama.dakikaDilimde(ogle, cfg.saatDilimi) * 60_000);\n"
    "        }\n",
    "bugunMu hesabi",
)

patched = replace_once(
    patched,
    "                    ? yoklama.gunuHesaplaGecislerden(gore.get(kimlik) || [], kisiCfg, bugunMu ? simdi : null)\n"
    "                    : yoklama.gunuPersonelHesapla(gore.get(kimlik) || [], kisiCfg, bugunMu ? simdi : null);\n",
    "                    ? yoklama.gunuHesaplaGecislerden(gore.get(kimlik) || [], kisiCfg, an)\n"
    "                    : yoklama.gunuPersonelHesapla(gore.get(kimlik) || [], kisiCfg, an);\n"
    "            if (gelecekMi && h.durum === 'beklemede') h.sebep = 'Gün henüz gelmedi';\n",
    "hesap cagrisi",
)

patched = replace_once(
    patched,
    "        return { success: true, tarih, ayarlar: cfg, ozet: sayac, kayitlar: satirlar };\n",
    "        return { success: true, tarih, gelecek: gelecekMi, bugun: bugunMu, ayarlar: cfg, ozet: sayac, kayitlar: satirlar };\n",
    "rapor donusu",
)

if patched == source:
    print('Zaten uygulanmis; degisiklik yok.')
else:
    path.write_text(patched, encoding='utf-8')
    print(f'Uygulandi: {path}')
