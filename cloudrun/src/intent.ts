import { Message } from './types';
import { callProxy, getText, INTENT_MODEL } from './vertex';

interface IntentAnalysis {
  shouldSearch: boolean;
  searchType: 'technical' | 'parts' | 'general' | 'off_topic';
  optimizedQuery: string;
}

function cleanOptimizedQuery(query: string): string {
  if (!query.trim()) return query;

  const SYNONYMS: Record<string, string> = {
    mass: 'weight', berat: 'weight',
    spec: 'specification', specs: 'specification',
    assy: 'assembly', asm: 'assembly',
    press: 'pressure', tekanan: 'pressure',
    vol: 'volume', cap: 'capacity', kapasitas: 'capacity',
  };
  const STOPWORDS = new Set(['the', 'and', 'for', 'of', 'in', 'on', 'at', 'with',
    'information', 'data', 'detail', 'value']);

  const words = query.trim().split(/\s+/);
  const seen = new Set<string>();
  const clean: string[] = [];

  for (const word of words) {
    const lower = word.toLowerCase();
    const canonical = SYNONYMS[lower] ?? lower;
    if (lower.length < 2 || seen.has(canonical) || STOPWORDS.has(lower)) continue;
    seen.add(canonical);
    clean.push(word);
    if (clean.length >= 10) break;
  }

  return clean.join(' ');
}

