/*
 * Idempotent VDS repair:
 *  - Muharrem Kodaz'in cakisan ogrenci/personel rollerini tek personel rolune indirir.
 *  - Audit disinda saklanmayan standart acil idare hesabini olusturur/gunceller.
 *
 * Parola dosyada tutulmaz; ADMIN_PASSWORD ortam degiskeninden okunur.
 */
const bcrypt = require('bcryptjs');
const { islem, havuz } = require('./db');

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLocaleLowerCase('tr-TR');
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const MUHARREM_ID = 362;

if (!ADMIN_EMAIL || ADMIN_PASSWORD.length < 8) {
  throw new Error('ADMIN_EMAIL ve en az 8 karakterli ADMIN_PASSWORD gerekli.');
}

islem(async (client) => {
  const target = await client.query(
    'SELECT id,tam_ad FROM kisiler WHERE id=$1 FOR UPDATE',
    [MUHARREM_ID]
  );
  if (target.rows[0]?.tam_ad !== 'Muharrem Kodaz') {
    throw new Error('Muharrem Kodaz kimlik doğrulaması başarısız; işlem durduruldu.');
  }

  const oldRoles = await client.query(
    'SELECT rol FROM kisi_rolleri WHERE kisi_id=$1 ORDER BY rol',
    [MUHARREM_ID]
  );
  await client.query(
    "DELETE FROM kisi_rolleri WHERE kisi_id=$1 AND rol IN ('ogrenci','ogretmen','personel','idare')",
    [MUHARREM_ID]
  );
  await client.query(
    "INSERT INTO kisi_rolleri (kisi_id,rol) VALUES ($1,'personel') ON CONFLICT DO NOTHING",
    [MUHARREM_ID]
  );
  await client.query(
    `INSERT INTO guvenlik_log (olay,kisi_id,detay)
     VALUES ('rol_uzlastirildi',$1,$2::jsonb)`,
    [MUHARREM_ID, JSON.stringify({
      oncekiRoller: oldRoles.rows.map((row) => row.rol),
      yeniRol: 'personel',
      sebep: 'çakışan öğrenci/personel rolü düzeltildi'
    })]
  );

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const existing = await client.query(
    `SELECT k.id FROM kisiler k
       LEFT JOIN kimlik i ON i.kisi_id=k.id
      WHERE lower(coalesce(k.eposta,''))=lower($1)
         OR lower(coalesce(i.kullanici_adi,''))=lower($1)
      ORDER BY k.aktif DESC,k.id LIMIT 1 FOR UPDATE OF k`,
    [ADMIN_EMAIL]
  );

  let adminId = existing.rows[0]?.id;
  let created = false;
  if (adminId) {
    await client.query(
      `UPDATE kisiler SET aktif=TRUE,eposta=$2,guncellendi=now() WHERE id=$1`,
      [adminId, ADMIN_EMAIL]
    );
  } else {
    const inserted = await client.query(
      `INSERT INTO kisiler (ad,soyad,eposta,aktif)
       VALUES ('Acil','Sistem Yöneticisi',$1,TRUE) RETURNING id`,
      [ADMIN_EMAIL]
    );
    adminId = inserted.rows[0].id;
    created = true;
  }

  await client.query(
    "DELETE FROM kisi_rolleri WHERE kisi_id=$1 AND rol IN ('ogrenci','ogretmen','personel','idare')",
    [adminId]
  );
  await client.query(
    "INSERT INTO kisi_rolleri (kisi_id,rol) VALUES ($1,'idare') ON CONFLICT DO NOTHING",
    [adminId]
  );
  await client.query(
    `INSERT INTO personel (kisi_id,brans,unvan)
     VALUES ($1,'Yönetim','Acil Sistem Yöneticisi')
     ON CONFLICT (kisi_id) DO UPDATE
       SET brans=EXCLUDED.brans,unvan=EXCLUDED.unvan`,
    [adminId]
  );
  await client.query(
    `INSERT INTO kimlik (kisi_id,kullanici_adi,parola_hash)
     VALUES ($1,$2,$3)
     ON CONFLICT (kisi_id) DO UPDATE
       SET kullanici_adi=EXCLUDED.kullanici_adi,
           parola_hash=EXCLUDED.parola_hash,
           eski_scrypt=NULL,
           eski_salt=NULL`,
    [adminId, ADMIN_EMAIL, hash]
  );
  await client.query(
    `INSERT INTO guvenlik_log (olay,kisi_id,detay)
     VALUES ($1,$2,$3::jsonb)`,
    [created ? 'acil_yonetici_olusturuldu' : 'acil_yonetici_guncellendi', adminId,
     JSON.stringify({ email: ADMIN_EMAIL, rol: 'idare', auditEdilebilir: true })]
  );

  const verification = await client.query(
    `SELECT kisi_id,full_name,email,role,roles,status
       FROM api_users WHERE kisi_id IN ($1,$2) ORDER BY kisi_id`,
    [MUHARREM_ID, adminId]
  );
  console.log(JSON.stringify({ created, adminId, verification: verification.rows }));
}).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => havuz.end());

