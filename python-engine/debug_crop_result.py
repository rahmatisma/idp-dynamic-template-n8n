"""
debug_crop_result.py
--------------------
Cek crop kolom result untuk baris-baris yang result-nya kosong:
- h.Charging voltage  (harusnya 107,4VDC)
- i.Charging current  (harusnya 0,01Adc)
- -Measurement 1      (harusnya 107,4VDC)
- Measurement 15t     (harusnya 97,7VDC)

Simpan crop ke storage/debug_crops/ dengan nama deskriptif.
"""

import sys
import os
import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, '.')
from dotenv import load_dotenv
load_dotenv()

from app.services.ocr_service import get_ocr_instance
from app.services.trocr_service import read_handwritten

# ── Config ────────────────────────────────────────────────────────────────
IMAGE_PATH = r'D:\laragon\www\idp-lintasarta\python-engine\storage\pages\temp_109_69f5be609a046_FORM PM POP GRAND MALL BEKASI-5\page_1.png'
OUTPUT_DIR = r'D:\laragon\www\idp-lintasarta\python-engine\storage\debug_crops'

os.makedirs(OUTPUT_DIR, exist_ok=True)

# Anchor tabel descriptions: x=702, y=906
# Kolom result: offset_x_start=438, offset_x_end=618
ANCHOR_X = 702
RESULT_X1 = ANCHOR_X + 438
RESULT_X2 = ANCHOR_X + 618

# Baris yang bermasalah (ref_y dari debug STEP4, next_ref_y dari baris berikutnya)
ROWS_TO_CHECK = [
    {'name': 'h_charging_voltage',   'ref_y': 1710, 'next_ref_y': 1758},
    {'name': 'i_charging_current',   'ref_y': 1758, 'next_ref_y': 1806},
    {'name': 'measurement_1',        'ref_y': 2083, 'next_ref_y': 2135},
    {'name': 'measurement_15t',      'ref_y': 2135, 'next_ref_y': 2182},
]

# ── Load image ─────────────────────────────────────────────────────────────
img = Image.open(IMAGE_PATH).convert('RGB')
img_np = np.array(img)
ih, iw = img_np.shape[:2]

print(f"Image size: {iw}x{ih}")
print(f"Result column X: {RESULT_X1} - {RESULT_X2}")
print()

for row in ROWS_TO_CHECK:
    name     = row['name']
    row_y    = row['ref_y']
    row_h    = row['next_ref_y'] - row['ref_y']

    # Crop area result
    x1 = max(0, RESULT_X1)
    x2 = min(iw, RESULT_X2)
    y1 = max(0, row_y)
    y2 = min(ih, row_y + row_h)

    crop = img_np[y1:y2, x1:x2]
    crop_bgr = cv2.cvtColor(crop, cv2.COLOR_RGB2BGR)

    # Simpan crop
    out_path = os.path.join(OUTPUT_DIR, f'crop_result_{name}.png')
    cv2.imwrite(out_path, crop_bgr)
    print(f"[{name}] crop saved: y={y1}-{y2} h={row_h}px → {out_path}")

    # Baca dengan TrOCR
    try:
        text = read_handwritten(crop)
        print(f"[{name}] TrOCR result: '{text}'")
    except Exception as e:
        print(f"[{name}] TrOCR error: {e}")

    # Baca juga dengan PaddleOCR sebagai pembanding
    try:
        ocr = get_ocr_instance()
        raw = ocr.ocr(crop_bgr, cls=True)
        if raw and raw[0]:
            paddle_texts = [line[1][0] for line in raw[0]]
            print(f"[{name}] PaddleOCR result: {paddle_texts}")
        else:
            print(f"[{name}] PaddleOCR: tidak ada teks terdeteksi")
    except Exception as e:
        print(f"[{name}] PaddleOCR error: {e}")

    print()

print("Selesai. Cek folder storage/debug_crops/ untuk lihat hasil crop.")