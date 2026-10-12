// iOS keeps the layout viewport full-height under the keyboard, so size the app to what is actually visible.
export function trackVisualViewport(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const sync = () => {
    if (vv.scale > 1.01) return;
    root.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
    if (vv.offsetTop > 0 || window.scrollY > 0) window.scrollTo(0, 0);
  };
  // iOS ignores user-scalable=no in Safari; block pinch gestures directly.
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();
}
