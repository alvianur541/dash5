#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PROJECT="${PROJECT:-project-85bfc388-3106-4361-a9f}"
export TOKEN="$(gcloud auth print-access-token)"
[ -f "${INDEX:-$HOME/simtom-index.json}" ] || { echo "File ~/simtom-index.json belum ada — upload dulu lewat menu Cloud Shell (⋮ → Upload)."; exit 1; }
node deploy/uji-simtom.mjs
