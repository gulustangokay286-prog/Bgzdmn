import React from 'react';
import { ChevronsUpDown, X } from 'lucide-react';
import { cx, card, hairline, divider, control, controlArea } from './tokens';

export const Panel = ({ className = '', children, ...rest }) => (
  <section className={cx(card, 'flex flex-col min-w-0', className)} {...rest}>
    {children}
  </section>
);

export const PanelHeader = ({ title, description, children, className = '' }) => (
  <header
    className={cx(
      'flex items-center justify-between gap-4 px-5 py-3.5 border-b',
      hairline,
      className
    )}
  >
    <div className="min-w-0">
      <h2 className="m-0 text-[14px] font-semibold text-slate-900 dark:text-white tracking-[-0.01em] truncate">
        {title}
      </h2>
      {description && (
        <p className="m-0 mt-0.5 text-[12px] text-slate-500 dark:text-slate-400 truncate">
          {description}
        </p>
      )}
    </div>
    {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
  </header>
);

export const PanelFooter = ({ children, className = '' }) => (
  <footer
    className={cx(
      'flex items-center justify-between gap-4 px-5 py-3 border-t bg-slate-50/60 dark:bg-white/[0.02] rounded-b-xl',
      hairline,
      className
    )}
  >
    {children}
  </footer>
);

export const StatStrip = ({ className = '', children }) => (
  <div className={cx('flex flex-col sm:flex-row divide-y sm:divide-y-0', divider, card, className)}>
    {children}
  </div>
);

export const Stat = ({ label, value, hint, tone = 'default', last = false }) => (
  <div className={cx('flex-1 min-w-0 px-5 py-3.5', !last && 'sm:border-r', !last && hairline)}>
    <div className="text-[11.5px] text-slate-500 dark:text-slate-400 truncate">{label}</div>
    <div
      className={cx(
        'mt-1 text-[20px] leading-none font-semibold tnum tracking-[-0.02em]',
        tone === 'danger' && 'text-[#991b1b] dark:text-rose-400',
        tone === 'success' && 'text-emerald-600 dark:text-emerald-400',
        tone === 'default' && 'text-slate-900 dark:text-white'
      )}
    >
      {value}
    </div>
    {hint && <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">{hint}</div>}
  </div>
);

export const Segmented = ({ value, onChange, options, className = '' }) => (
  <div
    className={cx(
      'inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-white/[0.06]',
      className
    )}
  >
    {options.map((option) => {
      const isActive = value === option.id;
      return (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cx(
            'h-8 px-3 rounded-md text-[12.5px] font-medium whitespace-nowrap transition-colors',
            isActive
              ? 'bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          )}
        >
          {option.label}
          {option.count !== undefined && <span className="ml-1.5 tnum opacity-55">{option.count}</span>}
        </button>
      );
    })}
  </div>
);

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 h-9 px-3.5 rounded-lg text-[13px] font-medium ' +
  'whitespace-nowrap transition-colors disabled:opacity-45 disabled:pointer-events-none cursor-pointer';

const BUTTON_VARIANTS = {
  primary: 'bg-[#991b1b] hover:bg-[#7f1d1d] text-white',
  secondary:
    'bg-white dark:bg-white/[0.04] text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-white/12 ' +
    'hover:bg-slate-50 dark:hover:bg-white/[0.08]',
  ghost:
    'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white ' +
    'hover:bg-slate-100 dark:hover:bg-white/[0.06]',
  danger: 'bg-rose-600 hover:bg-rose-700 text-white',
  quiet:
    'text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 ' +
    'hover:bg-rose-50 dark:hover:bg-rose-500/10'
};

export const Button = ({ variant = 'secondary', className = '', icon: Icon, children, ...rest }) => (
  <button className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} {...rest}>
    {Icon && <Icon size={15} strokeWidth={1.9} />}
    {children}
  </button>
);

export const IconButton = ({ label, icon: Icon, className = '', variant = 'ghost', ...rest }) => (
  <button
    title={label}
    aria-label={label}
    className={cx(
      'inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors cursor-pointer',
      BUTTON_VARIANTS[variant],
      className
    )}
    {...rest}
  >
    <Icon size={15} strokeWidth={1.9} />
  </button>
);

export const FieldRows = ({ children, className = '' }) => (
  <div className={cx('divide-y', divider, className)}>{children}</div>
);

export const Field = ({ label, hint, htmlFor, children, stacked = false }) => (
  <div
    className={cx(
      'px-5 py-4 gap-2',
      stacked ? 'flex flex-col' : 'grid grid-cols-1 md:grid-cols-[210px_minmax(0,1fr)] md:gap-6 md:items-start'
    )}
  >
    <div className="md:pt-2">
      <label
        htmlFor={htmlFor}
        className="block text-[13px] font-medium text-slate-800 dark:text-slate-200 leading-tight"
      >
        {label}
      </label>
      {hint && (
        <p className="m-0 mt-1 text-[11.5px] leading-snug text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
    <div className="min-w-0">{children}</div>
  </div>
);

export const Input = ({ className = '', ...rest }) => (
  <input className={cx(control, className)} {...rest} />
);

export const Textarea = ({ className = '', ...rest }) => (
  <textarea className={cx(controlArea, className)} {...rest} />
);

export const Select = ({ className = '', dense = false, children, ...rest }) => (
  <div className="relative w-full">
    <select
      className={cx(dense ? control.replace('h-9', 'h-8') : control, 'cursor-pointer pr-8 appearance-none', className)}
      {...rest}
    >
      {children}
    </select>
    <ChevronsUpDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
  </div>
);

export const Switch = ({ checked, onChange, label, description, id }) => (
  <label htmlFor={id} className="flex items-start gap-3 cursor-pointer select-none">
    <span
      className={cx(
        'relative mt-0.5 w-[38px] h-[22px] rounded-full shrink-0 transition-colors',
        checked ? 'bg-[#991b1b]' : 'bg-slate-300 dark:bg-white/15'
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="sr-only absolute opacity-0 w-0 h-0 p-0 m-0 border-0"
      />
      <span
        className={cx(
          'absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-all',
          checked ? 'left-[19px]' : 'left-[3px]'
        )}
      />
    </span>
    {(label || description) && (
      <span className="min-w-0">
        {label && (
          <span className="block text-[13px] font-medium text-slate-800 dark:text-slate-200">{label}</span>
        )}
        {description && (
          <span className="block text-[11.5px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
            {description}
          </span>
        )}
      </span>
    )}
  </label>
);

const BADGE_TONES = {
  neutral: 'bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10',
  success: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20',
  warning: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
  danger: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20',
  accent: 'bg-[#991b1b]/[0.07] dark:bg-rose-500/10 text-[#991b1b] dark:text-rose-300 border-[#991b1b]/20 dark:border-rose-500/20'
};

export const Badge = ({ tone = 'neutral', variant, className = '', children }) => {
  const selectedTone = variant || tone;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11.5px] font-medium whitespace-nowrap',
        BADGE_TONES[selectedTone] || BADGE_TONES.neutral,
        className
      )}
    >
      {children}
    </span>
  );
};

export const Dot = ({ tone = 'neutral' }) => {
  const tones = {
    neutral: 'bg-slate-400',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    accent: 'bg-[#991b1b] dark:bg-rose-400'
  };
  return <span className={cx('w-1.5 h-1.5 rounded-full shrink-0', tones[tone])} />;
};

export const EmptyState = ({ icon: Icon, title, description, action, className = '' }) => (
  <div className={cx('flex-1 flex flex-col items-center justify-center text-center px-8 py-20', className)}>
    {Icon && (
      <div className="w-14 h-14 rounded-2xl border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-5">
        <Icon size={26} strokeWidth={1.5} />
      </div>
    )}
    <h3 className="m-0 text-[16px] font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
    {description && (
      <p className="m-0 mt-2 max-w-md text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
        {description}
      </p>
    )}
    {action && <div className="mt-6">{action}</div>}
  </div>
);

/**
 * Bildirim seridi.
 *
 * Kapandiktan sonra da bir sure DOM'da kalir ki cikis animasyonu oynayabilsin.
 * Renk yalnizca hata durumunda kullanilir; basarili islemde metnin kendisi
 * zaten yeterlidir, ayrica bir gosterge noktasina gerek yoktur.
 */
export const Toast = ({ open, message, tone = 'success' }) => {
  const [mounted, setMounted] = React.useState(open);
  const [text, setText] = React.useState(message);

  React.useEffect(() => {
    if (open) {
      setText(message);
      setMounted(true);
      return undefined;
    }
    const t = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(t);
  }, [open, message]);

  if (!mounted) return null;

  const isError = tone === 'error' || tone === 'danger';

  return (
    <div className="fixed bottom-7 left-1/2 z-[9999] pointer-events-none -translate-x-1/2">
      <div
        className={cx(
          'panel-toast flex items-center gap-2 pl-3.5 pr-4 h-10 rounded-full',
          'text-[13px] font-medium tracking-[-0.005em] whitespace-nowrap',
          'shadow-[0_8px_28px_-6px_rgba(15,23,42,0.35)] ring-1',
          open ? 'panel-toast-in' : 'panel-toast-out',
          isError
            ? 'bg-[#7f1d1d] text-rose-50 ring-white/10'
            : 'bg-slate-900 text-slate-50 ring-white/10 dark:bg-white dark:text-slate-900 dark:ring-black/10'
        )}
      >
        {isError && (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 opacity-90">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16.5v.01" />
          </svg>
        )}
        <span>{text}</span>
      </div>
    </div>
  );
};

export const Modal = ({ open, onClose, title, description, footer, width = 'max-w-xl', children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 dark:bg-black/60 backdrop-blur-[2px]">
      <div
        className={cx(
          'w-full flex flex-col max-h-[88vh] rounded-2xl overflow-hidden',
          'bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 shadow-2xl',
          width
        )}
      >
        <header className={cx('flex items-start justify-between gap-4 px-5 py-4 border-b shrink-0', hairline)}>
          <div className="min-w-0">
            <h3 className="m-0 text-[15px] font-semibold text-slate-900 dark:text-white tracking-[-0.01em]">
              {title}
            </h3>
            {description && (
              <p className="m-0 mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="w-8 h-8 -mr-1 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors shrink-0"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overflow-x-hidden panel-scroll min-h-0">{children}</div>

        {footer && (
          <footer className={cx('flex items-center justify-end gap-2 px-5 py-3.5 border-t shrink-0 bg-slate-50/60 dark:bg-white/[0.02]', hairline)}>
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};
export const ImagePicker = ({ value, onChange, className = '' }) => {
  const [urlInput, setUrlInput] = React.useState(value || '');

  React.useEffect(() => {
    setUrlInput(value || '');
  }, [value]);

  const handleApply = () => {
    onChange(urlInput.trim());
  };

  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-3">
        {value ? (
          <img
            src={value}
            alt=""
            referrerPolicy="no-referrer"
            className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-white/10 shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg border border-dashed border-slate-300 dark:border-white/20 flex items-center justify-center text-slate-400 shrink-0">
            <span className="text-[10px] text-center">Görsel Yok</span>
          </div>
        )}
        <div className="flex-1 flex gap-1.5">
          <Input
            type="url"
            placeholder="Görsel bağlantısı (URL)..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onBlur={handleApply}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleApply();
              }
            }}
          />
          {value && (
            <IconButton
              label="Görseli Kaldır"
              icon={X}
              variant="quiet"
              onClick={() => {
                setUrlInput('');
                onChange('');
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

