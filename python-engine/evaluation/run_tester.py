"""
evaluation/run_tester.py
--------------------------
Model loader, inferensi per gambar, dan loop evaluasi lengkap.
"""

import logging
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from PIL import Image
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

from .metrics import compute_cer

log = logging.getLogger(__name__)


def load_model(model_path: str, device: torch.device):
    """
    Load TrOCRProcessor + VisionEncoderDecoderModel dari path lokal atau HuggingFace Hub.
    Auto-detect safetensors jika tersedia.
    """
    log.info(f"Loading model: {model_path}")
    t0 = time.time()

    use_sf = Path(model_path).is_dir() and (Path(model_path) / "model.safetensors").exists()
    processor = TrOCRProcessor.from_pretrained(model_path)
    model = VisionEncoderDecoderModel.from_pretrained(
        model_path,
        use_safetensors=use_sf,
    )
    model.to(device).eval()

    log.info(f"  → selesai dalam {time.time() - t0:.1f}s  |  device={device}")
    return processor, model


@torch.no_grad()
def infer(processor, model, image: Image.Image, device: torch.device) -> str:
    """Jalankan inferensi satu gambar, kembalikan teks hasil prediksi."""
    pixel_values = processor(images=image.convert("RGB"), return_tensors="pt").pixel_values
    pixel_values = pixel_values.to(device)
    ids = model.generate(pixel_values, max_new_tokens=48)
    return processor.batch_decode(ids, skip_special_tokens=True)[0].strip()


def evaluate_model(
    df: pd.DataFrame,
    processor,
    model,
    device: torch.device,
    test_set_dir: Path,
    model_label: str,
) -> list:
    """
    Jalankan inferensi dan hitung CER untuk setiap sampel dalam df.

    Args:
        df            : DataFrame dari load_dataset()
        processor     : TrOCRProcessor yang sudah di-load
        model         : VisionEncoderDecoderModel yang sudah di-load
        device        : torch.device
        test_set_dir  : root direktori gambar test set
        model_label   : label singkat untuk penamaan kolom, mis. "base" atau "finetuned"

    Returns:
        list of dict dengan kunci: image_path, label, pred_{label}, cer_{label}
    """
    results = []
    n = len(df)
    errors = 0

    for i, row in df.iterrows():
        img_path = test_set_dir / row["image_path"]
        label    = row["label"]

        if not img_path.exists():
            log.warning(f"  [{i+1}/{n}] File tidak ditemukan: {img_path}")
            results.append({
                "image_path":          row["image_path"],
                "label":               label,
                f"pred_{model_label}": "",
                f"cer_{model_label}":  None,
            })
            errors += 1
            continue

        try:
            img  = Image.open(img_path)
            pred = infer(processor, model, img, device)
            cer  = compute_cer(label, pred)
        except Exception as e:
            log.error(f"  [{i+1}/{n}] Error pada {img_path.name}: {e}")
            pred, cer = "", None
            errors += 1

        results.append({
            "image_path":          row["image_path"],
            "label":               label,
            f"pred_{model_label}": pred,
            f"cer_{model_label}":  cer,
        })

        if (i + 1) % 50 == 0 or (i + 1) == n:
            valid = [r[f"cer_{model_label}"] for r in results if r[f"cer_{model_label}"] is not None]
            avg   = np.mean(valid) if valid else 0.0
            log.info(f"  [{i+1}/{n}] CER rata-rata sementara ({model_label}): {avg:.4f}")

    log.info(f"  → {errors} file gagal diproses dari {n} total")
    return results
