-- ═══════════════════════════════════════════════════════════════════════════
-- HARNESS UJI RETRIEVAL — jalankan di Supabase Dashboard → SQL Editor
-- Dibuat 15 Agustus 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- GUNANYA
-- Menemukan pertanyaan yang jawabannya ADA di database tapi chunk-nya TIDAK PERNAH
-- sampai ke kandidat rerank. Pola ini sudah tiga kali terjadi dan selalu ketahuan
-- secara kebetulan (berat swing motor, kapasitas oli mesin). Harness ini mencarinya
-- secara borongan.
--
-- CARA BACA HASIL
--   chunk_ada = 0  → PENANDA-nya yang salah, bukan sistemnya. Perbaiki penanda.
--   peringkat NULL → chunk jawaban tidak masuk 10 kandidat teratas jalur kata kunci.
--   peringkat 9-10 → lolos tapi mepet; satu perubahan kecil bisa menjatuhkannya.
--
-- ⚠️ DUA BATASAN YANG WAJIB DIINGAT — JANGAN SALAH SIMPULKAN
--
--  1. PENANDA HARUS MENERIMA SEMUA CHUNK YANG MEMUAT JAWABAN, bukan satu kalimat
--     tertentu. Kesalahan ini SUDAH TERJADI saat harness pertama kali dibuat:
--     3 dari 4 "kegagalan" ternyata penanda yang terlalu sempit, bukan cacat sistem.
--     Contoh: interval ganti oli mesin ZX200-5G tertulis di DUA tempat —
--       BROSUR  : "Engine oil : every 500 hours"
--       OPERATOR: "Change Engine Oil, Replace Engine Oil Filter --- every 500 hours"
--     Penanda yang cuma menerima versi brosur akan melaporkan gagal PADAHAL sistem
--     sudah menemukan versi operator manual. Selalu cek dulu:
--       select metadata->>'Kategori', left(content,200) from documents
--       where metadata->>'Model'='X' and content ~* '<fakta>';
--
--  2. HANYA MENGUJI JALUR KATA KUNCI. Jalur similarity (vector) tidak bisa diuji dari
--     SQL karena butuh meng-embed query lewat Vertex. Chunk yang gagal di sini MASIH
--     MUNGKIN tertangkap vector. Jadi hasil "gagal" = sinyal untuk diselidiki,
--     BUKAN bukti jawabannya tidak sampai ke teknisi.
--
-- CATATAN: kolom q_en meniru keluaran analyzeIntent (frasa Inggris pendek, tanpa nama
-- model). Itu APROKSIMASI — analyzeIntent asli adalah LLM dan bisa memilih kata lain.
-- ═══════════════════════════════════════════════════════════════════════════

