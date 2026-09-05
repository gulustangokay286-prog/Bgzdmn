import React, { useState, useEffect } from 'react';
import { IconChevronLeft, IconChevronRight } from './Icons';
import './Hero.css';

const slides = [
  {
    title: 'Daha iyi bir gelecek için',
    highlight: 'Boğaziçi',
    desc: 'Çorum Boğaziçi Koleji olarak öğrencilerimizi üniversiteye ve hayata en iyi şekilde hazırlıyoruz.',
  },
  {
    title: 'Başarıya giden yolda',
    highlight: 'Yanınızdayız',
    desc: 'Deneyimli kadromuz, modern eğitim anlayışımız ve bireysel takip sistemimizle her öğrencimizin potansiyelini ortaya çıkarıyoruz.',
  },
  {
    title: 'YKS\'de hedefine',
    highlight: 'Ulaş',
    desc: 'Planlı çalış, hedefine odaklan. Kendine güven, potansiyeline inan. Güzel bir gelecek seni bekliyor.',
  },
];

const Hero = () => {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent(prev => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const goTo = (dir) => {
    if (dir === 'prev') setCurrent(prev => (prev - 1 + slides.length) % slides.length);
    else setCurrent(prev => (prev + 1) % slides.length);
  };

  return (
    <section className="hero" id="home">
      <div className="hero-bg-solid"></div>

      <div className="hero-frames">
        <div className="frame frame-1"><img src="/hero-bg.png" alt="" /></div>
        <div className="frame frame-2"><img src="/hero-bg.png" alt="" /></div>
        <div className="frame frame-3"><img src="/hero-bg.png" alt="" /></div>
      </div>

      <div className="container hero-inner">
        <div className="hero-text">
          {slides.map((slide, i) => (
            <div className={`slide-content ${i === current ? 'active' : ''}`} key={i}>
              <h1>
                <em>{slide.title}</em><br />
                <span className="hero-highlight">{slide.highlight}</span>
              </h1>
              <p className="hero-slogan cursive">Geleceğiniz için...</p>
              <p className="hero-desc">{slide.desc}</p>
              <div className="hero-btns">
                <a href="#kayit" className="btn btn-red">Ön Kayıt</a>
                <a href="#hakkimizda" className="btn btn-outline-white">Bizi Tanıyın</a>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button className="hero-nav hero-prev" onClick={() => goTo('prev')} aria-label="Önceki"><IconChevronLeft size={24} /></button>
      <button className="hero-nav hero-next" onClick={() => goTo('next')} aria-label="Sonraki"><IconChevronRight size={24} /></button>

      <div className="hero-dots">
        {slides.map((_, i) => (
          <button key={i} className={`dot ${i === current ? 'active' : ''}`} onClick={() => setCurrent(i)} />
        ))}
      </div>
    </section>
  );
};

export default Hero;
