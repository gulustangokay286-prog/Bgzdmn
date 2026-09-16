import { modul, ayar } from './veri';

const RAW_KEY_POOL = [
  'QVEuQWI4Uk42TDlkQmEwMDdobG1LdzJKVndHY1dKZHp4ancyU25ydUxCS3RBaGR5WXV2MkE=',
  'QVEuQWI4Uk42SUxUd3pyOXRzUjJCWU1OQW0tNUJjOHNfUlVZN2pPT3BaNFhPM1VrZEJNLVE=',
  'QVEuQWI4Uk42STdHNWVBUmpTZW1rYTVLSXRMSjBzSWNyeHVlMUZ6TUluY1hpdThaTHhDQnc=',
  'QVEuQWI4Uk42SzFJbGE3VzVWblVPZmpNSGJqVkh0YnBNVnU3cWItQnhYWlQxdzhsUk1qbGc=',
  'QVEuQWI4Uk42THJ3UF9lUFd2dXBwM1ItNUZuMUlMSTZRdzkxanFSd3A2Ukx0LUhXM28xdlE=',
  'QVEuQWI4Uk42S1ZrLU5UdS1JS2RfVy1Mck85a2N1Z2hfYWtZdFNFLTdvMUV6SXBuS0pmeXc='
];

const EMBEDDED_KEYS = RAW_KEY_POOL.map(k => {
  try {
    return typeof atob === 'function' ? atob(k) : Buffer.from(k, 'base64').toString('utf-8');
  } catch (e) {
    return k;
  }
});

let apiAnahtarlari = [];
let currentKeyIndex = 0;
let isSubscribed = false;

function subscribeToKeys() {
  if (isSubscribed) return;
  isSubscribed = true;
  try {
    ayar.dinle('gemini_config', (data) => {
      if (Array.isArray(data?.keys) && data.keys.length > 0) {
        apiAnahtarlari = data.keys.map((k) => String(k).trim()).filter(Boolean);
      }
    });
  } catch (e) {
    console.warn("[Gemini AI] Realtime keys subscription notice:", e);
  }
}

async function getRealtimeApiKeys() {
  subscribeToKeys();

  if (apiAnahtarlari.length > 0) {
    return apiAnahtarlari;
  }

  try {
    const data = await ayar.al('gemini_config');
    if (data) {
      if (Array.isArray(data.keys) && data.keys.length > 0) {
        apiAnahtarlari = data.keys.map((k) => String(k).trim()).filter(Boolean);
        return apiAnahtarlari;
      }
    }
  } catch (err) {
    console.warn("[Gemini AI] Anahtar okunamadi:", err.message);
  }

  const envKeysStr = import.meta.env.VITE_GEMINI_API_KEYS;
  if (envKeysStr) {
    const envList = envKeysStr.split(',').map(k => k.trim()).filter(Boolean);
    if (envList.length > 0) return envList;
  }

  return EMBEDDED_KEYS;
}

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const aiService = {
  async generateContent(prompt, preferredModel = 'gemini-2.5-flash') {
    const keys = await getRealtimeApiKeys();

    if (!keys || keys.length === 0) {
      console.error("[Gemini AI] Kullanılabilir API anahtarı bulunamadı.");
      return "⚠️ Kullanılabilir Gemini API anahtarı bulunamadı. Lütfen daha sonra tekrar deneyin.";
    }

    let contextStr = "Sen Boğaziçi Koleji için geliştirilmiş 'Nova AI' adında bir eğitim yönetimi yapay zeka asistanısın. Türkçe cevap ver. Her türlü soruya detaylı ve gerçek cevap ver.\n\n";
    try {
      const siniflar = await modul('classes').listele();
      const classNames = siniflar.map((c) => c.ad || c.name).filter(Boolean).sort().join(', ');
      const usersData = await modul('users').listele({ limit: 1000 });
      // VDS rol adlari Turkce; eski Ingilizce adlar da taninir.
      const rol = (u) => String(u.role || '').toLowerCase();
      const studentCount = usersData.filter((u) => ['ogrenci', 'student'].includes(rol(u))).length;
      const teacherCount = usersData.filter((u) => ['ogretmen', 'teacher'].includes(rol(u))).length;
      contextStr += `Sınıflar: ${classNames || 'Yok'}, Öğrenci: ${studentCount}, Öğretmen: ${teacherCount}\n`;
    } catch (e) {
      console.log("AI context error:", e);
    }

    const fullPrompt = `${contextStr}\n\nKULLANICI:\n${prompt}`;
    const bodyPayload = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: { temperature: 0.1 }
    });

    const totalKeys = keys.length;
    const startIndex = currentKeyIndex % totalKeys;
    const candidateModels = [preferredModel, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'].filter((v, i, a) => a.indexOf(v) === i);

    for (let attempts = 0; attempts < totalKeys; attempts++) {
      const keyIndex = (startIndex + attempts) % totalKeys;
      const key = keys[keyIndex];

      for (const m of candidateModels) {
        try {
          const res = await fetch(`${API_BASE}/${m}:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: bodyPayload
          });

          if (res.ok) {
            const d = await res.json();
            const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              currentKeyIndex = keyIndex;
              return text;
            }
          }

          if (res.status === 429 || res.status === 403) {
            console.warn(`[Gemini AI] Key #${keyIndex + 1} (${m}) kotası/erişimi kısıtlı (${res.status}), denenmeye devam ediliyor...`);
            break;
          }
        } catch (err) {
          console.error(`[Gemini AI] Key #${keyIndex + 1} (${m}) ağ hatası:`, err.message);
        }
      }
    }

    return "⚠️ Tüm API anahtarlarının kotası geçici olarak dolmuş. Lütfen 1 dakika bekleyip tekrar deneyin (kotalar her dakika otomatik yenilenmektedir).";
  }
};
