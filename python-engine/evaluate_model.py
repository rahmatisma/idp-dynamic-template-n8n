"""
evaluate_model.py
-----------------
Entry point evaluasi CER TrOCR fine-tuned vs base model.

Jalankan dari direktori python-engine/:
    python evaluate_model.py

Output:
    evaluation_results.csv  — detail CER per crop
    evaluation_report.png   — 4 panel visualisasi
"""

from evaluation import run_evaluation

if __name__ == "__main__":
    run_evaluation()
