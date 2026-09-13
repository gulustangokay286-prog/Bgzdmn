#!/usr/bin/env python3
"""Add date/grade-specific exam-day rules to the live attendance engine.

The script is intentionally idempotent and fails closed if the expected live
source has drifted. It is deployed as an ops artifact and run against a
versioned backup on the VDS before the API image is rebuilt.
"""

from pathlib import Path
import sys


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


def patch(root):
    path = Path(root) / "yoklama.js"
    text = path.read_text()
    if "require('./denemeGunleri.live.cjs')" in text:
        print("yoklama.js already contains exam-day support")
        return

    text = replace_once(
        text,
        "const { tek, hepsi, sorgu } = require('./db');\n",
        "const { tek, hepsi, sorgu } = require('./db');\nconst denemeGunleri = require('./denemeGunleri.live.cjs');\n",
        "require",
    )
    text = replace_once(
        text,
        "    tatiller: [],\n};",
        "    tatiller: [],\n    denemeGunleri: [],\n};",
        "defaults",
    )
    text = replace_once(
        text,
        "        tatiller:     Array.isArray(al('tatiller', 'holidays')) ? al('tatiller', 'holidays') : VARSAYILAN.tatiller,\n    };",
        "        tatiller:     Array.isArray(al('tatiller', 'holidays')) ? al('tatiller', 'holidays') : VARSAYILAN.tatiller,\n        denemeGunleri: denemeGunleri.normalizeRules(al('denemeGunleri', 'examDays') || []),\n    };",
        "config normalization",
    )
    text = replace_once(
        text,
        "async function kararVer({ kisi, istenenYon, simdi = new Date(), onceki = null, manuel = false, onay = false }) {\n    const cfg = await ayarlariAl();\n    const p = pencereler(cfg);\n    const dk = dakikaDilimde(simdi, cfg.saatDilimi);\n    const bugun = gunAnahtari(simdi, cfg.saatDilimi);",
        "async function kararVer({ kisi, istenenYon, simdi = new Date(), onceki = null, manuel = false, onay = false }) {\n    const temelCfg = await ayarlariAl();\n    const bugun = gunAnahtari(simdi, temelCfg.saatDilimi);\n    const gunAyari = denemeGunleri.resolveForPerson(temelCfg, bugun, kisi);\n    const cfg = gunAyari.config;\n    const p = pencereler(cfg);\n    const dk = dakikaDilimde(simdi, cfg.saatDilimi);",
        "decision config",
    )
    text = replace_once(
        text,
        "    COK_SIK: 'COK_SIK', KAPALI_GUN: 'KAPALI_GUN', MESAI_DISI: 'MESAI_DISI',\n    ERKEN_CIKIS_ONAY: 'ERKEN_CIKIS_ONAY', GEC_GIRIS_ONAY: 'GEC_GIRIS_ONAY',",
        "    COK_SIK: 'COK_SIK', KAPALI_GUN: 'KAPALI_GUN', MESAI_DISI: 'MESAI_DISI',\n    ERKEN_CIKIS_ONAY: 'ERKEN_CIKIS_ONAY', GEC_GIRIS_ONAY: 'GEC_GIRIS_ONAY',\n    DENEME_GIRISI_KAPALI: 'DENEME_GIRISI_KAPALI',",
        "decision codes",
    )
    text = replace_once(
        text,
        "    const temel = { izin: false, onay_gerekli: false, yon, oturum: c.oturum, gec: c.gec,\n                    gecikme_dk: c.gecikme, saat, tarih: bugun, evre: c.evre,\n                    manuel: Boolean(manuel), personel };",
        "    const temel = { izin: false, onay_gerekli: false, yon, oturum: c.oturum, gec: c.gec,\n                    gecikme_dk: c.gecikme, saat, tarih: bugun, evre: c.evre,\n                    manuel: Boolean(manuel), personel,\n                    deneme_gunu: Boolean(cfg.denemeGunu),\n                    yoklama_kapali: Boolean(cfg.yoklamaKapali) };",
        "decision metadata",
    )
    text = replace_once(
        text,
        "    /* --- 5. GIRIS --------------------------------------------------------- */\n    if (yon === 'giris') {\n        /* GEC GIRIS ENGELI.",
        "    /* --- 5. GIRIS --------------------------------------------------------- */\n    if (yon === 'giris') {\n        /* Deneme sınavı devam ederken giriş serbesttir; başlangıç sonrası\n           okutma geç işaretlenir. Sınav/etüt son girişinden sonra ise\n           öğrenciyi yeni bir oturuma sokmayız. Hariç tutulan seviyeler için\n           bu kontrol normal kurum kapı kurallarıyla devam eder. */\n        const denemeSonGirisKapali = Boolean(cfg.denemeGunu && !cfg.yoklamaKapali && !manuel && (\n            (c.oturum === 'sabah' && dk > p.sabahSonGiris) ||\n            (c.oturum === 'ogleden_sonra' && dk > p.ogledenSonraSonGiris)\n        ));\n        if (denemeSonGirisKapali) {\n            return { ...temel, kod: KOD.DENEME_GIRISI_KAPALI,\n                     baslik: 'Deneme Girişi Kapandı',\n                     mesaj: `Bu deneme için son giriş saati ${c.oturum === 'sabah' ? saatCevir(p.sabahSonGiris) : saatCevir(p.ogledenSonraSonGiris)}.`,\n                     ayrinti: 'Görevli onayıyla manuel geçiş yapılabilir.' };\n        }\n        /* GEC GIRIS ENGELI.",
        "exam entry cutoff",
    )
    text = replace_once(
        text,
        "async function gunuHesapla(ogrenciId, tarih, cfg) {\n    const c = cfg || await ayarlariAl();\n    const gecisler = await hepsi(",
        "async function gunuHesapla(ogrenciId, tarih, cfg) {\n    const temelCfg = cfg || await ayarlariAl();\n    const kisi = await tek(`SELECT * FROM api_users WHERE kisi_id = $1`, [ogrenciId]);\n    const gunAyari = denemeGunleri.resolveForPerson(temelCfg, tarih, kisi);\n    if (gunAyari.excluded) return denemeGunleri.closedResult(gunAyari.config, gunAyari.rule, gunAyari.grade);\n    const c = gunAyari.config;\n    const gecisler = await hepsi(",
        "person history config",
    )
    text = replace_once(
        text,
        "    const p = pencereler(c);\n    /* Ogrenci hâlâ iceridyse acik aralik nereye kadar sayilir?",
        "    const p = pencereler(c);\n    if (c.yoklamaKapali) return denemeGunleri.closedResult(c, c.denemeKural, c.denemeSinifSeviyesi);\n    if (c.denemeTekOturum) return denemeGunleri.computeSingleSession(gecisler, c, simdi);\n    /* Ogrenci hâlâ iceridyse acik aralik nereye kadar sayilir?",
        "single-session history",
    )
    text = replace_once(
        text,
        "const devamsizligiYaz = require('./services/attendanceWriter.cjs').createWriter({",
        "const devamsizligiYazici = require('./services/attendanceWriter.cjs').createWriter({",
        "writer rename",
    )
    text = replace_once(
        text,
        "});\n\nmodule.exports = {\n    gunuPersonelHesapla, rolTuru,",
        "});\n\n/* Tarihe özel ve kapsam dışı öğrenciler için tüm yazma yolları aynı\n   kapıdan geçer. Kapsam dışı seviyelerde otomatik satırlar temizlenir;\n   kilitli/manual kayıtlar korunur. */\nconst devamsizligiYaz = async (personId, date, cfg) => {\n    const temelCfg = cfg || await ayarlariAl();\n    const kisi = await tek(`SELECT * FROM api_users WHERE kisi_id = $1`, [personId]);\n    const gunAyari = denemeGunleri.resolveForPerson(temelCfg, date, kisi);\n    if (gunAyari.excluded) {\n        await sorgu(`DELETE FROM devamsizlik WHERE ogrenci_id=$1 AND tarih=$2::date AND otomatik`, [personId, date]);\n        await sorgu(`DELETE FROM yoklama_uzlastirma WHERE kisi_id=$1 AND tarih=$2::date AND NOT kilitli AND kaynak='otomatik'`, [personId, date]);\n        return denemeGunleri.closedResult(gunAyari.config, gunAyari.rule, gunAyari.grade);\n    }\n    return devamsizligiYazici(personId, date, gunAyari.config);\n};\n\nmodule.exports = {\n    gunuPersonelHesapla, rolTuru,",
        "writer wrapper",
    )
    text = replace_once(
        text,
        "    dakikaDilimde, gunAnahtari, gunAdi, kapaliGunMu, saatCevir, dkCevir,\n    gunuHesapla, devamsizligiYaz,\n};",
        "    dakikaDilimde, gunAnahtari, gunAdi, kapaliGunMu, saatCevir, dkCevir,\n    gunuHesapla, devamsizligiYaz, denemeGunleri,\n};",
        "exports",
    )
    path.write_text(text)
    print(f"patched {path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: patch_exam_days.py /path/to/backend")
    patch(sys.argv[1])
