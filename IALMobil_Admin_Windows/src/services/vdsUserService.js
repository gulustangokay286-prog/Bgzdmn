import { io } from 'socket.io-client';
import { db, mapSdkToRest } from './firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';

const VDS_BASE_URL = 'http://213.142.159.36:8080';

class VDSUserService {
  constructor() {
    let cached = [];
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('vds_cached_users');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const hasHealthyNames = parsed.every(u => {
              const nm = u.full_name || u.fullName || u.fields?.full_name?.stringValue || '';
              return nm && !nm.startsWith('projects/');
            });
            if (hasHealthyNames) {
              cached = this.deduplicateUsers(parsed).map(u => this.wrapUser(u));
            } else {
              window.localStorage.removeItem('vds_cached_users');
            }
          }
        }
      }
    } catch (e) {}

    this.users = cached;
    this.subscribers = new Set();
    this.isFetching = false;
    this.hasFetched = this.users.length > 0;
    this.fetchPromise = null;
    this.initSocket();
  }

  deduplicateUsers(rawUsers) {
    if (!Array.isArray(rawUsers) || rawUsers.length === 0) return [];
    const mergedMap = new Map();

    const getKey = (u) => {
      const tc = (u.tc_kimlik || u.tcKimlik || u.tc || (u.fields?.tc_kimlik?.stringValue) || '').trim();
      if (tc && tc.length >= 10) return `tc:${tc}`;

      const schoolNo = (u.school_number || u.schoolNumber || (u.fields?.school_number?.stringValue) || '').trim();
      const role = (u.role || (u.fields?.role?.stringValue) || '').toLowerCase();
      if (schoolNo && (role === 'student' || role === 'öğrenci' || role === 'ogrenci')) {
        return `school:${schoolNo}`;
      }

      const canon = (u.canonical_id || (u.fields?.canonical_id?.stringValue) || '').trim();
      if (canon) return `canon:${canon}`;

      const fbUid = (u.firebase_uid || (u.fields?.firebase_uid?.stringValue) || '').trim();
      if (fbUid) return `fb:${fbUid}`;

      const email = (u.email || (u.fields?.email?.stringValue) || '').trim().toLowerCase();
      if (email && email.includes('@')) return `email:${email}`;

      const name = (
        u.full_name ||
        u.fullName ||
        u.displayName ||
        (typeof u.name === 'string' && !u.name.startsWith('projects/') ? u.name : '') ||
        u.fields?.full_name?.stringValue ||
        u.fields?.fullName?.stringValue ||
        u.fields?.displayName?.stringValue ||
        (u.fields?.name?.stringValue && !u.fields.name.stringValue.startsWith('projects/') ? u.fields.name.stringValue : '') ||
        ''
      ).trim().toLowerCase();
      return `name_role:${name}:${role}`;
    };

    rawUsers.forEach(u => {
      if (!u) return;
      const key = getKey(u);
      const aliases = new Set([u._id, u.id, u.canonical_id, u.firebase_uid].filter(Boolean));

      if (!mergedMap.has(key)) {
        mergedMap.set(key, { ...u, aliases: [...aliases] });
      } else {
        const existing = mergedMap.get(key);
        const combinedAliases = new Set([...(existing.aliases || []), ...(u.aliases || []), ...aliases]);

        const merged = { ...u, ...existing };
        for (const [k, v] of Object.entries(u)) {
          if (v !== null && v !== undefined && v !== '' && (merged[k] === null || merged[k] === undefined || merged[k] === '')) {
            merged[k] = v;
          }
        }
        if (u.fields && typeof u.fields === 'object') {
          merged.fields = { ...(merged.fields || {}) };
          for (const [fk, fv] of Object.entries(u.fields)) {
            if (!merged.fields[fk]) merged.fields[fk] = fv;
          }
        }
        merged.aliases = [...combinedAliases];
        mergedMap.set(key, merged);
      }
    });

    return [...mergedMap.values()];
  }

  saveToStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage && Array.isArray(this.users) && this.users.length > 0) {
        window.localStorage.setItem('vds_cached_users', JSON.stringify(this.users));
      }
    } catch (e) {}
  }

  initSocket() {
    try {
      this.socket = io(VDS_BASE_URL, {
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 2000
      });

      this.socket.on('connect', () => {
        console.log('[VDS Socket] Connected to real-time server');
      });

      this.socket.on('user_created', (newUser) => {
        console.log('[VDS Socket] User created:', newUser._id || newUser.id);
        const mapped = this.wrapUser(newUser);
        const all = this.deduplicateUsers([mapped, ...this.users]);
        this.users = all.map(u => this.wrapUser(u));
        this.saveToStorage();
        this.notify();
      });

      this.socket.on('user_updated', (updatedUser) => {
        console.log('[VDS Socket] User updated:', updatedUser._id || updatedUser.id);
        const mapped = this.wrapUser(updatedUser);
        const replaced = this.users.map(u => {
          const isMatch = (u._id || u.id) === (mapped._id || mapped.id) ||
            (Array.isArray(u.aliases) && u.aliases.includes(mapped._id || mapped.id));
          return isMatch ? mapped : u;
        });
        const all = this.deduplicateUsers(replaced);
        this.users = all.map(u => this.wrapUser(u));
        this.saveToStorage();
        this.notify();
      });

      this.socket.on('user_deleted', (payload) => {
        const id = payload._id || payload.id;
        console.log('[VDS Socket] User deleted:', id);
        this.users = this.users.filter(u => (u._id || u.id) !== id && (!Array.isArray(u.aliases) || !u.aliases.includes(id)));
        this.saveToStorage();
        this.notify();
      });
    } catch (e) {
      console.warn('[VDS Socket] Init notice:', e.message);
    }
  }

  wrapUser(u) {
    if (!u) return u;

    const id = String(u.id || u._id || u.canonical_id || u.firebase_uid ||
      (typeof u.name === 'string' && u.name.startsWith('projects/') ? u.name.split('/').pop() : '') ||
      '').trim();

    const personName = (
      u.full_name ||
      u.fullName ||
      u.displayName ||
      (typeof u.name === 'string' && !u.name.startsWith('projects/') ? u.name : '') ||
      (u.fields?.full_name?.stringValue) ||
      (u.fields?.fullName?.stringValue) ||
      (u.fields?.displayName?.stringValue) ||
      (u.fields?.name?.stringValue && !u.fields.name.stringValue.startsWith('projects/') ? u.fields.name.stringValue : '') ||
      (u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : '') ||
      ''
    ).trim();

    const role = (
      u.role ||
      (u.fields?.role?.stringValue) ||
      (u.school_number || u.fields?.school_number?.stringValue ? 'student' : '') ||
      'student'
    ).toLowerCase().trim();

    const tc = (u.tc_kimlik || u.tcKimlik || u.tc || u.fields?.tc_kimlik?.stringValue || '').trim();
    const schoolNumber = (u.school_number || u.schoolNumber || u.fields?.school_number?.stringValue || '').trim();
    const branch = (u.branch || u.class_id || u.fields?.branch?.stringValue || u.fields?.class_id?.stringValue || '').trim();
    const phone = (u.phone || u.student_phone || u.parent_phone || u.fields?.phone?.stringValue || '').trim();
    const email = (u.email || u.fields?.email?.stringValue || '').trim().toLowerCase();
    const status = (u.status || u.fields?.status?.stringValue || 'approved').trim();

    const fields = { ...(u.fields || {}) };

    if (personName) {
      fields.full_name = { stringValue: personName };
      fields.fullName = { stringValue: personName };
      fields.displayName = { stringValue: personName };
      if (!fields.name || (fields.name.stringValue && fields.name.stringValue.startsWith('projects/'))) {
        fields.name = { stringValue: personName };
      }
    }
    if (role) fields.role = { stringValue: role };
    if (tc) fields.tc_kimlik = { stringValue: tc };
    if (schoolNumber) fields.school_number = { stringValue: schoolNumber };
    if (branch) fields.branch = { stringValue: branch };
    if (phone) fields.phone = { stringValue: phone };
    if (email) fields.email = { stringValue: email };
    if (status) fields.status = { stringValue: status };

    for (const [k, v] of Object.entries(u)) {
      if (k === 'fields' || k === 'name' || k === 'aliases' || k === '_pools' || k === '_legacyIds') continue;
      if (!fields[k] && v !== null && v !== undefined && v !== '') {
        if (typeof v === 'string') fields[k] = { stringValue: v };
        else if (typeof v === 'number') fields[k] = { integerValue: String(v) };
        else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
      }
    }

    const aliases = Array.from(new Set([
      ...(Array.isArray(u.aliases) ? u.aliases : []),
      id,
      u._id,
      u.id,
      u.canonical_id,
      u.firebase_uid
    ].filter(Boolean)));

    return {
      ...u,
      id,
      _id: id,
      aliases,
      name: `projects/bgz-mobil/databases/(default)/documents/users/${id}`,
      full_name: personName,
      fullName: personName,
      displayName: personName,
      role,
      tc_kimlik: tc,
      school_number: schoolNumber,
      branch,
      phone,
      email,
      status,
      fields
    };
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    if (this.users.length > 0) {
      callback(this.users);
    }
    // Fetch users in background if not already fetching
    this.fetchAllUsers();
    return () => {
      this.subscribers.delete(callback);
    };
  }

  notify() {
    for (const sub of this.subscribers) {
      try {
        sub(this.users);
      } catch (e) {
        console.error('Subscriber callback error:', e);
      }
    }
  }

  async fetchAllUsers(force = false) {
    if (this.hasFetched && !force && this.users.length > 0) {
      return this.users;
    }
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.isFetching = true;
    this.fetchPromise = (async () => {
      let loaded = false;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${VDS_BASE_URL}/api/users?limit=1000`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.users) && data.users.length > 0) {
            const deduped = this.deduplicateUsers(data.users);
            this.users = deduped.map(u => this.wrapUser(u));
            this.hasFetched = true;
            this.saveToStorage();
            this.notify();
            loaded = true;
          }
        }
      } catch (err) {
        console.warn('[VDSUserService] VDS fetch notice (falling back to Firestore):', err.message);
      }

      // VDS yanıt vermediyse veya web mixed-content engeli varsa anında Firestore yedeğine geç
      if (!loaded && (!this.users || this.users.length === 0 || force)) {
        try {
          const snap = await getDocs(collection(db, 'users'));
          if (!snap.empty) {
            const fbUsers = snap.docs.map(docSnap => mapSdkToRest(docSnap));
            const deduped = this.deduplicateUsers(fbUsers);
            this.users = deduped.map(u => this.wrapUser(u));
            this.hasFetched = true;
            this.saveToStorage();
            this.notify();
            loaded = true;
          }
        } catch (fsErr) {
          console.error('[VDSUserService] Firestore Fallback Error:', fsErr);
        }
      }

      this.isFetching = false;
      this.fetchPromise = null;
      return this.users;
    })();

    return this.fetchPromise;
  }

  async updateUser(id, updates) {
    try {
      const cleanId = String(id).split('/').pop();
      const res = await fetch(`${VDS_BASE_URL}/api/users/${encodeURIComponent(cleanId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && data.user) {
        const mapped = this.wrapUser(data.user);
        this.users = this.users.map(u => (u._id || u.id) === (mapped._id || mapped.id) ? mapped : u);
        this.notify();
        return true;
      }
      return false;
    } catch (err) {
      console.error('[VDSUserService] Update Error:', err);
      return false;
    }
  }

  async deleteUser(id) {
    try {
      const cleanId = String(id).split('/').pop();
      const res = await fetch(`${VDS_BASE_URL}/api/users/${encodeURIComponent(cleanId)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.users = this.users.filter(u => (u._id || u.id) !== cleanId);
      this.notify();
      return true;
    } catch (err) {
      console.error('[VDSUserService] Delete Error:', err);
      return false;
    }
  }

  async resetDeviceLock(id) {
    try {
      const cleanId = String(id).split('/').pop();
      const res = await fetch(`${VDS_BASE_URL}/api/users/${encodeURIComponent(cleanId)}/reset-device`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && data.user) {
        const mapped = this.wrapUser(data.user);
        this.users = this.users.map(u => (u._id || u.id) === (mapped._id || mapped.id) ? mapped : u);
        this.notify();
        return true;
      }
      return false;
    } catch (err) {
      console.error('[VDSUserService] Reset Device Error:', err);
      return false;
    }
  }

  async createUser(userData) {
    try {
      const res = await fetch(`${VDS_BASE_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && data.user) {
        const mapped = this.wrapUser(data.user);
        this.users = [mapped, ...this.users];
        this.notify();
        return mapped;
      }
      return null;
    } catch (err) {
      console.error('[VDSUserService] Create User Error:', err);
      return null;
    }
  }
}

export const vdsUserService = new VDSUserService();
