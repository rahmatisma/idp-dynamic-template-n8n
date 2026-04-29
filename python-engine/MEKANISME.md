# 🧠 MEKANISME PYTHON ENGINE — IDP Pipeline
## Intelligent Document Processing (IDP) — Lintasarta

---

## 📌 GAMBARAN BESAR ALUR SISTEM

```
USER UPLOAD PDF (Laravel)
        ↓
n8n Webhook Trigger
        ↓
[1] POST /convert-pdf  → Python Engine
        ↓  (PDF → PNG per halaman)
[2] POST /process      → Python Engine
        ↓
    HybridProcessor.process()
        ↓
    extract_document()
        ├── fetch_active_templates()   ← Ambil config dari Laravel
        ├── preprocess_image()         ← Bersihkan gambar (CLAHE + denoise)
        ├── run_global_ocr()           ← PaddleOCR scan SATU KALI
        ├── detect_template()          ← Auto-Detect template (Fuzzy Match)
        ├── extract_fields()           ← Ekstrak field header
        └── extract_table()            ← Ekstrak baris tabel
                ↓
    _evaluate_page()  → Hitung TP/FP/FN
                ↓
    Return JSON → n8n → Laravel Database
```

---

## 📁 STRUKTUR FILE

| File | Tanggung Jawab |
|---|---|
| `main.py` | Entry point Flask. Inisialisasi server + pre-warm TrOCR |
| `app/api/routes.py` | HTTP Layer. Menerima request dari n8n dan Laravel |
| `app/services/processor.py` | **Orchestrator**. Memanggil OCR + menghitung TP/FP/FN |
| `app/services/ocr_engine.py` | **Orkestrator Ekstraksi**. Koordinasi semua service |
| `app/services/table_extractor.py` | Logika ekstraksi tabel dinamis |
| `app/services/field_extractor.py` | Logika ekstraksi field header |
| `app/services/template_mapper.py` | Pencarian anchor + kalkulasi koordinat box |
| `app/services/ocr_service.py` | Wrapper PaddleOCR (singleton instance) |
| `app/services/trocr_service.py` | Wrapper TrOCR Microsoft (model HuggingFace) |
| `app/services/preprocessor.py` | Pre-processing gambar (CLAHE, denoise) |
| `app/services/pdf_converter.py` | Konversi PDF ke PNG per halaman |
| `app/services/json_builder.py` | Susun output terstruktur (hierarchical JSON) |

---

## 🔷 LANGKAH 0 — SERVER START (`main.py`)

Saat Abang menjalankan `python main.py`, ini yang terjadi:

1. **Load `.env`** — Membaca konfigurasi (port Flask, URL Laravel, apakah TrOCR aktif, dll).
2. **Buat Flask App** — Inisialisasi server HTTP dengan CORS diizinkan (agar Laravel dan n8n bisa kirim request).
3. **Register Routes** — Daftarkan semua endpoint (`/health`, `/convert-pdf`, `/process`, dll).
4. **Pre-warm TrOCR** — Model TrOCR (`microsoft/trocr-base-handwritten`, ~1GB) di-load ke RAM di **background thread** agar tidak memblokir request pertama dari n8n. Proses ini hanya terjadi satu kali saat server start.

```python
# main.py — baris kunci
from app.services.trocr_service import prewarm_trocr
prewarm_trocr()  # ← Jalan di background, tidak blocking
app.run(debug=FLASK_DEBUG, port=FLASK_PORT, use_reloader=False)
# use_reloader=False → Penting! Agar prewarm tidak dipanggil 2x
```

---

## 🔷 LANGKAH 1 — KONVERSI PDF ke PNG (`/convert-pdf`)

**Dipanggil oleh:** n8n Node "Convert PDF"

**Request JSON dari n8n:**
```json
{
  "document_id": 81,
  "file_path": "documents/namafile.pdf"
}
```

**Yang dilakukan:**
1. Terima path PDF dari n8n.
2. Jika path **relatif** (misal: `documents/abc.pdf`), otomatis diarahkan ke folder `storage/app/public/` milik Laravel.
3. Panggil `pdf_converter.convert_if_not_exists()` — Konversi tiap halaman PDF menjadi file PNG menggunakan library `pdf2image` (berbasis Poppler).
4. File PNG disimpan di `python-engine/storage/pages/namafile/page_1.png`, `page_2.png`, dst.

**Response ke n8n:**
```json
{
  "status": "ok",
  "document_id": 81,
  "total_pages": 3,
  "pages": ["storage/pages/namafile/page_1.png", "..."],
  "image_url": "http://localhost:5000/static/pages/namafile/page_1.png"
}
```

