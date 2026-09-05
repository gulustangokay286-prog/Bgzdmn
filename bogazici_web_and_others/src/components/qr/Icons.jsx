"use client";

/* ============================================================================
   GUVENLI GECIS — ikonlar

   Site genelindeki dil: 2px kalinliginda, tek renk, ic dolgusuz cizgi ikonlar
   (bkz. ana sayfadaki alan kartlari — deney sisesi, terazi, kitap, kure).
   Hacim, gradyan, golge ve parlama kullanilmaz.
   ========================================================================== */

const cizgi = (size) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
  'aria-hidden': true, style: { display: 'block' }
});

/** Karekod okutma. */
export const IconScan = ({ size = 28 }) => (
  <svg {...cizgi(size)}>
    <path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" />
    <path d="M3 12h18" />
  </svg>
);

/** Kimlik / kendini tanitma. */
export const IconBadge = ({ size = 28 }) => (
  <svg {...cizgi(size)}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <circle cx="8.5" cy="11" r="2.2" />
    <path d="M5 16.2c.7-1.6 2-2.4 3.5-2.4s2.8.8 3.5 2.4M15 10h4M15 14h2.5" />
  </svg>
);

/** Guvenli kayit. */
export const IconShield = ({ size = 28 }) => (
  <svg {...cizgi(size)}>
    <path d="M12 3 20 6v6c0 4.8-3.4 8.4-8 10-4.6-1.6-8-5.2-8-10V6l8-3Z" />
    <path d="m8.8 12.2 2.2 2.2 4.2-4.4" />
  </svg>
);

/** Konum. */
export const IconPin = ({ size = 28 }) => (
  <svg {...cizgi(size)}>
    <path d="M12 21c4-4.6 7-8 7-11.2A7 7 0 0 0 5 9.8C5 13 8 16.4 12 21Z" />
    <circle cx="12" cy="9.8" r="2.6" />
  </svg>
);

/** Sure. */
export const IconClock = ({ size = 28 }) => (
  <svg {...cizgi(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.3l3.4 2" />
  </svg>
);

/** Uyari. */
export const IconAlert = ({ size = 28 }) => (
  <svg {...cizgi(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.2" />
    <circle cx="12" cy="16.4" r="0.6" fill="currentColor" />
  </svg>
);

/** Onay. */
export const IconCheck = ({ size = 28 }) => (
  <svg {...cizgi(size)}>
    <path d="m4.5 12.5 5 5 10-11" />
  </svg>
);

/** Cikis. */
export const IconExit = ({ size = 28 }) => (
  <svg {...cizgi(size)}>
    <path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
    <path d="m16 8 4 4-4 4M20 12h-9" />
  </svg>
);

/** Disari acilan bag. */
export const IconExternal = ({ size = 28 }) => (
  <svg {...cizgi(size)}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
  </svg>
);

/* ----------------------------------------------------------------- roller */

/** Öğrenci — mezuniyet kepi. */
export const IconStudent = ({ size = 26 }) => (
  <svg {...cizgi(size)}>
    <path d="M12 4 2.5 9 12 14l9.5-5L12 4Z" />
    <path d="M6.5 11.2V16c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3v-4.8M21.5 9v5.5" />
  </svg>
);

/** Öğretmen — sunum tahtası. */
export const IconTeacher = ({ size = 26 }) => (
  <svg {...cizgi(size)}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M12 16v4M8.5 20h7M7.5 8.5h6M7.5 12h4" />
  </svg>
);

/** İdare — kurum binası. */
export const IconAdmin = ({ size = 26 }) => (
  <svg {...cizgi(size)}>
    <path d="M3 20h18M4.5 20V9.5L12 4l7.5 5.5V20" />
    <path d="M9.5 20v-5h5v5M9.5 11h5" />
  </svg>
);

/** Veli — büyük ve küçük figür. */
export const IconParent = ({ size = 26 }) => (
  <svg {...cizgi(size)}>
    <circle cx="8.5" cy="6.5" r="3" />
    <path d="M3.5 20v-1.5c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5V20" />
    <circle cx="17.5" cy="11" r="2.2" />
    <path d="M14 20v-1c0-1.9 1.6-3.4 3.5-3.4S21 17.1 21 19v1" />
  </svg>
);
