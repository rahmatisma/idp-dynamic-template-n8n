"""
debug_anchor_investigation.py
------------------------------
Investigasi mendalam find_anchor() untuk dokumen 242 / template 32.
Menampilkan SEMUA kandidat (termasuk yang di bawah threshold) per anchor,
kalkulasi avg_char_width, dan analisis multiplier 2.5.

Jalankan dari python-engine/:
    python debug_anchor_investigation.py
"""

import sys
import os
import math
import statistics

sys.path.insert(0, os.path.dirname(__file__))

from rapidfuzz import fuzz
from app.services.ocr_engine import run_global_ocr
from app.services.preprocessor import preprocess_image

# ── Konstanta ─────────────────────────────────────────────────────────────────
PAGE_1_PRE = r"storage\pages\temp_242_6a198b8a834d1_POP-CILEUNYI-2\page_1_pre.png"

ANCHORS_TO_INVESTIGATE = [
    "Location",
    "Date/time",
    "Notes / additional informations",
    "Descriptions",
    "Verifikator",
    "Head Of Sub Departement",
]

# Semua anchor di mapping_config template 32 (untuk kalkulasi multiplier)
ALL_ANCHORS_TEMPLATE_32 = [
    "No.Dok.",
    "Versi",
    "Hal",
    "Label",
    "Location",
    "Date/time",
    "Notes / additional informations",
    "Verifikator",
    "Head Of Sub Departement",
    "Descriptions",   # tabel 1
    "Executor",       # tabel 2
]

DEFAULT_THRESHOLD = 65

# ── Helper: replika logika find_anchor() dengan logging lengkap ────────────────
def find_anchor_verbose(ocr_results: list, anchor_text: str, threshold: int = DEFAULT_THRESHOLD):
    """
    Jalankan find_anchor() tapi kembalikan SEMUA kandidat (lolos maupun tidak),
    termasuk kandidat yang terlalu pendek (biasanya di-skip diam-diam).
    """
    anchor_lower      = anchor_text.strip().lower()
    anchor_word_count = len(anchor_lower.split())
    min_candidate_len = max(1, math.ceil(len(anchor_lower) * 0.30))
    effective_threshold = max(threshold, 75) if anchor_word_count >= 3 else threshold

    all_candidates = []  # semua item OCR + skor mereka

    for item in ocr_results:
        item_text = item.get("text") or ""
        if not item_text:
            continue

        item_lower      = item_text.lower()
        item_word_count = len(item_lower.split())

        too_short = len(item_lower) < min_candidate_len

        # Hitung skor mentah dulu (meski terlalu pendek)
        raw_score = max(
            fuzz.partial_ratio(anchor_lower, item_lower),
            fuzz.token_sort_ratio(anchor_lower, item_lower),
            fuzz.token_set_ratio(anchor_lower, item_lower),
        )

        # Terapkan length penalty
        penalised_score = raw_score
        if anchor_word_count >= 3 and item_word_count < anchor_word_count:
            length_ratio    = item_word_count / anchor_word_count
            penalised_score = raw_score * length_ratio

        passed_length  = not too_short
        passed_score   = (penalised_score >= effective_threshold) and passed_length

        all_candidates.append({
            **item,
            "raw_score":      round(raw_score, 1),
            "final_score":    round(penalised_score, 1),
            "too_short":      too_short,
            "passed":         passed_score,
        })

    # Sort: passed dulu, lalu skor tertinggi, lalu Y terkecil
    all_candidates.sort(key=lambda c: (not c["passed"], -c["final_score"], c["y"]))
    return all_candidates, effective_threshold


