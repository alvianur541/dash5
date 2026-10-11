"""Stage-only renderer; no service or served-generator changes."""
import copy
import html
import re
from render_base import render as base_render


def render(st, now, att, stale):
    field = st.get('fields', {}).get('adoption', {})
    adoption = field.get('value') or {}
    ready = bool(adoption.get('ready'))
    disabled = '' if ready else ' disabled'
    unknown = (adoption.get('variants', {}).get('exclude') or {}).get('unknown7')
    notice = adoption.get('notice') or 'Adoption classification unavailable; source has not been read.'
    if unknown is not None:
        notice += f' Unclassified queries (7d): {unknown}; excluded by default, included with the toggle.'
    if field.get('stale'):
        notice += ' Adoption source stale; showing last known values.'
    pages = {}
    for mode in ('exclude', 'include'):
        state = copy.deepcopy(st)
        state['_adoption_mode'] = mode
        pages[mode] = base_render(state, now, att, stale)
    head = pages['exclude'].split('<body>', 1)[0] + '<body>'
    def body(page):
        return page.split('<body>', 1)[1].split('<script>', 1)[0]
    excluded, included = body(pages['exclude']), body(pages['include'])
    ids = set(re.findall(r'\bid="([^"]+)"', included))
    for ident in sorted(ids, key=len, reverse=True):
        for attr in ('id', 'data-dlg', 'aria-labelledby', 'aria-controls'):
            included = included.replace(f'{attr}="{ident}"', f'{attr}="{ident}-include"')
        included = included.replace(f'href="#{ident}"', f'href="#{ident}-include"')
    script = '<script>' + pages['exclude'].split('<script>', 1)[1].split('</script>', 1)[0] + '</script>'
    toggle = f'<div class="card" style="max-width:1320px;margin:18px auto"><label style="display:flex;align-items:center;gap:12px;min-height:44px"><input id="include-internal" type="checkbox"{disabled}> Include internal and unclassified activity in adoption metrics</label><p role="status">{html.escape(notice)}</p></div>'
    switch = """<script>document.getElementById('include-internal').addEventListener('change',function(){
      document.querySelectorAll('dialog[open]').forEach(function(d){d.close();});
      document.querySelectorAll('[data-adoption-view]').forEach(function(v){v.hidden=(v.dataset.adoptionView==='include')!==document.getElementById('include-internal').checked;});
    });</script>"""
    return head + '<style>[hidden]{display:none!important}</style>' + toggle + '<div data-adoption-view="exclude">' + excluded + '</div><div data-adoption-view="include" hidden>' + included + '</div>' + script + switch + '</body></html>'
