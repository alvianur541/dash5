// Cloud Shell benchmark: intent classifier models (S2) and rerankers (S3). Run via deploy/uji-intent-rerank.sh.
import { readFileSync, existsSync } from 'node:fs';

const PROJECT = process.env.PROJECT;
const TOKEN = process.env.TOKEN;
const ROUNDS = Number(process.env.ROUNDS || 2);
const PART = process.argv[2] || 'all';
const CASES_FILE = process.env.CASES || (existsSync(`${process.env.HOME}/rerank-cases-v2.json`) ? `${process.env.HOME}/rerank-cases-v2.json` : `${process.env.HOME}/rerank-cases.json`);

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const p90 = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] : NaN; };
const sec = ms => (ms / 1000).toFixed(2);
const pad = (s, n) => String(s).padEnd(n);

const rawFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), 20_000);
  try {
    const res = await rawFetch(url, { ...opts, signal: ctrl.signal });
    const body = await res.text();
    return { ok: res.ok, status: res.status, json: async () => JSON.parse(body) };
  } finally {
    clearTimeout(timer);
  }
};

async function timed(fn) {
  const t = performance.now();
  try {
    const r = await fn();
    return { ...r, ms: performance.now() - t };
  } catch (err) {
    return { ok: false, status: err?.name === 'TimeoutError' ? 'timeout 20 dtk' : 'error', err: String(err?.message ?? err).slice(0, 120), ms: performance.now() - t };
  }
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
    const w = await timed(() => intentCall(v.model, v.sys, 'halo'));
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
  return { ok: true, order: data.results.map(r => docs[r.index].id), scores: data.results.map(r => r.relevance_score) };
}

async function vertexRank(model, useTitle, query, docs) {
  const records = docs.map(d => (useTitle && d.title ? { id: String(d.id), title: d.title, content: d.text } : { id: String(d.id), content: d.text }));
  const res = await fetch(`https://discoveryengine.googleapis.com/v1/projects/${PROJECT}/locations/global/rankingConfigs/default_ranking_config:rank`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT },
    body: JSON.stringify({ model, query, topN: 10, ignoreRecordDetailsInResponse: true, records }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, err: data?.error?.message?.slice(0, 200) };
  const recs = data.records ?? [];
  return { ok: true, order: recs.map(r => Number(r.id)), scores: recs.map(r => r.score ?? 0) };
}

const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN; };

