#!/usr/bin/env bash
# Vertex AI usage report for the backend. Run in Cloud Shell: bash deploy/cek-vertex.sh [DAYS]
set -uo pipefail

HARI="${1:-1}"
PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
SERVICE="${SERVICE:-dash5-vertexai-proxy}"
PRICE_IN="${PRICE_IN:-1.50}"
PRICE_OUT="${PRICE_OUT:-9.00}"
PRICE_LITE_IN="${PRICE_LITE_IN:-$PRICE_IN}"
PRICE_LITE_OUT="${PRICE_LITE_OUT:-$PRICE_OUT}"
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
  "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE}\" AND (textPayload:\"[ask]\" OR textPayload:\"[tokens]\" OR textPayload:\"[transcribe]\" OR textPayload:\"[stream]\" OR textPayload:\"[fallback]\" OR textPayload:\"[upstream]\" OR textPayload:\"[ask-error]\" OR textPayload:\"Vertex 429\")" \
  --project="$PROJECT" --freshness="${HARI}d" --limit=20000 \
  --format='value(timestamp,textPayload)' > "$TMP/logs.txt" 2>"$TMP/logs.err" || true

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT}/locations/global/cachedContents?pageSize=100" > "$TMP/cache.json"

BILLING="$(gcloud billing projects describe "$PROJECT" --format='value(billingAccountName)' 2>/dev/null || true)"

cat > "$TMP/report.py" <<'PY'
import json, os, re, sys, glob
from collections import defaultdict
from datetime import datetime, timedelta, timezone

tmp, hari, p_in, p_out, kurs, project, billing, pl_in, pl_out = sys.argv[1:10]
hari, p_in, p_out, kurs, pl_in, pl_out = int(hari), float(p_in), float(p_out), float(kurs), float(pl_in), float(pl_out)

def rb(n): return f"{int(round(n)):,}".replace(",", ".")
def rp(usd): return "Rp" + rb(usd * kurs)
def cost(i, o): return i / 1e6 * p_in + o / 1e6 * p_out
def wib(ts):
    try: return datetime.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S") + timedelta(hours=7)
    except ValueError: return None

now = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=7)
print(f"\n=== Pemakaian Vertex AI - {project} - {hari} hari terakhir (sampai {now:%d %b %H:%M} WIB) ===")

print("\n[1] Hitungan Google (Cloud Monitoring, semua panggilan Vertex)")
NOISE = {"input_token_size", "output_token_size", "request_type", "shared_request_type", "source", "method"}
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
                extra = ",".join(f"{k}={v}" for k, v in sorted(ml.items()) if k not in NOISE)
                for p in s.get("points", []):
                    v = p.get("value", {})
                    if "int64Value" in v: x = float(v["int64Value"])
                    elif "doubleValue" in v: x = float(v["doubleValue"])
                    elif "distributionValue" in v:
                        dv = v["distributionValue"]; x = float(dv.get("count", 0)) * float(dv.get("mean", 0))
                    else: x = 0.0
                    rows[(short, model, extra)] += x
g_tok = defaultdict(lambda: [0.0, 0.0, 0.0])
g_calls = defaultdict(float)
if rows:
    print(f"  {'metrik':<24} {'model':<24} {'total':>12}  label")
    for (m, model, extra), v in sorted(rows.items()):
        print(f"  {m:<24} {model:<24} {rb(v):>12}  {extra}")
        if m == "token_count":
            low = extra.lower()
            slot = 0 if "input" in low else 1 if "output" in low else 2
            g_tok[model][slot] += v
        elif m == "model_invocation_count":
            g_calls[model] += v
else:
    print("  (tidak ada data - metrik belum tersedia atau tidak ada pemakaian; lihat bagian [2])")

