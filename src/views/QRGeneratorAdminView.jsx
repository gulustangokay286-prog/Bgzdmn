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
  const [cheatAlert, setCheatAlert] = useState(null);
  
  const containerRef = useRef(null);
  const secondsTextRef = useRef(null);
  const clockTimeRef = useRef(null);
  const clockDateRef = useRef(null);
  const recentNoncesRef = useRef([]);
  const cycleStartRef = useRef(Date.now());
  const isRefreshingRef = useRef(false);

  const CYCLE_DURATION = 3500; 
  const isDark = qrTheme === 'dark';

  // Sync isRefreshingRef with state
  useEffect(() => { isRefreshingRef.current = isRefreshing; }, [isRefreshing]);

  // Sync body/html background with theme (prevents dark navy bleeding through)
  useEffect(() => {
    const bg = isDark ? '#0b1120' : '#f1f5f9';
    document.body.style.backgroundColor = bg;
    document.body.style.backgroundImage = 'none';
    document.documentElement.style.backgroundColor = bg;
    return () => {
      // Restore defaults on unmount
      document.body.style.backgroundColor = '';
      document.body.style.backgroundImage = '';
      document.documentElement.style.backgroundColor = '';
    };
  }, [isDark]);

  // ─── SINGLE TIMER: Updates countdown text + clock via direct DOM (ZERO re-renders) ───
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      if (clockTimeRef.current) {
        clockTimeRef.current.textContent = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
      if (clockDateRef.current) {
        clockDateRef.current.textContent = now.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      }
    };
    updateClock();

    const timer = setInterval(() => {
      if (!isRefreshingRef.current && secondsTextRef.current) {
        const elapsed = Date.now() - cycleStartRef.current;
        const remaining = Math.max(0, 1 - elapsed / CYCLE_DURATION);
        const secs = (remaining * (CYCLE_DURATION / 1000)).toFixed(1);
        secondsTextRef.current.textContent = (secs === '0.0' ? '0' : secs) + ' saniye kaldı';

        if (remaining <= 0) {
          isRefreshingRef.current = true;
          setIsRefreshing(true);
          setTimeout(() => {
            setCurrentSessionId(uuidv4());
            cycleStartRef.current = Date.now();
            if (secondsTextRef.current) secondsTextRef.current.textContent = '3.5 saniye kaldı';
            setTimeout(() => {
              isRefreshingRef.current = false;
              setIsRefreshing(false);
            }, 50);
          }, 300);
        }
      }
      updateClock();
    }, 100);

    return () => clearInterval(timer);
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
      if (secondsTextRef.current) secondsTextRef.current.textContent = '3.5 saniye kaldı';
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

  return (
    <div
      ref={containerRef}
      style={{ background: isDark ? '#0b1120' : '#f1f5f9' }}
      className={`absolute inset-0 z-10 flex items-center justify-center font-sans p-4 sm:p-6 transition-colors duration-500 overflow-auto ${
        isDark ? 'text-white' : 'text-slate-900'
      }`}
    >
      {/* Orijinal conic-gradient animasyonu — @property ile */}
      <style>{`
        @property --progress-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes sweep {
          0% { --progress-angle: 0deg; }
          100% { --progress-angle: 360deg; }
        }
        .progress-border {
          background: conic-gradient(from -90deg, var(--border-color) var(--progress-angle, 0deg), transparent 0deg);
        }
        .animating-border {
          animation: sweep 3.5s linear forwards;
        }
      `}</style>

      <div className={`relative z-10 w-full flex flex-col items-center transition-all duration-500 ${
        isFullscreen ? 'max-w-[1240px]' : 'max-w-[920px]'
      }`}>

        {/* Top Header / Info Bar */}
        <div className={`w-full flex flex-col md:flex-row justify-between items-center mb-6 px-4 py-3.5 border rounded-2xl gap-4 transition-colors duration-500 ${
          isDark ? 'bg-slate-900/80 border-slate-800 shadow-lg' : 'bg-white border-slate-200 shadow-md'
        }`}>
          {/* Left: System Title + Verified Icon */}
          <div className="flex items-center gap-3">
            <img 
              src="/verified.png" 
              alt="Sistem Güvende" 
              className="w-6 h-6 object-contain saturate-200 contrast-150 brightness-75 hue-rotate-[90deg]"
            />
            <div className="flex flex-col">
              <h1 className={`text-[15px] font-extrabold leading-[1.2] translate-y-[7px] ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Chenki • Sistem Güvende ve Aktif
              </h1>
              <span ref={clockDateRef} className="text-[10px] font-bold uppercase tracking-[1.6px] mt-2 -translate-y-[4px]" style={{ color: '#76859d' }}></span>
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
              <span ref={clockTimeRef} className={`text-[22px] font-extrabold tracking-tight tabular-nums ${
                isDark ? 'text-white' : 'text-slate-800'
              }`}>
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
              <div className={`flex flex-col sm:flex-row items-center w-full py-4 transition-all ${
                isFullscreen ? 'justify-between px-3 sm:px-8 lg:px-12 gap-6 sm:gap-8' : 'justify-between px-2 sm:px-5 lg:px-8 gap-4 sm:gap-6'
              }`}>
                {/* Entry QR */}
                <div className="relative flex flex-col items-center justify-center">
                  <div
                    key={currentSessionId}
                    className={`absolute -inset-4 rounded-[36px] pointer-events-none opacity-40 progress-border ${!isRefreshing ? 'animating-border' : ''}`}
                    style={{ '--border-color': '#10b981' }}
                  />
                  <div className={`relative z-10 rounded-[30px] p-7 shadow-2xl flex flex-col items-center border transition-all ${
                    isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-emerald-50/70 border-emerald-100'
                  }`}>
                    <span className="text-[18px] font-black tracking-widest text-emerald-500 mb-5 uppercase">GİRİŞ YAP</span>
                    <div className="relative p-4 bg-white rounded-[24px] shadow-md flex items-center justify-center overflow-hidden">
                      <div className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${isRefreshing ? 'opacity-0 blur-md scale-90' : 'opacity-100 blur-0 scale-100'}`}>
                        {qrDataEntry ? (
                          <QRCode value={qrDataEntry} size={isFullscreen ? 255 : 200} level="H" fgColor="#0f172a" bgColor="#ffffff" />
                        ) : (
                          <div className={`flex items-center justify-center ${isFullscreen ? 'w-[255px] h-[255px]' : 'w-[200px] h-[200px]'}`}>
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

                {/* Center Column — Branding */}
                <div className="flex flex-col items-center justify-center my-auto text-center" style={{ maxWidth: '470px', padding: '30px 10px' }}>
                  {/* CHENKİ badge with decorative lines */}
                  <div className="flex items-center justify-center gap-2.5 mb-4 w-full translate-x-[8px]">
                    <div className="w-[27px] h-[1px]" style={{ background: 'linear-gradient(90deg, transparent, #665dff)' }} />
                    <span className="text-[14px] font-black tracking-[5px] pl-[5px] uppercase" style={{ color: '#8d86ff' }}>CHENKİ</span>
                    <div className="w-[27px] h-[1px]" style={{ background: 'linear-gradient(270deg, transparent, #665dff)' }} />
                  </div>

                  {/* Large title */}
                  <h2 className={`font-black leading-[1.12] pb-1 ${isFullscreen ? 'text-[40px] sm:text-[48px]' : 'text-[32px] sm:text-[38px]'}`}
                    style={{ letterSpacing: '-1.5px', color: '#f7f9fc', textShadow: '0 5px 28px rgba(0,0,0,.28)' }}
                  >
                    Akıllı
                    <span className="block mt-2 pb-1" style={{
                      background: 'linear-gradient(100deg, #ffffff 0%, #dfe5f0 100%)',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent'
                    }}>Geçiş Sistemi</span>
                  </h2>

                  {/* Description */}
                  <p className={`mt-5 ${isFullscreen ? 'text-[15px]' : 'text-[13px]'} font-medium leading-[1.65]`}
                    style={{ color: '#8997ad', maxWidth: '390px' }}
                  >
                    QR kod teknolojisi ile hızlı, güvenli ve temassız personel giriş-çıkış yönetimi.
                  </p>

                  {/* Feature tags — Slightly Cylindrical Pills */}
                  <div className="flex items-center justify-center flex-wrap gap-2 mt-5">
                    {['QR GEÇİŞ', 'ANLIK KONTROL', 'GÜVENLİ ERİŞİM'].map(tag => (
                      <span key={tag} className="py-1.5 px-3.5 rounded-full text-[10px] font-bold tracking-[0.25px]"
                        style={{
                          color: '#9da9bb',
                          background: 'rgba(255,255,255,.035)',
                          border: '1px solid rgba(255,255,255,.045)'
                        }}
                      >{tag}</span>
                    ))}
                  </div>

                  {/* www.chenki.net link with gradient underline */}
                  <a href="https://www.chenki.net" target="_blank" rel="noopener noreferrer"
                    className={`relative inline-block mt-7 font-black text-white no-underline hover:-translate-y-0.5 transition-transform ${isFullscreen ? 'text-[24px] sm:text-[27px]' : 'text-[20px] sm:text-[23px]'}`}
                    style={{ letterSpacing: '-0.4px' }}
                  >
                    www.chenki.net
                    <div className="absolute left-0 right-0 -bottom-[7px] h-[2px] rounded-full opacity-85"
                      style={{ background: 'linear-gradient(90deg, #5c63ff, #9758ff, #f04476)' }}
                    />
                  </a>

                  {/* Timer */}
                  <button
                    onClick={refreshQR}
                    className={`mt-8 inline-flex items-center gap-2 ${isFullscreen ? 'h-[34px] px-3.5 text-[12px]' : 'h-[30px] px-3 text-[11px]'} font-semibold rounded-[10px] transition-all`}
                    style={{
                      color: '#b4bfce',
                      background: 'rgba(255,255,255,.035)',
                      border: '1px solid rgba(255,255,255,.035)'
                    }}
                  >
                    <RefreshCcw size={14} className={isRefreshing ? 'animate-spin' : ''} style={{ color: '#77869d' }} />
                    <span ref={selectedType === 'institution_gate' ? secondsTextRef : undefined} className="tabular-nums">3.5 saniye kaldı</span>
                  </button>
                </div>

                {/* Exit QR */}
                <div className="relative flex flex-col items-center justify-center">
                  <div
                    key={currentSessionId}
                    className={`absolute -inset-4 rounded-[36px] pointer-events-none opacity-40 progress-border ${!isRefreshing ? 'animating-border' : ''}`}
                    style={{ '--border-color': '#ef4444' }}
                  />
                  <div className={`relative z-10 rounded-[30px] p-7 shadow-2xl flex flex-col items-center border transition-all ${
                    isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-red-50/70 border-red-100'
                  }`}>
                    <span className="text-[18px] font-black tracking-widest text-rose-500 mb-5 uppercase">ÇIKIŞ YAP</span>
                    <div className="relative p-4 bg-white rounded-[24px] shadow-md flex items-center justify-center overflow-hidden">
                      <div className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${isRefreshing ? 'opacity-0 blur-md scale-90' : 'opacity-100 blur-0 scale-100'}`}>
                        {qrDataExit ? (
                          <QRCode value={qrDataExit} size={isFullscreen ? 255 : 200} level="H" fgColor="#0f172a" bgColor="#ffffff" />
                        ) : (
                          <div className={`flex items-center justify-center ${isFullscreen ? 'w-[255px] h-[255px]' : 'w-[200px] h-[200px]'}`}>
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
                  key={currentSessionId}
                  className={`absolute -inset-5 rounded-[40px] pointer-events-none opacity-40 progress-border ${!isRefreshing ? 'animating-border' : ''}`}
                  style={{ '--border-color': '#6366f1' }}
                />
                <div className={`relative z-10 rounded-[32px] p-8 shadow-2xl flex flex-col items-center border ${
                  isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-indigo-50/70 border-indigo-100'
                }`}>
                  <span className="text-[20px] font-black tracking-widest text-indigo-500 mb-5 uppercase">YOKLAMA</span>
                  <div className="relative p-5 bg-white rounded-[26px] shadow-md flex items-center justify-center overflow-hidden">
                    <div className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${isRefreshing ? 'opacity-0 blur-md scale-90' : 'opacity-100 blur-0 scale-100'}`}>
                      {qrData ? (
                        <QRCode value={qrData} size={isFullscreen ? 300 : 210} level="H" fgColor="#0f172a" bgColor="#ffffff" />
                      ) : (
                        <div className={`flex items-center justify-center ${isFullscreen ? 'w-[300px] h-[300px]' : 'w-[210px] h-[210px]'}`}>
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

          {/* Bottom Refresh Status — shown only in Yoklama mode */}
          {selectedType !== 'institution_gate' && (
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
                <span ref={selectedType !== 'institution_gate' ? secondsTextRef : undefined} className="tabular-nums">3.5 saniye kaldı</span>
              </button>
            </div>
          )}

          {/* Footer Branding — Gradient Footer */}
          <div className="mt-8 w-full flex items-center justify-center gap-3.5 select-none">
            <span className={`${isFullscreen ? 'text-[10px]' : 'text-[9px]'} font-black tracking-[4px] uppercase`}
              style={{ color: '#808da2' }}
            >
              POWERED BY
            </span>
            <span className={`${isFullscreen ? 'text-[22px]' : 'text-[20px]'} font-black tracking-[0.3px]`}
              style={{
                background: 'linear-gradient(90deg, #6965ff 0%, #a558ff 48%, #ef5279 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent'
              }}
            >
              www.chenki.net
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRGeneratorAdminView;
