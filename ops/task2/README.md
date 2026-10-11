# Task 2 — identity and adoption (staged, not deployed)

Based on origin/main b17c15e; independent of Task 1 / PR 2. No production schema/config/deploy/service changes were made.

## Read-only findings (11 October 2026)
- 3,525 usage rows / 28 historic email-prefix identities; all auth rows = 15, confirmed = 15, allowlist = 15, all current auth accounts allowlisted. The historic 28 is not the count of current auth accounts.
- Unique prefix matches: 1,820 rows / 11 identities. Ambiguous: 0 rows. Unmatched: 1,705 rows / 17 identities. No unmatched activity in the last 7 days; no unmatched LOADTEST rows and no null prefixes.
- Exact `user_nik = user_niks.nik` matches: 0. Backend explicitly writes the email prefix, not employee NIK. Four historical prefixes use h+digits; none are plain numeric. Current allowlist column is `auth_email`, not `email`.
- No evidence establishes why 17 historical identities no longer match current auth. Deleted accounts or prior naming are hypotheses, not findings. No current auth rows have `deleted_at` set.
- Cloud Run INTERNAL_USERS is not configured. No owner identity was inferred. No identifiers, names, emails or NIK values are included in this report.

## Semantics / rollout requiring approval
1. Review migration `supabase/migrations/202610110002_usage_identity.sql`. It adds nullable UUID FK with ON DELETE SET NULL; matches **only unique exact email prefixes across all auth rows**; ambiguous/unmatched remain NULL. No DROP/DELETE/TRUNCATE or RLS changes. Local PGlite only was used for schema writes.
2. Owner must approve INTERNAL_USERS: comma-separated full auth UUIDs (recommended) or full emails, case-insensitive; no prefixes, wildcards or display names. Invalid configuration matches nobody. Empty backend env means no internal accounts. Never publish configured identifiers.
3. For historical classification, an approved operator must provide the same nonempty configuration through a bound `set_config('app.internal_users', value, false)` on the migration connection before running/re-running this migration. It classifies only linked rows whose `is_internal` is NULL; preserve known classifications. Do not put the private value into a committed file or logs. An explicit nonempty list is required; no list was invented here.
4. Without approved config, legacy `is_internal` stays NULL (unknown), while the column default is false for new inserts. This is intentional: false must not falsely certify historic owner testing as external. Use a controlled rollout window so the old writer does not create unclassified-as-false rows between migration and backend rollout; review that window before dashboard activation.
5. After migration/config/backend approval, deploy the backend through the usual approved process. `/v1/ask` logging takes identity only from auth middleware's verified Supabase user, never request body or pipeline metadata. Independent PostgREST schema fallback preserves existing logs/latency fields on legacy schemas.
6. **Only after approval**, back up the live dashboard directory outside its served root and apply the staged `ops/mission-control/{adoption.py,render.py,render_base.py,refresh.py}` together. Do not overwrite server/auth files or change services here. These are versioned snapshots of the existing generator plus an adoption-only source/renderer; reconcile intervening live edits before applying. This PR did not touch the served generator.

Adoption defaults to classified external rows (`is_internal IS FALSE`). The checkbox explicitly includes internal **and unclassified** rows. Both retain the existing LOADTEST exclusion. Active users use auth UUIDs, with labeled legacy-prefix fallback; query totals/daily dialogs, top technicians, recent activity and equipment activity use the same scope. Unknown 7-day rows are disclosed. Missing columns use a truthful legacy label and disabled checkbox; missing source shows unknown rather than claiming filtering. Operational cost/reliability and their denominators remain unchanged and include internal activity (excluding LOADTEST).

## Risks / rollback
- Historical prefix matching is not proof of an unchanged account over time. Unique current matches follow the requested method; unmatched/collisions are never guessed.
- This task does not change direct Supabase usage-log INSERT access/RLS. Client-supplied HTTP identities are denied by backend code, but direct PostgREST write integrity needs a separate approved access review (not a claim of database anti-spoof enforcement).
- Empty/invalid internal configuration can under-exclude future internal usage. Configure the approved list before activating adoption reporting; unknown legacy rows can depress default adoption counts.
- Rollback code to prior backend revision and restore backed-up dashboard sources. Leave additive columns/data in place; do not drop columns or undo backfilled identity without separate approval. No automatic merge/deploy/migration.

## Verification
Exact required order: root `npm run typecheck && npm run lint && npm run build`, then `cloudrun/npm test`. Root main already has the exact typecheck script; no substitute gate was used.
Additional local checks: Python adoption/renderer tests; PGlite migration idempotence, collision/unmatched/null, authorized classification/invalid config, FK delete action and default; actual dashboard SQL executed against isolated legacy/new schemas with synthetic internal/external/unknown/LOADTEST and same-name identities. Network schema-fallback tests use fixture responses, not production mutation.
Browser/visual toggle interaction has not been exercised; Python tests verify generated default/checkbox/variant IDs and schema behavior. This is an explicit remaining manual check before activation.

Reproduce PGlite checks with `PGLITE_MODULE` pointing at an installed `@electric-sql/pglite` module (or install it in an isolated scratch directory); run `node ops/task2/migration.test.mjs` and `node ops/task2/adoption-sql.test.mjs` from the repo root. Run `python3 -m unittest discover -s ops/mission-control -v`.
