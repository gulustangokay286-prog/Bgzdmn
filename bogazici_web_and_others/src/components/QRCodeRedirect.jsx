"use client";

const boundStudentTcMismatch = (bTc, sTc) => {
  if (!bTc || !sTc) return false;
  return String(bTc).trim() !== String(sTc).trim();
};

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { vds } from '../services/vds';
import fpPromise from '@fingerprintjs/fingerprintjs';
import { detectIncognito as detectIncognitoLib } from 'detectincognitojs';
import {
  GateShell, GateSolid, GateHeader, Button, FormBar, RoleGrid,
  PinInput, NameInput, PersonCard, Note, IconRing, Footer, GateSplash,
  DogrulamaAnimasyonu, EngelAnimasyonu
} from './qr/Gate';
import {
  IconAlert, IconClock, IconPin, IconExternal, IconCheck, IconExit,
  IconStudent, IconTeacher, IconAdmin, IconParent
} from './qr/Icons';

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

/* Kullanici listesi onbellegi KALDIRILDI: liste artik hic indirilmiyor,
   eslestirme sunucuda yapiliyor. Auto-login kaydi ayri anahtarda durur. */

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

/*
 * ASGARI DOGRULAMA SURESI
 *
 * Kullanici listesi onbellekteyken eslestirme tek karede bitiyor; React
 * "dogrulaniyor" ve "sonuc" durumlarini ayni cizime katlayip bekleme ekranini
 * hic gostermiyordu. Sonuc: ekran bir anda ziplayarak degisiyor, ne olup
 * bittigi okunmuyordu. Kisa bir taban sure hem gecisi okunur kilar hem de
 * bekleme maskotunun gorulmesini garanti eder.
 */
const DOGRULAMA_TABAN_MS = 620;
const tabanSureyiBekle = (baslangic) => {
  const kalan = DOGRULAMA_TABAN_MS - (Date.now() - baslangic);
  return kalan > 0 ? new Promise((c) => setTimeout(c, kalan)) : Promise.resolve();
};

const POOL_STUDENT = 'student';
const POOL_TEACHER = 'teacher';
const POOL_ADMIN = 'admin';
const POOL_PARENT = 'parent';

const STUDENT_POOL_ROLES = ['student', 'öğrenci', 'ogrenci'];
const TEACHER_POOL_ROLES = ['teacher', 'öğretmen', 'ogretmen'];
const PARENT_POOL_ROLES = ['parent', 'veli'];
/* Ogretmen olmayan tum calisanlar. Ayri bir dorduncu havuz istenirse tek
   yapilacak sey bu diziyi bolmektir. */
const ADMIN_POOL_ROLES = ['admin', 'yönetici', 'yonetici', 'superadmin', 'patron', 'personnel', 'personel', 'staff'];

const studentNumberOf = (u) => String(u?.school_number || u?.schoolNumber || u?.student_number || u?.okulNo || u?.no || '').trim();

/* Veli kendi numarasiyla degil, cocugunun okul numarasiyla taninir. Kayitta
   tek cocuk `child_school_number`, birden fazlaysa `child_school_numbers`
   alaninda durur; ikisi de tek listede toplanir. */
const childNumbersOf = (u) => {
  const cok = Array.isArray(u?.child_school_numbers) ? u.child_school_numbers : [];
  const tek = u?.child_school_number ?? u?.childSchoolNumber;
  return [...cok, tek]
    .map((n) => String(n ?? '').trim())
    .filter(Boolean);
};

/** Veli satirinda gosterilecek cocuk adi. */
const childNameOf = (u) => {
  if (u?.child_name) return String(u.child_name);
  if (Array.isArray(u?.child_names) && u.child_names.length) return u.child_names.join(', ');
  return '';
};
const tcOf = (u) => String(u?.tc_kimlik || u?.tc || u?.tcNo || u?.tcKimlik || u?.identityNumber || u?.idNumber || '').trim();

const resolvePool = (user) => {
  const role = String(user?.role || '').toLowerCase().trim();
  if (PARENT_POOL_ROLES.includes(role)) return POOL_PARENT;
  if (TEACHER_POOL_ROLES.includes(role)) return POOL_TEACHER;
  if (ADMIN_POOL_ROLES.includes(role)) return POOL_ADMIN;
  if (STUDENT_POOL_ROLES.includes(role)) return user?.isStaff ? POOL_ADMIN : POOL_STUDENT;
  if (user?.isStaff) return POOL_ADMIN;
  return studentNumberOf(user) ? POOL_STUDENT : null;
};

