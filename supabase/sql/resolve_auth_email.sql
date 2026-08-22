-- Tutup enumerasi NIK ↔ email lewat anon key (temuan audit, Agu 2026).
--
-- MASALAH
-- Policy lama `Public can read NIK lookup` = FOR SELECT TO public USING (true),
-- plus GRANT SELECT ke anon. Anon key ada di JS bundle (memang publik), jadi siapa
-- pun tanpa login bisa dump SELURUH user_niks: daftar lengkap NIK yang valid untuk
-- login + email admin (satu-satunya baris non-@dash5.internal). Itu bahan matang
-- untuk password spraying, apalagi leaked-password-protection Supabase masih off.
--
-- KENAPA TIDAK BISA SEKADAR DI-REVOKE
-- AuthProvider.resolveAuthEmail() membaca tabel ini SEBELUM login untuk menerjemahkan
-- NIK → auth_email. Kalau aksesnya ditutup tanpa pengganti, login NIK mati.
-- Penggantinya: RPC yang hanya bisa menjawab SATU NIK yang sudah diketahui penanya —
-- tidak bisa dipakai mengunduh daftarnya.
--
-- URUTAN APPLY — WAJIB DUA FASE.
-- FASE 2 mengunci tabel; kalau dijalankan sebelum frontend baru live, akun yang
-- auth_email-nya TIDAK berpola <nik>@dash5.internal (yaitu akun admin) tidak bisa
-- login, karena frontend lama jatuh ke fallback pola tersebut.

-- ── FASE 1 — aman, aditif, jalankan kapan saja (SUDAH DI-APPLY) ──────────────
-- Hanya menambah RPC. Tabel masih terbaca seperti sebelumnya, jadi frontend lama
-- maupun baru sama-sama jalan. Ini yang bikin FASE 2 bisa dilakukan tanpa downtime.

create or replace function public.resolve_auth_email(p_nik text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select auth_email
  from public.user_niks
  where nik = upper(trim(p_nik))
  limit 1;
$$;

comment on function public.resolve_auth_email(text) is
  'Login NIK: terjemahkan satu NIK jadi auth_email. Sengaja SECURITY DEFINER + '
  'akses tabel langsung dicabut, supaya anon bisa me-resolve NIK yang sudah '
  'diketahuinya tapi tidak bisa meng-enumerasi seluruh daftar.';

revoke all on function public.resolve_auth_email(text) from public;
grant execute on function public.resolve_auth_email(text) to anon, authenticated;

-- ── FASE 2 — MEMUTUS. Jalankan HANYA setelah frontend baru ter-deploy ────────
-- Verifikasi dulu: login pakai NIK admin di build baru harus berhasil.
-- Lalu jalankan blok di bawah (hapus komentarnya).
--
-- drop policy if exists "Public can read NIK lookup" on public.user_niks;
-- revoke select on public.user_niks from anon, authenticated;
--
-- Catatan: /v1/field-note di Cloud Run membaca user_niks pakai service_role,
-- yang bypass RLS dan punya grant sendiri — tidak terpengaruh revoke ini.
--
-- Uji balik setelah FASE 2 (harus 0 baris, bukan 17):
--   set local role anon; select count(*) from public.user_niks;
-- dan RPC harus tetap menjawab:
--   set local role anon; select public.resolve_auth_email('H0001846') is not null;
