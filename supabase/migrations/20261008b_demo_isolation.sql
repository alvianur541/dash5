-- MANUAL ONLY. See 20261008b_demo_isolation.md before applying.
begin;

create schema if not exists dash5_private;
revoke all on schema dash5_private from public, anon, authenticated;
grant usage on schema dash5_private to authenticated;
create table if not exists dash5_private.document_readers (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table dash5_private.document_readers enable row level security;
revoke all on dash5_private.document_readers from public, anon, authenticated;

-- Seed only provisioned staff; UUID membership survives an email change.
insert into dash5_private.document_readers(user_id)
select u.id from auth.users u
where u.id <> 'd2425fad-c49f-42dd-9249-9ad2738b7e0b'::uuid
  and lower(u.email) <> 'h000@dash5.internal'
  and coalesce(u.raw_app_meta_data->>'demo', 'false') <> 'true'
  and exists (select 1 from public.user_niks n where lower(n.auth_email) = lower(u.email))
on conflict do nothing;
delete from dash5_private.document_readers
where user_id = 'd2425fad-c49f-42dd-9249-9ad2738b7e0b'::uuid;

create or replace function dash5_private.is_document_reader()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from dash5_private.document_readers r
    where r.user_id = (select auth.uid())
  );
$$;
revoke all on function dash5_private.is_document_reader() from public, anon;
grant execute on function dash5_private.is_document_reader() to authenticated;

-- Restrictive policies AND with existing policies; no permissive bypass is added.
do $$
declare t text;
begin
  foreach t in array array['documents', 'chat_sessions', 'bookmarks', 'message_feedback', 'usage_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_access_guard on public.%I', t);
    execute format('create policy staff_access_guard on public.%I as restrictive for all to authenticated using ((select dash5_private.is_document_reader())) with check ((select dash5_private.is_document_reader()))', t);
  end loop;
end;
$$;

-- The aggregate RPC was SECURITY DEFINER and bypassed documents RLS.
alter function public.document_catalog() security invoker;
revoke execute on function public.document_catalog() from public, anon;

-- Retire the client-callable quota RPC if the older draft was applied.
do $$
begin
  if to_regprocedure('public.demo_hitung()') is not null then
    revoke execute on function public.demo_hitung() from public, anon, authenticated;
  end if;
end;
$$;
commit;
