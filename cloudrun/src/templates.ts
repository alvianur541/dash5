import { UNIT_MODELS } from './types';

export type Lang = 'id' | 'en' | 'ja';

const JP_RE = /[぀-ヿ一-鿿]/;
const EN_RE = /\b(what|who|whose|how|why|when|where|which|can|could|would|should|do|does|did|is|are|was|were|please|tell|explain|show|about|the|and|for)\b/i;
const ID_RE = /\b(apa|siapa|kenapa|mengapa|gimana|bagaimana|kapan|dimana|yang|itu|ini|nggak|ngga|tidak|bisa|tolong|kamu|aku|saya|untuk|dari|dengan|kalau|sudah|belum)\b/i;

export function detectLang(text: string): Lang | null {
  if (JP_RE.test(text)) return 'ja';
  const id = ID_RE.test(text);
  const en = EN_RE.test(text);
  if (id && !en) return 'id';
  if (en && !id) return 'en';
  return null;
}

export function sessionLang(current: string, history: { role: string; content: string }[] = []): Lang {
  const now = detectLang(current);
  if (now) return now;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.role !== 'user' || !h.content) continue;
    const prev = detectLang(h.content);
    if (prev) return prev;
  }
  return 'id';
}

function pick<T>(lang: Lang, opts: { id: T; en: T; ja: T }): T {
  return opts[lang];
}

// Photo turns wrap the caption in Indonesian instructions; without this the model answers in Indonesian.
export function langDirective(lang: Lang): string {
  return pick(lang, {
    id: '',
    en: '[LANGUAGE: The technician wrote in English. Write the ENTIRE answer in English — headings, explanations, steps, and closing. The instructions and manual data above are internal and may be in Indonesian; do not copy their language. Copy part numbers, codes, numbers, and units exactly.]',
    ja: '[言語: 技術者は日本語で書いています。回答はすべて日本語で書いてください（見出し・説明・手順・締めくくりまで）。上の指示とマニュアルデータは内部用でインドネシア語の場合がありますが、その言語をまねしないでください。部品番号・コード・数値・単位はそのまま写してください。]',
  });
}

export function imageCodesNotFoundTemplate(codes: string[], model: string, lang: Lang = 'id'): string {
  const list = codes.join(', ');
  const lines = (f: (c: string) => string) => codes.map(f).join('\n');
  return pick(lang, {
    id: `Fault code terdeteksi dari gambar: **${list}**\n\n${lines(c => `- Kode \`${c}\` tidak ada di manual **${model}** yang saya akses.`)}\n\nPastikan pembacaan kode benar dan model unit sesuai (saat ini di-set ke ${model}).`,
    en: `Fault codes read from the photo: **${list}**\n\n${lines(c => `- Code \`${c}\` is not in the **${model}** manual I can access.`)}\n\nCheck that the codes were read correctly and that the unit model is right (this chat is set to ${model}).`,
    ja: `写真から読み取ったフォルトコード: **${list}**\n\n${lines(c => `- コード \`${c}\` は **${model}** のマニュアルにありません。`)}\n\nコードの読み取りが正しいか、機種設定が合っているか確認してください（現在の設定: ${model}）。`,
  });
}

export function ragErrorTemplate(errorMsg: string, lang: Lang = 'id'): string {
  if (errorMsg.toLowerCase().includes('rerank')) return '';
  return pick(lang, {
    id: `Sistem pencarian data sedang mengalami gangguan sementara. Jawaban ditahan dulu untuk menghindari informasi yang keliru.\n\nCoba kirim ulang pertanyaanmu dalam beberapa saat.`,
    en: `The data search system is temporarily unavailable. I'm holding the answer back to avoid giving you incorrect information.\n\nPlease send your question again in a moment.`,
    ja: `データ検索システムが一時的に不調です。誤った情報をお伝えしないよう、回答を保留します。\n\n少し時間をおいて、もう一度質問を送ってください。`,
  });
}

