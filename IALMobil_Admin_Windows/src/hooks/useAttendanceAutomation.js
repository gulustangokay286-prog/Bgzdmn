import { useEffect, useRef, useState } from 'react';
import {
  runAttendanceAutomation,
  tryAcquireAutomationLease,
  loadAttendanceConfig
} from '../services/attendanceService';
import { getDateKeyInTimeZone, getMinutesInTimeZone, minutesToTime } from '../services/attendanceRules';

const TICK_MS = 60_000; // dakikada bir

/**
 * Otomatik yoklama motoru (arka plan görevi).
 *
 * IALMobil Admin Windows açık olduğu sürece dakikada bir çalışır ve:
 *   • 12:10'da sabah okutup çıkış okutmayanlara otomatik çıkış verir
 *   • 12:00'de sabah gelmeyenlere yarım gün yok yazar
 *   • Okul çıkış saatinde (kurum ayarlarından) hiç gelmeyenlere ikinci yarım
 *     günü yazarak tam gün yok'a tamamlar
 *
 * Tüm yazmalar deterministik döküman kimliği kullandığı için birden fazla panel
 * açık olsa bile mükerrer devamsızlık oluşmaz.
 */
const useAttendanceAutomation = (enabled = true) => {
  const [lastRun, setLastRun] = useState(null);
  const runningRef = useRef(false);
  const ownerIdRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    // Bu panele özgü kiralama kimliği (render sırasında değil, efekt içinde üretilir).
    if (!ownerIdRef.current) {
      ownerIdRef.current = `admin_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
    }

    const tick = async () => {
      if (cancelled || runningRef.current) return;
      runningRef.current = true;
      try {
        const config = await loadAttendanceConfig(true);
        const now = new Date();
        const dateKey = getDateKeyInTimeZone(now, config.timeZone);
        const nowMinutes = getMinutesInTimeZone(now, config.timeZone);

        const gotLease = await tryAcquireAutomationLease(ownerIdRef.current);
        if (!gotLease) {
          if (!cancelled) {
            setLastRun(prev => ({
              ...(prev || {}),
              dateKey,
              time: minutesToTime(nowMinutes),
              skipped: 'Başka bir panel bu turu işliyor.'
            }));
          }
          return;
        }

        const result = await runAttendanceAutomation({ now, config });
        if (!cancelled) setLastRun(result);

        if (result.absencesWritten || result.autoExits) {
          console.info(
            `[Yoklama Otomasyonu ${result.time}] ` +
            `${result.autoExits} otomatik çıkış, ${result.absencesWritten} devamsızlık kaydı işlendi.`
          );
        }
        if (result.errors?.length) {
          console.warn('[Yoklama Otomasyonu] Hatalar:', result.errors.slice(0, 5));
        }
      } catch (err) {
        console.error('[Yoklama Otomasyonu] Tur hatası:', err?.message);
      } finally {
        runningRef.current = false;
      }
    };

    // Panel açılır açılmaz bir kez çalış (gün içinde geç açıldıysa telafi eder)
    tick();
    const id = setInterval(tick, TICK_MS);

    // Bilgisayar uykudan döndüğünde / sekmeye geri gelindiğinde hemen kontrol et
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  return lastRun;
};

export default useAttendanceAutomation;
