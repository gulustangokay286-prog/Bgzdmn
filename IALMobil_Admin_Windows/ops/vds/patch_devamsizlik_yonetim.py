#!/usr/bin/env python3
"""
DEVAMSIZLIK YONETIMI — sunucu uclari (idempotent).

Devamsizlik ekranina gelen yeni ozellikler icin:
  1. history(): her gune o gun ogrencinin velisine giden SMS'ler eklenir
     (sms: [{saat, tur, durum, ozet}]) ve toplam sms_gecmisi doner.
  2. POST /api/devamsizlik/toplu  { ogrenciId, tarihler[], islem, sebep }
       islem = 'izinli'   -> gun izinli/raporlu sayilir (agirlik 0)
       islem = 'mevcut'   -> devamsizlik silinir, gun MEVCUT sayilir
       islem = 'otomatik' -> idare mudahalesi geri alinir, gun yeniden hesaplanir
     Karar iki yerde kilitlenir: yoklama_uzlastirma (kilitli, iki oturum) +
     devamsizlik (manuel satir). Rapor ve otomasyon ikisini de onceler;
     izinli gunde veli SMS'i gitmez (otomasyon.izinliMi).
  3. DELETE /api/devamsizlik/:id -> tek ham satir silinir, gun yeniden hesaplanir.
  Hicbir uc SMS gondermez.

Kullanim: python3 patch_devamsizlik_yonetim.py /opt/ial-backend
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

# ------------------------------------------------- services/attendanceReport.cjs
p = root / 'services' / 'attendanceReport.cjs'
s = p.read_text(encoding='utf-8')
s2 = replace_once(
    s,
    "    const gecisler = await hepsi(\n"
    "        'SELECT id,kisi_id,tarih,yon,kaynak,zaman,not_ FROM gecisler WHERE kisi_id=$1 ORDER BY zaman DESC,id DESC', [personId]);\n"
    "    return { success: true, kisi_id: personId, bugun: today, kayitlar, ham_devamsizlik, gecisler,\n"
    "             guncellendi: new Date().toISOString() };\n",
    "    const gecisler = await hepsi(\n"
    "        'SELECT id,kisi_id,tarih,yon,kaynak,zaman,not_ FROM gecisler WHERE kisi_id=$1 ORDER BY zaman DESC,id DESC', [personId]);\n"
    "    /* O gun veliye giden SMS'ler: ekran \"bugun mesaj gitti mi\" sorusuna\n"
    "       buradan cevap verir. Denetim tablosundan okunur, gonderim yapmaz. */\n"
    "    const smsSatirlari = await hepsi(`\n"
    "        SELECT id, (created_at AT TIME ZONE 'Europe/Istanbul')::date::text AS tarih,\n"
    "               to_char(created_at AT TIME ZONE 'Europe/Istanbul','HH24:MI') AS saat,\n"
    "               kind AS tur, status AS durum, phone AS telefon, reason_code AS sebep,\n"
    "               split_part(replace(body, E'\\\\n', ' '), 'Boğaziçi Koleji', 1) AS ozet\n"
    "          FROM sms_audit WHERE student_id=$1 ORDER BY created_at DESC`, [personId]);\n"
    "    const smsGune = new Map();\n"
    "    for (const r of smsSatirlari) {\n"
    "        if (!smsGune.has(r.tarih)) smsGune.set(r.tarih, []);\n"
    "        smsGune.get(r.tarih).push({ id: r.id, saat: r.saat, tur: r.tur, durum: r.durum, telefon: r.telefon,\n"
    "            ozet: String(r.ozet || '').replace(/^Sayın Velimiz,\\s*/, '').trim().slice(0, 140) });\n"
    "    }\n"
    "    for (const k of kayitlar) {\n"
    "        const liste = smsGune.get(String(k.tarih).slice(0, 10)) || [];\n"
    "        k.sms = liste;\n"
    "        k.sms_gonderildi = liste.some((x) => x.durum === 'sent');\n"
    "    }\n"
    "    return { success: true, kisi_id: personId, bugun: today, kayitlar, ham_devamsizlik, gecisler,\n"
    "             sms_gecmisi: smsSatirlari, guncellendi: new Date().toISOString() };\n",
    "history sms",
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
    "/* ------------------------------------------------------------ SMS ------ */\n"
    "/* Gonderim netgsmService icindeki kilitle engellenir (SMS_GONDERIM_ACIK).\n",
    "/* ------------------------------------------ DEVAMSIZLIK YONETIMI ------ */\n"
    "/**\n"
    " * Toplu devamsizlik islemi — idare kararini iki yerde kilitler:\n"
    " *   yoklama_uzlastirma (kilitli, sabah + ogleden sonra) ve devamsizlik (manuel).\n"
    " *   izinli   : gun izinli/raporlu (agirlik 0)\n"
    " *   mevcut   : devamsizlik silinir, gun mevcut sayilir\n"
    " *   otomatik : idare kaydi kaldirilir, gun gecislerden yeniden hesaplanir\n"
    " * SMS gondermez. Izinli gunde otomasyon da veliye mesaj atmaz.\n"
    " */\n"
    "app.post('/api/devamsizlik/toplu', verifyAdmin, async (req, res) => {\n"
    "    try {\n"
    "        const { ogrenciId, tarihler, islem, sebep } = req.body || {};\n"
    "        const u = await veri.kullanici.bul(ogrenciId);\n"
    "        if (!u) return res.status(404).json({ success: false, error: 'Kişi bulunamadı.' });\n"
    "        const gunler = [...new Set((Array.isArray(tarihler) ? tarihler : [tarihler])\n"
    "            .map((t) => String(t || '').slice(0, 10)).filter((t) => /^\\d{4}-\\d{2}-\\d{2}$/.test(t)))];\n"
    "        if (!gunler.length) return res.status(400).json({ success: false, error: 'En az bir tarih seçin.' });\n"
    "        if (!['izinli', 'mevcut', 'otomatik'].includes(islem))\n"
    "            return res.status(400).json({ success: false, error: 'Geçersiz işlem.' });\n"
    "        const cfg = await yoklama.ayarlariAl();\n"
    "        const bugun = yoklama.gunAnahtari(new Date(), cfg.saatDilimi);\n"
    "        if (gunler.some((g) => g > bugun)) return res.status(400).json({ success: false, error: 'Gelecek tarihe işlem yapılamaz.' });\n"
    "        const aciklama = String(sebep || '').trim().slice(0, 200)\n"
    "            || (islem === 'izinli' ? 'İzinli / raporlu (idare)' : islem === 'mevcut' ? 'Devamsızlık idare tarafından silindi' : '');\n"
    "        const sonuc = [];\n"
    "        for (const gun of gunler) {\n"
    "            await islem_(async (t) => {\n"
    "                await t.query(`SET LOCAL app.kilit_ac = 'evet'`); // idare kararı: kilitli satırlar bu transaction'da değişebilir\n"
    "                if (islem === 'otomatik') {\n"
    "                    await t.query(`DELETE FROM devamsizlik WHERE ogrenci_id=$1 AND tarih=$2::date AND NOT otomatik`, [u.kisi_id, gun]);\n"
    "                    await t.query(`DELETE FROM yoklama_uzlastirma WHERE kisi_id=$1 AND tarih=$2::date AND kilitli`, [u.kisi_id, gun]);\n"
    "                    await t.query(`DELETE FROM devamsizlik WHERE ogrenci_id=$1 AND tarih=$2::date AND otomatik`, [u.kisi_id, gun]);\n"
    "                    await t.query(`DELETE FROM yoklama_uzlastirma WHERE kisi_id=$1 AND tarih=$2::date AND NOT kilitli`, [u.kisi_id, gun]);\n"
    "                    return;\n"
    "                }\n"
    "                const durum = islem === 'izinli' ? 'izinli' : 'var';\n"
    "                for (const oturum of ['sabah', 'ogleden_sonra']) {\n"
    "                    await t.query(`INSERT INTO yoklama_uzlastirma (kisi_id,tarih,oturum,durum,agirlik,sebep,kaynak,kilitli,olusturan)\n"
    "                         VALUES ($1,$2::date,$3,$4,0,$5,'manuel_uzlastirma',true,$6)\n"
    "                         ON CONFLICT (kisi_id,tarih,oturum) DO UPDATE\n"
    "                           SET durum=EXCLUDED.durum, agirlik=0, sebep=EXCLUDED.sebep, kaynak='manuel_uzlastirma',\n"
    "                               kilitli=true, olusturan=EXCLUDED.olusturan, guncellendi=now()`,\n"
    "                        [u.kisi_id, gun, oturum, durum, aciklama, req.user.kisi_id]);\n"
    "                }\n"
    "                await t.query(`DELETE FROM devamsizlik WHERE ogrenci_id=$1 AND tarih=$2::date`, [u.kisi_id, gun]);\n"
    "                await t.query(`INSERT INTO devamsizlik (ogrenci_id, tarih, durum, ders_saati, agirlik, sebep, otomatik, kaydeden_id)\n"
    "                     VALUES ($1,$2::date,$3,0,0,$4,false,$5)`, [u.kisi_id, gun, durum, aciklama, req.user.kisi_id]);\n"
    "            });\n"
    "            let h = null;\n"
    "            try { h = await yoklama.devamsizligiYaz(u.kisi_id, gun, cfg); } catch (e) { console.warn('[DEVAMSIZLIK] yeniden hesap', gun, e.message); }\n"
    "            sonuc.push({ tarih: gun, durum: h?.durum || null });\n"
    "        }\n"
    "        await veri.guvenlik.yaz({ olay: 'devamsizlik_toplu', kisiId: req.user.kisi_id, ip: req.ip,\n"
    "                                  detay: { ogrenciId: u.kisi_id, islem, tarihler: gunler, sebep: aciklama } });\n"
    "        res.json({ success: true, islem, sonuc });\n"
    "    } catch (e) { hata(res, e); }\n"
    "});\n"
    "\n"
    "/** Tek ham devamsizlik satirini siler; gun gecislerden yeniden hesaplanir. */\n"
    "app.delete('/api/devamsizlik/:id', verifyAdmin, async (req, res) => {\n"
    "    try {\n"
    "        const satir = await tek(`DELETE FROM devamsizlik WHERE id=$1 RETURNING ogrenci_id, tarih::text AS tarih, durum, otomatik`, [Number(req.params.id)]);\n"
    "        if (!satir) return res.status(404).json({ success: false, error: 'Kayıt bulunamadı.' });\n"
    "        const kalanManuel = await tek(`SELECT 1 FROM devamsizlik WHERE ogrenci_id=$1 AND tarih=$2::date AND NOT otomatik LIMIT 1`, [satir.ogrenci_id, satir.tarih]);\n"
    "        if (!kalanManuel) {\n"
    "            // Idare kaydi kalmadiysa kilitli uzlastirma da kaldirilir; gun otomatige doner.\n"
    "            await islem_(async (t) => {\n"
    "                await t.query(`SET LOCAL app.kilit_ac = 'evet'`);\n"
    "                await t.query(`DELETE FROM yoklama_uzlastirma WHERE kisi_id=$1 AND tarih=$2::date AND kilitli`, [satir.ogrenci_id, satir.tarih]);\n"
    "            });\n"
    "        }\n"
    "        let h = null;\n"
    "        try { h = await yoklama.devamsizligiYaz(satir.ogrenci_id, satir.tarih); } catch (e) { console.warn('[DEVAMSIZLIK] yeniden hesap', e.message); }\n"
    "        await veri.guvenlik.yaz({ olay: 'devamsizlik_silindi', kisiId: req.user.kisi_id, ip: req.ip,\n"
    "                                  detay: { id: Number(req.params.id), ogrenciId: satir.ogrenci_id, tarih: satir.tarih, durum: satir.durum } });\n"
    "        res.json({ success: true, silinen: satir, yeniDurum: h?.durum || null });\n"
    "    } catch (e) { hata(res, e); }\n"
    "});\n"
    "\n"
    "/* ------------------------------------------------------------ SMS ------ */\n"
    "/* Gonderim netgsmService icindeki kilitle engellenir (SMS_GONDERIM_ACIK).\n",
    "devamsizlik uclari",
)
# `islem` gövde alanıyla çakışmasın diye transaction yardımcısına takma ad
s2 = replace_once(
    s2,
    "const { degisiklikleriDinle, tek, hepsi, sorgu, islem } = require('./db');\n",
    "const { degisiklikleriDinle, tek, hepsi, sorgu, islem } = require('./db');\n"
    "const islem_ = islem;\n",
    "db import",
)
if s2 != s:
    p.write_text(s2, encoding='utf-8'); print(f'Uygulandi: {p}')
else:
    print(f'Zaten uygulanmis: {p}')
