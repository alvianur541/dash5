export function onForeground(cb: () => void, minGapMs = 60_000): () => void {
  let last = Date.now();
  const handler = () => {
    if (document.visibilityState !== 'visible' || Date.now() - last < minGapMs) return;
    last = Date.now();
    cb();
  };
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
