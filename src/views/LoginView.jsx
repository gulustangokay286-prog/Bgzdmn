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

    // Update rememberMe email persistence
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
    
    const overscrollBg = `linear-gradient(to top, #0f172a 0%, #0f172a 50%, transparent 50%), url("https://images.unsplash.com/photo-1434030216411-0b793f4b4173?q=80&w=2070&auto=format&fit=crop") center top / cover no-repeat fixed`;
    
    document.documentElement.style.background = overscrollBg;
    document.documentElement.style.backgroundColor = '#0f172a';
    document.body.style.background = overscrollBg;
    document.body.style.backgroundColor = '#0f172a';

    return () => {
      document.documentElement.style.background = originalHtmlBg;
      document.body.style.background = originalBodyBg;
    };
  }, []);

  return (
    <div className="relative w-full h-[100dvh] flex flex-col bg-[#0f172a] overflow-y-auto overflow-x-hidden select-none">
      
      {/* Top Banner & School Info */}
      <div className="relative w-full min-h-[200px] md:min-h-[260px] h-[32vh] md:h-[36vh] shrink-0 flex flex-col items-center justify-center overflow-hidden">
        
        <div
          className="absolute inset-0 w-full h-full bg-cover bg-center scale-105 z-0 opacity-80"
          style={{ backgroundImage: 'url("/login-bg.jpg")' }}
        ></div>
        <div className="absolute inset-0 w-full h-full bg-gradient-to-t from-[#0f172a] via-[#0f172a]/60 to-[#0f172a]/10 z-0"></div>

        {/* Logo & Title Section */}
        <div className="relative z-10 flex flex-col items-center text-center px-4">
          <img 
            src="/logo-chatgpt.png" 
            alt="Logo" 
            className="w-14 md:w-16 h-auto mb-2 md:mb-3 drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)]" 
          />
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight drop-shadow-[0_0_20px_rgba(0,0,0,1)] [text-shadow:0_4px_8px_rgba(0,0,0,0.8)] flex items-center justify-center">
            <span>Boğaziçi</span>
            <span className="text-red-500 ml-2.5 md:ml-3">Koleji</span>
          </h1>
          <p className="text-[10px] md:text-xs font-bold text-slate-300 mt-1 uppercase tracking-[0.15em] drop-shadow-lg">
            Yetkili Girişi
          </p>
        </div>
      </div>

      {/* Login / Reset Area */}
      <div className="relative flex-1 bg-[#0f172a] pt-8 md:pt-10 pb-8 md:pb-12 px-4 md:px-6 flex flex-col items-center justify-start z-10">
        
        {/* Subtle Watermark Icons */}
        <div className="absolute z-0 pointer-events-none opacity-[0.03] overflow-hidden flex justify-center items-center inset-0">
          <div className="w-[200%] h-[200%] flex flex-wrap justify-center items-center gap-16 -rotate-12 scale-125 transform translate-y-32 pt-24">
            {Array.from({ length: 40 }).map((_, i) => (
              <div key={i} className="flex items-center justify-center w-24 h-24">
                {i % 5 === 0 && <img src="/logo.png" alt="" className="w-20 h-auto grayscale opacity-80" />}
                {i % 5 === 1 && <GraduationCap size={72} className="text-white" />}
                {i % 5 === 2 && <BookOpen size={72} className="text-white" />}
                {i % 5 === 3 && <Library size={72} className="text-white" />}
                {i % 5 === 4 && <Award size={72} className="text-white" />}
              </div>
            ))}
          </div>
        </div>

        {/* Waved Separator */}
        <div className="absolute bottom-full left-0 w-full h-[60px] sm:h-[80px] md:h-[100px] pointer-events-none translate-y-[1px]">
          <svg
            className="w-full h-full text-[#0f172a]"
            viewBox="0 0 1440 120"
            preserveAspectRatio="xMidYMax slice"
          >
            <defs>
              <path id="textWarpPath" d="M0,120 Q720,10 1440,120" />
            </defs>
            <path d="M0,120 Q720,-20 1440,120 Z" className="fill-current" />
            <text className="fill-white font-bold opacity-50 tracking-[0.2em] uppercase text-[24px] sm:text-[18px] md:text-[13px]" dy="15">
              <textPath href="#textWarpPath" startOffset="50%" textAnchor="middle">
                Lütfen yetkili hesabınıza giriş yapın
              </textPath>
            </text>
          </svg>
        </div>

        {/* Main Content Box */}
        <div className="relative w-full max-w-[360px] flex flex-col items-center box-border z-10">

          {/* Error Banner */}
          {error && (
            <div className="flex items-center gap-2.5 p-3 bg-red-950/40 text-red-400 rounded-xl text-xs mb-4 border border-red-900/50 font-bold w-full box-border animate-fade-in">
              <ShieldAlert size={16} className="shrink-0 text-red-500" />
              <span className="flex-1 leading-snug">{error}</span>
            </div>
          )}

          {/* Success Banner */}
          {resetSuccess && (
            <div className="flex items-center gap-2.5 p-3 bg-blue-950/40 text-blue-300 rounded-xl text-xs mb-4 border border-blue-900/50 font-bold w-full box-border animate-fade-in">
              <CheckCircle2 size={16} className="shrink-0 text-blue-400" />
              <span className="flex-1 leading-snug text-center">{resetSuccess}</span>
            </div>
          )}

          {/* LOGIN VIEW */}
          {view === 'login' ? (
            <form onSubmit={handleLogin} className="flex flex-col gap-3.5 w-full box-border">

              {/* Email Input */}
              <div className="relative w-full group">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-white transition-colors z-10 pointer-events-none" />
                <input
                  type="email"
                  className="w-full !h-12 bg-slate-800/50 !bg-slate-800/50 backdrop-blur-md shadow-inner border border-slate-700/40 rounded-xl focus-within:border-blue-500 focus-within:bg-slate-800/80 transition-all !pl-11 !pr-4 !py-0 text-white placeholder-slate-400 text-[14px] font-medium outline-none box-border m-0"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="E-posta Adresi"
                />
              </div>

              {/* Password Input */}
              <div className="relative w-full group">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-white transition-colors z-10 pointer-events-none" />
                <input
                  type="password"
                  className="w-full !h-12 bg-slate-800/50 !bg-slate-800/50 backdrop-blur-md shadow-inner border border-slate-700/40 rounded-xl focus-within:border-blue-500 focus-within:bg-slate-800/80 transition-all !pl-11 !pr-4 !py-0 text-white placeholder-slate-400 text-[14px] font-medium outline-none box-border m-0"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="Şifre"
                />
              </div>

              {/* Controls: Remember Me & Forgot Password */}
              <div className="flex items-center justify-between w-full px-1 mt-0.5">
                
                {/* Remember Me Toggle */}
                <div
                  onClick={handleRememberToggle}
                  className="flex items-center gap-2.5 cursor-pointer select-none group"
                >
                  <div className={`w-8 h-4.5 rounded-full relative transition-all duration-200 box-border ${rememberMe ? 'bg-blue-600' : 'bg-slate-800/60 border border-slate-700/50'}`}>
                    <div className={`w-3 h-3 rounded-full absolute top-[2px] transition-all duration-200 ${rememberMe ? 'left-[16px] bg-white' : 'left-[3px] bg-slate-400'}`}></div>
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

              {/* Multi-Animated Clean Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="relative w-full h-12 rounded-xl text-sm font-bold text-white transition-all duration-300 mt-2 bg-blue-600 hover:bg-blue-500 border border-blue-400/20 active:scale-[0.99] disabled:opacity-50 overflow-hidden group cursor-pointer box-border flex items-center justify-center"
              >
                {/* White Slide Shine Sweep Effect */}
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out pointer-events-none" />

                {loading ? (
                  <div className="flex items-center justify-center gap-2.5 w-full">
                    <div className="relative flex items-center justify-center w-5 h-5">
                      <svg className="animate-spin absolute inset-0 w-full h-full text-white/20" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      </svg>
                      <svg className="animate-spin absolute inset-0 w-full h-full text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                    <span className="tracking-wide text-xs">Yetkiler Kontrol Ediliyor...</span>
                  </div>
                ) : (
                  <div className="relative z-10 flex items-center justify-center gap-2 font-bold tracking-wide">
                    <span className="transition-transform duration-300 group-hover:-translate-x-0.5">
                      Giriş Yap
                    </span>
                    <ArrowRight 
                      size={17} 
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
                <h3 className="text-base font-bold text-white mb-1">Şifre Sıfırlama</h3>
                <p className="text-xs text-slate-400 font-medium leading-relaxed">
                  Kayıtlı e-posta adresinizi girin. Size bir şifre sıfırlama bağlantısı göndereceğiz.
                </p>
              </div>

              {/* Email Input */}
              <div className="relative w-full group">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-white transition-colors z-10 pointer-events-none" />
                <input
                  type="email"
                  className="w-full !h-12 bg-slate-800/50 !bg-slate-800/50 backdrop-blur-md shadow-inner border border-slate-700/40 rounded-xl focus-within:border-blue-500 focus-within:bg-slate-800/80 transition-all !pl-11 !pr-4 !py-0 text-white placeholder-slate-400 text-[14px] font-medium outline-none box-border m-0"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="E-posta Adresi"
                />
              </div>

              {/* Multi-Animated Blue Reset Button */}
              <button
                type="submit"
                disabled={loading}
                className="relative w-full h-12 rounded-xl text-sm font-bold text-white transition-all duration-300 mt-1 bg-blue-600 hover:bg-blue-500 border border-blue-400/20 active:scale-[0.99] disabled:opacity-50 overflow-hidden group cursor-pointer box-border flex items-center justify-center"
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
                      size={17} 
                      className="transition-transform duration-300 ease-out group-hover:translate-x-1" 
                    />
                  </div>
                )}
              </button>

              {/* Back to Login Button */}
              <button
                type="button"
                onClick={() => { setView('login'); setError(''); setResetSuccess(''); }}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all duration-200 box-border flex items-center justify-center gap-1.5 cursor-pointer mt-1"
              >
                <ArrowLeft size={14} />
                <span>Giriş Ekranına Dön</span>
              </button>
            </form>
          )}

          {/* Footer Copyright */}
          <div className="text-center mt-8 md:mt-10 w-full pb-4 md:pb-0">
            <p className="text-[10px] md:text-xs text-slate-500/70 font-medium tracking-wide">
              Boğaziçi Koleji © {new Date().getFullYear()} Tüm hakları saklıdır.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default LoginView;
