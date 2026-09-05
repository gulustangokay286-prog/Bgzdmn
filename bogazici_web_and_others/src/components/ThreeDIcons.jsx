"use client";
import React from "react";

/**
 * Pure Matte 3D Solid Vector Icons (NO GLOW / NO BACKGROUND BOX)
 * Perfectly aligned with the 3D Globe aesthetic.
 */

// 1. Sayısal (MF) - 3D Matte Laboratory Flask & Atom Spheres
export const Icon3DScience = ({ size = 64 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 72 72" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    style={{ overflow: "visible" }}
  >
    <defs>
      {/* 3D Glass Flask Gradient */}
      <linearGradient id="sci_flaskGrad" x1="18" y1="12" x2="54" y2="58" gradientUnits="userSpaceOnUse">
        <stop stopColor="#60A5FA" />
        <stop offset="0.45" stopColor="#2563EB" />
        <stop offset="0.85" stopColor="#1D4ED8" />
        <stop offset="1" stopColor="#1E3A8A" />
      </linearGradient>
      {/* 3D Liquid Interior Gradient */}
      <linearGradient id="sci_liquidGrad" x1="22" y1="36" x2="50" y2="56" gradientUnits="userSpaceOnUse">
        <stop stopColor="#BAE6FD" />
        <stop offset="0.5" stopColor="#38BDF8" />
        <stop offset="1" stopColor="#0284C7" />
      </linearGradient>
      {/* 3D Floating Atom Spheres */}
      <radialGradient id="sci_atomBall1" cx="35%" cy="30%" r="65%">
        <stop stopColor="#93C5FD" />
        <stop offset="0.45" stopColor="#3B82F6" />
        <stop offset="1" stopColor="#1D4ED8" />
      </radialGradient>
      <radialGradient id="sci_atomBall2" cx="35%" cy="30%" r="65%">
        <stop stopColor="#A7F3D0" />
        <stop offset="0.45" stopColor="#10B981" />
        <stop offset="1" stopColor="#047857" />
      </radialGradient>
      {/* 3D Specular Highlight */}
      <radialGradient id="sci_specular" cx="30%" cy="20%" r="50%">
        <stop stopColor="#FFFFFF" stopOpacity="0.85" />
        <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.1" />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* 3D Flask Outer Lip Rim */}
    <ellipse cx="33" cy="11" rx="8" ry="3" fill="#93C5FD" />
    <ellipse cx="33" cy="10" rx="7" ry="2.2" fill="#DBEAFE" />

    {/* 3D Volumetric Flask Body */}
    <path 
      d="M27 12C27 11.5 27.5 11 28 11H38C38.5 11 39 11.5 39 12V24L51.5 48.5C53.2 51.8 50.8 56 47 56H19C15.2 56 12.8 51.8 14.5 48.5L27 24V12Z" 
      fill="url(#sci_flaskGrad)" 
    />

    {/* 3D Liquid Fill inside Flask */}
    <path 
      d="M17.5 48.5L23.5 38C26 40 38 40 41 38L47.5 48.5C48.8 51 47 54.5 44 54.5H21C18 54.5 16.2 51 17.5 48.5Z" 
      fill="url(#sci_liquidGrad)" 
    />

    {/* 3D Bubbles inside Liquid */}
    <circle cx="28" cy="46" r="2.8" fill="#FFFFFF" opacity="0.8" />
    <circle cx="37" cy="44" r="2" fill="#FFFFFF" opacity="0.65" />
    <circle cx="33" cy="50" r="1.5" fill="#FFFFFF" opacity="0.75" />

    {/* 3D Specular Sheen on Glass */}
    <path 
      d="M27 12C27 11.5 27.5 11 28 11H38C38.5 11 39 11.5 39 12V24L51.5 48.5C53.2 51.8 50.8 56 47 56H19C15.2 56 12.8 51.8 14.5 48.5L27 24V12Z" 
      fill="url(#sci_specular)" 
    />

    {/* Floating 3D Atom Particle Spheres */}
    <circle cx="56" cy="20" r="7" fill="url(#sci_atomBall1)" />
    <circle cx="54" cy="18" r="2.5" fill="#FFFFFF" opacity="0.85" />

    <circle cx="58" cy="38" r="5" fill="url(#sci_atomBall2)" />
    <circle cx="57" cy="36.5" r="1.8" fill="#FFFFFF" opacity="0.85" />

    <circle cx="12" cy="32" r="4.5" fill="url(#sci_atomBall1)" />
    <circle cx="11" cy="30.5" r="1.5" fill="#FFFFFF" opacity="0.8" />
  </svg>
);

// 2. Eşit Ağırlık (TM) - 3D Matte Justice Balance & Pillar
export const Icon3DJustice = ({ size = 64 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 72 72" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    style={{ overflow: "visible" }}
  >
    <defs>
      <linearGradient id="jus_pillar" x1="28" y1="12" x2="44" y2="60" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FBBF24" />
        <stop offset="0.5" stopColor="#D97706" />
        <stop offset="1" stopColor="#78350F" />
      </linearGradient>
      <linearGradient id="jus_beam" x1="12" y1="18" x2="60" y2="26" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FDE68A" />
        <stop offset="0.4" stopColor="#F59E0B" />
        <stop offset="0.8" stopColor="#D97706" />
        <stop offset="1" stopColor="#92400E" />
      </linearGradient>
      <radialGradient id="jus_dish" cx="35%" cy="30%" r="65%">
        <stop stopColor="#FEF08A" />
        <stop offset="0.4" stopColor="#F59E0B" />
        <stop offset="0.85" stopColor="#B45309" />
        <stop offset="1" stopColor="#78350F" />
      </radialGradient>
      <radialGradient id="jus_finial" cx="35%" cy="30%" r="65%">
        <stop stopColor="#FEF3C7" />
        <stop offset="0.5" stopColor="#F59E0B" />
        <stop offset="1" stopColor="#92400E" />
      </radialGradient>
      <radialGradient id="jus_spec" cx="30%" cy="25%" r="50%">
        <stop stopColor="#FFFFFF" stopOpacity="0.8" />
        <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* 3D Base Pedestal */}
    <ellipse cx="36" cy="58" rx="18" ry="5" fill="url(#jus_pillar)" />
    <ellipse cx="36" cy="56.5" rx="15" ry="3.5" fill="url(#jus_beam)" />

    {/* 3D Central Column */}
    <rect x="33.5" y="16" width="5" height="41" rx="2.5" fill="url(#jus_pillar)" />

    {/* 3D Top Sphere Finial */}
    <circle cx="36" cy="15" r="5.5" fill="url(#jus_finial)" />
    <circle cx="36" cy="15" r="5.5" fill="url(#jus_spec)" />

    {/* 3D Main Balance Crossbeam */}
    <path 
      d="M13 21C13 19.5 14.5 18.5 16 18.8L36 21.5L56 18.8C57.5 18.5 59 19.5 59 21C59 22.5 57.5 23.5 56 23.2L36 20.5L16 23.2C14.5 23.5 13 22.5 13 21Z" 
      fill="url(#jus_beam)" 
    />
    <circle cx="36" cy="21" r="3.5" fill="url(#jus_finial)" />
    <circle cx="36" cy="21" r="3.5" fill="url(#jus_spec)" />

    {/* Left 3D Dish & Strings */}
    <line x1="17" y1="22" x2="11" y2="38" stroke="#92400E" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="17" y1="22" x2="23" y2="38" stroke="#92400E" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M9 38C9 44 12.5 47 17 47C21.5 47 25 44 25 38H9Z" fill="url(#jus_dish)" />
    <ellipse cx="17" cy="38" rx="8" ry="2.5" fill="url(#jus_beam)" />

    {/* Right 3D Dish & Strings */}
    <line x1="55" y1="22" x2="49" y2="38" stroke="#92400E" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="55" y1="22" x2="61" y2="38" stroke="#92400E" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M47 38C47 44 50.5 47 55 47C59.5 47 63 44 63 38H47Z" fill="url(#jus_dish)" />
    <ellipse cx="55" cy="38" rx="8" ry="2.5" fill="url(#jus_beam)" />
  </svg>
);

// 3. Sözel (TS) - 3D Matte Book & Bookmark
export const Icon3DLiterature = ({ size = 64 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 72 72" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    style={{ overflow: "visible" }}
  >
    <defs>
      <linearGradient id="lit_cover" x1="10" y1="16" x2="62" y2="58" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F87171" />
        <stop offset="0.4" stopColor="#EF4444" />
        <stop offset="0.8" stopColor="#DC2626" />
        <stop offset="1" stopColor="#991B1B" />
      </linearGradient>
      <linearGradient id="lit_pages" x1="16" y1="18" x2="56" y2="48" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFFFFF" />
        <stop offset="0.6" stopColor="#FEE2E2" />
        <stop offset="1" stopColor="#FECACA" />
      </linearGradient>
      <linearGradient id="lit_ribbon" x1="32" y1="12" x2="40" y2="54" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FDE047" />
        <stop offset="0.5" stopColor="#F59E0B" />
        <stop offset="1" stopColor="#B45309" />
      </linearGradient>
      <radialGradient id="lit_spec" cx="30%" cy="20%" r="50%">
        <stop stopColor="#FFFFFF" stopOpacity="0.8" />
        <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* 3D Hardcover */}
    <path 
      d="M36 53C27 49 15 50 8 54V21C15 17 27 16 36 20C45 16 57 17 64 21V54C57 50 45 49 36 53Z" 
      fill="url(#lit_cover)" 
    />

    {/* 3D Volumetric Pages Slab */}
    <path 
      d="M36 49C28 45.5 17 46.5 11 50V19C17 16 28 15 36 18C44 15 55 16 61 19V50C55 46.5 44 45.5 36 49Z" 
      fill="url(#lit_pages)" 
    />

    {/* 3D Spine */}
    <path d="M36 18V49" stroke="#B91C1C" strokeWidth="2.5" strokeLinecap="round" />

    {/* 3D Page Accent Lines */}
    <line x1="18" y1="27" x2="29" y2="24.5" stroke="#F87171" strokeWidth="2" strokeLinecap="round" />
    <line x1="18" y1="34" x2="30" y2="31.5" stroke="#F87171" strokeWidth="2" strokeLinecap="round" />
    <line x1="18" y1="41" x2="28" y2="38.5" stroke="#F87171" strokeWidth="2" strokeLinecap="round" />

    <line x1="43" y1="24.5" x2="54" y2="27" stroke="#F87171" strokeWidth="2" strokeLinecap="round" />
    <line x1="42" y1="31.5" x2="54" y2="34" stroke="#F87171" strokeWidth="2" strokeLinecap="round" />
    <line x1="44" y1="38.5" x2="54" y2="41" stroke="#F87171" strokeWidth="2" strokeLinecap="round" />

    {/* 3D Golden Bookmark Ribbon */}
    <path d="M34 18V36L36 33L38 36V18H34Z" fill="url(#lit_ribbon)" />
  </svg>
);

// 4. Yabancı Dil (DİL) - 3D Matte Globe Sphere
export const Icon3DGlobe = ({ size = 64 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 72 72" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    style={{ overflow: "visible" }}
  >
    <defs>
      <radialGradient id="lang_globeSphere" cx="35%" cy="30%" r="65%">
        <stop stopColor="#6EE7B7" />
        <stop offset="0.4" stopColor="#10B981" />
        <stop offset="0.8" stopColor="#059669" />
        <stop offset="1" stopColor="#064E3B" />
      </radialGradient>
      <linearGradient id="lang_continents" x1="16" y1="16" x2="56" y2="56" gradientUnits="userSpaceOnUse">
        <stop stopColor="#A7F3D0" />
        <stop offset="1" stopColor="#34D399" />
      </linearGradient>
      <radialGradient id="lang_globeSpec" cx="30%" cy="25%" r="50%">
        <stop stopColor="#FFFFFF" stopOpacity="0.8" />
        <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.1" />
        <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="lang_speech" x1="40" y1="8" x2="62" y2="24" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFFFFF" />
        <stop offset="1" stopColor="#ECFDF5" />
      </linearGradient>
    </defs>

    {/* 3D Outer Orbital Ring */}
    <ellipse cx="36" cy="36" rx="32" ry="10" transform="rotate(-25 36 36)" stroke="#10B981" strokeWidth="2.5" strokeOpacity="0.45" strokeDasharray="30 10" strokeLinecap="round" />

    {/* 3D Volumetric Globe Sphere */}
    <circle cx="36" cy="36" r="22" fill="url(#lang_globeSphere)" />

    {/* 3D Continents Topography */}
    <path d="M25 28C28 24 35 25 37 29C39 33 34 37 30 36C26 35 23 32 25 28Z" fill="url(#lang_continents)" />
    <path d="M40 40C44 38 48 41 47 45C46 49 41 51 37 48C33 45 35 42 40 40Z" fill="url(#lang_continents)" />
    <path d="M22 42C25 40 29 42 28 45C27 48 24 49 22 47C20 45 20 43 22 42Z" fill="url(#lang_continents)" />

    {/* 3D Longitude / Latitude Curves */}
    <ellipse cx="36" cy="36" rx="11" ry="22" stroke="#047857" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.35" />
    <ellipse cx="36" cy="36" rx="22" ry="8" stroke="#047857" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.35" />

    {/* 3D Specular Highlight */}
    <circle cx="36" cy="36" r="22" fill="url(#lang_globeSpec)" />

    {/* 3D Speech Bubble */}
    <g>
      <rect x="43" y="9" width="20" height="14" rx="7" fill="url(#lang_speech)" stroke="#D1FAE5" strokeWidth="1" />
      <path d="M48 23L46 26L51 23H48Z" fill="url(#lang_speech)" />
      <circle cx="49" cy="16" r="1.5" fill="#059669" />
      <circle cx="53" cy="16" r="1.5" fill="#10B981" />
      <circle cx="57" cy="16" r="1.5" fill="#34D399" />
    </g>
  </svg>
);
