// Idempotent, transactional teacher provisioning for the live VDS.
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { islem, havuz } = require('./db');

const NAME = 'Nuray Samut';
const EMAIL = 'nuraysamut@corumbogazici.com';

islem(async (client) => {
  let existing = await client.query(
    "SELECT id FROM kisiler WHERE tr_ad(tam_ad)=tr_ad($1) ORDER BY aktif DESC,id LIMIT 1 FOR UPDATE",
    [NAME]);
  let id = existing.rows[0]?.id;
  let created = false;
  if (!id) {
    const row = await client.query(
      'INSERT INTO kisiler (ad,soyad,eposta,aktif) VALUES ($1,$2,$3,true) RETURNING id',
      ['Nuray', 'Samut', EMAIL]);
    id = row.rows[0].id;
    created = true;
  } else {
    await client.query('UPDATE kisiler SET aktif=true,eposta=COALESCE(eposta,$2) WHERE id=$1', [id, EMAIL]);
  }
  await client.query("INSERT INTO kisi_rolleri (kisi_id,rol) VALUES ($1,'ogretmen') ON CONFLICT DO NOTHING", [id]);
  await client.query("INSERT INTO personel (kisi_id,brans,unvan) VALUES ($1,'Türkçe','Öğretmen') ON CONFLICT (kisi_id) DO UPDATE SET brans=EXCLUDED.brans,unvan=EXCLUDED.unvan", [id]);
  const identity = await client.query('SELECT 1 FROM kimlik WHERE kisi_id=$1', [id]);
  if (!identity.rowCount) {
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), 12);
    await client.query('INSERT INTO kimlik (kisi_id,kullanici_adi,parola_hash) VALUES ($1,$2,$3)', [id, EMAIL, passwordHash]);
  }
  await client.query("SELECT pg_notify('veri_degisti', json_build_object('tablo','kisiler','islem',CASE WHEN $2::boolean THEN 'INSERT' ELSE 'UPDATE' END,'id',$1::bigint)::text)", [id, created]);
  const verified = await client.query(
    "SELECT kisi_id,full_name,email,role,roles,subject,status FROM api_users WHERE kisi_id=$1",
    [id]);
  console.log(JSON.stringify({ created, teacher: verified.rows[0], login: 'password_reset_required' }));
}).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => havuz.end());
