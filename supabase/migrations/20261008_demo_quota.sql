-- Daily question counter for the public demo account (H000 on app.dash5.id).
-- The Cloud Run proxy calls demo_hitung() with the user's own token before each question;
-- until this runs, the proxy falls back to its in-memory counter.
begin;

create table if not exists public.demo_quota (
  email text not null,
  hari date not null,
  n integer not null default 0,
  primary key (email, hari)
);
alter table public.demo_quota enable row level security;
revoke all on public.demo_quota from anon, authenticated;

create or replace function public.demo_hitung()
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.demo_quota as q (email, hari, n)
  values (lower(auth.email()), (now() at time zone 'Asia/Jakarta')::date, 1)
  on conflict (email, hari) do update set n = q.n + 1
  returning n;
$$;

revoke execute on function public.demo_hitung() from public, anon;
grant execute on function public.demo_hitung() to authenticated;

commit;
