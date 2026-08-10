import { db } from './firebaseConfig';
import { collection, getDocs, query, limit, orderBy, doc, getDoc } from 'firebase/firestore';

// ── Round-Robin API Key Havuzu ──
const envKeys = import.meta.env.VITE_GEMINI_API_KEYS;
const API_KEYS = envKeys ? envKeys.split(',') : [];

let currentKeyIndex = 0;

function getNextKey() {
  const key = API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  return key;
}

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const aiService = {
  async generateContent(prompt, model = 'gemini-3.1-flash-lite') {
    // Build context
    let contextStr = "Sen Boğaziçi Koleji için geliştirilmiş 'Nova AI' adında bir eğitim yönetimi yapay zeka asistanısın. Türkçe cevap ver. Her türlü soruya detaylı ve gerçek cevap ver.\n\n";
    try {
      const classesSnap = await getDocs(query(collection(db, 'classes'), orderBy('name', 'asc'), limit(50)));
      const classNames = classesSnap.docs.map(d => d.data().name).join(', ');
      const usersSnap = await getDocs(query(collection(db, 'users'), limit(50)));
      const usersData = usersSnap.docs.map(d => d.data());
      const studentCount = usersData.filter(u => u.role === 'student' || u.role === 'öğrenci').length;
      const teacherCount = usersData.filter(u => u.role === 'teacher' || u.role === 'öğretmen').length;
      contextStr += `Sınıflar: ${classNames || 'Yok'}, Öğrenci: ${studentCount}, Öğretmen: ${teacherCount}\n`;
    } catch (e) {
      console.log("AI context error:", e);
    }

    const fullPrompt = `${contextStr}\n\nKULLANICI:\n${prompt}`;
    const bodyPayload = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: { temperature: 0.1 }
    });

    // 6 key'i sırayla dene — biri 429 dönerse sonrakine geç
    const startIndex = currentKeyIndex;
    for (let i = 0; i < API_KEYS.length; i++) {
      const key = getNextKey();
      try {
        const res = await fetch(`${API_BASE}/${model}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyPayload
        });

        if (res.ok) {
          const d = await res.json();
          const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) return text;
        }

        // 429 = kota aşıldı → sonraki key'e geç
        if (res.status === 429) {
          console.warn(`Key #${((startIndex + i) % API_KEYS.length) + 1} kota aşıldı, sonraki key deneniyor...`);
          continue;
        }

        // Başka hata → logla ve sonraki key'e geç
        const errBody = await res.text();
        console.error(`Key #${((startIndex + i) % API_KEYS.length) + 1} hata (${res.status}):`, errBody);
      } catch (err) {
        console.error(`Key #${((startIndex + i) % API_KEYS.length) + 1} ağ hatası:`, err.message);
      }
    }

    // Tüm key'ler tükendiyse hata mesajı
    return "⚠️ Tüm API anahtarlarının kotası dolmuş. Lütfen biraz bekleyip tekrar deneyin (kotalar genellikle 1 dakika içinde yenilenir).";
  }
};