export async function analyzeIntent(
  userInput: string,
  history: Message[],
): Promise<IntentAnalysis> {
  const ctx = history.slice(-6)
    .filter(m => m.content?.trim())
    .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${ctxSnippet(m)}`)
    .join('\n');

  const systemPrompt = `You are a query classifier and optimizer for Hitachi/KCM heavy equipment documentation search.
Output ONLY valid JSON — no markdown, no preamble, no explanation.

═══ STEP 1: CLASSIFY searchType ═══

"parts"    → Part numbers, spare parts lookup, cross-reference, compatibility, service interval parts (CPM),
             maintenance schedule per X jam/hm, promo harga parts.
             RULE: ANY query mentioning interval (500/1000/2000 jam/hm/hr) → "parts".
             optimizedQuery MUST be ≥3 words. Interval pattern: "X hour service maintenance parts".

"technical" → Diagnosis, troubleshooting, fault codes, specs (torque/pressure/displacement/clearance/
              weight/diameter/length/dimension/size/capacity), procedures (teardown/assembly),
              oil/fuel/coolant capacity, electrical circuit, hydraulic flow, operating procedure.
              RULE: berat/dimensi/diameter/ukuran/clearance sebuah komponen = "technical" (ada di
              Workshop/Technical Manual), BUKAN "parts" — walau komponennya sebuah part.
              NOTE: "harga promo" / "promo Q4" without interval → "parts". With procedure context → "technical".

"general"  → Greetings, acknowledgments, short casual chat directly related to the work context ("halo", "oke", "thanks", "lanjut", "siap", "mantap").
             ALSO meta questions about the ASSISTANT itself or the USER ("kamu itu apa", "kamu siapa",
             "kamu bisa apa aja", "siapa saya", "cara pakai aplikasi ini", "fitur kamu apa") — these are
             NOT off_topic; the assistant answers them itself. Return shouldSearch=false.
             ALSO current time/date questions ("sekarang jam berapa", "hari ini tanggal berapa") — the
             assistant HAS the current timestamp and answers directly. NOT off_topic.
             ALSO language/translation requests about the conversation ("in japanese", "in english",
             "translate to english", "pakai bahasa indo") — the assistant switches/translates itself.
             NOT off_topic.
"off_topic" → Questions clearly about an UNRELATED domain: recipes, sports, politics, news, weather, cooking, entertainment, general internet trivia. ALSO company/organization matters (management names, direksi, stock, corporate news/rumor, "siapa presiden direktur X") and news/rumor about brands — the assistant has NO reliable data for these and must NOT answer. NOT for questions about the assistant/user/app/current time. Return shouldSearch=false.

AFFIRMATIVE REPLY TO AN OFFER: if the query is a short yes ("mau", "ya", "boleh", "oke", "lanjut", "sekalian") and the previous AI turn ENDS with an offer question ("Mau sekalian cek X?", "Mau saya tampilkan Y?"), the user is accepting that offer → classify by the OFFERED item (parts/technical), shouldSearch=true, optimizedQuery = the offered item in English. NEVER "general" in that case.

═══ STEP 2: BUILD optimizedQuery (parts/technical only) ═══

Rules (apply in order):
1. EXTRACT core intent: component FIRST, then attribute/symptom/action — urutan ini cocok dgn
   spec keyword search. Contoh: "swing motor weight", "bucket pin diameter", "main pump pressure".
2. TRANSLATE Indonesian → English technical terms from Hitachi service manuals
3. STRIP: kenapa/berapa/bagaimana/apa/gimana/cara/coba/tolong/mohon/kok/sih/ya/dong + articles
4. INFER pronouns (itu/ini/nya) → component name from conversation context. NEVER infer model names.
5. NO PADDING: translate exactly what user said. "swing motor" ≠ "swing motor assembly"
6. NO MODEL NAME: never add ZX48U-5A / ZX200-5G / KCM 60ZV etc.
7. KEEP the measurement attribute word — itu kata PEMBEDA utama & memicu pencarian spec.
   weight/berat→weight, diameter→diameter, panjang→length, lebar→width, tinggi→height,
   tekanan→pressure, torsi→torque, clearance, kapasitas→capacity, displacement.
   JANGAN reduksi jadi nama komponen saja ("diameter pin" → "pin" itu SALAH).
   UNIT: include only if user stated it. "berapa berat" → "...weight" (no kg). "berapa kg" → add kg.
8. LENGTH proportional to complexity:
   - Simple spec: 2-3 words  → "swing motor weight", "main pump displacement"
   - Symptom+component: 3-4  → "hydraulic pump no suction", "swing motor slow"
   - Procedure/multi-factor: 5-7 → "engine no start after fuel filter replacement"
   - NEVER pad short queries. NEVER truncate complex queries.

═══ EXAMPLES ═══

Technical — specs & symptoms:
"berapa berat swing motor"                    → technical, "swing motor weight"
"kapasitas oli engine"                        → technical, "engine oil capacity"
"tekanan main pump MPa"                       → technical, "main pump pressure MPa"
"swing lambat kenapa"                         → technical, "swing motor slow response"
"kenapa pompanya nggak mau narik"             → technical, "hydraulic pump no suction"
"berapa torque baut head cylinder"            → technical, "cylinder head bolt torque"
"diameter pin bucket berapa"                  → technical, "bucket pin diameter"
"panjang arm cylinder"                        → technical, "arm cylinder length"
"berat swing device"                          → technical, "swing device weight"
"clearance valve engine"                      → technical, "engine valve clearance"
"cara adjust relief valve main pump"          → technical, "main pump relief valve adjustment"
"engine tidak mau hidup setelah ganti filter" → technical, "engine no start after fuel filter replacement"
"tekanan hydraulic turun saat boom diangkat"  → technical, "hydraulic pressure drop boom lift"
"masih bocor juga tuh" [ctx: hydraulic cyl]  → technical, "hydraulic cylinder leak"

Technical — wheel loader (KCM/ZW: steering, transmission, lift arm, brake):
"steering berat sebelah"                      → technical, "steering heavy one side"
"transmisi selip pas maju"                    → technical, "transmission slip forward"
"lift arm lambat naik"                        → technical, "lift arm slow raise"
"parking brake nggak ngunci"                  → technical, "parking brake not holding"

Parts — PN, catalog, promo:
"PN YB60000068 itu apa"           → parts, "YB60000068"
"PN filter transmisi"             → parts, "transmission filter"
"harga seal kit swing motor"      → parts, "swing motor seal kit price"
"ada promo filter hydraulic ngga" → parts, "hydraulic filter promo price"
"harga promo seal kit swing"      → parts, "swing motor seal kit promo price"
"reman pump berapa harganya"      → parts, "pump reman promo price"

Parts — service interval (ALWAYS "parts", ALWAYS ≥3 words with "hour maintenance parts"):
"jadwal CPM 500 jam"              → parts, "500 hour maintenance parts"
"parts yang diganti 1000 jam"     → parts, "1000 hour service maintenance parts"
"part number 2000 hm"             → parts, "2000 hour service maintenance parts"
"service 500 jam dengan promo"    → parts, "500 hour maintenance parts promo"

General:
"halo mas"          → general, ""
"oke siap"          → general, ""
"thanks"            → general, ""
"kamu itu apa"      → general, ""
"kau itu apa sih"   → general, ""
"kamu bisa apa aja" → general, ""
"siapa saya"        → general, ""
"cara pakai app ini"→ general, ""
"sekarang jam berapa"      → general, ""
"hari ini tanggal berapa"  → general, ""
"in japanese"              → general, ""
"translate to english"     → general, ""
"pakai bahasa indo lagi"   → general, ""

Off-topic (redirect, do NOT answer) — culinary, sports, politics, news, weather, entertainment, general trivia:
"cara bikin sate padang"  → off_topic, ""
"resep nasi goreng"       → off_topic, ""
"cara masak rendang"      → off_topic, ""
"siapa presiden sekarang" → off_topic, ""
"siapa presiden direktur hexindo" → off_topic, ""
"katanya hitachi mau ganti nama"  → off_topic, ""
"hasil bola tadi malam"   → off_topic, ""
"cuaca besok gimana"      → off_topic, ""
"rekomendasi film bagus"  → off_topic, ""

═══ OUTPUT FORMAT (STRICT) ═══
Single-line JSON only. Exactly 3 fields. No extra fields, no arrays, no nested objects.
{"shouldSearch":<bool>,"searchType":"technical"|"parts"|"general"|"off_topic","optimizedQuery":"<2-10 words>"}
shouldSearch=false → searchType="general" or "off_topic", optimizedQuery=""`;

  const prompt = `${ctx ? `Conversation context:\n${ctx}\n\n` : ''}Technician query: "${userInput}"

Output ONLY this JSON shape (single line, no other text):
{"shouldSearch":<bool>,"searchType":"technical"|"parts"|"general"|"off_topic","optimizedQuery":"<2-10 word English phrase>"}

shouldSearch=true: technical/parts queries → optimizedQuery filled.
shouldSearch=false: "general" (greetings/acknowledgment kerja) atau "off_topic" (di luar alat berat) → optimizedQuery="".`;

  try {
    const res = await callProxy({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { maxOutputTokens: 200, temperature: 0, thinkingConfig: { thinkingLevel: 'minimal' } },
    }, false, INTENT_MODEL);
    const raw = getText(res.candidates?.[0]?.content?.parts ?? []).trim();
    const jsonStart = raw.indexOf('{');
    const jsonEnd   = raw.lastIndexOf('}');
    const jsonStr   = jsonStart !== -1 && jsonEnd > jsonStart ? raw.slice(jsonStart, jsonEnd + 1) : '';
    if (!jsonStr) throw new Error('No JSON in INTENT_MODEL output');
    const parsed = JSON.parse(jsonStr) as IntentAnalysis;
    const validTypes = ['technical', 'parts', 'general', 'off_topic'] as const;
    const searchType = validTypes.includes(parsed.searchType) ? parsed.searchType : 'technical';
    const rawQuery = parsed.optimizedQuery?.trim() || userInput;
    return {
      shouldSearch: Boolean(parsed.shouldSearch),
      searchType,
      optimizedQuery: cleanOptimizedQuery(rawQuery),
    };
  } catch (err) {
    console.warn('[analyzeIntent] failed, fallback to raw input:', (err as Error)?.message);
    return { shouldSearch: true, searchType: 'technical', optimizedQuery: userInput };
  }
}

function ctxSnippet(m: Message): string {
  const c = m.content.trim();
  if (m.role === 'user' || c.length <= 420) return c.slice(0, 420);
  return `${c.slice(0, 200)} … ${c.slice(-220)}`;
}

const AFFIRM_RE = /^(?:(?:ya|iya|oke?|okay|okey|sip|siap|boleh|mau|yoi|yup|yes|yep|lanjut|lanjutkan|sekalian|tampilkan|coba|silakan|silahkan|gas|yuk|ayo|tolong|please|sure|dong|deh|aja|saja)[\s.!,]*){1,4}$/i;

export function extractLastOffer(history: Message[]): string | null {
  const last = [...history].reverse().find(m => m.role === 'assistant' && m.content?.trim());
  if (!last) return null;
  const tail = last.content.trim().split('\n').map(l => l.trim()).filter(Boolean).slice(-3).join(' ');
  const m = tail.match(/([^.!?]*\?)\s*$/);
  if (!m) return null;
  const VERB = '(?:tampilkan|tampilin|cek(?:kan)?|carikan|cari|lihat|tarik|siapkan|bantu|jelaskan|lanjut(?:kan)?|kasih|beri(?:kan)?|tunjukkan|bahas|ambil|kita\\s+cek|kita\\s+lihat)';
  let q = m[1].trim()
    .replace(/\?$/, '')
    .replace(new RegExp(`\\b(?:mau|perlu|ingin|butuh|apakah)\\s+(?:saya|aku|kita|kami)?\\s*(?:sekalian|juga)?\\s*${VERB}?\\s*(?:sekalian|juga)?`, 'gi'), ' ')
    .replace(new RegExp(`^\\s*${VERB}\\s+`, 'i'), ' ')
    .replace(/[-‐]?\bnya\b/gi, '')
    .replace(/\b(?:sekalian|juga|dong|ya|deh|saja|aja|kalau|kalo|perlu)\b/gi, ' ')
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '')
    .replace(/\s+/g, ' ').trim();
  if (q.split(/\s+/).length < 2) return null;
  if (/\satau\s/i.test(q)) q = q.split(/\s+atau\s+/i).join(' dan ');
  return q;
}

export function resolveAffirmative(trimmed: string, history: Message[]): string | null {
  if (!AFFIRM_RE.test(trimmed)) return null;
  return extractLastOffer(history);
}

const MULTI_CONNECTOR_RE =
  /\b(?:dan|plus|sambil|bersamaan|juga|sekaligus|sekalian|lalu|kemudian|serta|beserta|trus|terus)\b|[+&]|(?<!\byang\s+)\b(?:sama|ama)\b(?!\s+(?:dengan|persis|kaya|seperti))/i;
const MULTI_TECH_RE = /\b(?:berat|weight|diameter|panjang|length|lebar|width|tinggi|height|tebal|thickness|ukuran|size|tekanan|pressure|torque|torsi|clearance|displacement|capacity|kapasitas|rpm|spec|stroke|bore|pn|part\s*number|partnumber|harga|price|promo|motor|pump|valve|cylinder|silinder|filter|seal|gasket|bearing|rotor|stator|pin|bushing|shaft|swing|boom|arm|bucket|blade|track|engine|mesin|hydraulic|hidrolik|sensor|relay|solenoid|controller|alternator|starter|nozzle|injector|turbo|radiator|coupling|reduction|gear)\w*/i;
const MULTI_ATTR_RE = /\b(?:berat|weight|diameter|panjang|length|lebar|width|tinggi|height|tebal|thickness|tekanan|pressure|torque|torsi|clearance|displacement|kapasitas|capacity|rpm|harga|price|part\s*number|partnumber|pn|spec|ukuran|size)\w*/gi;

export function isMultiAspectQuery(q: string): boolean {
  if (!MULTI_CONNECTOR_RE.test(q)) return false;
  if (!MULTI_TECH_RE.test(q)) return false;
  const words = q.split(/\s+/).filter(Boolean).length;
  const attrCount = (q.match(MULTI_ATTR_RE) ?? []).length;
  return words >= 5 || attrCount >= 2;
}

const ASPECT_PARTS_RE = /\b(part\s*number|partnumber|part\s*no|pn|price|harga|promo|catalog|kit|reman)\b/i;
const ASPECT_SPEC_RE  = /\b(weight|berat|diameter|length|panjang|width|lebar|height|tinggi|thickness|tebal|pressure|tekanan|torque|torsi|clearance|displacement|capacity|kapasitas|rpm|stroke|bore|procedure|prosedur|removal|installation|disassembly|assembly|adjust\w*|interval|slow|leak|bocor|lambat|overheat|noise|vibrat\w*|not\s+working|troubleshoot\w*|symptom|spec\w*)\b/i;

type AspectKind = 'parts' | 'spec' | 'both';

export function classifyAspect(sub: string): AspectKind {
  const p = ASPECT_PARTS_RE.test(sub);
  const t = ASPECT_SPEC_RE.test(sub);
  if (p && !t) return 'parts';
  if (t && !p) return 'spec';
  return 'both';
}

const ATTR_EN: Record<string, string> = {
  berat: 'weight', weight: 'weight', diameter: 'diameter', panjang: 'length', length: 'length',
  lebar: 'width', width: 'width', tinggi: 'height', height: 'height', tebal: 'thickness', thickness: 'thickness',
  tekanan: 'pressure', pressure: 'pressure', torque: 'torque', torsi: 'torque', clearance: 'clearance',
  displacement: 'displacement', kapasitas: 'capacity', capacity: 'capacity', rpm: 'rpm', spec: 'specification',
  ukuran: 'size', size: 'size', harga: 'price', price: 'price', promo: 'promo price',
  pn: 'part number', partnumber: 'part number', 'part number': 'part number',
};

export function fallbackDecompose(query: string): string[] {
  const attrs = [...new Set((query.match(MULTI_ATTR_RE) ?? []).map(a => {
    const k = a.toLowerCase().replace(/\s+/g, ' ').replace(/(nya|ny|s)$/, '');
    return ATTR_EN[k] ?? ATTR_EN[a.toLowerCase()] ?? k;
  }))];
  if (attrs.length < 2) return [];
  const subject = query
    .replace(MULTI_ATTR_RE, ' ')
    .replace(MULTI_CONNECTOR_RE, ' ')
    .replace(/\b(nya|itu|ini|berapa|apa|tolong|cari\w*|carikan|minta|mau|dong|sih|ya)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ').trim();
  if (!subject) return [];
  return attrs.slice(0, 4).map(a => `${subject} ${a}`);
}

export async function decomposeAspects(query: string, history: Message[] = []): Promise<string[]> {
  const SYS = `Break a heavy-equipment query into independent English sub-queries — ONE information-need each. Translate Indonesian → English technical terms. NO model names. Output ONLY a JSON array of strings (max 4), no markdown, no preamble.

SPLIT whenever the technician asks for MORE THAN ONE KIND of information — even about the SAME component. Kinds: part number/price · procedure (removal, installation, disassembly, adjustment) · numeric spec (weight, pressure, torque, capacity, clearance) · symptom/diagnosis · maintenance interval.
A procedure request is ALWAYS its own sub-query — it lives in a different manual than part numbers.

Indonesian connectors include: dan, sama, ama, plus, trus, terus, sekalian, beserta, serta, juga, "+".

RESOLVE references (itu/ini/nya/tadi/tersebut) to the concrete component from the conversation context.

Examples:
"carikan part number valve swing motor sama cara pasangnya" -> ["swing valve part number","swing device removal installation procedure"]
"PN seal kit swing trus langkah bongkarnya" -> ["swing motor seal kit part number","swing motor disassembly procedure"]
"berat swing motor dan partnumber rotor" -> ["swing motor weight","rotor part number"]
"part number travel device dan beratnya" -> ["travel device part number","travel device weight"]
"diameter pin bucket dan part numbernya" -> ["bucket pin diameter","bucket pin part number"]
"harga filter oli sekalian interval gantinya" -> ["engine oil filter price","engine oil filter replacement interval"]
"swing lambat dan pump bocor" -> ["swing motor slow response","hydraulic pump leak"]
[ctx: bahas swing motor] "berat dan diameternya" -> ["swing motor weight","swing motor diameter"]

Single information-need → return ONE item:
"kenapa swing lambat" -> ["swing motor slow response"]
"harga seal kit swing" -> ["swing motor seal kit price"]`;
  const ctx = history.slice(-4)
    .filter(m => m.content?.trim())
    .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 300)}`)
    .join('\n');
  const userMsg = ctx ? `Conversation so far:\n${ctx}\n\nDecompose this latest query: "${query}"` : `Decompose: "${query}"`;
  let subs: string[] = [];
  try {
    const res = await callProxy({
      contents: [{ role: 'user', parts: [{ text: userMsg }] }],
      systemInstruction: { parts: [{ text: SYS }] },
      generationConfig: { maxOutputTokens: 150, temperature: 0, thinkingConfig: { thinkingLevel: 'minimal' } },
    }, false, INTENT_MODEL);
    const raw = getText(res.candidates?.[0]?.content?.parts ?? []).trim();
    const m = raw.match(/\[[\s\S]*?\]/);
    const arr = m ? JSON.parse(m[0]) : [];
    subs = Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 4) : [];
  } catch (err) {
    console.warn('[decomposeAspects] failed:', (err as Error)?.message);
  }
  if (subs.length < 2) {
    const fb = fallbackDecompose(query);
    if (fb.length >= 2) {
      console.info('[decomposeAspects] model → %d, fallback regex → %d: %s', subs.length, fb.length, fb.join(' | '));
      subs = fb;
    }
  }
  return subs;
}
