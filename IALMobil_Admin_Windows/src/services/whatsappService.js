import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from './firebaseConfig';

/** Telefonu 10 haneli yerel biçime indirger (5XXXXXXXXX). */
export const normalizeParentPhone = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  const trimmed = digits.startsWith('90') ? digits.slice(2) : digits;
  const local = trimmed.startsWith('0') ? trimmed.slice(1) : trimmed;
  return local.length === 10 && local.startsWith('5') ? local : '';
};

/** Öğrenci belgesini uid veya doküman kimliğiyle bulur. */
export const fetchStudentDoc = async (userId) => {
  const byUid = await getDocs(query(collection(db, 'users'), where('uid', '==', userId), limit(1)));
  if (!byUid.empty) return { id: byUid.docs[0].id, data: byUid.docs[0].data() };

  const byId = await getDocs(query(collection(db, 'users'), where('__name__', '==', userId)));
  if (!byId.empty) return { id: byId.docs[0].id, data: byId.docs[0].data() };

  return { id: userId, data: {} };
};

/**
 * Veli telefonunu çözer.
 *
 * Sıra önemlidir: önce öğrencinin kendi kaydındaki veli numarası (kayıt
 * formunda girilen ya da turnikede sorulup kaydedilen), sonra sisteme veli
 * olarak kayıtlı kullanıcı. Önceden yalnızca ikinci yol vardı; velisi kayıtlı
 * olmayan öğrenciler için hiç bildirim gitmiyordu.
 *
 * @returns {Promise<{phone: string, source: string}>}
 */
export const resolveParentPhone = async (userId, studentData = null) => {
  const data = studentData || (await fetchStudentDoc(userId)).data;

  const own = normalizeParentPhone(
    data.parent_phone || data.parentPhone || data.veli_telefon || data.veliTelefon
  );
  if (own) return { phone: own, source: 'student_record' };

  const schoolNumber = data.school_number || data.schoolNumber || '';
  const pick = (d) => normalizeParentPhone(d.phone || d.phoneNumber || d.phone_number);

  const lookups = [];
  if (schoolNumber) {
    lookups.push(['child_school_number', '==', schoolNumber]);
    lookups.push(['childSchoolNumber', '==', schoolNumber]);
  }
  lookups.push(['linked_student_ids', 'array-contains', userId]);
  lookups.push(['linkedStudentIds', 'array-contains', userId]);

  for (const [field, op, value] of lookups) {
    try {
      const snap = await getDocs(query(
        collection(db, 'users'),
        where('role', 'in', ['parent', 'veli']),
        where(field, op, value),
        limit(1)
      ));
      if (!snap.empty) {
        const phone = pick(snap.docs[0].data());
        if (phone) return { phone, source: `parent_user:${field}` };
      }
    } catch (err) {
      console.warn(`[VELİ] ${field} sorgusu başarısız:`, err?.message);
    }
  }

  return { phone: '', source: 'none' };
};

export const sendWhatsAppNotification = async (userId, studentName, action, dateObj) => {
  try {
    const { data: studentData } = await fetchStudentDoc(userId);
    const { phone: parentPhone } = await resolveParentPhone(userId, studentData);

    if (!parentPhone) {
      console.log('[WHATSAPP] Veli telefonu bulunamadığı için mesaj gönderilemedi.');
      return;
    }

    const trHours = String(dateObj.getHours()).padStart(2, '0');
    const trMinutes = String(dateObj.getMinutes()).padStart(2, '0');
    const timeStr = `${trHours}:${trMinutes}`;

    const actionText = action === 'entry' ? 'kurum girişini' : 'kurum çıkışını';

    const parts = String(studentName).trim().split(/\s+/);
    const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : (parts[0] || '');

    const message = `Sayın Velimiz,\n\n${firstName} saat ${timeStr} itibarıyla ${actionText} yapmıştır.\n\nBoğaziçi Koleji`;

    const { getAuth } = await import('firebase/auth');
    const { cryptoService } = await import('./cryptoService');
    const auth = getAuth();
    if (!auth.currentUser) {
      throw new Error("Lütfen giriş yapınız.");
    }
    const rawIdToken = await auth.currentUser.getIdToken();
    const idToken = await cryptoService.encryptToken(rawIdToken);

    const rawBody = {
      phones: [parentPhone],
      message: message
    };
    const encryptedPayload = await cryptoService.encryptPayload(rawBody);

    const response = await fetch('http://213.142.159.36:8080/api/system/broadcast-whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ payload: encryptedPayload })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[WHATSAPP] Failed to send message:', errText);
    } else {
      const text = await response.text().catch(() => '');
      let decRes;
      try {
        const parsed = JSON.parse(text);
        decRes = parsed && parsed.payload ? await cryptoService.decryptPayload(parsed.payload) : parsed;
      } catch {
        decRes = text ? await cryptoService.decryptPayload(text.trim()) : null;
      }
      console.log(`[WHATSAPP] ${studentName} velisine ${actionText} bildirimi gönderildi (${parentPhone}).`, decRes);
    }
  } catch (error) {
    console.error('[WHATSAPP ERROR] Veliye mesaj gönderilemedi:', error);
  }
};
