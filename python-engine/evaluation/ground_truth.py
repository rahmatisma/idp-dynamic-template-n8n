"""
evaluation/ground_truth.py
----------------------------
Loader dataset labels_test.csv.

Format CSV (tanpa header):
    kolom 0 — image_path  : path relatif terhadap Dataset/test_set/
    kolom 1 — label       : ground truth teks tulisan tangan
"""

import logging
import pandas as pd
from pathlib import Path

log = logging.getLogger(__name__)


def load_dataset(labels_csv: Path) -> pd.DataFrame:
    """
    Baca labels_test.csv dan kembalikan DataFrame bersih.

    Baris tanpa label (kosong / NaN) dibuang otomatis.
    """
    df = pd.read_csv(
        labels_csv,
        header=None,
        names=["image_path", "label"],
        dtype=str,
        encoding="utf-8",
        on_bad_lines="skip",
    )
    df = df.dropna(subset=["label"])
    df["label"] = df["label"].str.strip()
    df = df[df["label"] != ""].reset_index(drop=True)
    log.info(f"Dataset dimuat: {len(df)} sampel berlabel dari {labels_csv.name}")
    return df
