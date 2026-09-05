"use client";
import { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import './Gate.css';
import { IconClock } from './Icons';

/* ============================================================================
   KAREKOD GECIS EKRANI — bilesenler

   Her parca tek bir isi yapar ve kendi is mantigini tasimaz; karar veren taraf
   her zaman QRCodeRedirect'tir.
   ========================================================================== */

/* ---------------------------------------------------------------------------
   GORUNUM KILIDI

   Mobil tarayicida ekranin yukari kaymasinin tek sebebi var: sabit kutunun
   yuksekligi *duzen* gorunumune (layout viewport) gore hesaplanirken kullanici
   *gorsel* gorunumu (visual viewport) goruyor. Adres cubugu acikken bu ikisi
   arasinda 60-120px fark olur; icerik ortalanir ama ortasi ekranin disina
   duser — "acilista kayik, yenileyince duzgun" sikayeti tam olarak budur.

   Cozum yuksekligi tahmin etmek degil olcmek: `visualViewport` her degistiginde
   gercek yukseklik ve ust kayma CSS degiskenine yazilir. Ayrica belge hicbir
   zaman kaydirilmis birakilmaz; kaydirilacak tek alan ekranin kendi ic kutusu.
--------------------------------------------------------------------------- */
export const useViewportLock = () => {
  /* Klavye durumu yalnizca CSS'e degil React'e de lazim: ekranin ust kenar
     rengi (durum cubugu) klavye acilinca laciverte donmeli. */
  const [kbAcik, setKbAcik] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;

    let raf = 0;
    let sonH = -1;
    let sonW = -1;
    let sonDurum = null;
    let odakVar = false;
    /* Klavye kapaliyken gorulen en buyuk yukseklik. Klavyenin acik oldugu buna
       gore anlasilir; sabit bir esik cihazdan cihaza tutmaz. */
    let tamH = 0;

    const uygula = () => {
      raf = 0;
      const h = Math.round(vv ? vv.height : window.innerHeight);
      const w = Math.round(vv ? vv.width : window.innerWidth);
      /* Yon degisimi yukseklikten degil GENISLIKTEN anlasilir: klavye genisligi
         asla degistirmez, dondurme her zaman degistirir. */
      if (w !== sonW) { sonW = w; tamH = 0; }
      if (h > tamH) tamH = h;

      /*
       * TOPLANMIS DUZEN ODAKLA BIRLIKTE BASLAR
       *
       * Onceki surumde duzen yalnizca olculen yukseklik dustugunde toplaniyordu
       * — yani klavye ACILDIKTAN sonra. O ana kadar girdi ekranin alt yarisinda
       * kaliyor, tarayici da "odaklanani gorunur yap" deyip sayfayi kaydiriyordu.
       * Kaydirmayi sonradan geri almayi denedim; bu sefer ekran yukari-asagi
       * zipladi, cunku tarayiciyla sirayla ayni seyi ters yone cekiyorduk.
       *
       * Dogrusu kaydirmayi geri almak degil, GEREKSIZ kilmak: odak duser dusmez
       * ust bolum toplanir, girdi zaten ekranin ust kismina cikar ve tarayicinin
       * kaydiracak bir sebebi kalmaz. Otomatik odaklanma ile elle dokunma ayni
       * yolu izledigi icin ikisi birebir ayni davranir.
       */
      const acik = odakVar || h < tamH - 120;

      if (h !== sonH) {
        sonH = h;
        root.style.setProperty('--gate-h', `${h}px`);
      }
      if (acik !== sonDurum) {
        sonDurum = acik;
        root.dataset.kb = acik ? '1' : '0';
        setKbAcik(acik);
      }
    };
    const planla = () => { if (!raf) raf = requestAnimationFrame(uygula); };

    /*
     * Kaydirmayi sifirlama YALNIZCA sayfa acilislarinda yapilir; bir kez ve
     * belirli anlarda. Bunu her kaydirma ya da her odaklanma sonrasinda
     * tekrarlamak tarayiciyla kavgaya donusuyor ve ekran zipliyordu.
     */
    const basaAl = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      const kok = document.scrollingElement;
      if (kok && kok.scrollTop !== 0) kok.scrollTop = 0;
      const ic = document.querySelector('.gate__scroll');
      if (ic && ic.scrollTop !== 0) ic.scrollTop = 0;
    };

    uygula();
    basaAl();
    /*
     * Chrome/iOS'ta ust arac cubugu yuklemeden sonra bir sure daha yerine
     * oturuyor; olcum bu pencereyi kapsamazsa yukseklik eksik kaliyor ve ekran
     * kayik aciliyordu. Yeni bos sekmede cubuk zaten oturmus oldugu icin sorun
     * gorunmuyordu — kullanicinin bildirdigi "+ ile acinca duzeliyor" farki.
     */
    const zamanlar = [80, 250, 600, 1000, 1600].map((ms) => setTimeout(() => { uygula(); basaAl(); }, ms));

    /* Odakla toplama yalnizca dokunmatik cihazlarda anlamli: masaustunde girdiye
       tiklamak klavye acmaz, orada armayi gizlemek gereksiz olur. */
    const dokunmatik = window.matchMedia?.('(pointer: coarse)').matches ?? false;

    const gateIcinde = (el) => el && el.closest && el.closest('.gate');
    /* Yalnizca metin girdileri klavye acar. Dugmeleri de saymak, rol secerken
       duzeni parmagin altindan kaydirip tiklamayi dusuruyordu. */
    const yaziAlani = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');

    const odaklandi = (e) => {
      if (!dokunmatik || !yaziAlani(e.target) || !gateIcinde(e.target)) return;
      odakVar = true;
      uygula();                 // beklemeden: kaydirma karari verilmeden once
    };
    /* PIN kutulari arasinda gezerken odak bir an bosa duser; hemen kapatmak
       duzeni titretir. Bir kare bekleyip gercekten cikilmis mi diye bakariz. */
    let cikisZaman = 0;
    const odakCikti = () => {
      clearTimeout(cikisZaman);
      cikisZaman = setTimeout(() => {
        const a = document.activeElement;
        const halaIcerde = a && a !== document.body && yaziAlani(a) && gateIcinde(a);
        if (!halaIcerde) { odakVar = false; uygula(); }
      }, 80);
    };

    vv?.addEventListener('resize', planla);
    vv?.addEventListener('scroll', planla);   // yalnizca olcer, sayfayi ZORLAMAZ
    window.addEventListener('focusin', odaklandi);
    window.addEventListener('focusout', odakCikti);
    window.addEventListener('resize', planla);
    window.addEventListener('orientationchange', planla);
    const geriDonuldu = () => { uygula(); basaAl(); };
    window.addEventListener('pageshow', geriDonuldu);

    return () => {
      zamanlar.forEach(clearTimeout);
      clearTimeout(cikisZaman);
      if (raf) cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', planla);
      vv?.removeEventListener('scroll', planla);
      window.removeEventListener('focusin', odaklandi);
      window.removeEventListener('focusout', odakCikti);
      window.removeEventListener('resize', planla);
      window.removeEventListener('orientationchange', planla);
      window.removeEventListener('pageshow', geriDonuldu);
      root.style.removeProperty('--gate-h');
      delete root.dataset.kb;
    };
  }, []);

  return kbAcik;
};

