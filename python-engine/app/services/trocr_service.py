"""
app/services/trocr_service.py
------------------------------
Singleton loader dan runner untuk model TrOCR (Microsoft).

Model yang digunakan:
    microsoft/trocr-base-handwritten
    → Versi base (lebih ringan, cocok untuk CPU lokal)
    → Dilatih khusus untuk tulisan tangan (handwritten text recognition)
    → Arsitektur: ViT encoder (vision) + RoBERTa decoder (language)

Cara kerja:
    1. Model di-load SEKALI saja saat pertama dipanggil (lazy singleton)
    2. Menerima image crop (PIL.Image) dari area target
    3. Mengembalikan teks hasil baca sebagai string

PENTING:
    TrOCR butuh INPUT BERUPA CROP GAMBAR, bukan full page.
    Crop harus sudah berisi area tulisan tangan yang ingin dibaca.
    Jangan kasih halaman penuh → hasilnya tidak akurat.
"""

import os
import logging
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)

# ── Kill-switch via .env ───────────────────────────────────────
# Set TROCR_ENABLED=true di .env setelah model selesai di-download.
# Default: false (pakai PaddleOCR untuk semua field, tidak ada timeout)
TROCR_ENABLED = os.getenv("TROCR_ENABLED", "false").lower() == "true"

if not TROCR_ENABLED:
    logger.info("[TrOCR] DINONAKTIFKAN via env. Field handwritten → fallback PaddleOCR.")

# ── Singleton state ────────────────────────────────────────────
_trocr_processor = None
_trocr_model      = None
_trocr_ready      = False   # False = belum pernah dicoba
_trocr_failed     = False   # True  = gagal load, jangan coba lagi
_trocr_loading    = False   # True  = sedang loading di background
_trocr_device     = None

# ── Page image cache ────────────────────────────────────────────
# Menghindari Image.open() berulang untuk halaman yang sama.
# Key = image_path, Value = PIL.Image. Dibatasi 4 halaman.
_page_image_cache: dict = {}


def prewarm_trocr():
    """
    Panggil saat server startup untuk mulai loading TrOCR di BACKGROUND THREAD.
    Server tetap responsif — request tidak diblokir selama loading.

    Kalau TROCR_ENABLED=false, fungsi ini tidak melakukan apapun.
    """
    if not TROCR_ENABLED:
        return

    import threading
    thread = threading.Thread(target=_load_trocr, daemon=True, name="TrOCR-Loader")
    thread.start()
    logger.info("[TrOCR] Loading dimulai di background. Server tetap siap menerima request.")


def _load_trocr():
    """
    Load TrOCR model dan processor ke memory.
    Hanya dieksekusi SEKALI — dijaga dengan lock agar thread-safe.
    """
    import threading
    global _trocr_processor, _trocr_model, _trocr_ready, _trocr_failed, _trocr_loading

    # Kill-switch: jangan load kalau env belum diaktifkan
    if not TROCR_ENABLED:
        _trocr_failed = True
        return

    if _trocr_ready or _trocr_failed or _trocr_loading:
        return  # Sudah selesai / gagal / sedang loading

    _trocr_loading = True  # Set flag: sedang loading, jangan blocking request

    try:
        import torch
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel

        # Deteksi otomatis: pakai GPU (CUDA) jika ada, kalau tidak fallback ke CPU
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        global _trocr_device
        _trocr_device = device

        print("[TrOCR] Sedang memuat model ke RAM (0/2)...")
        _trocr_processor = TrOCRProcessor.from_pretrained("models/trocr-finetuned")

        print(f"[TrOCR] Sedang memuat weights model ke {device.type.upper()} (1/2)...")
        _trocr_model = VisionEncoderDecoderModel.from_pretrained(
            "models/trocr-finetuned",
            use_safetensors=True
        )

        # Pindahkan model ke GPU/CPU
        _trocr_model.to(device)

        print("[TrOCR] Finalisasi model (2/2)...")
        _trocr_model.eval()

        # Warmup: jalankan dummy inference agar cold start tidak kena request pertama user
        print("[TrOCR] Warming up model (dummy inference)...")
        from PIL import Image as _PIL_Image
        dummy_img = _PIL_Image.new("RGB", (384, 64), color=(255, 255, 255))
        dummy_px  = _trocr_processor(images=dummy_img, return_tensors="pt").pixel_values.to(device)
        with torch.no_grad():
            _trocr_model.generate(dummy_px, max_new_tokens=5, num_beams=1)
        print("[TrOCR] Warmup selesai.")

        _trocr_ready   = True
        _trocr_loading = False
        print(f"[TrOCR] MODEL SIAP di {device.type.upper()}! Sekarang bisa baca tulisan tangan.")
        logger.info(f"[TrOCR] ✅ Model siap digunakan di {device.type.upper()}! Field handwritten akan dibaca TrOCR.")

    except Exception as e:
        _trocr_failed  = True
        _trocr_loading = False
        logger.error(f"[TrOCR] Gagal load model: {e}")
        logger.warning("[TrOCR] Field handwritten akan fallback ke PaddleOCR.")


