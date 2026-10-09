export function errorMessage(err: unknown): string {
  const msg = (err as Error)?.message ?? '';
  const status = /^Ask error (\d{3})(?::|$)/.exec(msg)?.[1];
  if (status === '401') return 'Sesi login sudah tidak berlaku. Login kembali, lalu kirim ulang.';
  if (status === '413') return 'Pertanyaan atau lampiran terlalu besar. Pendekkan pertanyaan atau kecilkan gambar, lalu kirim ulang.';
  if (status === '415') return 'Format lampiran tidak didukung. Gunakan gambar JPG, PNG, atau WebP.';
  if (status === '429') return 'Terlalu banyak permintaan. Tunggu sebentar, lalu kirim ulang.';

  if (msg.includes('KUOTA_PENUH')) return 'Kuota AI sedang penuh (terlalu banyak permintaan berbarengan). Tunggu sekitar satu menit, lalu kirim ulang.';
  if (msg.includes('Stream terputus')) return 'Koneksi ke AI terputus di tengah jalan. Coba kirim ulang pertanyaanmu.';
  if (msg.includes('SERVER_DIAM')) return 'Server tidak merespons. Cek sinyal, lalu kirim ulang pertanyaanmu.';
  return 'Gagal terhubung ke server. Cek sinyal internet, lalu tekan Kirim ulang.';
}
