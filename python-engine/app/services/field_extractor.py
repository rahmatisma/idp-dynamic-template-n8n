"""
app/services/field_extractor.py
---------------------------------
Ekstraksi field header dokumen menggunakan anchor-based coordinate mapping.
Semua teks diambil dari global OCR — tidak ada crop/OCR ulang.
"""

import logging
from app.services.template_mapper import find_anchor, calculate_target_box, get_text_in_bbox

logger = logging.getLogger(__name__)


def extract_fields(ocr_results: list, fields_config: list) -> dict:
    """
    Ekstrak semua field header dokumen berdasarkan konfigurasi template.

    Flow per field:
      1. find_anchor()          → cari posisi kata kunci di halaman
      2. calculate_target_box() → hitung kotak area isian
      3. get_text_in_bbox()     → ambil teks dari global OCR (TANPA OCR ulang)

    Args:
        ocr_results   : hasil global OCR satu halaman
        fields_config : list field dari mapping_config['fields']

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

        # Step 1: Cari anchor
        anchor = find_anchor(ocr_results, anchor_text)
        if not anchor:
            logger.warning(f"[FieldExtractor] Anchor '{anchor_text}' tidak ketemu untuk field '{field_name}'")
            result[field_name] = ""
            continue

        # Step 2: Hitung bounding box target
        bbox = calculate_target_box(anchor, offset_x, offset_y, width, height)

        # Step 3: Ambil teks dari global OCR dalam bbox tersebut
        value = get_text_in_bbox(ocr_results, bbox)

        logger.debug(f"[FieldExtractor] '{field_name}' → '{value}'")
        result[field_name] = value

    logger.info(f"[FieldExtractor] Selesai. {len(result)} field diekstrak.")
    return result
