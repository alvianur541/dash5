// Generasi cache jawaban sisi-klien. Naikkan angkanya setiap kali mengubah hal yang
// MENGUBAH ISI JAWABAN (retrieval, SYSTEM_PROMPT, format output) — kalau tidak, user lama
// tetap dilayani jawaban versi sebelumnya sampai TTL 3 hari habis.
// Tidak perlu dinaikkan untuk perubahan UI/CSS/telemetri.
export const CACHE_GEN = 8;

export const ANSWER_CACHE_PREFIX = `dash-ans-g${CACHE_GEN}:`;

/** Hapus entri cache generasi lama (termasuk cache semantik yang sudah dibuang). */
export function purgeStaleAnswerCaches(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const akar = ['dash-ans', 'dash-sem'];
    const buang: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!akar.some(a => k.startsWith(a))) continue;
      if (k.startsWith(ANSWER_CACHE_PREFIX)) continue;
      buang.push(k);
    }
    for (const k of buang) localStorage.removeItem(k);
    if (buang.length) console.info('[cache] %d entri generasi lama dihapus', buang.length);
  } catch { /* localStorage mati/penuh — cache opsional */ }
}
