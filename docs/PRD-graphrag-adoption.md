# PRD: GraphRAG untuk pencarian teknis Dash5

Status: Draft v2 setelah review repository resmi

Owner: Dash5

Tanggal: 18 Oktober 2026

Target awal: ZX200-5G, kategori WORKSHOP MANUAL

Keputusan produk sementara: `GO` untuk riset terisolasi, `NO-GO` untuk dependency produksi.

## 1. Ringkasan

Dash5 saat ini mengandalkan keyword search, vector search, reranker, serta jalur khusus untuk fault code, part number, harga, dan service interval. Alur ini tetap menjadi sistem utama.

GraphRAG akan dievaluasi sebagai lapisan tambahan untuk pertanyaan teknis yang butuh hubungan antar-komponen atau informasi dari beberapa bagian manual. Contohnya: hubungan antara swing pilot valve, pilot pressure, dan swing parking brake.

GraphRAG tidak akan menggantikan retrieval yang sudah ada. Index dibuat secara offline, hasilnya harus tetap bisa ditelusuri ke `documents.id`, dan setiap query wajib mengikuti akses dokumen milik user.

### 1.1 Hasil review repository resmi Microsoft

Repository Microsoft menyebut GraphRAG sebagai contoh atau metodologi dan memperingatkan bahwa implementasinya belum ditujukan sebagai solusi production-ready. Repository juga berada dalam maintenance mode; README saat ini menyatakan project tidak menerima PR atau fitur baru, sementara diskusi komunitas tetap tersedia.[1]

Release terbaru yang tersedia saat review ini adalah `v3.3.0`. Project juga memiliki catatan breaking changes dan menyediakan migration notebook untuk upgrade tertentu ketika index lama tidak kompatibel dengan versi query yang baru.[2][8]

GraphRAG menyediakan dua metode indexing. Standard GraphRAG memakai LLM untuk entity extraction dan summarization. FastGraphRAG lebih murah, tetapi graph-nya lebih noisy dan pendekatan default-nya terutama cocok untuk teks bahasa Inggris.[3] Karena manual Dash5 dapat berisi campuran bahasa Inggris dan Indonesia, PRD tidak menetapkan FastGraphRAG sebagai pilihan default.

Artifact resmi mencakup documents, text units, entities, relationships, communities, dan community reports. Output default disimpan sebagai tabel Parquet, lalu dipakai kembali oleh mode query yang sesuai.[4][5] Integrasi Dash5 harus mengikuti schema release yang dipin, bukan schema buatan sendiri.

DRIFT menggabungkan community information dengan local search dan pertanyaan lanjutan. Mode ini cocok untuk eksperimen diagnosis lintas bagian, tetapi tidak layak menjadi default sebelum latency dan kualitasnya diukur.[6]

### 1.2 Perubahan PRD setelah review

- Versi evaluasi harus dipin ke `graphrag==3.3.0`; upgrade membutuhkan schema compatibility test. Migration notebook boleh dievaluasi, tetapi pilot memakai full rebuild agar hasilnya deterministik.
- Runtime evaluasi memakai Python 3.12 agar tetap berada dalam rentang runtime yang didokumentasikan project.[1]
- Standard GraphRAG menjadi baseline. FastGraphRAG hanya boleh dibandingkan sebagai varian biaya setelah evaluasi bahasa campuran.
- Importer harus membaca output Parquet resmi dan memiliki contract test untuk setiap tabel yang dipakai.
- Dash5 tidak boleh bergantung langsung pada internal Python API GraphRAG. Batas integrasinya adalah job offline dan artifact versioned.
- Karena status project masih maintenance/community-supported dan bukan production-ready, production adoption membutuhkan ownership internal, runbook, rollback, dan rencana fork atau penggantian library.

## 2. Masalah yang ingin diselesaikan

Retrieval berbasis potongan dokumen cukup baik untuk pertanyaan yang jawabannya berada di satu bagian. Hasilnya lebih lemah ketika teknisi bertanya tentang:

- hubungan sebab-akibat antar-komponen;
- urutan kerja sistem yang tersebar di beberapa halaman;
- diagnosis yang perlu menghubungkan gejala, tekanan, valve, sensor, dan actuator;
- ringkasan sebuah subsistem dari beberapa bagian manual.

GraphRAG berpotensi membantu kasus tersebut dengan membentuk entity, relationship, community, dan ringkasan graph dari dokumen teknis.

## 3. Tujuan

- Meningkatkan kualitas jawaban untuk pertanyaan hubungan antar-komponen dan diagnosis lintas bagian manual.
- Menjaga citation ke dokumen sumber asli Dash5.
- Menjaga batas model, kategori, dan akses dokumen user.
- Menambah kemampuan baru tanpa mengganggu jalur retrieval yang sudah stabil.
- Mengukur manfaat, biaya indexing, latency, dan risiko operasional sebelum implementasi produksi.

