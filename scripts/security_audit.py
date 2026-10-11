"""Heuristic local audit; prints paths/classes/counts only, never values.

Run: python3 scripts/security_audit.py [repo]
History coverage: every blob reachable from every locally fetched git ref.
Fetch remote heads/tags first. Does not inspect unreachable/pruned objects.
"""
import base64
from collections import Counter
import json
from pathlib import Path
import re
import subprocess
import sys

PATTERNS = {
    'google_api_key': r'AIza[0-9A-Za-z_-]{35}',
    'openai_or_anthropic_key': r'(?<![a-z-])sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}',
    'supabase_management_token': r'sbp_[A-Za-z0-9]{40,}',
    'supabase_secret_key': r'sb_secret_[A-Za-z0-9_-]{10,}',
    'supabase_public_publishable_key': r'sb_publishable_[A-Za-z0-9_-]{10,}',
    'aws_access_key_id': r'AKIA[0-9A-Z]{16}',
    'github_token': r'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})',
    'slack_token': r'xox[abpr]-[A-Za-z0-9-]{10,}',
    'stripe_live_key': r'(?:sk|rk)_live_[A-Za-z0-9]{20,}',
    'private_key': r'-----BEGIN [A-Z ]*PRIVATE KEY-----',
    'service_account_json': r'"private_key_id"\s*:',
}
JWT = re.compile(r'eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{10,}')
ASSIGN = re.compile(r'''(?im)(?:[A-Z_]*(?:API_KEY|ACCESS_TOKEN|PASSWORD|SERVICE_ROLE_KEY|CLIENT_SECRET)|["'](?:api_key|secret|token|password|service_role)["'])\s*[:=]\s*["']?([A-Za-z0-9_.+/=-]{16,})''')


def classify(text):
    counts = Counter()
    covered = []
    for name, pattern in PATTERNS.items():
        matches = list(re.finditer(pattern, text))
        if matches:
            counts[name] += len(matches)
            covered.extend((m.start(), m.end()) for m in matches)
    for match in JWT.finditer(text):
        try:
            payload = match.group().split('.')[1]
            role = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4))).get('role')
        except (ValueError, UnicodeError):
            role = None
        role_class = 'supabase_service_role_jwt'
        name = {'anon': 'supabase_public_anon_jwt', 'service_role': role_class}.get(str(role), 'jwt_unknown_role')
        counts[name] += 1
        covered.append((match.start(), match.end()))
    for match in ASSIGN.finditer(text):
        value = match.group(1)
        if any(a <= match.start(1) < b for a, b in covered):
            continue
        if re.search(r'your[_-]|example|placeholder|process\.env|import\.meta|changeme', value, re.I):
            continue
        quoted = text[match.start(1) - 1] in ('"', "'")
        if not quoted and re.fullmatch(r'[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+', value) and text[match.end(1):match.end(1) + 1] in (',', '}', ')'):
            continue
        counts['generic_credential_assignment'] += 1
    return dict(counts)


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args])


def audit(repo):
    results = {'coverage': {}, 'findings': []}
    tracked = git(repo, 'ls-files', '-z').decode().split('\0')
    for path in filter(None, tracked):
        file = repo / path
        if file.is_file():
            hits = classify(file.read_bytes().decode('utf-8', errors='ignore'))
            if hits:
                results['findings'].append({'surface': 'tracked', 'path': path, 'classes': hits})
    objects = git(repo, 'rev-list', '--objects', '--all').decode().splitlines()
    blobs = 0
    proc = subprocess.Popen(['git', '-C', str(repo), 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    assert proc.stdin is not None and proc.stdout is not None
    try:
        for line in objects:
            oid, _, path = line.partition(' ')
            proc.stdin.write((oid + '\n').encode())
            proc.stdin.flush()
            header = proc.stdout.readline().decode().split()
            size = int(header[2])
            data = proc.stdout.read(size)
            proc.stdout.read(1)
            if header[1] != 'blob':
                continue
            blobs += 1
            hits = classify(data.decode('utf-8', errors='ignore'))
            if hits:
                results['findings'].append({'surface': 'history', 'blob': oid, 'representative_path': path, 'classes': hits})
    finally:
        proc.stdin.close()
        proc.wait()
    ignored_files = [p for p in (repo / 'secrets').rglob('*') if p.is_file()]
    ignored_files += [p for p in repo.glob('.env*') if p.name != '.env.example']
    for file in ignored_files:
        hits = classify(file.read_bytes().decode('utf-8', errors='ignore'))
        if hits:
            results['findings'].append({'surface': 'local', 'path': str(file.relative_to(repo)), 'classes': hits})
    results['coverage'] = {
        'tracked_files': len(list(filter(None, tracked))),
        'history_blobs': blobs,
        'commits': int(git(repo, 'rev-list', '--all', '--count')),
        'refs': git(repo, 'for-each-ref', '--format=%(refname)').decode().splitlines(),
        'local_sensitive_files': len(ignored_files),
    }
    return results


if __name__ == '__main__':
    root = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
    print(json.dumps(audit(root), indent=2))
