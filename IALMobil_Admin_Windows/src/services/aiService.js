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

const SISTEM_METNI =
  "Sen Boğaziçi Koleji için geliştirilmiş 'Nova AI' adında bir eğitim yönetimi yapay zeka asistanısın. " +
  "Türkçe cevap ver. Her türlü soruya detaylı ve gerçek cevap ver.\n\n";

/**
 * KURUM BAGLAMI — onbellekli.
 *
 * Bu metin her istekte sinif listesini ve 1000 kullaniciyi yeniden cekiyordu;
 * yanitin gec gelmesinin baslica sebebi buydu. Veri gun icinde nadiren
 * degistigi icin 5 dakika onbellekte tutulur ve ilk istekten sonra
 * cevap beklemeden tazelenir.
 */
let baglamMetni = null;
let baglamZamani = 0;
const BAGLAM_OMRU = 5 * 60 * 1000;

async function baglamUret() {
  try {
    const [siniflar, usersData] = await Promise.all([
      modul('classes').listele(),
      modul('users').listele({ limit: 1000 }),
    ]);
    const classNames = siniflar.map((c) => c.ad || c.name).filter(Boolean).sort().join(', ');
    // VDS rol adlari Turkce; eski Ingilizce adlar da taninir.
    const rol = (u) => String(u.role || '').toLowerCase();
    const studentCount = usersData.filter((u) => ['ogrenci', 'student'].includes(rol(u))).length;
    const teacherCount = usersData.filter((u) => ['ogretmen', 'teacher'].includes(rol(u))).length;
    baglamMetni = `Sınıflar: ${classNames || 'Yok'}, Öğrenci: ${studentCount}, Öğretmen: ${teacherCount}\n`;
    baglamZamani = Date.now();
  } catch (e) {
    console.log('AI context error:', e);
    baglamMetni = baglamMetni || '';
    baglamZamani = Date.now();
  }
  return baglamMetni;
}

async function baglamAl() {
  const taze = baglamMetni !== null && Date.now() - baglamZamani < BAGLAM_OMRU;
  if (taze) return baglamMetni;
  if (baglamMetni !== null) {
    // Bayat ama var: bekletmeden kullan, arka planda tazele.
    baglamUret();
    return baglamMetni;
  }
  return baglamUret();
}

export const aiService = {
  async generateContent(prompt, preferredModel = 'gemini-2.5-flash') {
    const keys = await getRealtimeApiKeys();

    if (!keys || keys.length === 0) {
      console.error("[Gemini AI] Kullanılabilir API anahtarı bulunamadı.");
      return "⚠️ Kullanılabilir Gemini API anahtarı bulunamadı. Lütfen daha sonra tekrar deneyin.";
    }

    const contextStr = SISTEM_METNI + (await baglamAl());

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
  },

  /**
   * AKISLI YANIT + GERCEK DUSUNCE
   *
   * `streamGenerateContent` ile parcalar geldikce iletilir; kullanici tam
   * yaniti beklemez. `includeThoughts` acik oldugundan model kendi dusunce
   * ozetini de gonderir — bunlar `thought: true` isaretli parcalardir ve
   * arayuzde ayri gosterilir.
   *
   * @param {string} prompt
   * @param {{onDusunce?:(metin:string)=>void, onMetin?:(metin:string)=>void}} olaylar
   * @returns {Promise<{metin:string, dusunce:string}>}
   */
  async streamContent(prompt, { onDusunce, onMetin } = {}, preferredModel = 'gemini-2.5-flash') {
    const keys = await getRealtimeApiKeys();
    if (!keys || keys.length === 0) {
      throw new Error('Kullanılabilir Gemini API anahtarı bulunamadı.');
    }

    const contextStr = SISTEM_METNI + (await baglamAl());
    const bodyPayload = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${contextStr}\n\nKULLANICI:\n${prompt}` }] }],
      generationConfig: {
        temperature: 0.1,
        thinkingConfig: { includeThoughts: true },
      },
    });

    const totalKeys = keys.length;
    const startIndex = currentKeyIndex % totalKeys;
    const candidateModels = [preferredModel, 'gemini-2.5-flash', 'gemini-2.0-flash']
      .filter((v, i, a) => a.indexOf(v) === i);

    for (let attempts = 0; attempts < totalKeys; attempts++) {
      const keyIndex = (startIndex + attempts) % totalKeys;
      const key = keys[keyIndex];

      for (const m of candidateModels) {
        let res;
        try {
          res = await fetch(`${API_BASE}/${m}:streamGenerateContent?alt=sse&key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: bodyPayload,
          });
        } catch (err) {
          console.error(`[Gemini AI] Key #${keyIndex + 1} (${m}) ağ hatası:`, err.message);
          continue;
        }

        if (!res.ok || !res.body) {
          if (res.status === 429 || res.status === 403) break;   // bu anahtar kisitli
          continue;                                              // model desteklemiyor olabilir
        }

        const okuyucu = res.body.getReader();
        const cozucu = new TextDecoder();
        let tampon = '';
        let metin = '';
        let dusunce = '';

        while (true) {
          const { value, done } = await okuyucu.read();
          if (done) break;
          tampon += cozucu.decode(value, { stream: true });

          // SSE: olaylar bos satirla ayrilir, veri satirlari "data: " ile baslar.
          let kesme;
          while ((kesme = tampon.indexOf('\n')) >= 0) {
            const satir = tampon.slice(0, kesme).trim();
            tampon = tampon.slice(kesme + 1);
            if (!satir.startsWith('data:')) continue;

            const govde = satir.slice(5).trim();
            if (!govde || govde === '[DONE]') continue;

            let paket;
            try { paket = JSON.parse(govde); } catch { continue; }

            const parcalar = paket.candidates?.[0]?.content?.parts || [];
            for (const p of parcalar) {
              if (!p.text) continue;
              if (p.thought) {
                dusunce += p.text;
                onDusunce?.(dusunce);
              } else {
                metin += p.text;
                onMetin?.(metin);
              }
            }
          }
        }

        if (metin || dusunce) {
          currentKeyIndex = keyIndex;
          return { metin, dusunce };
        }
      }
    }

    throw new Error('Tüm API anahtarlarının kotası geçici olarak dolmuş. Lütfen 1 dakika bekleyip tekrar deneyin.');
  },
};
