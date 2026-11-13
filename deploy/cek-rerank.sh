#!/usr/bin/env bash
set -euo pipefail
DAYS="${1:-7}"
SINCE="$(date -u -d "-${DAYS} days" +%Y-%m-%dT%H:%M:%SZ)"
gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"dash5-vertexai-proxy\" AND (textPayload:\"[confidence]\" OR textPayload:\"[chunks]\" OR textPayload:\"[vektor]\" OR textPayload:\"[jaminan-keyword]\" OR textPayload:\"[web]\") AND timestamp>=\"${SINCE}\"" \
  --project=project-85bfc388-3106-4361-a9f --limit=20000 --format='value(textPayload)' \
| node -e '
const lines = require("fs").readFileSync(0, "utf8").split("\n").filter(Boolean);
const q = (a, p) => { a = a.slice().sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) * p)].toFixed(2) : "-"; };
const baris = (nama, a) => console.log(nama.padEnd(34), String(a.length).padStart(5), q(a, 0.1).padStart(6), q(a, 0.5).padStart(6), q(a, 0.9).padStart(6));
const tier = {}, sumber = {}, cari = [], rerank = [];
for (const l of lines) {
  const m = /\[confidence\] tm tier=(\w+).*topScore=([\d.]+).*cari=(\d+)ms rerank=(\d+)ms \((\w+|-)\)/.exec(l);
  if (!m) continue;
  (tier[m[1]] ??= []).push(+m[2]);
  sumber[m[5]] = (sumber[m[5]] || 0) + 1;
  cari.push(+m[3] / 1000); rerank.push(+m[4] / 1000);
}
console.log("SKOR TERATAS PER TINGKAT".padEnd(34), "n".padStart(5), "p10".padStart(6), "p50".padStart(6), "p90".padStart(6));
for (const k of ["high", "medium", "low"]) baris(`  ${k}`, tier[k] || []);
console.log("  sumber skor:", JSON.stringify(sumber));
baris("  waktu cari (dtk)", cari);
baris("  waktu rerank (dtk)", rerank);
const pos = [[], [], [], []], nisbah = [[], [], []];
let ekor = 0, total = 0, kembar = 0, jawab = 0;
for (const l of lines) {
  if (!l.includes("[chunks]")) continue;
  const butir = l.slice(l.indexOf("[chunks]") + 8).split("  ||  ");
  const s = butir.map(b => +(/#\d+\(([\d.-]+)\)/.exec(b)?.[1] ?? NaN)).filter(x => !Number.isNaN(x));
  if (!s.length) continue;
  jawab++;
  const judul = butir.map(b => b.replace(/^\s*#\d+\([\d.-]+\)\s*/, "").split(" / ")[0]);
  if (new Set(judul).size < judul.length) kembar++;
  s.forEach((x, i) => {
    if (i < 4) pos[i].push(x);
    if (i > 0 && i < 4 && s[0] > 0) nisbah[i - 1].push(x / s[0]);
    if (i > 0) { total++; if (x < 0.05 || (s[0] > 0 && x / s[0] < 0.25)) ekor++; }
  });
}
console.log("\nSKOR PER URUTAN CHUNK KE MODEL".padEnd(35), "n".padStart(5), "p10".padStart(6), "p50".padStart(6), "p90".padStart(6));
pos.forEach((a, i) => baris(`  chunk #${i + 1}`, a));
nisbah.forEach((a, i) => baris(`  #${i + 2} dibanding #1`, a));
console.log(`  chunk #2-#4 berskor <0.05 atau <25% dari #1: ${ekor}/${total} (${total ? Math.round(ekor / total * 100) : 0}%)`);
console.log(`  jawaban dengan >=2 chunk berjudul section sama: ${kembar}/${jawab}`);
const pin = lines.filter(l => l.includes("[jaminan-keyword]")).length;
const web = lines.filter(l => /\[web\] route=/.test(l));
const webAda = web.filter(l => !/sumber=0\b/.test(l)).length;
console.log(`\njaminan keyword dipakai: ${pin}x | jawaban berizin web: ${web.length}, benar-benar mencari: ${webAda}`);
const dom = {};
for (const l of web) for (const d of (/(?:Rujukan web|Web references): (.+)$/.exec(l)?.[1] ?? "").split(" · ").filter(Boolean)) dom[d] = (dom[d] || 0) + 1;
console.log("situs web terpakai:", Object.entries(dom).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([d, n]) => `${d} ${n}`).join(", ") || "-");
'
