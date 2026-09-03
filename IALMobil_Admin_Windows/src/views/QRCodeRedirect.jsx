"use client";
import React, { useEffect, useState, useRef } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc, limit } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { processStudentScan, subscribeLateApprovalStatus, loadAttendanceConfig } from '../services/attendanceService';
import { resolveParentPhone, normalizeParentPhone } from '../services/whatsappService';
import { getDateKeyInTimeZone, buildLateApprovalId, ATTENDANCE_ROLES, isStaffRole } from '../services/attendanceRules';
import fpPromise from '@fingerprintjs/fingerprintjs';
import { detectIncognito as detectIncognitoLib } from 'detectincognitojs';

const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const p1 = lat1 * Math.PI/180;
  const p2 = lat2 * Math.PI/180;
  const dp = (lat2-lat1) * Math.PI/180;
  const dl = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dp/2) * Math.sin(dp/2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const sha256 = async (str) => {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const getCanvasFingerprint = () => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.font = '11pt "Times New Roman"';
    ctx.fillText('BGZ Güvenlik Mührü 🔒', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.font = '18pt Arial';
    ctx.fillText('BGZ Güvenlik Mührü 🔒', 4, 45);

    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgb(255,0,255)';
    ctx.beginPath();
    ctx.arc(50, 50, 50, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgb(0,255,255)';
    ctx.beginPath();
    ctx.arc(100, 50, 50, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fill();
    
    return canvas.toDataURL();
  } catch {
    return 'canvas_error';
  }
};

const getWebGLRenderer = () => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'no_webgl';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return 'no_debug_info';
    return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) + '|' + gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
  } catch {
    return 'webgl_error';
  }
};

const getAudioFingerprint = () => {
  return new Promise((resolve) => {
    try {
      const AudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!AudioContext) { resolve('no_audio'); return; }
      
      const context = new AudioContext(1, 5000, 44100);
      const oscillator = context.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.value = 10000;
      
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -50;
      compressor.knee.value = 40;
      compressor.ratio.value = 12;
      compressor.attack.value = 0;
      compressor.release.value = 0.25;
      
      oscillator.connect(compressor);
      compressor.connect(context.destination);
      oscillator.start(0);
      
      context.startRendering().then(buffer => {
        const data = buffer.getChannelData(0);
        let sum = 0;
        for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i]);
        resolve(sum.toString());
      }).catch(() => resolve('audio_render_error'));
      
      setTimeout(() => resolve('audio_timeout'), 1000);
    } catch {
      resolve('audio_error');
    }
  });
};

const getScreenConfig = () => {
  return `${screen.width}x${screen.height}|${window.devicePixelRatio}|${screen.colorDepth}|${screen.pixelDepth}`;
};

const getSystemConfig = () => {
  return `${Intl.DateTimeFormat().resolvedOptions().timeZone}|${navigator.language}|${navigator.platform}|${navigator.hardwareConcurrency || 'x'}|${navigator.maxTouchPoints || 0}`;
};

const getFontFingerprint = () => {
  const baseFonts = ['monospace', 'sans-serif', 'serif'];
  const testFonts = [
    'Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia',
    'Impact', 'Lucida Console', 'Palatino Linotype', 'Tahoma', 'Times New Roman',
    'Trebuchet MS', 'Verdana', 'Helvetica', 'Gill Sans', 'Futura'
  ];
  
  const testString = 'mmmmmmmmmmlli';
  const testSize = '72px';
  const span = document.createElement('span');
  span.style.position = 'absolute';
  span.style.left = '-9999px';
  span.style.fontSize = testSize;
  span.textContent = testString;
  document.body.appendChild(span);
  
  const baseSizes = {};
  for (const base of baseFonts) {
    span.style.fontFamily = base;
    baseSizes[base] = span.offsetWidth + ',' + span.offsetHeight;
  }
  
  const detected = [];
  for (const font of testFonts) {
    for (const base of baseFonts) {
      span.style.fontFamily = `"${font}", ${base}`;
      if (span.offsetWidth + ',' + span.offsetHeight !== baseSizes[base]) {
        detected.push(font);
        break;
      }
    }
  }
  
  document.body.removeChild(span);
  return detected.join(',');
};

const generateCompositeDeviceId = async (fpVisitorId, clientIp) => {
  const [audioFp] = await Promise.all([getAudioFingerprint()]);
  
  const signals = [
    fpVisitorId || 'no_fp',
    getCanvasFingerprint(),
    getWebGLRenderer(),
    audioFp,
    getScreenConfig(),
    getSystemConfig(),
    clientIp || 'no_ip',
    getFontFingerprint()
  ];
  
  const raw = signals.join('|||');
  const hash = await sha256(raw);
  
  return {
    compositeId: hash,
    signals: signals,
    hardwareId: await sha256(signals.slice(0, 6).join('|||'))
  };
};

const getStableDeviceId = async (clientIp) => {
  const stableSignals = [
    `${screen.width}x${screen.height}`,
    String(window.devicePixelRatio || 1),
    String(screen.colorDepth || 24),
    navigator.platform || 'unknown',
    String(navigator.hardwareConcurrency || 0),
    String(navigator.maxTouchPoints || 0),
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    navigator.language || '',
    clientIp || 'no_ip'
  ];
  return await sha256(stableSignals.join('|'));
};

const getExactDeviceModel = async () => {
  let detectedHardware = 'Bilinmeyen Cihaz';
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  
  if (/android/i.test(userAgent)) {
    detectedHardware = 'Android Cihaz';
    let uaModel = null;
    let make = '';

    if (navigator.userAgentData && typeof navigator.userAgentData.getHighEntropyValues === 'function') {
      try {
        const hints = await navigator.userAgentData.getHighEntropyValues(['model', 'make']);
        if (hints.model) {
          uaModel = hints.model;
          make = hints.make || '';
        }
      } catch (e) {}
    }

    if (!uaModel) {
      const uaMatch = userAgent.match(/Android\s[0-9\.]+(?:;\s[a-z]{2}-[a-z]{2})?;\s([^;)]+)/i);
      uaModel = (uaMatch && uaMatch[1] && uaMatch[1] !== 'K' && uaMatch[1] !== 'Android') ? uaMatch[1].trim().split(' Build/')[0] : null;
    }

    if (uaModel) {
      detectedHardware = uaModel;
      const upperMake = make.toUpperCase();
      if (upperMake.includes('SAMSUNG') || detectedHardware.startsWith('SM-')) {
        let clean = detectedHardware.replace('SM-', '').trim();
        const m = clean.match(/^([A-Z][0-9]{2})/);
        if (m) clean = m[1];
        detectedHardware = 'Samsung ' + clean;
      }
    }
  } else if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
    detectedHardware = 'iOS Cihaz';
  }

  return detectedHardware;
};

