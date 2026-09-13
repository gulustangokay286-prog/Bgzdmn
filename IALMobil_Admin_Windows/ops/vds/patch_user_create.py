#!/usr/bin/env python3
"""
POST /api/users (yeni kullanici) onarimi — idempotent.

Canli log: `[HATA] inconsistent types deduced for parameter $1` → HTTP 500.
Kaynak: `kimlik` insert'i `VALUES ($1, COALESCE($2,'k'||$1::text))` diyordu;
$1 ayni sorguda hem bigint (kisi_id) hem text olarak kullaniliyor, Postgres
tip cikarimini reddediyor. Kullanici adi artik Node tarafinda kurulur.

Ek: ayni e-posta pasif bir hesabin kullanici adinda kalmissa kimlik satiri
kisi kimligiyle ('k<id>') acilir; tekil kisit / zorunlu alan hatalari ham
Postgres metni yerine okunur Turkce 409 mesajla doner.

Kullanim: python3 patch_user_create.py /opt/ial-backend/server.js
"""
from pathlib import Path
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Beklenen {label} blogu bulunamadi; dosya degistirilmedi.")
    return text.replace(old, new, 1)


path = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/ial-backend/server.js')
source = path.read_text(encoding='utf-8')
patched = source

# 1) kimlik satiri: $1 tek tipte kalir, kullanici adi Node'da kurulur.
#    parola_hash NULL kalir; parolaDogrula NULL'da zaten reddeder, parola
#    sifirlama akisindan verilir.
patched = replace_once(
    patched,
    "            await t.query(\n"
    "                `INSERT INTO kimlik (kisi_id,kullanici_adi)\n"
    "                 VALUES ($1,COALESCE($2,'k'||$1::text))`, [id, email]);\n",
    "            const kimlikSatiri = await t.query(\n"
    "                `INSERT INTO kimlik (kisi_id,kullanici_adi)\n"
    "                 VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING kisi_id`,\n"
    "                [id, email || 'k' + id]);\n"
    "            if (!kimlikSatiri.rowCount) {\n"
    "                // Ayni e-posta pasif bir hesabin kullanici adinda kalmis; kisi kimligiyle acilir.\n"
    "                await t.query(\n"
    "                    `INSERT INTO kimlik (kisi_id,kullanici_adi) VALUES ($1,$2)`, [id, 'k' + id]);\n"
    "            }\n",
    "kimlik insert",
)

# 2) Hata cevabi: tekil kisit ve zorunlu alan hatalari okunur Turkce metinle.
patched = replace_once(
    patched,
    "        res.status(201).json({ success: true, user: temizle(await veri.kullanici.bul(kisiId)) });\n"
    "    } catch (e) { hata(res, e, e.http || 500); }\n"
    "});\n",
    "        res.status(201).json({ success: true, user: temizle(await veri.kullanici.bul(kisiId)) });\n"
    "    } catch (e) {\n"
    "        console.error('[HATA] kullanici_olustur', e.code || '', e.constraint || '', e.detail || '', e.message);\n"
    "        if (e.http) return hata(res, e, e.http);\n"
    "        if (e.code === '23505') {\n"
    "            const kisit = `${e.constraint || ''} ${e.detail || ''}`.toLowerCase();\n"
    "            const mesaj = /okul/.test(kisit) ? 'Bu okul numarası zaten kayıtlı.'\n"
    "                : /\\btc\\b/.test(kisit) ? 'Bu TC kimlik numarası zaten kayıtlı.'\n"
    "                : /eposta|kullanici_adi|email/.test(kisit) ? 'Bu e-posta zaten kayıtlı.'\n"
    "                : /telefon/.test(kisit) ? 'Bu telefon numarası zaten kayıtlı.'\n"
    "                : 'Bu kayıt zaten var (okul no, TC, e-posta ya da telefon çakışıyor).';\n"
    "            return res.status(409).json({ success: false, error: mesaj });\n"
    "        }\n"
    "        if (e.code === '23502')\n"
    "            return res.status(409).json({ success: false, error: `Zorunlu alan boş: ${e.column || 'bilinmiyor'}.` });\n"
    "        if (e.code === '23503')\n"
    "            return res.status(409).json({ success: false, error: 'İlişkili kayıt (sınıf/veli) bulunamadı.' });\n"
    "        hata(res, e, 500);\n"
    "    }\n"
    "});\n",
    "kullanici olusturma hata cevabi",
)

if patched == source:
    print('Zaten uygulanmis; degisiklik yok.')
else:
    path.write_text(patched, encoding='utf-8')
    print(f'Uygulandi: {path}')
