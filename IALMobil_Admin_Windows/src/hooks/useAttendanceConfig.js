import { useEffect, useState } from 'react';
import { resolveAttendanceConfig } from '../services/attendanceRules';
import { subscribeAttendanceConfig, getCachedAttendanceConfig } from '../services/attendanceService';

/**
 * Kurum yoklama ayarlarını canlı olarak dinler.
 * Kurum Ayarları ekranından okul çıkış saati değiştirildiği anda, bu hook'u
 * kullanan tüm ekranlar (devamsızlık raporu, geçiş yönetimi, otomasyon)
 * yeni saate göre çalışmaya başlar.
 */
const useAttendanceConfig = () => {
  const [config, setConfig] = useState(() => getCachedAttendanceConfig() || resolveAttendanceConfig({}));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = subscribeAttendanceConfig((next) => {
      setConfig(next);
      setReady(true);
    });
    return () => { try { unsub(); } catch { /* yok say */ } };
  }, []);

  return { config, ready };
};

export default useAttendanceConfig;
