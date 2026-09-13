import { io } from 'socket.io-client';
import { api } from './api';
import { VDS_BASE_URL, VDS_SOCKET_URL } from './vdsConfig';
import { normalizeUserRole } from './userRoles';

class VDSUserService {
  constructor() {
    let cached = [];
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('vds_cached_users');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length >= 50) {
            const hasHealthyNames = parsed.every(u => {
              const nm = u.full_name || u.fullName || u.fields?.full_name?.stringValue || '';
              return nm && !nm.startsWith('projects/');
            });
            if (hasHealthyNames) {
              cached = this.deduplicateUsers(parsed).map(u => this.wrapUser(u));
            }
          }
          if (cached.length === 0) {
            window.localStorage.removeItem('vds_cached_users');
          }
        }
      }
    } catch (e) {}

    this.users = cached;
    this.subscribers = new Set();
    this.isFetching = false;
    this.hasFetched = false;
    this.fetchPromise = null;
    this.initSocket();
  }

  /* GIZLI HESAPLAR hicbir ekranda gorunmez.
     Sunucu bunlari zaten listelemiyor; bu suzgec eski localStorage
     onbelleginden gelen kayitlari da temizler. */
  static GIZLI = ['ozelcorumbogazicikoleji@gmail.com'];

  gizliMi(u) {
    const eposta = String(u?.email || u?.eposta || u?.fields?.email?.stringValue || '').toLowerCase().trim();
    return VDSUserService.GIZLI.includes(eposta);
  }

  deduplicateUsers(rawUsers) {
    if (!Array.isArray(rawUsers) || rawUsers.length === 0) return [];
    rawUsers = rawUsers.filter((u) => !this.gizliMi(u));
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

      const fbUid = '';   // eski kayit kimligi; yeni veritabaninda yok
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
      const aliases = new Set([u._id, u.id, u.canonical_id].filter(Boolean));

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
      if (typeof window !== 'undefined' && window.localStorage && Array.isArray(this.users) && this.users.length >= 50) {
        window.localStorage.setItem('vds_cached_users', JSON.stringify(this.users));
      }
    } catch (e) {}
  }

  initSocket() {
    try {
      this.socket = io(VDS_SOCKET_URL || VDS_BASE_URL || window.location.origin, {
        reconnection: true,
        reconnectionAttempts: 15,
        reconnectionDelay: 2000
      });

      this.socket.on('connect', () => {
        console.log('[VDS Socket] Connected to real-time server');
      });

      // VDS PostgreSQL backend publishes table changes as
      // `kisiler:degisti` and also as the generic `veri_degisti` event.
      // The old Firebase-shaped user_created/user_updated events are not
      // emitted by the live backend, so user-facing screens otherwise stayed
      // stale until a full reload.
      let refreshTimer = null;
      const refreshUsers = () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          this.fetchAllUsers(true).catch((err) => {
            console.warn('[VDS Socket] Users refresh notice:', err?.message);
          });
        }, 120);
      };
      ['kisiler', 'personel', 'kisi_rolleri', 'kisi_telefonlari'].forEach((table) => {
        this.socket.on(`${table}:degisti`, refreshUsers);
      });
      this.socket.on('veri_degisti', (event) => {
        if (['kisiler', 'personel', 'kisi_rolleri', 'kisi_telefonlari'].includes(event?.tablo)) refreshUsers();
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

      this.socket.on('disconnect', () => clearTimeout(refreshTimer));
    } catch (e) {
      console.warn('[VDS Socket] Init notice:', e.message);
    }
  }

  wrapUser(u) {
    if (!u) return u;

    const id = String(u.id || u._id || u.canonical_id ||
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

    const role = normalizeUserRole(
      u.role ||
      (u.fields?.role?.stringValue) ||
      (u.school_number || u.fields?.school_number?.stringValue ? 'student' : '') ||
      'student'
    );

    const tc = (u.tc_kimlik || u.tcKimlik || u.tc || u.fields?.tc_kimlik?.stringValue || '').trim();
    const schoolNumber = (u.school_number || u.schoolNumber || u.fields?.school_number?.stringValue || '').trim();
    // api_users exposes teacher specialization as `subject`; student class is `branch`.
    const branch = (u.branch || u.subject || u.class_id || u.fields?.branch?.stringValue || u.fields?.subject?.stringValue || u.fields?.class_id?.stringValue || '').trim();
    const phone = (u.phone || u.student_phone || u.parent_phone || u.fields?.phone?.stringValue || '').trim();
    const additionalPhones = Array.from(new Set(
      (Array.isArray(u.additional_phones)
        ? u.additional_phones
        : Array.isArray(u.additionalPhones)
          ? u.additionalPhones
          : [u.additional_phone || u.fields?.additional_phone?.stringValue]
      ).map((value) => String(value || '').replace(/\D/g, '').slice(-10)).filter(Boolean)
    ));
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
    fields.additional_phone = { stringValue: additionalPhones[0] || '' };
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
    ].filter(Boolean)));

    return {
      ...u,
      id,
      _id: id,
      aliases,
      // Yol bicimli kimlik: ekranlar son parcayi alir (split('/').pop()).
      name: `kisi/${id}`,
      full_name: personName,
      fullName: personName,
      displayName: personName,
      role,
      tc_kimlik: tc,
      school_number: schoolNumber,
      branch,
      phone,
      additionalPhones,
      additional_phones: additionalPhones,
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
    if (this.hasFetched && !force && this.users && this.users.length >= 50) {
      return this.users;
    }
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.isFetching = true;
    this.fetchPromise = (async () => {
      let loaded = false;
      try {
        // api.get jetonu kendisi ekler; duz fetch 401 aliyordu.
        const data = await api.get('/api/users?limit=1000');
        if (data && Array.isArray(data.users) && data.users.length > 0) {
          const deduped = this.deduplicateUsers(data.users);
          this.users = deduped.map(u => this.wrapUser(u));
          this.hasFetched = true;
          this.saveToStorage();
          this.notify();
          loaded = true;
        }
      } catch (err) {
        console.warn('[VDSUserService] kullanici listesi alinamadi:', err?.message);
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
      const data = await api.put(`/api/users/${encodeURIComponent(cleanId)}`, updates);
      if (data.success && data.user) {
        const mapped = this.wrapUser(data.user);
        this.users = this.users.map(u => (u._id || u.id) === (mapped._id || mapped.id) ? mapped : u);
        this.saveToStorage();
        this.notify();
        // API cevabi anlik satiri gunceller; tam yeniden okuma roller dizisini,
        // filtre sayilarini ve diger acik ekranlari DB ile birebir esler.
        await this.fetchAllUsers(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[VDSUserService] Update Error:', err);
      return false;
    }
  }

  /**
   * Kalici silme. Sunucu kisiyi ve bagli satirlarini siler; hata varsa
   * sebebi (kendi hesabi, bagli veri...) ekrana ulassin diye firlatilir.
   */
  async deleteUser(id) {
    const cleanId = String(id).split('/').pop();
    try {
      await api.del(`/api/users/${encodeURIComponent(cleanId)}`);
    } catch (err) {
      console.error('[VDSUserService] Delete Error:', err?.durum, err?.govde || err?.message);
      const e = new Error(err?.govde?.error || err?.mesaj || err?.message || 'Kullanıcı silinemedi.');
      e.durum = err?.durum;
      throw e;
    }
    this.users = this.users.filter(u =>
      (u._id || u.id) !== cleanId && (!Array.isArray(u.aliases) || !u.aliases.includes(cleanId)));
    this.saveToStorage();
    this.notify();
    // Liste DB ile birebir esleşsin (veli bagi, roller vb. de gitmis olabilir).
    this.fetchAllUsers(true).catch(() => {});
    return true;
  }

  async resetDeviceLock(id) {
    try {
      const cleanId = String(id).split('/').pop();
      const data = await api.post(`/api/users/${encodeURIComponent(cleanId)}/reset-device`);
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

  /**
   * Yeni kayit. Hata YUTULMAZ: sunucunun dondugu gercek metin (TC/okul no
   * cakismasi, sinif bulunamadi, telefon bicimi...) ekrana tasinsin diye
   * firlatilir. Onceden her hata "VDS kaydi olusturulamadi" olarak gorunuyor,
   * sebebi anlasilamiyordu.
   */
  async createUser(userData) {
    let data;
    try {
      data = await api.post('/api/users', userData);
    } catch (err) {
      console.error('[VDSUserService] Create User Error:', err?.durum, err?.govde || err?.message);
      const e = new Error(err?.govde?.error || err?.mesaj || err?.message || 'VDS sunucusu kaydı kabul etmedi.');
      e.durum = err?.durum;
      e.govde = err?.govde;
      throw e;
    }
    if (!data?.success || !data?.user) {
      throw new Error(data?.error || 'VDS sunucusu kayıt döndürmedi.');
    }
    const mapped = this.wrapUser(data.user);
    this.users = this.deduplicateUsers([mapped, ...this.users]).map((u) => this.wrapUser(u));
    this.saveToStorage();
    this.notify();
    // Sunucu satiri (roller, sinif, veli bagi) tam okunsun; liste DB ile eslessin.
    this.fetchAllUsers(true).catch(() => {});
    return mapped;
  }
}

export const vdsUserService = new VDSUserService();
