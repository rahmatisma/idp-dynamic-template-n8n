"""
augment_dataset.py — Augmentasi Dataset Fine-Tuning TrOCR
Jalankan dari folder python-engine (venv aktif):
    python augment_dataset.py
"""

import csv
import io
import time
import random
import numpy as np
from pathlib import Path
from datetime import datetime
from PIL import Image, ImageFilter, ImageEnhance

# ── Konfigurasi ───────────────────────────────────────────────────────────────
SEED            = 42
BLUR_MIN_HEIGHT = 60   # skip blur jika tinggi crop < 60px
PROGRESS_EVERY  = 500

random.seed(SEED)
np.random.seed(SEED)

BASE_DIR  = Path(__file__).resolve().parent
RAW_DIR   = BASE_DIR / "Dataset" / "raw_crops"
AUG_DIR   = BASE_DIR / "Dataset" / "augmented"
CSV_IN    = BASE_DIR / "Dataset" / "labels.csv"
CSV_OUT   = BASE_DIR / "Dataset" / "labels_augmented.csv"
LOG_PATH  = BASE_DIR / "Dataset" / "augmentation_log.txt"


# ── Fungsi Augmentasi ─────────────────────────────────────────────────────────

def aug_brightness_up(img: Image.Image) -> Image.Image:
    return ImageEnhance.Brightness(img).enhance(1.3)

def aug_brightness_down(img: Image.Image) -> Image.Image:
    return ImageEnhance.Brightness(img).enhance(0.7)

def aug_gauss_noise(img: Image.Image, std: float = 10.0) -> Image.Image:
    rng = np.random.RandomState(SEED)
    arr = np.array(img, dtype=np.float32)
    arr = np.clip(arr + rng.normal(0, std, arr.shape), 0, 255).astype(np.uint8)
    return Image.fromarray(arr)

def aug_blur(img: Image.Image, radius: float = 1.0) -> Image.Image:
    return img.filter(ImageFilter.GaussianBlur(radius=radius))

def aug_rotate(img: Image.Image, angle: float) -> Image.Image:
    return img.rotate(angle, expand=False, fillcolor="white")

def aug_salt_pepper(img: Image.Image, density: float = 0.02) -> Image.Image:
    rng = np.random.RandomState(SEED)
    arr = np.array(img, dtype=np.uint8).copy()
    flat = arr.flatten()
    n    = int(density / 2 * len(flat))
    flat[rng.choice(len(flat), n, replace=False)] = 255
    flat[rng.choice(len(flat), n, replace=False)] = 0
    return Image.fromarray(flat.reshape(arr.shape))

def aug_jpeg_comp(img: Image.Image, quality: int = 65) -> Image.Image:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    return Image.open(buf).copy()


# ── Helper ────────────────────────────────────────────────────────────────────

