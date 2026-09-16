const THUMB_PX = 480;
const THUMB_QUALITY = 0.7;
const THUMB_TIMEOUT_MS = 8000;

// Stored in chat history (phone + Supabase), so kept small; the AI still receives the full photo.
function makeThumbnail(file: File): Promise<string | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    let settled = false;
    const done = (v: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), THUMB_TIMEOUT_MS);
    img.onload = () => {
      const scale = Math.min(1, THUMB_PX / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) { done(null); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try { done(canvas.toDataURL('image/jpeg', THUMB_QUALITY)); } catch { done(null); }
    };
    img.onerror = () => done(null);
    img.src = url;
  });
}

export async function makeThumbnails(files: File[]): Promise<string[]> {
  const out = await Promise.all(files.map(makeThumbnail));
  return out.filter((t): t is string => !!t);
}
