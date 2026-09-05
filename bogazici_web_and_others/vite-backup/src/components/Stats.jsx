import React, { useState, useEffect, useRef } from 'react';
import './Stats.css';

const stats = [
  { num: 20, suffix: '+', label: 'Yıllık Tecrübe' },
  { num: 98, suffix: '%', label: 'Üniversiteye Yerleşme' },
  { num: 1500, suffix: '+', label: 'Mezun Öğrenci' },
  { num: 50, suffix: '+', label: 'Uzman Öğretmen' },
];

const Stats = () => {
  const [visible, setVisible] = useState(false);
  const [counts, setCounts] = useState(stats.map(() => 0));
  const ref = useRef();

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    stats.forEach((s, i) => {
      let start = 0;
      const step = Math.ceil(s.num / 40);
      const timer = setInterval(() => {
        start += step;
        if (start >= s.num) { start = s.num; clearInterval(timer); }
        setCounts(prev => { const n = [...prev]; n[i] = start; return n; });
      }, 30);
    });
  }, [visible]);

  return (
    <section className="stats-section" ref={ref}>
      <div className="container stats-grid">
        {stats.map((s, i) => (
          <div className="stat-card" key={i}>
            <span className="stat-number">{counts[i]}{s.suffix}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Stats;