WITH kasus(no, model, tanya, q_en, penanda) AS (VALUES
  -- penanda sengaja longgar (alternasi) supaya menerima semua penulisan jawaban
  (1 ,'ZX200-5G'  ,'berat swing motor'              ,'swing motor weight'                    ,'swing motor assembly weight'),
  (2 ,'ZX200-5G'  ,'berapa liter oli mesin'         ,'engine oil change capacity liters'     ,'ZX200-5 class 25 L|Engine oil : 25.0 L'),
  (3 ,'ZX200-5G'  ,'berat swing device'             ,'swing device weight'                   ,'Swing device \(5\) weight: 220 kg'),
  (4 ,'ZX200-5G'  ,'berat counterweight'            ,'counterweight weight'                  ,'Counterweight \| 4 200 kg|[Cc]ounterweight \(4\) weight'),
  (5 ,'ZX200-5G'  ,'kapasitas tangki bahan bakar'   ,'fuel tank capacity liters'             ,'Fuel tank : 400.0 L'),
  (6 ,'ZX200-5G'  ,'kapasitas coolant'              ,'engine coolant capacity liters'        ,'Engine coolant : 23.0 L'),
  (7 ,'ZX200-5G'  ,'berat boom'                     ,'boom weight'                           ,'Boom \(with boom \+ arm cylinder\)'),
  (8 ,'ZX48U-5A'  ,'tekanan main relief berapa'     ,'main relief set pressure MPa'          ,'Main Relief Set-Pressure Normal: 24.5 MPa'),
  (9 ,'ZX48U-5A'  ,'kapasitas oli mesin berapa liter','engine oil capacity liters'           ,'Engine oil : 8.6 L'),
  (10,'ZX48U-5A'  ,'kapasitas tangki bahan bakar'   ,'fuel tank capacity liters'             ,'Fuel tank : 70.0 L'),
  (11,'ZX138MF-5G','berat swing motor'              ,'swing motor weight'                    ,'swing motor assembly weight'),
  (12,'KCM 60ZV'  ,'kapasitas oli mesin'            ,'engine oil capacity liter'             ,'Engine 14 liter'),
  (13,'KCM 60ZV'  ,'kapasitas oli transmisi'        ,'transmission oil capacity liter'       ,'Transmission 20 liter'),
  (14,'ZX200-5G'  ,'tekanan sensor high reference'  ,'pressure sensor high reference MPa'    ,'Reference: 31.5 MPa'),
  (15,'ZX200-5G'  ,'interval ganti oli mesin'       ,'engine oil change interval hours'      ,'Engine oil : every 500 hours|Change Engine Oil, Replace Engine Oil Filter --- every 500 hours'),
  (16,'ZX48U-5A'  ,'berat operasi unit'             ,'operating weight kg'                   ,'Operating Weight kg \(lb\) 4760'),
  (17,'ZX200-5G'  ,'kapasitas sistem hidrolik'      ,'hydraulic system total capacity liters','Hydraulic system total : 240'),
  (18,'ZX200-5G'  ,'kapasitas swing device'         ,'swing device oil capacity liters'      ,'Swing device : 6.2 L')
),
-- Meniru pembentukan term di klien: frasa penuh + bigram + kata tunggal, dipotong 7.
w AS (
  SELECT k.*, ARRAY(SELECT x FROM unnest(regexp_split_to_array(lower(k.q_en),'\s+')) x
                    WHERE length(x) >= 3
                      AND x NOT IN ('the','a','an','is','are','for','and','of','with','to')) AS words
  FROM kasus k
),
tt AS (
  SELECT w.*, (ARRAY[lower(w.q_en)]
    || ARRAY(SELECT w.words[i]||' '||w.words[i+1]
             FROM generate_subscripts(w.words,1) i
             WHERE i < array_length(w.words,1))
    || w.words)[1:7] AS terms
  FROM w
)
SELECT
  t.no,
  t.model,
  t.tanya,
  (SELECT count(*) FROM documents d
     WHERE d.metadata @> jsonb_build_object('Model', t.model)
       AND regexp_replace(d.content,'\s+',' ','g') ~ t.penanda) AS chunk_ada,
  r.peringkat,
  CASE
    WHEN (SELECT count(*) FROM documents d
            WHERE d.metadata @> jsonb_build_object('Model', t.model)
              AND regexp_replace(d.content,'\s+',' ','g') ~ t.penanda) = 0 THEN 'PENANDA SALAH'
    WHEN r.peringkat IS NULL THEN 'GAGAL — selidiki'
    WHEN r.peringkat >= 9     THEN 'lolos (mepet)'
    ELSE 'lolos'
  END AS status
FROM tt t
LEFT JOIN LATERAL (
  SELECT min(x.rn) AS peringkat FROM (
    SELECT row_number() OVER () AS rn, content
    FROM match_documents_keyword_ranked(t.terms, jsonb_build_object('Model', t.model), true, 10)
  ) x
  WHERE regexp_replace(x.content,'\s+',' ','g') ~ t.penanda
) r ON true
ORDER BY t.no;
