"""
debug_crop_visual.py
Simpan semua crop sebagai gambar dengan nama informatif
Jalankan: python debug_crop_visual.py
"""

import os
import sys
import cv2
import numpy as np
from PIL import Image
from pathlib import Path

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from dotenv import load_dotenv
load_dotenv()

# ── Ganti path ini ──
IMAGE_PATH = os.path.join(
    BASE_DIR, 'storage', 'pages',
    'temp_106_69f37f4e73803_FORM PM POP GRAND MALL BEKASI-5',
    'page_1_pre.png'
)

OUTPUT_DIR = os.path.join(BASE_DIR, 'storage', 'debug_crops')
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── Helper: crop dan simpan gambar ──
def save_crop(image_np, x, y, w, h, filename, padding=5):
    """Crop area dari gambar dan simpan ke file"""
    ih, iw = image_np.shape[:2]
    
    # Tambah padding
    x1 = max(0, x - padding)
    y1 = max(0, y - padding)
    x2 = min(iw, x + w + padding)
    y2 = min(ih, y + h + padding)
    
    if x2 <= x1 or y2 <= y1:
        print(f"   ⚠️  Skip {filename} — area invalid ({x1},{y1},{x2},{y2})")
        return False
    
    crop = image_np[y1:y2, x1:x2]
    if crop.size == 0:
        print(f"   ⚠️  Skip {filename} — crop kosong")
        return False
    
    out_path = os.path.join(OUTPUT_DIR, filename)
    cv2.imwrite(out_path, crop)
    print(f"   ✅ {filename} ({x2-x1}x{y2-y1}px)")
    return True

# ── Load gambar ──
print(f"\n📸 Load gambar: {IMAGE_PATH}")
if not os.path.exists(IMAGE_PATH):
    print("❌ File tidak ditemukan!")
    sys.exit(1)

img_pil = Image.open(IMAGE_PATH).convert("RGB")
img_np  = cv2.cvtColor(np.array(img_pil), cv2.COLOR_RGB2BGR)
img_h, img_w = img_np.shape[:2]
print(f"   Ukuran: {img_w}x{img_h}px")

# ── Load OCR results ──
print("\n🔍 Jalankan Global OCR...")
from app.services.ocr_engine import run_global_ocr
ocr_results = run_global_ocr(IMAGE_PATH)
print(f"   {len(ocr_results)} item teks ditemukan")

# ── Load template ──
print("\n📋 Ambil template dari Laravel...")
from app.services.ocr_engine import fetch_active_templates, detect_template
from app.services.template_mapper import find_anchor

all_templates = fetch_active_templates()
match = detect_template(IMAGE_PATH, all_templates)

if not match or match.get('status') == 'no_match':
    print("❌ Template tidak terdeteksi!")
    sys.exit(1)

template     = match['template']
mapping      = template.get('mapping_config', {})
fields_cfg   = mapping.get('fields', [])
tables_cfg   = mapping.get('tables', [])

print(f"   Template: '{template.get('type_name')}' | skor={match.get('score')}")
print(f"   Fields: {len(fields_cfg)} | Tables: {len(tables_cfg)}")

# ══════════════════════════════════════════
# BAGIAN 1 — FIELD CROPS
# ══════════════════════════════════════════
print(f"\n{'='*55}")
print("BAGIAN 1 — FIELD CROPS")
print(f"{'='*55}")

for field in fields_cfg:
    field_name   = field.get('field_name', 'unknown')
    anchor_text  = field.get('anchor_text', '')
    offset_x     = field.get('offset_x', 0)
    offset_y     = field.get('offset_y', 0)
    width        = field.get('width', 100)
    height       = field.get('height', 50)
    
    print(f"\n🔹 Field: '{field_name}' | anchor: '{anchor_text}'")
    
    # Cari anchor di OCR results
    anchor = find_anchor(ocr_results, anchor_text)
    if not anchor:
        print(f"   ❌ Anchor '{anchor_text}' tidak ditemukan")
        continue
    
    anchor_x = anchor['x']
    anchor_y = anchor['y']
    anchor_w = anchor['w']
    anchor_h = anchor['h']
    
    print(f"   Anchor ditemukan: x={anchor_x} y={anchor_y}")
    
    # ── Simpan ANCHOR crop ──
    save_crop(
        img_np,
        anchor_x, anchor_y, anchor_w, anchor_h,
        f"crop_field_{field_name}_ANCHOR.png"
    )
    
    # ── Simpan VALUE crop ──
    value_x = anchor_x + offset_x
    value_y = anchor_y + offset_y
    save_crop(
        img_np,
        value_x, value_y, width, height,
        f"crop_field_{field_name}_VALUE.png"
    )

# ══════════════════════════════════════════
# BAGIAN 2 — TABLE CROPS
# ══════════════════════════════════════════
print(f"\n{'='*55}")
print("BAGIAN 2 — TABLE CROPS")
print(f"{'='*55}")

from app.services.table_extractor import (
    group_by_y, group_by_y_anchor, split_by_x
)

