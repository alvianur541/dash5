-- MANUAL DRAFT ONLY: review every existing account before populating the temporary UUID list.
begin;
create temporary table reviewed_document_readers (user_id uuid primary key) on commit drop;
-- Insert reviewed UUIDs here, including legitimate email-only staff and the normal demo account.

do $$
begin
  if not exists (select 1 from reviewed_document_readers) then
    raise exception 'Populate the reviewed UUID list first; no access change was applied';
  end if;
  if exists (select 1 from auth.users u where not exists (
    select 1 from reviewed_document_readers r where r.user_id = u.id
  )) then
    raise exception 'Existing account omitted: review compatibility before applying';
  end if;
  if exists (select 1 from reviewed_document_readers r where not exists (
    select 1 from auth.users u where u.id = r.user_id
  )) then
    raise exception 'Reviewed UUID does not exist';
  end if;
end;
$$;

create schema if not exists dash5_private;
revoke all on schema dash5_private from public, anon, authenticated;
grant usage on schema dash5_private to authenticated;
create table if not exists dash5_private.document_readers (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table dash5_private.document_readers enable row level security;
revoke all on dash5_private.document_readers from public, anon, authenticated;
insert into dash5_private.document_readers(user_id)
select user_id from reviewed_document_readers on conflict do nothing;

create or replace function dash5_private.is_document_reader()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from dash5_private.document_readers r
                 where r.user_id = (select auth.uid()));
$$;
revoke all on function dash5_private.is_document_reader() from public, anon;
grant execute on function dash5_private.is_document_reader() to authenticated;

alter table public.documents enable row level security;
drop policy if exists document_access_review on public.documents;
create policy document_access_review on public.documents as restrictive
for select to authenticated using ((select dash5_private.is_document_reader()));
alter function public.document_catalog() security invoker;
revoke execute on function public.document_catalog() from public, anon;
grant execute on function public.document_catalog() to authenticated;
commit;
