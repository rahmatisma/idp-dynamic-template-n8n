# 🔍 MEKANISME OCR — Dari Upload User Sampai Data Tersimpan
## IDP Pipeline — Lintasarta

---

## 📌 ALUR BESAR (BIG PICTURE)

```
USER klik "Upload PDF"
        ↓
Laravel: Simpan file ke storage, kirim trigger ke n8n
        ↓
n8n Node 1: Create Document (DB)       → Buat baris baru di tabel documents
        ↓
n8n Node 2: Update Status → Processing → Tandai dokumen sedang diproses
        ↓
n8n Node 3: Convert PDF (Python)       → PDF dipecah jadi PNG per halaman
        ↓
n8n Node 4: Process OCR (Python AI)    → Pipeline OCR berjalan penuh
        ↓
n8n Node 5: IF Confidence > 80?
        ├── TRUE  → Update Status: completed
        └── FALSE → Update Status: need_validation
        ↓
Laravel Database → Data tersimpan ✅
```

---

## 🔷 FASE 1 — USER UPLOAD PDF (Laravel)

User membuka halaman `/upload` dan memilih file PDF.

**Yang terjadi di Laravel (`DocumentController@store`):**

1. Validasi file — harus PDF, maksimal 10MB.
2. File PDF disimpan ke `storage/app/public/documents/namafile.pdf`.
3. Laravel kirim trigger HTTP ke n8n webhook dengan data:

```json
{
  "user_id": 5,
  "original_name": "PM_GrandMallBekasi.pdf",
  "file_path": "C:/laragon/.../storage/app/public/documents/PM_GrandMall.pdf",
  "storage_path": "documents/PM_GrandMall.pdf",
  "status": "queued"
}
```

> **Penting:** Laravel TIDAK langsung insert ke database. Semua operasi database dikendalikan oleh n8n.

---

## 🔷 FASE 2 — n8n MENERIMA TRIGGER & SIAPKAN DATABASE

### Node 1: Create Document (DB)
n8n memanggil `POST /api/webhook/create-document` ke Laravel.
Laravel insert baris baru ke tabel `documents` dan mengembalikan `document_id`.

```json
{ "success": true, "document_id": 81 }
```

`document_id` ini disimpan n8n dan dipakai oleh semua node berikutnya.

### Node 2: Update Status → Processing
n8n memanggil `PATCH /api/documents/81` dengan body:
```json
{ "status": "processing" }
```
Status di database berubah dari `queued` → `processing`.
Di UI Laravel, user sudah bisa melihat dokumennya sedang diproses.

---

## 🔷 FASE 3 — KONVERSI PDF KE GAMBAR

**n8n memanggil:** `POST http://localhost:5000/convert-pdf`

```json
{
  "document_id": 81,
  "file_path": "C:/laragon/.../documents/PM_GrandMall.pdf"
}
```

**Yang terjadi di Python (`pdf_converter.py`):**

1. `convert_if_not_exists()` dipanggil — cek apakah PNG sudah ada dari konversi sebelumnya.
2. Jika belum ada, gunakan library `pdf2image` (berbasis Poppler) untuk konversi.
3. Setiap halaman PDF dikonversi menjadi file PNG resolusi tinggi (300 DPI).
4. Disimpan ke `python-engine/storage/pages/PM_GrandMall/page_1.png`, `page_2.png`, dst.

**Response ke n8n:**
```json
{
  "status": "ok",
  "document_id": 81,
  "total_pages": 2,
  "pages": [
    "storage/pages/PM_GrandMall/page_1.png",
    "storage/pages/PM_GrandMall/page_2.png"
  ]
}
```

> **Kenapa harus dikonversi dulu?**
> PaddleOCR dan TrOCR tidak bisa membaca format PDF secara langsung.
> Mereka hanya bisa memproses file gambar (PNG/JPG).

---

## 🔷 FASE 4 — PIPELINE OCR UTAMA

**n8n memanggil:** `POST http://localhost:5000/process`

```json
{
  "document_id": 81,
  "file_path": "documents/PM_GrandMall.pdf",
  "template_code": "form_pm_vendor_a",
  "all_templates": [ ... ]
}
```

