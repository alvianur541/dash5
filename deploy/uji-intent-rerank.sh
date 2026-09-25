#!/usr/bin/env bash
# Usage: bash deploy/uji-intent-rerank.sh [all|intent|rerank]   (needs ~/rerank-cases.json for the rerank part)
set -euo pipefail
cd "$(dirname "$0")/.."

export PROJECT="${PROJECT:-project-85bfc388-3106-4361-a9f}"
export TOKEN="$(gcloud auth print-access-token)"
export ROUNDS="${ROUNDS:-2}"

if [ "${1:-all}" != "intent" ] && [ -z "${COHERE_API_KEY:-}" ]; then
  echo "Mengambil kunci Cohere dari setelan Cloud Run (tidak ditampilkan)..."
  COHERE_API_KEY="$(gcloud run services describe dash5-vertexai-proxy --region=asia-southeast1 --project="$PROJECT" --format=json \
    | python3 -c 'import sys,json; e=json.load(sys.stdin)["spec"]["template"]["spec"]["containers"][0].get("env",[]); print(next((x.get("value","") for x in e if x["name"]=="COHERE_API_KEY"),""))')"
  export COHERE_API_KEY
fi

echo "Lokasi Cloud Shell: $(curl -s --max-time 3 ipinfo.io/city || echo '?') — angka latensi diukur dari sini, bukan dari Cloud Run Singapura."
node deploy/uji-intent-rerank.mjs "${1:-all}"
