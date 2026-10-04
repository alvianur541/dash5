-- Keep the embedding pages warm so the first vector search after a quiet period is not slow.
-- Measured 4 Oct: match_documents 460–1.420 ms on the first call per unit, 8–40 ms right after
-- (production "cari": same unit <5 min 0,93 s vs >60 min 1,62 s). Touching every embedding
-- every 5 minutes keeps them resident. Undo: select cron.unschedule('warm_embeddings');
create extension if not exists pg_cron;

select cron.schedule(
  'warm_embeddings',
  '*/5 * * * *',
  $$select count(*) filter (where vector_dims(embedding) > 0) from public.documents$$
);
