#!/usr/bin/env bash
# Vertex AI usage report for the backend. Run in Cloud Shell: bash deploy/cek-vertex.sh [DAYS]
set -uo pipefail

HARI="${1:-1}"
PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
SERVICE="${SERVICE:-dash5-vertexai-proxy}"
PRICE_IN="${PRICE_IN:-1.50}"
PRICE_OUT="${PRICE_OUT:-9.00}"
KURS="${KURS:-16300}"

if ! [[ "$HARI" =~ ^[0-9]+$ ]] || (( HARI < 1 || HARI > 30 )); then
  echo "Jumlah hari harus 1-30. Contoh: bash deploy/cek-vertex.sh 7"; exit 1
fi
[ -n "$PROJECT" ] || { echo "Project belum di-set. Jalankan: gcloud config set project <PROJECT_ID>"; exit 1; }

TOKEN="$(gcloud auth print-access-token 2>/dev/null)" || { echo "Belum login gcloud."; exit 1; }
END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START="$(date -u -d "-${HARI} days" +%Y-%m-%dT%H:%M:%SZ)"
MON="https://monitoring.googleapis.com/v3/projects/${PROJECT}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

echo "Mengambil data ${HARI} hari terakhir untuk ${PROJECT} ..."

curl -s -G -H "Authorization: Bearer $TOKEN" "$MON/metricDescriptors" \
  --data-urlencode 'filter=metric.type = starts_with("aiplatform.googleapis.com/publisher/")' > "$TMP/desc.json"

cat > "$TMP/pick.py" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(0)
for m in d.get("metricDescriptors", []):
    t = m.get("type", "")
    if any(k in t for k in ("token_count", "invocation_count", "characters")):
        aligner = "ALIGN_DELTA" if m.get("metricKind") == "CUMULATIVE" else "ALIGN_SUM"
        print(t + "\t" + aligner)
PY
python3 "$TMP/pick.py" "$TMP/desc.json" > "$TMP/metrics.tsv"

i=0
while IFS=$'\t' read -r mtype aligner; do
  [ -n "$mtype" ] || continue
  page=""; n=0
  while :; do
    curl -s -G -H "Authorization: Bearer $TOKEN" "$MON/timeSeries" \
      --data-urlencode "filter=metric.type=\"$mtype\"" \
      --data-urlencode "interval.startTime=$START" \
      --data-urlencode "interval.endTime=$END" \
      --data-urlencode "aggregation.alignmentPeriod=3600s" \
      --data-urlencode "aggregation.perSeriesAligner=$aligner" \
      ${page:+--data-urlencode "pageToken=$page"} > "$TMP/ts_${i}_${n}.json"
    page="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("nextPageToken",""))' "$TMP/ts_${i}_${n}.json" 2>/dev/null)"
    n=$((n + 1))
    if [ -z "$page" ] || [ "$n" -ge 50 ]; then break; fi
  done
  printf '%s\t%s\n' "$i" "$mtype" >> "$TMP/ts_index.tsv"
  i=$((i + 1))
done < "$TMP/metrics.tsv"

gcloud logging read \
  "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE}\" AND (textPayload:\"[ask]\" OR textPayload:\"[tokens]\" OR textPayload:\"[transcribe]\")" \
  --project="$PROJECT" --freshness="${HARI}d" --limit=20000 \
  --format='value(timestamp,textPayload)' > "$TMP/logs.txt" 2>"$TMP/logs.err" || true

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT}/locations/global/cachedContents?pageSize=100" > "$TMP/cache.json"

BILLING="$(gcloud billing projects describe "$PROJECT" --format='value(billingAccountName)' 2>/dev/null || true)"

cat > "$TMP/report.py" <<'PY'
import json, os, re, sys, glob
from collections import defaultdict
from datetime import datetime, timedelta, timezone

tmp, hari, p_in, p_out, kurs, project, billing = sys.argv[1:8]
hari, p_in, p_out, kurs = int(hari), float(p_in), float(p_out), float(kurs)

