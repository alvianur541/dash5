-- Security hardening after the Supabase exposure reports (Oct 2026). Read-only audit found:
-- every public table has RLS and no anon policy, but
--   * usage_logs: any signed-in account could read every row (names, NIKs, sessions) and insert arbitrary rows;
--   * v_usage_* views run as owner (no security_invoker), so they would bypass RLS if ever granted;
--   * anon/authenticated still hold TRUNCATE/TRIGGER/REFERENCES (not usable through PostgREST, removed anyway);
--   * two document-search RPCs were executable by anon (invoker functions, RLS already returns nothing).
-- Open sign-up and passkeys are dashboard settings, not SQL — see the deploy notes.
begin;

-- usage_logs is written only by the Cloud Run proxy with the technician's own token and never read by clients.
drop policy if exists usage_logs_select_own on public.usage_logs;
drop policy if exists usage_logs_insert_own on public.usage_logs;
create policy usage_logs_insert_own on public.usage_logs
  for insert to authenticated
  with check (user_nik = split_part(auth.email(), '@', 1));

alter view public.v_usage_daily set (security_invoker = on);
alter view public.v_usage_by_model set (security_invoker = on);
alter view public.v_usage_by_user set (security_invoker = on);

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('match_documents_exact', 'match_documents_keyword_ranked')
  loop
    execute format('revoke execute on function %s from anon, public', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

commit;