def read_handwritten(image_crop) -> str:
    """
    Baca tulisan tangan dari image crop menggunakan TrOCR.

    Args:
        image_crop : PIL.Image atau numpy array

    Returns:
        string teks hasil baca, atau "" kalau gagal / model belum siap
    """
    import torch

    # Kalau masih loading di background → jangan tunggu, langsung fallback
    if _trocr_loading:
        logger.info("[TrOCR] Masih loading di background, field ini fallback ke PaddleOCR.")
        return "", 0.0

    # Kalau belum pernah dicoba sama sekali (TROCR_ENABLED=false) → skip quietly
    if not _trocr_ready and not _trocr_failed:
        logger.debug("[TrOCR] Disabled via env, fallback ke PaddleOCR.")
        return "", 0.0

    # Model gagal load atau tidak aktif → fallback
    if _trocr_failed or not _trocr_ready:
        return "", 0.0

    try:
        from PIL import Image

        # Konversi numpy array ke PIL Image kalau diperlukan
        if isinstance(image_crop, np.ndarray):
            image_crop = Image.fromarray(image_crop).convert("RGB")
        elif hasattr(image_crop, 'convert'):
            image_crop = image_crop.convert("RGB")

        # Pastikan gambar tidak terlalu kecil (TrOCR butuh minimal 10x10px)
        w, h = image_crop.size
        if w < 10 or h < 10:
            logger.warning(f"[TrOCR] Crop terlalu kecil ({w}x{h}), skip.")
            return "", 0.0

        # Proses gambar → tensor
        with torch.no_grad():
            pixel_values = _trocr_processor(
                images=image_crop,
                return_tensors="pt"
            ).pixel_values
            
            # Pindahkan input gambar ke device yang sama dengan model (GPU/CPU)
            pixel_values = pixel_values.to(_trocr_device)

            # Generate teks dengan parameter sesuai generation_config model fine-tuned
            outputs = _trocr_model.generate(
                pixel_values,
                num_beams=4,
                max_new_tokens=128,
                no_repeat_ngram_size=3,
                length_penalty=2.0,
                output_scores=True,
                return_dict_in_generate=True,
            )

        # Decode token ID → string
        generated_ids = outputs.sequences
        text = _trocr_processor.batch_decode(
            generated_ids,
            skip_special_tokens=True
        )[0].strip()

        # Hitung confidence per-token geometric mean (lebih akurat dari sequences_scores)
        import math as _math
        try:
            if outputs.scores and hasattr(outputs, 'beam_indices') and outputs.beam_indices is not None:
                token_probs = []
                for step_idx, step_scores in enumerate(outputs.scores):
                    beam_idx = outputs.beam_indices[0, step_idx].item()
                    token_id = outputs.sequences[0, step_idx + 1].item()
                    probs = torch.softmax(step_scores[beam_idx], dim=-1)
                    token_probs.append(probs[token_id].item())
                if token_probs:
                    log_mean = sum(_math.log(max(p, 1e-10)) for p in token_probs) / len(token_probs)
                    confidence = round(_math.exp(log_mean) * 100, 1)
                else:
                    confidence = 50.0
            elif hasattr(outputs, 'sequences_scores') and outputs.sequences_scores is not None:
                score = outputs.sequences_scores[0].item()
                num_tokens = max(1, int(outputs.sequences.shape[1]) - 1)
                confidence = round(min(100.0, max(0.0, _math.exp(score / num_tokens) * 100)), 1)
            else:
                confidence = 50.0
        except Exception:
            confidence = 50.0

        # Hallucination filter: teks sangat pendek dengan confidence rendah biasanya salah baca
        HALLUCINATION_CONF_THRESHOLD = 60.0
        if len(text) <= 2 and confidence < HALLUCINATION_CONF_THRESHOLD:
            logger.info(f"[TrOCR] '{text}' (conf={confidence:.1f}%) — teks terlalu pendek & tidak yakin, return ''")
            return "", confidence

        logger.info(f"[TrOCR] Crop {w}x{h}px → '{text}' (conf={confidence:.1f}%)")
        return text, confidence

    except Exception as e:
        logger.error(f"[TrOCR] Error saat baca: {e}")
        return "", 0.0


