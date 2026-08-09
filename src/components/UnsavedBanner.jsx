import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

const UnsavedBanner = ({ visible, message }) => {
  if (!visible) return null;

  return createPortal(
    <div className="fixed top-[130px] left-5 right-[48px] sm:top-auto sm:bottom-6 sm:left-auto sm:right-6 z-[99999] animate-fade-in-up pointer-events-none">
      <div className="flex items-center gap-2 px-3.5 py-2 bg-amber-50 dark:bg-[#1e293b] border border-amber-200 dark:border-amber-500/30 rounded-[16px] shadow-2xl w-full sm:w-auto sm:max-w-[320px] mx-auto sm:mx-0 pointer-events-auto transition-all">
        <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
          <AlertTriangle size={12} className="text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1">
          <span className="text-[11px] font-bold text-amber-800 dark:text-amber-400 block leading-tight">
            {message || 'Kaydedilmemiş değişiklikler var'}
          </span>
          <span className="text-[9.5px] font-medium text-amber-600 dark:text-amber-500/80 leading-tight block mt-0.5">
            Lütfen kaydetmeyi unutmayın.
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default UnsavedBanner;
