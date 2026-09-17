import { useCallback, useRef, useState } from 'react';

const SWIPE_MIN_DX = 70;
const SWIPE_MAX_DY = 60;
const SWIPE_MAX_MS = 600;
const SWIPE_EDGE = 40;

export function useSwipeSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(() => window.innerWidth < 768);
  const swipeRef = useRef<{ x: number; y: number; t: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    swipeRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s || window.innerWidth >= 768) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Date.now() - s.t > SWIPE_MAX_MS || Math.abs(dy) > SWIPE_MAX_DY || Math.abs(dx) < SWIPE_MIN_DX) return;
    if (dx > 0 && s.x < SWIPE_EDGE) setIsCollapsed(false);
    if (dx < 0) setIsCollapsed(true);
  }, []);

  return { isCollapsed, setIsCollapsed, onTouchStart, onTouchEnd };
}
