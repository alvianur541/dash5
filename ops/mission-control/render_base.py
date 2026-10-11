"""Render Dash5 monitor page (light, card-based layout) from dashboard.json state."""
import datetime, html, math, re
WORDMARK = "data:image/png;base64,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"

WIB = datetime.timezone(datetime.timedelta(hours=7))
SVC = "dash5-vertexai-proxy"
E = lambda s: html.escape(str(s))
HARI = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
ROUTE = {"rag_found": "Service manual", "google_casual": "General conversation", "image": "Photo analysis",
         "google_technical": "Web search (no manual match)", "rag_canned": "Standard reply", "-": "Not recorded"}
CONF = {"high": "High", "medium": "Medium", "low": "Low", "-": "Not scored"}
UNIT_TONES = ["#7A3A24", "#C2634A", "#E09A78", "#B98B5E", "#4E4A42", "#9C968A", "#D9B79A", "#6F6C63"]

ICON = {  # 1.6px stroke line icons, 20x20
    "grid": '<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/>',
    "chat": '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h7A2.5 2.5 0 0 1 16 5.5v5A2.5 2.5 0 0 1 13.5 13H9l-3.5 3v-3A2.5 2.5 0 0 1 4 10.5z"/>',
    "users": '<circle cx="8" cy="7" r="3"/><path d="M2.5 16.5c.6-2.8 2.8-4.5 5.5-4.5s4.9 1.7 5.5 4.5"/><path d="M13 4.2a3 3 0 0 1 0 5.6M15.5 12.4c1 .7 1.7 2 2 4.1"/>',
    "star": '<path d="M10 3l2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 13.8 5.8 16l.8-4.7L3.2 8l4.7-.7z"/>',
    "server": '<rect x="3" y="3.5" width="14" height="5" rx="1.5"/><rect x="3" y="11.5" width="14" height="5" rx="1.5"/><path d="M6 6h.01M6 14h.01"/>',
    "clock": '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2"/>',
    "arrow": '<path d="M7 13l6-6M8 7h5v5"/>',
    "ext": '<path d="M11 3h6v6M17 3l-8 8M14 12v3.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 3 15.5v-8A1.5 1.5 0 0 1 4.5 6H8"/>',
    "refresh": '<path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3.2h-3.2"/>',
    "alert": '<path d="M10 3.5l7 12.5H3z"/><path d="M10 8.5v3.2M10 13.9h.01"/>',
    "check": '<circle cx="10" cy="10" r="7"/><path d="M7 10.2l2 2 4-4.2"/>',
    "wrench": '<path d="M12.5 3.2a4 4 0 0 0-4.8 5.3L3.5 12.7a1.6 1.6 0 0 0 2.3 2.3l4.2-4.2a4 4 0 0 0 5.3-4.8l-2.4 2.4-2.1-.5-.5-2.1z"/>',
}


def ic(name, size=18):
    return f'<svg class="i" width="{size}" height="{size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{ICON[name]}</svg>'