Dari sini, `HybridProcessor.process()` → `extract_document()` berjalan.
Pipeline dikerjakan **per halaman PNG**.

---

### ── LANGKAH A: PRE-PROCESSING GAMBAR ──

File: `app/services/preprocessor.py`

Sebelum di-OCR, gambar "dibersihkan" dulu agar karakter lebih tajam dan mudah dibaca.

**Teknik yang digunakan:**

| Teknik | Fungsi |
|---|---|
| **Grayscale** | Ubah gambar berwarna → hitam putih (hemat memori, lebih konsisten) |
| **CLAHE** | Perbaiki kontras secara lokal dan adaptif. Sangat efektif untuk foto dokumen yang kurang cahaya atau tidak merata |
| **Gaussian Blur** | Haluskan noise kecil agar tidak terbaca sebagai karakter |
| **Denoise** | Buang bintik-bintik halus yang bisa menyebabkan karakter palsu |

Output: File PNG baru (suffix `_clean`) yang sudah bersih, disimpan sementara.

```
Gambar asli  →  [CLAHE + Denoise]  →  Gambar bersih (_clean.png)
```

---

### ── LANGKAH B: GLOBAL OCR SCAN (1x per halaman) ──

File: `app/services/ocr_engine.py` → fungsi `run_global_ocr()`

**Ini adalah langkah PALING PENTING dari sisi performa.**

PaddleOCR dijalankan **satu kali saja** pada gambar bersih.
Hasilnya adalah daftar SEMUA teks yang terdeteksi di halaman, beserta koordinat posisinya.

```python
ocr = get_ocr_instance()          # Singleton — tidak dibuat ulang tiap request
raw = ocr.ocr(image_path, cls=True)  # Scan seluruh halaman
```

**Contoh output `ocr_results` (disederhanakan):**
```python
[
  { "text": "PREVENTIVE MAINTENANCE",  "x": 290, "y": 42,  "w": 260, "h": 22, "confidence": 0.98 },
  { "text": "FM-LAP-001",              "x": 700, "y": 42,  "w": 90,  "h": 22, "confidence": 0.96 },
  { "text": "Location",               "x": 48,  "y": 118, "w": 75,  "h": 19, "confidence": 0.95 },
  { "text": "Grand Mall Bekasi",       "x": 190, "y": 118, "w": 155, "h": 19, "confidence": 0.89 },
  { "text": "Date/time",              "x": 48,  "y": 142, "w": 70,  "h": 19, "confidence": 0.94 },
  { "text": "2026-04-01",             "x": 190, "y": 142, "w": 85,  "h": 19, "confidence": 0.91 },
  { "text": "No",                     "x": 48,  "y": 200, "w": 25,  "h": 18, "confidence": 0.99 },
  { "text": "Descriptions",           "x": 90,  "y": 200, "w": 100, "h": 18, "confidence": 0.97 },
  { "text": "Result",                 "x": 380, "y": 200, "w": 55,  "h": 18, "confidence": 0.96 },
  ...
]
```

> **Kenapa hanya 1x?**
> OCR adalah proses berat. Dengan menyimpan hasilnya, kita bisa
> mencari data field manapun tanpa harus scan ulang — menghemat waktu 3-5x lipat.

---

### ── LANGKAH C: AUTO-DETECT TEMPLATE ──

File: `app/services/ocr_engine.py` → fungsi `detect_template()`

Sistem harus tahu **ini dokumen jenis apa** agar tahu cara membacanya.

**Caranya:**

**Step 1 — Baca Header Dokumen**
Fungsi `read_header()` mengambil hanya teks di area atas halaman (header zone).
Biasanya berisi judul form dan nomor dokumen.
Contoh hasil: `"PREVENTIVE MAINTENANCE FM-LAP-001"`

**Step 2 — Bandingkan dengan Semua Template**
Setiap template di database punya `identifier_text` (teks pengenal unik).
Sistem membandingkan teks header dokumen dengan identifier_text semua template menggunakan **Fuzzy Matching** (bukan exact match).

**Dua algoritma fuzzy yang dipakai:**