> **Kenapa dikonversi dulu?** OCR engine (PaddleOCR dan TrOCR) tidak bisa membaca PDF secara langsung. Mereka hanya bisa membaca file gambar (PNG/JPG).

---

## 🔷 LANGKAH 2 — PIPELINE UTAMA OCR (`/process`)

**Dipanggil oleh:** n8n Node "Process OCR (Python AI)"

**Request JSON dari n8n:**
```json
{
  "document_id": 81,
  "file_path": "documents/namafile.pdf",
  "template_code": "form_pm_vendor_a",
  "all_templates": [ ... ]
}
```

Semua proses di sini dijalankan oleh `HybridProcessor.process()`.

---

## 🔷 LANGKAH 3 — ORCHESTRATOR (`processor.py` → `HybridProcessor`)

`HybridProcessor` adalah "bos" yang mengatur urutan kerja. Dia hanya punya 3 tugas:

### Tugas 1: Panggil Ekstraksi
```python
result = extract_document(pdf_path, template_code, document_id, all_templates)
```
Ini memanggil `ocr_engine.py` untuk menjalankan seluruh pipeline ekstraksi.

### Tugas 2: Evaluasi Kualitas (TP/FP/FN)
Setelah ekstraksi selesai, untuk setiap halaman, `HybridProcessor` memanggil `_evaluate_page()` untuk menilai kualitas hasil.

### Tugas 3: Hitung Summary & Return
Menggabungkan TP/FP/FN dari semua halaman menjadi satu summary dan menambahkannya ke hasil akhir.

---

## 🔷 LANGKAH 4 — EKSTRAKSI DOKUMEN (`ocr_engine.py` → `extract_document`)

Ini adalah inti dari seluruh sistem. Dikerjakan per halaman PDF.

### Sub-Langkah 4.1: Ambil Data Template

```python
if not all_templates:
    all_templates = fetch_active_templates()
```

Jika n8n tidak mengirimkan daftar template, Python Engine **mengambil sendiri** dari Laravel API (`GET /api/templates`). Ini mekanisme "jemput bola" agar sistem tetap bekerja meski n8n tidak lengkap mengirimkan data.

### Sub-Langkah 4.2: Pre-processing Gambar

```python
clean_img_path = preprocess_image(str(img_path))
```

Sebelum di-OCR, gambar dibersihkan terlebih dahulu oleh `preprocessor.py`:
- **CLAHE (Contrast Limited Adaptive Histogram Equalization)** — Meningkatkan kontras gambar secara adaptif, sangat efektif untuk dokumen foto yang kurang cahaya.
- **Gaussian Blur + Denoise** — Mengurangi noise/bintik-bintik yang bisa menyebabkan karakter OCR palsu.
- Hasilnya disimpan sebagai file PNG baru (dengan suffix `_clean`).

### Sub-Langkah 4.3: Global OCR Scan (SATU KALI)

```python
ocr_results = run_global_ocr(clean_img_path)
```

**Ini adalah tahap paling penting dari optimasi performa sistem.**

PaddleOCR hanya dipanggil **SATU KALI per halaman**. Hasilnya adalah daftar semua teks yang ditemukan beserta koordinatnya:

```python
# Contoh output ocr_results:
[
  { "text": "PREVENTIVE MAINTENANCE", "x": 300, "y": 45, "w": 250, "h": 20, "confidence": 0.98 },
  { "text": "Location",               "x": 50,  "y": 120, "w": 80,  "h": 18, "confidence": 0.95 },
  { "text": "Grand Mall Bekasi",       "x": 200, "y": 120, "w": 150, "h": 18, "confidence": 0.89 },
  ...
]
```

Hasil ini kemudian **dipakai ulang** oleh field_extractor dan table_extractor tanpa harus memanggil OCR lagi. Ini menghemat waktu secara drastis.

### Sub-Langkah 4.4: Auto-Detect Template

```python
match_result = detect_template(str(img_path), all_templates)
```

Sistem mencari tahu **dokumen ini templatenya apa** dengan cara:

1. **Baca Header** (`read_header()`) — Baca area atas dokumen (judul + nomor dokumen).
2. **Fuzzy Matching** — Bandingkan teks header dengan `identifier_text` dari setiap template di database menggunakan dua strategi:
   - `fuzz.partial_ratio` — Tahan terhadap typo dan OCR error
   - `fuzz.token_sort_ratio` — Tahan terhadap urutan kata yang terbalik
3. **Ambil skor tertinggi** — Template dengan skor tertinggi dipilih.

