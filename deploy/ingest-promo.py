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
import hashlib
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
    token = (os.environ.get('SUPABASE_ACCESS_TOKEN') or '').strip()
    if not token:
        mati('SUPABASE_ACCESS_TOKEN belum di-export.')
    if not token.startswith('sbp_') or len(token) < 40:
        mati(f'Token tidak berbentuk token Supabase ({len(token)} karakter, diawali {token[:4]!r}).\n'
             'Tempelannya kemungkinan tidak masuk penuh. Ulangi:\n'
             '  read -rs SUPABASE_ACCESS_TOKEN && export SUPABASE_ACCESS_TOKEN')
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
    simpan = {'token': '', 'saat': 0.0}

    def token_segar():
        if time.time() - simpan['saat'] > 1500:  # token gcloud berlaku 1 jam; perbarui tiap 25 menit
            simpan['token'] = subprocess.run(['gcloud', 'auth', 'print-access-token'],
                                             capture_output=True, text=True).stdout.strip()
            simpan['saat'] = time.time()
            if not simpan['token']:
                mati('gcloud auth print-access-token kosong.')
        return simpan['token']

    token_segar()
    print(f'  project={project} region={lokasi}')
    return (lambda teks: embed_vertex(teks, project, lokasi, token_segar())), 13.0


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
    """Kembalikan (jumlah per model, masalah fatal, chunk tanpa harga yang dilewati)."""
    per_model, masalah, tanpa_harga = {}, [], []
    for i, c in enumerate(chunks):
        isi, meta = c.get('content', ''), c.get('metadata', {})
        m, k = meta.get('Model'), meta.get('Kategori')
        if not isi.strip():
            masalah.append(f'chunk #{i} kosong')
        if m not in MODEL_DIKENAL:
            masalah.append(f'chunk #{i} Model tidak dikenal: {m!r}')
        if k != AKTIF:
            masalah.append(f'chunk #{i} Kategori {k!r} (harus {AKTIF!r})')
        # Section placeholder tanpa satu pun harga tidak berguna dicari — dilewati, bukan fatal.
        if not re.search(r'Rp\s?[\d.]{3,}', isi):
            tanpa_harga.append((i, isi.split('\n')[0][:90]))
            continue
        per_model[m] = per_model.get(m, 0) + 1
    return per_model, masalah, tanpa_harga


def baca_chunks(path):
    if not os.path.exists(path):
        mati(f'File tidak ada: {path}')
    data = json.load(open(path, encoding='utf-8-sig'))  # -sig: file ekspor Windows sering ber-BOM
    chunks = data['chunks'] if isinstance(data, dict) else data
    per_model, masalah, tanpa_harga = validasi(chunks)
    if masalah:
        mati('Validasi gagal:\n  - ' + '\n  - '.join(masalah[:20]))
    if tanpa_harga:
        print(f'\nDilewati {len(tanpa_harga)} chunk tanpa satu pun harga (tidak berguna dicari):')
        for i, judul in tanpa_harga:
            print(f'  #{i}  {judul}')
        lewati = {i for i, _ in tanpa_harga}
        chunks = [c for i, c in enumerate(chunks) if i not in lewati]
    return chunks, per_model


def embed_semua(chunks):
    """Embed tiap chunk; hasil di-cache supaya skrip aman diulang."""
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
        kunci = hashlib.sha1(c['content'].encode('utf-8')).hexdigest()
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
    return vektor


def tukar(chunks, vektor):
    """Tulis sebagai staging, lalu tukar dengan yang aktif dalam satu transaksi."""
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


def mode_embed_only(path, keluaran):
    """Cloud Shell: cukup buat embedding-nya, tanpa menyentuh database sama sekali."""
    chunks, per_model = baca_chunks(path)
    print(f'\nFile  : {path}\nChunk : {len(chunks)}')
    for m in sorted(per_model):
        print(f'  {m:<12} {per_model[m]:>3}')
    vektor = embed_semua(chunks)
    with open(keluaran, 'w', encoding='utf-8') as f:
        for c, v in zip(chunks, vektor):
            f.write(json.dumps({'content': c['content'], 'metadata': c['metadata'], 'embedding': v},
                               ensure_ascii=False) + '\n')
    mb = os.path.getsize(keluaran) / 1024 / 1024
    print(f'\nTersimpan: {keluaran} ({mb:.1f} MB, {len(chunks)} baris). Nol tulisan ke database.')
    print('Unduh file itu (menu ⋮ → Download), lalu penulisan ke database dikerjakan dari laptop.')


def mode_tulis(path):
    """Laptop: pakai hasil --embed-only, tulis + tukar (token Supabase dari env laptop)."""
    rows = [json.loads(b) for b in open(path, encoding='utf-8') if b.strip()]
    chunks, per_model = [], {}
    vektor = []
    for i, r in enumerate(rows):
        if len(r.get('embedding', [])) != DIMS:
            mati(f'Baris {i}: embedding {len(r.get("embedding", []))} dimensi, harus {DIMS}.')
        chunks.append({'content': r['content'], 'metadata': r['metadata']})
        vektor.append(r['embedding'])
    per_model, masalah, tanpa_harga = validasi(chunks)
    if masalah or tanpa_harga:
        mati('Validasi gagal:\n  - ' + '\n  - '.join(masalah + [f'chunk #{i} tanpa harga' for i, _ in tanpa_harga]))
    print(f'\nSiap tulis: {len(chunks)} chunk')
    for m in sorted(per_model):
        print(f'  {m:<12} {per_model[m]:>3}')
    dump = sql(f"select id, content, metadata from documents "
               f"where metadata->>'Kategori' = '{AKTIF}' order by id")
    nama_backup = f'promo-backup-{datetime.now():%Y%m%d-%H%M}.json'
    json.dump(dump, open(nama_backup, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'Backup {len(dump)} chunk lama -> {nama_backup}')
    tukar(chunks, vektor)


def main():
    if len(sys.argv) < 2 or sys.argv[1].startswith('--'):
        mati('Pakai: python3 deploy/ingest-promo.py <file.json> [--dry-run|--embed-only <keluaran.jsonl>]\n'
             '       python3 deploy/ingest-promo.py --tulis <hasil-embed.jsonl>')
    if sys.argv[1] == '--tulis':
        if len(sys.argv) < 3:
            mati('Pakai: --tulis <hasil-embed.jsonl>')
        return mode_tulis(sys.argv[2])
    path = sys.argv[1]
    if '--embed-only' in sys.argv:
        i = sys.argv.index('--embed-only')
        keluaran = sys.argv[i + 1] if len(sys.argv) > i + 1 else 'promo-embedded.jsonl'
        return mode_embed_only(path, keluaran)

    chunks, per_model = baca_chunks(path)

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

    vektor = embed_semua(chunks)
    tukar(chunks, vektor)


if __name__ == '__main__':
    main()
