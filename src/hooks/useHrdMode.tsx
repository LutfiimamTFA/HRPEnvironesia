'use client';

import { useState, useEffect, useCallback } from 'react';

type HrdMode = 'recruitment' | 'employees';

const isServer = typeof window === 'undefined';

export function useHrdMode() {
  const [mode, setMode] = useState<HrdMode>('recruitment');
  const [isInitialized, setIsInitialized] = useState(isServer);

  useEffect(() => {
    if (isServer) return;
    
    try {
      const storedMode = localStorage.getItem('hrd-mode') as HrdMode;
      if (storedMode && (storedMode === 'recruitment' || storedMode === 'employees')) {
        setMode(storedMode);
      }
    } catch (error) {
      console.warn('localStorage is not available for persisting HRD mode.');
    }
    setIsInitialized(true);
  }, []);

  const handleSetMode = useCallback((newMode: HrdMode) => {
    if (isServer) return;
    
    try {
      localStorage.setItem('hrd-mode', newMode);
    } catch (error) {
       console.warn('localStorage is not available for persisting HRD mode.');
    }
    setMode(newMode);
  }, []);
  
  return { mode, setMode: handleSetMode };
}
