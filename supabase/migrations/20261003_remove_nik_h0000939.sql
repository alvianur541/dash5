-- Remove NIK H0000939: registered in user_niks but has no matching auth account (never able to log in).
-- No foreign keys reference user_niks. Safe to re-run.
delete from public.user_niks
where nik = 'H0000939'
  and not exists (select 1 from auth.users a where lower(a.email) = lower(user_niks.auth_email));
