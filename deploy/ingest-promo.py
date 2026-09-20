#!/usr/bin/env python3
"""Ganti seluruh chunk PROMO di Supabase dengan isi file JSON, tanpa downtime.

Jalankan di Cloud Shell:
    cd ~/dash5 && git pull
    export SUPABASE_ACCESS_TOKEN=...          # personal access token Supabase
    export GEMINI_API_KEY=...                 # opsional (AI Studio, ~20x lebih cepat)
    python3 deploy/ingest-promo.py supabase/data/promo_q2_fy2026.json

Urutan kerja: validasi -> backup chunk lama -> embed -> tulis sebagai STAGING ->
tukar dalam SATU transaksi (hapus lama + promosikan staging) -> verifikasi.
Aman diulang: embedding di-cache, staging dibersihkan tiap mulai.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

PROJECT_REF = os.environ.get('SUPABASE_PROJECT_REF', 'ipoxxshvtkragylisogv')
AKTIF       = 'PROMO Q2 FY2026'
STAGING     = 'PROMO Q2 FY2026 STAGING'
EMBED_MODEL = 'gemini-embedding-001'
DIMS        = 3072
CACHE       = '/tmp/promo-embeddings.jsonl'
DRY         = '--dry-run' in sys.argv

MODEL_DIKENAL = {'ZX48U-5A', 'ZX65USB-5A', 'ZX138MF-5G', 'ZX200-5G', 'KCM 60ZV', 'ZW140', 'GENERAL'}


def mati(pesan):
    print(f'\n[GAGAL] {pesan}')
    sys.exit(1)


def post(url, body, headers, timeout=180):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode() or 'null')
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'HTTP {e.code}: {e.read().decode()[:400]}') from None


def sql(query):
    """Jalankan SQL lewat Management API (token = SUPABASE_ACCESS_TOKEN)."""
    token = os.environ.get('SUPABASE_ACCESS_TOKEN')
    if not token:
        mati('SUPABASE_ACCESS_TOKEN belum di-export.')
    return post(f'https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query',
                {'query': query}, {'Authorization': f'Bearer {token}'})


# ---------- embedding ----------

def embed_ai_studio(teks, key):
    r = post(f'https://generativelanguage.googleapis.com/v1beta/models/{EMBED_MODEL}:embedContent?key={key}',
             {'content': {'parts': [{'text': teks}]}, 'taskType': 'RETRIEVAL_DOCUMENT',
              'outputDimensionality': DIMS}, {})
    return r['embedding']['values']


def embed_vertex(teks, project, lokasi, token):
    url = (f'https://{lokasi}-aiplatform.googleapis.com/v1/projects/{project}'
           f'/locations/{lokasi}/publishers/google/models/{EMBED_MODEL}:predict')
    r = post(url, {'instances': [{'task_type': 'RETRIEVAL_DOCUMENT', 'content': teks}],
                   'parameters': {'outputDimensionality': DIMS}},
             {'Authorization': f'Bearer {token}'})
    return r['predictions'][0]['embeddings']['values']


def buat_embedder():
    key = os.environ.get('GEMINI_API_KEY')
    if key:
        print('Embedding lewat AI Studio (jeda 1 dtk/chunk).')
        return (lambda teks: embed_ai_studio(teks, key)), 1.0
    print('GEMINI_API_KEY kosong -> lewat Vertex. Kuota 5/menit, jadi jeda 13 dtk/chunk.')
    project = (os.environ.get('GOOGLE_CLOUD_PROJECT')
               or subprocess.run(['gcloud', 'config', 'get-value', 'project'],
                                 capture_output=True, text=True).stdout.strip())
    lokasi = os.environ.get('VERTEX_LOCATION', 'asia-southeast1')
    if not project or project == '(unset)':
        mati('Project GCP tidak terbaca. Jalankan di Cloud Shell atau set GOOGLE_CLOUD_PROJECT.')
    token = subprocess.run(['gcloud', 'auth', 'print-access-token'],
                           capture_output=True, text=True).stdout.strip()
    if not token:
        mati('gcloud auth print-access-token kosong.')
    print(f'  project={project} region={lokasi}')
    return (lambda teks: embed_vertex(teks, project, lokasi, token)), 13.0


# ---------- SQL ----------

def kutip(teks):
    if '$d5$' in teks:
        mati('Isi chunk memuat penanda $d5$ — ganti penanda dulu.')
    return f'$d5${teks}$d5$'


def baris_insert(chunk, vektor, kategori):
    meta = {'Model': chunk['metadata']['Model'], 'Kategori': kategori}
    vec = '[' + ','.join(f'{v:.7g}' for v in vektor) + ']'
    return (f"({kutip(chunk['content'])}, {kutip(json.dumps(meta, ensure_ascii=False))}::jsonb, "
            f"{kutip(vec)}::vector)")


def validasi(chunks):
    """Kembalikan (jumlah per model, daftar masalah)."""
    per_model, masalah = {}, []
    for i, c in enumerate(chunks):
        isi, meta = c.get('content', ''), c.get('metadata', {})
        m, k = meta.get('Model'), meta.get('Kategori')
        if not isi.strip():
            masalah.append(f'chunk #{i} kosong')
        if m not in MODEL_DIKENAL:
            masalah.append(f'chunk #{i} Model tidak dikenal: {m!r}')
        if k != AKTIF:
            masalah.append(f'chunk #{i} Kategori {k!r} (harus {AKTIF!r})')
        if not re.search(r'Rp\s?[\d.]{3,}', isi):
            masalah.append(f'chunk #{i} ({m}) tidak memuat satu pun harga Rp')
        per_model[m] = per_model.get(m, 0) + 1
    return per_model, masalah


def main():
    if len(sys.argv) < 2 or sys.argv[1].startswith('--'):
        mati('Pakai: python3 deploy/ingest-promo.py <file.json> [--dry-run]')
    path = sys.argv[1]
    if not os.path.exists(path):
        mati(f'File tidak ada: {path}')

    data = json.load(open(path, encoding='utf-8-sig'))  # -sig: file ekspor Windows sering ber-BOM
    chunks = data['chunks'] if isinstance(data, dict) else data

    per_model, masalah = validasi(chunks)
    if masalah:
        mati('Validasi gagal:\n  - ' + '\n  - '.join(masalah[:20]))

    print(f'\nFile  : {path}')
    print(f'Chunk : {len(chunks)}')
    for m in sorted(per_model):
        print(f'  {m:<12} {per_model[m]:>3}')

    lama = sql(f"select metadata->>'Model' m, count(*) n from documents "
               f"where metadata->>'Kategori' = '{AKTIF}' group by 1 order by 1")
    print(f'\nDi database sekarang: {sum(r["n"] for r in lama)} chunk')
    for r in lama:
        print(f'  {r["m"]:<12} {r["n"]:>3}')

    if DRY:
        print('\n--dry-run: berhenti di sini, nol tulisan ke database.')
        return

    # --- backup isi lama (embedding tidak ikut; bisa dibuat ulang) ---
    dump = sql(f"select id, content, metadata from documents "
               f"where metadata->>'Kategori' = '{AKTIF}' order by id")
    nama_backup = f'promo-backup-{datetime.now():%Y%m%d-%H%M}.json'
    json.dump(dump, open(nama_backup, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'Backup chunk lama -> {nama_backup}')

    # --- embedding (cache supaya aman diulang) ---
    cache = {}
    if os.path.exists(CACHE):
        for baris in open(CACHE, encoding='utf-8'):
            try:
                o = json.loads(baris)
                cache[o['k']] = o['v']
            except json.JSONDecodeError:
                pass
        print(f'Cache embedding: {len(cache)} chunk sudah ada.')

    embed, jeda = buat_embedder()
    tulis_cache = open(CACHE, 'a', encoding='utf-8')
    vektor = []
    for i, c in enumerate(chunks, 1):
        kunci = str(hash(c['content']))
        if kunci in cache:
            vektor.append(cache[kunci])
            continue
        for percobaan in range(1, 6):
            try:
                v = embed(c['content'])
                break
            except Exception as e:  # noqa: BLE001 - kuota/jaringan, coba lagi
                print(f'  chunk {i}: {e} (percobaan {percobaan})')
                time.sleep(20 * percobaan)
        else:
            mati(f'Chunk {i} gagal di-embed 5x. Jalankan ulang skrip (cache tersimpan).')
        if len(v) != DIMS:
            mati(f'Chunk {i}: embedding {len(v)} dimensi, harus {DIMS}.')
        vektor.append(v)
        tulis_cache.write(json.dumps({'k': kunci, 'v': v}) + '\n')
        tulis_cache.flush()
        print(f'  embed {i}/{len(chunks)}', end='\r', flush=True)
        time.sleep(jeda)
    tulis_cache.close()
    print(f'\nEmbedding siap: {len(vektor)} chunk.')

    # --- tulis sebagai staging (belum terbaca aplikasi) ---
    sql(f"delete from documents where metadata->>'Kategori' = '{STAGING}'")
    BATCH = 3
    for i in range(0, len(chunks), BATCH):
        nilai = ',\n'.join(baris_insert(c, v, STAGING)
                           for c, v in zip(chunks[i:i + BATCH], vektor[i:i + BATCH]))
        sql(f'insert into documents (content, metadata, embedding) values\n{nilai}')
        print(f'  tulis {min(i + BATCH, len(chunks))}/{len(chunks)}', end='\r', flush=True)
    print()

    cek = sql(f"select count(*) n from documents where metadata->>'Kategori' = '{STAGING}'")
    if cek[0]['n'] != len(chunks):
        mati(f'Staging {cek[0]["n"]} baris, seharusnya {len(chunks)}. Tidak ada yang ditukar.')

    # --- tukar dalam satu transaksi ---
    sql(f"""begin;
delete from documents where metadata->>'Kategori' = '{AKTIF}';
update documents set metadata = jsonb_set(metadata, '{{Kategori}}', '"{AKTIF}"')
  where metadata->>'Kategori' = '{STAGING}';
commit;""")

    akhir = sql(f"select metadata->>'Model' m, count(*) n from documents "
                f"where metadata->>'Kategori' = '{AKTIF}' group by 1 order by 1")
    total = sum(r['n'] for r in akhir)
    print(f'\nSELESAI. Promo aktif sekarang {total} chunk:')
    for r in akhir:
        print(f'  {r["m"]:<12} {r["n"]:>3}')
    if total != len(chunks):
        mati(f'Jumlah akhir {total} != {len(chunks)} — periksa manual.')
    sisa = sql(f"select count(*) n from documents where metadata->>'Kategori' = '{STAGING}'")
    print(f'Sisa staging: {sisa[0]["n"]} (harus 0)')


if __name__ == '__main__':
    main()