/**
 * Gizli sekme tespiti.
 *
 * Tek bir kutuphane verdiktine guvenilmez: `detectincognitojs`, karekod
 * kameradan okutuldugunda acilan uygulama ici tarayicilarda (Instagram,
 * WhatsApp, bazi Android WebView'lari) ve depolamasi dolu iOS Safari'de
 * duzenli olarak yanlis pozitif verir. Bu yuzden engelleme icin birbirinden
 * bagimsiz en az iki kanit aranir; ayrica tarayicida daha once veri
 * biraktigimizi gorursek profil kalicidir ve asla engellenmez.
 */
// Kalabalik gecislerde yanlis pozitif kimseyi kapida birakmasin diye esik
// yukseltildi: uc bagimsiz kanitin UCU birden gerekmedikce engellenmez.
const INCOGNITO_SIGNALS_REQUIRED = 3;
const VISIT_MARKER_KEY = '__bgz_visit_marker';

/** Chrome/Edge gizli sekmede depolama kotasini sert sekilde kisar. */
const probeStorageQuota = async () => {
  try {
    if (!navigator.storage?.estimate) return null;
    const { quota } = await navigator.storage.estimate();
    if (!Number.isFinite(quota) || quota <= 0) return null;
    return quota < 300 * 1024 * 1024;
  } catch {
    return null;
  }
};

/** Bazi ozel modlar kaliciya yazmayi tamamen reddeder. */
const probeStorageWritable = () => {
  try {
    const k = '__bgz_probe';
    localStorage.setItem(k, '1');
    const ok = localStorage.getItem(k) === '1';
    localStorage.removeItem(k);
    return ok;
  } catch {
    return false;
  }
};

/** Bu tarayicida daha once iz biraktik mi? Biraktiysak taze gizli oturum degil. */
const hasPersistedHistory = async (hardwareId) => {
  try {
    const marker = localStorage.getItem(VISIT_MARKER_KEY);
    if (marker && (!hardwareId || marker === hardwareId)) return true;
    if (localStorage.getItem('__bgz_auto_login')) return true;
  } catch { /* depolama kapali */ }

  try {
    if (await idbGet('visit_marker')) return true;
    if (await idbGet('auto_login')) return true;
  } catch { /* idb kapali */ }

  return false;
};

const rememberVisit = async (hardwareId) => {
  try { localStorage.setItem(VISIT_MARKER_KEY, hardwareId || '1'); } catch { /* yok say */ }
  try { await idbSet('visit_marker', hardwareId || '1'); } catch { /* yok say */ }
};

const detectIncognito = async (hardwareId) => {
  const flags = [];
  let signals = 0;

  // Guclu olumsuz kanit: onceki ziyaretimizin izi duruyorsa profil kalicidir.
  if (await hasPersistedHistory(hardwareId)) {
    flags.push('prior_visit');
    await rememberVisit(hardwareId);
    return { score: 100, flags, isIncognito: false };
  }

  // 1) Kutuphane verdikti
  try {
    const result = await detectIncognitoLib();
    if (result.isPrivate) {
      signals += 1;
      flags.push(`lib_detected_${result.browserName}`);
    } else {
      flags.push(`lib_cleared_${result.browserName}`);
    }
  } catch {
    flags.push('lib_error');
  }

  // 2) Depolama kotasi
  const quotaSuspicious = await probeStorageQuota();
  if (quotaSuspicious === true) {
    signals += 1;
    flags.push('quota_low');
  } else if (quotaSuspicious === false) {
    flags.push('quota_ok');
  } else {
    flags.push('quota_unknown');
  }

  // 3) Kaliciya yazma
  if (!probeStorageWritable()) {
    signals += 1;
    flags.push('storage_not_writable');
  } else {
    flags.push('storage_writable');
  }

  const isIncognito = signals >= INCOGNITO_SIGNALS_REQUIRED;
  flags.push(`signals_${signals}`);

  // Normal tarayicida iz birak ki sonraki okutmada hic sorgulanmasin.
  if (!isIncognito) await rememberVisit(hardwareId);

  return { score: isIncognito ? 0 : 100, flags, isIncognito };
};

const IDB_NAME = '__bgz_vault';
// Okutulan karekodun kabul edilecegi azami yas. Nonce listesi (~3,5 dk) ile
// birlikte calisir: eski bir ekran fotografi bu esigi gecemez.
const QR_MAX_AGE_SECONDS = 180;

const IDB_STORE = 'auth';

