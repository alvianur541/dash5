alter table public.usage_logs enable row level security;

drop policy if exists usage_logs_insert_own on public.usage_logs;
create policy usage_logs_insert_own
  on public.usage_logs for insert to authenticated
  with check (true);

drop policy if exists usage_logs_select_own on public.usage_logs;
create policy usage_logs_select_own
  on public.usage_logs for select to authenticated
  using (true);

create index if not exists usage_logs_created_idx on public.usage_logs (created_at desc);
create index if not exists usage_logs_user_idx on public.usage_logs (user_name, created_at desc);
