"""
app/services/template_mapper.py
--------------------------------
Kalkulasi spasial untuk anchor-based field extraction.
Tidak ada I/O, tidak ada OCR. Murni koordinat dan teks filtering.
"""

import logging
import math
from rapidfuzz import fuzz

logger = logging.getLogger(__name__)


def merge_vertical_neighbors(ocr_results: list) -> list:
    """
    Gabungkan pasangan bbox yang merupakan satu label tercetak dalam dua baris fisik.

    Kondisi merge (keduanya harus terpenuhi):
      1. delta_center_x ≤ max(w_a, w_b) * 0.15  — center-x hampir sama
      2. gap_vertikal = b.y - (a.y + a.h) ≤ 10px — hampir menyentuh
      3. Tidak ada bbox lain yang center_y-nya di antara keduanya
         dengan center_x dalam rentang x kedua bbox

    Merge bersifat chained: A→B→C menghasilkan "A B C".
    Tidak mengubah list asli — bekerja pada salinan.
    """
    if not ocr_results:
        return ocr_results

    items = [dict(r) for r in ocr_results]
    items.sort(key=lambda r: (r['y'], r['x']))

    merged = True
    while merged:
        merged = False
        result = []
        used   = set()

        for i, a in enumerate(items):
            if i in used:
                continue

            a_cx  = a['x'] + a['w'] // 2
            a_bot = a['y'] + a['h']

            best_j    = None
            best_gap  = float('inf')

            for j, b in enumerate(items):
                if j <= i or j in used:
                    continue

                b_cx    = b['x'] + b['w'] // 2
                gap_v   = b['y'] - a_bot
                delta_x = abs(b_cx - a_cx)
                tol_x   = min(a['w'], b['w']) * 0.10

                if gap_v < 0 or gap_v > 10:
                    continue
                if delta_x > tol_x:
                    continue

                # Kondisi 3: tidak ada bbox lain di antara a dan b
                a_cy    = a['y'] + a['h'] // 2
                b_cy    = b['y'] + b['h'] // 2
                x_left  = min(a['x'], b['x'])
                x_right = max(a['x'] + a['w'], b['x'] + b['w'])
                blocker = any(
                    k != i and k != j and k not in used
                    and a_cy < (items[k]['y'] + items[k]['h'] // 2) < b_cy
                    and x_left <= (items[k]['x'] + items[k]['w'] // 2) <= x_right
                    for k in range(len(items))
                )
                if blocker:
                    continue

                if gap_v < best_gap:
                    best_gap = gap_v
                    best_j   = j

            if best_j is not None:
                b    = items[best_j]
                x1   = min(a['x'], b['x'])
                x2   = max(a['x'] + a['w'], b['x'] + b['w'])
                merged_item = {
                    'text':       a['text'] + ' ' + b['text'],
                    'x':          x1,
                    'y':          a['y'],
                    'w':          x2 - x1,
                    'h':          (b['y'] + b['h']) - a['y'],
                    'confidence': min(
                        a.get('confidence', 1.0),
                        b.get('confidence', 1.0),
                    ),
                }
                result.append(merged_item)
                used.add(i)
                used.add(best_j)
                merged = True
            else:
                result.append(a)
                used.add(i)

        # Tambahkan sisa item yang belum masuk result
        for i, a in enumerate(items):
            if i not in used:
                result.append(a)

        items = result

    return items


def find_anchor(
    ocr_results:          list,
    anchor_text:          str,
    threshold:            int   = 65,
    hint_position:        dict  | None  = None,
    hint_tolerance:       float = 0.08,
    image_size:           tuple | None  = None,
    ocr_results_fallback: list  | None  = None,
) -> dict | None:
    """
    Cari posisi anchor_text dalam hasil global OCR menggunakan fuzzy matching.

    Strategi tiga lapis + length penalty:
      - partial_ratio     : tahan terhadap teks yang lebih panjang dari anchor
      - token_sort_ratio  : tahan terhadap urutan kata yang berbeda
      - token_set_ratio   : tahan terhadap kata berulang / subset kata
      - length_penalty    : kurangi skor kandidat yang jauh lebih pendek dari anchor
                            (mencegah fragment "Departement" mengalahkan full label
                            "Head Of Sub Departement" di anchor 3+ kata)

    Threshold otomatis:
      - anchor 1–2 kata : threshold parameter (default 65)
      - anchor 3+ kata  : max(threshold, 75) — lebih ketat untuk anchor panjang

    Hint-position filter (opsional):
      - hint_position  : {"x": float, "y": float} titik tengah anchor dalam rasio 0-1
      - hint_tolerance : radius zona validasi sebagai rasio dimensi gambar (default 0.15)
      - image_size     : (width, height) dalam piksel — wajib untuk konversi rasio
      - Jika hint aktif → hanya kandidat dalam zona yang dipertimbangkan.
      - Fallback       : jika zona kosong, pakai semua kandidat (jangan return None
                         hanya karena hint tidak match).

    Fallback OCR (opsional):
      - ocr_results_fallback : hasil OCR dari gambar asli (sebelum preprocessing)
      - Jika kandidat terbaik dari ocr_results memiliki score < 85, pencarian
        diulangi pada ocr_results_fallback menggunakan parameter hint yang sama.
      - Hasil fallback digunakan jika scorenya lebih tinggi dari hasil primer.
      - Berguna ketika preprocessing (CLAHE/denoise) menyebabkan label tertentu
        tidak terdeteksi atau terdeteksi dengan kualitas buruk.

    Kalau ada banyak match → ambil yang:
      1. Skor tertinggi (setelah penalty)
      2. Posisi Y paling atas (tiebreaker)

    Args:
        ocr_results          : list of dict [{text, x, y, w, h, confidence}]
        anchor_text          : kata kunci yang dicari (misal: "Location", "Date/time")
        threshold            : minimum fuzzy score (0–100), default 65
        hint_position        : titik tengah anchor di canvas (rasio 0–1), opsional
        hint_tolerance       : radius zona dalam rasio (default 0.15 = 15% dimensi gambar)
        image_size           : (img_w, img_h) dalam piksel, diperlukan jika hint_position ada
        ocr_results_fallback : OCR dari gambar asli — dipakai jika skor primer < 85

    Returns:
        dict {text, x, y, w, h, score} atau None kalau tidak ketemu
    """
    # Guard: anchor_text kosong atau None → langsung return None
    if not anchor_text or not anchor_text.strip():
        logger.warning("[Mapper] anchor_text kosong/None, skip pencarian.")
        return None

    anchor_lower      = anchor_text.strip().lower()
    anchor_word_count = len(anchor_lower.split())
    min_candidate_len = max(1, math.ceil(len(anchor_lower) * 0.30))

    # Anchor 3+ kata → naikkan threshold agar fragment pendek tidak menang
    effective_threshold = max(threshold, 75) if anchor_word_count >= 3 else threshold

    # Pre-merge: gabungkan bbox yang merupakan label satu baris tercetak dua baris
    # (contoh: "Head Of Sub" + "Departement" → "Head Of Sub Departement")
    ocr_results_merged = merge_vertical_neighbors(ocr_results)

    matches = []

    for item in ocr_results_merged:
        # Guard: item text bisa None dari PaddleOCR → skip
        item_text = item.get('text') or ''
        if not item_text:
            continue

        item_lower      = item_text.lower()
        item_word_count = len(item_lower.split())

        # Validasi panjang karakter: kandidat terlalu pendek tidak mungkin jadi
        # anchor yang benar. partial_ratio memberi score 100 untuk substring pendek
        # (misal "O" match ke "Head Of Sub Departement").
        if len(item_lower) < min_candidate_len:
            logger.debug(f"[ANCHOR] Skip '{item_text}' — terlalu pendek untuk anchor '{anchor_text}'")
            continue

        # Scoring tiga lapis: partial + token_sort + token_set
        score = max(
            fuzz.partial_ratio(anchor_lower, item_lower),
            fuzz.token_sort_ratio(anchor_lower, item_lower),
            fuzz.token_set_ratio(anchor_lower, item_lower),
        )

        # Length penalty — terapkan hanya untuk anchor 3+ kata.
        # Jika kandidat memiliki lebih sedikit kata dari anchor, skor dikurangi
        # proporsional terhadap rasio jumlah kata.
        # Contoh: anchor 4 kata, kandidat "Departement" (1 kata)
        #   → length_ratio = 1/4 = 0.25 → score 100 → 25
        #   → tidak lolos threshold 75
        if anchor_word_count >= 3 and item_word_count < anchor_word_count:
            length_ratio = item_word_count / anchor_word_count
            penalised    = score * length_ratio
            logger.debug(
                f"[ANCHOR] Length penalty '{item_text}' "
                f"({item_word_count}/{anchor_word_count} kata): "
                f"score {score:.1f} → {penalised:.1f}"
            )
            score = penalised

        # Penalty karakter: kandidat jauh lebih pendek dari anchor (< 70% panjangnya).
        # Mencegah kata pendek seperti "Battery" menang untuk anchor "Battery Bank"
        # (7 < 12×0.7=8.4 → TRUE) atau "Battery Temperature" (7 < 19×0.7=13.3 → TRUE).
        if len(item_lower) < len(anchor_lower) * 0.7:
            penalised = max(0, score - 20)
            logger.debug(
                f"[ANCHOR] Short-text penalty '{item_text}' "
                f"(len={len(item_lower)} < {len(anchor_lower) * 0.5:.1f}): "
                f"score {score:.1f} → {penalised:.1f}"
            )
            score = penalised

        if score >= effective_threshold:
            matches.append({**item, 'score': round(score, 2)})

    # [DEBUG 2 — DebugBug-3: anchor panjang (3+ kata) rawan gagal match]
    if anchor_word_count >= 3 and matches:
        _top5_dbg   = sorted(matches, key=lambda _m: -_m['score'])[:5]
        _top5_parts = []
        for _cand in _top5_dbg:
            _in_zone_dbg = True
            if hint_position and image_size:
                _iw_dbg, _ih_dbg = image_size
                _hx_dbg = hint_position.get('x', 0.5) * _iw_dbg
                _hy_dbg = hint_position.get('y', 0.5) * _ih_dbg
                _tx_dbg = hint_tolerance * _iw_dbg
                _ty_dbg = hint_tolerance * _ih_dbg
                _in_zone_dbg = (
                    abs(_cand['x'] - _hx_dbg) <= _tx_dbg
                    and abs((_cand['y'] + _cand['h'] / 2) - _hy_dbg) <= _ty_dbg
                )
            _top5_parts.append(f"{_cand['text']} score={_cand['score']:.1f} in_zone={_in_zone_dbg}")
        print(f"[ANCHOR-DEBUG] anchor='{anchor_text}' | top candidates: [{', '.join(_top5_parts)}]")

    # ── Hint-position filter (opsional) ──────────────────────────────────────
    # Terapkan SETELAH scoring selesai agar threshold tetap sama.
    # Konversi rasio → piksel, lalu filter kandidat yang center-nya masuk zona.
    # Fallback ke semua kandidat jika zona menghasilkan 0 match.
    if hint_position and image_size and matches:
        img_w, img_h = image_size
        hx    = hint_position.get('x', 0.5) * img_w
        hy    = hint_position.get('y', 0.5) * img_h
        tol_x = hint_tolerance * img_w
        tol_y = hint_tolerance * img_h
        zoned = [
            m for m in matches
            if abs(m['x'] - hx) <= tol_x
            and abs((m['y'] + m['h'] / 2) - hy) <= tol_y
        ]
        if zoned:
            logger.debug(
                f"[ANCHOR] hint_position filter '{anchor_text}': "
                f"{len(zoned)}/{len(matches)} kandidat dalam zona "
                f"center=({hx:.0f},{hy:.0f}) tol=±({tol_x:.0f},{tol_y:.0f})"
            )
            matches = zoned
        else:
            logger.debug(
                f"[ANCHOR] hint_position zona kosong untuk '{anchor_text}' "
                f"center=({hx:.0f},{hy:.0f}) tol=±({tol_x:.0f},{tol_y:.0f}) "
                f"— fallback ke semua {len(matches)} kandidat"
            )

    if not matches:
        logger.warning(
            f"[Mapper] Anchor '{anchor_text}' tidak ketemu "
            f"(threshold={effective_threshold}, anchor_words={anchor_word_count})"
        )
        return None

    # Skor tertinggi dulu, kalau sama → pilih yang paling atas (Y terkecil)
    best = sorted(matches, key=lambda x: (-x['score'], x['y']))[0]

    # Fallback OCR: jika skor terbaik rendah (<85) dan ada OCR dari gambar asli,
    # coba ulang pencarian pada ocr_results_fallback dan ambil yang lebih baik.
    # Kasus utama: preprocessing (CLAHE/denoise) menghilangkan label tertentu.
    if best['score'] < 85 and ocr_results_fallback is not None:
        fb_best = find_anchor(
            ocr_results_fallback, anchor_text, threshold,
            hint_position, hint_tolerance, image_size,
            ocr_results_fallback=None,  # cegah rekursi
        )
        if fb_best and fb_best['score'] > best['score']:
            logger.info(
                f"[Mapper] Fallback OCR menang untuk '{anchor_text}': "
                f"'{fb_best['text']}' score={fb_best['score']} "
                f"> primer '{best['text']}' score={best['score']}"
            )
            best = fb_best

    logger.info(
        f"[Mapper] Anchor '{anchor_text}' → '{best['text']}' "
        f"di ({best['x']},{best['y']}) score={best['score']}"
    )
    return best


def calculate_target_box(
    anchor: dict,
    offset_x: int,
    offset_y: int,
    width: int,
    height: int
) -> tuple:
    """
    Hitung koordinat absolut target box berdasarkan anchor + offset dari config.

    Args:
        anchor   : hasil find_anchor() {x, y, w, h}
        offset_x : jarak horizontal dari anchor ke kotak isian
        offset_y : jarak vertikal dari anchor ke kotak isian
        width    : lebar kotak isian
        height   : tinggi kotak isian

    Returns:
        tuple (x1, y1, x2, y2)
    """
    x1 = anchor['x'] + offset_x
    y1 = anchor['y'] + offset_y
    x2 = x1 + width
    y2 = y1 + height
    return (x1, y1, x2, y2)


def get_text_and_conf_in_bbox(
    ocr_results: list,
    bbox: tuple,
    overlap_threshold: float = 0.5
) -> tuple:
    """
    Seperti get_text_in_bbox() tapi juga mengembalikan rata-rata confidence (0–100).
    Returns (text, avg_conf). avg_conf adalah None jika tidak ada item yang overlap.
    """
    x1, y1, x2, y2 = bbox
    matched = []

    for item in ocr_results:
        ix = item['x']
        iy = item['y']
        iw = item['w']
        ih = item['h']
        item_area = iw * ih
        if item_area <= 0:
            continue
        overlap_w = max(0, min(x2, ix + iw) - max(x1, ix))
        overlap_h = max(0, min(y2, iy + ih) - max(y1, iy))
        ratio = (overlap_w * overlap_h) / item_area
        if ratio >= overlap_threshold:
            matched.append(item)

    if not matched:
        return "", None

    matched.sort(key=lambda x: x['x'])
    text = " ".join(r['text'] for r in matched if r.get('text')).strip()
    conf_vals = [r['confidence'] * 100 for r in matched if r.get('confidence') is not None]
    avg_conf = round(sum(conf_vals) / len(conf_vals), 1) if conf_vals else None
    return text, avg_conf


def get_text_in_bbox(ocr_results: list, bbox: tuple, overlap_threshold: float = 0.5) -> str:
    """
    Filter semua teks dari global OCR yang overlap dengan bbox target.

    Menggunakan overlap RATIO (bukan sekedar 'inside') agar toleran
    terhadap pergeseran scan dan bounding box yang tidak presisi.

    Args:
        ocr_results       : list hasil global OCR
        bbox              : (x1, y1, x2, y2) area target
        overlap_threshold : minimum rasio overlap item vs bbox (0.0–1.0)

    Returns:
        string teks yang sudah digabung, diurutkan kiri ke kanan
    """
    x1, y1, x2, y2 = bbox
    matched = []

    for item in ocr_results:
        ix = item['x']
        iy = item['y']
        iw = item['w']
        ih = item['h']
        item_area = iw * ih

        if item_area <= 0:
            continue

        # Hitung area overlap antara item dan target bbox
        overlap_w = max(0, min(x2, ix + iw) - max(x1, ix))
        overlap_h = max(0, min(y2, iy + ih) - max(y1, iy))
        overlap_area = overlap_w * overlap_h

        ratio = overlap_area / item_area
        if ratio >= overlap_threshold:
            matched.append(item)

    # Sort kiri ke kanan biar urutan teks alami
    matched.sort(key=lambda x: x['x'])
    return " ".join(r['text'] for r in matched if r.get('text')).strip()