# Demo isolation — manual rollout, not applied

## Current exposure

The backend uses the user's JWT with the anon API key for both direct `documents` queries and retrieval RPCs. A public demo JWT therefore has exactly the same retrieval permissions in a browser as in Cloud Run. Backend quota cannot protect direct PostgREST access.

SELECT-only inspection on 2026-10-08 confirmed:
- `documents` SELECT permits any authenticated user with an email.
- All seven document retrieval RPCs are SECURITY INVOKER.
- `document_catalog()` is SECURITY DEFINER and executable by authenticated users.
- `demo_hitung()` is absent; the old quota migration is not applied.
- Every current non-H000 auth user has a matching `user_niks.auth_email` entry.

## Rollout

1. Keep demo disabled. The backend patch rejects H000 by immutable UUID as well as email, configured extra demo emails, and trusted `app_metadata.demo`. Ask validates input before its demo gate; transcription rejects demo before parsing large audio or invoking Vertex. There is no memory quota fallback and no environment flag to reopen demo.
2. In Supabase Dashboard, suspend the public demo account and revoke its sessions until the SQL is applied. A backend deployment alone does NOT close direct database access. Cached JWTs remain a concern until RLS is applied; suspension alone is not a substitute for RLS.
3. Review `user_niks` and the seed SELECT in `20261008b_demo_isolation.sql`. Exclude any other public/demo accounts before applying; their UUIDs must not enter `dash5_private.document_readers`.
4. Manually apply `20261008b_demo_isolation.sql` as the database owner. Do not apply the obsolete `20261008_demo_quota.sql` separately. The new migration works whether that old quota draft was applied or not.
5. Read back `pg_policies`, `pg_proc.prosecdef` for `document_catalog`, and the private allowlist. Test with actual staff, H000, and anon JWTs (never a service-role key):
   - staff `/rest/v1/documents?select=id&limit=1` and each retrieval RPC must still work;
   - H000/anon direct document reads, retrieval RPCs, and `document_catalog` must return no protected data (empty or permission denied);
   - H000 cannot read/write shared history, bookmarks, feedback, or usage logs;
   - staff own-session/history writes still work;
   - H000 `/v1/ask` and `/v1/transcribe` return 503 and do not call Vertex.
6. Deploy backend separately only after tests/review; none was deployed by this task.

The restrictive policy ANDs with existing ownership/email policies rather than replacing them. Staff retrieval continues under its existing JWT; no service-role bypass is introduced. The UUID allowlist cannot be self-enrolled through email/user metadata changes or open signup. New staff must be explicitly enrolled by the database owner after identity review. Review/remove their UUID when access is revoked.

## Re-enabling demo is a separate project

Do not remove the backend gate merely because this migration is applied. Demo retrieval intentionally stops working under its JWT. Before reopening, implement a separate least-privilege server-only retrieval role/RPC over a curated, non-confidential demo corpus, with server-only credentials, bounded query/output, and atomic durable quota reservation that fails closed on errors. Never pass a broad service-role client into the general user retrieval pipeline. Deny direct public access to raw staff documents and audit every SECURITY DEFINER function/view. Keep transcription disabled or independently reserve a durable budget before calling Vertex. Multi-instance/concurrency and direct PostgREST tests are acceptance requirements.

The SQL was prepared but NOT executed. Live RLS remains exposed until the owner applies and verifies it.
