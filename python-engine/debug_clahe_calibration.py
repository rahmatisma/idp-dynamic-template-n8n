"""
debug_clahe_calibration.py
---------------------------
Investigasi clipLimit CLAHE optimal untuk dokumen 242.
Uji 4 nilai: 0.5, 1.0, 1.5, 2.0 (current).

Untuk setiap variasi:
  - Generate preprocessed image
  - Jalankan global OCR
  - Cek apakah 6 anchor target terdeteksi sebagai bbox bersih
  - Sajikan tabel perbandingan

Jalankan dari python-engine/:
    python debug_clahe_calibration.py
"""

import sys
import os
import math

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

from rapidfuzz import fuzz
from app.services.ocr_engine import run_global_ocr

# ── Config ────────────────────────────────────────────────────────────────────
PAGE_1_ORIG = r"storage\pages\temp_242_6a198b8a834d1_POP-CILEUNYI-2\page_1.png"
CLIP_LIMITS  = [0.5, 1.0, 1.5, 2.0]

ANCHORS_TARGET = [
    "Location",
    "No.Dok.",
    "Notes / additional informations",
    "Date/time",
    "Verifikator",
    "Head Of Sub Departement",
]

# Threshold per anchor: sama dengan logika find_anchor()
DEFAULT_THRESHOLD = 65

# Kata yang menunjukkan bbox merged (nilai setelah label)
MERGE_INDICATORS = {
    "Location":  ["pop", "cileny", ":", "shelter", "outdoor"],
    "No.Dok.":   ["fm-", "fm", "lap", "sop", "formulir"],
    "Date/time": [],   # jarang merge
    "Notes / additional informations": [":", "shelter"],
    "Verifikator": [],
    "Head Of Sub Departement": [],
}


# ── Preprocessing manual (tanpa menyentuh preprocessor.py) ───────────────────
def preprocess_with_clip(image_path: str, clip_limit: float, out_path: str) -> str:
    image = cv2.imread(image_path)
    if image is None:
        raise FileNotFoundError(f"Gambar tidak ditemukan: {image_path}")

    gray     = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7, searchWindowSize=21)
    blurred  = cv2.GaussianBlur(denoised, (3, 3), 0)
    clahe    = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
    enhanced = clahe.apply(blurred)
    cv2.imwrite(out_path, enhanced)
    return out_path


# ── Replika find_anchor() dengan return winner + metadata ────────────────────
def find_anchor_with_meta(ocr_results: list, anchor_text: str, threshold: int = DEFAULT_THRESHOLD):
    anchor_lower      = anchor_text.strip().lower()
    anchor_word_count = len(anchor_lower.split())
    min_candidate_len = max(1, math.ceil(len(anchor_lower) * 0.30))
    effective_threshold = max(threshold, 75) if anchor_word_count >= 3 else threshold

    matches = []
    for item in ocr_results:
        item_text = item.get("text") or ""
        if not item_text:
            continue
        item_lower      = item_text.lower()
        item_word_count = len(item_lower.split())

        if len(item_lower) < min_candidate_len:
            continue

        raw_score = max(
            fuzz.partial_ratio(anchor_lower, item_lower),
            fuzz.token_sort_ratio(anchor_lower, item_lower),
            fuzz.token_set_ratio(anchor_lower, item_lower),
        )

        penalised = raw_score
        if anchor_word_count >= 3 and item_word_count < anchor_word_count:
            penalised = raw_score * (item_word_count / anchor_word_count)

        if penalised >= effective_threshold:
            matches.append({**item, "score": round(penalised, 2)})

    if not matches:
        return None

    return sorted(matches, key=lambda x: (-x["score"], x["y"]))[0]


