"use client";
import React from 'react';
import Link from 'next/link';
import { IconFlask, IconScale, IconBook, IconGlobe } from './Icons';
import './EducationLevels.css';

const programs = [
  { 
    name: 'SAYISAL', 
    slug: 'sayisal', 
    Icon: IconFlask, 
    color: '#1E88E5',
    sub: 'Matematik & Fen'
  },
  { 
    name: 'EŞİT AĞIRLIK', 
    slug: 'esit', 
    Icon: IconScale, 
    color: '#F59E0B',
    sub: 'Türkçe & Matematik'
  },
  { 
    name: 'SÖZEL', 
    slug: 'sozel', 
    Icon: IconBook, 
    color: '#EA580C',
    sub: 'Sosyal & Edebiyat'
  },
  { 
    name: 'DİL', 
    slug: 'dil', 
    Icon: IconGlobe, 
    color: '#0D9488',
    sub: 'Yabancı Dil & YDT'
  },
];

const EducationLevels = () => {
  return (
    <section className="edu-section" id="egitim">
      <div className="container">
        <div className="edu-top-bar">
          <div className="edu-info-box">
            <span className="edu-subtag">LİSE & YKS ALANLARI</span>
            <h2>Eğitim Programlarımız</h2>
            <p>Lise düzeyinde 4 farklı alan ile öğrencilerimizi hedeflerine hazırlıyoruz.</p>
          </div>

          <div className="edu-cards-wrap">
            {programs.map((p, i) => (
              <Link 
                href={`/egitim?alan=${p.slug}`} 
                className="edu-card-btn" 
                key={i} 
                style={{ backgroundColor: p.color }}
              >
                <span className="edu-card-icon">
                  <p.Icon size={32} color="#FFFFFF" />
                </span>
                <span className="edu-card-title">{p.name}</span>
                <span className="edu-card-sub">{p.sub}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default EducationLevels;