| Algoritma | Cara Kerja | Contoh Kegunaan |
|---|---|---|
| `partial_ratio` | Cocokkan substring. Score tinggi meski teks lebih panjang | `"FM-LAP"` cocok dengan `"PREVENTIVE MAINTENANCE FM-LAP-001 Rev.2"` |
| `token_sort_ratio` | Urutkan kata dulu, lalu cocokkan | `"LAP FM"` tetap cocok dengan `"FM LAP"` |

Score yang dipakai adalah nilai **tertinggi** dari keduanya.

**Sistem Keputusan:**

```
Score ≥ 80  →  status: "matched"        → Lanjut ekstraksi penuh
Score 60-79 →  status: "low_confidence" → Lanjut, tapi tandai perlu validasi
Score < 60  →  status: "unknown"        → Skip halaman ini, catat sebagai GAGAL
```

---

### ── LANGKAH D: EKSTRAKSI FIELD HEADER ──

File: `app/services/field_extractor.py` → fungsi `extract_fields()`

Field header adalah data-data di luar tabel, seperti: lokasi, tanggal, nama teknisi, nomor dokumen.

**Prinsip: ANCHOR-BASED EXTRACTION**

Sistem tidak mencari nilai field secara langsung. Dia mencari **label/anchor** dulu, lalu mengambil nilai yang ada di sebelah/bawah label tersebut.

**Alur per field:**

```
Config field:
  field_name: "location"
  anchor_text: "Location"
  type: "printed"
  offset_x: 120    ← nilai ada 120px ke kanan dari anchor
  offset_y: -2     ← naik 2px dari posisi Y anchor
  width: 200
  height: 25
```

**Step 1: Cari Anchor (`find_anchor`)**
Cari teks `"Location"` di `ocr_results` dengan fuzzy matching.
Ditemukan di koordinat `(x=48, y=118)`.

```
[Halaman Dokumen]
┌─────────────────────────────────────┐
│  Location    │  Grand Mall Bekasi   │
│  ↑ anchor    │  ↑ ini yang diambil  │
│  (48, 118)   │  target box          │
└─────────────────────────────────────┘
```

**Step 2: Hitung Target Box (`calculate_target_box`)**
```
x1 = anchor.x + offset_x = 48 + 120 = 168
y1 = anchor.y + offset_y = 118 + (-2) = 116
x2 = x1 + width          = 168 + 200  = 368
y2 = y1 + height         = 116 + 25   = 141
Target Box = (168, 116, 368, 141)
```

**Step 3a: Ambil Teks — Mode PRINTED (`get_text_in_bbox`)**
Filter semua item dari `ocr_results` yang posisinya overlap dengan target box.
Item `"Grand Mall Bekasi"` ada di `(x=190, y=118)` → overlap > 50% → **diambil**.
Hasil: `"Grand Mall Bekasi"` ✅

**Step 3b: Ambil Teks — Mode HANDWRITTEN (TrOCR)**
Jika `type: "handwritten"` (misal: nama teknisi yang ditulis tangan):
1. Crop gambar di area target box menggunakan OpenCV.
2. Crop image di-feed ke model **TrOCR** (`microsoft/trocr-base-handwritten`).
3. TrOCR mengembalikan teks hasil pembacaan tulisan tangan.
4. Jika TrOCR gagal/disabled → fallback ke PaddleOCR (global OCR).

---

### ── LANGKAH E: EKSTRAKSI TABEL ──

File: `app/services/table_extractor.py` → fungsi `extract_table()`

Tabel (checklist, daftar pekerjaan, dll) memiliki proses yang lebih kompleks karena strukturnya baris-kolom.

**Alur lengkap:**

#### E1 — Temukan Anchor Tabel

Dari config template, ambil `anchor.texts` (misal: `["No", "Descriptions"]`).
Cari teks header tabel di `ocr_results` dengan `find_anchor()`.
Posisi X anchor ini menjadi **koordinat 0** (titik referensi) untuk semua kolom tabel.

