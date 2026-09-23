# Database Dash⁵ — cara membaca folder ini

Project Supabase: `ipoxxshvtkragylisogv` (region `ap-southeast-1`).
Tabel inti: `documents` (vector 3072, embedding `gemini-embedding-001`), `chat_sessions`,
`usage_logs`, `bookmarks`, `message_feedback`, `user_niks`.

## Isi tiap folder

| Folder | Isi | Boleh dijalankan? |
|---|---|---|
| `migrations/` | Perubahan skema bernomor, urut tanggal. **Ini sumber kebenaran.** | Ya, urut nomor |
| `migrations/rollback/` | Pembatalan untuk migrasi tertentu. Nomornya sengaja sama dengan pasangannya. | Hanya kalau memang membatalkan |
| `snapshots/` | Dump definisi fungsi produksi (15 Agu 2026). Bukan migrasi. | Hanya untuk memulihkan fungsi yang hilang |
| `sql/` | Perubahan skema yang dulu diterapkan manual ke produksi, belum jadi migrasi bernomor. | Sudah ter-apply — jangan diulang tanpa mengecek |
| `tests/` | Uji ke DB produksi (isolasi model, harness retrieval). Semuanya `SELECT`. | Ya, aman (read-only) |

⚠️ Berkas `rollback/` dulu duduk di dalam `migrations/`. Siapa pun yang menjalankan
migrasi urut nomor akan mengeksekusinya sebagai langkah MAJU — itu sebabnya dipisah.

## Setup dari nol

1. `create extension if not exists vector;` dan `pg_trgm` — beberapa fungsi memakai tipe `vector`.
2. Jalankan seluruh berkas `migrations/*.sql` urut nama (tanggal di depan).
3. Jalankan `snapshots/functions_backup_prod.sql` untuk fungsi RPC (`match_documents`,
   `match_documents_hybrid`, `search_parts_*`, dst.) — belum ada di migrations.
4. Isi data `documents` lewat ingest (embedding WAJIB 3072 dim, `gemini-embedding-001`).

## Aturan ke depan

- **Setiap perubahan skema = satu berkas migrasi bernomor** di `migrations/`,
  format `YYYYMMDD_deskripsi_singkat.sql`. Jangan menambah berkas lepas di `sql/`.
- Statement dibuat **aman diulang** (`if not exists`, `create or replace`) —
  migrasi sering dijalankan ulang saat memperbaiki urutan.
- Migrasi dijalankan oleh Alvian, bukan otomatis dari kode.
- ⚠️ Kalau backend butuh kolom baru, **jalankan migrasinya DULU, baru deploy backend** —
  PostgREST menolak kolom tak dikenal dengan 400 dan baris log bisa hilang diam-diam
  (lihat `20260918_usage_logs_latency.sql`).

## Yang masih perlu diputuskan

Tiga berkas di `sql/` isinya perubahan skema permanen yang **menurut komentarnya sudah
diterapkan** ke produksi, tapi tidak ada padanannya di `migrations/`:

- `message_feedback.sql` — tabel `message_feedback` + RLS
- `resolve_auth_email.sql` — menutup enumerasi NIK lewat anon key
- `harden_function_search_path.sql` — pin `search_path` di trigger function

Kalau nanti setup dari nol, ketiganya harus ikut dijalankan. Menjadikannya migrasi
bernomor butuh pengecekan ke produksi dulu (apa yang sudah jalan), jadi sengaja
dibiarkan apa adanya sampai diputuskan.
