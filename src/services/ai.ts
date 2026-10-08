import { UnitModel, Message, AgentEvent } from '../types';
import { getAuthToken } from './supabase';

// Above the server deadline (120 s) so the server's own message wins instead of us guessing.
const ASK_IDLE_TIMEOUT_MS = 130_000;
const RETRY_DELAY_MS = 700;
export const PROXY_URL = ((import.meta.env.VITE_VERTEX_PROXY_URL as string | undefined) ?? '/api').replace(/\/$/, '');

type ThinkLevel = 'low' | 'medium' | 'high';

const THINK_OVERRIDE: ThinkLevel | null = (() => {
  try {
    const v = new URLSearchParams(window.location.search).get('think')?.toLowerCase();
    return v === 'low' || v === 'medium' || v === 'high' ? v : null;
  } catch { return null; }
})();

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export function warmupProxy(): void {
  fetch(`${PROXY_URL}/health`).catch(() => { });
}

// Answer caching is disabled: shared browsers and live prices require a fresh authorized request.
interface AskBody {
  model: UnitModel;
  userName: string;
  history: Message[];
  userInput: string;
  think?: ThinkLevel;
  attachments?: Array<{ mimeType: string; data: string }>;
  sessionId?: string;
}

export interface AskOptions {
  sessionId?: string;
  signal?: AbortSignal;
}


async function ask(
  body: AskBody,
  onChunk: (text: string) => void,
  onAgentEvent: ((e: AgentEvent) => void) | undefined,
  cancel: AbortSignal | undefined,
): Promise<{ text: string }> {
  const ctrl = new AbortController();
  const stop = () => ctrl.abort();
  cancel?.addEventListener('abort', stop);
  if (cancel?.aborted) stop();
  let idle = setTimeout(stop, ASK_IDLE_TIMEOUT_MS);
  const tick = () => { clearTimeout(idle); idle = setTimeout(stop, ASK_IDLE_TIMEOUT_MS); };
  // The user's Stop surfaces as AbortError; only our idle timer means the server went quiet.
  const abortReason = () => (cancel?.aborted ? new DOMException('Dibatalkan', 'AbortError') : new Error('SERVER_DIAM'));

  let text = '';
  let completed = false;
  let receivedFinal = false;
  let serverError: string | null = null;
  try {
    const send = async () => fetch(`${PROXY_URL}/v1/ask`, {
      method: 'POST', headers: await authHeaders(), body: JSON.stringify(body), signal: ctrl.signal,
    });
    let res: Response;
    try {
      res = await send();
    } catch {
      if (ctrl.signal.aborted) throw abortReason();
      // A PWA resumed from the background often sends its first request on a dead connection; one fresh try fixes it.
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      if (ctrl.signal.aborted) throw abortReason();
      try {
        res = await send();
      } catch (e) {
        throw ctrl.signal.aborted ? abortReason() : e;
      }
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.error ?? ''; } catch { }
      throw new Error(`Ask error ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    if (!res.body) throw new Error('Ask response has no body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      let step: ReadableStreamReadResult<Uint8Array>;
      try {
        step = await reader.read();
      } catch (e) {
        if (!ctrl.signal.aborted) throw e;
        throw abortReason();
      }
      if (step.done) break;
      tick();
      buffer += decoder.decode(step.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        let frame: any;
        try { frame = JSON.parse(raw); } catch { continue; }
        switch (frame.ev) {
          case 'text':
            if (frame.text) { text += frame.text; onChunk(frame.text); }
            break;
          case 'agent_event':
            if (frame.event && onAgentEvent) onAgentEvent(frame.event as AgentEvent);
            break;
          case 'meta':
            // Server text is final: retries and leak/LaTeX cleanup can make it shorter than what streamed.
            if (typeof frame.full === 'string' && frame.full.trim()) {
              text = frame.full;
              receivedFinal = true;
            }
            break;
          case 'done':
            completed = true;
            break;
          case 'error':
            serverError = String(frame.message || 'Gagal memproses pertanyaan.');
            break;
        }
      }
    }
  } finally {
    clearTimeout(idle);
    cancel?.removeEventListener('abort', stop);
  }

  if (serverError) throw new Error(serverError);
  if (ctrl.signal.aborted) throw abortReason();
  if (!completed || !receivedFinal || !text.trim()) throw new Error('Stream terputus sebelum jawaban selesai.');
  return { text };
}

export async function generateResponseStream(
  model: UnitModel,
  userName: string,
  history: Message[],
  userInput: string,
  onChunk: (text: string) => void,
  onAgentEvent?: (event: AgentEvent) => void,
  { sessionId, signal }: AskOptions = {},
): Promise<string> {
  const { text } = await ask(
    { model, userName, history, userInput, think: THINK_OVERRIDE ?? undefined, sessionId },
    onChunk, onAgentEvent, signal,
  );
  return text;
}

function fileToInline(file: File): Promise<{ mimeType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') { reject(new Error('FileReader result bukan string')); return; }
      const [, base64] = result.split(',');
      if (!base64) { reject(new Error('Invalid data URL — missing base64 payload')); return; }
      resolve({ mimeType: file.type, data: base64 });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function generateResponse(
  model: UnitModel,
  userName: string,
  history: Message[],
  userInput: string,
  attachments: File[],
  onChunk: (text: string) => void,
  onAgentEvent?: (event: AgentEvent) => void,
  { sessionId, signal }: AskOptions = {},
): Promise<string> {
  const settled = await Promise.allSettled(attachments.map(fileToInline));
  const images = settled
    .filter((r): r is PromiseFulfilledResult<{ mimeType: string; data: string }> => r.status === 'fulfilled')
    .map(r => r.value);
  if (images.length === 0) return 'Maaf, gagal membaca file gambar.';

  const { text } = await ask(
    { model, userName, history, userInput, attachments: images, think: THINK_OVERRIDE ?? undefined, sessionId },
    onChunk, onAgentEvent, signal,
  );
  return text;
}
