"use client";

const boundStudentTcMismatch = (bTc, sTc) => {
  if (!bTc || !sTc) return false;
  return String(bTc).trim() !== String(sTc).trim();
};

import React, { useEffect, useState, useRef } from 'react';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, push, update, get, serverTimestamp as rtdbServerTimestamp } from 'firebase/database';
import { db, rtdb } from '../services/firebaseConfig';
import { sendWhatsAppNotification } from '../services/whatsappService';
import fpPromise from '@fingerprintjs/fingerprintjs';
import { detectIncognito as detectIncognitoLib } from 'detectincognitojs';

// Removed ThemeColorUpdater as it interferes with Safari 15+ native heuristics and causes race conditions.
// Safari iOS 15+ automatically samples the `position: fixed` elements at the top and bottom of the viewport.
// By disabling overscroll, we prevent the native background from leaking and breaking the illusion.

// ============================================================
// V2 SECURITY ENGINE — Composite Fingerprint + Incognito Detection
// ============================================================

// --- Haversine Distance Calculator (meters) ---
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

// --- SHA-256 Hash Utility ---
const sha256 = async (str) => {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// --- Signal 1: Canvas Fingerprint (GPU-level, kendi implementasyonumuz) ---
const getCanvasFingerprint = () => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    
    // Complex text rendering (GPU specific)
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.font = '11pt "Times New Roman"';
    ctx.fillText('BGZ Güvenlik Mührü 🔒', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.font = '18pt Arial';
    ctx.fillText('BGZ Güvenlik Mührü 🔒', 4, 45);
    
    // Blend modes
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

// --- Signal 2: WebGL Renderer String (GPU bilgisi) ---
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

// --- Signal 3: AudioContext Fingerprint (ses işleme parmak izi) ---
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

// --- Signal 4: Screen Config ---
const getScreenConfig = () => {
  return `${screen.width}x${screen.height}|${window.devicePixelRatio}|${screen.colorDepth}|${screen.pixelDepth}`;
};

// --- Signal 5: System Config ---
const getSystemConfig = () => {
  return `${Intl.DateTimeFormat().resolvedOptions().timeZone}|${navigator.language}|${navigator.platform}|${navigator.hardwareConcurrency || 'x'}|${navigator.maxTouchPoints || 0}`;
};

// --- Signal 6: Font Enumeration (hızlı yöntem, DOM ölçümleriyle) ---
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

// --- COMPOSITE DEVICE ID (8 sinyal birleştirme) ---
const generateCompositeDeviceId = async (fpVisitorId, clientIp) => {
  const [audioFp] = await Promise.all([getAudioFingerprint()]);
  
  const signals = [
    fpVisitorId || 'no_fp',                   // 1. FingerprintJS
    getCanvasFingerprint(),                     // 2. Canvas
    getWebGLRenderer(),                         // 3. WebGL
    audioFp,                                    // 4. Audio
    getScreenConfig(),                          // 5. Screen
    getSystemConfig(),                          // 6. System
    clientIp || 'no_ip',                        // 7. IP
    getFontFingerprint()                        // 8. Fonts
  ];
  
  const raw = signals.join('|||');
  const hash = await sha256(raw);
  
  return {
    compositeId: hash,
    signals: signals,
    hardwareId: await sha256(signals.slice(0, 6).join('|||'))
  };
};

// --- STABLE DEVICE ID (TARAYICInın DEĞİŞTİREMEYECEĞİ sinyaller) ---
// Canvas, WebGL, Audio fingerprint'ler Brave/Firefox'ta randomize edilebilir.
// AMA ekran boyutu, CPU çekirdek sayısı, dokunma noktaları, timezone, platform
// HİÇBİR tarayıcı tarafından DEĞİŞTİRİLEMEZ — incognito'da bile aynı kalır.
// IP adresi ile birleşince okul ortamında yeterince unique olur.
const getStableDeviceId = async (clientIp) => {
  const stableSignals = [
    `${screen.width}x${screen.height}`,                    // Ekran çözünürlüğü
    String(window.devicePixelRatio || 1),                   // Piksel yoğunluğu
    String(screen.colorDepth || 24),                        // Renk derinliği  
    navigator.platform || 'unknown',                        // Platform (iPhone, MacIntel, Linux armv8l)
    String(navigator.hardwareConcurrency || 0),             // CPU çekirdek sayısı
    String(navigator.maxTouchPoints || 0),                  // Dokunma noktası sayısı
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',  // Timezone
    navigator.language || '',                                // Dil
    clientIp || 'no_ip'                                     // IP adresi
  ];
  return await sha256(stableSignals.join('|'));
};

// --- ADVANCED OS & HARDWARE DETECTION (CLIENT HINTS + WEBGL BACKDOOR) ---
const getExactDeviceModel = async () => {
  let detectedHardware = 'Bilinmeyen Cihaz';
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  
  if (/android/i.test(userAgent)) {
    detectedHardware = 'Android Cihaz';
    let uaModel = null;
    let make = '';

    // 1. Ultimate Chrome Backdoor: User-Agent Client Hints API (Kesin Tespit)
    if (navigator.userAgentData && typeof navigator.userAgentData.getHighEntropyValues === 'function') {
      try {
        const hints = await navigator.userAgentData.getHighEntropyValues(['model', 'make']);
        if (hints.model) {
          uaModel = hints.model;
          make = hints.make || '';
        }
      } catch (e) {}
    }

    // 2. Legacy Regex Fallback
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
      else {
        // Translation dictionary for common complex alphanumeric models
        const knownModels = {
          '2201117PI': 'Poco M4 Pro',
          '2201117PG': 'Poco M4 Pro',
          '2201117TG': 'Redmi Note 11',
          '2201117TY': 'Redmi Note 11S',
          '2201116SG': 'Poco X4 Pro',
          '22101320G': 'Poco X5 Pro',
          '23049PCD8G': 'Poco F5',
          '2107113SG': 'Xiaomi Mi 11T',
          '2109119DG': 'Xiaomi 11T Lite',
          '22081212UG': 'Xiaomi 12T Pro',
          'CPH2305': 'Oppo Reno 6',
          'CPH2371': 'Oppo Reno 7',
          'CPH2525': 'Oppo Reno 10',
          'RMX3241': 'Realme 8 5G',
          'RMX3363': 'Realme GT Master'
        };

        if (knownModels[detectedHardware]) {
          detectedHardware = knownModels[detectedHardware];
        } else if (upperMake.includes('XIAOMI') || upperMake.includes('POCO') || detectedHardware.startsWith('22') || detectedHardware.startsWith('23') || detectedHardware.startsWith('21') || detectedHardware.startsWith('M2')) {
          detectedHardware = 'Xiaomi/Poco ' + detectedHardware;
        } else if (upperMake.includes('OPPO') || detectedHardware.startsWith('CPH') || detectedHardware.startsWith('PDK')) {
          detectedHardware = 'Oppo ' + detectedHardware;
        } else if (upperMake.includes('REALME') || detectedHardware.startsWith('RMX')) {
          detectedHardware = 'Realme ' + detectedHardware;
        } else if (upperMake.includes('VIVO') || detectedHardware.startsWith('V2')) {
          detectedHardware = 'Vivo ' + detectedHardware;
        } else if (upperMake.includes('HUAWEI') || detectedHardware.startsWith('MAR-') || detectedHardware.startsWith('VOG-')) {
          detectedHardware = 'Huawei ' + detectedHardware;
        } else if (make) {
          detectedHardware = make.charAt(0).toUpperCase() + make.slice(1) + ' ' + detectedHardware;
        }
      }
    }

    // 2. Fallback to WebGL GPU parsing (clean ANGLE wrapper)
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          let renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
          
          // Clean Chrome's ANGLE wrapper: "ANGLE (ARM, Mali-G52, OpenGL ES)" -> "Mali-G52"
          if (renderer.includes('ANGLE (')) {
            const parts = renderer.split(',');
            if (parts.length > 1) renderer = parts[1].trim();
          }

          if (!uaModel) {
            // No User-Agent model, rely on GPU
            const gpu = renderer.toLowerCase();
            if (gpu.includes('adreno (tm) 750')) detectedHardware = 'Samsung Galaxy S24';
            else if (gpu.includes('adreno (tm) 740')) detectedHardware = 'Samsung Galaxy S23';
            else if (gpu.includes('adreno (tm) 730')) detectedHardware = 'Samsung Galaxy S22';
            else if (gpu.includes('adreno (tm) 660')) detectedHardware = 'Xiaomi Mi 11';
            else if (gpu.includes('adreno (tm) 650')) detectedHardware = 'Poco F2 Pro';
            else if (gpu.includes('adreno (tm) 640')) detectedHardware = 'Samsung Galaxy S10';
            else if (gpu.includes('adreno (tm) 619')) detectedHardware = 'Redmi Note 12';
            else if (gpu.includes('adreno (tm) 618')) detectedHardware = 'Redmi Note 10 Pro';
            else if (gpu.includes('adreno (tm) 610')) detectedHardware = 'Oppo A77';
            else if (gpu.includes('xclipse 920')) detectedHardware = 'Samsung Galaxy S22';
            else if (gpu.includes('xclipse 940')) detectedHardware = 'Samsung Galaxy S24';
            else if (gpu.includes('mali-g715')) detectedHardware = 'Vivo X90';
            else if (gpu.includes('mali-g710')) detectedHardware = 'Oppo Find X5';
            else if (gpu.includes('mali-g78')) detectedHardware = 'Huawei P50';
            else if (gpu.includes('mali-g77')) detectedHardware = 'Samsung Galaxy S20';
            else if (gpu.includes('mali-g76')) detectedHardware = 'Redmi Note 10S';
            else if (gpu.includes('mali-g68')) detectedHardware = 'Samsung Galaxy A54';
            else if (gpu.includes('mali-g57 mc2')) detectedHardware = 'Poco M4 Pro';
            else if (gpu.includes('mali-g57')) detectedHardware = 'Realme 8 5G';
            else if (gpu.includes('mali-g52 mc2')) detectedHardware = 'Redmi Note 9';
            else if (gpu.includes('mali-g52')) detectedHardware = 'Samsung Galaxy A32';
            else if (gpu.includes('powervr roguer ge8320')) detectedHardware = 'Redmi 9A';
            else detectedHardware = 'Android';
          }
        }
      }
    } catch (e) {}
  } else if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
    detectedHardware = 'iOS';
  }

  return detectedHardware;
};

