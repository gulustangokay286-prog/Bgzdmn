let serverTimestamp = () => new Date();
try {
    const admin = require('firebase-admin');
    if (admin && admin.firestore) serverTimestamp = admin.firestore.FieldValue.serverTimestamp;
} catch (e) {
    try {
        const fs = require('firebase/firestore');
        if (fs && fs.serverTimestamp) serverTimestamp = fs.serverTimestamp;
    } catch (_) {}
}

const NETGSM_XML_URL = 'https://api.netgsm.com.tr/sms/send/xml';
const NETGSM_BALANCE_URL = 'https://api.netgsm.com.tr/balance/list/get';

const NETGSM_ERROR_CODES = {
    '20': 'Mesaj metni bos veya maksimum karakter sinirini (918) asiyor.',
    '30': 'Gecersiz kullanici adi, sifre veya IP kisitlamasi.',
    '40': 'Mesaj basligi sistemde tanimli degil.',
    '50': 'Abone hesabinda yeterli SMS kredisi yok.',
    '51': 'Abonelik veya tarife aktif degil.',
    '60': 'Arama kriterlerine gore kayit bulunamadi.',
    '70': 'Hatali sorgu veya parametreler eksik.',
    '80': 'Gonderim sinir asimi.',
    '85': 'Mukerrer gonderim engeli.',
    '100': 'Sistem hatasi.',
    '101': 'Veritabani baglanti hatasi.'
};

function formatPhoneNumber(phone) {
    if (!phone) return null;
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.startsWith('0090') && cleaned.length >= 14) {
        cleaned = cleaned.substring(4);
    } else if (cleaned.startsWith('90') && cleaned.length === 12) {
        cleaned = cleaned.substring(2);
    } else if (cleaned.startsWith('0') && cleaned.length === 11) {
        cleaned = cleaned.substring(1);
    }
    if (cleaned.length === 10 && cleaned.startsWith('5')) {
        return cleaned;
    }
    if (cleaned.length === 10) {
        return cleaned;
    }
    return null;
}

async function resolveNetgsmCredentials(customCreds = {}, dbInstance = null) {
    let usercode = customCreds.usercode ||
                   process.env.NETGSM_USERCODE ||
                   process.env.NETGSM_USERNAME ||
                   process.env.NETGSM_USER ||
                   process.env.NETGSM_ABONE_NO ||
                   '8503047089';

    let password = customCreds.password ||
                   process.env.NETGSM_PASSWORD ||
                   process.env.NETGSM_PASS ||
                   process.env.NETGSM_API_PASSWORD ||
                   process.env.NETGSM_API_KEY ||
                   'ET77M17F';

    let header = customCreds.header ||
                 customCreds.msgheader ||
                 process.env.NETGSM_HEADER ||
                 process.env.NETGSM_MSGHEADER ||
                 process.env.NETGSM_ORIGINATOR ||
                 process.env.NETGSM_BASLIK ||
                 'BOGAZICI AL';

    let autoGateSms = false; // SMS bakim modunda, devre disi

    if (!usercode || !password || !header) {
        try {
            const db = dbInstance || getFirestore();
            const netgsmDoc = await db.collection('config').doc('netgsm').get();
            if (netgsmDoc.exists) {
                const data = netgsmDoc.data();
                if (!usercode) usercode = data.usercode || data.userName || data.userCode || '';
                if (!password) password = data.password || data.pass || data.apiPassword || '';
                if (!header) header = data.header || data.msgheader || data.smsHeader || '';
                if (data.autoGateSms !== undefined) autoGateSms = data.autoGateSms;
            }

            if (!usercode || !password || !header) {
                const sysDoc = await db.collection('system_settings').doc('general').get();
                if (sysDoc.exists) {
                    const data = sysDoc.data();
                    if (!usercode) usercode = data.netgsmUsercode || data.smsUsercode || '';
                    if (!password) password = data.netgsmPassword || data.smsPassword || '';
                    if (!header) header = data.netgsmHeader || data.smsHeader || data.schoolName || '';
                    if (data.autoGateSms !== undefined) autoGateSms = data.autoGateSms;
                }
            }

            if (!usercode || !password || !header) {
                const instDoc = await db.collection('config').doc('institution').get();
                if (instDoc.exists) {
                    const data = instDoc.data();
                    if (!usercode) usercode = data.netgsmUsercode || '';
                    if (!password) password = data.netgsmPassword || '';
                    if (!header) header = data.netgsmHeader || data.name || data.shortName || '';
                }
            }
        } catch (err) {}
    }

    if (!header) {
        header = 'BOGAZICI AL';
    }

    return {
        usercode: String(usercode).trim(),
        password: String(password).trim(),
        header: String(header).trim(),
        autoGateSms
    };
}

