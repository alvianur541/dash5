# Task 1 — security proposal (11 October 2026)

**Draft for review, not production authorization.** Base: `b17c15e`.
No production schema/configuration changes, deploys, key rotations, credential deletions,
history rewrites, or tasks 2–8 were performed.

## 1a. Value-free secret audit

The repository is public. Fetched all remote heads and tags, then inspected every blob
reachable from all local refs, including the archive tag. Baseline coverage:
**547 commits, 1,673 unique history blobs, 227 tracked files**. `secrets/` contains only
tracked `.gitkeep`; no tracked credentials were found. Both tracked env examples were
included. No privileged credential patterns were detected in these surfaces.

The scanner emits **paths, classes and counts only**, not even masked values. A planted
synthetic Google key in a scratch git repository was detected in both tracked and
history scans; assertions checked that no key value appeared in the report. Unit tests
also distinguish public anon JWTs from privileged service-role JWTs, detect private-key
headers/unprefixed assignments and reject placeholders/minified property expressions.

Live HTML-linked JavaScript on `app.dash5.id` was additionally inspected: one public
Supabase anon JWT, no privileged keys. An initial generic assignment hit in the Supabase
library was a JavaScript property expression, not a credential; a regression test covers
it. Initial plain HTTP retrieval returned 403; ordinary browser User-Agent succeeded.
This additional check covers HTML-linked bundles, **not every lazy-loaded asset**.

Existing `.env*` and recursive `secrets/*` exclusions were retained, including the safe
`.gitkeep`/`.env.example` exceptions. Added credential-export directory, PEM/key/PKCS,
service-account JSON and credential JSON exclusions. Seven representative paths,
including nested secrets and backend env files, passed `git check-ignore`.

### Rotation list (no values)

| Credential class | Reviewed location | Rotation required by findings |
| --- | --- | --- |
| Google/service-account private keys | `secrets/`, tracked files, all reachable history | None detected |
| Supabase service-role/secret/management tokens | tracked files, all reachable history, inspected live bundles | None detected |
| Other provider API keys, GitHub/AWS/Slack/Stripe tokens | tracked files, all reachable history, inspected live bundles | None detected |
| Public Supabase anon JWT | live frontend bundle | Not a privileged secret; no rotation indicated |

This is a heuristic scan, not proof that arbitrary unrecognized credentials never
existed. It excludes unreachable/pruned git objects, unfetched GitHub PR refs, runtime
credential stores outside this repo, and full lazy-asset coverage. If a privileged key
is discovered later: revoke/rotate at its provider first, replace runtime configuration
without displaying it, and plan any historical purge separately with owner approval.
Do not force-push, delete credentials, or upload a raw scanner report. Ignoring an
already-tracked file does not untrack it; none required untracking in this audit.

## 1b. Confirmed live state (read-only)

Authorized `~/notes/dash5/sbq.py` SELECTs and the Management API auth GET confirmed:

- `disable_signup=true`: **signup is closed**, not open. Email provider remains enabled;
  all inspected external OAuth/phone/anonymous providers are disabled.
- Email autoconfirm false, minimum password length 6, CAPTCHA disabled. No settings changed.
- `documents`: RLS enabled, 4,765 rows. Its sole SELECT policy is permissive for
  `authenticated`: `auth.email() IS NOT NULL`.
- `user_niks`: actual columns **`nik text PRIMARY KEY`, `auth_email text`**, no UUID/FK
  identity relationship. RLS enabled with no policies, so ordinary clients cannot read it.
- 15 auth users and 15 allowlist rows. All 15 users have a matching allowlist email and
  confirmed email; zero unmatched, empty or duplicate normalized allowlist emails.
- `parts_catalog_view` and `documents_summary` already have `security_invoker=on`.
  Search `match_documents*` functions are invokers. `document_catalog()` is an
  authenticated-executable **SECURITY DEFINER** read bypass. Other discovered definers
  referencing documents are not executable by authenticated/anon roles.

