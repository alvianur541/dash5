import { useEffect, useRef, useState } from 'react';
import { ImagePlus, ImageDown, Loader2 } from 'lucide-react';
import { generateImage } from '../services/imageGeneration';

interface ViewProps {
  busy?: boolean;
  url?: string;
  error?: string;
  onGenerate: () => void;
  onSave: () => void;
}

export function IllustrationView({ busy, url, error, onGenerate, onSave }: ViewProps) {
  return <div className="image-illustration">
    {!url && <button type="button" className="illustration-action" disabled={busy} onClick={onGenerate}>
      {busy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
      <span>{busy ? 'Membuat ilustrasi…' : 'Buat ilustrasi'}</span>
    </button>}
    {busy && <p role="status">Sedang membuat satu gambar. Chat tetap bisa digunakan.</p>}
    {error && <p role="alert" className="illustration-error">{error}</p>}
    {url && <>
      <img src={url} alt="Ilustrasi konseptual dari jawaban, belum diverifikasi terhadap manual" className="illustration-preview" />
      <button type="button" className="illustration-action" onClick={onSave}><ImageDown size={15} />Simpan / kirim ilustrasi</button>
    </>}
    <p>Ilustrasi konseptual — bukan wiring diagram resmi. Periksa kembali dengan manual asli.</p>
    <p>{url ? 'Gambar tidak tersimpan di riwayat. Simpan sebelum berpindah percakapan.' : 'Dibuat hanya saat tombol ditekan; tidak otomatis. Batas 2 kali per 10 menit.'}</p>
  </div>;
}

export function ImageIllustration({ sessionId, messageId }: { sessionId: string; messageId: string }) {
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<{ url: string; blob: Blob } | null>(null);
  const [error, setError] = useState('');
  const ctrlRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => { ctrlRef.current?.abort(); if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  const generate = async () => {
    if (ctrlRef.current) return;
    const ctrl = new AbortController(); ctrlRef.current = ctrl;
    setBusy(true); setError('');
    try {
      const blob = await generateImage(sessionId, messageId, ctrl.signal);
      if (ctrl.signal.aborted) return;
      const url = URL.createObjectURL(blob); urlRef.current = url;
      setImage({ url, blob });
    } catch (e) { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'Ilustrasi gagal dibuat.'); }
    finally { if (!ctrl.signal.aborted) setBusy(false); ctrlRef.current = null; }
  };
  const save = async () => {
    if (!image) return;
    try {
      const { shareImage, downloadBlob } = await import('../lib/tableImage');
      const name = `ilustrasi-konseptual.${image.blob.type === 'image/png' ? 'png' : 'jpg'}`;
      if (await shareImage(image.blob, name) === 'unsupported') downloadBlob(image.blob, name);
    } catch { setError('Gagal menyimpan. Tekan lama gambar atau coba lagi.'); }
  };
  return <IllustrationView busy={busy} url={image?.url} error={error} onGenerate={() => void generate()} onSave={() => void save()} />;
}
