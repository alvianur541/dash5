import type { EvidenceDocument } from './evidence';
import { callProxy, getText, INTENT_MODEL } from './vertex';
import { stage } from './telemetry';

export const COMPLETE_CONTEXT_CHARS = 18_000;
const PRESERVE_RE = /procedure|troubleshoot|inspection method|evaluation|preparation|disassembly|installation|removal|<table|^\s*\|/im;
export function compressionPlan(docs: readonly EvidenceDocument[]): number[] {
  if (docs.reduce((n, d) => n + d.content.length, 0) <= COMPLETE_CONTEXT_CHARS) return [];
  return docs.map((d, i) => ({ d, i })).filter(({ d }) => d.content.length > 8000
    && d.evidence_role === 'retrieved' && !PRESERVE_RE.test(d.content)).slice(0, 2).map(({ i }) => i);
}
async function extractEvidence(docs: EvidenceDocument[], query: string): Promise<EvidenceDocument[]> {
  const out = docs.map(d => ({ ...d }));
  await Promise.all(compressionPlan(docs).map(async i => {
    const d = docs[i];
    try {
      const res = await callProxy({
        contents: [{ role: 'user', parts: [{ text: `QUERY: ${query}\n\nDOCUMENT:\n${d.content}` }] }],
        systemInstruction: { parts: [{ text: 'Extract complete verbatim lines relevant to QUERY. Keep every number, PN, condition, negation, heading and source legend. Do not paraphrase. Never infer. If removal risks losing evidence, return original. No preamble.' }] },
        generationConfig: { maxOutputTokens: 4096, temperature: 0, thinkingConfig: { thinkingLevel: 'minimal' } },
      }, false, INTENT_MODEL);
      const text = getText(res.candidates?.[0]?.content?.parts ?? []).trim();
      const lines = text.split('\n').filter(l => l.trim());
      const mandatory = d.content.split('\n').filter(l => /\d|\b(?:not|no|without|unless|only|condition|legend)\b|^(?:Section|Document|Model|Kategori):/i.test(l));
      if (text.length >= 30 && text.length < d.content.length && lines.every(l => d.content.includes(l))
          && mandatory.every(l => text.includes(l))) out[i] = { ...d, content: text };
    } catch { /* keep original */ }
  }));
  return out;
}
export async function compressEvidence(docs: EvidenceDocument[], query: string): Promise<EvidenceDocument[]> {
  const fields = { calls: compressionPlan(docs).length, document_count: docs.length,
    input_bytes: docs.reduce((n, d) => n + Buffer.byteLength(d.content), 0), output_bytes: 0 };
  return stage('compression', async () => {
    const result = await extractEvidence(docs, query);
    fields.output_bytes = result.reduce((n, d) => n + Buffer.byteLength(d.content), 0);
    return result;
  }, fields);
}
