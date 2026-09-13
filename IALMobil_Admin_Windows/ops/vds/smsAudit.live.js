const crypto = require('crypto');
const { hepsi, tek } = require('../db');

const cleanPhone = (value) => {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('0090')) phone = phone.slice(4);
  else if (phone.startsWith('90') && phone.length === 12) phone = phone.slice(2);
  else if (phone.startsWith('0') && phone.length === 11) phone = phone.slice(1);
  return phone.length === 10 ? phone : null;
};

const maskPhone = (phone) => {
  const value = cleanPhone(phone);
  return value ? `${value.slice(0, 3)}••••${value.slice(-2)}` : null;
};

const recipientsByRelation = () => hepsi(`
  SELECT DISTINCT
         vo.veli_id AS parent_id,
         pv.tam_ad AS parent_name,
         vo.ogrenci_id AS student_id,
         sk.tam_ad AS student_name,
         phones.phone
    FROM veli_ogrenci vo
    JOIN kisiler pv ON pv.id = vo.veli_id
    JOIN kisiler sk ON sk.id = vo.ogrenci_id AND sk.aktif
    JOIN ogrenciler o ON o.kisi_id = vo.ogrenci_id
    LEFT JOIN LATERAL (
      SELECT candidate.phone
        FROM (
          SELECT NULLIF(btrim(pv.telefon::text), '') AS phone
          UNION
          SELECT btrim(kt.telefon::text) AS phone
            FROM kisi_telefonlari kt
           WHERE kt.kisi_id = pv.id
        ) candidate
       WHERE candidate.phone IS NOT NULL
    ) phones ON true
   ORDER BY pv.tam_ad, sk.tam_ad, phones.phone`);

const recipientsByRole = async (target) => {
  if (target === 'all_parents') return recipientsByRelation();

  const roles = target === 'all_students'
    ? ['ogrenci']
    : target === 'all_teachers'
      ? ['ogretmen']
      : ['ogretmen', 'idare', 'personel'];
  return hepsi(`
    SELECT DISTINCT k.id AS student_id, k.tam_ad AS student_name,
           NULL::bigint AS parent_id, NULL::text AS parent_name,
           k.telefon AS phone
      FROM kisiler k
      JOIN kisi_rolleri r ON r.kisi_id = k.id
     WHERE k.aktif AND r.rol = ANY($1::text[])
     ORDER BY k.tam_ad`, [roles]);
};

const resolveRecipients = async ({ target = 'all_parents', phones = [] } = {}) => {
  if (target === 'custom_numbers') {
    return [...new Set((Array.isArray(phones) ? phones : []).map(cleanPhone).filter(Boolean))]
      .map((phone) => ({ phone, parent_id: null, parent_name: 'Özel liste', student_id: null, student_name: '—' }));
  }
  return recipientsByRole(target);
};

const appendAudit = (status, reasonCode) => ([
  { at: new Date().toISOString(), event: 'planned', status: 'planned' },
  { at: new Date().toISOString(), event: status, status, reasonCode },
]);

async function plan({ target, title = '', message, phones = [], kind = 'broadcast' }) {
  const body = title ? `${title}\n\n${message}` : String(message || '');
  if (!body.trim()) throw new Error('Mesaj metni gerekli.');

  const recipients = await resolveRecipients({ target, phones });
  const correlationId = crypto.randomUUID();
  let blocked = 0;
  let missingPhone = 0;
  const created = [];

  for (const recipient of recipients) {
    const phone = cleanPhone(recipient.phone);
    const status = phone ? 'blocked' : 'missing_phone';
    const reasonCode = phone ? 'SMS_DISABLED' : 'MISSING_PARENT_PHONE';
    if (phone) blocked += 1;
    else missingPhone += 1;
    const row = await tek(`
      INSERT INTO sms_audit
        (correlation_id, parent_id, student_id, phone, body, kind, status, reason_code, timeline)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
      RETURNING id, correlation_id, parent_id, student_id, phone, body, kind,
                status, reason_code, timeline, created_at, updated_at`,
      [correlationId, recipient.parent_id || null, recipient.student_id || null,
       phone, body, kind, status, reasonCode, JSON.stringify(appendAudit(status, reasonCode))]);
    created.push(row);
  }

  return { correlationId, count: created.length, blocked, missingPhone, rows: created };
}

/* A gate/absence event is recorded as blocked or missing-phone only. This
   helper deliberately has no provider call and is safe for live event paths. */
