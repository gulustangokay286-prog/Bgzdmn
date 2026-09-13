// Additive per-session automation. No SMS dependency or provider operation.
const START_DATE = '2026-09-08';
function sessionsFor(result, role) {
  if (result.durum === 'kapali') return [];
  if (role !== 'ogrenci') return [{ oturum: 'gun', durum: result.durum, agirlik: result.durum === 'yok' ? 1 : 0 }];
  return ['sabah', 'ogleden_sonra'].map(oturum => {
    const info = result.oturumBilgi?.[oturum] || {};
    const present = Boolean(info.kazandi);
    const pending = result.bekleyen?.includes(oturum);
    return { oturum, durum: present ? info.gec ? 'gec' : 'var' : pending ? 'beklemede' : 'yok',
      agirlik: present || pending ? 0 : 0.5 };
  });
}
function createWriter({ islem, compute, roleOf, prepareConfig = async config => config }) {
  return async function write(personId, date, config) {
    if (String(date) < START_DATE) return { ...(await compute(personId, date, config)), atlandi: '7 Eylül ve önceki ham kayıtlar korunuyor.' };
    const role = await roleOf(personId);
    const resolvedConfig = await prepareConfig(config);
    return islem(async client => {
      // Prevent races between gate events, timer and explicit report rebuilds.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['attendance:' + personId + ':' + date]);
      const result = await compute(personId, date, resolvedConfig, client, role);
      const locked = await client.query('SELECT 1 FROM yoklama_uzlastirma WHERE kisi_id=$1 AND tarih=$2::date AND kilitli LIMIT 1', [personId, date]);
      const manual = await client.query('SELECT 1 FROM devamsizlik WHERE ogrenci_id=$1 AND tarih=$2::date AND NOT otomatik LIMIT 1', [personId, date]);
      if (locked.rowCount || manual.rowCount) return { ...result, atlandi: 'Kilitli veya manuel sonuç korundu.' };
      if (result.durum === 'kapali') {
        await client.query('DELETE FROM devamsizlik WHERE ogrenci_id=$1 AND tarih=$2::date AND otomatik', [personId, date]);
        await client.query('DELETE FROM yoklama_uzlastirma WHERE kisi_id=$1 AND tarih=$2::date AND kaynak=\'otomatik\' AND NOT kilitli', [personId, date]);
        return result;
      }
      for (const session of sessionsFor(result, role)) {
        await client.query(`INSERT INTO yoklama_uzlastirma
          (kisi_id,tarih,oturum,durum,agirlik,sebep,kaynak,kilitli)
          VALUES ($1,$2::date,$3,$4,$5,$6,'otomatik',false)
          ON CONFLICT (kisi_id,tarih,oturum) DO UPDATE
          SET durum=EXCLUDED.durum,agirlik=EXCLUDED.agirlik,sebep=EXCLUDED.sebep,guncellendi=now()
          WHERE NOT yoklama_uzlastirma.kilitli AND
            (yoklama_uzlastirma.durum,yoklama_uzlastirma.agirlik,yoklama_uzlastirma.sebep)
            IS DISTINCT FROM (EXCLUDED.durum,EXCLUDED.agirlik,EXCLUDED.sebep)`,
          [personId, date, session.oturum, session.durum, session.agirlik, result.sebep || null]);
      }
      if (result.durum === 'yok' || result.durum === 'gec') {
        await client.query(`INSERT INTO devamsizlik (ogrenci_id,tarih,durum,ders_saati,agirlik,sebep,otomatik)
          VALUES ($1,$2::date,$3,0,$4,$5,true)
          ON CONFLICT (ogrenci_id,tarih,ders_saati) DO UPDATE
          SET durum=EXCLUDED.durum,agirlik=EXCLUDED.agirlik,sebep=EXCLUDED.sebep
          WHERE devamsizlik.otomatik AND
            (devamsizlik.durum,devamsizlik.agirlik,devamsizlik.sebep)
            IS DISTINCT FROM (EXCLUDED.durum,EXCLUDED.agirlik,EXCLUDED.sebep)`,
          [personId, date, result.durum, result.agirlik, result.sebep || null]);
      } else {
        await client.query('DELETE FROM devamsizlik WHERE ogrenci_id=$1 AND tarih=$2::date AND ders_saati=0 AND otomatik', [personId, date]);
      }
      return result;
    });
  };
}
module.exports = { createWriter, sessionsFor, START_DATE };
