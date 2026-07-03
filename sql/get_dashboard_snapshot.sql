-- Monitoring dashboard snapshot (admin-only).
-- Dipanggil oleh Cloud Run GET /v1/dashboard via service_role (RLS bypass).
-- Gate admin ada di server.js (ADMIN_EMAILS) — fungsi ini sengaja di-revoke dari
-- anon & authenticated supaya tidak bisa dipanggil langsung dari client.
-- Sudah di-apply ke Supabase project ipoxxshvtkragylisogv (migration: dashboard_snapshot_fn).

create or replace function public.get_dashboard_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  logs as (select * from usage_logs),
  totals as (
    select
      count(*)::int                                                          as questions,
      count(distinct coalesce(nullif(trim(user_name),''), user_nik))::int    as technicians,
      coalesce(sum(input_tokens + output_tokens),0)::bigint                   as tokens,
      coalesce(sum(cost_idr),0)::numeric                                      as idr,
      coalesce(sum(cost_usd),0)::numeric                                      as usd,
      max(created_at)                                                         as last_at
    from logs
  ),
  today as (
    select
      count(*)::int                                          as questions,
      coalesce(sum(cost_idr),0)::numeric                     as idr,
      coalesce(sum(input_tokens + output_tokens),0)::bigint  as tokens
    from logs
    where (created_at at time zone 'Asia/Jakarta')::date
        = (now() at time zone 'Asia/Jakarta')::date
  ),
  per_user as (
    select
      coalesce(nullif(trim(user_name),''), user_nik, '(tanpa nama)') as teknisi,
      count(*)::int                                as pertanyaan,
      sum(input_tokens + output_tokens)::bigint    as tokens,
      sum(cost_idr)::numeric                        as idr,
      max(created_at)                              as last_at
    from logs group by 1 order by idr desc
  ),
  per_model as (
    select model,
      count(*)::int                              as pertanyaan,
      sum(input_tokens + output_tokens)::bigint  as tokens,
      sum(cost_idr)::numeric                      as idr
    from logs group by 1 order by idr desc
  ),
  per_tool as (
    select tool, count(*)::int as kali
    from logs,
         unnest(case when tools_used is null or array_length(tools_used,1) is null
                     then array['(tanpa tool)'] else tools_used end) as tool
    group by 1 order by kali desc
  ),
  daily as (
    select
      to_char((created_at at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD') as hari,
      count(*)::int                              as pertanyaan,
      sum(input_tokens + output_tokens)::bigint  as tokens,
      sum(cost_idr)::numeric                      as idr
    from logs
    group by (created_at at time zone 'Asia/Jakarta')::date
    order by (created_at at time zone 'Asia/Jakarta')::date desc
    limit 30
  ),
  recent as (
    select
      created_at,
      coalesce(nullif(trim(user_name),''), user_nik, '(tanpa nama)') as teknisi,
      model,
      (input_tokens + output_tokens)::int as tokens,
      llm_calls,
      tools_used,
      cost_idr::numeric as idr
    from logs order by created_at desc limit 15
  ),
  census as (
    select
      (select count(*) from documents)::int                              as docs,
      (select count(distinct metadata->>'Model') from documents)::int    as models,
      (select count(*) from chat_sessions)::int                          as sessions,
      (select count(distinct user_id) from chat_sessions)::int           as session_users,
      (select count(*) from user_niks)::int                              as niks
  )
  select jsonb_build_object(
    'generated_at', now(),
    'totals',    (select row_to_json(t) from totals t),
    'today',     (select row_to_json(t) from today t),
    'per_user',  coalesce((select jsonb_agg(row_to_json(p)) from per_user  p), '[]'::jsonb),
    'per_model', coalesce((select jsonb_agg(row_to_json(p)) from per_model p), '[]'::jsonb),
    'per_tool',  coalesce((select jsonb_agg(row_to_json(p)) from per_tool  p), '[]'::jsonb),
    'daily',     coalesce((select jsonb_agg(row_to_json(d)) from daily     d), '[]'::jsonb),
    'recent',    coalesce((select jsonb_agg(row_to_json(r)) from recent    r), '[]'::jsonb),
    'census',    (select row_to_json(c) from census c)
  );
$$;

revoke all on function public.get_dashboard_snapshot() from public, anon, authenticated;
grant execute on function public.get_dashboard_snapshot() to service_role;
