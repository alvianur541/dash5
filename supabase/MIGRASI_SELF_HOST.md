# Panduan Migrasi Dash⁵ ke Server Hexindo

**Status:** Prosedur inti sudah teruji penuh di VPS Google Cloud testing (13 Agustus 2026) — hasil
migrasi cocok 100% dengan Supabase cloud. **Direvisi 15 Agustus 2026** setelah audit langsung ke
database produksi + penelusuran kode: ditambahkan gerbang verifikasi, koreksi nama env var, koreksi
rencana Okta, dan pola service worker yang tahan pindah domain.

> **Cara pakai dokumen ini di server:** `git clone https://github.com/alvianur541/dash5.git`
> lalu `cat supabase/MIGRASI_SELF_HOST.md`. Semua file yang dirujuk (backup fungsi, harness uji)
> ikut ter-clone.

---

## 1. Latar Belakang & Tujuan

Dash⁵ saat ini pakai Supabase **cloud** (project `ipoxxshvtkragylisogv`) untuk vector database dan
auth. IT (Pak Dwi) minta data dipindah ke server internal Hexindo karena concern data residency &
UU PDP — data teknisi (chat history, knowledge base, kredensial login) saat ini tersimpan di server
pihak ketiga di luar negeri.

**Yang dipindah:** database, auth, dan seluruh data aplikasi (Supabase self-hosted).
**Yang TIDAK pindah:** frontend (tetap Cloudflare Workers), backend proxy (tetap Google Cloud Run),
dan panggilan AI (Gemini/Cohere tetap API eksternal — cuma potongan teks yang lewat, tidak disimpan).

⚠️ **Penting:** browser teknisi memanggil Supabase **langsung** (bukan lewat proxy) untuk search &
chat history. Jadi instance Supabase baru **wajib bisa diakses dari internet**, bukan cuma dari dalam
jaringan kantor — teknisi memakainya di lokasi unit.

⚠️ **Wajib TLS.** `public/_headers` memakai `upgrade-insecure-requests`; Supabase yang dilayani HTTP
polos akan diblokir browser.

---

## 2. Yang Perlu Dikonfirmasi ke IT (Pak Dwi)

| # | Yang diminta | Kenapa wajib |
|---|---|---|
| 1 | **Izin install Docker + hak sudo** | Semua komponen jalan via Docker |
| 2 | **Outbound internet (port 443)** | Backend memanggil API embedding/LLM; tanpa ini chatbot bisu total |
| 3 | Disk bisa **di-expand** | KB terus tumbuh |
| 4 | Boleh pasang **Cloudflare Tunnel** (cukup outbound, tanpa buka port inbound) | Akses dari luar jaringan kantor tanpa minta firewall inbound |
| 5 | Domain/subdomain final | Belum urgent, bisa menyusul |
| 6 | **SAML 2.0 app integration + metadata URL** (bukan OIDC) — kalau/ketika mau Okta | Lihat §8, ini koreksi penting |

**Spek server:** Ubuntu Server 24.04 LTS, 4 vCPU, 8 GB RAM, disk minimal 40 GB (ideal 100 GB atau
pastikan bisa di-expand). DB sekarang **98 MB** — jadi ruang bukan kendala, yang penting bisa tumbuh.

---

## 3. Arsitektur Setelah Migrasi

```
Server Hexindo (Docker)
│
├── Cloudflare Tunnel ──► keluar ke internet (tanpa buka port inbound)
│
└── Supabase self-hosted (docker compose)
      ├── Postgres + pgvector  (KB, chat history, user)
      ├── GoTrue                (auth/login — TETAP penerbit token, lihat §8)
      ├── PostgREST             (API otomatis)
      ├── Studio                (dashboard — proteksi ketat!)
      ├── Kong                  (API gateway, port 8000)
      └── Realtime, Storage

Frontend (Cloudflare Workers) — TETAP, ganti env + REBUILD
Backend proxy (Google Cloud Run) — TETAP, ganti env + redeploy
```

⚠️ Kong/ingress **wajib mengekspos `/auth/v1` dan `/rest/v1` di root domain**, bukan sub-path.
`cloudrun/server.js` menempel `/auth/v1/user` langsung ke root `SUPABASE_URL`. Kalau verifikasi token
gagal, **seluruh endpoint proxy balas 401** dan chat mati total.

---

