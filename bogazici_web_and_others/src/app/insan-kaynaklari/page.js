"use client";
import React, { useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { uploadToCloudinary } from "@/utils/cloudinary";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";
import { 
  GraduationCap, 
  Building2, 
  Send, 
  CheckCircle2, 
  UploadCloud, 
  Check, 
  AlertCircle,
  Award,
  TrendingUp,
  Users
} from "lucide-react";

export default function InsanKaynaklariPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [positionType, setPositionType] = useState("teacher");
  const [branch, setBranch] = useState("Matematik");
  const [experience, setExperience] = useState("3-5 Yıl");
  const [notes, setNotes] = useState("");
  
  // Cloudinary Upload State
  const [cvFile, setCvFile] = useState(null);
  const [cvUploadedUrl, setCvUploadedUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");

  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const branches = [
    "Matematik", "Fizik", "Kimya", "Biyoloji", "Türkçe & Edebiyat",
    "Tarih", "Coğrafya", "Felsefe", "İngilizce", "Almanca",
    "Bilişim & Robotik", "Rehberlik & PDR", "Beden Eğitimi", "Görsel Sanatlar", "Müzik"
  ];

  const staffRoles = [
    "İdari İşler & Yönetici Asistanı", "Öğrenci İşleri Uzmanı", "Muhasebe & Finans",
    "Halkla İlişkiler & Kayıt Danışmanı", "BT & Sistem Uzmanı", "Kütüphane Görevlisi", "Güvenlik & Danışma"
  ];

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCvFile(file);
    setUploading(true);
    setUploadProgress(0);
    setUploadError("");

    try {
      const result = await uploadToCloudinary(file, "bogazici-hr-cvs", (progress) => {
        setUploadProgress(progress);
      });
      setCvUploadedUrl(result.secure_url);
    } catch (err) {
      console.error("Cloudinary upload failed:", err);
      setUploadError("Dosya yüklenirken bir hata oluştu.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName || !email || !phone) {
      alert("Lütfen zorunlu alanları doldurunuz.");
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, "hr_applications"), {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        positionType,
        branch: branch,
        experience,
        cvUrl: cvUploadedUrl || "",
        notes: notes.trim(),
        status: "yeni",
        createdAt: serverTimestamp(),
        createdAtMillis: Date.now()
      });
      setSubmitted(true);
    } catch (err) {
      console.error("Başvuru kaydedilemedi:", err);
      alert("Başvuru gönderilirken bir hata oluştu. Lütfen tekrar deneyiniz.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ik-page">
      <Header />

      <main className="ik-main">
        {/* Sade Hero Başlık */}
        <section className="page-header">
          <div className="container">
            <h1 className="page-title">
              İnsan Kaynakları & <span className="title-highlight">Kariyer</span>
            </h1>
            <p className="page-subtitle">
              Sürekli gelişen ve başarı odaklı akademik kadromuza katılarak geleceğin liderlerini birlikte yetiştirelim.
            </p>
          </div>
        </section>

        {/* Neden Boğaziçi? - TAMAMEN SADE, İKONLARIN ARKASINDA HİÇBİR KUTU OLMADAN */}
        <section className="section-block">
          <div className="container">
            <div className="section-header">
              <h2>Boğaziçi Koleji'nde Kariyer</h2>
              <p>Öğretmen ve çalışanlarımıza sunduğumuz kurumsal değerler</p>
            </div>

            <div className="benefits-grid">
              <div className="benefit-card">
                <div className="pure-icon">
                  <Award size={30} color="#103A69" />
                </div>
                <h3>Sürekli Mesleki Gelişim</h3>
                <p>Akademi içi eğitimler, modern pedagojik seminerler ve teknoloji entegrasyonu destekleri.</p>
              </div>

              <div className="benefit-card">
                <div className="pure-icon">
                  <TrendingUp size={30} color="#103A69" />
                </div>
                <h3>Liyakat & Kariyer Basamakları</h3>
                <p>Zümre başkanlığı, koordinatörlük ve idari yönetim kadrolarında başarı odaklı terfi fırsatları.</p>
              </div>

              <div className="benefit-card">
                <div className="pure-icon">
                  <Users size={30} color="#103A69" />
                </div>
                <h3>Huzurlu Çalışma Ortamı</h3>
                <p>Güçlü sosyal haklar, öğretmen dayanışması ve modern kampüs imkanlarıyla güvenli bir çalışma ortamı.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Başvuru Formu */}
        <section className="section-block bg-light">
          <div className="container form-max-width">
            <div className="form-card-container">
              {submitted ? (
                <div className="success-box">
                  <div className="success-icon">
                    <CheckCircle2 size={44} />
                  </div>
                  <h2>Başvurunuz Başarıyla Alındı</h2>
                  <p>
                    Sayın <strong>{fullName}</strong>, özgeçmişiniz ve başvuru bilgileriniz Boğaziçi Koleji İnsan Kaynakları veritabanına kaydedildi. Açık pozisyonlarda uygunluk durumunda sizinle irtibata geçilecektir.
                  </p>
                  {cvUploadedUrl && (
                    <div className="cv-success-tag">
                      <Check size={15} />
                      <span>Özgeçmiş dosyanız sisteme yüklendi</span>
                    </div>
                  )}
                  <button 
                    type="button" 
                    onClick={() => { setSubmitted(false); setFullName(""); setNotes(""); setCvUploadedUrl(""); setCvFile(null); }}
                    className="btn-new-app"
                  >
                    Yeni Başvuru Yap
                  </button>
                </div>
              ) : (
                <>
                  <div className="form-header">
                    <h2>İş & Staj Başvuru Formu</h2>
                    <p>Lütfen bilgilerinizi eksiksiz doldurunuz. Başvurunuz gizlilik ilkeleri kapsamında değerlendirilir.</p>
                  </div>

                  <form onSubmit={handleSubmit} className="ik-clean-form">
                    {/* Pozisyon Seçim Butonları */}
                    <div className="toggle-group">
                      <label className="group-label">Başvuru Alanı *</label>
                      <div className="toggle-buttons-row">
                        <button 
                          type="button"
                          onClick={() => setPositionType("teacher")}
                          className={`toggle-option ${positionType === "teacher" ? "active" : ""}`}
                        >
                          <GraduationCap size={16} />
                          <span>Öğretmen Kadrosu</span>
                        </button>
                        <button 
                          type="button"
                          onClick={() => setPositionType("staff")}
                          className={`toggle-option ${positionType === "staff" ? "active" : ""}`}
                        >
                          <Building2 size={16} />
                          <span>İdari & Destek Personeli</span>
                        </button>
                      </div>
                    </div>

                    <div className="form-grid-2">
                      <div className="form-field">
                        <label>Adınız ve Soyadınız *</label>
                        <input 
                          type="text" 
                          placeholder="Ad Soyad" 
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          required 
                        />
                      </div>

                      <div className="form-field">
                        <label>E-posta Adresiniz *</label>
                        <input 
                          type="email" 
                          placeholder="ornek@eposta.com" 
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required 
                        />
                      </div>

                      <div className="form-field">
                        <label>Telefon Numaranız *</label>
                        <input 
                          type="tel" 
                          placeholder="05XX XXX XX XX" 
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          required 
                        />
                      </div>

                      <div className="form-field">
                        <label>{positionType === "teacher" ? "Branşınız *" : "Pozisyon *"}</label>
                        <select 
                          value={branch} 
                          onChange={(e) => setBranch(e.target.value)}
                        >
                          {positionType === "teacher" 
                            ? branches.map((b) => <option key={b} value={b}>{b}</option>)
                            : staffRoles.map((s) => <option key={s} value={s}>{s}</option>)
                          }
                        </select>
                      </div>

                      <div className="form-field">
                        <label>Mesleki Deneyim</label>
                        <select 
                          value={experience} 
                          onChange={(e) => setExperience(e.target.value)}
                        >
                          <option value="Yeni Mezun">Yeni Mezun (0-1 Yıl)</option>
                          <option value="1-3 Yıl">1 - 3 Yıl</option>
                          <option value="3-5 Yıl">3 - 5 Yıl</option>
                          <option value="5-10 Yıl">5 - 10 Yıl</option>
                          <option value="10+ Yıl">10 Yıl ve Üzeri</option>
                        </select>
                      </div>

                      {/* CV Upload */}
                      <div className="form-field">
                        <label>Özgeçmiş (CV) Yükle</label>
                        <div className="upload-wrapper">
                          <label className="upload-box-label">
                            <UploadCloud size={18} />
                            <span className="upload-file-name">
                              {cvFile ? cvFile.name : "Dosya Seç (PDF / Word)"}
                            </span>
                            <input 
                              type="file" 
                              accept=".pdf,.doc,.docx" 
                              onChange={handleFileUpload} 
                              style={{ display: "none" }} 
                            />
                          </label>

                          {uploading && (
                            <span className="uploading-text">Yükleniyor: %{uploadProgress}</span>
                          )}

                          {cvUploadedUrl && (
                            <span className="uploaded-text">✓ Dosya başarıyla yüklendi</span>
                          )}

                          {uploadError && (
                            <span className="error-text">! {uploadError}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="form-field full-width">
                      <label>Ek Notlar & Ön Yazı</label>
                      <textarea 
                        rows={3} 
                        placeholder="Eğitim felsefeniz, projeleriniz veya belirtmek istediğiniz diğer hususlar..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      ></textarea>
                    </div>

                    <button type="submit" className="btn-submit-ik" disabled={saving || uploading}>
                      <Send size={16} />
                      <span>{saving ? "Kaydediliyor..." : "Başvuruyu Gönder"}</span>
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <Footer />

      <style jsx>{`
        .ik-page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: #FFFFFF;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          color: #1E293B;
        }

        /* ===== PAGE HEADER ===== */
        .page-header {
          background: #103A69;
          color: #FFFFFF;
          padding: 65px 0 55px 0;
          text-align: center;
        }

        .page-title {
          font-size: 2.5rem;
          font-weight: 800;
          color: #FFFFFF !important;
          margin: 0 auto 12px auto;
          max-width: 800px;
          line-height: 1.25;
        }

        .title-highlight {
          color: #EF4444;
        }

        .page-subtitle {
          font-size: 1.05rem;
          color: #CBD5E1 !important;
          max-width: 650px;
          margin: 0 auto;
          line-height: 1.6;
        }

        /* ===== SECTIONS ===== */
        .section-block {
          padding: 60px 0;
        }

        .bg-light {
          background: #F8FAFC;
          border-top: 1px solid #E2E8F0;
        }

        .section-header {
          text-align: center;
          margin-bottom: 40px;
        }

        .section-header h2 {
          font-size: 1.8rem;
          font-weight: 800;
          color: #0F172A;
          margin: 0 0 8px 0;
        }

        .section-header p {
          font-size: 0.95rem;
          color: #64748B;
          margin: 0;
        }

        /* ===== BENEFITS GRID (TAMAMEN SADE, KUTUSUZ İKONLAR) ===== */
        .benefits-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }

        .benefit-card {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 32px 26px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          transition: all 0.2s ease;
        }

        .benefit-card:hover {
          border-color: #CBD5E1;
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
        }

        .pure-icon {
          margin-bottom: 18px;
          display: flex;
          align-items: center;
        }

        .benefit-card h3 {
          font-size: 1.18rem;
          font-weight: 800;
          color: #0F172A;
          margin: 0 0 8px 0;
          letter-spacing: -0.2px;
        }

        .benefit-card p {
          font-size: 0.9rem;
          color: #64748B;
          line-height: 1.6;
          margin: 0;
        }

        /* ===== FORM CARD ===== */
        .form-max-width {
          max-width: 760px;
          margin: 0 auto;
        }

        .form-card-container {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 14px;
          padding: 36px 32px;
        }

        .form-header {
          margin-bottom: 24px;
        }

        .form-header h2 {
          font-size: 1.4rem;
          font-weight: 800;
          color: #0F172A;
          margin: 0 0 6px 0;
        }

        .form-header p {
          font-size: 0.9rem;
          color: #64748B;
          margin: 0;
        }

        .ik-clean-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .toggle-group {
          margin-bottom: 8px;
        }

        .group-label {
          font-size: 0.82rem;
          font-weight: 700;
          color: #334155;
          display: block;
          margin-bottom: 8px;
        }

        .toggle-buttons-row {
          display: flex;
          gap: 10px;
        }

        .toggle-option {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 11px 0;
          background: #F8FAFC;
          border: 1px solid #CBD5E1;
          border-radius: 8px;
          font-family: inherit;
          font-size: 0.88rem;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .toggle-option.active {
          background: #103A69;
          color: #FFFFFF;
          border-color: #103A69;
        }

        .form-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .form-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-field.full-width {
          grid-column: 1 / -1;
        }

        .form-field label {
          font-size: 0.82rem;
          font-weight: 700;
          color: #334155;
        }

        .form-field input, .form-field select, .form-field textarea {
          width: 100%;
          height: 44px;
          padding: 0 14px;
          font-size: 16px !important;
          color: #0F172A;
          background: #F8FAFC;
          border: 1px solid #CBD5E1;
          border-radius: 8px;
          outline: none;
          font-family: inherit;
          box-sizing: border-box;
          transition: border-color 0.2s ease;
        }

        .form-field textarea {
          height: auto;
          padding: 12px 14px;
          resize: vertical;
        }

        .form-field input:focus, .form-field select:focus, .form-field textarea:focus {
          border-color: #103A69;
          background: #FFFFFF;
        }

        .upload-wrapper {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .upload-box-label {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 44px;
          padding: 0 14px;
          background: #F8FAFC;
          border: 1.5px dashed #CBD5E1;
          border-radius: 8px;
          cursor: pointer;
          color: #103A69;
          transition: all 0.2s ease;
        }

        .upload-box-label:hover {
          border-color: #103A69;
          background: #F1F5F9;
        }

        .upload-file-name {
          font-size: 0.82rem;
          font-weight: 600;
          color: #475569;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .uploading-text {
          font-size: 0.75rem;
          font-weight: 600;
          color: #103A69;
        }

        .uploaded-text {
          font-size: 0.75rem;
          font-weight: 700;
          color: #16A34A;
        }

        .error-text {
          font-size: 0.75rem;
          font-weight: 700;
          color: #DC2626;
        }

        .btn-submit-ik {
          width: 100%;
          height: 46px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: #DC2626;
          color: #FFFFFF !important;
          border: none;
          border-radius: 8px;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          transition: background-color 0.2s ease;
          margin-top: 6px;
        }

        .btn-submit-ik:hover {
          background: #B91C1C;
        }

        /* Success Box */
        .success-box {
          text-align: center;
          padding: 30px 10px;
        }

        .success-icon {
          width: 64px;
          height: 64px;
          background: #F0FDF4;
          color: #16A34A;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px auto;
        }

        .success-box h2 {
          font-size: 1.5rem;
          font-weight: 800;
          color: #0F172A;
          margin: 0 0 8px 0;
        }

        .success-box p {
          font-size: 0.92rem;
          color: #475569;
          line-height: 1.6;
          margin: 0 0 16px 0;
        }

        .cv-success-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #F0FDF4;
          color: #15803D;
          font-size: 0.8rem;
          font-weight: 700;
          padding: 6px 14px;
          border-radius: 9999px;
          margin-bottom: 24px;
        }

        .btn-new-app {
          padding: 11px 24px;
          background: #103A69;
          color: #FFFFFF;
          border: none;
          border-radius: 8px;
          font-weight: 700;
          font-size: 0.9rem;
          cursor: pointer;
        }

        .btn-new-app:hover {
          background: #0A192F;
        }

        /* ===== RESPONSIVE ===== */
        @media (max-width: 992px) {
          .benefits-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .page-title {
            font-size: 1.8rem;
          }
          .form-grid-2 {
            grid-template-columns: 1fr;
          }
          .toggle-buttons-row {
            flex-direction: column;
          }
          .form-card-container {
            padding: 24px 18px;
          }
        }
      `}</style>
    </div>
  );
}
