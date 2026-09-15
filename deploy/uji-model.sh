#!/usr/bin/env bash
# Compare Gemini models (availability + streaming latency). Run in Cloud Shell: cd ~/dash5 && bash deploy/uji-model.sh [RUNS]
set -uo pipefail

RUNS="${1:-5}"
PROJECT="${PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
BASELINE="${BASELINE:-gemini-3.7-flash}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SYS="$ROOT/cloudrun/src/constants.ts"

if ! [[ "$RUNS" =~ ^[0-9]+$ ]] || (( RUNS < 1 || RUNS > 15 )); then
  echo "Jumlah run harus 1-15. Contoh: bash deploy/uji-model.sh 5"; exit 1
fi
[ -n "$PROJECT" ] || { echo "Project belum di-set. Jalankan: gcloud config set project <PROJECT_ID>"; exit 1; }
[ -f "$SYS" ] || { echo "Jalankan dari repo: cd ~/dash5 && bash deploy/uji-model.sh"; exit 1; }
TOKEN="$(gcloud auth print-access-token 2>/dev/null)" || { echo "Belum login gcloud."; exit 1; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/uji.py" <<'PY'
import json, os, re, statistics, sys, time, urllib.error, urllib.request

project, runs, baseline, extra, sysfile = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5]
H = {"Authorization": "Bearer " + os.environ["TOKEN"], "Content-Type": "application/json"}
BASE = f"https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/publishers/google/models"

def call(url, body=None, headers=H, timeout=150):
    data = json.dumps(body).encode() if body is not None else None
    return urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET"), timeout=timeout)

def err_text(e):
    try:
        return e.read().decode("utf-8", "ignore").replace("\n", " ")[:160]
    except Exception:
        return str(e)[:160]

def ver(n):
    m = re.match(r"gemini-(\d+)\.(\d+)", n)
    return (int(m[1]), int(m[2])) if m else None

print("[1] Katalog model Vertex (publishers/google) ...")
names, page = [], ""
for _ in range(10):
    url = "https://aiplatform.googleapis.com/v1beta1/publishers/google/models?pageSize=300" + (f"&pageToken={page}" if page else "")
    try:
        d = json.load(call(url, headers={**H, "x-goog-user-project": project}))
    except urllib.error.HTTPError as e:
        print(f"  katalog gagal dibaca: HTTP {e.code} {err_text(e)}")
        break
    names += [m.get("name", "").split("/")[-1] for m in d.get("publisherModels", [])]
    page = d.get("nextPageToken", "")
    if not page:
        break
SKIP = re.compile(r"transcribe|live|tts|image|embedding|audio|native", re.I)
newer = sorted({n for n in names if ver(n) and ver(n) >= (3, 7) and not SKIP.search(n)})
print("  Gemini >= 3.7 di katalog: " + (", ".join(newer) or "(tidak ada)"))

base_v = ver(baseline) or (3, 7)
cands = [baseline] + [n for n in newer if ver(n) > base_v and "lite" not in n]
cands += extra.split()
for guess in ("gemini-3.8-flash", "gemini-3.8-flash-preview"):
    cands.append(guess)
cands = list(dict.fromkeys(c for c in cands if c))[:6]

print("\n[2] Ketersediaan (generateContent @ global, thinking low) ...")
avail = []
for m in cands:
    body = {"contents": [{"role": "user", "parts": [{"text": "Balas satu kata: OK"}]}],
            "generationConfig": {"maxOutputTokens": 256, "thinkingConfig": {"thinkingLevel": "low"}}}
    try:
        d = json.load(call(f"{BASE}/{m}:generateContent", body))
        parts = ((d.get("candidates") or [{}])[0].get("content") or {}).get("parts", [])
        ok = any(p.get("text", "").strip() and not p.get("thought") for p in parts)
        body["generationConfig"]["thinkingConfig"]["thinkingLevel"] = "minimal"
        try:
            call(f"{BASE}/{m}:generateContent", body).read()
            mini = "diterima"
        except urllib.error.HTTPError as e:
            mini = f"DITOLAK ({e.code})"
        print(f"  {m:34s} 200  jawaban={'ada' if ok else 'KOSONG'}  thinking 'minimal' {mini}")
        if ok:
            avail.append(m)
    except urllib.error.HTTPError as e:
        print(f"  {m:34s} {e.code}  {err_text(e)[:110]}")
    except Exception as e:
        print(f"  {m:34s} gagal: {str(e)[:110]}")

if len(avail) < 2:
    print("\nKurang dari 2 model tersedia — tidak ada pembanding. Selesai.")
    sys.exit(0)

