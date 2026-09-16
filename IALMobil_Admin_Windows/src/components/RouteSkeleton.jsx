import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { yuklemeDinle, bekleyenIstekSayisi } from '../services/api';
import { cx } from './ui/tokens';

/**
 * EKRAN GECISINDE ISKELET.
 *
 * Menuden bir ekrana gecildiginde ekran once bos gorunuyordu; veri gelene
 * kadar bir sey yoktu. Artik gecis aninda icerik alaninin ustune iskelet
 * biner ve ekranin ilk istekleri (api.js'in acik istek sayaci) bitince
 * kalkar. Sahte gecikme yoktur: istek yoksa 250 ms'de, en gec 4 sn'de kalkar.
 */
const EN_AZ_MS = 250;
const EN_COK_MS = 4000;

const Kutu = ({ className = '' }) => (
  <div className={cx('rounded-lg bg-slate-200/80 dark:bg-white/[0.07] animate-pulse', className)} />
);

export function SkeletonIcerik() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2.5"><Kutu className="h-7 w-52" /><Kutu className="h-3.5 w-80 max-w-[60vw]" /></div>
        <Kutu className="h-9 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Kutu key={i} className="h-[74px]" />)}
      </div>
      <div className="rounded-2xl border border-slate-200/80 p-5 dark:border-white/10">
        <div className="mb-4 flex items-center justify-between"><Kutu className="h-4 w-44" /><Kutu className="h-8 w-28" /></div>
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Kutu className="h-9 w-9 rounded-full" />
              <div className="flex flex-1 flex-col gap-2"><Kutu className="h-3.5 w-1/3" /><Kutu className="h-3 w-1/2" /></div>
              <Kutu className="h-6 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RouteSkeleton({ children }) {
  const { pathname } = useLocation();
  // Gecis durumu yola bagli tutulur: yol degisince iskelet render aninda acilir,
  // effect icinde setState'e gerek kalmaz.
  const [kapananYol, setKapananYol] = useState('');
  const gecis = kapananYol !== pathname;
  const baslangic = useRef(0);

  useEffect(() => {
    baslangic.current = Date.now();
    let zamanlayici = null;
    let bitti = false;
    const kapat = () => { if (bitti) return; bitti = true; clearTimeout(zamanlayici); setKapananYol(pathname); };
    const degerlendir = (bekleyen) => {
      if (bitti) return;
      const gecen = Date.now() - baslangic.current;
      if (gecen >= EN_COK_MS) return kapat();
      if (bekleyen === 0) {
        // Ekranin ilk istekleri bitti; en az sureyi doldurup kaldir.
        clearTimeout(zamanlayici);
        zamanlayici = setTimeout(kapat, Math.max(0, EN_AZ_MS - gecen));
      } else {
        clearTimeout(zamanlayici);
      }
    };
    const birak = yuklemeDinle(degerlendir);
    // Ekran effect'leri bu render'dan sonra istek acar; ilk kararı bir tik geciktir.
    const ilk = setTimeout(() => degerlendir(bekleyenIstekSayisi()), 60);
    const enCok = setTimeout(kapat, EN_COK_MS);
    return () => { bitti = true; birak(); clearTimeout(ilk); clearTimeout(enCok); clearTimeout(zamanlayici); };
  }, [pathname]);

  return (
    <>
      {children}
      {gecis && (
        <div className="absolute inset-0 z-30 overflow-hidden bg-[var(--bg-base)] px-4 pt-4 md:p-8" role="status" aria-label="Yükleniyor">
          <SkeletonIcerik />
        </div>
      )}
    </>
  );
}
