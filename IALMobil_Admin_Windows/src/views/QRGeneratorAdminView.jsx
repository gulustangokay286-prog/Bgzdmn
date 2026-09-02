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

  useEffect(() => { isRefreshingRef.current = isRefreshing; }, [isRefreshing]);

  useEffect(() => {
    const bg = isDark ? '#0b1120' : '#f1f5f9';
    document.body.style.backgroundColor = bg;
    document.body.style.backgroundImage = 'none';
    document.documentElement.style.backgroundColor = bg;
    return () => {
      
      document.body.style.backgroundColor = '';
      document.body.style.backgroundImage = '';
      document.documentElement.style.backgroundColor = '';
    };
  }, [isDark]);

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
      className={`absolute inset-0 z-10 flex items-center justify-center font-sans ${isFullscreen ? 'p-4 sm:p-6' : 'py-4 sm:py-6 px-8 sm:px-14'} transition-colors duration-500 overflow-auto ${isDark ? 'text-white' : 'text-slate-900'
        }`}
    >
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Comfortaa:wght@300;400&family=Quicksand:wght@300;400&family=Mali:wght@300;400&family=Fredoka:wght@300;400&display=swap');
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

      <div className={`relative z-10 w-full flex flex-col items-center transition-all duration-500 ${isFullscreen ? 'max-w-[1280px]' : 'max-w-[1020px]'
        }`}>

        <div className={`relative w-full flex flex-col md:flex-row justify-between items-center mb-6 px-5 py-3.5 border rounded-2xl gap-4 transition-colors duration-500 ${isDark ? 'bg-slate-900/80 border-slate-800 shadow-lg' : 'bg-white border-slate-200 shadow-md'
          }`}>
          
          <div className="flex items-center gap-2">
            <img
              src="/verified.png"
              alt="Sistem Güvende"
              className="w-7 h-7 object-contain saturate-200 contrast-150 brightness-75 hue-rotate-[90deg] shrink-0"
            />
            <div className="flex flex-col justify-center gap-0.5">
              <h1 className={`text-[15px] font-extrabold leading-none translate-y-[4px] ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Sistem Güvende ve Aktif
              </h1>
              <span ref={clockDateRef} className="text-[10px] font-bold uppercase tracking-[1.6px] leading-none text-[#76859d]"></span>
            </div>
          </div>

          <div className={`md:absolute md:left-1/2 md:-translate-x-1/2 flex items-center p-1 rounded-full border transition-all duration-300 ${isDark
            ? 'bg-slate-800/60 border-slate-700/60'
            : 'bg-slate-100/80 border-slate-200/80 shadow-inner'
            }`}>
            <button
              onClick={() => setSelectedType('attendance')}
              className={`px-4 py-1.5 rounded-full text-[12px] font-bold transition-all duration-300 ${selectedType === 'attendance'
                ? 'bg-white text-slate-900 shadow-sm'
                : (isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900')
                }`}
            >
              Yoklama
            </button>
            <button
              onClick={() => setSelectedType('institution_gate')}
              className={`px-4 py-1.5 rounded-full text-[12px] font-bold transition-all duration-300 ${selectedType === 'institution_gate'
                ? 'bg-white text-slate-900 shadow-sm'
                : (isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900')
                }`}
            >
              Turnike
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Clock size={16} className={isDark ? 'text-indigo-400' : 'text-indigo-600'} />
              <span ref={clockTimeRef} className={`text-[22px] font-extrabold tracking-tight tabular-nums ${isDark ? 'text-white' : 'text-slate-800'
                }`}>
              </span>
            </div>

            <div className="h-6 w-[1px] bg-slate-700/30" />

            <div className="flex items-center gap-2">
              <button
                onClick={() => setQrTheme(t => t === 'dark' ? 'light' : 'dark')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-[12px] border transition-all ${isDark
                  ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 shadow-sm'
                  }`}
              >
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
                {isDark ? 'Beyaz' : 'Karanlık'}
              </button>
              <button
                onClick={toggleFullscreen}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-[12px] border transition-all ${isDark
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

        <div className={`border rounded-[32px] p-6 sm:p-10 w-full flex flex-col items-center justify-center transition-all duration-500 ${isDark ? 'bg-slate-900/90 border-slate-800 shadow-2xl' : 'bg-white border-slate-200 shadow-xl'
          }`}>

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
              <div className={`flex flex-col sm:flex-row items-center w-full py-4 transition-all justify-evenly ${isFullscreen ? 'px-3 sm:px-8 lg:px-12 gap-6 sm:gap-8' : 'px-2 sm:px-4 gap-4 sm:gap-6'
                }`}>
                
                <div className="relative flex flex-col items-center justify-center">
                  <div
                    key={currentSessionId}
                    className={`absolute -inset-4 rounded-[36px] pointer-events-none opacity-40 progress-border ${!isRefreshing ? 'animating-border' : ''}`}
                    style={{ '--border-color': '#10b981' }}
                  />
                  <div className={`relative z-10 rounded-[30px] ${isFullscreen ? 'p-7' : 'p-5'} shadow-2xl flex flex-col items-center border transition-all ${isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-emerald-50/70 border-emerald-100'
                    }`}>
                    <span className={`${isFullscreen ? 'text-[18px] mb-5' : 'text-[15px] mb-3'} font-black tracking-widest text-emerald-500 uppercase`}>GİRİŞ YAP</span>
                    <div className="relative p-4 bg-white rounded-[24px] shadow-md flex items-center justify-center overflow-hidden">
                      <div className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${isRefreshing ? 'opacity-0 blur-md scale-90' : 'opacity-100 blur-0 scale-100'}`}>
                        {qrDataEntry ? (
                          <QRCode value={qrDataEntry} size={isFullscreen ? 255 : 175} level="H" fgColor="#0f172a" bgColor="#ffffff" />
                        ) : (
                          <div className={`flex items-center justify-center ${isFullscreen ? 'w-[255px] h-[255px]' : 'w-[175px] h-[175px]'}`}>
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

                <div className="flex flex-col items-center justify-center my-auto text-center" style={{ maxWidth: isFullscreen ? '470px' : '280px', padding: isFullscreen ? '30px 10px' : '10px 5px' }}>

                  <h2 className={`font-black leading-[1.12] pb-1 ${isFullscreen ? 'text-[40px] sm:text-[48px]' : 'text-[26px] sm:text-[30px]'}`}
                    style={{ letterSpacing: '-1.5px', color: isDark ? '#f7f9fc' : '#0f172a', textShadow: isDark ? '0 5px 28px rgba(0,0,0,.28)' : 'none' }}
                  >
                    Akıllı
                    <span className={`block mt-2 pb-1 ${isDark ? 'bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent' : 'text-[#1e40af]'
                      }`}>Geçiş Sistemi</span>
                  </h2>

                  <div className="w-full flex justify-center -mt-2" style={{ transform: 'translateY(-10.3px)' }}>
                    <svg
                      width="190"
                      height="30"
                      viewBox="0 0 190 30"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-[150px] sm:w-[185px] h-auto"
                    >
                      
                      <path
                        d="M 28 8 Q 100 -1 172 8 Q 179 9.5 152 11 Q 112 12.5 72 19 Q 60 21 78 22 Q 108 19 138 25"
                        stroke="#ef4444"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  <p className={`mt-3 ${isFullscreen ? 'text-[15px]' : 'text-[13px]'} font-medium leading-[1.65]`}
                    style={{ color: isDark ? '#8997ad' : '#475569', maxWidth: '390px' }}
                  >
                    QR kod teknolojisi ile hızlı, güvenli ve temassız öğrenci, personel giriş-çıkış yönetimi.
                  </p>
                  
                  <button
                    onClick={refreshQR}
                    className={`mt-7 inline-flex items-center gap-2 px-5 py-2 rounded-full font-bold text-[12px] border transition-all duration-300 hover:scale-105 active:scale-95 ${isDark
                      ? 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:text-white hover:border-slate-600 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 shadow-md hover:shadow-lg'
                      }`}
                  >
                    <RefreshCcw size={13} className={`transition-transform ${isRefreshing ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
                    <span ref={selectedType === 'institution_gate' ? secondsTextRef : undefined} className="tabular-nums tracking-wide">
                      3.5 saniye kaldı
                    </span>
                  </button>
                </div>

                <div className="relative flex flex-col items-center justify-center">
                  <div
                    key={currentSessionId}
                    className={`absolute -inset-4 rounded-[36px] pointer-events-none opacity-40 progress-border ${!isRefreshing ? 'animating-border' : ''}`}
                    style={{ '--border-color': '#ef4444' }}
                  />
                  <div className={`relative z-10 rounded-[30px] ${isFullscreen ? 'p-7' : 'p-5'} shadow-2xl flex flex-col items-center border transition-all ${isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-red-50/70 border-red-100'
                    }`}>
                    <span className={`${isFullscreen ? 'text-[18px] mb-5' : 'text-[15px] mb-3'} font-black tracking-widest text-rose-500 uppercase`}>ÇIKIŞ YAP</span>
                    <div className="relative p-4 bg-white rounded-[24px] shadow-md flex items-center justify-center overflow-hidden">
                      <div className={`transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${isRefreshing ? 'opacity-0 blur-md scale-90' : 'opacity-100 blur-0 scale-100'}`}>
                        {qrDataExit ? (
                          <QRCode value={qrDataExit} size={isFullscreen ? 255 : 175} level="H" fgColor="#0f172a" bgColor="#ffffff" />
                        ) : (
                          <div className={`flex items-center justify-center ${isFullscreen ? 'w-[255px] h-[255px]' : 'w-[175px] h-[175px]'}`}>
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
                <div className={`relative z-10 rounded-[32px] p-8 shadow-2xl flex flex-col items-center border ${isDark ? 'bg-slate-800/90 border-slate-700' : 'bg-indigo-50/70 border-indigo-100'
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

          {selectedType !== 'institution_gate' && (
            <div className="mt-8 flex justify-center">
              <button
                onClick={refreshQR}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-bold border transition-all duration-300 hover:scale-105 active:scale-95 ${isDark
                  ? 'bg-slate-800/90 border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 shadow-sm'
                  : 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 shadow-md hover:shadow-lg'
                  }`}
              >
                <RefreshCcw size={13} className={`transition-transform ${isRefreshing ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
                <span ref={selectedType !== 'institution_gate' ? secondsTextRef : undefined} className="tabular-nums tracking-wide">
                  3.5 saniye kaldı
                </span>
              </button>
            </div>
          )}

          <div className="mt-10 w-full flex flex-col items-center justify-center select-none">
            <span className={`text-[11px] font-semibold tracking-[3px] uppercase mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'
              }`}>
              POWERED BY
            </span>
            <a
              href="https://www.chenki.net"
              target="_blank"
              rel="noopener noreferrer"
              className={`no-underline font-normal tracking-wide transition-all duration-300 hover:opacity-80 hover:scale-105 ${isFullscreen ? 'text-[26px] sm:text-[30px]' : 'text-[22px] sm:text-[26px]'
                } ${isDark ? 'text-white' : 'text-slate-900'}`}
              style={{ fontFamily: "'Comfortaa', sans-serif", wordSpacing: '-4px', letterSpacing: '0.5px', fontWeight: 300 }}
            >
              www . chenki . net
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRGeneratorAdminView;