print("\n[2] Hitungan aplikasi (log Cloud Run, per pertanyaan teknisi)")
ask_re = re.compile(r'\[ask\] .*?user=(.*?) unit=(\S+) q="(.*?)" route=(\S+) .*?model=(\S+) .*?total=(\d+) in=(\d+) out=(\d+) calls=(\d+)')
tok_re = re.compile(r'\[tokens\] model=(\S+) .*?in=(\d+) \(prompt-cache (\d+)%\) out=(\d+) thinking=(\d+)')
tr_re = re.compile(r'\[transcribe\] model=(\S+) ms=(\d+)')
retry_re = re.compile(r'\[fallback\] percobaan (\d+) → model (\S+)')
why_re = re.compile(r'\[stream\] (.*?) — percobaan')
q429_re = re.compile(r'\[fallback\] (\S+) 429')
halt_re = re.compile(r'\[stream\] finishReason=(\S+) tetap')
stall_re = re.compile(r'\[upstream\] .*macet')
err_re = re.compile(r'\[ask-error\] .*?user=(.*?) unit=(\S+) q="(.*?)" after=(\d+)ms sebab=(\S+)')
v429_re = re.compile(r'Vertex 429 \((.*?)\)')
n = foto = calls = tin = tout = 0
per_hari = defaultdict(lambda: [0, 0, 0])
per_user = defaultdict(lambda: [0, 0, 0])
per_route = defaultdict(int)
per_model = defaultdict(lambda: [0, 0, 0, 0, 0.0])
retry_to = defaultdict(int)
why = defaultdict(int)
v429 = defaultdict(int)
errors = []
tr_n = tr_ms = halted = stalls = 0
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
        tr_n += 1; tr_ms += int(m.group(2)); continue
    m = retry_re.search(text)
    if m:
        retry_to[m.group(2)] += 1; continue
    m = halt_re.search(text)
    if m:
        halted += 1; continue
    m = why_re.search(text)
    if m:
        why[re.sub(r"\d+", "N", m.group(1))[:70]] += 1; continue
    m = q429_re.search(text)
    if m:
        why[f"429 kapasitas penuh ({m.group(1)})"] += 1; continue
    m = err_re.search(text)
    if m:
        t = wib(ts)
        errors.append((f"{t:%d %b %H:%M}" if t else "?", m.group(5), int(m.group(4)), m.group(3)))
        continue
    m = v429_re.search(text)
    if m:
        v429[m.group(1)] += 1; continue
    if stall_re.search(text):
        stalls += 1

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
retries = sum(retry_to.values())
print(f"\n  Jawaban diulang otomatis: {rb(retries)} kali" + (" (" + ", ".join(f"ke {k} {v}x" for k, v in sorted(retry_to.items())) + ")" if retries else ""))
for reason, c in sorted(why.items(), key=lambda kv: -kv[1]):
    print(f"    {c:>3}x  {reason}")
if halted:
    print(f"    {halted:>3}x  tetap terhenti -> teknisi dapat catatan 'jawaban terhenti'")
if stalls:
    print(f"  Koneksi macet dibuka ulang: {rb(stalls)} kali")
if v429:
    print("  Vertex 429 lalu dicoba lagi oleh server: " + ", ".join(f"{k} {c}x" for k, c in sorted(v429.items())))
if errors:
    print(f"\n  Pertanyaan GAGAL (tidak masuk hitungan di atas): {len(errors)}")
    for w, sebab, after, q in errors[:15]:
        print(f"    {w}  {sebab:<12} {after / 1000:>5.1f} dtk  {q[:50]}")
main_calls = sum(v for k, v in g_calls.items() if "lite" not in k)
if main_calls:
    logged = sum(pm[0] for pm in per_model.values()) + retries
    gap = main_calls - logged
    print(f"\n  Panggilan model utama: Google {rb(main_calls)} vs log {rb(logged)} (jawaban + ulangan)"
          + (f" -> selisih {rb(gap)}" if gap else " -> cocok"))
if tr_n:
    print(f"\n  Input suara (transcribe): {rb(tr_n)} rekaman, rata-rata {tr_ms / tr_n / 1000:.1f} dtk")

print(f"\n[3] Perkiraan biaya token (flash ${p_in}/${p_out}, flash-lite ${pl_in}/${pl_out} per 1 juta token input/output, kurs {rb(kurs)})")
g_known = {mdl: t for mdl, t in g_tok.items() if t[0] or t[1]}
if g_known:
    g_usd = 0.0
    for mdl, (gi, go, gu) in sorted(g_known.items()):
        ci, co = (pl_in, pl_out) if "lite" in mdl else (p_in, p_out)
        usd = gi / 1e6 * ci + go / 1e6 * co
        g_usd += usd
        print(f"  {mdl:<24} input {rb(gi):>10}  output {rb(go):>9}  = {rp(usd)}")
    print(f"  Dari hitungan Google: ${g_usd:.4f} = {rp(g_usd)}" + (f"   per pertanyaan = {rp(g_usd / n)}" if n else ""))
elif rows:
    print("  (label jenis token input/output tidak dikenali di hitungan Google - pakai perkiraan dari log)")
usd = cost(tin, tout)
print(f"  Dari log aplikasi:    ${usd:.4f} = {rp(usd)}" + (f"   per pertanyaan = {rp(usd / n)}" if n else ""))
print("  Log aplikasi tidak menghitung jawaban yang diulang & input suara. Angka pasti hanya di halaman Billing.")

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

python3 "$TMP/report.py" "$TMP" "$HARI" "$PRICE_IN" "$PRICE_OUT" "$KURS" "$PROJECT" "$BILLING" "$PRICE_LITE_IN" "$PRICE_LITE_OUT"
