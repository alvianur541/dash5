// Catatan Lapangan — crowd-sourced ilmu teknisi untuk menambal gap knowledge base.
// Alur: teknisi kirim → JURI AI (server) nilai kelayakan → kalau LAYAK langsung
// di-embed & masuk `documents` (Kategori 'CATATAN LAPANGAN') → ke-retrieve untuk
// teknisi berikutnya. TANPA gerbang admin.
//
// Juri + ingest WAJIB di server (proxy /v1/field-note) supaya tak bisa di-bypass.
// Di client hanya UX bantu: ekstrak komponen & rapikan tulisan (tanpa menambah fakta).

import { getAuthToken } from './supabase';
import { callProxy, getText, INTENT_MODEL } from './ai';
import { UnitModel, GapReason } from '../types';

const proxyUrl = (import.meta.env.VITE_VERTEX_PROXY_URL as string).replace(/\/$/, '');

export interface SubmitFieldNoteInput {
  model: UnitModel;
  contributorName: string;
  sourceMessageId?: string;
  sourceQuestion?: string;
  sourceAnswer?: string;
  gapReason?: GapReason | 'manual';
  component?: string;
  noteContent: string;
}

export interface SubmitFieldNoteResult {
  ok: boolean;
  verdict?: 'worthy' | 'reject';
  reason?: string;      // alasan juri (kalau reject) atau pesan error
  error?: string;       // error teknis (network/server)
}

// ─── Kurasi AI di client (bantu UX, TANPA menambah fakta) ────────────────────────

const COMPONENT_SYSTEM = `Kamu asisten teknis alat berat. Dari pertanyaan teknisi, sebutkan NAMA KOMPONEN/SISTEM yang dibahas dalam bahasa Indonesia teknis singkat (2-4 kata). Contoh: "sistem pendingin engine", "swing motor", "rem parkir", "main pump hidrolik". HANYA nama komponen, tanpa kalimat lain, tanpa nama model unit.`;

const POLISH_SYSTEM = `Kamu editor teknis. Rapikan catatan lapangan teknisi alat berat agar jelas & terstruktur untuk dibaca teknisi lain.

ATURAN MUTLAK:
- JANGAN menambah fakta, angka, spesifikasi, atau langkah yang TIDAK ada di catatan asli.
- JANGAN mengarang. Kalau catatan tidak menyebut angka, jangan buat angka.
- Boleh: perbaiki ejaan/tata bahasa, susun jadi poin ringkas, perjelas kalimat rancu.
- Pertahankan istilah teknis & angka persis seperti aslinya.
- Output: teks rapi bahasa Indonesia. Tanpa preamble, tanpa "Berikut...". Langsung isinya.`;

/** Ekstrak nama komponen/sistem dari pertanyaan (pre-fill field). Fallback ''. */
export async function extractComponent(question: string, _model: UnitModel): Promise<string> {
  const q = question.trim();
  if (!q) return '';
  try {
    const res = await callProxy(
      {
        contents: [{ role: 'user', parts: [{ text: q.slice(0, 500) }] }],
        systemInstruction: { parts: [{ text: COMPONENT_SYSTEM }] },
        generationConfig: { maxOutputTokens: 30, temperature: 0, thinkingConfig: { thinkingLevel: 'minimal' } },
      },
      false,
      INTENT_MODEL,
    );
    return getText(res.candidates?.[0]?.content?.parts ?? []).trim().replace(/^["']|["']$/g, '').slice(0, 80);
  } catch {
    return '';
  }
}

/** Rapikan catatan mentah teknisi (tanpa menambah fakta). Fallback: teks asli. */
export async function polishFieldNote(rawNote: string, question: string, _model: UnitModel): Promise<string> {
  const raw = rawNote.trim();
  if (raw.length < 15) return raw;
  try {
    const res = await callProxy(
      {
        contents: [{ role: 'user', parts: [{ text: `Konteks pertanyaan: ${question.slice(0, 300)}\n\nCatatan teknisi:\n${raw.slice(0, 2000)}` }] }],
        systemInstruction: { parts: [{ text: POLISH_SYSTEM }] },
        generationConfig: { maxOutputTokens: 400, temperature: 0.2, thinkingConfig: { thinkingLevel: 'minimal' } },
      },
      false,
      INTENT_MODEL,
    );
    const out = getText(res.candidates?.[0]?.content?.parts ?? []).trim();
    return out.length >= 15 ? out : raw;
  } catch {
    return raw;
  }
}

// ─── Submit → juri AI server → auto-ingest kalau layak ───────────────────────────

export async function submitFieldNote(input: SubmitFieldNoteInput): Promise<SubmitFieldNoteResult> {
  const note = input.noteContent.trim();
  if (note.length < 10) return { ok: false, error: 'Catatan terlalu pendek — tulis minimal 1 kalimat bermakna.' };

  const token = await getAuthToken();
  if (!token) return { ok: false, error: 'Sesi login tidak ditemukan.' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(`${proxyUrl}/v1/field-note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      signal: ctrl.signal,
      body: JSON.stringify({
        model:            input.model,
        contributorName:  input.contributorName,
        sourceMessageId:  input.sourceMessageId,
        sourceQuestion:   input.sourceQuestion,
        sourceAnswer:     input.sourceAnswer,
        gapReason:        input.gapReason ?? 'manual',
        component:        input.component,
        note,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.verdict) {
      return { ok: false, error: (data as { error?: string }).error ?? 'Gagal mengirim. Coba lagi.' };
    }
    const verdict = (data as { verdict?: 'worthy' | 'reject' }).verdict;
    const reason = (data as { reason?: string }).reason;
    return { ok: true, verdict, reason };
  } catch (err) {
    return { ok: false, error: (err as Error)?.name === 'AbortError' ? 'Timeout — coba lagi.' : 'Gagal terhubung ke server.' };
  } finally {
    clearTimeout(timer);
  }
}
