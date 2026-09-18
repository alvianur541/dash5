export function errorMessage(err: unknown): string {
  const msg = (err as Error)?.message ?? '';
  if (msg.includes('KUOTA_PENUH')) return 'Kuota AI sedang penuh (terlalu banyak permintaan berbarengan). Tunggu sekitar satu menit, lalu kirim ulang.';
  if (msg.includes('Stream terputus')) return 'Koneksi ke AI terputus di tengah jalan. Coba kirim ulang pertanyaanmu.';
  if (msg.includes('SERVER_DIAM')) return 'Server tidak merespons. Cek sinyal, lalu kirim ulang pertanyaanmu.';
  return 'HTA tidak bisa dihubungi. Cek sinyal kamu, lalu coba lagi.';
}
