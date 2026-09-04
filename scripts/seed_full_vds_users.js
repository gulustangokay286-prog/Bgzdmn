const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ial_db';

const userSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    firebase_uid: { type: String, index: true },
    canonical_id: { type: String, index: true },
    role: { type: String, index: true },
    tc_kimlik: { type: String, index: true },
    full_name: String,
    name: String,
    email: String,
    phone: String,
    student_phone: String,
    parent_name: String,
    parent_phone: String,
    mother_phone: String,
    father_phone: String,
    status: String,
    class_id: String,
    branch: String,
    school_number: { type: String, index: true },
    department: String,
    profile_image: String,
    profileImageUrl: String,
    created_at: Date
}, { strict: false });

const User = mongoose.models.User || mongoose.model('User', userSchema);

async function syncAllUsers() {
    console.log('Connecting to MongoDB:', mongoUri);
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');

    const rawUsersPath = fs.existsSync(path.join(__dirname, 'raw_users.json')) ?
        path.join(__dirname, 'raw_users.json') :
        path.join(__dirname, '..', 'ial-vds', 'veri', 'users.json');
    const vdsUsersPath = path.join(__dirname, 'vds_users.json');

    const rawUsers = fs.existsSync(rawUsersPath) ? JSON.parse(fs.readFileSync(rawUsersPath, 'utf8')) : [];
    const vdsUsers = fs.existsSync(vdsUsersPath) ? JSON.parse(fs.readFileSync(vdsUsersPath, 'utf8')) : [];

    console.log(`Loaded ${rawUsers.length} raw users and ${vdsUsers.length} vds users.`);

    // Map raw users by school_number, tc_kimlik, and full_name
    const rawBySchoolNo = {};
    const rawByTc = {};
    const rawByName = {};

    for (const u of rawUsers) {
        if (u.school_number) rawBySchoolNo[String(u.school_number).trim()] = u;
        if (u.tc_kimlik) rawByTc[String(u.tc_kimlik).trim()] = u;
        const normName = (u.full_name || u.name || '').toLowerCase().trim();
        if (normName) rawByName[normName] = u;
    }

    let upsertCount = 0;

    // 1. Insert/Update VDS users (with canonical std_, tch_, prs_ IDs)
    for (const v of vdsUsers) {
        const schoolNo = v.school_number ? String(v.school_number).trim() : '';
        const tc = v.tc_kimlik ? String(v.tc_kimlik).trim() : '';
        const normName = (v.full_name || v.name || '').toLowerCase().trim();

        const match = (schoolNo && rawBySchoolNo[schoolNo]) || (tc && rawByTc[tc]) || (normName && rawByName[normName]);
        const firebaseUid = match ? match._id : null;

        const doc = {
            ...v,
            _id: v._id,
            canonical_id: v._id,
            firebase_uid: firebaseUid,
            tc_kimlik: tc || (match ? match.tc_kimlik : ''),
            school_number: schoolNo || (match ? match.school_number : ''),
            parent_phone: (v._id === 'std_613' || schoolNo === '613') ? '5301601879' : (v.parent_phone || (match ? (match.parent_phone || match.mother_phone || match.father_phone) : '')),
            student_phone: (v._id === 'std_613' || schoolNo === '613') ? '5301601879' : (v.student_phone || (match ? match.student_phone : '')),
            profile_image: v.profile_image || (match ? (match.profile_image || match.profileImageUrl) : ''),
            name: v.full_name || v.name || (match ? (match.full_name || match.name) : ''),
            full_name: v.full_name || v.name || (match ? (match.full_name || match.name) : '')
        };

        await User.findByIdAndUpdate(v._id, doc, { upsert: true });
        upsertCount++;

        // 2. Also insert an alias document for the Firebase UID so direct ID lookups by Firebase UID succeed instantly!
        if (firebaseUid && firebaseUid !== v._id) {
            await User.findByIdAndUpdate(firebaseUid, {
                ...doc,
                _id: firebaseUid,
                id: firebaseUid,
                canonical_id: v._id,
                firebase_uid: firebaseUid
            }, { upsert: true });
            upsertCount++;
        }
    }

    // 3. Insert any remaining raw users (staff, admins, parents, etc.)
    for (const r of rawUsers) {
        const rawId = r._id;
        const existing = await User.findById(rawId);
        if (!existing) {
            const role = (r.role || 'student').toLowerCase();
            const schoolNo = r.school_number ? String(r.school_number).trim() : '';
            const canonical = schoolNo ? `std_${schoolNo}` : rawId;

            await User.findByIdAndUpdate(rawId, {
                ...r,
                _id: rawId,
                id: rawId,
                canonical_id: canonical,
                firebase_uid: rawId,
                name: r.full_name || r.name,
                full_name: r.full_name || r.name,
                role: role === 'admin' ? 'admin' : role
            }, { upsert: true });
            upsertCount++;
        }
    }

    console.log(`Successfully synced ${upsertCount} total user records/aliases in MongoDB.`);

    // Check counts
    const counts = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);
    console.log('Role counts:', counts);

    // Verify Gökay
    const gokay = await User.find({ $or: [{ school_number: '613' }, { _id: 'std_613' }, { name: /GÖKAY/i }] });
    console.log('Gökay records in Mongo:', gokay.length);

    // Verify Merve
    const merve = await User.find({ $or: [{ tc_kimlik: '21775689948' }, { name: /Merve/i }] });
    console.log('Merve records in Mongo:', merve.length);

    await mongoose.disconnect();
}

if (require.main === module) {
    syncAllUsers().catch(err => {
        console.error('Sync error:', err);
        process.exit(1);
    });
}

module.exports = { syncAllUsers };