```
[Tabel di Dokumen]
┌────┬──────────────────────┬──────────┬────────┐
│ No │ Descriptions         │ Result   │ Status │
├────┼──────────────────────┼──────────┼────────┤
│ 1  │ AC input voltage     │ 238V     │ OK     │
│ 2  │ AC output voltage    │ 220V     │ OK     │
│ 3  │ DC battery voltage   │ 13.2V    │ OK     │
└────┴──────────────────────┴──────────┴────────┘
↑
anchor_x (posisi X teks "No")
```

#### E2 — Filter Area Tabel

Ambil hanya item `ocr_results` yang berada di dalam area tabel:
```
Y antara: anchor_y + offset_y  →  anchor_y + offset_y + height
```

#### E3 — Pengelompokan Baris (`group_by_y`)

Sistem punya dua metode:

**Metode 1: Gap-Based (default)**
- Urutkan item berdasarkan Y.
- Jika jarak Y antar item > threshold (60% rata-rata tinggi box) → baris baru.
- Cocok untuk tabel sederhana dengan tinggi baris seragam.

**Metode 2: Anchor-Based (lebih akurat)**
- Digunakan jika ada kolom dengan `is_row_anchor: true` di config.
- Ambil semua item di kolom anchor (misal: kolom "Descriptions").
- Setiap item di kolom anchor = satu referensi baris.
- Semua item lain di-assign ke baris dengan Y referensi terdekat.
- Cocok untuk tabel dengan baris multi-line yang tingginya tidak seragam.

#### E4 — Pembagian Kolom (`split_by_x`)

Untuk setiap baris, setiap item OCR di-assign ke kolom berdasarkan posisi **center X**-nya relatif terhadap `anchor_x`.

```
Config kolom:
  { key: "no",           offset_x_start: 0,   offset_x_end: 50  }
  { key: "descriptions", offset_x_start: 50,  offset_x_end: 350 }
  { key: "result",       offset_x_start: 350, offset_x_end: 500, type: "handwritten" }
  { key: "status",       offset_x_start: 500, offset_x_end: 650 }

Item OCR: "238V" di x=390 (relatif ke anchor: 390 - anchor_x)
→ Masuk ke kolom "result" (350 ≤ 390 ≤ 500) ✅
```

**Untuk kolom `type: "handwritten"` (misal: kolom Result yang diisi tangan):**

1. Cek dulu apakah PaddleOCR melihat sesuatu di area tersebut.
   - Jika tidak ada → sel kosong, **skip TrOCR** (hemat waktu).
   - Jika ada → lanjut ke step berikutnya.
2. Hitung koordinat absolut sel: `(anchor_x + offset_x_start, row_y, anchor_x + offset_x_end, row_y + row_h)`.
3. Crop gambar di koordinat tersebut.
4. Kirim crop ke TrOCR → dapatkan teks tulisan tangan.
5. Jika TrOCR gagal → fallback ke teks PaddleOCR.

#### E5 — Merge Multi-Line Rows

Kadang satu baris logis terpecah jadi beberapa baris fisik karena teks terlalu panjang.

Contoh:
```
Baris fisik 1: { descriptions: "a. AC input voltage *) measured", result: "", status: "" }
Baris fisik 2: { descriptions: "",                                 result: "238V", status: "OK" }
```

`merge_multi_line_rows()` menggabungkannya menjadi:
```
Baris logis:   { descriptions: "a. AC input voltage *) measured", result: "238V", status: "OK" }
```

Aturan merge:
- Baris baru dimulai ketika kolom `is_row_anchor` (Descriptions) berisi teks.
- Baris lanjutan (kolom anchor kosong) digabungkan ke baris sebelumnya.
- Kolom dengan `multi_line: true` → teks digabung dengan spasi.
- Kolom tanpa `multi_line` → nilai pertama dipertahankan, lanjutan diabaikan.

---

### ── LANGKAH F: SUSUN OUTPUT TERSTRUKTUR ──

File: `app/services/json_builder.py` → fungsi `build_hierarchical_json()`

Hasil field dan tabel dikumpulkan dan disusun menjadi JSON yang rapi dan terstruktur:

