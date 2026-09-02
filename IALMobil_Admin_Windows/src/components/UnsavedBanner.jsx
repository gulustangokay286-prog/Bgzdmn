import React from 'react';
import { createPortal } from 'react-dom';

const UnsavedBanner = ({ visible, message }) => {
  if (!visible) return null;

  return createPortal(
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none">
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-slate-900/95 dark:bg-white/95 text-white dark:text-slate-900 text-[13px] font-medium shadow-lg backdrop-blur-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
        <span>{message || 'Kaydedilmemiş değişiklikler var'}</span>
      </div>
    </div>,
    document.body
  );
};

export default UnsavedBanner;
