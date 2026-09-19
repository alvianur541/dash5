import { RefObject, useEffect } from 'react';

// Keeps --input-bar-h in sync so the message list never hides behind the input bar.
export function useInputBarHeight(
  barRef: RefObject<HTMLElement | null>,
  hostRef: RefObject<HTMLElement | null>,
  dep: unknown,
): void {
  useEffect(() => {
    const bar = barRef.current;
    const host = hostRef.current;
    if (!bar || !host) return;
    const apply = () => {
      const h = `${Math.ceil(bar.offsetHeight)}px`;
      host.style.setProperty('--input-bar-h', h);
      document.documentElement.style.setProperty('--input-bar-h', h);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [dep]);
}