```json
{
  "document": {
    "no_dok": "FM-LAP-001",
    "versi":  "1.0"
  },
  "header": {
    "location":  "Grand Mall Bekasi",
    "date_time": "2026-04-01",
    "teknisi":   "Budi Santoso"
  },
  "checklist": [
    { "no": "1", "descriptions": "AC input voltage",  "result": "238V",  "status": "OK" },
    { "no": "2", "descriptions": "AC output voltage", "result": "220V",  "status": "OK" },
    { "no": "3", "descriptions": "DC battery voltage","result": "13.2V", "status": "OK" }
  ]
}
```

---

## 🔷 FASE 5 — EVALUASI KUALITAS HASIL

File: `app/services/processor.py` → fungsi `_evaluate_page()`

Setelah semua halaman diekstraksi, sistem otomatis menilai kualitas hasilnya.

**Apa itu TP, FP, FN?**

| Istilah | Arti Mudah | Kondisi di Kode |
|---|---|---|
| **TP** (True Positive) | Field **berhasil** dibaca dengan baik | Nilai ada, panjang ≥ 2 karakter |
| **FP** (False Positive) | Field terbaca tapi **meragukan** (noise) | Nilai ada tapi hanya 1 karakter |
| **FN** (False Negative) | Field **gagal** dibaca (kosong) | Nilai kosong / null / none |

**Contoh evaluasi nyata:**

```
Field "location"  → "Grand Mall Bekasi" (17 karakter) → TP ✅
Field "date_time" → "2026-04-01"        (10 karakter) → TP ✅
Field "teknisi"   → ""                  (kosong)      → FN ❌
Field "no_dok"    → "F"                 (1 karakter)  → FP ⚠️

Untuk tabel "checklist" (3 baris × 4 kolom = 12 sel):
  Baris 1: no="1"(TP), descriptions="AC input..."(TP), result="238V"(TP), status="OK"(TP) → 4 TP
  Baris 2: no="2"(TP), descriptions="AC output..."(TP), result=""(FN), status="OK"(TP)   → 3 TP, 1 FN
  Baris 3: no="3"(TP), descriptions="DC batt..."(TP), result="13.2V"(TP), status="O"(FP) → 3 TP, 1 FP
```

**Total: TP=14, FP=2, FN=2**

**Rumus Metrik:**
```
Precision = TP / (TP + FP) = 14 / (14+2) = 0.875  (87.5% yang diklaim berhasil memang benar)
Recall    = TP / (TP + FN) = 14 / (14+2) = 0.875  (87.5% field berhasil dibaca)
F1 Score  = 2 × (0.875 × 0.875) / (0.875 + 0.875) = 0.875
```

---

## 🔷 FASE 6 — RESPONSE PYTHON KE n8n

Python Engine mengembalikan JSON lengkap ini:

```json
{
  "status": "ok",
  "document_id": 81,
  "confidence_score": 87.5,
  "total_pages": 1,
  "tp": 14,
  "fp": 2,
  "fn": 2,
  "eval_summary": {
    "precision": 0.875,
    "recall":    0.875,
    "f1_score":  0.875
  },
  "pages": [
    {
      "page": 1,
      "status": "matched",
      "confidence": 87.5,
      "template_id": 3,
      "template_name": "Form PM Vendor A",
      "tp": 14, "fp": 2, "fn": 2,
      "fields": {
        "document": { "no_dok": "FM-LAP-001", "versi": "1.0" },
        "header":   { "location": "Grand Mall Bekasi", "date_time": "2026-04-01" }
      },
      "tables": {
        "checklist": [
          { "no": "1", "descriptions": "AC input voltage", "result": "238V", "status": "OK" }
        ]
      }
    }
  ]
}
```

---

## 🔷 FASE 7 — n8n SIMPAN KE DATABASE

n8n menerima response di atas, lalu:

### Node IF — Cek Confidence
```
parseInt($('Process OCR (Python AI)').item.json.confidence_score) > 80 ?
```
- **TRUE (≥80)** → Kirim ke node "Update Status SUCCESS"
- **FALSE (<80)** → Kirim ke node "Update Status LOW CONFIDENCE"

### Node Update Status SUCCESS
`PATCH http://idp-lintasarta.test:8080/api/documents/{{ $json.document_id }}`

