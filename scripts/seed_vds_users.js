const fs = require('fs');
const mongoose = require('mongoose');
const path = require('path');

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ial_db';

const userSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    role: String,
    tc_kimlik: String,
    full_name: String,
    email: String,
    phone: String,
    status: String,
    class_id: String,
    branch: String,
    school_number: String,
    deviceName: String,
    deviceModel: String,
    registeredDeviceId: String,
    profile_image: String,
    assigned_classes: [String],
    qrCodeUsed: Boolean,
    last_login: Date,
    created_at: Date
}, { strict: false });

const User = mongoose.model('User', userSchema);

async function seed() {
    try {
        console.log('Connecting to MongoDB at:', mongoUri);
        await mongoose.connect(mongoUri);
        console.log(' Connected to MongoDB');

        const jsonPath = path.join(__dirname, 'vds_users.json');
        const rawData = fs.readFileSync(jsonPath, 'utf8');
        const users = JSON.parse(rawData);

        console.log(`Loaded ${users.length} users from vds_users.json`);

        console.log('Clearing old users collection...');
        await User.deleteMany({});

        console.log('Inserting new clean users...');
        const result = await User.insertMany(users);
        console.log(` Inserted ${result.length} users successfully!`);

        // Create indexes
        await User.collection.createIndex({ school_number: 1 }, { sparse: true });
        await User.collection.createIndex({ tc_kimlik: 1 }, { sparse: true });
        await User.collection.createIndex({ role: 1 });
        await User.collection.createIndex({ email: 1 }, { sparse: true });
        await User.collection.createIndex({ phone: 1 }, { sparse: true });
        console.log(' Indexes created.');

        // Verification counts
        const counts = await User.aggregate([
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);

        console.log('=== VERIFIED COUNTS IN MONGO ===');
        for (const c of counts) {
            console.log(`  ${String(c._id).toUpperCase()}: ${c.count}`);
        }

        const enginCount = await User.countDocuments({
            $or: [
                { full_name: /engin/i },
                { email: /kantemir/i },
                { email: /enginkantemir/i }
            ]
        });
        console.log('Engin Kantemir in DB:', enginCount === 0 ? 'PURGED (0 found)' : `WARNING: ${enginCount} found`);

        const emptyTcParents = await User.countDocuments({ role: 'parent', tc_kimlik: '' });
        console.log('Parents with empty TC:', emptyTcParents);

        await mongoose.disconnect();
        console.log('Done!');
        process.exit(0);
    } catch (err) {
        console.error('Seed Error:', err);
        process.exit(1);
    }
}

seed();
