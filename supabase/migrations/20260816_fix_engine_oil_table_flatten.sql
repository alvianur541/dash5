-- ═══════════════════════════════════════════════════════════════════════════
-- Perbaiki tabel terflatten: kapasitas oli mesin ZX200-5G
-- Ditulis 16 Agustus 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- MASALAH
-- Chunk OPERATOR MANUAL "Maintenance Guide" (ZX200-5G) memuat jawabannya, tapi tabel
-- aslinya turun jadi satu sel per baris waktu ingest:
--
--     2. Engine Oil
--     Change ZX200-5 class
--     25 L               <- jawabannya, tapi tanpa label di barisnya sendiri
--     ZX330-5 class
--     36 L               <- angka KELAS UNIT LAIN, persis di bawahnya
--
-- Akibatnya AI menolak menyimpulkan (blok ANTI-HALU bekerja sesuai desain: lebih baik
-- bilang "tidak tercantum" daripada salah comot 36 L). Retrieval-nya sendiri SUDAH BENAR —
-- chunk ini peringkat #1-2 di keyword RPC dan masuk kandidat.
--
-- YANG DIUBAH
-- HANYA menyambung label dengan nilainya ke satu baris. Kata-katanya sama persis,
-- tidak ada fakta/interpretasi baru yang ditambahkan:
--
--     Change ZX200-5 class: 25 L
--     Change ZX330-5 class: 36 L
--
-- YANG TIDAK DIUBAH
-- - embedding TIDAK di-regenerate. Perubahannya ~20 char dari 1.285 char (1,5%); vektor
--   lama tetap mewakili chunk ini, dan chunk ini memang sudah terambil dengan benar.
--   Kalau nanti ingest ulang, ini otomatis tertimpa.
-- - metadata tidak disentuh (trigger documents_strip_metadata tetap berlaku).
--
-- ⚠️ CATATAN: ini perbaikan TARGETED untuk satu chunk. Pola tabel-terflatten yang sama
-- kemungkinan ada di chunk Operator Manual lain. Perbaikan menyeluruh = re-ingest,
-- sengaja TIDAK dikerjakan sekarang (dekat penjurian).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) Pastikan sasarannya persis satu baris dan bentuknya masih seperti yang diharapkan.
--    Kalau tidak, batalkan — lebih baik gagal daripada mengubah chunk yang salah.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM documents
  WHERE metadata->>'Model' = 'ZX200-5G'
    AND metadata->>'Kategori' = 'OPERATOR MANUAL'
    AND content LIKE '%Change ZX200-5 class' || chr(10) || '25 L%';

  IF n <> 1 THEN
    RAISE EXCEPTION 'Dibatalkan: menemukan % baris sasaran, harusnya tepat 1. Chunk mungkin sudah diperbaiki atau berubah.', n;
  END IF;
END $$;

-- 2) Sambungkan label dengan nilainya.
UPDATE documents
SET content = replace(
      replace(
        content,
        'Change ZX200-5 class' || chr(10) || '25 L',
        'Change ZX200-5 class: 25 L'
      ),
      'ZX330-5 class' || chr(10) || '36 L',
      'ZX330-5 class: 36 L'
    )
WHERE metadata->>'Model' = 'ZX200-5G'
  AND metadata->>'Kategori' = 'OPERATOR MANUAL'
  AND content LIKE '%Change ZX200-5 class' || chr(10) || '25 L%';

-- 3) Verifikasi: kedua baris gabungan harus ada, bentuk lama harus sudah hilang.
DO $$
DECLARE ok_baru int; sisa_lama int;
BEGIN
  SELECT count(*) INTO ok_baru
  FROM documents
  WHERE metadata->>'Model' = 'ZX200-5G'
    AND content LIKE '%Change ZX200-5 class: 25 L%'
    AND content LIKE '%ZX330-5 class: 36 L%';

  SELECT count(*) INTO sisa_lama
  FROM documents
  WHERE metadata->>'Model' = 'ZX200-5G'
    AND content LIKE '%Change ZX200-5 class' || chr(10) || '25 L%';

  IF ok_baru <> 1 OR sisa_lama <> 0 THEN
    RAISE EXCEPTION 'Verifikasi gagal: hasil_baru=% sisa_lama=%', ok_baru, sisa_lama;
  END IF;
  RAISE NOTICE 'OK — chunk kapasitas oli mesin ZX200-5G diperbaiki.';
END $$;

COMMIT;
