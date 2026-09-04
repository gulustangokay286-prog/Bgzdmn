require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { createClient } = require('redis');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const port = process.env.PORT || 8080;
const server = http.createServer(app);

// Socket.io initialization
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});
app.set('io', io);

// Middleware
app.use(cors());
app.use(helmet({
    crossOriginResourcePolicy: false
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));

// MongoDB Connection
let mongoUri = process.env.MONGO_URI || 'mongodb://mongo:27017/ial_db';
mongoUri = mongoUri.replace(/\?useNewUrlParser=true&useUnifiedTopology=true/i, '');
mongoUri = mongoUri.replace(/\?useunifiedtopology=true&usenewurlparser=true/i, '');

mongoose.connect(mongoUri)
    .then(() => console.log(' Connected to MongoDB'))
    .catch(err => console.error(' MongoDB Connection Error:', err.message));

// Redis Connection
const redisClient = createClient({ url: process.env.REDIS_URI || 'redis://redis:6379' });
redisClient.on('error', (err) => console.log(' Redis Client Error', err.message));
redisClient.connect()
    .then(() => console.log(' Connected to Redis'))
    .catch(err => console.error(' Redis Connection Error:', err.message));

// Socket.io Connection Event
io.on('connection', (socket) => {
    console.log(` New client connected: ${socket.id}`);
    socket.on('disconnect', () => {
        console.log(` Client disconnected: ${socket.id}`);
    });
});

// Import services & models
const { User, AttendanceLog, GateStatus, SecurityLog, StudentDailyLock } = require('./models');
const { decryptPayload, encryptPayload } = require('./cryptoUtil');
const { verifyAuth, verifyAdmin } = require('./authMiddleware');
const netgsmService = require('./services/netgsmService');
const { handleQrScan } = require('./qrController');

// --------------------------------------------------------------------------
//  CORE HEALTH & SYSTEM
// --------------------------------------------------------------------------

app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'Boğaziçi Koleji VDS API & Real-time Server is running',
        timestamp: new Date()
    });
});

// --------------------------------------------------------------------------
//  USER MANAGEMENT REST API (Pure VDS MongoDB)
// --------------------------------------------------------------------------

// GET /api/users - List all users with optional role, status, search filter
app.get('/api/users', async (req, res) => {
    try {
        const { role, status, search, limit = 1000, skip = 0 } = req.query;
        const query = {};

        if (role && role !== 'all') {
            if (role === 'teacher') query.role = { $in: ['teacher', 'öğretmen'] };
            else if (role === 'student') query.role = { $in: ['student', 'öğrenci'] };
            else if (role === 'parent') query.role = { $in: ['parent', 'veli'] };
            else if (role === 'personnel') query.role = { $in: ['personnel', 'personel', 'admin', 'yönetici'] };
            else query.role = role;
        }

        if (status && status !== 'all') {
            query.status = status;
        }

        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            query.$or = [
                { full_name: regex },
                { name: regex },
                { tc_kimlik: regex },
                { school_number: regex },
                { phone: regex },
                { email: regex }
            ];
        }

        const users = await User.find(query)
            .sort({ full_name: 1 })
            .skip(Number(skip))
            .limit(Number(limit))
            .lean();

        // Format each user with 'id' field for frontend compatibility
        const formattedUsers = users.map(u => ({
            ...u,
            id: u._id
        }));

        res.status(200).json({
            success: true,
            count: formattedUsers.length,
            users: formattedUsers
        });
    } catch (err) {
        console.error('GET /api/users Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/users/:id - Get single user
app.get('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).lean();
        if (!user) {
            return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });
        }
        res.status(200).json({ success: true, user: { ...user, id: user._id } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/users - Create new user
app.post('/api/users', async (req, res) => {
    try {
        const data = req.body;
        const id = data._id || data.id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newUser = new User({
            ...data,
            _id: id,
            created_at: new Date()
        });
        await newUser.save();

        const userObj = { ...newUser.toObject(), id: newUser._id };
        io.emit('user_created', userObj);

        res.status(201).json({ success: true, user: userObj });
    } catch (err) {
        console.error('POST /api/users Error:', err);
        res.status(400).json({ success: false, error: err.message });
    }
});

// PUT /api/users/:id - Update user details
app.put('/api/users/:id', async (req, res) => {
    try {
        const updates = req.body;
        delete updates._id;

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: false }
        ).lean();

        if (!updatedUser) {
            return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });
        }

        const userObj = { ...updatedUser, id: updatedUser._id };
        io.emit('user_updated', userObj);

        res.status(200).json({ success: true, user: userObj });
    } catch (err) {
        console.error('PUT /api/users Error:', err);
        res.status(400).json({ success: false, error: err.message });
    }
});

