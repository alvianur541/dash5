export function relativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'Baru saja';
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Kemarin';
  if (d < 7) return `${d} hari lalu`;
  return new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
