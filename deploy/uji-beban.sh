#!/usr/bin/env bash
# Paired load test: every INTERVAL s fire MODEL_A and MODEL_B at once, streaming. Run in Cloud Shell: bash deploy/uji-beban.sh
set -uo pipefail

PAIRS="${PAIRS:-50}"
INTERVAL="${INTERVAL:-12}"
MODEL_A="${MODEL_A:-gemini-3.7-flash}"
MODEL_B="${MODEL_B:-gemini-3.6-flash}"
SLOW="${SLOW:-10}"
PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SYS="$ROOT/cloudrun/src/constants.ts"

[ -n "$PROJECT" ] || { echo "Project belum di-set. Jalankan: gcloud config set project <PROJECT_ID>"; exit 1; }
[ -f "$SYS" ] || { echo "Jalankan dari repo: cd ~/dash5 && bash deploy/uji-beban.sh"; exit 1; }
TOKEN="$(gcloud auth print-access-token 2>/dev/null)" || { echo "Belum login gcloud."; exit 1; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/beban.py" <<'PY'
import json, os, statistics, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

project, pairs, interval, A, B, slow, sysfile = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), sys.argv[4], sys.argv[5], float(sys.argv[6]), sys.argv[7]
H = {"Authorization": "Bearer " + os.environ["TOKEN"], "Content-Type": "application/json"}
BASE = f"https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/publishers/google/models"

def call(url, body, timeout=150):
    return urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode(), headers=H, method="POST"), timeout=timeout)

print(f"[1] Cek kedua model benar-benar menjawab (bukan cuma cepat gagal) ...")
for m in (A, B):
    try:
        d = json.load(call(f"{BASE}/{m}:generateContent", {"contents": [{"role": "user", "parts": [{"text": "Balas: OK"}]}],
                            "generationConfig": {"maxOutputTokens": 64, "thinkingConfig": {"thinkingLevel": "low"}}}))
        parts = ((d.get("candidates") or [{}])[0].get("content") or {}).get("parts", [])
        if not any(p.get("text", "").strip() and not p.get("thought") for p in parts):
            print(f"  {m}: 200 tapi TANPA teks — uji dibatalkan"); sys.exit(1)
        print(f"  {m}: OK")
    except urllib.error.HTTPError as e:
        print(f"  {m}: HTTP {e.code} — uji dibatalkan (model tidak tersedia)"); sys.exit(1)

sys_text = open(sysfile, encoding="utf-8").read()
steps = "\n".join(f"{i}. Ukur tekanan port uji P{i}, engine {1400 + 100 * i} min-1. Standar {3.5 + i / 10:.1f} MPa; "
                  f"di bawah {3.0 + i / 10:.1f} MPa lanjut ke langkah {i + 1}." for i in range(1, 25))
question = ("Semua aktuator lemah saat oli panas, pump control pressure drop. Apa penyebabnya dan urutan cek?\n\n"
            "[DATA MANUAL TERSEDIA]\nSection: DATA UJI BEBAN (karangan, bukan data manual)\n" + steps + "\n\n---\n\n" + steps)

def one(m):
    body = {"systemInstruction": {"parts": [{"text": sys_text}]},
            "contents": [{"role": "user", "parts": [{"text": question}]}],
            "generationConfig": {"maxOutputTokens": 256, "temperature": 0.3, "thinkingConfig": {"thinkingLevel": "low"}}}
    t0 = time.time()
    try:
        r = call(f"{BASE}/{m}:streamGenerateContent?alt=sse", body, timeout=120)
        hdr = time.time() - t0
        for raw in r:
            line = raw.decode("utf-8", "ignore").strip()
            if not line.startswith("data:"):
                continue
            try:
                j = json.loads(line[5:].strip())
            except Exception:
                continue
            for p in ((j.get("candidates") or [{}])[0].get("content") or {}).get("parts", []):
                if p.get("text") and not p.get("thought"):
                    return {"ok": True, "hdr": hdr, "ttft": time.time() - t0}
        return {"ok": False, "err": "stream selesai tanpa teks"}
    except urllib.error.HTTPError as e:
        return {"ok": False, "err": f"HTTP {e.code}"}
    except Exception as e:
        return {"ok": False, "err": str(e)[:60]}

