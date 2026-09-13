/* "Bugun gelmedi" bildirimini acar. Betik kendisi hicbir SMS GONDERMEZ. */
const fs = require('fs');
const ROOT = process.env.IAL_ROOT || '/opt/ial-backend';
let oto = fs.readFileSync(ROOT + '/otomasyon.js', 'utf8');

if (!oto.includes("const netgsm = require('./services/netgsmService')")) {
    const a = "const veliBildirim = require('./services/veliBildirim');";
    if (!oto.includes(a)) throw new Error('require capasi yok');
    oto = oto.replace(a, a + "\nconst netgsm = require('./services/netgsmService');");
    console.log('  netgsmService require eklendi');
}

const eskiNot = '    // Audit only. Never dispatch a parent SMS from attendance automation.\n';
if (oto.includes(eskiNot)) {
    oto = oto.replace(eskiNot, '');
    console.log('  eski "never dispatch" notu kaldirildi');
}

const eski = `            // Bu otomasyon kanali kalici olarak salt-audit calisir. Provider'a
            // hicbir kosulda istek gitmez; gecmis SMS kaydi uydurulmaz.
            const result = { success: false, error: 'Otomatik SMS gönderimi devre dışı.' };`;
const yeni = `            /* Gonderim NetGSM tarafindaki SMS_GONDERIM_ACIK kilidinden gecer.
               Telefon yoksa provider'a istek atilmaz; audit kaydi sebebiyle
               birlikte yazilir, gecmis teslimat verisi uydurulmaz. */
            const result = parent.telefon
                ? await netgsm.sendSms({ to: parent.telefon, message: body })
                : { success: false, error: 'Veli telefonu bulunamadı.' };`;

if (oto.includes(eski)) {
    oto = oto.replace(eski, yeni);
    console.log('  "gelmedi" bildirimi ACILDI');
} else if (oto.includes('netgsm.sendSms({ to: parent.telefon')) {
    console.log('  zaten acik, atlandi');
} else {
    throw new Error('hedef blok bulunamadi');
}

fs.writeFileSync(ROOT + '/otomasyon.js', oto);
console.log('YAMA TAMAM — hicbir SMS gonderilmedi.');
