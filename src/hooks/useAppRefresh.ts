import { useCallback, useState } from 'react';

export function useAppRefresh() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting || reg.installing) {
          await new Promise<void>(resolve => {
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
            setTimeout(resolve, 3000);
          });
        }
      }
    } catch { }
    window.location.reload();
  }, [isRefreshing]);

  return { isRefreshing, refresh };
}
