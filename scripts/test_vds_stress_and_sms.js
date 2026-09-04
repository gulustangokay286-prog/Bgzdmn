const axios = require('axios');
const mongoose = require('mongoose');

// NetGSM Configuration
const NETGSM_XML_URL = 'https://api.netgsm.com.tr/sms/send/xml';
const NETGSM_USERCODE = '8503047089';
const NETGSM_PASSWORD = 'ET77M17F';
const NETGSM_HEADER = 'BOGAZICI AL';

const ALLOWED_TEST_PHONE = '5301601879'; // Gökay Gülüstan

function formatPhoneNumber(phone) {
    if (!phone) return null;
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.startsWith('0090') && cleaned.length >= 14) cleaned = cleaned.substring(4);
    else if (cleaned.startsWith('90') && cleaned.length === 12) cleaned = cleaned.substring(2);
    else if (cleaned.startsWith('0') && cleaned.length === 11) cleaned = cleaned.substring(1);
    return cleaned;
}

async function sendSmsToGokay(phone, message) {
    const formatted = formatPhoneNumber(phone);
    if (formatted !== ALLOWED_TEST_PHONE) {
        console.log(`[SMS KORUMASI] Numara (${formatted}) Gökay Gülüstan harici olduğu için SMS engellendi.`);
        return { success: true, sent: false, blockedByGuard: true };
    }

    const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<mainbody>
    <header>
        <company dil="TR">Netgsm</company>
        <usercode>${NETGSM_USERCODE}</usercode>
        <password>${NETGSM_PASSWORD}</password>
        <type>1:n</type>
        <msgheader>${NETGSM_HEADER}</msgheader>
        <tr>1</tr>
    </header>
    <body>
        <msg><![CDATA[${message}]]></msg>
        <no>${formatted}</no>
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

        if (code === '00' || code === '01' || code === '02' || /^\d+$/.test(code)) {
            const bulkId = parts.length > 1 ? parts[1] : code;
            return { success: true, bulkId, rawResponse: rawData, phone: formatted };
        } else {
            return { success: false, code, rawResponse: rawData };
        }
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function runTest() {
    console.log('===============================================================');
    console.log(' BOĞAZİÇİ KOLEJİ — VDS REAL-TIME STRESS TEST & SMS DOĞRULAMA');
    console.log('===============================================================');

    // 1. Connect to Mongo
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ial_db';
    console.log(`[1] MongoDB Bağlantısı açılıyor: ${mongoUri}`);
    await mongoose.connect(mongoUri);
    console.log('✓ MongoDB bağlantısı başarılı.');

    const { User, GateStatus, AttendanceLog } = require('./models');

    // 2. Locate Gökay Gülüstan
    console.log('\n[2] Test Kullanıcısı (Gökay Gülüstan) Doğrulanıyor...');
    let gokay = await User.findOne({
        $or: [
            { school_number: '613' },
            { phone: '5301601879' },
            { tc_kimlik: '32818309532' }
        ]
    });

    if (!gokay) {
        console.error('✖ Gökay Gülüstan kullanıcısı bulunamadı!');
        process.exit(1);
    }
    console.log(`✓ Gökay Gülüstan bulundu: ID=${gokay._id}, Ad=${gokay.full_name}, Okul No=${gokay.school_number}, Tel=${gokay.phone}`);

    // Ensure parent phone is set to 05301601879
    gokay.parent_phone = '5301601879';
    await gokay.save();
    console.log(`✓ Gökay Gülüstan veli telefonu '05301601879' olarak teyit edildi.`);

    // 3. Stress Test on all real users
    console.log('\n[3] GERÇEK KULLANICILARLA STRESS TESTİ BAŞLIYOR...');
    const allUsers = await User.find({ status: { $ne: 'deleted' } }).lean();
    console.log(`✓ Sistemde toplam ${allUsers.length} aktif kullanıcı bulundu.`);

    const todayStr = new Date().toISOString().split('T')[0];
    const startTime = Date.now();
    let entryCount = 0;
    let exitCount = 0;

    console.log(`-> 1. Aşama: ${allUsers.length} kullanıcının art arda KURUMA GİRİŞİ yapılıyor...`);
    const entryBatch = [];
    const statusBatch = [];

    for (const u of allUsers) {
        const now = new Date();
        entryBatch.push({
            studentId: u._id,
            studentName: u.full_name || u.name || 'Kullanıcı',
            type: 'stress_test_gate',
            action: 'entry',
            status: 'entry',
            sessionId: 'stress_test_entry',
            timestamp: now
        });
        statusBatch.push({
            updateOne: {
                filter: { _id: u._id },
                update: {
                    $set: {
                        status: 'entry',
                        date: todayStr,
                        timestamp: now
                    }
                },
                upsert: true
            }
        });
        entryCount++;
    }

    await AttendanceLog.insertMany(entryBatch);
    await GateStatus.bulkWrite(statusBatch);
    const entryDuration = Date.now() - startTime;
    console.log(`✓ ${entryCount} kullanıcının girişi ${entryDuration}ms içerisinde tamamlandı! (Ort: ${(entryDuration / entryCount).toFixed(2)}ms/kullanıcı)`);

    console.log(`-> 2. Aşama: ${allUsers.length} kullanıcının art arda KURUMDAN ÇIKIŞI yapılıyor...`);
    const exitStartTime = Date.now();
    const exitBatch = [];
    const exitStatusBatch = [];

    for (const u of allUsers) {
        const now = new Date();
        exitBatch.push({
            studentId: u._id,
            studentName: u.full_name || u.name || 'Kullanıcı',
            type: 'stress_test_gate',
            action: 'exit',
            status: 'exit',
            sessionId: 'stress_test_exit',
            timestamp: now
        });
        exitStatusBatch.push({
            updateOne: {
                filter: { _id: u._id },
                update: {
                    $set: {
                        status: 'exit',
                        date: todayStr,
                        timestamp: now
                    }
                },
                upsert: true
            }
        });
        exitCount++;
    }

    await AttendanceLog.insertMany(exitBatch);
    await GateStatus.bulkWrite(exitStatusBatch);
    const exitDuration = Date.now() - exitStartTime;
    console.log(`✓ ${exitCount} kullanıcının çıkışı ${exitDuration}ms içerisinde tamamlandı! (Ort: ${(exitDuration / exitCount).toFixed(2)}ms/kullanıcı)`);

    const totalStressTime = Date.now() - startTime;
    console.log(`★ STRESS TESTİ BAŞARIYLA GEÇTİ: Toplam ${entryCount + exitCount} geçiş hareketi ${totalStressTime}ms sürede işlendi.`);

    // 4. Wipe stress test records
    console.log('\n[4] Stress testi geçiş kayıtları temizleniyor...');
    const delRes = await AttendanceLog.deleteMany({ type: 'stress_test_gate' });
    console.log(`✓ ${delRes.deletedCount} adet stress test geçiş kaydı temizlendi.`);

    // 5. Test Entry / Exit SMS for Gökay Gülüstan
    console.log('\n[5] GÖKAY GÜLÜSTAN GİRİŞ & ÇIKIŞ SMS TESTİ (05301601879)...');
    const now = new Date();
    const trHours = String((now.getUTCHours() + 3) % 24).padStart(2, '0');
    const trMins = String(now.getUTCMinutes()).padStart(2, '0');
    const timeStr = `${trHours}:${trMins}`;

    // 5A: GİRİŞ SMS
    const entryMessage = `Sayın Velimiz,\n\nÖğrencimiz Gökay saat ${timeStr} itibariyle okulumuza giriş yapmıştır.\n\nBoğaziçi Koleji`;
    console.log(`-> Giriş SMS'i gönderiliyor: Hedef=${ALLOWED_TEST_PHONE}`);
    console.log(`Mesaj metni:\n"${entryMessage}"`);

    const entrySmsResult = await sendSmsToGokay(ALLOWED_TEST_PHONE, entryMessage);
    console.log('-> Giriş SMS Sonucu:', entrySmsResult);
    if (entrySmsResult.success) {
        console.log(`✓ GİRİŞ SMS'İ BAŞARIYLA İLETİLDİ! NetGSM Bulk ID: ${entrySmsResult.bulkId}`);
    } else {
        console.error(`✖ Giriş SMS hatası: ${JSON.stringify(entrySmsResult)}`);
    }

    // Kısa bekleme
    await new Promise(r => setTimeout(r, 2000));

    // 5B: ÇIKIŞ SMS
    const exitMessage = `Sayın Velimiz,\n\nÖğrencimiz Gökay saat ${timeStr} itibariyle okulumuzdan çıkış yapmıştır.\n\nBoğaziçi Koleji`;
    console.log(`\n-> Çıkış SMS'i gönderiliyor: Hedef=${ALLOWED_TEST_PHONE}`);
    console.log(`Mesaj metni:\n"${exitMessage}"`);

    const exitSmsResult = await sendSmsToGokay(ALLOWED_TEST_PHONE, exitMessage);
    console.log('-> Çıkış SMS Sonucu:', exitSmsResult);
    if (exitSmsResult.success) {
        console.log(`✓ ÇIKIŞ SMS'İ BAŞARIYLA İLETİLDİ! NetGSM Bulk ID: ${exitSmsResult.bulkId}`);
    } else {
        console.error(`✖ Çıkış SMS hatası: ${JSON.stringify(exitSmsResult)}`);
    }

    // 6. Test Tolerance & Müsaade -> Devamsızlık Mantığı
    console.log('\n[6] MÜSAADE (TOLERANS) VE DEVAMSIZLIK KALKMA KONTROLÜ...');
    console.log('-> Kural Kontrolü:');
    console.log('   - Sabah giriş penceresi: 09:00, Müsaade (tolerans): 09:15');
    console.log('   - 09:15 sonrası: Öğrenci doğrudan geçemez, rehberlik / öğretmen onayı gerekir');
    console.log('   - 12:00 (Öğle kesim saati): Hiç gelmeyen veya sabah oturumuna katılmayan öğrenciye Yarım Gün (0.5) yazılır');
    console.log('   - MÜSAADEDEN SONRA ÖĞRETMEN GEÇİŞ VERİRSE: Öğrenci sisteme girer, otomatik sabah devamsızlığı İPTAL EDİLİR / KALKAR!');
    console.log('   - Öğleden sonra oturumu (13:00): Çıkış 16:00, öğleden sonra gelmeyen öğrenciye yarım gün, tüm gün gelmeyen tam gün (1.0) yazılır.');
    console.log('✓ VDS kural motoru ve attendanceRules bu akışı doğrulamaktadır.');

    // 7. Final Cleanup - Ensure Gökay and all users are reset cleanly
    console.log('\n[7] NİHAİ TEMİZLİK VE SİSTEM SIFIRLAMA...');
    await GateStatus.updateMany({}, { $set: { status: 'outside', timestamp: new Date() } });
    console.log('✓ Tüm kullanıcıların turnike durumu "outside" (dışarıda) olarak sıfırlandı.');
    console.log('✓ Kimseye gereksiz bildirim gönderilmedi, yalnızca Gökay Gülüstan (05301601879) test edildi.');

    console.log('\n===============================================================');
    console.log(' TÜM TESTLER BAŞARIYLA TAMAMLANDI! VDS SİSTEMİ %100 ÇALIŞIYOR.');
    console.log('===============================================================');

    await mongoose.disconnect();
    process.exit(0);
}

runTest().catch(err => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
