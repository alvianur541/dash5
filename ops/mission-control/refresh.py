#!/usr/bin/env python3
"""Dash5 Mission Control: reads live sources -> dashboard.json -> index.html (self-contained).
Failed reads keep last-known-good values and are marked stale. Supabase access is SELECT-only via sbq.py."""
import re, json, subprocess, time, datetime, html, os, urllib.request, urllib.parse
from adoption import read_adoption

D = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(D, "dashboard.json")
PROJECT = "project-85bfc388-3106-4361-a9f"
REGION = "asia-southeast1"
SVC = "dash5-vertexai-proxy"
SBQ = os.path.expanduser("~/notes/dash5/sbq.py")
now = datetime.datetime.now(datetime.timezone.utc)
WIB = datetime.timezone(datetime.timedelta(hours=7))
TZ = "'Asia/Jakarta'"
# Backend priced Gemini at flash-lite rates (Rp16.300/$) before revision 00104 (2026-10-04 10:49Z).
# Older rows are scaled by 3.376 = Cloud Billing Gemini list cost / logged cost for 2026-10-03 (Pacific day).
COST_FIX = "(case when created_at < '2026-10-04 10:49:20+00' then cost_idr*3.376 else cost_idr end)"


def sh(cmd, timeout=90):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode:
        raise RuntimeError((r.stderr or r.stdout)[:200])
    return r.stdout


def get(url, headers=None):
    h = {"User-Agent": "curl/8.0"} | (headers or {})
    return urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=20)


def sb(q):
    return json.loads(sh(["python3", SBQ, q]))


def num(x):
    if isinstance(x, (dict, list, bool)) or x is None:
        return x
    try:
        f = float(x)
        return int(f) if f.is_integer() else round(f, 1)
    except (TypeError, ValueError):
        return x


def rows(q):
    return [{k: num(v) for k, v in r.items()} for r in sb(q)]


# ---------------- sources ----------------
def read_metrics():
    return json.load(get("https://dash5.my.id/api/metrics"))


def read_front():
    t = time.time()
    code = get("https://dash5.my.id/").status
    return {"http": code, "ms": round((time.time() - t) * 1000)}