/* ---------------------------------------------------------------------------
   KENAR RENKLERI

   iOS Safari, durum cubugunu ve alt arac cubugunu sayfanin kenar renklerinden
   boyar: ustu `theme-color` metasi ve kok ogenin zemini, altiysa govdenin
   zemini belirler. Bu ikisi ekrandan ekrana degistigi icin sabit birakilamaz —
   sabit birakildiginda sonuc ekraninin altinda ve ustunde beyaz bantlar
   olusuyordu.
--------------------------------------------------------------------------- */
export const useEdgeColors = (ustRenk, altRenk) => {
  useEffect(() => {
    const kok = document.documentElement;
    kok.style.setProperty('background-color', ustRenk, 'important');
    document.body.style.setProperty('background-color', altRenk, 'important');

    let metalar = [...document.querySelectorAll('meta[name="theme-color"]')];
    if (metalar.length === 0) {
      const m = document.createElement('meta');
      m.name = 'theme-color';
      document.head.appendChild(m);
      metalar = [m];
    }
    const onceki = metalar.map((m) => m.content);
    metalar.forEach((m) => { m.content = ustRenk; });

    return () => { metalar.forEach((m, i) => { m.content = onceki[i]; }); };
  }, [ustRenk, altRenk]);
};

const PAPER = '#f8fafc';
const NAVY = '#1e3a8a';