for tc in tables_cfg:
    table_name = tc.get('table_name', 'unknown')
    json_key   = tc.get('json_key', table_name.lower())
    cols       = tc.get('columns', [])
    area_cfg   = tc.get('area', {})
    
    print(f"\n📊 Tabel: '{table_name}'")
    
    # Cari anchor tabel
    anchor_texts = tc.get('anchor', {}).get('texts', [])
    if not anchor_texts:
        print(f"   ❌ Tidak ada anchor text")
        continue
    
    anchor = find_anchor(ocr_results, anchor_texts[0])
    if not anchor:
        print(f"   ❌ Anchor '{anchor_texts[0]}' tidak ditemukan")
        continue
    
    anchor_x = anchor['x']
    anchor_y = anchor['y']
    print(f"   Anchor: '{anchor['text']}' | x={anchor_x} y={anchor_y}")
    
    # ── Simpan ANCHOR crop tabel ──
    save_crop(
        img_np,
        anchor['x'], anchor['y'], anchor['w'], anchor['h'],
        f"crop_table_{json_key}_ANCHOR.png"
    )
    
    # Filter area tabel
    raw_offset_y = area_cfg.get('offset_y', 0)
    area_y1 = anchor_y + raw_offset_y
    area_y2 = area_y1 + area_cfg.get('height', 500)
    
    # Filter Y: mulai dari anchor_y + 10px (sesuai table_extractor.py)
    filter_y1 = anchor_y + 10
    
    area_items = [i for i in ocr_results if filter_y1 <= i['y'] <= area_y2]
    
    print(f"   Area Y: {filter_y1} ~ {area_y2} | {len(area_items)} item OCR")
    
    # Group by Y (rows)
    method = tc.get('row_detection', {}).get('method', 'gap_based')
    has_anchor_col = any(c.get('is_row_anchor') for c in cols)
    
    if method == 'anchor_based' and has_anchor_col:
        rows = group_by_y_anchor(area_items, cols, anchor_x)
    else:
        rows = group_by_y(area_items)
    
    print(f"   Baris terdeteksi: {len(rows)}")
    
    # Cari kolom anchor (is_row_anchor=True) — sama persis dengan logika produksi
    anchor_col = next((c for c in cols if c.get('is_row_anchor')), None)
    
    def _get_anchor_items(row, anchor_x, anchor_col):
        """Filter item OCR dalam X-range kolom anchor."""
        if not anchor_col:
            return row
        ax_start = anchor_x + anchor_col.get('offset_x_start', 0)
        ax_end   = anchor_x + anchor_col.get('offset_x_end', 200)
        items = [it for it in row if ax_start <= (it['x'] + it['w'] / 2) <= ax_end]
        return items if items else row  # fallback ke semua item

    # Hitung avg_row_h HANYA dari kolom anchor (konsisten dengan table_extractor.py)
    avg_row_h = 50  # default
    if rows:
        anchor_heights = []
        for row in rows:
            ai = _get_anchor_items(row, anchor_x, anchor_col)
            if ai:
                rh = max((it['y'] + it['h']) for it in ai) - min(it['y'] for it in ai)
                anchor_heights.append(max(rh, 20))
        if anchor_heights:
            avg_row_h = int(sum(anchor_heights) / len(anchor_heights))
    
    print(f"   Rata-rata tinggi baris (anchor-based): {avg_row_h}px")
    
    # ── Untuk setiap baris, simpan crop tiap kolom ──
    for row_idx, row in enumerate(rows):
        if not row:
            continue
        
        # row_y dan row_h dihitung dari kolom anchor saja (sama dengan produksi)
        anchor_items = _get_anchor_items(row, anchor_x, anchor_col)
        row_y = min(item['y'] for item in anchor_items)
        row_h = max((item['y'] + item['h']) for item in anchor_items) - row_y
        
        # Batas atas 1.3x avg_row_h, batas bawah 20px (sama dengan table_extractor.py)
        row_h = min(row_h, int(avg_row_h * 1.3))
        row_h = max(row_h, 20)
        
        # Buat label baris dari teks kolom anchor (untuk nama file)
        row_label = f"row{row_idx+1:02d}"
        if anchor_items:
            desc_text = anchor_items[0]['text'][:20]
            safe_text = "".join(c if c.isalnum() else "_" for c in desc_text).strip("_")
            row_label = f"row{row_idx+1:02d}_{safe_text}"
        
        # Simpan crop untuk setiap kolom
        for col in cols:
            col_key  = col.get('key', 'unknown')
            col_type = col.get('type', 'printed')
            
            # Hitung posisi X absolut kolom
            x1 = anchor_x + col['offset_x_start']
            x2 = anchor_x + col['offset_x_end']
            col_w = x2 - x1
            
            if col_w <= 0:
                continue
            
            # Nama file dengan info lengkap
            type_tag = "HW" if col_type == "handwritten" else "PR"
            filename = f"crop_{json_key}_{row_label}_col_{col_key}_{type_tag}.png"
            
            save_crop(img_np, x1, row_y, col_w, row_h, filename)

print(f"\n{'='*55}")
print(f"✅ SELESAI! Semua crop disimpan di:")
print(f"   {OUTPUT_DIR}")
print(f"{'='*55}")

# ── Summary ──
all_crops = list(Path(OUTPUT_DIR).glob("*.png"))
print(f"\n📁 Total file crop: {len(all_crops)}")
print("\nLegend nama file:")
print("  ANCHOR = kotak anchor (teks label/header)")
print("  VALUE  = kotak value (area yang dibaca OCR)")
print("  HW     = Handwritten (TrOCR)")
print("  PR     = Printed (PaddleOCR)")