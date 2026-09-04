const rules = require('./attendanceRules.cjs');
const { ref, set, push, update } = require('firebase/database');
const { rtdb } = require('./services/firebaseApp');
const netgsmService = require('./services/netgsmService');
const { User, GateStatus, AttendanceLog, StudentDailyLock } = require('./models');

const handleQrScan = async (req, res) => {
    const { tc, sessionId, qrType = 'institution', action, deviceId, stableId, incognitoScore, clientIp, deviceOs, hardwareId } = req.body;

    if (!tc || !sessionId) {
        return res.status(400).json({ success: false, error: 'T.C. Kimlik Numarası ve QR Oturum Kimliği zorunludur.' });
    }

    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const now = new Date();
        const currentDeviceId = deviceId || hardwareId || 'unknown';
        const currentStableId = stableId || 'unknown';
        const io = req.app ? req.app.get('io') : null;

        // 1. Locate user in MongoDB
        const cleanTc = String(tc).trim();
        let foundUser = await User.findOne({
            $or: [
                { tc_kimlik: cleanTc },
                { school_number: cleanTc },
                { _id: cleanTc },
                { id: cleanTc },
                { phone: cleanTc }
            ]
        }).lean();

        if (!foundUser && cleanTc.length === 4) {
            foundUser = await User.findOne({ tc_kimlik: { $regex: cleanTc + '$' } }).lean();
        }

        if (!foundUser) {
            return res.status(404).json({ success: false, error: 'Bu T.C. kimlik numarasına (veya son 4 hanesine) sahip bir kullanıcı bulunamadı.' });
        }

        const userId = String(foundUser._id || foundUser.id);
        const rawRole = String(foundUser.role || foundUser.user_type || 'student').toLowerCase().trim();
        let userRole = 'student';
        if (['teacher', 'öğretmen', 'ogretmen'].includes(rawRole)) {
            userRole = 'teacher';
        } else if (['admin', 'yönetici', 'yonetici', 'manager', 'superadmin', 'patron'].includes(rawRole)) {
            userRole = 'admin';
        } else if (['personnel', 'personel', 'staff', 'security', 'güvenlik', 'gorevli', 'hizmetli'].includes(rawRole)) {
            userRole = 'personnel';
        }

        const name = foundUser.full_name || foundUser.fullName || foundUser.name || foundUser.displayName || 'İsimsiz Kişi';
        const photoUrl = foundUser.profile_image || foundUser.profileImageUrl || foundUser.photo_url ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=9f1239&color=fff&size=200&bold=true`;

        // 2. Track device lock in Mongo
        try {
            await StudentDailyLock.findByIdAndUpdate(
                `${todayStr}_${userId}`,
                {
                    _id: `${todayStr}_${userId}`,
                    studentId: userId,
                    studentTc: cleanTc,
                    deviceId: currentDeviceId,
                    stableId: currentStableId,
                    deviceOs: deviceOs || 'unknown',
                    ipAddress: clientIp || 'unknown',
                    timestamp: now
                },
                { upsert: true }
            );
        } catch (e) {
            console.warn('[QR] student_daily_locks notice:', e?.message);
        }

        // 3. Get current GateStatus from Mongo
        const currentGateDoc = await GateStatus.findById(userId).lean();
        let currentStatus = 'outside';
        if (currentGateDoc) {
            if (currentGateDoc.date === todayStr) {
                currentStatus = (currentGateDoc.status === 'entry' || currentGateDoc.status === 'inside') ? 'entry' : 'outside';
            }
        }

        // 4. Decide newStatus
        let newStatus = 'entry';
        if (action === 'entry') {
            newStatus = 'entry';
        } else if (action === 'exit') {
            newStatus = 'exit';
        } else {
            // Toggle
            newStatus = (currentStatus === 'entry' || currentStatus === 'inside') ? 'exit' : 'entry';
        }

        const targetState = newStatus === 'entry' ? 'inside' : 'outside';
        const finalMessage = newStatus === 'entry' ? 'Kurum girişi yapıldı.' : 'Kurumdan çıkıldı.';

        // 5. Update GateStatus in Mongo
        await GateStatus.findByIdAndUpdate(
            userId,
            {
                _id: userId,
                status: newStatus,
                date: todayStr,
                timestamp: now
            },
            { upsert: true, returnDocument: 'after' }
        );

        // 6. Add AttendanceLog in Mongo
        const log = await AttendanceLog.create({
            studentId: userId,
            studentName: name,
            type: userRole === 'student' ? qrType : `${userRole}_attendance`,
            action: newStatus,
            status: newStatus,
            sessionId: sessionId || 'qr_scan',
            deviceId: currentDeviceId,
            ipAddress: clientIp || 'unknown',
            timestamp: now
        });

        const scanData = {
            id: String(log._id),
            studentId: userId,
            userId: userId,
            studentName: name,
            userName: name,
            userRole,
            role: userRole,
            action: newStatus,
            status: newStatus,
            type: userRole === 'student' ? (qrType || 'web_qr') : `${userRole}_attendance`,
            profileImageUrl: photoUrl,
            timestamp: now.getTime(),
            date: todayStr,
            source: 'vds'
        };

        // 7. Sync to RTDB for web clients
        try {
            if (rtdb) {
                await set(ref(rtdb, `qr_system/gate_status/${userId}`), {
                    status: newStatus,
                    date: todayStr,
                    lastAction: newStatus,
                    userRole,
                    timestamp: now.getTime()
                });
                const logsRef = push(ref(rtdb, `qr_system/attendance_logs/${todayStr}`));
                const updates = {};
                updates[`qr_system/attendance_logs/${todayStr}/${logsRef.key}`] = scanData;
                updates[`qr_system/live_scans/${logsRef.key}`] = scanData;
                await update(ref(rtdb), updates);
            }
        } catch (rtdbErr) {
            console.warn('[QR] RTDB sync notice:', rtdbErr.message);
        }

        // 8. Broadcast real-time scan via Socket.io
        if (io) {
            io.emit('new_scan', scanData);
            io.emit('gate_status_updated', { studentId: userId, status: newStatus, targetState });
        }

        // 9. Send SMS if target is Gökay Gülüstan (or parent phone configured)
        if (userRole === 'student' && (newStatus === 'entry' || newStatus === 'exit')) {
            netgsmService.sendParentGateSms({
                studentId: userId,
                studentName: name,
                action: newStatus,
                schoolNumber: foundUser.school_number || '',
                tc: cleanTc
            }).catch(smsErr => console.warn('[QR] SMS notice:', smsErr.message));
        }

        return res.status(200).json({
            success: true,
            message: finalMessage,
            status: newStatus,
            userRole,
            student: {
                id: userId,
                _id: userId,
                name,
                photo: photoUrl,
                tc: foundUser.tc_kimlik || cleanTc,
                role: userRole
            },
            inCooldown: false
        });

    } catch (error) {
        console.error('[handleQrScan] Error:', error);
        return res.status(500).json({ success: false, error: 'Sunucu hatası: ' + error.message });
    }
};

module.exports = { handleQrScan };
