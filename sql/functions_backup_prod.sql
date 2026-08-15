-- ═══════════════════════════════════════════════════════════════════════════
-- CADANGAN DEFINISI FUNGSI PRODUKSI — Supabase cloud (ipoxxshvtkragylisogv)
-- Diambil 15 Agustus 2026 lewat pg_get_functiondef(), SEBELUM migrasi self-host.
--
-- KENAPA FILE INI ADA
-- Sebelum ini, definisi `match_documents`, `match_documents_hybrid`,
-- `match_documents_exact`, `match_documents_v2`, `search_parts_*`,
-- `ingest_field_note_document`, `get_auth_email_by_real_email`, dan
-- `strip_metadata_extras` HANYA hidup di project cloud — tidak ada di repo.
-- Kalau project itu dihapus/di-pause sebelum dump berhasil, definisinya hilang
-- selamanya dan harus ditulis ulang dari nol.
--
-- Lebih genting: `match_documents_keyword_ranked` punya fallback di
-- src/services/supabase.ts kalau RPC-nya hilang, tapi `match_documents` dan
-- `match_documents_hybrid` TIDAK punya fallback — jalur vector & hybrid langsung
-- mati total tanpa jaring pengaman.
--
-- CARA PAKAI (kalau restore gagal / fungsi tidak terbawa)
--   psql -U postgres -d postgres -f sql/functions_backup_prod.sql
-- Aman dijalankan berulang: semuanya CREATE OR REPLACE.
--
-- ⚠️ URUTAN: jalankan SETELAH `CREATE EXTENSION vector;` dan `pg_trgm`,
-- karena tipe `vector` dipakai di signature beberapa fungsi.
--
-- ⚠️ Blok GRANT di bagian bawah WAJIB ikut dijalankan. `pg_dump --no-privileges`
-- membuangnya, dan PostgreSQL memberi EXECUTE ke PUBLIC secara default — artinya
-- tanpa blok itu, fungsi SECURITY DEFINER yang seharusnya service_role-only
-- (get_dashboard_snapshot, get_auth_email_by_real_email, ingest_field_note_document)
-- bisa dipanggil siapa saja, termasuk anon yang kuncinya ada di bundle JS publik.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── extract_part_field ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.extract_part_field(content text, field text)
 RETURNS text
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT trim(substring(content FROM field || ': ([A-Za-z0-9;,\(\)\-\. /]+)'));
$function$
;

