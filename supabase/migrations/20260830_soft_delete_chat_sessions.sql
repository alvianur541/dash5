-- Soft delete untuk chat_sessions: "hapus" di app hanya mengisi deleted_at,
-- baris tetap tersimpan untuk analisa. Jalankan SEBELUM push frontend.

alter table public.chat_sessions
  add column if not exists deleted_at timestamptz;

create index if not exists chat_sessions_active_idx
  on public.chat_sessions (user_id, updated_at desc)
  where deleted_at is null;

-- Tutup pintu hapus permanen dari klien (anon key + JWT tidak bisa DELETE lagi).
drop policy if exists allow_delete on public.chat_sessions;

-- Cegah pemindahan kepemilikan baris saat UPDATE (WITH CHECK menutup celah).
alter policy allow_update on public.chat_sessions
  with check ((auth.uid())::text = (user_id)::text);

-- Verifikasi:
--   select count(*) filter (where deleted_at is null) as aktif,
--          count(*) filter (where deleted_at is not null) as dihapus
--   from public.chat_sessions;
--   select policyname, cmd from pg_policies where tablename = 'chat_sessions';  -- tanpa DELETE
