# 🧠 Implementation Plan: Dynamic Data Extraction Engine (v3 - FINAL)

**Tanggal**: 2026-04-23  
**Status**: ✅ FINAL - Siap Implement  
**Dokumen Uji**: Formulir Preventive Maintenance 1 Phase UPS (`FM-LAP-D2-SOP-003-001`)

---

## 📌 Prinsip Utama (NON-NEGOTIABLE)

> [!IMPORTANT]
> **SATU SCAN, SEGALANYA**: Global OCR hanya dijalankan **SATU KALI** per halaman.
> Semua operasi (field, table) hanya filter dari hasil scan tersebut.
> **TIDAK ADA** crop → OCR ulang.

---

## 🔄 Pipeline Final

```
PDF Input
    │
    ▼
[1] Convert PDF → images[]
    │
    ▼
FOR each image (halaman):
    │
    ▼
[2] Global OCR Scan (1x per halaman)
    PaddleOCR → list [{text, x, y, w, h, confidence}]
    │
    ├─────────────────────────┐
    ▼                         ▼
[3] extract_fields()      [4] extract_tables()
    - find_anchor()           - find_anchor()
    - get_text_in_bbox()      - filter area tabel
    - return dict             - sort_by_y()
    │                         - group_by_y() → baris
    │                         - split_by_x(center_x) → kolom
    │                         - return list of dict
    └─────────────────────────┘
                │
                ▼
[5] Append ke pages[]
                │
                ▼
[6] Return JSON Final
```

---

## 📁 Komponen yang Akan Dibuat

### `app/services/template_mapper.py`

```python
def find_anchor(ocr_results, anchor_text, threshold=75):
    """
    Cari posisi anchor_text dengan fuzzy matching.
    Kalau ada banyak match → ambil yang skor tertinggi + posisi paling atas.
    Return: {"x", "y", "w", "h"} atau None
    """
    matches = []
    for item in ocr_results:
        score = fuzz.partial_ratio(anchor_text.lower(), item['text'].lower())
        if score >= threshold:
            matches.append({**item, 'score': score})

    if not matches:
        return None

    # Prioritas: skor tertinggi, tiebreaker posisi Y paling atas
    best = sorted(matches, key=lambda x: (-x['score'], x['y']))[0]
    return best


def calculate_target_box(anchor, offset_x, offset_y, width, height):
    """
    Hitung koordinat absolut target box dari anchor + offset.
    Return: (x1, y1, x2, y2)
    """
    x1 = anchor['x'] + offset_x
    y1 = anchor['y'] + offset_y
    return (x1, y1, x1 + width, y1 + height)


def get_text_in_bbox(ocr_results, bbox, overlap_threshold=0.5):
    """
    Filter teks dari global OCR yang overlap dengan bbox target.
    Pakai overlap ratio (bukan sekedar 'inside') untuk toleransi scan.
    Return: string teks gabungan
    """
    x1, y1, x2, y2 = bbox
    results = []
    for item in ocr_results:
        ix, iy, iw, ih = item['x'], item['y'], item['w'], item['h']
        # Hitung area overlap
        ox = max(0, min(x2, ix + iw) - max(x1, ix))
        oy = max(0, min(y2, iy + ih) - max(y1, iy))
        overlap_area = ox * oy
        item_area = iw * ih
        if item_area > 0 and (overlap_area / item_area) >= overlap_threshold:
            results.append(item)
    # Sort kiri ke kanan
    results.sort(key=lambda x: x['x'])
    return " ".join(r['text'] for r in results)
```

---

### `app/services/field_extractor.py`

```python
def extract_fields(ocr_results, fields_config):
    """
    Looping tiap field di config:
      1. find_anchor()        → posisi kata kunci di halaman
      2. calculate_target_box() → kotak area isian
      3. get_text_in_bbox()   → ambil teks dari global OCR
    Return: {"location": "Grand Mall Bekasi", ...}
    """
    result = {}
    for field in fields_config:
        anchor = find_anchor(ocr_results, field['anchor_text'])
        if not anchor:
            result[field['field_name']] = ""
            continue
        bbox = calculate_target_box(
            anchor,
            field['offset_x'], field['offset_y'],
            field['width'], field['height']
        )
        result[field['field_name']] = get_text_in_bbox(ocr_results, bbox)
    return result
```

---

### `app/services/table_extractor.py`

