const LIVE_PRICES = Object.freeze({ input: { TEXT: 0.75, AUDIO: 3, VIDEO: 1, IMAGE: 1 }, output: { TEXT: 4.5, AUDIO: 12, VIDEO: 1, IMAGE: 1 } });
const LIVE_FX_IDR = 17977;
const counts = () => ({ TEXT: 0, AUDIO: 0, VIDEO: 0, IMAGE: 0 });
const field = (obj, name) => obj?.[name] ?? obj?.[name.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)];
const integer = n => Number.isSafeInteger(n) && n >= 0;
const sum = obj => Object.values(obj).reduce((a, b) => a + b, 0);
function modalities(details, expected) {
  const tokens = counts(); let valid = integer(expected);
  if (details !== undefined && !Array.isArray(details)) valid = false;
  for (const d of Array.isArray(details) ? details : []) {
    if (!d || typeof d !== 'object') { valid = false; continue; }
    const n = field(d, 'tokenCount');
    if (!integer(n)) { valid = false; continue; }
    const m = Object.hasOwn(tokens, d.modality) ? d.modality : 'UNKNOWN';
    tokens[m] = (tokens[m] || 0) + n;
    if (m === 'UNKNOWN' && n) valid = false;
  }
  if (integer(expected) && sum(tokens) < expected) tokens.UNKNOWN = (tokens.UNKNOWN || 0) + expected - sum(tokens);
  return { tokens, valid: valid && sum(tokens) === expected && !tokens.UNKNOWN };
}
function normalize(metadata) {
  const prompt = field(metadata, 'promptTokenCount'), response = field(metadata, 'responseTokenCount') ?? field(metadata, 'candidatesTokenCount'), total = field(metadata, 'totalTokenCount');
  const thoughts = field(metadata, 'thoughtsTokenCount') ?? 0, tools = field(metadata, 'toolUsePromptTokenCount') ?? 0, cached = field(metadata, 'cachedContentTokenCount') ?? 0;
  const input = modalities(field(metadata, 'promptTokensDetails'), prompt), output = modalities(field(metadata, 'responseTokensDetails') ?? field(metadata, 'candidatesTokensDetails'), response);
  let valid = input.valid && output.valid && [total, thoughts, tools, cached].every(integer) && cached === 0;
  const extra = total - prompt - response;
  if (extra === thoughts && thoughts > 0 && tools === 0) output.tokens.TEXT += thoughts;
  else if (extra !== 0) valid = false;
  return { prompt, response, total, thoughts, tools, cached, input: input.tokens, output: output.tokens, valid, available: [prompt, response, total].some(integer) };
}
function createLiveUsage() {
  const turns = []; let current, boundary = false, dirty = false, updates = 0, missing = false;
  const markActivity = () => { boundary = false; dirty = true; };
  return {
    markActivity,
    observe(frame) {
      const content = field(frame, 'serverContent');
      if (content && (field(content, 'modelTurn') || field(content, 'inputTranscription') || field(content, 'outputTranscription')) || field(frame, 'toolCall')) markActivity();
      const metadata = field(frame, 'usageMetadata');
      if (metadata && typeof metadata === 'object') {
        const parsed = normalize(metadata); updates++;
        if (boundary && turns.length) turns[turns.length - 1] = parsed;
        else current = parsed;
        dirty = false;
      }
      // Usage is per generation turn, including re-billed history, not cumulative session billing.
      if (content && (field(content, 'turnComplete') || content.interrupted) && !boundary) {
        if (current) turns.push(current); else missing = true;
        if (dirty) missing = true;
        current = undefined; boundary = true; dirty = false;
      }
    },
    summary() {
      const entries = current ? [...turns, current] : turns;
      const available = entries.some(t => t.available);
      const valid = available && entries.every(t => t.valid);
      const input = counts(), output = counts();
      for (const t of entries) for (const [target, source] of [[input, t.input], [output, t.output]]) for (const [m, n] of Object.entries(source)) target[m] = (target[m] || 0) + n;
      const usd = valid ? [...Object.entries(input).map(([m, n]) => n * LIVE_PRICES.input[m]), ...Object.entries(output).map(([m, n]) => n * LIVE_PRICES.output[m])].reduce((a, b) => a + b, 0) / 1e6 : null;
      const totalField = key => available && entries.every(t => integer(t[key])) ? entries.reduce((a, t) => a + t[key], 0) : null;
      return { usage_scope: 'per_turn_including_history', metadata_updates: updates, billed_turns: entries.filter(t => t.available).length,
        usage_available: available, cost_complete: valid && boundary && !dirty && !missing,
        prompt_tokens: totalField('prompt'), response_tokens: totalField('response'), total_tokens: totalField('total'), thoughts_tokens: totalField('thoughts'), tool_prompt_tokens: totalField('tools'), cached_tokens: totalField('cached'),
        input_tokens: available ? input : null, output_tokens: available ? output : null, cost_usd: usd, cost_idr: usd === null ? null : usd * LIVE_FX_IDR,
        pricing: { basis: 'vertex_list', unit: 'USD_per_1M_tokens', input: LIVE_PRICES.input, output: LIVE_PRICES.output, fx_idr: LIVE_FX_IDR }, rag_cost_included: false };
    },
  };
}
module.exports = { createLiveUsage, LIVE_PRICES, LIVE_FX_IDR };
