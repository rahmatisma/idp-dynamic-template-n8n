"""
app/services/field_extractor.py
---------------------------------
Ekstraksi field header dokumen menggunakan anchor-based coordinate mapping.

Mendukung dua mode OCR berdasarkan field.type:
    - "printed"     → get_text_in_bbox() dari global PaddleOCR scan (cepat)
    - "handwritten" → TrOCR crop-and-read (akurat untuk tulisan tangan)

Prinsip utama: Global OCR hanya jalan SATU KALI per halaman.
Untuk field printed, hasilnya di-filter spasial.
Untuk field handwritten, gambar di-crop dan dikasih ke TrOCR.
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
        field_name  = field.get('field_name', 'unknown')
        anchor_text = field.get('anchor_text', '')
        offset_x    = field.get('offset_x', 0)
        offset_y    = field.get('offset_y', 0)
        width       = field.get('width', 100)
        height      = field.get('height', 50)
        field_type  = field.get('type', 'printed')   # ← "printed" atau "handwritten"

        # ── Step 1: Cari anchor ───────────────────────────────────
        anchor = find_anchor(ocr_results, anchor_text)
        if not anchor:
            logger.warning(f"[FieldExtractor] Anchor '{anchor_text}' tidak ketemu untuk field '{field_name}'")
            result[field_name] = ""
            continue

        # ── Step 2: Hitung bounding box target ───────────────────
        bbox = calculate_target_box(anchor, offset_x, offset_y, width, height)

        # ── Step 3: Baca teks sesuai jenis tulisan ───────────────
        if field_type == "handwritten":
            value = _read_handwritten_field(image_path, bbox, field_name)
            if value:
                engine_log = "TrOCR (Handwritten)"
            else:
                # Jika TrOCR kosong (karena disabled/gagal), kita coba ambil dari Paddle sebagai fallback
                value = get_text_in_bbox(ocr_results, bbox)
                engine_log = "PaddleOCR (Handwritten Fallback)"
        else:
            # Default: printed → ambil dari hasil global OCR
            value = get_text_in_bbox(ocr_results, bbox)
            engine_log = "PaddleOCR (Printed)"

        logger.info(f"[FieldExtractor] Field '{field_name}' [{engine_log}] → '{value}'")
        result[field_name] = value

    logger.info(f"[FieldExtractor] Selesai. {len(result)} field diekstrak.")
    return result


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
            logger.warning(f"[FieldExtractor] Gagal crop untuk field '{field_name}'.")
            return ""

        return read_handwritten(crop)

    except Exception as e:
        logger.error(f"[FieldExtractor] TrOCR error untuk '{field_name}': {e}")
        return ""