def read_usage():
    k = rows(f"""select
      count(*) filter (where (created_at at time zone {TZ})::date = (now() at time zone {TZ})::date) today,
      count(*) filter (where created_at > now()-interval '24 hours') h24,
      count(*) filter (where created_at > now()-interval '7 days') d7,
      count(*) total,
      count(distinct user_name) filter (where created_at > now()-interval '24 hours') users24,
      count(distinct user_name) filter (where created_at > now()-interval '7 days') users7,
      count(distinct user_name) users_all,
      coalesce(sum((case when created_at < '2026-10-04 10:49:20+00' then cost_idr*3.376 else cost_idr end)) filter (where created_at > now()-interval '24 hours'),0) cost24,
      coalesce(sum((case when created_at < '2026-10-04 10:49:20+00' then cost_idr*3.376 else cost_idr end)) filter (where created_at > now()-interval '7 days'),0) cost7,
      coalesce(sum((case when created_at < '2026-10-04 10:49:20+00' then cost_idr*3.376 else cost_idr end)) filter (where created_at > now()-interval '30 days'),0) cost30,
      coalesce(sum((case when created_at < '2026-10-04 10:49:20+00' then cost_idr*3.376 else cost_idr end)) filter (where (created_at at time zone {TZ})::date >= date_trunc('month', now() at time zone {TZ})::date),0) cost_mtd,
      coalesce(sum((case when created_at < '2026-10-04 10:49:20+00' then cost_idr*3.376 else cost_idr end)) filter (where (created_at at time zone {TZ})::date >= (date_trunc('month', now() at time zone {TZ}) - interval '1 month')::date and (created_at at time zone {TZ})::date < date_trunc('month', now() at time zone {TZ})::date),0) cost_prev_m,
      count(*) filter (where (created_at at time zone {TZ})::date >= date_trunc('month', now() at time zone {TZ})::date) q_mtd,
      count(*) filter (where (created_at at time zone {TZ})::date >= (date_trunc('month', now() at time zone {TZ}) - interval '1 month')::date and (created_at at time zone {TZ})::date < date_trunc('month', now() at time zone {TZ})::date) q_prev_m,
      coalesce(sum(total_tokens) filter (where created_at > now()-interval '24 hours'),0) tok24,
      percentile_cont(0.5) within group (order by ttft_ms) filter (where created_at > now()-interval '7 days') ttft50,
      percentile_cont(0.9) within group (order by ttft_ms) filter (where created_at > now()-interval '7 days') ttft90,
      percentile_cont(0.5) within group (order by total_ms) filter (where created_at > now()-interval '7 days') tot50,
      percentile_cont(0.9) within group (order by total_ms) filter (where created_at > now()-interval '7 days') tot90,
      count(*) filter (where fallback_to is not null and created_at > now()-interval '7 days') fb7,
      count(*) filter (where ttft_ms > 15000 and created_at > now()-interval '7 days') slow7,
      count(*) filter (where degraded is true and created_at > now()-interval '7 days') deg7,
      max(created_at) last_at,
      count(*) filter (where created_at between now()-interval '14 days' and now()-interval '7 days') d7_prev,
      count(distinct user_name) filter (where created_at between now()-interval '14 days' and now()-interval '7 days') users7_prev,
      percentile_cont(0.5) within group (order by ttft_ms) filter (where created_at between now()-interval '14 days' and now()-interval '7 days') ttft50_prev,
      coalesce(sum((case when created_at < '2026-10-04 10:49:20+00' then cost_idr*3.376 else cost_idr end)) filter (where created_at between now()-interval '14 days' and now()-interval '7 days'),0) cost7_prev
      from (select * from usage_logs where coalesce(user_name,'') <> 'LOADTEST') usage_logs""")[0]
    daily = rows(f"""select to_char(d,'MM-DD') d, coalesce(n,0) n, coalesce(u,0) u, coalesce(c,0) c, coalesce(t,0) t from
      generate_series((now() at time zone {TZ})::date - 13, (now() at time zone {TZ})::date, '1 day') d
      left join (select (created_at at time zone {TZ})::date dy, count(*) n, count(distinct user_name) u,
        sum((case when created_at < '2026-10-04 10:49:20+00' then cost_idr*3.376 else cost_idr end)) c, percentile_cont(0.5) within group (order by ttft_ms) t
        from (select * from usage_logs where coalesce(user_name,'') <> 'LOADTEST') usage_logs where created_at > now()-interval '15 days' group by 1) x on x.dy=d order by d""")
    hourly = rows(f"""select extract(hour from created_at at time zone {TZ})::int h, count(*) n from (select * from usage_logs where coalesce(user_name,'') <> 'LOADTEST') usage_logs
      where created_at > now()-interval '7 days' group by 1 order by 1""")
    routes = rows("select coalesce(route,'-') k, count(*) n from (select * from usage_logs where coalesce(user_name,'') <> 'LOADTEST') usage_logs where created_at > now()-interval '7 days' group by 1 order by 2 desc limit 7")
    conf = rows("select coalesce(confidence,'-') k, count(*) n from (select * from usage_logs where coalesce(user_name,'') <> 'LOADTEST') usage_logs where created_at > now()-interval '7 days' and route='rag_found' group by 1 order by 2 desc")
    rel = rows("""select case when fallback_to is not null or coalesce(degraded,false) then 'backup' when coalesce(ttft_ms,0) > 15000 then 'slow' else 'smooth' end k, count(*) n
      from usage_logs where coalesce(user_name,'') <> 'LOADTEST' and created_at > now()-interval '7 days' group by 1""")
    ragmix = rows("select coalesce(route,'-') r, coalesce(confidence,'-') k, count(*) n from (select * from usage_logs where coalesce(user_name,'') <> 'LOADTEST') usage_logs where created_at > now()-interval '7 days' group by 1,2")
    models = rows("select coalesce(model_ai,'-') k, count(*) n from (select * from usage_logs where coalesce(user_name,'') <> 'LOADTEST') usage_logs where created_at > now()-interval '7 days' group by 1 order by 2 desc limit 5")
    users = rows("""select u.*, s.title, s.model from (select coalesce(user_name,'-') k, count(*) n, round(sum((case when created_at < '2026-10-04 10:49:20+00' then cost_idr*3.376 else cost_idr end))) c, max(created_at) last
      from (select * from usage_logs where coalesce(user_name,'') <> 'LOADTEST') usage_logs where created_at > now()-interval '7 days' group by 1) u
      left join lateral (select title, model from chat_sessions where user_name=u.k and deleted_at is null order by created_at desc limit 1) s on true
      order by u.n desc limit 6""")
    k["loadtest24"] = rows("select count(*) n from public.usage_logs where user_name='LOADTEST' and created_at > now()-interval '24 hours'")[0]["n"]
    return {"kpi": k, "daily": daily, "hourly": hourly, "routes": routes, "ragmix": ragmix, "rel": rel, "conf": conf, "models": models, "users": users}