def render(st, now, att, STALE):
    fields = st.get("fields", {})
    STALE = dict(STALE)
    for key in ("metrics", "frontend", "usage", "content", "db", "cloud", "adoption"):
        f = fields.get(key, {})
        try:
            age = (now - datetime.datetime.fromisoformat(f.get("retrieved_at", ""))).total_seconds()
        except Exception:
            age = float("inf")
        STALE[key] = bool(STALE.get(key) or f.get("stale") or not f.get("value") or age > 1200)
    att = list(att)
    if any(STALE.values()) and not any("source" in str(a).lower() for a in att):
        att.append({"t": "Some sources are unavailable or out of date", "dlg": "d-health"})
    V = {k: f.get("value") or {} for k, f in fields.items()}
    m, fe, us, ct, db, cl = (V.get(k, {}) for k in ["metrics", "frontend", "usage", "content", "db", "cloud"])
    K = us.get("kpi") or {}
    adoption = V.get('adoption', {})
    A = (adoption.get('variants') or {}).get(st.get('_adoption_mode', 'exclude'), {})
    AK = A.get('kpi', {})
    _wib = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))
    MONTH_LBL = _wib.strftime("%B")
    _pm = (_wib.replace(day=1) - datetime.timedelta(days=1))
    PREV_LBL = _pm.strftime("%B")
    nw = now.astimezone(WIB)

    def dt(iso):
        return datetime.datetime.fromisoformat(str(iso).replace(" ", "T"))

    def wib(iso, fmt="%d %b %H:%M"):
        try:
            return dt(iso).astimezone(WIB).strftime(fmt)
        except Exception:
            return "–"

    def ago(iso):
        try:
            s = (now - dt(iso)).total_seconds()
        except Exception:
            return "–"
        return f"{int(s // 60)}m ago" if s < 3600 else f"{int(s // 3600)}h ago" if s < 86400 else f"{int(s // 86400)}d ago"

    def n(x):
        try:
            return f"{float(x):,.0f}" if math.isfinite(float(x)) else "–"
        except Exception:
            return "–"

    def rp(x):
        return "IDR " + n(x) if n(x) != "–" else "–"

    def sec(ms):
        try:
            return f"{float(ms) / 1000:.1f}" if math.isfinite(float(ms)) else "–"
        except Exception:
            return "–"

    def delta(cur, prev, better_low=False, unit="%"):
        try:
            cur, prev = float(cur), float(prev)
        except Exception:
            return '<span class="chg">no prior data</span>'
        if not prev:
            return '<span class="chg">no data last week</span>'
        p = (cur - prev) / prev * 100
        up = p >= 0
        good = (not up) if better_low else up
        word = ""
        return f'<span class="chg"><b class="{"g" if good else "b"}">{"↑" if up else "↓"} {abs(p):.0f}%</b> vs last week</span>'

    def stale(*s):
        return '<span class="stale">stale</span>' if any(STALE.get(x) for x in s) else ""

    def initials(name):
        parts = [p for p in str(name).replace(".", " ").split() if p]
        return ((parts[0][0] + (parts[1][0] if len(parts) > 1 else "")) if parts else "?").upper()

    codes, kd, rj = cl.get("codes", {}), cl.get("kinds", {}), cl.get("rejected", {})
    fbk = ct.get("feedback", {})
    fb_tot = (fbk.get("up") or 0) + (fbk.get("down") or 0)
    sat = f"{fbk.get('up', 0) / fb_tot * 100:.0f}%" if fb_tot else "–"
    rejected = (rj.get("tanya") or 0) + (rj.get("suara") or 0)
    cfg = m.get("config", {})
    ses = ct.get("sessions", {})

    # ---- stat cards ----
    stats = f"""
<a class="card stat hero" href="#d-q" data-dlg="d-q"><div class="st-h">Queries (7 days)<span class="go">{ic('arrow', 16)}</span></div>
 <div class="st-v">{n(AK.get('d7'))}</div>{delta(AK.get('d7'), AK.get('d7_prev'))}{stale('adoption')}</a>
<a class="card stat" href="#d-u" data-dlg="d-u"><div class="st-h">Active technicians (7d)<span class="go">{ic('arrow', 16)}</span></div>
 <div class="st-v">{n(AK.get('users7'))}</div><span class="chg">{n(ct.get('registered'))} registered</span>{delta(AK.get('users7'), AK.get('users7_prev'))}{stale('adoption', 'content')}</a>
<a class="card stat" href="#d-t" data-dlg="d-t"><div class="st-h">First response (7d)<span class="go">{ic('arrow', 16)}</span></div>
 <div class="st-v">{sec(K.get('ttft50'))}<small>sec</small></div>{delta(K.get('ttft50'), K.get('ttft50_prev'), better_low=True)}{stale('usage')}</a>
<a class="card stat cost" href="#d-c" data-dlg="d-c"><div class="st-h">Estimated AI cost<span class="go">{ic('arrow', 16)}</span></div>
 <div class="st-v"><small>IDR</small>{n(K.get('cost_mtd'))}</div><span class="chg">{MONTH_LBL} · estimate, not a bill</span>{stale('usage')}</a>"""

    # ---- stat popups: per-day detail, last 7 days ----
    d7 = ct.get("days7", [])
    adays = A.get('days7', [])
    def dlab(d):
        import datetime as _dt
        x = _dt.date.fromisoformat(d)
        return f'{HARI[x.weekday()]} <small>{x.strftime("%d %b")}</small>'
    def bar(v, mx, cls=""):
        return f'<span class="dbar"><i class="{cls}" style="width:{(v / mx * 100) if mx else 0:.0f}%"></i></span>'
    def dlg(key, title, sub, head, body, foot):
        return (f'<dialog id="d-{key}" class="dlg" aria-labelledby="title-{key}"><div class="dh"><div><h2 id="title-{key}" class="ct">{title}</h2><small>{sub}</small></div>'
                f'<button class="dx" data-close aria-label="Close">&times;</button></div>'
                f'<div class="table-wrap"><table class="dt"><tr>{head}</tr>{body or "<tr><td colspan=4>No data available</td></tr>"}</table></div><p class="df">{foot}</p></dialog>')
    mq = max([float(r["n"]) for r in adays] + [1]); mu = max([float(r["u"]) for r in adays] + [1])
    mt = max([float(r.get("tavg") or 0) for r in d7] + [1])
    tq = sum(int(r["n"]) for r in adays)
    dq = dlg("q", "Queries per day", "Last 7 calendar days · WIB · today is partial", '<th>Day</th><th></th><th class="r">Queries</th>',
        "".join(f'<tr><td>{dlab(r["d"])}</td><td>{bar(float(r["n"]), mq)}</td><td class="r"><b>{n(r["n"])}</b></td></tr>' for r in adays),
        f'Total {n(tq)} queries · average {tq / max(len(adays), 1):.0f} per day. Load tests excluded.')
    du = dlg("u", "Active technicians per day", "Last 7 calendar days · WIB · today is partial", '<th>Day</th><th>Technicians</th><th class="r">Count</th>',
        "".join(f'<tr><td>{dlab(r["d"])}</td><td class="nm">{E(r.get("names") or "–")}</td><td class="r"><b>{n(r["u"])}</b></td></tr>' for r in adays),
        f'{n(AK.get("users7"))} distinct auth IDs (legacy prefix fallback) in the rolling 7-day overview.')
    dt_ = dlg("t", "Time to first response per day", "Seconds until the first words of an answer appear",
        '<th>Day</th><th></th><th class="r">Average</th><th class="r">Slowest</th>',
        "".join(f'<tr><td>{dlab(r["d"])}</td><td>{bar(float(r.get("tavg") or 0), mt, "warn" if (r.get("tavg") or 0) > 8000 else "")}</td>'
                f'<td class="r"><b>{sec(r["tavg"]) if r.get("tavg") else "–"}</b></td><td class="r mut">{sec(r["tmax"]) if r.get("tmax") else "–"}</td></tr>' for r in d7),
        'Average = mean wait across all answers that day. Slowest = the single longest wait of the day.')
    mc = max([float(r.get("c") or 0) for r in d7] + [1])
    tc = sum(float(r.get("c") or 0) for r in d7)
    cost_queries = sum(int(r['n']) for r in d7)
    dc = dlg("c", "AI cost per day", "Last 7 calendar days · today is partial · estimate, not a bill", '<th>Day</th><th></th><th class="r">Queries</th><th class="r">Cost (IDR)</th>',
        "".join(f'<tr><td>{dlab(r["d"])}</td><td>{bar(float(r.get("c") or 0), mc)}</td><td class="r">{n(r["n"])}</td><td class="r"><b>{n(r.get("c"))}</b></td></tr>' for r in d7),
        f'Total {n(cost_queries)} queries · IDR {n(tc)} · average IDR {n(tc / max(cost_queries, 1))} per query. Internal activity included; load tests excluded.')
    ds = dlg("s", "Feedback per day", "Thumbs up / down given by technicians", '<th>Day</th><th class="r">Positive</th><th class="r">Negative</th><th class="r">Satisfaction</th>',
        "".join(f'<tr><td>{dlab(r["d"])}</td><td class="r">{n(r["up"])}</td><td class="r">{n(r["down"])}</td>'
                f'<td class="r"><b>{(str(round(r["up"] / (r["up"] + r["down"]) * 100)) + "%") if (r["up"] + r["down"]) else "–"}</b></td></tr>' for r in d7),
        f'All-time: {n(fbk.get("up"))} positive · {n(fbk.get("down"))} negative. Days without feedback show –.')
    dialogs = dq + du + dt_ + ds + dc

    # ---- pill bars: last 7 days ----
    daily = (A.get("daily") or [])[-7:]
    vals = [float(d.get("n") or 0) for d in daily]
    mx = max(vals + [1])
    avg = sum(vals) / max(len(vals), 1)
    top = vals.index(max(vals)) if vals else -1
    pills = []
    for i, (d, v) in enumerate(zip(daily, vals)):
        # Anchor dates to the source's retrieval, never to the current refresh.
        anchor = dt(fields.get("usage", {}).get("retrieved_at", now.isoformat())).astimezone(WIB).date()
        try:
            day = datetime.date.fromisoformat(d["d"] if len(d["d"]) == 10 else f"{anchor.year}-{d['d']}")
            if day > anchor:
                day = day.replace(year=day.year - 1)
        except Exception:
            day = anchor - datetime.timedelta(days=len(daily) - 1 - i)
        cls = "top" if i == top and v else "today" if i == len(daily) - 1 else "hi" if v >= avg and v else "lo"
        tip = f'<span class="tip">{n(v)}</span>'
        pills.append(f'<div class="pcol" title="{HARI[day.weekday()]} {day.strftime("%d/%m")}: {n(v)} queries"><div class="pwrap"><div class="pill {cls}" style="height:{v / mx * 100:.0f}%">{tip}</div></div><span>{HARI[day.weekday()]}<small>{day.strftime("%d %b")}</small></span></div>')

    # Every alert keeps its count, matching details and recovery context.
    def plain_alert(text):
        text = str(text)
        text = re.sub(r"Data source '([^']+)' could not be read;.*", r"\1 source unavailable · last known values shown", text, flags=re.S)
        return text.replace("(5xx)", "").replace("as unauthorized (401)", "because sign-in was rejected").replace("TTFT", "first response")
    if att:
        rem = '<ul class="alerts">'
        for a in att:
            a = a if isinstance(a, dict) else {"t": a}
            target = a.get("dlg") or "d-health"
            rem += f'<li><a href="#{E(target)}" data-dlg="{E(target)}">{E(plain_alert(a["t"]))}{ic("arrow", 14)}</a>'
            if a.get("s"):
                rem += f'<small>{E(a["s"])}</small>'
            rem += '</li>'
        rem += '</ul>'
    else:
        rem = '<div class="rem"><div class="rem-t">All systems operational</div><div class="rem-s">All seven sources checked successfully</div></div><a class="btn dark full" href="https://dash5.my.id" target="_blank" rel="noopener">Open app</a>'

    # ---- units list ----
    units = A.get("units", [])[:5]
    unit_rows = "".join(f'<li><span class="ub" style="background:{UNIT_TONES[i % len(UNIT_TONES)]}">{ic("wrench", 14)}</span><div><b>{E(u["k"])}</b><small>{n(u["n"])} queries · 30 days</small></div></li>' for i, u in enumerate(units))

    # ---- technicians ----
    techs = []
    for u in A.get("users", [])[:4]:
        try:
            age = (now - dt(u.get("last"))).total_seconds()
        except Exception:
            age = 1e9
        tag = ("ok", "Active today") if wib(u.get("last"), "%Y-%m-%d") == nw.strftime("%Y-%m-%d") else ("mid", ago(u.get("last"))) if age < 3 * 86400 else ("off", ago(u.get("last")))
        techs.append(f'<li><span class="av">{E(initials(u["k"]))}</span><div class="tw"><b>{E(u["k"])}</b><small>{("Last query: <em>" + E(u["title"]) + "</em>" + ((" · " + E(u["model"])) if u.get("model") else "")) if u.get("title") else f"AI cost (7d): {rp(u.get('c'))}"}</small></div><span class="tag {tag[0]}">{E(tag[1])}</span><span class="cnt">{n(u["n"])}<small>queries</small></span></li>')

    # ---- gauge: answer reliability ----
    # Smooth = main model answered, first words within 15 s. Slow = main model, first words after 15 s.
    # Backup = main model failed or stalled, a backup model (or degraded search) produced the answer.
    seg = {"smooth": 0.0, "slow": 0.0, "backup": 0.0}
    for r in us.get("rel", []):
        if r.get("k") in seg:
            seg[r["k"]] += float(r.get("n") or 0)
    rtot = sum(seg.values())
    fr = {k: (v / rtot if rtot else 0) for k, v in seg.items()}
    L = 125.66  # half circumference for r=40

    def arc(start, frac, stroke, extra=""):
        gap = 1.2 if frac > 0.02 else 0
        return f'<circle r="40" cx="50" cy="50" fill="none" stroke="{stroke}" stroke-width="14" stroke-linecap="round" {extra} stroke-dasharray="{max(frac * L - gap, 0):.2f} 400" stroke-dashoffset="{-(L + start * L):.2f}" pathLength="251.32"/>'
    a1, a2 = fr["smooth"], fr["smooth"] + fr["slow"]
    gauge = f"""<svg viewBox="0 0 100 58" class="gauge">
{arc(a2, fr["backup"], '#B8443A')}{arc(a1, fr["slow"], '#D9A07F')}{arc(0, fr["smooth"], '#6B2F1C')}
<text x="50" y="45" class="g-v">{str(round(fr["smooth"] * 100)) + "%" if rtot else "–"}</text></svg><div class="g-cap">answered smoothly · {n(seg["smooth"])} of {n(rtot)} questions</div>"""
    pc = lambda k: f'{round(fr[k] * 100)}%'
    gauge_leg = (f'<div class="leg"><span><i style="background:#6B2F1C"></i>Smooth {pc("smooth")}</span>'
                 f'<span><i style="background:#D9A07F"></i>Slow start {pc("slow")}</span>'
                 f'<span><i style="background:#B8443A"></i>Backup model {pc("backup")}</span></div>')

    # ---- live server card ----
    up = int(m.get("uptime_detik") or 0)
    backend_label = "Stale" if STALE.get("metrics") else "Online" if m.get("status") == "ok" else "Down" if m else "Unknown"
    try:
        clock_at = int(dt(fields.get("metrics", {}).get("retrieved_at")).timestamp())
    except Exception:
        clock_at = int(now.timestamp())
    hh, mm, ss = up // 3600, up % 3600 // 60, up % 60
    ok_backend = m.get("status") == "ok"
    live = f"""<div class="card live" id="server"><div class="lv-h">Backend uptime since last restart{stale('metrics')}</div>
<div class="clock" data-up="{up}" data-at="{clock_at}" data-running="{str(backend_label == "Online").lower()}">{f"{hh:02d}:{mm:02d}:{ss:02d}" if m.get("uptime_detik") is not None else "–"}</div>
<div class="lv-row"><span class="pill-s {'warn' if STALE.get('metrics') else 'ok' if ok_backend else 'bad'}"><i></i>{backend_label}</span>
<span class="pill-s"><i class="n"></i>{(cl.get('revision') or '–').replace(SVC + '-', 'rev ')}</span><span class="pill-s"><i class="n"></i>{cl.get('instances', 0)} {'instance' if cl.get('instances', 0) == 1 else 'instances'}</span></div></div>"""

    # ---- lower detail ----
    recent = "".join(f'<tr><td class="who">{E(r.get("user_name") or "–")}</td><td><span class="chip">{E(r.get("model") or "–")}</span></td><td class="r">{wib(r.get("created_at"), "%d %b, %H:%M")}<small class="mut"> · {ago(r.get("created_at"))}</small></td></tr>' for r in A.get("recent", [])[:6])
    bad = "".join(f'<li><span class="mut">{wib(b.get("created_at"), "%d %b")}</span><span class="bq">{E((b.get("question") or "")[:100])}</span></li>' for b in ct.get("bad", [])) or '<li class="mut">None recorded.</li>'
    conf = {c["k"]: int(float(c["n"])) for c in us.get("conf", [])}
    # Exact lookups (part numbers, prices, opened files) return the source data itself: count them as strong.
    exact = conf.get("-", 0)
    strong = conf.get("high", 0) + exact
    total = strong + conf.get("medium", 0) + conf.get("low", 0)
    strong_pct = round(strong / total * 100) if total else 0
    LV = [("Strong match", "Right manual section, or exact part / price data", strong, "var(--acc)"),
          ("Partial match", "Related section, worth double-checking", conf.get("medium", 0), "#D9A07F"),
          ("Weak match", "Manual barely covers it", conf.get("low", 0), "#B8443A")]
    def crow(lab, desc, v, col):
        pct = round(v / total * 100) if total else 0
        return (f'<li><span><b class="lv">{lab}</b><small>{desc}</small></span>'
                f'<span class="track"><i style="width:{pct}%;background:{col}"></i></span><b>{pct}%<small> {n(v)}</small></b></li>')
    conf_rows = "".join(crow(*x) for x in LV) if total else '<li class="mut">No manual answer data available</li>'
    conf_head = (f'<div class="confhead"><b>{strong_pct}%</b><span>of manual answers were a strong match '
                 f'({n(strong)} of {n(total)} questions)</span></div>') if total else ""
    systems = [("Backend", ok_backend, f"{'Online' if ok_backend else 'Down'}"), ("Web app", fe.get("http") == 200, f"HTTP {fe.get('http', '–')} · {fe.get('ms', '–')} ms"),
               ("Cloud Run", bool(cl.get("ready")), "ready" if cl.get("ready") else "NOT READY"),
               ("Database", (db.get("conn") or 0) < 0.7 * (db.get("max_conn") or 99), f"{db.get('conn', '–')}/{db.get('max_conn', '–')} connections · {float(db.get('size') or 0) / 1e6:.0f} MB")]
    sys_rows = ""
    for (a, ok, detail), source in zip(systems, ("metrics", "frontend", "cloud", "db")):
        label = "Stale" if STALE.get(source) else "Healthy" if ok else "Needs attention"
        tone = "warn" if label == "Stale" or (source == "db" and not ok) else "ok" if ok else "bad"
        sys_rows += f'<li><span class="sd {tone}"></span><b>{a}</b><span class="mut">{label}<small>{E(detail) if V.get(source) else "No data available"}</small></span></li>'
    source_rows = "".join(f'<tr><td>{E(label)}</td><td>{"Stale / unavailable" if STALE.get(key) else "Fresh"}</td><td class="r">{wib(fields.get(key, {}).get("retrieved_at"))}</td></tr>' for key, label in (("metrics", "Backend"), ("frontend", "Web app"), ("usage", "Usage"), ("content", "Content"), ("db", "Database"), ("cloud", "Cloud Run")))
    dialogs += dlg("health", "System & source checks", "Last successful reads · WIB", '<th>Source</th><th>State</th><th class="r">Last read</th>', source_rows, f'24 hours: {n(codes.get("5xx", 0))} server errors · {n(rejected)} rejected query / voice requests · {n(cl.get("errors24", 0))} error logs. Review server logs for errors; ask affected technicians to sign in again. Unavailable sources retain last known values. Data refresh: 10 minutes; page reload: 5 minutes.')
    log = "".join(f'<li><span class="mut">{wib(c["at"])}</span><span>{E(plain_alert(c["msg"]).replace(SVC + "-", "revision "))}</span></li>' for c in st.get("changelog", [])[:5]) or '<li class="mut">No changes recorded.</li>'
    status_ok = not att and not any(STALE.values())
    status_class = "" if status_ok else "bad" if (codes.get("5xx") or (m and not ok_backend) or fe.get("http", 200) != 200) else "warning"
    source_summary = f"{sum(not v for v in STALE.values())}/7 sources fresh"

    CSS = """
@font-face{font-family:"Inter";src:url("inter.woff2") format("woff2");font-weight:100 900;font-display:swap}
:root{--canvas:#EEEAE2;--frame:#F7F5F0;--card:#FFFFFF;--ink:#1A1915;--ink2:#46443E;--mut:#6B6860;--line:#ECE8E0;
--d1:#4A1F12;--d2:#6B2F1C;--acc:#C2634A;--acc2:#D97757;--soft:#F6E7DF;--ok:#2F7347;--bad:#A8372A;--warn:#85560F;--r:22px}
*{box-sizing:border-box}html{background:var(--canvas)}a{color:inherit;text-decoration:none}
body{margin:0;font:15px/1.45 Inter,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);font-feature-settings:"cv11" 1,"ss01" 1;-webkit-font-smoothing:antialiased}
.app{max-width:1320px;margin:18px auto;background:var(--frame);border-radius:30px;padding:14px;display:grid;grid-template-columns:220px 1fr;gap:14px;box-shadow:0 1px 0 rgba(0,0,0,.03),0 30px 60px -30px rgba(74,31,18,.18)}
.i{flex:none}
/* sidebar */
.side{background:var(--card);border-radius:var(--r);padding:22px 14px 14px;display:flex;flex-direction:column;position:sticky;top:14px;height:calc(100vh - 64px);max-height:860px}
.logo{padding:6px 10px 26px}.logo img{height:19px;width:auto;display:block}
.logo .mk{width:32px;height:32px;border-radius:50%;border:2.5px solid var(--acc);display:grid;place-items:center}.logo .mk:after{content:"";width:12px;height:12px;border-radius:50%;background:var(--d2)}
.logo sup{color:var(--acc);font-size:.62em;vertical-align:.6em;line-height:0;margin-left:1px}
.nav-l{font-size:12px;color:var(--mut);letter-spacing:.6px;padding:10px 10px 6px}
.nav a{display:flex;align-items:center;gap:11px;padding:9px 10px;border-radius:12px;color:var(--mut);font-weight:500;position:relative}
.nav a:hover{color:var(--ink);background:#F7F4EF}.nav a.on{color:var(--ink)}.nav a.on:before{content:"";position:absolute;left:-14px;top:7px;bottom:7px;width:4px;border-radius:0 4px 4px 0;background:var(--d2)}
.nav a.on .i{color:var(--d2)}.badge{margin-left:auto;font-size:12px;background:var(--d2);color:#fff;border-radius:6px;padding:1px 6px;font-weight:600}
.promo{margin-top:auto;border-radius:18px;padding:16px;color:#fff;background:var(--d1);position:relative;overflow:hidden}

.promo b{display:block;font-size:15px;line-height:1.25;font-weight:600;margin:10px 0 4px}.promo small{opacity:.7;font-size:12px}
.promo .btn{margin-top:12px;background:var(--acc);color:#fff;width:100%;justify-content:center}
/* main */
.main{display:flex;flex-direction:column;gap:14px;min-width:0}
.top{background:var(--card);border-radius:var(--r);padding:12px 14px 12px 18px;display:flex;align-items:center;gap:12px}
.status{display:inline-flex;min-height:42px;align-items:center;gap:9px;background:#F7F4EF;border-radius:99px;padding:8px 14px 8px 12px;font-size:13px;color:var(--ink2)}
.status .dt{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 4px rgba(63,143,90,.15)}.status.bad .dt{background:var(--bad);box-shadow:0 0 0 4px rgba(194,65,47,.15)}
.status kbd{font:inherit;font-size:12px;color:var(--mut);background:#fff;border-radius:6px;padding:1px 6px;margin-left:6px}
.top .sp{flex:1}.ib{width:38px;height:38px;border-radius:50%;background:#F7F4EF;display:grid;place-items:center;color:var(--ink2);cursor:pointer;border:0}
.me{display:flex;align-items:center;gap:10px;padding-left:6px}.me .av{width:38px;height:38px;font-size:13px}.me b{display:block;font-size:13.5px;font-weight:600}.me small{color:var(--mut);font-size:12px}
.body{background:var(--card);border-radius:var(--r);padding:22px;display:flex;flex-direction:column;gap:14px}
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:4px}
.head h1{margin:0;font-size:30px;font-weight:600;letter-spacing:-.9px}.head p{margin:4px 0 0;color:var(--mut)}
.acts{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.btn{display:inline-flex;align-items:center;gap:8px;border-radius:99px;padding:10px 18px;font-weight:550;font-size:13.5px;border:1.5px solid transparent;cursor:pointer;font-family:inherit;min-height:42px}
.btn.dark{background:var(--d2);color:#fff}.btn.dark:hover{background:var(--d1)}.btn.line{border-color:var(--ink);background:transparent;color:var(--ink)}.btn.full{width:100%;justify-content:center}
.grid{display:grid;gap:14px}.g4{grid-template-columns:repeat(4,1fr)}.g-mid{grid-template-columns:1.55fr 1fr 1fr}.g-low{grid-template-columns:1.55fr 1fr 1fr}.g2{grid-template-columns:1.4fr 1fr}.g3{grid-template-columns:repeat(3,1fr)}
.card{background:#FBFAF7;border-radius:20px;padding:18px;min-width:0;position:relative;border:1px solid var(--line)}
.card h2,.card h3{margin:0 0 14px;font-size:15px;font-weight:600;letter-spacing:-.2px;display:flex;align-items:center;justify-content:space-between;gap:8px}.card h2 small,.card h3 small{font-weight:400;color:var(--mut);font-size:12px}
.stat{display:flex;flex-direction:column;gap:6px;transition:transform .15s}.stat:hover{transform:translateY(-2px)}
.st-h{display:flex;justify-content:space-between;align-items:center;font-weight:550;font-size:14.5px}
.go{width:30px;height:30px;border-radius:50%;border:1.3px solid currentColor;display:grid;place-items:center;opacity:.85}
.st-v{font-size:40px;font-weight:600;letter-spacing:-1px;line-height:1.1;margin-top:6px}.st-v small{font-size:13px;font-weight:450;letter-spacing:0;color:var(--mut);margin-left:6px}
.chg{font-size:12px;color:var(--mut)}.chg b{font-weight:600;border-radius:5px;padding:1px 5px;margin-right:3px;background:#F2EEE7}.chg b.g{color:var(--ok)}.chg b.b{color:var(--bad)}
.hero{background-color:var(--d2);color:#fff;border:0;overflow:hidden}
.hero .chg{color:rgba(255,255,255,.8)}.hero .chg b{background:rgba(255,255,255,.18);color:#fff}
/* pills */
.pills{display:flex;align-items:flex-end;gap:12px;height:205px;padding-top:24px}
.pcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%}.pcol>span{font-size:12px;color:var(--mut)}
.pwrap{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center;position:relative}
.pill{width:100%;max-width:54px;border-radius:99px;min-height:26px;position:relative}
.pill.lo{background:#EDE4DB;border:1.5px solid #D8CCC0}
.pill.hi{background:var(--acc)}.pill.top{background:var(--d1)}.pill.today{background:var(--acc2);opacity:.85}
.tip{position:absolute;top:-6px;left:50%;transform:translate(-50%,-100%);white-space:nowrap;font-size:12px;font-weight:600;background:#fff;border:1px solid var(--line);border-radius:8px;padding:2px 7px;box-shadow:0 4px 12px -6px rgba(0,0,0,.2)}
.pleg{display:flex;gap:16px;font-size:12px;color:var(--mut);margin-top:12px}.pleg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
/* reminder */
.rem{margin-bottom:16px}.rem-t{font-size:20px;line-height:1.2;font-weight:600;letter-spacing:-.4px;color:var(--d2)}.rem.bad .rem-t{color:var(--bad);font-size:17px}
.rem-s{font-size:12.5px;color:var(--mut);margin-top:6px}.rem-more{font-size:12px;color:var(--ink2);margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}
/* lists */
ul.units,ul.techs,ul.plain,ul.conf,ul.sys{list-style:none;margin:0;padding:0}
ul.units li{display:flex;align-items:center;gap:12px;padding:7px 0}ul.units b{display:block;font-size:13.5px;font-weight:550}ul.units small{color:var(--mut);font-size:12px}
.ub{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;color:#fff;flex:none}
.av{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-weight:600;font-size:12.5px;color:var(--d1);background:var(--soft);flex:none}
ul.techs li{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}ul.techs li:last-child{border:0}
.tw{flex:1;min-width:0}.tw b{font-size:13.5px;font-weight:550}.tw small{display:block;color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tw em{font-style:normal;color:var(--ink2);font-weight:500}
.tag{font-size:12px;border-radius:6px;padding:2px 7px;white-space:nowrap;font-weight:550}.tag.ok{background:#E6F2EA;color:var(--ok)}.tag.mid{background:#FBF0DD;color:var(--warn)}.tag.off{background:#F2EEE7;color:var(--mut)}
.cnt{width:46px;text-align:right;font-weight:600}.cnt small{display:block;font-size:12px;color:var(--mut);font-weight:400}
.gauge{width:100%;max-width:300px;display:block;margin:4px auto 0}.gauge circle{transform:rotate(0deg)}
.g-v{font-size:17px;font-weight:650;text-anchor:middle;fill:var(--ink);letter-spacing:-.6px}.g-cap{text-align:center;font-size:12.5px;color:var(--mut);margin-top:-6px;position:relative}
.leg{display:flex;justify-content:center;gap:14px;font-size:12px;color:var(--mut);margin-top:12px;flex-wrap:wrap}.leg i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px}
.leg i.hz{background:#E3D8CD}
.live{background:var(--d1);color:#fff;border:0;overflow:hidden;display:flex;flex-direction:column}
.lv-h{font-size:14px;font-weight:550;opacity:.9}.clock{font-size:42px;font-weight:600;letter-spacing:-1px;font-variant-numeric:tabular-nums;margin:18px 0 18px;text-align:center}
.lv-row{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:auto}.pill-s{display:inline-flex;align-items:center;gap:6px;font-size:12px;background:rgba(255,255,255,.1);border-radius:99px;padding:5px 10px}
.pill-s i{width:7px;height:7px;border-radius:50%;background:#8FD3A4}.pill-s.bad i{background:#FF8A7A}.pill-s i.n{background:rgba(255,255,255,.45)}
/* detail */
table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{padding:9px 0;border-bottom:1px solid var(--line);text-align:left;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
th{font-weight:500;color:var(--mut);font-size:12px}td+td,th+th{padding-left:12px}tr:last-child td{border:0}td.q{width:52%}td.who{font-weight:550}.r{text-align:right}.mut{color:var(--mut)}
.chip{font-size:12px;background:var(--soft);color:var(--d2);border-radius:6px;padding:2px 8px;font-weight:550}
ul.plain li{display:flex;gap:12px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}ul.plain li:last-child{border:0}ul.plain li>span:first-child{white-space:nowrap;font-size:12px;padding-top:1px}
ul.conf li{display:grid;grid-template-columns:minmax(150px,46%) 1fr 64px;gap:12px;align-items:center;padding:7px 0;font-size:13px}ul.conf li small{display:block;color:var(--mut,#8a817a);font-size:12px;font-weight:400;line-height:1.35}ul.conf b small{display:inline;font-size:12px}.lv{font-weight:600}ul.conf li.ns{border-top:1px dashed #E6DED4;margin-top:6px;padding-top:10px}.confhead{display:flex;gap:12px;align-items:baseline;margin:2px 0 10px}.confhead b{font-size:30px;font-weight:700;color:var(--acc);letter-spacing:-.5px}.confhead span{font-size:13px;color:var(--mut,#8a817a)}.track{height:8px;border-radius:99px;background:#F0EBE4}.track i{display:block;height:100%;border-radius:99px;background:var(--acc)}ul.conf b{text-align:right;font-weight:600}
ul.sys li{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}ul.sys li:last-child{border:0}ul.sys .mut{margin-left:auto}
.sd{width:8px;height:8px;border-radius:50%;background:var(--ok)}.sd.bad{background:var(--bad)}
dl.facts{display:grid;grid-template-columns:1fr auto;gap:7px 12px;margin:0;font-size:13px}dl.facts dt{color:var(--mut)}dl.facts dd{margin:0;text-align:right;font-weight:550}
.note{font-size:12px;color:var(--mut);margin:10px 0 0}.stale{font-size:12px;color:var(--warn);margin-left:6px;font-weight:500}
.foot{text-align:center;color:var(--mut);font-size:12px;padding:6px 0 2px}
@media(max-width:1100px){.app{grid-template-columns:1fr;margin:0;border-radius:0}.side{display:none}.g-mid,.g-low{grid-template-columns:1fr 1fr}.g-mid>:first-child,.g-low>:first-child{grid-column:1/-1}}
@media(max-width:720px){.app{padding:10px;gap:10px}.body{padding:14px}.g4{grid-template-columns:1fr 1fr}.g-mid,.g-low,.g2,.g3{grid-template-columns:1fr}
.st-v{font-size:30px}.head h1{font-size:24px}.me div,.top .ib{display:none}.status{font-size:12px}.pills{gap:7px;height:180px}.stat .go{width:26px;height:26px}}
dialog.dlg{border:0;border-radius:22px;padding:24px 26px 18px;width:min(560px,92vw);box-shadow:0 30px 80px rgba(40,25,15,.25);font:inherit;color:inherit;background:#fff}
dialog.dlg::backdrop{background:rgba(30,22,16,.38);}
.dh{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}.dh h2,.dh h3{margin:0;font-size:18px}.dh small{color:var(--mut,#8a817a);font-size:12.5px}
.dx{border:0;background:#F3EEE8;width:32px;height:32px;border-radius:50%;font-size:20px;line-height:1;cursor:pointer;color:#5a514a}.dx:hover{background:#E9E1D8}
table.dt{width:100%;border-collapse:collapse;font-size:13.5px}table.dt th{text-align:left;font-weight:500;color:var(--mut,#8a817a);font-size:12px;padding:6px 4px;border-bottom:1px solid #EFE9E2}
table.dt td{padding:9px 4px;border-bottom:1px solid #F5F0EA;vertical-align:middle}table.dt td small{color:var(--mut,#8a817a);margin-left:4px}table.dt .r{text-align:right}table.dt td.nm{font-size:12.5px;color:#5a514a;white-space:normal;overflow:visible;text-overflow:clip;max-width:none;line-height:1.4}table.dt .mut{color:var(--mut,#8a817a)}
.dbar{display:block;height:8px;border-radius:99px;background:#F0EBE4;min-width:120px}.dbar i{display:block;height:100%;border-radius:99px;background:var(--acc)}.dbar i.warn{background:#B8443A}
.df{margin:12px 2px 0;font-size:12px;color:var(--mut,#8a817a)}

/* Operations refinement: readable, compact, source-aware. */
::selection{background:#EBD3C6;color:var(--d1)}
:focus-visible{outline:3px solid var(--d2);outline-offset:4px}
.skip{position:fixed;top:-100px;left:20px;background:white;padding:12px;z-index:20}.skip:focus{top:12px}
.app{grid-template-columns:200px minmax(0,1fr)}
.nav a{min-height:44px}.nav a.on{background:var(--soft)}.nav a.on:before{display:none}
.card{border-radius:16px}.hero .stale{color:#FFE5B9}.hero .chg{color:#F5E7DF}
.head{align-items:center}.head p{font-size:13px}.acts{flex-direction:column;align-items:flex-end;gap:3px}
.freshness{font-size:12px;color:var(--mut);padding:4px 2px;min-height:28px}
.status.warning .dt,.sd.warn{background:var(--warn)}.status.warning .dt{box-shadow:none}.pill-s.warn i{background:#FFD28B}
.g4{grid-template-columns:repeat(4,minmax(0,1fr))}.g2{grid-template-columns:1.15fr 1fr}
.stat{gap:6px;min-height:158px}.st-h{font-size:14px;line-height:1.35;gap:6px;min-height:38px}.st-v{font-variant-numeric:tabular-nums}.go{flex:none;width:26px;height:26px}
.cost .st-v{font-size:29px;letter-spacing:-.7px}.cost .st-v small{display:block;margin:0 0 3px;font-size:12px}
.pills{height:200px;padding-top:28px}.pill{min-height:0}.pill.today{opacity:1}.pcol>span{text-align:center}.pcol small{display:block;font-size:12px;margin-top:2px}.pcol{min-width:0}.pills .tip{padding:1px 5px}
.pleg{gap:12px;flex-wrap:wrap}.alerts{list-style:none;padding:0;margin:0}.alerts li+li{border-top:1px solid var(--line);padding-top:10px;margin-top:10px}.alerts a{display:flex;gap:8px;justify-content:space-between;font-size:13px;font-weight:550;line-height:1.4;color:var(--bad);min-height:44px}.alerts a .i{margin-top:2px}.alerts small{display:block;font-size:12px;color:var(--mut);margin-top:4px}.alerts a:hover{text-decoration:underline;text-underline-offset:3px}
.card h2 small{white-space:nowrap}.confhead b{color:var(--d2)}.feedback-summary{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:12px;color:var(--d2);min-height:44px;margin-top:10px;border-top:1px solid var(--line)}
td small{font-size:12px}.sys .mut{text-align:right}.sys .mut small{display:block;font-size:12px}.sys b{font-size:13px}.sd{flex:none}
dl.facts{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}dl.facts dd{overflow-wrap:anywhere}
.dlg{max-height:85dvh;overflow:auto;overscroll-behavior:contain}.dx{min-width:44px;min-height:44px;flex:none}.table-wrap{overflow-x:auto}.dbar{min-width:42px}table.dt{table-layout:auto}table.dt td{white-space:normal;overflow:visible}table.dt th{white-space:normal}table.dt td:first-child{min-width:86px}
@media(max-width:1100px){.app{grid-template-columns:1fr}}
@media(max-width:720px){.g4{grid-template-columns:repeat(2,minmax(0,1fr))}.pcol small{white-space:nowrap;font-size:12px}.acts{align-items:flex-start}.head{gap:10px}.card{padding:16px}.st-h{font-size:13px;min-height:36px}.st-v{font-size:30px}.cost .st-v{font-size:25px}.g2{grid-template-columns:1fr}.pills{height:185px;gap:7px}.pleg{font-size:12px;gap:8px}.tag{max-width:85px;white-space:normal;text-align:center}ul.techs li{gap:8px}.av{width:30px;height:30px}.cnt{width:40px}ul.conf li{grid-template-columns:minmax(0,1fr) 45px 55px;gap:8px}td,th{white-space:normal;overflow-wrap:anywhere}td .mut{display:block}.card h2{align-items:flex-start}.card h2 small{white-space:normal;text-align:right}dialog.dlg{padding:18px;width:calc(100vw - 24px);max-height:85dvh}.clock{font-size:38px}}

@page{size:A4 landscape;margin:8mm}
@media print{html,body{background:#fff}.app{display:block;margin:0;padding:0;box-shadow:none;border-radius:0;max-width:none;background:#fff}.side,.acts .btn,.go{display:none!important}
.body{padding:0}.card{break-inside:avoid}.grid{break-inside:avoid}.stat:hover{transform:none}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
@media(prefers-reduced-motion:reduce){.stat{transition:none}}
"""
    JS = """<script>(function(){
document.querySelectorAll('[data-dlg]').forEach(function(a){a.setAttribute('aria-haspopup','dialog');a.setAttribute('aria-controls',a.dataset.dlg);a.addEventListener('click',function(e){var d=document.getElementById(a.dataset.dlg);if(d&&d.showModal){e.preventDefault();d._opener=a;if(!d.open)d.showModal();d.querySelector('[data-close]').focus();}});});
document.querySelectorAll('dialog.dlg').forEach(function(d){d.addEventListener('click',function(e){var r=d.getBoundingClientRect();if(e.target.closest('[data-close]')||(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)))d.close();});d.addEventListener('close',function(){if(d._opener)d._opener.focus();});});
document.querySelectorAll('.nav a').forEach(function(a){a.addEventListener('click',function(){document.querySelectorAll('.nav a').forEach(function(x){x.classList.remove('on');x.removeAttribute('aria-current');});a.classList.add('on');a.setAttribute('aria-current','location');});});
var c=document.querySelector('.clock');if(!c||c.dataset.running!=='true')return;var up=+c.dataset.up,at=+c.dataset.at;
function p(x){return(x<10?'0':'')+x}function t(){var age=Date.now()/1000-at;if(age>1200){c.dataset.running='false';var label=document.querySelector('.live .pill-s');label.classList.remove('ok');label.textContent='Stale';return;}var s=Math.max(0,Math.floor(up+age));c.textContent=p(Math.floor(s/3600))+':'+p(Math.floor(s%3600/60))+':'+p(s%60)}t();setInterval(t,1000);
})();</script>"""

    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="300"><meta name="robots" content="noindex"><meta name="theme-color" content="#EEEAE2"><title>Hexindo · Operations Monitor</title><style>{CSS}</style></head><body>
