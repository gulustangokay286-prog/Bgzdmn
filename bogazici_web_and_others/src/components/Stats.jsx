"use client";
import React, { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import './Stats.css';

const defaultStats = [
  { num: 20, suffix: '+', label: 'Yıllık Tecrübe' },
  { num: 98, suffix: '%', label: 'Üniversiteye Yerleşme' },
  { num: 1500, suffix: '+', label: 'Mezun Öğrenci' },
  { num: 50, suffix: '+', label: 'Uzman Öğretmen' },
];

const Stats = () => {
  const [statsList, setStatsList] = useState(defaultStats);
  const [visible, setVisible] = useState(false);
  const [counts, setCounts] = useState(defaultStats.map(() => 0));
  const ref = useRef();

  useEffect(() => {
    try {
      const unsub = onSnapshot(doc(db, 'web_settings', 'stats'), (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          const liveList = [
            { num: Number(d.stat1_num) || 20, suffix: d.stat1_suffix || '+', label: d.stat1_label || 'Yıllık Tecrübe' },
            { num: Number(d.stat2_num) || 98, suffix: d.stat2_suffix || '%', label: d.stat2_label || 'Üniversiteye Yerleşme' },
            { num: Number(d.stat3_num) || 1500, suffix: d.stat3_suffix || '+', label: d.stat3_label || 'Mezun Öğrenci' },
            { num: Number(d.stat4_num) || 50, suffix: d.stat4_suffix || '+', label: d.stat4_label || 'Uzman Öğretmen' }
          ];
          setStatsList(liveList);
        }
      });
      return () => unsub();
    } catch (e) {
      console.warn("Stats firebase error:", e);
    }
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    statsList.forEach((s, i) => {
      let start = 0;
      const step = Math.max(1, Math.ceil(s.num / 40));
      const timer = setInterval(() => {
        start += step;
        if (start >= s.num) { start = s.num; clearInterval(timer); }
        setCounts(prev => { const n = [...prev]; n[i] = start; return n; });
      }, 30);
    });
  }, [visible, statsList]);

  return (
    <section className="stats-section" ref={ref}>
      <div className="container stats-grid">
        {statsList.map((s, i) => (
          <div className="stat-card" key={i}>
            <span className="stat-number">{counts[i] || s.num}{s.suffix}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Stats;
