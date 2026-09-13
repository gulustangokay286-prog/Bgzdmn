#!/usr/bin/env python3
"""
YARIM GUN VELI BILDIRIMLERI — uc dosyaya idempotent yama.

  services/netgsmService.js  : tek sablon (veliMesajAdi / veliMesajMetni) + yeni turler
  services/veliBildirim.js   : karar.tur / karar.kind ile acik tur; audit govdesi = gercek SMS
  otomasyon.js               : 13:00 ogle bildirimi, 16:35 gun sonu bildirimi, izinli korumasi

MESAJ AKISI (ogrenci):
  Kapida (mevcut)   : giris / gec_giris / cikis
  13:00 (ogleCikis) : sabah hic giris yok            -> sabah_gelmedi
                      giris var ama 10:40'tan sonra -> sabah_gec (saat = ilk giris)
  16:35 (kesilme)   : gun boyu hic giris yok         -> tam_gun_gelmedi (tek birlesik mesaj)
                      sabah var, ogleden sonra yok   -> ogleden_sonra_gelmedi
                      ogleden sonra 15:00'tan sonra  -> ogleden_sonra_gec (saat = ilk giris)
                      sabah yok, ogleden sonra var   -> (13:00'te bildirildi, yeni mesaj yok)
  Gunde bir kez (ayarlar.otomasyon isaretleri). Manuel/kilitli 'izinli' kaydi olan ogrenciye
  bildirim gitmez. Tatil / ozel program politikasi veliBildirim icinde uygulanir.

Kullanim: python3 patch_yarim_gun_sms.py /opt/ial-backend
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

# ------------------------------------------------------------ netgsmService
p = root / 'services' / 'netgsmService.js'
s = p.read_text(encoding='utf-8')
s2 = replace_once(
    s,
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
    "/* Veliye giden TUM mesajlarin tek sablonu. Kapi gecisi (server.js), otomatik\n"
    "   cikis, 13:00 ogle ve 16:35 gun sonu bildirimleri (otomasyon.js) buradan gecer. */\n"
    "function veliMesajMetni(tur, { ad, zaman = '', gecikmeDk = 0 } = {}) {\n"
    "    const metinler = {\n"
    "        giris:     `Sayın Velimiz,\\n\\nÖğrencimiz ${ad} saat ${zaman} itibariyle okulumuza giriş yapmıştır.\\n\\nBoğaziçi Koleji`,\n"
    "        gec_giris: `Sayın Velimiz,\\n\\nÖğrencimiz ${ad} saat ${zaman} itibariyle okulumuza ${gecikmeDk} dakika geç giriş yapmıştır.\\n\\nBoğaziçi Koleji`,\n"
    "        cikis:     `Sayın Velimiz,\\n\\nÖğrencimiz ${ad} saat ${zaman} itibariyle okulumuzdan çıkış yapmıştır.\\n\\nBoğaziçi Koleji`,\n"
    "        sabah_gelmedi:         `Sayın Velimiz,\\n\\nÖğrencimiz ${ad} öğleden önce okulumuza giriş yapmamıştır.\\n\\nBoğaziçi Koleji`,\n"
    "        sabah_gec:             `Sayın Velimiz,\\n\\nÖğrencimiz ${ad} öğleden önce okulumuza saat ${zaman} itibariyle geç giriş yapmıştır.\\n\\nBoğaziçi Koleji`,\n"
    "        ogleden_sonra_gelmedi: `Sayın Velimiz,\\n\\nÖğrencimiz ${ad} öğleden sonra okulumuza giriş yapmamıştır.\\n\\nBoğaziçi Koleji`,\n"
    "        ogleden_sonra_gec:     `Sayın Velimiz,\\n\\nÖğrencimiz ${ad} öğleden sonra okulumuza saat ${zaman} itibariyle geç giriş yapmıştır.\\n\\nBoğaziçi Koleji`,\n"
    "        tam_gun_gelmedi:       `Sayın Velimiz,\\n\\nÖğrencimiz ${ad} bugün öğleden önce ve öğleden sonra okulumuza giriş yapmamıştır.\\n\\nBoğaziçi Koleji`,\n"
    "        gelmedi:               `Sayın Velimiz,\\n\\nÖğrencimiz ${ad} bugün öğleden önce ve öğleden sonra okulumuza giriş yapmamıştır.\\n\\nBoğaziçi Koleji`,\n"
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
    "netgsm sendParentGateSms",
)
s2 = replace_once(
    s2,
    "    sendSms,\n    sendParentGateSms,\n",
    "    sendSms,\n    sendParentGateSms,\n    veliMesajAdi, veliMesajMetni,\n",
    "netgsm exports",
)
if s2 != s:
    p.write_text(s2, encoding='utf-8'); print(f'Uygulandi: {p}')
else:
    print(f'Zaten uygulanmis: {p}')

# ------------------------------------------------------------ veliBildirim
p = root / 'services' / 'veliBildirim.js'
s = p.read_text(encoding='utf-8')
s2 = replace_once(
    s,
    "    const tur = karar.yon === 'cikis' ? 'cikis' : (karar.gec ? 'gec_giris' : 'giris');\n"
    "    const turMetni = tur === 'cikis' ? 'kurumdan çıkış yaptı' : (tur === 'gec_giris' ? 'geç giriş yaptı' : 'kuruma giriş yaptı');\n"
    "    const body = `Sayın Velimiz, ${kisi.full_name || kisi.tam_ad || 'Öğrenciniz'} ${turMetni}. Saat: ${karar.saat || '—'}.`;\n",
    "    /* Tur acikca verilebilir (13:00 / 16:35 yarim gun bildirimleri); verilmezse\n"
    "       gecis yonunden turetilir. Audit govdesi veliye giden GERCEK metindir. */\n"
    "    const tur = karar.tur || (karar.yon === 'cikis' ? 'cikis' : (karar.gec ? 'gec_giris' : 'giris'));\n"
    "    const body = netgsmService.veliMesajMetni(tur, {\n"
    "        ad: netgsmService.veliMesajAdi(kisi.full_name || kisi.tam_ad),\n"
    "        zaman: karar.saat || '', gecikmeDk: karar.gecikme_dk || 0,\n"
    "    });\n",
    "veliBildirim tur/body",
)
s2 = replace_once(
    s2,
    "            body, kind: 'gate', result,\n",
    "            body, kind: karar.kind || 'gate', result,\n",
    "veliBildirim audit kind",
)
if s2 != s:
    p.write_text(s2, encoding='utf-8'); print(f'Uygulandi: {p}')
else:
    print(f'Zaten uygulanmis: {p}')

# ------------------------------------------------------------ otomasyon
p = root / 'otomasyon.js'
s = p.read_text(encoding='utf-8')

# 1) Gun sonu: tek "gelmedi" yerine uc durumlu bildirim; izinli korumasi.
s2 = replace_once(
    s,
    "            /* \"Bugun okula GELMEDI\" mesaji yalnizca o gun HIC okutmasi\n"
    "               olmayana gider. `durum === 'yok'` yarim gunu de kapsiyor:\n"
    "               sabah gelip ogleden sonra donmeyen ogrencinin velisine\n"
    "               \"gelmemistir\" yazmak yanlis olurdu. */\n"
    "            if (o.ogrenci && h.durum === 'yok' && (h.oturumlar || []).length === 0\n"
    "                && !h.oturumBilgi?.sabah?.giris && !h.oturumBilgi?.ogleden_sonra?.giris) {\n"
    "                gelmeyen.push({ ...o, smsAllowed: politika.smsAllowed !== false });\n"
    "            }\n",
    "            /* GUN SONU VELI BILDIRIMI (ogrenci). Sabahin eksigi 13:00'te bildirildi;\n"
    "               burada ogleden sonra ve tam gun degerlendirilir:\n"
    "                 hic giris yok               -> tam_gun_gelmedi (birlesik mesaj)\n"
    "                 sabah var, ogleden sonra yok-> ogleden_sonra_gelmedi\n"
    "                 ogleden sonra 15:00 sonrasi -> ogleden_sonra_gec\n"
    "                 sabah yok, ogleden sonra var-> mesaj yok (13:00'te bildirildi) */\n"
    "            if (o.ogrenci && h.durum !== 'kapali') {\n"
    "                const sb = h.oturumBilgi?.sabah || {};\n"
    "                const os = h.oturumBilgi?.ogleden_sonra || {};\n"
    "                const tur = !sb.giris && !os.giris ? 'tam_gun_gelmedi'\n"
    "                    : sb.giris && !os.giris ? 'ogleden_sonra_gelmedi'\n"
    "                    : os.giris && !os.kazandi ? 'ogleden_sonra_gec'\n"
    "                    : null;\n"
    "                if (tur) gelmeyen.push({ ...o, kisi, tur, saat: os.giris || '' });\n"
    "            }\n",
    "gun sonu karar",
)
s2 = replace_once(
    s2,
    "    /* VELIYE \"GELMEDI\" BILDIRIMI.\n"
    "       Gunde BIR kez calisir (yukaridaki devamsizlik_ ogrenci isaretiyle korunur).\n"
    "       Yalnizca ogrenciler; personelin velisi yoktur. */\n"
    "    for (const o of gelmeyen) {\n"
    "        const recipients = await hepsi(`\n"
    "            SELECT DISTINCT v.veli_id, phones.telefon\n"
    "              FROM veli_ogrenci v\n"
    "              JOIN kisiler kv ON kv.id=v.veli_id\n"
    "         LEFT JOIN LATERAL (\n"
    "                SELECT candidate.telefon\n"
    "                  FROM (\n"
    "                    SELECT NULLIF(btrim(kv.telefon::text), '') AS telefon\n"
    "                    UNION\n"
    "                    SELECT btrim(kt.telefon::text) AS telefon\n"
    "                      FROM kisi_telefonlari kt\n"
    "                     WHERE kt.kisi_id = kv.id\n"
    "                  ) candidate\n"
    "                 WHERE candidate.telefon IS NOT NULL\n"
    "              ) phones ON true\n"
    "             WHERE v.ogrenci_id=$1\n"
    "          ORDER BY v.veli_id, phones.telefon`, [o.kisi_id]);\n"
    "        for (const parent of recipients.length ? recipients : [{}]) {\n"
    "            const body = o.tam_ad + ' bugün kuruma gelmemiştir. (' + gun + ')';\n"
    "            /* Gonderim NetGSM tarafindaki SMS_GONDERIM_ACIK kilidinden gecer.\n"
    "               Telefon yoksa provider'a istek atilmaz; audit kaydi sebebiyle\n"
    "               birlikte yazilir, gecmis teslimat verisi uydurulmaz. */\n"
    "            const result = !o.smsAllowed\n"
    "                ? { success: false, blocked: true,\n"
    "                    error: 'Tatil/kapalı gün veya özel program — öğrenci SMS bildirimi kapalı.' }\n"
    "                : parent.telefon\n"
    "                ? await netgsm.sendSms({ to: parent.telefon, message: body })\n"
    "                : { success: false, error: 'Veli telefonu bulunamadı.' };\n"
    "            await smsAudit.recordDelivery({ studentId: o.kisi_id, parentId: parent.veli_id,\n"
    "                phone: parent.telefon, kind: 'absence', body, result });\n"
    "        }\n"
    "    }\n"
    "    return n;\n",
    "    /* VELIYE GUN SONU BILDIRIMI.\n"
    "       Gunde BIR kez calisir (yukaridaki devamsizlik_ ogrenci isaretiyle korunur).\n"
    "       Alici cozumu, tatil/ozel program politikasi, sablon ve audit tek yerde:\n"
    "       veliBildirim. Gonderim NetGSM tarafindaki SMS_GONDERIM_ACIK kilidinden gecer. */\n"
    "    for (const o of gelmeyen) {\n"
    "        try {\n"
    "            if (await izinliMi(o.kisi_id, gun)) continue;\n"
    "            await veliBildirim.veliyeBildir(o.kisi || { kisi_id: o.kisi_id, full_name: o.tam_ad, roles: ['ogrenci'] },\n"
    "                { tur: o.tur, saat: o.saat, tarih: gun, kind: 'absence' });\n"
    "        } catch (e) {\n"
    "            console.error('[OTOMASYON] gun sonu veli bildirimi', o.kisi_id, e.message);\n"
    "        }\n"
    "    }\n"
    "    return n;\n",
    "gun sonu gonderim",
)

# 2) Izinli korumasi + 13:00 ogle bildirimi (devamsizligiTamamla'dan once tanimlanir).
s2 = replace_once(
    s2,
    "async function devamsizligiTamamla(gun, cfg, suAnDk) {\n",
    "/** Idarenin elle girdigi (ya da kilitledigi) 'izinli' kaydi varsa veliye eksik mesaji gitmez. */\n"
    "async function izinliMi(kisiId, gun) {\n"
    "    const r = await tek(\n"
    "        `SELECT 1 FROM devamsizlik WHERE ogrenci_id=$1 AND tarih=$2::date AND NOT otomatik AND durum='izinli'\n"
    "         UNION ALL\n"
    "         SELECT 1 FROM yoklama_uzlastirma WHERE kisi_id=$1 AND tarih=$2::date AND kilitli AND durum='izinli'\n"
    "         LIMIT 1`, [kisiId, gun]);\n"
    "    return Boolean(r);\n"
    "}\n"
    "\n"
    "/**\n"
    " * 13:00 OGLE BILDIRIMI (ogrenci). Sabah oturumu ogle cikisinda biter; o anda:\n"
    " *   sabah hic giris yok              -> sabah_gelmedi\n"
    " *   giris var ama son giristen sonra -> sabah_gec (saat = ilk giris)\n"
    " * Gunde bir kez (ogle_sms_<id> isareti). Tatil / ozel program / izinli korunur.\n"
    " */\n"
    "async function ogleBildirimi(gun, cfg) {\n"
    "    const ogrenciler = await hepsi(\n"
    "        `SELECT DISTINCT k.id AS kisi_id, k.tam_ad FROM kisiler k JOIN kisi_rolleri r ON r.kisi_id = k.id\n"
    "          WHERE k.aktif AND r.rol = 'ogrenci'`);\n"
    "    const yapilan = await isaretleriOku(gun);\n"
    "    const yeni = [];\n"
    "    let gonderilen = 0;\n"
    "    for (const o of ogrenciler) {\n"
    "        const isaret = `ogle_sms_${o.kisi_id}`;\n"
    "        if (yapilan.includes(isaret)) continue;\n"
    "        try {\n"
    "            const kisi = await tek('SELECT * FROM api_users WHERE kisi_id = $1', [o.kisi_id]);\n"
    "            const politika = denemeGunleri.resolveForPerson(cfg, gun, kisi || { kisi_id: o.kisi_id, role: 'ogrenci', roles: ['ogrenci'] });\n"
    "            yeni.push(isaret);\n"
    "            if (politika.excluded || politika.closed) continue;\n"
    "            const h = await yoklama.devamsizligiYaz(o.kisi_id, gun, politika.config);\n"
    "            if (h.durum === 'kapali') continue;\n"
    "            const sb = h.oturumBilgi?.sabah || {};\n"
    "            const tur = !sb.giris ? 'sabah_gelmedi' : (!sb.kazandi ? 'sabah_gec' : null);\n"
    "            if (!tur) continue;\n"
    "            if (await izinliMi(o.kisi_id, gun)) continue;\n"
    "            await veliBildirim.veliyeBildir(kisi || { kisi_id: o.kisi_id, full_name: o.tam_ad, roles: ['ogrenci'] },\n"
    "                { tur, saat: sb.giris || '', tarih: gun, kind: 'absence' });\n"
    "            gonderilen++;\n"
    "        } catch (e) {\n"
    "            console.error('[OTOMASYON] ogle bildirimi', o.kisi_id, e.message);\n"
    "        }\n"
    "    }\n"
    "    if (yeni.length) await isaretleriYaz(gun, yeni);\n"
    "    return gonderilen;\n"
    "}\n"
    "\n"
    "async function devamsizligiTamamla(gun, cfg, suAnDk) {\n",
    "izinliMi + ogleBildirimi",
)

# 3) Normal gun akisinda 13:00 tetigi.
s2 = replace_once(
    s2,
    "    // Vardiya ve kisi bazli ogle ve gun sonu cikislari\n"
    "    if (cfg.autoLunchExitEnabled) {\n",
    "    // 13:00 — sabah oturumu kapandi: ogleden once gelmeyen / gec gelen veliye bildirilir.\n"
    "    if (cfg.autoAttendanceEnabled && dk >= yoklama.pencereler(cfg).ogleCikis && !yapilan.includes('ogle_sms_tamam')) {\n"
    "        const n = await ogleBildirimi(gun, cfg);\n"
    "        console.log(`[OTOMASYON] ${gun} öğle veli bildirimi: ${n} mesaj`);\n"
    "        await isaretYaz(gun, 'ogle_sms_tamam');\n"
    "    }\n"
    "\n"
    "    // Vardiya ve kisi bazli ogle ve gun sonu cikislari\n"
    "    if (cfg.autoLunchExitEnabled) {\n",
    "ogle tetigi",
)
if s2 != s:
    p.write_text(s2, encoding='utf-8'); print(f'Uygulandi: {p}')
else:
    print(f'Zaten uygulanmis: {p}')
