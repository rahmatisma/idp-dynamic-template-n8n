"""
evaluation/config.py
---------------------
Konstanta path dan nama model untuk seluruh package evaluasi.
Semua path relatif terhadap direktori python-engine/.
"""

from pathlib import Path

BASE_DIR     = Path(__file__).parent.parent          # python-engine/
LABELS_CSV   = BASE_DIR / "Dataset" / "labels_test.csv"
TEST_SET_DIR = BASE_DIR / "Dataset" / "test_set"
FINETUNED    = BASE_DIR / "models" / "trocr-finetuned"
BASE_MODEL   = "microsoft/trocr-base-handwritten"
OUT_CSV      = BASE_DIR / "evaluation_results.csv"
OUT_PNG      = BASE_DIR / "evaluation_report.png"
