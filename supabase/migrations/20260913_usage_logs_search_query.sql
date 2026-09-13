-- Query yang benar-benar dikirim ke retrieval (hasil optimasi intent), supaya
-- jawaban melenceng bisa ditelusuri dari log — bukan dengan mencocokkan chunk
-- manual satu per satu. Pasangannya: session_id yang sejak sekarang dikirim
-- frontend, jadi satu percakapan bisa dirunut utuh.
-- Jalankan SEBELUM deploy Cloud Run + frontend.

alter table public.usage_logs
  add column if not exists search_query text;

comment on column public.usage_logs.search_query is
  'Query hasil optimasi yang dikirim ke retrieval. NULL untuk jalur tanpa pencarian (sapaan, off-topic).';

create index if not exists usage_logs_session_idx
  on public.usage_logs (session_id, created_at)
  where session_id is not null;

-- Verifikasi:
--   select created_at, session_id, search_query, tools_used
--   from public.usage_logs order by id desc limit 10;