## 4. Prosedur Migrasi

### 4.0 🔴 SEBELUM APA PUN — sudah dikerjakan, tapi pahami kenapa

Definisi `match_documents`, `match_documents_hybrid`, `match_documents_exact`, `match_documents_v2`,
`search_parts_*`, `ingest_field_note_document`, `get_auth_email_by_real_email`, dan
`strip_metadata_extras` dulu **hanya hidup di project cloud** — tidak ada di repo.

`match_documents_keyword_ranked` punya fallback di kode kalau RPC-nya hilang;
**`match_documents` dan `match_documents_hybrid` TIDAK** — jalur vector & hybrid langsung mati total.

✅ Sudah diamankan: **[`sql/functions_backup_prod.sql`](../sql/functions_backup_prod.sql)** berisi 13
definisi fungsi + 24 GRANT, diambil dari produksi. Kalau restore gagal atau ada fungsi yang tidak
terbawa, jalankan file itu — aman diulang.

⚠️ **Ambil dump SETELAH** migration di `supabase/migrations/*.sql` sudah dijalankan di cloud, kalau
tidak server baru membawa formula skoring lama dan mutu pencarian mundur.

### 4.1 Setup Server Dasar

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw postgresql-client nano

sudo ufw allow OpenSSH
sudo ufw enable

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# logout, login lagi biar grup docker kepakai
```

### 4.2 Install Supabase Self-Hosted

```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

⚠️ **WAJIB untuk production:** generate `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`,
`POSTGRES_PASSWORD` yang baru & random. JANGAN pakai nilai default `.env.example` — itu publik di
GitHub Supabase.

```bash
docker compose up -d
docker compose ps   # semua harus "Healthy"/"Started"
```

### 4.3 Aktifkan Extension SEBELUM Restore

⚠️ Kalau extension diaktifkan SETELAH restore, tabel `documents` gagal terbentuk (kolom
`embedding vector(3072)` butuh extension `vector` sudah ada duluan).

```bash
docker compose exec db psql -U postgres -d postgres -c "
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"

# Verifikasi — harus keluar 4 baris
docker compose exec db psql -U postgres -d postgres -c "
SELECT extname, extversion FROM pg_extension
WHERE extname IN ('vector','pg_trgm','pgcrypto','uuid-ossp');"
```

⚠️ **Versi `vector` harus ≥ 0.8.0** (produksi memakai 0.8.0). Versi lebih tua bisa menolak
`vector(3072)`.

Produksi memakai 7 extension: `vector` 0.8.0 · `pg_trgm` 1.6 · `pgcrypto` 1.3 · `uuid-ossp` 1.1 ·
`plpgsql` · `supabase_vault` · `pg_stat_statements`. Tiga terakhir bawaan stack Supabase.

### 4.4 Dump Data dari Supabase Cloud

Ambil connection string **Session Pooler** (bukan Direct Connection) dari Dashboard → Project
Settings → Database → Connection Pooling → Session mode. Direct connection gagal karena server
biasanya tidak punya jalur outbound IPv6.

```bash
export PGPASSWORD='<password_database_supabase>'

pg_dump -h <host-pooler>.pooler.supabase.com -p 5432 -U postgres.ipoxxshvtkragylisogv -d postgres \
  --schema=public --no-owner -f full_migration.sql

pg_dump -h <host-pooler>.pooler.supabase.com -p 5432 -U postgres.ipoxxshvtkragylisogv -d postgres \
  --schema=auth --no-owner -f auth_migration.sql

unset PGPASSWORD
```

⚠️ **`--no-privileges` sengaja DIHILANGKAN** dari perintah di atas (rehearsal 13 Agu memakainya).
Alasannya: PostgreSQL memberi `EXECUTE` ke `PUBLIC` secara default pada fungsi baru, dan
`--no-privileges` membuang semua `REVOKE`/`GRANT`. Akibatnya tiga fungsi `SECURITY DEFINER` yang di
cloud dikunci hanya untuk `service_role` bisa jadi **dapat dipanggil siapa saja** — termasuk `anon`,
yang kuncinya ada di bundle JS publik:

| Fungsi | Kalau terbuka |
|---|---|
| `get_dashboard_snapshot` | dashboard biaya & monitoring terbuka |
| `get_auth_email_by_real_email` | **enumerasi email karyawan** |
| `ingest_field_note_document` | siapa pun bisa menyuntik knowledge base |