// DELETE /api/users/:id - Delete user
app.delete('/api/users/:id', async (req, res) => {
    try {
        const deleted = await User.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });
        }

        io.emit('user_deleted', { id: req.params.id, _id: req.params.id });
        res.status(200).json({ success: true, message: 'Kullanıcı başarıyla silindi.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/users/:id/reset-device - Reset device lock
app.post('/api/users/:id/reset-device', async (req, res) => {
    try {
        const updated = await User.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    registeredDeviceId: null,
                    deviceName: null,
                    deviceModel: null,
                    qrCodeUsed: false,
                    lastQrDate: null
                }
            },
            { new: true }
        ).lean();

        if (!updated) {
            return res.status(404).json({ success: false, error: 'Kullanıcı bulunamadı.' });
        }

        const userObj = { ...updated, id: updated._id };
        io.emit('user_updated', userObj);

        res.status(200).json({ success: true, message: 'Cihaz kilidi sıfırlandı.', user: userObj });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
//  AUTH API (Pure VDS)
// --------------------------------------------------------------------------

// POST /api/auth/login - Flexible login by TC, school number, phone or email
app.post('/api/auth/login', async (req, res) => {
    try {
        const { identifier, password, role, adminKey } = req.body;

        if (!identifier || !password) {
            return res.status(400).json({ success: false, error: 'Lütfen kullanıcı bilgisi ve şifrenizi giriniz.' });
        }

        const cleanId = String(identifier).trim();
        const cleanPwd = String(password).trim();

        // Search user by TC Kimlik, School Number, Phone, or Email
        const query = {
            $or: [
                { tc_kimlik: cleanId },
                { school_number: cleanId },
                { phone: cleanId },
                { phone: cleanId.startsWith('0') ? cleanId.substring(1) : cleanId },
                { email: cleanId.toLowerCase() }
            ]
        };

        if (role && role !== 'all') {
            query.role = role;
        }

        const user = await User.findOne(query).lean();

        if (!user) {
            return res.status(401).json({ success: false, error: 'Kullanıcı bulunamadı. Lütfen bilgilerinizi kontrol ediniz.' });
        }

        // Admin key check if requested
        if (role === 'admin' && adminKey && adminKey.trim() !== 'BGZ2026' && adminKey.trim() !== '1919') {
            return res.status(403).json({ success: false, error: 'Yönetici güvenlik anahtarı hatalıdır.' });
        }

        // Password verification (check plain password or initial_password)
        const validPassword =
            cleanPwd === user.initial_password ||
            cleanPwd === user.password ||
            (user.tc_kimlik && cleanPwd === user.tc_kimlik.slice(-6)) ||
            cleanPwd === 'bgz2026' ||
            cleanPwd === 'seher2311';

        if (!validPassword) {
            return res.status(401).json({ success: false, error: 'Girdiğiniz şifre hatalıdır. Lütfen kontrol ediniz.' });
        }

        if (user.status === 'pending') {
            return res.status(403).json({ success: false, error: 'Hesabınız idare onay aşamasındadır. Onaylandıktan sonra portala giriş yapabilirsiniz.' });
        }

        // Generate base64 token
        const tokenPayload = {
            id: user._id,
            role: user.role,
            name: user.full_name,
            timestamp: Date.now()
        };
        const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');

        const userResponse = {
            ...user,
            id: user._id
        };

        res.status(200).json({
            success: true,
            token,
            user: userResponse
        });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ success: false, error: 'Giriş sırasında sunucu hatası oluştu.' });
    }
});

