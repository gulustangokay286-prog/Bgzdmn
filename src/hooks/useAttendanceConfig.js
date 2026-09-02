import { useEffect, useState } from 'react';
import { resolveAttendanceConfig } from '../services/attendanceRules';
import { subscribeAttendanceConfig, getCachedAttendanceConfig } from '../services/attendanceService';

const useAttendanceConfig = () => {
  const [config, setConfig] = useState(() => getCachedAttendanceConfig() || resolveAttendanceConfig({}));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = subscribeAttendanceConfig((next) => {
      setConfig(next);
      setReady(true);
    });
    return () => { try { unsub(); } catch {  } };
  }, []);

  return { config, ready };
};

export default useAttendanceConfig;
