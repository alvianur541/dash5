-- Task 1 proposal only. Review and test on a Supabase branch before production approval.
-- Do not batch-run older parked migrations, especially 20261009_document_access_review.sql.
begin;

do $$
begin
  if not exists (select 1 from pg_class where oid = 'public.documents'::regclass and relrowsecurity)
     or not exists (select 1 from pg_policy where polrelid = 'public.documents'::regclass
                    and polcmd in ('r', '*') and polpermissive) then
    raise exception 'Expected documents RLS and an existing permissive SELECT policy';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.documents'::regclass
             and polname = 'document_allowlist_only' and (polpermissive or polcmd <> 'r')) then
    raise exception 'Unexpected document_allowlist_only policy definition';
  end if;
end;
$$;

create schema if not exists dash5_security;
revoke all on schema dash5_security from public, anon, authenticated;
grant usage on schema dash5_security to authenticated;

-- user_niks has no user UUID: resolve auth.uid() through authoritative auth.users.email.
create or replace function dash5_security.is_allowlisted_document_reader()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as u
    join public.user_niks as n on lower(n.auth_email) = lower(u.email)
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
  );
$$;
revoke all on function dash5_security.is_allowlisted_document_reader() from public, anon, authenticated;
grant execute on function dash5_security.is_allowlisted_document_reader() to authenticated;

do $$
begin
  if not exists (select 1 from pg_policy where polrelid = 'public.documents'::regclass
                 and polname = 'document_allowlist_only') then
    create policy document_allowlist_only on public.documents as restrictive
      for select to authenticated
      using ((select dash5_security.is_allowlisted_document_reader()));
  end if;
end;
$$;
alter policy document_allowlist_only on public.documents to authenticated
  using ((select dash5_security.is_allowlisted_document_reader()));

-- The catalog is the authenticated SECURITY DEFINER read bypass found during discovery.
alter function public.document_catalog() security invoker;
revoke execute on function public.document_catalog() from public, anon;
grant execute on function public.document_catalog() to authenticated, service_role;

commit;
