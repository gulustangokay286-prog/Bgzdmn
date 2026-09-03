const rules = require('./attendanceRules.cjs');
const {
    collection, query, where, getDocs, doc, getDoc, setDoc, addDoc, serverTimestamp
} = require('firebase/firestore');
const { ref, set, push, update } = require('firebase/database');
const { db, rtdb } = require('./services/firebaseApp');
const netgsmService = require('./services/netgsmService');

const handleQrScan = async (req, res) => {
    const { tc, sessionId, qrType = 'institution', action, deviceId, stableId, incognitoScore, clientIp, deviceOs, hardwareId } = req.body;

    if (!tc || !sessionId) {
        return res.status(400).json({ success: false, error: 'T.C. Kimlik Numarası ve QR Oturum Kimliği zorunludur.' });
    }

    try {
        const todayStr = new Date().toLocaleDateString('en-CA');
        const nowSec = Math.floor(Date.now() / 1000);
        const currentDeviceId = deviceId || hardwareId || 'unknown';
        const currentStableId = stableId || 'unknown';
        const io = req.app ? req.app.get('io') : null;

        // Cache all users (students, teachers, personnel)
        if (!global.usersCache || Date.now() - global.usersCacheTime > 5 * 60 * 1000) {
            const usersRef = collection(db, 'users');
            const snap = await getDocs(usersRef);
            global.usersCache = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
            global.usersCacheTime = Date.now();
        }

        let foundUser = null;
        for (const user of (global.usersCache || [])) {
            const tcRaw = String(user.tc_kimlik || user.tc || user.tcNo || user.tcKimlik || user.identityNumber || user.idNumber || "");
            if (tcRaw === tc || (tc.length === 4 && tcRaw.endsWith(tc))) {
                foundUser = user;
                break;
            }
        }

        if (!foundUser) {
            return res.status(404).json({ success: false, error: 'Bu T.C. kimlik numarasına (veya son 4 hanesine) sahip bir kullanıcı bulunamadı.' });
        }

        // Determine real role
        const rawRole = String(foundUser.role || foundUser.user_type || foundUser.type || 'student').toLowerCase().trim();
        let userRole = 'student';
        if (['teacher', 'öğretmen', 'ogretmen'].includes(rawRole)) {
            userRole = 'teacher';
        } else if (['admin', 'yönetici', 'yonetici', 'manager'].includes(rawRole)) {
            userRole = 'admin';
        } else if (['personnel', 'personel', 'staff', 'security', 'güvenlik', 'gorevli', 'hizmetli'].includes(rawRole)) {
            userRole = 'personnel';
        }

        const nameKeys = ["full_name", "fullName", "name", "displayName", "display_name"];
        let name = "İsimsiz Kişi";
        for (let k of nameKeys) {
            if (foundUser[k]) { name = foundUser[k]; break; }
        }
        
        const photoUrl = foundUser.profile_image || foundUser.profileImageUrl || foundUser.profileImage || 
            `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=9f1239&color=fff&size=200&bold=true`;

        // 1. Incognito Detection (Gevşetildi - Engelleme kaldırıldı)
        if (incognitoScore !== undefined && incognitoScore <= 50) {
            console.log(`[QR] Gizli sekme uyarısı (${foundUser.id} - ${name}), geçiş serbest bırakıldı.`);
        }

        // 2. Nonce consumption (Kişi başına - Aynı QR'ı çoklu kişi okutabilir)
        if (sessionId !== 'web_fallback') {
            const userNonceKey = `${sessionId}_${foundUser.id}`;
            // Nonce kilidi kullanici istegiyle kaldirildi
            await setDoc(doc(db, 'consumed_nonces', userNonceKey), {
                consumedAt: serverTimestamp(),
                studentId: foundUser.id
            });
        }

        // 3. Multi-device check (Gevşetildi - Ödünç telefon ve cihaz değişimi engellenmez)
        try {
            await setDoc(doc(db, 'student_daily_locks', `${todayStr}_${foundUser.id}`), {
                studentId: foundUser.id,
                studentTc: tc,
                deviceId: currentDeviceId,
                stableId: currentStableId,
                deviceOs: deviceOs || 'unknown',
                ipAddress: clientIp || 'unknown',
                timestamp: serverTimestamp()
            }, { merge: true });
        } catch (e) {
            console.warn('[QR] student_daily_locks hatası:', e?.message);
        }

        const statusSnap = await getDoc(doc(db, 'gate_status', foundUser.id));
        let currentStatus = "outside";
        let lastScanTime = null;

        if (statusSnap.exists()) {
            const data = statusSnap.data();
            if (data.date === todayStr) {
                currentStatus = data.status;
                if (data.timestamp && data.timestamp.seconds) {
                    lastScanTime = data.timestamp.seconds;
                } else if (data.timestamp && data.timestamp._seconds) {
                    lastScanTime = data.timestamp._seconds;
                }
            }
        }

        let attendanceConfig = rules.resolveAttendanceConfig({});
        try {
            const cfgSnap = await getDoc(doc(db, 'config', 'institution'));
            if (cfgSnap.exists()) attendanceConfig = rules.resolveAttendanceConfig(cfgSnap.data());
        } catch (cfgErr) {}

        const nowDate = new Date();
        const nowMinutes = rules.getMinutesInTimeZone(nowDate, attendanceConfig.timeZone);
        const closedToday = rules.isClosedDay(nowDate, attendanceConfig);

        const isAttemptingEntry =
            action === 'entry' ||
            ((!action || action === 'toggle') && currentStatus !== 'entry');

        // Entry kisitlamalari ve guvenlik loglari kullanici istegiyle kapatildi

        // Student Exit Guard kullanici istegiyle kaldirildi
        let newStatus = isAttemptingEntry ? 'entry' : 'exit';
        let finalMessage = isAttemptingEntry ? 'Kurum girişi yapıldı.' : 'Kurum çıkışı kaydedildi.';
        let inCooldown = false;

        if (action === 'entry') {
            finalMessage = 'Kurum girişi yapıldı.';
            newStatus = 'entry';
            inCooldown = false;
        } else if (action === 'exit') {
            finalMessage = 'Kurumdan çıkıldı.';
            newStatus = 'exit';
            inCooldown = false;
        } else {
            if (currentStatus === 'entry' || currentStatus === 'inside') {
                finalMessage = 'Kurumdan çıkıldı.';
                newStatus = 'exit';
            } else {
                finalMessage = 'Kurum girişi yapıldı.';
                newStatus = 'entry';
            }
            inCooldown = false;
        }
        
        if (!inCooldown) {
            await setDoc(doc(db, 'gate_status', foundUser.id), {
                status: newStatus,
                userRole,
                date: todayStr,
                timestamp: serverTimestamp()
            }, { merge: true });

            await addDoc(collection(db, 'attendance_logs'), {
                studentId: foundUser.id,
                userId: foundUser.id,
                studentName: name,
                userName: name,
                userRole,
                type: userRole === 'student' ? qrType : `${userRole}_attendance`,
                action: action || "toggle",
                status: newStatus,
                sessionId: sessionId,
                deviceId: currentDeviceId,
                ipAddress: clientIp || 'unknown',
                timestamp: serverTimestamp()
            });

            await set(ref(rtdb, `qr_system/gate_status/${foundUser.id}`), {
                status: newStatus,
                date: todayStr,
                lastAction: newStatus === 'entry' ? 'entry' : 'exit',
                userRole,
                timestamp: Date.now()
            });

            const rtdbData = {
                sessionId: sessionId || "backend_api",
                type: userRole === 'student' ? (qrType || "web_qr") : `${userRole}_attendance`,
                action: newStatus,
                status: newStatus,
                studentId: foundUser.id,
                userId: foundUser.id, 
                studentName: name,
                userName: name,
                userRole: userRole,
                role: userRole,
                profileImageUrl: photoUrl || "",
                timestamp: Date.now(),
                date: todayStr
            };

            const logsRef = push(ref(rtdb, `qr_system/attendance_logs/${todayStr}`));
            const updates = {};
            updates[`qr_system/attendance_logs/${todayStr}/${logsRef.key}`] = rtdbData;
            updates[`qr_system/live_scans/${logsRef.key}`] = rtdbData;
            await update(ref(rtdb), updates);

            // Broadcast real-time scan via socket.io
            if (io) {
                io.emit('new_scan', rtdbData);
            }

            // SMS gonderimi bakim modunda oldugu icin gecici olarak tamamen devre disi birakildi
            /*
            if (userRole === 'student' && (newStatus === 'entry' || newStatus === 'exit')) {
                netgsmService.sendParentGateSms({
                    studentId: foundUser.id,
                    studentName: name,
                    action: newStatus,
                    schoolNumber: foundUser.school_number || foundUser.schoolNumber || '',
                    tc: tc,
                    db
                }).catch(() => {});
            }
            */
        }

        return res.status(200).json({
            success: true,
            message: finalMessage,
            status: newStatus,
            userRole,
            student: {
                id: foundUser.id,
                name: name,
                photo: photoUrl,
                tc: tc,
                role: userRole
            },
            inCooldown
        });

    } catch (error) {
        return res.status(500).json({ success: false, error: 'Sunucu hatası: ' + error.message });
    }
};

module.exports = { handleQrScan };