async function sendSms(options = {}) {
    console.log('[SMS BAKIM MODUNDA] SMS gonderimi kullanici talimatiyla tamamen devre disi birakilmistir. Alıcı:', options?.to);
    return { success: false, disabled: true, maintenanceMode: true, message: 'SMS servisi bakim modundadir.' };
    const { to, message, header: customHeader, usercode: customUsercode, password: customPassword, dil = 'TR' } = options;

    if (!to || !message) {
        return { success: false, error: 'Eksik parametre: to ve message zorunludur.' };
    }

    const rawPhones = Array.isArray(to) ? to : [to];
    const validPhones = rawPhones.map(formatPhoneNumber).filter(Boolean);

    if (validPhones.length === 0) {
        return { success: false, error: 'Gecerli bir telefon numarasi bulunamadi.' };
    }

    const creds = await resolveNetgsmCredentials({
        usercode: customUsercode,
        password: customPassword,
        header: customHeader
    });

    if (!creds.usercode || !creds.password) {
        return {
            success: false,
            error: 'NetGSM API kimlik bilgileri eksik. Lutfen .env dosyasina NETGSM_USERCODE ve NETGSM_PASSWORD girin.',
            code: 'MISSING_CREDENTIALS'
        };
    }

    const noTags = validPhones.map(p => `<no>${p}</no>`).join('\n        ');
    const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<mainbody>
    <header>
        <company dil="TR">Netgsm</company>
        <usercode>${creds.usercode}</usercode>
        <password>${creds.password}</password>
        <type>1:n</type>
        <msgheader>${creds.header}</msgheader>
        <tr>1</tr>
    </header>
    <body>
        <msg><![CDATA[${message}]]></msg>
        ${noTags}
    </body>
</mainbody>`;

    try {
        const response = await axios.post(NETGSM_XML_URL, xmlPayload, {
            headers: {
                'Content-Type': 'application/xml; charset=UTF-8',
                'Accept': 'text/plain, application/xml, */*'
            },
            timeout: 15000
        });

        const rawData = String(response.data || '').trim();
        const parts = rawData.split(/\s+/);
        const code = parts[0];

        if (code === '00' || code === '01' || code === '02' || (!NETGSM_ERROR_CODES[code] && /^\d+$/.test(code))) {
            const bulkId = parts.length > 1 ? parts[1] : code;
            return {
                success: true,
                bulkId: bulkId,
                rawResponse: rawData,
                phoneCount: validPhones.length,
                phones: validPhones
            };
        }

        const errorDesc = NETGSM_ERROR_CODES[code] || `NetGSM Hata Kodu: ${rawData}`;
        return {
            success: false,
            code: code,
            error: errorDesc,
            rawResponse: rawData
        };

    } catch (netErr) {
        return {
            success: false,
            error: `NetGSM API Baglanti Hatasi: ${netErr.message}`
        };
    }
}

async function sendParentGateSms({ studentId, studentName, action, schoolNumber, tc, db }) {
    console.log('[SMS BAKIM MODUNDA] Giris-cikis SMS servisi kullanici talimatiyla bakim modundadir. SMS gonderilmeyecek.');
    return { success: true, sent: false, disabled: true, reason: 'maintenance_mode' };
    try {
        const firestore = db || getFirestore();
        const creds = await resolveNetgsmCredentials({}, firestore);

        if (!creds.autoGateSms) {
            return { success: true, sent: false, reason: 'disabled' };
        }

        let parentPhone = null;

        const studentDoc = await firestore.collection('users').doc(studentId).get();
        if (studentDoc.exists) {
            const sData = studentDoc.data();
            parentPhone = sData.parent_phone || sData.parentPhone || sData.parent_phone_number || sData.veli_telefon || sData.veliTelefon || null;
            if (!schoolNumber) schoolNumber = sData.school_number || sData.schoolNumber || '';
        }

        if (!parentPhone && schoolNumber) {
            const parentSnap1 = await firestore.collection('users')
                .where('role', 'in', ['parent', 'veli'])
                .where('child_school_number', '==', String(schoolNumber))
                .limit(1)
                .get();

            if (!parentSnap1.empty) {
                const pData = parentSnap1.docs[0].data();
                parentPhone = pData.phone || pData.phoneNumber || pData.phone_number;
            }
        }

        if (!parentPhone) {
            const parentSnap2 = await firestore.collection('users')
                .where('role', 'in', ['parent', 'veli'])
                .where('linked_student_ids', 'array-contains', studentId)
                .limit(1)
                .get();

            if (!parentSnap2.empty) {
                const pData = parentSnap2.docs[0].data();
                parentPhone = pData.phone || pData.phoneNumber || pData.phone_number;
            }
        }

        if (!parentPhone) {
            return { success: false, sent: false, error: 'Veli telefonu bulunamadi.' };
        }

        const now = new Date();
        const trHours = String((now.getUTCHours() + 3) % 24).padStart(2, '0');
        const trMins = String(now.getUTCMinutes()).padStart(2, '0');
        const timeStr = `${trHours}:${trMins}`;

        const isEntry = action === 'entry';
        const actionVerb = isEntry ? 'okulumuza giriş yapmıştır.' : 'okulumuzdan çıkış yapmıştır.';
        const pluralActionVerb = isEntry ? 'okulumuza giriş yapmışlardır.' : 'okulumuzdan çıkış yapmışlardır.';

        const getFirstName = (fullName = '') => {
            const parts = String(fullName).trim().split(/\s+/);
            if (parts.length <= 1) return parts[0] || '';
            const words = parts.slice(0, -1);
            return words.map(w => {
                if (!w) return '';
                const first = w[0].replace('i', 'İ').replace('ı', 'I').toUpperCase();
                const rest = w.slice(1).replace('I', 'ı').replace('İ', 'i').toLowerCase();
                return first + rest;
            }).join(' ');
        };

        let messageText = '';
        if (Array.isArray(studentName) && studentName.length > 1) {
            const firstNames = studentName.map(n => getFirstName(n)).filter(Boolean);
            messageText = `Sayın Velimiz,\n\nÖğrencilerimiz ${firstNames.join(' ve ')} saat ${timeStr} itibariyle ${pluralActionVerb}\n\nBoğaziçi Koleji`;
        } else {
            const raw = Array.isArray(studentName) ? studentName[0] : studentName;
            const firstName = getFirstName(raw);
            messageText = `Sayın Velimiz,\n\nÖğrencimiz ${firstName} saat ${timeStr} itibariyle ${actionVerb}\n\nBoğaziçi Koleji`;
        }

        const smsResult = await sendSms({
            to: parentPhone,
            message: messageText,
            header: creds.header,
            usercode: creds.usercode,
            password: creds.password,
            db
        });

        try {
            await firestore.collection('sms_logs').add({
                type: 'gate_attendance_sms',
                studentId,
                studentName,
                schoolNumber: schoolNumber || '',
                action,
                phone: parentPhone,
                message: messageText,
                status: smsResult.success ? 'delivered' : 'failed',
                bulkId: smsResult.bulkId || null,
                error: smsResult.error || null,
                timestamp: serverTimestamp(),
                date: now.toISOString().split('T')[0]
            });
        } catch (logErr) {}

        return {
            success: smsResult.success,
            sent: smsResult.success,
            phone: parentPhone,
            bulkId: smsResult.bulkId,
            error: smsResult.error
        };

    } catch (err) {
        return { success: false, sent: false, error: err.message };
    }
}

async function checkBalance(creds = {}) {
    try {
        const resolved = await resolveNetgsmCredentials(creds);
        if (!resolved.usercode || !resolved.password) {
            return { success: false, error: 'NetGSM kullanici kodu ve sifresi tanimli degil.' };
        }

        const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<mainbody>
    <header>
        <usercode>${resolved.usercode}</usercode>
        <password>${resolved.password}</password>
    </header>
</mainbody>`;

        const response = await axios.post('https://api.netgsm.com.tr/balance/list/xml', xmlPayload, {
            headers: { 'Content-Type': 'application/xml; charset=UTF-8' },
            timeout: 10000
        });
        const rawData = String(response.data || '').trim();

        const parts = rawData.split(/\s+/);
        const code = parts[0];

        if (code === '00') {
            const credit = parts.length > 1 ? parseInt(parts[1], 10) : 0;
            const description = parts.length > 1 ? parts.slice(1).join(' ') : '0 SMS';
            return {
                success: true,
                balance: isNaN(credit) ? parts[1] : credit,
                description: description,
                rawResponse: rawData
            };
        }

        return {
            success: false,
            error: NETGSM_ERROR_CODES[rawData] || `Bakiye sorgulama hatasi: ${rawData}`,
            rawResponse: rawData
        };
    } catch (err) {
        return { success: false, error: `NetGSM baglanti hatasi: ${err.message}` };
    }
}

module.exports = {
    sendSms,
    sendParentGateSms,
    checkBalance,
    formatPhoneNumber,
    resolveNetgsmCredentials
};