def save_aug(img_rgb: Image.Image, out_path: Path, is_gray: bool):
    out = img_rgb.convert("L") if is_gray else img_rgb
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(out_path, format="PNG")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    AUG_DIR.mkdir(parents=True, exist_ok=True)
    ts_start = datetime.now()

    # ── Log setup (append) ────────────────────────────────────────────
    log_lines = []
    def log(msg: str, console: bool = True):
        log_lines.append(msg)
        if console:
            print(msg)

    sep = "=" * 65

    log(sep)
    log(f"AUGMENTASI DIMULAI : {ts_start.strftime('%Y-%m-%d %H:%M:%S')}")
    log(f"Random seed        : {SEED}")
    log(f"Source CSV         : {CSV_IN}")
    log(f"Output gambar      : {AUG_DIR}")
    log(f"Output CSV         : {CSV_OUT}")
    log(sep)

    # ── Baca labels.csv ───────────────────────────────────────────────
    with open(CSV_IN, newline="", encoding="utf-8") as f:
        all_rows = [
            (r[0].strip(), r[1].strip())
            for r in csv.reader(f)
            if len(r) >= 2 and r[0].strip()
        ]
    log(f"Total crop di labels.csv : {len(all_rows)}")

    # ── Resume: baca CSV_OUT yang sudah ada ───────────────────────────
    done_keys: set[str] = set()
    if CSV_OUT.exists():
        with open(CSV_OUT, newline="", encoding="utf-8") as f:
            for r in csv.reader(f):
                if len(r) >= 2 and r[0].strip():
                    done_keys.add(r[0].strip())
        log(f"Resume: {len(done_keys)} entri sudah ada — melanjutkan dari sisa...")
    else:
        log("Mulai dari awal (labels_augmented.csv belum ada).")

    # ── Stats ─────────────────────────────────────────────────────────
    stats = {k: 0 for k in [
        "original", "bright_up", "bright_down", "gauss_noise",
        "blur", "blur_skip", "rot_plus", "rot_min",
        "salt_pepper", "jpeg_comp", "corrupt",
    ]}
    blur_skip_log: list[str] = []
    corrupt_log  : list[str] = []

    t_start   = time.time()
    processed = 0

    with open(CSV_OUT, "a", newline="", encoding="utf-8") as fout:
        writer = csv.writer(fout)

        for i, (rel_path, label) in enumerate(all_rows):
            img_path  = RAW_DIR / rel_path
            parts     = Path(rel_path)
            subfolder = parts.parent.as_posix()   # contoh: POP-CILEUNYI
            stem      = parts.stem                 # contoh: page1_0001

            # ── Load gambar ───────────────────────────────────────────
            try:
                img_orig = Image.open(img_path)
                img_orig.verify()
                img_orig = Image.open(img_path)
                is_gray  = img_orig.mode in ("L", "1", "LA", "P")
                img_rgb  = img_orig.convert("RGB")
                _, h     = img_orig.size  # width, height
            except Exception as e:
                msg = f"CORRUPT [{rel_path}]: {e}"
                log(msg, console=False)
                corrupt_log.append(msg)
                stats["corrupt"] += 1
                continue

            out_sub = AUG_DIR / subfolder

            def _write(key: str, aug_img: Image.Image, out_path: Path, stat_key: str):
                if key in done_keys:
                    return
                save_aug(aug_img, out_path, is_gray)
                writer.writerow([key, label])
                done_keys.add(key)
                stats[stat_key] += 1

            # 1. Original
            orig_key = f"raw_crops/{rel_path}"
            if orig_key not in done_keys:
                writer.writerow([orig_key, label])
                done_keys.add(orig_key)
                stats["original"] += 1

            # 2. Brightness terang
            k = f"augmented/{subfolder}/{stem}_bright_up.png"
            _write(k, aug_brightness_up(img_rgb),   out_sub / f"{stem}_bright_up.png",   "bright_up")

            # 3. Brightness gelap
            k = f"augmented/{subfolder}/{stem}_bright_down.png"
            _write(k, aug_brightness_down(img_rgb), out_sub / f"{stem}_bright_down.png", "bright_down")

            # 4. Gaussian noise
            k = f"augmented/{subfolder}/{stem}_gauss_noise.png"
            _write(k, aug_gauss_noise(img_rgb),     out_sub / f"{stem}_gauss_noise.png", "gauss_noise")

            # 5. Gaussian blur — skip jika tinggi < BLUR_MIN_HEIGHT
            k = f"augmented/{subfolder}/{stem}_blur.png"
            if k not in done_keys:
                if h < BLUR_MIN_HEIGHT:
                    msg = f"BLUR_SKIP [{rel_path}] h={h}px"
                    blur_skip_log.append(msg)
                    stats["blur_skip"] += 1
                else:
                    _write(k, aug_blur(img_rgb), out_sub / f"{stem}_blur.png", "blur")

            # 6. Rotasi +3°
            k = f"augmented/{subfolder}/{stem}_rot_plus.png"
            _write(k, aug_rotate(img_rgb,  3), out_sub / f"{stem}_rot_plus.png", "rot_plus")

            # 7. Rotasi -3°
            k = f"augmented/{subfolder}/{stem}_rot_min.png"
            _write(k, aug_rotate(img_rgb, -3), out_sub / f"{stem}_rot_min.png",  "rot_min")

            # 8. Salt & pepper
            k = f"augmented/{subfolder}/{stem}_salt_pepper.png"
            _write(k, aug_salt_pepper(img_rgb), out_sub / f"{stem}_salt_pepper.png", "salt_pepper")

            # 9. JPEG compression
            k = f"augmented/{subfolder}/{stem}_jpeg_comp.png"
            _write(k, aug_jpeg_comp(img_rgb), out_sub / f"{stem}_jpeg_comp.png", "jpeg_comp")

            processed += 1

            # Progress setiap PROGRESS_EVERY crop
            if processed % PROGRESS_EVERY == 0:
                elapsed  = time.time() - t_start
                per_crop = elapsed / processed
                eta_s    = (len(all_rows) - i - 1) * per_crop
                pct      = processed / len(all_rows) * 100
                print(f"[{processed:>5}/{len(all_rows)}] {pct:5.1f}% | "
                      f"elapsed: {elapsed/60:.1f} mnt | ETA: {eta_s/60:.1f} mnt")

    # ── Ringkasan ─────────────────────────────────────────────────────
    ts_end      = datetime.now()
    total_secs  = time.time() - t_start
    aug_total   = sum(stats[k] for k in [
        "bright_up","bright_down","gauss_noise","blur",
        "rot_plus","rot_min","salt_pepper","jpeg_comp"
    ])
    total_csv   = stats["original"] + aug_total

    summary = f"""
{sep}
AUGMENTASI SELESAI : {ts_end.strftime('%Y-%m-%d %H:%M:%S')}
Durasi             : {total_secs:.1f}s ({total_secs/60:.1f} menit)
{sep}
Crop original diproses    : {stats['original']}
Crop corrupt (di-skip)    : {stats['corrupt']}
{'-'*45}
Augmentasi dihasilkan per teknik:
  Brightness terang       : {stats['bright_up']}
  Brightness gelap        : {stats['bright_down']}
  Gaussian noise          : {stats['gauss_noise']}
  Gaussian blur           : {stats['blur']}  (di-skip: {stats['blur_skip']})
  Rotasi +3°              : {stats['rot_plus']}
  Rotasi -3°              : {stats['rot_min']}
  Salt & pepper           : {stats['salt_pepper']}
  JPEG compression        : {stats['jpeg_comp']}
{'-'*45}
Total augmentasi dihasilkan      : {aug_total}
Total di labels_augmented.csv    : {total_csv}
{sep}"""

    log(summary)

    if blur_skip_log:
        log(f"\nDetail BLUR_SKIP ({len(blur_skip_log)} crop):", console=False)
        for m in blur_skip_log:
            log(f"  {m}", console=False)

    if corrupt_log:
        log(f"\nDetail CORRUPT ({len(corrupt_log)} crop):", console=False)
        for m in corrupt_log:
            log(f"  {m}", console=False)

    # Tulis log ke file
    LOG_PATH.write_text(
        f"Seed: {SEED}\n" + "\n".join(log_lines),
        encoding="utf-8"
    )

    # ── Verifikasi ────────────────────────────────────────────────────
    with open(CSV_OUT, newline="", encoding="utf-8") as f:
        all_out = [r for r in csv.reader(f) if r and r[0].strip()]

    print("\nVerifikasi - 5 baris PERTAMA labels_augmented.csv:")
    for r in all_out[:5]:
        print(f"  {r[0]}  =>  {r[1]}")

    print("\nVerifikasi - 5 baris TERAKHIR labels_augmented.csv:")
    for r in all_out[-5:]:
        print(f"  {r[0]}  =>  {r[1]}")

    print(f"\nTotal baris di labels_augmented.csv : {len(all_out)}")
    print(f"Log tersimpan di                    : {LOG_PATH}")


if __name__ == "__main__":
    main()
