import { UNIT_MODELS } from './types';

export function ragErrorTemplate(errorMsg: string): string {
  if (errorMsg.toLowerCase().includes('rerank')) return '';
  return `Sistem pencarian data sedang mengalami gangguan sementara. Jawaban ditahan dulu untuk menghindari informasi yang keliru.\n\nCoba kirim ulang pertanyaanmu dalam beberapa saat.`;
}

export const RERANK_DEGRADED_NOTE =
  '\n\n[PERINGATAN SISTEM — WAJIB DISAMPAIKAN] Mesin pemeringkat (reranker) sedang tidak bisa dihubungi, '
  + 'kemungkinan kena batas pemakaian. Data manual di bawah TETAP ASLI dan boleh dipakai, tapi URUTANNYA '
  + 'belum tersaring — chunk paling relevan bisa saja tidak di urutan pertama. '
  + 'BUKA jawabanmu dengan satu kalimat singkat yang memberi tahu hal ini, lalu jawab seperti biasa. '
  + 'Ingatkan sekali agar angka/PN penting diverifikasi ke manual. JANGAN mengarang untuk menutupi kekurangan urutan.';

export function faultCodeNotFoundTemplate(faultQuery: string, model: string): string {
  return `Kode \`${faultQuery}\` tidak ditemukan di database manual **${model}**.

Dua hal yang paling sering jadi penyebabnya:
1. **Pembacaan kode** — pastikan digit dan suffix persis seperti di monitor (format valid: \`11006-2\`, \`ENG:00436-04\`). Kalau ragu, kirim foto layar monitor — saya baca langsung dari situ.
2. **Model unit** — chat ini di-set ke **${model}**. Kode dari unit lain tidak akan ketemu di sini.

Kalau keduanya sudah benar dan kode tetap tidak ada, kemungkinan di luar cakupan manual yang tersedia — eskalasi ke Technical Support Department dengan menyebut kode + serial number unit.`;
}

export function partsNotFoundTemplate(query: string, model: string): string {
  return `Parts untuk **${query}** tidak ketemu di katalog **${model}** yang saya akses.

Supaya pencariannya kena:
1. Pakai nama komponen sesuai istilah katalog (English) — mis. \`seal kit; swing motor\`, \`bucket tooth\`.
2. Kalau pegang part number, kirim PN-nya langsung — pencarian PN paling akurat.
3. Sebut area komponen (engine / hydraulic / undercarriage / attachment) untuk mempersempit section.

Alternatif: cek Parts Catalog fisik unit, atau konfirmasi ke Parts Counter dengan menyebut model + nama komponen.`;
}

export const KIT_QUERY_RE = /\bkit\b/i;
export const KIT_HINT =
  '[PETUNJUK KIT] User mencari seal kit / repair kit. Di katalog Hitachi, kit sering TIDAK punya ' +
  'satu PN bundel — komponennya ditandai `svc:K`. Aturan: (1) kalau ADA baris bernama "KIT" dengan ' +
  'PN tunggal di data, sajikan itu. (2) kalau TIDAK ada baris kit-bundel, JANGAN jawab "tidak ada" — ' +
  'kumpulkan SEMUA part `svc:K` di section paling relevan, sajikan sebagai komponen penyusun kit ' +
  '(PN + nama + qty apa adanya), lalu jelaskan singkat katalog tak mencantumkan satu PN kit-bundel. ' +
  'HARAM mengarang PN kit yang tidak ada di data.';

const JP_CHARS_RE = /[぀-ヿ一-鿿]/;
const EN_HINT_RE  = /\b(what|who|whose|how|why|when|where|which|can|could|do|does|did|is|are|was|were|please|tell|the)\b/i;
const ID_HINT_RE  = /\b(apa|siapa|kenapa|gimana|bagaimana|kapan|dimana|yang|itu|ini|nggak|ngga|tidak|bisa|tolong|kamu|aku|saya)\b/i;

export function foreignModelTemplate(foreign: string, activeModel: string): string {
  const supported = UNIT_MODELS.some(s => s.toUpperCase().replace(/[\s-]/g, '') === foreign.toUpperCase().replace(/[\s-]/g, ''));
  return supported
    ? `Pertanyaan kamu soal **${foreign}**, tapi chat ini di-set ke **${activeModel}** 😅\n\nGanti dulu unitnya di menu sebelah kiri ke ${foreign}, baru aku bisa jawab dari manual unit itu.\n\nAda yang mau dicek di ${activeModel}?`
    : `Waduh, manual **${foreign}** belum ada di sistemku 😅 Aku cuma pegang data unit: ${UNIT_MODELS.join(', ')}.\n\nAku ngga bisa bantu diagnosa unit itu — jawabanku harus dari manual resmi, bukan kira-kira.\n\nAda yang mau dicek di **${activeModel}**?`;
}

export function offTopicTemplate(query = ''): string {
  if (JP_CHARS_RE.test(query)) {
    return `すみません、その質問は対応範囲外です😅
ユニットに関すること — フォルトコード、トラブルシューティング、スペック、パーツ — ならお答えできます。

何かユニットで確認したいことはありますか？`;
  }
  if (EN_HINT_RE.test(query) && !ID_HINT_RE.test(query)) {
    return `Sorry, that one's out of my lane 😅
I can help with anything about your unit — fault codes, troubleshooting, specs, or parts.

Anything on the unit I can check for you?`;
  }
  return `Waduh, pertanyaan kamu out of topic 😅.
Maaf aku ngga bisa jawab, kamu bisa tanya seputar unit, fault code, troubleshooting, spec, atau parts.

Apa ada yang bisa aku bantu cek?`;
}

export const RAG_LABEL = {
  manual: 'DATA MANUAL TERSEDIA',
  parts:  'DATA PARTS CATALOG TERSEDIA',
} as const;

export const FALLBACK_RESPONSE = 'Maaf, sistem tidak bisa memproses permintaan ini.';

export const EXTERNAL_DIRECTIVE = (model: string): string =>
  `[SUMBER EKSTERNAL] Manual internal ${model} tidak memuat data spesifik untuk pertanyaan ini. Jawab profesional memakai prinsip teknik umum + hasil penelusuran web. ATURAN WAJIB:
- Sampaikan sekali di awal, natural: jawaban ini rujukan umum industri, bukan dari manual resmi ${model}.
- Angka eksekusi-kritis (torque, tekanan, PN, clearance, fault code) DILARANG diklaim sebagai spec resmi unit. Kalau memberi angka, tandai sebagai "kisaran umum" dan minta verifikasi ke manual fisik unit.
- Fokus: prinsip kerja, alur diagnosa sistematis, penyebab probable, praktik standar industri.
- Ringkas, actionable, register rekan teknisi. Jangan menyalin mentah hasil web — sintesiskan.`;