// --- INCOGNITO DETECTION V5 (Zero False Positives) ---
// Yalnızca kesin (deterministic) kütüphane testlerine güvenir.
const detectIncognito = async (hardwareId) => {
  let score = 100;
  const flags = [];

  try {
    const result = await detectIncognitoLib();
    if (result.isPrivate) {
      score = 0;
      flags.push(`lib_detected_${result.browserName}`);
      return { score: 0, flags, isIncognito: true };
    } else {
      flags.push(`lib_cleared_${result.browserName}`);
    }
  } catch (e) {
    flags.push('lib_error');
  }

  // İlk giriş kontrolü (Loglama amaçlı)
  try {
    const seen = localStorage.getItem('__bgz_first_seen');
    if (!seen) {
      localStorage.setItem('__bgz_first_seen', Date.now().toString());
      flags.push('empty_ls');
    }
  } catch {
    flags.push('ls_blocked');
  }

  return { score: Math.max(0, score), flags, isIncognito: score <= 50 };
};


// --- AUTO-LOGIN: IndexedDB Hybrid Storage ---
const IDB_NAME = '__bgz_vault';
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
  } catch { /* silent */ }
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
    hardwareId,
    savedAt: Date.now()
  };
  try { localStorage.setItem('__bgz_auto_login', JSON.stringify(payload)); } catch {}
  await idbSet('auto_login', payload);
};

