import { useState, useEffect, useRef } from 'react';

export function useNetwork() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOffline, setShowOffline] = useState(false);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const wasOfflineRef = useRef(false);
  const offlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false);
      wasOfflineRef.current = true;
      setShowBackOnline(false);
      setShowOffline(true);
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
      offlineTimerRef.current = setTimeout(() => setShowOffline(false), 4000);
    };

    const handleOnline = () => {
      setIsOnline(true);
      setShowOffline(false);
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
      if (wasOfflineRef.current) {
        setShowBackOnline(true);
        if (onlineTimerRef.current) clearTimeout(onlineTimerRef.current);
        onlineTimerRef.current = setTimeout(() => {
          setShowBackOnline(false);
          wasOfflineRef.current = false;
        }, 3500);
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
      if (onlineTimerRef.current) clearTimeout(onlineTimerRef.current);
    };
  }, []);

  return { isOnline, showOffline, showBackOnline };
}