**Sistem Status (Kasta):**
| Skor | Status | Aksi |
|---|---|---|
| ≥ 80 | `matched` | Lanjut ekstraksi normal |
| 60–79 | `low_confidence` | Lanjut ekstraksi, tapi tandai sebagai low confidence |
| < 60 | `unknown` | Skip halaman ini, catat sebagai `failed` |

### Sub-Langkah 4.5: Ekstraksi Field Header

```python
fields_data = extract_fields(ocr_results, fields_config, image_path=clean_img_path)
```

`field_extractor.py` menggunakan `ocr_results` (yang sudah ada dari langkah 4.3) untuk mencari nilai tiap field berdasarkan `mapping_config` dari template.

**Cara kerjanya (Anchor-Based):**
1. Dari `fields_config`, ambil `anchor_keyword` (misal: `"Location"`).
2. Cari teks `"Location"` di `ocr_results` menggunakan fuzzy matching.
3. Setelah anchor ditemukan, hitung koordinat target box (di mana nilai field seharusnya berada) berdasarkan `offset_x`, `offset_y`, `width`, `height` dari config.
4. Cari semua teks OCR yang masuk dalam target box tersebut → itulah nilai field-nya.

**Untuk field `type: "handwriting"`:**
- Area target di-crop dari gambar bersih.
- Crop dikirim ke TrOCR (`read_handwritten(crop)`) untuk dibaca menggunakan model AI khusus tulisan tangan.

### Sub-Langkah 4.6: Ekstraksi Tabel

```python
for table_cfg in tables_config:
    rows = extract_table(ocr_results, table_cfg, anchor, image_path=clean_img_path)
```

Untuk setiap tabel yang ada di template, `table_extractor.py` menjalankan pipeline berikut:

#### Tahap A: Temukan Anchor Tabel
`find_anchor(ocr_results, anchor_text)` — Cari teks header tabel (misal: `"No"` atau `"Descriptions"`) di `ocr_results`. Posisi X anchor ini menjadi titik referensi (koordinat 0) untuk semua kolom tabel.

#### Tahap B: Filter Area Tabel
Ambil hanya item OCR yang berada di dalam area tabel (berdasarkan `offset_y` dan `height` dari config).

#### Tahap C: Pengelompokan Baris (`group_by_y`)
Sistem memiliki dua metode:

**1. Gap-Based (Default):**
Item OCR diurutkan berdasarkan Y, lalu dikelompokkan berdasarkan jarak Y antar item. Jika jarak Y lebih besar dari threshold (60% rata-rata tinggi box), dianggap baris baru.

**2. Anchor-Based (Lebih Akurat):**
Digunakan jika ada kolom dengan `is_row_anchor: true` di config. Sistem pertama-tama mencari semua item di kolom anchor tersebut — setiap item di kolom anchor = satu baris. Lalu semua item lain di-assign ke baris yang Y-nya paling dekat.

#### Tahap D: Pembagian Kolom (`split_by_x`)
Untuk setiap baris, tiap item OCR diklasifikasikan ke kolom berdasarkan posisi center X-nya relatif terhadap anchor tabel.

- **Kolom `type: "printed"`** → Langsung ambil teks dari `ocr_results` (cepat, sudah ada).
- **Kolom `type: "handwritten"`** → Crop area sel dari gambar, kirim ke TrOCR.

**Optimasi Penting:** Sebelum memanggil TrOCR (yang lambat), sistem mengecek dulu apakah PaddleOCR melihat sesuatu di area tersebut. Jika tidak ada sama sekali, sel kemungkinan kosong dan TrOCR dilewati (skip).

#### Tahap E: Merge Multi-Line Rows
Beberapa baris fisik bisa jadi satu baris logis (misal: deskripsi panjang yang terbagi jadi 2 baris di dokumen). `merge_multi_line_rows()` menggabungkannya berdasarkan kolom `is_row_anchor` dan flag `multi_line`.

### Sub-Langkah 4.7: Susun Output Terstruktur

```python
structured_out = build_hierarchical_json(fixed_results, table_results)
```

`json_builder.py` menyusun hasil field dan tabel menjadi JSON terstruktur yang rapi:

```json
{
  "document": { "no_dok": "FM-LAP-001", "versi": "1.0" },
  "header":   { "location": "Grand Mall Bekasi", "date_time": "01/01/2026" },
  "checklist": { "copyright": "© PT. APLIKANUSA LINTASARTA" }
}
```

---

## 🔷 LANGKAH 5 — EVALUASI KUALITAS (`processor.py` → `_evaluate_page`)