res = {}
lock = threading.Lock()
def run(i, m, t_mulai):
    x = one(m)
    x["menit"] = int((time.time() - t_mulai) // 60)
    with lock:
        res[(i, m)] = x
        tag = "pemanasan" if i == 0 else f"pasang {i:02d}"
        if x["ok"]:
            tanda = "  <-- LAMBAT" if x["ttft"] > slow else ""
            print(f"  {tag:10s} {m:18s} huruf-1={x['ttft']:5.1f}s{tanda}", flush=True)
        else:
            print(f"  {tag:10s} {m:18s} GAGAL {x['err']}", flush=True)

dur = pairs * interval / 60
print(f"\n[2] {pairs} pasang x 2 model = {pairs * 2} permintaan, tiap {interval:.0f} dtk (~{dur:.0f} menit). Ctrl+C untuk batal.\n")
time.sleep(5)
pool = ThreadPoolExecutor(max_workers=40)
t_mulai = time.time()
for i in range(pairs + 1):
    target = t_mulai + i * interval
    time.sleep(max(0, target - time.time()))
    for m in (A, B):
        pool.submit(run, i, m, t_mulai)
pool.shutdown(wait=True)

def stat(xs):
    ok = [x["ttft"] for x in xs if x["ok"]]
    if not ok:
        return "semua gagal"
    s = sorted(ok)
    p90 = s[min(len(s) - 1, int(len(s) * 0.9))]
    return (f"sukses {len(ok):>3}/{len(xs):<3} tengah {statistics.median(ok):5.1f}s  p90 {p90:5.1f}s  maks {max(ok):5.1f}s  "
            f">{slow:.0f}dtk {sum(v > slow for v in ok):>3}  >30dtk {sum(v > 30 for v in ok):>3}")

print(f"\n[3] Ringkasan per model (tanpa pemanasan)")
for m in (A, B):
    print(f"  {m:18s} {stat([res[(i, m)] for i in range(1, pairs + 1) if (i, m) in res])}")

print(f"\n[4] Per menit — huruf-1 tengah / maks (detik)")
menit = sorted({res[k]['menit'] for k in res if k[0] > 0})
print(f"  {'menit':>6}  {A:>22}  {B:>22}")
for mn in menit:
    row = []
    for m in (A, B):
        v = [res[(i, m)]["ttft"] for i in range(1, pairs + 1) if (i, m) in res and res[(i, m)]["ok"] and res[(i, m)]["menit"] == mn]
        row.append(f"{statistics.median(v):5.1f} / {max(v):5.1f}" if v else "—")
    print(f"  {mn:>6}  {row[0]:>22}  {row[1]:>22}")

def lambat(x):
    return (not x["ok"]) or x["ttft"] > slow
aL = bL = both = 0
for i in range(1, pairs + 1):
    xa, xb = res.get((i, A)), res.get((i, B))
    if not xa or not xb:
        continue
    la, lb = lambat(xa), lambat(xb)
    aL += la and not lb
    bL += lb and not la
    both += la and lb
print(f"\n[5] Pasangan yang dikirim BERSAMAAN (lambat = >{slow:.0f} dtk atau gagal)")
print(f"  hanya {A} lambat : {aL:>3}   <- di sini model lain SEHAT, cadangan lintas-model akan menolong")
print(f"  hanya {B} lambat : {bL:>3}")
print(f"  KEDUANYA lambat  : {both:>3}   <- di sini Google sibuk menyeluruh, tidak ada yang bisa menolong")
PY

echo "Project: $PROJECT | $MODEL_A vs $MODEL_B | $PAIRS pasang tiap ${INTERVAL} dtk | lambat > ${SLOW} dtk"
TOKEN="$TOKEN" python3 "$TMP/beban.py" "$PROJECT" "$PAIRS" "$INTERVAL" "$MODEL_A" "$MODEL_B" "$SLOW" "$SYS"