export const RERANK_DEGRADED_NOTE =
  '\n\n[PERINGATAN SISTEM — WAJIB DISAMPAIKAN] Mesin pemeringkat (reranker) sedang tidak bisa dihubungi, '
  + 'kemungkinan kena batas pemakaian. Data manual di bawah TETAP ASLI dan boleh dipakai, tapi URUTANNYA '
  + 'belum tersaring — chunk paling relevan bisa saja tidak di urutan pertama. '
  + 'BUKA jawabanmu dengan satu kalimat singkat yang memberi tahu hal ini, lalu jawab seperti biasa. '
  + 'Ingatkan sekali agar angka/PN penting diverifikasi ke manual. JANGAN mengarang untuk menutupi kekurangan urutan.';

export function faultCodeNotFoundTemplate(faultQuery: string, model: string, lang: Lang = 'id'): string {
  if (lang === 'en') {
    return `Code \`${faultQuery}\` was not found in the **${model}** manual.

Two things usually cause this:
1. **Code reading** — make sure the digits and suffix match the monitor exactly (valid formats: \`11006-2\`, \`ENG:00436-04\`). If you're unsure, send a photo of the monitor screen and I'll read it directly.
2. **Unit model** — this chat is set to **${model}**. Codes from other units won't be found here.

If both are correct and the code still isn't there, it's likely outside the available manual coverage — escalate to the Technical Support Department with the code and the unit serial number.`;
  }
  if (lang === 'ja') {
    return `コード \`${faultQuery}\` は **${model}** のマニュアルに見つかりませんでした。

主な原因は次の2つです。
1. **コードの読み取り** — モニタ表示の数字とサフィックスが一致しているか確認してください（有効な形式: \`11006-2\`、\`ENG:00436-04\`）。不明な場合はモニタ画面の写真を送ってください。こちらで直接読み取ります。
2. **機種の設定** — このチャットは **${model}** に設定されています。他機種のコードはここでは見つかりません。

両方とも正しいのにコードが見つからない場合は、対応マニュアルの範囲外の可能性があります。コードと機体番号を添えて Technical Support Department にエスカレーションしてください。`;
  }
  return `Kode \`${faultQuery}\` tidak ditemukan di manual **${model}**.

Dua hal yang paling sering jadi penyebabnya:
1. **Pembacaan kode** — pastikan digit dan suffix persis seperti di monitor (format valid: \`11006-2\`, \`ENG:00436-04\`). Kalau ragu, kirim foto layar monitor — saya baca langsung dari situ.
2. **Model unit** — chat ini di-set ke **${model}**. Kode dari unit lain tidak akan ketemu di sini.

Kalau keduanya sudah benar dan kode tetap tidak ada, kemungkinan di luar cakupan manual yang tersedia — eskalasi ke Technical Support Department dengan menyebut kode + serial number unit.`;
}

