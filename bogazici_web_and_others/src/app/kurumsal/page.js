"use client";
import React from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function KurumsalPage() {
  const leadership = [
    {
      name: "Muharrem Özkan",
      role: "Kurucu",
      desc: "Boğaziçi Eğitim Kurumları'nın kurucusu ve yönetim lideri."
    },
    {
      name: "Seher Şanlı",
      role: "Lise Müdürü",
      desc: "Boğaziçi Özel Anadolu Lisesi Müdürü olarak akademik vizyona, öğretmen kadrosuna ve okul yönetimine liderlik etmektedir."
    },
    {
      name: "Tuncer Küçükkişi",
      role: "Birey Kurs Müdürü",
      desc: "Birey Özel Öğretim Kursu ve sınav hazırlık programları yöneticisi."
    },
    {
      name: "Ahmet Aykaç",
      role: "LGS Kurs Müdürü",
      desc: "LGS hazırlık merkezi ve ortaokul sınav grupları yöneticisi."
    }
  ];

  return (
    <div className="kurumsal-page">
      <Header />

      <main className="kurumsal-main">
        {/* Sade Hero Başlık - 'KURUMSAL' etiketi tamamen kaldırıldı */}
        <section className="page-header">
          <div className="container">
            <h1 className="page-title">
              Geleceğin Liderlerini <span className="title-highlight">Bugünden Yetiştiriyoruz</span>
            </h1>
            <p className="page-subtitle">
              Köklü eğitim geleneğimizi modern yaklaşımlar ve güçlü öğretmen kadromuzla birleştiriyoruz.
            </p>
          </div>
        </section>

        {/* Misyon & Vizyon */}
        <section className="section-block">
          <div className="container">
            <div className="two-col-grid">
              <div className="info-card">
                <h2>Misyonumuz</h2>
                <div className="card-line"></div>
                <p>
                  Öğrencilerimizi milli ve manevi değerlerine bağlı, evrensel düşünce yapısına sahip, bilim ve teknolojiyi etkin kullanan, problem çözme yeteneği gelişmiş bireyler olarak geleceğe hazırlamaktır.
                </p>
              </div>

              <div className="info-card">
                <h2>Vizyonumuz</h2>
                <div className="card-line"></div>
                <p>
                  Türkiye genelinde akademik başarıları, disiplinli eğitim kültürü ve yetiştirdiği aydın nesillerle örnek gösterilen öncü bir eğitim kurumu olmaktır.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Yönetim Kadromuz */}
        <section className="section-block bg-light">
          <div className="container">
            <div className="section-header">
              <h2>Yönetim Kadromuz</h2>
              <p>Kurumumuzun idari ve akademik yönetimini yürüten kadromuz</p>
            </div>

            <div className="leadership-grid">
              {leadership.map((leader, i) => (
                <div key={i} className="leader-card">
                  <span className="leader-role">{leader.role}</span>
                  <h3 className="leader-name">{leader.name}</h3>
                  <p className="leader-desc">{leader.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Kurumsal Bilgiler / İletişim Bandı - Hizalaması ve Butonları Tam Düzeltilmiş */}
        <section className="section-block">
          <div className="container">
            <div className="contact-banner-box">
              <div className="contact-text-wrap">
                <h2>Kurumumuz Hakkında Detaylı Bilgi</h2>
                <p>Kayıt süreçleri ve eğitim programlarımız hakkında bilgi almak için bizimle iletişime geçebilirsiniz.</p>
              </div>
              <div className="contact-btns-wrap">
                <Link href="/iletisim" className="btn-contact-solid">
                  İletişim Formu
                </Link>
                <a href="tel:03646660500" className="btn-contact-outline">
                  0 (364) 666 05 00
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      <style jsx>{`
        .kurumsal-page {
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
          max-width: 820px;
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
          border-bottom: 1px solid #E2E8F0;
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

        /* ===== TWO COL GRID (MISYON/VIZYON) ===== */
        .two-col-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
        }

        .info-card {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 32px;
        }

        .info-card h2 {
          font-size: 1.4rem;
          font-weight: 700;
          color: #0F172A;
          margin: 0 0 12px 0;
        }

        .card-line {
          width: 36px;
          height: 3px;
          background: #DC2626;
          margin-bottom: 16px;
          border-radius: 2px;
        }

        .info-card p {
          font-size: 0.95rem;
          line-height: 1.7;
          color: #475569;
          margin: 0;
        }

        /* ===== LEADERSHIP GRID ===== */
        .leadership-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
        }

        .leader-card {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 24px;
          display: flex;
          flex-direction: column;
        }

        .leader-role {
          font-size: 0.8rem;
          font-weight: 700;
          color: #DC2626;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .leader-name {
          font-size: 1.2rem;
          font-weight: 800;
          color: #0F172A;
          margin: 0 0 10px 0;
        }

        .leader-desc {
          font-size: 0.88rem;
          color: #64748B;
          line-height: 1.55;
          margin: 0;
        }

        /* ===== CONTACT BANNER BOX (Hizalı ve Şık Butonlar) ===== */
        .contact-banner-box {
          background: #F1F5F9;
          border: 1px solid #E2E8F0;
          border-radius: 14px;
          padding: 32px 36px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        .contact-text-wrap h2 {
          font-size: 1.35rem;
          font-weight: 700;
          color: #0F172A;
          margin: 0 0 6px 0;
        }

        .contact-text-wrap p {
          font-size: 0.92rem;
          color: #64748B;
          margin: 0;
          line-height: 1.5;
        }

        .contact-btns-wrap {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-shrink: 0;
        }

        .btn-contact-solid {
          background: #DC2626 !important;
          color: #FFFFFF !important;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 0.92rem;
          font-weight: 700;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #DC2626;
          transition: background-color 0.2s ease;
          box-shadow: 0 2px 6px rgba(220, 38, 38, 0.2);
        }

        .btn-contact-solid:hover {
          background: #B91C1C !important;
          border-color: #B91C1C;
        }

        .btn-contact-outline {
          background: #FFFFFF !important;
          color: #0F172A !important;
          border: 1px solid #CBD5E1;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 0.92rem;
          font-weight: 700;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .btn-contact-outline:hover {
          background: #F8FAFC !important;
          border-color: #94A3B8;
        }

        /* ===== RESPONSIVE ===== */
        @media (max-width: 992px) {
          .leadership-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .contact-banner-box {
            flex-direction: column;
            align-items: flex-start;
            padding: 26px 20px;
          }
          .contact-btns-wrap {
            width: 100%;
            flex-direction: column;
          }
          .btn-contact-solid, .btn-contact-outline {
            width: 100%;
            text-align: center;
          }
        }

        @media (max-width: 640px) {
          .page-title {
            font-size: 1.8rem;
          }
          .two-col-grid {
            grid-template-columns: 1fr;
          }
          .leadership-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
