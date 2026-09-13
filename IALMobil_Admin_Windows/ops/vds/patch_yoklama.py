from pathlib import Path
import re

path = Path('/opt/ial-backend/yoklama.js')
s = path.read_text()
pattern = re.compile(r"async function devamsizligiYaz\(ogrenciId, tarih, cfg\) \{.*?\n\}\n\nmodule\.exports", re.S)
replacement = r"""const OTOMASYON_BASLANGIC = '2026-09-08';

async function otomatikUzlastirmaYaz(ogrenciId, tarih, h) {
    const sessions = [
        ['sabah', h.oturumBilgi?.sabah],
        ['ogleden_sonra', h.oturumBilgi?.ogleden_sonra],
    ];
    for (const [oturum, info] of sessions) {
        const bulundu = Boolean(info?.kazandi);
        const gec = bulundu && Boolean(info?.gec);
        const durum = bulundu ? (gec ? 'gec' : 'var') : 'yok';
        const agirlik = bulundu ? 0 : 0.5;
        await sorgu(`
            INSERT INTO yoklama_uzlastirma
              (kisi_id, tarih, oturum, durum, agirlik, sebep, kaynak, kilitli)
            VALUES ($1,$2::date,$3,$4,$5,$6,'otomatik',false)
            ON CONFLICT (kisi_id, tarih, oturum)
            DO UPDATE SET durum=EXCLUDED.durum, agirlik=EXCLUDED.agirlik,
                          sebep=EXCLUDED.sebep, guncellendi=now()
            WHERE NOT yoklama_uzlastirma.kilitli`,
            [ogrenciId, tarih, oturum, durum, agirlik,
             h.sebep || (bulundu ? 'Geçiş mevcut.' : 'Oturum geçişi yok.')]);
    }
}

/**
 * Computes every date, but only writes automation after 2026-09-07.
 * The 7 September raw tables are immutable and are represented by the
 * additive manual reconciliation layer instead.
 */
async function devamsizligiYaz(ogrenciId, tarih, cfg) {
    const c = cfg || await ayarlariAl();
    const h = await gunuHesapla(ogrenciId, tarih, c);

    if (String(tarih) < OTOMASYON_BASLANGIC) {
        return { ...h, atlandi: '7 Eylül ham kayıtları korunuyor.' };
    }

    const elle = await tek(
        `SELECT 1 FROM devamsizlik
          WHERE ogrenci_id=$1 AND tarih=$2::date AND NOT otomatik
            AND (ders_saati IS NULL OR ders_saati = 0)`,
        [ogrenciId, tarih]);
    if (elle) return { ...h, atlandi: 'elle girilmis kayit korundu' };

    if (h.durum === 'var' || h.durum === 'beklemede') {
        await sorgu(`DELETE FROM devamsizlik
                      WHERE ogrenci_id=$1 AND tarih=$2::date
                        AND ders_saati=0 AND otomatik`, [ogrenciId, tarih]);
        await sorgu(`DELETE FROM yoklama_uzlastirma
                      WHERE kisi_id=$1 AND tarih=$2::date
                        AND kaynak='otomatik' AND NOT kilitli`, [ogrenciId, tarih]);
        return h;
    }

    await otomatikUzlastirmaYaz(ogrenciId, tarih, h);

    // Compatibility row for older clients. `ders_saati=0` is intentional:
    // NULL is not unique in PostgreSQL and was the source of 0.5+0.5 rows.
    await sorgu(`
        INSERT INTO devamsizlik
          (ogrenci_id,tarih,durum,ders_saati,agirlik,sebep,otomatik)
        VALUES ($1,$2::date,$3,0,$4,$5,true)
        ON CONFLICT (ogrenci_id,tarih,ders_saati)
        DO UPDATE SET durum=EXCLUDED.durum, agirlik=EXCLUDED.agirlik,
                      sebep=EXCLUDED.sebep, otomatik=true`,
        [ogrenciId, tarih, h.durum, h.agirlik, h.sebep]);
    return h;
}

module.exports"""
if not pattern.search(s):
    raise SystemExit('devamsizligiYaz block not found')
path.write_text(pattern.sub(replacement, s, count=1))
