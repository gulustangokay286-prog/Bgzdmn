"use client";
import Link from 'next/link';
import './login.css';
import React, { useState, useEffect, useRef } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { 
  GraduationCap, 
  QrCode, 
  Briefcase, 
  UserCheck,
  Users, 
  ShieldCheck, 
  ShieldAlert, 
  Lock, 
  Eye, 
  EyeOff, 
  CreditCard, 
  Hash, 
  Building2, 
  ChevronRight, 
  ChevronLeft, 
  CheckCircle2, 
  Camera, 
  Upload, 
  Loader2, 
  Sparkles, 
  User, 
  ShoppingBag, 
  Check 
} from 'lucide-react';
import { auth, db } from '../../firebase';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import TCValidationAnimationModal from '../../components/TCValidationAnimationModal';
import { uploadToCloudinary } from '../../utils/cloudinary';

const formatStudentClassSection = (user) => {
  if (!user) return '—';
  const rawClass = String(user.class_id || user.sinif || user.grade || '').trim();
  const rawBranch = String(user.branch || user.section || user.sube || '').trim();

  const combined = `${rawClass} ${rawBranch}`.toUpperCase();
  const match = combined.match(/(\d{1,2})\s*[-/._\s]?\s*([A-Z])/);
  if (match) {
    return `${match[1]}/${match[2]}`;
  }

  const gradeOnly = rawClass.match(/^(\d{1,2})/);
  if (gradeOnly) {
    if (rawBranch && /^[A-Za-z]$/i.test(rawBranch)) {
      return `${gradeOnly[1]}/${rawBranch.toUpperCase()}`;
    }
    return `${gradeOnly[1]}. Sınıf`;
  }

  if (rawClass) {
    if (rawBranch && rawBranch !== rawClass) {
      return `${rawClass}/${rawBranch}`;
    }
    return rawClass;
  }

  return rawBranch || '—';
};