Tanpa `--no-privileges`, GRANT ikut terbawa. Error `role does not exist` yang mungkin muncul aman
diabaikan (role Supabase sudah ada di self-host). Kalau tetap ingin memakainya, **wajib** jalankan
`sql/functions_backup_prod.sql` sesudah restore — file itu memuat blok REVOKE/GRANT yang benar.

### 4.5 Restore Schema `public`

```bash
docker compose exec -T db psql -U postgres -d postgres < full_migration.sql
```

Error yang WAJAR dan aman diabaikan:
- `schema "public" already exists` — normal.
- `insert or update on table "bookmarks" violates foreign key constraint` — karena `auth.users` belum
  direstore; beres sendiri setelah §4.6.

### 4.6 Restore Auth — `auth.users` dan `auth.identities` SAJA

⚠️ Schema `auth` di self-hosted dimiliki role `supabase_auth_admin`, bukan `postgres`, jadi restore
penuh 22 tabel `auth.*` menghasilkan banyak error "permission denied" — **aman diabaikan**, struktur
tabelnya sudah dibuat GoTrue saat container nyala. Yang penting cuma **datanya**, dan hanya 2 tabel:

- `auth.users` — akun & password hash (bcrypt, langsung kepakai tanpa reset)
- `auth.identities` — jembatan user ke provider "email", **wajib ada** atau user tidak bisa login
  walau muncul di Studio

Tabel lain (`sessions`, `refresh_tokens`, `mfa_*`, `sso_*`, `saml_*`, `oauth_*`, `audit_log_entries`)
tidak perlu — teknisi cukup login ulang.

```bash
docker compose exec -T db psql -U postgres -d postgres < auth_migration.sql

docker compose exec db psql -U postgres -d postgres -c "SELECT COUNT(*) FROM auth.users;"
docker compose exec db psql -U postgres -d postgres -c "SELECT COUNT(*) FROM auth.identities;"
```

**Kalau `auth.identities` = 0** (urutan COPY di dump menyisipkan identities sebelum users selesai):

```bash
awk '/^COPY auth\.identities /,/^\\\.$/' auth_migration.sql | docker compose exec -T db psql -U postgres -d postgres
docker compose exec db psql -U postgres -d postgres -c "SELECT COUNT(*) FROM auth.identities;"
```

Angka `auth.identities` harus sama dengan `auth.users`.

---

## 5. 🚦 GERBANG VERIFIKASI — jangan lanjut sebelum semua hijau

Jumlah baris cocok **tidak membuktikan aplikasinya jalan**. Lima cek di bawah menangkap kegagalan
yang tidak terlihat dari hitungan baris.

### 5.1 Row count — acuan per 15 Agustus 2026

```bash
docker compose exec db psql -U postgres -d postgres -c "
SELECT 'documents' t, COUNT(*) FROM documents
UNION ALL SELECT 'usage_logs', COUNT(*) FROM usage_logs
UNION ALL SELECT 'chat_sessions', COUNT(*) FROM chat_sessions
UNION ALL SELECT 'user_niks', COUNT(*) FROM user_niks
UNION ALL SELECT 'message_feedback', COUNT(*) FROM message_feedback
UNION ALL SELECT 'bookmarks', COUNT(*) FROM bookmarks
UNION ALL SELECT 'field_notes', COUNT(*) FROM field_notes
UNION ALL SELECT 'auth.users', COUNT(*) FROM auth.users
UNION ALL SELECT 'auth.identities', COUNT(*) FROM auth.identities ORDER BY 1;"
```

| Tabel | Baris | | Tabel | Baris |
|---|---|---|---|---|
| `documents` | **4709** | | `message_feedback` | **16** |
| `usage_logs` | **1347** | | `auth.users` | **16** |
| `chat_sessions` | **306** | | `auth.identities` | **16** |
| `user_niks` | **17** | | `bookmarks` | **1** |
| | | | `field_notes` | **0** |

`auth.users` 16 vs `user_niks` 17 ✅ **normal** — 1 NIK terdaftar tapi orangnya belum pernah login.

### 5.2 View & RLS policy — tidak terlihat dari row count

