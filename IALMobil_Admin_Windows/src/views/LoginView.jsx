import React, { useState, useEffect } from 'react';
import { getAuth, signInWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { Mail, Lock, ArrowRight, ShieldAlert, GraduationCap, BookOpen, Award, Library, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { app } from '../services/firebaseConfig';

const auth = getAuth(app);
const db = getFirestore(app);

const REMEMBER_KEY = 'bgz_admin_remember';
const EMAIL_KEY = 'bgz_admin_saved_email';

/** localStorage kapali olabilir (gizli sekme, kisitli profil); sessizce gecilir. */
const store = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* depolama kapali */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* depolama kapali */ }
  }
};

const LoginView = () => {
  const [rememberMe, setRememberMe] = useState(() => store.get(REMEMBER_KEY) === 'true');

  const [email, setEmail] = useState(
    () => (store.get(REMEMBER_KEY) === 'true' ? store.get(EMAIL_KEY) || '' : '')
  );

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('login'); 
  const [resetSuccess, setResetSuccess] = useState('');

  const handleRememberToggle = () => {
    const next = !rememberMe;
    setRememberMe(next);
    store.set(REMEMBER_KEY, String(next));
    if (next) {
      if (email) store.set(EMAIL_KEY, email);
    } else {
      store.remove(EMAIL_KEY);
    }
  };

  /**
   * Anahtar acikken e-posta her tus vurusunda saklanir. Onceden yalnizca
   * girise basildiginda kaydediliyordu; kullanici e-postayi yazip pencereyi
   * kapatinca hatirlanmiyordu.
   */
  const handleEmailChange = (value) => {
    setEmail(value);
    if (rememberMe) store.set(EMAIL_KEY, value);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (rememberMe && email) {
      store.set(REMEMBER_KEY, 'true');
      store.set(EMAIL_KEY, email);
    } else {
      store.remove(REMEMBER_KEY);
      store.remove(EMAIL_KEY);
    }

    try {
      // Kalicilik ayarlanamazsa (ortam desteklemiyorsa) giris yine de denenir.
      try {
        await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      } catch (persistErr) {
        console.warn('Oturum kalıcılığı ayarlanamadı:', persistErr?.message);
      }
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const idTokenResult = await user.getIdTokenResult();
      const hasAdminClaim = idTokenResult.claims.admin === true || idTokenResult.claims.superadmin === true;

      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists() && !hasAdminClaim) {
        await signOut(auth);
        setError('Hatalı giriş yaptınız.');
        setLoading(false);
        return;
      }

      const userData = userDocSnap.exists() ? userDocSnap.data() : {};
      const role = userData.role?.toLowerCase();

      if (!hasAdminClaim && role !== 'admin' && role !== 'patron' && role !== 'superadmin') {
        await signOut(auth);
        setError('Hatalı giriş yaptınız. Yetkiniz yok.');
        setLoading(false);
        return;
      }

    } catch (err) {
      console.error(err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Giriş başarısız. E-posta veya şifre hatalı.');
      } else {
        setError('Bir hata oluştu: ' + err.message);
      }
      await signOut(auth);
    }
    setLoading(false);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!email) {
      setError('Lütfen e-posta adresinizi girin.');
      return;
    }
    setError('');
    setResetSuccess('');
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setResetSuccess('Şifre sıfırlama bağlantısı e-posta adresinize gönderildi. Lütfen gelen kutunuzu kontrol edin.');
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/user-not-found') {
        setError('Bu e-posta adresine kayıtlı yetkili bulunamadı.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Geçersiz bir e-posta adresi girdiniz.');
      } else {
        setError('Bir hata oluştu: ' + err.message);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    const originalHtmlBg = document.documentElement.style.background;
    const originalBodyBg = document.body.style.background;
    
    document.documentElement.style.background = '#0f172a';
    document.documentElement.style.backgroundColor = '#0f172a';
    document.body.style.background = '#0f172a';
    document.body.style.backgroundColor = '#0f172a';

    return () => {
      document.documentElement.style.background = originalHtmlBg;
      document.body.style.background = originalBodyBg;
    };
  }, []);

  return (
    <div className="relative w-full h-[100dvh] flex flex-col bg-[#0f172a] overflow-y-auto overflow-x-hidden select-none">

      <div className="absolute inset-0 z-0 pointer-events-none opacity-[0.035] overflow-hidden flex justify-center items-center">
        <div className="w-[180%] h-[180%] flex flex-wrap justify-center items-center gap-16 -rotate-12 scale-125 transform translate-y-8">
          {Array.from({ length: 48 }).map((_, i) => (
            <div key={i} className="flex items-center justify-center w-24 h-24">
              {i % 5 === 0 && <img src="/logo-4327.png" alt="" className="w-16 h-auto grayscale opacity-80" />}
              {i % 5 === 1 && <GraduationCap size={72} className="text-white" />}
              {i % 5 === 2 && <BookOpen size={72} className="text-white" />}
              {i % 5 === 3 && <Library size={72} className="text-white" />}
              {i % 5 === 4 && <Award size={72} className="text-white" />}
            </div>
          ))}
        </div>
      </div>

      <div className="relative w-full min-h-[220px] md:min-h-[280px] h-[34vh] md:h-[38vh] shrink-0 z-10">
        
        <svg className="w-full h-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <defs>
            
            <clipPath id="heroCurve">
              <path d="M0,0 L1440,0 L1440,220 Q720,320 0,220 Z" />
            </clipPath>

            <linearGradient id="heroGradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#0f172a" stopOpacity="1" />
              <stop offset="40%" stopColor="#0f172a" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.2" />
            </linearGradient>

            <path id="textWarpPath" d="M0,212 Q720,312 1440,212" />
          </defs>

          <image 
            href="/login-bg.jpg" 
            x="0" y="0" 
            width="1440" height="320" 
            preserveAspectRatio="xMidYMid slice" 
            clipPath="url(#heroCurve)" 
            opacity="0.85"
          />

          <rect 
            x="0" y="0" 
            width="1440" height="320" 
            fill="url(#heroGradient)" 
            clipPath="url(#heroCurve)" 
          />

          <text className="fill-slate-400 font-bold opacity-60 tracking-[0.22em] uppercase text-[15px] sm:text-[13px]" dy="20">
            <textPath href="#textWarpPath" startOffset="50%" textAnchor="middle">
              Lütfen yetkili hesabınıza giriş yapın
            </textPath>
          </text>
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 -mt-6 z-20 pointer-events-none">
          <img 
            src="/logo-4327.png" 
            alt="Boğaziçi Koleji Logo" 
            className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)] mb-2.5" 
          />
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] flex items-center justify-center gap-2.5">
            <span>Boğaziçi</span>
            <span className="text-red-500">Koleji</span>
          </h1>
          <p className="text-[10.5px] md:text-[11.5px] font-bold text-slate-300 mt-1 uppercase tracking-[0.2em] drop-shadow-md">
            Yetkili Girişi
          </p>
        </div>
      </div>

      <div className="relative flex-1 px-4 md:px-6 flex flex-col items-center pt-8 z-30">
        <div className="w-full max-w-[360px] flex flex-col items-center box-border">

          {error && (
            <div className="flex items-center gap-2.5 p-3 bg-red-950/50 text-red-400 rounded-xl text-xs mb-3.5 border border-red-900/60 font-semibold w-full box-border animate-fade-in">
              <ShieldAlert size={16} className="shrink-0 text-red-500" />
              <span className="flex-1 leading-snug">{error}</span>
            </div>
          )}

          {resetSuccess && (
            <div className="flex items-center gap-2.5 p-3 bg-blue-950/50 text-blue-300 rounded-xl text-xs mb-3.5 border border-blue-900/60 font-semibold w-full box-border animate-fade-in">
              <CheckCircle2 size={16} className="shrink-0 text-blue-400" />
              <span className="flex-1 leading-snug text-center">{resetSuccess}</span>
            </div>
          )}

          {view === 'login' ? (
            <form onSubmit={handleLogin} className="flex flex-col gap-3.5 w-full box-border">

              <div className="relative w-full group">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors pointer-events-none" />
                <input
                  type="email"
                  className="w-full !h-11 !pl-10 !pr-4 !bg-slate-800/80 hover:!bg-slate-800 focus:!bg-slate-800 border border-slate-700/80 focus:!border-blue-500 rounded-xl !text-white text-xs font-medium placeholder:text-slate-400 outline-none transition-all box-border !m-0 shadow-sm"
                  value={email}
                  onChange={e => handleEmailChange(e.target.value)}
                  required
                  autoFocus
                  placeholder="E-posta Adresi"
                />
              </div>

              <div className="relative w-full group">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors pointer-events-none" />
                <input
                  type="password"
                  className="w-full !h-11 !pl-10 !pr-4 !bg-slate-800/80 hover:!bg-slate-800 focus:!bg-slate-800 border border-slate-700/80 focus:!border-blue-500 rounded-xl !text-white text-xs font-medium placeholder:text-slate-400 outline-none transition-all box-border !m-0 shadow-sm"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="Şifre"
                />
              </div>

              <div className="flex items-center justify-between w-full px-1 pt-0.5">

                <div
                  onClick={handleRememberToggle}
                  className="flex items-center gap-2.5 cursor-pointer select-none group"
                >
                  <div className={`w-8 h-[18px] rounded-full relative transition-colors duration-200 ${rememberMe ? 'bg-blue-600' : 'bg-slate-800 border border-slate-700'}`}>
                    <div className={`w-3 h-3 rounded-full bg-white absolute top-[2.5px] transition-transform duration-200 ${rememberMe ? 'translate-x-[15px]' : 'translate-x-[2.5px]'}`} />
                  </div>
                  <span className="text-xs font-semibold text-slate-400 group-hover:text-slate-200 transition-colors">
                    Beni Hatırla
                  </span>
                </div>

                <span 
                  onClick={() => { setView('forgot'); setError(''); setResetSuccess(''); }}
                  className="text-xs font-semibold text-slate-400 hover:text-blue-400 cursor-pointer transition-colors"
                >
                  Şifremi unuttum?
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="relative w-full h-11 rounded-xl text-xs font-bold text-white transition-all duration-300 mt-1.5 bg-blue-600 hover:bg-blue-500 border border-blue-400/20 active:scale-[0.99] disabled:opacity-50 overflow-hidden group cursor-pointer box-border flex items-center justify-center shadow-lg shadow-blue-900/20"
              >
                
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out pointer-events-none" />

                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span className="text-xs font-semibold">Yetkiler Kontrol Ediliyor...</span>
                  </div>
                ) : (
                  <div className="relative z-10 flex items-center justify-center gap-2 font-bold tracking-wide">
                    <span className="transition-transform duration-300 group-hover:-translate-x-0.5">
                      Giriş Yap
                    </span>
                    <ArrowRight 
                      size={15} 
                      className="transition-transform duration-300 ease-out group-hover:translate-x-1" 
                    />
                  </div>
                )}
              </button>

            </form>
          ) : (
            
            <form onSubmit={handleResetPassword} className="flex flex-col gap-3.5 w-full box-border">
              
              <div className="text-center mb-1">
                <h3 className="text-sm font-bold text-white mb-1">Şifre Sıfırlama</h3>
                <p className="text-xs text-slate-400 font-medium leading-relaxed">
                  Kayıtlı e-posta adresinizi girin. Size bir şifre sıfırlama bağlantısı göndereceğiz.
                </p>
              </div>

              <div className="relative w-full group">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors pointer-events-none" />
                <input
                  type="email"
                  className="w-full !h-11 !pl-10 !pr-4 !bg-slate-800/80 hover:!bg-slate-800 focus:!bg-slate-800 border border-slate-700/80 focus:!border-blue-500 rounded-xl !text-white text-xs font-medium placeholder:text-slate-400 outline-none transition-all box-border !m-0 shadow-sm"
                  value={email}
                  onChange={e => handleEmailChange(e.target.value)}
                  required
                  autoFocus
                  placeholder="E-posta Adresi"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="relative w-full h-11 rounded-xl text-xs font-bold text-white transition-all duration-300 mt-1 bg-blue-600 hover:bg-blue-500 border border-blue-400/20 active:scale-[0.99] disabled:opacity-50 overflow-hidden group cursor-pointer box-border flex items-center justify-center shadow-lg shadow-blue-900/20"
              >
                
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out pointer-events-none" />

                {loading ? (
                  <span className="text-xs font-semibold">Gönderiliyor...</span>
                ) : (
                  <div className="relative z-10 flex items-center justify-center gap-2 font-bold tracking-wide">
                    <span className="transition-transform duration-300 group-hover:-translate-x-0.5">
                      Bağlantı Gönder
                    </span>
                    <ArrowRight 
                      size={15} 
                      className="transition-transform duration-300 ease-out group-hover:translate-x-1" 
                    />
                  </div>
                )}
              </button>

              <button
                type="button"
                onClick={() => { setView('login'); setError(''); setResetSuccess(''); }}
                className="w-full py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all box-border flex items-center justify-center gap-1.5 cursor-pointer mt-0.5"
              >
                <ArrowLeft size={13} />
                <span>Giriş Ekranına Dön</span>
              </button>
            </form>
          )}

          <div className="text-center mt-8 w-full pb-4 md:pb-0">
            <p className="text-[10.5px] text-slate-500/80 font-medium tracking-wide">
              Boğaziçi Koleji © {new Date().getFullYear()} Tüm hakları saklıdır.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default LoginView;