async function runRerank() {
  if (!existsSync(CASES_FILE)) { console.log(`\n=== S3 dilewati: ${CASES_FILE} tidak ada (upload file kasus ke home Cloud Shell) ===`); return; }
  const cases = JSON.parse(readFileSync(CASES_FILE, 'utf8')).map(c => ({ ...c, gold: [].concat(c.gold) }));
  const rankers = [];
  if (process.env.COHERE_API_KEY) rankers.push({ key: 'cohere', label: `Cohere ${process.env.COHERE_RERANK_MODEL || 'rerank-v4.0-fast'}`, fn: cohere });
  else console.log('  (Cohere dilewati: COHERE_API_KEY kosong)');
  const models = (process.env.VERTEX_RANKERS || 'semantic-ranker-fast-004,semantic-ranker-default-004,semantic-ranker-default-003,semantic-ranker-512-003').split(',');
  for (const m of models) {
    const short = m.replace('semantic-ranker-', 'g-');
    rankers.push({ key: short, label: `Google ${m}`, fn: (q, d) => vertexRank(m, false, q, d) });
  }
  for (const m of models.slice(0, 2)) {
    const short = m.replace('semantic-ranker-', 'g-') + '+judul';
    rankers.push({ key: short, label: `Google ${m} + judul section`, fn: (q, d) => vertexRank(m, true, q, d) });
  }

  const langs = cases.some(c => c.query_id) ? ['en', 'id'] : ['en'];
  console.log(`\n=== S3 · Rerank — ${cases.length} kasus, pertanyaan ${langs.join('+')}, latensi ${ROUNDS} putaran, ±${cases[0].docs.length} kandidat per kasus ===`);
  for (const rk of rankers) {
    const w = await timed(() => rk.fn(cases[0].query, cases[0].docs));
    console.log(`  cek ${rk.label}: ${w.ok ? 'OK' : 'GAGAL'} (${sec(w.ms)} dtk)`);
    if (!w.ok) { console.log(`  ${rk.label}: GAGAL ${w.status} ${w.err}`); rk.dead = true; }
  }
  const live = rankers.filter(r => !r.dead);
  const blank = () => ({ top1: 0, top4: 0, top10: 0, mrr: 0, n: 0, pos: [], gold: [], wrongTop: [], top: [] });
  const st = new Map(live.map(r => [r.key, { ms: [], en: blank(), id: blank() }]));

  const t0 = performance.now();
  for (let r = 0; r < ROUNDS; r++) {
    for (const [ci, c] of cases.entries()) {
      console.log(`  putaran ${r + 1}/${ROUNDS} · kasus ${ci + 1}/${cases.length} · ${c.model} · ${c.query} (${sec(performance.now() - t0)} dtk berjalan)`);
      for (const lang of (r === 0 ? langs : ['en'])) {
        const q = lang === 'en' ? c.query : c.query_id;
        if (!q) continue;
        for (const rk of live) {
          const res = await timed(() => rk.fn(q, c.docs));
          const s = st.get(rk.key);
          if (!res.ok) { if (r === 0) s[lang].pos.push('ERR'); continue; }
          if (lang === 'en') s.ms.push(res.ms);
          if (r > 0) continue;
          const acc = s[lang];
          const pos = res.order.findIndex(id => c.gold.includes(id));
          acc.n++; acc.pos.push(pos < 0 ? '>10' : String(pos + 1));
          acc.top.push(res.scores[0] ?? 0);
          if (pos === 0) acc.top1++;
          if (pos >= 0 && pos < 4) acc.top4++;
          if (pos >= 0) { acc.top10++; acc.mrr += 1 / (pos + 1); acc.gold.push(res.scores[pos]); }
          if (pos !== 0) acc.wrongTop.push(res.scores[0] ?? 0);
        }
      }
    }
  }

  for (const lang of langs) {
    console.log(`\n--- Pertanyaan ${lang === 'en' ? 'Inggris (yang dikirim sistem sekarang)' : 'Indonesia asli teknisi'} ---`);
    console.log(`${pad('Reranker', 54)}${lang === 'en' ? pad('median', 9) + pad('p90', 9) : ''}${pad('#1', 8)}${pad('4 besar', 9)}${pad('10 besar', 10)}MRR`);
    for (const rk of live) {
      const s = st.get(rk.key); const a = s[lang];
      const lat = lang === 'en' ? pad(sec(median(s.ms)) + ' dtk', 9) + pad(sec(p90(s.ms)) + ' dtk', 9) : '';
      console.log(`${pad(rk.label, 54)}${lat}${pad(`${a.top1}/${a.n}`, 8)}${pad(`${a.top4}/${a.n}`, 9)}${pad(`${a.top10}/${a.n}`, 10)}${(a.mrr / (a.n || 1)).toFixed(3)}`);
    }
  }

  console.log('\n--- Skala skor (untuk kalibrasi ambang keyakinan HIGH/MEDIUM, pertanyaan Inggris) ---');
  const coh = st.get('cohere');
  const cohHighShare = coh ? coh.en.top.filter(x => x >= 0.45).length / (coh.en.top.length || 1) : null;
  const cohMedShare = coh ? coh.en.top.filter(x => x >= 0.25).length / (coh.en.top.length || 1) : null;
  for (const rk of live) {
    const a = st.get(rk.key).en;
    let eq = '';
    if (cohHighShare !== null && rk.key !== 'cohere') {
      eq = ` · setara HIGH≥${quantile(a.top, 1 - cohHighShare).toFixed(2)} MEDIUM≥${quantile(a.top, 1 - cohMedShare).toFixed(2)}`;
    }
    console.log(`  ${pad(rk.key, 20)} skor jawaban benar p10=${quantile(a.gold, 0.1).toFixed(2)} p50=${quantile(a.gold, 0.5).toFixed(2)} · skor #1 saat SALAH p50=${quantile(a.wrongTop, 0.5).toFixed(2)} maks=${Math.max(0, ...a.wrongTop).toFixed(2)}${eq}`);
  }

  console.log('\nPeringkat jawaban benar per kasus (en/id; 1 = paling atas, >10 = tidak masuk):');
  console.log(`  ${pad('', 58)}${live.map(r => pad(r.key, 16)).join('')}`);
  for (const [i, c] of cases.entries()) {
    const cells = live.map(r => { const s = st.get(r.key); return pad(`${s.en.pos[i] ?? '-'}/${s.id.pos[i] ?? '-'}`, 16); }).join('');
    console.log(`  ${pad((c.model + ' · ' + c.query).slice(0, 56), 58)}${cells}`);
  }
}