Setelah semua halaman diekstraksi, `HybridProcessor._evaluate_page()` mengevaluasi kualitas hasilnya **tanpa memerlukan ground truth (data acuan)**.

### Definisi TP, FP, FN

| Istilah | Kepanjangan | Arti | Kondisi |
|---|---|---|---|
| **TP** | True Positive | Field **berhasil** diekstrak | Nilai ada & panjang ≥ 2 karakter |
| **FP** | False Positive | Field **meragukan** (noise OCR) | Nilai ada tapi panjang = 1 karakter |
| **FN** | False Negative | Field **gagal** diekstrak | Nilai kosong/null/none |

### Evaluasi Field Header (Fixed Fields)
Semua field dalam `fields` (misal: `location`, `date_time`, `no_dok`) dievaluasi satu per satu dengan aturan di atas.

```python
if val_str == "" or val_str.lower() in ("null", "none"):
    fn += 1   # Gagal baca
elif len(val_str) == 1:
    fp += 1   # Noise OCR
else:
    tp += 1   # Berhasil
```

### Evaluasi Tabel
Untuk setiap baris tabel, setiap sel dievaluasi dengan aturan yang sama. Baris yang semua selnya kosong langsung dihitung sebagai 1 FN (bukan per-sel).

### Penghitungan Metrik Akhir

```python
Precision = TP / (TP + FP)   # Seberapa akurat yang diklaim berhasil
Recall    = TP / (TP + FN)   # Seberapa banyak field yang berhasil dibaca
F1 Score  = 2 × (P × R) / (P + R)  # Rata-rata harmonis Precision & Recall
```

---

## 🔷 LANGKAH 6 — RESPONSE AKHIR KE n8n

Setelah semua proses selesai, Python Engine mengembalikan JSON lengkap ini ke n8n:

```json
{
  "status": "ok",
  "document_id": 81,
  "confidence_score": 87.5,
  "total_pages": 1,
  "tp": 24,
  "fp": 1,
  "fn": 3,
  "eval_summary": {
    "precision": 0.960,
    "recall":    0.889,
    "f1_score":  0.923
  },
  "pages": [
    {
      "page": 1,
      "status": "matched",
      "confidence": 87.5,
      "template_id": 3,
      "template_name": "Form PM Vendor A",
      "header": "PREVENTIVE MAINTENANCE FM-LAP-001",
      "tp": 24,
      "fp": 1,
      "fn": 3,
      "fields": {
        "document": { "no_dok": "FM-LAP-001", "versi": "1.0" },
        "header":   { "location": "Grand Mall Bekasi", "date_time": "01/01/2026" }
      },
      "tables": {
        "checklist": [
          { "no": "1", "descriptions": "AC input voltage", "result": "238V", "status": "OK" },
          { "no": "2", "descriptions": "AC output voltage", "result": "220V", "status": "OK" }
        ]
      }
    }
  ]
}
```

---

## 🔷 LANGKAH 7 — n8n MENERUSKAN KE LARAVEL

n8n menerima JSON di atas, lalu:
1. **Node IF** — Mengecek apakah `confidence_score > 80`.
2. **Jika TRUE (≥80)** → Node "Update Status SUCCESS" → `PATCH /api/documents/{id}` dengan `status: "completed"`.
3. **Jika FALSE (<80)** → Node "Update Status LOW CONFIDENCE" → `PATCH /api/documents/{id}` dengan `status: "need_validation"`.

Data yang dikirim ke Laravel:
```json
{
  "status": "completed",
  "confidence_score": 87.5,
  "tp": 24,
  "fp": 1,
  "fn": 3,
  "template_id": 3,
  "fields": { ... },
  "tables": { ... }
}
```

Laravel menyimpannya ke tabel `documents` di database (PostgreSQL Supabase).

---

## 🔷 MODEL AI YANG DIGUNAKAN

### 1. PaddleOCR (Printed Text)
- **Fungsi:** Membaca teks cetak (printed) dari dokumen.
- **Kelebihan:** Sangat cepat, akurat untuk teks cetak, mendukung Bahasa Indonesia.
- **Dipanggil:** 1x per halaman (Global OCR), hasilnya di-reuse.
- **Output:** List teks beserta koordinat (x, y, w, h) dan confidence.

### 2. TrOCR — `microsoft/trocr-base-handwritten` (Handwritten Text)
- **Fungsi:** Membaca tulisan tangan (handwritten) pada sel tabel atau field tertentu.
- **Kelebihan:** Model transformer khusus handwriting dari Microsoft, jauh lebih akurat dari PaddleOCR untuk tulisan tangan.
- **Ukuran Model:** ~1GB, di-download otomatis saat pertama kali digunakan.
- **Loading:** Lazy-init + pre-warm saat server start (hanya 1x).
- **Dipanggil:** Per sel/field yang memiliki `type: "handwritten"` di config template.
- **Optimasi:** Di-skip jika PaddleOCR tidak mendeteksi visual apapun di area tersebut.

### 3. RapidFuzz (Fuzzy String Matching)
- **Fungsi:** Mencocokkan teks OCR dengan identifier/anchor template secara toleran terhadap typo.
- **Algoritma:** `partial_ratio` + `token_sort_ratio` — Tahan terhadap OCR noise dan urutan kata.

---

## 🔷 KONFIGURASI TEMPLATE (Mapping Config)

Template disimpan di database Laravel dalam kolom `mapping_config` (format JSON). Ini adalah "otak" yang mengajarkan sistem cara membaca dokumen.

**Contoh struktur mapping_config:**
```json
{
  "identifier_text": "PREVENTIVE MAINTENANCE FM-LAP",
  "fields": [
    {
      "field_name": "location",
      "field_type": "printed",
      "anchor_keyword": "Location",
      "offset_x": 120,
      "offset_y": -5,
      "width": 200,
      "height": 25
    },
    {
      "field_name": "teknisi",
      "field_type": "handwriting",
      "anchor_keyword": "Teknisi",
      "offset_x": 100,
      "offset_y": 0,
      "width": 180,
      "height": 30
    }
  ],
  "tables": [
    {
      "table_name": "checklist",
      "json_key": "checklist",
      "anchor": { "texts": ["No", "Descriptions"] },
      "area": { "offset_y": 30, "height": 500 },
      "row_detection": { "method": "anchor_based" },
      "columns": [
        { "key": "no",           "type": "printed",     "offset_x_start": 0,   "offset_x_end": 50,  "is_row_anchor": false },
        { "key": "descriptions", "type": "printed",     "offset_x_start": 50,  "offset_x_end": 350, "is_row_anchor": true, "multi_line": true },
        { "key": "result",       "type": "handwritten", "offset_x_start": 350, "offset_x_end": 500, "is_row_anchor": false },
        { "key": "status",       "type": "printed",     "offset_x_start": 500, "offset_x_end": 650, "is_row_anchor": false }
      ]
    }
  ]
}
```

---

## 🔷 TROUBLESHOOTING UMUM

| Error | Penyebab | Solusi |
|---|---|---|
| `n8n timeout ECONNABORTED` | Dokumen besar, TrOCR lambat | Naikkan timeout n8n ke 900.000ms |
| `confidence_score: null` di Laravel | Nama field salah di n8n body | Pastikan pakai `confidence_score` (bukan `confidence`) |
| `405 Method Not Allowed` | URL tidak ada ID dokumen | Pastikan URL: `.../api/documents/{{ $json.document_id }}` |
| `Wrong type: '100\n'` di IF | n8n menerima angka sebagai string | Gunakan `parseInt($json.confidence_score)` di node IF |
| `Template tidak dikenali` | Skor fuzzy < 60 | Cek `identifier_text` di template vs teks header dokumen |
| TrOCR lama load | Model 1GB belum di-cache | Tunggu prewarm selesai, cek log terminal |

---

## 🔷 RINGKASAN ALUR DATA (End-to-End)

```
PDF Dokumen
    ↓ (convert_if_not_exists)
PNG per Halaman
    ↓ (preprocess_image)
PNG Bersih (CLAHE + Denoise)
    ↓ (run_global_ocr → PaddleOCR)
List Teks + Koordinat (ocr_results)
    ↓ (detect_template → fuzzy match)
Template Terpilih (mapping_config)
    ↓
    ├── extract_fields() → field_extractor
    │       ├── Printed field → ambil dari ocr_results
    │       └── Handwritten field → crop → TrOCR
    │
    └── extract_table() → table_extractor
            ├── find_anchor() → lokasi tabel
            ├── group_by_y() / group_by_y_anchor() → baris
            ├── split_by_x() → kolom per baris
            │       ├── Printed col → dari ocr_results
            │       └── Handwritten col → crop → TrOCR
            └── merge_multi_line_rows() → baris logis
    ↓
build_hierarchical_json() → Structured Output
    ↓
_evaluate_page() → TP / FP / FN / Precision / Recall / F1
    ↓
JSON Response → n8n → PATCH /api/documents/{id} → Laravel DB
```

---

*Dokumen ini dibuat berdasarkan kode aktual di folder `python-engine/`. Diperbarui: April 2026.*
