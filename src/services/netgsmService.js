import { db } from './firebaseConfig';
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { cryptoService } from './cryptoService';

// VDS Backend Bağlantısı
const BACKEND_URL = 'http://213.142.159.36:8080';

export function calculateSmsParts(text = '') {
  const len = text.length;
  if (len === 0) {
    return { length: 0, smsCount: 0, remainingInCurrent: 160, isTurkish: false };
  }

  let smsCount = 1;
  let remainingInCurrent = 160;

  if (len <= 160) {
    smsCount = 1;
    remainingInCurrent = 160 - len;
  } else {
    smsCount = Math.ceil(len / 153);
    const maxCapacity = smsCount * 153;
    remainingInCurrent = maxCapacity - len;
  }

  const turkishChars = /[çğışöüÇĞİŞÖÜ]/;
  const isTurkish = turkishChars.test(text);

  return {
    length: len,
    smsCount,
    remainingInCurrent,
    isTurkish
  };
}

export function formatPhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('0090') && cleaned.length >= 14) cleaned = cleaned.substring(4);
  else if (cleaned.startsWith('90') && cleaned.length === 12) cleaned = cleaned.substring(2);
  else if (cleaned.startsWith('0') && cleaned.length === 11) cleaned = cleaned.substring(1);

  if (cleaned.length === 10) return cleaned;
  return null;
}