if (!PROJECT || !TOKEN) { console.error('PROJECT dan TOKEN wajib di-set (jalankan lewat uji-intent-rerank.sh)'); process.exit(1); }
async function runCalibration() {
  if (!existsSync(CASES_FILE)) { console.log(`Kalibrasi dilewati: ${CASES_FILE} tidak ada`); return; }
  const cases = JSON.parse(readFileSync(CASES_FILE, 'utf8'));
  const words = q => new Set(q.toLowerCase().split(/\s+/).filter(w => w.length >= 4));
  const models = (process.env.VERTEX_RANKERS || 'semantic-ranker-fast-004').split(',');
  const rankers = [
    ...(process.env.COHERE_API_KEY ? [{ key: 'cohere', fn: cohere }] : []),
    ...models.map(m => ({ key: m.replace('semantic-ranker-', 'g-') + '+judul', fn: (q, d) => vertexRank(m, true, q, d) })),
  ];
  const pos = new Map(rankers.map(r => [r.key, []]));
  const neg = new Map(rankers.map(r => [r.key, []]));
  console.log(`\n=== Kalibrasi skor — ${cases.length} pertanyaan cocok vs ${cases.length} pertanyaan salah-alamat ===`);
  for (const [i, c] of cases.entries()) {
    const own = words(c.query);
    let j = (i + 7) % cases.length;
    for (let k = 0; k < cases.length; k++, j = (j + 1) % cases.length) {
      const other = words(cases[j].query);
      if (j !== i && ![...own].some(w => other.has(w))) break;
    }
    console.log(`  kasus ${i + 1}/${cases.length} · "${c.query}" · salah-alamat: "${cases[j].query}"`);
    for (const rk of rankers) {
      const a = await timed(() => rk.fn(c.query, c.docs));
      const b = await timed(() => rk.fn(cases[j].query, c.docs));
      if (a.ok) pos.get(rk.key).push(a.scores[0] ?? 0);
      if (b.ok) neg.get(rk.key).push(b.scores[0] ?? 0);
    }
  }
  const f = x => x.toFixed(2);
  console.log('\nSkor #1 — pertanyaan COCOK (datanya ada) vs SALAH-ALAMAT (datanya tidak ada):');
  for (const rk of rankers) {
    const p = pos.get(rk.key), n = neg.get(rk.key);
    console.log(`  ${pad(rk.key, 18)} cocok p10=${f(quantile(p, 0.1))} p25=${f(quantile(p, 0.25))} p50=${f(quantile(p, 0.5))} | salah-alamat p50=${f(quantile(n, 0.5))} p75=${f(quantile(n, 0.75))} p90=${f(quantile(n, 0.9))} maks=${f(Math.max(0, ...n))}`);
  }
  console.log('\nPorsi skor #1 ≥ ambang (cocok% / salah-alamat%):');
  const th = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6];
  console.log(`  ${pad('', 18)}${th.map(t => pad(t.toFixed(2), 10)).join('')}`);
  for (const rk of rankers) {
    const p = pos.get(rk.key), n = neg.get(rk.key);
    const pct = (a, t) => Math.round(100 * a.filter(x => x >= t).length / (a.length || 1));
    console.log(`  ${pad(rk.key, 18)}${th.map(t => pad(`${pct(p, t)}/${pct(n, t)}`, 10)).join('')}`);
  }
}

if (PART === 'kalibrasi') await runCalibration();
if (PART === 'all' || PART === 'intent') await runIntent();
if (PART === 'all' || PART === 'rerank') await runRerank();
