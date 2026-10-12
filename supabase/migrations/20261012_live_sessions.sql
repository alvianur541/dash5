-- Live voice sessions (Gemini Live): one row per closed, ready session. Insert-only for the owner; read via service_role.
create table if not exists public.live_sessions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  session_id uuid not null unique,
  user_nik text not null,
  model text,
  unit text,
  duration_ms integer check (duration_ms >= 0),
  ready boolean,
  tools integer check (tools >= 0),
  reason text,
  billed_turns integer,
  prompt_tokens integer,
  response_tokens integer,
  thoughts_tokens integer,
  input_tokens jsonb,
  output_tokens jsonb,
  cost_idr numeric(14,4),
  cost_complete boolean
);
create index if not exists live_sessions_created_at_idx on public.live_sessions (created_at);
create index if not exists live_sessions_user_nik_idx on public.live_sessions (user_nik);

alter table public.live_sessions enable row level security;
revoke all on public.live_sessions from anon, authenticated;
grant insert on public.live_sessions to authenticated;
grant all on public.live_sessions to service_role;

create policy live_sessions_insert_own on public.live_sessions for insert to authenticated
  with check (user_nik = split_part(auth.email(), '@', 1));
create policy service_role_all_live_sessions on public.live_sessions for all to service_role
  using (true) with check (true);