## 4. Bukan tujuan

Fase awal tidak mencakup:

- mengganti keyword/vector/reranker yang sekarang;
- memakai GraphRAG untuk fault code, part number, harga, atau service interval;
- membuat graph lintas model unit;
- memasukkan kategori Parts, Promo, atau data harga;
- menjalankan indexing di request path `/v1/ask`;
- mengubah Live Voice secara langsung;
- deployment atau perubahan database produksi sebelum hasil evaluasi disetujui.

## 5. Pengguna dan use case

### Teknisi

Teknisi ingin memahami hubungan antar-komponen tanpa membaca banyak halaman manual.

Contoh pertanyaan:

- "Kenapa swing parking brake tidak release walaupun pilot lever digerakkan?"
- "Komponen apa saja yang memengaruhi pilot pressure ke swing control valve?"
- "Urutan kerja sistem swing dari lever sampai motor bagaimana?"

### Product/admin Dash5

Admin ingin menilai apakah graph menambah recall dan konteks tanpa mencampur data model lain atau membocorkan dokumen yang tidak boleh diakses user.

## 6. Prinsip produk

1. Current retrieval tetap authoritative.
2. GraphRAG hanya memberi kandidat atau konteks tambahan.
3. Jawaban akhir tetap memakai evidence dari chunk dokumen asli.
4. Setiap artifact graph harus punya provenance ke satu atau lebih `documents.id`.
5. Artifact yang mencampur dokumen authorized dan unauthorized harus dibuang seluruhnya, bukan dipotong provenance-nya.
6. Kegagalan GraphRAG tidak boleh menggagalkan jawaban Dash5.
7. Index berbeda harus dibuat untuk setiap kombinasi model dan kategori yang disetujui.

## 7. Scope fase evaluasi

Dataset awal:

- Model: `ZX200-5G`
- Kategori: `WORKSHOP MANUAL`
- Jumlah dokumen: subset kecil yang disetujui sebelum indexing
- Bahasa: campuran Inggris dan Indonesia sesuai isi dokumen Dash5

Mode query yang dievaluasi:

- Local search untuk pertanyaan teknis normal yang menyebut komponen.
- DRIFT search untuk pertanyaan diagnosis mendalam yang memang meminta hubungan lintas bagian.
- Global search hanya untuk analisis admin/offline, bukan chat teknisi biasa.

## 8. Routing

GraphRAG tidak dipakai untuk:

- fault code;
- part number dan parts lookup;
- harga;
- service interval;
- query non-teknis;
- query tanpa model yang jelas;
- corpus summary oleh user biasa.

GraphRAG dapat dipertimbangkan untuk:

- pertanyaan teknis tentang komponen tertentu: local search;
- diagnosis lintas sistem yang eksplisit: DRIFT;
- analisis coverage dokumen oleh admin: global search secara offline.

## 9. Kebutuhan fungsional

### FR-1: Persiapan data

Job indexing menerima export dokumen yang sudah dibatasi berdasarkan model, kategori, dan daftar `documents.id` yang disetujui.

GraphRAG menyimpan field tambahan dari structured input di `raw_data`, sehingga metadata provenance Dash5 harus dimasukkan sejak tahap export.[7]

Setiap input GraphRAG minimal membawa:

- GraphRAG document ID;
- `original_document_id`;
- model;
- kategori;
- judul atau identitas sumber;
- teks dokumen.

### FR-2: Indexing offline

Indexing berjalan di job Python terpisah dari Cloud Run API Dash5. Request `/v1/ask` tidak boleh menunggu proses indexing.

Setiap hasil index memiliki:

- versi index;
- versi GraphRAG yang dipin;
- versi schema artifact;
- model embedding dan completion;
- waktu pembuatan;
- scope model dan kategori;
- daftar source document ID;
- status selesai atau gagal.

Job menulis `index_manifest.json` di samping output Parquet. Manifest menjadi kontrak antara job Python dan Dash5, sehingga service Dash5 tidak perlu mengimpor internal API GraphRAG.

Fase pilot tidak memakai incremental update untuk penghapusan dokumen. Ada open issue yang melaporkan dokumen yang sudah dihapus dari input masih dapat bertahan di output entity, community, dan report setelah update run.[9] Jika scope atau allow-list index berubah, job harus membuat index baru dari nol lalu mengganti pointer versi secara atomik.

### FR-3: Import artifact

Importer membaca tabel Parquet resmi GraphRAG: documents, text units, entities, relationships, communities, serta community reports.[4] Importer memetakan provenance ke `documents.id` asli melalui field metadata yang sengaja dibawa dari input dan relasi text unit milik release yang dipin.

Importer harus fail closed jika:

- provenance hilang;
- dokumen tidak dikenal;
- satu batch berisi model atau kategori berbeda;
- format artifact tidak sesuai versi yang didukung.

Contract test memakai artifact kecil yang benar-benar dihasilkan oleh versi GraphRAG yang dipin. Fixture buatan tangan tidak cukup untuk menyatakan kompatibilitas schema.

### FR-4: Authorization

Sebelum artifact dipakai, semua source document ID di artifact harus berada dalam daftar dokumen yang boleh diakses caller.

Jika sebuah entity atau summary berasal dari dua dokumen dan salah satunya tidak boleh diakses, artifact tersebut tidak boleh ditampilkan atau dipakai untuk retrieval.

### FR-5: Query enhancement

GraphRAG hanya menambah kandidat retrieval. Sistem tetap mengambil chunk asli, menjalankan reranking yang berlaku, dan membentuk citation dari source Dash5.

### FR-6: Fallback

Jika feature flag mati, artifact belum tersedia, timeout terjadi, scope tidak cocok, atau validasi gagal, Dash5 menjalankan retrieval saat ini tanpa perubahan pada response contract.

### FR-7: Observability

Shadow run dan pilot mencatat:

- route yang dipilih;
- mode GraphRAG;
- versi index;
- document IDs yang menjadi provenance;
- latency tambahan;
- token dan biaya indexing/query;
- alasan fallback;
- apakah kandidat graph masuk ke evidence akhir.

Log tidak boleh menyimpan isi dokumen sensitif atau credential.

## 10. Kebutuhan keamanan

- Tidak ada data produksi yang dipindahkan ke environment eksperimen tanpa persetujuan.
- Credential tidak disimpan di repository atau artifact index.
- Pilihan utama untuk Vertex adalah ADC. Dukungan ADC tidak diasumsikan tersedia sebelum dibuktikan dengan technical spike pada versi yang dipin. Jika jalur konfigurasi resmi tidak mendukungnya, tim harus membuat adapter model atau memakai proxy yang dikelola. Dummy API key tidak boleh dipakai.
- Index dan artifact harus dianggap sebagai data turunan dari dokumen sumber dan mengikuti kontrol akses yang sama.
- Graph lintas model dilarang pada fase awal.
- Prompt injection di isi dokumen tidak boleh mengubah scope, authorization, atau routing.

## 11. Arsitektur yang diusulkan

```text
Supabase documents
  -> export terotorisasi per model/kategori
  -> job indexing GraphRAG offline
  -> artifact immutable dan versioned
  -> importer + validasi provenance
  -> storage graph read-only
  -> GraphRAG retriever opsional
  -> current Dash5 retrieval + reranker
  -> evidence chunk asli + citation
```

Live Voice tetap memakai `/v1/ask`. Tidak ada jalur khusus GraphRAG di client.

## 12. Feature flag dan rollback

Feature flag awal: `GRAPHRAG_ENABLED=off`.

Tahap berikutnya membutuhkan flag yang dapat dibatasi berdasarkan:

- environment;
- model;
- kategori;
- user/admin allow-list;
- mode local atau DRIFT;
- versi index.

Rollback dilakukan dengan mematikan flag. Rollback tidak membutuhkan penghapusan index atau perubahan client.

## 13. Rencana evaluasi

### Tahap 1: Dataset dan gold questions

- Pilih subset dokumen ZX200-5G yang disetujui.
- Susun minimal 20 pertanyaan: named component, hubungan antar-komponen, dan diagnosis lintas bagian.
- Tetapkan expected source documents dan poin jawaban utama.

### Tahap 2: Index satu kali

- Jalankan GraphRAG secara offline.
- Catat waktu proses, token, biaya, error, dan ukuran artifact.
- Validasi seluruh artifact dapat ditelusuri ke `documents.id`.

### Tahap 3: Shadow evaluation

- Jalankan GraphRAG tanpa mengubah jawaban user.
- Bandingkan kandidat current retrieval dengan kandidat graph.
- Review manual dilakukan pada relevance, provenance, leakage, dan hallucination.

### Tahap 4: Pilot terbatas

Pilot hanya dibuka jika semua acceptance criteria terpenuhi. Awalnya hanya local search untuk user allow-list kecil. DRIFT tetap off sampai latency dan kualitas local stabil.

## 14. Metrik keberhasilan

- 100% artifact yang dipakai mempunyai provenance valid ke `documents.id`.
- 0 artifact unauthorized muncul di kandidat, prompt, jawaban, atau log.
- Minimal 20% peningkatan pertanyaan yang memperoleh semua source section yang dibutuhkan dibanding current retrieval.
- Citation correctness tidak turun dibanding baseline.
- Tidak ada regresi pada route fault code, parts, price, dan service interval.
- P95 latency tambahan local search memenuhi budget yang disepakati sebelum pilot.
- Biaya indexing dan query tercatat serta dapat diproyeksikan per model manual.

Target kualitas akhir akan ditetapkan setelah baseline 20 pertanyaan selesai diukur.

## 15. Acceptance criteria sebelum implementasi produksi

- PRD disetujui.
- Dataset dan daftar document ID disetujui.
- Adapter Vertex ADC atau metode auth lain sudah direview dari sisi security.
- Ownership internal, runbook incident, dan strategi penggantian atau fork library sudah disetujui.
- Contract test menggunakan output Parquet asli dari versi yang dipin sudah lulus.
- Indexing berhasil tanpa memakai data di luar scope.
- Semua artifact lolos provenance dan authorization test.
- Shadow evaluation menunjukkan peningkatan yang jelas.
- Estimasi biaya dan latency diterima.
- Feature flag, fallback, logging, dan rollback sudah diuji.
- Tidak ada perubahan response contract `/v1/ask`.

## 16. Risiko

- Community summary dapat mencampur isi beberapa dokumen dan membocorkan informasi jika authorization dilakukan setelah summary dipakai.
- Indexing standar memakai banyak panggilan LLM dan dapat mahal.
- Global dan DRIFT search dapat menambah latency besar.
- Perubahan versi GraphRAG dapat mengubah schema artifact.
- Project berada dalam maintenance mode, tidak menerima PR atau fitur baru, dan tidak mempunyai jalur support produksi resmi dari Microsoft.[1]
- Index dapat tidak kompatibel setelah upgrade tertentu. Project menyediakan migration notebook, tetapi Dash5 tetap membutuhkan contract test dan opsi full rebuild.[8]
- Penghapusan dokumen melalui incremental update dilaporkan dapat meninggalkan entity atau report lama di index.[9]
- Entity extraction dapat salah pada istilah teknis, singkatan, atau teks bilingual.
- Graph yang terlihat masuk akal tetap dapat menghasilkan hubungan yang tidak didukung source chunk.

Mitigasi utama: scope kecil, indexing offline, artifact immutable, authorization berdasarkan seluruh provenance, citation dari chunk asli, shadow run, dan feature flag default-off.

## 17. Keputusan yang masih dibutuhkan

- Siapa yang menyetujui daftar dokumen untuk index pertama?
- Budget maksimum indexing dan query per model berapa?
- P95 latency tambahan yang masih diterima berapa?
- Apakah adapter ADC dibuat langsung di Python GraphRAG atau melalui proxy internal?
- Storage pilot memakai object storage, Postgres, atau kombinasi keduanya?
- Siapa reviewer teknis untuk 20 gold questions?

## 18. Keputusan setelah research spike awal

Status rekomendasi saat ini: lanjut ke evaluasi terisolasi, jangan jadikan GraphRAG dependency produksi dulu.

Alasannya:

- Metodologi GraphRAG cocok diuji untuk hubungan antar-komponen yang sulit ditangani satu chunk.
- Provenance ke `documents.id` harus dibuktikan memakai output Parquet asli, bukan hanya desain mapping.
- Jalur auth Vertex ADC harus dibuktikan pada versi yang dipin dan direview dari sisi security.
- Status maintenance/community-supported membuat ownership operasional berada di tim Dash5.
- Manfaat kualitas belum boleh diklaim sebelum paid indexing dan shadow evaluation dijalankan pada dataset yang disetujui.

Keputusan adopsi setelah evaluasi hanya boleh berupa salah satu dari tiga hasil:

1. `ADOPT`: kualitas naik, biaya dan latency diterima, provenance aman, serta ownership internal siap.
2. `ADOPT CONCEPT ONLY`: gunakan pola graph retrieval, tetapi implementasikan pipeline yang lebih kecil dan terkendali tanpa runtime GraphRAG di produksi.
3. `REJECT`: tidak ada peningkatan yang cukup dibanding hybrid retrieval Dash5.

## Sources

[1] https://github.com/microsoft/graphrag — Microsoft GraphRAG repository
[2] https://github.com/microsoft/graphrag/releases — Microsoft GraphRAG releases
[3] https://microsoft.github.io/graphrag/index/methods — GraphRAG indexing methods
[4] https://microsoft.github.io/graphrag/index/outputs — GraphRAG output schemas
[5] https://microsoft.github.io/graphrag/index/default_dataflow — GraphRAG indexing dataflow
[6] https://microsoft.github.io/graphrag/query/drift_search — GraphRAG DRIFT search
[7] https://microsoft.github.io/graphrag/config/yaml — GraphRAG configuration
[8] https://github.com/microsoft/graphrag/blob/main/breaking-changes.md — GraphRAG breaking changes policy
[9] https://github.com/microsoft/graphrag/issues/2590 — GraphRAG issue 2590: removed documents remain indexed