/* --------------------------------------------------------------------------
   MARKA VARLIKLARI

   Kalkan armasi kurumun asil isaretidir ve her yerde "BGZ Mobil" yazisinin
   ustunde durur. Kaynak 992x1061'lik, beyaz zeminli bir PNG'ydi; dis beyazlik
   tasma-doldurma ile saydama cevrildi (monogramdaki ic beyazliklar korunarak),
   kirpilip 220px'e indirildi — 15 KB.

   Ordek yalnizca beklerken cikar: elinde telefonla "hatta" oldugu icin
   dogrulama adiminin karsiligidir. Kaynak 2.8 MB'lik GIF'ti; 200px / her ucuncu
   kare olarak yeniden kodlandi ve animasyonlu WebP'ye dusuruldu (338 KB).
-------------------------------------------------------------------------- */
export const BrandLogo = ({ size = 76 }) => (
  <picture>
    <source srcSet="/bgz-logo.webp" type="image/webp" />
    <img
      className="gate__logo"
      src="/bgz-logo.png"
      alt=""
      style={{ height: size }}
      decoding="async"
      fetchPriority="high"
    />
  </picture>
);

export const Utya = ({ size = 104 }) => (
  <picture>
    <source srcSet="/utya.webp" type="image/webp" />
    <img
      className="gate__utya"
      src="/utya.gif"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      alt=""
      decoding="async"
    />
  </picture>
);

/* ---------------------------------------------------------------- iskelet */

/** Ust acik bolum + yay + alt lacivert bolum. */
export const GateShell = ({ children, top, seconds }) => {
  const kbAcik = useViewportLock();
  /* Klavye acikken acik zeminli ust bolum tamamen kalkiyor; ekran bastan sona
     lacivert oluyor. Durum cubugu da buna uymali, yoksa tepede rahatsiz eden
     beyaz bir serit kaliyor. */
  useEdgeColors(kbAcik ? NAVY : PAPER, NAVY);
  return (
    <div className="gate">
      {/* Sayac hicbir bolume ait degil: ust bolum gizlense de gorunur kalir. */}
      <Timer seconds={seconds} />
      <div className="gate__scroll">
        {top}
        <div className="gate__bottom">
          <svg className="gate__curve" viewBox="0 0 1440 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0,100 C360,10 1080,10 1440,100 Z" />
          </svg>
          <div className="gate__panel">{children}</div>
        </div>
      </div>
    </div>
  );
};

/** Tek parca lacivert ekran — sonuc ve hata durumlari icin. */
export const GateSolid = ({ children }) => {
  useViewportLock();
  useEdgeColors(NAVY, NAVY);    // bastan sona lacivert
  return (
    <div className="gate gate--solid">
      <div className="gate__scroll">
        <div className="gate__solid-stage">{children}</div>
      </div>
    </div>
  );
};

/** Geri sayim. Ekranin sag ust kosesinde, bolumlerden bagimsiz durur. */
export const Timer = ({ seconds }) => (
  <div className={`gate__timer${seconds <= 10 ? ' gate__timer--urgent' : ''}`} role="timer"
    aria-label={`Kalan süre ${seconds} saniye`}>
    <IconClock size={14} />
    00:{seconds < 10 ? `0${seconds}` : seconds}
  </div>
);

/** Ust bolum: arma ve kurum adi. */
export const GateHeader = () => (
  <div className="gate__top">
    <BrandLogo size={76} />
    <h1 className="gate__brand">BGZ <em>Mobil</em></h1>
    <p className="gate__tagline">Güvenli Geçiş</p>
  </div>
);

