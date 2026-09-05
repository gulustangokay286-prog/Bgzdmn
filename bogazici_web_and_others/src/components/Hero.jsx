"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { IconChevronLeft, IconChevronRight } from "./Icons";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { Sparkles, ArrowRight } from "lucide-react";
import "./Hero.css";

const defaultSlides = [
  {
    title: "Daha iyi bir gelecek için",
    highlight: "Boğaziçi",
    desc: "Çorum Boğaziçi Koleji olarak öğrencilerimizi üniversiteye ve hayata en iyi şekilde hazırlıyoruz.",
  },
  {
    title: "Başarıya giden yolda",
    highlight: "Yanınızdayız",
    desc: "Deneyimli kadromuz, modern eğitim anlayışımız ve bireysel takip sistemimizle her öğrencimizin potansiyelini ortaya çıkarıyoruz.",
  },
  {
    title: "YKS'de hedefine",
    highlight: "Ulaş",
    desc: "Planlı çalış, hedefine odaklan. Kendine güven, potansiyeline inan. Güzel bir gelecek seni bekliyor.",
  },
];

const Hero = () => {
  const [current, setCurrent] = useState(0);
  const [heroSettings, setHeroSettings] = useState(null);

  useEffect(() => {
    try {
      const unsub = onSnapshot(doc(db, "web_settings", "hero"), (docSnap) => {
        if (docSnap.exists()) {
          setHeroSettings(docSnap.data());
        }
      }, (e) => {
        console.warn("Hero ayarları canlı dinleme hatası:", e);
      });
      return () => unsub();
    } catch (e) {
      console.warn("Firebase bağlantı hatası:", e);
    }
  }, []);

  const slides = heroSettings?.title ? [
    {
      title: heroSettings.badgeText || "Boğaziçi Koleji",
      highlight: heroSettings.title || "Geleceğiniz İçin",
      desc: heroSettings.subtitle || "Akademik başarı, yabancı dil ve teknoloji odaklı eğitim anlayışıyla öğrencilerimizi hayata hazırlıyoruz.",
    },
    ...defaultSlides.slice(1)
  ] : defaultSlides;

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [slides.length]);

  const goTo = (dir) => {
    if (dir === "prev") {
      setCurrent((prev) => (prev - 1 + slides.length) % slides.length);
    } else {
      setCurrent((prev) => (prev + 1) % slides.length);
    }
  };

  const frame1 = heroSettings?.heroImageUrl || '/images/unnamed.jpg';
  const frame2 = heroSettings?.heroImageUrl2 || '/images/d-s-c-2908.webp';
  const frame3 = heroSettings?.heroImageUrl3 || '/images/images-2.jpeg';

  return (
    <>
      {/* Üst Acil / Tanıtım Duyuru Bandı */}
      {heroSettings?.topBannerActive && heroSettings?.topBannerText && (
        <div className="hero-top-announcement-bar">
          <div className="container announcement-inner">
            <div className="announcement-content">
              <Sparkles size={16} className="announcement-sparkle" />
              <span>{heroSettings.topBannerText}</span>
            </div>
            <a href="#on-kayit" className="announcement-link">
              <span>Hemen Başvur</span>
              <ArrowRight size={13} />
            </a>
          </div>
        </div>
      )}

      <section className="hero" id="home">
        <div className="hero-bg-solid"></div>

        <div className="hero-frames">
          <div className="frame frame-1"><img src={frame1} alt="Boğaziçi Koleji" /></div>
          <div className="frame frame-2"><img src={frame2} alt="Boğaziçi Koleji" /></div>
          <div className="frame frame-3"><img src={frame3} alt="Boğaziçi Koleji" /></div>
        </div>

        <div className="container hero-inner">
          <div className="hero-text">
            {slides.map((slide, i) => (
              <div className={`slide-content ${i === current ? "active" : ""}`} key={i}>
                <h1>
                  <em>{slide.title}</em><br />
                  <span className="hero-highlight">{slide.highlight}</span>
                </h1>
                <p className="hero-slogan cursive">Geleceğiniz için...</p>
                <p className="hero-desc">{slide.desc}</p>
                <div className="hero-btns">
                  <a href="#on-kayit" className="btn btn-red" onClick={(e) => {
                    e.preventDefault();
                    const el = document.getElementById("on-kayit") || document.getElementById("kayit");
                    if (el) {
                      const headerOffset = 80;
                      const elementPosition = el.getBoundingClientRect().top;
                      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                      window.scrollTo({ top: offsetPosition, behavior: "smooth" });
                    } else {
                      window.location.href = "/#on-kayit";
                    }
                  }}>Ön Kayıt</a>
                  <Link href="/kurumsal" className="btn btn-outline-white">Bizi Tanıyın</Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button className="hero-nav hero-prev" onClick={() => goTo("prev")} aria-label="Önceki">
          <IconChevronLeft size={24} />
        </button>
        <button className="hero-nav hero-next" onClick={() => goTo("next")} aria-label="Sonraki">
          <IconChevronRight size={24} />
        </button>

        <div className="hero-dots">
          {slides.map((_, i) => (
            <button 
              key={i} 
              className={`dot ${i === current ? "active" : ""}`} 
              onClick={() => setCurrent(i)} 
              aria-label={`Slayt ${i + 1}`}
            />
          ))}
        </div>
      </section>

      <style jsx>{`
        .hero-top-announcement-bar {
          background: linear-gradient(90deg, #1E3A8A 0%, #DC2626 100%);
          color: #FFFFFF;
          padding: 8px 0;
          font-size: 0.82rem;
          font-weight: 700;
          position: relative;
          z-index: 10;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .announcement-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .announcement-content {
          display: flex;
          align-items: center;
          gap: 8px;
          line-height: 1.4;
        }
        .announcement-sparkle {
          color: #FEF08A;
          shrink: 0;
        }
        .announcement-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 12px;
          background: rgba(255, 255, 255, 0.2);
          hover:background: rgba(255, 255, 255, 0.3);
          color: #FFFFFF;
          border-radius: 9999px;
          font-size: 0.75rem;
          text-decoration: none;
          white-space: nowrap;
          transition: all 0.2s ease;
        }
        .announcement-link:hover {
          background: #FFFFFF;
          color: #DC2626;
        }
        @media (max-width: 640px) {
          .announcement-inner { flex-direction: column; text-align: center; gap: 6px; }
        }
      `}</style>
    </>
  );
};

export default Hero;
