import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from './firebaseConfig';

export const sendWhatsAppNotification = async (userId, studentName, action, dateObj) => {
  try {
    const studentDocRef = await getDocs(query(collection(db, 'users'), where('uid', '==', userId), limit(1)));
    let studentData = {};
    if (!studentDocRef.empty) {
      studentData = studentDocRef.docs[0].data();
    } else {
      const studentDocById = await getDocs(query(collection(db, 'users'), where('__name__', '==', userId)));
      if (!studentDocById.empty) studentData = studentDocById.docs[0].data();
    }

    const schoolNumber = studentData.school_number || studentData.schoolNumber || '';
    let parentPhone = null;

    if (schoolNumber) {
      const parentQ1 = query(collection(db, 'users'), where('role', 'in', ['parent', 'veli']), where('child_school_number', '==', schoolNumber), limit(1));
      const snap1 = await getDocs(parentQ1);
      if (!snap1.empty) {
        const pd = snap1.docs[0].data();
        parentPhone = pd.phone || pd.phoneNumber || pd.phone_number;
      }
      if (!parentPhone) {
        const parentQ2 = query(collection(db, 'users'), where('role', 'in', ['parent', 'veli']), where('childSchoolNumber', '==', schoolNumber), limit(1));
        const snap2 = await getDocs(parentQ2);
        if (!snap2.empty) {
          const pd = snap2.docs[0].data();
          parentPhone = pd.phone || pd.phoneNumber || pd.phone_number;
        }
      }
    }

    if (!parentPhone) {
      const parentQ3 = query(collection(db, 'users'), where('role', 'in', ['parent', 'veli']), where('linked_student_ids', 'array-contains', userId), limit(1));
      const snap3 = await getDocs(parentQ3);
      if (!snap3.empty) {
        const pd = snap3.docs[0].data();
        parentPhone = pd.phone || pd.phoneNumber || pd.phone_number;
      }
      if (!parentPhone) {
        const parentQ4 = query(collection(db, 'users'), where('role', 'in', ['parent', 'veli']), where('linkedStudentIds', 'array-contains', userId), limit(1));
        const snap4 = await getDocs(parentQ4);
        if (!snap4.empty) {
          const pd = snap4.docs[0].data();
          parentPhone = pd.phone || pd.phoneNumber || pd.phone_number;
        }
      }
    }

    if (!parentPhone) {
      console.log('[WHATSAPP] Veli telefonu bulunamadığı için mesaj gönderilemedi.');
      return;
    }

    const timeStr = dateObj.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const dateStr = dateObj.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    
    const actionLabel = action === 'entry' ? 'Giriş' : 'Çıkış';
    const statusEmoji = action === 'entry' ? 'Kurumda' : 'Ayrıldı';

    const message = `🏛 *Kurum Bilgilendirme Sistemi*\n\nSayın Velimiz,\nÖğrencimiz *${studentName}* bugün saat *${timeStr}* itibarıyla kuruma *${actionLabel}* yapmıştır.\n\n📍 Durum: ${statusEmoji}\n📅 Tarih: ${dateStr}\n\nİyi günler dileriz.`;

    // Get the JWT Token
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

    const response = await fetch('https://bgzklj.onrender.com/api/system/broadcast-whatsapp', {
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
      const jsonRes = await response.json();
      const decRes = jsonRes.payload ? await cryptoService.decryptPayload(jsonRes.payload) : jsonRes;
      console.log(`[WHATSAPP] Öğrenci ${studentName} için veliye ${actionLabel} mesajı gönderildi (${parentPhone}).`, decRes);
    }
  } catch (error) {
    console.error('[WHATSAPP ERROR] Veliye mesaj gönderilemedi:', error);
  }
};
