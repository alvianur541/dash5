# Gemini 3.8 Live voice (draft, disabled)

Voice only. Regular Gemini 3.8 Flash / 3.7 fallback and Nano Banana are unchanged.

## Route

Browser `/api/v1/live` WebSocket → existing same-origin proxy (must preserve Upgrade/101) → Cloud Run `/v1/live` → regional Vertex BidiGenerateContent, ADC bearer header. Supabase JWT is sent in the first frame, never in the URL. Origin allowlist is mandatory. No public billable HTTP endpoint.

`ask_technical(question)` calls the existing authenticated `/v1/ask` internally with the caller JWT and the session's immutable selected unit. It uses that route's request-scoped dependencies, RLS, source/answer safeguards, rate limit and text-model fallback. No native RAG Engine or structured-output assumption. The Live model is instructed to use the tool before any technical claim; this is a model instruction, not a deterministic speech-grounding guarantee. The tool sees no prior chat history in this initial narrow route.

## Enable only in an approved test environment

Backend: `LIVE_VOICE_ENABLED=true`, `LIVE_LOCATION=us-central1`, existing `GOOGLE_CLOUD_PROJECT`, Supabase settings, and explicit `ALLOWED_ORIGIN` for the frontend. Frontend build: `VITE_LIVE_VOICE_ENABLED=true`. Both default off. Local Vite: set `DEV_API_TARGET=http://127.0.0.1:8080`; WS proxy is enabled. Use an existing test-account login, then **Percakapan suara → Mulai suara → approve microphone → Hentikan**. Start resumes AudioContext under the user gesture. Backgrounding, switching unit/account, disconnect and stop release the microphone and playback. No reconnect or automatic paid retry.

Per instance: one session/user, 20 authenticated users; 5s first-frame authentication, 10s provider setup, 30s input inactivity, 5min hard session. Client frames ≤8KB; input audio 20–100ms mono PCM16 little endian at 16kHz, output mono PCM24kHz; 60 input frames/sec, 9.6MB total audio. Tool cap 2 consecutive/8 total. Instance limits are not a fleet-wide billing quota.

## Verified evidence

Official guide (updated 2026-10-09): https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-8-live
Official SDK endpoint implementation: https://github.com/googleapis/python-genai/blob/main/google/genai/live.py

One bounded real ADC session via `server/live-voice.js` provider adapter on the existing project, us-central1: setupComplete, text input `Jawab hanya: halo.`, output transcript `Halo.`, 40,800 bytes real 24kHz PCM. Evidence: `cloudrun/test/live-evidence/smoke.json`, `response.pcm`. A final local terminate yields close 1006; this is not a failed setup. No repeated paid sessions. Reproduce manually only: `cd cloudrun && GOOGLE_CLOUD_PROJECT=<your-project> node test/live-smoke.cjs` (billable, not in CI).

Offline real loopback WebSocket fixture verifies JWT/immutable unit boundary, PCM forwarding, matching tool-call IDs and stop cleanup. Frontend PCM stereo downmix/clipping test included. `npm test` at root and `cloudrun/` remain offline.

## Still unverified / do not call production-ready

The real session tested text-to-audio, not microphone audio input, browser-to-provider authenticated end-to-end, or real technical-tool retrieval. iPhone/PWA microphone and barge-in require device validation. The separately managed Cloudflare API Worker source is not in this repository; its Upgrade/101 forwarding must be inspected/verified before enabling the deployed route. Current per-callback resampling floors each input buffer's output sample count, so long-session sample-clock continuity needs refinement. No production deployment, DB migration or IAM changes were made. Keep draft/disabled until these checks pass and deployment is explicitly approved.