async function recordDelivery({ parentId = null, studentId = null, phone = null,
    body = '', kind = 'gate', result = null } = {}) {
  const normalizedPhone = cleanPhone(phone);
  const status = !normalizedPhone ? 'missing_phone'
    : result?.success ? 'sent' : result?.blocked ? 'blocked' : 'failed';
  const reason = !normalizedPhone ? 'MISSING_PARENT_PHONE'
    : result?.success ? null : result?.reason || result?.error || result?.code || 'PROVIDER_FAILED';
  const provider = result ? {
    success: Boolean(result.success), bulkId: result.bulkId || null,
    code: result.code || null, phoneCount: result.phoneCount || null,
    error: result.error || result.reason || null,
  } : null;
  return tek('INSERT INTO sms_audit (correlation_id,parent_id,student_id,phone,body,kind,status,reason_code,provider_response,timeline) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) RETURNING *',
    [crypto.randomUUID(), parentId, studentId, normalizedPhone, String(body || ''), kind,
     status, reason, JSON.stringify(provider), JSON.stringify(appendAudit(status, reason))]);
}

async function recordBlocked({ parentId = null, studentId = null, phone = null, body = '', kind = 'gate', reasonCode } = {}) {
  const normalizedPhone = cleanPhone(phone);
  const status = normalizedPhone ? 'blocked' : 'missing_phone';
  const reason = reasonCode || (normalizedPhone ? 'SMS_DISABLED' : 'MISSING_PARENT_PHONE');
  const correlationId = crypto.randomUUID();
  return tek(`
    INSERT INTO sms_audit
      (correlation_id, parent_id, student_id, phone, body, kind, status, reason_code, timeline)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    RETURNING id, correlation_id, parent_id, student_id, phone, body, kind,
              status, reason_code, timeline, created_at, updated_at`,
    [correlationId, parentId, studentId, normalizedPhone, String(body || ''), kind,
     status, reason, JSON.stringify(appendAudit(status, reason))]);
}

const decorate = (row) => ({
  ...row,
  phone: maskPhone(row.phone),
  timeline: Array.isArray(row.timeline) ? row.timeline : [],
});

async function missingPhones() {
  const rows = await recipientsByRelation();
  return rows
    .filter((row) => !cleanPhone(row.phone))
    .map((row) => ({
      parentId: row.parent_id,
      parentName: row.parent_name || 'İsimsiz Veli',
      studentId: row.student_id,
      studentName: row.student_name || 'İsimsiz Öğrenci',
    }));
}

async function control({ date = null, status = null, search = '', limit = 1000 } = {}) {
  const values = [];
  const where = [];
  if (date) {
    values.push(date);
    where.push(`(a.created_at AT TIME ZONE 'Europe/Istanbul')::date = $${values.length}::date`);
  }
  if (status && status !== 'all') {
    values.push(status);
    where.push(`a.status = $${values.length}`);
  }
  if (search.trim()) {
    values.push(`%${search.trim().toLocaleLowerCase('tr-TR')}%`);
    where.push(`LOWER(COALESCE(p.tam_ad, '') || ' ' || COALESCE(s.tam_ad, '')) LIKE $${values.length}`);
  }
  values.push(Math.min(Number(limit) || 1000, 5000));
  const rows = await hepsi(`
    SELECT a.*, p.tam_ad AS parent_name, s.tam_ad AS student_name
      FROM sms_audit a
 LEFT JOIN kisiler p ON p.id = a.parent_id
 LEFT JOIN kisiler s ON s.id = a.student_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
  ORDER BY a.created_at DESC
     LIMIT $${values.length}`, values);

  const all = rows.map(decorate);
  const summary = all.reduce((result, row) => {
    result.total += 1;
    result[row.status] = (result[row.status] || 0) + 1;
    return result;
  }, { total: 0, planned: 0, blocked: 0, missing_phone: 0, pending: 0, sent: 0, failed: 0 });

  return { rows: all, summary, missingPhones: await missingPhones(), historyAvailable: all.length > 0 };
}

async function detail(id) {
  const row = await tek(`
    SELECT a.*, p.tam_ad AS parent_name, s.tam_ad AS student_name
      FROM sms_audit a
 LEFT JOIN kisiler p ON p.id = a.parent_id
 LEFT JOIN kisiler s ON s.id = a.student_id
     WHERE a.id = $1`, [id]);
  return row ? decorate(row) : null;
}

module.exports = { cleanPhone, resolveRecipients, plan, recordBlocked, recordDelivery, control, detail, missingPhones };
