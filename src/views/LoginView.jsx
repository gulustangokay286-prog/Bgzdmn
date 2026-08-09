import React, { useState, useEffect } from 'react';
import { getAuth, signInWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { Mail, Lock, ArrowRight, ShieldAlert, GraduationCap, BookOpen, Award, Library } from 'lucide-react';
import { app } from '../services/firebaseConfig';

const auth = getAuth(app);
const db = getFirestore(app);

const LoginView = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Forgot Password States
  const [view, setView] = useState('login'); // 'login' | 'forgot'
  const [resetSuccess, setResetSuccess] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Show "Verifying..." animation for at least 1.5 seconds for UX
      await new Promise(resolve => setTimeout(resolve, 1500));

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

  // FIX MAC/IOS OVERSCROLL (RUBBER-BANDING):
  // Set the OS-level body/html background to the exact image (top half) and dark blue (bottom half)
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
    <div className="relative w-full h-[100dvh] flex flex-col bg-[#0f172a] overflow-y-auto overflow-x-hidden">
      
      {/* Top Bright Section with Background Image */}
      <div className="relative w-full min-h-[220px] md:min-h-[320px] h-[35vh] md:h-[40vh] shrink-0 flex flex-col items-center justify-center overflow-hidden">
        
        <div
          className="absolute inset-0 w-full h-full bg-cover bg-center scale-105 z-0 opacity-80"
          style={{ backgroundImage: 'url("/login-bg.jpg")' }}
        ></div>
        <div className="absolute inset-0 w-full h-full bg-gradient-to-t from-[#0f172a] via-[#0f172a]/60 to-[#0f172a]/10 z-0"></div>

        {/* Header with Logo */}
        <div className="relative z-10 flex flex-col items-center text-center px-4 mt-8 md:mt-0">
          <img src="/logo-chatgpt.png" alt="Logo" className="w-16 md:w-20 h-auto mb-4 md:mb-8 drop-shadow-[0_15px_15px_rgba(0,0,0,0.5)]" />
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight drop-shadow-[0_0_20px_rgba(0,0,0,1)] [text-shadow:0_4px_8px_rgba(0,0,0,0.8)]">
            Pivot <span className="text-red-500">Akademi</span>
          </h1>
          <p className="text-[10px] md:text-xs font-bold text-slate-300 mt-1 md:mt-2 uppercase tracking-[0.15em] drop-shadow-lg">Yetkili Girişi</p>
        </div>
      </div>

      {/* Bottom Modernist Dark Section */}
      <div className="relative flex-1 bg-[#0f172a] pt-12 md:pt-16 pb-8 md:pb-12 px-4 md:px-6 flex flex-col items-center justify-start z-10">
        
        {/* Edu Texture Background */}
        <div className="absolute z-0 pointer-events-none opacity-[0.03] overflow-hidden flex justify-center items-center" style={{ top: 0, left: 0, right: 0, bottom: 0 }}>
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

        {/* Semi-Circle Bend Warp with Text Inside Bending Along Path */}
        <div className="absolute bottom-full left-0 w-full h-[70px] sm:h-[90px] md:h-[120px] pointer-events-none translate-y-[1px]">
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
                Lütfen hesabınıza giriş yapın
              </textPath>
            </text>
          </svg>
        </div>

        {/* Inner Form Content Container */}
        <div className="relative w-full max-w-[360px] flex flex-col items-center box-border z-10">

          {/* Messages */}
          {error && (
            <div className="flex items-center gap-2.5 p-3 bg-red-950/40 text-red-400 rounded-xl text-xs mb-5 border border-red-900/50 font-bold w-full box-border">
              <ShieldAlert size={16} className="shrink-0 text-red-500" />
              <span className="flex-1 leading-snug">{error}</span>
            </div>
          )}

          {resetSuccess && (
            <div className="flex items-center gap-2.5 p-3 bg-green-950/40 text-green-400 rounded-xl text-xs mb-5 border border-green-900/50 font-bold w-full box-border">
              <span className="flex-1 leading-snug text-center">{resetSuccess}</span>
            </div>
          )}

          {/* Form */}
          {view === 'login' ? (
            <form onSubmit={handleLogin} className="flex flex-col gap-3.5 w-full box-border">

              <div className="relative w-full group">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-white transition-colors z-10 pointer-events-none" />
                <input
                  type="email"
                  className="w-full bg-slate-800/40 !bg-slate-800/40 backdrop-blur-md shadow-inner border border-slate-700/30 rounded-xl focus-within:border-white focus-within:bg-slate-800/60 focus-within:ring-2 focus-within:ring-white/20 transition-all pl-11 pr-4 py-3.5 text-white placeholder-slate-400 text-[16px] md:text-xs font-bold outline-none box-border"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="E-posta"
                />
              </div>

              <div className="relative w-full group">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-white transition-colors z-10 pointer-events-none" />
                <input
                  type="password"
                  className="w-full bg-slate-800/40 !bg-slate-800/40 backdrop-blur-md shadow-inner border border-slate-700/30 rounded-xl focus-within:border-white focus-within:bg-slate-800/60 focus-within:ring-2 focus-within:ring-white/20 transition-all pl-11 pr-4 py-3.5 text-white placeholder-slate-400 text-[16px] md:text-xs font-bold outline-none box-border"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="Şifre"
                />
              </div>

              {/* Actions Row: Remember Me & Forgot Password */}
              <div className="flex items-center justify-between w-full px-1 mt-1">
                {/* Remember Me */}
                <div
                  onClick={() => setRememberMe(!rememberMe)}
                  className="flex items-center gap-3 cursor-pointer select-none group"
                >
                  <div className={`w-9 h-5 rounded-full relative transition-all duration-300 box-border ${rememberMe ? 'bg-[#1e3a8a]' : 'bg-slate-800/40 border border-slate-700/30'}`}>
                    <div className={`w-3.5 h-3.5 rounded-full absolute top-[2px] transition-all duration-300 ${rememberMe ? 'left-[18px] bg-white' : 'left-[3px] bg-slate-500'}`}></div>
                  </div>
                  <span className="text-xs font-bold text-slate-400 group-hover:text-slate-200 transition-colors">
                    Beni Hatırla
                  </span>
                </div>

                {/* Forgot Password Link */}
                <span 
                  onClick={() => { setView('forgot'); setError(''); setResetSuccess(''); }}
                  className="text-xs font-bold text-slate-500 hover:text-white cursor-pointer transition-colors mr-1"
                >
                  Şifremi unuttum?
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all duration-300 mt-2 bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] hover:shadow-[0_0_15px_rgba(37,99,235,0.4)] disabled:opacity-50 disabled:shadow-none box-border flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-3 w-full">
                    <div className="relative flex items-center justify-center w-6 h-6">
                      <svg className="animate-spin absolute inset-0 w-full h-full text-white/20" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      </svg>
                      <svg className="animate-spin absolute inset-0 w-full h-full text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                    <span className="tracking-wide animate-pulse">Yetkiler Kontrol Ediliyor...</span>
                  </div>
                ) : (
                  <>
                    <span>Giriş Yap</span>
                    <ArrowRight size={16} className="ml-1" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="flex flex-col gap-4 w-full box-border">
              <p className="text-xs text-slate-400 font-bold text-center mb-2 px-4 leading-relaxed">
                Kayıtlı e-posta adresinizi girin. Size bir şifre sıfırlama bağlantısı göndereceğiz.
              </p>

              <div className="relative w-full group">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-white transition-colors z-10 pointer-events-none" />
                <input
                  type="email"
                  className="w-full bg-slate-800/40 !bg-slate-800/40 backdrop-blur-md shadow-inner border border-slate-700/30 rounded-xl focus-within:border-white focus-within:bg-slate-800/60 focus-within:ring-2 focus-within:ring-white/20 transition-all pl-11 pr-4 py-3.5 text-white placeholder-slate-400 text-[16px] md:text-xs font-bold outline-none box-border"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="E-posta"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all duration-300 mt-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] disabled:opacity-50 disabled:shadow-none box-border flex items-center justify-center gap-2"
              >
                {loading ? 'Gönderiliyor...' : 'Bağlantı Gönder'}
              </button>

              <button
                type="button"
                onClick={() => { setView('login'); setError(''); setResetSuccess(''); }}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all duration-300 box-border flex items-center justify-center"
              >
                Giriş Ekranına Dön
              </button>
            </form>
          )}

          {/* Footer Rights */}
          <div className="text-center mt-8 md:mt-12 w-full pb-4 md:pb-0">
            <p className="text-[10px] md:text-xs text-slate-500/70 font-medium tracking-wide">
              Pivot Akademi © {new Date().getFullYear()} Tüm hakları saklıdır.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default LoginView;
