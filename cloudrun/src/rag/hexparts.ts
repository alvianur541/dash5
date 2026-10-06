import { deps } from '../deps';

export interface WebPart { pn: string; nama: string; harga: string }

const URL_CARI = 'https://hexindoparts.com/products?query=';
const BATAS_MS = 3_000;
const CACHE_MS = 6 * 3600_000;
const CACHE_KOSONG_MS = 3600_000;
const CACHE_MAX = 500;
const MAKS_PN = 20;
const PARALEL = 6;
const JEDA_ULANG_MS = 400;
const cache = new Map<string, { t: number; v: WebPart[] }>();

// PN → listings; [] = checked and not listed; null = lookup failed (site error/timeout), never cached.
export type HasilWeb = Map<string, WebPart[] | null>;

const rupiah = (n: number): string => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

// Exact PN or a short letter suffix (PU, RCP, HPB, -F); prefix hits like 4658521 → 46585219 are rejected.
const cocok = (pn: string, nama: string): boolean => {
  const n = nama.toUpperCase().replace(/\s+/g, ' ').trim();
  return n === pn || (n.startsWith(pn) && /^-?[A-Z]{1,4}$/.test(n.slice(pn.length)));
};

// Real lookup against the hexindoparts.com JSON listing; wired into deps().webPrice by server.js.
// Non-JSON or non-2xx throws so a site hiccup is retried and never cached as "not listed".
// KCM catalogs write PNs with a dash ("49327-90920"); hexindoparts.com lists them without ("4932790920")
// and returns nothing for the dashed form (Reyhan 4 Oct, KCM 60ZV seal kits).
export const tanpaStripKcm = (pn: string): string => (/^\d+(?:-\d+)+$/.test(pn) ? pn.replace(/-/g, '') : pn);

export async function fetchHexParts(pn: string, signal?: AbortSignal): Promise<WebPart[]> {
  const asli = pn.toUpperCase().trim();
  // The site is inconsistent with dashes: KCM always undashed; ZW mixed (26418-82071 listed with the dash,
  // 263E2-52031 only as 263E252031 — Abdul 4 Oct). Try the likely spelling first, then the other one.
  const tanpa = asli.replace(/-/g, '');
  const ejaan = tanpa === asli ? [asli] : (tanpaStripKcm(asli) !== asli ? [tanpa, asli] : [asli, tanpa]);
  // Yanmar engine PNs: catalogs write "YNM729630-51520", the site lists about half of them without the prefix
  // ("729630-51520", injection pump ZX48U-5A — Alvian 6 Oct; sample of 30: 5 with YNM, 5 bare, 20 absent).
  if (/^YNM\d/.test(asli)) ejaan.push(asli.slice(3));
  for (const kunci of ejaan) {
    const hasil = await cariSatu(asli, kunci, signal);
    if (hasil.length) return hasil;
  }
  return [];
}

async function cariSatu(asli: string, kunci: string, signal?: AbortSignal): Promise<WebPart[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BATAS_MS);
  const lepas = () => ctrl.abort();
  signal?.addEventListener('abort', lepas);
  try {
    const res = await fetch(URL_CARI + encodeURIComponent(kunci), {
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': 'Mozilla/5.0 (HexindoTechnicalAssistant)' },
      signal: ctrl.signal,
    });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) {
      throw new Error(`HTTP ${res.status} ${res.headers.get('content-type') ?? ''}`.trim());
    }
    const data = await res.json() as { products?: { data?: Array<{ name?: string; short_description?: string; price?: { amount?: string | number } }> } };
    return (data.products?.data ?? [])
      .filter(p => p.name && cocok(kunci, p.name) && Number(p.price?.amount) > 0)
      .slice(0, 4)
      // Keep the catalog spelling so the answer's PN matches the table row.
      .map(p => ({ pn: kunci === asli ? p.name!.trim() : asli + p.name!.trim().toUpperCase().slice(kunci.length), nama: (p.short_description ?? '').trim(), harga: rupiah(Number(p.price!.amount)) }));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', lepas);
  }
}

