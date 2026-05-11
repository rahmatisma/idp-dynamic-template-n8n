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


def _is_trocr_noise(text: str) -> bool:
    """Return True jika teks TrOCR terlihat seperti noise (banyak karakter aneh)."""
    if not text or len(text.strip()) < 2:
        return True
    clean = sum(1 for c in text if c.isalnum() or c in ' .,:-/()%+')
    return (clean / len(text)) < 0.5


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

    Algoritma (sesuai kesepakatan diskusi):
    1. Kumpulkan anchor items (kolom is_row_anchor) dan non-anchor items
    2. Deteksi section header: anchor yang tidak punya nilai non-anchor
       dalam range Y-nya (envelope kosong)
    3. Gunakan section header sebagai pemisah grup alami
    4. Dalam setiap grup, tentukan batas bawah dari nilai non-anchor
       pertama di grup berikutnya
    5. Semua anchor yang Y-nya masuk range grup = anggota grup tersebut
    6. Validasi balik: setiap anchor dicek apakah punya nilai non-anchor
       sendiri. Jika tidak → dia berdiri sendiri (header sub-grup)
    7. Return dict dengan ref_y dan next_ref_y untuk row_h akurat
    """
    if not area_items:
        return []

    anchor_col_cfg = next(
        (col for col in columns_config if col.get("is_row_anchor")), None
    )
    if not anchor_col_cfg:
        logger.debug("[TableExtractor] Tidak ada is_row_anchor, fallback ke gap-based.")
        return group_by_y(area_items)

    ax_start = anchor_x + anchor_col_cfg.get("offset_x_start", 0)
    ax_end   = anchor_x + anchor_col_cfg.get("offset_x_end", 200)

    anchor_items = [
        item for item in area_items
        if ax_start <= (item["x"] + item["w"] / 2) <= ax_end
    ]
    if not anchor_items:
        logger.debug("[TableExtractor] Tidak ada item di kolom anchor, fallback ke gap-based.")
        return group_by_y(area_items)

    anchor_items_sorted = sorted(anchor_items, key=lambda i: i["y"])
    avg_h = sum(i["h"] for i in anchor_items_sorted) / len(anchor_items_sorted)

    # ── Kumpulkan semua non-anchor items (printed + handwritten) ─────────────
    # PaddleOCR global scan mendeteksi bounding box semua teks
    # termasuk tulisan tangan — koordinat Y-nya cukup untuk envelope
    non_anchor_items = []
    seen = set()
    for col in columns_config:
        if col.get("is_row_anchor"):
            continue
        col_x_start = anchor_x + col.get("offset_x_start", 0)
        col_x_end   = anchor_x + col.get("offset_x_end", 200)
        for item in area_items:
            item_id = id(item)
            if item_id in seen:
                continue
            center_x = item["x"] + item["w"] / 2
            if col_x_start <= center_x <= col_x_end:
                non_anchor_items.append(item)
                seen.add(item_id)

    non_anchor_sorted = sorted(non_anchor_items, key=lambda i: i["y"])

    # ── Tolerance untuk envelope ─────────────────────────────────────────────
    tolerance = avg_h * 0.3

    # ── Cari kolom kiri (no) untuk deteksi section header ───────────────────
    left_col_cfg = next(
        (col for col in columns_config
         if not col.get("is_row_anchor")
         and col.get("offset_x_start", 0) < 0),
        None
    )
    if left_col_cfg:
        left_x_start = anchor_x + left_col_cfg.get("offset_x_start", 0)
        left_x_end   = anchor_x + left_col_cfg.get("offset_x_end", 0)
    else:
        left_x_start = None
        left_x_end   = None

    # ── STEP 1: Tentukan envelope per anchor candidate ────────────────────────
    anchor_envelopes = []
    for i, item in enumerate(anchor_items_sorted):
        candidate_y      = item["y"]
        next_candidate_y = (
            anchor_items_sorted[i+1]["y"] if i + 1 < len(anchor_items_sorted)
            else candidate_y + 9999
        )
        candidate_envelope = [
            na for na in non_anchor_items
            if candidate_y <= (na["y"] + na["h"] / 2) < (next_candidate_y + tolerance)
        ]
        if candidate_envelope:
            env_max = max(na["y"] + na["h"] / 2 for na in candidate_envelope)
            env_max = min(env_max, next_candidate_y - 1)
        else:
            env_max = candidate_y

        # Deteksi section header berdasarkan kolom 'no' (kiri) terisi
        # Jika ada item non-anchor di range X kolom no untuk baris ini → header
        # Fallback: jika tidak ada kolom no, gunakan envelope kosong
        is_header = False
        if left_x_start is not None:
            no_items = [
                na for na in area_items
                if left_x_start <= (na["x"] + na["w"] / 2) <= left_x_end
                and candidate_y - avg_h * 0.5 <= na["y"] <= candidate_y + avg_h
            ]
            is_header = len(no_items) > 0
        else:
            is_header = len(candidate_envelope) == 0

        anchor_envelopes.append({
            "item":        item,
            "y":           candidate_y,
            "next_y":      next_candidate_y,
            "env_max":     env_max,
            "is_header":   is_header,
            "envelope":    candidate_envelope,
        })

    # ── STEP 2: Kelompokkan anchor berdasarkan section header ─────────────────
    # Section header (envelope kosong) = pemisah grup alami
    # Dalam setiap grup, tentukan batas bawah dari nilai non-anchor
    # pertama milik grup BERIKUTNYA
    groups = []   # list of list of anchor_envelopes
    current_group = []

    for ae in anchor_envelopes:
        if ae["is_header"] and current_group:
            # Section header baru → simpan grup sebelumnya, mulai grup baru
            groups.append(current_group)
            current_group = [ae]
        else:
            current_group.append(ae)

    if current_group:
        groups.append(current_group)

    # ── STEP 3: Dalam setiap grup, tentukan range Y untuk setiap anchor ───────
    # Batas bawah grup = Y dari nilai non-anchor pertama milik grup berikutnya
    # Semua anchor yang Y-nya masuk range = anggota baris yang sama
    ref_groups = []

    for g_idx, group in enumerate(groups):
        if not group:
            continue

        # Cari batas bawah grup ini:
        # = Y anchor pertama di grup berikutnya (jika ada)
        if g_idx + 1 < len(groups):
            next_group_start_y = groups[g_idx + 1][0]["y"]
        else:
            next_group_start_y = group[-1]["y"] + 9999

        # Kumpulkan semua nilai non-anchor dalam range grup ini
        group_start_y = group[0]["y"]
        group_non_anchors = [
            na for na in non_anchor_sorted
            if group_start_y <= (na["y"] + na["h"] / 2) < next_group_start_y
        ]

        # Batas bawah efektif baris pertama dalam grup:
        # = Y non-anchor BERIKUTNYA setelah non-anchor milik baris pertama
        # Ini yang memisahkan "a.UPS Switching" dari "b.Battry voltage"

        # Untuk setiap anchor dalam grup, tentukan non-anchor mana yang miliknya
        # dengan cara: non-anchor yang center_y-nya paling dekat dengan anchor ini
        # dan belum diklaim anchor lain
        claimed = set()

        for ae in group:
            anchor_y   = ae["y"]
            # Non-anchor milik anchor ini = yang center_y-nya masuk range
            # [anchor_y, anchor_y_berikutnya_dalam_grup)
            # Anchor berikutnya dalam grup (bukan section header berikutnya)
            ae_idx = group.index(ae)
            if ae_idx + 1 < len(group):
                next_anchor_in_group_y = group[ae_idx + 1]["y"]
            else:
                next_anchor_in_group_y = next_group_start_y

            own_non_anchors = [
                na for na in group_non_anchors
                if anchor_y <= (na["y"] + na["h"] / 2) < (next_anchor_in_group_y + tolerance)
                and id(na) not in claimed
            ]

            for na in own_non_anchors:
                claimed.add(id(na))

            ref_groups.append({
                "ref_y":          anchor_y,
                "items":          [ae["item"]],
                "has_own_values": len(own_non_anchors) > 0,
                "own_non_anchors": own_non_anchors,
            })

        # ── STEP 4: Tentukan apakah anchor tanpa nilai sendiri adalah lanjutan ─
        merged_refs = []
        prev_was_empty_non_header = False  # flag: apakah ref sebelumnya has_own=False tapi bukan section header

        for rg in ref_groups[-len(group):]:

            if not rg["has_own_values"] and merged_refs:
                # Cari ancestor dengan own_non_anchors
                ancestor = None
                for candidate in reversed(merged_refs):
                    if candidate.get("own_non_anchors"):
                        ancestor = candidate
                        break

                if ancestor:
                    ancestor_env_bottom = max(
                        na["y"] + na["h"] for na in ancestor["own_non_anchors"]
                    )
                    if rg["ref_y"] < ancestor_env_bottom:
                        rg["is_continuation_of_prev"] = True
                        prev_was_empty_non_header = True
                        merged_refs.append(rg)
                        continue
                else:
                    pass  # tidak ada ancestor

                rg["is_continuation_of_prev"] = False
                prev_was_empty_non_header = False  # reset karena tidak masuk envelope → baris mandiri

            elif rg["has_own_values"] and prev_was_empty_non_header and merged_refs:
                # Anchor ini punya nilai sendiri, tapi anchor sebelumnya kosong (non-header)
                # Ini berarti anchor ini adalah "pemilik nilai" yang seharusnya
                # merupakan continuation dari anchor kosong sebelumnya
                # Contoh: source PLN (has_own=True) setelah a.UPS Switching (has_own=False)
                rg["is_continuation_of_prev"] = True
                prev_was_empty_non_header = False
                merged_refs.append(rg)
                continue

            else:
                rg["is_continuation_of_prev"] = False
                prev_was_empty_non_header = False

            merged_refs.append(rg)

        # Ganti ref_groups terakhir dengan merged_refs
        ref_groups = ref_groups[:-len(group)] + merged_refs

    # ── STEP 5: Assign semua area_items ke referensi ─────────────────────────
    row_refs = [g["ref_y"] for g in ref_groups]
    logger.debug(
        f"[TableExtractor] {len(anchor_items_sorted)} anchor items → "
        f"{len(row_refs)} referensi baris."
    )

    row_groups_map: dict[int, list] = {y: [] for y in row_refs}
    assign_tolerance = avg_h * 3

    for item in area_items:
        item_center_y = item["y"] + item["h"] / 2
        assigned      = False

        for i, ref_y in enumerate(row_refs):
            next_ref_y = row_refs[i+1] if i + 1 < len(row_refs) else ref_y + 9999
            if ref_y <= item_center_y < next_ref_y:
                row_groups_map[ref_y].append(item)
                assigned = True
                break

        if not assigned:
            nearest_y = min(row_refs, key=lambda ry: abs(item_center_y - ry))
            if abs(item_center_y - nearest_y) <= assign_tolerance:
                row_groups_map[nearest_y].append(item)

    # ── Return baris dengan metadata ref_y, next_ref_y, dan is_continuation_of_prev ──
    sorted_refs = sorted(row_refs)
    # Buat mapping ref_y → is_continuation_of_prev dari ref_groups
    cont_map = {g["ref_y"]: g.get("is_continuation_of_prev", False) for g in ref_groups}

    result_rows = []
    for i, ref_y in enumerate(sorted_refs):
        if not row_groups_map[ref_y]:
            continue
        next_ref_y = sorted_refs[i+1] if i + 1 < len(sorted_refs) else None
        result_rows.append({
            "items":                   row_groups_map[ref_y],
            "ref_y":                   ref_y,
            "next_ref_y":              next_ref_y,
            "is_continuation_of_prev": cont_map.get(ref_y, False),
        })

    logger.debug(f"[TableExtractor] {len(result_rows)} baris fisik siap diproses.")
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
    # Hitung tolerance per-kolom: 10% lebar kolom atau min 8px
    # Track confidence per kolom: { col_key: [conf_values] }
    _col_conf_acc: dict = {col['key']: [] for col in columns_config}

    for item in row_items:
        center_x = (item['x'] + item['w'] / 2) - anchor_x

        for col in columns_config:
            col_type = col.get('type', 'printed')
            if col_type != 'printed':
                continue
            col_w     = col['offset_x_end'] - col['offset_x_start']
            tolerance = max(8, col_w * 0.10)
            if (col['offset_x_start'] - tolerance) <= center_x <= (col['offset_x_end'] + tolerance):
                existing = result[col['key']]
                result[col['key']] = (existing + " " + item['text']).strip()
                if item.get('confidence') is not None:
                    _col_conf_acc[col['key']].append(item['confidence'] * 100)
                break

    # ── Pass 1.5: Fallback crop + PaddleOCR untuk kolom PRINTED yang kosong ──
    # Jika kolom printed hasilnya kosong dari global scan (misal kolom 'no' yang
    # angkanya kecil), crop area sel dan jalankan PaddleOCR lokal.
    # Ini konsisten dengan mekanisme kolom handwritten yang juga di-crop.
    has_empty_printed = any(
        col.get('type', 'printed') == 'printed' and not result.get(col['key'], '').strip()
        for col in columns_config
    )
    if has_empty_printed and image_path and row_y is not None and row_h is not None:
        try:
            from PIL import Image
            import numpy as np
            from app.services.ocr_service import get_ocr_instance

            img = Image.open(image_path).convert('RGB')
            img_np = np.array(img)
            img_h, img_w = img_np.shape[:2]

            for col in columns_config:
                if col.get('type', 'printed') != 'printed':
                    continue
                if result.get(col['key'], '').strip():
                    continue  # sudah ada dari global OCR, skip

                # Hitung koordinat absolut sel
                x1 = max(0, anchor_x + int(col['offset_x_start']))
                x2 = min(img_w, anchor_x + int(col['offset_x_end']))
                y1 = max(0, row_y - 2)
                y2 = min(img_h, row_y + row_h + 2)

                if x2 <= x1 or y2 <= y1:
                    continue

                crop_np = img_np[y1:y2, x1:x2]
                if crop_np.size == 0:
                    continue

                # Jalankan PaddleOCR pada crop
                import cv2
                ocr = get_ocr_instance()
                crop_bgr = cv2.cvtColor(crop_np, cv2.COLOR_RGB2BGR)
                raw = ocr.ocr(crop_bgr, cls=True)

                if raw and raw[0]:
                    texts = [line[1][0] for line in raw[0] if line[1][1] >= 0.5]
                    if texts:
                        result[col['key']] = ' '.join(texts).strip()
                        logger.debug(f"[TableExtractor] Kolom '{col['key']}' [PaddleOCR Fallback Crop] → '{result[col['key']]}'")

        except Exception as e:
            logger.error(f"[TableExtractor] Error saat fallback crop printed: {e}")

    # ── Pass 2: Voting Ensemble untuk kolom HANDWRITTEN ──────────
    # Jalankan KEDUANYA — PaddleOCR dari global scan DAN TrOCR dari crop.
    # Voting logic:
    #   1. TrOCR kosong / < 2 karakter   → pakai PaddleOCR
    #   2. PaddleOCR tidak ada hasil      → pakai TrOCR
    #   3. Paddle conf > 0.9 + TrOCR noise → pakai PaddleOCR
    #   4. Keduanya ada                   → pakai TrOCR (lebih akurat handwritten)
    # Field _ocr_source_{key} disimpan untuk tracking per-sel.
    has_handwritten = any(col.get('type') == 'handwritten' for col in columns_config)
    if has_handwritten and image_path and row_y is not None and row_h is not None:
        try:
            from app.services.trocr_service import crop_cell_for_trocr, read_handwritten
            import numpy as _np

            for col in columns_config:
                if col.get('type') != 'handwritten':
                    continue

                col_key = col['key']

                # ── Kumpulkan hasil PaddleOCR dari global scan ─────────────
                paddle_text = ""
                paddle_conf_list = []
                for item in row_items:
                    cx = (item['x'] + item['w'] / 2) - anchor_x
                    if col['offset_x_start'] <= cx <= col['offset_x_end']:
                        paddle_text = (paddle_text + " " + item['text']).strip()
                        if item.get('confidence') is not None:
                            paddle_conf_list.append(item['confidence'])
                paddle_conf_avg = (sum(paddle_conf_list) / len(paddle_conf_list)) if paddle_conf_list else 0.0

                # ── Crop sel ────────────────────────────────────────────────
                x1 = anchor_x + int(col['offset_x_start'])
                x2 = anchor_x + int(col['offset_x_end'])
                y1 = row_y
                y2 = row_y + row_h

                crop = crop_cell_for_trocr(image_path, x1, y1, x2, y2)
                if crop is None:
                    logger.debug(f"[TableExtractor] Kolom '{col_key}' handwritten — crop gagal, fallback Paddle.")
                    result[col_key] = paddle_text
                    if paddle_conf_list:
                        result[f"_conf_{col_key}"] = round(paddle_conf_avg * 100, 1)
                    result[f"_ocr_source_{col_key}"] = "paddle"
                    continue

                # Cek ada tinta: PaddleOCR detection ATAU pixel darkness > 0.20
                # (threshold 0.20 cukup tinggi untuk menyaring garis tabel ~0.10)
                _arr   = _np.array(crop.convert('L'))
                _inner = _arr[3:-3, :] if _arr.shape[0] > 6 else _arr
                _dark  = float((_inner < 180).mean())
                _has_ink = bool(paddle_text.strip()) or (_dark > 0.20)

                if not _has_ink:
                    logger.debug(f"[TableExtractor] Kolom '{col_key}' kosong (paddle='', dark={_dark:.3f}), skip TrOCR.")
                    result[col_key] = ""
                    result[f"_ocr_source_{col_key}"] = "paddle"
                    continue

                # ── Jalankan TrOCR ──────────────────────────────────────────
                trocr_text, trocr_conf = read_handwritten(crop)
                trocr_clean  = (trocr_text or '').strip()
                paddle_clean = paddle_text.strip()

                # ── Voting Ensemble ─────────────────────────────────────────
                if not trocr_clean or len(trocr_clean) < 2:
                    # TrOCR kosong / terlalu pendek → pakai PaddleOCR
                    final_text = paddle_clean
                    final_conf = round(paddle_conf_avg * 100, 1)
                    ocr_source = "paddle"
                elif not paddle_clean:
                    # PaddleOCR tidak mendeteksi apapun → pakai TrOCR
                    final_text = trocr_clean
                    final_conf = trocr_conf
                    ocr_source = "trocr"
                elif paddle_conf_avg > 0.9 and _is_trocr_noise(trocr_clean):
                    # Paddle confidence tinggi dan TrOCR noise → pakai Paddle
                    final_text = paddle_clean
                    final_conf = round(paddle_conf_avg * 100, 1)
                    ocr_source = "paddle"
                else:
                    # Keduanya ada hasil → TrOCR lebih akurat untuk handwritten
                    final_text = trocr_clean
                    final_conf = trocr_conf
                    ocr_source = "trocr"

                result[col_key] = final_text
                result[f"_conf_{col_key}"] = final_conf
                result[f"_ocr_source_{col_key}"] = ocr_source
                logger.info(
                    f"[TableExtractor] Kolom '{col_key}' [{ocr_source.upper()}] "
                    f"conf={final_conf:.1f}% → '{final_text}' "
                    f"(paddle='{paddle_clean}' conf={paddle_conf_avg:.2f} | trocr='{trocr_clean}' conf={trocr_conf:.1f}%)"
                )

        except Exception as e:
            logger.error(f"[TableExtractor] Error saat baca handwritten cell: {e}")

    # ── Pass 3: Deteksi centang (CHECKBOX) ────────────────────────
    # Tidak pakai OCR — analisis rasio piksel gelap di area sel.
    # Dark ratio > threshold → tercentang → return checked_val ("OK")
    # Dark ratio ≤ threshold → kosong     → return empty_val ("")
    has_checkbox = any(col.get('type') == 'checkbox' for col in columns_config)
    if has_checkbox and image_path and row_y is not None and row_h is not None:
        try:
            from PIL import Image
            import numpy as np

            img_gray = np.array(Image.open(image_path).convert('L'))
            img_h_px, img_w_px = img_gray.shape

            for col in columns_config:
                if col.get('type') != 'checkbox':
                    continue

                checked_val = col.get('checkbox_checked_value', 'OK')
                empty_val   = col.get('checkbox_empty_value', '')
                threshold   = float(col.get('checkbox_threshold', 0.12))

                x1 = max(0, anchor_x + int(col['offset_x_start']))
                x2 = min(img_w_px, anchor_x + int(col['offset_x_end']))
                # Strip 3px atas/bawah untuk abaikan garis tabel
                y1 = max(0, row_y + 3)
                y2 = min(img_h_px, row_y + row_h - 3)

                if x2 <= x1 or y2 <= y1:
                    result[col['key']] = empty_val
                    continue

                crop = img_gray[y1:y2, x1:x2]
                if crop.size == 0:
                    result[col['key']] = empty_val
                    continue

                dark_ratio = float((crop < 180).mean())
                is_checked = dark_ratio > threshold
                result[col['key']] = checked_val if is_checked else empty_val
                logger.info(
                    f"[TableExtractor] Kolom '{col['key']}' [Checkbox] "
                    f"dark={dark_ratio:.3f} threshold={threshold} → '{result[col['key']]}'"
                )

        except Exception as e:
            logger.error(f"[TableExtractor] Error saat deteksi checkbox: {e}")

    # ── Hitung rata-rata confidence seluruh sel baris ini ─────────
    # Kumpulkan semua nilai confidence yang sudah di-track:
    #   - Printed: dari _col_conf_acc (word-level PaddleOCR)
    #   - Handwritten: dari _conf_{key} yang di-set di Pass 2
    #   - Checkbox: 95.0 jika terisi, 90.0 jika kosong (deteksi pixel sangat reliable)
    all_conf_vals = []
    for col in columns_config:
        key = col['key']
        ctype = col.get('type', 'printed')
        val = (result.get(key) or '').strip()
        if ctype == 'printed':
            accs = _col_conf_acc.get(key, [])
            if accs:
                avg = round(sum(accs) / len(accs), 1)
                all_conf_vals.append(avg)
                result[f"_conf_{key}"] = avg   # simpan per-sel untuk UI warning
        elif ctype == 'handwritten':
            # Gunakan .get() bukan .pop() agar _conf_* tetap ada di result untuk UI
            c = result.get(f"_conf_{key}", None)
            if c is not None:
                all_conf_vals.append(c)
        elif ctype == 'checkbox':
            all_conf_vals.append(95.0 if val else 90.0)

    result['_row_confidence'] = round(sum(all_conf_vals) / len(all_conf_vals), 1) if all_conf_vals else None

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

    # Cari kolom anchor baris (is_row_anchor=True)
    anchor_col = next(
        (col['key'] for col in columns_config if col.get('is_row_anchor')),
        None
    )
    if not anchor_col:
        logger.debug("[TableExtractor] Tidak ada is_row_anchor di config, skip merge multi-line.")
        return physical_rows

    # Kolom yang boleh digabung multi-baris
    multi_line_cols = {col['key'] for col in columns_config if col.get('multi_line')}

    # ── Klasifikasi kolom berdasarkan posisi X relatif anchor (dari config DB) ──
    #
    # "Kolom kiri" (offset_x_start < 0, bukan is_row_anchor):
    #   → Kolom nomor urut (No.) — jika terisi = section header
    #
    # "Kolom data kanan" (offset_x_start >= 0, bukan anchor, bukan multi_line):
    #   → Kolom result, status — jika terisi = baris data mandiri
    #
    # Klasifikasi ini dinamis dari config template di DB, tidak hardcode nama kolom.

    left_cols = [
        col['key'] for col in columns_config
        if not col.get('is_row_anchor')
        and col.get('offset_x_start', 0) < 0
    ]

    right_data_cols = [
        col['key'] for col in columns_config
        if not col.get('is_row_anchor')
        and not col.get('multi_line')
        and col.get('offset_x_start', 0) >= 0
    ]

    def _has_left(row):
        """Kolom kiri (no) terisi → section header."""
        return any((row.get(k) or '').strip() for k in left_cols)

    def _has_right(row):
        """Kolom data kanan (result/status) terisi → baris data."""
        return any((row.get(k) or '').strip() for k in right_data_cols)

    def _has_anchor(row):
        """Kolom anchor (descriptions) terisi."""
        return bool((row.get(anchor_col) or '').strip())

    def _is_section_header(row):
        """
        Baris section header: kolom no (kiri) terisi.
        Contoh: no="1" descriptions="Visual Check" result="" status=""
        Jika kolom no tidak pernah terisi (tidak terbaca OCR),
        fallback: descriptions terisi + result kosong + status kosong
        + baris sebelumnya punya data (bukan awal tabel).
        """
        return _has_left(row)

    def _is_continuation(row, prev_row, prev_was_standalone):
        if _has_left(row):
            return False
        if prev_row is None:
            return False
        flag = row.get('_is_continuation_of_prev', False)
        if flag:
            return True
        if prev_was_standalone:
            return False
        prev_has_anchor = bool((prev_row.get(anchor_col) or '').strip())
        # Tambahan: jika prev punya anchor tapi tidak punya right data,
        # dan current punya anchor juga → current adalah lanjutan prev
        # (kasus: a.UPS Switching → source PLN)
        if prev_has_anchor and not _has_right(prev_row) and _has_anchor(row):
            return True
        return prev_has_anchor

    logical_rows        = []
    current_logical     = None
    prev_physical       = None
    prev_was_standalone = False  # apakah baris fisik sebelumnya adalah baris mandiri

    for row in physical_rows:
        anchor_val = (row.get(anchor_col) or '').strip()
        is_cont    = _is_continuation(row, prev_physical, prev_was_standalone)
        logger.debug(f"[TableExtractor] ROW: anchor='{anchor_val}' | left={_has_left(row)} | right={_has_right(row)} | cont={is_cont}")

        if is_cont and current_logical is not None:
            # ── LANJUTAN: gabung ke baris logis sebelumnya ────────────────────
            for key, val in row.items():
                if key.startswith('_'):
                    continue
                if not (val or '').strip():
                    continue
                if key in multi_line_cols:
                    existing = (current_logical.get(key) or '').strip()
                    current_logical[key] = (existing + ' ' + val.strip()).strip() if existing else val.strip()
                else:
                    if not (current_logical.get(key) or '').strip():
                        current_logical[key] = val.strip()
            # Setelah continuation, cek apakah baris logis sudah punya data kanan
            # Jika sudah lengkap → prev_was_standalone=True (baris berikutnya harus baru)
            # Jika belum lengkap → prev_was_standalone=False (masih bisa dilanjutkan)
            current_has_right = any(
                (current_logical.get(k) or '').strip()
                for k in right_data_cols
            )
            prev_was_standalone = current_has_right

        elif _is_section_header(row) or _has_anchor(row) or _has_right(row):
            # ── BARIS BARU ────────────────────────────────────────────────────
            if current_logical is not None:
                logical_rows.append(current_logical)
            current_logical = dict(row)
            # Section header (left=True) atau baris dengan right data → standalone
            # Baris tanpa right dan tanpa flag continuation → juga standalone
            if _has_left(row) or _has_right(row):
                prev_was_standalone = True
            elif not row.get('_is_continuation_of_prev', False):
                # Baris baru tanpa right dan tanpa flag → standalone
                # (misal: b.Battry voltage yang mandiri)
                prev_was_standalone = True
            else:
                prev_was_standalone = False

        else:
            prev_was_standalone = True

        prev_physical = row

    if current_logical is not None:
        logical_rows.append(current_logical)

    # Bersihkan semua metadata internal sebelum return
    for row in logical_rows:
        row.pop('_is_continuation_of_prev', None)

    # ── POST-PROCESSING: gabungkan baris deskripsi tanpa nilai ke baris berikutnya ──
    # Rule: jika baris N punya descriptions tapi result/standard/status KOSONG,
    # DAN baris N+1 juga punya descriptions dan punya nilai di kolom kanan,
    # DAN baris N+1 bukan section header (no kosong),
    # → gabungkan descriptions N ke depan descriptions N+1
    # Ini menyelesaikan kasus "a.UPS Switching" yang terpisah dari "source PLN"
    post_processed = []
    i = 0
    while i < len(logical_rows):
        row = logical_rows[i]
        row_anchor = (row.get(anchor_col) or '').strip()
        row_has_right = any((row.get(k) or '').strip() for k in right_data_cols)
        row_has_left  = any((row.get(k) or '').strip() for k in left_cols)

        # Cek apakah baris ini adalah kandidat untuk digabung ke depan:
        # - punya descriptions
        # - result/standard/status KOSONG
        # - bukan section header (no kosong)
        # - ada baris berikutnya
        if (
            row_anchor
            and not row_has_right
            and not row_has_left
            and i + 1 < len(logical_rows)
        ):
            next_row = logical_rows[i + 1]
            next_anchor    = (next_row.get(anchor_col) or '').strip()
            next_has_right = any((next_row.get(k) or '').strip() for k in right_data_cols)
            next_has_left  = any((next_row.get(k) or '').strip() for k in left_cols)

            # Gabung hanya jika baris berikutnya:
            # - bukan section header
            # - punya nilai di kolom kanan
            # - bukan sub-item baru (tidak dimulai dengan -, a., b., 1., dst)
            import re as _re
            next_is_new_item = bool(_re.match(r'^[-a-zA-Z]\s|^[-a-zA-Z]\.|^-|^\d+\.', next_anchor))
            if next_has_right and not next_has_left and not next_is_new_item:
                # Gabungkan descriptions baris ini ke depan baris berikutnya
                merged = dict(next_row)
                if next_anchor:
                    merged[anchor_col] = (row_anchor + ' ' + next_anchor).strip()
                else:
                    merged[anchor_col] = row_anchor
                post_processed.append(merged)
                i += 2  # skip baris berikutnya karena sudah digabung
                continue

        post_processed.append(row)
        i += 1

    logical_rows = post_processed

    # ── Shared: kolom non-anchor dan pola sub-item ────────────────────────────
    import re as _re2
    _all_non_anchor = left_cols + right_data_cols + [
        col['key'] for col in columns_config
        if col.get('multi_line') and not col.get('is_row_anchor')
    ]
    _subitem_pat = _re2.compile(r'^[-a-zA-Z]\.|^-\s|^\d+\.')

    # ── POST-PROCESSING: append description-only row ke baris sebelumnya ──────
    # Kasus: baris fisik terakhir dari deskripsi panjang (multi-line) tidak
    # ter-merge karena baris sebelumnya sudah prev_was_standalone=True.
    # Syarat gabung: hanya punya description, bukan sub-item baru,
    # dan baris sebelumnya sudah punya nilai di right_data_cols.
    merged_to_prev = []
    for row in logical_rows:
        row_desc  = (row.get(anchor_col) or '').strip()
        all_empty = all(not (row.get(k) or '').strip() for k in _all_non_anchor)
        has_right_prev = (
            merged_to_prev
            and any((merged_to_prev[-1].get(k) or '').strip() for k in right_data_cols)
        )
        if all_empty and row_desc and not _subitem_pat.match(row_desc) and has_right_prev:
            prev_desc = (merged_to_prev[-1].get(anchor_col) or '').strip()
            merged_to_prev[-1][anchor_col] = (prev_desc + ' ' + row_desc).strip()
            logger.info(f"[TableExtractor] Append desc ke prev: '{row_desc[:40]}'")
        else:
            merged_to_prev.append(row)
    logical_rows = merged_to_prev

    # ── POST-PROCESSING: hapus trailing rows tanpa nilai (footer) ─────────────
    # Baris di akhir tabel yang semua kolom non-anchor-nya kosong dan
    # deskripsinya bukan pola sub-item dianggap footer/catatan kaki.
    while logical_rows:
        last      = logical_rows[-1]
        last_desc = (last.get(anchor_col) or '').strip()
        all_empty = all(not (last.get(k) or '').strip() for k in _all_non_anchor)
        if all_empty and last_desc and not _subitem_pat.match(last_desc):
            logger.info(f"[TableExtractor] Trim footer: '{last_desc[:50]}'")
            logical_rows.pop()
        else:
            break

    merged_count = len(physical_rows) - len(logical_rows)
    if merged_count > 0:
        logger.info(
            f"[TableExtractor] Multi-line merge: {len(physical_rows)} fisik "
            f"→ {len(logical_rows)} logis ({merged_count} digabung)."
        )

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
    raw_offset_y = area_cfg.get('offset_y', 0)
    area_y1  = anchor['y'] + raw_offset_y
    area_y2  = area_y1 + area_cfg.get('height', 500)

    # Filter Y: mulai dari bawah baris anchor (header tabel).
    # Gunakan tinggi aktual anchor (h) + 2px margin agar baris header
    # tabel (yg berisi "No", "Descriptions", dsb) tidak ikut terekstrak.
    filter_y1 = anchor['y'] + anchor.get('h', 20) + 2

    area_items = [
        i for i in ocr_results
        if filter_y1 <= (i['y'] + i['h'] / 2) <= area_y2
    ]

    if not area_items:
        logger.warning(f"[TableExtractor] Tidak ada teks di area tabel '{table_name}'")
        return []

    # ── Fallback crop kolom kiri (no) untuk mendeteksi section header ────────
    # Kolom 'no' sering tidak terdeteksi global OCR karena angkanya kecil.
    # Kita crop seluruh area kolom 'no' sekali dan inject hasilnya ke area_items
    # agar group_by_y_anchor bisa mendeteksi section header dengan benar.
    columns_config = table_config.get('columns', [])
    left_col = next(
        (col for col in columns_config
         if not col.get('is_row_anchor') and col.get('offset_x_start', 0) < 0),
        None
    )
    if left_col and image_path:
        try:
            from PIL import Image as _Image
            import numpy as _np
            from app.services.ocr_service import get_ocr_instance
            import cv2 as _cv2

            _img = _Image.open(image_path).convert('RGB')
            _img_np = _np.array(_img)
            _ih, _iw = _img_np.shape[:2]

            _x1 = max(0, anchor['x'] + int(left_col['offset_x_start']) - 5)
            _x2 = min(_iw, anchor['x'] + int(left_col['offset_x_end']) + 5)
            _y1 = max(0, int(filter_y1))
            _y2 = min(_ih, int(area_y2))

            if _x2 > _x1 and _y2 > _y1:
                _crop = _img_np[_y1:_y2, _x1:_x2]
                _crop_bgr = _cv2.cvtColor(_crop, _cv2.COLOR_RGB2BGR)
                _ocr = get_ocr_instance()
                _raw = _ocr.ocr(_crop_bgr, cls=True)

                if _raw and _raw[0]:
                    _existing_texts = {i['text'] for i in area_items}
                    # Skip teks yang merupakan header kolom
                    _skip_texts = {'no', 'no.', 'number', '#'}
                    for _line in _raw[0]:
                        _text = _line[1][0].strip()
                        _conf = _line[1][1]
                        if _conf < 0.5 or not _text:
                            continue
                        if _text.lower() in _skip_texts:
                            continue
                        # Koordinat absolut
                        _ly = int(_line[0][0][1]) + _y1
                        _lx = int(_line[0][0][0]) + _x1
                        _lw = int(_line[0][2][0]) - int(_line[0][0][0])
                        _lh = int(_line[0][2][1]) - int(_line[0][0][1])
                        # Inject hanya jika belum ada di area_items
                        _key = f"{_text}_{_ly}"
                        if _key not in _existing_texts:
                            area_items.append({
                                'text':       _text,
                                'x':          _lx,
                                'y':          _ly,
                                'w':          max(_lw, 10),
                                'h':          max(_lh, 20),
                                'confidence': _conf,
                            })
                            logger.debug(f"[TableExtractor] Inject kolom no: '{_text}' y={_ly}")
        except Exception as _e:
            logger.warning(f"[TableExtractor] Fallback crop kolom no gagal: {_e}")

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

    # ── Cari kolom anchor untuk kalkulasi row_h yang akurat ──────
    anchor_col_cfg = next(
        (col for col in columns_config if col.get('is_row_anchor')),
        None
    )

    def _get_anchor_items(row_items, anchor_x, anchor_col):
        """Ambil item OCR yang masuk dalam X-range kolom anchor."""
        if not anchor_col:
            return row_items
        ax_start = anchor_x + anchor_col.get('offset_x_start', 0)
        ax_end   = anchor_x + anchor_col.get('offset_x_end', 200)
        items = [
            it for it in row_items
            if ax_start <= (it['x'] + it['w'] / 2) <= ax_end
        ]
        return items if items else row_items

    result_raw = []
    total_rows = len(rows)

    for idx, row in enumerate(rows):
        # ── Ambil items dan metadata dari row ────────────────────────
        if isinstance(row, dict):
            row_items              = row['items']
            ref_y                  = row['ref_y']
            next_ref_y             = row['next_ref_y']
            is_continuation_of_prev = row.get('is_continuation_of_prev', False)
        else:
            row_items              = row
            ref_y                  = None
            next_ref_y             = None
            is_continuation_of_prev = False

        # ── Hitung row_y dan row_h ────────────────────────────────
        if ref_y is not None:
            row_y = ref_y
            if next_ref_y is not None:
                row_h = next_ref_y - ref_y
            else:
                row_h = area_y2 - ref_y
        else:
            anchor_items = _get_anchor_items(row_items, anchor['x'], anchor_col_cfg)
            row_y = min(item['y'] for item in anchor_items)
            row_h = max((item['y'] + item['h']) for item in anchor_items) - row_y
            row_h = max(row_h, 20)

        row_data = split_by_x(
            row_items      = row_items,
            columns_config = columns_config,
            anchor_x       = anchor['x'],
            image_path     = image_path,
            row_y          = row_y,
            row_h          = row_h,
        )

        # Simpan metadata is_continuation_of_prev di row_data
        # agar merge_multi_line_rows bisa menggunakannya
        row_data['_is_continuation_of_prev'] = is_continuation_of_prev

        if any(isinstance(v, str) and v.strip() for k, v in row_data.items() if not k.startswith('_')):
            result_raw.append(row_data)

        if (idx + 1) % 5 == 0 or (idx + 1) == total_rows:
            logger.info(f"[TableExtractor] '{table_name}' progress: {idx + 1}/{total_rows} baris diproses...")

    # ── STEP 2: Gabungkan baris fisik ke baris logis (multi-line) ─
    result = merge_multi_line_rows(result_raw, columns_config)

    # ── Aggregate confidence seluruh baris → confidence tabel ────
    # Kumpulkan _row_confidence dari semua baris fisik (sebelum merge),
    # karena merge bisa menyatukan baris dan menghapus metadata ini.
    row_confs = [
        r['_row_confidence'] for r in result_raw
        if r.get('_row_confidence') is not None
    ]
    table_confidence = round(sum(row_confs) / len(row_confs), 1) if row_confs else None

    # Bersihkan metadata internal, tapi PERTAHANKAN _conf_* dan _ocr_source_*
    # _conf_{key}       → dipakai frontend untuk highlight sel confidence rendah
    # _ocr_source_{key} → tracking sumber OCR per-sel (trocr/paddle/ensemble)
    for row in result:
        for k in list(row.keys()):
            if k.startswith('_') and not k.startswith('_conf_') and not k.startswith('_ocr_source_'):
                row.pop(k, None)

    logger.info(
        f"[TableExtractor] '{table_name}' → {len(result)} baris logis | "
        f"confidence={table_confidence}%"
    )
    # Return tuple (rows, confidence) agar ocr_engine bisa aggregate
    return result, table_confidence