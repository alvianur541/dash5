import { SYSTEM_PROMPT, SYSTEM_PROMPT_CASUAL, jakartaTime } from './constants';

import { UnitModel, Message, InlineImage } from './types';
import { searchTechnicalManualMulti, searchEngineManual, extractSearchTerms, isPartsQuery, extractPartNumber, exactPartRows, getTroubleshootingKategori } from './rag';
import { deps } from './deps';
import { Part, VContent, VRequest, ThinkingLevel, MODEL, resetUsage, toInlineData } from './vertex';
import { callProxyStream, STREAM_CUT_NOTE, STREAM_HALT_NOTE, STREAM_LONG_NOTE, looksComplete } from './stream';
import { resolveAffirmative, isMultiAspectQuery } from './intent';
import { RERANK_DEGRADED_NOTE, EXTERNAL_DIRECTIVE, FALLBACK_RESPONSE, foreignModelTemplate, sessionLang, langDirective, imageCodesNotFoundTemplate } from './templates';
import { AgentEventEmit, historyToContents, extractFaultCodes, extractRelatedPCodes, detectForeignModel, detectFaultCodeInQuery, SERVICE_INTERVAL_RE, streamCanned, resolveFaultCodeQuery, resolvePartsQuery, resolveNaturalLanguageQuery, resolveMultiAspectQuery, isCasualExact, extractImageFacts, REDO_RE, type RagRouteResult } from './routes';

const MEDIUM_CAVEAT = `\n\n[CONFIDENCE: MEDIUM — data yang tertarik hanya sebagian cocok dengan pertanyaan. Jawab dari bagian yang relevan saja; kalau inti pertanyaan (angka/nilai/prosedur yang ditanya) TIDAK ada di data, katakan terus terang di kalimat PERTAMA bahwa bagian itu belum ketemu di data ini (jangan simpulkan manualnya tidak memuat), jangan menjawab hal lain seolah itu jawabannya. Jangan ngarang detail.]`;

const LEAK_RE = /^\s*\[(?:DATA MANUAL TERSEDIA|DATA PARTS CATALOG TERSEDIA|CONFIDENCE:[^\]]*|KODE TIDAK DITEMUKAN|ENGINE MANUAL|SUMBER EKSTERNAL|PETUNJUK KIT|ASPEK[^\]]*|Fault Code:[^\]]*)\]\s*\n?/gim;
const LEAK_META_RE = /^\s*(?:Document|Section|Model|Kategori):\s.*\n?/gim;

const LATEX_SYMBOL: Record<string, string> = {
  ge: '≥', geq: '≥', le: '≤', leq: '≤', rightarrow: '→', to: '→', leftarrow: '←', Rightarrow: '⇒',
  times: '×', pm: '±', approx: '≈', neq: '≠', circ: '°', deg: '°', Omega: 'Ω', Delta: 'Δ', mu: 'μ',
};

