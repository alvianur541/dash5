# Dash⁵ — Hexindo Technical Assistant

Live: [dash5.my.id](https://dash5.my.id)

A chat assistant for Hitachi heavy-equipment technicians. It answers fault-code, specification,
procedure and part-number questions from the official manuals of the selected unit, and says so
when the manuals do not contain the answer instead of guessing.

Supported units: ZX48U-5A · ZX65USB-5A · ZX138MF-5G · ZX200-5G · ZW140 · KCM 60ZV.

## What it does

- **Fault codes** — typed or read from a photo of the monitor; looks up cause and checks in the
  Troubleshooting / Technical Manual, then the Engine Manual for related engine codes.
- **Parts** — part-number lookup across Parts and Engine Parts Catalogs, with active promo prices.
- **Periodic maintenance** — parts due at a service interval ("service 2000"), priced.
- **Specs and procedures** — torque, pressure, capacity, removal/installation steps.
- **Photos** — reads fault codes, part labels and part lists from an image.
- **Voice input**, bookmarks, passkey login, and export of any answer table as a PNG.

Answers are grounded in retrieved manual text: hybrid keyword + vector search, Cohere rerank,
and a confidence tier that decides whether the model may answer, must add a caveat, or must say
the data was not found.

## Architecture

| Layer | Stack |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, PWA — hosted on Cloudflare |
| Backend | Node 20 + Express on Google Cloud Run; one SSE endpoint, `/v1/ask`, runs the whole pipeline |
| Models | Gemini on Vertex AI (answers, intent, OCR, transcription) |
| Retrieval | Supabase Postgres + pgvector (`gemini-embedding-001`, 3072 dims), Cohere Rerank |
| Auth & storage | Supabase (auth, chat history, bookmarks) |

## Repository layout

```text
src/          React app — UI plus a thin client for /v1/ask
cloudrun/     backend
  server.js     HTTP entry
  server/       auth, upstream calls, transcription, metrics
  src/          retrieval and answer orchestration (bundled with esbuild)
  test/         backend test suite
supabase/     migrations, SQL and read-only database tests — see supabase/README.md
deploy/       self-hosting files (Docker, nginx) and operational scripts
```

## Development

```bash
npm ci
cp .env.example .env.local      # Supabase URL + anon key, DEV_API_TARGET = backend URL
npm run dev                     # http://localhost:3000
npm run typecheck && npm run lint && npm run build

cd cloudrun && npm ci && npm test
```

Backend configuration is documented in `cloudrun/.env.example`. Self-hosting:
`docker compose up` with `cloudrun/.env` filled in from that file.

## Deployment

Pushing to `main` builds the frontend on Cloudflare. The backend is deployed separately:
`gcloud run deploy <service> --source=cloudrun`.

## Scope

Dash⁵ is a search assistant for internal technical support. Repair decisions must still be
verified against the official manuals, service bulletins and company procedures.