Older notes describe earlier counts/configuration; these fresh results take precedence.
The count changed from the October 9 audit's 4,712 to 4,765; the October 10 notes record
53 Q3 promo chunks, consistent with that delta. This task did not ingest data.

## Proposed migration and access impact

`supabase/migrations/20261011_document_allowlist.sql` adds a **restrictive** SELECT gate,
ANDed with existing permissive policy decisions. The private SECURITY DEFINER helper:

1. Resolves the caller's `auth.uid()` against authoritative `auth.users.id`.
2. Requires a confirmed current email matching `lower(user_niks.auth_email)`.
3. Uses an empty search path and fully qualified relations; exposes only a boolean for
   the current caller. Does not grant client access to either identity table.

This avoids trusting NIK/email prefixes or a stale JWT email and does not guess a UUID
allowlist column. The catalog becomes SECURITY INVOKER, so it obeys the same documents
RLS gate. Existing invoker views need no changes. Service-role bypass remains unchanged.
New/outside/unconfirmed identities receive no documents/catalog rows. Currently
allowlisted staff and demo identities keep ordinary authenticated access; no demo quota
or separate demo denial is added. Removing/updating allowlist email revokes future reads.
Already-downloaded documents or cached client data cannot be recalled by RLS.

The current 15/15 snapshot predicts no existing identity loss, not an approval to execute.
Apply using a trusted migration role owning the helper and able to read `auth.users` and
bypass the closed allowlist RLS. Do **not** expose `dash5_security` as an API schema or
grant its CREATE privilege to untrusted roles. No destructive data SQL is included.

### Validation

- Exact required `npm run typecheck && npm run lint && npm run build`: PASS; the existing
  `typecheck` script was present and unchanged. Existing empty Supabase chunk warning remains.
- `cd cloudrun && npm test`: PASS, 62 suites / 683 assertions; expected negative-fixture
  error logs appeared, with no failing suites.
- Frontend `npm test`: 51/51 PASS.
- Scanner tests: 5/5 PASS plus actual scratch dummy tracked/history detection.
- Local PostgreSQL via **PGlite 0.5.8**, pinned and installed outside the repo: exact
  migration applied twice; policy/catalog/view denial and allowed staff/demo reads,
  anon/missing UUID/unconfirmed denial, stale email spoof resistance, service-role
  bypass, restrictive-policy precedence, allowlist revocation and email changes passed.
  RED reproduced the original outsider access; GREEN denied it after this migration.

**Full Supabase branch/schema integration remains UNVERIFIED.** Native Postgres CLI,
Docker and Supabase CLI were unavailable. PGlite uses a minimal local PostgreSQL fixture
with mocked auth claim functions, not the complete production schema/pgvector/PostgREST.
No production migration was run. This PR stays draft until isolated Supabase testing,
identity/role compatibility review and explicit owner approval.

### Rollback / waiting approval

Before an approved future application, capture exact policy/function definitions and
privileges on the isolated target. Reverting git alone does not undo a database migration.
A database rollback would remove the new restrictive gate and restore the previous
catalog definer mode/ACL; that deliberately reopens broad authenticated access. Prepare
and show that SQL for separate approval; no DROP or automatic rollback is executed here.
Never batch-run the parked `20261009_document_access_review.sql` alongside this proposal:
its different UUID allowlist would intersect this gate and can deny legitimate readers.

Next owner decisions: approve email-based allowlist semantics, test this single migration
on a disposable Supabase branch with staff/demo and denied accounts, then explicitly
approve a separately scheduled production application. No signup toggle or key rotation
is currently required by the confirmed findings.

## Reproduce locally

From the repo: `python3 scripts/security_audit.py .` and
`python3 -m unittest discover -s scripts -p test_security_audit.py`.
Fetch all remote heads/tags before auditing history. Keep reports local; share only triaged
metadata. For the SQL fixture, install pinned `@electric-sql/pglite@0.5.8` outside the repo
and set `PGLITE_MODULE` to its absolute `dist/index.js` path when running
`node --test supabase/tests/document_allowlist.test.mjs`. The test cannot connect to a
remote database and contains only synthetic identities/documents.
