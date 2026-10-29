export function trackVisualViewport(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const sync = () => {
    if (vv.scale > 1.01) return;
    root.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
    if (vv.offsetTop > 0 || window.scrollY > 0) window.scrollTo(0, 0);
  };
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();
}
