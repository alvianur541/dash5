import { authHeaders, PROXY_URL } from './ai';

export async function generateImage(sessionId: string, messageId: string, cancel?: AbortSignal): Promise<Blob> {
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  cancel?.addEventListener('abort', stop, { once: true });
  if (cancel?.aborted) stop();
  const timer = setTimeout(stop, 75_000);
  try {
    const response = await fetch(`${PROXY_URL}/v1/images`, {
      method: 'POST', headers: await authHeaders(), body: JSON.stringify({ sessionId, messageId }), signal: ctrl.signal,
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(typeof detail?.error === 'string' ? detail.error : 'Ilustrasi gagal dibuat. Coba lagi nanti.');
    }
    const image = await response.json();
    if (!['image/png', 'image/jpeg'].includes(image.mimeType) || typeof image.data !== 'string'
      || !image.data || image.data.length > 8 * 1024 * 1024
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.data)) {
      throw new Error('Format ilustrasi tidak didukung.');
    }
    const bytes = Uint8Array.from(atob(image.data), c => c.charCodeAt(0));
    return new Blob([bytes], { type: image.mimeType });
  } catch (error) {
    if (ctrl.signal.aborted && !cancel?.aborted) throw new Error('Waktu membuat ilustrasi habis. Coba lagi nanti.');
    throw error;
  } finally { clearTimeout(timer); cancel?.removeEventListener('abort', stop); }
}
