#!/usr/bin/env python3
"""
netgsmService — veli mesaj sablonu ve ad bicimi disari acilir (idempotent).

`sendParentGateSms` icindeki ad duzeltme (GÖKAY -> Gökay) ve dort mesaj
sablonu modul duzeyine tasinir; `veliMesajAdi` ve `veliMesajMetni` olarak
export edilir. Boylece otomasyon.js'in gun sonu "gelmedi" mesaji da ayni
metni ve ayni ad bicimini kullanir; davranis degismez, yalnizca paylasilir.

Kullanim: python3 patch_netgsm_template_helpers.py /opt/ial-backend/services/netgsmService.js
"""
from pathlib import Path
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Beklenen {label} blogu bulunamadi; dosya degistirilmedi.")
    return text.replace(old, new, 1)


path = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/ial-backend/services/netgsmService.js')
source = path.read_text(encoding='utf-8')
patched = source

patched = replace_once(
    patched,
    "async function sendParentGateSms({ studentName, parentPhone, tur = 'giris', gecikmeDk = 0, saat }) {\n"
    "    if (!SMS_GONDERIM_ACIK) return kilitliCevap('sendParentGateSms', parentPhone);\n"
    "    if (!parentPhone) return { success: false, sent: false, error: 'Veli telefonu bulunamadi.' };\n"
    "\n"
    "    const simdi = new Date();\n"
    "    const zaman = saat || new Intl.DateTimeFormat('tr-TR', {\n"
    "        timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false,\n"
    "    }).format(simdi);\n"
    "\n"
    "    /* Isim veritabaninda BUYUK harfle duruyor (\"GÖKAY GÜLÜSTAN\"); mesajda\n"
    "       bagirir gibi gorunuyordu. Turkce kurallariyla bas harf buyuk:\n"
    "       GÖKAY -> Gökay, İSMET -> İsmet, IŞIL -> Işıl.\n"
    "       ('I' ve 'İ' ayrimini kaybetmemek icin locale 'tr' sart.) */\n"
    "    const buyukIlkHarf = (k) => k\n"
    "        ? k.charAt(0).toLocaleUpperCase('tr') + k.slice(1).toLocaleLowerCase('tr')\n"
    "        : k;\n"
    "    const ad = buyukIlkHarf(String(studentName || 'Öğrencimiz').trim().split(/\\s+/)[0]);\n"
    "\n"
    "    const metinler = {\n"
    "        giris:     `Sayın Velimiz,\\n\\nÖğrencimiz ${ad} saat ${zaman} itibariyle okulumuza giriş yapmıştır.\\n\\nBoğaziçi Koleji`,\n"
    "        gec_giris: `Sayın Velimiz,\\n\\nÖğrencimiz ${ad} saat ${zaman} itibariyle okulumuza ${gecikmeDk} dakika geç giriş yapmıştır.\\n\\nBoğaziçi Koleji`,\n"
    "        cikis:     `Sayın Velimiz,\\n\\nÖğrencimiz ${ad} saat ${zaman} itibariyle okulumuzdan çıkış yapmıştır.\\n\\nBoğaziçi Koleji`,\n"
    "        gelmedi:   `Sayın Velimiz,\\n\\nÖğrencimiz ${ad} bugün okulumuza gelmemiştir.\\n\\nBoğaziçi Koleji`,\n"
    "    };\n"
    "\n"
    "    return sendSms({ to: parentPhone, message: metinler[tur] || metinler.giris });\n"
    "}\n",
    "/* Isim veritabaninda BUYUK harfle duruyor (\"GÖKAY GÜLÜSTAN\"); mesajda\n"
    "   bagirir gibi gorunuyordu. Turkce kurallariyla bas harf buyuk:\n"
    "   GÖKAY -> Gökay, İSMET -> İsmet, IŞIL -> Işıl.\n"
    "   ('I' ve 'İ' ayrimini kaybetmemek icin locale 'tr' sart.) */\n"
    "function veliMesajAdi(studentName) {\n"
    "    const buyukIlkHarf = (k) => k\n"
    "        ? k.charAt(0).toLocaleUpperCase('tr') + k.slice(1).toLocaleLowerCase('tr')\n"
    "        : k;\n"
    "    return buyukIlkHarf(String(studentName || 'Öğrencimiz').trim().split(/\\s+/)[0]);\n"
    "}\n"
    "\n"
    "/* Veliye giden DORT mesajin tek sablonu. Gecis (server.js), otomatik cikis\n"
    "   ve gun sonu \"gelmedi\" (otomasyon.js) hepsi buradan gecer. */\n"
    "function veliMesajMetni(tur, { ad, zaman = '', gecikmeDk = 0 } = {}) {\n"
    "    const metinler = {\n"
    "        giris:     `Sayın Velimiz,\\n\\nÖğrencimiz ${ad} saat ${zaman} itibariyle okulumuza giriş yapmıştır.\\n\\nBoğaziçi Koleji`,\n"
    "        gec_giris: `Sayın Velimiz,\\n\\nÖğrencimiz ${ad} saat ${zaman} itibariyle okulumuza ${gecikmeDk} dakika geç giriş yapmıştır.\\n\\nBoğaziçi Koleji`,\n"
    "        cikis:     `Sayın Velimiz,\\n\\nÖğrencimiz ${ad} saat ${zaman} itibariyle okulumuzdan çıkış yapmıştır.\\n\\nBoğaziçi Koleji`,\n"
    "        gelmedi:   `Sayın Velimiz,\\n\\nÖğrencimiz ${ad} bugün okulumuza gelmemiştir.\\n\\nBoğaziçi Koleji`,\n"
    "    };\n"
    "    return metinler[tur] || metinler.giris;\n"
    "}\n"
    "\n"
    "async function sendParentGateSms({ studentName, parentPhone, tur = 'giris', gecikmeDk = 0, saat }) {\n"
    "    if (!SMS_GONDERIM_ACIK) return kilitliCevap('sendParentGateSms', parentPhone);\n"
    "    if (!parentPhone) return { success: false, sent: false, error: 'Veli telefonu bulunamadi.' };\n"
    "\n"
    "    const zaman = saat || new Intl.DateTimeFormat('tr-TR', {\n"
    "        timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false,\n"
    "    }).format(new Date());\n"
    "    const ad = veliMesajAdi(studentName);\n"
    "    return sendSms({ to: parentPhone, message: veliMesajMetni(tur, { ad, zaman, gecikmeDk }) });\n"
    "}\n",
    "sendParentGateSms govdesi",
)

patched = replace_once(
    patched,
    "    sendSms,\n"
    "    sendParentGateSms,\n",
    "    sendSms,\n"
    "    sendParentGateSms,\n"
    "    veliMesajAdi, veliMesajMetni,\n",
    "exports",
)

if patched == source:
    print('Zaten uygulanmis; degisiklik yok.')
else:
    path.write_text(patched, encoding='utf-8')
    print(f'Uygulandi: {path}')
