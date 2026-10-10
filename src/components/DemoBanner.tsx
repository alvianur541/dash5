import { useState } from 'react';
import { X } from 'lucide-react';

export function DemoBanner() {
  const [tutup, setTutup] = useState(() => typeof sessionStorage !== 'undefined' && sessionStorage.getItem('demo-banner') === '1');
  if (typeof window === 'undefined' || window.location.hostname !== 'app.dash5.id' || tutup) return null;
  return (
    <div className="demo-banner" role="status">
      <a href="mailto:alvianur@dash5.id">Request demo access</a>
      <button type="button" aria-label="Tutup" onClick={() => { sessionStorage.setItem('demo-banner', '1'); setTutup(true); }}><X size={16} /></button>
    </div>
  );
}