def rb(n): return f"{int(round(n)):,}".replace(",", ".")
def rp(usd): return "Rp" + rb(usd * kurs)
def cost(i, o): return i / 1e6 * p_in + o / 1e6 * p_out
def wib(ts):
    try: return datetime.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S") + timedelta(hours=7)
    except ValueError: return None

now = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=7)
print(f"\n=== Pemakaian Vertex AI - {project} - {hari} hari terakhir (sampai {now:%d %b %H:%M} WIB) ===")

print("\n[1] Hitungan Google (Cloud Monitoring, semua panggilan Vertex)")
index = os.path.join(tmp, "ts_index.tsv")
rows = defaultdict(float)
if os.path.exists(index):
    for line in open(index):
        idx, mtype = line.rstrip("\n").split("\t")
        short = mtype.split("/")[-1]
        for f in sorted(glob.glob(os.path.join(tmp, f"ts_{idx}_*.json"))):
            try: d = json.load(open(f))
            except Exception: continue
            if "error" in d:
                print(f"  ! {short}: {d['error'].get('message', '')[:120]}")
                continue
            for s in d.get("timeSeries", []):
                rl = s.get("resource", {}).get("labels", {})
                ml = s.get("metric", {}).get("labels", {})
                model = rl.get("model_user_id") or rl.get("model_version_id") or ml.get("model") or "-"
                extra = ",".join(f"{k}={v}" for k, v in sorted(ml.items()) if k != "response_code")
                for p in s.get("points", []):
                    v = p.get("value", {})
                    if "int64Value" in v: x = float(v["int64Value"])
                    elif "doubleValue" in v: x = float(v["doubleValue"])
                    elif "distributionValue" in v:
                        dv = v["distributionValue"]; x = float(dv.get("count", 0)) * float(dv.get("mean", 0))
                    else: x = 0.0
                    rows[(short, model, extra)] += x
if rows:
    print(f"  {'metrik':<26} {'model':<28} {'label':<30} {'total':>14}")
    for (m, model, extra), v in sorted(rows.items()):
        print(f"  {m:<26} {model:<28} {extra[:30]:<30} {rb(v):>14}")
else:
    print("  (tidak ada data - metrik belum tersedia atau tidak ada pemakaian; lihat bagian [2])")

print("\n[2] Hitungan aplikasi (log Cloud Run, per pertanyaan teknisi)")
ask_re = re.compile(r'\[ask\] .*?user=(.*?) unit=(\S+) q="(.*?)" route=(\S+) .*?model=(\S+) .*?total=(\d+) in=(\d+) out=(\d+) calls=(\d+)')
tok_re = re.compile(r'\[tokens\] model=(\S+) .*?in=(\d+) \(prompt-cache (\d+)%\) out=(\d+) thinking=(\d+)')
tr_re = re.compile(r'\[transcribe\] model=(\S+) ms=(\d+)')
n = foto = calls = tin = tout = 0
per_hari = defaultdict(lambda: [0, 0, 0])
per_user = defaultdict(lambda: [0, 0, 0])
per_route = defaultdict(int)
per_model = defaultdict(lambda: [0, 0, 0, 0, 0.0])
tr_n = tr_ms = 0
logs = os.path.join(tmp, "logs.txt")
for line in (open(logs, encoding="utf-8", errors="replace") if os.path.exists(logs) else []):
    ts, _, text = line.rstrip("\n").partition("\t")
    m = ask_re.search(text)
    if m:
        user, unit, q, route, model, total, i, o, c = m.groups()
        i, o, c = int(i), int(o), int(c)
        n += 1; calls += c; tin += i; tout += o
        foto += q.startswith("[+foto]")
        t = wib(ts); day = f"{t:%Y-%m-%d}" if t else "?"
        for bucket in (per_hari[day], per_user[user.strip() or "-"]):
            bucket[0] += 1; bucket[1] += i; bucket[2] += o
        per_route[route] += 1
        continue
    m = tok_re.search(text)
    if m:
        model, i, cache, o, th = m.groups()
        pm = per_model[model]
        pm[0] += 1; pm[1] += int(i); pm[2] += int(o); pm[3] += int(th); pm[4] += int(i) * int(cache) / 100
        continue
    m = tr_re.search(text)
    if m:
        tr_n += 1; tr_ms += int(m.group(2))

