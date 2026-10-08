
export function purgeStaleAnswerCaches(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const akar = ['dash-ans', 'dash-sem'];
    const buang: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!akar.some(a => k.startsWith(a))) continue;

      buang.push(k);
    }
    for (const k of buang) localStorage.removeItem(k);
    if (buang.length) console.info('[cache] %d entri jawaban lama dihapus', buang.length);
  } catch { }
}
