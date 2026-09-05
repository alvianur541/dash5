import { SYSTEM_PROMPT, SYSTEM_PROMPT_CASUAL, jakartaTime } from './constants';

import { UnitModel, Message, InlineImage } from './types';
import { searchTechnicalManualMulti, searchEngineManual, extractSearchTerms, isPartsQuery } from './rag';
import { deps } from './deps';
import { Part, VContent, VRequest, ThinkingLevel, MODEL, resetUsage, toInlineData } from './vertex';
import { callProxyStream, STREAM_CUT_NOTE, STREAM_HALT_NOTE, looksComplete } from './stream';
import { resolveAffirmative, isMultiAspectQuery } from './intent';
import { RERANK_DEGRADED_NOTE, EXTERNAL_DIRECTIVE, FALLBACK_RESPONSE, foreignModelTemplate } from './templates';
import { AgentEventEmit, historyToContents, extractFaultCodes, extractRelatedPCodes, detectForeignModel, detectFaultCodeInQuery, SERVICE_INTERVAL_RE, streamCanned, resolveFaultCodeQuery, resolvePartsQuery, resolveNaturalLanguageQuery, resolveMultiAspectQuery, isCasualExact } from './routes';

const MEDIUM_CAVEAT = `\n\n[CONFIDENCE: MEDIUM — data yang tertarik hanya sebagian cocok dengan pertanyaan. Jawab dari bagian yang relevan saja; kalau inti pertanyaan (angka/nilai/prosedur yang ditanya) TIDAK ada di data, katakan terus terang "tidak tercantum di data manual" di kalimat PERTAMA, jangan menjawab hal lain seolah itu jawabannya. Jangan ngarang detail.]`;

const LEAK_RE = /^\s*\[(?:DATA MANUAL TERSEDIA|DATA PARTS CATALOG TERSEDIA|CONFIDENCE:[^\]]*|KODE TIDAK DITEMUKAN|ENGINE MANUAL|SUMBER EKSTERNAL|PETUNJUK KIT|ASPEK[^\]]*|Fault Code:[^\]]*)\]\s*\n?/gim;
const LEAK_META_RE = /^\s*(?:Document|Section|Model|Kategori):\s.*\n?/gim;

