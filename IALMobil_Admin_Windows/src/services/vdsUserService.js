import { io } from 'socket.io-client';

const VDS_BASE_URL = 'http://213.142.159.36:8080';

class VDSUserService {
  constructor() {
    let cached = [];
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('vds_cached_users');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) cached = this.deduplicateUsers(parsed).map(u => this.wrapUser(u));
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

      const name = (u.full_name || u.fullName || u.name || (u.fields?.full_name?.stringValue) || '').trim().toLowerCase();
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
        const combinedAliases = new Set([...(existing.aliases || []), ...aliases]);

        const merged = { ...u, ...existing };
        for (const [k, v] of Object.entries(u)) {
          if (v !== null && v !== undefined && v !== '' && (merged[k] === null || merged[k] === undefined || merged[k] === '')) {
            merged[k] = v;
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
    const id = u._id || u.id;
    const fields = {};
    for (const [k, v] of Object.entries(u)) {
      if (typeof v === 'string') fields[k] = { stringValue: v };
      else if (typeof v === 'number') fields[k] = { integerValue: String(v) };
      else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    }
    return {
      ...u,
      id,
      _id: id,
      aliases: u.aliases || [id],
      name: 'projects/bgz-mobil/databases/(default)/documents/users/' + id,
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
      try {
        const res = await fetch(`${VDS_BASE_URL}/api/users?limit=1000`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && Array.isArray(data.users) && data.users.length > 0) {
          const deduped = this.deduplicateUsers(data.users);
          this.users = deduped.map(u => this.wrapUser(u));
          this.hasFetched = true;
          this.saveToStorage();
          this.notify();
        }
      } catch (err) {
        console.error('[VDSUserService] Fetch Error:', err);
      } finally {
        this.isFetching = false;
        this.fetchPromise = null;
      }
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
