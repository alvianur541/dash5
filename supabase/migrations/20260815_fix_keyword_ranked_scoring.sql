-- ═══════════════════════════════════════════════════════════════════════════
-- Perbaikan skoring match_documents_keyword_ranked
-- Dibuat 15 Agustus 2026 · JALANKAN DI: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════
--
-- MASALAH YANG DIPERBAIKI
-- Pertanyaan "berapa berat swing motor" (ZX200-5G) dijawab AI: "tidak dipecah
-- terpisah di data, yang ada berat swing DEVICE 220 kg". Padahal datanya ADA:
--   Workshop Manual → "Disassembly of Swing Motor"
--   → "The swing motor assembly weight: 48 kg (110 lb)"
--
-- Diagnosis (diukur langsung di DB, bukan dugaan): chunk jawaban itu berada di
-- peringkat #27 dari 372 kandidat, sementara fungsi ini hanya mengembalikan 6.
-- Jadi chunk yang benar tidak pernah masuk kandidat rerank sama sekali.
--
-- TIGA CACAT DI FORMULA LAMA
--   1. Frasa penuh dari analyzeIntent ("swing motor weight") TIDAK PERNAH cocok
--      literal, karena manual menulis "swing motor ASSEMBLY weight". Term paling
--      diskriminatif menyumbang NOL. → Diperbaiki di sisi klien (bigram) + bobot
--      frasa di bawah.
--   2. Bonus +6 untuk regex '(...|specification|component test|...)' terlalu
--      longgar: kena chunk apa pun yang memuat kata itu, termasuk header
--      boilerplate "Chapter: SPECIFICATIONS". Chunk generik dapat +6, chunk
--      jawaban dapat +0.
--   3. Tiebreak 'ORDER BY length(content) ASC' menghukum chunk panjang. Chunk
--      jawaban 3.370 char — kalah bahkan saat skor imbang.
--
-- HASIL SETELAH PERBAIKAN (disimulasikan di DB sebelum migration ini ditulis)
--   Peringkat chunk jawaban: #27 → #5.  Dengan p_match_count=12 di klien, chunk
--   itu kini pasti masuk kandidat dan Cohere rerank yang memutuskan.
--
-- CATATAN: fungsi ini dipanggil dari src/services/supabase.ts
-- (searchTechnicalManualMulti → rankedPromise). Perubahan klien yang menyertai:
--   - kirim BIGRAM selain kata tunggal + frasa penuh
--   - p_match_count 6 → 12
--   - RERANK_INPUT_CAP 15 → 45, match_count vector 20 → 40
-- Aman dijalankan berulang (CREATE OR REPLACE). Signature tidak berubah, jadi
-- tidak ada perubahan yang harus dideploy bersamaan — urutan bebas.
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
        -- BARU: bobot ekstra untuk setiap term multi-kata yang cocok.
        + c.frasa_hits * 5
        -- Angka + satuan — hanya saat pertanyaannya memang menanyakan nilai.
        -- Daftar satuan DISALIN PERSIS dari fungsi lama (sengaja tidak diubah supaya
        -- migration ini murni soal skoring). Diverifikasi level byte lewat
        -- encode(convert_to(...,'UTF8'),'hex') = 4e c2 b7 6d → 'N·m' UTF-8 BERSIH.
        -- Cocok dengan 1.316 chunk, sama persis seperti sebelum migration.
        + CASE WHEN p_numeric AND c.content ~ '\d+(\.\d+)?\s*(MPa|kPa|kgf|bar|psi|N·m|L/min|min-1|rpm|mm|cm3|kg|°C)'
               THEN 5 ELSE 0 END
        -- DIPERSEMPIT: dulu memuat 'specification' & 'component test' telanjang,
        -- yang kena header boilerplate dan seluruh prosedur tes. Sekarang hanya
        -- penanda tabel spec yang sungguhan, dan bobotnya diturunkan (6→4 / 3→2)
        -- supaya tidak lagi mengalahkan chunk yang benar-benar memuat jawabannya.
        + CASE WHEN c.content ~* '(performance standard|allowable limit|nominal value|reference value|standard value|service limit)'
               THEN CASE WHEN p_numeric THEN 4 ELSE 2 END ELSE 0 END
        -- Materi marketing tetap dihukum: brosur/sales bukan sumber angka teknis.
        - CASE WHEN c.metadata->>'Kategori' IN ('BROSUR MANUAL','SALES MANUAL')
               THEN 4 ELSE 0 END
      )::int AS score
    FROM cocok c
  )
  SELECT d.content, d.score
  FROM dinilai d
  WHERE d.score > 0
  -- Tiebreak d.id (stabil & netral), BUKAN length(content) ASC yang dulu
  -- menghukum chunk panjang — padahal justru chunk prosedur panjang yang
  -- sering memuat angka spec di tengahnya.
  ORDER BY d.score DESC, d.id ASC
  LIMIT p_match_count;
$function$;