# ── Cek apakah bbox bersih (tidak merged) ────────────────────────────────────
def is_clean_bbox(anchor_text: str, winner: dict) -> bool:
    """
    Bbox dianggap BERSIH jika teks winner tidak mengandung indikator nilai.
    Juga cek rasio w terhadap panjang anchor (merged bbox selalu jauh lebih lebar).
    """
    if winner is None:
        return False

    winner_text  = (winner.get("text") or "").lower()
    indicators   = MERGE_INDICATORS.get(anchor_text, [])

    # Cek kehadiran kata indikator
    for ind in indicators:
        if ind.lower() in winner_text:
            return False

    # Cek rasio lebar: jika w > 2× panjang anchor × 24.4 → kemungkinan merged
    expected_w   = len(anchor_text) * 24.4
    max_clean_w  = expected_w * 2.0
    if winner.get("w", 0) > max_clean_w:
        return False

    return True


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    base_dir  = os.path.dirname(__file__)
    orig_path = os.path.join(base_dir, PAGE_1_ORIG)

    if not os.path.exists(orig_path):
        print(f"[ERROR] File tidak ditemukan: {orig_path}")
        sys.exit(1)

    print(f"Gambar sumber : {orig_path}")
    print(f"ClipLimits    : {CLIP_LIMITS}")
    print(f"Anchors       : {ANCHORS_TARGET}\n")

    generated_files = []
    results_per_clip = []

    for clip in CLIP_LIMITS:
        clip_tag  = str(clip).replace(".", "").ljust(2, "0")  # "0.5"→"05", "1.0"→"10"
        out_name  = f"page_1_clip{clip_tag}.png"
        out_path  = os.path.join(base_dir,
                                 os.path.dirname(PAGE_1_ORIG),
                                 out_name)

        print(f"{'='*70}")
        print(f"CLIP_LIMIT = {clip}  →  {out_name}")
        print(f"{'='*70}")

        # 1. Preprocess
        preprocess_with_clip(orig_path, clip, out_path)
        generated_files.append(out_path)
        print(f"  [Preprocess] OK → {out_path}")

        # 2. OCR
        print(f"  [OCR] Running...", end=" ", flush=True)
        ocr_results = run_global_ocr(out_path)
        total_ocr   = len(ocr_results)
        print(f"{total_ocr} items")

        # 3. Anchor detection
        anchor_results = {}
        for anchor_text in ANCHORS_TARGET:
            winner = find_anchor_with_meta(ocr_results, anchor_text)
            clean  = is_clean_bbox(anchor_text, winner)

            anchor_results[anchor_text] = {
                "winner": winner,
                "clean":  clean,
            }

            if winner:
                status = "BERSIH" if clean else "MERGED"
                print(
                    f"  [{status:6}] '{anchor_text}'"
                    f"\n           winner='{winner.get('text', '')}'"
                    f"  ({winner['x']},{winner['y']},w={winner['w']},h={winner['h']})"
                    f"  score={winner['score']}"
                )
            else:
                print(f"  [MISS  ] '{anchor_text}' — tidak ditemukan")

        results_per_clip.append({
            "clip":          clip,
            "total_ocr":     total_ocr,
            "anchor_results": anchor_results,
        })
        print()

    # ── Tabel Perbandingan ────────────────────────────────────────────────────
    print("\n" + "=" * 110)
    print("TABEL PERBANDINGAN HASIL per clipLimit")
    print("=" * 110)

    # Header
    anchor_short = {
        "Location":                          "Loc",
        "No.Dok.":                           "NoDok",
        "Notes / additional informations":   "Notes",
        "Date/time":                         "DTime",
        "Verifikator":                       "Verif",
        "Head Of Sub Departement":           "HoSD",
    }

    col_clip     = 10
    col_ocr      = 10
    col_anchor   = 14  # per anchor: "BERSIH/MERGED/MISS"
    headers = ["clipLimit", "total_ocr"] + [anchor_short[a] for a in ANCHORS_TARGET] + ["SCORE"]

    header_row = (
        f"{'clipLimit':>{col_clip}} {'total_ocr':>{col_ocr}}"
        + "".join(f"  {anchor_short[a]:>{col_anchor}}" for a in ANCHORS_TARGET)
        + f"  {'SCORE':>6}"
    )
    print(header_row)
    print("-" * len(header_row))

    summary_rows = []
    for r in results_per_clip:
        clip      = r["clip"]
        total_ocr = r["total_ocr"]
        ar        = r["anchor_results"]

        cells = []
        score = 0
        for a in ANCHORS_TARGET:
            winner = ar[a]["winner"]
            clean  = ar[a]["clean"]
            if winner is None:
                cell = "MISS"
            elif clean:
                cell  = "BERSIH"
                score += 2
            else:
                cell  = f"MERGED"
                score += 1  # ditemukan tapi salah

            cells.append(cell)

        row = (
            f"{clip:>{col_clip}} {total_ocr:>{col_ocr}}"
            + "".join(f"  {c:>{col_anchor}}" for c in cells)
            + f"  {score:>6}"
        )
        print(row)
        summary_rows.append((clip, total_ocr, score))

    # ── Detail per anchor winner ──────────────────────────────────────────────
    print("\n" + "=" * 110)
    print("DETAIL WINNER per anchor per clipLimit")
    print("=" * 110)

    for anchor_text in ANCHORS_TARGET:
        print(f"\n  Anchor: '{anchor_text}'")
        print(f"  {'clip':>6} {'winner_text':<45} {'x':>6} {'y':>6} {'w':>6} {'h':>6} {'score':>6} {'status':>8}")
        print(f"  {'-'*100}")
        for r in results_per_clip:
            clip   = r["clip"]
            winner = r["anchor_results"][anchor_text]["winner"]
            clean  = r["anchor_results"][anchor_text]["clean"]
            if winner:
                wt     = (winner.get("text") or "")[:44]
                status = "BERSIH" if clean else "MERGED"
                print(f"  {clip:>6} {wt:<45} {winner['x']:>6} {winner['y']:>6} {winner['w']:>6} {winner['h']:>6} {winner['score']:>6} {status:>8}")
            else:
                print(f"  {clip:>6} {'(tidak ditemukan)':<45} {'':>6} {'':>6} {'':>6} {'':>6} {'':>6} {'MISS':>8}")

    # ── Rekomendasi ───────────────────────────────────────────────────────────
    print("\n" + "=" * 110)
    print("REKOMENDASI")
    print("=" * 110)

    best_score = max(s for _, _, s in summary_rows)
    best_clips = [(c, o, s) for c, o, s in summary_rows if s == best_score]

    # Jika ada tie, pilih yang total_ocr paling banyak
    best_clips.sort(key=lambda x: -x[1])
    best = best_clips[0]

    print(f"\n  Best score  : {best_score} / {len(ANCHORS_TARGET) * 2}")
    print(f"  Best clip   : {best[0]}  (total_ocr={best[1]})")

    for c, o, s in summary_rows:
        tag = " <-- REKOMENDASI" if (c, o, s) == best else ""
        print(f"    clip={c}: score={s}/{len(ANCHORS_TARGET)*2}, total_ocr={o}{tag}")

    # ── Cleanup ───────────────────────────────────────────────────────────────
    print("\n" + "=" * 110)
    print("CLEANUP — menghapus file temporary")
    print("=" * 110)
    for f in generated_files:
        if os.path.exists(f):
            os.remove(f)
            print(f"  Hapus: {f}")
    print("  Selesai.")


if __name__ == "__main__":
    main()
