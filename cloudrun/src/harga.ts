import type { Message } from './types';
import type { HasilWeb } from './rag';
import { callProxy, getText, INTENT_MODEL } from './vertex';
import { komponenBaris, selBaris, judulKcm } from './rag/hexparts';
import type { Lang } from './templates';

// Fast price path (4 Oct): the main model used to read ~24k tokens just to copy prices into a table.
// Now flash-lite only PICKS which candidate rows answer the question; code builds the table, so every
// number is copied straight from hexindoparts.com and the format never drifts.

export const BUKAN_HARGA_SAJA_RE = /\b(?:cara|prosedur|langkah|pasang|bongkar|lepas|ganti(?!\s*rugi)|torque|torsi|spec|spesifikasi|kenapa|mengapa|rusak|error|fault|bocor|lambat|ukur|tekanan|pressure|berat|weight|fungsi|letak|posisi|lokasi|dimana|di\s*mana|interval|jadwal|kapasitas|beda|perbedaan|bandingkan|compare|why|install|remove|yang\s*mana|yg\s*mana|mana\s*yang|mana\s*yg|yg\s*mna|yang\s*mna|mna\s*y\w*|betul|benar|cocok|sesuai|serial|s\/?n)\b/i;

export const PEMILIH_MS = 3500;

// Catalog section → the component name technicians use, so the picker sees "Main Pump" on every pump row.
const KOMPONEN: Array<[RegExp, string]> = [
  [/^(?:PUMP DEVICE|PUMP;UNIT|REGULATOR;PUMP|PUMP;GEAR|MAIN PUMP)\b/i, 'Main Pump'],
  [/^(?:SWING DEVICE|MOTOR;SWING|SWING MOTOR|DEVICE;SWING)\b/i, 'Swing Motor'],
  [/^(?:TRAVEL DEVICE|MOTOR;TRAVEL|TRAVEL MOTOR|DEVICE;TRAVEL)\b/i, 'Travel Motor'],
  [/^(?:VALVE;CONTROL|CONTROL VALVE)\b/i, 'Control Valve'],
];
const labelKomponen = (section: string): string => {
  const k = KOMPONEN.find(([re]) => re.test(section))?.[1];
  return k && k.toUpperCase() !== section.toUpperCase() ? `${k} (${section})` : section;
};

interface Kandidat { pn: string; nama: string; section: string; harga: string }

const LABEL: Record<Lang, { pn: string; nama: string; harga: string; ket: string; kosong: string; gagal: string; sumber: string }> = {
  id: { pn: 'Part Number', nama: 'Nama Part', harga: 'Harga', ket: 'Keterangan', kosong: 'Belum tersedia', gagal: 'Gagal dicek, kirim ulang', sumber: 'Sumber harga: Hexindoparts.com' },
  en: { pn: 'Part Number', nama: 'Part Name', harga: 'Price', ket: 'Note', kosong: 'Not listed', gagal: 'Check failed, resend', sumber: 'Price source: Hexindoparts.com' },
  ja: { pn: '部品番号', nama: '部品名', harga: '価格', ket: '備考', kosong: '掲載なし', gagal: '確認失敗・再送してください', sumber: '価格の出典: Hexindoparts.com' },
};

// PN → catalog name + section title, read from the retrieved chunks.
function katalogPn(content: string): Map<string, { nama: string; section: string }> {
  const peta = new Map<string, { nama: string; section: string }>();
  let section = '';
  for (const line of content.split('\n')) {
    const judul = line.match(/^Section:\s*(.+)$/i);
    if (judul) { section = judul[1].replace(/^PROMO Q\d FY\d{4}\s*-\s*|^DAFTAR PARTS\s*-\s*|^\d+\s*-\s*/i, '').replace(/\s*\(Part \d+\/\d+\)\s*$/i, '').trim(); continue; }
    const jk = judulKcm(line);
    if (jk) { section = jk.replace(/\b\w/g, c => c).toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); continue; }
    const sel = selBaris(line);
    const i = sel.findIndex(x => /^(?=[A-Z0-9 .-]*\d)[A-Z0-9][A-Z0-9 .-]{2,21}[A-Z0-9]$/.test(x));
    if (i >= 0 && sel[i + 1] && !peta.has(sel[i])) peta.set(sel[i], { nama: sel[i + 1], section: komponenBaris(line) ?? section });
  }
  return peta;
}

function kandidatDari(pnsUrut: string[], web: HasilWeb, content: string, lang: Lang): Kandidat[] {
  const kat = katalogPn(content);
  const L = LABEL[lang];
  const out: Kandidat[] = [];
  for (const pn of pnsUrut) {
    const v = web.get(pn);
    if (v === undefined) continue;
    const info = kat.get(pn);
    if (v === null) { out.push({ pn, nama: info?.nama ?? '', section: info?.section ?? '', harga: L.gagal }); continue; }
    if (!v.length) { out.push({ pn, nama: info?.nama ?? '', section: info?.section ?? '', harga: L.kosong }); continue; }
    for (const w of v) out.push({ pn: w.pn, nama: info?.nama || w.nama, section: info?.section ?? '', harga: w.harga });
  }
  return out;
}

