// Generasi cache jawaban — SATU angka yang membatalkan SEMUA cache sisi-klien.
//
// KENAPA ADA: cache jawaban disimpan di localStorage per-browser dengan TTL 3 hari.
// Setiap kali pipeline retrieval / SYSTEM_PROMPT diperbaiki, jawaban lama yang SALAH
// tetap tersaji dari cache sampai TTL habis — perbaikannya seolah tidak berpengaruh.
// Kejadian nyata (15 Agu 2026): retrieval diperbaiki sampai chunk jawaban "berat swing
// motor" naik #27→#7, tapi user tetap menerima jawaban lama "220 kg" dari cache.
//
// 🔴 NAIKKAN ANGKA INI setiap kali mengubah hal yang MENGUBAH ISI JAWABAN:
//    - tuning retrieval (RERANK_INPUT_CAP, ambang, skoring RPC, chunking)
//    - SYSTEM_PROMPT
//    - scrub/format output
//    Tidak perlu dinaikkan untuk perubahan UI/CSS/telemetri.
//
// Riwayat: 1 = 'dash-ans:' · 2 = 'dash-ans2:' (scrub "Hitachi Astrea")
//          3 = perbaikan mutu retrieval + skoring keyword RPC (15 Agu 2026)
//          4 = penyetelan latensi: topN 5→4, rerank cap 45→24, term 10→7 (15 Agu 2026)
//          5 = latensi tahap 2: topN 3, rerank cap 12 + kandidat disilang kw/vector,
//              fault code multi-kode 2 chunk/kode (15 Agu 2026)
//          6 = cache semantik dihapus; keyword 10 / vector 20 / cohere 15 (15 Agu 2026)
//          7 = jaminan slot untuk juara kata kunci pada pertanyaan bernilai (15 Agu 2026)
//          8 = HyDE nonaktif; keyword 15 / vector 20 / rerank 20→10 / Gemini 4 (15 Agu 2026)
export const CACHE_GEN = 8;

/** Prefix ber-generasi. Ganti CACHE_GEN → semua kunci lama otomatis tidak cocok lagi. */
export const ANSWER_CACHE_PREFIX = `dash-ans-g${CACHE_GEN}:`;
// Cache semantik DIHAPUS 15 Agu 2026 — tidak ada prefix 'hidup' untuk 'dash-sem' lagi,
// jadi purge di bawah akan MENGHAPUS SEMUA sisa entrinya dari localStorage teknisi.
// Akar 'dash-sem' sengaja dipertahankan di daftar sapuan supaya sisa lama benar-benar
// terbuang (entri ~4 KB/buah, sampai 20 entri per model per user — sayang kalau menetap).

/**
 * Hapus entri cache dari generasi LAMA (termasuk nama prefix sebelum skema ini ada).
 * Tanpa ini entri basi menumpuk di localStorage sampai TTL-nya habis — memakan kuota,
 * dan (yang lebih penting) untuk cache semantik entri lama tetap bisa TER-MATCH.
 * Dipanggil sekali saat app start. Aman kalau localStorage mati/penuh.
 */
export function purgeStaleAnswerCaches(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const hidup = [ANSWER_CACHE_PREFIX];
    // Semua kunci cache jawaban memakai salah satu dari dua akar ini.
    const akar  = ['dash-ans', 'dash-sem'];
    const buang: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!akar.some(a => k.startsWith(a))) continue;      // bukan cache jawaban → jangan sentuh
      if (hidup.some(p => k.startsWith(p))) continue;      // generasi sekarang → pertahankan
      buang.push(k);
    }
    for (const k of buang) localStorage.removeItem(k);
    if (buang.length) console.info('[cache] %d entri generasi lama dihapus', buang.length);
  } catch { /* localStorage mati/penuh — cache opsional, jangan ganggu app */ }
}
