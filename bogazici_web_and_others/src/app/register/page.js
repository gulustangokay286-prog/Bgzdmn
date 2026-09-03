"use client";
import Link from 'next/link';
import './register.css';
import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, query, where, getDocs, limit, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { 
  GraduationCap, 
  Briefcase, 
  UserCheck,
  User, 
  CreditCard, 
  Mail, 
  Lock, Eye, EyeOff, 
  Phone, 
  Hash, 
  Building2, 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft,
  ArrowRight
} from 'lucide-react';
import { auth, db } from '../../firebase';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import TCValidationAnimationModal from '../../components/TCValidationAnimationModal';

export default function RegisterPage() {
  const [currentStep, setCurrentStep] = useState('roleSelect'); // 'roleSelect' | 'form'
  const [selectedRole, setSelectedRole] = useState('student'); // 'student' | 'teacher' | 'personnel'
  
  // Form Alanları
  const [name, setName] = useState('');
  const [tcKimlik, setTcKimlik] = useState('');
  const [showTc, setShowTc] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Öğrenci
  const [schoolNumber, setSchoolNumber] = useState('');
  const [classId, setClassId] = useState('9');
  const [section, setSection] = useState('A');
  
  // Öğretmen
  const [branch, setBranch] = useState('Matematik');
  const [phone, setPhone] = useState('');

  // Personel
  const [department, setDepartment] = useState('İdari İşler');

  // TC Modal & Durumlar
  const [showTCScanner, setShowTCScanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const availableClasses = ["9", "10", "11", "12"];
  const availableBranches = [
    "Matematik", "Fizik", "Kimya", "Biyoloji",
    "Türkçe", "Edebiyat", "Tarih", "Coğrafya", "Felsefe",
    "Din Kültürü ve Ahlak Bilgisi",
    "İngilizce", "Almanca", "Beden Eğitimi", "Müzik", "Görsel Sanatlar", "Rehberlik", "Bilişim"
  ];
  const availableDepartments = [
    "İdari İşler", "Muhasebe & Finans", "Öğrenci İşleri",
    "Halkla İlişkiler & Tanıtım", "Kütüphane", "Teknik Hizmetler", "Güvenlik"
  ];

  const handleRoleSelect = (roleId) => {
    setSelectedRole(roleId);
    setError('');
    setCurrentStep('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToSelect = () => {
    setCurrentStep('roleSelect');
    setError('');
  };

  const handlePreSubmit = (e) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Lütfen adınızı ve soyadınızı giriniz.');
      return;
    }
    if (tcKimlik.trim().length !== 11) {
      setError('TC Kimlik No 11 haneli olmalıdır.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Lütfen geçerli bir e-posta adresi giriniz.');
      return;
    }
    if (password.length < 6) {
      setError('Şifreniz en az 6 karakter olmalıdır.');
      return;
    }

    if (selectedRole === 'student' && !schoolNumber.trim()) {
      setError('Lütfen okul numaranızı giriniz.');
      return;
    }
    if ((selectedRole === 'teacher' || selectedRole === 'personnel') && !phone.trim()) {
      setError('Lütfen telefon numaranızı giriniz.');
      return;
    }

    setError('');
    setShowTCScanner(true);
  };

  const handleValidationComplete = async (isValid) => {
    setShowTCScanner(false);

    if (!isValid) {
      setError('TC Kimlik numarası devlet algoritmasına uymuyor. Lütfen doğru girdiğinizden emin olun.');
      return;
    }

    setLoading(true);

    try {
      const vdsRes = await fetch('http://213.142.159.36:8080/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          tc_kimlik: tcKimlik.trim(),
          email: email.trim().toLowerCase(),
          password,
          role: selectedRole,
          schoolNumber: schoolNumber.trim(),
          classId,
          section,
          branch,
          phone: phone.trim(),
          department
        })
      });

      const resData = await vdsRes.json();
      if (!resData.success) {
        setError(resData.error || 'Kayıt işlemi başarısız oldu.');
        setLoading(false);
        return;
      }

      try {
        localStorage.removeItem("bgz_user_profile");
        localStorage.removeItem("__bgz_auto_login");
      } catch (err) {}

      setSuccess(true);
      
      setName('');
      setTcKimlik('');
      setEmail('');
      setPassword('');
      setSchoolNumber('');
      setPhone('');

    } catch (err) {
      console.error("Kayıt hatası:", err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Bu e-posta adresiyle kayıtlı bir hesap zaten bulunmaktadır.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Lütfen geçerli bir e-posta adresi giriniz.');
      } else if (err.code === 'auth/weak-password') {
        setError('Şifreniz en az 6 karakter uzunluğunda olmalıdır.');
      } else {
        setError('Kayıt oluşturulurken bir hata oluştu: ' + (err.message || 'Lütfen tekrar deneyiniz.'));
      }
    }
    setLoading(false);
  };

  const rolesData = [
    {
      id: 'student',
      title: 'Öğrenci',
      subtitle: 'Notlarına, programına ve ödevlerine erişmek için kayıt ol.',
      Icon: GraduationCap
    },
    {
      id: 'teacher',
      title: 'Öğretmen',
      subtitle: 'Not girişi, sınav ve sınıf yönetimi için kayıt ol.',
      Icon: Briefcase
    },
    {
      id: 'personnel',
      title: 'Personel',
      subtitle: 'Kurumsal idari işlemler ve personel portalına erişmek için kayıt ol.',
      Icon: UserCheck
    }
  ];

  return (
    <div className="register-page-wrapper">
      <Header />

      <main className="register-main">
        <div className="register-bg-pattern"></div>

        <div className="register-container">
          
          {/* STEP 1: ROLE SELECTION SCREEN */}
          {currentStep === 'roleSelect' && !success && (
            <div className="role-selection-screen animate-fade-in">
              
              {/* Header */}
              <div className="screen-header">
                <div className="header-text-block">
                  <span className="system-sub-label">BOĞAZİÇİ KOLEJİ MOBİL</span>
                  <h1 className="main-title">Yeni Kayıt</h1>
                  <p className="main-subtitle">Devam etmek için kayıt türünüzü seçin.</p>
                  <div className="red-accent-bar"></div>
                </div>
              </div>

              {/* 3 Clickable Role Cards */}
              <div className="role-cards-stack">
                {rolesData.map((item) => {
                  const IconComp = item.Icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleRoleSelect(item.id)}
                      className="role-row-card"
                    >
                      <div className="role-icon-circle">
                        <IconComp size={22} className="role-svg-icon" />
                      </div>
                      <div className="role-red-divider"></div>
                      <div className="role-info-content">
                        <h3 className="role-card-title">{item.title}</h3>
                        <p className="role-card-subtitle">{item.subtitle}</p>
                      </div>
                      <ChevronRight size={20} className="role-chevron" />
                    </button>
                  );
                })}
              </div>

              {/* Link to Login */}
              <div className="account-switch-card">
                <span className="switch-card-text">Zaten bir hesabınız var mı?</span>
                <Link href="/login" className="btn-switch-pill">
                  Giriş Yap
                </Link>
              </div>

              {/* Security info box */}
              <div className="security-info-box">
                <div className="security-row">
                  <Shield size={16} className="sec-bullet-icon" />
                  <span>Hesabınız yönetici onayından geçtikten sonra aktifleşir.</span>
                </div>
                <div className="security-row">
                  <Shield size={16} className="sec-bullet-icon" />
                  <span>Kişisel verileriniz üst düzey şifreleme yöntemleriyle korunur.</span>
                </div>
                <div className="security-row">
                  <Shield size={16} className="sec-bullet-icon" />
                  <span>Gerçek kimlik bilgileri, sahte hesapları engellemek için zorunludur.</span>
                </div>
              </div>

              {/* Bottom security pill */}
              <div className="bottom-badge-wrap">
                <div className="bottom-security-badge">
                  <ShieldCheck size={13} className="badge-sec-icon" />
                  <span>Kayıt bilgileriniz güvenle korunur.</span>
                </div>
              </div>

            </div>
          )}

          {/* STEP 2: FORM SCREEN (NO CYLINDER BADGE) */}
          {currentStep === 'form' && !success && (
            <div className="form-screen animate-fade-in">
              
              {/* Back button */}
              <button 
                type="button" 
                onClick={handleBackToSelect} 
                className="back-nav-btn"
              >
                <ChevronLeft size={20} />
                <span>Tür Seçimine Dön</span>
              </button>

              {/* Form Card (Without any cylinder chip on top) */}
              <div className="form-card">
                
                <div className="form-card-header">
                  <h2 className="form-title">
                    Yeni <span className="red-highlight">Kayıt</span>
                  </h2>
                  <p className="form-desc">Lütfen bilgilerinizi eksiksiz doldurun.</p>
                  <div className="red-accent-bar"></div>
                </div>

                {error && (
                  <div className="error-banner">
                    <ShieldAlert size={18} className="error-svg" />
                    <div className="error-text-wrap">
                      <strong>Uyarı:</strong> {error}
                    </div>
                  </div>
                )}

                <form onSubmit={handlePreSubmit} className="actual-form">
                  
                  {/* Common Fields */}
                  <div className="form-fields-stack">
                    
                    <div className="field-row-wrap">
                      <label className="field-label">
                        Ad Soyad <span className="req-star">*</span>
                      </label>
                      <div className="input-container">
                        <div className="field-circle-icon">
                          <User size={15} />
                        </div>
                        <input
                          type="text"
                          placeholder="Adınız ve soyadınız"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          className="swift-input"
                        />
                      </div>
                    </div>

                    <div className="field-row-wrap">
                      <div className="label-with-forgot">
                        <label className="field-label">
                          TC Kimlik No <span className="req-star">*</span>
                        </label>
                        
                      </div>
                      <div className="input-container">
                        <div className="field-circle-icon">
                          <CreditCard size={15} />
                        </div>
                        <input
                          type={showTc ? "text" : "password"}
                          maxLength={11}
                          placeholder={showTc ? "11 haneli kimlik numaranız" : "•••••••••••"}
                          value={tcKimlik}
                          onChange={(e) => setTcKimlik(e.target.value.replace(/[^0-9]/g, '').slice(0, 11))}
                          required
                          className="swift-input input-pass tracking-text"
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

                    <div className="field-row-wrap">
                      <label className="field-label">
                        E-posta Adresi <span className="req-star">*</span>
                      </label>
                      <div className="input-container">
                        <div className="field-circle-icon">
                          <Mail size={15} />
                        </div>
                        <input
                          type="email"
                          placeholder="ornek@eposta.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="swift-input"
                        />
                      </div>
                    </div>

                    <div className="field-row-wrap">
                      <label className="field-label">
                        Giriş Şifresi <span className="req-star">*</span>
                      </label>
                      <div className="input-container">
                        <div className="field-circle-icon">
                          <Lock size={15} />
                        </div>
                        <input
                          type="password"
                          placeholder="En az 6 karakter"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="swift-input"
                        />
                      </div>
                    </div>

                    {/* Student Specific */}
                    {selectedRole === 'student' && (
                      <>
                        <div className="field-row-wrap">
                          <label className="field-label">
                            Okul Numarası <span className="req-star">*</span>
                          </label>
                          <div className="input-container">
                            <div className="field-circle-icon">
                              <Hash size={15} />
                            </div>
                            <input
                              type="text"
                              placeholder="Öğrenci okul numaranız"
                              value={schoolNumber}
                              onChange={(e) => setSchoolNumber(e.target.value.replace(/[^0-9]/g, ''))}
                              required
                              className="swift-input"
                            />
                          </div>
                        </div>

                        <div className="field-row-wrap">
                          <label className="field-label">
                            Sınıf Kademesi <span className="req-star">*</span>
                          </label>
                          <div className="input-container">
                            <div className="field-circle-icon">
                              <GraduationCap size={15} />
                            </div>
                            <select
                              value={classId}
                              onChange={(e) => setClassId(e.target.value)}
                              className="swift-input swift-select"
                            >
                              {availableClasses.map((cls) => (
                                <option key={cls} value={cls}>
                                  {cls}. Sınıf
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="field-row-wrap">
                          <label className="field-label">
                            Şube <span className="req-star">*</span>
                          </label>
                          <div className="input-container">
                            <div className="field-circle-icon">
                              <Hash size={15} />
                            </div>
                            <select
                              value={section}
                              onChange={(e) => setSection(e.target.value)}
                              className="swift-input swift-select"
                            >
                              {["A", "B", "C", "D", "E", "F"].map((s) => (
                                <option key={s} value={s}>
                                  {s} Şubesi
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Teacher Specific */}
                    {selectedRole === 'teacher' && (
                      <>
                        <div className="field-row-wrap">
                          <label className="field-label">
                            Branş Bilgisi <span className="req-star">*</span>
                          </label>
                          <div className="input-container">
                            <div className="field-circle-icon">
                              <Building2 size={15} />
                            </div>
                            <select
                              value={branch}
                              onChange={(e) => setBranch(e.target.value)}
                              className="swift-input swift-select"
                            >
                              {availableBranches.map((br) => (
                                <option key={br} value={br}>{br}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="field-row-wrap">
                          <label className="field-label">
                            İletişim / GSM Numarası <span className="req-star">*</span>
                          </label>
                          <div className="input-container">
                            <div className="field-circle-icon">
                              <Phone size={15} />
                            </div>
                            <input
                              type="tel"
                              placeholder="05XX XXX XX XX"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 11))}
                              required
                              className="swift-input"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {/* Personnel Specific */}
                    {selectedRole === 'personnel' && (
                      <>
                        <div className="field-row-wrap">
                          <label className="field-label">
                            Görev / Departman <span className="req-star">*</span>
                          </label>
                          <div className="input-container">
                            <div className="field-circle-icon">
                              <Building2 size={15} />
                            </div>
                            <select
                              value={department}
                              onChange={(e) => setDepartment(e.target.value)}
                              className="swift-input swift-select"
                            >
                              {availableDepartments.map((dept) => (
                                <option key={dept} value={dept}>{dept}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="field-row-wrap">
                          <label className="field-label">
                            İletişim Numarası <span className="req-star">*</span>
                          </label>
                          <div className="input-container">
                            <div className="field-circle-icon">
                              <Phone size={15} />
                            </div>
                            <input
                              type="tel"
                              placeholder="05XX XXX XX XX"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 11))}
                              required
                              className="swift-input"
                            />
                          </div>
                        </div>
                      </>
                    )}

                  </div>

                  {/* Submit Action */}
                  <div className="submit-action-block">
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn-submit-pill"
                    >
                      {loading ? (
                        <span className="loading-row">
                          <svg className="animate-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <circle cx="12" cy="12" r="10" strokeWidth="3" strokeDasharray="30" strokeLinecap="round"></circle>
                          </svg>
                          <span>Kayıt İletiliyor...</span>
                        </span>
                      ) : (
                        <span>Devlet Algoritması ile Doğrula ve Kaydol</span>
                      )}
                    </button>
                  </div>

                  <div className="form-bottom-switch">
                    <span>Hesabınız var mı?</span>
                    <Link href="/login" className="link-red-bold">Giriş Yap</Link>
                  </div>
                  <div className="form-sec-note">
                    <ShieldCheck size={14} className="sec-note-icon" />
                    <span>Verileriniz 6698 sayılı KVKK kapsamında güvence altındadır.</span>
                  </div>

                </form>
              </div>

            </div>
          )}

          {/* SUCCESS SCREEN */}
          {success && (
            <div className="success-screen animate-fade-in">
              <div className="success-card">
                <div className="success-check-bubble">
                  <CheckCircle2 size={36} />
                </div>
                <h2 className="success-heading">Başvurunuz Alındı</h2>
                <p className="success-subtext">
                  <strong>{name || 'Kullanıcı'}</strong> için kayıt başvurusu kurum sistemine iletildi. İlgili yönetici incelemesinin ardından hesabınız aktif hale gelecektir.
                </p>
                <div className="success-btn-group">
                  <button 
                    type="button"
                    onClick={() => { setSuccess(false); setCurrentStep('roleSelect'); }} 
                    className="btn-new-app"
                  >
                    Yeni Kayıt Başvurusu
                  </button>
                  <Link href="/login" className="btn-home-return">
                    <span>Giriş Ekranına Geç</span>
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* FULLSCREEN TC VALIDATION SCANNER */}
      {showTCScanner && (
        <TCValidationAnimationModal
          tcKimlik={tcKimlik}
          mode="register"
          onComplete={handleValidationComplete}
        />
      )}

      <Footer />

      
    </div>
  );
}
