// Shared, read-only source for daily report and attendance history.
module.exports = function createAttendanceReport({ hepsi, yoklama }) {
const denemeGunleri = require('../denemeGunleri.live.cjs');

function uzlastirmaKarari(rows) {
    if (!rows || !rows.length) return null;
    const list = rows;
    const reasons = [...new Set(list.map((r) => r.sebep).filter(Boolean))];
    const locked = list.some((r) => r.kilitli || r.kaynak === 'manuel_uzlastirma');
    const absent = list.filter((r) => r.durum === 'yok');
    const excused = list.find((r) => r.durum === 'izinli');
    const pending = list.find((r) => r.durum === 'beklemede');
    const late = list.find((r) => r.durum === 'gec');
    if (excused) return { durum: 'izinli', agirlik: Number(excused.agirlik) || 0, sebep: reasons.join('; '), locked };
    if (pending && !absent.length) return { durum: 'beklemede', agirlik: 0, sebep: reasons.join('; '), locked };
    if (absent.length) return { durum: 'yok', agirlik: Math.min(1, absent.reduce((n, r) => n + (Number(r.agirlik) || 0.5), 0)), sebep: reasons.join('; '), locked };
    if (late) return { durum: 'gec', agirlik: 0, sebep: reasons.join('; '), locked };
    return { durum: 'var', agirlik: 0, sebep: reasons.join('; '), locked };
}

async function dailyReport(requestedDate, personId = null) {
        const cfg = await yoklama.ayarlariAl();
        const tarih = requestedDate || yoklama.gunAnahtari(new Date(), cfg.saatDilimi);

        /* Rapor OGRENCI + PERSONELI birlikte verir.
           Ekranlar personeli listeden bulamayinca rolu kendileri tahmin
           ediyor, herkesi "personel" ya da "ogrenci" gosteriyorlardi. Rol
           artik kaynaktan geliyor. Veli raporda yer almaz. */
        const ogrenciler = await hepsi(
            `SELECT * FROM (SELECT o.kisi_id, o.okul_no, k.tam_ad, k.tc AS tc_kimlik, s.ad AS sinif,
                    s.seviye::text AS class_id,
                    'ogrenci'::text AS rol, NULL::text AS brans
               FROM ogrenciler o
               JOIN kisiler k ON k.id = o.kisi_id AND k.aktif AND NOT COALESCE(k.gizli, false)
          LEFT JOIN siniflar s ON s.id = o.sinif_id
              UNION ALL
             SELECT k.id AS kisi_id, NULL::text AS okul_no, k.tam_ad, k.tc AS tc_kimlik, NULL::text AS sinif,
                    NULL::text AS class_id,
                    CASE WHEN 'idare' = ANY(array_agg(r.rol)) THEN 'idare' ELSE 'ogretmen' END AS rol,
                    max(g.brans) AS brans
               FROM kisiler k
               JOIN kisi_rolleri r ON r.kisi_id = k.id
          LEFT JOIN personel g ON g.kisi_id = k.id
              WHERE k.aktif AND NOT COALESCE(k.gizli, false) AND r.rol IN ('ogretmen', 'idare')
           GROUP BY k.id, k.tam_ad, k.tc) roster
              WHERE ($1::bigint IS NULL OR roster.kisi_id = $1)
           ORDER BY rol, sinif NULLS LAST, tam_ad`, [personId]);

        // Gunun tum gecisleri tek sorguda; ogrenci basina ayri sorgu atmak
        // 97 ogrencide 97 gidis-donus demekti.
        const gecisler = await hepsi(
            `SELECT kisi_id, yon, zaman, kaynak FROM gecisler
              WHERE tarih = $1::date AND ($2::bigint IS NULL OR kisi_id = $2)
              ORDER BY kisi_id, zaman, id`, [tarih, personId]);
        const gore = new Map();
        for (const g of gecisler) {
            const a = gore.get(String(g.kisi_id)) || [];
            a.push(g); gore.set(String(g.kisi_id), a);
        }

        const elleKayit = await hepsi(
            `SELECT id, ogrenci_id, durum, sebep, agirlik FROM devamsizlik
              WHERE tarih = $1::date AND NOT otomatik AND ($2::bigint IS NULL OR ogrenci_id = $2)
              ORDER BY olusturuldu, id`, [tarih, personId]);
        const elle = new Map(elleKayit.map((r) => [String(r.ogrenci_id), r]));
        const uzlastirmaKayit = await hepsi(
            `SELECT kisi_id, oturum, durum, agirlik, sebep, kaynak, kilitli
               FROM yoklama_uzlastirma WHERE tarih = $1::date AND ($2::bigint IS NULL OR kisi_id = $2)`, [tarih, personId]);
        const uzlastirma = new Map();
        for (const r of uzlastirmaKayit) {
            const key = String(r.kisi_id);
            const list = uzlastirma.get(key) || [];
            list.push(r);
            uzlastirma.set(key, list);
        }

        // Bugun icin acik aralik SU ANA kadar sayilir (canli rapor).
        const simdi = new Date();
        const bugunAnahtari = yoklama.gunAnahtari(simdi, cfg.saatDilimi);
        const bugunMu = tarih === bugunAnahtari;
        /* GELECEK TARIH: gun daha gelmedi, kimseye devamsizlik yazilmaz.
           Motora o gunun 00:00 ani "su an" diye verilir; tum oturumlar
           bekleyen sayilir. Gecmis gunler eskisi gibi kesinlesmis (null). */
        const gelecekMi = tarih > bugunAnahtari;
        let an = bugunMu ? simdi : null;
        if (gelecekMi) {
            const ogle = new Date(`${tarih}T12:00:00Z`);
            an = new Date(ogle.getTime() - yoklama.dakikaDilimde(ogle, cfg.saatDilimi) * 60_000);
        }

        const satirlar = [];
        const sayac = { mevcut: 0, gec: 0, yarim: 0, devamsiz: 0, izinli: 0, beklemede: 0 };
        for (const o of ogrenciler) {
            const kimlik = String(o.kisi_id);
            /* Deneme gununde ogretmen/idare/personel de ogrencilerle ayni
               saatlere tabidir; kural cozumu artik herkes icin calisir.
               Sinif seviyesi filtresi yalnizca ogrencilere uygulanir. */
            const gunAyari = denemeGunleri.resolveForPerson(cfg, tarih, o);
            const kisiCfg = gunAyari.config || cfg;
            /* Personel ogrenci oturum modeline sokulmuyordu; sabah/ogleden
               sonra penceresine denk gelmeyen mesaisi "bulunulmadi" sayilip
               ogretmenlere haksiz devamsizlik yaziyordu. */
            const h = gunAyari.excluded
                ? denemeGunleri.closedResult(kisiCfg, gunAyari.rule, gunAyari.grade)
                : o.rol === 'ogrenci'
                    ? yoklama.gunuHesaplaGecislerden(gore.get(kimlik) || [], kisiCfg, an)
                    : yoklama.gunuPersonelHesapla(gore.get(kimlik) || [], kisiCfg, an);
            if (gelecekMi && h.durum === 'beklemede') h.sebep = 'Gün henüz gelmedi';
            // Kapsam dışı seviyelerde eski manuel/otomatik sonuçlar ekranda
            // yeniden yoklama sayılmaz; ham uzlaştırma satırları yine detayda
            // görünür ve hiçbir fiziksel kayıt silinmez.
            const el = gunAyari.excluded ? null : elle.get(kimlik);
            const lockedSessions = (uzlastirma.get(kimlik) || []).filter(r => r.kilitli);
            const uz = gunAyari.excluded ? null : uzlastirmaKarari(lockedSessions);
            // Locked historical reconciliation is final. Live automatic results
            // are always computed from current passages, never stale stored rows.
            const resolved = uz || el;
            const durum = resolved ? resolved.durum : h.durum;
            const agirlik = resolved ? Number(resolved.agirlik) : h.agirlik;

            if (o.rol !== 'ogrenci') { /* personel ozete katilmaz */ }
            else if (durum === 'kapali') { /* deneme kapsamı dışı */ }
            else if (durum === 'beklemede') sayac.beklemede = (sayac.beklemede || 0) + 1;
            else if (durum === 'izinli') sayac.izinli++;
            else if (durum === 'gec') sayac.gec++;
            else if (durum === 'var') sayac.mevcut++;
            else if (agirlik >= 1) sayac.devamsiz++;
            else sayac.yarim++;

            const gs = gore.get(kimlik) || [];

            /* GOSTERIM SAATLERI.
               Oturum KREDISI ders pencerelerine gore verilir; ama ekranin
               "hangi saatte girdi/cikti" sutunlari HER gecisi gostermeli.
               Ders penceresi disinda kalan okutmalar (personelin erken
               girisi gibi) oturum bilgisinde null oldugu icin ekranda hic
               gorunmuyordu. Burada gun, yarim gun sinirindan ikiye bolunur
               ve her yarinin ilk girisi ile son cikisi yazilir. */
            const dkSaat = (z) => new Date(z).toLocaleTimeString('tr-TR',
                { hour: '2-digit', minute: '2-digit', timeZone: cfg.saatDilimi });
            const dkNum = (z) => yoklama.dakikaDilimde(new Date(z), cfg.saatDilimi);
            /* GIRIS ve CIKIS ayni sinirdan bolunmez.
               Giris, oturum ayrimini yapan YARIM GUN SINIRI'na gore ayrilir
               (12:25'ten sonraki giris ogleden sonradir). Cikis ise OGLEDEN
               SONRA GIRISI'ne kadar sabaha aittir: 12:10-13:30 arasi cikis
               "ogle cikisi"dir, sabah oturumunu kapatir.
               Ikisi de yarim gun sinirindan bolununce 12:25'teki otomatik
               ogle cikisi ogleden sonra sutununda gorunuyordu. */
            const girisSinir = yoklama.dkCevir(kisiCfg.yarimGunSiniri);
            const cikisSinir = yoklama.dkCevir(kisiCfg.ogledenSonraGiris);
            const goster = (once) => {
                const giris = gs.find((g) => g.yon === 'giris'
                    && ((dkNum(g.zaman) < girisSinir) === once));
                const cikislar = gs.filter((g) => g.yon === 'cikis'
                    && ((dkNum(g.zaman) <= cikisSinir) === once));
                const cikis = cikislar[cikislar.length - 1];
                return {
                    giris: giris ? dkSaat(giris.zaman) : null,
                    cikis: cikis ? dkSaat(cikis.zaman) : null,
                    giris_kaynak: giris ? giris.kaynak : null,
                    cikis_kaynak: cikis ? cikis.kaynak : null,
                };
            };
            const gosterim = { sabah: goster(true), ogleden_sonra: goster(false) };

            satirlar.push({
                gosterim, tarih,
                kaynak: gunAyari.excluded
                    ? (gunAyari.closed ? 'kurum_kapali'
                        : gunAyari.holidayRule ? 'tatil_kapsam_disi'
                        : gunAyari.customRule ? 'ozel_program_kapsam_disi' : 'deneme_kapsam_disi')
                    : uz ? 'manuel_uzlastirma' : el ? 'manuel' : 'otomatik',
                kilitli: Boolean(uz?.locked),
                manuel_kayit_id: el?.id || null,
                uzlastirma: uz ? lockedSessions : [],
                kisi_id: o.kisi_id, okul_no: o.okul_no, tam_ad: o.tam_ad, sinif: o.sinif,
                class_id: o.class_id,
                tc_kimlik: o.tc_kimlik, rol: o.rol, brans: o.brans,
                durum, agirlik, elle: !gunAyari.excluded && (Boolean(el) || Boolean(uz?.locked)),
                sebep: gunAyari.excluded ? h.sebep : resolved ? resolved.sebep : h.sebep,
                oturumlar: h.oturumlar, dakikalar: h.dakikalar, gec: h.gec,
                oturum_bilgi: h.oturumBilgi, bekleyen: h.bekleyen || [],
                gec_kalan: h.gecKalan || [],
                ilk_giris: gs.find((g) => g.yon === 'giris')?.zaman || null,
                son_cikis: [...gs].reverse().find((g) => g.yon === 'cikis')?.zaman || null,
                ilk_giris_saat: gs.find((g) => g.yon === 'giris') ? dkSaat(gs.find((g) => g.yon === 'giris').zaman) : null,
                son_cikis_saat: [...gs].reverse().find((g) => g.yon === 'cikis') ? dkSaat([...gs].reverse().find((g) => g.yon === 'cikis').zaman) : null,
                iceride: gs.length ? gs[gs.length - 1].yon === 'giris' : false,
                gecis_sayisi: gs.length,
                deneme_gunu: Boolean(gunAyari.rule),
                yoklama_kapali: Boolean(gunAyari.excluded || gunAyari.closed),
                deneme_kurali: gunAyari.rule || null,
                deneme_sinif_seviyesi: gunAyari.grade || null,
            });
        }
        return { success: true, tarih, gelecek: gelecekMi, bugun: bugunMu, ayarlar: cfg, ozet: sayac, kayitlar: satirlar };
}


async function history(personId) {
    const cfg = await yoklama.ayarlariAl();
    const today = yoklama.gunAnahtari(new Date(), cfg.saatDilimi);
    // Only recorded dates plus today; do not invent absences before enrollment.
    const dates = await hepsi(`
        SELECT DISTINCT tarih::text AS tarih FROM (
            SELECT tarih FROM devamsizlik WHERE ogrenci_id=$1
            UNION SELECT tarih FROM yoklama_uzlastirma WHERE kisi_id=$1
            UNION SELECT tarih FROM gecisler WHERE kisi_id=$1
            UNION SELECT $2::date
        ) days WHERE tarih <= $2::date ORDER BY tarih DESC`, [personId, today]);
    const kayitlar = [];
    for (const { tarih } of dates) {
        const report = await dailyReport(tarih, personId);
        if (report.kayitlar[0]) kayitlar.push(report.kayitlar[0]);
    }
    const ham_devamsizlik = await hepsi(
        'SELECT * FROM devamsizlik WHERE ogrenci_id=$1 ORDER BY tarih DESC, id DESC', [personId]);
    const gecisler = await hepsi(
        'SELECT id,kisi_id,tarih,yon,kaynak,zaman,not_ FROM gecisler WHERE kisi_id=$1 ORDER BY zaman DESC,id DESC', [personId]);
    /* O gun veliye giden SMS'ler: ekran "bugun mesaj gitti mi" sorusuna
       buradan cevap verir. Denetim tablosundan okunur, gonderim yapmaz. */
    const smsSatirlari = await hepsi(`
        SELECT id, (created_at AT TIME ZONE 'Europe/Istanbul')::date::text AS tarih,
               to_char(created_at AT TIME ZONE 'Europe/Istanbul','HH24:MI') AS saat,
               kind AS tur, status AS durum, phone AS telefon, reason_code AS sebep,
               split_part(replace(body, E'\\n', ' '), 'Boğaziçi Koleji', 1) AS ozet
          FROM sms_audit WHERE student_id=$1 ORDER BY created_at DESC`, [personId]);
    const smsGune = new Map();
    for (const r of smsSatirlari) {
        if (!smsGune.has(r.tarih)) smsGune.set(r.tarih, []);
        smsGune.get(r.tarih).push({ id: r.id, saat: r.saat, tur: r.tur, durum: r.durum, telefon: r.telefon,
            ozet: String(r.ozet || '').replace(/^Sayın Velimiz,\s*/, '').trim().slice(0, 140) });
    }
    for (const k of kayitlar) {
        const liste = smsGune.get(String(k.tarih).slice(0, 10)) || [];
        k.sms = liste;
        k.sms_gonderildi = liste.some((x) => x.durum === 'sent');
    }
    return { success: true, kisi_id: personId, bugun: today, kayitlar, ham_devamsizlik, gecisler,
             sms_gecmisi: smsSatirlari, guncellendi: new Date().toISOString() };
}
return { dailyReport, history };
};
