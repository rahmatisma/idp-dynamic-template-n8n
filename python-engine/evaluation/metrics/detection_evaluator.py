"""
evaluation/metrics/detection_evaluator.py
-------------------------------------------
Fungsi cetak ringkasan statistik dan analisis hasil evaluasi CER.
"""

import numpy as np
import pandas as pd


def print_summary(df_res: pd.DataFrame, cer_base_mean: float, cer_ft_mean: float) -> None:
    """Cetak tabel ringkasan evaluasi ke stdout."""
    cer_base_vals = df_res["cer_base"].dropna()
    cer_ft_vals   = df_res["cer_finetuned"].dropna()
    improvement   = (
        (cer_base_mean - cer_ft_mean) / cer_base_mean * 100
        if cer_base_mean > 0 else 0.0
    )

    print("\n" + "=" * 60)
    print("  RINGKASAN EVALUASI")
    print("=" * 60)
    print(f"  Total sampel dievaluasi : {len(df_res)}")
    print(f"  Sampel valid (CER base) : {len(cer_base_vals)}")
    print(f"  Sampel valid (CER ft)   : {len(cer_ft_vals)}")
    print("-" * 60)
    print(f"  CER Base Model          : {cer_base_mean:.4f}  ({cer_base_mean*100:.2f}%)")
    print(f"  CER Fine-tuned Model    : {cer_ft_mean:.4f}  ({cer_ft_mean*100:.2f}%)")
    print(f"  Selisih CER             : {cer_base_mean - cer_ft_mean:.4f}")
    print(f"  Improvement             : {improvement:+.2f}%")
    print("-" * 60)
    print(f"  CER Base   — median: {cer_base_vals.median():.4f}  std: {cer_base_vals.std():.4f}")
    print(f"  CER Ft     — median: {cer_ft_vals.median():.4f}  std: {cer_ft_vals.std():.4f}")
    print("=" * 60)

    worst = get_worst_samples(df_res, n=5)
    print("\n  5 Sampel dengan CER Fine-tuned Tertinggi:")
    print(worst.to_string(index=False))
    print("=" * 60 + "\n")


def get_worst_samples(df_res: pd.DataFrame, n: int = 5) -> pd.DataFrame:
    """Kembalikan n baris dengan CER fine-tuned tertinggi."""
    return (
        df_res[df_res["cer_finetuned"].notna()]
        .nlargest(n, "cer_finetuned")[
            ["image_path", "label", "pred_finetuned", "cer_finetuned"]
        ]
    )


def get_improvement_breakdown(df_res: pd.DataFrame) -> dict:
    """
    Hitung jumlah sampel di mana fine-tuned lebih baik, sama, atau lebih buruk.

    Returns dict dengan kunci: better, worse, equal, total
    """
    mask  = df_res["cer_base"].notna() & df_res["cer_finetuned"].notna()
    delta = df_res.loc[mask, "cer_finetuned"] - df_res.loc[mask, "cer_base"]
    return {
        "better": int((delta < -1e-6).sum()),
        "worse":  int((delta >  1e-6).sum()),
        "equal":  int((np.abs(delta) <= 1e-6).sum()),
        "total":  int(mask.sum()),
    }
