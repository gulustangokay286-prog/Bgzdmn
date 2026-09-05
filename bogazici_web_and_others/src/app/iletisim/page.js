"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";
import { 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  Send, 
  CheckCircle2, 
  Building2, 
  MessageCircle,
  ArrowRight
} from "lucide-react";

export default function IletisimPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("Genel Bilgi & Kayıt");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !email || !message) {
      alert("Lütfen zorunlu alanları doldurunuz.");
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, "contact_messages"), {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        subject,
        message: message.trim(),
        status: "yeni",
        createdAt: serverTimestamp(),
        createdAtMillis: Date.now()
      });
      setSent(true);
    } catch (err) {
      console.error("İletişim mesajı gönderilemedi:", err);
      alert("Mesaj iletilirken bir hata oluştu. Lütfen tekrar deneyiniz.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="iletisim-page">
      <Header />

      <main className="iletisim-main">
        {/* Sade Hero Başlık */}
        <section className="page-header">
          <div className="container">
            <h1 className="page-title">
              İletişim & <span className="title-highlight">Kampüs Ziyareti</span>
            </h1>
            <p className="page-subtitle">
              Kayıt kabul, bursluluk sınavları ve eğitim modellerimiz hakkında bilgi almak için bizimle iletişime geçebilirsiniz.
            </p>
          </div>
        </section>

        {/* İletişim Detayları ve Form */}
        <section className="content-section">
          <div className="container grid-container">
            
            {/* Sol Kolon: İletişim Kanalları & Bilgiler */}
            <div className="info-column">
              <div className="info-card-block">
                <h2>İletişim Bilgileri</h2>
                <div className="red-divider"></div>

                <div className="contact-list">
                  <div className="contact-item">
                    <div className="icon-box">
                      <MapPin size={20} />
                    </div>
                    <div className="contact-detail">
                      <strong>Kampüs Adresimiz</strong>
                      <p>Bahçelievler Mah. Çamlık Cad. No: 42, Merkez / Çorum</p>
                    </div>
                  </div>

                  <div className="contact-item">
                    <div className="icon-box">
                      <Phone size={20} />
                    </div>
                    <div className="contact-detail">
                      <strong>Santral & Çağrı Merkezi</strong>
                      <p><a href="tel:03646660500">0 (364) 666 05 00</a></p>
                    </div>
                  </div>

                  <div className="contact-item">
                    <div className="icon-box">
                      <Mail size={20} />
                    </div>
                    <div className="contact-detail">
                      <strong>E-posta Adresimiz</strong>
                      <p><a href="mailto:info@corumbogazici.com">info@corumbogazici.com</a></p>
                    </div>
                  </div>

                  <div className="contact-item">
                    <div className="icon-box">
                      <Clock size={20} />
                    </div>
                    <div className="contact-detail">
                      <strong>Ziyaret & Çalışma Saatleri</strong>
                      <p>Hafta İçi: 08:30 - 18:30<br/>Cumartesi: 09:00 - 16:00</p>
                    </div>
                  </div>
                </div>

                <div className="whatsapp-box">
                  <a 
                    href="https://wa.me/903646660500" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="btn-whatsapp"
                  >
                    <MessageCircle size={18} />
                    <span>WhatsApp Bilgi Hattı</span>
                  </a>
                </div>
              </div>

              {/* Ulaşım / Adres Kartı */}
              <div className="map-info-card">
                <div className="map-info-header">
                  <Building2 size={18} />
                  <span>Merkezi Lokasyon & Kolay Ulaşım</span>
                </div>
                <div className="map-info-body">
                  <p>
                    Okulumuz Çorum şehir merkezinde, toplu taşıma hatlarına ve ana arterlere yürüme mesafesinde güvenli ve nezih bir bölgede yer almaktadır.
                  </p>
                  <a 
                    href="https://maps.google.com/?q=Bahçelievler+Mah.+Çamlık+Cad.+No:+42+Çorum" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn-map-link"
                  >
                    <span>Google Haritalarda Aç</span>
                    <ArrowRight size={14} />
                  </a>
                </div>
              </div>
            </div>

            {/* Sağ Kolon: Mesaj / Başvuru Formu */}
            <div className="form-column">
              <div className="form-card-block">
                {sent ? (
                  <div className="sent-success-box">
                    <div className="sent-icon">
                      <CheckCircle2 size={44} />
                    </div>
                    <h2>Mesajınız Bize Ulaştı</h2>
                    <p>
                      Sayın <strong>{name}</strong>, iletiniz kayıt danışmanlarımıza başarıyla ulaştırıldı. En kısa sürede sizinle iletişime geçilecektir.
                    </p>
                    <button 
                      type="button" 
                      onClick={() => { setSent(false); setMessage(""); }}
                      className="btn-send-again"
                    >
                      Yeni Mesaj Gönder
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="form-header">
                      <h2>İletişim & Ön Bilgi Formu</h2>
                      <p>Sorularınızı ve ziyaret taleplerinizi iletmek için formu doldurabilirsiniz.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="clean-form">
                      <div className="form-group">
                        <label>Adınız ve Soyadınız *</label>
                        <input 
                          type="text" 
                          placeholder="Ad Soyad" 
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required 
                        />
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label>E-posta Adresi *</label>
                          <input 
                            type="email" 
                            placeholder="ornek@eposta.com" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required 
                          />
                        </div>

                        <div className="form-group">
                          <label>Telefon Numarası</label>
                          <input 
                            type="tel" 
                            placeholder="05XX XXX XX XX" 
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Konu</label>
                        <select 
                          value={subject} 
                          onChange={(e) => setSubject(e.target.value)}
                        >
                          <option value="Genel Bilgi & Kayıt">Genel Bilgi & Kayıt</option>
                          <option value="Bursluluk Sınavı">Bursluluk Sınavı</option>
                          <option value="Lise Alan Seçimleri (Sayısal/EA/Sözel/Dil)">Lise Alan Seçimleri (Sayısal/EA/Sözel/Dil)</option>
                          <option value="LGS / YKS Kurs Programları">LGS / YKS Kurs Programları</option>
                          <option value="Diğer">Diğer</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Mesajınız *</label>
                        <textarea 
                          rows={4} 
                          placeholder="Mesajınızı buraya yazınız..."
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          required
                        ></textarea>
                      </div>

                      <button type="submit" className="btn-submit-form" disabled={saving}>
                        <Send size={16} />
                        <span>{saving ? "İletiliyor..." : "Mesajı Gönder"}</span>
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>

          </div>
        </section>
      </main>

      <Footer />

      <style jsx>{`
        .iletisim-page {
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

        /* ===== CONTENT SECTION ===== */
        .content-section {
          padding: 60px 0 80px 0;
          background: #F8FAFC;
        }

        .grid-container {
          display: grid;
          grid-template-columns: 1fr 1.3fr;
          gap: 30px;
        }

        /* ===== LEFT INFO CARDS ===== */
        .info-card-block {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 14px;
          padding: 32px;
          margin-bottom: 24px;
        }

        .info-card-block h2 {
          font-size: 1.35rem;
          font-weight: 800;
          color: #0F172A;
          margin: 0 0 8px 0;
        }

        .red-divider {
          width: 36px;
          height: 3px;
          background: #DC2626;
          border-radius: 2px;
          margin-bottom: 24px;
        }

        .contact-list {
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin-bottom: 24px;
        }

        .contact-item {
          display: flex;
          align-items: flex-start;
          gap: 14px;
        }

        .icon-box {
          width: 40px;
          height: 40px;
          background: #EEF2F6;
          color: #103A69;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .contact-detail strong {
          display: block;
          font-size: 0.92rem;
          color: #0F172A;
          margin-bottom: 3px;
        }

        .contact-detail p, .contact-detail a {
          font-size: 0.88rem;
          color: #475569;
          line-height: 1.5;
          margin: 0;
          text-decoration: none;
        }

        .contact-detail a:hover {
          color: #103A69;
          text-decoration: underline;
        }

        .whatsapp-box {
          border-top: 1px solid #F1F5F9;
          padding-top: 20px;
        }

        .btn-whatsapp {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: #16A34A;
          color: #FFFFFF !important;
          width: 100%;
          padding: 12px 20px;
          border-radius: 8px;
          font-size: 0.92rem;
          font-weight: 700;
          text-decoration: none;
          transition: background-color 0.2s ease;
        }

        .btn-whatsapp:hover {
          background: #15803D;
        }

        .map-info-card {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 14px;
          padding: 24px;
        }

        .map-info-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.92rem;
          font-weight: 700;
          color: #103A69;
          margin-bottom: 12px;
        }

        .map-info-body p {
          font-size: 0.88rem;
          color: #64748B;
          line-height: 1.6;
          margin: 0 0 16px 0;
        }

        .btn-map-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.86rem;
          font-weight: 700;
          color: #103A69;
          text-decoration: none;
        }

        .btn-map-link:hover {
          color: #DC2626;
          text-decoration: underline;
        }

        /* ===== RIGHT FORM CARD ===== */
        .form-card-block {
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

        .clean-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-size: 0.82rem;
          font-weight: 700;
          color: #334155;
        }

        .form-group input, .form-group select, .form-group textarea {
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

        .form-group textarea {
          height: auto;
          padding: 12px 14px;
          resize: vertical;
        }

        .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
          border-color: #103A69;
          background: #FFFFFF;
        }

        .btn-submit-form {
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

        .btn-submit-form:hover {
          background: #B91C1C;
        }

        /* Success Box */
        .sent-success-box {
          text-align: center;
          padding: 30px 10px;
        }

        .sent-icon {
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

        .sent-success-box h2 {
          font-size: 1.5rem;
          font-weight: 800;
          color: #0F172A;
          margin: 0 0 8px 0;
        }

        .sent-success-box p {
          font-size: 0.92rem;
          color: #475569;
          line-height: 1.6;
          margin: 0 0 24px 0;
        }

        .btn-send-again {
          padding: 11px 24px;
          background: #103A69;
          color: #FFFFFF;
          border: none;
          border-radius: 8px;
          font-weight: 700;
          font-size: 0.9rem;
          cursor: pointer;
        }

        .btn-send-again:hover {
          background: #0A192F;
        }

        /* ===== RESPONSIVE ===== */
        @media (max-width: 992px) {
          .grid-container {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .page-title {
            font-size: 1.8rem;
          }
          .form-row {
            grid-template-columns: 1fr;
          }
          .form-card-block {
            padding: 24px 18px;
          }
          .info-card-block {
            padding: 24px 18px;
          }
        }
      `}</style>
    </div>
  );
}