```bash
docker compose exec db psql -U postgres -d postgres -c "
SELECT count(*) AS jml_view FROM information_schema.views WHERE table_schema='public';
SELECT tablename, count(*) AS policy FROM pg_policies WHERE schemaname='public' GROUP BY 1 ORDER BY 1;"
```

**7 view harus ada:** `documents_summary` · `parts_catalog_view` · `v_message_feedback` ·
`v_usage` · `v_usage_by_model` · `v_usage_by_user` · `v_usage_daily`
Empat `v_usage*` menopang panel monitoring — kalau gagal terbentuk, dashboard rusak sementara data
mentahnya utuh.

**17 policy:** `bookmarks` 4 · `chat_sessions` 4 · `documents` 1 · `field_notes` 3 ·
`message_feedback` 3 · `usage_logs` 2 · `user_niks` **0**

⚠️ `user_niks` RLS **aktif tapi nol policy** — itu **disengaja** (pagar anti-enumerasi NIK; hanya
`service_role` dan fungsi SECURITY DEFINER yang boleh menyentuhnya). Jangan dikira bug lalu ditambahi
policy.

### 5.3 Hak akses fungsi — cek keamanan

```bash
docker compose exec db psql -U postgres -d postgres -c "
SELECT p.proname, string_agg(DISTINCT a.grantee, ', ') AS boleh_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
LEFT JOIN information_schema.role_routine_grants a
  ON a.routine_name=p.proname AND a.routine_schema='public'
 AND a.grantee IN ('anon','authenticated','service_role')
WHERE n.nspname='public'
  AND p.proname IN ('get_dashboard_snapshot','get_auth_email_by_real_email',
                    'ingest_field_note_document','resolve_auth_email')
GROUP BY p.proname;"
```

Harus:

| Fungsi | Boleh EXECUTE |
|---|---|
| `get_dashboard_snapshot` | `service_role` **saja** |
| `get_auth_email_by_real_email` | `service_role` **saja** |
| `ingest_field_note_document` | `service_role` **saja** |
| `resolve_auth_email` | `anon`, `authenticated`, `service_role` |

Kalau tiga yang pertama muncul `anon`/`authenticated`, jalankan
`sql/functions_backup_prod.sql` untuk mengunci ulang.

⚠️ `resolve_auth_email` **wajib** punya `anon` — fungsi ini dipanggil **sebelum login**
(`src/components/AuthProvider.tsx`). Kalau hilang, **tidak ada teknisi yang bisa login**, dan
gejalanya bukan error jelas melainkan fallback diam-diam ke `h<nik>@dash5.internal`.

### 5.4 GRANT tabel

```bash
docker compose exec db psql -U postgres -d postgres -c "
SELECT table_name, grantee, string_agg(DISTINCT privilege_type, ',') AS hak
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role')
GROUP BY 1,2 ORDER BY 1,2;"
```

⚠️ `user_niks` memang **TIDAK** punya `SELECT` untuk `anon`/`authenticated` — pagar anti-enumerasi.
Jangan "diperbaiki".

### 5.5 Trigger & fungsi

```bash
docker compose exec db psql -U postgres -d postgres -c "
SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers WHERE trigger_schema='public';"
```

Harus **2 baris**: `documents_strip_metadata` untuk **BEFORE INSERT** dan **BEFORE UPDATE**.
Tanpa ini, ingest berikutnya menyimpan metadata liar dan memecah filter `Model`/`Kategori`.

**13 fungsi buatan sendiri** harus ada:
`match_documents` · `match_documents_v2` · `match_documents_exact` · `match_documents_hybrid` ·
`match_documents_keyword_ranked` · `search_parts_exact` · `search_parts_by_name` ·
`extract_part_field` · `resolve_auth_email` · `get_auth_email_by_real_email` ·
`get_dashboard_snapshot` · `ingest_field_note_document` · `strip_metadata_extras`

---

## 6. Setelah Restore — Sambungkan Aplikasi

### 6.1 Cloudflare Tunnel

```bash
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install cloudflared

cloudflared tunnel login
cloudflared tunnel create dash5-hexindo
```

`~/.cloudflared/config.yml`:
```yaml
tunnel: <TUNNEL-ID>
credentials-file: /root/.cloudflared/<TUNNEL-ID>.json
ingress:
  - hostname: db.dash5.my.id       # atau subdomain final dari IT
    service: http://localhost:8000
  - hostname: studio.dash5.my.id   # WAJIB diproteksi Cloudflare Access
    service: http://localhost:3000
  - service: http_status:404
```

