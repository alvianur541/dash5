import type { EvidenceDocument } from './evidence';
interface GroundingClaim {
  component: string; attribute: string; value: string; unit: string; model: string;
  condition?: string; variant?: string; document_id?: string | number; section?: string;
}
const normalize = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/[`*]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function groundClaim(claim: GroundingClaim, docs: readonly EvidenceDocument[]): { status: 'supported' | 'missing' | 'unknown'; document_ids: Array<string | number | null> } {
  if (!claim.component || !claim.attribute || !claim.unit) return { status: 'unknown', document_ids: [] };
  const hits = docs.filter(d => (!d.model || d.model === claim.model)
    && (claim.document_id === undefined || d.document_id === claim.document_id)
    && (!claim.section || normalize(d.section ?? '') === normalize(claim.section)));
  const measurement = new RegExp(`(?:^|[^\\d.,])${escape(claim.value)}\\s*${escape(claim.unit)}(?![a-z/])`, 'i');
  const matched = hits.filter(d => {
    const heading = normalize(d.section ?? '');
    const rows = d.content.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? d.content.split('\n');
    const context = normalize(`${d.section ?? ''} ${rows.filter(row => !/\d+(?:[.,]\d+)?\s*(?:MPa|kPa|bar|psi|kg|mm|L|Ω|Nm|N·m|rpm)/i.test(row)).join(' ')}`);
    return rows.some(raw => {
      const row = normalize(raw);
      return measurement.test(row) && (row.includes(normalize(claim.component)) || heading.includes(normalize(claim.component)))
        && (row.includes(normalize(claim.attribute)) || heading.includes(normalize(claim.attribute)) || context.includes(normalize(claim.attribute)))
        && (!claim.condition || row.includes(normalize(claim.condition)))
        && (!claim.variant || row.includes(normalize(claim.variant)) || heading.includes(normalize(claim.variant)));
    });
  });
  return { status: matched.length ? 'supported' : hits.length ? 'unknown' : 'missing', document_ids: matched.map(d => d.document_id) };
}
export function auditMeasurements(answer: string, docs: readonly EvidenceDocument[], model: string): { checked: number; supported: number; unknown: number } {
  let checked = 0, supported = 0;
  const component = /travel device|swing motor|hst motor|main pump|pilot solenoid|solenoid valve|engine oil|boom cylinder|arm cylinder|bucket cylinder|undercarriage/i;
  const attr = /weight|berat|bore|diameter|stroke|pressure|tekanan|resistance|resistansi|capacity|kapasitas|refill|change|length|panjang|torque|torsi|wrench|kunci/i;
  const canonicalAttribute = (value: string) => ({ berat: 'weight', tekanan: 'pressure', resistansi: 'resistance',
    kapasitas: 'capacity', panjang: 'length', torsi: 'torque', kunci: 'wrench' }[value.toLowerCase()] ?? value);
  let activeComponent = '';
  for (const row of answer.split('\n')) {
    const foundComponent = component.exec(row)?.[0];
    if (foundComponent) activeComponent = foundComponent;
    for (const m of row.matchAll(/(\d+(?:[.,]\d+)?)\s*(MPa|kPa|bar|psi|kg|mm|L|Ω|Nm|N·m|rpm)(?![a-z/])/gi)) {
      checked++;
      const a = attr.exec(row)?.[0] ?? '';
      if (groundClaim({ component: foundComponent ?? activeComponent, attribute: canonicalAttribute(a),
        value: m[1], unit: m[2], model }, docs).status === 'supported') supported++;
    }
  }
  return { checked, supported, unknown: checked - supported };
}
