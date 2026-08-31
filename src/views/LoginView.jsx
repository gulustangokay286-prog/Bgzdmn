import React, { useState, useEffect } from 'react';
import { getAuth, signInWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { Mail, Lock, ArrowRight, ShieldAlert, GraduationCap, BookOpen, Award, Library, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { app } from '../services/firebaseConfig';

const auth = getAuth(app);
const db = getFirestore(app);

const LoginView = () => {
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return localStorage.getItem('bgz_admin_remember') === 'true';
    } catch {
      return false;
    }
  });

  const [email, setEmail] = useState(() => {
    try {
      const isRemembered = localStorage.getItem('bgz_admin_remember') === 'true';
      return isRemembered ? (localStorage.getItem('bgz_admin_saved_email') || '') : '';
    } catch {
      return '';
    }
  });

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('login'); // 'login' | 'forgot'
  const [resetSuccess, setResetSuccess] = useState('');

  const handleRememberToggle = () => {
    const next = !rememberMe;
    setRememberMe(next);
    try {
      localStorage.setItem('bgz_admin_remember', String(next));
      if (!next) {
        localStorage.removeItem('bgz_admin_saved_email');
      } else if (email) {
        localStorage.setItem('bgz_admin_saved_email', email);
      }
    } catch (e) {
      console.warn('Storage error', e);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (rememberMe && email) {
      try {
        localStorage.setItem('bgz_admin_remember', 'true');
        localStorage.setItem('bgz_admin_saved_email', email);
      } catch (e) {}
    } else {
      try {
        localStorage.removeItem('bgz_admin_remember');
        localStorage.removeItem('bgz_admin_saved_email');
      } catch (e) {}
    }

    try {
      await new Promise(resolve => setTimeout(resolve, 800));

      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
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
      
      {/* 1. GLOBAL WATERMARK ICONS (z-0) 
          These sit in the background of the ENTIRE page. They will flawlessly show through 
          wherever the SVG Hero Image is clipped, completely eliminating any "sütun" or straight line gaps! */}
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

      {/* 2. TOP BANNER HERO (Native SVG <image> with internal clipPath for 100% browser compatibility) */}
      <div className="relative w-full min-h-[220px] md:min-h-[280px] h-[34vh] md:h-[38vh] shrink-0 z-10">
        
        <svg className="w-full h-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <defs>
            {/* The clip path that perfectly curves the bottom of the image */}
            <clipPath id="heroCurve">
              <path d="M0,0 L1440,0 L1440,220 Q720,320 0,220 Z" />
            </clipPath>
            
            {/* Dark gradient for the image overlay */}
            <linearGradient id="heroGradient" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#0f172a" stopOpacity="1" />
              <stop offset="40%" stopColor="#0f172a" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.2" />
            </linearGradient>

            {/* Path for the text overlay to follow exactly */}
            <path id="textWarpPath" d="M0,212 Q720,312 1440,212" />
          </defs>

          {/* The Hero Image, drawn natively in SVG and clipped */}
          <image 
            href="/login-bg.jpg" 
            x="0" y="0" 
            width="1440" height="320" 
            preserveAspectRatio="xMidYMid slice" 
            clipPath="url(#heroCurve)" 
            opacity="0.85"
          />

          {/* The Dark Gradient Overlay, clipped exactly like the image */}
          <rect 
            x="0" y="0" 
            width="1440" height="320" 
            fill="url(#heroGradient)" 
            clipPath="url(#heroCurve)" 
          />

          {/* The Text Overlay perfectly following the curve */}
          <text className="fill-slate-400 font-bold opacity-60 tracking-[0.22em] uppercase text-[15px] sm:text-[13px]" dy="20">
            <textPath href="#textWarpPath" startOffset="50%" textAnchor="middle">
              Lütfen yetkili hesabınıza giriş yapın
            </textPath>
          </text>
        </svg>

        {/* Center Logo & Title (HTML overlaid on top of the SVG) */}
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

      {/* 3. MAIN CONTENT AREA / FORM (z-30) */}
      <div className="relative flex-1 px-4 md:px-6 flex flex-col items-center pt-8 z-30">
        <div className="w-full max-w-[360px] flex flex-col items-center box-border">

          {/* Error Banner */}
          {error && (
            <div className="flex items-center gap-2.5 p-3 bg-red-950/50 text-red-400 rounded-xl text-xs mb-3.5 border border-red-900/60 font-semibold w-full box-border animate-fade-in">
              <ShieldAlert size={16} className="shrink-0 text-red-500" />
              <span className="flex-1 leading-snug">{error}</span>
            </div>
          )}

          {/* Success Banner */}
          {resetSuccess && (
            <div className="flex items-center gap-2.5 p-3 bg-blue-950/50 text-blue-300 rounded-xl text-xs mb-3.5 border border-blue-900/60 font-semibold w-full box-border animate-fade-in">
              <CheckCircle2 size={16} className="shrink-0 text-blue-400" />
              <span className="flex-1 leading-snug text-center">{resetSuccess}</span>
            </div>
          )}

          {/* LOGIN VIEW */}
          {view === 'login' ? (
            <form onSubmit={handleLogin} className="flex flex-col gap-3.5 w-full box-border">

              {/* Modern Sleek Email Input */}
              <div className="relative w-full group">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors pointer-events-none" />
                <input
                  type="email"
                  className="w-full !h-11 !pl-10 !pr-4 bg-slate-800/60 hover:bg-slate-800/80 focus-within:bg-slate-800 border border-slate-700/60 focus:border-blue-500 rounded-xl text-white text-xs font-medium placeholder:text-slate-400 outline-none transition-all box-border !m-0 shadow-sm"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="E-posta Adresi"
                />
              </div>

              {/* Modern Sleek Password Input */}
              <div className="relative w-full group">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors pointer-events-none" />
                <input
                  type="password"
                  className="w-full !h-11 !pl-10 !pr-4 bg-slate-800/60 hover:bg-slate-800/80 focus-within:bg-slate-800 border border-slate-700/60 focus:border-blue-500 rounded-xl text-white text-xs font-medium placeholder:text-slate-400 outline-none transition-all box-border !m-0 shadow-sm"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="Şifre"
                />
              </div>

              {/* Controls: Remember Me & Forgot Password */}
              <div className="flex items-center justify-between w-full px-1 pt-0.5">
                
                {/* Remember Me Toggle */}
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

                {/* Forgot Password Link */}
                <span 
                  onClick={() => { setView('forgot'); setError(''); setResetSuccess(''); }}
                  className="text-xs font-semibold text-slate-400 hover:text-blue-400 cursor-pointer transition-colors"
                >
                  Şifremi unuttum?
                </span>
              </div>

              {/* Multi-Animated Clean Blue Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="relative w-full h-11 rounded-xl text-xs font-bold text-white transition-all duration-300 mt-1.5 bg-blue-600 hover:bg-blue-500 border border-blue-400/20 active:scale-[0.99] disabled:opacity-50 overflow-hidden group cursor-pointer box-border flex items-center justify-center shadow-lg shadow-blue-900/20"
              >
                {/* White Slide Shine Sweep Effect */}
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
            /* FORGOT PASSWORD VIEW */
            <form onSubmit={handleResetPassword} className="flex flex-col gap-3.5 w-full box-border">
              
              <div className="text-center mb-1">
                <h3 className="text-sm font-bold text-white mb-1">Şifre Sıfırlama</h3>
                <p className="text-xs text-slate-400 font-medium leading-relaxed">
                  Kayıtlı e-posta adresinizi girin. Size bir şifre sıfırlama bağlantısı göndereceğiz.
                </p>
              </div>

              {/* Modern Sleek Email Input */}
              <div className="relative w-full group">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-400 transition-colors pointer-events-none" />
                <input
                  type="email"
                  className="w-full !h-11 !pl-10 !pr-4 bg-slate-800/60 hover:bg-slate-800/80 focus-within:bg-slate-800 border border-slate-700/60 focus:border-blue-500 rounded-xl text-white text-xs font-medium placeholder:text-slate-400 outline-none transition-all box-border !m-0 shadow-sm"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="E-posta Adresi"
                />
              </div>

              {/* Multi-Animated Blue Reset Button */}
              <button
                type="submit"
                disabled={loading}
                className="relative w-full h-11 rounded-xl text-xs font-bold text-white transition-all duration-300 mt-1 bg-blue-600 hover:bg-blue-500 border border-blue-400/20 active:scale-[0.99] disabled:opacity-50 overflow-hidden group cursor-pointer box-border flex items-center justify-center shadow-lg shadow-blue-900/20"
              >
                {/* White Slide Shine Sweep Effect */}
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

              {/* Back to Login Button */}
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

          {/* Footer Copyright */}
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
