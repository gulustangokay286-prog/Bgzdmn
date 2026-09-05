"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, getDocs, collection, query, where, limit, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";
import { 
  IconMail, 
  IconPhone, 
  IconFacebook, 
  IconTwitter, 
  IconInstagram, 
  IconYoutube, 
  IconSearch, 
  IconClose 
} from "./Icons";
import { 
  QrCode, 
  ShoppingBag, 
  ChevronDown, 
  Sparkles,
  ShieldCheck,
  User,
  LayoutDashboard
} from "lucide-react";
import "./Header.css";

const Header = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [contactSettings, setContactSettings] = useState({
    phone: '0 (364) 666 05 00',
    email: 'info@corumbogazici.com',
    instagram: 'https://www.instagram.com/corumbogazicikoleji',
    youtube: '#'
  });

  const dropdownRef = useRef(null);

  const refreshProfileFromCache = () => {
    try {
      const cached = localStorage.getItem("bgz_user_profile");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.status && ['pending', 'awaiting_approval'].includes(String(parsed.status).toLowerCase())) {
          localStorage.removeItem("bgz_user_profile");
          setUserProfile(null);
          return;
        }
        if (parsed && (parsed.full_name || parsed.name)) {
          setUserProfile(parsed);
        }
      }
    } catch (e) {}
  };

  useEffect(() => {
    setMounted(true);
    refreshProfileFromCache();

    // Listen for custom profile update events
    const handleProfileUpdate = () => refreshProfileFromCache();
    window.addEventListener("bgz_profile_updated", handleProfileUpdate);
    window.addEventListener("storage", handleProfileUpdate);

    // Canlı İletişim Ayarlarını Dinle
    try {
      const unsubContact = onSnapshot(doc(db, "web_settings", "contact"), (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setContactSettings(prev => ({
            ...prev,
            phone: d.phone || prev.phone,
            email: d.email || prev.email,
            instagram: d.instagram || prev.instagram,
            youtube: d.youtube || prev.youtube
          }));
        }
      });
      return () => {
        window.removeEventListener("bgz_profile_updated", handleProfileUpdate);
        window.removeEventListener("storage", handleProfileUpdate);
        unsubContact();
      };
    } catch (err) {
      console.warn("Header contact listener error:", err);
      return () => {
        window.removeEventListener("bgz_profile_updated", handleProfileUpdate);
        window.removeEventListener("storage", handleProfileUpdate);
      };
    }
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Strict Auth State Listener with fallback & cache
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user && !user.isAnonymous) {
        setCurrentUser(user);
        try {
          // 1. Direct UID lookup
          let docSnap = await getDoc(doc(db, "users", user.uid));
          let userData = docSnap.exists() ? docSnap.data() : null;

          // 2. Fallback to email query
          if (!userData && user.email) {
            const q = query(
              collection(db, "users"), 
              where("email", "==", user.email.trim().toLowerCase()),
              limit(1)
            );
            const querySnap = await getDocs(q);
            if (!querySnap.empty) {
              userData = querySnap.docs[0].data();
            }
          }

          // Onaysız / Bekleyen hesap kontrolü
          if (userData && userData.status && ['pending', 'awaiting_approval'].includes(String(userData.status).toLowerCase())) {
            setUserProfile(null);
            try { localStorage.removeItem("bgz_user_profile"); } catch (e) {}
            return;
          }

          if (userData && (userData.full_name || userData.name)) {
            const formatted = {
              ...userData,
              full_name: userData.full_name || userData.name,
              role: userData.role || "student",
              email: userData.email || user.email,
              profile_image: userData.profile_image || userData.profileImageUrl || userData.photoUrl || null
            };
            setUserProfile(formatted);
            try {
              localStorage.setItem("bgz_user_profile", JSON.stringify(formatted));
            } catch (e) {}
          } else if (user.displayName) {
            const fallbackProfile = {
              full_name: user.displayName,
              role: "student",
              email: user.email,
              profile_image: user.photoURL || null
            };
            setUserProfile(fallbackProfile);
            try {
              localStorage.setItem("bgz_user_profile", JSON.stringify(fallbackProfile));
            } catch (e) {}
          }
        } catch (err) {
          console.error("User profile header error:", err);
          refreshProfileFromCache();
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getInitials = (name) => {
    if (!name || typeof name !== "string") return "BK";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getFirstName = (name) => {
    if (!name || typeof name !== "string") return "Kullanıcı";
    return name.trim().split(/\s+/)[0] || "Kullanıcı";
  };

  const roleDisplay = (role) => {
    switch (role) {
      case "teacher": return "Öğretmen";
      case "personnel": return "Personel";
      case "parent": return "Veli";
      case "admin": return "Yönetici";
      default: return "Öğrenci";
    }
  };

  const navMenuItems = [
    { title: "Kurumsal", href: "/kurumsal" },
    { title: "Eğitim Kademelerimiz", href: "/egitim" },
    { title: "Kurumsal Mağaza", href: "/magaza" },
    { title: "İnsan Kaynakları", href: "/insan-kaynaklari" },
    { title: "İletişim", href: "/iletisim" }
  ];

  const effectiveName = userProfile?.full_name || userProfile?.name || "Kullanıcı";
  const effectivePhoto = userProfile?.profile_image || userProfile?.profileImageUrl || userProfile?.photoUrl || null;
  const isAuthenticated = mounted && (userProfile || currentUser);

  return (
    <header className={`site-header ${scrolled ? "scrolled" : ""}`}>
      <div className="top-bar">
        <div className="container top-bar-inner">
          <div className="top-bar-left">
            <a href={`mailto:${contactSettings.email}`} className="top-contact">
              <IconMail size={14} /> {contactSettings.email}
            </a>
            <span className="top-divider">|</span>
            <a href={`tel:${contactSettings.phone.replace(/[^0-9+]/g, '')}`} className="top-contact">
              <IconPhone size={14} /> {contactSettings.phone}
            </a>
          </div>

          {/* Top Auth Section Mobile (Only shown when not logged in) */}
          {!isAuthenticated && (
            <div className="top-auth-group-mobile">
              <Link href="/register" className="top-register-btn-mobile">Kayıt Ol</Link>
              <Link href="/login" className="top-login-btn-mobile">Giriş Yap</Link>
            </div>
          )}

          <div className="top-bar-right">
            <div className="social-links">
              <a href="#" aria-label="Facebook"><IconFacebook size={12} /></a>
              <a href="#" aria-label="Twitter"><IconTwitter size={12} /></a>
              <a href={contactSettings.instagram || "https://www.instagram.com/corumbogazicikoleji"} aria-label="Instagram" target="_blank" rel="noopener noreferrer">
                <IconInstagram size={12} />
              </a>
              <a href={contactSettings.youtube || "#"} aria-label="YouTube" target="_blank" rel="noopener noreferrer">
                <IconYoutube size={12} />
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className={`main-nav ${scrolled ? "nav-scrolled" : ""}`}>
        <div className="container main-nav-inner">
          <Link href="/" className="logo-wrapper">
            <img src="/logo.png?v=img4327" alt="Boğaziçi Koleji" className="logo-img" />
            <div className="logo-text">
              <span className="logo-name">BOĞAZİÇİ</span>
              <span className="logo-sub">EĞİTİM KURUMLARI</span>
            </div>
          </Link>

          <div className="nav-actions">
            {isAuthenticated ? (
              /* Profile Avatar Dropdown */
              <div className="profile-menu-container" ref={dropdownRef}>
                <button 
                  type="button"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="profile-avatar-btn"
                  aria-label="Kullanıcı Menüsü"
                >
                  <div className="profile-avatar-circle">
                    {effectivePhoto ? (
                      <img src={effectivePhoto} alt="Profil" className="profile-avatar-img" />
                    ) : (
                      getInitials(effectiveName)
                    )}
                  </div>
                  <div className="profile-btn-info">
                    <span className="profile-btn-name">{getFirstName(effectiveName)}</span>
                    <span className="profile-btn-role">{roleDisplay(userProfile?.role)}</span>
                  </div>
                  <ChevronDown size={14} className={`profile-chevron ${profileDropdownOpen ? "rotate" : ""}`} />
                </button>

                {profileDropdownOpen && (
                  <div className="profile-dropdown-card animate-pop-in">
                    <div className="profile-dropdown-header">
                      <div className="dropdown-avatar-large">
                        {effectivePhoto ? (
                          <img src={effectivePhoto} alt="Profil" className="profile-avatar-img" />
                        ) : (
                          getInitials(effectiveName)
                        )}
                      </div>
                      <div className="dropdown-user-details">
                        <strong className="dropdown-name">{effectiveName}</strong>
                        <span className="dropdown-role-badge">
                          <ShieldCheck size={12} />
                          {roleDisplay(userProfile?.role)}
                        </span>
                        <small className="dropdown-email">{currentUser?.email || userProfile?.email || ''}</small>
                      </div>
                    </div>

                    <div className="dropdown-divider"></div>

                    <div className="dropdown-links-list">
                      <Link href="/login" className="dropdown-item-link highlight-portal-link" onClick={() => setProfileDropdownOpen(false)}>
                        <LayoutDashboard size={16} className="dropdown-icon-gold" />
                        <span className="font-bold">Portalım & Hesap</span>
                      </Link>

                      <Link href="/magaza" className="dropdown-item-link" onClick={() => setProfileDropdownOpen(false)}>
                        <ShoppingBag size={16} className="dropdown-icon-blue" />
                        <span>Kurumsal Mağaza</span>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Unauthenticated Buttons */
              <>
                <Link href="/login" className="nav-login-btn">Giriş Yap</Link>
                <Link href="/register" className="nav-register-btn">Kayıt Ol</Link>
              </>
            )}

            <button className="search-btn" onClick={() => setSearchOpen(!searchOpen)} aria-label="Ara">
              <IconSearch size={22} />
            </button>
            <button className={`hamburger ${menuOpen ? "active" : ""}`} onClick={() => setMenuOpen(!menuOpen)} aria-label="Menü">
              <span></span><span></span><span></span>
              <small>MENÜ</small>
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="search-bar">
            <div className="container">
              <input type="text" placeholder="Arama yapın... (Örn: Bursluluk, Sayısal, Kıyafet)" autoFocus />
              <button onClick={() => setSearchOpen(false)}><IconClose size={20} /></button>
            </div>
          </div>
        )}

        {/* Mobile & Desktop Main Menu (Hamburger) */}
        <div className={`dropdown-menu ${menuOpen ? "open" : ""}`}>
          <nav>
            {navMenuItems.map((item, i) => (
              <Link href={item.href} key={i} onClick={() => setMenuOpen(false)}>
                {item.title}
              </Link>
            ))}
            {isAuthenticated ? (
              <div className="mobile-menu-user-row">
                <Link href="/login" onClick={() => setMenuOpen(false)} className="mobile-portal-btn">
                  <User size={16} />
                  <span>Portalım & Hesap</span>
                </Link>
              </div>
            ) : (
              <div className="mobile-menu-auth-row">
                <Link href="/login" onClick={() => setMenuOpen(false)} className="mobile-nav-login">Giriş Yap</Link>
                <Link href="/register" onClick={() => setMenuOpen(false)} className="mobile-nav-register">Kayıt Ol</Link>
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header;