export function partsNotFoundTemplate(query: string, model: string, lang: Lang = 'id'): string {
  if (lang === 'en') {
    return `I couldn't find parts for **${query}** in the **${model}** catalog I have access to.

To make the search hit:
1. Use the component name as written in the catalog (English) — e.g. \`seal kit; swing motor\`, \`bucket tooth\`.
2. If you have the part number, send the PN directly — PN search is the most accurate.
3. Mention the component area (engine / hydraulic / undercarriage / attachment) to narrow the section.

Alternative: check the unit's physical Parts Catalog, or confirm with the Parts Counter giving the model and component name.`;
  }
  if (lang === 'ja') {
    return `アクセスできる **${model}** のカタログに **${query}** の部品が見つかりませんでした。

検索を確実にヒットさせるには:
1. カタログ表記（英語）の部品名を使ってください。例: \`seal kit; swing motor\`、\`bucket tooth\`。
2. 部品番号がわかる場合は PN を直接送ってください。PN 検索が最も正確です。
3. 部位（engine / hydraulic / undercarriage / attachment）を指定すると section を絞り込めます。

代替手段: 機体備え付けの Parts Catalog を確認するか、機種名と部品名を伝えて Parts Counter に確認してください。`;
  }
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

export function foreignModelTemplate(foreign: string, activeModel: string, lang: Lang = 'id'): string {
  const supported = UNIT_MODELS.some(s => s.toUpperCase().replace(/[\s-]/g, '') === foreign.toUpperCase().replace(/[\s-]/g, ''));
  if (lang === 'en') {
    return supported
      ? `Your question is about **${foreign}**, but this chat is set to **${activeModel}**.\n\nSwitch the unit in the left menu to ${foreign} first, then I can answer from that unit's manual.\n\nAnything you'd like to check on ${activeModel}?`
      : `I don't have the **${foreign}** manual in my system yet. I only hold data for: ${UNIT_MODELS.join(', ')}.\n\nI can't help diagnose that unit — my answers have to come from the official manual, not guesswork.\n\nAnything you'd like to check on **${activeModel}**?`;
  }
  if (lang === 'ja') {
    return supported
      ? `ご質問は **${foreign}** についてですが、このチャットは **${activeModel}** に設定されています。\n\n左のメニューで機種を ${foreign} に切り替えてください。そうすればその機種のマニュアルからお答えできます。\n\n**${activeModel}** で確認したいことはありますか？`
      : `**${foreign}** のマニュアルはまだシステムにありません。手元にあるのは次の機種のデータのみです: ${UNIT_MODELS.join(', ')}。\n\nその機種の診断はお手伝いできません。回答は必ず正規マニュアルに基づく必要があり、推測ではお答えできません。\n\n**${activeModel}** で確認したいことはありますか？`;
  }
  return supported
    ? `Pertanyaan kamu soal **${foreign}**, tapi chat ini di-set ke **${activeModel}**.\n\nGanti dulu unitnya di menu sebelah kiri ke ${foreign}, baru aku bisa jawab dari manual unit itu.\n\nAda yang mau dicek di ${activeModel}?`
    : `Manual **${foreign}** belum ada di sistemku. Aku cuma pegang data unit: ${UNIT_MODELS.join(', ')}.\n\nAku ngga bisa bantu diagnosa unit itu — jawabanku harus dari manual resmi, bukan kira-kira.\n\nAda yang mau dicek di **${activeModel}**?`;
}

export function offTopicTemplate(query = '', history: { role: string; content: string }[] = []): string {
  const lang = sessionLang(query, history);
  if (lang === 'ja') {
    return `すみません、その質問は対応範囲外です。
ユニットに関すること（フォルトコード、トラブルシューティング、スペック、パーツ）ならお答えできます。

何かユニットで確認したいことはありますか？`;
  }
  if (lang === 'en') {
    return `Sorry, that one's outside what I cover.
I can help with anything about your unit — fault codes, troubleshooting, specs, or parts.

Anything on the unit I can check for you?`;
  }
  return `Maaf, pertanyaan itu di luar cakupanku.
Aku bisa bantu seputar unit — fault code, troubleshooting, spec, atau parts.

Ada yang bisa aku bantu cek?`;
}

export const RAG_LABEL = {
  manual: 'DATA MANUAL TERSEDIA',
  parts:  'DATA PARTS CATALOG TERSEDIA',
} as const;

export const FALLBACK_RESPONSE = 'Maaf, AI tidak berhasil menyusun jawaban kali ini (respons server terlalu lama). Kirim ulang pertanyaanmu.';

export const EXTERNAL_DIRECTIVE = (model: string): string =>
  `[SUMBER EKSTERNAL] Manual internal ${model} tidak memuat data spesifik untuk pertanyaan ini. Jawab profesional memakai prinsip teknik umum + hasil penelusuran web. ATURAN WAJIB:
- Sampaikan sekali di awal, natural: jawaban ini rujukan umum industri, bukan dari manual resmi ${model}.
- Angka eksekusi-kritis (torque, tekanan, PN, clearance, fault code) DILARANG diklaim sebagai spec resmi unit. Kalau memberi angka, tandai sebagai "kisaran umum" dan minta verifikasi ke manual fisik unit.
- Fokus: prinsip kerja, alur diagnosa sistematis, penyebab probable, praktik standar industri.
- Ringkas, actionable, register rekan teknisi. Jangan menyalin mentah hasil web — sintesiskan.`;