export default function LoginPage() {
  const [mounted, setMounted] = useState(false);
  const [activeUserProfile, setActiveUserProfile] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("bgz_user_profile");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.status && ['pending', 'awaiting_approval'].includes(String(parsed.status).toLowerCase())) {
            localStorage.removeItem("bgz_user_profile");
            return null;
          }
          if (parsed && (parsed.full_name || parsed.name || parsed.tc_kimlik)) return parsed;
        }
      } catch (e) {}
    }
    return null;
  });
  
  // Login Form States
  const [currentStep, setCurrentStep] = useState('roleSelect'); // 'roleSelect' | 'form'
  const [selectedRole, setSelectedRole] = useState('student');
  const [tcKimlik, setTcKimlik] = useState('');
  const [showTc, setShowTc] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [schoolNumber, setSchoolNumber] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [rememberMe, setRememberMe] = useState(() => typeof window !== "undefined" ? localStorage.getItem("bgz_remember_me") === "true" : false);

  // Statuses
  const [showLoginScanner, setShowLoginScanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Profile Photo Upload States
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadSuccessToast, setUploadSuccessToast] = useState(false);
  const fileInputRef = useRef(null);

  // Forgot password modal
  const [forgotModal, setForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    setMounted(true);
    const cached = localStorage.getItem("bgz_user_profile");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.status && ['pending', 'awaiting_approval'].includes(String(parsed.status).toLowerCase())) {
          localStorage.removeItem("bgz_user_profile");
          setActiveUserProfile(null);
        } else if (parsed) {
          setActiveUserProfile(parsed);
        }
      } catch (e) {}
    }
  }, []);

  const rolesData = [
    {
      id: 'student',
      title: 'Öğrenci',
      subtitle: 'Derslerine eriş, ödevlerini takip et, gelişimini gör.',
      Icon: GraduationCap
    },
    {
      id: 'teacher',
      title: 'Öğretmen',
      subtitle: 'Sınıflarını yönet, içerik paylaş, performansları izle.',
      Icon: Briefcase
    },
    {
      id: 'personnel',
      title: 'Personel',
      subtitle: 'Kurumsal idari işlemler ve personel portalına eriş.',
      Icon: UserCheck
    },
    {
      id: 'parent',
      title: 'Veli',
      subtitle: 'Çocuğunuzun akademik sürecini yakından takip edin.',
      Icon: Users
    }
  ];

  const handleRoleSelect = (roleId) => {
    setSelectedRole(roleId);
    setError('');
    setCurrentStep('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePreLogin = (e) => {
    e.preventDefault();
    if (tcKimlik.trim().length !== 11) {
      setError('TC Kimlik No 11 haneli olmalıdır.');
      return;
    }
    if (!password) {
      setError('Lütfen şifrenizi giriniz.');
      return;
    }
    if (selectedRole === 'student' && !schoolNumber.trim()) {
      setError('Lütfen okul numaranızı giriniz.');
      return;
    }
    if (selectedRole === 'admin' && !adminKey.trim()) {
      setError('Lütfen yönetici güvenlik anahtarını giriniz.');
      return;
    }

    setError('');
    setShowLoginScanner(true);
  };

  const handleValidationComplete = async (isValid) => {
    setShowLoginScanner(false);

    if (!isValid) {
      setError('TC Kimlik numarası devlet algoritmasına uymuyor. Lütfen doğru girdiğinizden emin olun.');
      return;
    }

    setLoading(true);

    try {
      const vdsRes = await fetch('http://213.142.159.36:8080/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: selectedRole === 'student' && schoolNumber.trim() ? schoolNumber.trim() : tcKimlik.trim(),
          password,
          role: selectedRole,
          adminKey: adminKey.trim()
        })
      });

      const resData = await vdsRes.json();

      if (!resData.success) {
        setError(resData.error || 'Giriş başarısız. Lütfen bilgilerinizi kontrol ediniz.');
        setLoading(false);
        return;
      }

      const userData = resData.user;
      const token = resData.token;

      const profilePayload = {
        ...userData,
        id: userData._id || userData.id,
        full_name: userData.full_name || userData.name || 'Boğaziçi Kullanıcısı',
        role: userData.role || selectedRole,
        status: userData.status || 'approved',
        email: userData.email,
        tc_kimlik: tcKimlik.trim(),
        profile_image: userData.profile_image || null,
        token
      };

      if (rememberMe) {
        try {
          localStorage.setItem("bgz_remember_me", "true");
          localStorage.setItem("bgz_saved_tc", tcKimlik.trim());
          if (schoolNumber) localStorage.setItem("bgz_saved_school_no", schoolNumber.trim());
          if (selectedRole) localStorage.setItem("bgz_saved_role", selectedRole);
        } catch(e) {}
      } else {
        try {
          localStorage.removeItem("bgz_remember_me");
          localStorage.removeItem("bgz_saved_tc");
          localStorage.removeItem("bgz_saved_school_no");
          localStorage.removeItem("bgz_saved_role");
        } catch(e) {}
      }

      try {
        localStorage.setItem("bgz_user_profile", JSON.stringify(profilePayload));
        localStorage.setItem("bgz_auth_token", token);
        localStorage.setItem("__bgz_bound_user_id", profilePayload.id);
        localStorage.setItem("__bgz_bound_user_tc", tcKimlik.trim());
      } catch (e) {}

      setActiveUserProfile(profilePayload);
      window.dispatchEvent(new Event("bgz_profile_updated"));

    } catch (err) {
      console.error("Giriş hatası:", err);
      setError('Giriş yapılırken sunucu ile bağlantı kurulamadı. Lütfen internet bağlantınızı kontrol ediniz.');
    }
    setLoading(false);
  };

  // Real-Time Profile Photo Upload using Cloudinary
  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeUserProfile) return;

    setIsUploadingPhoto(true);
    try {
      const uploadRes = await uploadToCloudinary(file, "profiles");
      const newPhotoUrl = uploadRes.secure_url;

      // Update VDS document
      const docId = activeUserProfile.id;
      if (docId) {
        try {
          await fetch(`http://213.142.159.36:8080/api/users/${encodeURIComponent(docId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              profile_image: newPhotoUrl,
              profileImageUrl: newPhotoUrl
            })
          });
        } catch (dbErr) {
          console.warn("VDS update notice:", dbErr);
        }
      }

      // Update Local State & Cache
      const updatedProfile = {
        ...activeUserProfile,
        profile_image: newPhotoUrl,
        profileImageUrl: newPhotoUrl
      };

      setActiveUserProfile(updatedProfile);
      try {
        localStorage.setItem("bgz_user_profile", JSON.stringify(updatedProfile));
      } catch (e) {}

      // Trigger instant header update
      window.dispatchEvent(new Event("bgz_profile_updated"));

      setUploadSuccessToast(true);
      setTimeout(() => setUploadSuccessToast(false), 3500);

    } catch (err) {
      console.error("Fotoğraf yükleme hatası:", err);
      alert("Fotoğraf yüklenemedi: " + (err.message || "Lütfen tekrar deneyiniz."));
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Sınıf & Şube Güncelleme
  const handleUpdateClassSection = async (newClass, newSection) => {
    try {
      const docId = activeUserProfile.id;
      if (docId) {
        try {
          await fetch(`http://213.142.159.36:8080/api/users/${encodeURIComponent(docId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              class_id: newClass,
              section: newSection,
              sube: newSection,
              branch: `${newClass}${newSection}`
            })
          });
        } catch (dbErr) {
          console.warn("VDS update notice:", dbErr);
        }
      }
      const updated = {
        ...activeUserProfile,
        class_id: newClass,
        section: newSection,
        sube: newSection
      };
      setActiveUserProfile(updated);
      try {
        localStorage.setItem("bgz_user_profile", JSON.stringify(updated));
      } catch (e) {}
      window.dispatchEvent(new Event("bgz_profile_updated"));
    } catch (e) {
      console.error("Error updating section:", e);
    }
  };

  const roleDisplay = (role) => {
    switch (role) {
      case "teacher": return "Öğretmen";
      case "personnel": return "Personel";
      case "parent": return "Veli";
      case "admin": return "Yönetici";
      default: return "Öğrenci";
    }
  };

  const getInitials = (name) => {
    if (!name || typeof name !== "string") return "BK";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const maskedTC = (tc) => {
    if (!tc || tc.length !== 11) return tc || '—';
    return `${tc.slice(0, 3)} ••• ••• ${tc.slice(9, 11)}`;
  };

  return (
    <div className="login-page-wrapper">
      <Header />

      <main className="login-main">
        <div className="login-bg-pattern"></div>

        <div className="login-container">

          {/* ========================================================= */}
          {/* CASE 1: USER IS ALREADY LOGGED IN -> SHOW PORTAL & ACCOUNT */}
          {/* ========================================================= */}
          {mounted && activeUserProfile ? (
            <div className="portal-account-card animate-fade-in">
              
              {/* Avatar & Photo Upload Section */}
              <div className="portal-avatar-section">
                <div className="portal-avatar-wrapper" onClick={() => fileInputRef.current?.click()}>
                  {activeUserProfile.profile_image || activeUserProfile.profileImageUrl ? (
                    <img 
                      src={activeUserProfile.profile_image || activeUserProfile.profileImageUrl} 
                      alt="Profil Fotoğrafı" 
                      className="portal-avatar-image" 
                    />
                  ) : (
                    <div className="portal-avatar-placeholder">
                      {getInitials(activeUserProfile.full_name)}
                    </div>
                  )}

                  {/* Upload Overlay Button */}
                  <div className="portal-avatar-overlay" title="Fotoğrafı Değiştir">
                    {isUploadingPhoto ? (
                      <Loader2 size={24} className="animate-spin text-white" />
                    ) : (
                      <Camera size={22} className="text-white" />
                    )}
                  </div>
                </div>

                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handlePhotoSelect} 
                  accept="image/*" 
                  style={{ display: 'none' }} 
                />

                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-change-photo"
                  disabled={isUploadingPhoto}
                >
                  {isUploadingPhoto ? (
                    <>
                      <Loader2 size={15} className="animate-spin-icon" />
                      <span>Yükleniyor...</span>
                    </>
                  ) : (
                    <>
                      <Upload size={15} />
                      <span>Fotoğrafı Değiştir</span>
                    </>
                  )}
                </button>

                {uploadSuccessToast && (
                  <div className="upload-toast-success animate-fade-in">
                    <Check size={14} />
                    <span>Profil fotoğrafı güncellendi.</span>
                  </div>
                )}
              </div>

              {/* User Identity Info Box */}
              <div className="portal-info-box">
                <h2 className="portal-user-fullname">{activeUserProfile.full_name}</h2>
                <div className="portal-role-tag">
                  <ShieldCheck size={13} />
                  <span>{roleDisplay(activeUserProfile.role)}</span>
                </div>

                <div className="portal-details-grid">
                  <div className="detail-item">
                    <span className="detail-label">T.C. Kimlik No</span>
                    <span className="detail-value">{maskedTC(activeUserProfile.tc_kimlik)}</span>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label">E-Posta</span>
                    <span className="detail-value">{activeUserProfile.email || '—'}</span>
                  </div>

                  {/* Öğrenci: Okul No ve Sınıf / Şube */}
                  {activeUserProfile.role === 'student' && (
                    <>
                      <div className="detail-item">
                        <span className="detail-label">Okul No</span>
                        <span className="detail-value">{activeUserProfile.school_number || '—'}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Sınıf / Şube</span>
                        <span className="detail-value">{formatStudentClassSection(activeUserProfile)}</span>
                      </div>
                    </>
                  )}

                  {/* Öğretmen: Branş */}
                  {activeUserProfile.role === 'teacher' && (
                    <div className="detail-item">
                      <span className="detail-label">Branş</span>
                      <span className="detail-value">{activeUserProfile.branch || activeUserProfile.subject || 'Öğretmen'}</span>
                    </div>
                  )}

                  {/* Personel: Departman */}
                  {activeUserProfile.role === 'personnel' && (
                    <div className="detail-item">
                      <span className="detail-label">Departman</span>
                      <span className="detail-value">{activeUserProfile.department || 'İdari İşler'}</span>
                    </div>
                  )}

                  {/* Veli: Öğrenci Adı */}
                  {activeUserProfile.role === 'parent' && (
                    <div className="detail-item">
                      <span className="detail-label">Öğrenci</span>
                      <span className="detail-value">{activeUserProfile.student_name || 'Öğrenci Velisi'}</span>
                    </div>
                  )}

                  {/* Yönetici */}
                  {activeUserProfile.role === 'admin' && (
                    <div className="detail-item">
                      <span className="detail-label">Yetki</span>
                      <span className="detail-value">Yönetici & İdare</span>
                    </div>
                  )}
                </div>
              </div>

              

              {/* Minimalist Action Cards */}
              <div className="portal-action-cards">


                <Link href="/magaza" className="portal-nav-btn">
                  <div className="btn-icon-box">
                    <ShoppingBag size={18} />
                  </div>
                  <div className="btn-text-content">
                    <strong>Kurumsal Mağaza</strong>
                    <span>Okul kıyafetleri ve yayınlar</span>
                  </div>
                  <ChevronRight size={16} className="btn-arrow" />
                </Link>

                <Link href="/" className="portal-nav-btn">
                  <div className="btn-icon-box">
                    <Building2 size={18} />
                  </div>
                  <div className="btn-text-content">
                    <strong>Ana Sayfaya Dön</strong>
                    <span>Kolej ana portalı</span>
                  </div>
                  <ChevronRight size={16} className="btn-arrow" />
                </Link>
              </div>

            </div>
          ) : (

            /* ========================================================= */
            /* CASE 2: USER NOT LOGGED IN -> SHOW CLEAN LOGIN INTERFACE   */
            /* ========================================================= */
            <>
              {currentStep === 'roleSelect' && (
                <div className="role-selection-screen animate-fade-in">
                  <div className="screen-header">
                    <div className="header-text-block">
                      <span className="system-sub-label">BOĞAZİÇİ KOLEJİ MOBİL</span>
                      <h1 className="main-title">Hoş Geldiniz</h1>
                      <p className="main-subtitle">Devam etmek için giriş türünüzü seçin.</p>
                      <div className="red-accent-bar"></div>
                    </div>
                  </div>

                  <div className="role-cards-stack">
                    {rolesData.map((r) => {
                      const IconC = r.Icon;
                      return (
                        <div 
                          key={r.id}
                          onClick={() => handleRoleSelect(r.id)}
                          className="role-row-card"
                        >
                          <div className="role-icon-circle">
                            <IconC size={22} className="role-svg-icon" />
                          </div>
                          <div className="role-red-divider"></div>
                          <div className="role-info-content">
                            <h3 className="role-card-title">{r.title}</h3>
                            <p className="role-card-subtitle">{r.subtitle}</p>
                          </div>
                          <ChevronRight size={18} className="role-chevron" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {currentStep === 'form' && (
                <div className="form-card animate-fade-in">
                  <button type="button" onClick={() => setCurrentStep('roleSelect')} className="back-nav-btn">
                    <ChevronLeft size={16} /> Rol Değiştir
                  </button>

                  <div className="form-card-header">
                    <h2 className="form-title">
                      Güvenli <span className="red-highlight">Giriş</span>
                    </h2>
                    <p className="form-desc">Bilgilerinizi girerek portala bağlanın.</p>
                    <div className="red-accent-bar"></div>
                  </div>

                  {error && (
                    <div className="error-banner">
                      <ShieldAlert size={18} className="error-svg" />
                      <span>{error}</span>
                    </div>
                  )}

                  <form onSubmit={handlePreLogin} className="actual-form">
                    <div className="field-row-wrap">
                      <div className="label-with-forgot">
                        <label className="field-label">T.C. Kimlik Numarası <span className="req-star">*</span></label>
                        
                      </div>
                      <div className="input-container">
                        <div className="field-circle-icon"><CreditCard size={17} /></div>
                        <input 
                          type={showTc ? "text" : "password"}
                          maxLength={11}
                          placeholder={showTc ? "11 haneli kimlik numaranız" : "•••••••••••"}
                          value={tcKimlik}
                          onChange={(e) => setTcKimlik(e.target.value.replace(/\D/g, ''))}
                          className="swift-input input-pass"
                          required
                        />
                        <button 
                          type="button" 
                          onClick={() => setShowTc(!showTc)} 
                          className="toggle-pass-eye"
                          aria-label="TC Göster/Gizle"
                        >
                          {showTc ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    {selectedRole === 'student' && (
                      <div className="field-row-wrap">
                        <label className="field-label">Okul Numarası <span className="req-star">*</span></label>
                        <div className="input-container">
                          <div className="field-circle-icon"><Hash size={17} /></div>
                          <input 
                            type="text"
                            placeholder="Örn: 1042"
                            value={schoolNumber}
                            onChange={(e) => setSchoolNumber(e.target.value)}
                            className="swift-input"
                            required
                          />
                        </div>
                      </div>
                    )}

                    <div className="field-row-wrap">
                      <div className="label-with-forgot">
                        <label className="field-label">Şifre <span className="req-star">*</span></label>
                        <button type="button" onClick={() => setForgotModal(true)} className="forgot-pass-btn">
                          Şifremi Unuttum?
                        </button>
                      </div>
                      <div className="input-container">
                        <div className="field-circle-icon"><Lock size={17} /></div>
                        <input 
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="swift-input input-pass"
                          required
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="toggle-pass-eye">
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "4px 0 12px 2px" }}>
                      <div onClick={() => setRememberMe(!rememberMe)} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none" }}>
                        <div style={{ width: "32px", height: "18px", borderRadius: "10px", backgroundColor: rememberMe ? "#2563eb" : "#334155", position: "relative", transition: "background-color 0.2s" }}>
                          <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "#fff", position: "absolute", top: "3px", left: rememberMe ? "17px" : "3px", transition: "left 0.2s" }} />
                        </div>
                        <span style={{ fontSize: "12.5px", fontWeight: "600", color: "#94a3b8" }}>Beni Hatırla</span>
                      </div>
                    </div>

                    <div className="submit-action-block">
                      <button type="submit" disabled={loading} className="btn-submit-pill">
                        {loading ? (
                          <div className="loading-row">
                            <Loader2 className="animate-spin-icon" />
                            <span>Giriş Doğrulanıyor...</span>
                          </div>
                        ) : (
                          <span>Giriş Yap ve Portala Bağlan</span>
                        )}
                      </button>
                    </div>

                    <div className="form-bottom-switch">
                      <span>Henüz hesabınız yok mu?</span>
                      <Link href="/register" className="link-red-bold">Kayıt Olun</Link>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}

        </div>
      </main>

      <Footer />

      {/* TC Validation Animation Modal */}
      {showLoginScanner && (
        <TCValidationAnimationModal 
          tcKimlik={tcKimlik}
          mode="login"
          onComplete={handleValidationComplete}
        />
      )}

      {/* Forgot Password Modal */}
      {forgotModal && (
        <div className="modal-backdrop animate-fade-in">
          <div className="modal-card animate-pop-in">
            <h3 className="modal-title">Şifre Sıfırlama</h3>
            <p className="modal-desc">Kayıtlı e-posta adresinize şifre sıfırlama bağlantısı gönderilecektir.</p>
            {forgotSent ? (
              <div className="modal-sent-box">
                <CheckCircle2 size={32} className="sent-check" />
                <p>Sıfırlama bağlantısı e-posta adresinize iletildi. Lütfen gelen kutunuzu kontrol ediniz.</p>
                <button type="button" onClick={() => { setForgotModal(false); setForgotSent(false); }} className="btn-modal-close">
                  Kapat
                </button>
              </div>
            ) : (
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!forgotEmail.trim() || !forgotEmail.includes('@')) {
                  alert('Lütfen geçerli bir e-posta adresi giriniz.');
                  return;
                }
                try {
                  await sendPasswordResetEmail(auth, forgotEmail.trim());
                  setForgotSent(true);
                } catch (err) {
                  alert('Hata: ' + err.message);
                }
              }} className="modal-form">
                <input 
                  type="email"
                  placeholder="ornek@corumbogazici.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="swift-input"
                  style={{ paddingLeft: '16px' }}
                  required
                />
                <div className="modal-actions">
                  <button type="button" onClick={() => setForgotModal(false)} className="btn-modal-cancel">İptal</button>
                  <button type="submit" className="btn-modal-send">Bağlantı Gönder</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