err = os.path.join(tmp, "logs.err")
if n == 0 and os.path.exists(err) and os.path.getsize(err):
    print("  ! gagal membaca log:", open(err).read().strip()[:200])
print(f"  Pertanyaan: {rb(n)} (dengan foto: {rb(foto)})   Panggilan AI: {rb(calls)}")
print(f"  Token input: {rb(tin)}   Token output+thinking: {rb(tout)}")
if per_hari:
    print(f"\n  {'Tanggal (WIB)':<14} {'tanya':>6} {'input':>12} {'output':>11} {'perkiraan':>12}")
    for d in sorted(per_hari):
        c, i, o = per_hari[d]
        print(f"  {d:<14} {c:>6} {rb(i):>12} {rb(o):>11} {rp(cost(i, o)):>12}")
if per_user:
    print(f"\n  {'Teknisi':<20} {'tanya':>6} {'input':>12} {'output':>11}")
    for u, (c, i, o) in sorted(per_user.items(), key=lambda kv: -kv[1][0]):
        print(f"  {u[:20]:<20} {c:>6} {rb(i):>12} {rb(o):>11}")
if per_route:
    print("\n  Jalur: " + " | ".join(f"{r} {c}" for r, c in sorted(per_route.items(), key=lambda kv: -kv[1])))
if per_model:
    print(f"\n  {'Jawaban utama per model':<25} {'panggilan':>9} {'input':>12} {'output':>10} {'thinking':>9} {'cache':>6}")
    for mdl, (c, i, o, th, cached) in sorted(per_model.items()):
        pct = f"{round(cached / i * 100)}%" if i else "-"
        print(f"  {mdl:<25} {c:>9} {rb(i):>12} {rb(o):>10} {rb(th):>9} {pct:>6}")
if tr_n:
    print(f"\n  Input suara (transcribe): {rb(tr_n)} rekaman, rata-rata {tr_ms / tr_n / 1000:.1f} dtk")

print(f"\n[3] Perkiraan biaya token (tarif ${p_in}/${p_out} per 1 juta token input/output, kurs {rb(kurs)})")
usd = cost(tin, tout)
print(f"  Total: ${usd:.4f} = {rp(usd)}" + (f"   per pertanyaan = {rp(usd / n)}" if n else ""))
print("  Semua token dihitung dengan tarif model utama (flash-lite untuk intent/OCR sebenarnya lebih murah),")
print("  input suara & embedding tidak termasuk. Angka pasti hanya di halaman Billing.")

print("\n[4] Prompt cache yang sedang tersimpan (ditagih per jam walau tidak dipakai)")
try:
    cd = json.load(open(os.path.join(tmp, "cache.json")))
    if "error" in cd:
        print("  ! tidak bisa dicek:", cd["error"].get("message", "")[:120])
    else:
        items = cd.get("cachedContents", [])
        tokens = sum(int(c.get("usageMetadata", {}).get("totalTokenCount", 0)) for c in items)
        note = "   <- seharusnya 0 selama PROMPT_CACHE=off" if items else "   (aman)"
        print(f"  {len(items)} cache, total {rb(tokens)} token{note}")
except Exception:
    print("  ! tidak bisa dicek")

print("\n[5] Tagihan pasti (Rupiah): Billing -> Reports, filter Service = Vertex AI")
acc = billing.split("/")[-1] if billing else ""
print(f"  https://console.cloud.google.com/billing/{acc}/reports" if acc else "  https://console.cloud.google.com/billing")
PY

python3 "$TMP/report.py" "$TMP" "$HARI" "$PRICE_IN" "$PRICE_OUT" "$KURS" "$PROJECT" "$BILLING"