export function scrubLeaks(text: string): string {
  text = text.replace(/\$\s*\\([A-Za-z]+)\s*\$/g, (m, k: string) => LATEX_SYMBOL[k] ?? m);
  if (!/\[(?:DATA|CONFIDENCE|KODE TIDAK|ENGINE MANUAL|SUMBER EKS|PETUNJUK|ASPEK|Fault Code:)/.test(text)) return text;
  const before = text.length;
  let out = text.replace(LEAK_RE, '');
  const head = out.slice(0, 400);
  if (LEAK_META_RE.test(head)) out = head.replace(LEAK_META_RE, '') + out.slice(400);
  out = out.replace(/^\s+/, '');
  console.warn('[leak] label sistem dibersihkan dari output (%d → %d huruf)', before, out.length);
  return out;
}

const userTag = (userName: string) => `[Teknisi: ${userName} | ${jakartaTime()} WIB | Model AI: ${MODEL}]`;

async function systemForModel(unit: UnitModel, casual: boolean, aiModel: string, noCache = false): Promise<Pick<VRequest, 'systemInstruction' | 'cachedContent'>> {
  const text = casual ? SYSTEM_PROMPT_CASUAL(unit) : SYSTEM_PROMPT(unit);
  const key = `${casual ? 'casual' : 'main'}:${unit}`;
  const id = noCache ? null : await deps().cacheFor?.(aiModel, key, text).catch(() => null);
  return id ? { cachedContent: id } : { systemInstruction: { parts: [{ text }] } };
}

async function systemFor(unit: UnitModel, casual: boolean): Promise<Pick<VRequest, 'systemInstruction' | 'cachedContent'>> {
  deps().systemFor = (aiModel: string, noCache?: boolean) => systemForModel(unit, casual, aiModel, noCache === true);
  return systemForModel(unit, casual, MODEL);
}

export { MODEL, INTENT_MODEL } from './vertex';
export { callProxyStream, STREAM_CUT_NOTE, STREAM_HALT_NOTE } from './stream';
export { SERVICE_INTERVAL_RE, extractCpmPartsForInterval, detectFaultCodeInQuery } from './routes';
export { classifyAspect, fallbackDecompose, extractLastOffer, resolveAffirmative } from './intent';

const GROUNDING_SPEC_RE = /(\d+(?:[.,]\d+)?)\s*(N·?m|Nm|MPa|kPa|bar|psi|kgf?|mm|cm|rpm|°C|kW|HP|L\b|Ω|μm)\b/gi;
function normalizeNum(s: string): string {
  return s.replace(/,/g, '.').replace(/^0+(\d)/, '$1');
}
function verifyGrounding(answer: string, context: string): void {
  if (!context || !answer) return;
  const ctxNums = new Set((context.match(/\d+(?:[.,]\d+)?/g) ?? []).map(normalizeNum));
  const ungrounded: string[] = [];
  let total = 0;
  for (const m of answer.matchAll(GROUNDING_SPEC_RE)) {
    total++;
    if (!ctxNums.has(normalizeNum(m[1]))) ungrounded.push(m[0].trim());
  }
  if (total > 0 && ungrounded.length > 0) {
    console.warn('[grounding] %d/%d angka spec TIDAK ditemukan di data:', ungrounded.length, total, ungrounded.slice(0, 10));
  }
}

const WANTS_LIST_RE = /\b(?:list\w*|daftar\w*|semua|smua|lengkap\w*|sebutkan|tampilkan|kirim\w*)\b/i;
// Short but asking for a mechanism/procedure — brevity here removes the answer's substance.
const WANTS_DETAIL_RE = /\b(?:cara\s*kerja|caranya|bagaimana|gimana|kenapa|knp|mengapa|jelas\w*|fungsi\w*|prosedur|urutan|langkah\w*|detail\w*|rinci\w*|analisa\w*|analisis)\b/i;

// A new complaint is a fresh diagnosis, not a follow-up, even when it is short.
const NEW_PROBLEM_RE = /\b(?:(?:ngga?k?|nggak|gak|ga|tidak|tdk|tak)\s+(?:bisa|mau|jalan|nyala|hidup|kuat)|mati\w*|mogok|macet|lambat|lemot|bocor|overheat\w*|panas|rusak|error|trouble|alarm|bunyi)\b/i;

// "hei bro", "halo kak" — a greeting plus a filler word is still small talk.
function isSmallTalk(s: string): boolean {
  const words = s.trim().split(/\s+/);
  return isCasualExact(s) || (words.length <= 3 && isCasualExact(words[0]));
}

export function isShortFollowUp(trimmed: string, history: Message[]): boolean {
  const priorTalk = history.some(m => m.role === 'user' && !isSmallTalk(m.content));
  return priorTalk && trimmed.split(/\s+/).length <= 8 && !NEW_PROBLEM_RE.test(trimmed)
    && !detectFaultCodeInQuery(trimmed).isFaultCode && !WANTS_LIST_RE.test(trimmed)
    && !REDO_RE.test(trimmed) && !WANTS_DETAIL_RE.test(trimmed);
}

export const AC_CODE_RE = /^A\/?C\s*:?\s*(\d{1,2})$/i;

// A bare 2-digit AC code matches unrelated tables; search with context, then require the code row itself.
async function searchAcCode(code: string, num: string, model: UnitModel, topN: number): Promise<{ code: string; found: boolean; content: string }> {
  const r = await searchTechnicalManualMulti([`air conditioner fault code ${num}`], model, topN, getTroubleshootingKategori(model));
  const row = new RegExp(`(?:^|\n)\s*(?:Fault Code:\s*)?${num}\b`);
  return { code, found: r.hasResults && row.test(r.content), content: r.content };
}

// A photographed parts list: look up every code exactly and name the misses, so none is called absent.
export async function searchPhotoCodes(codes: string[], model: string, emit: AgentEventEmit): Promise<RagRouteResult | null> {
  emit({ type: 'thinking', message: `Terbaca ${codes.length} kode part — mencari satu per satu…` });
  emit({ type: 'tool_call', tool: 'search_parts_catalog' });
  const hits = await Promise.all(codes.map(c => exactPartRows(c, model)));
  const seen = new Set<string>();
  const promo: string[] = [], other: string[] = [], missing: string[] = [];
  codes.forEach((c, i) => {
    if (!hits[i].length) missing.push(c);
    for (const h of hits[i]) {
      if (seen.has(h.content)) continue;
      seen.add(h.content);
      (/^PROMO/.test(h.metadata?.Kategori ?? '') ? promo : other).push(h.content);
    }
  });
  emit({ type: 'tool_result', tool: 'search_parts_catalog', found: seen.size > 0 });
  if (!seen.size) return null;
  const miss = missing.length
    ? `\n\n[KODE BELUM KETEMU DI PENCARIAN]\n${missing.join(', ')} — sebut "belum ketemu di pencarian"; JANGAN bilang kode ini tidak terdaftar / tidak ada di promo atau katalog.`
    : '';
  return {
    type: 'rag_found',
    content: `Kode part terbaca di foto: ${codes.join(', ')}\n\n` + [...promo, ...other].slice(0, 8).join('\n\n---\n\n') + miss,
    dataLabel: 'DATA PARTS CATALOG & PROMO',
    confidence: 'high',
  };
}

export async function generateResponseStream(
  model: UnitModel,
  userName: string,
  history: Message[],
  userInput: string,
  onChunk: (text: string) => void,
  onAgentEvent?: AgentEventEmit,
): Promise<string> {
  resetUsage();
  const emit: AgentEventEmit = onAgentEvent ?? (() => {});

  const sanitized = userInput
    .slice(0, 4000)
    .replace(/\[(?:SYSTEM|INSTRUCTION|NEW\s+INSTRUCTION|OVERRIDE|IGNORE\s+PREVIOUS)[^\]]*\]/gi, '[blocked]')
    .replace(/<\|[^|]*\|>/g, '[blocked]');
  const trimmed  = sanitized.trim();

  const contents = historyToContents(history, 20);

  emit({ type: 'thinking', message: 'Menganalisa query…' });

  const offer = resolveAffirmative(trimmed, history);
  const q = offer ?? trimmed;
  if (offer) console.info('[offer] "%s" → tawaran diterima: "%s"', trimmed, offer);

  const lang = sessionLang(q, history);

  const foreignModel = detectForeignModel(q, model);
  if (foreignModel) {
    console.info('[scope] model asing terdeteksi: %s (aktif: %s)', foreignModel, model);
    return streamCanned(foreignModelTemplate(foreignModel, model, lang), onChunk);
  }

  const { isFaultCode, faultQuery } = detectFaultCodeInQuery(q);

  const hasServiceInterval = !isFaultCode && SERVICE_INTERVAL_RE.test(q);

  const routeResult = isFaultCode
    ? await resolveFaultCodeQuery(faultQuery, model, emit, lang)
    : isMultiAspectQuery(q)
      ? await resolveMultiAspectQuery(q, history, model, emit)
      : (isPartsQuery(q) || hasServiceInterval)
        ? await resolvePartsQuery(q, history, model, emit)
        : await resolveNaturalLanguageQuery(q, history, model, emit);

  if (routeResult.type === 'rag_canned') return streamCanned(routeResult.text, onChunk);

  const gsTechnical      = routeResult.type === 'google_search' && routeResult.mode === 'technical';
  const ragContent       = routeResult.type === 'rag_found'
    ? routeResult.content
        .replace(/Hitachi\s+Astrea\s*/gi, '')
        .replace(/\{?(mm|cm|m)\}?\^([23])\b/g, (_, u: string, d: string) => u + (d === '2' ? '²' : '³'))
    : '';
  const dataLabel        = routeResult.type === 'rag_found' ? routeResult.dataLabel : '';
  const ragConfidence    = routeResult.type === 'rag_found' ? routeResult.confidence : undefined;
  deps().meta.route      = routeResult.type === 'google_search' ? `google_${routeResult.mode}` : routeResult.type;
  deps().meta.label      = routeResult.type === 'rag_found' ? routeResult.dataLabel : undefined;
  deps().meta.confidence = ragConfidence;
  deps().meta.degraded   = routeResult.type === 'rag_found' && routeResult.rerankDegraded === true;
  const isCasual = routeResult.type === 'google_search' && routeResult.mode === 'casual';
  const thinkingLevel: ThinkingLevel = 'low';
  const isFollowUp = !offer && isShortFollowUp(trimmed, history);
  const maxOutputTokens  = ragContent ? (WANTS_LIST_RE.test(trimmed) ? 8192 : 4096) : gsTechnical ? 2048 : 1536;
  const followUpNote = isFollowUp && ragContent
    ? '\n[Ini pertanyaan lanjutan pendek. Jawab intinya dalam ≤ 8 kalimat atau 1 tabel kecil; boleh diawali satu kalimat pengantar singkat yang natural. Tanpa salam pembuka, tanpa mengulang penjelasan/karakteristik yang sudah ada di jawaban sebelumnya, tanpa heading kalau isinya cuma satu topik.]'
    : '';
  const rerankDegraded = routeResult.type === 'rag_found' && routeResult.rerankDegraded === true;
  const caveat = rerankDegraded
    ? RERANK_DEGRADED_NOTE
    : ragConfidence === 'medium'
      ? MEDIUM_CAVEAT
      : '';
  if (rerankDegraded) console.warn('[rerank] gagal — jawaban ditandai degraded ke teknisi');
  const shownQuery = offer ? `${trimmed}\n[User menerima tawaranmu di jawaban sebelumnya → yang diminta: ${offer}. Jawab langsung permintaan itu, jangan minta klarifikasi.]` : trimmed;
  const userText         = ragContent
    ? `${shownQuery || 'Halo'}${followUpNote}${caveat}\n\n[${dataLabel}]\n${ragContent}`
    : gsTechnical
      ? `${shownQuery}\n\n${EXTERNAL_DIRECTIVE(model)}`
      : (shownQuery || 'Halo');

  contents.push({ role: 'user', parts: [{ text: `${userTag(userName)}\n${userText}` }] });

  const fullText = scrubLeaks(await callProxyStream({
    contents,
    ...(await systemFor(model, isCasual)),
    generationConfig:  { maxOutputTokens, temperature: 0.3, thinkingConfig: { thinkingLevel } },
  }, onChunk, gsTechnical));

  if (routeResult.type === 'rag_found' && fullText
      && !fullText.includes(STREAM_CUT_NOTE.trim()) && !fullText.includes(STREAM_HALT_NOTE.trim())
      && !fullText.includes(STREAM_LONG_NOTE.trim())
      && looksComplete(fullText)) {
    deps().meta.cacheable = true;
  } else if (routeResult.type === 'rag_found' && fullText) {
    console.warn('[cache] jawaban tidak di-cache (%d huruf, tampak tidak utuh)', fullText.trim().length);
  }

  if (ragContent && fullText) verifyGrounding(fullText, ragContent);

  return fullText || FALLBACK_RESPONSE;
}

