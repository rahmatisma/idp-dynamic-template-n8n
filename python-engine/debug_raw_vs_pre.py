"""
debug_raw_vs_pre.py
--------------------
Bandingkan hasil find_anchor() antara page_1.png (raw)
dan page_1_pre.png (CLAHE preprocessed) untuk semua 11 anchor
template 32 pada dokumen 242.

Pertanyaan utama:
  Apakah page_1.png (raw) bisa dipakai untuk find_anchor()
  sehingga bbox BERSIH, sementara page_1_pre.png hanya
  dipakai untuk crop TrOCR?

Jalankan dari python-engine/:
    python -X utf8 debug_raw_vs_pre.py
"""

import sys
import os
import math

sys.path.insert(0, os.path.dirname(__file__))

from rapidfuzz import fuzz
from app.services.ocr_engine import run_global_ocr

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE   = r"storage\pages\temp_242_6a198b8a834d1_POP-CILEUNYI-2"
RAW    = os.path.join(os.path.dirname(__file__), BASE, "page_1.png")
PRE    = os.path.join(os.path.dirname(__file__), BASE, "page_1_pre.png")

# ── Semua anchor template 32 ──────────────────────────────────────────────────
ALL_ANCHORS = [
    "No.Dok.",
    "Versi",
    "Hal",
    "Label",
    "Location",
    "Date/time",
    "Notes / additional informations",
    "Verifikator",
    "Head Of Sub Departement",
    "Descriptions",
    "Executor",
]

DEFAULT_THRESHOLD = 65
AVG_CHAR_WIDTH    = 24.4   # dari investigasi sebelumnya (86 item OCR, doc 242)

# Kata-kata yang menunjukkan bbox merged (nilai ikut masuk ke teks anchor)
MERGE_INDICATORS = {
    "No.Dok.":   ["fm-", "fm", "lap", "sop", "003", "006"],
    "Location":  ["pop", "cileny", "cilevny", "shelter", "outdoor"],
    "Label":     ["internal", "external", ":internal", "mitra"],
    "Versi":     [],
    "Hal":       [],
    "Date/time": [],
    "Notes / additional informations": [],   # ':' di akhir label itu normal
    "Verifikator":                      [],
    "Head Of Sub Departement":          [],
    "Descriptions":                     [],
    "Executor":                         [],
}


# ── Replika find_anchor() ─────────────────────────────────────────────────────
def find_anchor_meta(ocr_results: list, anchor_text: str,
                     threshold: int = DEFAULT_THRESHOLD):
    anchor_lower      = anchor_text.strip().lower()
    anchor_word_count = len(anchor_lower.split())
    min_candidate_len = max(1, math.ceil(len(anchor_lower) * 0.30))
    eff_threshold     = max(threshold, 75) if anchor_word_count >= 3 else threshold

    matches = []
    for item in ocr_results:
        text = item.get("text") or ""
        if not text or len(text.lower()) < min_candidate_len:
            continue

        item_lower = text.lower()
        item_wc    = len(item_lower.split())
        raw_score  = max(
            fuzz.partial_ratio(anchor_lower, item_lower),
            fuzz.token_sort_ratio(anchor_lower, item_lower),
            fuzz.token_set_ratio(anchor_lower, item_lower),
        )
        score = raw_score
        if anchor_word_count >= 3 and item_wc < anchor_word_count:
            score = raw_score * (item_wc / anchor_word_count)

        if score >= eff_threshold:
            matches.append({**item, "score": round(score, 2)})

    if not matches:
        return None
    return sorted(matches, key=lambda x: (-x["score"], x["y"]))[0]


# ── Klasifikasi BERSIH / MERGED ───────────────────────────────────────────────
def classify(anchor_text: str, winner: dict | None) -> str:
    """Kembalikan 'BERSIH', 'MERGED', atau 'MISS'."""
    if winner is None:
        return "MISS"

    text = (winner.get("text") or "").lower()
    for ind in MERGE_INDICATORS.get(anchor_text, []):
        if ind.lower() in text:
            return "MERGED"

    max_clean_w = len(anchor_text) * AVG_CHAR_WIDTH * 2.0
    if winner.get("w", 0) > max_clean_w:
        return "MERGED"

    return "BERSIH"


