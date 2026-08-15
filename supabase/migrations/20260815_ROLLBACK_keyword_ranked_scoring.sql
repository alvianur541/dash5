-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK — kembalikan match_documents_keyword_ranked ke versi SEBELUM
-- 20260815_fix_keyword_ranked_scoring.sql
--
-- Diambil verbatim dari pg_get_functiondef() pada 15 Agustus 2026, SEBELUM
-- migration dijalankan. Jalankan di Supabase Dashboard -> SQL Editor kalau
-- hasil pencarian ternyata memburuk.
--
-- Aman & instan: hanya mengganti isi fungsi, tidak menyentuh satu baris data pun.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.match_documents_keyword_ranked(p_terms text[], p_filter jsonb, p_numeric boolean DEFAULT false, p_match_count integer DEFAULT 6)
 RETURNS TABLE(content text, score integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH cocok AS (
    SELECT d.id, d.content, d.metadata, count(*)::int AS hits
    FROM unnest(p_terms) AS t(term)
    JOIN documents d ON d.content ILIKE '%' || t.term || '%'
    WHERE d.metadata @> p_filter
    GROUP BY d.id, d.content, d.metadata
  ),
  dinilai AS (
    SELECT c.content, c.metadata,
      ( c.hits * 3
        + CASE WHEN p_numeric AND c.content ~ '\d+(\.\d+)?\s*(MPa|kPa|kgf|bar|psi|N·m|L/min|min-1|rpm|mm|cm3|kg|°C)'
               THEN 5 ELSE 0 END
        + CASE WHEN c.content ~* '(performance standard|component test|specification|allowable limit|nominal|reference value)'
               THEN CASE WHEN p_numeric THEN 6 ELSE 3 END ELSE 0 END
        - CASE WHEN c.metadata->>'Kategori' IN ('BROSUR MANUAL','SALES MANUAL')
               THEN 4 ELSE 0 END
      )::int AS score
    FROM cocok c
  )
  SELECT d.content, d.score
  FROM dinilai d
  WHERE d.score > 0
  ORDER BY d.score DESC, length(d.content) ASC
  LIMIT p_match_count;
$function$
;
