import { SYSTEM_PROMPT, SYSTEM_PROMPT_CASUAL, jakartaTime } from './constants';

import { UnitModel, Message, InlineImage } from './types';
import { searchTechnicalManualMulti, searchEngineManual, extractSearchTerms, isPartsQuery, extractPartNumber, exactPartRows, getTroubleshootingKategori, isSymptomQuery, hargaWeb, blokHargaWeb, adaHarga, MINTA_HARGA_RE, KATA_HARGA_RE, lengkapiHarga } from './rag';
import { deps } from './deps';
import { resolveQuestion } from './question';
import { auditMeasurements } from './grounding';
import { evidenceBlocks } from './evidence';
import { stage } from './telemetry';
import { hargaPromo, promoAktif, tanpaHargaDb } from './promo';
import { Part, VContent, VRequest, ThinkingLevel, MODEL, resetUsage, toInlineData } from './vertex';
import { callProxyStream, STREAM_CUT_NOTE, STREAM_HALT_NOTE, STREAM_LONG_NOTE, looksComplete } from './stream';
import { resolveAffirmative, isMultiAspectQuery } from './intent';
import { RERANK_DEGRADED_NOTE, RAG_LABEL, EXTERNAL_DIRECTIVE, FALLBACK_RESPONSE, foreignModelTemplate, sessionLang, langDirective, imageCodesNotFoundTemplate } from './templates';
import { AgentEventEmit, historyToContents, extractFaultCodes, extractRelatedPCodes, detectForeignModel, detectFaultCodeInQuery, SERVICE_INTERVAL_RE, streamCanned, resolveFaultCodeQuery, resolvePartsQuery, resolveNaturalLanguageQuery, resolveMultiAspectQuery, isCasualExact, extractImageFacts, REDO_RE, type RagRouteResult } from './routes';

const MEDIUM_CAVEAT = `\n\n[CONFIDENCE: MEDIUM — data yang tertarik hanya sebagian cocok dengan pertanyaan. Jawab dari bagian yang relevan saja; kalau inti pertanyaan (angka/nilai/prosedur yang ditanya) TIDAK ada di data, katakan terus terang di kalimat PERTAMA bahwa bagian itu belum ketemu di data ini (jangan simpulkan manualnya tidak memuat), jangan menjawab hal lain seolah itu jawabannya. Jangan ngarang detail.]`;

const LEAK_RE = /^\s*\[(?:DATA MANUAL TERSEDIA|DATA PARTS CATALOG TERSEDIA|CONFIDENCE:[^\]]*|KODE TIDAK DITEMUKAN|ENGINE MANUAL|SUMBER EKSTERNAL|PETUNJUK KIT|ASPEK[^\]]*|SIMTOM[^\]]*|Fault Code:[^\]]*)\]\s*\n?/gim;
const LEAK_META_RE = /^\s*(?:Document|Section|Model|Kategori):\s.*\n?/gim;

const LATEX_SYMBOL: Record<string, string> = {
  ge: '≥', geq: '≥', le: '≤', leq: '≤', rightarrow: '→', to: '→', leftarrow: '←', Rightarrow: '⇒',
  times: '×', pm: '±', approx: '≈', neq: '≠', circ: '°', deg: '°', Omega: 'Ω', Delta: 'Δ', mu: 'μ',
};

export function scrubLeaks(text: string): string {
  text = text.replace(/\$\s*\\([A-Za-z]+)\s*\$/g, (m, k: string) => LATEX_SYMBOL[k] ?? m);
  if (!/\[(?:DATA|CONFIDENCE|KODE TIDAK|ENGINE MANUAL|SUMBER EKS|PETUNJUK|ASPEK|SIMTOM|Fault Code:)/.test(text)) return text;
  const before = text.length;
  let out = text.replace(LEAK_RE, '');
  const head = out.slice(0, 400);
  if (LEAK_META_RE.test(head)) out = head.replace(LEAK_META_RE, '') + out.slice(400);
  out = out.replace(/^\s+/, '');
  console.warn('[leak] label sistem dibersihkan dari output (%d → %d huruf)', before, out.length);
  return out;
}

// The model cannot reliably count its own greetings, so later turns are marked explicitly.
const userTag = (userName: string, history: Message[]) =>
  `[Teknisi: ${userName} | ${jakartaTime()} WIB | Model AI: ${MODEL}${
    history.some(m => m.role === 'assistant') ? ' | Jawaban lanjutan: JANGAN buka dengan salam waktu atau nama' : ''}]`;

// Never let the price safety net break an answer: on any error the original text stands.
async function lengkapiHargaAman(text: string, data = '', history: Message[] = []): Promise<string> {
  const sebelumnya = history.filter(m => m.role === 'assistant').slice(-2).map(m => m.content).join('\n\n');
  try { return await lengkapiHarga(text, promoAktif() ? hargaPromo(data) : new Map(), sebelumnya); } catch (err) {
    console.warn('[harga-susulan] gagal: %s', (err as Error)?.message);
    return text;
  }
}

function systemFor(unit: UnitModel, casual: boolean): Pick<VRequest, 'systemInstruction'> {
  return { systemInstruction: { parts: [{ text: casual ? SYSTEM_PROMPT_CASUAL(unit) : SYSTEM_PROMPT(unit) }] } };
}

function sanitize(input: string): string {
  return input
    .slice(0, 4000)
    .replace(/\[(?:SYSTEM|INSTRUCTION|NEW\s+INSTRUCTION|OVERRIDE|IGNORE\s+PREVIOUS)[^\]]*\]/gi, '[blocked]')
    .replace(/<\|[^|]*\|>/g, '[blocked]')
    .trim();
}