<a class="skip" href="#main-content">Skip to overview</a><div class="app" id="top">
<aside class="side"><div class="logo"><img src="{WORDMARK}" alt="Hexindo"></div>
 <div class="nav-l">MENU</div><nav class="nav">
  <a class="on" aria-current="page" href="#top">{ic('grid')}Overview</a><a href="#pertanyaan">{ic('chat')}Queries<span class="badge">{n(AK.get('today'))}</span></a>
  <a href="#teknisi">{ic('users')}Technicians</a><a href="#kualitas">{ic('star')}Quality</a></nav>
 <div class="nav-l" style="margin-top:14px">SYSTEM</div><nav class="nav"><a href="#server">{ic('server')}Server</a><a href="#riwayat">{ic('clock')}Change log</a></nav>
</aside>

<main class="main" id="main-content">
 <div class="body">
  <div class="head"><div><h1>Overview</h1><p>Hexindo Technical Assistant · {nw.strftime("%a, %d %b %Y")}</p></div>
   <div class="acts"><a href="#d-health" data-dlg="d-health" class="status {status_class}"><span class="dt"></span>{'All systems operational' if status_ok else f"{len(att)} open {'issue' if len(att) == 1 else 'issues'}"}<kbd>{wib(now.isoformat(), '%H:%M')} WIB</kbd></a><a class="freshness" href="#d-health" data-dlg="d-health">{source_summary} · last refresh</a></div></div>

  <div class="grid g4">{stats}</div>

  <div class="grid g-mid" id="pertanyaan">
   <div class="card"><h2 class="ct">Daily queries <small>7 WIB days{stale('usage')}</small></h2><div class="pills">{''.join(pills) or '<span class=mut>No daily query data available</span>'}</div>
    <div class="pleg"><span><i style="background:var(--d1)"></i>Peak</span><span><i style="background:var(--acc)"></i>Above average</span><span><i style="background:#EDE4DB;border:1px solid #D8CCC0"></i>Below average</span></div><p class="note">Queries per day · today is partial · calendar days, not rolling 7 days</p></div>
   <div class="card"><h2 class="ct">Attention <small>{len(att)} open</small></h2>{rem}</div>
   <div class="card"><h2 class="ct">Top equipment models <small>30 days</small></h2><ul class="units">{unit_rows or "<li class=mut>No model activity available</li>"}</ul></div>
  </div>

  <div class="grid g-low">
   <div class="card" id="teknisi"><h2 class="ct">Most active technicians <small>7 days</small></h2><ul class="techs">{''.join(techs) or '<li class=mut>No technician activity available</li>'}</ul></div>
   <div class="card" id="kualitas"><h2 class="ct">Answer reliability <small>7 days</small></h2>{gauge}{gauge_leg}</div>
   {live}
  </div>

  <div class="grid g2">
   <div class="card"><h2 class="ct">Recent activity{stale('content')}</h2><table><tr><th style="width:38%">Technician</th><th style="width:26%">Unit</th><th class="r">Last active (WIB)</th></tr>{recent}</table></div>
   <div class="card"><h2 class="ct">How well the manuals answered <small>7 days</small></h2>{conf_head}<ul class="conf">{conf_rows}</ul>
    <a class="feedback-summary" href="#d-s" data-dlg="d-s">Satisfaction {sat} · {n(fbk.get("up"))} positive / {n(fbk.get("down"))} negative · all time {ic("arrow", 14)}</a><h2 class="ct" style="margin-top:18px">Recent negative feedback</h2><ul class="plain">{bad}</ul></div>
  </div>

  <div class="grid g3">
   <div class="card" id="system-health"><h2 class="ct">System health</h2><ul class="sys">{sys_rows}</ul></div>
   <div class="card"><h2 class="ct">Server traffic (24h){stale('cloud')}</h2><dl class="facts">
    <dt>Technician queries</dt><dd>{n(K.get('h24', 0))}</dd>""" + (f"<dt>Load-test queries (excluded)</dt><dd>{n(K.get('loadtest24'))}</dd>" if K.get('loadtest24') else "") + f"""<dt>Voice messages</dt><dd>{n(kd.get('suara', 0))}</dd><dt>App warm-up pings</dt><dd>{n(kd.get('ping', 0))}</dd>
    <dt>Rejected (auth)</dt><dd>{n(rejected)}</dd><dt>Server errors (5xx)</dt><dd>{n(codes.get('5xx', 0))}</dd><dt>Error log entries</dt><dd>{n(cl.get('errors24', 0))}</dd></dl></div>
   <div class="card" id="ai-cost"><h2 class="ct">Estimated AI cost & models</h2><dl class="facts">
    <dt>Cost (7 days)</dt><dd>{rp(K.get('cost7'))}</dd><dt>Cost ({MONTH_LBL})</dt><dd>{rp(K.get('cost_mtd'))}</dd><dt>Queries ({MONTH_LBL})</dt><dd>{n(K.get('q_mtd'))}</dd><dt>Primary model</dt><dd>{E(cfg.get('model', '–'))}</dd>
    <dt>Fallback model</dt><dd>{E(cfg.get('fallback', '–'))}</dd><dt>Fallbacks (7 days)</dt><dd>{n(K.get('fb7'))}</dd><dt>Knowledge base</dt><dd>{n(ct.get('docs', {}).get('total'))} chunks</dd></dl></div>
  </div>

  <div class="card" id="riwayat"><h2 class="ct">Change log</h2><ul class="plain">{log}</ul></div>
  {dialogs}
  <div class="foot">Data refresh: 10 min · Page reload: 5 min · Sources: dash5.my.id, Cloud Run, Supabase (read-only) · {n(ses.get('total'))} chat sessions stored</div>
 </div>
</main></div>{JS}</body></html>"""
