"""
app/services/preprocessor.py
------------------------------
Membersihkan dan meningkatkan kualitas gambar sebelum masuk ke OCR.

Teknik yang digunakan:
    1. Grayscale    — Sederhanakan channel warna agar OCR lebih fokus
    2. Denoise      — Kurangi noise/derau pada gambar scan
    3. CLAHE        — Tingkatkan kontras adaptif agar teks makin tajam

Proses ini dijalankan SEBELUM run_global_ocr() agar hasil baca
PaddleOCR lebih akurat, terutama pada dokumen scan kualitas rendah.
"""

import cv2
import logging
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)


def preprocess_image(image_path: str) -> str:
    """
    Terapkan pipeline preprocessing gambar: Grayscale → Denoise → CLAHE.

    Gambar hasil preprocessing disimpan di lokasi yang sama dengan
    suffix '_pre' agar file asli tidak tertimpa.

    Args:
        image_path : Path ke file PNG halaman dokumen.

    Returns:
        Path ke file PNG yang sudah dipreprocess (string).
        Kalau preprocessing gagal, kembalikan path asli (fallback).
    """
    try:
        image = cv2.imread(image_path)
        if image is None:
            logger.warning(f"[Preprocessor] Gagal baca gambar: {image_path}. Pakai gambar asli.")
            return image_path

        p = Path(image_path)

        # ── Step 1: Grayscale ─────────────────────────────────────
        # Kurangi kompleksitas channel warna, OCR lebih fokus ke teks
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # ── Step 2: Denoise ───────────────────────────────────────
        # fastNlMeansDenoising: efektif untuk noise grain dari scanner
        # h=10: kekuatan filter (lebih tinggi = lebih halus tapi bisa blur)
        denoised = cv2.fastNlMeansDenoising(gray, h=10, templateWindowSize=7, searchWindowSize=21)

        # ── Step 3: Gaussian Blur ─────────────────────────────────
        # Menghaluskan gambar untuk menghilangkan bintik halus (noise)
        # kernel (3,3) memberikan blur tipis yang pas untuk dokumen
        blurred = cv2.GaussianBlur(denoised, (3, 3), 0)

        # ── Step 4: CLAHE (Contrast Limited Adaptive Histogram Equalization)
        # Tingkatkan kontras secara lokal — bagian gelap tetap terbaca
        # clipLimit=2.0: batas amplifikasi kontras (cegah over-expose)
        # tileGridSize=(8,8): ukuran grid adaptif
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(blurred)

        # ── Simpan hasil akhir (tetap pakai _pre agar pipeline sistem tidak rusak) ──
        output_path = str(p.parent / (p.stem + "_pre" + p.suffix))
        cv2.imwrite(output_path, enhanced)

        logger.debug(f"[Preprocessor] Berhasil → {output_path}")
        return output_path

    except Exception as e:
        logger.error(f"[Preprocessor] Error: {e}. Fallback ke gambar asli.")
        return image_path  # Jangan crash — pakai gambar asli sebagai fallback
