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
          if (Array.isArray(parsed) && parsed.length > 0) cached = parsed;
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
        const exists = this.users.some(u => (u._id || u.id) === (mapped._id || mapped.id));
        if (!exists) {
          this.users = [mapped, ...this.users];
          this.saveToStorage();
          this.notify();
        }
      });

      this.socket.on('user_updated', (updatedUser) => {
        console.log('[VDS Socket] User updated:', updatedUser._id || updatedUser.id);
        const mapped = this.wrapUser(updatedUser);
        this.users = this.users.map(u => (u._id || u.id) === (mapped._id || mapped.id) ? mapped : u);
        this.saveToStorage();
        this.notify();
      });

      this.socket.on('user_deleted', (payload) => {
        const id = payload._id || payload.id;
        console.log('[VDS Socket] User deleted:', id);
        this.users = this.users.filter(u => (u._id || u.id) !== id);
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
          this.users = data.users.map(u => this.wrapUser(u));
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
