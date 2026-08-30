# Dash⁵ — Evaluation Methodology

Two layers, both runnable by anyone with the repo. Numbers are only claimed when produced by one of these.

## 1. Deterministic unit tests (no network)

```bash
cd cloudrun && npm test
```

Bundles the orchestrator with esbuild and runs `cloudrun/test/*.test.cjs` against mocked deps:

| Suite | What it proves |
|---|---|
| `stream.test.cjs` | Stream retry guards: model halt (`finishReason ≠ STOP`), upstream drop without usage stamp, short-stub retry, 3-attempt cap, request deadline stops retries |
| `router.test.cjs` | Fault-code detection across model families (ZX200 1-digit suffix, Yanmar hex codes, embedded codes, ZW140 6-digit) and rejection of look-alikes; part-number extraction for Hitachi/Isuzu/Yanmar/KCM/ZW140 formats |
| `interval.test.cjs` | Service-interval router regex (Indonesian phrasing without "jam") and the CPM table parser (colliding columns, spaced PNs, per-interval qty) |
| `image.test.cjs` | Server-side image validation: MIME allowlist, magic-byte check, decoded-size cap |

## 2. Retrieval evaluation (SQL, no embedding call)

`supabase/tests/model_isolation.sql` — for every unit model, runs the production hybrid RPC with that
model's filter and counts chunks belonging to another model. Expected `bocor = 0` on every row.
Run it in the Supabase SQL editor or via the Management API.

`supabase/tests/retrieval_harness.sql` — 18 keyword-path cases with expected chunk ids
(historical harness, 15 pass / 3 near / 0 fail at last run).

## 3. Live end-to-end evaluation (needs a running backend)

Dataset: `supabase/tests/rag_eval_dataset.json` — ~100 real technician questions taken from
`chat_sessions` (Jul–Aug 2026), grouped by intent: fault_code, technical, engine, parts,
service_interval, unsupported/casual/security. Each case declares the Kategori that must reach the
model, optional literal (PN / fault code) that must appear, the expected orchestrator route, and
whether the assistant must abstain.

Runner:

```bash
cd cloudrun
DASH5_API=https://dash5.my.id/api DASH5_JWT=<technician access token> node test/eval/run-eval.cjs
# subsets: --only FC   --limit 20
```

`debug: true` in the request makes `/v1/ask` include, in the final `meta` frame, the provenance of
every chunk that reached the model (`kind, model, kategori, section, score`) plus route and
confidence. The runner reports:

- **Recall@ctx (kategori)** — expected Kategori present among chunks sent to the model
- **literal hit** — PN / fault code literally present
- **route accuracy** — deterministic router chose the expected path
- **abstain-when-required** — unsupported questions were refused, not invented
- **cross-model leak** — any chunk from a different unit model (must be 0)
- confidence distribution, ttft / total latency medians per intent

Results are written to `docs/evaluation/run-YYYY-MM-DD.json`. The JWT is a personal login token —
set it in the shell, never in a file.

## Rules

- Never edit an expectation to make a run pass; add a note and open the data/code question instead.
- Confidence thresholds (0.45 / 0.25) are provisional until a run with ≥100 labelled cases shows the
  score distribution of correct vs. incorrect retrievals.
