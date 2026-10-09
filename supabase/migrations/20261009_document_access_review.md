# Document-access review — MANUAL DRAFT, NOT APPLIED

The user cancelled demo denial and demo-only quotas on October 9, 2026. **Do not apply `20261008_demo_quota.sql` or `20261008b_demo_isolation.sql`.** The older isolation Markdown is historical and its disable-demo rollout no longer describes approved behavior.

`20261009_document_access_review.sql` is a different, ordinary provisioning control. It guards only document SELECT and changes the catalog RPC to SECURITY INVOKER. It does not deny demo chat, transcribe, history, or add quota. Existing ownership policies stay in place. A shared demo identity still shares documents/history/password API permissions; a UI password guard cannot fix this.

## Owner-only rollout

1. Read current `pg_policies`, relevant `pg_proc` definitions/ACLs, and schema membership using SELECT-only `sbq.py`. The October 9 audit verified document SELECT is `auth.email() IS NOT NULL`, `document_catalog` is SECURITY DEFINER but authenticated-only, and retrieval functions are invoker functions. All five audited tables have RLS enabled. Recheck immediately before rollout; the earlier failed query capture was a missing scratch working directory, not an approval barrier.
2. Review every existing account UUID locally in the Supabase dashboard. Include legitimate Hexindo email-only accounts, accounts absent from `user_niks`, and the normal demo account. Do not copy emails/tokens/passwords into commits or the report.
3. Populate the migration's **temporary reviewed UUID table** with the reviewed UUIDs. Blank draft deliberately raises an exception before permanent changes. Another preflight refuses to omit any existing account: removal is a separate explicit approval, not an automatic NIK/domain heuristic.
4. Review SQL with the independent reviewer, then the owner manually applies it. The agent must not execute it. Restrictive document policy ANDs with current policies; no service-role bypass is introduced.
5. Read back policies, `document_catalog.prosecdef=false`, grants and approved-reader count. With real caller JWTs, test anon cannot read documents/catalog, every approved staff/demo identity still reads their permitted data via direct REST and all retrieval RPCs, and a future unapproved account does not. Verify own-history writes and cross-user denials separately.
6. New staff enrollment uses an owner-only insert after identity review. Revoke document access through explicit UUID removal. Revocation tests must use a fresh request; this patch makes the symptom document cache request/client-scoped.

No DB/schema/data write was performed. This draft was not executed against Postgres. It is not a claim that shared demo is confidential or that every RPC/view/storage surface is secure. If the same private table already exists from another rollout, review its current contents separately: the draft adds reviewed UUIDs and does not silently remove existing membership.
