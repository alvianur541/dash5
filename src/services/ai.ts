
import { UnitModel, Message } from '../types';
import { getAuthToken } from './supabase';
import { ANSWER_CACHE_PREFIX } from './cacheGen';

export const PROXY_URL = ((import.meta.env.VITE_VERTEX_PROXY_URL as string | undefined) ?? '/api').replace(/\/$/, '');

export interface AgentEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'done';
  tool?: string;
  found?: boolean;
  message?: string;
}

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

const ANSWER_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const CONTEXT_REF_RE = /\b(itu|ini|nya|tadi|tersebut|barusan|sebelumnya)\b/i;

function answerCacheKey(model: string, query: string): string | null {
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim();
  if (q.length < 6 || q.length > 300) return null;
  if (CONTEXT_REF_RE.test(q)) return null;
  return `${ANSWER_CACHE_PREFIX}${model}::${q}`;
}

function readAnswerCache(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { text, exp } = JSON.parse(raw) as { text?: unknown; exp?: unknown };
    if (typeof text !== 'string' || typeof exp !== 'number' || Date.now() > exp) {
      localStorage.removeItem(key);
      return null;
    }
    return text;
  } catch { return null; }
}

function writeAnswerCache(key: string, text: string): void {
  try {
    if (text.length < 40 || text.length > 20000) return;
    localStorage.setItem(key, JSON.stringify({ text, exp: Date.now() + ANSWER_CACHE_TTL_MS }));
  } catch { }
}

async function streamCanned(text: string, onChunk: (t: string) => void): Promise<string> {
  const CHUNK = 24;
  for (let i = 0; i < text.length; i += CHUNK) {
    onChunk(text.slice(i, i + CHUNK));
    await new Promise(r => setTimeout(r, 12));
  }
  return text;
}

interface AskBody {
  model: UnitModel;
  userName: string;
  history: Message[];
  userInput: string;
  think?: ThinkLevel;
  attachments?: Array<{ mimeType: string; data: string }>;
}

const FALLBACK_RESPONSE = 'Maaf, sistem tidak bisa memproses permintaan ini.';

async function ask(
  body: AskBody,
  onChunk: (text: string) => void,
  onAgentEvent?: (e: AgentEvent) => void,
): Promise<{ text: string; cacheable: boolean }> {

  const res = await fetch(`${PROXY_URL}/v1/ask`, {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error ?? ''; } catch { }
    throw new Error(`Ask error ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  if (!res.body) throw new Error('Ask response has no body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let cacheable = false;
  let serverError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
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
          cacheable = frame.cacheable === true;
          if (typeof frame.full === 'string' && frame.full.length > text.length) text = frame.full;
          break;
        case 'error':
          serverError = String(frame.message || 'Gagal memproses pertanyaan.');
          break;
      }
    }
  }

  if (serverError && !text.trim()) throw new Error(serverError);
  return { text: text || FALLBACK_RESPONSE, cacheable };
}

export async function generateResponseStream(
  model: UnitModel,
  userName: string,
  history: Message[],
  userInput: string,
  onChunk: (text: string) => void,
  onAgentEvent?: (event: AgentEvent) => void,
): Promise<string> {
  const trimmed = userInput.trim();
  const cacheKey = THINK_OVERRIDE ? null : answerCacheKey(model, trimmed);
  if (cacheKey) {
    const cached = readAnswerCache(cacheKey);
    if (cached) {
      console.info('[answer-cache] HIT');
      return streamCanned(cached, onChunk);
    }
  }

  const { text, cacheable } = await ask(
    { model, userName, history, userInput, think: THINK_OVERRIDE ?? undefined },
    onChunk, onAgentEvent,
  );
  if (cacheKey && cacheable) writeAnswerCache(cacheKey, text);
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
): Promise<string> {
  const settled = await Promise.allSettled(attachments.map(fileToInline));
  const images = settled
    .filter((r): r is PromiseFulfilledResult<{ mimeType: string; data: string }> => r.status === 'fulfilled')
    .map(r => r.value);
  if (images.length === 0) return 'Maaf, gagal membaca file gambar.';

  const { text } = await ask(
    { model, userName, history, userInput, attachments: images, think: THINK_OVERRIDE ?? undefined },
    onChunk, onAgentEvent,
  );
  return text;
}
