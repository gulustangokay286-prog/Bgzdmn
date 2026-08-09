import { db } from './firebaseConfig';
import { collection, getDocs, query, limit, orderBy } from 'firebase/firestore';

export const aiService = {
  async generateContent(prompt, model = 'gemini-3.1-flash-lite') {
    const { getAuth } = await import('firebase/auth');
    const { cryptoService } = await import('./cryptoService');
    const auth = getAuth();
    if (!auth.currentUser) {
      throw new Error("Lütfen giriş yapınız.");
    }
    const rawIdToken = await auth.currentUser.getIdToken();
    const idToken = await cryptoService.encryptToken(rawIdToken);

    let contextStr = "=== SİSTEM BİLGİSİ VE OKUL VERİTABANI ÖZETİ ===\nSen Boğaziçi Koleji için geliştirilmiş 'Nova AI' adında bir eğitim yönetimi yapay zeka asistanısın. Kullanıcıya her zaman profesyonel, analitik ve çözüm odaklı yaklaş.\n\n[ANLIK VERİTABANI BİLGİLERİ]\n";
    try {
      // Sınıflar
      const classesSnap = await getDocs(query(collection(db, 'classes'), orderBy('name', 'asc'), limit(50)));
      const classNames = classesSnap.docs.map(d => d.data().name).join(', ');
      
      // Kullanıcılar
      const usersSnap = await getDocs(query(collection(db, 'users'), limit(50)));
      const usersData = usersSnap.docs.map(d => d.data());
      const studentCount = usersData.filter(u => u.role === 'student' || u.role === 'öğrenci').length;
      const teacherCount = usersData.filter(u => u.role === 'teacher' || u.role === 'öğretmen').length;
      const parentCount = usersData.filter(u => u.role === 'parent' || u.role === 'veli').length;

      contextStr += `- Sistemdeki Sınıflar: ${classNames || 'Yok'}\n`;
      contextStr += `- Aktif Öğrenci Sayısı: ${studentCount}\n`;
      contextStr += `- Aktif Öğretmen Sayısı: ${teacherCount}\n`;
      contextStr += `- Aktif Veli Sayısı: ${parentCount}\n\n`;
      contextStr += "Kullanıcının sorusuna en mantıklı, kısa ve okul yönetimine uygun cevabı ver.";
    } catch (e) {
      console.log("Error fetching AI context:", e);
    }

    try {
      const rawBody = {
        prompt: prompt,
        systemInstruction: contextStr
      };
      const encryptedPayload = await cryptoService.encryptPayload(rawBody);

      const response = await fetch(`https://bgzklj.onrender.com/api/ai/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ payload: encryptedPayload })
      });

      if (!response.ok) {
        throw new Error(`AI API failed: ${response.status}`);
      }

      const rawJson = await response.json();
      const data = rawJson.payload ? await cryptoService.decryptPayload(rawJson.payload) : rawJson;

      if (data && data.text) {
        return data.text;
      }
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || data?.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Yanıt alınamadı.";
    } catch (e) {
      console.error("AI Proxy Error:", e);
      throw new Error("Nova AI sunucusuna ulaşılamıyor.");
    }
  }
};
