import { getAuthToken } from './supabase';

const PROXY_URL = (import.meta.env.VITE_VERTEX_PROXY_URL as string).replace(/\/$/, '');

export interface QuestionUsage {
  sessionId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  llmCalls: number;
  toolsUsed: string[];
}

export async function logQuestionUsage(payload: QuestionUsage): Promise<void> {
  // Skip kalau tidak ada token sama sekali (mis. jawaban canned bypass AI).
  if (!payload.inputTokens && !payload.outputTokens) return;
  try {
    const token = await getAuthToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    await fetch(`${PROXY_URL}/v1/usage`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      keepalive: true, // tetap terkirim walau user pindah/refresh segera
    });
  } catch (e) {
    console.warn('[usage] gagal kirim ledger:', (e as Error)?.message);
  }
}
