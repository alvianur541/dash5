# Chat illustrations (Nano Banana Lite)

Explicit action: **Buat ilustrasi** below a completed assistant answer. It generates one conceptual image, shows a disclaimer outside the image, and offers **Simpan / kirim ilustrasi**. No JSON editing, automatic generation, public uploads or third-party image SDK.

## Configuration / rollout

- Backend `IMAGE_GENERATION_ENABLED` defaults to disabled; set it to the exact string `true` only when rollout is approved. Preserve existing Cloud Run environment with `--update-env-vars`, never `--set-env-vars`.
- Frontend action is visible by default for authenticated saved conversations. Build with `VITE_IMAGE_GENERATION_ENABLED=false` to hide it; backend flag remains the billing/security kill switch.
- Uses existing `GOOGLE_CLOUD_PROJECT` and Application Default Credentials / Cloud Run service account. Fixed image model: `gemini-3.1-flash-lite-image`, Vertex global, `generateContent`, `TEXT` + `IMAGE`. Text wrapper/hedging is deliberately not reused: a generation request is never retried or duplicated by the image service.
- No schema migration, storage bucket, new permission, or change to normal `/v1/ask`.

## Security and limits

`POST /v1/images` accepts only `{sessionId, messageId}`. Existing Supabase JWT verifier and request limiter run first. Backend reads the non-deleted session using the caller JWT / RLS **and** explicit owner filter; checks ownership again; selects the saved assistant answer. Frontend answer/source claims are not accepted.

Saved messages are user-editable chat context, **not verified manual evidence**. Backend prompt treats them as untrusted data, forbids invented facts/labels/directions/pins/voltages/connections, and never claims an official or validated schematic. Pin/wiring/voltage requests are refused with guidance to the original manual. This intentionally conservative restriction also blocks some conceptual electrical topics. General explanatory illustrations remain available.

- One image/request, one active image request/user and four active requests/process.
- Two attempts/user per ten minutes **per server instance**; failures also consume an attempt. In-memory limits reset on restart and are not a distributed billing quota. Set a Vertex project quota for a hard project-wide budget.
- Answer max 8,000 characters; preceding question max 2,000. Oversized context is refused, not silently truncated.
- Server overall deadline 65s, model deadline 60s, client 75s. Cancellation propagates; cancellation may not prevent provider billing.
- Upstream JSON capped at 10 MiB; image capped at 6 MiB decoded. Only PNG/JPEG with matching magic bytes; incomplete/blocked, text-only, extra-image, invalid-base64 and unsafe-MIME responses fail closed.
- Logs record route, request ID, model, actual provider token counts when supplied, image count/bytes and duration. `cost: null`: no guessed image price or inclusion in text-model cost tables. No image, prompt, token or credential content is logged.

## Persistence and accuracy

Images live only in the current chat view as revocable Blob URLs. They are not placed in chat JSON, bookmarks, localStorage or a database. Save/download before navigating away or refreshing. Offline/failed-to-sync answers may require retrying after the answer is persisted; missing answers return 409, foreign/deleted sessions 404. Generation failure does not affect normal chat.

Generated labels/topology can still be wrong. Prompt self-check and format/structure validation do not prove technical correctness. Compare with the original manual; this is not an authoritative schematic renderer. Existing Vertex global processing is used; no public image hosting is added.

## Verification

Offline backend HTTP/auth/ownership/concurrency/flag/rate-limit tests plus image response validation; frontend authenticated request/error/rendering tests. Standard gates: root typecheck, lint, build, frontend tests; backend `npm test`.

One real bounded, nonconfidential service call on 11 October 2026 produced JPEG, 65,801 bytes, 5,719 ms; reported usage: 261 input, 1,120 candidate output, 1,381 total tokens. No price inferred. Local actual ChatWindow fixture exercised explicit click → authenticated fixture endpoint → image → download, at 390/1280px dark/light without page overflow. This fixture is not proof of a production user login or source-correct engineering content.
