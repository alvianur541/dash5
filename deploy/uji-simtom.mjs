// Cloud Shell calibration for rag/symptom.ts: ranker candidates in two languages, then the small-model judge.
// Needs ~/simtom-index.json (built from the DB, not committed). Run via: bash deploy/uji-simtom.sh
import { readFileSync } from 'node:fs';

const PROJECT = process.env.PROJECT;
const TOKEN = process.env.TOKEN;
const MODEL = process.env.RANK_MODEL || 'semantic-ranker-fast-004';
const JUDGE = process.env.INTENT_MODEL || 'gemini-3.5-flash-lite';
const INDEX = JSON.parse(readFileSync(process.env.INDEX || `${process.env.HOME}/simtom-index.json`, 'utf8'));
// Same judge prompt production uses, read from source so the test cannot drift from it.
const VERIFY_SYS = readFileSync(new URL('../cloudrun/src/rag/symptom.ts', import.meta.url), 'utf8')
  .split('const VERIFY_SYS = `')[1].split(/`;\r?\n/)[0].replace('${MAX_PICK}', '2');
const summaryOf = e => `${e.title} — ${e.snippet.split('\n').slice(1).join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220)}`;

// [unit, Indonesian complaint, English intent query, title substrings that count as correct ([] = nothing should be added)]
const CASES = [
  ['ZX200-5G', 'Rpm engine drop saat handle travel digerakkn', 'engine speed drops stalls when traveling', ['Engine Ngedrop', 'E-13 -', 'E-10 -']],
  ['ZX200-5G', 'Saat handle travel digerakkn engine langsung drop', 'engine speed drops when travel lever operated', ['Engine Ngedrop', 'E-13 -', 'E-10 -']],
  ['ZX200-5G', 'Wiper tidak berfungsi', 'wiper not working', ['O-1', 'Wiper & Washer']],
  ['ZX200-5G', 'unit tidak bisa swing', 'swing not operating', ['S-1 -']],
  ['ZX200-5G', 'auto idle ngga fungsi', 'auto idle system not working', ['E-9 -']],
  ['ZX200-5G', 'pengecekan monitor mati', 'monitor display dead check', ['Monitor Mati']],
  ['ZX200-5G', 'travel kiri tidak jalan', 'left travel not operating', ['A-3 -', 'T-2 -']],
  ['ZX200-5G', 'boom turun sendiri', 'boom drifts down', ['F-10 -', 'Silinder Turun Sendiri']],
  ['ZX200-5G', 'engine susah hidup pagi hari', 'engine hard to start cold morning', ['E-14']],
  ['ZX200-5G', 'ac tidak dingin', 'air conditioner not cooling', ['AIR CONDITIONER', 'AC / Heater']],
  ['ZX200-5G', 'travel cepat tidak bisa', 'fast travel not selected', ['T-5']],
  ['ZX200-5G', 'semua gerakan lemah', 'all actuators slow weak', ['A-1 -', 'Semua Gerakan Lemah', 'F-1 -']],
  ['ZX200-5G', 'asap hitam keluar dari knalpot', 'black exhaust smoke', ['EXHAUST SMOKE']],
  ['ZW140', 'warning transmisi dan buzzer nyala sesekali di atas 13 km/jam', 'HST warning indicator buzzer lights intermittently', ['HST WARNING INDICATOR']],
  ['ZW140', 'Unit saat jalan di atas 13km/j akan muncul transmisi warning dan buzzer — lanjutan: Iya di gigi2', 'HST warning indicator buzzer 2nd speed above 13 km/h', ['HST WARNING INDICATOR']],
  ['ZW140', 'Saat mundur lemah', 'reverse travel weak', ['Travel System']],
  ['ZW140', 'buzzer di monitor tidak bunyi', 'monitor buzzer not sounding', ['BUZZER IN MONITOR']],
  ['ZW140', 'fuel gauge tidak bergerak', 'fuel gauge not working', ['FUEL GAUGE']],
  ['ZX48U-5A', 'travel lambat', 'travel slow', ['T-1:']],
  ['ZX65USB-5A', 'boom swing tidak jalan', 'boom swing not operating', ['BOOM SWING']],
  // Complaints the manual has no symptom section for: nothing should be added.
  ['ZX200-5G', 'kaca kabin retak', 'cab window glass cracked', []],
  ['ZX200-5G', 'selang hidrolik boom bocor', 'boom hydraulic hose leak', []],
  ['ZW140', 'ban bocor', 'tire flat puncture', []],
  ['ZW140', 'kursi operator goyang', 'operator seat loose', []],
];

async function rank(query, entries) {
  const records = entries.map((e, i) => ({ id: String(i), title: `Section: ${e.title}`.slice(0, 200), content: e.snippet }));
  const t = performance.now();
  const r = await fetch(`https://discoveryengine.googleapis.com/v1/projects/${PROJECT}/locations/global/rankingConfigs/default_ranking_config:rank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, 'x-goog-user-project': PROJECT },
    body: JSON.stringify({ model: MODEL, query, topN: entries.length, ignoreRecordDetailsInResponse: true, records }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`rank ${r.status}: ${data?.error?.message?.slice(0, 160)}`);
  const scores = new Array(entries.length).fill(0);
  for (const rec of data.records || []) scores[Number(rec.id)] = rec.score ?? 0;
  return { scores, ms: performance.now() - t };
}

