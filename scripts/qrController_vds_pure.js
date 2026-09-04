const netgsmService = require('./services/netgsmService');
const { User, GateStatus, AttendanceLog, StudentDailyLock } = require('./models');

const handleQrScan = async (req, res) => {
    const { tc, schoolNumber, sessionId, qrType = 'institution', action, deviceId, stableId, incognitoScore, clientIp, deviceOs, hardwareId } = req.body;

    const rawInput = String(tc || schoolNumber || '').trim();
    if (!rawInput && !sessionId) {
        return res.status(400).json({ success: false, error: 'Kimlik veya Karekod Oturum Bilgisi zorunludur.' });
    }

    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const now = new Date();
        const currentDeviceId = deviceId || hardwareId || 'unknown';
        const currentStableId = stableId || 'unknown';
        const io = req.app ? req.app.get('io') : null;

        // 1. Locate user in MongoDB across all possible fields (TC, School Number, _id, id, firebase_uid, phone)
        const cleanInput = rawInput.trim();
        const queryOr = [
            { _id: cleanInput },
            { id: cleanInput },
            { uid: cleanInput },
            { firebase_uid: cleanInput },
            { canonical_id: cleanInput },
            { school_number: cleanInput },
            { tc_kimlik: cleanInput },
            { phone: cleanInput },
            { student_phone: cleanInput }
        ];

        if (cleanInput.length === 4) {
            queryOr.push({ tc_kimlik: { $regex: cleanInput + '$' } });
        }

        let foundUser = await User.findOne({ $or: queryOr }).lean();

        if (!foundUser) {
            return res.status(404).json({
                success: false,
                error: `"${cleanInput}" numarasına veya kimliğine ait kullanıcı kaydı bulunamadı.`
            });
        }

        const canonicalId = foundUser.canonical_id || String(foundUser._id || foundUser.id);
        const firebaseUid = foundUser.firebase_uid || null;
        const studentNo = foundUser.school_number ? String(foundUser.school_number) : '';
        const userTc = foundUser.tc_kimlik ? String(foundUser.tc_kimlik) : cleanInput;

        const aliases = Array.from(new Set([
            canonicalId,
            firebaseUid,
            studentNo,
            studentNo ? `std_${studentNo}` : null,
            userTc,
            String(foundUser._id),
            String(foundUser.id)
        ].filter(Boolean)));

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
                `${todayStr}_${canonicalId}`,
                {
                    _id: `${todayStr}_${canonicalId}`,
                    studentId: canonicalId,
                    studentTc: userTc,
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
        const currentGateDoc = await GateStatus.findOne({ $or: aliases.map(a => ({ _id: a })) }).lean();
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

        // 5. Update GateStatus for ALL aliases in Mongo so queries by any alias find the latest status
        for (const aId of aliases) {
            await GateStatus.findByIdAndUpdate(
                aId,
                {
                    _id: aId,
                    status: newStatus,
                    date: todayStr,
                    timestamp: now
                },
                { upsert: true }
            );
        }

        // 6. Add AttendanceLog in Mongo
        const log = await AttendanceLog.create({
            studentId: canonicalId,
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
            studentId: canonicalId,
            userId: canonicalId,
            aliases,
            firebaseUid,
            schoolNumber: studentNo,
            tc: userTc,
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

        // 7. Broadcast real-time scan via Socket.io to all listening dashboards
        if (io) {
            io.emit('new_scan', scanData);
            io.emit('gate_status_updated', {
                studentId: canonicalId,
                aliases,
                status: newStatus,
                targetState
            });
        }

        // 8. Send SMS in real time to parent (all users enabled, header BOGAZICI AL)
        if (userRole === 'student' && (newStatus === 'entry' || newStatus === 'exit')) {
            netgsmService.sendParentGateSms({
                studentId: canonicalId,
                studentName: name,
                action: newStatus,
                schoolNumber: studentNo,
                tc: userTc
            }).catch(smsErr => console.warn('[QR] SMS error:', smsErr.message));
        }

        return res.status(200).json({
            success: true,
            message: finalMessage,
            status: newStatus,
            userRole,
            student: {
                id: canonicalId,
                _id: canonicalId,
                name,
                photo: photoUrl,
                tc: userTc,
                schoolNumber: studentNo,
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