/* --------------------------------------------------------------- eylemler */

export const Button = ({ children, variant, loading, ...rest }) => (
  <button
    type={rest.type || 'button'}
    className={`gate__btn${variant ? ` gate__btn--${variant}` : ''}`}
    disabled={loading || rest.disabled}
    {...rest}
  >
    {loading ? <span className="gate__spinner" /> : children}
  </button>
);

/**
 * Form ust satiri: solda geri donus, sagda hangi rolun secildigi.
 *
 * "Ogrenci girisi" baslığı kaldirildi — hemen altindaki "Okul numaraniz" zaten
 * ne yapilacagini soyluyordu. Rol bilgisi kucuk bir rozete indi; ayni bilgiyi
 * daha az yer kaplayarak veriyor.
 */
export const FormBar = ({ onBack, icon, label }) => (
  <div className="gate__formbar">
    <button type="button" className="gate__back" onClick={onBack}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 18 9 12l6-6" />
      </svg>
      Geri
    </button>
    <span className="gate__rol">{icon}{label}</span>
  </div>
);

/** Dort rol, 2x2 duzende. */
export const RoleGrid = ({ roles, onPick }) => (
  <div className="gate__roles">
    {roles.map((r, i) => (
      <button
        key={r.id}
        type="button"
        className={`gate__role gate-in gate-in--${Math.min(5, i + 2)}`}
        onClick={() => onPick(r.id)}
      >
        <r.Ikon size={26} />
        {r.label}
      </button>
    ))}
  </div>
);

/* --------------------------------------------------------------------------
   PIN GIRISI

   Okul numarasi SMS kodu gibi ayri kutulara yazilir. Kutu sayisi disaridan
   gelir (veri tarafinda tum numaralar uc hanelidir).

   Davranis:
     * acilista ilk bos kutuya odaklanir,
     * rakam yazilinca kendiliginden ilerler,
     * geri silme dolu kutuyu bosaltir, bossa bir onceki kutuya gecer,
     * yapistirilan metin tum kutulara dagilir,
     * son hane girilince form kendiliginde gonderilir.
-------------------------------------------------------------------------- */
export const PinInput = ({ length = 3, value, onChange, onComplete, disabled }) => {
  const refs = useRef([]);
  const [aktif, setAktif] = useState(0);
  const haneler = Array.from({ length }, (_, i) => value[i] || '');

  const odakla = useCallback((i) => {
    const k = Math.max(0, Math.min(length - 1, i));
    const el = refs.current[k];
    el?.focus();
    el?.select?.();
    setAktif(k);
  }, [length]);

  // Acilista ve rol degisiminde ilk bos kutu her zaman odakta olsun.
  useLayoutEffect(() => {
    const ilkBos = haneler.findIndex((h) => !h);
    odakla(ilkBos === -1 ? length - 1 : ilkBos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length]);

  const yaz = (i, ham) => {
    const rakam = ham.replace(/\D/g, '');
    if (!rakam) return;

    // Tek hane de olabilir, yapistirilan tam numara da.
    const yeniH = haneler.slice();
    for (let k = 0; k < rakam.length && i + k < length; k++) yeniH[i + k] = rakam[k];
    const sonuc = yeniH.join('');
    onChange(sonuc);

    if (yeniH.every(Boolean) && sonuc.length === length) onComplete?.(sonuc);
    else {
      const sonrakiBos = yeniH.findIndex((h, k) => k > i + rakam.length - 1 && !h);
      odakla(sonrakiBos === -1 ? i + rakam.length : sonrakiBos);
    }
  };

  const tus = (i, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const yeniH = haneler.slice();
      if (yeniH[i]) { yeniH[i] = ''; onChange(yeniH.join('')); odakla(i); }
      else if (i > 0) { yeniH[i - 1] = ''; onChange(yeniH.join('')); odakla(i - 1); }
      return;
    }
    if (e.key === 'ArrowLeft') { e.preventDefault(); odakla(i - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); odakla(i + 1); }
  };

  return (
    <div
      className="gate__pin"
      /* Kutulara degil aralarina dokunuldugunda da odak kaybolmasin. */
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          const ilkBos = haneler.findIndex((h) => !h);
          odakla(ilkBos === -1 ? length - 1 : ilkBos);
        }
      }}
    >
      {haneler.map((h, i) => (
        <div className="gate__pin-slot" key={i} data-aktif={aktif === i} data-filled={Boolean(h)}>
          <input
            ref={(el) => { refs.current[i] = el; }}
            className="gate__pin-cell"
            value={h}
            disabled={disabled}
            onChange={(e) => yaz(i, e.target.value)}
            onKeyDown={(e) => tus(i, e)}
            onFocus={(e) => { e.target.select(); setAktif(i); }}
            type="tel"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={length}
            aria-label={`${i + 1}. hane`}
          />
          {/*
            Rakam ayri bir katmanda cizilir; girdinin kendi metni saydamdir.
            Boylece her yeni hane, kutuyu oynatmadan yerine "zipar" — kutunun
            tamamini olceklemek yerlesimi titretirdi. `key` rakamin kendisidir,
            deger degisince katman yeniden kurulur ve animasyon bastan oynar.
          */}
          {h
            ? <span className="gate__pin-digit" key={h}>{h}</span>
            : <span className="gate__pin-caret" aria-hidden="true" />}
        </div>
      ))}
    </div>
  );
};

