"""
app/services/table_extractor.py
---------------------------------
Ekstraksi tabel dinamis menggunakan group_by_y + split_by_x.
Semua teks diambil dari global OCR — tidak ada crop/OCR ulang per cell.
"""

import logging
from app.services.template_mapper import find_anchor

logger = logging.getLogger(__name__)


def group_by_y(ocr_items: list, y_threshold: float = None) -> list:
    """
    Kelompokkan item OCR berdasarkan posisi Y (baris).

    Sort by Y dulu → group berdasarkan jarak Y antar item.
    Threshold adaptif: default 60% dari rata-rata tinggi box.

    Args:
        ocr_items   : list item OCR dalam area tabel
        y_threshold : piksel jarak Y buat nentuin baris baru (None = auto)

    Returns:
        list of list — tiap list inner = satu baris teks
    """
    if not ocr_items:
        return []

    sorted_items = sorted(ocr_items, key=lambda x: x['y'])

    if y_threshold is None:
        avg_h = sum(i['h'] for i in sorted_items) / len(sorted_items)
        y_threshold = avg_h * 0.6

    rows = []
    current_row = [sorted_items[0]]

    for item in sorted_items[1:]:
        if abs(item['y'] - current_row[-1]['y']) > y_threshold:
            rows.append(current_row)
            current_row = [item]
        else:
            current_row.append(item)

    rows.append(current_row)
    return rows


def split_by_x(row_items: list, columns_config: list, anchor_x: int) -> dict:
    """
    Tentukan kolom tiap teks dalam satu baris berdasarkan CENTER X item.

    Pakai center_x (bukan x kiri item) agar toleran terhadap pergeseran scan.

    Args:
        row_items      : list item OCR dalam satu baris
        columns_config : config kolom dari mapping_config['tables'][n]['columns']
        anchor_x       : posisi X anchor tabel sebagai titik referensi

    Returns:
        dict {col_key: value_string}
    """
    result = {col['key']: "" for col in columns_config}

    for item in row_items:
        center_x = (item['x'] + item['w'] / 2) - anchor_x

        for col in columns_config:
            if col['offset_x_start'] <= center_x <= col['offset_x_end']:
                existing = result[col['key']]
                result[col['key']] = (existing + " " + item['text']).strip()
                break

    return result


def extract_table(ocr_results: list, table_config: dict, anchor: dict) -> list:
    """
    Ekstrak satu tabel secara dinamis dari global OCR.

    Flow:
      1. Guard: kalau anchor tidak ketemu → return [] (bukan crash)
      2. Filter item OCR dalam area tabel
      3. group_by_y() → list baris
      4. Tiap baris → split_by_x() → dict satu baris
      5. Skip baris yang seluruh kolomnya kosong

    Args:
        ocr_results  : hasil global OCR satu halaman
        table_config : config tabel dari mapping_config['tables'][n]
        anchor       : hasil find_anchor() untuk tabel ini

    Returns:
        list of dict — tiap dict = satu baris tabel
    """
    table_name = table_config.get('table_name', 'unknown')

    if not anchor:
        logger.warning(f"[TableExtractor] Anchor tabel '{table_name}' tidak ketemu. Skip.")
        return []

    area_cfg = table_config.get('area', {})
    area_y1  = anchor['y'] + area_cfg.get('offset_y', 0)
    area_y2  = area_y1 + area_cfg.get('height', 500)

    area_items = [
        i for i in ocr_results
        if area_y1 <= i['y'] <= area_y2
    ]

    if not area_items:
        logger.warning(f"[TableExtractor] Tidak ada teks di area tabel '{table_name}'")
        return []

    columns_config = table_config.get('columns', [])
    rows           = group_by_y(area_items)

    result = []
    for row in rows:
        row_data = split_by_x(row, columns_config, anchor['x'])
        if any(v.strip() for v in row_data.values()):
            result.append(row_data)

    logger.info(f"[TableExtractor] '{table_name}' → {len(result)} baris diekstrak.")
    return result
