"use client";
import React from 'react';
import { IconInstagram, IconFacebook, IconTwitter, IconYoutube, IconMapPin, IconPhone, IconMail } from './Icons';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="footer-logo-row">
              <img src="/logo.png?v=img4327" alt="Boğaziçi Koleji" className="footer-logo" />
              <div>
                <span className="footer-name">BOĞAZİÇİ</span>
                <span className="footer-sub">EĞİTİM KURUMLARI</span>
              </div>
            </div>
            <p className="footer-slogan cursive">Geleceğiniz için...</p>
            <p className="footer-desc">
              Çorum Boğaziçi Koleji olarak öğrencilerimize en iyi eğitimi sunmak ve onları geleceğe hazırlamak için çalışıyoruz.
            </p>
          </div>

          <div className="footer-links-col">
            <h4>Hızlı Bağlantılar</h4>
            <ul>
              <li><a href="#home">Anasayfa</a></li>
              <li><a href="#hakkimizda">Hakkımızda</a></li>
              <li><a href="#egitim">Eğitim Programları</a></li>
              <li><a href="#haberler">Haberler</a></li>
              <li><a href="#iletisim">İletişim</a></li>
            </ul>
          </div>

          <div className="footer-links-col">
            <h4>Eğitim</h4>
            <ul>
              <li><a href="#">Sayısal Program</a></li>
              <li><a href="#">Eşit Ağırlık Program</a></li>
              <li><a href="#">Sözel Program</a></li>
              <li><a href="#">Dil Programı</a></li>
              <li><a href="#">YKS Hazırlık</a></li>
            </ul>
          </div>

          <div className="footer-contact-col">
            <h4>İletişim</h4>
            <ul>
              <li><span className="footer-icon"><IconMapPin size={14} /></span> Yavruturna Mah. Esnafevleri 6.Sk. No:12 Merkez/Çorum</li>
              <li><span className="footer-icon"><IconPhone size={14} /></span> 0 364 666 05 00</li>
              <li><span className="footer-icon"><IconMail size={14} /></span> info@corumbogazici.com</li>
            </ul>
            <div className="footer-socials">
              <a href="https://www.instagram.com/corumbogazicikoleji" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><IconInstagram size={16} /></a>
              <a href="#" aria-label="Facebook"><IconFacebook size={16} /></a>
              <a href="#" aria-label="Twitter"><IconTwitter size={16} /></a>
              <a href="#" aria-label="YouTube"><IconYoutube size={16} /></a>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} Çorum Boğaziçi Koleji. Tüm hakları saklıdır.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