async function pilihBaris(q: string, history: Message[], kandidat: Kandidat[], lang: Lang): Promise<{ pilih: number[]; pembuka: string } | null> {
  const lalu = [...history].reverse().find(m => m.role === 'user')?.content ?? '';
  const daftar = kandidat.map((k, i) => `${i + 1} | ${k.pn} | ${k.nama} | ${k.section ? labelKomponen(k.section) : '-'}`).join('\n');
  const bahasa = lang === 'en' ? 'English' : lang === 'ja' ? 'Japanese' : 'Bahasa Indonesia santai';
  const prompt = `Pertanyaan teknisi: "${q}"${lalu ? `\nPertanyaan sebelumnya: "${lalu.slice(0, 200)}"` : ''}

Kandidat part (no | PN | nama | section katalog):
${daftar}

Pilih SEMUA nomor baris yang (a) jenis part-nya sama dengan yang ditanya — tulisan berbeda tetap sama: KIT;SEAL = Kit; Seal = seal kit = SEAL (di section pompa/motor) — DAN (b) milik komponen yang ditanya. Jangan berhenti di satu baris kalau ada beberapa yang memenuhi. Buang jenis part lain (KIT;MAINTENANCE bukan seal kit, rotor bukan seal kit) dan part milik komponen LAIN (seal kit main pump ≠ seal kit swing motor). Kalau tidak ada yang cocok, "pilih" kosong.
Kolom section sudah menyebut komponennya (mis. "Main Pump (REGULATOR;PUMP)" = bagian main pump); pilih semua baris komponen itu yang jenis part-nya cocok.
Balas HANYA JSON satu baris: {"pilih":[nomor,...],"pembuka":"<kalimat pengantar ≤12 kata, ${bahasa}, tanpa angka harga, tanpa salam, sapa dengan "kamu" bukan "Anda">"}`;
  try {
    // A slow picker must not make the fast path slower than the main model (seen once: 19,5 s).
    let batas: ReturnType<typeof setTimeout> | undefined;
    const res = await Promise.race([
      callProxy({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0, thinkingConfig: { thinkingLevel: 'minimal' } },
      }, false, INTENT_MODEL),
      new Promise<never>((_, tolak) => { batas = setTimeout(() => tolak(new Error(`batas ${PEMILIH_MS} ms`)), PEMILIH_MS); }),
    ]).finally(() => clearTimeout(batas));
    const raw = getText(res.candidates?.[0]?.content?.parts ?? []);
    const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const p = JSON.parse(json) as { pilih?: unknown; pembuka?: unknown };
    const pilih = Array.isArray(p.pilih) ? p.pilih.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= kandidat.length) : [];
    return { pilih: [...new Set(pilih)], pembuka: typeof p.pembuka === 'string' ? p.pembuka.replace(/Rp\s?[\d.]+/g, '').trim() : '' };
  } catch (err) {
    console.warn('[harga-cepat] pemilih gagal: %s', (err as Error)?.message);
    return null;
  }
}

export async function jawabanHargaCepat(q: string, history: Message[], pnsUrut: string[], web: HasilWeb, content: string, lang: Lang): Promise<string | null> {
  const kandidat = kandidatDari(pnsUrut, web, content, lang);
  if (!kandidat.some(k => /Rp\s?\d/.test(k.harga))) return null;
  const t0 = Date.now();
  const hasil = await pilihBaris(q, history, kandidat, lang);
  if (!hasil?.pilih.length) {
    console.info('[harga-cepat] dilewati (%s) — pakai model utama', hasil ? 'tak ada baris cocok' : 'pemilih gagal');
    return null;
  }
  const ada = (k: Kandidat) => (/Rp\s?\d/.test(k.harga) ? 0 : 1);
  const baris = hasil.pilih.map(n => kandidat[n - 1]).sort((a, b) => ada(a) - ada(b));
  const L = LABEL[lang];
  const pakaiKet = new Set(baris.map(b => b.section).filter(Boolean)).size > 1;
  const kepala = pakaiKet ? `| ${L.pn} | ${L.nama} | ${L.harga} | ${L.ket} |\n|---|---|---|---|` : `| ${L.pn} | ${L.nama} | ${L.harga} |\n|---|---|---|`;
  const isi = baris.map(b => {
    const sel = [`\`${b.pn}\``, b.nama.replace(/\|/g, '/'), b.harga];
    if (pakaiKet) sel.push(b.section.replace(/\|/g, '/') || '-');
    return `| ${sel.join(' | ')} |`;
  });
  console.info('[harga-cepat] %d dari %d kandidat dipilih (%dms)', baris.length, kandidat.length, Date.now() - t0);
  return `${hasil.pembuka ? `${hasil.pembuka}\n\n` : ''}${kepala}\n${isi.join('\n')}\n\n*${L.sumber}*`;
}
