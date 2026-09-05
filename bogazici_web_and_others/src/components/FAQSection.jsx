"use client";
import React, { useState, useEffect } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

const defaultFaqs = [
  {
    q: "Boğaziçi Koleji’ne kayıt kabul ve bursluluk şartları nelerdir?",
    a: "Kurumumuza her yıl düzenlenen Düzey Belirleme ve Bursluluk Sınavları ile öğrenci kabul edilmektedir. Sınavda başarı gösteren öğrencilerimize %100’e varan eğitim bursları ve başarı teşvik ödülleri sağlanmaktadır."
  },
  {
    q: "Lise kademesinde Sayısal (MF) ve Eşit Ağırlık (TM) ayrımı ne zaman yapılır?",
    a: "Öğrencilerimiz 10. sınıfın ikinci döneminde PDR uzmanlarımız ve zümre öğretmenlerimiz eşliğinde kariyer eğilim testlerine tabi tutulur. 11. sınıftan itibaren hedefledikleri bölümlere özel Sayısal, Eşit Ağırlık, Sözel veya Dil sınıflarına yerleştirilirler."
  },
  {
    q: "YKS ve LGS hazırlık süreçlerinde ek ders veya kurs ihtiyacı oluyor mu?",
    a: "Hayır. Boğaziçi Koleji tam gün eğitim modeli, birebir etüt ofisleri, cumartesi deneme sınavları ve soru çözüm merkezleri sayesinde öğrencilerimizin hiçbir dış kurs veya özel derse ihtiyaç duymadan derece yapmalarını hedefler."
  },
  {
    q: "Okul servis ve yemekhane hizmetleri nasıl denetlenmektedir?",
    a: "Tüm servis araçlarımız GPS ve mobil uygulama üzerinden anlık takip edilmektedir. Yemeklerimiz diyetisyen kontrolünde, hijyen sertifikalı mutfaklarımızda günlük ve taze olarak hazırlanır."
  },
  {
    q: "Dijital Portal ve Mobil Uygulama velilere ne gibi imkanlar sunar?",
    a: "Velilerimiz ve öğrencilerimiz; akıllı yoklama, turnike geçiş bildirimleri, haftalık ödev takipleri, canlı deneme sınavı karne analizleri ve öğretmen randevu sistemine 7/24 mobil uygulama ve web portaldan erişebilirler."
  }
];

export default function FAQSection() {
  const [faqs, setFaqs] = useState(defaultFaqs);
  const [openIndex, setOpenIndex] = useState(0);

  useEffect(() => {
    try {
      const unsub = onSnapshot(doc(db, "web_settings", "faq"), (snap) => {
        if (snap.exists() && snap.data().items && snap.data().items.length > 0) {
          setFaqs(snap.data().items);
        }
      });
      return () => unsub();
    } catch (e) {
      console.warn("FAQ firebase hatası:", e);
    }
  }, []);

  return (
    <section className="faq-section">
      <div className="container">
        <div className="section-head">
          <span className="sec-tag">MERAK EDİLENLER</span>
          <h2>Sıkça Sorulan Sorular</h2>
          <p>Kayıt, akademik programlar ve okul yaşamı hakkında merak ettiğiniz tüm detaylar.</p>
          <div className="red-bar"></div>
        </div>

        <div className="faq-accordion-stack">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div key={idx} className={`faq-item-card ${isOpen ? "open" : ""}`}>
                <button 
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="faq-question-btn"
                >
                  <span className="faq-q-text">{faq.q}</span>
                  <div className={`faq-chevron-circle ${isOpen ? "rotate" : ""}`}>
                    <ChevronDown size={18} />
                  </div>
                </button>

                {isOpen && (
                  <div className="faq-answer-box animate-fade-in">
                    <p>{faq.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style jsx>{`
        .faq-section {
          padding: 80px 0;
          background: #FFFFFF;
        }
        .section-head {
          text-align: center;
          margin-bottom: 44px;
        }
        .sec-tag {
          font-size: 0.76rem;
          font-weight: 800;
          letter-spacing: 1.5px;
          color: #E6332A;
        }
        .section-head h2 {
          font-family: var(--font-heading), Outfit, sans-serif;
          font-size: 2.2rem;
          font-weight: 800;
          color: #0A192F;
          margin-top: 6px;
        }
        .section-head p {
          font-size: 0.95rem;
          color: #64748B;
          max-width: 600px;
          margin: 8px auto 0 auto;
        }
        .red-bar {
          width: 36px;
          height: 3px;
          background: #E6332A;
          border-radius: 2px;
          margin: 12px auto 0 auto;
        }
        .faq-accordion-stack {
          max-width: 800px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .faq-item-card {
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 16px;
          overflow: hidden;
          transition: all 0.2s ease;
        }
        .faq-item-card.open {
          background: #FFFFFF;
          border-color: #103A69;
          box-shadow: 0 4px 20px rgba(16, 58, 105, 0.06);
        }
        .faq-question-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          background: transparent;
          border: none;
          text-align: left;
          cursor: pointer;
          font-family: inherit;
          gap: 16px;
        }
        .faq-q-text {
          font-family: var(--font-heading), Outfit, sans-serif;
          font-size: 1.05rem;
          font-weight: 700;
          color: #0A192F;
        }
        .faq-chevron-circle {
          width: 32px;
          height: 32px;
          background: #EEF2F6;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #103A69;
          flex-shrink: 0;
          transition: transform 0.25s ease;
        }
        .faq-chevron-circle.rotate {
          transform: rotate(180deg);
          background: #103A69;
          color: #FFFFFF;
        }
        .faq-answer-box {
          padding: 0 24px 22px 24px;
          color: #475569;
          font-size: 0.92rem;
          line-height: 1.65;
        }
        .animate-fade-in {
          animation: fadeIn 0.2s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 640px) {
          .faq-question-btn { padding: 16px 18px; }
          .faq-q-text { font-size: 0.95rem; }
          .section-head h2 { font-size: 1.8rem; }
        }
      `}</style>
    </section>
  );
}