```python
def group_by_y(ocr_results, y_threshold=None):
    """
    Sort by Y dulu, lalu group berdasarkan jarak Y antar item.
    y_threshold adaptif: default rata-rata tinggi box.
    Return: list of list (tiap list = satu baris teks)
    """
    if not ocr_results:
        return []
    sorted_items = sorted(ocr_results, key=lambda x: x['y'])
    # Threshold adaptif: rata-rata tinggi semua box
    if y_threshold is None:
        y_threshold = sum(i['h'] for i in sorted_items) / len(sorted_items) * 0.6
    rows, current_row = [], [sorted_items[0]]
    for item in sorted_items[1:]:
        if abs(item['y'] - current_row[-1]['y']) > y_threshold:
            rows.append(current_row)
            current_row = [item]
        else:
            current_row.append(item)
    rows.append(current_row)
    return rows


def split_by_x(row_items, columns_config, anchor_x):
    """
    Tentukan kolom tiap teks berdasarkan CENTER X item vs range kolom.
    Pakai center_x bukan item_x langsung → toleran terhadap pergeseran scan.
    Return: {"no": "1", "descriptions": "...", "result": "...", "status": "OK"}
    """
    result = {col['key']: "" for col in columns_config}
    for item in row_items:
        center_x = (item['x'] + item['w'] / 2) - anchor_x
        for col in columns_config:
            if col['offset_x_start'] <= center_x <= col['offset_x_end']:
                result[col['key']] += (" " + item['text']).strip()
                break
    return result


def extract_table(ocr_results, table_config, anchor):
    """
    Ekstrak satu tabel:
      1. Filter OCR dalam area tabel (anchor_y + offset_y → + height)
      2. group_by_y() → list baris
      3. Tiap baris → split_by_x() → dict satu baris
    Kalau anchor None → return [] (bukan crash)
    """
    if not anchor:
        return []

    area_y1 = anchor['y'] + table_config['area'].get('offset_y', 0)
    area_y2 = area_y1 + table_config['area']['height']
    area_items = [
        i for i in ocr_results
        if area_y1 <= i['y'] <= area_y2
    ]

    rows = group_by_y(area_items)
    result = []
    for row in rows:
        row_data = split_by_x(row, table_config['columns'], anchor['x'])
        # Skip baris kosong total
        if any(v for v in row_data.values()):
            result.append(row_data)
    return result
```

---

### Update `app/services/ocr_engine.py`

```python
# Dalam extract_document(), ganti blok dummy data dengan:

ocr_results = run_global_ocr(img_path)        # 1x scan
config       = selected_template.get('mapping_config', {})

fields_data  = extract_fields(ocr_results, config.get('fields', []))

tables_data  = {}
for table_cfg in config.get('tables', []):
    anchor = find_anchor(ocr_results, table_cfg['anchor']['texts'][0])
    if not anchor:
        tables_data[table_cfg['json_key']] = []
        continue
    rows = extract_table(ocr_results, table_cfg, anchor)
    tables_data[table_cfg['json_key']] = rows

results_per_page.append({
    "page": page_num,
    "status": match_result['status'],
    "confidence": match_result['score'],
    "template_id": selected_template.get('id'),
    "template_name": selected_template.get('type_name'),
    "fields": fields_data,
    "tables": tables_data
})
```

---

## 📊 Format JSON Output Final

```json
{
  "status": "ok",
  "document_id": 52,
  "confidence_score": 100,
  "total_pages": 1,
  "pages": [
    {
      "page": 1,
      "status": "matched",
      "confidence": 100,
      "template_id": 9,
      "template_name": "Formulir Preventive Maintenance 1 Phase UPS",
      "fields": {
        "no_dok": "FM-LAP-D2-SOP-003-001",
        "location": "Grand Mall Bekasi",
        "date_time": "2026-04-01 09:00",
        "brand_type": "APC Smart-UPS"
      },
      "tables": {
        "descriptions": [
          { "no": "1", "descriptions": "Kondisi fisik UPS", "result": "Baik", "standard": "Tidak ada kerusakan", "status": "OK" }
        ],
        "pelaksana": [
          { "no": "1", "nama": "Budi Santoso", "departement": "NOC" }
        ]
      }
    }
  ]
}
```

---

## 📋 Urutan Implementasi

| Step | File | Yang Dibangun | Status |
|------|------|---------------|--------|
| 1 | `template_mapper.py` | `find_anchor()`, `calculate_target_box()`, `get_text_in_bbox()` | ⬜ TODO |
| 2 | `field_extractor.py` | `extract_fields()` | ⬜ TODO |
| 3 | `ocr_engine.py` | Global Scan + integrasi fields | ⬜ TODO |
| 4 | `table_extractor.py` | `group_by_y()`, `split_by_x()`, `extract_table()` | ⬜ TODO |
| 5 | `ocr_engine.py` | Integrasi tables + final JSON multi-page | ⬜ TODO |

---

## ⚠️ Edge Case yang Harus Aman

| Edge Case | Solusi |
|-----------|--------|
| Anchor ada banyak match | Ambil skor tertinggi + Y paling atas |
| `get_text_in_bbox` ambil noise | Pakai overlap ratio ≥ 0.5, bukan sekedar `inside` |
| 2 baris tabel di-merge | Sort Y dulu, threshold adaptif (avg box height × 0.6) |
| Teks overlap 2 kolom | Gunakan `center_x`, bukan `x` kiri item |
| Anchor tabel tidak ketemu | Guard `if not anchor: return []` — jangan crash |
| Teks multi-line dalam 1 sel | Sort by X, join dengan spasi |