def crop_cell_for_trocr(image_path: str, x1: int, y1: int, x2: int, y2: int, padding: int = 4) -> object:
    """
    Crop area SEL TABEL dari gambar halaman untuk dikirim ke TrOCR.

    Berbeda dari crop_image_for_trocr() yang menerima (bbox tuple),
    fungsi ini menerima koordinat sel secara eksplisit (x1, y1, x2, y2)
    dari hasil kalkulasi offset kolom + anchor tabel.

    Args:
        image_path : path ke file PNG halaman
        x1, y1    : koordinat kiri atas sel (absolut, piksel)
        x2, y2    : koordinat kanan bawah sel (absolut, piksel)
        padding   : piksel tambahan di setiap sisi agar teks tidak terpotong

    Returns:
        PIL.Image object — crop siap dibaca TrOCR
        atau None kalau koordinat invalid / gambar tidak bisa dibuka
    """
    try:
        from PIL import Image

        # Gunakan cache agar gambar halaman tidak dibuka ulang tiap sel
        if image_path not in _page_image_cache:
            if len(_page_image_cache) >= 4:
                _page_image_cache.pop(next(iter(_page_image_cache)))
            _page_image_cache[image_path] = Image.open(image_path).convert("RGB")
        img = _page_image_cache[image_path]
        img_w, img_h = img.size

        # Tambahkan padding, clamp ke batas gambar
        cx1 = max(0, x1 - padding)
        cy1 = max(0, y1 - padding)
        cx2 = min(img_w, x2 + padding)
        cy2 = min(img_h, y2 + padding)

        if cx2 <= cx1 or cy2 <= cy1:
            logger.warning(f"[TrOCR] crop_cell: koordinat invalid ({cx1},{cy1},{cx2},{cy2}), skip.")
            return None

        crop = img.crop((cx1, cy1, cx2, cy2))

        # Validasi ukuran minimal — TrOCR butuh minimal 10x10 px
        if crop.width < 10 or crop.height < 10:
            logger.warning(f"[TrOCR] crop_cell terlalu kecil ({crop.width}x{crop.height}), skip.")
            return None

        return crop

    except Exception as e:
        logger.error(f"[TrOCR] Gagal crop_cell: {e}")
        return None


def crop_image_for_trocr(image_path: str, bbox: tuple) -> object:

    """
    Crop gambar halaman di area bbox untuk dikirim ke TrOCR.

    Args:
        image_path : path ke file PNG halaman
        bbox       : (x1, y1, x2, y2) koordinat absolut dalam pixel

    Returns:
        PIL.Image object — crop siap dibaca TrOCR
        atau None kalau gambar tidak bisa dibuka
    """
    try:
        from PIL import Image

        if image_path not in _page_image_cache:
            if len(_page_image_cache) >= 4:
                _page_image_cache.pop(next(iter(_page_image_cache)))
            _page_image_cache[image_path] = Image.open(image_path).convert("RGB")
        img = _page_image_cache[image_path]
        x1, y1, x2, y2 = bbox

        # Clamp koordinat agar tidak keluar batas gambar
        img_w, img_h = img.size
        x1 = max(0, min(x1, img_w))
        y1 = max(0, min(y1, img_h))
        x2 = max(x1 + 1, min(x2, img_w))
        y2 = max(y1 + 1, min(y2, img_h))

        crop = img.crop((x1, y1, x2, y2))
        return crop

    except Exception as e:
        logger.error(f"[TrOCR] Gagal crop gambar: {e}")
        return None