const getAutoLogin = async (currentHardwareId) => {
  // 1. Check bgz_user_profile (Logged-in portal user)
  try {
    const webProfileRaw = localStorage.getItem('bgz_user_profile');
    if (webProfileRaw) {
      const webProfile = JSON.parse(webProfileRaw);
      if (webProfile && (webProfile.full_name || webProfile.name)) {
        return {
          id: webProfile.id || webProfile.uid || 'portal_user',
          name: webProfile.full_name || webProfile.name,
          photo: webProfile.profile_image || webProfile.profileImageUrl || webProfile.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(webProfile.full_name || webProfile.name)}&background=103A69&color=fff&size=200`,
          tc: webProfile.tc_kimlik || webProfile.tc || '',
          role: webProfile.role || 'student',
          hardwareId: currentHardwareId
        };
      }
    }
  } catch {}

  // 2. Check __bgz_auto_login
  try {
    const ls = localStorage.getItem('__bgz_auto_login');
    if (ls) {
      const data = JSON.parse(ls);
      if (data && (!data.hardwareId || data.hardwareId === currentHardwareId)) return data;
    }
  } catch {}
  
  // 3. Fallback to IndexedDB
  const idbData = await idbGet('auto_login');
  if (idbData && (!idbData.hardwareId || idbData.hardwareId === currentHardwareId)) return idbData;
  
  return null;
};

// --- RATE LIMITING (Client-Side) ---
const checkRateLimit = () => {
  try {
    const key = '__bgz_rate';
    const raw = localStorage.getItem(key);
    const now = Date.now();
    let attempts = raw ? JSON.parse(raw) : [];
    
    // Son 3 dakikadaki denemeleri filtrele
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



// ============================================================
// MAIN COMPONENT
// ============================================================
// ThemeColorUpdater component ensures the Safari status bar and overscroll colors match the gradient background
const ThemeColorUpdater = ({ topColor = "#1e3a8a", bottomColor = "#0b1120" }) => {
  React.useEffect(() => {
    // 1. Update html and body - the fallback Safari samples for overscroll/address bar
    document.documentElement.style.setProperty("background-color", topColor, "important");
    document.body.style.setProperty("background-color", bottomColor, "important");
    
    // 2. Update ALL theme-color metas (avoids the stale-duplicate trap)
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
      // Cleanup on unmount
      document.documentElement.style.removeProperty("background-color");
      document.body.style.removeProperty("background-color");
    };
  }, [topColor, bottomColor]);

  return null;
};

/* ------------------------------------------------------------------------
 *  KIMLIK HAVUZLARI  (canli sistemle senkron)
 *
 *  Ogrenci, ogretmen ve idare havuzlari birbirinden ayridir; bir havuzda
 *  yapilan arama digerine tasmaz. Ogrenci okul numarasi, personel ad + soyad
 *  ile girer. Bu bilgi yalnizca ILK giriste sorulur; sonrasinda cihaz kisiyi
 *  hatirlar (auto login).
 * ---------------------------------------------------------------------- */

const POOL_STUDENT = 'student';
const POOL_TEACHER = 'teacher';
const POOL_ADMIN = 'admin';

const STUDENT_POOL_ROLES = ['student', 'öğrenci', 'ogrenci'];
const TEACHER_POOL_ROLES = ['teacher', 'öğretmen', 'ogretmen'];
/* Ogretmen olmayan tum calisanlar. Ayri bir dorduncu havuz istenirse tek
   yapilacak sey bu diziyi bolmektir. */
const ADMIN_POOL_ROLES = ['admin', 'yönetici', 'yonetici', 'superadmin', 'patron', 'personnel', 'personel', 'staff'];

const studentNumberOf = (u) => String(u?.school_number || u?.schoolNumber || u?.student_number || u?.okulNo || u?.no || '').trim();
const tcOf = (u) => String(u?.tc_kimlik || u?.tc || u?.tcNo || u?.tcKimlik || u?.identityNumber || u?.idNumber || '').trim();

const resolvePool = (user) => {
  const role = String(user?.role || '').toLowerCase().trim();
  if (TEACHER_POOL_ROLES.includes(role)) return POOL_TEACHER;
  if (ADMIN_POOL_ROLES.includes(role)) return POOL_ADMIN;
  if (STUDENT_POOL_ROLES.includes(role)) return user?.isStaff ? POOL_ADMIN : POOL_STUDENT;
  if (user?.isStaff) return POOL_ADMIN;
  return studentNumberOf(user) ? POOL_STUDENT : null;
};

const poolLabel = (pool) => {
  if (pool === POOL_TEACHER) return 'Öğretmen';
  if (pool === POOL_ADMIN) return 'İdare';
  if (pool === POOL_STUDENT) return 'Öğrenci';
  return '';
};

/* ------------------------------------------------------------------------
 *  AD - SOYAD ESLESTIRME
 *
 *  Soyad tek basina kimlik olamiyor (Secil Ozkan / Muharrem Ozkan), bu yuzden
 *  personelden ad ve soyad birlikte istenir. Tam ad zaten ayirt edici oldugu
 *  icin eslestirme bilerek KATIDIR: yalnizca birebir kelime eslesmesi kabul
 *  edilir, kismi ya da benzer eslesme yoktur. Boylece bir kisi yazip iki aday
 *  cikmasi diye bir durum olusmaz; yanlis yazan "bulunamadi" alip duzeltir.
 * ---------------------------------------------------------------------- */

const normalizeTr = (s = '') => String(s || '')
  .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
  .replace(/Ç/g, 'c').replace(/ç/g, 'c')
  .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
  .replace(/Ö/g, 'o').replace(/ö/g, 'o')
  .replace(/Ş/g, 's').replace(/ş/g, 's')
  .replace(/Ü/g, 'u').replace(/ü/g, 'u')
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const PERSON_NAME_KEYS = ['full_name', 'fullName', 'name', 'displayName', 'display_name'];

const personName = (u) => {
  for (const k of PERSON_NAME_KEYS) if (u && u[k]) return String(u[k]);
  return '';
};

/** Yazilan her kelime, kayittaki AYRI birer kelimeye birebir esit olmali. */
const matchByName = (people, rawInput) => {
  const q = normalizeTr(rawInput);
  if (!q) return [];
  const queryTokens = q.split(' ').filter(Boolean);

  const indexed = people
    .map((p) => {
      const norm = normalizeTr(personName(p));
      return { person: p, norm, tokens: norm.split(' ').filter(Boolean) };
    })
    .filter((e) => e.tokens.length > 0);

  let hit = indexed.filter((e) => e.norm === q);
  if (!hit.length) {
    hit = indexed.filter((e) => {
      const used = new Array(e.tokens.length).fill(false);
      return queryTokens.every((qt) => {
        const k = e.tokens.findIndex((t, i) => !used[i] && t === qt);
        if (k === -1) return false;
        used[k] = true;
        return true;
      });
    });
    // "Ayse Kaya" hem "Ayse Kaya" hem "Ayse Nur Kaya" ile eslesir; birebir
    // ayni olan varsa o kazanir.
    const tam = hit.filter((e) => e.norm === q);
    if (tam.length === 1) hit = tam;
  }
  return hit.map((e) => e.person);
};

const QRCodeRedirect = () => {
  const [params, setParams] = useState('');
  const [storeLink, setStoreLink] = useState('#');
  const [osName, setOsName] = useState('');
  
  // Security
  const [isExpired, setIsExpired] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [pageError, setPageError] = useState("");
  const [isLinkValidated, setIsLinkValidated] = useState(true);

  // V2 Security Engine
  const [compositeId, setCompositeId] = useState('');
  const [hardwareId, setHardwareId] = useState('');
  const [incognitoScore, setIncognitoScore] = useState(100);
  const [incognitoFlags, setIncognitoFlags] = useState([]);
  const [clientIp, setClientIp] = useState('');

  // Auto-Login
  const [autoLoginStudent, setAutoLoginStudent] = useState(null);
  const [autoLoginReady, setAutoLoginReady] = useState(false);

  // Web Fallback States
  const [showFallback, setShowFallback] = useState(true);
  const [geoStatus, setGeoStatus] = useState('allowed');
  const [tcInput, setTcInput] = useState('');
  const [roleMode, setRoleMode] = useState('student');
  // Ad ve soyadi harfi harfine ayni birden fazla kayit varsa adaylar burada tutulur.
  const [candidates, setCandidates] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [student, setStudent] = useState(null);
  const [successMessage, setSuccessMessage] = useState("Yoklamanız başarıyla alındı.");
  const [isFocused, setIsFocused] = useState(false);

  const inputRef = useRef(null);



  const [cachedStudents, setCachedStudents] = useState([]);

  // ============================================================
  // INITIALIZATION
  // ============================================================
  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    
    const searchParams = window.location.search;
    setParams(searchParams);

    
    // === V2 SECURITY ENGINE INITIALIZATION ===
    const initSecurityEngine = async () => {
      let fpId = '';
      let ip = '';
      
      // 1. IP Address (arka planda, hızlı)
      // Zaman asimi SART: bu istek takilirsa cihaz parmak izi hic uretilemez,
      // __bgz_hardware_id yazilmaz ve gecis ekrani "Isleminiz gerceklestiriliyor"
      // adiminda sonsuza kadar bekler. IP yalnizca kayit amacli, kritik degil.
      try {
        const ipRes = await Promise.race([
          fetch('https://api.ipify.org?format=json'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('ip-timeout')), 3000))
        ]);
        const ipData = await ipRes.json();
        ip = ipData.ip;
        setClientIp(ip);
      } catch { /* silent */ }
      
      // 2. FingerprintJS (ana sinyal)
      try {
        const fp = await fpPromise.load();
        const result = await fp.get();
        fpId = result.visitorId;
      } catch {
        fpId = 'fp_error_' + Math.random().toString(36).substring(2, 10);
      }
      
      // 3. Composite Device ID (8 sinyal)
      const composite = await generateCompositeDeviceId(fpId, ip);
      setCompositeId(composite.compositeId);
      setHardwareId(composite.hardwareId);
      
      // localStorage'a da yaz (handleTcChange'de kullanmak için)
      localStorage.setItem('__bgz_composite_id', composite.compositeId);
      localStorage.setItem('__bgz_hardware_id', composite.hardwareId);
      localStorage.setItem('__bgz_full_visitor_id', composite.hardwareId);
      
      // 3b. Stable Device ID (incognito-proof)
      const stableId = await getStableDeviceId(ip);
      localStorage.setItem('__bgz_stable_id', stableId);
      
      // 4. Incognito Detection
      const incognito = await detectIncognito(composite.hardwareId);
      setIncognitoScore(incognito.score);
      setIncognitoFlags(incognito.flags);
      
      if (incognito.isIncognito) {
        setPageError("Güvenlik İhlali: Tarayıcınızın Gizli Sekme (Incognito/Private) modunda olduğu tespit edildi. Sistem güvenliği gereği yoklama işlemi gizli sekmelerden yapılamaz. Lütfen normal tarayıcı modunu kullanın.");
        return;
      }
      
      // 5. Auto-Login Check (hardware ID ile eşleştir)
      const saved = await getAutoLogin(composite.hardwareId);
      if (saved && incognito.score >= 50) {
        setAutoLoginStudent(saved);
      }
      setAutoLoginReady(true);
      
      // === STRICT URL CLAIM (1 URL 1 BROWSER + RELOAD PROTECTION) ===
      const urlParamsForClaim = new URLSearchParams(window.location.search);
      const urlSessionId = urlParamsForClaim.get('sessionId');
      
      if (urlSessionId && urlSessionId !== 'web_fallback') {
        try {
          const urlClaimRef = doc(db, 'url_claims', urlSessionId);
          await setDoc(urlClaimRef, {
            hardwareId: composite.hardwareId,
            claimedAt: serverTimestamp(),
            localClaimedAt: Date.now(),
            ipAddress: ip
          }, { merge: true });
        } catch { /* Ağ hatası */ }
      }
      
      setIsLinkValidated(true);
    };
    initSecurityEngine();
    
    // === NONCE VALIDATION (arka planda) ===
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');
    const qrType = urlParams.get('type');
    
    if (qrType && sessionId && sessionId !== 'web_fallback') {
      const checkAndClaimLink = async () => {
         try {
           const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500));
           const qrAction = urlParams.get('action') || 'entry';
           const nonceKey = qrAction === 'exit' ? 'current_exit' : 'current_entry';
           const activeSnap = await Promise.race([getDoc(doc(db, 'active_qr_nonce', nonceKey)), timeoutPromise]).catch(() => null);
           
           const data = activeSnap && activeSnap.exists ? activeSnap.data() : null;
           const qrTimestamp = parseInt(urlParams.get('timestamp') || "0", 10);
           const nowSec = Math.floor(Date.now() / 1000);
           const age = qrTimestamp > 0 ? (nowSec - qrTimestamp) : 0;
           
           // Geçerlilik: Ya son 15 dakika içinde üretilmiş (900 sn), ya da aktif nonce listesinde
           const isFresh = qrTimestamp > 0 && Math.abs(age) < 900;
           const isValidNonce = data && (data.nonce === sessionId || (data.validNonces && data.validNonces.includes(sessionId)));

           if (qrTimestamp > 0 && !isFresh && !isValidNonce) {
              setPageError(`Bu karekodun süresi dolmuş veya başkası tarafından çekilmiş bir fotoğraf. Lütfen güncel karekodu okutun.`);
              return;
           }
         } catch (error) {
           console.warn("Nonce validation notice:", error);
         }
      };
      checkAndClaimLink();
    }

    // === PRE-FETCH STUDENTS (VDS API PRIMARY) ===
    const prefetchStudents = async () => {
      try {
        const res = await fetch('https://updates.chenki.net:8443/api/users?limit=1000');
        if (res.ok) {
          const json = await res.json();
          if (json && Array.isArray(json.users) && json.users.length > 0) {
            setCachedStudents(json.users);
            return;
          }
        }
      } catch (err) {
        console.warn("VDS fetch notice:", err);
      }

      try {
        const q = query(collection(db, "users"));
        const snap = await getDocs(q);
        const students = [];
        window.__bgz_image_cache__ = window.__bgz_image_cache__ || [];

        snap.forEach(doc => {
          const data = doc.data();
          students.push({ id: doc.id, ...data });

          const nameKeys = ["full_name", "fullName", "name", "displayName", "display_name"];
          let name = "İsimsiz";
          for (let k of nameKeys) {
            if (data[k]) { name = data[k]; break; }
          }
          
          const photoUrl = data.profile_image || data.profileImageUrl || data.profileImage || 
            `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1e3a8a&color=fff&size=200&bold=true`;
          
          const img = new Image();
          img.src = photoUrl;
          window.__bgz_image_cache__.push(img);
        });
        
        setCachedStudents(students);
      } catch (err) {
        console.error("Öğrenciler önbelleğe alınamadı:", err);
      }
    };
    prefetchStudents();

    // === ADVANCED OS & HARDWARE DETECTION ===
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    if (/android/i.test(userAgent)) {
      setStoreLink('https://play.google.com/store/apps/details?id=com.ial.mobil');
      setOsName('Android');
    } else if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
      setStoreLink('https://apps.apple.com/tr/app/id123456789');
      setOsName('iOS');
    }

    // === 60s EXPIRY TIMER ===
    const timer = setInterval(() => {
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

  // ============================================================
  // OPEN IN APP
  // ============================================================
  const openInApp = () => {
    window.location.href = `ialmobil://qr${params}`;
  };

  // ============================================================
  // GEO FALLBACK
  // ============================================================
  const startFallback = async () => {
    setShowFallback(true);
    setGeoStatus('checking');
    
    try {
      const settingsRef = doc(db, 'system_settings', 'general');
      const settingsSnap = await getDoc(settingsRef);
      
      let TARGET_LAT = 41.0422;
      let TARGET_LNG = 29.0083;
      
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        if (data.institutionLat && data.institutionLng) {
          TARGET_LAT = parseFloat(data.institutionLat);
          TARGET_LNG = parseFloat(data.institutionLng);
        }
      }

      // location checks bypassed per user request
      setGeoStatus('allowed');
    } catch {
      setGeoStatus('allowed');
    }
  };

  // ============================================================
  // AUTO-LOGIN CONFIRM (tek tıkla onay)
  // ============================================================
  const handleAutoLoginConfirm = async () => {
    if (!autoLoginStudent) return;
    setIsVerifying(true);
    
    try {
      const fakeStudent = {
        id: autoLoginStudent.id,
        name: autoLoginStudent.name,
        photo: autoLoginStudent.photo,
        tc: autoLoginStudent.tc
      };
      
      await processAttendance(fakeStudent);
    } finally {
      setIsVerifying(false); // In case of error or completion (though completion usually redirects)
    }
  };

  // ============================================================
  // PROCESS ATTENDANCE (ortak fonksiyon: hem TC girişi hem auto-login)
  // ============================================================
  const processAttendance = async (foundStudent) => {
    try {
      const studentId = String(foundStudent?.id || foundStudent?._id || (foundStudent?.schoolNumber ? `std_${foundStudent.schoolNumber}` : `user_${Date.now()}`));
      const studentName = foundStudent?.name || foundStudent?.full_name || 'Öğrenci';
      const studentTc = foundStudent?.tc || '';

      if (studentTc) {
        try { localStorage.setItem('__bgz_bound_user_tc', studentTc); } catch (e) {}
      }

      const urlParams = new URLSearchParams(window.location.search);
      const qrType = urlParams.get('type') || 'institution';
      const sessionId = urlParams.get('sessionId') || 'web_fallback';
      const nowSec = Math.floor(Date.now() / 1000);
      const todayStr = new Date().toISOString().split('T')[0];

      let finalMessage = "Yoklamanız başarıyla alındı.";
      let newStatus = "present";

      // === HARD BLOCK: Incognito tespit edilmişse GEÇİŞ YOK ===
      if (incognitoScore <= 50) {
        setPageError("Gizli sekme (incognito/özel tarama) kullanımı tespit edildi. Güvenlik nedeniyle gizli sekmeden yoklama alınamaz. Lütfen normal tarayıcı modunu kullanın.");
        setIsVerifying(false);
        return;
      }

      if (qrType === 'institution' || qrType === 'kurum' || qrType === 'institution_gate') {
        const qrAction = urlParams.get('action');

        // 1. VDS (HTTPS) Gate status kontrolü (Anlık)
        let currentStatus = "outside";
        let isAlready = false;

        try {
          const vdsRes = await fetch(`https://updates.chenki.net:8443/api/gate-status/${studentId}`).then(r => r.ok ? r.json() : null).catch(() => null);
          if (vdsRes && (vdsRes.status === 'entry' || vdsRes.status === 'inside')) {
            currentStatus = 'entry';
          }
        } catch (err) {
          console.warn("gate_status check notice:", err?.message);
        }

        // 2. Durum ve Mesaj Kararı
        if (qrAction === 'entry') {
          if (currentStatus === 'entry') {
            finalMessage = "Zaten giriş yapıldı.";
            newStatus = "entry";
            isAlready = true;
          } else {
            finalMessage = "Kurum girişi yapıldı.";
            newStatus = "entry";
          }
        } else if (qrAction === 'exit') {
          if (currentStatus === 'exit' || currentStatus === 'outside') {
            finalMessage = "Zaten çıkış yapıldı.";
            newStatus = "exit";
            isAlready = true;
          } else {
            finalMessage = "Kurumdan çıkıldı.";
            newStatus = "exit";
          }
        } else {
          if (currentStatus === 'entry') {
            finalMessage = "Kurumdan çıkıldı.";
            newStatus = "exit";
          } else {
            finalMessage = "Kurum girişi yapıldı.";
            newStatus = "entry";
          }
        }

        setSuccessMessage(finalMessage);
        setStudent({ ...foundStudent, id: studentId, name: studentName });
        setIsVerifying(false);

        const hw = localStorage.getItem('__bgz_hardware_id');
        if (hw && incognitoScore >= 50) {
          try { saveAutoLogin(foundStudent, hw); } catch (e) {}
        }

        // 3. VDS API, RTDB ve Firestore Bildirimi (Yalnızca yeni geçişse)
        if (!isAlready) {
          try {
            fetch('https://updates.chenki.net:8443/api/attendance/manual', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                studentId: studentId,
                studentName: studentName,
                action: newStatus,
                role: foundStudent?.role || 'student',
                method: 'web_qr'
              })
            }).catch(() => {});
          } catch (e) {}

          try {
            fetch('https://updates.chenki.net:8443/api/qr/scan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tc: studentTc || studentId || foundStudent?.schoolNumber || '',
                schoolNumber: foundStudent?.schoolNumber || '',
                sessionId,
                qrType,
                action: newStatus,
                deviceId: hw || 'unknown',
                hardwareId: hw || 'unknown',
                incognitoScore
              })
            }).catch(() => {});
          } catch (e) {}

          // 2. Realtime Database
          try {
            const dateString = new Date().toISOString().split('T')[0];
            const rtdbData = {
              sessionId: sessionId || "web_fallback",
              type: qrType || "web_qr",
              action: newStatus,
              status: newStatus,
              studentId: studentId,
              userId: studentId,
              studentName: studentName,
              userName: studentName,
              profileImageUrl: foundStudent?.profileImage || foundStudent?.profileImageUrl || "",
              timestamp: rtdbServerTimestamp(),
              date: dateString
            };

            const newLogRef = push(ref(rtdb, `qr_system/attendance_logs/${dateString}`));
            const updates = {};
            updates[`qr_system/attendance_logs/${dateString}/${newLogRef.key}`] = rtdbData;
            updates[`qr_system/live_scans/${newLogRef.key}`] = rtdbData;
            updates[`qr_system/gate_status/${studentId}`] = {
              status: newStatus,
              date: dateString,
              timestamp: rtdbServerTimestamp(),
              name: studentName,
              role: foundStudent?.role || "student"
            };

            update(ref(rtdb), updates).catch(() => {});
          } catch (e) {}

          // 3. Firestore (non-blocking)
          try {
            const statusRef = doc(db, "gate_status", studentId);
            setDoc(statusRef, {
              status: newStatus,
              date: todayStr,
              timestamp: serverTimestamp()
            }).catch(() => {});

            addDoc(collection(db, "attendance_logs"), {
              studentId: studentId,
              studentName: studentName,
              type: qrType,
              action: qrAction || "toggle",
              status: newStatus,
              sessionId: sessionId,
              timestamp: serverTimestamp()
            }).catch(() => {});
          } catch (e) {}

          // 4. WhatsApp
          try {
            sendWhatsAppNotification(studentId, studentName, newStatus, new Date());
          } catch (waErr) {}
        }
      } else {
        finalMessage = "Yoklamanız başarıyla alındı.";
        newStatus = "present";
        setSuccessMessage(finalMessage);
        setStudent({ ...foundStudent, id: studentId, name: studentName });
        setIsVerifying(false);
      }
    } catch (err) {
      console.error("Attendance processing error:", err);
      setPageError("Geçiş işlenirken bir hata oluştu: " + (err?.message || "Lütfen tekrar deneyiniz."));
    } finally {
      setIsVerifying(false);
    }
  };

  // ============================================================
  // TC INPUT HANDLER
  // ============================================================
  const handleTcChange = (e) => {
    setTcInput(roleMode === POOL_STUDENT ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value);
  };

  /** Firestore ve VDS kaydini gecis akisinin bekledigi sade nesneye cevirir. */
  const toPersonPayload = (u) => {
    const uId = String(u?._id || u?.id || (studentNumberOf(u) ? `std_${studentNumberOf(u)}` : `user_${Date.now()}`));
    const uName = personName(u) || u?.full_name || u?.fullName || u?.name || 'İsimsiz Kullanıcı';
    const pool = resolvePool(u);
    return {
      id: uId,
      _id: uId,
      name: uName,
      photo: u?.profile_image || u?.profileImageUrl || u?.profileImage ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(uName)}&background=9f1239&color=fff&size=200&bold=true`,
      tc: tcOf(u),
      schoolNumber: studentNumberOf(u),
      branch: u?.branch || u?.brans || u?.department || u?.departman || '',
      className: u?.class_name || u?.className || u?.sinif || u?.sube || '',
      role: u?.role || (pool === POOL_TEACHER ? 'teacher' : pool === POOL_ADMIN ? 'admin' : 'student'),
      pool,
      isStaff: pool === POOL_TEACHER || pool === POOL_ADMIN
    };
  };

  const confirmCandidate = async (payload) => {
    setCandidates(null);
    setIsVerifying(true);
    await processAttendance(payload);
  };

  /**
   * Kimlik girisi.
   *
   *   Ogrenci  -> okul numarasi
   *   Ogretmen -> ad + soyad
   *   Idare    -> ad + soyad
   *
   * Yalnizca ILK giriste sorulur; gecis kaydedildikten sonra kisi cihaza
   * yazilir ve sonraki okutmalarda tek dokunusla onaylanir. Cache verilen
   * karari sadakatle tekrarladigi icin ilk eslesmenin kesin olmasi sarttir.
   */
  const handlePassSubmit = async (rawInput) => {
    const raw = String(rawInput !== undefined ? rawInput : tcInput).trim();
    if (!raw) {
      alert(roleMode === POOL_STUDENT
        ? 'Lütfen okul numaranızı giriniz.'
        : 'Lütfen adınızı ve soyadınızı giriniz.');
      return;
    }

    const rateCheck = checkRateLimit();
    if (rateCheck.blocked) {
      alert(`Çok fazla deneme yaptınız. ${rateCheck.remaining} saniye bekleyin.`);
      setTcInput('');
      return;
    }

    setIsVerifying(true);

    try {
      let allUsers = cachedStudents || [];
      if (allUsers.length === 0) {
        try {
          const res = await fetch('https://updates.chenki.net:8443/api/users?limit=1000');
          if (res.ok) {
            const json = await res.json();
            if (json && Array.isArray(json.users) && json.users.length > 0) {
              allUsers = json.users;
              setCachedStudents(json.users);
            }
          }
        } catch (e) {}
      }

      if (allUsers.length === 0) {
        try {
          const snap = await getDocs(query(collection(db, 'users')));
          allUsers = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        } catch (e) {}
      }

      // Havuzlar burada ayrilir; arama secilen havuzun disina cikmaz.
      const pools = { [POOL_STUDENT]: [], [POOL_TEACHER]: [], [POOL_ADMIN]: [] };
      for (const u of allUsers) {
        const pool = resolvePool(u);
        if (pool) pools[pool].push(u);
      }

      let matches = [];

      if (roleMode === POOL_STUDENT) {
        const digits = raw.replace(/\D/g, '');
        if (digits) {
          matches = pools[POOL_STUDENT].filter((u) => studentNumberOf(u) === digits);
        }
        // Yedek: okul numarasi girilmemis ogrenciler icin TC son 4 hane.
        // Yalnizca ogrenci havuzunda arar, personele asla tasmaz.
        if (matches.length === 0 && /^\d{4}$/.test(digits)) {
          matches = pools[POOL_STUDENT].filter((u) => tcOf(u).endsWith(digits));
        }
      } else {
        matches = matchByName(pools[roleMode], raw);
        // Sekme yanlis secilmis olabilir; diger PERSONEL havuzuna da bakilir.
        // Rol kaydin kendisinden geldigi icin bu havuzlari karistirmaz.
        if (matches.length === 0) {
          const otherStaffPool = roleMode === POOL_TEACHER ? POOL_ADMIN : POOL_TEACHER;
          matches = matchByName(pools[otherStaffPool], raw);
        }
      }

      if (matches.length === 1) {
        await processAttendance(toPersonPayload(matches[0]));
        return;
      }

      if (matches.length > 1) {
        setCandidates(matches.map(toPersonPayload));
        setIsVerifying(false);
        return;
      }

      setIsVerifying(false);
      setTcInput('');
      alert(roleMode === POOL_STUDENT
        ? `"${raw}" numarasına kayıtlı öğrenci bulunamadı. Okul numaranızı kontrol ediniz.`
        : `"${raw}" adına kayıtlı öğretmen veya idareci bulunamadı. Adınızı ve soyadınızı sisteme kayıtlı hâliyle yazdığınızdan emin olunuz.`);
    } catch (error) {
      console.error('Geçiş sorgu hatası:', error);
      setIsVerifying(false);
      alert('Geçiş sorgulanırken bir hata oluştu: ' + (error?.message || ''));
    } finally {
      setIsVerifying(false);
    }
  };

  // ============================================================
  // RENDER: EXPIRED
  // ============================================================
      if (isExpired) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#103A69', fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif", color: 'white', textAlign: 'center', padding: 'calc(env(safe-area-inset-top, 24px) + 60px) 24px calc(env(safe-area-inset-bottom, 24px) + 24px)', boxSizing: 'border-box' }}>
        <ThemeColorUpdater topColor="#103A69" bottomColor="#103A69" />
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '2px solid rgba(239, 68, 68, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <h2 style={{ margin: '0 0 10px', fontSize: '24px', fontWeight: '800', color: '#ffffff' }}>Karekod Süresi Doldu</h2>
        <p style={{ margin: 0, opacity: 0.75, fontSize: '15px', maxWidth: '300px', lineHeight: '1.5' }}>Güvenlik nedeniyle bu karekod imha edilmiştir. Lütfen yeni bir karekod okutunuz.</p>
      </div>
    );
  }

  // ============================================================
  // RENDER: PAGE ERROR
  // ============================================================
    if (pageError) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#103A69', fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif", color: 'white', textAlign: 'center', padding: 'calc(env(safe-area-inset-top, 24px) + 60px) 24px calc(env(safe-area-inset-bottom, 24px) + 24px)', boxSizing: 'border-box' }}>
        <ThemeColorUpdater topColor="#103A69" bottomColor="#103A69" />
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '2px solid rgba(239, 68, 68, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: '24px', fontWeight: '800', color: '#ffffff' }}>Erişim Reddedildi</h2>
        <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.12)', color: '#ffffff', padding: '14px 20px', borderRadius: '14px', fontSize: '15px', fontWeight: '600', textAlign: 'center', border: '1px solid rgba(255,255,255,0.2)', maxWidth: '300px', lineHeight: '1.4' }}>
          {pageError}
        </div>
      </div>
    );
  }


  // ============================================================
  // RENDER: STUDENT RESULT
  // ============================================================
    if (student) {
    const isWarning = successMessage.includes("Zaten") || successMessage.includes("Önce") || successMessage.includes("Güvenlik") || successMessage.includes("süresi");
    const isCheckout = successMessage.toLowerCase().includes('çık');

    let subText = "Bu işlem zaten kayıt altına alınmış. Çift geçiş yapmanıza gerek yoktur.";
    if (successMessage.includes("Önce")) {
      subText = "Giriş yapmadan çıkış yapamazsınız.";
    } else if (successMessage.includes("Güvenlik") || successMessage.includes("süresi")) {
      subText = "Karekod okutma işlemi sırasında bir güvenlik kuralı ihlali tespit edildi.";
    } else if (isCheckout) {
      subText = "Kurumdan çıkış işleminiz kaydedildi. İyi günler dileriz.";
    } else {
      subText = "Kurum girişi başarıyla kaydedildi. İyi dersler dileriz.";
    }

    // Solid colors without gradients or glows
    const solidBg = isWarning ? '#C2410C' : (isCheckout ? '#9F1239' : '#047857');

    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: solidBg, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif", color: '#ffffff', textAlign: 'center', overflowX: 'hidden', overflowY: 'auto', boxSizing: 'border-box' }}>
        <ThemeColorUpdater topColor={solidBg} bottomColor={solidBg} />
        
        <div style={{ padding: 'calc(env(safe-area-inset-top, 24px) + 54px) 24px calc(env(safe-area-inset-bottom, 24px) + 36px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '380px', boxSizing: 'border-box', zIndex: 10 }}>
          
          <div style={{ position: 'relative', marginBottom: '20px' }}>
            <img src={student.photo} alt="Profile" style={{ width: '116px', height: '116px', borderRadius: '50%', objectFit: 'cover', border: '4px solid #ffffff', display: 'block' }} />
            
            <div style={{ position: 'absolute', bottom: '2px', right: '2px', backgroundColor: isWarning ? '#ef4444' : (isCheckout ? '#be123c' : '#10b981'), width: '34px', height: '34px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid #ffffff' }}>
              {isWarning ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              ) : isCheckout ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              )}
            </div>
          </div>
          
          <h2 style={{ margin: '0 0 6px', fontSize: '26px', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.3px' }}>
            {isWarning 
              ? 'Bir Saniye!' 
              : (isCheckout ? 'Görüşmek Üzere' : 'Hoş geldiniz')}
          </h2>
          
          <h3 style={{ margin: '0 0 18px', fontSize: '19px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.95)' }}>
            {student.name}
          </h3>
          
          <div style={{ 
            backgroundColor: 'rgba(255, 255, 255, 0.2)', 
            color: '#ffffff', 
            padding: '12px 24px', 
            borderRadius: '14px', 
            fontSize: '15px', 
            fontWeight: '700', 
            textAlign: 'center', 
            border: '1px solid rgba(255,255,255,0.25)', 
            width: '100%',
            maxWidth: '300px', 
            boxSizing: 'border-box'
          }}>
            {successMessage}
          </div>

          <p style={{ margin: '18px 0 0', fontSize: '14px', color: 'rgba(255, 255, 255, 0.85)', maxWidth: '290px', lineHeight: '1.5', fontWeight: '500' }}>
            {subText}
          </p>

          <div style={{ marginTop: '24px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.55)', fontWeight: '600', letterSpacing: '0.5px' }}>
            BOĞAZİÇİ KOLEJİ · GÜVENLİ GEÇİŞ
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER: MAIN QR PAGE
  // ============================================================
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
      backgroundColor: '#103A69',
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
      overflowX: 'hidden',
      color: '#ffffff'
    }}>
      <ThemeColorUpdater topColor="#0f172a" bottomColor="#0f172a" />
      
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, width: '100%', minHeight: '100dvh', boxSizing: 'border-box' }}>
        
        {/* Top Header / Branding */}
        <div style={{
          position: 'relative',
          width: '100%',
          padding: 'calc(env(safe-area-inset-top, 24px) + 32px) 24px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box'
        }}>
          {/* Timer Badge */}
          <div style={{
            position: 'absolute',
            top: 'calc(env(safe-area-inset-top, 24px) + 16px)',
            right: '24px',
            backgroundColor: 'rgba(255,255,255,0.08)',
            color: '#ffffff',
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              {/* Minimal Logo */}
              <div style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '16px', backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', padding: '12px', boxSizing: 'border-box' }}>
                 <img src="/IMG_4327.PNG" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              
              {/* QR Code Icon */}
              <div style={{ width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '16px', backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', padding: '12px', boxSizing: 'border-box', color: '#ffffff' }}>
                 <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
                    <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
                    <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
                    <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
                    <path d="M6 6h.01M17 6h.01M17 17h.01M6 17h.01"></path>
                 </svg>
              </div>
            </div>
            <h1 style={{ margin: '0 0 4px', fontSize: '22px', fontWeight: '600', color: '#ffffff', letterSpacing: '-0.3px' }}>
              BGZ Mobil
            </h1>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: '500', color: '#94a3b8', letterSpacing: '0.5px' }}>
              GÜVENLİ GEÇİŞ
            </p>
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '24px',
          zIndex: 10,
          boxSizing: 'border-box'
        }}>
          <div style={{ width: '100%', maxWidth: '340px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            
            {!showFallback ? (
              // APP REDIRECT VIEW
              <>
                <h2 style={{ color: '#ffffff', fontSize: '20px', fontWeight: '600', margin: '0 0 12px', letterSpacing: '-0.3px' }}>Karekod Okundu</h2>
                <p style={{ color: '#94a3b8', fontSize: '15px', lineHeight: '1.5', margin: '0 0 32px', fontWeight: '400' }}>Bu işlemi tamamlayabilmek için <strong style={{ color: '#ffffff', fontWeight: '600' }}>BGZ Mobil</strong> uygulamasını açmalısınız.</p>

                <button onClick={openInApp} style={{ width: '100%', padding: '16px', backgroundColor: '#ffffff', color: '#0f172a', border: 'none', borderRadius: '14px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                  Uygulamada Aç
                </button>

                <a href={storeLink} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '16px', backgroundColor: 'rgba(255,255,255,0.06)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', fontSize: '15px', fontWeight: '500', textDecoration: 'none', boxSizing: 'border-box', marginBottom: '24px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  Uygulamayı İndir {osName && `(${osName})`}
                </a>

                <button onClick={startFallback} style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '14px', fontWeight: '500', cursor: 'pointer', padding: '8px' }}>
                  Uygulamanız yok mu? Tarayıcıdan onaylayın
                </button>
              </>
            ) : (
              // WEB FALLBACK / MANUAL ENTRY VIEW
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ textAlign: 'center' }}>
                  <h2 style={{ color: '#ffffff', fontSize: '20px', fontWeight: '600', margin: '0 0 8px' }}>
                    {(() => {
                      const urlP = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
                      const t = urlP.get('type');
                      const a = urlP.get('action');
                      if (t === 'attendance' || t === 'yoklama') return 'Web Yoklama';
                      if (a === 'exit') return 'Web Çıkış';
                      return 'Web Kurum Girişi';
                    })()}
                  </h2>
                </div>

                {/* GEO STATUS MESSAGES */}
                {geoStatus === 'allowed' && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', color: '#4ade80', fontSize: '13px', fontWeight: '500', backgroundColor: 'rgba(74, 222, 128, 0.1)', padding: '10px', borderRadius: '10px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    Konum Doğrulandı
                  </div>
                )}
                {geoStatus === 'checking' && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '13px', fontWeight: '500', backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: '10px', borderRadius: '10px' }}>
                    Güvenlik için konumunuz doğrulanıyor...
                  </div>
                )}
                {(geoStatus === 'far' || geoStatus === 'timeout' || geoStatus === 'denied') && (
                  <div style={{ color: '#f87171', padding: '16px', backgroundColor: 'rgba(248, 113, 113, 0.1)', borderRadius: '14px', fontSize: '14px', border: '1px solid rgba(248, 113, 113, 0.2)', textAlign: 'left', lineHeight: '1.5' }}>
                    {geoStatus === 'far' && "Kurum konumundan uzaktasınız. Yoklama işlemi buradan yapılamaz."}
                    {geoStatus === 'timeout' && (
                      <>
                        Konum tespiti çok uzun sürdü veya sinyal alınamadı.
                        <button onClick={startFallback} style={{ display: 'block', marginTop: '12px', padding: '8px 16px', backgroundColor: 'rgba(248, 113, 113, 0.15)', color: '#f87171', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', width: '100%' }}>Tekrar Dene</button>
                      </>
                    )}
                    {geoStatus === 'denied' && (
                      <>
                        <strong>Konum izni reddedildi.</strong> Sistem güvenliği gereği konum izni olmadan geçiş yapamazsınız.
                        <button onClick={() => window.location.reload()} style={{ display: 'block', marginTop: '12px', padding: '8px 16px', backgroundColor: 'rgba(248, 113, 113, 0.15)', color: '#f87171', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', width: '100%' }}>Sayfayı Yenile</button>
                      </>
                    )}
                  </div>
                )}

                {/* MAIN FORMS / CONTENT */}
                {geoStatus === 'allowed' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', width: '100%' }}>
                    {isVerifying ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '24px 0', width: '100%' }}>
                        <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#ffffff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        <div style={{ textAlign: 'center' }}>
                          <h3 style={{ margin: '0 0 6px 0', color: '#ffffff', fontSize: '16px', fontWeight: '500' }}>İşleminiz Gerçekleştiriliyor</h3>
                          <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>Lütfen bekleyin...</p>
                        </div>
                        <style>
                          {`@keyframes spin { to { transform: rotate(360deg); } }`}
                        </style>
                      </div>
                    ) : autoLoginReady && autoLoginStudent ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%' }}>
                        <img src={autoLoginStudent.photo} alt="Profile" style={{ width: '72px', height: '72px', borderRadius: '36px', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.1)' }} />
                        <p style={{ color: '#ffffff', fontSize: '18px', fontWeight: '500', margin: 0 }}>{autoLoginStudent.name}</p>
                        
                        <button 
                          onClick={handleAutoLoginConfirm}
                          style={{ width: '100%', padding: '16px', backgroundColor: '#ffffff', color: '#0f172a', border: 'none', borderRadius: '14px', fontSize: '16px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '8px' }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          Otomatik Girişi Onayla
                        </button>
                        
                        <button 
                          onClick={() => {
                            try {
                              localStorage.removeItem('__bgz_auto_login');
                              localStorage.removeItem('bgz_user_profile');
                              localStorage.removeItem('__bgz_bound_user_tc');
                            } catch (e) {}
                            setAutoLoginStudent(null);
                            setTcInput('');
                          }}
                          style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '14px', fontWeight: '400', cursor: 'pointer', padding: '8px' }}
                        >
                          Farklı bir hesapla giriş yap
                        </button>
                      </div>
                    ) : candidates ? (
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                          <h3 style={{ color: '#ffffff', fontSize: '17px', fontWeight: '600', margin: '0 0 6px' }}>{candidates.length} kayıt bulundu</h3>
                          <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>Lütfen kendi profilinizi seçiniz.</p>
                        </div>

                        {candidates.map((aday) => (
                          <button
                            key={aday.id}
                            type="button"
                            onClick={() => confirmCandidate(aday)}
                            style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%', padding: '12px 16px', borderRadius: '14px', cursor: 'pointer', textAlign: 'left', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)' }}
                          >
                            <img src={aday.photo} alt="" style={{ width: '44px', height: '44px', borderRadius: '22px', objectFit: 'cover', flexShrink: 0 }} />
                            <span style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                              <span style={{ color: '#ffffff', fontSize: '15px', fontWeight: '500' }}>{aday.name}</span>
                              <span style={{ color: '#94a3b8', fontSize: '13px' }}>{[poolLabel(aday.pool), aday.branch || aday.className].filter(Boolean).join(' \u00b7 ')}</span>
                            </span>
                          </button>
                        ))}

                        <button
                          type="button"
                          onClick={() => { setCandidates(null); setTcInput(''); }}
                          style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '14px', fontWeight: '500', cursor: 'pointer', marginTop: '8px', padding: '8px' }}
                        >
                          Hiçbiri, tekrar yazayım
                        </button>
                      </div>
                    ) : (
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Segmented Control */}
                        <div style={{ display: 'flex', width: '100%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '12px', padding: '4px' }}>
                          {[
                            { key: POOL_STUDENT, label: 'Öğrenci' },
                            { key: POOL_TEACHER, label: 'Öğretmen' },
                            { key: POOL_ADMIN, label: 'İdare' }
                          ].map((tab) => (
                            <button
                              key={tab.key}
                              type="button"
                              onClick={() => { setRoleMode(tab.key); setTcInput(''); setCandidates(null); }}
                              style={{
                                flex: 1, padding: '10px 4px', borderRadius: '8px', border: 'none',
                                backgroundColor: roleMode === tab.key ? 'rgba(255,255,255,0.15)' : 'transparent',
                                color: roleMode === tab.key ? '#ffffff' : '#94a3b8',
                                fontWeight: '500', fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: roleMode === tab.key ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                              }}
                            >
                              {tab.label}
                            </button>
                          ))}
                        </div>

                        <div style={{ textAlign: 'center' }}>
                          <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0, lineHeight: 1.5 }}>
                            {roleMode === POOL_STUDENT ? 'Okul numaranızı giriniz' : 'Adınızı ve soyadınızı giriniz'}
                          </p>
                        </div>

                        <form onSubmit={(e) => { e.preventDefault(); handlePassSubmit(); }} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <input
                            ref={inputRef}
                            type={roleMode === POOL_STUDENT ? 'tel' : 'text'}
                            inputMode={roleMode === POOL_STUDENT ? 'numeric' : 'text'}
                            autoCapitalize="words"
                            autoCorrect="off"
                            autoComplete="off"
                            spellCheck={false}
                            value={tcInput}
                            onChange={handleTcChange}
                            placeholder={roleMode === POOL_STUDENT ? 'Örn: 406' : 'Örn: Seçil Özkan'}
                            onFocus={(e) => { setIsFocused(true); e.target.style.borderColor = 'rgba(255,255,255,0.4)'; }}
                            onBlur={(e) => { setIsFocused(false); e.target.style.borderColor = 'rgba(255,255,255,0.15)'; }}
                            style={{
                              width: '100%', boxSizing: 'border-box', padding: '16px', borderRadius: '14px',
                              border: '1px solid rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.03)',
                              color: '#ffffff', fontWeight: '500', textAlign: 'center', outline: 'none',
                              fontSize: '18px', transition: 'border-color 0.2s ease', WebkitAppearance: 'none'
                            }}
                          />

                          <button
                            type="submit"
                            style={{
                              width: '100%', padding: '16px', borderRadius: '14px', border: 'none',
                              backgroundColor: '#ffffff', color: '#0f172a', fontSize: '16px', fontWeight: '600',
                              cursor: 'pointer', marginTop: '4px'
                            }}
                          >
                            Onayla
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '32px', paddingBottom: isFocused ? '40vh' : '0', transition: 'padding 0.3s ease', textAlign: 'center', opacity: 0.6 }}>
            <p style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '400', margin: 0, letterSpacing: '0.2px' }}>
              Boğaziçi Koleji &copy; {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRCodeRedirect;