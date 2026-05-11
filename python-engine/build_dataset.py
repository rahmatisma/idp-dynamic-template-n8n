"""
build_dataset.py
----------------
Membangun dataset raw crops untuk fine-tuning TrOCR.

Struktur output (per dokumen):
  dataset/raw_crops/
    {doc_name}/
      page{N}_{idx:04d}.png   <- crop teks hasil PaddleOCR

Alur per dokumen:
  1. Cek skip — jika subfolder {doc_name}/ sudah ada crop, lewati
  2. Konversi PDF -> PNG per halaman (DPI 300, in-memory)
  3. PaddleOCR global scan -> deteksi SEMUA bounding box teks
  4. Crop setiap bounding box + padding 4px
  5. Simpan ke dataset/raw_crops/{doc_name}/page{N}_{idx:04d}.png

Jalankan dari folder python-engine (venv aktif):
    python build_dataset.py
"""

import sys
import re
import time
import cv2
import numpy as np
from pathlib import Path
from pdf2image import convert_from_path
from paddleocr import PaddleOCR

# ─── Konfigurasi ─────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).resolve().parent
SOURCE_DIR  = BASE_DIR / "Lintasarta"
OUTPUT_DIR  = BASE_DIR / "dataset" / "raw_crops"

PDF_DPI        = 300
CROP_PADDING   = 4
MIN_CROP_W     = 10
MIN_CROP_H     = 6
MIN_CONF       = 0.30
PROGRESS_EVERY = 10


# ─── Helpers ─────────────────────────────────────────────────────────────────

def sanitize(name: str) -> str:
    name = re.sub(r'[^\w\-]', '_', name)
    name = re.sub(r'_+', '_', name).strip('_')
    return name


def bounding_rect(box_points):
    pts = np.array(box_points, dtype=np.float32)
    return (int(np.min(pts[:, 0])), int(np.min(pts[:, 1])),
            int(np.max(pts[:, 0])), int(np.max(pts[:, 1])))


def crop_padded(img, x1, y1, x2, y2, pad=CROP_PADDING):
    h, w = img.shape[:2]
    return img[max(0, y1-pad):min(h, y2+pad), max(0, x1-pad):min(w, x2+pad)]


def sep(char="-", w=62):
    print(char * w)


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    pdf_files = sorted(SOURCE_DIR.glob("*.pdf"))
    if not pdf_files:
        print(f"[ERROR] Tidak ada PDF di {SOURCE_DIR}")
        sys.exit(1)

    total_docs = len(pdf_files)

    sep("=")
    print("  DATASET BUILDER - TrOCR Raw Crops")
    sep("=")
    print(f"  Sumber   : {SOURCE_DIR}")
    print(f"  Output   : {OUTPUT_DIR}")
    print(f"  Total PDF: {total_docs}")
    sep()
    print("  Inisialisasi PaddleOCR...")
    sys.stdout.flush()
    ocr = PaddleOCR(use_angle_cls=True, lang='en', show_log=False, enable_mkldnn=False)
    print("  PaddleOCR siap.\n")
    sys.stdout.flush()

    total_pages = 0
    total_crops = 0
    skipped     = 0
    failed_docs = []
    t_start     = time.time()

    for doc_idx, pdf_path in enumerate(pdf_files, start=1):
        doc_name = sanitize(pdf_path.stem)
        doc_dir  = OUTPUT_DIR / doc_name

        # Skip jika subfolder sudah ada dan tidak kosong
        if doc_dir.exists() and any(doc_dir.glob("*.png")):
            n_exist = sum(1 for _ in doc_dir.glob("*.png"))
            print(f"  [{doc_idx:02d}/{total_docs}] SKIP ({n_exist} crop): {pdf_path.name}")
            sys.stdout.flush()
            skipped += 1
            continue

        doc_dir.mkdir(parents=True, exist_ok=True)
        t_doc = time.time()

        try:
            # 1. Konversi PDF -> PIL images (in-memory)
            images_pil = convert_from_path(str(pdf_path), dpi=PDF_DPI, fmt='png')
            num_pages  = len(images_pil)
            total_pages += num_pages
            doc_crops  = 0

            for page_num, pil_img in enumerate(images_pil, start=1):
                img_np = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

                # 2. PaddleOCR global scan
                result = ocr.ocr(img_np, cls=True)
                if not result or not result[0]:
                    continue

                # 3. Crop + simpan
                for box_idx, line in enumerate(result[0], start=1):
                    box_points, (text, conf) = line
                    if conf < MIN_CONF:
                        continue

                    x1, y1, x2, y2 = bounding_rect(box_points)
                    if (x2 - x1) < MIN_CROP_W or (y2 - y1) < MIN_CROP_H:
                        continue

                    crop = crop_padded(img_np, x1, y1, x2, y2)
                    if crop.size == 0:
                        continue

                    # Simpan ke subfolder doc: page{N}_{idx:04d}.png
                    fname = f"page{page_num}_{box_idx:04d}.png"
                    cv2.imwrite(str(doc_dir / fname), crop)
                    doc_crops += 1

            total_crops += doc_crops
            elapsed = time.time() - t_doc
            print(f"  [{doc_idx:02d}/{total_docs}] {pdf_path.name[:48]:<48}"
                  f"| {num_pages:2d} hal | {doc_crops:4d} crop | {elapsed:.1f}s")
            sys.stdout.flush()

        except Exception as e:
            print(f"  [{doc_idx:02d}/{total_docs}] [ERROR] {pdf_path.name}: {e}")
            sys.stdout.flush()
            failed_docs.append(pdf_path.name)

        if doc_idx % PROGRESS_EVERY == 0 and doc_idx < total_docs:
            sep()
            elapsed_total = time.time() - t_start
            processed = doc_idx - skipped - len(failed_docs)
            rate = processed / elapsed_total if elapsed_total > 0 else 0.001
            eta  = (total_docs - doc_idx) / rate if rate > 0 else 0
            print(f"  >> {doc_idx}/{total_docs} dok | {total_pages} hal "
                  f"| {total_crops} crop | ETA ~{eta/60:.0f} menit")
            sep()
            sys.stdout.flush()

    # Ringkasan akhir
    elapsed_total = time.time() - t_start
    sep("=")
    print("  RINGKASAN AKHIR")
    sep("=")
    print(f"  Total PDF           : {total_docs}")
    print(f"  Diproses (baru)     : {total_docs - skipped - len(failed_docs)}")
    print(f"  Di-skip (sudah ada) : {skipped}")
    print(f"  Gagal               : {len(failed_docs)}")
    print(f"  Total halaman       : {total_pages}")
    print(f"  Total crop disimpan : {total_crops}")
    print(f"  Waktu proses        : {elapsed_total/60:.1f} menit")
    print(f"  Output              : {OUTPUT_DIR}")
    if failed_docs:
        print(f"\n  Dokumen GAGAL:")
        for name in failed_docs:
            print(f"    - {name}")
    sep("=")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
