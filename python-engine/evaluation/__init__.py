"""
evaluation/
-----------
Package evaluasi CER model TrOCR fine-tuned vs base.

Entry point utama: evaluate_model.py (di root python-engine/)
Fungsi orkestrator: run_evaluation()
"""

import logging
import sys

import numpy as np
import pandas as pd
import torch

from .ground_truth import load_dataset
from .run_tester   import load_model, evaluate_model
from .test_docs    import create_report
from .metrics      import print_summary
from . import config

log = logging.getLogger(__name__)


def run_evaluation() -> None:
    """Orkestrator utama — jalankan evaluasi end-to-end."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    log.info(f"Device: {device}")
    log.info("=" * 60)

    df = load_dataset(config.LABELS_CSV)

    # ── Evaluasi model base ────────────────────────────────────────
    log.info("\n[1/2] Evaluasi model BASE ...")
    proc_base, mdl_base = load_model(config.BASE_MODEL, device)
    results_base = evaluate_model(df, proc_base, mdl_base, device,
                                  config.TEST_SET_DIR, "base")
    del mdl_base
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    # ── Evaluasi model fine-tuned ──────────────────────────────────
    log.info("\n[2/2] Evaluasi model FINE-TUNED ...")
    proc_ft, mdl_ft = load_model(str(config.FINETUNED), device)
    results_ft = evaluate_model(df, proc_ft, mdl_ft, device,
                                config.TEST_SET_DIR, "finetuned")
    del mdl_ft
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    # ── Gabungkan dan simpan CSV ───────────────────────────────────
    df_base = pd.DataFrame(results_base)
    df_ft   = pd.DataFrame(results_ft)[["image_path", "pred_finetuned", "cer_finetuned"]]
    df_res  = df_base.merge(df_ft, on="image_path", how="left")
    df_res.to_csv(config.OUT_CSV, index=False, encoding="utf-8-sig")
    log.info(f"\nHasil disimpan: {config.OUT_CSV}")

    # ── Hitung statistik ───────────────────────────────────────────
    cer_base_mean = float(df_res["cer_base"].dropna().mean()      or 0.0)
    cer_ft_mean   = float(df_res["cer_finetuned"].dropna().mean() or 0.0)

    print_summary(df_res, cer_base_mean, cer_ft_mean)
    create_report(df_res, cer_base_mean, cer_ft_mean, config.OUT_PNG)
    log.info("Selesai.")
