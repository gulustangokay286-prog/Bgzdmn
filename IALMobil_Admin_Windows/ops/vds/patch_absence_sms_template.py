#!/usr/bin/env python3
"""
Gun sonu "gelmedi" SMS'i ortak sablona baglanir (idempotent).

Onceden otomasyon.js kendi metnini kuruyordu:
    "GÖKAY GÜLÜSTAN bugün kuruma gelmemiştir. (2026-09-14)"
Giris/cikis mesajlari ise netgsmService icindeki "Sayın Velimiz, ... Boğaziçi
Koleji" sablonundan, adi Turkce kurallariyla bas harfi buyuk yazilarak cikar.
Idare adin bagirmamasini istedi; dort mesaj da ayni dilden konussun.

Kullanim: python3 patch_absence_sms_template.py /opt/ial-backend/otomasyon.js
"""
from pathlib import Path
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Beklenen {label} blogu bulunamadi; dosya degistirilmedi.")
    return text.replace(old, new, 1)


path = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/ial-backend/otomasyon.js')
source = path.read_text(encoding='utf-8')
patched = replace_once(
    source,
    "            const body = o.tam_ad + ' bugün kuruma gelmemiştir. (' + gun + ')';\n",
    "            /* Giris/cikis mesajlariyla AYNI sablon ve ayni ad bicimi (Gökay, GÖKAY degil). */\n"
    "            const ad = netgsm.veliMesajAdi(o.tam_ad);\n"
    "            const body = netgsm.veliMesajMetni('gelmedi', { ad });\n",
    "gelmedi govdesi",
)
patched = replace_once(
    patched,
    "                ? await netgsm.sendSms({ to: parent.telefon, message: body })\n"
    "                : { success: false, error: 'Veli telefonu bulunamadı.' };\n"
    "            await smsAudit.recordDelivery({ studentId: o.kisi_id, parentId: parent.veli_id,\n"
    "                phone: parent.telefon, kind: 'absence', body, result });\n",
    "                ? await netgsm.sendParentGateSms({ studentName: o.tam_ad, parentPhone: parent.telefon, tur: 'gelmedi' })\n"
    "                : { success: false, error: 'Veli telefonu bulunamadı.' };\n"
    "            await smsAudit.recordDelivery({ studentId: o.kisi_id, parentId: parent.veli_id,\n"
    "                phone: parent.telefon, kind: 'absence', body, result });\n",
    "gelmedi gonderimi",
)

if patched == source:
    print('Zaten uygulanmis; degisiklik yok.')
else:
    path.write_text(patched, encoding='utf-8')
    print(f'Uygulandi: {path}')