# ── Helper: hitung avg_char_width ─────────────────────────────────────────────
def compute_avg_char_width(ocr_results: list) -> float:
    ratios = []
    for item in ocr_results:
        text = item.get("text") or ""
        w    = item.get("w", 0)
        if len(text) > 0 and w > 0:
            ratios.append(w / len(text))
    return round(statistics.mean(ratios), 2) if ratios else 0.0


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    img_path = os.path.join(os.path.dirname(__file__), PAGE_1_PRE)
    if not os.path.exists(img_path):
        print(f"[ERROR] File tidak ditemukan: {img_path}")
        sys.exit(1)

    print(f"[INFO] Gambar  : {img_path}")
    print("[INFO] Menjalankan Global OCR (PaddleOCR)...\n")
    ocr_results = run_global_ocr(img_path)
    print(f"[INFO] {len(ocr_results)} item OCR ditemukan.\n")

    # ═══════════════════════════════════════════════════════
    # BAGIAN 1 — avg_char_width
    # ═══════════════════════════════════════════════════════
    avg_cw = compute_avg_char_width(ocr_results)
    print("=" * 80)
    print("BAGIAN 1 — avg_char_width")
    print("=" * 80)
    print(f"  avg_char_width = {avg_cw} px/karakter  ({len(ocr_results)} item)")

    # Detail distribusi per-item (5 terbesar dan 5 terkecil)
    items_cw = []
    for item in ocr_results:
        text = item.get("text") or ""
        w    = item.get("w", 0)
        if len(text) > 0 and w > 0:
            items_cw.append((w / len(text), text, w, len(text)))

    items_cw.sort()
    if items_cw:
        print(f"  Min char_width: {items_cw[0][0]:.1f} ('{items_cw[0][1]}', w={items_cw[0][2]}, len={items_cw[0][3]})")
        print(f"  Max char_width: {items_cw[-1][0]:.1f} ('{items_cw[-1][1]}', w={items_cw[-1][2]}, len={items_cw[-1][3]})")

    # ═══════════════════════════════════════════════════════
    # BAGIAN 2 — Kandidat per anchor
    # ═══════════════════════════════════════════════════════
    print("\n" + "=" * 80)
    print("BAGIAN 2 — Semua kandidat per anchor")
    print("=" * 80)

    COL_W = [35, 6, 6, 6, 6, 8, 8, 10]
    header = (
        f"{'text':<{COL_W[0]}} {'x':>{COL_W[1]}} {'y':>{COL_W[2]}} "
        f"{'w':>{COL_W[3]}} {'h':>{COL_W[4]}} "
        f"{'raw_s':>{COL_W[5]}} {'fin_s':>{COL_W[6]}} {'lolos?':>{COL_W[7]}}"
    )
    sep = "-" * (sum(COL_W) + len(COL_W))

    for anchor_text in ANCHORS_TO_INVESTIGATE:
        candidates, eff_thresh = find_anchor_verbose(ocr_results, anchor_text)
        anchor_words   = len(anchor_text.strip().lower().split())
        expected_w     = round(len(anchor_text) * avg_cw)
        max_allowed_w  = round(expected_w * 2.5)

        print(f"\nANCHOR: '{anchor_text}'")
        print(f"  len={len(anchor_text)} chars | {anchor_words} kata | "
              f"threshold efektif={eff_thresh} | "
              f"expected_w={expected_w}px | max_allowed_w={max_allowed_w}px")
        print(sep)
        print(header)
        print(sep)

        shown = 0
        for c in candidates:
            # Tampilkan: semua yang skor >= 40 (agar konteks cukup)
            if c["final_score"] < 40 and not c["passed"]:
                continue
            status = "LOLOS" if c["passed"] else ("SKIP_pendek" if c["too_short"] else "SKIP_skor")
            # Cek apakah lebar item melebihi max_allowed_w
            w_flag = "W_OK" if c["w"] <= max_allowed_w else f"W_LEBIH({c['w']}>{max_allowed_w})"
            text_trunc = (c["text"] or "")[:COL_W[0]-1]
            row = (
                f"{text_trunc:<{COL_W[0]}} {c['x']:>{COL_W[1]}} {c['y']:>{COL_W[2]}} "
                f"{c['w']:>{COL_W[3]}} {c['h']:>{COL_W[4]}} "
                f"{c['raw_score']:>{COL_W[5]}.1f} {c['final_score']:>{COL_W[6]}.1f} "
                f"{status:<10}  {w_flag}"
            )
            print(row)
            shown += 1

        if shown == 0:
            print("  (tidak ada kandidat dengan skor >= 40)")

    # ═══════════════════════════════════════════════════════
    # BAGIAN 3 — Kalkulasi multiplier 2.5 untuk semua anchor
    # ═══════════════════════════════════════════════════════
    print("\n" + "=" * 80)
    print("BAGIAN 3 — Kalkulasi expected_w vs max_allowed_w (multiplier 2.5) untuk SEMUA anchor")
    print("=" * 80)

    hdr3 = (
        f"{'anchor_text':<35} {'len':>4} {'words':>5} "
        f"{'expected_w':>10} {'max_2.5':>8} "
        f"{'winner_text':<35} {'winner_w':>8} {'winner_lulus?':>13}"
    )
    print(hdr3)
    print("-" * len(hdr3))

    for anchor_text in ALL_ANCHORS_TEMPLATE_32:
        expected_w    = round(len(anchor_text) * avg_cw)
        max_allowed_w = round(expected_w * 2.5)

        # Jalankan find_anchor_verbose → ambil winner (passed dan skor tertinggi)
        candidates, eff_thresh = find_anchor_verbose(ocr_results, anchor_text)
        passed_list = [c for c in candidates if c["passed"]]
        winner = passed_list[0] if passed_list else None

        if winner:
            w_lulus = "OK" if winner["w"] <= max_allowed_w else f"LEBIH({winner['w']}>{max_allowed_w})"
            wtext   = (winner["text"] or "")[:34]
            ww      = winner["w"]
        else:
            w_lulus = "NO_MATCH"
            wtext   = "(tidak ditemukan)"
            ww      = 0

        anchor_trunc = anchor_text[:34]
        print(
            f"{anchor_trunc:<35} {len(anchor_text):>4} {len(anchor_text.split()):>5} "
            f"{expected_w:>10} {max_allowed_w:>8} "
            f"{wtext:<35} {ww:>8} {w_lulus:>13}"
        )

    # ═══════════════════════════════════════════════════════
    # BAGIAN 4 — Anchor "legitimately wide" analysis
    # ═══════════════════════════════════════════════════════
    print("\n" + "=" * 80)
    print("BAGIAN 4 — Apakah ada anchor yang legitimately wide?")
    print("          (anchor yang teksnya panjang → expected_w memang besar)")
    print("=" * 80)

    print(f"\nAnchor dengan expected_w > 200px (avg_char_width={avg_cw}):")
    any_wide = False
    for anchor_text in ALL_ANCHORS_TEMPLATE_32:
        expected_w = round(len(anchor_text) * avg_cw)
        if expected_w > 200:
            any_wide = True
            print(f"  '{anchor_text}' → {len(anchor_text)} chars × {avg_cw} = {expected_w}px")
    if not any_wide:
        print("  Tidak ada anchor dengan expected_w > 200px.")

    print(f"\nAnchor dengan expected_w <= 200px (label pendek, rawan merge):")
    for anchor_text in ALL_ANCHORS_TEMPLATE_32:
        expected_w    = round(len(anchor_text) * avg_cw)
        max_allowed_w = round(expected_w * 2.5)
        if expected_w <= 200:
            print(f"  '{anchor_text}' → expected={expected_w}px | max_allowed={max_allowed_w}px")

    # ═══════════════════════════════════════════════════════
    # BAGIAN 5 — Semua OCR items yang w > 300px (dugaan merged bbox)
    # ═══════════════════════════════════════════════════════
    print("\n" + "=" * 80)
    print("BAGIAN 5 — Semua OCR items dengan w > 300px (kandidat merged bbox)")
    print("=" * 80)
    wide_items = [i for i in ocr_results if i.get("w", 0) > 300]
    wide_items.sort(key=lambda x: -x["w"])
    if wide_items:
        print(f"{'text':<50} {'x':>6} {'y':>6} {'w':>6} {'h':>6} {'char_w':>7}")
        print("-" * 90)
        for item in wide_items:
            text   = (item.get("text") or "")[:49]
            cw     = round(item["w"] / len(item["text"]), 1) if item.get("text") else 0
            print(f"{text:<50} {item['x']:>6} {item['y']:>6} {item['w']:>6} {item['h']:>6} {cw:>7.1f}")
    else:
        print("  Tidak ada item dengan w > 300px.")

    print("\n[SELESAI]")


if __name__ == "__main__":
    main()
