import { useState } from 'react';
import { X } from 'lucide-react';

export function DemoBanner() {
  const [tutup, setTutup] = useState(false);
  if (typeof window === 'undefined' || window.location.hostname !== 'app.dash5.id' || tutup) return null;
  return (
    <div className="demo-banner" role="status">
      <a href="mailto:alvianur@dash5.id">Request demo access</a>
      <button type="button" aria-label="Tutup" onClick={() => setTutup(true)}><X size={16} /></button>
    </div>
  );
}
