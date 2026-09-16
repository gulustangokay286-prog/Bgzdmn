/**
 * VDS API ISTEMCISI
 *
 * Tum ekranlar veriye buradan ulasir:
 *   api.get / post / put / del   -> REST
 *   api.dinle(kanal, geriCagir)  -> gercek zamanli
 *
 * Jeton bir kez saklanir ve her istege otomatik eklenir; ekranlar
 * yetkilendirmeyle ugrasmaz.
 */
import { VDS_BASE_URL, VDS_SOCKET_URL } from './vdsConfig';
import { io } from 'socket.io-client';

const JETON_ANAHTARI = 'bgz_jeton';
const KULLANICI_ANAHTARI = 'bgz_kullanici';

const depo = {
  al: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  yaz: (k, v) => { try { localStorage.setItem(k, v); } catch { /* depolama kapali */ } },
  sil: (k) => { try { localStorage.removeItem(k); } catch { /* depolama kapali */ } },
};

export const jetonAl      = () => depo.al(JETON_ANAHTARI);
export const kullaniciAl  = () => { try { return JSON.parse(depo.al(KULLANICI_ANAHTARI) || 'null'); } catch { return null; } };

/**
 * Oturum degisikligi aboneligi.
 * Cagrildigi anda mevcut durumu bir kez bildirir, sonra her giris/cikista
 * yeniden bildirir. App.jsx bunu dinleyerek giris ekranini acip kapatir.
 */
const oturumIzleyen = new Set();
const oturumBildir = () => {
  const k = kullaniciAl();
  oturumIzleyen.forEach((fn) => { try { fn(k); } catch { /* izleyici hatasi yutulur */ } });
};
export const oturumDinle = (fn) => {
  oturumIzleyen.add(fn);
  try { fn(kullaniciAl()); } catch { /* ilk bildirim hatasi yutulur */ }
  return () => oturumIzleyen.delete(fn);
};

export const oturumKapat  = () => {
  depo.sil(JETON_ANAHTARI); depo.sil(KULLANICI_ANAHTARI); soketiKapat(); oturumBildir();
};

/** HTTP 401 gelirse oturum dusmustur; dinleyiciler haberdar edilir. */
const oturumDustu = new Set();
export const oturumDusunce = (fn) => { oturumDustu.add(fn); return () => oturumDustu.delete(fn); };

/* ---------------------------------------------------- YUKLEME IZLEME --- */
/** Acik istek sayisi. Ekran gecislerinde iskelet (skeleton) gostermek icin;
    ekranlar kendi yukleme durumunu ayrica yonetmek zorunda kalmaz. */
let bekleyenIstek = 0;
const yuklemeIzleyen = new Set();
const yuklemeBildir = () => yuklemeIzleyen.forEach((fn) => { try { fn(bekleyenIstek); } catch { /* izleyici hatasi yutulur */ } });
export const yuklemeDinle = (fn) => { yuklemeIzleyen.add(fn); try { fn(bekleyenIstek); } catch { /* ilk bildirim */ } return () => yuklemeIzleyen.delete(fn); };
export const bekleyenIstekSayisi = () => bekleyenIstek;

async function istek(yol, secenekler = {}) {
  bekleyenIstek += 1; yuklemeBildir();
  try { return await istekGovde(yol, secenekler); }
  finally { bekleyenIstek = Math.max(0, bekleyenIstek - 1); yuklemeBildir(); }
}

async function istekGovde(yol, { yontem = 'GET', govde, jetonsuz = false } = {}) {
  const basliklar = { 'Content-Type': 'application/json' };
  const j = jetonAl();
  if (j && !jetonsuz) basliklar.Authorization = `Bearer ${j}`;

  const c = await fetch(VDS_BASE_URL + yol, {
    method: yontem,
    headers: basliklar,
    // Yönetim listeleri canlı VDS verisini göstermeli; tarayıcının 304
    // önbellek yanıtı yeni silinen/onaylanan kaydı ekranda tutmasın.
    cache: 'no-store',
    body: govde === undefined ? undefined : JSON.stringify(govde),
  });

  let veri = null;
  try { veri = await c.json(); } catch { /* govdesiz yanit */ }

  if (c.status === 401 && !jetonsuz) {
    oturumKapat();
    oturumDustu.forEach((fn) => { try { fn(); } catch { /* dinleyici hatasi yutulur */ } });
  }
  if (!c.ok) {
    // Kural gerecgi reddedilen gecislerde sunucu `mesaj`/`baslik` doner;
    // ekranlarin dogru metni gosterebilmesi icin hataya tasinir.
    const e = new Error(veri?.mesaj || veri?.error || `İstek başarısız (HTTP ${c.status})`);
    e.durum = c.status;
    e.govde = veri || null;
    e.kod = veri?.kod;
    e.mesaj = veri?.mesaj;
    e.baslik = veri?.baslik;
    throw e;
  }
  return veri;
}

export const api = {
  get:  (yol)        => istek(yol),
  post: (yol, govde) => istek(yol, { yontem: 'POST',   govde }),
  put:  (yol, govde) => istek(yol, { yontem: 'PUT',    govde }),
  del:  (yol)        => istek(yol, { yontem: 'DELETE' }),

  /** Giris. Kimlik: okul no, TC, telefon ya da e-posta. */
  async giris(kimlik, parola) {
    const d = await istek('/api/auth/login', { yontem: 'POST', govde: { kimlik, parola }, jetonsuz: true });
    depo.yaz(JETON_ANAHTARI, d.token);
    depo.yaz(KULLANICI_ANAHTARI, JSON.stringify(d.user));
    oturumBildir();
    return d.user;
  },

  /* ---- Parola sifirlama: iste -> dogrula -> tamamla ----------------------
     Uc de jetonsuzdur; kullanici zaten giris yapamadigi icin cagiriyor.     */
  sifirlamaIste:    (kimlik)             => istek('/api/auth/reset/iste',    { yontem: 'POST', govde: { kimlik }, jetonsuz: true }),
  sifirlamaDogrula: (kimlik, kod)        => istek('/api/auth/reset/dogrula', { yontem: 'POST', govde: { kimlik, kod }, jetonsuz: true }),
  sifirlamaTamamla: (kimlik, kod, yeniParola) =>
                                            istek('/api/auth/reset/tamamla', { yontem: 'POST', govde: { kimlik, kod, yeniParola }, jetonsuz: true }),
};

/* ------------------------------------------------------ GERCEK ZAMANLI --- */
let soket = null;
/** Soket nesnesi — cevrimici durumu ve "yaziyor" gibi anlik olaylar icin. */
export function soketAl() { return soketiAl(); }

function soketiAl() {
  if (soket) return soket;
  soket = io(VDS_SOCKET_URL, { path: '/socket.io', transports: ['websocket', 'polling'] });
  return soket;
}
export function soketiKapat() { try { soket?.close(); } catch { /* zaten kapali */ } soket = null; }

/**
 * Bir tablodaki degisiklikleri dinler.
 * Veritabanindaki her yazma LISTEN/NOTIFY ile buraya duser.
 *
 *   useEffect(() => api.dinle('gecisler', () => yenile()), []);
 *
 * Donen islev aboneligi kapatir.
 */
export function dinle(tablo, geriCagir) {
  const s = soketiAl();
  const kanal = `${tablo}:degisti`;
  s.on(kanal, geriCagir);
  return () => s.off(kanal, geriCagir);
}

api.dinle = dinle;
export default api;