def read_content():
    s = rows("""select count(*) filter (where deleted_at is null) total,
      count(*) filter (where deleted_at is null and created_at > now()-interval '7 days') d7,
      count(*) filter (where deleted_at is null and created_at > now()-interval '24 hours') h24 from chat_sessions""")[0]
    units = rows("""select coalesce(nullif(model,''),'-') k, count(*) n from chat_sessions
      where deleted_at is null and created_at > now()-interval '30 days' group by 1 order by 2 desc limit 8""")
    # One row per technician, latest question (usage_logs), so deleted chats still count as activity.
    recent = rows("""select distinct on (u.user_nik) coalesce(
        (select c.user_name from chat_sessions c where c.user_id::text in (select id::text from auth.users where email like u.user_nik||'@%') order by c.created_at desc limit 1),
        u.user_name) user_name, u.model, u.created_at
      from usage_logs u where u.user_nik is not null and u.user_name <> 'LOADTEST'
      order by u.user_nik, u.created_at desc""")
    recent.sort(key=lambda r: r["created_at"], reverse=True)
    fb = rows("""select count(*) filter (where rating='up') up, count(*) filter (where rating='down') down,
      count(*) filter (where created_at > now()-interval '30 days') d30 from message_feedback""")[0]
    bad = rows("select question, model, created_at from message_feedback where rating='down' order by created_at desc limit 4")
    reg = rows("select count(*) n from user_niks")[0]["n"]
    docs = rows("select count(*) total, count(distinct metadata->>'Model') units from documents")[0]
    cats = rows("select coalesce(metadata->>'Kategori','-') k, count(*) n from documents group by 1 order by 2 desc limit 6")
    # Per-day detail for the stat-card popups (last 7 WIB days, LOADTEST excluded).
    days7 = rows(f"""select to_char(d,'YYYY-MM-DD') d, coalesce(x.n,0) n, coalesce(x.u,0) u, x.names, x.t50, x.t90, x.tavg, x.tmax, coalesce(x.c,0) c,
        coalesce(f.up,0) up, coalesce(f.down,0) down from
      generate_series((now() at time zone {TZ})::date - 6, (now() at time zone {TZ})::date, '1 day') d
      left join (select (created_at at time zone {TZ})::date dy, count(*) n, count(distinct user_nik) u,
          string_agg(distinct user_name, ', ') names,
          percentile_cont(0.5) within group (order by ttft_ms) t50, percentile_cont(0.9) within group (order by ttft_ms) t90,
          avg(ttft_ms) tavg, max(ttft_ms) tmax,
          round(sum((case when created_at < '2026-10-04 10:49:20+00' then cost_idr*3.376 else cost_idr end))) c
        from usage_logs where coalesce(user_name,'') <> 'LOADTEST' and created_at > now()-interval '8 days' group by 1) x on x.dy=d
      left join (select (created_at at time zone {TZ})::date dy, count(*) filter (where rating='up') up, count(*) filter (where rating='down') down
        from message_feedback where created_at > now()-interval '8 days' group by 1) f on f.dy=d order by d""")
    month = rows(f"""select to_char(d,'YYYY-MM-DD') d, coalesce(x.n,0) n, coalesce(x.c,0) c from
      generate_series(date_trunc('month', now() at time zone {TZ})::date, (now() at time zone {TZ})::date, '1 day') d
      left join (select (created_at at time zone {TZ})::date dy, count(*) n,
          round(sum((case when created_at < '2026-10-04 10:49:20+00' then cost_idr*3.376 else cost_idr end))) c
        from usage_logs where coalesce(user_name,'') <> 'LOADTEST' and created_at > now()-interval '32 days' group by 1) x on x.dy=d order by d""")
    return {"sessions": s, "units": units, "recent": recent, "days7": days7, "month": month, "feedback": fb, "bad": bad, "registered": reg, "docs": docs, "cats": cats}


