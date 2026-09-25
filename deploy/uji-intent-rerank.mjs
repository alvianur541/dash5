// Cloud Shell benchmark: intent classifier models (S2) and rerankers (S3). Run via deploy/uji-intent-rerank.sh.
import { readFileSync, existsSync } from 'node:fs';

const PROJECT = process.env.PROJECT;
const TOKEN = process.env.TOKEN;
const ROUNDS = Number(process.env.ROUNDS || 2);
const PART = process.argv[2] || 'all';
const CASES_FILE = process.env.CASES || `${process.env.HOME}/rerank-cases.json`;

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const p90 = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] : NaN; };
const sec = ms => (ms / 1000).toFixed(2);
const pad = (s, n) => String(s).padEnd(n);

async function timed(fn) {
  const t = performance.now();
  const r = await fn();
  return { ...r, ms: performance.now() - t };
}

// ---------- S2: intent model ----------
const src = readFileSync(new URL('../cloudrun/src/intent.ts', import.meta.url), 'utf8');
const SYS_FULL = src.split('const systemPrompt = `')[1].split(/`;\r?\n/)[0];
const SYS_SLIM = SYS_FULL.replace(/═══ EXAMPLES ═══[\s\S]*?(?=═══ OUTPUT FORMAT)/, '');

const userMsg = q => `Technician query: "${q}"

Output ONLY this JSON shape (single line, no other text):
{"shouldSearch":<bool>,"searchType":"technical"|"parts"|"general"|"off_topic","optimizedQuery":"<2-10 word English phrase>"}

shouldSearch=true: technical/parts queries → optimizedQuery filled.
shouldSearch=false: "general" (greetings/acknowledgment kerja) atau "off_topic" (di luar alat berat) → optimizedQuery="".`;

const INTENT_CASES = [
  ['berapa berat swing motor', 'technical'],
  ['Kondisi saat handle travel digerakkn rpm lngsung drop', 'technical'],
  ['ac ngga dingin', 'technical'],
  ['berapa nilai resistan fuel level sensor', 'technical'],
  ['Unit kecepatanny hnya max 5 km,,,tidak mau naik tp elektrik aman', 'technical'],
  ['Jelaskan fungsu regenerative valve', 'technical'],
  ['Cek torsi baut rocker arm engine', 'technical'],
  ['DA pressure brpa', 'technical'],
  ['Resealing lify cylinder tool', 'technical'],
  ['hidrolikny loyo', 'technical'],
  ['apa itu b50 dlm solar', 'technical'],
  ['apa itu ampere', 'technical'],
  ['Jika unit haris jalan sepanjang 20 km berpa lama waktu dia tempuh', 'technical'],
  ['Carikn sy part number pilot pump', 'parts'],
  ['Cek harga motor gas', 'parts'],
  ['Harga filter transmisi', 'parts'],
  ['HRga sprocket', 'parts'],
  ['Pket service 2000', 'parts'],
  ['part number kit seal lift cylinder', 'parts'],
  ['hei bro', 'general'],
  ['siapa kamu', 'general'],
  ['Hruskh sy percaya jawabanmu', 'general'],
  ['test koneksi', 'general'],
  ['in english', 'general'],
  ['Resep mie yg enak', 'off_topic'],
  ['Siapa penemu lampu', 'off_topic'],
  ['alamat hexindo jakarta', 'off_topic'],
];

const thinkingFor = {};
async function intentCall(model, sys, q) {
  const url = `https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT}/locations/global/publishers/google/models/${model}:generateContent`;
  const body = level => JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: userMsg(q) }] }],
    systemInstruction: { parts: [{ text: sys }] },
    generationConfig: { maxOutputTokens: 200, temperature: 0, thinkingConfig: { thinkingLevel: level } },
  });
  const level = thinkingFor[model] || 'minimal';
  let res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body(level) });
  if (res.status === 400 && level === 'minimal') {
    thinkingFor[model] = 'low';
    res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body('low') });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, err: data?.error?.message?.slice(0, 120) };
  const raw = (data.candidates?.[0]?.content?.parts ?? []).filter(p => !p.thought).map(p => p.text ?? '').join('');
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  let parsed = null;
  try { parsed = JSON.parse(raw.slice(s, e + 1)); } catch { /* counted as parse failure */ }
  return { ok: true, parsed, inTok: data.usageMetadata?.promptTokenCount };
}

async function runIntent() {
  const variants = (process.env.INTENT_MODELS || 'gemini-3.1-flash-lite,gemini-3.5-flash-lite')
    .split(',').map(m => ({ label: m, model: m, sys: SYS_FULL }));
  variants.push({ label: `${variants[0].model} (prompt tanpa contoh)`, model: variants[0].model, sys: SYS_SLIM });

  console.log(`\n=== S2 · Pemilah pertanyaan (analyzeIntent) — ${INTENT_CASES.length} pertanyaan nyata × ${ROUNDS} putaran ===`);
  for (const v of variants) {
    const w = await intentCall(v.model, v.sys, 'halo');
    if (!w.ok) { console.log(`  ${v.label}: GAGAL ${w.status} ${w.err}`); v.dead = true; }
  }
  const stats = new Map(variants.map(v => [v.label, { ms: [], right: 0, total: 0, parseFail: 0, inTok: 0, answers: {} }]));
  for (let r = 0; r < ROUNDS; r++) {
    for (const [q, want] of INTENT_CASES) {
      for (const v of variants) {
        if (v.dead) continue;
        const res = await timed(() => intentCall(v.model, v.sys, q));
        const st = stats.get(v.label);
        if (!res.ok) { st.total++; st.parseFail++; continue; }
        st.ms.push(res.ms); st.total++; st.inTok = res.inTok ?? st.inTok;
        if (!res.parsed) { st.parseFail++; continue; }
        if (res.parsed.searchType === want) st.right++;
        if (r === 0) st.answers[q] = `${res.parsed.searchType} "${res.parsed.optimizedQuery ?? ''}"`;
      }
    }
  }
  console.log(`\n${pad('Varian', 46)}${pad('median', 9)}${pad('p90', 9)}${pad('benar', 10)}${pad('JSON gagal', 12)}token masuk`);
  for (const v of variants) {
    if (v.dead) continue;
    const st = stats.get(v.label);
    console.log(`${pad(v.label, 46)}${pad(sec(median(st.ms)) + ' dtk', 9)}${pad(sec(p90(st.ms)) + ' dtk', 9)}${pad(`${st.right}/${st.total}`, 10)}${pad(st.parseFail, 12)}${st.inTok}`);
  }
  console.log(`thinkingLevel dipakai: ${variants.filter(v => !v.dead).map(v => `${v.model}=${thinkingFor[v.model] || 'minimal'}`).filter((x, i, a) => a.indexOf(x) === i).join(', ')}`);
  console.log('\nJawaban per pertanyaan (putaran 1):');
  for (const [q, want] of INTENT_CASES) {
    console.log(`- "${q}"  [harusnya: ${want}]`);
    for (const v of variants) if (!v.dead) console.log(`    ${pad(v.label, 44)} ${stats.get(v.label).answers[q] ?? '-'}`);
  }
}

// ---------- S3: reranker ----------
async function cohere(query, docs) {
  const res = await fetch('https://api.cohere.com/v2/rerank', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.COHERE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.COHERE_RERANK_MODEL || 'rerank-v4.0-fast', query, documents: docs.map(d => d.text), top_n: 10 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, err: JSON.stringify(data).slice(0, 160) };
  return { ok: true, order: data.results.map(r => docs[r.index].id) };
}

async function vertexRank(model, query, docs) {
  const res = await fetch(`https://discoveryengine.googleapis.com/v1/projects/${PROJECT}/locations/global/rankingConfigs/default_ranking_config:rank`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT },
    body: JSON.stringify({ model, query, topN: 10, ignoreRecordDetailsInResponse: true, records: docs.map(d => ({ id: String(d.id), content: d.text })) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, err: data?.error?.message?.slice(0, 200) };
  return { ok: true, order: (data.records ?? []).map(r => Number(r.id)) };
}