export async function hargaWeb(pns: string[]): Promise<HasilWeb> {
  const hasil: HasilWeb = new Map();
  const cari = deps().webPrice;
  const daftar = [...new Set(pns.map(p => p.toUpperCase().trim()).filter(p => p.length >= 4))].slice(0, MAKS_PN);
  if (!cari || !daftar.length) return hasil;
  const t0 = Date.now();
  let gagal = 0;
  const satu = async (pn: string): Promise<void> => {
    const c = cache.get(pn);
    if (c && Date.now() - c.t < (c.v.length ? CACHE_MS : CACHE_KOSONG_MS)) { hasil.set(pn, c.v); return; }
    for (let coba = 1; coba <= 2; coba++) {
      try {
        const v = await cari(pn);
        if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
        cache.set(pn, { t: Date.now(), v });
        hasil.set(pn, v);
        return;
      } catch (err) {
        console.warn('[hexparts] %s gagal (coba %d): %s', pn, coba, (err as Error)?.message);
        if (coba === 1) await new Promise(r => setTimeout(r, JEDA_ULANG_MS));
      }
    }
    gagal++;
    hasil.set(pn, null);
  };
  // A small pool: a burst of 16 parallel hits made the site answer 500 (Hikmal, 4 Oct).
  const antre = [...daftar];
  await Promise.all(Array.from({ length: Math.min(PARALEL, antre.length) }, async () => {
    for (let pn = antre.shift(); pn; pn = antre.shift()) await satu(pn);
  }));
  console.info('[hexparts] %d PN → %d ketemu, %d gagal (%dms)', daftar.length,
    [...hasil.values()].filter(v => v?.length).length, gagal, Date.now() - t0);
  return hasil;
}

export function resetHargaWebCache(): void { cache.clear(); }

export const adaHarga = (hasil: HasilWeb, pn?: string): boolean =>
  pn ? !!hasil.get(pn.toUpperCase())?.length : [...hasil.values()].some(v => v?.length);

export function blokHargaWeb(hasil: HasilWeb): string {
  if (!hasil.size) return '';
  const entri = [...hasil.entries()];
  const kosong = entri.filter(([, v]) => v && !v.length).map(([pn]) => pn);
  const gagal = entri.filter(([, v]) => v === null).map(([pn]) => pn);
  const baris = entri.flatMap(([, v]) => v ?? []).map(p => `  ${p.pn.padEnd(22)} | ${p.nama.padEnd(30)} | ${p.harga}`);
  const head = baris.length ? `\n  Part Number            | Description                    | Harga\n${baris.join('\n')}` : '';
  const tidakAda = kosong.length ? `\n  Dicek, TIDAK ADA di hexindoparts.com: ${kosong.join(', ')}` : '';
  const error = gagal.length ? `\n  GAGAL dicek (hexindoparts.com sedang tidak merespons): ${gagal.join(', ')}` : '';
  return `[HARGA HEXINDOPARTS.COM — harga terkini toko online resmi Hexindo]${head}${tidakAda}${error}`;
}

