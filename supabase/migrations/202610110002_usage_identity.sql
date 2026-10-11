-- No access-policy changes. Legacy classification remains unknown until approved INTERNAL_USERS is resolved.
BEGIN;
ALTER TABLE public.usage_logs ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.usage_logs ADD COLUMN IF NOT EXISTS is_internal boolean;
ALTER TABLE public.usage_logs ALTER COLUMN is_internal SET DEFAULT false;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.usage_logs'::regclass AND conname='usage_logs_user_id_fkey') THEN
    ALTER TABLE public.usage_logs ADD CONSTRAINT usage_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
WITH unique_prefixes AS (
  SELECT split_part(email,'@',1) prefix, (array_agg(id))[1] id
  FROM auth.users WHERE email IS NOT NULL AND email <> ''
  GROUP BY 1 HAVING count(*)=1
)
UPDATE public.usage_logs l SET user_id=u.id FROM unique_prefixes u
WHERE l.user_id IS NULL AND l.user_nik=u.prefix;
-- Optional transaction-local, operator-approved INTERNAL_USERS; never infer the owner.
DO $$
DECLARE cfg text := current_setting('app.internal_users', true);
BEGIN
  IF cfg IS NOT NULL AND btrim(cfg) <> '' THEN
    IF EXISTS (SELECT 1 FROM regexp_split_to_table(lower(cfg), ',') t(token)
      WHERE btrim(token) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND btrim(token) !~ '^[^[:space:]@,*]+@[^[:space:]@,*]+\.[^[:space:]@,*]+$') THEN
      RAISE EXCEPTION 'Invalid internal identity configuration';
    END IF;
    UPDATE public.usage_logs l SET is_internal=EXISTS (
      SELECT 1 FROM regexp_split_to_table(lower(cfg), ',') t(token)
      WHERE btrim(token)=a.id::text OR btrim(token)=lower(a.email)
    ) FROM auth.users a WHERE l.user_id=a.id AND l.is_internal IS NULL;
  END IF;
END $$;
-- Counts only: never emit account identifiers.
SELECT count(*) FILTER (WHERE user_id IS NOT NULL) linked_rows,
       count(*) FILTER (WHERE user_id IS NULL) unlinked_rows,
       count(*) FILTER (WHERE is_internal IS NULL) unknown_classification_rows
FROM public.usage_logs;
COMMIT;
