import { UNIT_MODELS } from './types';

export type Lang = 'id' | 'en';

const EN_RE = /\b(what|who|whose|how|why|when|where|which|could|would|should|do|does|did|is|are|was|were|please|tell|explain|show|about|the|and|for|i|i[’']m|i[’']ve|i[’']ll|i[’']d|am|it|it[’']s|its|my|this|that|these|have|has|had|been|not|still|so|you|your|we|they|with|to|of|but|if|there|already|using|checked|need|want|will|english)\b/gi;
const ID_RE = /\b(apa|siapa|kenapa|mengapa|gimana|bagaimana|kapan|dimana|yang|itu|ini|nggak|ngga|tidak|bisa|tolong|kamu|aku|saya|untuk|dari|dengan|kalau|sudah|belum|saat|pakai|pake|ganti|masih|udah|gak|enggak|aja|dong|nih|sih|kok|ada|mau|coba|cek|harus|lagi|juga|atau|kalo|klo|dan|berapa|brp|pada|di|ke|semua|hasil|jika|jadi|terus|tapi|karena|nilai|apakah|mana|nya|kadang|terkadang|sering|selalu|ketika|setelah|sesudah|sebelum|sedang|kabel|mesin|nyala|mati|hidup|putus|bocor|lambat|lemah|tekanan|unitnya|kenapa|gimana|seperti|sama)\b/gi;

const hitung = (re: RegExp, t: string) => t.match(re)?.length ?? 0;

export function detectLang(text: string): Lang | null {
  const t = text.replace(/\bthanks?\s*(?:you|u)\b/gi, ' ').replace(/\bCAN\b/g, ' ');
  const id = hitung(ID_RE, t);
  const en = hitung(EN_RE, t);
  if (id > en) return 'id';
  if (en > id) return 'en';
  return null;
}

export function sessionLang(current: string, history: { role: string; content: string }[] = [], hint?: Lang | null): Lang {
  if (hint) return hint;
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

function pick<T>(lang: Lang, opts: { id: T; en: T }): T {
  return opts[lang];
}

export function langDirective(lang: Lang): string {
  return pick(lang, {
    id: '[BAHASA: Teknisi menulis dalam bahasa Indonesia. Tulis SELURUH jawaban dalam bahasa Indonesia, walau jawaban sebelumnya berbahasa lain. Istilah teknis (nama komponen, part, sistem, gejala, besaran ukur, item monitor) TETAP English persis seperti di manual/katalog — jangan diterjemahkan dan jangan diberi padanan Indonesia. Salin part number, kode, angka, dan satuan persis.]',
    en: '[LANGUAGE: The technician wrote in English. Write the ENTIRE answer in English — headings, explanations, steps, and closing. The instructions and manual data above are internal and may be in Indonesian; do not copy their language. Copy part numbers, codes, numbers, and units exactly.]',
  });
}

export function imageCodesNotFoundTemplate(codes: string[], model: string, lang: Lang = 'id'): string {
  const list = codes.join(', ');
  const lines = (f: (c: string) => string) => codes.map(f).join('\n');
  return pick(lang, {
    id: `Fault code terdeteksi dari gambar: **${list}**\n\n${lines(c => `- Kode \`${c}\` tidak ada di manual **${model}** yang saya akses.`)}\n\nPastikan pembacaan kode benar dan model unit sesuai (saat ini di-set ke ${model}).`,
    en: `Fault codes read from the photo: **${list}**\n\n${lines(c => `- Code \`${c}\` is not in the **${model}** manual I can access.`)}\n\nCheck that the codes were read correctly and that the unit model is right (this chat is set to ${model}).`,
  });
}

export function ragErrorTemplate(errorMsg: string, lang: Lang = 'id'): string {
  if (errorMsg.toLowerCase().includes('rerank')) return '';
  return pick(lang, {
    id: `Sistem pencarian data sedang mengalami gangguan sementara. Jawaban ditahan dulu untuk menghindari informasi yang keliru.\n\nCoba kirim ulang pertanyaanmu dalam beberapa saat.`,
    en: `The data search system is temporarily unavailable. I'm holding the answer back to avoid giving you incorrect information.\n\nPlease send your question again in a moment.`,
  });
}

export const RERANK_DEGRADED_NOTE =
  '\n\n[PERINGATAN SISTEM — WAJIB DISAMPAIKAN] Mesin pemeringkat (reranker) sedang tidak bisa dihubungi, '
  + 'kemungkinan kena batas pemakaian. Data manual di bawah TETAP ASLI dan boleh dipakai, tapi URUTANNYA '
  + 'belum tersaring — chunk paling relevan bisa saja tidak di urutan pertama. '
  + 'BUKA jawabanmu dengan satu kalimat singkat berbahasa awam, mis. "Pencarian manual sedang kurang optimal, jadi cek ulang angka penting ke manual ya", lalu jawab seperti biasa. '
  + 'Jangan sebut istilah teknis sistem (reranker, mesin pemeringkat, chunk, server). '
  + 'JANGAN mengarang untuk menutupi kekurangan urutan.';

export function faultCodeNotFoundTemplate(faultQuery: string, model: string, lang: Lang = 'id'): string {
  if (lang === 'en') {
    return `Code \`${faultQuery}\` was not found in the **${model}** manual.

Two things usually cause this:
1. **Code reading** — make sure the digits and suffix match the monitor exactly (valid formats: \`11006-2\`, \`ENG:00436-04\`). If you're unsure, send a photo of the monitor screen and I'll read it directly.
2. **Unit model** — this chat is set to **${model}**. Codes from other units won't be found here.

If both are correct and the code still isn't there, it's likely outside the available manual coverage — escalate to the Technical Support Department with the code and the unit serial number.`;
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
      ? `Your question is about **${foreign}**, but this chat is set to **${activeModel}**.\n\nSwitch the unit to ${foreign} first, then I can answer from that unit's manual.\n\nAnything you'd like to check on ${activeModel}?`
      : `I don't have the **${foreign}** manual in my system yet. I only hold data for: ${UNIT_MODELS.join(', ')}.\n\nI can't help diagnose that unit — my answers have to come from the official manual, not guesswork.\n\nAnything you'd like to check on **${activeModel}**?`;
  }
  return supported
    ? `Pertanyaan kamu soal **${foreign}**, tapi chat ini di-set ke **${activeModel}**.\n\nGanti dulu unitnya ke ${foreign}, baru aku bisa jawab dari manual unit itu.\n\nAda yang mau dicek di ${activeModel}?`
    : `Manual **${foreign}** belum ada di sistemku. Aku cuma pegang data unit: ${UNIT_MODELS.join(', ')}.\n\nAku ngga bisa bantu diagnosa unit itu — jawabanku harus dari manual resmi, bukan kira-kira.\n\nAda yang mau dicek di **${activeModel}**?`;
}

export function offTopicTemplate(query = '', history: { role: string; content: string }[] = [], hint?: Lang | null): string {
  const lang = sessionLang(query, history, hint);
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
- Angka eksekusi-kritis (torque, tekanan, PN, clearance, fault code) DILARANG diklaim sebagai spec resmi unit. Nilai ukur komponen (resistansi, tegangan, arus, tekanan setel, clearance) JANGAN ditulis angkanya sama sekali — beri metode pembanding dengan komponen kembaran di unit yang sama + arahkan ke Technical Support Department.
- Fokus: prinsip kerja, alur diagnosa sistematis, penyebab probable, praktik standar industri.
- Cara mencari: kata kunci English dengan nama komponen persis seperti di manual, ditambah tipe unit atau engine-nya. Utamakan situs pabrikan (Hitachi Construction Machinery, Isuzu, Yanmar, pembuat komponennya) dan materi training teknis. Forum, marketplace, dan video TIDAK dijadikan dasar. Info untuk merk atau seri lain tidak boleh disajikan seolah berlaku untuk ${model}.
- Ringkas, actionable, register rekan teknisi. Jangan menyalin mentah hasil web — sintesiskan.`;

export const HYBRID_DIRECTIVE = (model: string, lemah: boolean): string =>
  `[SUMBER EKSTERNAL — PELENGKAP] Kamu boleh menelusuri web untuk MELENGKAPI data manual di atas. ${lemah
    ? 'Data manual di atas hanya yang PALING DEKAT dan relevansinya rendah: pakai bagian yang benar-benar menyangkut pertanyaan, abaikan sisanya, dan katakan terus terang apa yang belum ketemu di manual.'
    : 'Kalau data manual di atas sudah menjawab pertanyaannya, JANGAN menelusuri web dan jangan menambah apa pun dari luar.'} ATURAN WAJIB:
- Manual ${model} selalu menang. Angka, standar ukur, PN, torque, tekanan, fault code, dan urutan prosedur HANYA dari data manual di atas; web tidak boleh mengisi, mengganti, atau melengkapi angka yang tidak ada.
- Web hanya untuk yang tidak tertulis di data: cara kerja sistem atau komponen, arti istilah, kenapa gejala itu bisa terjadi, praktik pemeriksaan umum yang aman.
- Cara mencari: kata kunci English dengan nama komponen persis seperti di manual, ditambah tipe unit atau engine-nya. Utamakan situs pabrikan (Hitachi Construction Machinery, Isuzu, Yanmar, pembuat komponennya) dan materi training teknis. Forum, marketplace, dan video TIDAK dijadikan dasar. Info untuk merk atau seri lain tidak boleh disajikan seolah berlaku untuk ${model}.
- Di jawaban, pisahkan sumbernya: isi dari manual tetap bersitasi manual seperti biasa; isi dari web ditaruh sesudahnya di bawah label **Rujukan umum (bukan manual ${model}):** dan singkat. Web bertentangan dengan manual → ikuti manual.
- Tidak menemukan yang andal di web → jangan mengarang; cukup jawab dari manual.`;

export const webPelengkap = (): 'off' | 'low' | 'medium' => {
  const v = (process.env.WEB_PELENGKAP ?? 'low').toLowerCase();
  return v === 'off' || v === 'medium' ? v : 'low';
};

export function barisSumberWeb(sumber: Array<{ title?: string; uri?: string }> | undefined, lang: 'id' | 'en'): string {
  const nama = (sumber ?? []).map(s => {
    const t = (s.title ?? '').trim().toLowerCase().replace(/^www\./, '');
    if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(t)) return /(?:^|\.)google\.com$|vertexaisearch/.test(t) ? '' : t;
    try {
      const h = new URL(s.uri ?? '').hostname.toLowerCase().replace(/^www\./, '');
      return /vertexaisearch|googleusercontent|google\.com$/.test(h) ? '' : h;
    } catch { return ''; }
  }).filter(Boolean);
  const unik = [...new Set(nama)].slice(0, 4);
  return unik.length ? `${lang === 'en' ? 'Web references' : 'Rujukan web'}: ${unik.join(' · ')}` : '';
}