const poolLabel = (pool) => {
  if (pool === POOL_PARENT) return 'Veli';
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

/** Havuz kimliginden okunabilir etiket. */
/* Havuz basina kullanici metinleri — dort rol icin tek yerde. */
const BOS_UYARISI = {
  [POOL_STUDENT]: 'Lütfen okul numaranızı giriniz.',
  [POOL_PARENT]: 'Lütfen çocuğunuzun okul numarasını giriniz.',
  [POOL_TEACHER]: 'Lütfen adınızı ve soyadınızı giriniz.',
  [POOL_ADMIN]: 'Lütfen adınızı ve soyadınızı giriniz.'
};

const BULUNAMADI = {
  [POOL_STUDENT]: (v) => `"${v}" numarasına kayıtlı öğrenci bulunamadı. Okul numaranızı kontrol ediniz.`,
  [POOL_PARENT]: (v) => `"${v}" numarasına kayıtlı veli bulunamadı. Çocuğunuzun okul numarasını kontrol ediniz.`,
  [POOL_TEACHER]: (v) => `"${v}" adına kayıtlı öğretmen bulunamadı. Adınızı ve soyadınızı sisteme kayıtlı hâliyle yazdığınızdan emin olunuz.`,
  [POOL_ADMIN]: (v) => `"${v}" adına kayıtlı idareci bulunamadı. Adınızı ve soyadınızı sisteme kayıtlı hâliyle yazdığınızdan emin olunuz.`
};

/* Okul numarasiyla taninan havuzlar PIN kutusu kullanir; personel havuzlari
   ad-soyad alani. Veri tarafinda tum okul numaralari uc hanelidir. */
const PIN_UZUNLUK = 3;
const numaraliHavuz = (havuz) => havuz === POOL_STUDENT || havuz === POOL_PARENT;

const havuzEtiketi = (havuz) => {
  if (havuz === POOL_PARENT) return 'Veli';
  if (havuz === POOL_TEACHER) return 'Öğretmen';
  if (havuz === POOL_ADMIN) return 'İdare';
  if (havuz === POOL_STUDENT) return 'Öğrenci';
  return '';
};

/**
 * Sonuc ekrani.
 *
 * BILESEN DISARIDA TANIMLI OLMALI. Icinde tanimlandiginda her cizimde YENI
 * bir bilesen tipi olusuyor; React eskisini sokup yenisini kuruyor, giris
 * animasyonlari bastan basliyor ve ekran saniyede bir yanip sonuyordu
 * (geri sayim her saniye yeniden cizime yol aciyor).
 */
const DurumEkrani = ({ ikon, baslik, metin, cocuk, perde }) => (
  <>
    <GateSolid>
      <div className="gate-in gate-in--1"><IconRing tone="danger">{ikon}</IconRing></div>
      <h1 className="gate__result-title gate-in gate-in--2">{baslik}</h1>
      {metin && <p className="gate__result-text gate-in gate-in--3" style={{ maxWidth: 300 }}>{metin}</p>}
      {cocuk}
      <Footer />
    </GateSolid>
    {perde}
  </>
);

/**
 * Sunucunun sordugu onay penceresi.
 * DISARIDA tanimli: icinde tanimlandiginda her cizimde yeniden kuruluyor,
 * kutunun isareti kayboluyor ve pencere yanip sonuyordu.
 */
const OnayPenceresi = ({ onaySorusu, kabul, setKabul, kapat, devamEt }) => {
    if (!onaySorusu) return null;
    /* Erken cikista kullanici ACIKCA kabul etmeli: tek dokunusla gecilmesin,
       "erken ciktigimi kabul ediyorum" isaretlenmeden dugme acilmaz. */
    const kabulGerek = onaySorusu.kod === 'ERKEN_CIKIS_ONAY';
    /* Saatle ilgili sorularda saat ikonu, digerlerinde uyari ikonu.
       Emoji kullanilmiyor: ekranin geri kalani 2px cizgi ikon dilinde. */
    const saatSorusu = /CIKIS|GIRIS|SAAT/.test(String(onaySorusu.kod || ''));
    return (
      <div className="gate__onay-perde" role="dialog" aria-modal="true"
           aria-labelledby="gate-onay-baslik">
        <div className="gate__onay">
          <div className={`gate__onay-ikon${saatSorusu ? '' : ' gate__onay-ikon--uyari'}`}>
            {saatSorusu ? <IconClock size={28} /> : <IconAlert size={28} />}
          </div>

          <h3 id="gate-onay-baslik" className="gate__onay-baslik">{onaySorusu.baslik}</h3>
          <p className="gate__onay-mesaj">{onaySorusu.mesaj}</p>
          {onaySorusu.ayrinti && (
            <p className="gate__onay-ayrinti">{onaySorusu.ayrinti}</p>
          )}

          {kabulGerek && (
            <label className={`gate__onay-kabul${kabul ? ' gate__onay-kabul--acik' : ''}`}>
              <input type="checkbox" checked={kabul}
                     onChange={(e) => setKabul(e.target.checked)} />
              <span>Okul çıkış saatinden önce ayrıldığımı kabul ediyorum.</span>
            </label>
          )}

          <div className="gate__onay-dugmeler">
            <button type="button" className="gate__onay-dugme gate__onay-dugme--vazgec"
                    onClick={kapat}>
              Vazgeç
            </button>
            <button type="button" className="gate__onay-dugme gate__onay-dugme--onay"
                    disabled={kabulGerek && !kabul} onClick={devamEt}>
              {kabulGerek ? 'Çıkışı onayla' : 'Evet, devam et'}
            </button>
          </div>
        </div>
      </div>
    );
};


const QRCodeRedirect = () => {
  const [params, setParams] = useState('');
  const [storeLink, setStoreLink] = useState('#');
  const [osName, setOsName] = useState('');
  
  // Security
  const [isExpired, setIsExpired] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const sayacRef = useRef(null);
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
  /* Rol acilista bos: once dort secenek gosterilir, secildikten sonra o role
     ait form acilir. `null` = secenek ekrani. */
  const [roleMode, setRoleMode] = useState(null);
  // Ad ve soyadi harfi harfine ayni birden fazla kayit varsa adaylar burada tutulur.
  const [candidates, setCandidates] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [student, setStudent] = useState(null);
  const [successMessage, setSuccessMessage] = useState("Yoklamanız başarıyla alındı.");
  // Sunucunun "emin misin" sorusu ve gecis ayrintisi
  const [onaySorusu, setOnaySorusu] = useState(null);
  const [kabul, setKabul] = useState(false);
  const [gecisAyrinti, setGecisAyrinti] = useState(null);

  /* Sonuc ya da hata ekrani acilinca geri sayimi durdur: ekran sabit kalsin. */
  useEffect(() => {
    if ((student || pageError) && sayacRef.current) {
      clearInterval(sayacRef.current);
      sayacRef.current = null;
    }
  }, [student, pageError]);
  const [isFocused, setIsFocused] = useState(false);

  const inputRef = useRef(null);

  /*
   * ACILIS PERDESI
   *
   * Perde her aciliste kisa sure gorunur: hem kuruma ait bir acilis ani verir
   * hem de ilk karede yapilan gorunum olcumunu (bkz. Gate.jsx > useViewportLock)
   * kullanicidan gizler.
   *
   * Yerlesim kilidi artik GateShell'in icinde; burada ayrica sayfa kaydirmasiyla
   * ugrasmaya gerek yok.
   */
  const [splashBitti, setSplashBitti] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSplashBitti(true), 1560);
    return () => clearTimeout(t);
  }, []);

  /* Karekodun turu ekranin basligini belirler. */
  const ekranBasligi = useMemo(() => {
    if (typeof window === 'undefined') return 'Web Kurum Giriş Ekranı';
    const p = new URLSearchParams(window.location.search);
    const t = p.get('type');
    if (t === 'attendance' || t === 'yoklama') return 'Web Yoklama Ekranı';
    if (p.get('action') === 'exit') return 'Web Çıkış Ekranı';
    return 'Web Kurum Giriş Ekranı';
  }, []);


  // ============================================================
  // INITIALIZATION
  // ============================================================
  useEffect(() => {
    /*
     * Sayfa kaydirmasi kilitlenir.
     *
     * Ekran `position: fixed` olsa da belge hâlâ kaydirilabilir kaliyordu;
     * mobil tarayici adres cubugunu toplayip acarken sayfa yukari kaymis
     * gorunuyor ve kullanici asagi cekene kadar duzelmiyordu. Govde ve kok
     * ogenin yuksekligi sabitlenip tasma kapatilinca kayacak alan kalmiyor.
     */
    document.body.style.margin = '0';
    document.body.style.padding = '0';

    const oncekiStil = {
      htmlHeight: document.documentElement.style.height,
      htmlOverflow: document.documentElement.style.overflow,
      bodyHeight: document.body.style.height,
      bodyOverflow: document.body.style.overflow,
      bodyOverscroll: document.body.style.overscrollBehavior
    };
    document.documentElement.style.height = '100%';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.height = '100%';
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    window.scrollTo(0, 0);
    
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
      /* Zaman asimi SART: kutuphane CDN'den yuklenirken zayif baglantida
         takilirsa parmak izi hic uretilemiyor ve ekran "İşleminiz
         gerçekleştiriliyor" adiminda asili kaliyordu. Takilirsa gecici bir
         kimlikle devam edilir; gecis engellenmez. */
      try {
        const fp = await Promise.race([
          (async () => { const f = await fpPromise.load(); return (await f.get()).visitorId; })(),
          new Promise((_, red) => setTimeout(() => red(new Error('fp-timeout')), 12000)),
        ]);
        fpId = fp;
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
      
      /* GIZLI SEKME KORUMASI KAPALI (idare karari, 16 Eylul 2026).
         Tespit yanlis pozitif veriyor ve ogrenciler kapida kaliyordu; skor
         yalnizca kayit amacli tutulur, gecisi ENGELLEMEZ. */
      if (incognito.isIncognito) {
        console.warn('[QR] gizli sekme sinyali (engellenmedi):', incognito.flags.join(','));
      }
      
      // 5. Auto-Login Check (hardware ID ile eşleştir)
      const saved = await getAutoLogin(composite.hardwareId);
      if (saved) {
        /* Tanimli cihaz güncel karekodu okuttugunda gecis otomatik islenir.
           Eski ya da degistirilmis karekodlar bu noktaya ulassa bile sunucu
           timestamp + nonce kontrolunde, veri yazmadan once reddeder. */
        setAutoLoginStudent(saved);
        setIsVerifying(true);
        processAttendance(saved);
      }
      setAutoLoginReady(true);
      
      // === STRICT URL CLAIM (1 URL 1 BROWSER + RELOAD PROTECTION) ===
      const urlParamsForClaim = new URLSearchParams(window.location.search);
      const urlSessionId = urlParamsForClaim.get('sessionId');
      
      // URL sahiplenme kaydi kaldirildi: karekod jetonu artik sunucuda TEK
      // KULLANIMLIK olarak tuketiliyor (/api/qr/scan). Istemcinin yazdigi bir
      // sahiplenme belgesi bundan daha zayif bir garantiydi.
      
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
           // Bu yalnizca ERKEN UYARIDIR: eski bir fotograf okutulduysa kullanici
           // bosuna beklemesin. Asil koruma sunucuda: jeton tek kullanimlik.
           const qrTimestamp = parseInt(urlParams.get('timestamp') || "0", 10);
           const nowSec = Math.floor(Date.now() / 1000);
           const age = qrTimestamp > 0 ? (nowSec - qrTimestamp) : 0;
           if (qrTimestamp > 0 && Math.abs(age) >= 900) {
              setPageError(`Bu karekodun süresi dolmuş veya başkası tarafından çekilmiş bir fotoğraf. Lütfen güncel karekodu okutun.`);
              return;
           }
         } catch (error) {
           console.warn("Nonce validation notice:", error);
         }
      };
      checkAndClaimLink();
    }

    // Ogrenci listesi ONCEDEN INDIRILMIYOR.
    // Onceden bu ekran tum kullanici kadrosunu tarayiciya cekip eslestirmeyi
    // yerel yapiyordu; herkese acik bir sayfada butun okulun listesi demekti.
    // Artik yalnizca girilen deger sunucuya gider (/api/qr/kim), geriye
    // sadece eslesen kisi(ler) doner.

    // === ADVANCED OS & HARDWARE DETECTION ===
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    if (/android/i.test(userAgent)) {
      setStoreLink('https://play.google.com/store/apps/details?id=com.ial.mobil');
      setOsName('Android');
    } else if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
      setStoreLink('https://apps.apple.com/tr/app/id123456789');
      setOsName('iOS');
    }

    /* 60 saniyelik gecerlilik sayaci.
       Sayac yalnizca KAREKOD BEKLERKEN calisir. Sonuc ya da hata ekrani
       gorunurken saniyede bir durum guncellemek tum agaci yeniden cizdiriyor,
       giris animasyonlari bastan basliyor ve ekran yanip sonuyordu. */
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
    sayacRef.current = timer;

    return () => {
      clearInterval(timer);
      // Ekrandan cikilinca sayfa kaydirmasi eski hâline birakilir.
      document.documentElement.style.height = oncekiStil.htmlHeight;
      document.documentElement.style.overflow = oncekiStil.htmlOverflow;
      document.body.style.height = oncekiStil.bodyHeight;
      document.body.style.overflow = oncekiStil.bodyOverflow;
      document.body.style.overscrollBehavior = oncekiStil.bodyOverscroll;
    };
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
      // Konum kontrolu kurum karariyla devre disi; ayar okumaya gerek yok.
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
  /**
   * Gecis islemi.
   * @param onay Sunucu "emin misin" diye sorduysa (onay_gerekli) kullanicinin
   *             verdigi karar. Ikinci cagride true gonderilir.
   */
  const processAttendance = async (foundStudent, onay = false) => {
    /* CIHAZ KISIYI HATIRLAR.
       Kimlik cozuldugu anda kaydedilir — gecis kabul edilse de edilmese de.
       Tanima ile yetki ayri seylerdir: gec kalip iceri alinmayan biri de
       bir dahaki okutmada numarasini tekrar yazmak zorunda kalmamali.
       Kayit donanim kimligine baglidir; baska cihazda gecerli olmaz. */
    if (foundStudent?.name) {
      try { await saveAutoLogin(foundStudent, hardwareId); } catch { /* depolama kapali */ }
    }
    const dogrulamaBasi = Date.now();
    try {
      const studentId = String(foundStudent?.id || foundStudent?._id || (foundStudent?.schoolNumber ? `std_${foundStudent.schoolNumber}` : `user_${Date.now()}`));
      const studentName = foundStudent?.name || foundStudent?.full_name || 'Öğrenci';
      const studentTc = foundStudent?.tc || '';

      // Sticky ID Check: If device is bound to another TC, reject
      try {
        const boundTc = localStorage.getItem('__bgz_bound_user_tc');
        /* CIHAZ-KIMLIK KILIDI KAPALI (idare karari, 16 Eylul 2026): ayni
           telefonu kullanan kardesler/arkadaslar kapida kaliyordu. Sadece log. */
        if (boundTc && studentTc && boundStudentTcMismatch(boundTc, studentTc)) {
          console.warn('[QR] cihaz baska kimlige bagli (engellenmedi)');
        }
        if (studentTc) {
          localStorage.setItem('__bgz_bound_user_tc', studentTc);
        }
      } catch (e) {}

      const urlParams = new URLSearchParams(window.location.search);
      const qrType = urlParams.get('type') || 'institution';
      const sessionId = urlParams.get('sessionId') || 'web_fallback';
      const nowSec = Math.floor(Date.now() / 1000);
      const todayStr = new Date().toISOString().split('T')[0];

      let finalMessage = "Yoklamanız başarıyla alındı.";
      let newStatus = "present";

      // Gizli sekme korumasi kapali: skor engellemez (bkz. yukaridaki not).

      if (qrType === 'institution' || qrType === 'kurum' || qrType === 'institution_gate') {
        const qrAction = urlParams.get('action');
        const qrTimestamp = Number(urlParams.get('timestamp'));

        /* Gecis kaydi TEK istekle alinir.
         *
         * Onceden burada kapi durumu uc ayri dis kaynaktan okunur, giris mi cikis mi oldugu TARAYICIDA karara
         * baglanir, sonra iki yere yazilirdi. Kaynaklar birbirini tutmadiginda
         * ayni ogrenci iki kez sayilabiliyordu. Artik karar sunucuda: ayni
         * yonu tekrar okutmak yeni kayit uretmez. */
        let yanit;
        try {
          yanit = await vds.post('/api/qr/scan', {
            nonce: sessionId && sessionId !== 'web_fallback' ? sessionId : undefined,
            timestamp: Number.isFinite(qrTimestamp) && qrTimestamp > 0 ? qrTimestamp : undefined,
            okulNo: foundStudent?.schoolNumber || undefined,
            tamAd: foundStudent?.schoolNumber ? undefined : studentName,
            rol: foundStudent?.pool || undefined,
            cihazId: (() => { try { return localStorage.getItem('__bgz_hardware_id') || undefined; } catch { return undefined; } })(),
            yon: qrAction === 'entry' ? 'giris' : qrAction === 'exit' ? 'cikis' : undefined,
            onay,
          });
        } catch (err) {
          /* Kural gerecgi reddedildi (zaten iceride, cok sik okutma, jeton
             kullanilmis...). Sunucunun mesaji oldugu gibi gosterilir. */
          await tabanSureyiBekle(dogrulamaBasi);
          setPageError([err?.baslik, err?.mesaj || err?.message, err?.govde?.ayrinti]
                       .filter(Boolean).join('\n') || 'Geçiş kaydedilemedi.');
          setIsVerifying(false);
          return;
        }

        /* Sunucu "emin misin" diyorsa (cikis saatin gelmedi gibi) kullaniciya
           sorulur; onaylarsa ayni istek onay:true ile tekrarlanir. */
        if (yanit?.onay_gerekli) {
          await tabanSureyiBekle(dogrulamaBasi);
          setIsVerifying(false);
          setKabul(false);
          setOnaySorusu({
            kod: yanit.kod,
            baslik: yanit.baslik || 'Onayınız Gerekiyor',
            mesaj: yanit.mesaj || '',
            ayrinti: yanit.ayrinti || '',
            ogrenci: foundStudent,
          });
          return;
        }

        if (yanit?.success === false) {
          await tabanSureyiBekle(dogrulamaBasi);
          /* Reddedilen gecis: sunucunun BASLIK'i da gosterilir.
             "Rehber Öğretmeninizle Görüşün" gibi bir yonlendirme,
             kuru bir hata metniyle gecistirilmemeli. */
          setPageError([yanit.baslik, yanit.mesaj, yanit.ayrinti].filter(Boolean).join('\n'));
          setIsVerifying(false);
          return;
        }

        newStatus = yanit?.yon === 'cikis' ? 'exit' : 'entry';
        finalMessage = yanit?.mesaj || 'Geçişiniz alındı.';

        await tabanSureyiBekle(dogrulamaBasi);
        setSuccessMessage(finalMessage);
        /* Gecis kaydedildi ama uyari var (gec giris -> rehberlik).
           Basari ekraninin ustunde ayri ve dikkat ceken bir kart gosterilir;
           siradan bir "hos geldiniz" gibi gecistirilmemeli. */
        setGecisAyrinti({
          baslik: yanit?.baslik, ayrinti: yanit?.ayrinti, saat: yanit?.saat,
          rehberlik: Boolean(yanit?.rehberlik), gec: Boolean(yanit?.gec),
        });
        setStudent({ ...foundStudent, id: studentId, name: studentName });
        setIsVerifying(false);

            } else {
        finalMessage = "Yoklamanız başarıyla alındı.";
        newStatus = "present";
        await tabanSureyiBekle(dogrulamaBasi);
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
  /* Numarali havuzlarda yalnizca rakam kabul edilir ve uzunluk PIN kutusu
     sayisiyla sinirlanir; personel havuzlarinda metin oldugu gibi gecer. */
  const handleTcChange = (e) => {
    const ham = typeof e === 'string' ? e : e.target.value;
    setTcInput(numaraliHavuz(roleMode) ? ham.replace(/\D/g, '').slice(0, PIN_UZUNLUK) : ham);
  };

  /** Kullanici kaydini gecis akisinin bekledigi sade nesneye cevirir. */
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
   * Yeniden dene.
   *
   * Sayfayi BASTAN YUKLEMEZ. `window.location.reload()` guvenlik motorunu,
   * parmak izi hesabini ve acilis animasyonunu bastan calistiriyordu; ekran
   * birkac kez beyazlayip yeniden kuruluyor, "sistem restart atti" hissi
   * veriyordu. Burada yalnizca ekran durumu sifirlanir; cihaz kisiyi
   * hatirliyorsa gecis dogrudan yeniden denenir.
   */
  const yenidenDene = () => {
    setPageError('');
    setStudent(null);
    setCandidates(null);
    setGecisAyrinti(null);
    setOnaySorusu(null);
    setKabul(false);
    setTcInput('');
    if (autoLoginStudent) {
      setIsVerifying(true);
      processAttendance(autoLoginStudent);
    } else {
      setIsVerifying(false);
    }
  };

  /** Cihazdaki kayitli kisiyi unutur — baska biri kullanacaksa. */
  const kisiyiUnut = async () => {
    try { localStorage.removeItem('__bgz_auto_login'); } catch { /* depolama kapali */ }
    try { await idbSet('auto_login', null); } catch { /* depolama kapali */ }
    setAutoLoginStudent(null);
    setAutoLoginReady(false);
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
      alert(BOS_UYARISI[roleMode] || BOS_UYARISI[POOL_TEACHER]);
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
      /* Eslestirme SUNUCUDA yapilir. Havuz ayrimi (ogrenci/veli/personel),
         okul numarasi, TC son 4 hane, cocugun numarasi ve Turkce'ye uygun
         ad karsilastirmasi orada tanimlidir; boylece istemcinin kadro
         listesini indirmesi gerekmez. */
      const havuz = roleMode === POOL_STUDENT ? 'ogrenci'
                  : roleMode === POOL_PARENT  ? 'veli'
                  : roleMode === POOL_ADMIN   ? 'idare' : 'ogretmen';

      let matches = [];
      try {
        const yanit = await vds.post('/api/qr/kim', { havuz, girdi: raw });
        matches = Array.isArray(yanit?.adaylar) ? yanit.adaylar : [];
      } catch (e) {
        if (e?.durum !== 404) throw e;   // 404 = eslesme yok, digerleri gercek hata
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
      alert((BULUNAMADI[roleMode] || BULUNAMADI[POOL_TEACHER])(raw));
    } catch (error) {
      console.error('Geçiş sorgu hatası:', error);
      setIsVerifying(false);
      alert(error?.ad === 'zaman_asimi' || error?.ad === 'ag'
        ? 'Bağlantı yavaş olduğu için işlem tamamlanamadı. “Yeniden dene” ile tekrar deneyebilirsiniz.'
        : 'Geçiş sorgulanırken bir hata oluştu: ' + (error?.message || ''));
    } finally {
      setIsVerifying(false);
    }
  };


  // ============================================================
  // ORTAK KATMANLAR
  // ============================================================
  const perde = splashBitti ? null : <GateSplash />;

  /** Hata ve bilgi ekranlari: tek parca lacivert, ortada tek sutun. */
  // ============================================================
  // RENDER: SURESI DOLMUS KAREKOD
  // ============================================================
  if (isExpired) {
    return (
      <DurumEkrani perde={perde}
        ikon={<IconClock size={30} />}
        baslik="Süre doldu"
        metin="Her karekod 60 saniye geçerlidir. Turnikedeki ekrandan yeni bir karekod okutmanız yeterli."
      />
    );
  }

  // ============================================================
  // RENDER: ERISIM REDDEDILDI
  // ============================================================
  if (pageError) {
    return (
      <DurumEkrani perde={perde}
        ikon={<IconAlert size={30} />}
        baslik="Geçiş yapılamadı"
        cocuk={
          <div className="gate-in gate-in--3" style={{ width: '100%', marginTop: 10 }}>
            <EngelAnimasyonu size={268} />
            {/* Kirmizi kutu kalkti: turnike zaten reddi anlatiyor, ustune bir
                de uyari kutusu koymak ekrani agirlastiriyordu. Metin cıplak
                duruyor; ilk satir (baslik) daha belirgin. */}
            <div className="gate__engel-metin">
              {String(pageError).split('\n').filter(Boolean).map((satir, i) => (
                <p key={i} className={i === 0 ? 'gate__engel-metin-bas' : undefined}>{satir}</p>
              ))}
            </div>
            <Button variant="silindir" onClick={yenidenDene}>Yeniden dene</Button>
          </div>
        }
      />
    );
  }

  // ============================================================
  // RENDER: GECIS SONUCU
  //
  // Durumu tek bir sey soyler: rozet. Giris beyaz, cikis konturlu, uyari bordo.
  // ============================================================
  if (student) {
    const isWarning = successMessage.includes('Zaten') || successMessage.includes('Önce')
      || successMessage.includes('Güvenlik') || successMessage.includes('süresi');
    const isCheckout = successMessage.toLocaleLowerCase('tr').includes('çık');

    let altMetin = 'Kurum girişiniz kaydedildi. İyi dersler dileriz.';
    if (successMessage.includes('Önce')) altMetin = 'Giriş kaydınız olmadan çıkış yapılamaz. Lütfen görevliye başvurun.';
    else if (successMessage.includes('Güvenlik') || successMessage.includes('süresi')) altMetin = 'Okutma sırasında bir güvenlik kuralı ihlali tespit edildi.';
    else if (successMessage.includes('Zaten')) altMetin = 'Bu işlem daha önce kayda geçmiş. Tekrar okutmanıza gerek yok.';
    else if (isCheckout) altMetin = 'Kurumdan çıkışınız kaydedildi. İyi günler dileriz.';

    const durum = isWarning ? 'warn' : isCheckout ? 'exit' : 'ok';
    const baslik = { ok: 'Hoş geldiniz', exit: 'Görüşmek üzere', warn: 'Bir saniye' }[durum];
    const rozetIkon = { ok: <IconCheck size={17} />, exit: <IconExit size={17} />, warn: <IconAlert size={17} /> }[durum];
    const saat = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    return (
      <>
        <GateSolid>
          <img className="gate__portrait gate-in gate-in--1" src={student.photo} alt="" />
          <h1 className="gate__result-title gate-in gate-in--2">{baslik}</h1>
          <p className="gate__result-name gate-in gate-in--2">{student.name}</p>
          <span className={`gate__badge gate__badge--${durum} gate-in gate-in--3`}>
            {rozetIkon}{successMessage}
          </span>
          <p className="gate__result-text gate-in gate-in--4" style={{ maxWidth: 290 }}>{altMetin}</p>
          <p className="gate__meta gate-in gate-in--5">
            {saat} · {durum === 'warn' ? 'İşlem denendi' : 'Kayıt alındı'}
          </p>
          <Footer />
        </GateSolid>
        {perde}
      </>
    );
  }

  // ============================================================
  // RENDER: ANA EKRAN
  //
  // Iki adim var:
  //   1) rol secimi  — dort secenek
  //   2) form        — secilen role gore PIN ya da ad-soyad
  // ============================================================
  const ROLLER = [
    { id: POOL_STUDENT, label: 'Öğrenci',  Ikon: IconStudent },
    { id: POOL_TEACHER, label: 'Öğretmen', Ikon: IconTeacher },
    { id: POOL_ADMIN,   label: 'İdare',    Ikon: IconAdmin },
    { id: POOL_PARENT,  label: 'Veli',     Ikon: IconParent }
  ];
  const seciliRol = ROLLER.find((r) => r.id === roleMode);

  const rolSec = (id) => { setRoleMode(id); setTcInput(''); setCandidates(null); };
  const roleGeri = () => { setRoleMode(null); setTcInput(''); setCandidates(null); };

  const FORM_METNI = {
    [POOL_STUDENT]: { baslik: 'Okul numaranız',            ipucu: 'Karnenizde ve öğrenci kartınızda yazan üç haneli numara.' },
    [POOL_PARENT]:  { baslik: 'Çocuğunuzun okul numarası',  ipucu: 'Çocuğunuzun öğrenci kartında yazan üç haneli numara.' },
    [POOL_TEACHER]: { baslik: 'Ad ve soyadınız',            ipucu: 'Sisteme kayıtlı hâliyle yazınız.' },
    [POOL_ADMIN]:   { baslik: 'Ad ve soyadınız',            ipucu: 'Sisteme kayıtlı hâliyle yazınız.' }
  };

  /* Konum ve dogrulama durumlari role secilmeden once de gorunur. */
  const konumUyarisi = geoStatus !== 'allowed' && (
    <>
      {geoStatus === 'checking' && (
        <Note><span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <IconPin size={18} /> Güvenlik için konumunuz doğrulanıyor…
        </span></Note>
      )}
      {geoStatus === 'far' && <Note tone="danger">Kurum konumundan uzaktasınız. Geçiş buradan yapılamaz.</Note>}
      {geoStatus === 'timeout' && (
        <Note tone="danger">
          Konum tespiti çok uzun sürdü.
          <Button variant="ghost" onClick={startFallback}>Tekrar dene</Button>
        </Note>
      )}
      {geoStatus === 'denied' && (
        <Note tone="danger">
          <span><strong>Konum izni reddedildi.</strong> Tarayıcı ayarlarından izni açıp sayfayı yenileyin.</span>
          <Button variant="ghost" onClick={() => window.location.reload()}>Sayfayı yenile</Button>
        </Note>
      )}
    </>
  );

  let govde;

  /* Kimlik cozulmeden numara ekrani GOSTERILMEZ.
     Onceden guvenlik motoru arka planda calisirken form bir an gorunuyor,
     cihaz kisiyi tanidiginda hemen kayboluyordu — acilista goz yoran bir
     sicrama olusuyordu. */
  if (!autoLoginReady || isVerifying) {
    govde = (
      <div className="gate-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '6px 0 14px' }}>
        <DogrulamaAnimasyonu size={108} />
        <p style={{ margin: 0, fontSize: 15, color: 'var(--on-navy)' }}>
          {isVerifying ? 'Geçişiniz doğrulanıyor…' : 'Hazırlanıyor…'}
        </p>
      </div>
    );

  } else if (konumUyarisi && geoStatus !== 'allowed') {
    govde = konumUyarisi;

  } else if (autoLoginStudent) {
    /* Cihaz daha once taninmis: yazmaya gerek yok, tek onay yeter. */
    govde = (
      <div className="gate-in gate-in--2">
        <h2 className="gate__title">Sizi tanıdık</h2>
        <p className="gate__lead">Geçişi onaylamanız yeterli.</p>
        <PersonCard
          as="div"
          name={autoLoginStudent.name}
          photo={autoLoginStudent.photo}
          detail={[havuzEtiketi(autoLoginStudent.pool), autoLoginStudent.branch || autoLoginStudent.className
            || (autoLoginStudent.schoolNumber ? `No ${autoLoginStudent.schoolNumber}` : '')].filter(Boolean).join(' · ')}
        />
        <Button onClick={handleAutoLoginConfirm}>Girişi onayla</Button>
        <button type="button" className="gate__link gate__link--quiet" onClick={kisiyiUnut}>
          Bu ben değilim
        </button>
      </div>
    );

  } else if (candidates) {
    govde = (
      <div className="gate-in gate-in--2">
        <h2 className="gate__title">Kendinizi seçin</h2>
        <p className="gate__lead">Bu bilgiyle {candidates.length} kayıt eşleşti.</p>
        {candidates.map((aday) => (
          <PersonCard
            key={aday.id}
            name={aday.name}
            photo={aday.photo}
            detail={[havuzEtiketi(aday.pool), aday.branch || aday.className].filter(Boolean).join(' · ')}
            onClick={() => confirmCandidate(aday)}
          />
        ))}
        <button type="button" className="gate__link gate__link--quiet" onClick={() => { setCandidates(null); setTcInput(''); }}>
          Hiçbiri — tekrar yazayım
        </button>
      </div>
    );

  } else if (!roleMode) {
    /* 1. adim — kim olduğunuzu seçin. */
    govde = (
      <>
        <h2 className="gate__title gate-in gate-in--1">Karekod Okundu</h2>
        <p className="gate__lead gate-in gate-in--1">
          Geçişinizi tamamlamak için <strong>kim olduğunuzu</strong> seçin.
        </p>
        <RoleGrid roles={ROLLER} onPick={rolSec} />
        <button type="button" className="gate__link gate__link--app" onClick={openInApp}>
          <IconExternal size={15} />
          BGZ Mobil uygulamasında aç
        </button>
      </>
    );

  } else {
    /* 2. adim — role gore form. */
    const metin = FORM_METNI[roleMode];
    const pinli = numaraliHavuz(roleMode);

    govde = (
      <form onSubmit={(e) => { e.preventDefault(); handlePassSubmit(); }}>
        <div className="gate-in gate-in--1">
          <FormBar
            onBack={roleGeri}
            icon={seciliRol ? <seciliRol.Ikon size={17} /> : null}
            label={seciliRol?.label}
          />
        </div>
        <p className="gate__lead gate-in gate-in--1" style={{ marginBottom: 20 }}>{metin.baslik}</p>

        <div className="gate-in gate-in--2">
          {pinli ? (
            <PinInput
              key={roleMode}
              length={PIN_UZUNLUK}
              value={tcInput}
              onChange={handleTcChange}
              onComplete={(deger) => handlePassSubmit(deger)}
            />
          ) : (
            <NameInput
              key={roleMode}
              value={tcInput}
              onChange={handleTcChange}
              placeholder="Ad Soyad"
            />
          )}
        </div>

        <p className="gate__hint gate-in gate-in--3">{metin.ipucu}</p>

        <div className="gate-in gate-in--3">
          <Button type="submit" disabled={pinli ? tcInput.length < PIN_UZUNLUK : !tcInput.trim()}>
            Girişi tamamla
          </Button>
        </div>
      </form>
    );
  }

  /* Sunucunun sordugu onay penceresi.
     Kurallar sunucuda oldugu icin burada yeniden karar VERILMEZ; yalnizca
     kullanicinin cevabi geri gonderilir. */
  return (
    <>
      <GateShell top={<GateHeader />} seconds={timeLeft}>
        {govde}
        <Footer />
      </GateShell>
      {perde}
      <OnayPenceresi
        onaySorusu={onaySorusu}
        kabul={kabul}
        setKabul={setKabul}
        kapat={() => { setOnaySorusu(null); setKabul(false); setIsVerifying(false); }}
        devamEt={() => {
          const o = onaySorusu?.ogrenci;
          setOnaySorusu(null); setKabul(false); setIsVerifying(true);
          processAttendance(o, true);
        }}
      />
      {gecisAyrinti?.rehberlik && (
        <div style={{
          position: 'fixed', left: 16, right: 16, bottom: 20, zIndex: 9998,
          margin: '0 auto', maxWidth: 380, borderRadius: 16, overflow: 'hidden',
          boxShadow: '0 12px 34px rgba(0,0,0,0.28)',
        }}>
          <div style={{ background: '#c0392b', padding: '14px 18px', display: 'flex',
                        alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'flex', color: '#fff', flexShrink: 0 }}>
              <IconAlert size={24} />
            </span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ color: '#fff', fontSize: 15, fontWeight: 800, letterSpacing: '-0.2px' }}>
                {gecisAyrinti.baslik || 'Rehber Öğretmeninizle Görüşün'}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12.5, marginTop: 3, lineHeight: 1.45 }}>
                {gecisAyrinti.ayrinti || 'Derse girmeden önce rehber öğretmeninize uğrayınız.'}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default QRCodeRedirect;