export { MODEL, INTENT_MODEL } from './vertex';
export { callProxyStream, STREAM_CUT_NOTE, STREAM_HALT_NOTE } from './stream';
export { SERVICE_INTERVAL_RE, extractCpmPartsForInterval, detectFaultCodeInQuery } from './routes';
export { classifyAspect, fallbackDecompose, extractLastOffer, resolveAffirmative } from './intent';



const WANTS_LIST_RE = /\b(?:list\w*|daftar\w*|semua|smua|lengkap\w*|sebutkan|tampilkan|kirim\w*|paket|package|overhaul\w*|reseal\w*|oh)\b/i;
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

// Backslashes must be doubled: this is a template literal, so `\s` would become a plain "s".
export const acRowRe = (num: string): RegExp => new RegExp(`(?:^|\\n)\\s*(?:Fault Code:\\s*)?${num}\\b`);

// A bare 2-digit AC code matches unrelated tables; search with context, then require the code row itself.
async function searchAcCode(code: string, num: string, model: UnitModel, topN: number): Promise<{ code: string; found: boolean; content: string }> {
  const r = await searchTechnicalManualMulti([`air conditioner fault code ${num}`], model, topN, getTroubleshootingKategori(model));
  return { code, found: r.hasResults && acRowRe(num).test(r.content), content: r.content };
}

