# Dokumentasi Implementasi Python Engine — IDP Lintasarta

Dokumen ini menjelaskan semua mekanisme yang berjalan di dalam Python Engine
secara menyeluruh dan mudah dipahami.

---

## Daftar Isi

1. [Gambaran Besar Sistem](#1-gambaran-besar-sistem)
2. [Alur Pipeline Lengkap](#2-alur-pipeline-lengkap)
3. [Preprocessing Gambar](#3-preprocessing-gambar)
4. [Global OCR Scan (PaddleOCR)](#4-global-ocr-scan-paddleocr)
5. [Auto-Deteksi Template](#5-auto-deteksi-template)
6. [Dynamic Template Mapping — Konsep Dasar](#6-dynamic-template-mapping--konsep-dasar)
7. [Ekstraksi Field Header](#7-ekstraksi-field-header)
8. [Ekstraksi Tabel](#8-ekstraksi-tabel)
9. [Mekanisme Khusus: TrOCR untuk Tulisan Tangan](#9-mekanisme-khusus-trocr-untuk-tulisan-tangan)
10. [Mekanisme Khusus: Deteksi Checkbox](#10-mekanisme-khusus-deteksi-checkbox)
11. [Sistem Confidence Score](#11-sistem-confidence-score)
12. [Rule-Based Logic di Tabel](#12-rule-based-logic-di-tabel)
13. [Pembangun Output JSON](#13-pembangun-output-json)
14. [Kenapa Tulisan Tangan di Kolom "Result" Sekarang Bisa Terbaca?](#14-kenapa-tulisan-tangan-di-kolom-result-sekarang-bisa-terbaca)
15. [Catatan Penting dan Batasan](#15-catatan-penting-dan-batasan)

---

## 1. Gambaran Besar Sistem

Python Engine adalah **server Flask** yang bertugas mengekstrak data terstruktur
dari file PDF dokumen Preventive Maintenance. Seluruh proses bersifat otomatis —
sistem "membaca" dokumen seperti manusia, tapi secara komputasi.

Kunci utama sistem ini adalah **Dynamic Template Mapping**: logika ekstraksi
tidak di-hardcode di dalam kode Python, melainkan dibaca dari database
(`mapping_config` di tabel `document_templates`). Artinya, untuk menambah jenis
dokumen baru, Admin cukup membuat template baru di UI — **tanpa perlu mengubah
kode Python sama sekali**.

```
PDF → PNG (per halaman) → Preprocessing → PaddleOCR (1x) → Template Match
     → Ekstrak Field Header → Ekstrak Tabel → Hitung Confidence → Output JSON
```

---

## 2. Alur Pipeline Lengkap

Ini urutan langkah yang dijalankan oleh `ocr_engine.py` setiap kali dokumen
diproses:

```
STEP 1: convert_if_not_exists()
   → PDF di-render jadi file PNG, satu file per halaman
   → Jika sudah pernah diconvert sebelumnya, langsung pakai yang ada (cache)

STEP 2: preprocess_image()
   → PNG dipertajam: Grayscale → Denoise → Gaussian Blur → CLAHE
   → Menghasilkan file baru dengan suffix "_pre.png"

STEP 3: Deteksi Template (Auto atau Manual)
   → Jika template_code dikirim dari n8n → langsung dipakai (manual mode)
   → Jika tidak ada → run_global_ocr() dulu lalu detect_template()
     → Baca header dokumen, cocokkan fuzzy dengan identifier_text semua template

STEP 4: run_global_ocr()
   → PaddleOCR scan seluruh halaman SATU KALI
   → Hasil: list [{text, x, y, w, h, confidence}]
   → Hasil ini dipakai ULANG oleh semua step berikutnya (tidak scan lagi)

STEP 5: extract_fields()
   → Untuk setiap field di mapping_config['fields']:
     → find_anchor() → cari posisi kata kunci di halaman
     → calculate_target_box() → hitung koordinat area isian
     → Baca sesuai tipe: PaddleOCR (printed) / TrOCR (handwritten) / Pixel ratio (checkbox)

STEP 6: extract_table() × N
   → Untuk setiap tabel di mapping_config['tables']:
     → find_anchor() → cari posisi kepala tabel
     → Filter item OCR dalam area tabel
     → group_by_y() / group_by_y_anchor() → kelompokkan per baris
     → split_by_x() → bagi per kolom + baca handwritten dengan TrOCR
     → merge_multi_line_rows() → gabung baris fisik multi-baris → baris logis

STEP 7: Hitung Confidence Score
   → Rata-rata confidence PaddleOCR per kata (paddle_avg)
   → Rata-rata confidence tabel (termasuk TrOCR) (tbl_avg)
   → ocr_confidence = paddle_avg × 40% + tbl_avg × 60%

STEP 8: build_hierarchical_json()
   → Susun semua hasil ke dalam struktur JSON final
   → Kirim balik ke n8n
```

---

## 3. Preprocessing Gambar

**File:** `app/services/preprocessor.py`

Sebelum OCR dijalankan, gambar diproses dulu untuk meningkatkan keterbacaan teks.
Ini penting karena dokumen scan sering punya noise, kontras tidak merata, atau
warna yang mengalihkan perhatian OCR.

### Tahapan Preprocessing

```
[Gambar Asli PNG]
     ↓
Step 1: Grayscale
   → Ubah gambar berwarna (BGR) jadi hitam-putih (1 channel)
   → OCR lebih fokus ke bentuk huruf, tidak terganggu warna

Step 2: Denoise (fastNlMeansDenoising)
   → Kurangi bintik-bintik noise dari scanner (grain)
   → Parameter h=10: kekuatan filter (makin tinggi makin halus, tapi bisa blur)
   → templateWindowSize=7, searchWindowSize=21 (standar untuk dokumen)

Step 3: Gaussian Blur kecil
   → Kernel 3×3: blur tipis untuk menghilangkan noise yang tersisa
   → Tidak merusak ketajaman teks, hanya menghaluskan

Step 4: CLAHE (Contrast Limited Adaptive Histogram Equalization)
   → Tingkatkan kontras secara LOKAL dan ADAPTIF
   → "Adaptif" = setiap bagian gambar ditingkatkan kontrasnya secara terpisah
   → Hasilnya: teks yang sebelumnya pudar jadi lebih gelap/jelas
   → clipLimit=2.0: batas amplifikasi kontras agar tidak over-expose
   → tileGridSize=(8,8): ukuran grid untuk adaptasi lokal

     ↓
[Gambar bersih: {nama}_pre.png]
```

**Analogi sederhana:** Bayangkan memfotokopi dokumen buram. Preprocessing ini
seperti mengatur tombol kontras dan ketajaman di mesin fotokopi sebelum
memindai ulang — hasilnya teks jauh lebih mudah dibaca.

### File Intermediate

Setiap tahap disimpan ke disk untuk memudahkan debugging:
- `page_1_1_grayscale.png` — setelah grayscale
- `page_1_2_denoised.png` — setelah denoise
- `page_1_3_blurred.png` — setelah blur
- `page_1_4_clahe.png` — setelah CLAHE
- `page_1_pre.png` — **file final yang dipakai pipeline**

---

## 4. Global OCR Scan (PaddleOCR)

**File:** `app/services/ocr_service.py`, `app/services/ocr_engine.py`

### Mengapa "Global" dan Hanya "Satu Kali"?

OCR adalah operasi yang mahal secara komputasi. Jika setiap field atau sel tabel
meminta OCR sendiri-sendiri, waktu prosesnya akan sangat lama. Solusinya: scan
seluruh halaman **satu kali**, simpan hasilnya, lalu gunakan ulang.

```python
ocr_results = run_global_ocr(clean_img_path)
# Hasilnya: list of dict
# [
#   { "text": "Location", "x": 45, "y": 120, "w": 65, "h": 18, "confidence": 0.98 },
#   { "text": "Grand Mall Bekasi", "x": 120, "y": 118, "w": 140, "h": 20, "confidence": 0.95 },
#   ...
# ]
```

Koordinat `x, y, w, h` adalah posisi piksel teks di dalam gambar halaman.
`confidence` adalah keyakinan PaddleOCR terhadap teks yang dibaca (0.0–1.0).

### PaddleOCR Singleton

PaddleOCR dimuat ke memory **hanya satu kali** saat pertama dipakai, lalu
dipertahankan. Ini disebut pola Singleton.

```python
# get_ocr_instance() dipanggil setiap kali butuh OCR
# Tapi model-nya hanya dimuat sekali (mahal!)
ocr = get_ocr_instance()
raw = ocr.ocr(image_path, cls=True)  # cls=True = aktifkan deteksi orientasi
```

---

## 5. Auto-Deteksi Template

**File:** `app/services/ocr_engine.py` → fungsi `detect_template()`

Ketika n8n tidak memberitahu template yang harus digunakan, sistem harus
mendeteksi sendiri jenis dokumen apa yang sedang diproses.

### Cara Kerjanya

```
1. Baca area HEADER halaman (bagian atas dokumen)
   → read_header() → menggunakan PaddleOCR pada area atas halaman
   → Mengembalikan { "title": "...", "doc_number": "FM-LAP-001" }

2. Gabungkan title + doc_number menjadi satu string pencarian:
   searchable_text = "PREVENTIVE MAINTENANCE FM-LAP-001"

3. Bandingkan dengan identifier_text setiap template di database
   Contoh template A: identifier_text = "PREVENTIVE MAINTENANCE FM-LAP"
   Contoh template B: identifier_text = "CORRECTIVE MAINTENANCE CM-REP"

4. Hitung similarity score dengan dua strategi (ambil yang tertinggi):
   - partial_ratio: "FM-LAP" ada di dalam "FM-LAP-001" → score tinggi
   - token_sort_ratio: tahan terhadap urutan kata berbeda (mis. "LAP FM" vs "FM LAP")

5. Template dengan score tertinggi dipilih

6. Sistem kasta status:
   - score >= 80 → "matched"    (yakin)
   - score >= 60 → "low_confidence" (ragu-ragu tapi tetap diproses)
   - score < 60  → "unknown"    (tidak dikenali → skip halaman ini)
```

**Fallback pintar:** Jika di database hanya ada 1 template aktif, sistem langsung
memakainya tanpa perlu deteksi — karena tidak ada pilihan lain.

---

## 6. Dynamic Template Mapping — Konsep Dasar

**Inti:** Template di database mendefinisikan DI MANA dan BAGAIMANA data dibaca.

### Skema `mapping_config`

```json
{
  "identifier_text": "PREVENTIVE MAINTENANCE FM-LAP",

  "fields": [
    {
      "field_name": "location",
      "anchor_text": "Location",
      "offset_x": 120,
      "offset_y": -5,
      "width": 200,
      "height": 25,
      "type": "printed"
    }
  ],

  "tables": [
    {
      "table_name": "checklist",
      "anchor": { "texts": ["No", "Descriptions"] },
      "area": { "offset_y": 30, "height": 600 },
      "row_detection": { "method": "anchor_based" },
      "columns": [
        { "key": "no", "type": "printed", "offset_x_start": -60, "offset_x_end": -5 },
        { "key": "descriptions", "type": "printed", "is_row_anchor": true, "multi_line": true, "offset_x_start": 0, "offset_x_end": 350 },
        { "key": "result", "type": "handwritten", "offset_x_start": 350, "offset_x_end": 500 },
        { "key": "status", "type": "checkbox", "offset_x_start": 500, "offset_x_end": 600, "checkbox_threshold": 0.12 }
      ]
    }
  ]
}
```

### Konsep Koordinat

Semua koordinat adalah **relatif terhadap anchor** (kata kunci), bukan absolut
dari pojok kiri atas halaman. Ini membuat template robust terhadap sedikit
pergeseran posisi teks antar dokumen:

```
Anchor ditemukan di (x=45, y=120)
offset_x = 120, offset_y = -5

Maka area isian = (45+120, 120-5) = (165, 115)
```

---

## 7. Ekstraksi Field Header

**File:** `app/services/field_extractor.py`

Field adalah data tunggal di luar tabel, misalnya: Location, Date, Technician.

### Alur per Field

```
Untuk setiap field di mapping_config['fields']:

  STEP 1: find_anchor(ocr_results, anchor_text)
    → Cari teks "Location" di hasil global OCR
    → Pakai fuzzy matching (threshold 65)
    → Jika tidak ketemu → field = "" (kosong), lanjut ke field berikutnya

  STEP 2: calculate_target_box(anchor, offset_x, offset_y, width, height)
    → Hitung kotak target berdasarkan posisi anchor + offset dari config
    → Return (x1, y1, x2, y2) dalam piksel absolut

  STEP 3: Baca sesuai tipe field:

    type="printed" → get_text_in_bbox(ocr_results, bbox)
      → Filter item dari global OCR yang overlap ≥ 50% dengan bbox
      → Urutkan kiri ke kanan, gabungkan jadi satu string

    type="handwritten" → _read_handwritten_field(image_path, bbox, field_name)
      → crop_image_for_trocr(image_path, bbox) → potong gambar di area bbox
      → read_handwritten(crop) → TrOCR membaca hasil crop
      → Jika TrOCR gagal/disabled → fallback ke PaddleOCR (get_text_in_bbox)

    type="checkbox" → _detect_checkbox_field(image_path, bbox, field_config)
      → Lihat Bagian 10 untuk penjelasan detail
```

### Mengapa Fuzzy Matching?

Dokumen scan tidak sempurna. OCR kadang membaca "Locatlon" (l bukan i),
"Date/time" padahal di template tertulis "Date / Time". Fuzzy matching
dengan rapidfuzz mengatasi typo kecil ini dengan menghitung kemiripan string.

---

## 8. Ekstraksi Tabel

**File:** `app/services/table_extractor.py`

Tabel adalah bagian paling kompleks karena memiliki banyak baris dan kolom
yang harus diidentifikasi secara dinamis dari gambar.

### Tahap 1: Temukan Anchor Tabel

```python
anchor = find_anchor(ocr_results, "No")  # atau teks header tabel lainnya
# → { "text": "No", "x": 50, "y": 300, "w": 20, "h": 16 }
```

Anchor tabel adalah teks di baris header tabel (misalnya "No", "Descriptions").
Posisi anchor ini menjadi titik referensi untuk semua koordinat kolom.

### Tahap 2: Filter Item dalam Area Tabel

```python
# filter_y1 = y anchor + tinggi anchor + 2px margin
# Ini memastikan baris header TIDAK ikut terekstrak sebagai data
filter_y1 = anchor['y'] + anchor.get('h', 20) + 2
area_items = [item for item in ocr_results if filter_y1 <= item_center_y <= area_y2]
```

### Tahap 3: Pengelompokan Per Baris (group_by_y)

Ada dua metode pengelompokan, dipilih berdasarkan config template:

#### Metode A: Gap-Based (Sederhana)

```
Urutkan semua item OCR berdasarkan posisi Y dari atas ke bawah
Hitung threshold Y = rata-rata tinggi item × 60%

Jika jarak Y item saat ini vs item sebelumnya > threshold → BARIS BARU
Jika tidak → item masuk ke baris yang sama

Contoh:
  Item Y=300 → Baris 1
  Item Y=302 → Baris 1 (masih dekat, threshold mis. 10px)
  Item Y=320 → Baris 2 (jauh, > threshold)
```

#### Metode B: Anchor-Based (Cerdas, untuk form kompleks)

Digunakan ketika tabel memiliki deskripsi panjang yang bisa multi-baris,
atau ketika baris fisik tidak sepenuhnya sejajar secara vertikal.

```
Prinsip: Kolom "descriptions" (is_row_anchor=True) menjadi penentu baris baru.
Setiap kali kolom descriptions berisi teks baru → itu adalah baris logis baru.

STEP 1: Pisahkan item OCR jadi dua kelompok:
  - "Anchor items": item yang posisi X-nya ada di kolom descriptions
  - "Non-anchor items": item di kolom lain (no, result, status, dll.)

STEP 2: Tentukan "section header": baris yang kolom "no"-nya terisi
  (mis. no="1" descriptions="Visual Check")
  → Section header = pemisah kelompok baris yang lebih besar

STEP 3: Untuk setiap anchor item, tentukan apakah ia "punya nilai sendiri"
  → Ada item non-anchor (misal result/status) di range Y-nya → punya nilai
  → Tidak ada item non-anchor → kemungkinan bagian dari baris multi-baris

STEP 4: Gabungkan anchor yang tidak punya nilai ke anchor sebelumnya
  (mekanisme multi-line merging, lihat lebih lanjut di bawah)

STEP 5: Assign semua item OCR ke referensi baris yang tepat
```

### Tahap 4: Pembagian Per Kolom (split_by_x)

Setelah baris terbentuk, setiap baris dipecah ke dalam kolom berdasarkan
posisi X item relatif terhadap anchor.

```
Untuk setiap item di satu baris:
  center_x = item_x + item_w/2 - anchor_x  (posisi relatif terhadap anchor)

  Kolom "result" punya offset_x_start=350, offset_x_end=500
  Jika 350 ≤ center_x ≤ 500 → item ini masuk kolom "result"
  (ada toleransi 10% lebar kolom untuk sedikit pergeseran)
```

#### Tiga Pass dalam split_by_x

**Pass 1 — Printed dari Global OCR:**
Item yang posisi X-nya cocok dengan kolom `type="printed"` langsung diambil
dari hasil global PaddleOCR.

**Pass 1.5 — Fallback Crop untuk Printed Kosong:**
Jika kolom printed masih kosong setelah Pass 1 (misalnya nomor kecil yang
terlewat PaddleOCR), sistem crop area sel tersebut dan jalankan PaddleOCR
lokal pada crop kecil itu saja.

**Pass 2 — Handwritten dengan TrOCR:**
Untuk kolom `type="handwritten"`:
- Hitung koordinat sel: `x1 = anchor_x + offset_x_start`, `y1 = row_y`, dst.
- `crop_cell_for_trocr()` → potong gambar di area sel tersebut
- Cek apakah sel berisi tinta:
  - PaddleOCR mendeteksi sesuatu di area ini, ATAU
  - Pixel darkness ratio > 0.20 (ada tinta tapi PaddleOCR miss)
- Jika berisi tinta → `read_handwritten(crop)` → TrOCR membaca, simpan `_conf_{key}`
- Jika kosong → skip (hemat waktu)
- Jika TrOCR gagal/disabled → fallback ke item dari global OCR

**Pass 3 — Checkbox:**
Untuk kolom `type="checkbox"`:
- Hitung koordinat sel (sama seperti handwritten)
- Analisis rasio piksel gelap (lihat Bagian 10)

### Tahap 5: Penggabungan Baris Multi-Line (merge_multi_line_rows)

Dokumen PM sering punya deskripsi panjang yang wrap ke baris berikutnya:

```
Dokumen fisik:
  Baris 1: "d. AC current input"    result=""    status=""
  Baris 2: "*)"                     result="2.44" status="Ok"
  Baris 3: "and output"             (lanjutan deskripsi baris 1)

Yang kita inginkan (satu baris logis):
  descriptions: "d. AC current input *) and output"
  result: "2.44"
  status: "Ok"
```

**Aturan penggabungan:**

- Kolom `multi_line: true` → teks digabung dengan spasi
- Kolom `multi_line: false` → nilai pertama dipertahankan, lanjutan diabaikan
- Baris dianggap "lanjutan" jika:
  - Kolom "no" (kiri) kosong, DAN
  - Kolom anchor (descriptions) sebelumnya tidak punya data di kolom kanan, ATAU
  - Flag `_is_continuation_of_prev` di-set oleh group_by_y_anchor

**Post-processing tambahan:**
1. Gabungkan baris "deskripsi saja" ke baris berikutnya yang punya nilai
2. Gabungkan baris terakhir tanpa nilai ke baris sebelumnya
3. Hapus trailing rows (footer/catatan kaki di akhir tabel yang semua kolomnya kosong)

---

## 9. Mekanisme Khusus: TrOCR untuk Tulisan Tangan

**File:** `app/services/trocr_service.py`

### Mengapa TrOCR, Bukan PaddleOCR?

PaddleOCR dilatih terutama untuk teks cetak. Untuk tulisan tangan (handwritten),
TrOCR (dikembangkan Microsoft) lebih akurat karena dilatih khusus untuk
handwritten recognition.

**Arsitektur TrOCR:**
- **Encoder:** ViT (Vision Transformer) — "melihat" gambar
- **Decoder:** RoBERTa — "menerjemahkan" visual ke teks

Model yang dipakai: `microsoft/trocr-base-handwritten` (~500MB)

### Lazy Loading di Background

TrOCR butuh waktu 5–7 menit untuk dimuat pertama kali. Agar server tidak
memblokir request selama proses loading, model dimuat di **thread terpisah**:

```python
# Saat server Flask start:
prewarm_trocr()  # mulai loading di background thread

# Saat ada request masuk yang butuh TrOCR:
if _trocr_loading:
    return "", 0.0  # fallback ke PaddleOCR, jangan tunggu
if _trocr_ready:
    return read_handwritten(crop)  # model sudah siap, langsung pakai
```

**Status flags:**
- `_trocr_ready = False` → belum siap (masih loading atau belum pernah dicoba)
- `_trocr_loading = True` → sedang dimuat di background (request pakai fallback)
- `_trocr_failed = True` → gagal load (pakai PaddleOCR terus)

### Cara Kerja `read_handwritten(crop)`

```python
# Input: crop PIL.Image dari area tulisan tangan

# 1. Proses gambar → tensor numerik
pixel_values = processor(images=crop, return_tensors="pt").pixel_values

# 2. Hasilkan teks + confidence scores
outputs = model.generate(
    pixel_values,
    max_new_tokens=64,
    output_scores=True,           # ← minta token probability
    return_dict_in_generate=True  # ← kembalikan sebagai dict
)

# 3. Decode token ID → string
text = processor.batch_decode(outputs.sequences, skip_special_tokens=True)[0]

# 4. Hitung confidence dari probabilitas per token
for i, score_tensor in enumerate(outputs.scores):
    token_id = outputs.sequences[0, i + 1]
    prob = softmax(score_tensor)[0, token_id]  # probabilitas token ini dipilih
    probs.append(prob)

confidence = rata-rata(probs) × 100  # dalam persen
```

**Interpretasi confidence TrOCR:**
Semakin tinggi probabilitas setiap token yang dipilih model, semakin yakin
model dengan teks yang dibacanya. Confidence 90%+ artinya model sangat yakin.

### Konfigurasi

Dikendalikan via `.env`:
```
TROCR_ENABLED=true    # aktifkan TrOCR
TROCR_ENABLED=false   # gunakan PaddleOCR untuk semua field (termasuk handwritten)
```

Nonaktifkan jika RAM < 4GB (TrOCR butuh ~4GB).

---

## 10. Mekanisme Khusus: Deteksi Checkbox

**File:** `app/services/field_extractor.py` dan `app/services/table_extractor.py`

### Mengapa Tidak Pakai OCR?

Tanda centang (✓), silang (✗), atau lingkaran yang diisi tidak memiliki
representasi teks yang konsisten. OCR sering salah baca atau miss sama sekali.
Solusinya: analisis langsung **kerapatan piksel gelap** di area checkbox.

### Cara Kerjanya

```python
# 1. Buka gambar sebagai grayscale (0=hitam, 255=putih)
img_gray = np.array(Image.open(image_path).convert('L'))

# 2. Crop area sel checkbox
crop = img_gray[y1:y2, x1:x2]
# Catatan: strip 3px atas/bawah agar garis tabel tidak ikut terhitung

# 3. Hitung berapa persen piksel yang "gelap"
dark_ratio = (crop < 180).mean()
# Piksel dengan nilai < 180 (dari 0-255) dianggap gelap
# Jika 20% piksel gelap → dark_ratio = 0.20

# 4. Bandingkan dengan threshold
threshold = 0.12  # default, bisa diatur per kolom di template
is_checked = dark_ratio > threshold

# 5. Kembalikan nilai sesuai config
return "OK" if is_checked else ""
```

**Mengapa threshold 0.12?**
- Kotak kosong: hanya garis tepi saja → dark_ratio sekitar 0.05–0.08
- Kotak dengan centang: ada tinta ekstra → dark_ratio 0.12–0.30+
- Threshold 0.12 berada di tengah, cukup aman untuk membedakan keduanya

**Nilai bisa dikustomisasi per template:**
```json
{ "key": "status", "type": "checkbox", "checkbox_threshold": 0.15,
  "checkbox_checked_value": "OK", "checkbox_empty_value": "" }
```

---

## 11. Sistem Confidence Score

**File:** `app/services/ocr_engine.py`

### Dua Jenis Score

| Score | Nama | Artinya |
|-------|------|---------|
| `confidence_score` | Kualitas baca OCR | Seberapa yakin mesin membaca teks |
| `template_match_score` | Kecocokan template | Seberapa mirip header dokumen dengan template |

Ini dua hal yang berbeda. Dokumen bisa cocok 95% dengan template, tapi
kualitas scan-nya buruk sehingga teks tidak terbaca dengan baik (OCR confidence rendah).

### Cara Hitung `confidence_score`

**A. PaddleOCR word confidence:**
```python
word_confidences = [item['confidence'] * 100 for item in ocr_results]
paddle_avg = rata-rata(word_confidences)  # mis. 87.3%
```
Ini adalah rata-rata keyakinan PaddleOCR terhadap setiap kata yang terbaca
di seluruh halaman.

**B. Table confidence:**
Dari hasil TrOCR dan checkbox di setiap sel tabel:
```python
# Setiap baris tabel punya _row_confidence
# Rata-rata seluruh baris = tbl_avg
tbl_avg = rata-rata(_row_confidence semua baris)  # mis. 84.5%
```

**C. Blending akhir:**
```python
ocr_confidence = paddle_avg × 0.4 + tbl_avg × 0.6
```

Tabel diberi bobot lebih besar (60%) karena isian tabel adalah **data utama**
yang paling penting dari dokumen PM (list item perawatan + hasilnya).
PaddleOCR 40% karena sebagian besar yang dibacanya adalah teks cetak yang
sudah statis (label, header) — bukan isian penting.

### Threshold Frontend

Nilai confidence dipakai frontend untuk menampilkan peringatan:

| Range | Status | Tampilan |
|-------|--------|----------|
| ≥ 80% | Aman | Tidak ada peringatan |
| 50–79% | Perlu dicek | Highlight amber/kuning |
| < 50% | Kritis | Highlight merah |

---

## 12. Rule-Based Logic di Tabel

"Rule-based" dalam konteks ini artinya ada aturan logis yang diterapkan
**setelah** OCR selesai, untuk memastikan hasil ekstraksi masuk akal.

### Aturan yang Aktif

**1. Filter baris header tabel:**
```python
filter_y1 = anchor['y'] + anchor.get('h', 20) + 2
```
Baris kepala tabel ("No", "Descriptions", "Result") tidak boleh masuk sebagai
data. Aturan ini memastikan hanya item yang Y-nya lebih besar dari baris
header yang masuk ke ekstraksi.

**2. Skip sel kosong — Jangan panggil TrOCR jika tidak perlu:**
```python
_has_ink = _has_paddle or (_dark > 0.20)
if not _has_ink:
    result[col['key']] = ""
    continue  # skip TrOCR → hemat waktu signifikan
```
TrOCR mahal secara waktu. Jika sel kosong (tidak ada tinta, PaddleOCR juga
tidak mendeteksi apapun), langsung isi dengan string kosong.

**3. Confidence checkbox adalah konstanta:**
```python
checkbox_confidence = 95.0 if terisi else 90.0
```
Deteksi checkbox berbasis pixel sangat reliable — hampir tidak pernah salah
jika threshold tepat. Nilai 95%/90% mencerminkan tingginya keandalan mekanisme ini.

**4. Hapus trailing footer:**
Baris di akhir tabel yang semua kolom datanya kosong (hanya ada teks di
kolom descriptions) dianggap catatan kaki/footer dan dihapus dari hasil.

**5. Fallback bertingkat:**
```
TrOCR ready? → pakai TrOCR
TrOCR loading/gagal? → pakai PaddleOCR dari global OCR
PaddleOCR tidak ada item di area itu? → pakai PaddleOCR crop lokal
Crop gagal? → kembalikan string kosong
```

---

## 13. Pembangun Output JSON

**File:** `app/services/json_builder.py`

Setelah semua field dan tabel terekstrak, hasilnya disusun ke dalam struktur
JSON hierarkis yang konsisten.

### Struktur Output

```json
{
  "document": {
    "no_dok": "FM-LAP-001",
    "versi": "01",
    "hal": "1/1"
  },
  "header": {
    "location": "Grand Mall Bekasi",
    "date_time": "2026-04-01 09:00",
    "technician": "Budi Santoso"
  },
  "checklist": [
    {
      "no": "1",
      "descriptions": "Visual Check",
      "result": "",
      "status": ""
    },
    {
      "no": "",
      "descriptions": "a. UPS Switching source PLN",
      "result": "238",
      "status": "OK",
      "_conf_result": 88.5
    }
  ]
}
```

### Pengelompokan Field

Field dari `field_extractor` dipisah ke dua grup:
- `document` group: field metadata dokumen (`no_dok`, `versi`, `hal`, `label`, `reg_number`)
- `header` group: semua field lainnya (lokasi, tanggal, teknisi, dll.)

Tabel dari `table_extractor` masuk langsung dengan nama sesuai `json_key`
di config template.

### Key `_conf_*`

Setiap sel yang dibaca TrOCR atau PaddleOCR menyimpan confidence-nya dengan
prefix `_conf_`:
```json
{ "result": "238V", "_conf_result": 88.5 }
```
Ini dipakai frontend untuk menampilkan highlight per sel di halaman detail
dan halaman validasi admin.

---

## 14. Kenapa Tulisan Tangan di Kolom "Result" Sekarang Bisa Terbaca?

Sebelumnya, kolom "result" di tabel sering kosong atau salah baca meskipun
TrOCR sudah dipasang. Ini bukan masalah model TrOCR-nya — **modelnya tidak
diubah sama sekali**. Yang diperbaiki adalah **cara kita mempersiapkan gambar
sebelum dikirim ke TrOCR**. Ada tiga perbaikan kunci dengan urutan seperti ini:

### Alur Lengkap: Dari Gambar Kotor ke Teks Terbaca

```
[Gambar halaman mentah dari scan]
        ↓
  STEP 1: PREPROCESSING (CLAHE)
        ↓
  STEP 2: CROP PRESISI PER SEL
        ↓
  STEP 3: DARKNESS CHECK — ada tinta atau tidak?
        ↓ (jika ada tinta)
  STEP 4: TrOCR membaca crop bersih
        ↓
  [Teks hasil baca]
```

---

### STEP 1 — Preprocessing CLAHE: Bersihkan Gambar Dulu Sebelum Apapun

Gambar PDF hasil scan sering punya masalah:
- Kontras tidak merata (ada bagian terang, ada yang gelap)
- Ada bintik-bintik noise dari scanner
- Tulisan tangan terlihat pudar karena tinta tipis

**Apa yang dilakukan preprocessing:**

```
1. Ubah ke grayscale → sederhanakan, hapus informasi warna yang tidak penting
2. Denoise → hilangkan bintik noise dari scanner
3. Gaussian Blur → haluskan sisa noise kecil
4. CLAHE → tingkatkan kontras secara lokal
   → Bagian yang sebelumnya pudar jadi lebih gelap dan jelas
   → Bagian yang sudah jelas tidak ikut over-expose
```

**Analoginya:** Bayangkan tulisan tangan dengan tinta tipis di atas kertas kusam.
Preprocessing ini seperti "memfoto ulang dengan lampu yang lebih baik dan lensa
yang lebih tajam" — tulisan yang sebelumnya hampir tidak kelihatan jadi muncul.

**Mengapa ini penting untuk TrOCR:** TrOCR sangat sensitif terhadap kualitas
gambar input. Jika gambar buram atau kontrasnya rendah, model akan kesulitan
"melihat" bentuk huruf dan hasilnya kosong atau salah. Dengan CLAHE, huruf
tulisan tangan jadi lebih tajam sebelum dipotong dan dikirim ke TrOCR.

---

### STEP 2 — Crop Presisi Per Sel: Beri TrOCR Fokus yang Tepat

Setelah gambar bersih, kita **tidak** memberikan seluruh halaman ke TrOCR.
Kita potong hanya area sel yang relevan.

**Mengapa crop, bukan gambar penuh?**

TrOCR dirancang untuk membaca **satu baris tulisan tangan** dalam satu
gambar kecil, bukan seluruh halaman dokumen. Jika diberi gambar penuh:
- TrOCR bingung harus fokus ke mana
- Kemungkinan besar hanya membaca bagian tertentu secara acak
- Hasilnya tidak akurat

**Cara crop dilakukan:**

```python
# Koordinat sel dihitung dari config template + posisi anchor
x1 = anchor_x + kolom.offset_x_start   # mis. 350px dari anchor
x2 = anchor_x + kolom.offset_x_end     # mis. 500px dari anchor
y1 = row_y                             # batas atas baris ini
y2 = row_y + row_h                     # batas bawah baris ini

# Potong gambar tepat di area sel (+ 4px padding agar teks tidak terpotong)
crop = image.crop(x1-4, y1-4, x2+4, y2+4)
```

Hasilnya: TrOCR mendapat gambar kecil yang berisi tepat satu sel — misalnya
gambar 150×30px yang isinya hanya tulisan "238V". Ini jauh lebih mudah dibaca
daripada gambar halaman penuh 2480×3508px.

---

### STEP 3 — Darkness Check: Jangan Panggil TrOCR Kalau Sel Kosong

TrOCR butuh waktu (sekitar 0.5–2 detik per sel). Kalau tabel punya 30 baris
dan 3 kolom handwritten = 90 panggilan TrOCR hanya untuk satu halaman — sangat
lambat. Solusinya: **cek dulu apakah sel benar-benar berisi tulisan** sebelum
memanggil TrOCR.

**Cara kerjanya — dua sinyal digabungkan:**

```python
# Sinyal 1: PaddleOCR mendeteksi sesuatu di area ini?
# (PaddleOCR global scan sudah jalan duluan — gratis tidak perlu scan lagi)
_has_paddle = ada_item_ocr_di_area_kolom_ini

# Sinyal 2: Pixel darkness ratio — ada tinta atau tidak?
crop_grayscale = convert_to_grayscale(crop)
# Strip 3px atas/bawah agar garis tabel tidak terhitung
inner_crop = crop_grayscale[3:-3, :]
dark_ratio = (inner_crop < 180).mean()
# Piksel < 180 dari skala 0-255 dianggap "gelap" (ada tinta/garis)
_has_ink = dark_ratio > 0.20

# Keputusan:
_call_trocr = _has_paddle OR _has_ink
```

**Mengapa dua sinyal, bukan satu?**

- PaddleOCR saja tidak cukup: PaddleOCR sering **miss** tulisan tangan yang
  tipis atau kecil — justru yang paling butuh TrOCR. Jika hanya andalkan
  PaddleOCR, sel dengan tulisan tangan tipis akan dilewati
- Darkness saja tidak cukup: Garis tabel juga piksel gelap. Threshold 0.20
  sengaja dibuat lebih tinggi dari threshold garis tabel (~0.08–0.10) agar
  tidak false positive

**Hasil gabungan:**
- Sel kosong (tidak ada tinta, PaddleOCR miss) → skip TrOCR → hemat waktu
- Sel dengan tulisan tangan tipis (PaddleOCR miss, tapi darkness > 0.20) → TrOCR dipanggil ✓
- Sel dengan teks cetak (PaddleOCR detect) → TrOCR dipanggil sebagai konfirmasi ✓

---

### Ringkasan: Sebelum vs Sesudah

| Kondisi | Sebelum | Sesudah |
|---------|---------|---------|
| Gambar input TrOCR | Seluruh halaman (tidak tepat sasaran) | Crop presisi satu sel |
| Kualitas gambar | Mentah dari scan, kontras rendah | Sudah dipertajam CLAHE |
| Kapan TrOCR dipanggil | Setiap sel handwritten tanpa filter | Hanya jika ada tanda tinta |
| Hasil kolom "result" | Sering kosong atau salah | Terbaca dengan confidence terukur |

Kuncinya: **TrOCR tidak dilatih ulang, tidak diganti, tidak di-fine-tune.**
Yang berubah adalah kualitas gambar yang diterimanya dan logika kapan ia dipanggil.

---

## 15. Catatan Penting dan Batasan

### Yang Membuat Sistem Ini Robust

- **Fuzzy matching** mengatasi typo kecil dari scanner
- **Overlap ratio** untuk mencari teks dalam bbox lebih toleran dari "harus persis di dalam"
- **Fallback bertingkat** di setiap tahap memastikan sistem tidak crash
- **filter_y1 dinamis** mencegah baris header ikut terekstrak sebagai data

### Keterbatasan

- **Posisi dokumen harus konsisten**: Jika dokumen miring atau sangat bergeser
  dari template, offset tidak akan akurat
- **TrOCR butuh RAM**: Minimum ~4GB RAM untuk memuat model. Matikan dengan
  `TROCR_ENABLED=false` di mesin dengan RAM terbatas
- **Multi-halaman**: Saat ini setiap halaman diproses dengan template yang sama.
  Jika dokumen multi-halaman punya format berbeda per halaman, perlu config
  per-halaman
- **Tulisan tangan yang sangat buruk**: TrOCR dan PaddleOCR sama-sama kesulitan
  dengan tulisan yang benar-benar tidak terbaca — ini keterbatasan OCR secara umum

### Konfigurasi `.env` Kunci

| Variabel | Fungsi | Default |
|----------|--------|---------|
| `TROCR_ENABLED` | Aktifkan TrOCR | `false` |
| `APP_PORT` | Port Flask | `5000` |
| `LARAVEL_API_URL` | URL Laravel untuk fetch template | (wajib) |

---

*Dokumen ini dibuat berdasarkan kode yang ada di `python-engine/app/services/`
dan diskusi implementasi pada sesi pengembangan Tugas Akhir Politeknik Negeri Lhokseumawe.*
