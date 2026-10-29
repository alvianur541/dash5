#!/usr/bin/env bash
set -euo pipefail
DAYS="${1:-2}"
SINCE="$(date -u -d "-${DAYS} days" +%Y-%m-%dT%H:%M:%SZ)"
gcloud logging read "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"dash5-vertexai-proxy\" AND textPayload:\"[stage]\" AND timestamp>=\"${SINCE}\"" \
  --project=project-85bfc388-3106-4361-a9f --limit=20000 --format='value(textPayload)' \
| node -e '
const lines = require("fs").readFileSync(0, "utf8").split("\n").filter(Boolean);
const ev = lines.map(l => { try { return JSON.parse(l.slice(l.indexOf("{"))); } catch { return null; } }).filter(Boolean);
const med = a => { a = a.slice().sort((x, y) => x - y); return a.length ? (a[Math.floor((a.length - 1) / 2)] / 1000).toFixed(2) : "-"; };
const p90 = a => { a = a.slice().sort((x, y) => x - y); return a.length ? (a[Math.floor((a.length - 1) * 0.9)] / 1000).toFixed(2) : "-"; };
const byStage = {};
for (const e of ev) {
  const key = e.stage + (e.stage === "stream" || e.stage === "generate" ? ` ${e.model || ""} ${e.thinking || ""}` : "");
  (byStage[key] ??= []).push(e.wall_ms);
}
console.log("tahap".padEnd(40), "n".padStart(5), "median dtk".padStart(11), "p90 dtk".padStart(9));
for (const [k, a] of Object.entries(byStage).sort()) console.log(k.padEnd(40), String(a.length).padStart(5), med(a).padStart(11), p90(a).padStart(9));
const byRid = {};
for (const e of ev) (byRid[e.rid] ??= []).push(e);
const preLlm = [], first = [];
for (const list of Object.values(byRid)) {
  const s = list.filter(e => e.stage === "stream").sort((a, b) => a.start_ms - b.start_ms)[0];
  const f = list.find(e => e.stage === "first_text");
  if (s) preLlm.push(s.start_ms);
  if (f) first.push(f.start_ms);
}
console.log(`\nsebelum model mulai (cari+rerank+intent): median ${med(preLlm)} dtk, p90 ${p90(preLlm)} dtk, n=${preLlm.length}`);
console.log(`huruf pertama keluar: median ${med(first)} dtk, p90 ${p90(first)} dtk, n=${first.length}`);
'