export const netgsmService = {
  async getConfig() {
    const envUsercode = import.meta.env.VITE_NETGSM_USERCODE || '8503047089';
    const envPassword = import.meta.env.VITE_NETGSM_PASSWORD || 'ET77M17F';
    const envHeader = import.meta.env.VITE_NETGSM_HEADER || 'CRM.BGZ.A.L';

    try {
      const netgsmDoc = await getDoc(doc(db, 'config', 'netgsm'));
      if (netgsmDoc.exists()) {
        const data = netgsmDoc.data();
        return {
          usercode: data.usercode || envUsercode,
          password: data.password || envPassword,
          header: data.header || envHeader,
          autoGateSms: data.autoGateSms !== undefined ? data.autoGateSms : true,
          ...data
        };
      }

      const genDoc = await getDoc(doc(db, 'system_settings', 'general'));
      if (genDoc.exists()) {
        const data = genDoc.data();
        return {
          usercode: data.netgsmUsercode || envUsercode,
          password: data.netgsmPassword || envPassword,
          header: data.netgsmHeader || envHeader,
          autoGateSms: data.autoGateSms !== undefined ? data.autoGateSms : true
        };
      }
    } catch (err) {}
    return {
      usercode: envUsercode,
      password: envPassword,
      header: envHeader,
      autoGateSms: true
    };
  },

  async saveConfig(configData) {
    const payload = {
      usercode: (configData.usercode || '').trim(),
      password: (configData.password || '').trim(),
      header: (configData.header || 'CRM.BGZ.A.L').trim().toUpperCase(),
      autoGateSms: configData.autoGateSms !== undefined ? configData.autoGateSms : true,
      updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, 'config', 'netgsm'), payload, { merge: true });
    await setDoc(doc(db, 'system_settings', 'general'), {
      netgsmUsercode: payload.usercode,
      netgsmPassword: payload.password,
      netgsmHeader: payload.header,
      autoGateSms: payload.autoGateSms
    }, { merge: true });

    return true;
  },

  async getBalance() {
    try {
      const auth = getAuth();
      let authHeader = '';
      if (auth.currentUser) {
        const rawIdToken = await auth.currentUser.getIdToken();
        const idToken = await cryptoService.encryptToken(rawIdToken);
        authHeader = `Bearer ${idToken}`;
      }

      const res = await fetch(`${BACKEND_URL}/api/netgsm/balance`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { 'Authorization': authHeader } : {})
        }
      });

      const text = await res.text().catch(() => '');
      if (!text) {
        return { success: false, error: `Sunucu boş yanıt döndü (HTTP ${res.status}).` };
      }

      // sendSms ile ayni cozumleme: duz JSON / { payload } / ciplak sifreli govde
      let body;
      try {
        const parsed = JSON.parse(text);
        body = parsed && parsed.payload ? await cryptoService.decryptPayload(parsed.payload) : parsed;
      } catch {
        body = await cryptoService.decryptPayload(text.trim());
      }
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = { rawResponse: body }; }
      }
      if (!body || typeof body !== 'object') body = {};

      if (!res.ok) {
        return { success: false, error: body.error || body.rawResponse || `HTTP ${res.status}` };
      }

      return body;
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  async sendSms({ phones, message, title = '' }) {
    if (!phones || phones.length === 0) {
      throw new Error('En az bir alıcı telefon numarası gereklidir.');
    }
    if (!message || !message.trim()) {
      throw new Error('Mesaj metni boş olamaz.');
    }

    const validPhones = (Array.isArray(phones) ? phones : [phones])
      .map(formatPhoneNumber)
      .filter(Boolean);

    if (validPhones.length === 0) {
      throw new Error('Geçerli bir telefon numarası bulunamadı.');
    }

    const auth = getAuth();
    let authHeader = '';
    if (auth.currentUser) {
      const rawIdToken = await auth.currentUser.getIdToken();
      const idToken = await cryptoService.encryptToken(rawIdToken);
      authHeader = `Bearer ${idToken}`;
    }

    const rawBody = {
      phones: validPhones,
      message,
      title
    };

    const encryptedPayload = await cryptoService.encryptPayload(rawBody);

    const response = await fetch(`${BACKEND_URL}/api/netgsm/broadcast-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { 'Authorization': authHeader } : {})
      },
      body: JSON.stringify({ payload: encryptedPayload })
    });

    const responseText = await response.text().catch(() => '');

    if (!responseText) {
      throw new Error('Sunucudan geçerli bir yanıt alınamadı.');
    }

    /**
     * Yanit uc bicimde gelebilir:
     *   1) duz JSON                      -> dogrudan kullanilir
     *   2) { payload: "<base64>" }       -> payload cozulur
     *   3) ciplak "<base64>" metni       -> govdenin kendisi cozulur
     * Ucuncu durum atlandigi icin basarili gonderimler "dogrulanmadi"
     * goruntusu veriyordu.
     */
    let decRes = null;
    try {
      const parsed = JSON.parse(responseText);
      decRes = parsed && parsed.payload
        ? await cryptoService.decryptPayload(parsed.payload)
        : parsed;
    } catch {
      decRes = await cryptoService.decryptPayload(responseText.trim());
    }

    if (typeof decRes === 'string') {
      try { decRes = JSON.parse(decRes); } catch { decRes = { rawResponse: decRes }; }
    }
    if (!decRes || typeof decRes !== 'object') decRes = {};

    // Backend `res.status(result.success ? 200 : 400)` doner; yani HTTP 200
    // basarinin kendisidir. Govde acikca `success:false` demedikce 200'e guvenilir.
    // NetGSM kodlari (00/01/02) ve ham yanit yalnizca ek dogrulama icin bakilir.
    const explicitFailure = decRes.success === false;
    const netgsmCodeOk = ['00', '01', '02'].includes(String(decRes.code ?? '').trim());
    const rawOk = decRes.rawResponse && /^0[012]\b/.test(String(decRes.rawResponse).trim());

    // Kesin basari kaniti: govde acikca basari diyorsa ya da NetGSM toplu is
    // kimligi/kodu donduyse. `bulkId` gercek gonderimde her zaman gelir.
    const confirmed = decRes.success === true || Boolean(decRes.bulkId) || netgsmCodeOk || Boolean(rawOk);

    // Kanit yoksa ama sunucu 200 dondurduyse gonderim engellenmez; kayit
    // 'unknown' olarak isaretlenir ki gercek durum gozden kacmasin.
    const isSuccess = confirmed || (response.ok && !explicitFailure);
    const logStatus = confirmed ? 'delivered' : (isSuccess ? 'unknown' : 'failed');

    try {
      await addDoc(collection(db, 'sms_logs'), {
        type: 'broadcast_sms',
        title: title || 'Toplu SMS',
        message: title ? `${title}\n\n${message}` : message,
        recipientCount: validPhones.length,
        phones: validPhones,
        status: logStatus,
        bulkId: decRes.bulkId || null,
        error: confirmed ? null : (decRes.error || decRes.message || null),
        httpStatus: response.status,
        sender: localStorage.getItem('adminName') || auth.currentUser?.displayName || 'Sistem Yöneticisi',
        timestamp: serverTimestamp()
      });
    } catch (logErr) {}

    // NetGSM basarisiz doner ama backend 200 dondurebilir; HTTP durumuna degil
    // yanitin kendisine bakilir.
    if (!isSuccess) {
      throw new Error(
        decRes.error ||
        decRes.message ||
        decRes.rawResponse ||
        `SMS gönderilemedi (sunucu ${response.status} döndü).`
      );
    }

    return { ...decRes, success: true };
  },

  async getRecipientsByRole(roleKey = 'all_parents') {
    const usersRef = collection(db, 'users');
    let q;

    if (roleKey === 'all_parents') {
      q = query(usersRef, where('role', 'in', ['parent', 'veli']));
    } else if (roleKey === 'all_students') {
      q = query(usersRef, where('role', 'in', ['student', 'öğrenci']));
    } else if (roleKey === 'all_teachers') {
      q = query(usersRef, where('role', 'in', ['teacher', 'öğretmen', 'ogretmen']));
    } else if (roleKey === 'all_personnel') {
      q = query(usersRef, where('role', 'in', ['personnel', 'personel', 'staff']));
    } else {
      q = query(usersRef);
    }

    const snap = await getDocs(q);
    const recipients = [];

    snap.forEach(docSnap => {
      const data = docSnap.data();
      const phone = data.phone || data.phoneNumber || data.phone_number || data.veli_telefon || data.parent_phone;
      const name = data.name || data.fullName || data.full_name || 'İsimsiz';
      const formatted = formatPhoneNumber(phone);
      if (formatted) {
        recipients.push({
          id: docSnap.id,
          name,
          phone: formatted,
          rawPhone: phone,
          role: data.role || 'Kullanıcı'
        });
      }
    });

    const unique = [];
    const seen = new Set();
    for (const r of recipients) {
      if (!seen.has(r.phone)) {
        seen.add(r.phone);
        unique.push(r);
      }
    }

    return unique;
  }
};