const ASSY_RE = /\b(?:ASM|ASSY|ASS'Y|ASSEMBLY|ASSEMBLE)\b/;
const INTERNAL_RE = /\b(?:kit|seal\w*|sealkit|brush|armature|yoke|bearing|bushing|o-?ring|gasket|internal\w*|dalam|isi\w*|komponen\w*|component\w*|parts?\s+list|rincian|detail|semua|all|repair|overhaul|rekondisi)\b/i;
const BUKAN_KATA = new Set(['harga', 'hargany', 'hargannya', 'harganya', 'price', 'prices', 'berapa', 'brp', 'berpa', 'cek', 'check', 'ada', 'ngga', 'nggak', 'gak', 'tidak', 'part', 'parts', 'number', 'nomor', 'unit', 'model', 'yang', 'untuk', 'buat', 'dan', 'atau', 'klo', 'kalau', 'kalo', 'dong', 'tolong', 'coba', 'minta', 'info', 'hexindoparts', 'com', 'web', 'website', 'the', 'for', 'and', 'what', 'how', 'much', 'cost', 'biaya', 'catalog', 'katalog', 'list', 'daftar', 'semua']);
// Technicians type fast on site: "hrga", "hrgany", "hraga", "brapa" (Reyhan, 4 Oct) must count as a price ask.
export const MINTA_HARGA_RE = /\b(?:harga\w*|harg\w*|hrga\w*|hrg\w*|hraga\w*|price\w*|prise|berapa|brapa|brpa|brp|berpa|biaya|cost)\b|hexindo\s*parts?/i;

// Catalog row → cells. Hitachi chunks are pipe tables; KCM catalogs are fixed-width text
// (" 53A 49327-70060        SEAL KIT            1      101 -") and must be read as [item, PN, name] too,
// otherwise no KCM row ever gets a web price (Alvian 4 Oct, KCM 60ZV seal kits).
const KCM_BARIS_RE = /^\s*(\d{1,3}[A-Z]?)\s+(\d{5}-\d{5}(?:-\d+)?)\s{2,}(\S.*?)\s{2,}\d/;
// KCM scanned pages carry their own title line ("          LIFT CYLINDER") and one chunk can hold several pages
// under a wrong Section label (lift cylinder rows inside "CAB OPTION - Cab Structure"); use it as sub-section.
const KCM_JUDUL_RE = /^\s{6,}([A-Z][A-Z ,&/.()-]{3,40}?)\s*$/;
export function judulKcm(line: string): string | null {
  const m = line.match(KCM_JUDUL_RE);
  return m && !/\d/.test(m[1]) && !/^(?:PART|SYM|BOL|REMARKS|UNIT|SERIAL)/.test(m[1].trim()) ? m[1].trim() : null;
}

export function selBaris(line: string): string[] {
  if (line.includes('|')) return line.split('|').map(x => x.trim());
  const m = line.match(KCM_BARIS_RE);
  return m ? [m[1], m[2], m[3].trim()] : [];
}

const PN_SEL_RE = /^(?=[A-Z0-9 .-]*\d)[A-Z0-9][A-Z0-9 .-]{2,21}[A-Z0-9]$/;
const PN_JAWABAN_RE = /`([A-Z0-9][A-Z0-9-]{3,21})`/g;

function jarak(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

// Catalog names abbreviate ("CYL.;ARM"), so a short catalog word may be the start of the asked word.
const kataCocok = (k: string, w: string): boolean =>
  w === k || (k.length >= 4 && w.startsWith(k)) || (w.length >= 3 && k.startsWith(w))
  || (k.length >= 6 && w.length >= 6 && jarak(k, w) <= 2);

const kataDari = (t: string): string[] => t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const KOMPONEN_UTAMA_RE = /\b(?:KIT|ASSY|ASM|ASS'Y)\b/i;

/** Trailing component tag of a promo row: "... Rp 2.102.691  [Swing Motor]" → "Swing Motor". */
export function komponenBaris(line: string): string | null {
  return line.match(/\[([A-Za-z][A-Za-z0-9 ;&/.-]{2,40})\]\s*$/)?.[1].trim() ?? null;
}

const skorNama = (kunci: string[], kata: string[]): number => {
  let n = 0;
  for (const k of kunci) {
    if (kata[0] && kataCocok(k, kata[0])) n += 3;
    else if (kata.some(w => kataCocok(k, w))) n += 1;
  }
  return n;
};

// Rows ("item | PN | NAME | …" or "PN | DESC | …") whose name matches the question pick which PNs get a web price;
// rows under a matching section title count too (seal kit inside "CYL.;ARM"), kits/assemblies first.
// With no match, a short follow-up ("harganya berapa") prices the PNs quoted in the previous answer.
// No row name matched the question (technician says "harness", catalog says "CABLE ASSY"): price the rows of the
// best-ranked chunk instead, since that chunk is what the answer will be built from (Abdul 4 Oct, KCM 60ZV).
export function pnChunkTeratas(content: string, maks = 8): string[] {
  const pertama = content.split('\n\n---\n\n')[0] ?? '';
  const out: string[] = [];
  for (const line of pertama.split('\n')) {
    const sel = selBaris(line);
    const pn = sel.find(x => PN_SEL_RE.test(x));
    if (pn && /\d/.test(pn) && !out.includes(pn)) out.push(pn);
    if (out.length >= maks) break;
  }
  return out;
}

// Workshop words → catalog words. Technicians say "nepple grease", the catalog row is VALVE under ADJUSTER;
// "metal duduk" is METAL KIT; CRANKSHAFT; "bearing" is often METAL (Isuzu). Only adds words, never removes.
const SINONIM: Array<[RegExp, string[]]> = [
  [/^(?:nipp?le|nepp?le|nepel|niple|nepple|nippel)$/, ['valve', 'fitting', 'nipple']],
  [/^(?:harness|harnes|kabel|wiring)$/, ['harness', 'cable', 'wire']],
  [/^(?:bearing|laher|bantalan)$/, ['bearing', 'metal']],
  [/^(?:selang)$/, ['hose']],
  [/^(?:baut)$/, ['bolt']],
  [/^(?:mur)$/, ['nut']],
  [/^(?:pin|pen)$/, ['pin']],
  [/^(?:busing|bushing|bosh|bos)$/, ['bushing']],
  [/^(?:saringan)$/, ['filter', 'element']],
  [/^(?:sil|seal|sealkit)$/, ['seal']],
  [/^(?:oring|o-ring)$/, ['ring', 'o-ring']],
  // Isuzu/Hitachi catalog abbreviations: "SEAL; OIL,CR/SHF,RR" = rear crankshaft oil seal (Alvian 5 Oct).
  [/^(?:sealkit|sealkid|silkit|sielkit|selkit)$/, ['seal', 'kit']],
  [/^(?:crankshaft|cranksh?aft|cranksfat|crankshat|krenk\w*|kruk\w*|crank\w*)$/, ['crankshaft', 'cr', 'shf', 'crank']],
  [/^(?:camshaft|camsh?aft|nok\w*)$/, ['camshaft', 'cam']],
  [/^(?:belakang|blkg|blakang|belakng|rear)$/, ['rear', 'rr']],
  [/^(?:depan|dpn|front)$/, ['front', 'fr']],
  [/^(?:kiri)$/, ['lh', 'left']],
  [/^(?:kanan)$/, ['rh', 'right']],
  [/^(?:atas)$/, ['upper', 'upr']],
  [/^(?:bawah)$/, ['lower', 'lwr']],
];
function denganSinonim(kunci: string[]): string[] {
  const out = [...kunci];
  for (const k of kunci) for (const [re, alt] of SINONIM) if (re.test(k)) for (const a of alt) if (!out.includes(a)) out.push(a);
  return out;
}

export function pilihPnHarga(content: string, teks: string[], jawabanSebelumnya = '', maks = 20): string[] {
  // Several components at once ("piston, connecting rod, main bearing, injection pump" from a photo): rank per
  // component and take turns, else one component with many rows (injection pump) fills every slot (Abdul 4 Oct).
  const frasa = teks.join(' , ').split(/\s*(?:,|;|\bdan\b|&|\+)\s*/i).map(f => f.trim()).filter(f => kataDari(f).some(w => w.length >= 3 && !BUKAN_KATA.has(w) && !MINTA_HARGA_RE.test(w)));
  if (frasa.length >= 2 && frasa.length <= 6 && teks.join(' ').includes(',')) {
    const daftar = [...new Set(frasa)].map(f => pilihPnHargaSatu(content, [f], '', maks));
    const out: string[] = [];
    for (let i = 0; out.length < maks && daftar.some(d => i < d.length); i++) {
      for (const d of daftar) if (d[i] && !out.includes(d[i]) && out.length < maks) out.push(d[i]);
    }
    if (out.length) return out;
  }
  return pilihPnHargaSatu(content, teks, jawabanSebelumnya, maks);
}

function pilihPnHargaSatu(content: string, teks: string[], jawabanSebelumnya = '', maks = 20): string[] {
  const kunci = denganSinonim([...new Set(kataDari(teks.join(' ')).filter(w => w.length >= 3 && !BUKAN_KATA.has(w) && !MINTA_HARGA_RE.test(w) && !/^\d+$/.test(w)))]);
  const skor = new Map<string, { n: number; nama: string; komp: number; grup: string; cocokNama?: boolean }>();
  if (kunci.length) {
    let skorSection = 0;
    let judulKata: string[] = [];
    for (const line of content.split('\n')) {
      const judul = line.match(/^Section:\s*(.+)$/i);
      if (judul) { judulKata = kataDari(judul[1].replace(/^PROMO Q\d FY\d{4}\s*-\s*|^\d+\s*-\s*/i, '')); skorSection = skorNama(kunci, judulKata); continue; }
      const jk = judulKcm(line);
      if (jk) { judulKata = kataDari(jk); skorSection = skorNama(kunci, judulKata); continue; }
      const sel = selBaris(line);
      const i = sel.findIndex(x => PN_SEL_RE.test(x));
      if (i < 0 || !sel[i + 1]) continue;
      const kataNama = kataDari(sel[i + 1]);
      const nama = skorNama(kunci, kataNama);
      // Promo rows carry their own component tag ("[Main Pump]") under a shared title that lists several
      // components; judge the row by its tag, not the title (Arip 4 Oct: swing motor got main pump seal kits).
      const tag = komponenBaris(line);
      const kataKomp = tag ? kataDari(tag) : judulKata;
      const skorKomp = tag ? skorNama(kunci, kataKomp) : skorSection;
      // -1 = the question names nothing beyond this part's own name, so there is no component to disagree with.
      const sisa = kunci.filter(k => !kataNama.some(w => kataCocok(k, w)));
      const komp = sisa.length ? skorKomp : -1;
      const n = nama * 2 + (skorKomp >= 3 ? 1 + (KOMPONEN_UTAMA_RE.test(sel[i + 1]) ? 2 : 0) : 0);
      if (n > 0 && n > (skor.get(sel[i])?.n ?? 0)) skor.set(sel[i], { n, nama: sel[i + 1].toUpperCase(), komp, grup: kataKomp.join(' '), cocokNama: nama > 0 });
    }
  }
  // The question names a component beyond the part ("kit seal SWING MOTOR") and some rows sit in that
  // component → drop rows that sit in a different one.
  if ([...skor.values()].some(v => v.komp >= 3)) {
    for (const [pn, v] of skor) if (v.komp === 0) skor.delete(pn);
  }
  // Assembly diminta (mis. "harga starter") → cukup baris ASSY; isi internal ditawarkan, bukan dicek semua.
  const assy = [...skor.entries()].filter(([, v]) => v.cocokNama && ASSY_RE.test(v.nama));
  const setujuIsi = /komponen internal|internal (?:parts|components)/i.test(jawabanSebelumnya.slice(-400))
    && /^(?:ok\w*|oke\w*|ya\w*|iya|boleh|lanjut\w*|gas|siap|mau|yes|sip|listkan|tampilkan)\b/i.test((teks[0] ?? '').trim());
  if (assy.length && !setujuIsi && !INTERNAL_RE.test(teks.join(' '))) {
    return assy.sort((a, b) => b[1].n - a[1].n).slice(0, 3).map(([pn]) => pn);
  }
  // At most 3 PNs per part name within one component, so a dozen arm-cylinder variants cannot crowd out the
  // seal kit, and seal kits of one component cannot crowd out another's (KCM: 8 SEAL KIT rows, lift cylinder lost).
  const perNama = new Map<string, number>();
  const dariData = [...skor.entries()].sort((a, b) => b[1].n - a[1].n)
    .filter(([, v]) => { const k = `${v.nama}|${v.grup}`; const c = (perNama.get(k) ?? 0) + 1; perNama.set(k, c); return c <= 3; })
    .map(([pn]) => pn);
  const dariJawaban = dariData.length ? [] : [...jawabanSebelumnya.matchAll(PN_JAWABAN_RE)].map(m => m[1]).filter(p => /\d/.test(p) && !/^(?:ZX|ZW)\d/.test(p));
  return [...new Set([...dariData, ...dariJawaban])].slice(0, maks);
}

// Safety net after the answer is written, so every price shown comes from hexindoparts.com:
// - rows still saying "Ketik PN untuk cek" are looked up and filled (audit 2-5 Oct: 66 of 79 were listed);
// - rows WITH a Rupiah price are re-checked against the site: a price the site does not list (old promo price
//   from the DB, invented number) is replaced by the site price or "Belum tersedia" (Alvian 5 Oct, HAPDH1-CI4).
// The client replaces the streamed text with meta.full.
const KETIK_RE = /Ketik PN untuk cek/i;
const RP_RE = /Rp\s?\d{1,3}(?:\.\d{3})+(?:,\d+)?|Rp\s?\d+/;
const BELUM_RE = /\|\s*(?:Belum tersedia|Tidak tersedia|Not (?:yet )?available)\s*\|/i;
const TAWAR_CEK_RE = /^\s*(?:\*|_)?(?:ketik|kirim|sebut)\b[^\n]*\b(?:pn|part\s*number|nomor\s*part|partnumber)\b[^\n]*\b(?:cek|harga)\w*[^\n]*$/i;
const angka = (rp: string): number => Number(rp.replace(/[^\d]/g, ''));
// Once the table has real prices, prose written around the old placeholder ("harga online-nya belum sempat
// ditarik", "ketik PN untuk cek harganya") contradicts it: drop those sentences, keep the rest (Alvian 5 Oct).
const KLAIM_TANPA_HARGA_RE = /\b(?:belum\s+(?:sempat\s+)?(?:ditarik|dicek|ada|muncul|tersedia|kebaca|terbaca|ketemu)|tidak\s+(?:ada|tersedia|muncul|ketemu)|gak\s+ada|ngga\s+ada|tidak\s+bisa\s+(?:ditarik|dicek))\b[^.?!\n]*\bharga|\bharga\w*[^.?!\n]*\b(?:belum\s+(?:sempat\s+)?(?:ditarik|dicek|muncul|ada|kebaca|terbaca|ketemu|tersedia)|tidak\s+(?:muncul|tersedia|ada)|gak\s+ada|ngga\s+ada)|\b(?:ketik|kirim|sebut)\b[^.?!\n]*\b(?:pn|part\s*number|nomor\s*part)\b[^.?!\n]*\b(?:cek|harga)/i;
function buangKlaimTanpaHarga(text: string): string {
  return text.split('\n').map(l => {
    if (l.trim().startsWith('|')) return l;
    const kal = l.match(/.+?(?:[.?!]+(?=\s|$)\s*|$)/g)?.filter(Boolean) ?? [l];
    const sisa = kal.map(k => {
      if (!KLAIM_TANPA_HARGA_RE.test(k) || /Belum tersedia\b/.test(k) && /\|/.test(k)) return k;
      const potong = k.replace(/,\s*(?:dan|tapi|namun|but|and)\b.*?[.?!]*(\s*)$/i, '.$1');
      return potong !== k && !KLAIM_TANPA_HARGA_RE.test(potong) ? potong : '';
    }).filter(Boolean);
    return sisa.join('') === kal.join('') ? l : sisa.join('').trim();
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export async function lengkapiHarga(text: string): Promise<string> {
  if (!text.includes('|') || !(KETIK_RE.test(text) || RP_RE.test(text) || BELUM_RE.test(text))) return text;
  const t0 = Date.now();
  const baris = text.split('\n');
  const pnBaris = new Map<number, string>();
  baris.forEach((l, i) => {
    if (!l.trim().startsWith('|') || !(KETIK_RE.test(l) || RP_RE.test(l) || BELUM_RE.test(l))) return;
    const pn = l.match(/`([A-Z0-9][A-Z0-9 .-]{2,21}[A-Z0-9])`/)?.[1] ?? l.split('|').map(x => x.trim()).find(x => PN_SEL_RE.test(x) && /\d/.test(x));
    if (pn) pnBaris.set(i, pn);
  });
  if (!pnBaris.size) return text;
  const web = await hargaWeb([...new Set(pnBaris.values())]);
  let isi = 0, koreksi = 0;
  for (const [i, pn] of pnBaris) {
    const v = web.get(pn.toUpperCase());
    if (v === undefined || v === null) {
      if (KETIK_RE.test(baris[i])) baris[i] = baris[i].replace(KETIK_RE, 'Gagal dicek, kirim ulang');
      continue; // site error: keep what the model wrote rather than guess
    }
    const pas = v.find(w => w.pn.toUpperCase() === pn.toUpperCase());
    const harga = pas ? pas.harga : 'Belum tersedia';
    if (KETIK_RE.test(baris[i])) { baris[i] = baris[i].replace(KETIK_RE, harga); if (pas) isi++; continue; }
    if (BELUM_RE.test(baris[i])) { if (pas) { baris[i] = baris[i].replace(BELUM_RE, m => m.replace(/[^|\s][^|]*[^|\s]/, harga)); isi++; } continue; }
    const tertulis = baris[i].match(RP_RE)?.[0];
    if (tertulis && (!pas || angka(tertulis) !== angka(pas.harga))) {
      console.warn('[harga-susulan] %s tertulis %s, situs %s — dikoreksi', pn, tertulis, harga);
      baris[i] = baris[i].replace(RP_RE, harga);
      koreksi++;
    }
  }
  let out = baris.join('\n');
  if (!KETIK_RE.test(out) && (isi || koreksi)) out = buangKlaimTanpaHarga(out);
  else if (!KETIK_RE.test(out)) out = out.split('\n').filter(l => !TAWAR_CEK_RE.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  console.info('[harga-susulan] %d baris dicek → %d diisi, %d dikoreksi (%dms)', pnBaris.size, isi, koreksi, Date.now() - t0);
  return out;
}