-- ─── get_auth_email_by_real_email ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_auth_email_by_real_email(p_real_email text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'auth', 'public'
AS $function$
  SELECT email FROM auth.users 
  WHERE raw_user_meta_data->>'real_email' = p_real_email
  LIMIT 1;
$function$
;

-- ─── get_dashboard_snapshot ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_dashboard_snapshot()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with
  logs as (select * from usage_logs),
  totals as (
    select
      count(*)::int                                                          as questions,
      count(distinct coalesce(nullif(trim(user_name),''), user_nik))::int    as technicians,
      coalesce(sum(input_tokens + output_tokens),0)::bigint                   as tokens,
      coalesce(sum(input_tokens),0)::bigint                                   as input_tokens,
      coalesce(sum(output_tokens),0)::bigint                                  as output_tokens,
      coalesce(sum(cost_idr),0)::numeric                                      as idr,
      coalesce(sum(cost_usd),0)::numeric                                      as usd,
      max(created_at)                                                         as last_at
    from logs
  ),
  today as (
    select
      count(*)::int                                          as questions,
      coalesce(sum(cost_idr),0)::numeric                     as idr,
      coalesce(sum(input_tokens + output_tokens),0)::bigint  as tokens
    from logs
    where (created_at at time zone 'Asia/Jakarta')::date
        = (now() at time zone 'Asia/Jakarta')::date
  ),
  hourly as (
    select
      g.jam,
      count(l.id)::int                                          as query,
      coalesce(sum(l.input_tokens + l.output_tokens),0)::bigint as tokens,
      coalesce(sum(l.cost_idr),0)::numeric                      as idr
    from generate_series(0,23) as g(jam)
    left join logs l
      on extract(hour from l.created_at at time zone 'Asia/Jakarta')::int = g.jam
     and (l.created_at at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date
    group by g.jam
  ),
  per_user as (
    select
      coalesce(nullif(trim(user_name),''), user_nik, '(tanpa nama)') as teknisi,
      count(*)::int                                as pertanyaan,
      sum(input_tokens + output_tokens)::bigint    as tokens,
      sum(cost_idr)::numeric                        as idr,
      max(created_at)                              as last_at
    from logs group by 1 order by idr desc
  ),
  per_model as (
    select model,
      count(*)::int                              as pertanyaan,
      sum(input_tokens + output_tokens)::bigint  as tokens,
      sum(cost_idr)::numeric                      as idr
    from logs group by 1 order by idr desc
  ),
  per_tool as (
    select tool,
      count(*)::int          as kali,
      sum(cost_idr)::numeric as idr
    from logs,
         unnest(case when tools_used is null or array_length(tools_used,1) is null
                     then array['(tanpa tool)'] else tools_used end) as tool
    group by 1 order by kali desc
  ),
  daily as (
    select
      to_char((created_at at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD') as hari,
      count(*)::int                              as pertanyaan,
      sum(input_tokens + output_tokens)::bigint  as tokens,
      sum(cost_idr)::numeric                      as idr
    from logs
    group by (created_at at time zone 'Asia/Jakarta')::date
    order by (created_at at time zone 'Asia/Jakarta')::date desc
    limit 30
  ),
  recent as (
    select
      created_at,
      coalesce(nullif(trim(user_name),''), user_nik, '(tanpa nama)') as teknisi,
      model,
      (input_tokens + output_tokens)::int as tokens,
      llm_calls,
      tools_used,
      cost_idr::numeric as idr
    from logs order by created_at desc limit 15
  ),
  census as (
    select
      (select count(*) from documents)::int                              as docs,
      (select count(distinct metadata->>'Model') from documents)::int    as models,
      (select count(*) from chat_sessions)::int                          as sessions,
      (select count(distinct user_id) from chat_sessions)::int           as session_users,
      (select count(*) from user_niks)::int                              as niks
  )
  select jsonb_build_object(
    'generated_at', now(),
    'totals',    (select row_to_json(t) from totals t),
    'today',     (select row_to_json(t) from today t),
    'hourly',    coalesce((select jsonb_agg(row_to_json(h) order by h.jam) from hourly h), '[]'::jsonb),
    'per_user',  coalesce((select jsonb_agg(row_to_json(p)) from per_user  p), '[]'::jsonb),
    'per_model', coalesce((select jsonb_agg(row_to_json(p)) from per_model p), '[]'::jsonb),
    'per_tool',  coalesce((select jsonb_agg(row_to_json(p)) from per_tool  p), '[]'::jsonb),
    'daily',     coalesce((select jsonb_agg(row_to_json(d) order by d.hari) from daily d), '[]'::jsonb),
    'recent',    coalesce((select jsonb_agg(row_to_json(r)) from recent    r), '[]'::jsonb),
    'census',    (select row_to_json(c) from census c)
  );
$function$
;

-- ─── ingest_field_note_document ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.ingest_field_note_document(p_content text, p_model text, p_embedding text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id bigint;
begin
  if not (
    (auth.jwt() ->> 'role')  = 'service_role'
    or (auth.jwt() ->> 'email') = 'alvianur@gmail.com'
  ) then
    raise exception 'not authorized';
  end if;
  if p_content is null or length(trim(p_content)) = 0 then
    raise exception 'empty content';
  end if;

  insert into public.documents (content, metadata, embedding)
  values (
    p_content,
    jsonb_build_object('Model', p_model, 'Kategori', 'CATATAN LAPANGAN'),
    p_embedding::vector
  )
  returning id into v_id;

  return v_id;
end;
$function$
;

-- ─── match_documents ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_documents(query_embedding vector, match_count integer, filter jsonb)
 RETURNS TABLE(id bigint, content text, metadata jsonb, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT d.id, d.content, d.metadata,
         (1 - (d.embedding <=> query_embedding))::double precision
  FROM documents d
  WHERE d.metadata @> filter
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
$function$
;

-- ─── match_documents_exact ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_documents_exact(query_embedding vector, match_count integer, filter jsonb)
 RETURNS TABLE(id bigint, content text, metadata jsonb, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT d.id, d.content, d.metadata, 1 - (d.embedding <=> query_embedding)
  FROM documents d
  WHERE d.metadata @> filter
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
$function$
;

-- ─── match_documents_hybrid ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_documents_hybrid(query_text text, query_embedding vector, match_count integer, filter jsonb, similarity_threshold double precision)
 RETURNS TABLE(id bigint, content text, metadata jsonb, similarity double precision, match_type text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  exact_count integer;
  clean_query text;
BEGIN
  clean_query := upper(trim(query_text));
  IF clean_query ~ '^[A-Z]{0,2}[0-9]{5,10}$' THEN
    RETURN QUERY
    SELECT d.id, d.content, d.metadata,
      1.0::double precision, 'exact_part_no'::text
    FROM documents d
    WHERE d.metadata->>'Kategori' = 'PARTS CATALOG'
      AND d.content LIKE 'Part Number: ' || clean_query || '%'
      AND d.metadata @> filter
    LIMIT match_count;
    GET DIAGNOSTICS exact_count = ROW_COUNT;
    IF exact_count > 0 THEN RETURN; END IF;
  END IF;
  RETURN QUERY
  SELECT d.id, d.content, d.metadata,
    (1 - (d.embedding <=> query_embedding))::double precision,
    CASE WHEN d.metadata->>'Kategori' = 'PARTS CATALOG' THEN 'semantic_parts' ELSE 'semantic_manual' END::text
  FROM documents d
  WHERE d.metadata @> filter
    AND (1 - (d.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$
;

-- ─── match_documents_keyword_ranked ──────────────────────────────
CREATE OR REPLACE FUNCTION public.match_documents_keyword_ranked(p_terms text[], p_filter jsonb, p_numeric boolean DEFAULT false, p_match_count integer DEFAULT 6)
 RETURNS TABLE(content text, score integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH cocok AS (
    SELECT
      d.id, d.content, d.metadata,
      count(*)::int AS hits,
      -- Term multi-kata (bigram / frasa penuh) jauh lebih diskriminatif daripada
      -- kata tunggal: "swing motor" mempersempit jauh lebih tajam dari "motor".
      count(*) FILTER (WHERE position(' ' IN t.term) > 0)::int AS frasa_hits
    FROM unnest(p_terms) AS t(term)
    JOIN documents d ON d.content ILIKE '%' || t.term || '%'
    WHERE d.metadata @> p_filter
    GROUP BY d.id, d.content, d.metadata
  ),
  dinilai AS (
    SELECT c.id, c.content,
      ( c.hits * 3
        + c.frasa_hits * 5
        -- Angka + satuan. 'L\y' (L dengan batas kata) dan 'liter' DITAMBAHKAN — tanpa
        -- keduanya, semua pertanyaan kapasitas/volume kehilangan bonus ini.
        -- Urutan penting: 'L/min' harus SEBELUM 'L\y' supaya tetap cocok utuh.
        + CASE WHEN p_numeric AND c.content ~ '\d+(\.\d+)?\s*(MPa|kPa|kgf|bar|psi|N·m|L/min|min-1|rpm|mm|cm3|kg|°C|L\y|liter)'
               THEN 5 ELSE 0 END
        -- Penanda tabel spec sungguhan (bukan kata 'specification' telanjang yang dulu
        -- kena header boilerplate "Chapter: SPECIFICATIONS").
        + CASE WHEN c.content ~* '(performance standard|allowable limit|nominal value|reference value|standard value|service limit)'
               THEN CASE WHEN p_numeric THEN 4 ELSE 2 END ELSE 0 END
        -- Materi marketing tetap dihukum — TAPI DIBEBASKAN kalau chunk-nya tabel data
        -- resmi. Brosur Hitachi memuat "Service Refill Capacities" & "Component Weights";
        -- itu sumber angka sah dan sering SATU-SATUNYA tempat angka itu tertulis.
        - CASE WHEN c.metadata->>'Kategori' IN ('BROSUR MANUAL','SALES MANUAL')
                AND c.content !~* '(refill capacit|component weight)'
               THEN 4 ELSE 0 END
      )::int AS score
    FROM cocok c
  )
  SELECT d.content, d.score
  FROM dinilai d
  WHERE d.score > 0
  -- Tiebreak d.id (stabil & netral), BUKAN length(content) ASC yang dulu menghukum
  -- chunk panjang — padahal justru chunk prosedur panjang yang sering memuat angka spec.
  ORDER BY d.score DESC, d.id ASC
  LIMIT p_match_count;
$function$
;

-- ─── match_documents_v2 ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_documents_v2(query_embedding vector, match_count integer, filter jsonb, similarity_threshold double precision)
 RETURNS TABLE(id bigint, content text, metadata jsonb, similarity double precision)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT d.id, d.content, d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM documents d
  WHERE d.metadata @> filter
    AND (1 - (d.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$
;

-- ─── resolve_auth_email ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_auth_email(p_nik text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth_email
  from public.user_niks
  where nik = upper(trim(p_nik))
  limit 1;
$function$
;

-- ─── search_parts_by_name ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_parts_by_name(query_text text, filter_model text, result_limit integer)
 RETURNS TABLE(id bigint, content text, part_no text, part_name text, section text, item_no text, service_code text, qty text, model text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT d.id, d.content,
    extract_part_field(d.content, 'Part Number'),
    extract_part_field(d.content, 'Part Name'),
    extract_part_field(d.content, 'Assembly / Section'),
    extract_part_field(d.content, 'Item Reference No'),
    substring(d.content FROM 'Service Code: ([A-Z])'),
    extract_part_field(d.content, 'Quantity per assembly'),
    d.metadata->>'Model'
  FROM documents d
  WHERE d.metadata->>'Kategori' = 'PARTS CATALOG'
    AND d.content ILIKE '%' || query_text || '%'
    AND (filter_model IS NULL OR d.metadata->>'Model' = filter_model)
  ORDER BY d.id
  LIMIT result_limit;
END;
$function$
;

-- ─── search_parts_exact ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_parts_exact(part_number text, filter_model text)
 RETURNS TABLE(id bigint, content text, section text, model text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT d.id, d.content,
    substring(d.content FROM 'Section: ([^\n]+)'),
    d.metadata->>'Model'
  FROM documents d
  WHERE d.metadata->>'Kategori' = 'PARTS CATALOG'
    AND d.content LIKE '%| ' || upper(trim(part_number)) || '%|%'
    AND (filter_model IS NULL OR d.metadata->>'Model' = filter_model);
END;
$function$
;

-- ─── strip_metadata_extras ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.strip_metadata_extras()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.metadata->>'Kategori' = 'PARTS CATALOG' THEN
    NEW.metadata := jsonb_strip_nulls(jsonb_build_object(
      'Model',          NEW.metadata->>'Model',
      'Kategori',       NEW.metadata->>'Kategori',
      'part_no',        NEW.metadata->>'part_no',
      'part_name',      NEW.metadata->>'part_name',
      'section',        NEW.metadata->>'section',
      'item_no',        NEW.metadata->>'item_no',
      'qty',            NEW.metadata->>'qty',
      'service_code',   NEW.metadata->>'service_code',
      'replaceable_by', NEW.metadata->>'replaceable_by',
      'source_page',    NEW.metadata->>'source_page'
    ));
  ELSE
    NEW.metadata := jsonb_strip_nulls(jsonb_build_object(
      'Model',       NEW.metadata->>'Model',
      'Kategori',    NEW.metadata->>'Kategori',
      'source_page', NEW.metadata->>'source_page'
    ));
  END IF;
  RETURN NEW;
END;
$function$
;

-- ═══════════════════════════════════════════════════════════════════════════
-- HAK AKSES — kondisi produksi per 15 Agu 2026. Jangan diperlonggar.
-- ═══════════════════════════════════════════════════════════════════════════

-- Tutup default PUBLIC dulu untuk tiga fungsi SECURITY DEFINER yang sensitif:
REVOKE EXECUTE ON FUNCTION public.get_dashboard_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_auth_email_by_real_email(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ingest_field_note_document(text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.extract_part_field(content text, field text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extract_part_field(content text, field text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_auth_email_by_real_email(p_real_email text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_field_note_document(p_content text, p_model text, p_embedding text) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_documents(query_embedding vector, match_count integer, filter jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_documents(query_embedding vector, match_count integer, filter jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_documents_exact(query_embedding vector, match_count integer, filter jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.match_documents_exact(query_embedding vector, match_count integer, filter jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_documents_exact(query_embedding vector, match_count integer, filter jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_documents_hybrid(query_text text, query_embedding vector, match_count integer, filter jsonb, similarity_threshold double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_documents_hybrid(query_text text, query_embedding vector, match_count integer, filter jsonb, similarity_threshold double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_documents_keyword_ranked(p_terms text[], p_filter jsonb, p_numeric boolean, p_match_count integer) TO anon;
GRANT EXECUTE ON FUNCTION public.match_documents_keyword_ranked(p_terms text[], p_filter jsonb, p_numeric boolean, p_match_count integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_documents_keyword_ranked(p_terms text[], p_filter jsonb, p_numeric boolean, p_match_count integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_documents_v2(query_embedding vector, match_count integer, filter jsonb, similarity_threshold double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_documents_v2(query_embedding vector, match_count integer, filter jsonb, similarity_threshold double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_auth_email(p_nik text) TO anon;
GRANT EXECUTE ON FUNCTION public.resolve_auth_email(p_nik text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_auth_email(p_nik text) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_parts_by_name(query_text text, filter_model text, result_limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_parts_by_name(query_text text, filter_model text, result_limit integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_parts_exact(part_number text, filter_model text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_parts_exact(part_number text, filter_model text) TO service_role;