```bash
cloudflared tunnel route dns dash5-hexindo db.dash5.my.id
cloudflared tunnel route dns dash5-hexindo studio.dash5.my.id
sudo cloudflared service install && sudo systemctl enable --now cloudflared
```

⚠️ Subdomain Studio **wajib** diproteksi Cloudflare Access — itu pintu langsung ke seluruh database.

### 6.2 Frontend (Cloudflare Workers)

```
VITE_SUPABASE_URL=<URL baru>
VITE_SUPABASE_ANON_KEY=<ANON_KEY dari .env server baru>
VITE_SITE_URL=https://dash5.my.id
```

⚠️ Env var ini **di-bake ke bundle JS saat build** — wajib `npm run build` + deploy ulang. Ganti env
saja tidak cukup; bundle lama masih memuat URL & anon key lama.

⚠️ Masukkan `VITE_SITE_URL` ke allowlist **"Redirect URLs"** GoTrue self-hosted, kalau tidak reset
password patah.

✅ **Service worker sudah disiapkan** (`vite.config.ts`, commit `8d6dc8a`): pola cache Supabase
sekarang dicocokkan lewat **pola path** (`/rest/v1`, `/auth/v1`, `/storage/v1`, `/realtime/v1`),
bukan nama host. Jadi otomatis benar untuk domain apa pun yang dipilih IT — subdomain, domain lain,
maupun path di domain yang sama. Tidak perlu diubah saat cutover.

### 6.3 Backend Proxy (Cloud Run `dash5-vertexai-proxy`)

```bash
gcloud run services update dash5-vertexai-proxy \
  --region=us-central1 --project=project-1acf3a67-7f0a-48a3-822 \
  --update-env-vars SUPABASE_URL=<URL baru>,SUPABASE_ANON_KEY=<anon baru>,SUPABASE_SERVICE_KEY=<service_role baru>
```

⚠️ **JANGAN `--set-env-vars`** — itu menghapus semua env var lain (pernah kejadian, service mati total).

✅ **Nama env var sudah aman** (commit `8d6dc8a`): `server.js` menerima **`SUPABASE_SERVICE_KEY`
maupun `SUPABASE_SERVICE_ROLE_KEY`**. Sebelumnya hanya nama pertama yang dikenali — salah menamai
membuat tiga endpoint mati **diam-diam**: `/v1/dashboard` (panel kosong), `/v1/usage` (**ledger biaya
berhenti mencatat**), `/v1/field-note`.

---

## 7. Verifikasi END-TO-END di Aplikasi

Ini pembuktian sesungguhnya — bukan hitungan baris.

| # | Uji | Membuktikan |
|---|---|---|
| 1 | **Login dengan NIK** | `resolve_auth_email` + grant `anon` + `auth.identities` |
| 2 | Tanya **`berapa kapasitas oli mesin`** (ZX200-5G) → harus **25 L** | `match_documents_keyword_ranked` versi baru, `match_documents`, extension `vector`+`pg_trgm`, RLS `documents`, grant `authenticated` — sekali jalan |
| 3 | Tanya **`13006-2`** | jalur fault code (ILIKE + index trgm) |
| 4 | Cek **riwayat chat tersimpan** | RLS `chat_sessions` + `auth.uid()` |
| 5 | Buka **panel Monitoring** sebagai admin | view `v_usage*` + `get_dashboard_snapshot` + env service key |
| 6 | Kirim satu **catatan lapangan** | `ingest_field_note_document` + service key |
| 7 | Jalankan **[`supabase/tests/retrieval_harness.sql`](tests/retrieval_harness.sql)** | **18/18 harus lolos** |

Nomor 7 adalah pembuktian terkuat bahwa migrasi **tidak menurunkan mutu jawaban** — 18 pertanyaan
yang jawabannya sudah diverifikasi ada di database.

⚠️ **Semua teknisi harus login ulang.** Anon key baru ditandatangani JWT secret berbeda, jadi sesi
lama di `localStorage` invalid. Gejalanya **401**, bukan pesan konfigurasi — beri tahu teknisi
sebelum cutover supaya tidak dikira aplikasi rusak.

---

## 8. Okta / SSO — KOREKSI PENTING

