"""Enable future SMS delivery with audit; never replays existing audit rows."""
from pathlib import Path
import sys
root = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/ial-backend')

path = root / 'services/netgsmService.js'
source = path.read_text().replace(
    "const SMS_GONDERIM_ACIK = false; // Kurum kararı: bu deployment'ta gerçek SMS kalıcı olarak kapalı.",
    "const SMS_GONDERIM_ACIK = String(process.env.SMS_GONDERIM_ACIK || '').toLowerCase() === 'evet';")
path.write_text(source)

path = root / 'services/smsAudit.js'
source = path.read_text()
if 'async function recordDelivery' not in source:
    marker = 'async function recordBlocked('
    insert = """async function recordDelivery({ parentId = null, studentId = null, phone = null,
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

"""
    source = source.replace(marker, insert + marker)
    source = source.replace(
        'module.exports = { cleanPhone, resolveRecipients, plan, recordBlocked, control, detail, missingPhones };',
        'module.exports = { cleanPhone, resolveRecipients, plan, recordBlocked, recordDelivery, control, detail, missingPhones };')
path.write_text(source)

path = root / 'server.js'
source = path.read_text()
old = """    // SMS is intentionally never sent. Each parent receives an audit-only
    // row so the control screen can explain blocked and missing-phone cases.
    await Promise.all(veliler.map((veli) => smsAudit.recordBlocked({
        parentId: veli.veli_id,
        studentId: kisi.kisi_id,
        phone: veli.telefon,
        body,
        kind: 'gate',
        reasonCode: veli.telefon ? 'SMS_DISABLED' : 'MISSING_PARENT_PHONE',
    })));"""
new = """    await Promise.all(veliler.map(async (veli) => {
        const result = veli.telefon
            ? await netgsmService.sendParentGateSms({
                studentName: kisi.full_name || kisi.tam_ad,
                parentPhone: veli.telefon, tur,
                gecikmeDk: karar.gecikme_dk || 0, saat: karar.saat,
              })
            : { success: false, error: 'Veli telefonu bulunamadı.' };
        await smsAudit.recordDelivery({
            parentId: veli.veli_id, studentId: kisi.kisi_id, phone: veli.telefon,
            body, kind: 'gate', result,
        });
    }));"""
source = source.replace(old, new)
source = source.replace(
    "for (const p of phones) sonuc.push(await netgsmService.sendSms({ phone: p, message }));",
    """for (const p of phones) {
            const result = await netgsmService.sendSms({ to: p, message });
            await smsAudit.recordDelivery({ phone: p, body: message, kind: 'broadcast', result });
            sonuc.push(result);
        }""")
path.write_text(source)

path = root / 'otomasyon.js'
source = path.read_text()
if "const netgsmService = require('./services/netgsmService');" not in source:
    source = source.replace("const smsAudit = require('./services/smsAudit');",
                            "const smsAudit = require('./services/smsAudit');\nconst netgsmService = require('./services/netgsmService');")
old = """            await smsAudit.recordBlocked({ studentId: o.kisi_id, parentId: parent.veli_id,
                phone: parent.telefon, kind: 'absence',
                body: o.tam_ad + ' bugün kuruma gelmemiştir. (' + gun + ')' });"""
new = """            const body = o.tam_ad + ' bugün kuruma gelmemiştir. (' + gun + ')';
            const result = parent.telefon
                ? await netgsmService.sendParentGateSms({
                    studentName: o.tam_ad, parentPhone: parent.telefon, tur: 'gelmedi',
                  })
                : { success: false, error: 'Veli telefonu bulunamadı.' };
            await smsAudit.recordDelivery({ studentId: o.kisi_id, parentId: parent.veli_id,
                phone: parent.telefon, kind: 'absence', body, result });"""
source = source.replace(old, new)
path.write_text(source)

path = root / 'docker-compose.yml'
path.write_text(path.read_text().replace('SMS_GONDERIM_ACIK=hayir', 'SMS_GONDERIM_ACIK=evet'))
print('SMS enabled for new gate, absence and broadcast events; no replay performed')
