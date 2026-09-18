-- Paket B observability — simpan latensi & konteks tiap request di usage_logs.
--
-- MASALAH YANG DITUTUP: server SUDAH menghitung ttft & total tiap request, lalu MEMBUANGNYA
-- karena tabel ini tidak punya kolomnya. Akibatnya pertanyaan "latensi kemarin berapa?" hanya
-- bisa dijawab dari log Cloud Run (retensi 30 hari, butuh gcloud/Cloud Shell).
-- Sesudah migration ini: cukup satu query SQL, permanen.
--
-- Sekalian menutup dua celah lain:
--   * model AI selama ini terselip di tools_used[posisi yang BERGESER] (2 atau 3 elemen,
--     tergantung ada/tidaknya confidence) -> sekarang kolom model_ai sendiri.
--   * request_id (rid di log) tidak pernah disimpan -> baris ini tak bisa disambungkan
--     ke baris log Cloud Run-nya.
--
-- AMAN dijalankan berulang (IF NOT EXISTS). TIDAK menyentuh RLS maupun 4 policy yang sudah ada.
-- Kolom tools_used SENGAJA dipertahankan — 2.000+ baris lama memakainya.

alter table public.usage_logs
  add column if not exists ttft_ms        integer,
  add column if not exists total_ms       integer,
  add column if not exists route          text,
  add column if not exists model_ai       text,
  add column if not exists confidence     text,
  add column if not exists fallback_to    text,
  add column if not exists fallback_sebab text,
  add column if not exists degraded       boolean,
  add column if not exists request_id     text;

comment on column public.usage_logs.ttft_ms        is 'Milidetik sampai huruf pertama sampai ke teknisi.';
comment on column public.usage_logs.total_ms       is 'Milidetik total request /v1/ask.';
comment on column public.usage_logs.route          is 'rag_found | google_casual | image | null (canned/off-topic).';
comment on column public.usage_logs.model_ai       is 'Model Gemini yang BENAR-BENAR menjawab (bukan model unit).';
comment on column public.usage_logs.fallback_to    is 'Model cadangan yang dipakai; null = tidak ada fallback.';
comment on column public.usage_logs.fallback_sebab is '429 | hang | error | sepotong | finish — sebab PERTAMA model utama gagal.';
comment on column public.usage_logs.degraded       is 'true = rerank Cohere gagal, urutan hasil tidak tersaring.';
comment on column public.usage_logs.request_id     is 'rid yang sama dengan baris [ask] di log Cloud Run.';

-- JOIN ke chat_sessions kini rutin (sejak sessionId dihidupkan lagi 16 Sep 2026).
create index if not exists idx_usage_logs_session_id
  on public.usage_logs (session_id) where session_id is not null;

-- Dipakai untuk "latensi per jalur, N hari terakhir".
create index if not exists idx_usage_logs_route_created
  on public.usage_logs (route, created_at desc) where route is not null;