Rencana awal menyebut minta "**Client ID, Client Secret, redirect URI**" (itu **OIDC**) lalu "ganti
penerbit token dari GoTrue ke Okta". **Dua-duanya keliru:**

**1. GoTrue tidak menerima OIDC generik.** Untuk IdP korporat yang didukung adalah **SAML 2.0**
(`GOTRUE_SAML_ENABLED`). Kalau IT hanya menyiapkan OIDC app, jalur ini buntu dan baru ketahuan di
akhir. **Minta SAML 2.0 + metadata URL**, bukan client secret.

**2. "Ganti penerbit token ke Okta" membongkar RLS.** Seluruh 17 policy bergantung pada `auth.uid()`
dari JWT terbitan GoTrue. Kalau Okta menerbitkan token langsung, `auth.uid()` kosong dan semua
kepemilikan data putus. Yang benar: **Okta jadi IdP, GoTrue tetap penerbit token** — hanya cara
login yang berubah, sisanya tidak tersentuh.

**Kabar baik:** SAML SSO **gratis di self-host** (berbayar di Supabase Cloud). Jadi urutan
"pindah dulu, Okta belakangan" memang tepat — dan **jangan naikkan paket cloud**, itu akan terbuang.

**Yang dikirim ke IT untuk bikin app Okta:**

| Field di Okta | Nilai |
|---|---|
| Single sign-on URL (ACS) | `https://<domain-supabase-baru>/auth/v1/sso/saml/acs` |
| Audience URI (Entity ID) | `https://<domain-supabase-baru>/auth/v1/sso/saml/metadata` |
| Default RelayState | `https://dash5.my.id` |
| Name ID format | `EmailAddress` |

**Yang diminta balik:** metadata URL · domain email resmi · attribute `email`, `displayName`, dan
**`employeeNumber` (NIK)** · grup yang di-assign · satu akun tes.

⚠️ **Uji pertama harus dari PWA terpasang di HP Android**, bukan desktop. SSO berbasis redirect
keluar aplikasi; di PWA standalone (tanpa address bar) redirect ke Okta lalu balik sering nyasar ke
browser terpisah dan sesinya tidak kembali. **Teknisi memakai Dash⁵ persis dalam mode itu.**

⚠️ **Ganti `ADMIN_EMAILS` di Cloud Run SEBELUM cutover Okta**, dan isi **dua-duanya** selama transisi
(email lama + email Okta). Kalau langsung diganti dan Okta bermasalah, kamu terkunci dari panel
monitoring sendiri.

---

## 9. Strategi Testing & Cutover

**Prinsip:** `pg_dump` itu read-only — Supabase cloud tetap hidup dan dipakai teknisi selama proses ini.

### ⚠️ Staging butuh Cloud Run KEDUA — kalau tidak, chat tak bisa diuji

Proxy Cloud Run cuma **satu** dan dipakai produksi. `verifyToken` di `server.js` memvalidasi token ke
`SUPABASE_URL` miliknya sendiri. Jadi kalau frontend staging (pakai Supabase baru) memanggil proxy
produksi (masih menunjuk Supabase lama), **setiap token ditolak 401** dan chat mati.

Tanpa proxy kedua, yang bisa diuji di staging **hanya** §7 nomor 1–4 (login, search, riwayat chat —
semuanya memanggil Supabase langsung dari browser). Nomor 5–6 **dan chat itu sendiri** lewat proxy,
jadi tidak teruji sama sekali — padahal chat adalah inti aplikasinya.

**Deploy proxy staging** (sekali jalan, hapus setelah cutover):

```bash
cd ~/dash5
gcloud run deploy dash5-proxy-staging \
  --source=cloudrun --region=us-central1 \
  --project=project-1acf3a67-7f0a-48a3-822 --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT=project-1acf3a67-7f0a-48a3-822,\
SUPABASE_URL=<URL-supabase-baru>,SUPABASE_ANON_KEY=<anon-baru>,SUPABASE_SERVICE_KEY=<service-role-baru>,\
COHERE_API_KEY=<sama-dgn-produksi>,ALLOWED_ORIGIN=https://staging.dash5.my.id
```

⚠️ Di sini `--set-env-vars` **memang benar** — service baru, masih kosong. Untuk service produksi
tetap `--update-env-vars`.

⚠️ `ALLOWED_ORIGIN` **wajib** diisi origin staging, kalau tidak CORS menolak semua request.

