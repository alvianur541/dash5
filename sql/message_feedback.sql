-- Feedback 👍/👎 per jawaban AI (dipakai ChatWindow → saveFeedback, upsert onConflict message_id).
-- Sudah di-apply ke Supabase ipoxxshvtkragylisogv (migration: create_message_feedback).
-- Sebelum tabel ini ada, semua rating teknisi hilang diam-diam (silent catch di frontend).

create table if not exists public.message_feedback (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  message_id  text not null unique,
  rating      text not null check (rating in ('up','down')),
  question    text,
  answer      text,
  model       text,
  created_at  timestamptz not null default now()
);

alter table public.message_feedback enable row level security;

-- User login hanya bisa tulis/lihat feedback miliknya sendiri.
-- Analitik lintas-user via service_role (bypass RLS) — mis. panel admin nanti.
create policy "feedback insert own" on public.message_feedback
  for insert to authenticated with check (auth.uid() = user_id);
create policy "feedback update own" on public.message_feedback
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "feedback select own" on public.message_feedback
  for select to authenticated using (auth.uid() = user_id);

grant select, insert, update on public.message_feedback to authenticated;
revoke all on public.message_feedback from anon;