export async function generateResponse(
  model: UnitModel,
  userName: string,
  history: Message[],
  userInput: string,
  attachments: InlineImage[],
  onChunk: (text: string) => void,
  onAgentEvent?: AgentEventEmit,
): Promise<string> {
  resetUsage();
  const emit: AgentEventEmit = onAgentEvent ?? (() => {});
  const system = await systemFor(model, false);
  const contents: VContent[] = historyToContents(history);
  const currentParts: Part[] = [];
  const lang = sessionLang(userInput, history);

  emit({ type: 'thinking', message: 'Membaca foto…' });
  deps().meta.route = 'image';
  const imageParts = attachments
    .filter(a => a?.mimeType && a?.data)
    .map(toInlineData);
  if (imageParts.length === 0) return 'Maaf, gagal membaca file gambar.';
  let sendImageToModel = true;

  try {
    emit({ type: 'thinking', message: 'Memindai layar monitor untuk fault code…' });
    const imageScan = extractImageFacts(imageParts).catch(() => ({ pns: [] as string[], component: '' }));
    const faultCodes = await extractFaultCodes(imageParts);

    if (faultCodes.length > 0) {
      emit({
        type: 'thinking',
        message: faultCodes.length === 1
          ? `Terbaca kode ${faultCodes[0]} — mencocokkan ke manual…`
          : `Terbaca ${faultCodes.length} kode: ${faultCodes.join(', ')} — mencocokkan ke manual…`,
      });
      emit({ type: 'tool_call', tool: 'search_technical_manual' });
      const perCodeTopN = faultCodes.length >= 3 ? 2 : 3;
      const settled = await Promise.allSettled(
        faultCodes.map(async code => {
          const ac = code.match(AC_CODE_RE);
          if (ac) return searchAcCode(code, ac[1], model, perCodeTopN);
          const terms = extractSearchTerms(code);
          let result = await searchTechnicalManualMulti(terms, model, perCodeTopN);
          let content = result.content;

          if (result.hasResults) {
            const pCodes = extractRelatedPCodes(content, extractSearchTerms(code));
            if (pCodes.length > 0) {
              emit({ type: 'tool_call', tool: 'search_engine_manual' });
              const emResult = await searchEngineManual(pCodes, model);
              emit({ type: 'tool_result', tool: 'search_engine_manual', found: emResult.hasResults });
              if (emResult.hasResults) {
                content += '\n\n[ENGINE MANUAL]\n' + emResult.content;
              }
            }
          }

          return { code, found: result.hasResults, content };
        }),
      );

      const found: Array<{ code: string; content: string }> = [];
      const notFound: string[] = [];
      for (const r of settled) {
        if (r.status === 'fulfilled') {
          if (r.value.found) found.push({ code: r.value.code, content: r.value.content });
          else notFound.push(r.value.code);
        } else {
          console.warn('[generateResponse] Fault code search failed for one code:', r.reason instanceof Error ? r.reason.message : String(r.reason));
        }
      }

      emit({ type: 'tool_result', tool: 'search_technical_manual', found: found.length > 0 });

      if (found.length === 0 && notFound.length > 0) {
        return imageCodesNotFoundTemplate(notFound, model, lang);
      }

      const noteBase = userInput || 'Analisa fault code ini dan berikan diagnosis lengkap.';
      const note = `Fault code terdeteksi dari gambar: **${faultCodes.join(', ')}**\n\n` +
        `INSTRUKSI: Jelaskan SETIAP fault code di atas dalam heading terpisah (## Kode X). ` +
        `Jangan jadikan satu kode sebagai catatan/footnote kode lain. ` +
        `Kalau beberapa kode muncul di timestamp yang sama, analisa hubungannya setelah penjelasan masing-masing. ` +
        noteBase;

      let injection = `[DATA MANUAL TERSEDIA]\n${found.map(f => `[Fault Code: ${f.code}]\n${f.content}`).join('\n\n===\n\n')}`;

      if (notFound.length > 0) {
        injection += `\n\n[KODE TIDAK DITEMUKAN]\nKode berikut TIDAK ada di manual ${model}: ${notFound.join(', ')}.\nJANGAN karang detail/diagnosis untuk kode-kode ini.`;
      }

      sendImageToModel = false;
      currentParts.push({ text: `${note}\n\n${injection}` });
    } else {
      emit({ type: 'thinking', message: 'Tidak ada fault code terbaca — menganalisa kondisi visual…' });
      const q = userInput.trim();
      let ragBlock = '';
      const scan = await imageScan;
      const codes = extractPartNumber(q) ? [] : scan.pns;
      const listMode = codes.length >= 2 || (codes.length === 1 && extractPartNumber(codes[0]) !== codes[0]);
      const imagePN = listMode ? null : codes[0] ?? null;
      const partsAsk = isPartsQuery(q) || !!imagePN || listMode;
      let route: RagRouteResult | null = listMode ? await searchPhotoCodes(codes, model, emit) : null;
      if (imagePN) {
        emit({ type: 'thinking', message: `Terbaca part number ${imagePN} — mencari di katalog…` });
        route = await resolvePartsQuery(`${q} ${imagePN}`.trim(), history, model, emit);
      }
      // Captions rarely name the part ("carikan part number ini"), so search by what the photo shows.
      if (route?.type !== 'rag_found' && scan.component && partsAsk) {
        emit({ type: 'thinking', message: `Terlihat ${scan.component} — mencari di katalog…` });
        const byComponent = `${scan.component} part number`;
        route = await resolvePartsQuery(byComponent, [], model, emit, byComponent);
      }
      if (!route && (scan.component || (q.split(/\s+/).length >= 3 && !isCasualExact(q)))) {
        const searchQ = scan.component ? `${q} ${scan.component}`.trim() : q;
        route = isPartsQuery(q)
          ? await resolvePartsQuery(searchQ, history, model, emit)
          : await resolveNaturalLanguageQuery(searchQ, history, model, emit);
      }
      if (route?.type === 'rag_found') {
        deps().meta.label = route.dataLabel;
        deps().meta.confidence = route.confidence;
        const caveat = route.confidence === 'medium' ? MEDIUM_CAVEAT : '';
        ragBlock = `${caveat}\n\n[${route.dataLabel}]\n${route.content}`;
      }
      const ask = q || 'Analisa gambar ini dan berikan diagnosis atau informasi yang relevan.';
      currentParts.push({ text: ragBlock
        ? `${ask}\n[Foto terlampir sebagai konteks visual. Data manual di bawah adalah sumber angka/prosedur — foto hanya untuk membaca kondisi/nilai yang tampak.]${ragBlock}`
        : `${ask}\n[Tidak ada data manual yang cocok untuk pertanyaan ini. Jelaskan HANYA apa yang tampak di foto. JANGAN mengutip prosedur, angka, atau nama section manual dari ingatan, dan JANGAN menulis label/format dokumen apa pun. Kalau teknisi minta part number/harga: katakan pencarian katalog dari foto ini belum menemukan section yang cocok (JANGAN bilang katalognya tidak memuat part itu), sebutkan komponen yang tampak, lalu minta dia ketik nama komponennya (mis. "part number piston engine") supaya dicarikan.]` });
    }
  } catch (err) {
    console.error('Image fault code extraction failed:', err);
    emit({ type: 'thinking', message: 'Pembacaan kode gagal — menganalisa gambar langsung…' });
    currentParts.push({ text: userInput || 'Analisa gambar ini, identifikasi fault code, dan berikan diagnosis.' });
  }

  const directive = langDirective(lang);
  if (directive) currentParts.push({ text: directive });
  if (sendImageToModel) currentParts.unshift(...imageParts);

  contents.push({ role: 'user', parts: [{ text: userTag(userName) }, ...currentParts] });

  emit({ type: 'thinking', message: 'Menyusun diagnosis…' });

  const body: VRequest = {
    contents,
    ...system,
    generationConfig: {
      maxOutputTokens: sendImageToModel ? 8192 : 4096,
      temperature: 0.3,
      thinkingConfig: { thinkingLevel: 'low' },
    },
  };

  const streamed = scrubLeaks(await callProxyStream(body, onChunk));
  emit({ type: 'done' });
  return streamed || FALLBACK_RESPONSE;
}
