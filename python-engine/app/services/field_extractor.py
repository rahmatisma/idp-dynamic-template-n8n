"""
app/services/field_extractor.py
---------------------------------
Ekstraksi field header dokumen menggunakan anchor-based coordinate mapping.

Mendukung tiga mode berdasarkan field.type:
    - "printed"     → get_text_in_bbox() dari global PaddleOCR scan (cepat)
    - "handwritten" → TrOCR crop-and-read (akurat untuk tulisan tangan)
    - "checkbox"    → pixel darkness detection (untuk kolom centang/checklist)

Prinsip utama: Global OCR hanya jalan SATU KALI per halaman.
Untuk field printed, hasilnya di-filter spasial.
Untuk field handwritten, gambar di-crop dan dikasih ke TrOCR.
Untuk field checkbox, tidak pakai OCR — analisis rasio piksel gelap.
"""

import logging
from app.services.template_mapper import find_anchor, calculate_target_box, get_text_in_bbox

logger = logging.getLogger(__name__)


def extract_fields(ocr_results: list, fields_config: list, image_path: str = None) -> dict:
    """
    Ekstrak semua field header dokumen berdasarkan konfigurasi template.

    Flow per field:
      1. find_anchor()           → cari posisi kata kunci di halaman
      2. calculate_target_box()  → hitung kotak area isian (offset dari anchor)
      3a. get_text_in_bbox()     → [PRINTED] ambil dari global OCR
      3b. TrOCR crop-and-read   → [HANDWRITTEN] crop gambar → baca dengan TrOCR

    Args:
        ocr_results   : hasil global OCR satu halaman (list of dict)
        fields_config : list field dari mapping_config['fields']
        image_path    : path PNG halaman — WAJIB untuk field handwritten

    Returns:
        dict {field_name: value_string}
        Contoh: {"location": "Grand Mall Bekasi", "date_time": "2026-04-01"}
    """
    result = {}

    for field in fields_config:
        if not field.get('field_name'):
            continue
        field_name  = field.get('field_name', 'unknown')
        anchor_text = field.get('anchor_text', '')
        offset_x    = field.get('offset_x', 0)
        offset_y    = field.get('offset_y', 0)
        width       = field.get('width', 100)
        height      = field.get('height', 50)
        field_type  = field.get('type', 'printed')   # ← "printed" atau "handwritten"

        print(f"[FIELD] '{field_name}' [{field_type}] — mencari anchor '{anchor_text}'...")

        # ── Step 1: Cari anchor ───────────────────────────────────
        anchor = find_anchor(ocr_results, anchor_text)
        if not anchor:
            print(f"[FIELD] ✗ '{field_name}': anchor '{anchor_text}' tidak ditemukan → kosong")
            logger.warning(f"[FieldExtractor] Anchor '{anchor_text}' tidak ketemu untuk field '{field_name}'")
            result[field_name] = ""
            continue

        print(f"[FIELD] ✓ Anchor '{anchor_text}' → match '{anchor['text']}' "
              f"di ({anchor['x']},{anchor['y']}) score={anchor.get('score','?')}")

        # ── Step 2: Hitung bounding box target ───────────────────
        bbox = calculate_target_box(anchor, offset_x, offset_y, width, height)

        # ── Step 3: Baca teks sesuai jenis tulisan ───────────────
        if field_type == "checkbox":
            value = _detect_checkbox_field(image_path, bbox, field)
            engine_log = "Checkbox"
        elif field_type == "handwritten":
            value = _read_handwritten_field(image_path, bbox, field_name)
            if value:
                engine_log = "TrOCR"
            else:
                # Jika TrOCR kosong (karena disabled/gagal), coba PaddleOCR sebagai fallback
                value = get_text_in_bbox(ocr_results, bbox)
                engine_log = "PaddleOCR (fallback)"
        else:
            # Default: printed → ambil dari hasil global OCR
            value = get_text_in_bbox(ocr_results, bbox)
            engine_log = "PaddleOCR"

        if field_type != "checkbox" and value:
            value = value.lstrip(":.- ").strip()
        status_icon = "✓" if value else "○"
        print(f"[FIELD] {status_icon} '{field_name}' [{engine_log}] → '{value or '(kosong)'}'")
        logger.info(f"[FieldExtractor] Field '{field_name}' [{engine_log}] → '{value}'")
        result[field_name] = value

    logger.info(f"[FieldExtractor] Selesai. {len(result)} field diekstrak.")
    return result


def _detect_checkbox_field(image_path: str, bbox: tuple, field_config: dict) -> str:
    """
    Deteksi centang berdasarkan rasio piksel gelap di area bbox.

    Tidak menggunakan OCR — centang meninggalkan tinta signifikan
    yang bisa diukur dari grayscale darkness ratio.

    Returns:
        checkbox_checked_value (default "OK")  jika dark_ratio > threshold
        checkbox_empty_value   (default "")    jika kosong
    """
    if not image_path:
        return ""
    try:
        from PIL import Image
        import numpy as np

        checked_val = field_config.get('checkbox_checked_value', 'OK')
        empty_val   = field_config.get('checkbox_empty_value', '')
        threshold   = float(field_config.get('checkbox_threshold', 0.12))

        img_gray = np.array(Image.open(image_path).convert('L'))
        img_h, img_w = img_gray.shape

        x1, y1, x2, y2 = [int(v) for v in bbox]
        x1 = max(0, x1);       y1 = max(0, y1 + 3)
        x2 = min(img_w, x2);   y2 = min(img_h, y2 - 3)

        if x2 <= x1 or y2 <= y1:
            return empty_val

        crop = img_gray[y1:y2, x1:x2]
        dark_ratio = float((crop < 180).mean())
        is_checked = dark_ratio > threshold

        logger.info(
            f"[FieldExtractor] Checkbox dark={dark_ratio:.3f} threshold={threshold} "
            f"→ '{'checked' if is_checked else 'empty'}'"
        )
        return checked_val if is_checked else empty_val

    except Exception as e:
        print(f"[FIELD] ❌ Error checkbox detection: {e}")
        logger.error(f"[FieldExtractor] Error deteksi checkbox: {e}")
        return ""


def _read_handwritten_field(image_path: str, bbox: tuple, field_name: str) -> str:
    """
    Baca satu field tulisan tangan menggunakan TrOCR.

    Alur:
        crop_image_for_trocr() → potong gambar di area bbox
        read_handwritten()     → TrOCR baca crop → return teks

    Fallback: kalau image_path tidak ada atau TrOCR gagal → return ""
    """
    if not image_path:
        logger.warning(f"[FieldExtractor] image_path tidak ada, field '{field_name}' handwritten di-skip.")
        return ""

    try:
        from app.services.trocr_service import crop_image_for_trocr, read_handwritten

        crop = crop_image_for_trocr(image_path, bbox)
        if crop is None:
            print(f"[FIELD] ⚠️  Crop gagal untuk field '{field_name}' (bbox={bbox})")
            logger.warning(f"[FieldExtractor] Gagal crop untuk field '{field_name}'.")
            return ""

        text, conf = read_handwritten(crop)
        if text:
            print(f"[FIELD] TrOCR '{field_name}': '{text}' (conf={conf:.1f}%)")
        else:
            print(f"[FIELD] TrOCR '{field_name}': tidak terbaca (conf={conf:.1f}%)")
        return text

    except Exception as e:
        print(f"[FIELD] ❌ TrOCR error untuk '{field_name}': {e}")
        logger.error(f"[FieldExtractor] TrOCR error untuk '{field_name}': {e}")
        return ""