def read_db():
    return rows("""select pg_database_size(current_database()) size,
      (select count(*) from pg_stat_activity) conn, (select count(*) from pg_stat_activity where state='active') active,
      (select setting::int from pg_settings where name='max_connections') max_conn""")[0]


def read_cloud():
    rev, ok = (sh(["gcloud", "run", "services", "describe", SVC, f"--region={REGION}", f"--project={PROJECT}",
                   "--format=value(status.latestReadyRevisionName,status.conditions[0].status)"]).strip().split("\t") + [""])[:2]
    tok = sh(["gcloud", "auth", "print-access-token"]).strip()

    def ts(metric, period, start_h, group=None, aligner="ALIGN_SUM", reducer="REDUCE_SUM"):
        p = {"filter": f'metric.type="{metric}" AND resource.labels.service_name="{SVC}"',
             "interval.startTime": (now - datetime.timedelta(hours=start_h)).strftime("%Y-%m-%dT%H:%M:%SZ"),
             "interval.endTime": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
             "aggregation.alignmentPeriod": f"{period}s", "aggregation.perSeriesAligner": aligner,
             "aggregation.crossSeriesReducer": reducer}
        if group:
            p["aggregation.groupByFields"] = group
        u = f"https://monitoring.googleapis.com/v3/projects/{PROJECT}/timeSeries?" + urllib.parse.urlencode(p)
        return json.load(get(u, {"Authorization": f"Bearer {tok}"})).get("timeSeries", [])

    def val(pt):
        v = pt["value"]
        return num(v.get("int64Value", v.get("doubleValue", 0)))

    codes = {}
    for s in ts("run.googleapis.com/request_count", 86400, 24, "metric.labels.response_code_class"):
        codes[s["metric"]["labels"].get("response_code_class", "?")] = sum(val(p) for p in s["points"])
    hourly = {}
    for s in ts("run.googleapis.com/request_count", 3600, 24):
        for p in s["points"]:
            hourly[p["interval"]["endTime"]] = val(p)
    inst = ts("run.googleapis.com/container/instance_count", 300, 1, aligner="ALIGN_MAX", reducer="REDUCE_SUM")
    inst_now = val(inst[0]["points"][0]) if inst and inst[0]["points"] else 0
    errs = sh(["gcloud", "logging", "read", f'resource.type="cloud_run_revision" AND resource.labels.service_name="{SVC}" AND severity>=ERROR',
               "--freshness=1d", "--limit=200", f"--project={PROJECT}", "--format=value(timestamp)"]).split()
    # breakdown per request type from request logs (path + status)
    reqs = json.loads(sh(["gcloud", "logging", "read", f'resource.type="cloud_run_revision" AND resource.labels.service_name="{SVC}" AND httpRequest.requestUrl:*',
                          "--freshness=1d", "--limit=5000", f"--project={PROJECT}", "--format=json(httpRequest.requestUrl,httpRequest.status)"], timeout=120) or "[]")
    kinds = {"tanya": 0, "suara": 0, "ping": 0, "lain": 0}
    rejected = {"tanya": 0, "suara": 0}
    for e in reqs:
        h = e.get("httpRequest", {})
        path = urllib.parse.urlparse(h.get("requestUrl", "")).path
        k = "tanya" if path.endswith("/v1/ask") else "suara" if path.endswith("/v1/transcribe") else "ping" if path.endswith("/health") else "lain"
        kinds[k] += 1
        if k in rejected and int(h.get("status") or 0) in (401, 403):
            rejected[k] += 1
    return {"revision": rev, "ready": ok == "True", "codes": codes, "instances": inst_now, "errors24": len(errs),
            "hourly": [hourly[k] for k in sorted(hourly)][-24:], "kinds": kinds, "rejected": rejected}


