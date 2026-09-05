"use client";
import { useEffect } from 'react';

export default function GlobalKeyboardHandler() {
  useEffect(() => {
    let scrollYBeforeFocus = 0;

    const handleFocusIn = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
        scrollYBeforeFocus = window.scrollY;
      }
    };

    const handleFocusOut = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
        setTimeout(() => {
          const active = document.activeElement;
          const isStillInInput = active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA');
          if (!isStillInInput) {
            window.scrollTo({ top: scrollYBeforeFocus, behavior: 'smooth' });
          }
        }, 150);
      }
    };

    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);

    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  return null;
}
