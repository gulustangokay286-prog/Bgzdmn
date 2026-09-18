#!/usr/bin/env python3
"""
HAFTANIN GUNUNE OZEL SAATLER (idempotent).

Cuma gunleri ogle arasi farkli: 12:10 cikis, 13:30 giris (diger gunler
13:00 / 14:10). Motor tek bir kurum saat setiyle calisiyordu; artik
haftanin gunune gore alanlar ezilebilir:

  ayarlar.institution.gunSaatleri = [
    { "ad": "Cuma öğle arası", "gunler": ["Cuma"], "aktif": true,
      "ogleCikis": "12:10", "yarimGunSiniri": "12:10", "ogledenSonraGiris": "13:30" }
  ]

Yalnizca yazilan alanlar ezilir; digerleri kurum genelinden gelir. Tarihe
ozel kurallar (deneme / tatil / ozel program) bunun USTUNE uygulanir.

  yoklama.js             : coz() yeni anahtari dogrular ve tasir
  denemeGunleri.live.cjs : gunSaatleriUygula(); resolveForPerson basinda uygulanir,
                           boylece kapi karari, otomasyon, gunluk rapor ve SMS
                           hepsi ayni gun saatlerini gorur
  otomasyon.js           : ogle veli bildirimi tetigi gunun ogle saatini kullanir

Kullanim: python3 patch_gun_saatleri.py /opt/ial-backend
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

# ------------------------------------------------------------------ yoklama.js
p = root / 'yoklama.js'
s = p.read_text(encoding='utf-8')
s2 = replace_once(
    s,
    "    const kapaliList = Array.isArray(al('kapaliGunler', 'closedDays'))",
    "    /* Haftanin gunune ozel saatler. Bicim:\n"
    "       [{ gunler:['Cuma'], ogleCikis:'12:10', ogledenSonraGiris:'13:30', yarimGunSiniri:'12:10' }]\n"
    "       Yalnizca yazilan alanlar o gun kurum genelini ezer. */\n"
    "    const GUN_SAAT_ALANLARI = ['gunBaslangici', 'sabahGiris', 'sabahSonGirisSaati', 'ogleCikis',\n"
    "        'yarimGunSiniri', 'ogledenSonraGiris', 'ogledenSonraSonGirisSaati', 'okulCikis', 'kesilmeSaati', 'gunSonu'];\n"
    "    const GUN_SAYI_ALANLARI = ['sabahMusaadeDk', 'ogleCikisMusaadeDk', 'ogledenSonraMusaadeDk'];\n"
    "    const gunSaatList = (Array.isArray(al('gunSaatleri', 'weekdayHours'))\n"
    "        ? al('gunSaatleri', 'weekdayHours') : [])\n"
    "        .map((k) => {\n"
    "            const gunler = (Array.isArray(k?.gunler) ? k.gunler : k?.days || [])\n"
    "                .map((g) => String(g).trim()).filter(Boolean);\n"
    "            const alanlar = {};\n"
    "            for (const a of GUN_SAAT_ALANLARI) { const v = saat(k?.[a], ''); if (v) alanlar[a] = v; }\n"
    "            for (const a of GUN_SAYI_ALANLARI) {\n"
    "                if (k?.[a] !== undefined && k?.[a] !== null && k?.[a] !== '' && Number.isFinite(Number(k[a]))) alanlar[a] = Number(k[a]);\n"
    "            }\n"
    "            if (!gunler.length || !Object.keys(alanlar).length) return null;\n"
    "            return { gunler, ...alanlar,\n"
    "                     ad: String(k?.ad || k?.name || '').slice(0, 60),\n"
    "                     aktif: mantik(k?.aktif ?? k?.active, true) };\n"
    "        }).filter(Boolean);\n"
    "\n"
    "    const kapaliList = Array.isArray(al('kapaliGunler', 'closedDays'))",
    "kapaliList oncesi",
)
s2 = replace_once(
    s2,
    "        seviyeCikislari:       seviyeCikisList,\n"
    "        gradeExits:            seviyeCikisList,\n",
    "        seviyeCikislari:       seviyeCikisList,\n"
    "        gradeExits:            seviyeCikisList,\n"
    "        gunSaatleri:           gunSaatList,\n"
    "        weekdayHours:          gunSaatList,\n",
    "seviyeCikislari satiri",
)
if s2 != s:
    p.write_text(s2, encoding='utf-8'); print(f'Uygulandi: {p}')
else:
    print(f'Zaten uygulanmis: {p}')

# ------------------------------------------------------ denemeGunleri.live.cjs
p = root / 'denemeGunleri.live.cjs'
s = p.read_text(encoding='utf-8')
s2 = replace_once(
    s,
    "function resolveForPerson(baseConfig, date, person) {\n"
    "    const key = String(date || '');\n",
    "/**\n"
    " * HAFTANIN GUNUNE OZEL SAATLER. Or. Cuma ogle arasi 12:10-13:30. Kural\n"
    " * yalnizca yazdigi alanlari ezer; deneme/tatil/ozel program bunun ustune\n"
    " * uygulanir. Tum tuketiciler (kapi karari, otomasyon, rapor, SMS)\n"
    " * resolveForPerson uzerinden gectigi icin tek noktadan uygulanir.\n"
    " */\n"
    "const GUN_SAAT_ALANLARI = ['gunBaslangici', 'sabahGiris', 'sabahMusaadeDk', 'sabahSonGirisSaati',\n"
    "    'ogleCikis', 'ogleCikisMusaadeDk', 'yarimGunSiniri', 'ogledenSonraGiris', 'ogledenSonraMusaadeDk',\n"
    "    'ogledenSonraSonGirisSaati', 'okulCikis', 'kesilmeSaati', 'gunSonu'];\n"
    "\n"
    "function gunSaatKurali(config, date) {\n"
    "    const dayNorm = normalizeDayName(weekdayName(date));\n"
    "    if (!dayNorm) return null;\n"
    "    const list = Array.isArray(config?.gunSaatleri) ? config.gunSaatleri\n"
    "        : (Array.isArray(config?.weekdayHours) ? config.weekdayHours : []);\n"
    "    return list.find((k) => k && k.aktif !== false && Array.isArray(k.gunler)\n"
    "        && k.gunler.some((g) => normalizeDayName(g) === dayNorm)) || null;\n"
    "}\n"
    "\n"
    "function gunSaatleriUygula(config, date) {\n"
    "    const kural = gunSaatKurali(config, date);\n"
    "    if (!kural) return config;\n"
    "    const out = { ...config, gunSaatKurali: kural };\n"
    "    for (const a of GUN_SAAT_ALANLARI) {\n"
    "        if (kural[a] !== undefined && kural[a] !== null && kural[a] !== '') out[a] = kural[a];\n"
    "    }\n"
    "    return out;\n"
    "}\n"
    "\n"
    "function resolveForPerson(temelConfig, date, person) {\n"
    "    const key = String(date || '');\n"
    "    const baseConfig = gunSaatleriUygula(temelConfig, key);\n",
    "resolveForPerson basi",
)
s2 = replace_once(
    s2,
    "module.exports = {\n"
    "    normalizeRules,\n",
    "module.exports = {\n"
    "    gunSaatKurali,\n"
    "    gunSaatleriUygula,\n"
    "    normalizeRules,\n",
    "exports",
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
    "    if (cfg.autoAttendanceEnabled && dk >= yoklama.pencereler(cfg).ogleCikis && !yapilan.includes('ogle_sms_tamam')) {\n",
    "    /* Gunun ogle saati (Cuma 12:10 gibi gune ozel saat varsa o). */\n"
    "    const gunCfg = denemeGunleri.gunSaatleriUygula(cfg, gun);\n"
    "    if (cfg.autoAttendanceEnabled && dk >= yoklama.pencereler(gunCfg).ogleCikis && !yapilan.includes('ogle_sms_tamam')) {\n",
    "ogle bildirimi tetigi",
)
if s2 != s:
    p.write_text(s2, encoding='utf-8'); print(f'Uygulandi: {p}')
else:
    print(f'Zaten uygulanmis: {p}')

# ------------------------------------------------------------------- server.js
p = root / 'server.js'
s = p.read_text(encoding='utf-8')
s2 = replace_once(
    s,
    "            gradeExits: 'seviyeCikislari',\n",
    "            gradeExits: 'seviyeCikislari',\n"
    "            weekdayHours: 'gunSaatleri',\n",
    "alanEsleme",
)
s2 = replace_once(
    s2,
    "        cozulmus.gradeExits = Array.isArray(cozulmus.seviyeCikislari) ? cozulmus.seviyeCikislari : (cozulmus.gradeExits || []);\n"
    "        cozulmus.seviyeCikislari = cozulmus.gradeExits;\n",
    "        cozulmus.gradeExits = Array.isArray(cozulmus.seviyeCikislari) ? cozulmus.seviyeCikislari : (cozulmus.gradeExits || []);\n"
    "        cozulmus.seviyeCikislari = cozulmus.gradeExits;\n"
    "        cozulmus.weekdayHours = Array.isArray(cozulmus.gunSaatleri) ? cozulmus.gunSaatleri : (cozulmus.weekdayHours || []);\n"
    "        cozulmus.gunSaatleri = cozulmus.weekdayHours;\n",
    "PUT esitleme",
)
s2 = replace_once(
    s2,
    "            ayarlar.gradeExits = Array.isArray(ayarlar.seviyeCikislari) ? ayarlar.seviyeCikislari : (ayarlar.gradeExits || []);\n"
    "            ayarlar.seviyeCikislari = ayarlar.gradeExits;\n",
    "            ayarlar.gradeExits = Array.isArray(ayarlar.seviyeCikislari) ? ayarlar.seviyeCikislari : (ayarlar.gradeExits || []);\n"
    "            ayarlar.seviyeCikislari = ayarlar.gradeExits;\n"
    "            ayarlar.weekdayHours = Array.isArray(ayarlar.gunSaatleri) ? ayarlar.gunSaatleri : (ayarlar.weekdayHours || []);\n"
    "            ayarlar.gunSaatleri = ayarlar.weekdayHours;\n",
    "GET esitleme",
)
if s2 != s:
    p.write_text(s2, encoding='utf-8'); print(f'Uygulandi: {p}')
else:
    print(f'Zaten uygulanmis: {p}')
