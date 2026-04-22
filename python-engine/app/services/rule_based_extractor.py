import numpy as np
import logging
from typing import Any
from app.utils.fuzzy_matcher import find_best_anchor_match

logger = logging.getLogger(__name__)

def group_rows_robust(all_text_boxes, factor=1.25, min_threshold=10):
    """
    LOGIKA INTI: Mengelompokkan fragment teks menjadi baris logis.
    Menerapkan rumus: delta_y = max(0, current_top - prev_bottom)
    """
    if not all_text_boxes:
        return []
    
    # SORTING: Berdasarkan Y lalu X untuk stabilitas
    # Mendukung format: {'x', 'y', 'w', 'h', 'text'} ATAU [[[x,y],...], (text, conf)]
    def get_y(b): return b.get('y', 0) if isinstance(b, dict) else b[0][0][1]
    def get_x(b): return b.get('x', 0) if isinstance(b, dict) else b[0][0][0]
    def get_h(b): return b.get('h', 10) if isinstance(b, dict) else (b[0][2][1] - b[0][0][1])

    sorted_boxes = sorted(all_text_boxes, key=lambda b: (get_y(b), get_x(b)))
    
    # THRESHOLD: Adaptif berdasarkan median tinggi huruf
    heights = [get_h(b) for b in sorted_boxes]
    y_threshold = max(np.median(heights) * factor, min_threshold)
    
    rows = []
    current_row = [sorted_boxes[0]]
    
    for i in range(1, len(sorted_boxes)):
        # PREV BOTTOM vs CURR TOP (Mendeteksi celah antar baris)
        prev_bottom = get_y(sorted_boxes[i-1]) + get_h(sorted_boxes[i-1])
        curr_top = get_y(sorted_boxes[i])
        
        # Jarak vertikal nyata (Overlap diabaikan dengan max 0)
        gap_y = max(0, curr_top - prev_bottom)
        
        if gap_y > y_threshold:
            rows.append(current_row)
            current_row = [sorted_boxes[i]]
        else:
            current_row.append(sorted_boxes[i])
            
    if current_row:
        rows.append(current_row)
        
    return rows

def _get_box_info(b):
    """Internal helper to normalize OCR box formats."""
    if isinstance(b, dict):
        return b['x'], b['y'], b.get('w', 10), b.get('h', 10), b.get('text', '')
    # PaddleOCR format: [[[x1,y1],...], (text, conf)]
    x = b[0][0][0]
    y = b[0][0][1]
    w = b[0][2][0] - x
    h = b[0][2][1] - y
    text = b[1][0]
    return x, y, w, h, text

def process_rule_based_table(image, table_config, page_ocr_results, ocr_fn):
    """
    Proses ekstraksi tabel menggunakan skema koordinat relatif (Rule-Based).
    """
    # 1. ANCHOR SAFETY
    anchor_config = table_config.get('anchor', {})
    anchor_texts = anchor_config.get('texts', [])
    
    found_anchor = find_best_anchor_match(page_ocr_results, " ".join(anchor_texts))
    if not found_anchor:
        logger.warning(f"[RuleBased] Anchor {anchor_texts} tidak ditemukan. Melewati tabel.")
        return []
    
    x_anc, y_anc = found_anchor[0], found_anchor[1]
    
    # 2. FILTER AREA (Header/Footer Guard)
    area_cfg = table_config.get('area', {})
    y_start = y_anc + area_cfg.get('offset_y', 0)
    y_end = y_start + area_cfg.get('height', 1000)
    
    table_texts = []
    for b in page_ocr_results:
        bx, by, bw, bh, btxt = _get_box_info(b)
        if y_start <= by <= y_end:
            table_texts.append(b)
    
    if not table_texts:
        return []

    # 3. IDENTIFIKASI BARIS (Via Primary Column)
    primary_col = next((c for c in table_config.get('columns', []) if c.get('is_row_anchor')), None)
    if not primary_col:
        return []
        
    buffer = 5 
    primary_texts = []
    for b in table_texts:
        bx, by, bw, bh, btxt = _get_box_info(b)
        if (primary_col['offset_x_start'] - buffer) <= (bx - x_anc) <= (primary_col['offset_x_end'] + buffer):
            primary_texts.append(b)
    
    row_clusters = group_rows_robust(primary_texts)
    
    # 4. EKSTRAKSI TIAP SEL
    results = []
    for cluster in row_clusters:
        y_min = min(_get_box_info(b)[1] for b in cluster) - 2
        y_max = max(_get_box_info(b)[1] + _get_box_info(b)[3] for b in cluster) + 2
        
        row_item = {}
        for col in table_config.get('columns', []):
            x_min = col['offset_x_start'] - buffer
            x_max = col['offset_x_end'] + buffer
            
            cell_texts = []
            for b in table_texts:
                bx, by, bw, bh, btxt = _get_box_info(b)
                if x_min <= (bx - x_anc) <= x_max and y_min <= by <= y_max:
                    cell_texts.append(b)
            
            # Sortir
            def get_y_internal(b): return _get_box_info(b)[1]
            def get_x_internal(b): return _get_box_info(b)[0]
            cell_texts_sorted = sorted(cell_texts, key=lambda b: (get_y_internal(b), get_x_internal(b)))
            
            if not cell_texts_sorted:
                row_item[col['key']] = None
            elif col.get('multi_line'):
                row_item[col['key']] = [_get_box_info(b)[4].strip() for b in cell_texts_sorted]
            else:
                row_item[col['key']] = " ".join([_get_box_info(b)[4].strip() for b in cell_texts_sorted]).strip()
        
        results.append(row_item)
        
    return results
