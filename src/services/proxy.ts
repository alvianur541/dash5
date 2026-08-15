// URL proxy Cloud Run + warm-up. Sengaja DIPISAH dari ai.ts: App memanggil
// warmupProxy() saat mount, dan kalau fungsi itu masih tinggal di ai.ts maka seluruh
// ai.ts (+ constants.ts, supabase search, semanticCache — ~116 KB sumber) ikut terseret
// ke bundle awal padahal baru dipakai saat pertanyaan pertama dikirim.

export const PROXY_URL = (import.meta.env.VITE_VERTEX_PROXY_URL as string).replace(/\/$/, '');

/** Warm-up proxy saat app dibuka — bangunkan instance Cloud Run (cold start bisa 2-5s)
 *  + buka koneksi TLS keep-alive, supaya pertanyaan PERTAMA tidak menanggung biaya itu.
 *  Fire-and-forget; /health tanpa auth & tanpa efek samping. */
export function warmupProxy(): void {
  fetch(`${PROXY_URL}/health`).catch(() => { /* offline / blocked — abaikan */ });
}
