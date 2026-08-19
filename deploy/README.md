# Pemasangan Dash⁵ di Server Hexindo

Tiga berkas diisi, satu perintah dijalankan. Node.js tidak perlu dipasang di server —
frontend dibangun di dalam container.

## 1. Isi konfigurasi

```bash
cp cloudrun/.env.example cloudrun/.env && nano cloudrun/.env   # backend
cp .env.example .env && nano .env                              # frontend
```

Yang wajib diisi ada di bagian **WAJIB** masing-masing berkas.

## 2. Taruh kunci service account

```bash
mkdir -p secrets
# salin berkas JSON dari Google Cloud ke secrets/sa-key.json
chmod 600 secrets/sa-key.json
```

## 3. Jalankan

```bash
docker compose up -d --build
docker compose ps
curl http://localhost:3000/health
```

Backend di port **3000**, frontend di port **8080**.

## 4. Pasang nginx sebagai pintu masuk

```bash
sudo cp deploy/nginx-server2.conf.example /etc/nginx/sites-available/dash5
sudo nano /etc/nginx/sites-available/dash5     # ganti <hostname> dan <ip-db>
sudo ln -s ../sites-available/dash5 /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Uji

| Perintah | Harus |
|---|---|
| `curl -o /dev/null -w '%{http_code}\n' http://localhost:3000/health` | `200` |
| `curl -o /dev/null -w '%{http_code}\n' -X POST https://<hostname>/api/v1/ask` | `401`, **bukan** `404` |

`401` membuktikan rute benar dan pemeriksaan token aktif. `404` berarti `proxy_pass`
masih memakai `/v1/` di belakang.

Lalu dari HP: login NIK, tanya `berapa kapasitas oli mesin` (jawaban muncul bertahap),
unggah foto layar monitor, rekam suara, refresh halaman.

## Perawatan

```bash
docker compose logs -f backend        # lihat catatan kesalahan
docker compose restart backend        # jalankan ulang
docker compose up -d --build          # setelah kode diperbarui
```

Setelah build ulang frontend, teknisi perlu **satu kali refresh** sebelum versi baru
terpakai — service worker mengambil versi baru di kunjungan berikutnya.

## Kalau bermasalah

| Gejala | Penyebab |
|---|---|
| Semua `/api/` jadi `404` | `proxy_pass` masih memakai `/v1/` di belakang |
| Container `Restarting` terus | Ada env wajib yang kosong — lihat `docker compose logs backend` |
| `/health` 200 tapi semua pertanyaan gagal | `GOOGLE_CLOUD_PROJECT` kosong |
| Semua endpoint `401`, chat mati total | `SUPABASE_URL` / `SUPABASE_ANON_KEY` salah |
| Pesan CORS | `ALLOWED_ORIGIN` tidak sama persis dengan hostname |
| Foto ditolak `413` | `client_max_body_size` belum diatur |
| Jawaban muncul sekaligus | `proxy_buffering off` atau `proxy_http_version 1.1` belum ada |
| Jawaban panjang terputus | `proxy_read_timeout` masih 60 dtk |
| Mikrofon mati, PWA tak bisa dipasang | Sertifikat SSL tidak dipercaya browser |
| `Could not load the default credentials` | `secrets/sa-key.json` tidak terbaca |
| `403` saat memanggil Vertex AI | Service account kurang role `Vertex AI User` |

## Yang harus dipastikan ke tim jaringan

Diuji dari Server 2:

```bash
curl -I https://aiplatform.googleapis.com     # diblokir -> tidak bisa menjawab sama sekali
curl -I https://api.cohere.com                # diblokir -> mutu pencarian menurun
curl http://<ip-db>:8000/auth/v1/health       # harus tembus
```