const idbOpen = () => {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const idb = e.target.result;
      if (!idb.objectStoreNames.contains(IDB_STORE)) {
        idb.createObjectStore(IDB_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

const idbSet = async (key, value) => {
  try {
    const idb = await idbOpen();
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put({ key, value, ts: Date.now() });
    idb.close();
  } catch {  }
};

const idbGet = async (key) => {
  try {
    const idb = await idbOpen();
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => { idb.close(); resolve(req.result?.value || null); };
      req.onerror = () => { idb.close(); resolve(null); };
    });
  } catch { return null; }
};

const saveAutoLogin = async (studentData, hardwareId) => {
  const payload = {
    id: studentData.id,
    name: studentData.name,
    photo: studentData.photo,
    tc: studentData.tc,
    role: studentData.role || 'student',
    isStaff: Boolean(studentData.isStaff),
    hardwareId,
    savedAt: Date.now()
  };
  try { localStorage.setItem('__bgz_auto_login', JSON.stringify(payload)); } catch {}
  await idbSet('auto_login', payload);
};

const getAutoLogin = async (currentHardwareId) => {
  try {
    const ls = localStorage.getItem('__bgz_auto_login');
    if (ls) {
      const data = JSON.parse(ls);
      if (data.hardwareId === currentHardwareId) return data;
    }
  } catch {}
  
  const idbData = await idbGet('auto_login');
  if (idbData && idbData.hardwareId === currentHardwareId) return idbData;
  
  return null;
};

const checkRateLimit = () => {
  try {
    const key = '__bgz_rate';
    const raw = localStorage.getItem(key);
    const now = Date.now();
    let attempts = raw ? JSON.parse(raw) : [];
    
    attempts = attempts.filter(t => (now - t) < 3 * 60 * 1000);
    
    if (attempts.length >= 5) {
      return { blocked: true, remaining: Math.ceil((attempts[0] + 3 * 60 * 1000 - now) / 1000) };
    }
    
    attempts.push(now);
    localStorage.setItem(key, JSON.stringify(attempts));
    return { blocked: false };
  } catch {
    return { blocked: false };
  }
};

const Cube = ({ x, y, z = 0 }) => {
  const cx = x - 3.5;
  const cy = y - 3.5;
  const isoX = (cx - cy) * 8.66;
  const isoY = (cx + cy) * 5 - z * 10;
  const colorTop = '#3b82f6';
  const colorLeft = '#1e3a8a';
  const colorRight = '#0f172a';
  return (
    <g transform={`translate(${isoX}, ${isoY})`}>
      <polygon points="0,-5 8.66,0 0,5 -8.66,0" fill={colorTop} stroke={colorTop} strokeWidth="0.5" />
      <polygon points="-8.66,0 0,5 0,15 -8.66,10" fill={colorLeft} stroke={colorLeft} strokeWidth="0.5" />
      <polygon points="0,5 8.66,0 8.66,10 0,15" fill={colorRight} stroke={colorRight} strokeWidth="0.5" />
    </g>
  );
};

const ThemeColorUpdater = ({ topColor, bottomColor }) => {
  React.useEffect(() => {
    document.documentElement.style.setProperty("background-color", topColor, "important");
    document.body.style.setProperty("background-color", bottomColor, "important");
    
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    if (metas.length === 0) {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = topColor;
      document.head.appendChild(meta);
    } else {
      metas.forEach((meta) => (meta.content = topColor));
    }

    const root = document.getElementById('root');
    if (root) {
      root.style.setProperty("background-color", "transparent", "important");
    }

    return () => {
      document.documentElement.style.removeProperty("background-color");
      document.body.style.removeProperty("background-color");
    };
  }, [topColor, bottomColor]);

  return null;
};

const QRCodeRedirect = () => {
  const [params, setParams] = useState('');
  const [storeLink, setStoreLink] = useState('#');
  const [osName, setOsName] = useState('');

  const [isExpired, setIsExpired] = useState(false);
  const [timeLeft, setTimeLeft] = useState(180);
  // Veli telefonu isteniyorken geri sayim durur; ogrenci form doldururken
  // karekod suresi dolup islem yarida kalmasin.
  const timerPausedRef = useRef(false);

  // Veli telefonu sorma akisi
  const [parentPhonePrompt, setParentPhonePrompt] = useState(null);
  const [parentPhoneInput, setParentPhoneInput] = useState('');
  const [savingParentPhone, setSavingParentPhone] = useState(false);
  const [parentPhoneError, setParentPhoneError] = useState('');
  const [pageError, setPageError] = useState("");
  const [isLinkValidated, setIsLinkValidated] = useState(false);

  const [compositeId, setCompositeId] = useState('');
  const [hardwareId, setHardwareId] = useState('');
  const [incognitoScore, setIncognitoScore] = useState(100);
  const [incognitoFlags, setIncognitoFlags] = useState([]);
  const [clientIp, setClientIp] = useState('');

  const [autoLoginStudent, setAutoLoginStudent] = useState(null);
  const [autoLoginReady, setAutoLoginReady] = useState(false);

  const [showFallback, setShowFallback] = useState(false);
  const [geoStatus, setGeoStatus] = useState('idle');
  const [tcInput, setTcInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [student, setStudent] = useState(null);
  const [successMessage, setSuccessMessage] = useState("Yoklamanız başarıyla alındı.");
  const [scanResult, setScanResult] = useState(null);
  const [approvalWatch, setApprovalWatch] = useState(null);
  const [isFocused, setIsFocused] = useState(false);

  const inputRef = useRef(null);

  const blocks = [
    {x: 0, y: 0}, {x: 1, y: 0}, {x: 2, y: 0}, {x: 0, y: 1}, {x: 1, y: 1, z: 1}, {x: 2, y: 1}, {x: 0, y: 2}, {x: 1, y: 2}, {x: 2, y: 2},
    {x: 5, y: 0}, {x: 6, y: 0}, {x: 7, y: 0}, {x: 5, y: 1}, {x: 6, y: 1, z: 1}, {x: 7, y: 1}, {x: 5, y: 2}, {x: 6, y: 2}, {x: 7, y: 2},
    {x: 0, y: 5}, {x: 1, y: 5}, {x: 2, y: 5}, {x: 0, y: 6}, {x: 1, y: 6, z: 1}, {x: 2, y: 6}, {x: 0, y: 7}, {x: 1, y: 7}, {x: 2, y: 7},
    {x: 3, y: 3, z: 0.5}, {x: 4, y: 3}, {x: 4, y: 4, z: 1}, {x: 6, y: 4}, {x: 7, y: 4, z: 0.5}, {x: 5, y: 5}, {x: 4, y: 6}, {x: 6, y: 6, z: 1}, {x: 7, y: 7}, {x: 3, y: 5}, {x: 5, y: 7, z: 0.5}
  ];
  blocks.sort((a, b) => (a.x + a.y) - (b.x + b.y));

  const [cachedStudents, setCachedStudents] = useState([]);

  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    
    setParams(window.location.search);
    
    const initSecurityEngine = async () => {
      let fpId = '';
      let ip = '';
      
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipRes.json();
        ip = ipData.ip;
        setClientIp(ip);
      } catch {  }
      
      try {
        const fp = await fpPromise.load();
        const result = await fp.get();
        fpId = result.visitorId;
      } catch {
        fpId = 'fp_error_' + Math.random().toString(36).substring(2, 10);
      }
      
      const composite = await generateCompositeDeviceId(fpId, ip);
      setCompositeId(composite.compositeId);
      setHardwareId(composite.hardwareId);
      
      localStorage.setItem('__bgz_composite_id', composite.compositeId);
      localStorage.setItem('__bgz_hardware_id', composite.hardwareId);
      localStorage.setItem('__bgz_full_visitor_id', composite.hardwareId);
      
      const stableId = await getStableDeviceId(ip);
      localStorage.setItem('__bgz_stable_id', stableId);
      
      const incognito = await detectIncognito(composite.hardwareId);
      setIncognitoScore(incognito.score);
      setIncognitoFlags(incognito.flags);
      
      if (false && incognito.isIncognito) {
        console.warn("[QR] Gizli sekme uyarısı alındı ancak geçiş engellenmedi.");
      }
      
      const saved = await getAutoLogin(composite.hardwareId);
      if (saved && incognito.score >= 50) {
        setAutoLoginStudent(saved);
      }
      setAutoLoginReady(true);
      
      const urlParamsForClaim = new URLSearchParams(window.location.search);
      const urlSessionId = urlParamsForClaim.get('sessionId');
      
      if (urlSessionId && urlSessionId !== 'web_fallback') {
        // Yavaş bağlantıda öğrenciler sabırsızlanıp sayfayı yeniliyor. Karekodun
        // tazeliği ve dönen nonce zaten koruma sağladığı için yenileme tek
        // başına engel sayılmaz; yalnızca kayda geçer.
        const navEntries = performance.getEntriesByType("navigation");
        if (navEntries.length > 0 && navEntries[0].type === "reload") {
          console.info('[QR] Sayfa yenilendi, doğrulama sürüyor.');
        }

        try {
          /*
           * Kilit CIHAZ BASINA tutulur.
           *
           * Onceden kilit yalnizca sessionId ile tutuluyordu; ayni karekodu
           * okutan herkes ayni sessionId'yi tasidigi icin ilk kisiden sonraki
           * herkes "URL paylasimi" diye engelleniyordu. Toplu gecisde bu
           * neredeyse herkesi kapida birakir. Paylasima karsi asil koruma
           * donen nonce ve URL tazeligidir.
           */
          const claimId = `${urlSessionId}_${composite.hardwareId}`;
          const urlClaimRef = doc(db, 'url_claims', claimId);
          const urlClaimSnap = await getDoc(urlClaimRef);

          if (urlClaimSnap.exists()) {
            const claimData = urlClaimSnap.data();
            if (claimData.localClaimedAt && (Date.now() - claimData.localClaimedAt > 120000)) {
              setPageError("Bu bağlantı daha önce kullanılmıştır. Lütfen karekodu yeniden okutun.");
              return;
            }
          } else {
            await setDoc(urlClaimRef, {
              sessionId: urlSessionId,
              hardwareId: composite.hardwareId,
              claimedAt: serverTimestamp(),
              localClaimedAt: Date.now(),
              ipAddress: ip
            });
          }
        } catch {  }
      }
      
      setIsLinkValidated(true);
    };
    initSecurityEngine();

    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');
    const qrType = urlParams.get('type');
    
    if (qrType && sessionId && sessionId !== 'web_fallback') {
      const checkAndClaimLink = async () => {
         /*
          * Iki asamali dogrulama:
          *   1. Tazelik  — URL'in tasidigi uretim zamani. Ag gerektirmez,
          *      her zaman uygulanir. Eski bir ekran fotografi burada elenir.
          *   2. Nonce    — sunucudaki gecerli kod listesi. Ag gerektirir;
          *      200 kisilik yigilmada okuma yavaslayabilecegi icin hata
          *      durumunda gecis engellenmez, yalnizca kayda gecer.
          */
         const urlTimestamp = Number(urlParams.get('timestamp'));
         const ageSeconds = Number.isFinite(urlTimestamp) && urlTimestamp > 0
           ? Math.abs(Date.now() / 1000 - urlTimestamp)
           : 0;

         if (ageSeconds > QR_MAX_AGE_SECONDS) {
           setPageError('Bu karekodun süresi dolmuş veya başkası tarafından çekilmiş bir fotoğraf. Lütfen güncel karekodu okutun.');
           return;
         }

         try {
           const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
           const qrAction = urlParams.get('action') || 'entry';
           const nonceKey = qrAction === 'exit' ? 'current_exit' : 'current_entry';
           const activeSnap = await Promise.race([getDoc(doc(db, 'active_qr_nonce', nonceKey)), timeoutPromise]);

           const data = activeSnap.exists() ? activeSnap.data() : null;
           const isValidNonce = data && (data.nonce === sessionId || (data.validNonces && data.validNonces.includes(sessionId)));

           if (!isValidNonce) {
              setPageError('Bu karekodun süresi dolmuş veya başkası tarafından çekilmiş bir fotoğraf. Lütfen güncel karekodu okutun.');
              return;
           }
         } catch (error) {
           console.warn('[QR] Nonce doğrulaması yapılamadı, tazelik kontrolüyle devam ediliyor:', error?.message);
         }
      };
      checkAndClaimLink();
    }

    const prefetchStudents = async () => {
      try {
        // Ogrenci, ogretmen, veli, yonetici ve personel; hepsi ayni karekodu okutabilir.
        const q = query(collection(db, "users"));
        const snap = await getDocs(q);
        const people = [];
        snap.forEach(docSnap => {
          const data = docSnap.data();
          const nameKeys = ["full_name", "fullName", "name", "displayName", "display_name"];
          let name = "İsimsiz";
          for (let k of nameKeys) {
            if (data[k]) { name = data[k]; break; }
          }
          const photoUrl = data.profile_image || data.profileImageUrl || data.profileImage || 
            `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1e3a8a&color=fff&size=200&bold=true`;

          const role = data.role || 'student';
          people.push({ id: docSnap.id, ...data, name, photo: photoUrl, role, isStaff: isStaffRole(role) });
        });
        setCachedStudents(people);
      } catch (err) {
        console.error("Kullanıcılar önbelleğe alınamadı:", err);
      }
    };
    prefetchStudents();

    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    if (/android/i.test(userAgent)) {
      setStoreLink('https://play.google.com/store/apps/details?id=com.ial.mobil');
      setOsName('Android');
    } else if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
      setStoreLink('https://apps.apple.com/tr/app/id123456789');
      setOsName('iOS');
    }

    const timer = setInterval(() => {
      if (timerPausedRef.current) return;
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const openInApp = () => {
    window.location.href = `ialmobil://qr${params}`;
  };

  const startFallback = async () => {
    setShowFallback(true);
    setGeoStatus('allowed');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleAutoLoginConfirm = async () => {
    if (!autoLoginStudent) return;
    setIsVerifying(true);
    try {
      await processAttendance(autoLoginStudent);
    } finally {
      setIsVerifying(false);
    }
  };

  const pauseTimer = (paused) => {
    timerPausedRef.current = paused;
  };

  /**
   * Geçişten önce veli telefonu kontrolü.
   *
   * Öğrencinin velisine giriş/çıkış ve devamsızlık bildirimi gidebilmesi için
   * bir numara şart. Yoksa geçiş işlenmeden önce sorulur; sayaç bu sırada
   * durur ki öğrenci form doldururken karekod süresi dolmasın.
   * Personelde bu kontrol yapılmaz.
   */
  const ensureParentPhone = async (foundStudent) => {
    if (foundStudent.isStaff) return true;
    try {
      const { phone } = await resolveParentPhone(foundStudent.id);
      if (phone) return true;
    } catch (err) {
      // Sorgu başarısızsa geçişi engelleme; bildirim atlanır ama kapı açılır.
      console.warn('Veli telefonu sorgulanamadı:', err?.message);
      return true;
    }

    pauseTimer(true);
    setParentPhoneInput('');
    setParentPhoneError('');
    setParentPhonePrompt(foundStudent);
    setIsVerifying(false);
    return false;
  };

  const handleSaveParentPhone = async (e) => {
    e?.preventDefault?.();
    const normalized = normalizeParentPhone(parentPhoneInput);
    if (!normalized) {
      setParentPhoneError('Geçerli bir cep telefonu giriniz (05XXXXXXXXX).');
      return;
    }

    setSavingParentPhone(true);
    setParentPhoneError('');
    const target = parentPhonePrompt;

    try {
      await updateDoc(doc(db, 'users', target.id), {
        parent_phone: normalized,
        parentPhoneUpdatedAt: serverTimestamp(),
        parentPhoneSource: 'qr_gate'
      });

      setParentPhonePrompt(null);
      pauseTimer(false);
      setIsVerifying(true);
      await processAttendance(target, { skipParentCheck: true });
    } catch (err) {
      console.error('Veli telefonu kaydedilemedi:', err);
      setParentPhoneError(`Kaydedilemedi: ${err?.message || 'bağlantı hatası'}`);
    }
    setSavingParentPhone(false);
  };

  const processAttendance = async (foundStudent, options = {}) => {
    if (!options.skipParentCheck) {
      const ok = await ensureParentPhone(foundStudent);
      if (!ok) return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const qrType = urlParams.get('type') || 'institution';
    const sessionId = urlParams.get('sessionId') || 'web_fallback';
    const qrAction = urlParams.get('action') || 'toggle';

    const isInstitutionGate = ['institution', 'kurum', 'institution_gate', 'gate'].includes(qrType);

    if (!isInstitutionGate) {
      setScanResult({ kind: 'entry', title: 'Hoş geldiniz', message: 'Yoklamanız başarıyla alındı.', detail: '' });
      setSuccessMessage('Yoklamanız başarıyla alındı.');
      setStudent(foundStudent);
      setIsVerifying(false);

      await addDoc(collection(db, "attendance_logs"), {
        studentId: foundStudent.id,
        studentName: foundStudent.name,
        userRole: foundStudent.role || 'student',
        isStaff: Boolean(foundStudent.isStaff),
        type: qrType,
        status: "present",
        sessionId: sessionId,
        timestamp: serverTimestamp()
      }).catch(() => {});
      return;
    }

    try {
      const result = await processStudentScan({
        student: {
          id: foundStudent.id,
          name: foundStudent.name,
          tc: foundStudent.tc,
          photo: foundStudent.photo,
          role: foundStudent.role || 'student',
          isStaff: Boolean(foundStudent.isStaff)
        },
        requestedAction: qrAction,
        sessionId,
        qrType
      });

      setScanResult(result);
      setSuccessMessage(result.message);
      setStudent(foundStudent);
      setIsVerifying(false);

      if (result.kind === 'counselor' && result.decision) {
        try {
          const cfg = await loadAttendanceConfig();
          const dateKey = getDateKeyInTimeZone(new Date(), cfg.timeZone);
          const requestId = buildLateApprovalId(dateKey, foundStudent.id, result.decision.session || 'morning');
          subscribeLateApprovalStatus(dateKey, requestId, (data) => {
            if (data) setApprovalWatch(data);
          });
        } catch (watchErr) {
          console.error('Onay dinleyici kurulamadı:', watchErr);
        }
      }

      if (result.recorded) {
        const hw = localStorage.getItem('__bgz_hardware_id');
        if (hw && incognitoScore >= 50) {
          saveAutoLogin(foundStudent, hw);
        }
      }
    } catch (err) {
      console.error('Geçiş işlenemedi:', err);
      setScanResult({
        kind: 'warning',
        title: 'İşlem Tamamlanamadı',
        message: 'Geçişiniz kaydedilemedi. Lütfen görevli öğretmene başvurun.',
        detail: err?.message || ''
      });
      setSuccessMessage('Geçişiniz kaydedilemedi.');
      setStudent(foundStudent);
      setIsVerifying(false);
    }
  };

  const handleTcChange = async (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
    setTcInput(val);

    if (val.length === 4) {
      const rateCheck = checkRateLimit();
      if (rateCheck.blocked) {
        alert(`Çok fazla deneme yaptınız. ${rateCheck.remaining} saniye bekleyin.`);
        setTcInput('');
        return;
      }

      setIsVerifying(true);
      
      try {
        let foundStudent = null;

        for (const data of cachedStudents) {
          const tcRaw = data.tc_kimlik || data.tc || data.tcNo || data.tcKimlik || data.identityNumber || data.idNumber || "";
          const tcString = String(tcRaw);
          
          if (tcString.endsWith(val)) {
            const nameKeys = ["full_name", "fullName", "name", "displayName", "display_name"];
            let name = "İsimsiz Kullanıcı";
            for (let k of nameKeys) {
              if (data[k]) { name = data[k]; break; }
            }
            
            const photoUrl = data.profile_image || data.profileImageUrl || data.profileImage || 
              `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=9f1239&color=fff&size=200&bold=true`;

            const role = data.role || 'student';
            foundStudent = { id: data.id, name, photo: photoUrl, tc: tcString, role, isStaff: isStaffRole(role) };
            break;
          }
        }

        // HIZLI YOL: indeksli `tc_last4` alanı varsa tek belge okunur.
        // Alan, aşağıdaki tam tarama bir kez eşleşince o kişiye yazılır; böylece
        // toplu migrasyona gerek kalmadan zamanla kendiliğinden dolar ve
        // yığılmada 55 KB'lık liste indirmesi ortadan kalkar.
        if (!foundStudent) {
          try {
            const fastSnap = await getDocs(query(
              collection(db, "users"),
              where("tc_last4", "==", val),
              limit(5)
            ));
            for (const docSnap of fastSnap.docs) {
              const data = docSnap.data();
              const role = (data.role || 'student').toLowerCase();
              // Tum roller gecis yapabilir
              const nameKeys = ["full_name", "fullName", "name", "displayName", "display_name"];
              let name = "İsimsiz Kullanıcı";
              for (const k of nameKeys) { if (data[k]) { name = data[k]; break; } }
              const photoUrl = data.profile_image || data.profileImageUrl || data.profileImage ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=9f1239&color=fff&size=200&bold=true`;
              foundStudent = {
                id: docSnap.id, name, photo: photoUrl,
                tc: String(data.tc_kimlik || data.tc || ''), role, isStaff: isStaffRole(role)
              };
              break;
            }
          } catch (fastErr) {
            console.warn('[QR] Hızlı TC araması yapılamadı:', fastErr?.message);
          }
        }

        if (!foundStudent) {
          const q = query(collection(db, "users"));
          const querySnapshot = await getDocs(q);
          
          for (const docSnap of querySnapshot.docs) {
            const data = docSnap.data();
            const tcRaw = data.tc_kimlik || data.tc || data.tcNo || data.tcKimlik || data.identityNumber || data.idNumber || "";
            const tcString = String(tcRaw);
            
            if (tcString.endsWith(val)) {
              const nameKeys = ["full_name", "fullName", "name", "displayName", "display_name"];
              let name = "İsimsiz Kullanıcı";
              for (let k of nameKeys) {
                if (data[k]) { name = data[k]; break; }
              }
              const photoUrl = data.profile_image || data.profileImageUrl || data.profileImage || 
                `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=9f1239&color=fff&size=200&bold=true`;
              const role = data.role || 'student';
              foundStudent = { id: docSnap.id, name, photo: photoUrl, tc: tcString, role, isStaff: isStaffRole(role) };
              // Bir sonraki okutmada tam tarama gerekmesin diye alanı yaz.
              if (!data.tc_last4 && tcString.length >= 4) {
                updateDoc(doc(db, 'users', docSnap.id), { tc_last4: tcString.slice(-4) })
                  .catch(() => { /* yazma yetkisi yoksa sessizce geç */ });
              }
              break;
            }
          }
        }

        if (foundStudent) {
          await processAttendance(foundStudent);
        } else {
          setIsVerifying(false);
          alert("Bu son 4 haneye sahip kayıtlı bir kullanıcı bulunamadı.");
          setTcInput('');
        }

      } catch (error) {
        console.error("Firebase Hatası:", error);
        setIsVerifying(false);
        alert("Veritabanı bağlantı hatası.");
      }
    }
  };

  // Veli telefonu istenirken başka hiçbir ekran gösterilmez; sayaç duruyor.
  if (parentPhonePrompt) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1120', fontFamily: 'Inter, sans-serif', color: 'white', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '58px', height: '58px', margin: '0 auto 14px', borderRadius: '18px', backgroundColor: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <h2 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 700 }}>Velinizin Telefon Numarası</h2>
            <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.55, color: 'rgba(255,255,255,0.6)' }}>
              <strong style={{ color: '#fff' }}>{parentPhonePrompt.name}</strong> için kayıtlı veli numarası yok.
              Giriş, çıkış ve devamsızlık bildirimlerinin gönderilebilmesi için bir kez giriniz.
            </p>
          </div>

          <form onSubmit={handleSaveParentPhone} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input
              type="tel"
              inputMode="numeric"
              autoFocus
              value={parentPhoneInput}
              onChange={(e) => setParentPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="05XXXXXXXXX"
              style={{ width: '100%', boxSizing: 'border-box', padding: '15px 16px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '19px', letterSpacing: '1px', textAlign: 'center', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
            />

            {parentPhoneError && (
              <div style={{ padding: '10px 12px', borderRadius: '12px', backgroundColor: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)', color: '#fda4af', fontSize: '12.5px', textAlign: 'center' }}>
                {parentPhoneError}
              </div>
            )}

            <button
              type="submit"
              disabled={savingParentPhone}
              style={{ width: '100%', padding: '15px', borderRadius: '14px', border: 'none', backgroundColor: '#991b1b', color: '#fff', fontSize: '15px', fontWeight: 700, cursor: 'pointer', opacity: savingParentPhone ? 0.6 : 1 }}
            >
              {savingParentPhone ? 'Kaydediliyor…' : 'Kaydet ve Devam Et'}
            </button>
          </form>

          <p style={{ margin: 0, fontSize: '11.5px', textAlign: 'center', color: 'rgba(255,255,255,0.38)', lineHeight: 1.5 }}>
            Numara kaydedilene kadar karekod süresi durdurulmuştur.<br />
            Bu bilgi yalnızca bir kez istenir.
          </p>
        </div>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e3a8a', fontFamily: 'Inter, sans-serif', color: 'white', textAlign: 'center', padding: '20px' }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '20px' }}>
          <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <h2 style={{ margin: '0 0 10px', fontSize: '24px', color: '#ffffff' }}>Karekod Süresi Doldu</h2>
        <p style={{ margin: 0, opacity: 0.7, fontSize: '15px' }}>Güvenlik nedeniyle bu karekod imha edilmiştir. Lütfen yeni bir karekod okutunuz.</p>
      </div>
    );
  }

  if (pageError) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e3a8a', fontFamily: 'Inter, sans-serif', color: 'white', textAlign: 'center', padding: '20px', overflow: 'hidden' }}>
        <div style={{ position: 'relative', marginBottom: '36px', zIndex: 10 }}>
          <div style={{ width: '100px', height: '100px', borderRadius: '24px', backgroundColor: '#fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '4px solid #ffffff', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', transform: 'rotate(-5deg)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          </div>
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: '26px', fontWeight: '800', color: '#ffffff', zIndex: 10 }}>
          Erişim Reddedildi
        </h2>
        <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', color: '#ffffff', padding: '16px 24px', borderRadius: '16px', fontSize: '15px', fontWeight: '600', textAlign: 'center', border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)', boxShadow: '0 8px 32px rgba(0,0,0,0.1)', zIndex: 10, maxWidth: '300px', lineHeight: '1.4' }}>
          {pageError}
        </div>
      </div>
    );
  }

  if (!isLinkValidated) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e3a8a', color: 'white' }}>
        <style>
          {`
            @keyframes pulseFast {
              0% { transform: scale(0.9); opacity: 0.5; }
              50% { transform: scale(1.1); opacity: 1; }
              100% { transform: scale(0.9); opacity: 0.5; }
            }
          `}
        </style>
        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#ffffff', animation: 'pulseFast 1s infinite' }}></div>
        <p style={{ marginTop: '20px', fontWeight: '600', fontSize: '15px' }}>Güvenlik doğrulaması yapılıyor...</p>
      </div>
    );
  }

  if (student) {
    
    const kind = scanResult?.kind
      || (successMessage.includes('Zaten') || successMessage.includes('Önce') ? 'warning'
        : (successMessage.toLowerCase().includes('çık') ? 'exit' : 'entry'));

    const approved = approvalWatch?.status === 'approved';
    const rejected = approvalWatch?.status === 'rejected';
    const effectiveKind = approved ? 'entry' : (rejected ? 'warning' : kind);

    const isCounselor = effectiveKind === 'counselor';
    const isWarning = effectiveKind === 'warning';
    const isCheckout = effectiveKind === 'exit';

    const THEMES = {
      counselor: { grad: 'linear-gradient(180deg, #b91c1c 0%, #7f1d1d 100%)', theme: '#b91c1c', base: '#7f1d1d', badge: '#dc2626' },
      warning:   { grad: 'linear-gradient(180deg, #ea580c 0%, #9a3412 100%)', theme: '#ea580c', base: '#9a3412', badge: '#ef4444' },
      exit:      { grad: 'linear-gradient(180deg, #be123c 0%, #7f1d1d 100%)', theme: '#be123c', base: '#7f1d1d', badge: '#e11d48' },
      entry:     { grad: 'linear-gradient(180deg, #10b981 0%, #047857 100%)', theme: '#10b981', base: '#047857', badge: '#10b981' }
    };
    const T = THEMES[effectiveKind] || THEMES.entry;

    const title = approved ? 'Girişiniz Yapıldı'
      : rejected ? 'Giriş Onaylanmadı'
      : (scanResult?.title
        || (isWarning ? 'Bir Saniye!' : (isCheckout ? 'Görüşmek Üzere' : 'Hoş geldiniz')));

    const message = approved
      ? 'Görevli öğretmen girişinizi onayladı. Sınıfınıza geçebilirsiniz.'
      : rejected
        ? 'Girişiniz görevli öğretmen tarafından onaylanmadı. Lütfen idareye başvurun.'
        : (scanResult?.message || successMessage);

    const detail = approved || rejected ? '' : (scanResult?.detail || '');

    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: T.grad, fontFamily: 'Inter, sans-serif', color: 'white', textAlign: 'center', overflowY: 'auto' }}>
        <ThemeColorUpdater topColor={T.theme} bottomColor={T.base} />
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '100%', zIndex: 10 }}>

          <div style={{ position: 'relative', marginBottom: '24px', zIndex: 10, marginTop: '20px' }}>
            <img src={student.photo} alt="Profile" style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '5px solid #ffffff', boxShadow: '0 15px 35px rgba(0,0,0,0.25)' }} />
            <div style={{ position: 'absolute', bottom: '4px', right: '4px', backgroundColor: T.badge, width: '38px', height: '38px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '4px solid #ffffff', zIndex: 11 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                {isCounselor ? (
                  <><path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><line x1="12" y1="18" x2="12" y2="22" /></>
                ) : isWarning ? (
                  <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>
                ) : isCheckout ? (
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                ) : (
                  <polyline points="20 6 9 17 4 12" />
                )}
              </svg>
            </div>
          </div>

          <h2 style={{ margin: '0 0 8px', fontSize: isCounselor ? '25px' : '28px', fontWeight: '800', color: '#ffffff', zIndex: 10, lineHeight: 1.2, maxWidth: '320px' }}>
            {title}
          </h2>

          <h3 style={{ margin: '0 0 20px', fontSize: '19px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.9)', zIndex: 10 }}>
            {student.name}
          </h3>

          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            padding: '16px 22px',
            borderRadius: '16px',
            fontSize: '15px',
            fontWeight: '600',
            textAlign: 'center',
            border: '1px solid rgba(255,255,255,0.25)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            zIndex: 10,
            maxWidth: '320px',
            lineHeight: '1.45'
          }}>
            {message}
          </div>

          {detail && (
            <div style={{ marginTop: '18px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.9)', maxWidth: '310px', lineHeight: '1.55', zIndex: 10, fontWeight: '500' }}>
              {detail}
            </div>
          )}

          {isCounselor && (
            <div style={{ marginTop: '26px', maxWidth: '330px', width: '100%', zIndex: 10 }}>
              <div style={{ backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: '18px', padding: '18px 20px', border: '1px solid rgba(255,255,255,0.18)', textAlign: 'left' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', marginBottom: '12px' }}>
                  Yapmanız Gerekenler
                </div>
                {[
                  'Rehber Öğretmeninizle görüşün.',
                  'Görevli öğretmen “Öğrenci Geçiş” ekranından girişinizi yapsın.',
                  'Girişiniz yapıldığında bu ekran kendiliğinden güncellenecektir.'
                ].map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: '11px', alignItems: 'flex-start', marginBottom: i === 2 ? 0 : '11px' }}>
                    <div style={{ minWidth: '22px', height: '22px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800 }}>
                      {i + 1}
                    </div>
                    <span style={{ fontSize: '13.5px', lineHeight: '1.5', fontWeight: 500, color: 'rgba(255,255,255,0.95)' }}>{step}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px', fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
                <span style={{ position: 'relative', display: 'flex', width: '9px', height: '9px' }}>
                  <span style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', backgroundColor: '#fca5a5', opacity: 0.75, animation: 'pulseFast 1.4s infinite' }} />
                  <span style={{ position: 'relative', width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#fecaca' }} />
                </span>
                Görevli öğretmen onayı bekleniyor…
              </div>

              {scanResult?.decision && (
                <div style={{ marginTop: '14px', fontSize: '12.5px', color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  Okutma saati {scanResult.decision.time}
                  {scanResult.decision.lateByMinutes > 0 && ` · ${scanResult.decision.lateByMinutes} dk gecikme`}
                </div>
              )}
            </div>
          )}

          <style>{`@keyframes pulseFast { 0% { transform: scale(0.85); opacity: 0.5; } 50% { transform: scale(1.25); opacity: 1; } 100% { transform: scale(0.85); opacity: 0.5; } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      margin: 0,
      padding: 0,
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#1e3a8a',
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      overflowX: 'hidden'
    }}>
      <ThemeColorUpdater topColor="#f8fafc" bottomColor="#1e3a8a" />
      <style>
        {`
          @keyframes floatVolumetric {
            0% { transform: translateY(0px); filter: drop-shadow(0 15px 10px rgba(30,58,138,0.2)); }
            50% { transform: translateY(-8px); filter: drop-shadow(0 25px 15px rgba(30,58,138,0.15)); }
            100% { transform: translateY(0px); filter: drop-shadow(0 15px 10px rgba(30,58,138,0.2)); }
          }
          @keyframes pulseGlow {
            0% { box-shadow: 0 0 0 0 rgba(159, 18, 57, 0.4); }
            70% { box-shadow: 0 0 0 15px rgba(159, 18, 57, 0); }
            100% { box-shadow: 0 0 0 0 rgba(159, 18, 57, 0); }
          }
        `}
      </style>
      
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%' }}>
      
      <div style={{
        position: 'relative',
        width: '100%',
        height: '40vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc',
        overflow: 'hidden'
      }}>
        
        <div style={{ position: 'absolute', top: '20px', right: '20px', backgroundColor: 'rgba(159,18,57,0.1)', color: '#9f1239', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px', animation: timeLeft <= 10 ? 'pulseGlow 1.5s infinite' : 'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
        </div>

        <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 20px' }}>
          <div style={{ position: 'relative', width: '100px', height: '100px', animation: 'floatVolumetric 4s ease-in-out infinite', marginBottom: '20px', marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="120" height="120" viewBox="-60 -50 120 100">
              {blocks.map((block, i) => <Cube key={i} x={block.x} y={block.y} z={block.z || 0} />)}
            </svg>
          </div>
          <h1 style={{ margin: '0 0 6px', fontSize: '26px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.5px' }}>Boğaziçi <span style={{ color: '#9f1239' }}>Mobil</span></h1>
          <p style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Güvenli Geçiş Portalı</p>
        </div>
      </div>

      <div style={{
        position: 'relative',
        flex: 1,
        backgroundColor: '#1e3a8a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px 24px calc(30px + env(safe-area-inset-bottom, 20px))',
        zIndex: 10
      }}>

        <div style={{ width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: '10px' }}>
          {!showFallback ? (
            <>
              <h2 style={{ color: '#ffffff', fontSize: '22px', fontWeight: '700', margin: '0 0 12px', letterSpacing: '-0.3px' }}>Karekod Okundu</h2>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '15px', lineHeight: '1.5', margin: '0 0 32px', fontWeight: '500' }}>Bu işlemi tamamlayabilmek için <strong style={{ color: '#ffffff', fontWeight: '700' }}>Boğaziçi Mobil</strong> uygulamasını açabilir veya web üzerinden onaylayabilirsiniz.</p>

              <button onClick={openInApp} style={{ width: '100%', padding: '16px', backgroundColor: '#ffffff', color: '#1e3a8a', border: 'none', borderRadius: '16px', fontSize: '16px', fontWeight: '700', cursor: 'pointer', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 8px 20px rgba(0,0,0,0.2)', transition: 'all 0.2s ease' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
                Uygulamada Aç
              </button>

              <button onClick={startFallback} style={{ width: '100%', padding: '16px', backgroundColor: '#10b981', color: '#ffffff', border: 'none', borderRadius: '16px', fontSize: '16px', fontWeight: '700', cursor: 'pointer', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 8px 20px rgba(0,0,0,0.2)', transition: 'all 0.2s ease' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Tarayıcıdan Geçişi Onayla
              </button>

              <a href={storeLink} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', padding: '14px', backgroundColor: 'rgba(255,255,255,0.08)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px', fontSize: '14px', fontWeight: '600', textDecoration: 'none', boxSizing: 'border-box' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Uygulamayı İndir {osName && `(${osName})`}
              </a>
            </>
          ) : (
            <div style={{ width: '100%', animation: 'floatVolumetric 0.3s ease-out' }}>
              <h2 style={{ color: '#ffffff', fontSize: '20px', fontWeight: '700', margin: '0 0 20px' }}>{(() => {
                const urlP = new URLSearchParams(window.location.search);
                const t = urlP.get('type');
                const a = urlP.get('action');
                if (t === 'attendance' || t === 'yoklama') return 'Web Yoklama Ekranı';
                if (a === 'exit') return 'Web Çıkış Ekranı';
                return 'Web Kurum Giriş Ekranı';
              })()}</h2>
              
              {geoStatus === 'allowed' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                  {isVerifying ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', padding: '10px 0', width: '100%' }}>
                       <div style={{ textAlign: 'center' }}>
                         <h3 style={{ margin: '0 0 8px 0', color: '#ffffff', fontSize: '18px', fontWeight: '600', letterSpacing: '-0.3px' }}>İşleminiz Gerçekleştiriliyor</h3>
                         <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>Lütfen bekleyin, bilgileriniz doğrulanıyor...</p>
                       </div>
                    </div>
                  ) : autoLoginReady && autoLoginStudent ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%' }}>
                      <img src={autoLoginStudent.photo} alt="Profile" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.2)' }} />
                      <p style={{ color: '#ffffff', fontSize: '18px', fontWeight: '600', margin: 0, letterSpacing: '-0.3px' }}>{autoLoginStudent.name}</p>
                      
                      <button 
                        onClick={handleAutoLoginConfirm}
                        style={{ 
                          width: '100%', 
                          padding: '16px 32px', 
                          backgroundColor: '#10b981', 
                          color: '#ffffff', 
                          border: 'none', 
                          borderRadius: '9999px', 
                          fontSize: '16px', 
                          fontWeight: '600', 
                          letterSpacing: '-0.3px',
                          cursor: 'pointer', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          gap: '8px', 
                          marginTop: '12px'
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        Otomatik Girişi Onayla
                      </button>
                      
                      <button 
                        onClick={() => setAutoLoginStudent(null)}
                        style={{ background: 'none', border: 'none', color: '#cbd5e1', textDecoration: 'none', fontSize: '13px', fontWeight: '500', cursor: 'pointer', marginTop: '4px' }}
                      >
                        Farklı bir hesapla giriş yap
                      </button>
                    </div>
                  ) : (
                    <>
                      <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px', margin: '0 0 24px', fontWeight: '500', lineHeight: '1.5' }}>TC Kimlik Numaranızın <strong style={{color: 'white'}}>son 4 hanesini</strong> giriniz</p>
                      
                      <div 
                        style={{ position: 'relative', display: 'flex', gap: '12px', marginBottom: '8px', cursor: 'text', WebkitTapHighlightColor: 'transparent' }}
                      >
                        {[0, 1, 2, 3].map((i) => (
                          <div key={i} style={{
                            width: '52px',
                            height: '64px',
                            borderRadius: '14px',
                            backgroundColor: tcInput[i] ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                            border: tcInput[i] ? '1.5px solid rgba(255,255,255,0.3)' : '1.5px solid rgba(255,255,255,0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease'
                          }}>
                            {tcInput[i] ? (
                              <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: '#ffffff' }}></div>
                            ) : (
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.2)' }}></div>
                            )}
                          </div>
                        ))}
                      </div>
                      
                      <input
                        ref={inputRef}
                        type="tel"
                        inputMode="numeric"
                        maxLength={4}
                        autoComplete="off"
                        value={tcInput}
                        onChange={handleTcChange}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          opacity: 0,
                          zIndex: 10,
                          cursor: 'text',
                          color: 'transparent',
                          background: 'transparent',
                          caretColor: 'transparent',
                          border: 'none',
                          outline: 'none'
                        }}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '40px', paddingBottom: isFocused ? '45vh' : '20px', transition: 'padding 0.3s ease' }}>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', fontWeight: '600', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Boğaziçi Koleji © {new Date().getFullYear()}
          </p>
        </div>
      </div>
      </div>
    </div>
  );
};

export default QRCodeRedirect;
