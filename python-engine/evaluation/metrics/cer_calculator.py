"""
evaluation/metrics/cer_calculator.py
-------------------------------------
Implementasi Character Error Rate (CER) berbasis Levenshtein distance.
"""

import numpy as np


def compute_cer(reference: str, hypothesis: str) -> float:
    """
    Hitung CER antara teks referensi dan hipotesis.

    CER = Levenshtein(ref, hyp) / len(ref)
    Dikap di 1.0 — tidak akan melebihi 100% meskipun hipotesis jauh lebih panjang.

    Returns:
        0.0  jika keduanya kosong
        1.0  jika ref kosong tapi hyp tidak (atau CER > 1.0 setelah kap)
    """
    ref = reference.strip().lower()
    hyp = hypothesis.strip().lower()

    if len(ref) == 0:
        return 0.0 if len(hyp) == 0 else 1.0

    m, n = len(ref), len(hyp)

    # Optimasi memori: hanya perlu dua baris DP
    dp = np.arange(n + 1, dtype=np.float32)
    for i in range(1, m + 1):
        prev = dp.copy()
        dp[0] = i
        for j in range(1, n + 1):
            if ref[i - 1] == hyp[j - 1]:
                dp[j] = prev[j - 1]
            else:
                dp[j] = 1.0 + min(prev[j], dp[j - 1], prev[j - 1])

    return min(float(dp[n]) / m, 1.0)
