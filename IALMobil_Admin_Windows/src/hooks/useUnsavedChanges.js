import { useState, useEffect, useCallback } from 'react';

const useUnsavedChanges = () => {
  const [isDirty, setIsDirty] = useState(false);

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  const markClean = useCallback(() => {
    setIsDirty(false);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'Kaydedilmemiş değişiklikler var. Yine de çıkmak istiyor musunuz?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  return { markDirty, markClean, isDirty };
};

export default useUnsavedChanges;
