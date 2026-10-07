import { useState } from 'react';
import { X } from 'lucide-react';

// Aplikasi pindah ke app.dash5.id; banner hanya tampil di alamat lama.
const ALAMAT_BARU = 'https://app.dash5.id';

export function MoveBanner() {
  const [tutup, setTutup] = useState(() => sessionStorage.getItem('move-banner') === '1');
  if (typeof window === 'undefined' || window.location.hostname !== 'dash5.my.id' || tutup) return null;
  return (
    <div className="move-banner" role="status">
      <span>Aplikasi pindah ke <b>app.dash5.id</b>. Buka alamat baru, login, lalu pasang ulang ikonnya di HP.</span>
      <a href={ALAMAT_BARU + window.location.pathname}>Buka</a>
      <button type="button" aria-label="Tutup" onClick={() => { sessionStorage.setItem('move-banner', '1'); setTutup(true); }}><X size={16} /></button>
    </div>
  );
}
