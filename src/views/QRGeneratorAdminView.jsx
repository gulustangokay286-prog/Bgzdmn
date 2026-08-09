import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCcw, ShieldCheck, DoorOpen, GraduationCap, Maximize, Minimize, QrCode, Clock, ShieldBan, Sun, Moon } from 'lucide-react';
import QRCode from 'react-qr-code';
import { v4 as uuidv4 } from 'uuid';
import { doc, setDoc, serverTimestamp, collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';

const QRGeneratorAdminView = () => {
  const [qrTheme, setQrTheme] = useState('dark');
  const [selectedType, setSelectedType] = useState('institution_gate');
  const [currentSessionId, setCurrentSessionId] = useState(uuidv4());
  const [qrData, setQrData] = useState('');
  const [qrDataEntry, setQrDataEntry] = useState('');
  const [qrDataExit, setQrDataExit] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [cheatAlert, setCheatAlert] = useState(null);
  const [smoothProgress, setSmoothProgress] = useState(1);
  const containerRef = useRef(null);
  const recentNoncesRef = useRef([]);
  const cycleStartRef = useRef(Date.now());
  const rafRef = useRef(null);

  const CYCLE_DURATION = 3500; 

  const isDark = qrTheme === 'dark';


  const animateProgress = useCallback(() => {
    if (isRefreshing) return; 

    const elapsed = Date.now() - cycleStartRef.current;
    const remaining = Math.max(0, 1 - elapsed / CYCLE_DURATION);
    setSmoothProgress(remaining);

    if (remaining <= 0) {
      setIsRefreshing(true);
      // Wait for fade-out animation to finish
      setTimeout(() => {
        setCurrentSessionId(uuidv4());
        cycleStartRef.current = Date.now();
        setSmoothProgress(1);
        // Wait a tick for the new QR to render, then fade in
        setTimeout(() => setIsRefreshing(false), 50);
      }, 300);
    }

    rafRef.current = requestAnimationFrame(animateProgress);
  }, [isRefreshing]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(animateProgress);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [animateProgress]);

  // ─── Clock update every second ────────────────────────────────────────────
  useEffect(() => {
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // ─── Cheat alert listener ─────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'security_logs'), orderBy('timestamp', 'desc'), limit(5));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const logData = change.doc.data();
          if (logData.type === 'cheat_attempt') {
            const logTime = logData.timestamp?.toDate ? logData.timestamp.toDate() : new Date(logData.timestamp);
            const now = new Date();
            if (now - logTime < 10000) {
              setCheatAlert(logData);
              setTimeout(() => setCheatAlert(null), 8000);
            }
          }
        }
      });
    });
    return () => unsubscribe();
  }, []);

  // ─── Generate QR data ─────────────────────────────────────────────────────
  const generateCode = useCallback(() => {
    const timestamp = Math.floor(Date.now() / 1000);
    setQrData(`https://bgz-mobil.web.app/qr?type=${selectedType}&sessionId=${currentSessionId}&timestamp=${timestamp}`);
    setQrDataEntry(`https://bgz-mobil.web.app/qr?type=${selectedType}&action=entry&sessionId=${currentSessionId}&timestamp=${timestamp}`);
    setQrDataExit(`https://bgz-mobil.web.app/qr?type=${selectedType}&action=exit&sessionId=${currentSessionId}&timestamp=${timestamp}`);

    recentNoncesRef.current = [currentSessionId, ...recentNoncesRef.current].slice(0, 5);

    setDoc(doc(db, 'active_qr_nonce', 'current_entry'), {
      nonce: currentSessionId,
      validNonces: recentNoncesRef.current,
      type: selectedType,
      createdAt: serverTimestamp(),
      timestampUnix: timestamp
    }).catch(() => { });
    setDoc(doc(db, 'active_qr_nonce', 'current_exit'), {
      nonce: currentSessionId,
      validNonces: recentNoncesRef.current,
      type: selectedType,
      createdAt: serverTimestamp(),
      timestampUnix: timestamp
    }).catch(() => { });
  }, [selectedType, currentSessionId]);

  useEffect(() => { generateCode(); }, [generateCode]);

  // ─── Manual refresh ───────────────────────────────────────────────────────
  const refreshQR = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setTimeout(() => {
      setCurrentSessionId(uuidv4());
      cycleStartRef.current = Date.now();
      setSmoothProgress(1);
      setTimeout(() => setIsRefreshing(false), 50);
    }, 300);
  };

  // ─── Fullscreen ───────────────────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const dateString = currentTime.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeString = currentTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const secondsLeft = (smoothProgress * 3.5).toFixed(1);
  const angle = (1 - smoothProgress) * 360;

  return (
    <div
      ref={containerRef}
      style={{ background: isDark ? '#0b1120' : '#f1f5f9' }}
      className={`w-full h-full min-h-screen flex items-center justify-center font-sans p-4 sm:p-6 transition-colors duration-500 ${
        isDark ? 'text-white' : 'text-slate-900'
      }`}
    >
      <div className={`relative z-10 w-full flex flex-col items-center transition-all duration-500 ${
        isFullscreen ? 'max-w-[1250px]' : 'max-w-[820px]'
      }`}>

        {/* Top Header / Info Bar */}
        <div className={`w-full flex flex-col md:flex-row justify-between items-center mb-6 px-4 py-3.5 border rounded-2xl gap-4 transition-colors duration-500 ${
          isDark ? 'bg-slate-900/80 border-slate-800 shadow-lg' : 'bg-white border-slate-200 shadow-md'
        }`}>
          {/* Left: System Title + Verified Icon */}
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${
              isDark ? 'bg-slate-800/80 border-slate-700 text-indigo-400' : 'bg-slate-50 border-slate-200 text-indigo-600 shadow-sm'
            }`}>
              <QrCode size={22} />
            </div>
            <div className="flex items-center gap-2.5">
              <div>
                <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{dateString}</span>
                <h1 className="text-[18px] font-extrabold leading-none tracking-tight mt-0.5">Akıllı Geçiş Sistemi</h1>
              </div>
            </div>
          </div>

          {/* Center: Mode Selector (Yoklama / Turnike) */}
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Mod:</span>
            <div className={`flex items-center p-1 rounded-full border ${
              isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'
            }`}>
              <button
                onClick={() => setSelectedType('attendance')}
                className={`px-4 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                  selectedType === 'attendance'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : (isDark ? 'text-slate-400 hover:text-white hover:bg-slate-700/50' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50')
                }`}
              >
                Yoklama
              </button>
              <button
                onClick={() => setSelectedType('institution_gate')}
                className={`px-4 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                  selectedType === 'institution_gate'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : (isDark ? 'text-slate-400 hover:text-white hover:bg-slate-700/50' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50')
                }`}
              >
                Turnike
              </button>
            </div>
          </div>

          {/* Right: Digital Clock + Action Buttons */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Clock size={16} className={isDark ? 'text-indigo-400' : 'text-indigo-600'} />
              <span className={`text-[22px] font-extrabold tracking-tight tabular-nums ${
                isDark ? 'text-white' : 'text-slate-800'
              }`}>
                {timeString}
              </span>
            </div>

            <div className="h-6 w-[1px] bg-slate-700/30" />

            <div className="flex items-center gap-2">
              <button
                onClick={() => setQrTheme(t => t === 'dark' ? 'light' : 'dark')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-[12px] border transition-all ${
                  isDark
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 shadow-sm'
                }`}
              >
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
                {isDark ? 'Beyaz' : 'Karanlık'}
              </button>
              <button
                onClick={toggleFullscreen}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-[12px] border transition-all ${
                  isDark
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 shadow-sm'
                }`}
              >
                {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
                {isFullscreen ? 'Çık' : 'Tam Ekran'}
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Box (Focused on QR Codes) */}
        <div className={`border rounded-[32px] p-8 sm:p-12 w-full flex flex-col items-center justify-center transition-all duration-500 ${
          isDark ? 'bg-slate-900/90 border-slate-800 shadow-2xl' : 'bg-white border-slate-200 shadow-xl'
        }`}>
          {/* Flat Minimalist Status Above QR Codes */}
          <div className="mb-5 flex items-center justify-center gap-2">
            <img 
              src="/verified.png" 
              alt="Sistem Güvende" 
              className="w-4 h-4 object-contain saturate-200 contrast-150 brightness-75 hue-rotate-[90deg]"
            />
            <span className={`text-[13px] font-semibold tracking-wide ${
              isDark ? 'text-slate-200' : 'text-slate-700'
            }`}>
              Sistem Güvende ve Aktif
            </span>
          </div>

          {/* QR Cards Area */}
          <div className="w-full flex justify-center relative">
            {cheatAlert && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-red-600/95 rounded-[28px] backdrop-blur-md p-6 border-4 border-red-500 shadow-2xl">
                <ShieldBan size={64} className="text-white mb-4 animate-bounce" strokeWidth={1.5} />
                <h3 className="text-[20px] font-black text-white uppercase tracking-wider mb-2 text-center">
                  Güvenlik İhlali!
                </h3>
                <p className="text-[14px] font-bold text-red-100 text-center">
                  Asıl Sahip: {cheatAlert.originalOwnerTc}<br />
                  Okutulan: {cheatAlert.attemptedStudentTc}
                </p>
              </div>
            )}

            {selectedType === 'institution_gate' ? (
              <div className="flex flex-col sm:flex-row gap-16 sm:gap-24 lg:gap-36 items-center justify-center w-full py-4">
                {/* Entry QR */}
                <div className="relative flex flex-col items-center justify-center">
                  <div
                    className="absolute -inset-4 rounded-[36px] pointer-events-none opacity-40"
                    style={{ background: `conic-gradient(from -90deg, #10b981 ${angle}deg, transparent 0deg)` }}
                  />
                  <div className={`relative rounded-[30px] p-7 shadow-2xl flex flex-col items-center border transition-all ${
                    isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-emerald-50/70 border-emerald-100'
                  }`}>
                    <span className="text-[18px] font-black tracking-widest text-emerald-500 mb-5 uppercase">GİRİŞ YAP</span>
                    <div className="relative p-4 bg-white rounded-[24px] shadow-md flex items-center justify-center overflow-hidden">
                      <div className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${isRefreshing ? 'opacity-0 blur-md scale-90' : 'opacity-100 blur-0 scale-100'}`}>
                        {qrDataEntry ? (
                          <QRCode value={qrDataEntry} size={isFullscreen ? 220 : 180} level="H" fgColor="#0f172a" bgColor="#ffffff" />
                        ) : (
                          <div className={`flex items-center justify-center ${isFullscreen ? 'w-[220px] h-[220px]' : 'w-[180px] h-[180px]'}`}>
                            <RefreshCcw className="animate-spin text-emerald-600" size={32} />
                          </div>
                        )}
                      </div>
                      <div className={`absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-[24px] transition-all duration-500 ${isRefreshing ? 'opacity-100 z-10' : 'opacity-0 -z-10 pointer-events-none'}`}>
                        <RefreshCcw className="animate-spin text-emerald-600" size={32} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Exit QR */}
                <div className="relative flex flex-col items-center justify-center">
                  <div
                    className="absolute -inset-4 rounded-[36px] pointer-events-none opacity-40"
                    style={{ background: `conic-gradient(from -90deg, #ef4444 ${angle}deg, transparent 0deg)` }}
                  />
                  <div className={`relative rounded-[30px] p-7 shadow-2xl flex flex-col items-center border transition-all ${
                    isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-red-50/70 border-red-100'
                  }`}>
                    <span className="text-[18px] font-black tracking-widest text-rose-500 mb-5 uppercase">ÇIKIŞ YAP</span>
                    <div className="relative p-4 bg-white rounded-[24px] shadow-md flex items-center justify-center overflow-hidden">
                      <div className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${isRefreshing ? 'opacity-0 blur-md scale-90' : 'opacity-100 blur-0 scale-100'}`}>
                        {qrDataExit ? (
                          <QRCode value={qrDataExit} size={isFullscreen ? 220 : 180} level="H" fgColor="#0f172a" bgColor="#ffffff" />
                        ) : (
                          <div className={`flex items-center justify-center ${isFullscreen ? 'w-[220px] h-[220px]' : 'w-[180px] h-[180px]'}`}>
                            <RefreshCcw className="animate-spin text-rose-600" size={32} />
                          </div>
                        )}
                      </div>
                      <div className={`absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-[24px] transition-all duration-500 ${isRefreshing ? 'opacity-100 z-10' : 'opacity-0 -z-10 pointer-events-none'}`}>
                        <RefreshCcw className="animate-spin text-rose-600" size={32} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative flex flex-col items-center justify-center py-4">
                <div
                  className="absolute -inset-5 rounded-[40px] pointer-events-none opacity-40"
                  style={{ background: `conic-gradient(from -90deg, #6366f1 ${angle}deg, transparent 0deg)` }}
                />
                <div className={`relative rounded-[32px] p-8 shadow-2xl flex flex-col items-center border ${
                  isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-indigo-50/70 border-indigo-100'
                }`}>
                  <span className="text-[20px] font-black tracking-widest text-indigo-500 mb-5 uppercase">YOKLAMA</span>
                  <div className="relative p-5 bg-white rounded-[26px] shadow-md flex items-center justify-center overflow-hidden">
                    <div className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${isRefreshing ? 'opacity-0 blur-md scale-90' : 'opacity-100 blur-0 scale-100'}`}>
                      {qrData ? (
                        <QRCode value={qrData} size={isFullscreen ? 260 : 210} level="H" fgColor="#0f172a" bgColor="#ffffff" />
                      ) : (
                        <div className={`flex items-center justify-center ${isFullscreen ? 'w-[260px] h-[260px]' : 'w-[210px] h-[210px]'}`}>
                          <RefreshCcw className="animate-spin text-indigo-600" size={36} />
                        </div>
                      )}
                    </div>
                    <div className={`absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm rounded-[26px] transition-all duration-500 ${isRefreshing ? 'opacity-100 z-10' : 'opacity-0 -z-10 pointer-events-none'}`}>
                      <RefreshCcw className="animate-spin text-indigo-600" size={36} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Refresh Status */}
          <div className="mt-8 flex justify-center">
            <button
              onClick={refreshQR}
              className={`flex items-center gap-2 border px-4 py-2 rounded-full text-[12px] font-bold shadow-sm transition-all ${
                isDark
                  ? 'bg-slate-800/90 border-slate-700 text-slate-300 hover:text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              <RefreshCcw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              <span className="tabular-nums">{secondsLeft === '0.0' ? '0' : secondsLeft} saniye kaldı</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRGeneratorAdminView;
