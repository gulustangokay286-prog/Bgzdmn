/**
 * Panel tasarım belirteçleri.
 *
 * Bileşenlerden ayrı tutulur; böylece panel.jsx yalnızca bileşen dışa aktarır
 * ve Vite fast refresh dosyayı tam olarak yenileyebilir.
 */

export const cx = (...parts) => parts.filter(Boolean).join(' ');

export const card =
  'bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-xl';

export const hairline = 'border-slate-200 dark:border-white/10';
export const divider = 'divide-slate-200 dark:divide-white/10';

export const eyebrow =
  'text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-500 dark:text-slate-400';

export const control =
  'appearance-none outline-none ring-0 focus:ring-0 border-0 border-none w-full h-9 px-3.5 py-0 rounded-full bg-slate-100 dark:bg-[#1e293b]/60 ' +
  'text-[13.5px] font-normal text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 ' +
  'shadow-none backdrop-blur-none transition-colors ' +
  'focus:bg-white dark:focus:bg-[#1e293b] focus:outline-none focus:ring-0';

export const controlArea =
  'appearance-none outline-none ring-0 focus:ring-0 border-0 border-none w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#1e293b]/60 ' +
  'text-[13.5px] font-normal text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 ' +
  'shadow-none backdrop-blur-none transition-colors leading-relaxed resize-y ' +
  'focus:bg-white dark:focus:bg-[#1e293b] focus:outline-none focus:ring-0';
