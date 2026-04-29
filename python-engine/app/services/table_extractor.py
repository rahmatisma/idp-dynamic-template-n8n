"""
app/services/table_extractor.py
---------------------------------
Ekstraksi tabel dinamis menggunakan group_by_y + split_by_x.

Mendukung hybrid OCR per-kolom berdasarkan konfigurasi template:
  - col['type'] == "printed"     → teks dari global OCR (cepat)
  - col['type'] == "handwritten" → crop sel → TrOCR (akurat)

Semua koordinat sel dihitung relatif terhadap anchor_x tabel.
"""

import logging
from app.services.template_mapper import find_anchor

logger = logging.getLogger(__name__)


def group_by_y(ocr_items: list, y_threshold: float = None) -> list:
    """
    Kelompokkan item OCR berdasarkan posisi Y (baris) — metode GAP-BASED.

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


def group_by_y_anchor(
    area_items:     list,
    columns_config: list,
    anchor_x:       int,
) -> list:
    """
    Kelompokkan item OCR berdasarkan posisi Y — metode ANCHOR-BASED.

    Lebih akurat dari gap-based untuk tabel yang tinggi barisnya tidak seragam.

    Algoritma:
      1. Temukan semua item dalam X-range kolom is_row_anchor.
      2. Sort by Y → setiap item = referensi Y satu baris.
      3. Merge referensi yang terlalu berdekatan (sub-line OCR) menjadi satu.
      4. Semua item di area tabel di-assign ke referensi Y terdekat.
      5. Return list baris terurut by Y.

    Fallback: kalau tidak ada kolom is_row_anchor, panggil group_by_y().

    Args:
        area_items     : list item OCR dalam area tabel
        columns_config : config kolom dari template (cari is_row_anchor)
        anchor_x       : posisi X anchor tabel

    Returns:
        list of list — tiap list inner = satu baris teks
    """
    if not area_items:
        return []

    # Cari kolom anchor baris
    anchor_col_cfg = next(
        (col for col in columns_config if col.get('is_row_anchor')),
        None
    )
    if not anchor_col_cfg:
        logger.debug("[TableExtractor] Tidak ada is_row_anchor, fallback ke gap-based.")
        return group_by_y(area_items)

    # Range X kolom anchor (absolut)
    ax_start = anchor_x + anchor_col_cfg.get('offset_x_start', 0)
    ax_end   = anchor_x + anchor_col_cfg.get('offset_x_end', 200)

    # Ambil item dalam kolom anchor
    anchor_items = [
        item for item in area_items
        if ax_start <= (item['x'] + item['w'] / 2) <= ax_end
    ]
    if not anchor_items:
        logger.debug("[TableExtractor] Tidak ada OCR item di kolom anchor, fallback ke gap-based.")
        return group_by_y(area_items)

    anchor_items_sorted = sorted(anchor_items, key=lambda i: i['y'])

    # Rata-rata tinggi item anchor untuk merge threshold
    avg_h = sum(i['h'] for i in anchor_items_sorted) / len(anchor_items_sorted)
    merge_threshold = avg_h * 0.5

    # Merge anchor item yang terlalu berdekatan (satu baris OCR terpecah)
    row_refs = [anchor_items_sorted[0]['y']]
    for item in anchor_items_sorted[1:]:
        if item['y'] - row_refs[-1] > merge_threshold:
            row_refs.append(item['y'])

    # Assign semua area_item ke referensi Y terdekat
    row_groups: dict[int, list] = {y: [] for y in row_refs}
    assign_tolerance = avg_h * 3   # item lebih dari 3x tinggi rata-rata = di luar tabel

    for item in area_items:
        item_center_y = item['y'] + item['h'] / 2
        nearest_y = min(row_refs, key=lambda ry: abs(item_center_y - ry))
        if abs(item_center_y - nearest_y) <= assign_tolerance:
            row_groups[nearest_y].append(item)

    # Return baris berurutan, skip yang kosong
    result_rows = [row_groups[y] for y in sorted(row_refs) if row_groups[y]]
    logger.debug(f"[TableExtractor] Anchor-based grouping: {len(row_refs)} referensi Y, {len(result_rows)} baris non-empty.")
    return result_rows

def split_by_x(
    row_items:      list,
    columns_config: list,
    anchor_x:       int,
    image_path:     str  = None,
    row_y:          int  = None,
    row_h:          int  = None,
) -> dict:
    """
    Tentukan kolom tiap teks dalam satu baris berdasarkan CENTER X item.

    Mendukung dua mode per-kolom:
      - type='printed'     → ambil teks dari global OCR (current behavior)
      - type='handwritten' → crop area sel dari image → TrOCR

    Args:
        row_items      : list item OCR dalam satu baris
        columns_config : config kolom dari mapping_config['tables'][n]['columns']
        anchor_x       : posisi X anchor tabel sebagai titik referensi
        image_path     : path PNG halaman — wajib untuk kolom handwritten
        row_y          : Y atas baris — wajib untuk crop handwritten
        row_h          : tinggi baris — wajib untuk crop handwritten

    Returns:
        dict {col_key: value_string}
    """
    result = {col['key']: "" for col in columns_config}

    # ── Pass 1: Assign teks PRINTED dari global OCR ──────────────
    for item in row_items:
        center_x = (item['x'] + item['w'] / 2) - anchor_x

        for col in columns_config:
            col_type = col.get('type', 'printed')
            if col_type == 'printed' and col['offset_x_start'] <= center_x <= col['offset_x_end']:
                existing = result[col['key']]
                result[col['key']] = (existing + " " + item['text']).strip()
                break

    # ── Pass 2: Baca kolom HANDWRITTEN dengan crop + TrOCR ───────
    has_handwritten = any(col.get('type') == 'handwritten' for col in columns_config)
    if has_handwritten and image_path and row_y is not None and row_h is not None:
        try:
            from app.services.trocr_service import crop_cell_for_trocr, read_handwritten

            for col in columns_config:
                if col.get('type') != 'handwritten':
                    continue

                # Optimization: Cek dulu apakah di area ini ada "tanda-tanda" tulisan (dari PaddleOCR)
                # Kalau PaddleOCR pun tidak lihat apa-apa, kemungkinan besar memang kosong.
                has_visual_clue = any(
                    col['offset_x_start'] <= ((item['x'] + item['w'] / 2) - anchor_x) <= col['offset_x_end']
                    for item in row_items
                )
                
                if not has_visual_clue:
                    logger.debug(f"[TableExtractor] Kolom '{col['key']}' terlihat kosong, skip TrOCR.")
                    result[col['key']] = ""
                    continue

                # Coordibar absolut sel
                x1 = anchor_x + int(col['offset_x_start'])
                x2 = anchor_x + int(col['offset_x_end'])
                y1 = row_y
                y2 = row_y + row_h

                crop = crop_cell_for_trocr(image_path, x1, y1, x2, y2)
                if crop is None:
                    # Koordinat invalid → fallback ke PaddleOCR global
                    logger.debug(f"[TableExtractor] Kolom '{col['key']}' handwritten — crop gagal, fallback Paddle.")
                    # Coba ambil dari pass-1 (jika ada teks Paddle di area ini)
                    if not result[col['key']]:
                        for item in row_items:
                            cx = (item['x'] + item['w'] / 2) - anchor_x
                            if col['offset_x_start'] <= cx <= col['offset_x_end']:
                                existing = result[col['key']]
                                result[col['key']] = (existing + " " + item['text']).strip()
                    continue

                trocr_text = read_handwritten(crop)

                if trocr_text:
                    result[col['key']] = trocr_text
                    logger.info(f"[TableExtractor] Kolom '{col['key']}' [TrOCR Handwritten] → '{trocr_text}'")
                else:
                    # TrOCR disabled/fallback → ambil dari global OCR
                    fallback = ""
                    for item in row_items:
                        cx = (item['x'] + item['w'] / 2) - anchor_x
                        if col['offset_x_start'] <= cx <= col['offset_x_end']:
                            fallback = (fallback + " " + item['text']).strip()
                    result[col['key']] = fallback
                    logger.debug(f"[TableExtractor] Kolom '{col['key']}' [PaddleOCR Handwritten Fallback] → '{fallback}'")

        except Exception as e:
            logger.error(f"[TableExtractor] Error saat baca handwritten cell: {e}")

    return result


def merge_multi_line_rows(physical_rows: list, columns_config: list) -> list:
    """
    Gabungkan baris-baris fisik menjadi baris logis berdasarkan kolom anchor.

    Konsep:
      - Baris BARU (logical) dimulai ketika kolom is_row_anchor=True berisi teks.
      - Baris LANJUTAN (continuation) digabung ke baris logis sebelumnya.
      - Kolom multi_line=True  → teks digabung dengan spasi.
      - Kolom multi_line=False → nilai pertama dipertahankan, lanjutan diabaikan.

    Contoh:
      Physical rows:
        { descriptions: "a.AC input voltage", result: "238V", status: "OK" }
        { descriptions: "b.AC output voltage", result: "220V", status: "OK" }  ← is_row_anchor terisi
      → Dua logical rows terpisah (masing-masing punya anchor)

      Physical rows:
        { descriptions: "d. AC current input *)", result: "", status: "" }
        { descriptions: "", result: "2.44", status: "Ok" }  ← continuation
      → Satu logical row: descriptions tetap, result dan status digabung

    Args:
        physical_rows  : list dict dari hasil split_by_x() per baris fisik
        columns_config : config kolom untuk menentukan is_row_anchor & multi_line

    Returns:
        list dict — baris logis yang sudah digabung
    """
    if not physical_rows:
        return []

    # Cari kolom yang jadi anchor baris (is_row_anchor=True)
    anchor_col = next(
        (col['key'] for col in columns_config if col.get('is_row_anchor')),
        None
    )

    # Tanpa anchor column → tidak bisa tentukan baris logis, return as-is
    if not anchor_col:
        logger.debug("[TableExtractor] Tidak ada is_row_anchor di config, skip merge multi-line.")
        return physical_rows

    # Kolom yang boleh digabung multi-baris
    multi_line_cols = {col['key'] for col in columns_config if col.get('multi_line')}

    logical_rows   = []
    current_logical = None

    for row in physical_rows:
        anchor_val = (row.get(anchor_col) or '').strip()

        if anchor_val:
            # ── Baris baru: simpan baris logis sebelumnya, mulai yang baru ──
            if current_logical is not None:
                logical_rows.append(current_logical)
            current_logical = dict(row)   # copy agar tidak mutate original
        else:
            # ── Baris lanjutan: merge ke logical row sebelumnya ──
            if current_logical is None:
                # Edge case: baris pertama tidak punya anchor → buat baru
                current_logical = dict(row)
            else:
                for key, val in row.items():
                    if not (val or '').strip():
                        continue   # skip kolom kosong
                    if key in multi_line_cols:
                        # Gabung dengan spasi
                        existing = (current_logical.get(key) or '').strip()
                        current_logical[key] = (existing + ' ' + val.strip()).strip() if existing else val.strip()
                    # Kalau bukan multi_line: pertahankan nilai pertama (abaikan continuation)

    # Jangan lupa baris terakhir
    if current_logical is not None:
        logical_rows.append(current_logical)

    merged_count = len(physical_rows) - len(logical_rows)
    if merged_count > 0:
        logger.info(f"[TableExtractor] Multi-line merge: {len(physical_rows)} baris fisik → {len(logical_rows)} baris logis ({merged_count} digabung).")

    return logical_rows


def extract_table(
    ocr_results:  list,
    table_config: dict,
    anchor:       dict,
    image_path:   str  = None,
) -> list:
    """
    Ekstrak satu tabel secara dinamis dari global OCR.

    Flow:
      1. Guard: kalau anchor tidak ketemu → return [] (bukan crash)
      2. Filter item OCR dalam area tabel
      3. group_by_y() → list baris
      4. Tiap baris → split_by_x() → dict satu baris
         - Printed cols → dari global OCR
         - Handwritten cols → crop sel + TrOCR (atau fallback Paddle)
      5. Skip baris yang seluruh kolomnya kosong

    Args:
        ocr_results  : hasil global OCR satu halaman
        table_config : config tabel dari mapping_config['tables'][n]
        anchor       : hasil find_anchor() untuk tabel ini
        image_path   : path PNG halaman — wajib untuk sel handwritten

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

    # ── STEP 3: Pilih metode row detection berdasarkan config ────
    row_detection = table_config.get('row_detection', {})
    method        = row_detection.get('method', 'gap_based')

    has_anchor_col = any(col.get('is_row_anchor') for col in columns_config)

    if method == 'anchor_based' and has_anchor_col:
        rows = group_by_y_anchor(area_items, columns_config, anchor['x'])
        logger.info(f"[TableExtractor] Row detection: ANCHOR-BASED ({len(rows)} baris fisik)")
    else:
        rows = group_by_y(area_items)
        logger.info(f"[TableExtractor] Row detection: GAP-BASED ({len(rows)} baris fisik)")

    # Estimasi rata-rata tinggi baris untuk crop Y
    avg_row_h = (
        sum(max(it['h'] for it in row) for row in rows) / len(rows)
        if rows else 30
    )

    result_raw = []
    total_rows = len(rows)
    for idx, row in enumerate(rows):
        # Hitung Y baris ini
        row_y = min(item['y'] for item in row)
        row_h = max((item['y'] + item['h']) for item in row) - row_y
        # Minimal height agar crop tidak terlalu tipis
        if row_h < 10:
            row_h = int(avg_row_h)

        row_data = split_by_x(
            row_items      = row,
            columns_config = columns_config,
            anchor_x       = anchor['x'],
            image_path     = image_path,
            row_y          = row_y,
            row_h          = row_h,
        )
        if any(v.strip() for v in row_data.values()):
            result_raw.append(row_data)
        
        if (idx + 1) % 5 == 0 or (idx + 1) == total_rows:
            logger.info(f"[TableExtractor] '{table_name}' progress: {idx + 1}/{total_rows} baris diproses...")

    # ── STEP 2: Gabungkan baris fisik ke baris logis (multi-line) ─
    result = merge_multi_line_rows(result_raw, columns_config)

    logger.info(f"[TableExtractor] '{table_name}' → {len(result)} baris logis diekstrak.")
    return result