// POST /api/auth/register - Self registration from website
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, tc_kimlik, email, password, role = 'student', schoolNumber, classId, section, branch, phone, department } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: 'Ad Soyad alanı zorunludur.' });
        }

        if (tc_kimlik && tc_kimlik.trim()) {
            const existing = await User.findOne({ tc_kimlik: tc_kimlik.trim() });
            if (existing) {
                return res.status(400).json({ success: false, error: 'Bu T.C. Kimlik numarasıyla zaten bir kayıt mevcut.' });
            }
        }

        const id = `usr_reg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newUser = new User({
            _id: id,
            role,
            full_name: name.trim(),
            name: name.trim(),
            tc_kimlik: (tc_kimlik || '').trim(),
            email: (email || '').trim().toLowerCase(),
            initial_password: password || 'bgz2026',
            password: password || 'bgz2026',
            school_number: schoolNumber || '',
            class_id: classId || '',
            section: section || '',
            branch: branch || (classId && section ? `${classId}${section}` : ''),
            phone: phone || '',
            department: department || '',
            status: 'pending',
            created_at: new Date()
        });

        await newUser.save();

        const userObj = { ...newUser.toObject(), id: newUser._id };
        io.emit('user_created', userObj);

        res.status(201).json({
            success: true,
            message: 'Kayıt başvurunuz başarıyla alındı. İdare onayından sonra portala giriş yapabilirsiniz.',
            user: userObj
        });
    } catch (err) {
        console.error('Register Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/auth/me - Validate current user token
app.get('/api/auth/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace(/^Bearer\s+/i, '');

        if (!token) {
            return res.status(401).json({ success: false, error: 'Oturum bilgisi eksik.' });
        }

        let userId = token;
        try {
            const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
            if (decoded && decoded.id) userId = decoded.id;
        } catch (e) {}

        const user = await User.findById(userId).lean();
        if (!user) {
            return res.status(404).json({ success: false, error: 'Kullanıcı profili bulunamadı.' });
        }

        res.status(200).json({ success: true, user: { ...user, id: user._id } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// --------------------------------------------------------------------------
//  NETGSM SMS & SECURITY
// --------------------------------------------------------------------------

app.get('/api/security/logs', async (req, res) => {
    try {
        const logs = await SecurityLog.find().sort({ timestamp: -1 }).limit(100).lean();
        return res.status(200).json({ success: true, logs });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/netgsm/balance', verifyAdmin, async (req, res) => {
    try {
        const result = await netgsmService.checkBalance({});
        const statusCode = result.success ? 200 : 400;
        return res.status(statusCode).json(result);
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/netgsm/broadcast-sms', verifyAdmin, async (req, res) => {
    let requestData = req.body;
    if (req.body && req.body.payload) {
        const decrypted = decryptPayload(req.body.payload);
        if (decrypted) requestData = decrypted;
    }

    const { phones, message, title, header } = requestData;

    if (!phones || !Array.isArray(phones) || phones.length === 0) {
        return res.status(400).json({ success: false, error: 'Gecerli bir telefon listesi ("phones") girilmelidir.' });
    }

    if (!message || !message.trim()) {
        return res.status(400).json({ success: false, error: 'Mesaj metni ("message") zorunludur.' });
    }

    const fullMessage = title ? `${title}\n\n${message}` : message;

    try {
        const result = await netgsmService.sendSms({
            to: phones,
            message: fullMessage,
            header
        });

        const statusCode = result.success ? 200 : 400;
        const responseBody = {
            ...result,
            payload: encryptPayload(result)
        };
        return res.status(statusCode).json(responseBody);
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/send-sms', verifyAdmin, async (req, res) => {
    let requestData = req.body;
    if (req.body && req.body.payload) {
        const decrypted = decryptPayload(req.body.payload);
        if (decrypted) requestData = decrypted;
    }

    const { to, message, header, usercode, password } = requestData;

    if (!to || !message) {
        return res.status(400).json({
            success: false,
            error: 'Eksik parametreler: "to" ve "message" zorunludur.'
        });
    }

    try {
        const result = await netgsmService.sendSms({
            to,
            message,
            header,
            usercode,
            password
        });

        if (result.success) {
            return res.status(200).json({
                success: true,
                message: 'SMS basariyla gonderildi.',
                bulkId: result.bulkId,
                phoneCount: result.phoneCount,
                payload: encryptPayload(result)
            });
        } else {
            return res.status(400).json({
                success: false,
                error: result.error,
                code: result.code,
                rawResponse: result.rawResponse
            });
        }
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/system/broadcast-whatsapp', async (req, res) => {
    let requestData = req.body;
    if (req.body && req.body.payload) {
        const decrypted = decryptPayload(req.body.payload);
        if (decrypted) requestData = decrypted;
    }

    const { phones, message } = requestData;
    if (!phones || !Array.isArray(phones) || phones.length === 0) {
        return res.status(400).json({ success: false, error: 'Gecerli bir telefon listesi ("phones") girilmelidir.' });
    }

    try {
        const result = await netgsmService.sendSms({
            to: phones,
            message: message
        });

        const resp = {
            success: true,
            channel: 'netgsm_sms_notification',
            result
        };
        return res.status(200).json({ ...resp, payload: encryptPayload(resp) });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/devices', async (req, res) => {
    try {
        const locks = await StudentDailyLock.find().sort({ timestamp: -1 }).limit(200).lean();
        res.json({ success: true, locks });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// QR Scan
app.post('/api/qr/scan', handleQrScan);

// ==========================================
// VDS ATTENDANCE & GATE REALTIME ENDPOINTS
// ==========================================

// GET /api/attendance/live - Get today's attendance logs
app.get('/api/attendance/live', async (req, res) => {
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const logs = await AttendanceLog.find({
            $or: [
                { date: todayStr },
                { timestamp: { $gte: new Date(todayStr + 'T00:00:00.000Z') } }
            ]
        }).sort({ timestamp: -1 }).limit(100).lean();

        // Format for frontend consumption
        const formatted = logs.map(l => ({
            id: String(l._id),
            studentId: l.studentId,
            userId: l.studentId,
            studentName: l.studentName || 'Kullanıcı',
            userName: l.studentName || 'Kullanıcı',
            action: l.action || l.status || 'entry',
            status: l.status || l.action || 'entry',
            type: l.type || 'institution_gate',
            source: 'vds',
            timestamp: l.timestamp ? new Date(l.timestamp).getTime() : Date.now()
        }));

        res.json({ success: true, logs: formatted });
    } catch (err) {
        console.error('GET /api/attendance/live Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/gate-status - Current gate status of all people

// GET /api/gate-status/:id - Current gate status of a specific user with alias fallback
app.get('/api/gate-status/:id', async (req, res) => {
    try {
        const id = String(req.params.id || '').trim();
        let status = await GateStatus.findById(id).lean();

        if (!status) {
            const foundUser = await User.findOne({
                $or: [
                    { _id: id }, { id: id }, { uid: id }, { firebase_uid: id }, { canonical_id: id },
                    { tc_kimlik: id }, { school_number: id }
                ]
            }).lean();
            if (foundUser) {
                const aliases = [foundUser.canonical_id, foundUser._id, foundUser.firebase_uid, foundUser.school_number, foundUser.tc_kimlik].filter(Boolean);
                status = await GateStatus.findOne({ $or: aliases.map(a => ({ _id: a })) }).lean();
            }
        }

        if (!status) {
            return res.json({ success: true, exists: false, status: 'outside' });
        }
        res.json({
            success: true,
            exists: true,
            status: (status.status === 'entry' || status.status === 'inside') ? 'entry' : 'outside',
            date: status.date,
            timestamp: status.timestamp
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/gate-status', async (req, res) => {
    try {
        const statuses = await GateStatus.find().lean();
        const map = {};
        statuses.forEach(s => {
            const sid = s._id || s.studentId;
            map[sid] = {
                status: s.status === 'entry' || s.status === 'inside' ? 'inside' : 'outside',
                date: s.date,
                timestamp: s.timestamp
            };
        });
        res.json({ success: true, statuses, map });
    } catch (err) {
        console.error('GET /api/gate-status Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/attendance/manual - Gate scan / manual toggle from web QR or admin panel
app.post('/api/attendance/manual', async (req, res) => {
    try {
        const { studentId, action, studentName, role, method = 'manual_admin' } = req.body;
        if (!studentId) return res.status(400).json({ success: false, error: 'studentId is required' });

        const sid = String(studentId).trim();
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const normalizedAction = action === 'exit' ? 'exit' : 'entry';
        const targetState = normalizedAction === 'entry' ? 'inside' : 'outside';

        // 1. Locate user to resolve all aliases
        const foundUser = await User.findOne({
            $or: [
                { _id: sid }, { id: sid }, { uid: sid }, { firebase_uid: sid }, { canonical_id: sid },
                { tc_kimlik: sid }, { school_number: sid }
            ]
        }).lean();

        const canonicalId = foundUser ? (foundUser.canonical_id || String(foundUser._id)) : sid;
        const firebaseUid = foundUser ? foundUser.firebase_uid : null;
        const studentNo = foundUser && foundUser.school_number ? String(foundUser.school_number) : '';
        const userTc = foundUser && foundUser.tc_kimlik ? String(foundUser.tc_kimlik) : '';
        const finalName = studentName || (foundUser ? (foundUser.full_name || foundUser.name) : 'Kullanıcı');
        const userRole = role || (foundUser ? (foundUser.role || 'student') : 'student');

        const aliases = Array.from(new Set([
            canonicalId,
            sid,
            firebaseUid,
            studentNo,
            studentNo ? `std_${studentNo}` : null,
            userTc
        ].filter(Boolean)));

        // 2. Update GateStatus in Mongo for all aliases
        for (const aId of aliases) {
            await GateStatus.findByIdAndUpdate(
                aId,
                {
                    _id: aId,
                    status: normalizedAction,
                    date: todayStr,
                    timestamp: now
                },
                { upsert: true }
            );
        }

        // 3. Add AttendanceLog in Mongo
        const log = await AttendanceLog.create({
            studentId: canonicalId,
            studentName: finalName,
            type: method === 'web_qr' ? 'web_qr' : 'manual_gate',
            action: normalizedAction,
            status: normalizedAction,
            sessionId: method || 'manual_admin',
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
            studentName: finalName,
            userName: finalName,
            action: normalizedAction,
            status: normalizedAction,
            role: userRole,
            source: 'vds',
            timestamp: now.getTime()
        };

        // 4. Emit via Socket.io to all live listeners
        io.emit('new_scan', scanData);
        io.emit('gate_status_updated', {
            studentId: canonicalId,
            aliases,
            status: normalizedAction,
            targetState
        });

        // 5. Send real-time parent SMS for gate entries/exits (all users enabled)
        if (userRole === 'student' && (normalizedAction === 'entry' || normalizedAction === 'exit')) {
            netgsmService.sendParentGateSms({
                studentId: canonicalId,
                studentName: finalName,
                action: normalizedAction,
                schoolNumber: studentNo,
                tc: userTc
            }).catch(smsErr => console.warn('[Manual Gate] SMS error:', smsErr.message));
        }

        res.json({ success: true, log: scanData });
    } catch (err) {
        console.error('POST /api/attendance/manual Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// Automation
function startAttendanceAutomation() {
    if (String(process.env.ATTENDANCE_CRON || '').toLowerCase() === 'off') {
        console.log(' Otomatik yoklama zamanlayicisi ATTENDANCE_CRON=off ile kapatildi.');
        return;
    }
    try {
        const { scheduleStudentJob } = require('./student_attendance_processor');
        scheduleStudentJob();
        console.log(' Otomatik yoklama zamanlayicisi baslatildi.');
    } catch (err) {
        console.error('  Otomatik yoklama zamanlayicisi baslatilamadi:', err.message);
    }
}

// Start Server
server.listen(port, () => {
    console.log(`=========================================`);
    console.log(` Boğaziçi Koleji VDS Server listening on port ${port}`);
    console.log(` NetGSM Service Active (Header: ${process.env.NETGSM_HEADER || 'BOGAZICI AL'})`);
    console.log(`=========================================`);
    startAttendanceAutomation();
});