async function runRerank() {
  if (!existsSync(CASES_FILE)) { console.log(`\n=== S3 dilewati: ${CASES_FILE} tidak ada (upload rerank-cases.json ke home Cloud Shell) ===`); return; }
  const cases = JSON.parse(readFileSync(CASES_FILE, 'utf8'));
  const rankers = [];
  if (process.env.COHERE_API_KEY) rankers.push({ label: `Cohere ${process.env.COHERE_RERANK_MODEL || 'rerank-v4.0-fast'}`, fn: cohere });
  else console.log('  (Cohere dilewati: COHERE_API_KEY kosong)');
  for (const m of (process.env.VERTEX_RANKERS || 'semantic-ranker-fast-004,semantic-ranker-default-004').split(',')) {
    rankers.push({ label: `Google ${m}`, fn: (q, d) => vertexRank(m, q, d) });
  }

  console.log(`\n=== S3 · Rerank — ${cases.length} kasus × ${ROUNDS} putaran, ±${cases[0].docs.length} kandidat per kasus ===`);
  for (const rk of rankers) {
    const w = await rk.fn(cases[0].query, cases[0].docs);
    if (!w.ok) { console.log(`  ${rk.label}: GAGAL ${w.status} ${w.err}`); rk.dead = true; }
  }
  const stats = new Map(rankers.map(r => [r.label, { ms: [], top1: 0, top4: 0, mrr: 0, n: 0, pos: [] }]));
  for (let r = 0; r < ROUNDS; r++) {
    for (const c of cases) {
      for (const rk of rankers) {
        if (rk.dead) continue;
        const res = await timed(() => rk.fn(c.query, c.docs));
        const st = stats.get(rk.label);
        if (!res.ok) continue;
        st.ms.push(res.ms);
        if (r > 0) continue;
        const pos = res.order.findIndex(id => c.gold.includes(id));
        st.n++; st.pos.push(pos < 0 ? '>10' : pos + 1);
        if (pos === 0) st.top1++;
        if (pos >= 0 && pos < 4) st.top4++;
        if (pos >= 0) st.mrr += 1 / (pos + 1);
      }
    }
  }
  console.log(`\n${pad('Reranker', 40)}${pad('median', 9)}${pad('p90', 9)}${pad('juara #1', 10)}${pad('masuk 4 besar', 15)}MRR`);
  for (const rk of rankers) {
    if (rk.dead) continue;
    const st = stats.get(rk.label);
    console.log(`${pad(rk.label, 40)}${pad(sec(median(st.ms)) + ' dtk', 9)}${pad(sec(p90(st.ms)) + ' dtk', 9)}${pad(`${st.top1}/${st.n}`, 10)}${pad(`${st.top4}/${st.n}`, 15)}${(st.mrr / (st.n || 1)).toFixed(2)}`);
  }
  console.log('\nPeringkat jawaban benar per kasus (1 = paling atas, >10 = tidak masuk):');
  for (const [i, c] of cases.entries()) {
    console.log(`  ${pad(c.model + ' · ' + c.query, 52)} ${rankers.filter(r => !r.dead).map(r => `${r.label.split(' ').pop()}=${stats.get(r.label).pos[i]}`).join('  ')}`);
  }
}

if (!PROJECT || !TOKEN) { console.error('PROJECT dan TOKEN wajib di-set (jalankan lewat uji-intent-rerank.sh)'); process.exit(1); }
if (PART === 'all' || PART === 'intent') await runIntent();
if (PART === 'all' || PART === 'rerank') await runRerank();
