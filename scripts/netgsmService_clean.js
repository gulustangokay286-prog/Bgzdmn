const axios = require('axios');

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

async function resolveNetgsmCredentials(customCreds = {}) {
    let usercode = customCreds.usercode ||
                   process.env.NETGSM_USERCODE ||
                   process.env.NETGSM_USERNAME ||
                   '8503047089';

    let password = customCreds.password ||
                   process.env.NETGSM_PASSWORD ||
                   'ET77M17F';

    // Kurumun aktif ve tescilli NetGSM basligi: BOGAZICI AL
    let header = customCreds.header || 'BOGAZICI AL';

    return {
        usercode: String(usercode).trim(),
        password: String(password).trim(),
        header: String(header).trim()
    };
}

async function sendSms(options = {}) {
    const { to, message, header: customHeader, usercode: customUsercode, password: customPassword } = options;

    if (!to || !message) {
        return { success: false, error: 'Eksik parametre: to ve message zorunludur.' };
    }

    const rawPhones = Array.isArray(to) ? to : [to];
    const validPhones = rawPhones.map(formatPhoneNumber).filter(Boolean);

    if (validPhones.length === 0) {
        return { success: false, error: 'Gecerli bir telefon numarasi bulunamadi.' };
    }

    // Tüm velilere ve kullanıcılara gerçek zamanlı SMS gönderimi açık
    const targetPhones = validPhones;

    const creds = await resolveNetgsmCredentials({
        usercode: customUsercode,
        password: customPassword,
        header: customHeader
    });

    const noTags = targetPhones.map(p => `<no>${p}</no>`).join('\n        ');
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

        if (code === '00' || code === '01' || code === '02' || (/^\d+$/.test(code) && code.length > 5)) {
            const bulkId = parts.length > 1 ? parts[1] : code;
            console.log(`[SMS GÖNDERİLDİ] Hedef: ${targetPhones.join(',')} | BulkId: ${bulkId}`);
            return {
                success: true,
                bulkId: bulkId,
                rawResponse: rawData,
                phoneCount: targetPhones.length,
                phones: targetPhones
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

async function sendParentGateSms({ studentId, studentName, action, schoolNumber, tc, parentPhone }) {
    try {
        let phone = parentPhone;
        let finalName = studentName;

        try {
            const { User } = require('../models');
            const sid = String(studentId || '').trim();
            const cleanTc = String(tc || '').trim();
            const cleanNo = String(schoolNumber || '').trim();

            const queryOr = [];
            if (sid) queryOr.push({ _id: sid }, { id: sid }, { uid: sid }, { firebase_uid: sid }, { canonical_id: sid });
            if (cleanTc) queryOr.push({ tc_kimlik: cleanTc });
            if (cleanNo) queryOr.push({ school_number: cleanNo });

            if (queryOr.length > 0) {
                const s = await User.findOne({ $or: queryOr }).lean();
                if (s) {
                    phone = phone || s.parent_phone || s.student_phone || s.phone;
                    finalName = finalName || s.full_name || s.name;
                    schoolNumber = schoolNumber || s.school_number;
                }
            }
        } catch (mErr) {
            console.warn('[sendParentGateSms] Mongo lookup notice:', mErr.message);
        }

        if (!phone) {
            return { success: false, sent: false, error: 'Veli telefonu bulunamadi.' };
        }

        const now = new Date();
        const trHours = String((now.getUTCHours() + 3) % 24).padStart(2, '0');
        const trMins = String(now.getUTCMinutes()).padStart(2, '0');
        const timeStr = `${trHours}:${trMins}`;

        const isEntry = action === 'entry';
        const actionVerb = isEntry ? 'okulumuza giriş yapmıştır.' : 'okulumuzdan çıkış yapmıştır.';
        const firstName = String(finalName || 'Öğrencimiz').trim().split(/\s+/)[0];

        const messageText = `Sayın Velimiz,\n\nÖğrencimiz ${firstName} saat ${timeStr} itibariyle ${actionVerb}\n\nBoğaziçi Koleji`;

        return await sendSms({
            to: phone,
            message: messageText
        });
    } catch (err) {
        console.error('[sendParentGateSms] Error:', err);
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
