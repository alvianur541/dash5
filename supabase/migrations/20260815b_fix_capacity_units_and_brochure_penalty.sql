-- ═══════════════════════════════════════════════════════════════════════════
-- Perbaikan KEDUA untuk match_documents_keyword_ranked
-- Dibuat 15 Agustus 2026 · JALANKAN DI: Supabase Dashboard → SQL Editor
-- Prasyarat: 20260815_fix_keyword_ranked_scoring.sql sudah dijalankan.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- MASALAH YANG DIPERBAIKI
-- Pertanyaan "berapa liter penggantian oli mesin" (ZX200-5G) dijawab AI:
-- "Kapasitas pasti tidak tercantum di chunk data yang tersedia."
-- Padahal datanya ADA di DUA tempat, dan jawabannya 25 L:
--   1. OPERATOR MANUAL → "2. Engine Oil Change  ZX200-5 class 25 L  ZX330-5 class 36 L"
--   2. BROSUR MANUAL   → "Service Refill Capacities: ... Engine oil : 25.0 L ..."
-- Diukur: TIDAK SATU PUN dari 10 kandidat teratas memuat jawabannya.
--
-- DUA CACAT TERPISAH, dua-duanya di formula skor:
--
--   1. DAFTAR SATUAN TIDAK MEMUAT LITER.
--      Regex bonus angka berisi MPa|kPa|kgf|bar|psi|N·m|L/min|min-1|rpm|mm|cm3|kg|°C
--      — ada 'L/min' tapi TIDAK ADA 'L' atau 'liter' berdiri sendiri. Akibatnya SETIAP
--      pertanyaan kapasitas (oli mesin, coolant, tangki bahan bakar, tangki hidrolik)
--      kehilangan bonus +5, padahal justru itu pertanyaan bernilai-terukur.
--      Chunk Operator Manual di atas: skor 14, kalah dari ambang 19.
--
--   2. PENALTI BROSUR MENGHUKUM TABEL DATA RESMI.
--      Penalti -4 untuk BROSUR/SALES dimaksudkan menekan materi marketing. Tapi brosur
--      Hitachi juga memuat tabel "Service Refill Capacities" dan "Component Weights" —
--      itu data spesifikasi otoritatif, bukan bahan jualan. Chunk brosur di atas: skor
--      15, TEPAT 4 di bawah ambang 19 — persis sebesar penaltinya.
--
-- HASIL SETELAH PERBAIKAN (disimulasikan di DB sebelum migration ini ditulis)
--   "berapa liter penggantian oli mesin" → chunk jawaban naik ke peringkat #1 dan #9
--                                          (sebelumnya tidak ada di 10 besar sama sekali)
--   REGRESI "berapa berat swing motor"   → chunk jawaban #7 → #5 (ikut membaik)
--
-- Aman dijalankan berulang (CREATE OR REPLACE). Signature tidak berubah → tidak ada
-- perubahan frontend yang harus dideploy bersamaan.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.match_documents_keyword_ranked(
  p_terms       text[],
  p_filter      jsonb,
  p_numeric     boolean DEFAULT false,
  p_match_count integer DEFAULT 6
)
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
$function$;
