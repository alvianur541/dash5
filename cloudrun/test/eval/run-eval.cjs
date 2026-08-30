// Live retrieval evaluation against a running backend (production or local).
//   DASH5_API=https://dash5.my.id/api DASH5_JWT=<supabase access token> node test/eval/run-eval.cjs [--only FC] [--limit 20]
// The JWT is a technician login token (app localStorage `sb-*-auth-token` -> access_token). Never commit it.
const fs = require('fs');
const path = require('path');

const API = (process.env.DASH5_API || '').replace(/\/$/, '');
const JWT = process.env.DASH5_JWT || '';
if (!API || !JWT) { console.error('Set DASH5_API dan DASH5_JWT dulu.'); process.exit(2); }

const args = process.argv.slice(2);
const only  = args.includes('--only')  ? args[args.indexOf('--only') + 1]  : null;
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../supabase/tests/rag_eval_dataset.json'), 'utf8'));
let cases = dataset.cases.filter(c => !only || c.id.startsWith(only)).slice(0, limit);

async function ask(c) {
  const t0 = Date.now();
  const res = await fetch(`${API}/v1/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${JWT}` },
    body: JSON.stringify({ model: c.model, userName: 'Eval', history: [], userInput: c.query, debug: true, think: 'low' }),
  });
  if (!res.ok) return { error: `HTTP ${res.status}`, ms: Date.now() - t0 };
  const raw = await res.text();
  let meta = null, text = '', ttft = 0, errorMsg = null;
  for (const block of raw.split('\n\n')) {
    const ev = block.match(/^event: (\w+)/m)?.[1];
    const data = block.match(/^data: (.*)$/m)?.[1];
    if (!ev || !data) continue;
    let json; try { json = JSON.parse(data); } catch { continue; }
    if (ev === 'text') { if (!ttft) ttft = Date.now() - t0; text += json.text || ''; }
    if (ev === 'meta') meta = json;
    if (ev === 'error') errorMsg = json.message;
  }
  return { meta, text: meta?.full || text, ttft, ms: Date.now() - t0, error: errorMsg };
}

const ABSTAIN_RE = /tidak (tercantum|tersedia|ada) di (data|database|manual)|tidak ditemukan|di luar (cakupan|lingkup)|out of topic|konfirmasi (langsung )?ke (tim )?(sales|parts counter|technical support)/i;

function score(c, r) {
  const chunks = r.meta?.debug?.chunks || [];
  const route  = r.meta?.debug?.route || (r.text && chunks.length === 0 ? 'no_debug' : null);
  const kats   = new Set(chunks.map(k => k.kategori));
  const models = new Set(chunks.map(k => k.model).filter(Boolean));
  const catHit = c.expected_categories.length === 0 ? null : c.expected_categories.some(k => kats.has(k));
  const litHit = c.expect_literal ? chunks.some(k => (k.section || '').includes(c.expect_literal)) || (r.text || '').includes(c.expect_literal) : null;
  const leak   = [...models].some(m => m !== c.model);
  const routeOk = c.expected_route === 'any' ? null
    : c.expected_route === 'casual' ? (chunks.length === 0)
    : route === c.expected_route;
  const abstained = ABSTAIN_RE.test(r.text || '');
  const abstainOk = c.must_abstain ? abstained : null;
  return { route, catHit, litHit, leak, routeOk, abstainOk, confidence: r.meta?.debug?.confidence || null, nChunks: chunks.length, kats: [...kats] };
}

(async () => {
  const rows = [];
  for (const c of cases) {
    process.stdout.write(`${c.id.padEnd(7)} ${c.model.padEnd(11)} ${c.query.slice(0, 60).padEnd(62)}`);
    let r;
    try { r = await ask(c); } catch (e) { r = { error: e.message, ms: 0 }; }
    if (r.error) { console.log(`ERROR ${r.error}`); rows.push({ ...c, error: r.error }); continue; }
    const s = score(c, r);
    const mark = (v) => v === null ? '·' : v ? '✓' : '✗';
    console.log(`kat=${mark(s.catHit)} lit=${mark(s.litHit)} route=${mark(s.routeOk)} abstain=${mark(s.abstainOk)} leak=${s.leak ? '!!' : 'ok'}  conf=${s.confidence || '-'}  ${(r.ms / 1000).toFixed(1)}s`);
    rows.push({ ...c, ...s, ttft_ms: r.ttft, total_ms: r.ms, answer_chars: (r.text || '').length });
    await new Promise(res => setTimeout(res, 1500));
  }

  const pct = (arr) => { const v = arr.filter(x => x !== null && x !== undefined); return v.length ? `${Math.round(100 * v.filter(Boolean).length / v.length)}% (${v.filter(Boolean).length}/${v.length})` : '-'; };
  const by = (intent) => rows.filter(r => r.intent === intent && !r.error);
  const med = (arr) => { const v = arr.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0; };
  console.log('\n=== RINGKASAN ===');
  console.log(`kasus            : ${rows.length}  (error: ${rows.filter(r => r.error).length})`);
  console.log(`Recall@ctx kategori : ${pct(rows.map(r => r.catHit))}   ← chunk kategori yang diharapkan sampai ke model`);
  console.log(`literal (PN/kode)   : ${pct(rows.map(r => r.litHit))}`);
  console.log(`route benar         : ${pct(rows.map(r => r.routeOk))}`);
  console.log(`abstain saat harus  : ${pct(rows.map(r => r.abstainOk))}`);
  console.log(`bocor lintas model  : ${rows.filter(r => r.leak).length} kasus`);
  for (const it of ['fault_code', 'technical', 'engine', 'parts', 'service_interval']) {
    const g = by(it); if (!g.length) continue;
    console.log(`  ${it.padEnd(17)}: kategori ${pct(g.map(r => r.catHit))}, route ${pct(g.map(r => r.routeOk))}, ttft med ${(med(g.map(r => r.ttft_ms)) / 1000).toFixed(1)}s, total med ${(med(g.map(r => r.total_ms)) / 1000).toFixed(1)}s`);
  }
  const conf = {}; for (const r of rows) if (r.confidence) conf[r.confidence] = (conf[r.confidence] || 0) + 1;
  console.log(`confidence          : ${JSON.stringify(conf)}`);
  const outDir = path.join(__dirname, '../../../docs/evaluation'); fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `run-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(out, JSON.stringify({ ran_at: new Date().toISOString(), api: API, rows }, null, 2));
  console.log(`\ndetail: ${path.relative(process.cwd(), out)}`);
})();