Lalu build frontend staging dengan proxy itu (bukan `/api`):

```bash
VITE_SUPABASE_URL=<URL-supabase-baru> \
VITE_SUPABASE_ANON_KEY=<anon-baru> \
VITE_VERTEX_PROXY_URL=https://dash5-proxy-staging-xxxx.us-central1.run.app \
VITE_SITE_URL=https://staging.dash5.my.id \
npm run build
```

Produksi **tidak tersentuh sama sekali** selama ini: Supabase cloud, Cloud Run produksi, dan
`dash5.my.id` semuanya jalan seperti biasa.

### Urutan

1. Deploy **proxy staging** + build frontend staging → `staging.dash5.my.id`.
2. Test sendiri — §7 nomor **1–7 lengkap**.
3. Kalau yakin, ajak 1-2 teknisi coba di staging.
4. Setelah stabil beberapa hari → **cutover produksi**: update env Cloud Run produksi
   (`--update-env-vars`), build ulang frontend produksi, deploy.
5. **Supabase cloud standby 1-2 minggu** sebagai jalur mundur. Jangan hapus.
6. Hapus `dash5-proxy-staging` setelah cutover mulus.
7. Setelah stabil 1-2 minggu, **baru** Okta (§8).

---

## 10. Perbandingan

| Item | Supabase Free (sekarang) | Server Hexindo |
|---|---|---|
| Database storage | 500 MB (terpakai **98 MB**) | ~30-35 GB usable |
| RAM | 500 MB shared | 8 GB dedicated |
| Auto-pause 7 hari | Ya — risiko downtime | Tidak, 24/7 |
| Backup | Tidak ada | **Diatur sendiri** (`pg_dump` cron, simpan di luar server) |
| Lokasi data | Luar negeri | Fisik di Hexindo, Indonesia |
| SAML SSO | Berbayar | **Gratis** |
| Maintenance | Ditangani Supabase | **Tanggung jawab sendiri** |

⚠️ **Backup jadi urusan sendiri.** Ini konsekuensi terbesar. Pasang cron `pg_dump` + simpan salinan
**di luar server** sejak hari pertama — kalau server mati tanpa backup, 4.709 chunk hasil ingest
berbulan-bulan hilang.

---

## 11. Peluang: migrasi ini mungkin MEMPERCEPAT Dash⁵

Diukur 15 Agu 2026: query `documents` dieksekusi database dalam **25–240 ms**, tapi tercatat
**1,4–1,7 detik** di browser. Selisih ~1,5 detik itu murni round-trip **Sampit → Singapura**, dan
browser memanggil Supabase **langsung**.

Server di Indonesia bisa memangkas sebagian besar dari itu — **penghematan latensi terbesar yang
tersisa**, lebih besar dari seluruh penyetelan retrieval yang sudah dilakukan.

**Cara mengukur sesudah cutover:** DevTools → Network, bandingkan waktu
`match_documents_keyword_ranked` dan `match_documents` sebelum vs sesudah.

⚠️ Cloudflare Tunnel menambah hop. Kalau ternyata **lebih lambat**, pertimbangkan akses langsung via
domain + TLS untuk endpoint database.

---

## 12. Sengaja BELUM Dikerjakan

- **Index HNSW untuk vector search** — benar untuk tidak dipasang. Diukur: vector search 1.259 baris
  = **43 ms**, dan pgvector **tidak bisa** HNSW di 3072 dimensi (batas 2000). Jangan dicoba.
- **Domain final** (`dash5.hexindo.co.id` vs `app.hexindo.co.id/dash5`) — tidak menghambat instalasi.
  Kalau path-based, perlu setting base path di build React.
- **`.vscode/mcp.json`** menunjuk MCP Supabase cloud — tidak akan bekerja untuk self-hosted, ganti ke
  Postgres MCP/psql.
- Dua komentar ter-commit menyebut project ref lama: `sql/get_dashboard_snapshot.sql:5`,
  `sql/message_feedback.sql:2`. Kosmetik.

---

*Rehearsal migrasi penuh: VPS Google Cloud testing, 13 Agustus 2026 — seluruh data (7 tabel schema
public + `auth.users` + `auth.identities`) cocok 100% dengan sumber.
Direvisi 15 Agustus 2026 setelah audit database produksi + penelusuran kode.*