async function judge(complaint, cands) {
  const list = cands.map((e, i) => `[${i + 1}] ${summaryOf(e)}`).join('\n');
  const t = performance.now();
  const r = await fetch(`https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT}/locations/global/publishers/google/models/${JUDGE}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `Complaint: "${complaint}"\n\nCandidates:\n${list}` }] }],
      systemInstruction: { parts: [{ text: VERIFY_SYS }] },
      generationConfig: { maxOutputTokens: 40, temperature: 0, thinkingConfig: { thinkingLevel: 'MINIMAL' } },
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`judge ${r.status}: ${data?.error?.message?.slice(0, 160)}`);
  const raw = (data.candidates?.[0]?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text).join('');
  const arr = raw.match(/\[[\d,\s]*\]/)?.[0];
  if (!arr) throw new Error(`bukan daftar angka: ${raw.slice(0, 60)}`);
  return { picked: [...new Set(JSON.parse(arr))].map(n => cands[n - 1]).filter(Boolean).slice(0, 2), ms: performance.now() - t };
}

const VARIANTS = {
  A: (id, en) => [`${en} — ${id}`],
  B: (_id, en) => [en],
  C: (id) => [id],
  D: (id, en) => [en, id],
};

const results = {};
const verdicts = [];
for (const [unit, id, en, want] of CASES) {
  const entries = INDEX[unit] || [];
  const ok = e => want.some(w => e.title.toLowerCase().includes(w.toLowerCase()));
  console.log(`\n### ${unit} | "${id}" | en: "${en}" | benar: ${want.join(' / ') || '(tidak ada)'}`);
  for (const [v, mk] of Object.entries(VARIANTS)) {
    const runs = await Promise.all(mk(id, en).map(q => rank(q, entries)));
    const scores = entries.map((_, i) => Math.max(...runs.map(r => r.scores[i])));
    const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
    const firstOk = order.findIndex(([, i]) => ok(entries[i]));
    (results[v] ??= []).push({ want: want.length > 0, top: order[0][0], topOk: want.length > 0 && ok(entries[order[0][1]]), okScore: firstOk >= 0 ? order[firstOk][0] : null });
    const ms = Math.max(...runs.map(r => r.ms));
    console.log(`  ${v} (${(ms / 1000).toFixed(2)} dtk) benar di #${firstOk >= 0 ? firstOk + 1 : '-'}: ` +
      order.slice(0, 3).map(([s, i]) => `${ok(entries[i]) ? '✓' : '·'}${s.toFixed(2)} ${entries[i].title.slice(0, 55)}`).join(' | '));

    // Production path: top 5 per query (English + technician's words), merged, then the judge picks.
    if (v !== 'D') continue;
    const best = new Map();
    for (const r of runs) {
      r.scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).slice(0, 5)
        .forEach(([s, i]) => best.set(i, Math.max(best.get(i) ?? 0, s)));
    }
    const cands = [...best].sort((a, b) => b[1] - a[1]).map(([i]) => entries[i]);
    const inCands = cands.some(ok);
    try {
      const { picked, ms: jms } = await judge(id, cands);
      const verdict = want.length
        ? (picked.length && ok(picked[0]) ? 'BENAR' : picked.length ? 'SALAH-SISIP' : 'TERLEWAT')
        : (picked.length ? 'SALAH-SISIP' : 'BENAR');
      verdicts.push({ verdict, inCands, want: want.length > 0 });
      console.log(`  VERIFIKATOR (${(jms / 1000).toFixed(2)} dtk, ${cands.length} kandidat, yang benar ${inCands ? 'ada' : 'TIDAK ada'} di kandidat): ${verdict} → ${picked.map(e => e.title.slice(0, 60)).join(' | ') || '(tidak ada)'}`);
    } catch (err) {
      verdicts.push({ verdict: 'ERROR', inCands, want: want.length > 0 });
      console.log(`  VERIFIKATOR error: ${err.message}`);
    }
  }
}

const count = v => verdicts.filter(x => x.verdict === v).length;
console.log(`\n=== JALUR PRODUKSI (kandidat 2 bahasa + verifikator ${JUDGE}) ===`);
console.log(`BENAR ${count('BENAR')}/${verdicts.length} · SALAH-SISIP ${count('SALAH-SISIP')} · TERLEWAT ${count('TERLEWAT')} · ERROR ${count('ERROR')} · section benar masuk kandidat ${verdicts.filter(x => x.want && x.inCands).length}/${verdicts.filter(x => x.want).length}`);

console.log('\n=== RINGKASAN reranker saja, per varian & ambang ===');
console.log('benar#1 = section benar di urutan 1 dan lolos ambang · salah-sisip = lolos ambang di urutan 1 tapi bukan section benar (termasuk kasus "tidak ada")');
for (const [v, rs] of Object.entries(results)) {
  const pos = rs.filter(r => r.want);
  const okScores = pos.map(r => r.okScore).filter(s => s != null).sort((a, b) => a - b);
  console.log(`\n${v}: #1 benar ${pos.filter(r => r.topOk).length}/${pos.length} · skor section benar min ${okScores[0]?.toFixed(2)} median ${okScores[Math.floor(okScores.length / 2)]?.toFixed(2)}`);
  for (const thr of [0.10, 0.15, 0.20, 0.25, 0.30]) {
    const hit = pos.filter(r => r.topOk && r.top >= thr).length;
    const wrong = rs.filter(r => !r.topOk && r.top >= thr).length;
    console.log(`  ambang ${thr.toFixed(2)}: benar#1 ${hit}/${pos.length} · salah-sisip ${wrong}/${rs.length}`);
  }
}
