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
        methods: ["GET", "POST"]
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

// Import services & middlewares
const { db } = require('./services/firebaseApp');
const { collection, getDocs, query, orderBy, limit } = require('firebase/firestore');
const { decryptPayload, encryptPayload } = require('./cryptoUtil');
const { verifyAuth, verifyAdmin } = require('./authMiddleware');
const netgsmService = require('./services/netgsmService');
const { handleQrScan } = require('./qrController');

// --------------------------------------------------------------------------
//  API ROUTES
// --------------------------------------------------------------------------

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'IAL Backend & NetGSM Server is running',
        timestamp: new Date()
    });
});

// Real-time Security / Cheat Logs endpoint
app.get('/api/security/logs', async (req, res) => {
    try {
        const snap = await getDocs(query(collection(db, 'security_logs'), orderBy('timestamp', 'desc'), limit(100)));
        const logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        return res.status(200).json({ success: true, logs });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

// NetGSM Balance Check
app.get('/api/netgsm/balance', verifyAdmin, async (req, res) => {
    try {
        const result = await netgsmService.checkBalance({}, db);
        const statusCode = result.success ? 200 : 400;
        return res.status(statusCode).json(result);
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// NetGSM Broadcast SMS
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
            header,
            db
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

// NetGSM Single/Bulk Send SMS
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
            password,
            db
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

// WhatsApp / Parent Notification Gateway (Replaces Render)
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
        // Send SMS via NetGSM as robust high-deliverability notification channel
        const result = await netgsmService.sendSms({
            to: phones,
            message: message,
            db
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

// Devices endpoint
app.get('/api/devices', async (req, res) => {
    try {
        res.json({ success: true, locks: [] });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

// QR Scan
app.post('/api/qr/scan', handleQrScan);

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
    console.log(` IAL Backend Server listening on port ${port}`);
    console.log(` NetGSM Service Active (Header: ${process.env.NETGSM_HEADER || 'CRM.BGZ.A.L'})`);
    console.log(`=========================================`);
    startAttendanceAutomation();
});