/** Ad-soyad alani. Acilista odaga gelir. */
export const NameInput = ({ value, onChange, placeholder, ...rest }) => {
  const ref = useRef(null);
  useLayoutEffect(() => { ref.current?.focus(); }, []);
  return (
    <input
      ref={ref}
      className="gate__input"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      aria-label={placeholder}
      type="text"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="words"
      spellCheck={false}
      enterKeyHint="go"
      {...rest}
    />
  );
};

/* ------------------------------------------------------------------ diger */

export const PersonCard = ({ name, detail, photo, onClick, as = 'button' }) => {
  const Tag = as;
  return (
    <Tag className="gate__person" onClick={onClick} type={as === 'button' ? 'button' : undefined}>
      {photo
        ? <img className="gate__avatar" src={photo} alt="" />
        : <span className="gate__avatar" style={{ display: 'grid', placeItems: 'center', fontWeight: 700 }}>
            {(name || '?').trim().charAt(0).toLocaleUpperCase('tr')}
          </span>}
      <span className="gate__person-txt">
        <span className="gate__person-name">{name}</span>
        {detail && <span className="gate__person-meta">{detail}</span>}
      </span>
    </Tag>
  );
};

export const Note = ({ tone, children }) => (
  <div className={`gate__note${tone === 'danger' ? ' gate__note--danger' : ''}`}
    role={tone === 'danger' ? 'alert' : 'status'}>
    {children}
  </div>
);

export const IconRing = ({ children, tone }) => (
  <div className={`gate__icon-ring${tone === 'danger' ? ' gate__icon-ring--danger' : ''}`}>{children}</div>
);

export const Footer = () => (
  <p className="gate__footer">Boğaziçi Koleji © {new Date().getFullYear()}</p>
);

/* --------------------------------------------------------------------------
   ACILIS PERDESI

   Kisa bir kurum acilisi; ayni zamanda ilk karede yapilan gorunum olcumunu
   gizler. Dort ogenin sirasi hikayeyi anlatir: arma yerine oturur, arkasindan
   bir halka disari acilir, yazi harf araligini toplayarak netlesir, en altta
   ince bir cizgi sureyi doldurur.
-------------------------------------------------------------------------- */
export const GateSplash = () => (
  <div className="gate__splash" aria-hidden="true">
    <div className="gate__splash-in">
      <span className="gate__splash-arma">
        <span className="gate__splash-halka" />
        <span className="gate__splash-halka gate__splash-halka--2" />
        <BrandLogo size={104} />
      </span>
      <h1 className="gate__brand gate__splash-yazi">BGZ <em>Mobil</em></h1>
      <p className="gate__tagline gate__splash-alt">Güvenli Geçiş</p>
      <span className="gate__splash-cizgi"><i /></span>
    </div>
  </div>
);