// A photographed parts list: look up every code exactly and name the misses, so none is called absent.
export async function searchPhotoCodes(codes: string[], model: string, emit: AgentEventEmit): Promise<RagRouteResult | null> {
  emit({ type: 'thinking', message: `Terbaca ${codes.length} kode part — mencari satu per satu…` });
  emit({ type: 'tool_call', tool: 'search_parts_catalog' });
  const [hits, web] = await Promise.all([Promise.all(codes.map(c => exactPartRows(c, model))), hargaWeb(codes)]);
  const seen = new Set<string>();
  const promo: string[] = [], other: string[] = [], missing: string[] = [];
  codes.forEach((c, i) => {
    if (!hits[i].length && !adaHarga(web, c)) missing.push(c);
    for (const h of hits[i]) {
      if (seen.has(h.content)) continue;
      seen.add(h.content);
      (/^PROMO/.test(h.metadata?.Kategori ?? '') ? promo : other).push(h.content);
    }
  });
  const adaDiWeb = adaHarga(web);
  emit({ type: 'tool_result', tool: 'search_parts_catalog', found: seen.size > 0 || adaDiWeb });
  if (!seen.size && !adaDiWeb) return null;
  const webBlok = blokHargaWeb(web);
  const miss = missing.length
    ? `\n\n[KODE BELUM KETEMU DI PENCARIAN]\n${missing.join(', ')} — sebut "belum ketemu di pencarian"; JANGAN bilang kode ini tidak terdaftar / tidak ada di promo atau katalog.`
    : '';
  return {
    type: 'rag_found',
    content: `Kode part terbaca di foto: ${codes.join(', ')}\n\n` + [webBlok, ...promo, ...other].filter(Boolean).slice(0, 9).join('\n\n---\n\n') + miss,
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

  const trimmed = sanitize(userInput);

  const contents = historyToContents(history, 20);

  emit({ type: 'thinking', message: 'Menganalisa query…' });

  const offer = resolveAffirmative(trimmed, history);
  const resolved = await stage('resolve', async () => resolveQuestion(trimmed, history, model, offer));
  deps().resolvedQuestion = resolved;
  const q = resolved.text;

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
  const promoOn          = promoAktif();
  const ragRaw           = routeResult.type === 'rag_found'
    ? routeResult.content
        .replace(/Hitachi\s+Astrea\s*/gi, '')
        .replace(/\{?(mm|cm|m)\}?\^([23])\b/g, (_, u: string, d: string) => u + (d === '2' ? '²' : '³'))
    : '';
  const ragContent       = promoOn ? ragRaw : tanpaHargaDb(ragRaw);
  const dataLabel        = routeResult.type === 'rag_found' ? routeResult.dataLabel : '';
  const ragConfidence    = routeResult.type === 'rag_found' ? routeResult.confidence : undefined;
  deps().meta.route      = routeResult.type === 'google_search' ? `google_${routeResult.mode}` : routeResult.type;
  deps().meta.confidence = ragConfidence;
  deps().meta.degraded   = routeResult.type === 'rag_found' && routeResult.rerankDegraded === true;
  const isCasual = routeResult.type === 'google_search' && routeResult.mode === 'casual';
  const isFollowUp = !offer && isShortFollowUp(trimmed, history);
  const recentComplaint = trimmed.split(/\s+/).length <= 8
    && history.filter(m => m.role === 'user').slice(-2).some(m => isSymptomQuery(m.content));
  // Diagnosis and explanations think at medium; spec/PN/price lookups only quote a row, so low keeps them fast (Alvian, 2 Oct).
  const diagnostic = isFaultCode || isSymptomQuery(q) || WANTS_DETAIL_RE.test(q) || recentComplaint;
  const thinkingLevel: ThinkingLevel = isCasual || dataLabel === RAG_LABEL.parts || !diagnostic ? 'low' : 'medium';
  // Thinking tokens count against maxOutputTokens — medium needs headroom or long answers end in MAX_TOKENS.
  const thinkHeadroom    = thinkingLevel === 'medium' ? 4096 : 0;
  const maxOutputTokens  = (ragContent ? (WANTS_LIST_RE.test(trimmed) ? 8192 : 4096) : gsTechnical ? 2048 : 1536) + thinkHeadroom;
  const followUpNote = isFollowUp && ragContent
    ? '\n[Ini pertanyaan lanjutan pendek. Jawab intinya dalam ≤ 8 kalimat atau 1 tabel kecil; boleh diawali satu kalimat pengantar singkat yang natural. Tanpa salam pembuka, tanpa mengulang penjelasan/karakteristik yang sudah ada di jawaban sebelumnya, tanpa heading kalau isinya cuma satu topik.]'
    : '';
  const rerankDegraded = routeResult.type === 'rag_found' && routeResult.rerankDegraded === true;
  const caveat = rerankDegraded
    ? RERANK_DEGRADED_NOTE
    : ragConfidence !== 'high'
      ? MEDIUM_CAVEAT
      : '';
  if (rerankDegraded) console.warn('[rerank] gagal — jawaban ditandai degraded ke teknisi');
  const shownQuery = offer ? `${trimmed}\n[User menerima tawaranmu di jawaban sebelumnya → yang diminta: ${offer}. Jawab langsung permintaan itu, jangan minta klarifikasi.]` : trimmed;
  const userText         = ragContent
    ? `${shownQuery || 'Halo'}${followUpNote}${caveat}\n\n[${dataLabel}]\n${ragContent}`
    : gsTechnical
      ? `${shownQuery}\n\n${EXTERNAL_DIRECTIVE(model)}`
      : (shownQuery || 'Halo');

  contents.push({ role: 'user', parts: [{ text: `${userTag(userName, history)}\n${userText}` }] });

  const fullText = await lengkapiHargaAman(scrubLeaks(await callProxyStream({
    contents,
    ...systemFor(model, isCasual),
    generationConfig:  { maxOutputTokens, temperature: 0.3, thinkingConfig: { thinkingLevel } },
  }, onChunk, gsTechnical)), ragContent, history);

  if (routeResult.type === 'rag_found' && fullText
      && !fullText.includes(STREAM_CUT_NOTE.trim()) && !fullText.includes(STREAM_HALT_NOTE.trim())
      && !fullText.includes(STREAM_LONG_NOTE.trim())
      && looksComplete(fullText)) {
    deps().meta.cacheable = true;
  } else if (routeResult.type === 'rag_found' && fullText) {
    console.warn('[cache] jawaban tidak di-cache (%d huruf, tampak tidak utuh)', fullText.trim().length);
  }

  if (ragContent && fullText && routeResult.type === 'rag_found') {
    const audit = auditMeasurements(fullText, routeResult.evidence ?? evidenceBlocks(ragContent), model);
    deps().meta.groundingUnknown = audit.unknown;
    if (audit.unknown) deps().meta.cacheable = false;
    console.info('[grounding] checked=%d supported=%d unknown=%d', audit.checked, audit.supported, audit.unknown);
  }

  return fullText || FALLBACK_RESPONSE;
}

export async function generateResponse(
  model: UnitModel,
  userName: string,
  history: Message[],
  rawInput: string,
  attachments: InlineImage[],
  onChunk: (text: string) => void,
  onAgentEvent?: AgentEventEmit,
): Promise<string> {
  resetUsage();
  const emit: AgentEventEmit = onAgentEvent ?? (() => {});
  const userInput = sanitize(rawInput);
  deps().resolvedQuestion = resolveQuestion(userInput, history, model);
  const system = systemFor(model, false);
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
  let dataFoto = '';
  // Photo + parts/price ask ("cek harga kit sealnya") is a lookup, not a diagnosis: medium thinking added ~6 s
  // before the first word (log median 8.2 s vs 2.0 s on low). Fault codes and visual diagnosis keep medium.
  let thinkFoto: ThinkingLevel = 'medium';

  try {
    emit({ type: 'thinking', message: 'Memindai layar monitor untuk fault code…' });
    const imageScan = stage('ocr', () => extractImageFacts(imageParts), { lane: 'image_facts' }).catch(() => ({ pns: [] as string[], component: '' }));
    const faultCodes = await stage('ocr', () => extractFaultCodes(imageParts), { lane: 'fault_codes' });

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
          const result = await searchTechnicalManualMulti(terms, model, perCodeTopN);
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
      // "cek hrgany" + photo (Reyhan, 4 Oct): a price ask must reach hexindoparts.com even when the caption names no part.
      // "berapa" alone asks pressures and weights too; only real price words send a photo to the parts route.
      const hargaFoto = KATA_HARGA_RE.test(q);
      console.info('[foto] komponen=%s pn=%s harga=%s', scan.component || '-', codes.join(',') || '-', hargaFoto ? 1 : 0);
      const partsAsk = isPartsQuery(q) || !!imagePN || listMode || hargaFoto;
      let route: RagRouteResult | null = listMode ? await searchPhotoCodes(codes, model, emit) : null;
      if (imagePN) {
        emit({ type: 'thinking', message: `Terbaca part number ${imagePN} — mencari di katalog…` });
        route = await resolvePartsQuery(`${q} ${imagePN}`.trim(), history, model, emit, undefined, false);
      }
      // Captions rarely name the part ("carikan part number ini"), so search by what the photo shows.
      if (route?.type !== 'rag_found' && scan.component && partsAsk) {
        emit({ type: 'thinking', message: `Terlihat ${scan.component} — mencari di katalog…` });
        // Keep the caption's part words ("kit seal") with the component, else the price check picks the
        // cylinders themselves and the seal kits stay "Ketik PN untuk cek" (Alvian 4 Oct, KCM 60ZV photo).
        const byComponent = hargaFoto ? `harga ${q.replace(MINTA_HARGA_RE, ' ').replace(/\s+/g, ' ').trim()} ${scan.component}`.replace(/\s+/g, ' ') : `${scan.component} part number`;
        route = await resolvePartsQuery(byComponent, [], model, emit, byComponent, false);
      }
      if (!route && (scan.component || (q.split(/\s+/).length >= 3 && !isCasualExact(q)))) {
        const searchQ = scan.component ? `${q} ${scan.component}`.trim() : q;
        route = isPartsQuery(q) || hargaFoto
          ? await resolvePartsQuery(searchQ, history, model, emit, undefined, false)
          : await resolveNaturalLanguageQuery(searchQ, history, model, emit, false);
      }
      if (route?.type === 'rag_found' && partsAsk && (route.dataLabel === RAG_LABEL.parts || listMode)) thinkFoto = 'low';
      if (route?.type === 'rag_found') {
        deps().meta.confidence = route.confidence;
        const caveat = route.confidence !== 'high' ? MEDIUM_CAVEAT : '';
        ragBlock = `${caveat}\n\n[${route.dataLabel}]\n${route.content}`;
        if (!promoAktif()) ragBlock = tanpaHargaDb(ragBlock);
        dataFoto = ragBlock;
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

  contents.push({ role: 'user', parts: [{ text: userTag(userName, history) }, ...currentParts] });

  emit({ type: 'thinking', message: 'Menyusun diagnosis…' });

  const body: VRequest = {
    contents,
    ...system,
    generationConfig: {
      maxOutputTokens: (sendImageToModel ? 8192 : 4096) + 4096,
      temperature: 0.3,
      thinkingConfig: { thinkingLevel: thinkFoto },
    },
  };

  const streamed = await lengkapiHargaAman(scrubLeaks(await callProxyStream(body, onChunk)), dataFoto, history);
  return streamed || FALLBACK_RESPONSE;
}