```json
{
  "status": "completed",
  "confidence_score": 87.5,
  "tp": 14, "fp": 2, "fn": 2,
  "template_id": 3,
  "fields": { ... },
  "tables": { ... }
}
```

### Node Update Status LOW CONFIDENCE
```json
{
  "status": "need_validation",
  "confidence_score": 65.0,
  "tp": 8, "fp": 3, "fn": 5,
  ...
}
```

**Laravel (`DocumentController@receiveOcrResult`) menerima data ini dan:**
1. Menyimpan `confidence_score`, `tp_count`, `fp_count`, `fn_count` ke kolom tabel `documents`.
2. Menyimpan `fields` + `tables` ke kolom `extracted_data` (format JSON).
3. Mengupdate `status` dokumen.
4. Mengembalikan response sukses ke n8n.

**User bisa melihat hasilnya di halaman dokumen secara real-time** (React polling setiap 5 detik via `GET /internal-api/documents/{id}/status`).

---

## 🔷 RINGKASAN ALUR DATA OCR (Visual)

```
PDF File
│
├─[1] pdf2image → PNG per halaman
│
├─[2] preprocessor → PNG Bersih (CLAHE + Denoise)
│
├─[3] PaddleOCR → ocr_results [ {text, x, y, w, h, confidence} ... ]
│       ↑
│       Dipanggil SEKALI, hasilnya dipakai ulang oleh semua langkah berikut
│
├─[4] detect_template (fuzzy match header vs identifier_text)
│       → Template terpilih + mapping_config
│
├─[5] extract_fields (per field dari fields_config)
│       ├─ find_anchor(anchor_text) dari ocr_results → posisi label
│       ├─ calculate_target_box(anchor + offset) → area nilai
│       └─ [printed]     get_text_in_bbox(ocr_results, bbox)
│          [handwritten]  crop image → TrOCR → teks tulisan tangan
│
├─[6] extract_table (per tabel dari tables_config)
│       ├─ find_anchor(header tabel) → anchor_x referensi
│       ├─ filter item dalam area tabel
│       ├─ group_by_y → kelompok baris
│       ├─ split_by_x → nilai per kolom
│       │     ├─ [printed]     dari ocr_results
│       │     └─ [handwritten] crop sel → TrOCR
│       └─ merge_multi_line_rows → baris logis
│
├─[7] build_hierarchical_json → Structured JSON output
│
└─[8] _evaluate_page → TP / FP / FN / Precision / Recall / F1

→ Response JSON ke n8n
→ n8n → PATCH /api/documents/{id} → Laravel
→ Data tersimpan di PostgreSQL (Supabase)
→ User melihat hasil di dashboard ✅
```

---

## 🔷 PENJELASAN DUA MODEL AI

### PaddleOCR (Teks Cetak)
- Engine OCR utama untuk teks tercetak (printed text).
- Dijalankan **SATU KALI** per halaman (Global OCR).
- Hasilnya berupa list koordinat + teks yang dipakai ulang oleh semua modul.
- Sangat cepat (~1-3 detik per halaman).
- Akurasi tinggi untuk teks cetak: >95%.

### TrOCR — `microsoft/trocr-base-handwritten` (Tulisan Tangan)
- Model Transformer dari Microsoft khusus untuk tulisan tangan.
- Di-load sekali saat server start (pre-warm), tidak di-reload tiap request.
- Hanya dipanggil untuk field/kolom yang punya `type: "handwritten"`.
- Input: crop gambar area sel/field → Output: teks tulisan tangan.
- Lebih lambat dari PaddleOCR (~0.5-2 detik per crop).

**Optimasi TrOCR (agar tidak lambat):**
Sebelum memanggil TrOCR, sistem mengecek: apakah PaddleOCR melihat sesuatu di area tersebut?
Jika tidak ada tanda-tanda tulisan → TrOCR **di-skip** (sel dianggap kosong).
Ini menghemat waktu signifikan untuk tabel dengan banyak sel kosong.

---

*File ini menjelaskan alur OCR berdasarkan kode aktual di `python-engine/`. — April 2026*