export function scrubLeaks(text: string): string {
  if (!/\[(?:DATA |CONFIDENCE|KODE TIDAK|ENGINE MANUAL|SUMBER EKS|PETUNJUK|ASPEK|Fault Code:)/.test(text)) return text;
  const before = text.length;
  let out = text.replace(LEAK_RE, '');
  const head = out.slice(0, 400);
  if (LEAK_META_RE.test(head)) out = head.replace(LEAK_META_RE, '') + out.slice(400);
  out = out.replace(/^\s+/, '');
  console.warn('[leak] label sistem dibersihkan dari output (%d → %d huruf)', before, out.length);
  return out;
}

const userTag = (userName: string) => `[Teknisi: ${userName} | ${jakartaTime()} WIB | Model AI: ${MODEL}]`;

async function systemForModel(unit: UnitModel, casual: boolean, aiModel: string): Promise<Pick<VRequest, 'systemInstruction' | 'cachedContent'>> {
  const text = casual ? SYSTEM_PROMPT_CASUAL(unit) : SYSTEM_PROMPT(unit);
  const key = `${casual ? 'casual' : 'main'}:${unit}`;
  const id = await deps().cacheFor?.(aiModel, key, text).catch(() => null);
  return id ? { cachedContent: id } : { systemInstruction: { parts: [{ text }] } };
}

async function systemFor(unit: UnitModel, casual: boolean): Promise<Pick<VRequest, 'systemInstruction' | 'cachedContent'>> {
  deps().systemFor = (aiModel: string) => systemForModel(unit, casual, aiModel);
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

  const foreignModel = detectForeignModel(q, model);
  if (foreignModel) {
    console.info('[scope] model asing terdeteksi: %s (aktif: %s)', foreignModel, model);
    return streamCanned(foreignModelTemplate(foreignModel, model), onChunk);
  }

  const { isFaultCode, faultQuery } = detectFaultCodeInQuery(q);

  const hasServiceInterval = !isFaultCode && SERVICE_INTERVAL_RE.test(q);

  const routeResult = isFaultCode
    ? await resolveFaultCodeQuery(faultQuery, model, emit)
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
  const isFollowUp = history.length >= 2 && trimmed.split(/\s+/).length <= 8 && !detectFaultCodeInQuery(trimmed);
  const maxOutputTokens  = ragContent ? (isFollowUp ? 1200 : 4096) : gsTechnical ? 2048 : 1536;
  const followUpNote = isFollowUp && ragContent
    ? '\n[Ini pertanyaan lanjutan pendek. Jawab LANGSUNG intinya dalam ≤ 8 kalimat atau 1 tabel kecil. Tanpa salam pembuka, tanpa mengulang penjelasan/karakteristik yang sudah ada di jawaban sebelumnya, tanpa heading kalau isinya cuma satu topik.]'
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

  emit({ type: 'thinking', message: 'Membaca foto…' });
  deps().meta.route = 'image';
  const imageParts = attachments
    .filter(a => a?.mimeType && a?.data)
    .map(toInlineData);
  if (imageParts.length === 0) return 'Maaf, gagal membaca file gambar.';
  let sendImageToModel = true;

  try {
    emit({ type: 'thinking', message: 'Memindai layar monitor untuk fault code…' });
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
        const lines = notFound.map(c => `- Kode \`${c}\` tidak ada di database manual **${model}** yang saya akses.`).join('\n');
        return `Fault code terdeteksi dari gambar: **${notFound.join(', ')}**\n\n${lines}\n\nPastikan pembacaan kode benar dan model unit sesuai (saat ini di-set ke ${model}).`;
      }

      const noteBase = userInput || 'Analisa fault code ini dan berikan diagnosis lengkap.';
      const note = `Fault code terdeteksi dari gambar: **${faultCodes.join(', ')}**\n\n` +
        `INSTRUKSI: Jelaskan SETIAP fault code di atas dalam heading terpisah (## Kode X). ` +
        `Jangan jadikan satu kode sebagai catatan/footnote kode lain. ` +
        `Kalau beberapa kode muncul di timestamp yang sama, analisa hubungannya setelah penjelasan masing-masing. ` +
        noteBase;

      let injection = `[DATA MANUAL TERSEDIA]\n${found.map(f => `[Fault Code: ${f.code}]\n${f.content}`).join('\n\n===\n\n')}`;

      if (notFound.length > 0) {
        injection += `\n\n[KODE TIDAK DITEMUKAN]\nKode berikut TIDAK ada di database manual ${model}: ${notFound.join(', ')}.\nJANGAN karang detail/diagnosis untuk kode-kode ini.`;
      }

      sendImageToModel = false;
      currentParts.push({ text: `${note}\n\n${injection}` });
    } else {
      emit({ type: 'thinking', message: 'Tidak ada fault code terbaca — menganalisa kondisi visual…' });
      const q = userInput.trim();
      let ragBlock = '';
      if (q.split(/\s+/).length >= 3 && !isCasualExact(q)) {
        const route = isPartsQuery(q)
          ? await resolvePartsQuery(q, history, model, emit)
          : await resolveNaturalLanguageQuery(q, history, model, emit);
        if (route.type === 'rag_found') {
          deps().meta.label = route.dataLabel;
          deps().meta.confidence = route.confidence;
          const caveat = route.confidence === 'medium' ? MEDIUM_CAVEAT : '';
          ragBlock = `${caveat}\n\n[${route.dataLabel}]\n${route.content}`;
        }
      }
      const ask = q || 'Analisa gambar ini dan berikan diagnosis atau informasi yang relevan.';
      currentParts.push({ text: ragBlock
        ? `${ask}\n[Foto terlampir sebagai konteks visual. Data manual di bawah adalah sumber angka/prosedur — foto hanya untuk membaca kondisi/nilai yang tampak.]${ragBlock}`
        : `${ask}\n[Tidak ada data manual yang cocok untuk pertanyaan ini. Jelaskan HANYA apa yang tampak di foto. JANGAN mengutip prosedur, angka, atau nama section manual dari ingatan, dan JANGAN menulis label/format dokumen apa pun.]` });
    }
  } catch (err) {
    console.error('Image fault code extraction failed:', err);
    emit({ type: 'thinking', message: 'Pembacaan kode gagal — menganalisa gambar langsung…' });
    currentParts.push({ text: userInput || 'Analisa gambar ini, identifikasi fault code, dan berikan diagnosis.' });
  }

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
