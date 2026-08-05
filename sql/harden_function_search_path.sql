-- Pin search_path pada trigger function (lint Supabase: function_search_path_mutable).
--
-- Tanpa search_path tetap, fungsi ini me-resolve nama objek memakai search_path milik
-- pemanggil. Fungsi ini sendiri hanya memakai operator/fungsi jsonb dari pg_catalog
-- (yang selalu diprioritaskan), jadi risiko nyatanya kecil — tapi mem-pin-nya
-- menghilangkan kelas bug itu sepenuhnya dan menyamakan dengan fungsi lain di skema ini
-- (match_documents, get_dashboard_snapshot, dst. semuanya sudah set search_path).
--
-- ALTER, bukan CREATE OR REPLACE: badan fungsi tidak diubah sama sekali, jadi trigger
-- yang terpasang di `documents` tetap utuh.

alter function public.strip_metadata_extras() set search_path = public;

-- CATATAN — lint `extension_in_public` (ekstensi `vector` di skema public) SENGAJA
-- tidak diperbaiki. Memindahkannya berarti menulis ulang tipe kolom embedding, semua
-- index HNSW/IVFFlat, dan tanda tangan match_documents* pada tabel 4.677 baris —
-- risiko putus layanannya jauh lebih besar daripada manfaat kerapiannya. Ini peringatan
-- kerapian skema, bukan lubang keamanan: ekstensi di public tidak memberi hak baca
-- apa pun ke anon.
