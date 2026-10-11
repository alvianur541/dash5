"""SELECT-only adoption source; operational cost/reliability remain separate."""
TZ = "'Asia/Jakarta'"

def policy(columns):
    ready = {'user_id', 'is_internal'} <= set(columns)
    base = "coalesce(user_name,'') <> 'LOADTEST'"
    return {'exclude': base + (' AND is_internal IS FALSE' if ready else ''),
            'include': base,
            'identity': "coalesce(user_id::text, 'legacy:' || user_nik)" if ready else 'user_nik',
            'ready': ready}

def read_adoption(rows):
    columns = {r['column_name'] for r in rows("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='usage_logs' AND column_name IN ('user_id','is_internal')")}
    p = policy(columns)
    variants = {}
    for mode in ('exclude', 'include'):
        where, ident = p[mode], p['identity']
        source = f"(SELECT *, {ident} identity_key FROM public.usage_logs WHERE {where}) a"
        k = rows(f"""SELECT count(*) FILTER(WHERE created_at > now()-interval '7 days') d7,
          count(*) FILTER(WHERE created_at BETWEEN now()-interval '14 days' AND now()-interval '7 days') d7_prev,
          count(*) FILTER(WHERE (created_at AT TIME ZONE {TZ})::date=(now() AT TIME ZONE {TZ})::date) today,
          count(DISTINCT identity_key) FILTER(WHERE created_at > now()-interval '7 days') users7,
          count(DISTINCT identity_key) FILTER(WHERE created_at BETWEEN now()-interval '14 days' AND now()-interval '7 days') users7_prev
          FROM {source}""")
        daily = rows(f"""SELECT to_char(d,'YYYY-MM-DD') d, coalesce(x.n,0) n, coalesce(x.u,0) u, x.names FROM
          generate_series((now() AT TIME ZONE {TZ})::date-13,(now() AT TIME ZONE {TZ})::date,'1 day') d
          LEFT JOIN (SELECT (created_at AT TIME ZONE {TZ})::date dy,count(*) n,count(DISTINCT identity_key) u,
          string_agg(DISTINCT user_name,', ') names FROM {source} WHERE created_at > now()-interval '15 days' GROUP BY 1) x ON x.dy=d ORDER BY d""")
        users = rows(f"""SELECT (array_agg(user_name ORDER BY created_at DESC))[1] k,count(*) n, max(created_at) last
          FROM {source} WHERE identity_key IS NOT NULL AND created_at>now()-interval '7 days' GROUP BY identity_key ORDER BY n DESC,identity_key LIMIT 6""")
        recent = rows(f"""SELECT user_name, model, created_at FROM (SELECT DISTINCT ON (identity_key) user_name,model,created_at
          FROM {source} WHERE identity_key IS NOT NULL ORDER BY identity_key,created_at DESC) r ORDER BY created_at DESC LIMIT 6""")
        units = rows(f"SELECT coalesce(nullif(model,''),'-') k,count(*) n FROM {source} WHERE created_at>now()-interval '30 days' GROUP BY 1 ORDER BY n DESC LIMIT 8")
        unknown = rows(f"SELECT count(*) n FROM public.usage_logs WHERE coalesce(user_name,'') <> 'LOADTEST' AND is_internal IS NULL AND created_at>now()-interval '7 days'") if p['ready'] else []
        variants[mode] = {'kpi': k[0] if k else {}, 'daily': daily, 'days7':daily[-7:], 'users':users,'recent':recent,'units':units,
                          'unknown7':unknown[0]['n'] if unknown else None}
    return {'ready':p['ready'], 'variants':variants,
            'notice':'Internal and unclassified activity excluded by default. Include toggle retains the LOADTEST exclusion. Costs and reliability include internal activity.' if p['ready'] else 'Internal classification unavailable on legacy schema; adoption currently includes unclassified activity. Toggle unavailable. LOADTEST excluded.'}