# ── Verdict ───────────────────────────────────────────────────────────────────
def verdict(raw_cls: str, pre_cls: str) -> str:
    if raw_cls == "BERSIH" and pre_cls == "BERSIH":
        return "BOTH_OK"
    if raw_cls == "BERSIH" and pre_cls in ("MERGED", "MISS"):
        return "RAW_BETTER"
    if pre_cls == "BERSIH" and raw_cls in ("MERGED", "MISS"):
        return "PRE_BETTER"
    if raw_cls == "MERGED" and pre_cls == "MERGED":
        return "BOTH_MERGED"
    if raw_cls != "MISS" and pre_cls == "MISS":
        return "RAW_ONLY"
    if pre_cls != "MISS" and raw_cls == "MISS":
        return "PRE_ONLY"
    return "BOTH_MISS"


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    for path, label in [(RAW, "RAW"), (PRE, "PRE")]:
        if not os.path.exists(path):
            print(f"[ERROR] File tidak ditemukan ({label}): {path}")
            sys.exit(1)

    print("=" * 80)
    print("Menjalankan Global OCR — RAW  (page_1.png)")
    print("=" * 80)
    raw_ocr = run_global_ocr(RAW)
    print(f"  Hasil OCR raw  : {len(raw_ocr)} items\n")

    print("=" * 80)
    print("Menjalankan Global OCR — PRE  (page_1_pre.png)")
    print("=" * 80)
    pre_ocr = run_global_ocr(PRE)
    print(f"  Hasil OCR pre  : {len(pre_ocr)} items\n")

    # ── Per-anchor detail ─────────────────────────────────────────────────────
    rows = []
    print("=" * 100)
    print("DETAIL PER ANCHOR")
    print("=" * 100)

    for anchor in ALL_ANCHORS:
        raw_w = find_anchor_meta(raw_ocr, anchor)
        pre_w = find_anchor_meta(pre_ocr, anchor)

        raw_cls = classify(anchor, raw_w)
        pre_cls = classify(anchor, pre_w)
        vd      = verdict(raw_cls, pre_cls)

        print(f"\n  Anchor: '{anchor}'")
        for label, w, cls in [("RAW", raw_w, raw_cls), ("PRE", pre_w, pre_cls)]:
            if w:
                print(f"    {label}: [{cls:6}] '{w.get('text','')}'"
                      f"  ({w['x']},{w['y']},w={w['w']},h={w['h']})"
                      f"  score={w['score']}")
            else:
                print(f"    {label}: [MISS  ] tidak ditemukan")
        print(f"    VERDICT: {vd}")

        rows.append({
            "anchor":     anchor,
            "raw_cls":    raw_cls,
            "raw_text":   (raw_w.get("text") or "") if raw_w else "",
            "raw_w":      raw_w["w"] if raw_w else 0,
            "raw_score":  raw_w["score"] if raw_w else 0,
            "pre_cls":    pre_cls,
            "pre_text":   (pre_w.get("text") or "") if pre_w else "",
            "pre_w":      pre_w["w"] if pre_w else 0,
            "pre_score":  pre_w["score"] if pre_w else 0,
            "verdict":    vd,
        })

    # ── Tabel Ringkasan ───────────────────────────────────────────────────────
    print("\n\n" + "=" * 120)
    print("TABEL PERBANDINGAN RAW vs PRE")
    print("=" * 120)

    hdr = (
        f"{'anchor':<35} {'raw_found':>10} {'raw_clean':>10} {'raw_w':>7}"
        f"  {'pre_found':>10} {'pre_clean':>10} {'pre_w':>7}  {'verdict':<14}"
    )
    print(hdr)
    print("-" * len(hdr))

    for r in rows:
        raw_found = "YES" if r["raw_cls"] != "MISS" else "NO"
        pre_found = "YES" if r["pre_cls"] != "MISS" else "NO"
        raw_clean = r["raw_cls"] if r["raw_cls"] != "MISS" else "-"
        pre_clean = r["pre_cls"] if r["pre_cls"] != "MISS" else "-"

        print(
            f"{r['anchor']:<35} {raw_found:>10} {raw_clean:>10} {r['raw_w']:>7}"
            f"  {pre_found:>10} {pre_clean:>10} {r['pre_w']:>7}  {r['verdict']:<14}"
        )

    # ── Verdict summary ───────────────────────────────────────────────────────
    print("\n" + "=" * 120)
    print("SUMMARY")
    print("=" * 120)

    verdicts = [r["verdict"] for r in rows]
    for vtype in ["BOTH_OK", "RAW_BETTER", "PRE_BETTER", "BOTH_MERGED",
                  "RAW_ONLY", "PRE_ONLY", "BOTH_MISS"]:
        count = verdicts.count(vtype)
        if count:
            affected = [r["anchor"] for r in rows if r["verdict"] == vtype]
            print(f"  {vtype:<14} ({count}x): {', '.join(affected)}")

    # ── Kesimpulan feasibility "Opsi E" ──────────────────────────────────────
    print("\n" + "=" * 120)
    print("KESIMPULAN — Feasibility Opsi E: RAW untuk find_anchor, PRE untuk crop TrOCR")
    print("=" * 120)

    raw_better_or_ok = [r for r in rows
                        if r["verdict"] in ("RAW_BETTER", "BOTH_OK", "RAW_ONLY")]
    pre_needed       = [r for r in rows
                        if r["verdict"] in ("PRE_BETTER", "PRE_ONLY")]
    both_merged      = [r for r in rows if r["verdict"] == "BOTH_MERGED"]
    both_miss        = [r for r in rows if r["verdict"] == "BOTH_MISS"]

    print(f"\n  Anchor yang RAW setidaknya sama baik atau lebih baik ({len(raw_better_or_ok)}):")
    for r in raw_better_or_ok:
        print(f"    - '{r['anchor']}': raw={r['raw_cls']}, pre={r['pre_cls']} [{r['verdict']}]")

    if pre_needed:
        print(f"\n  Anchor yang HANYA bisa ditemukan/bersih via PRE ({len(pre_needed)}):")
        for r in pre_needed:
            print(f"    - '{r['anchor']}': raw={r['raw_cls']}, pre={r['pre_cls']} [{r['verdict']}]")

    if both_merged:
        print(f"\n  Anchor MERGED di keduanya ({len(both_merged)}) — butuh pendekatan lain:")
        for r in both_merged:
            print(f"    - '{r['anchor']}': raw={r['raw_cls']}, pre={r['pre_cls']}")

    if both_miss:
        print(f"\n  Anchor TIDAK DITEMUKAN di keduanya ({len(both_miss)}):")
        for r in both_miss:
            print(f"    - '{r['anchor']}'")

    # Final verdict
    blockers = pre_needed + both_miss
    if not blockers and not both_merged:
        print("\n  FEASIBLE: Opsi E bisa diterapkan. Semua anchor ditemukan bersih di RAW.")
    elif not blockers and both_merged:
        merged_names = [r['anchor'] for r in both_merged]
        print(f"\n  PARTIALLY FEASIBLE: Opsi E layak, TAPI {len(both_merged)} anchor")
        print(f"  merged di KEDUANYA (raw dan pre): {merged_names}")
        print(f"  Anchor ini perlu pendekatan split-bbox atau filter w tambahan,")
        print(f"  terlepas dari pilihan gambar yang dipakai untuk OCR.")
    elif blockers:
        blocker_names = [r['anchor'] for r in blockers]
        print(f"\n  TIDAK FEASIBLE PENUH: {len(blockers)} anchor lebih baik/hanya di PRE:")
        print(f"  {blocker_names}")
        print(f"  RAW tidak bisa sepenuhnya menggantikan PRE untuk find_anchor().")

    print("\n[SELESAI] Tidak ada file temporary yang dibuat — tidak ada cleanup diperlukan.")


if __name__ == "__main__":
    main()