sys_text = open(sysfile, encoding="utf-8").read()
steps = "\n".join(
    f"{i}. Ukur tekanan pada port uji P{i} dengan engine {1400 + 100 * i} min-1, oli {45 + i} °C. "
    f"Standar {3.5 + i / 10:.1f} MPa; di bawah {3.0 + i / 10:.1f} MPa lanjut ke langkah {i + 1}. "
    f"Periksa filter, katup pengatur, dan seal pada komponen uji ke-{i}."
    for i in range(1, 25))
question = (
    "[Teknisi: Uji | Model AI: uji-latensi]\n"
    "Semua aktuator lemah saat oli panas, pump control pressure drop. Apa penyebabnya dan urutan pengecekannya?\n\n"
    "[DATA MANUAL TERSEDIA]\nSection: DATA UJI LATENSI (karangan, bukan data manual)\n" + steps + "\n\n---\n\n" + steps)

def one(m):
    body = {"systemInstruction": {"parts": [{"text": sys_text}]},
            "contents": [{"role": "user", "parts": [{"text": question}]}],
            "generationConfig": {"maxOutputTokens": 4096, "temperature": 0.3, "thinkingConfig": {"thinkingLevel": "low"}}}
    t0 = time.time()
    first, usage, chars, finish = None, {}, 0, None
    try:
        r = call(f"{BASE}/{m}:streamGenerateContent?alt=sse", body)
        hdr = time.time() - t0
        for raw in r:
            line = raw.decode("utf-8", "ignore").strip()
            if not line.startswith("data:"):
                continue
            try:
                j = json.loads(line[5:].strip())
            except Exception:
                continue
            c = (j.get("candidates") or [{}])[0]
            for p in (c.get("content") or {}).get("parts", []):
                if p.get("text") and not p.get("thought"):
                    if first is None:
                        first = time.time() - t0
                    chars += len(p["text"])
            finish = c.get("finishReason") or finish
            usage = j.get("usageMetadata") or usage
        return {"ok": first is not None, "hdr": hdr, "ttft": first, "total": time.time() - t0, "chars": chars,
                "finish": finish, "inp": usage.get("promptTokenCount", 0), "out": usage.get("candidatesTokenCount", 0),
                "think": usage.get("thoughtsTokenCount", 0)}
    except urllib.error.HTTPError as e:
        return {"ok": False, "err": f"HTTP {e.code} {err_text(e)[:90]}"}
    except Exception as e:
        return {"ok": False, "err": str(e)[:90]}

print(f"\n[3] Latensi streaming — 1 pemanasan + {runs} run per model, bergiliran ...")
res = {m: [] for m in avail}
for r in range(runs + 1):
    for m in avail:
        x = one(m)
        tag = "pemanasan" if r == 0 else f"run {r}/{runs}"
        if x["ok"]:
            print(f"  {tag:10s} {m:28s} huruf-1={x['ttft']:5.1f}s total={x['total']:5.1f}s "
                  f"out={x['out']:>5} thinking={x['think']:>5} {x['finish'] or ''}")
        else:
            print(f"  {tag:10s} {m:28s} GAGAL {x.get('err', 'tanpa teks')}")
        if r > 0:
            res[m].append(x)
        time.sleep(2)

def med(v):
    return statistics.median(v) if v else float("nan")

print("\n[4] Ringkasan (detik; huruf-1 = kirim ke Vertex s/d huruf jawaban pertama)")
print(f"  {'model':28s} {'sukses':>7} {'huruf-1 med':>12} {'huruf-1 max':>12} {'total med':>10} {'total max':>10} "
      f"{'out tok':>8} {'thinking':>9} {'in tok':>7}")
for m, xs in res.items():
    ok = [x for x in xs if x["ok"]]
    if not ok:
        print(f"  {m:28s} {0:>3}/{len(xs):<3}  (semua gagal)")
        continue
    print(f"  {m:28s} {len(ok):>3}/{len(xs):<3} {med([x['ttft'] for x in ok]):12.1f} {max(x['ttft'] for x in ok):12.1f} "
          f"{med([x['total'] for x in ok]):10.1f} {max(x['total'] for x in ok):10.1f} "
          f"{med([x['out'] for x in ok]):8.0f} {med([x['think'] for x in ok]):9.0f} {med([x['inp'] for x in ok]):7.0f}")
print("\n  Catatan: di produksi, waktu ke huruf pertama bertambah ~2-4 dtk (analisa intent + pencarian manual)."
      "\n  Bandingkan antar model pada tabel yang sama, bukan dengan angka produksi.")
PY

echo "Project: $PROJECT | pembanding: $BASELINE | run: $RUNS"
TOKEN="$TOKEN" python3 "$TMP/uji.py" "$PROJECT" "$RUNS" "$BASELINE" "${MODELS:-}" "$SYS"
