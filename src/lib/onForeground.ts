// Re-sync when the app is likely showing stale data: tab/PWA returns, window regains focus, network
// returns, and every `pollMs` while visible (a desktop tab left open never fires visibilitychange).
export function onForeground(cb: () => void, minGapMs = 15_000, pollMs = 60_000): () => void {
  let last = Date.now();
  const run = () => {
    if (document.visibilityState !== 'visible' || Date.now() - last < minGapMs) return;
    last = Date.now();
    cb();
  };
  document.addEventListener('visibilitychange', run);
  window.addEventListener('focus', run);
  window.addEventListener('online', run);
  const timer = pollMs > 0 ? setInterval(run, pollMs) : null;
  return () => {
    document.removeEventListener('visibilitychange', run);
    window.removeEventListener('focus', run);
    window.removeEventListener('online', run);
    if (timer) clearInterval(timer);
  };
}
