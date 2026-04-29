"""
app/services/template_mapper.py
--------------------------------
Kalkulasi spasial untuk anchor-based field extraction.
Tidak ada I/O, tidak ada OCR. Murni koordinat dan teks filtering.
"""

import logging
from rapidfuzz import fuzz

logger = logging.getLogger(__name__)


def find_anchor(ocr_results: list, anchor_text: str, threshold: int = 65) -> dict | None:
    """
    Cari posisi anchor_text dalam hasil global OCR menggunakan fuzzy matching.

    Strategi dua lapis:
      - partial_ratio     : tahan terhadap teks yang lebih panjang dari anchor
      - token_sort_ratio  : tahan terhadap urutan kata yang berbeda

    Kalau ada banyak match → ambil yang:
      1. Skor tertinggi
      2. Posisi Y paling atas (tiebreaker)

    Args:
        ocr_results : list of dict [{text, x, y, w, h, confidence}]
        anchor_text : kata kunci yang dicari (misal: "Location", "Date/time")
        threshold   : minimum fuzzy score (0–100), default 65

    Returns:
        dict {text, x, y, w, h, score} atau None kalau tidak ketemu
    """
    # Guard: anchor_text kosong atau None → langsung return None
    if not anchor_text or not anchor_text.strip():
        logger.warning("[Mapper] anchor_text kosong/None, skip pencarian.")
        return None

    anchor_lower = anchor_text.strip().lower()
    matches = []

    for item in ocr_results:
        # Guard: item text bisa None dari PaddleOCR → skip
        item_text = item.get('text') or ''
        if not item_text:
            continue

        item_lower = item_text.lower()

        # Strategi dua lapis: partial match + token sort (robust vs typo & urutan)
        score = max(
            fuzz.partial_ratio(anchor_lower, item_lower),
            fuzz.token_sort_ratio(anchor_lower, item_lower),
        )

        if score >= threshold:
            matches.append({**item, 'score': score})

    if not matches:
        logger.warning(f"[Mapper] Anchor '{anchor_text}' tidak ketemu (threshold={threshold})")
        return None

    # Skor tertinggi dulu, kalau sama → pilih yang paling atas (Y terkecil)
    best = sorted(matches, key=lambda x: (-x['score'], x['y']))[0]
    logger.info(f"[Mapper] Anchor '{anchor_text}' → '{best['text']}' di ({best['x']},{best['y']}) score={best['score']}")
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