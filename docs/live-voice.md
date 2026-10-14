# Gemini 3.8 Live voice (approved production trial)

Voice only. Regular Gemini 3.8 Flash / 3.7 fallback and Nano Banana are unchanged.

## Route

Production browser → direct WSS Cloud Run `/v1/live` → regional Vertex BidiGenerateContent, ADC bearer header. The separate Cloudflare API Worker is not available in this repository and its credentials are not available to this session, so production Live deliberately bypasses it. Existing HTTP API routing is unchanged. Supabase JWT is sent in the first frame, never in the URL. Origin allowlist is mandatory. No unauthenticated billable endpoint. Local development keeps the Vite `/api/v1/live` WS proxy.

`ask_technical(question)` calls the existing authenticated `/v1/ask` internally with the caller JWT and the session's immutable selected unit. It uses that route's request-scoped dependencies, RLS, source/answer safeguards, rate limit and text-model fallback. No native RAG Engine or structured-output assumption. The Live model is instructed to use the tool before any technical claim; this is a model instruction, not a deterministic speech-grounding guarantee. The tool sees no prior chat history in this initial narrow route.

## Configuration and rollback

Backend: `LIVE_VOICE_ENABLED=true`, `LIVE_LOCATION=us-central1`, existing `GOOGLE_CLOUD_PROJECT`, Supabase settings, and explicit `ALLOWED_ORIGIN` for the frontend. Backend defaults off. Production Vite builds default to `VITE_LIVE_VOICE_ENABLED=true` and `VITE_LIVE_BACKEND_URL=https://dash5-vertexai-proxy-esv2f6y7ya-as.a.run.app`; explicit build env can override either. Development defaults off; set the voice flag and `DEV_API_TARGET=http://127.0.0.1:8080` to test the local WS proxy. Rollback: update only `LIVE_VOICE_ENABLED=false` (never replace the other env vars), and rebuild frontend with `VITE_LIVE_VOICE_ENABLED=false` if hiding controls is desired. Use an existing account login, then **Percakapan suara → Mulai suara → approve microphone → Hentikan**. Start resumes AudioContext under the user gesture. Backgrounding, switching unit/account, disconnect and stop release the microphone and playback. No reconnect or automatic paid retry.

Per instance: one session/user, 20 authenticated users; 5s first-frame authentication, 10s provider setup, 30s input inactivity, 5min hard session. Client frames ≤8KB; input audio 20–100ms mono PCM16 little endian at 16kHz, output mono PCM24kHz; 60 input frames/sec, 9.6MB total audio. Tool cap 2 consecutive/8 total. Instance limits are not a fleet-wide billing quota.

## Verified evidence

Official guide (updated 2026-10-09): https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/guides/gemini-3-8-live
Official SDK endpoint implementation: https://github.com/googleapis/python-genai/blob/main/google/genai/live.py

One bounded real ADC session via `server/live-voice.js` provider adapter on the existing project, us-central1: setupComplete, text input `Jawab hanya: halo.`, output transcript `Halo.`, 40,800 bytes real 24kHz PCM, kept as `cloudrun/test/live-evidence/response.pcm` (used by `live-http.spec.cjs`). A final local terminate yields close 1006; this is not a failed setup. The one-off smoke script was removed on 14 Oct; production sessions are now logged in `live_sessions`.

Offline real loopback WebSocket fixtures verify the existing auth middleware against a locally signed/verified JWT provider fixture, actual internal HTTP `/v1/ask` bridge, caller-token propagation to request-scoped database dependencies, immutable unit, PCM forwarding, matching tool IDs, interruption forwarding and stop cleanup. This uses offline retrieval/generation fixtures, not production user authentication. Streaming resampling preserves sample clock and callback boundaries at 44.1/48kHz; stereo/clipping and safe direct-WSS URL regressions are included. `npm test` at root and `cloudrun/` remain offline.

## Trial limitations

The original real session tested text-to-audio, not physical microphone audio input or production browser-to-provider authenticated end-to-end. No production user JWT is available for that check. iPhone/PWA microphone and barge-in still require device validation; offline interruption forwarding does not validate native playback behavior. Technical grounding remains an instruction rather than a deterministic guarantee. No DB migration or IAM changes are needed. Deployment is explicitly approved by the owner as a production trial; verify actual deployed direct-WSS Upgrade/101, invalid JWT rejection, untrusted-origin rejection and enabled public frontend assets after shipping.
