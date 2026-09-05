import React, { useState, useEffect } from 'react';
import { IconMail, IconPhone, IconBuilding, IconFacebook, IconTwitter, IconInstagram, IconYoutube, IconSearch, IconClose } from './Icons';
import './Header.css';

const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const menuItems = [
    'Kurumsal', 'Kampüslerimiz', 'Eğitim Kademelerimiz',
    'Boğaziçinde Eğitim', 'İnsan Kaynakları', 'İletişim'
  ];

  return (
    <header className={`site-header ${scrolled ? 'scrolled' : ''}`}>
      <div className="top-bar">
        <div className="container top-bar-inner">
          <div className="top-bar-left">
            <a href="mailto:info@corumbogazici.com" className="top-contact">
              <IconMail size={14} /> info@corumbogazici.com
            </a>
            <span className="top-divider">|</span>
            <a href="tel:03646660500" className="top-contact">
              <IconPhone size={14} /> 0 (364) 666 05 00
            </a>
          </div>
          <div className="top-bar-right">
            <a href="#kampusler" className="top-campus-btn">
              <IconBuilding size={14} /> KAMPÜSLERİMİZ
            </a>
            <div className="social-links">
              <a href="#" aria-label="Facebook"><IconFacebook size={12} /></a>
              <a href="#" aria-label="Twitter"><IconTwitter size={12} /></a>
              <a href="https://www.instagram.com/corumbogazicikoleji" aria-label="Instagram" target="_blank" rel="noopener noreferrer"><IconInstagram size={12} /></a>
              <a href="#" aria-label="YouTube"><IconYoutube size={12} /></a>
            </div>
          </div>
        </div>
      </div>

      <div className={`main-nav ${scrolled ? 'nav-scrolled' : ''}`}>
        <div className="container main-nav-inner">
          <a href="#" className="logo-wrapper">
            <img src="/logo.png?v=2" alt="Boğaziçi Koleji" className="logo-img" />
            <div className="logo-text">
              <span className="logo-name">BOĞAZİÇİ</span>
              <span className="logo-sub">EĞİTİM KURUMLARI</span>
            </div>
          </a>

          <div className="nav-actions">
            <button className="search-btn" onClick={() => setSearchOpen(!searchOpen)} aria-label="Ara">
              <IconSearch size={22} />
            </button>
            <button className={`hamburger ${menuOpen ? 'active' : ''}`} onClick={() => setMenuOpen(!menuOpen)} aria-label="Menü">
              <span></span><span></span><span></span>
              <small>MENÜ</small>
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="search-bar">
            <div className="container">
              <input type="text" placeholder="Arama yapın..." autoFocus />
              <button onClick={() => setSearchOpen(false)}><IconClose size={20} /></button>
            </div>
          </div>
        )}

        <div className={`dropdown-menu ${menuOpen ? 'open' : ''}`}>
          <nav>
            {menuItems.map((item, i) => (
              <a href={`#${item.toLowerCase().replace(/\s/g, '-')}`} key={i} onClick={() => setMenuOpen(false)}>
                {item}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