SOURCES = {"adoption": lambda: read_adoption(rows), "metrics": read_metrics, "frontend": read_front, "usage": read_usage, "content": read_content,
           "db": read_db, "cloud": read_cloud}

# ---------------- state ----------------
try:
    st = json.load(open(STATE))
except Exception:
    st = {"purpose": "Hexindo Technical Assistant operations monitor", "fields": {}, "changelog": []}

old_rev = (st["fields"].get("cloud", {}).get("value") or {}).get("revision")
for name, fn in SOURCES.items():
    f = st["fields"].setdefault(name, {})
    try:
        f.update(value=fn(), retrieved_at=now.isoformat(), stale=False)
        f.pop("error", None)
    except Exception as e:
        f.update(stale=True, error=f"{type(e).__name__}: {e}"[:200], failed_at=now.isoformat())
for k in list(st["fields"]):
    if k not in SOURCES:
        del st["fields"][k]

V = {k: f.get("value") or {} for k, f in st["fields"].items()}
STALE = {k: f.get("stale", False) for k, f in st["fields"].items()}
m, fe, us, ct, db, cl = (V[k] for k in ["metrics", "frontend", "usage", "content", "db", "cloud"])
K = us.get("kpi", {})

att = []
if m and m.get("status") != "ok": att.append("Backend health check is not reporting OK")
if fe and fe.get("http") != 200: att.append(f"Web app returned HTTP {fe.get('http')}")
if cl and not cl.get("ready"): att.append("Latest Cloud Run revision is not ready")
if cl.get("codes", {}).get("5xx", 0): att.append(f"{cl['codes']['5xx']} server errors (5xx) in the last 24 hours")
if (cl.get("rejected") or {}).get("tanya", 0) >= 3: att.append(f"{cl['rejected']['tanya']} queries rejected as unauthorized (401) in the last 24 hours, likely expired sessions")
if cl.get("errors24", 0) >= 5: att.append(f"{cl['errors24']} Cloud Run error log entries in the last 24 hours")
if K.get("d7") and (K.get("fb7") or 0) / K["d7"] > 0.1: att.append(f"Backup AI model answered {K['fb7']} of {K['d7']} questions in the last 7 days because the main model was slow or busy")
if isinstance(K.get("ttft90"), (int, float)) and K["ttft90"] > 15000 and K.get("d7"):
    att.append({"t": f"Slow replies: {K.get('slow7', 0)} of {K['d7']} questions waited more than 15 seconds for the first words of the answer",
                "s": f"Last 7 days. Target: fewer than 1 in 10. Typical wait is {K.get('ttft50', 0) / 1000:.1f} s.", "href": "#d-t", "dlg": "d-t"})
if db.get("max_conn") and (db.get("conn") or 0) / db["max_conn"] > 0.7: att.append(f"Database connections at {db['conn']}/{db['max_conn']} (>70% of limit)")
for nm, s in STALE.items():
    if s: att.append(f"Data source '{nm}' could not be read; showing last known values ({st['fields'][nm].get('error', '')})")
st["needs_attention"] = att
st["updated_at"] = now.isoformat()

if old_rev and cl.get("revision") and old_rev != cl["revision"]:
    st["changelog"].insert(0, {"at": now.isoformat(), "msg": f"New revision deployed: {cl['revision']}"})
prev = st.get("_prev_att", [])
txt = lambda a: a["t"] if isinstance(a, dict) else a
key = lambda a: re.sub(r"\d+", "#", txt(a))  # same alert with a different count is not a new alert
pk, ak = {key(a) for a in prev}, {key(a) for a in att}
st["changelog"][:0] = [{"at": now.isoformat(), "msg": f"Opened: {txt(a)}"} for a in att if key(a) not in pk] + \
                      [{"at": now.isoformat(), "msg": f"Resolved: {txt(a)}"} for a in prev if key(a) not in ak]
st["_prev_att"] = att
st["changelog"] = st["changelog"][:30]
json.dump(st, open(STATE, "w"), indent=1, ensure_ascii=False, default=str)

# ---------------- render ----------------
import sys
sys.path.insert(0, D)
from render import render
open(os.path.join(D, "index.html"), "w").write(render(st, now, att, STALE))
print(json.dumps({"attention": att, "stale": [k for k, s in STALE.items() if s]}, ensure_ascii=False))
