"""
config/settings.py
------------------
Pusat konfigurasi seluruh sistem Python Engine.
Semua file lain import dari sini.
"""

from pathlib import Path

# ─── Root Project ───────────────────────────────────────────────
# Path ke folder python-engine (2 level ke atas dari file ini)
BASE_DIR = Path(__file__).resolve().parent.parent


# ─── Storage Folders ────────────────────────────────────────────
# Folder untuk menyimpan file PDF yang diterima dari Laravel/n8n
INPUT_DIR = BASE_DIR / "storage" / "inputs"

# Folder untuk menyimpan hasil convert PDF → PNG per halaman
PAGES_DIR = BASE_DIR / "storage" / "pages"

# Folder untuk menyimpan potongan gambar area isian (hasil crop)
CROPS_DIR = BASE_DIR / "storage" / "crops"

# Folder untuk menyimpan file JSON konfigurasi template
TEMPLATES_DIR = BASE_DIR / "storage" / "templates"


# ─── PDF Converter Settings ──────────────────────────────────────
# Resolusi convert PDF ke gambar.
# 300 DPI = kualitas tinggi, cocok untuk OCR.
# Jangan kurang dari 200 DPI karena teks bisa buram.
PDF_DPI = 300

# Format gambar hasil convert. PNG lebih baik dari JPG untuk OCR
# karena tidak ada kompresi yang merusak kualitas teks.
PAGE_FORMAT = "PNG"


# ─── OCR Settings ────────────────────────────────────────────────
# Bahasa yang dikenali PaddleOCR.
# "en" = Inggris, "id" belum tersedia, tapi "en" cukup untuk
# dokumen teknis campuran Indonesia-Inggris.
OCR_LANGUAGE = "en"

# Batas minimum confidence score PaddleOCR.
# Hasil dengan confidence di bawah ini dianggap tidak yakin
# dan akan ditandai "NEED_REVIEW" di output JSON.
OCR_CONFIDENCE_THRESHOLD = 0.75

# Ukuran gambar input untuk TrOCR (dalam piksel).
# Jangan diubah kecuali kamu ganti versi model TrOCR.
TROCR_IMAGE_SIZE = 384


# ─── Template Mapper Settings ────────────────────────────────────
# Toleransi pencarian anchor keyword (fuzzy matching).
# Nilai 0.8 artinya kata anchor boleh berbeda 20% dari keyword
# (untuk menangani kesalahan baca OCR pada label teks).
ANCHOR_FUZZY_THRESHOLD = 0.8

# Margin tambahan saat cropping area isian (dalam piksel).
# Ditambahkan di semua sisi agar teks tidak terpotong.
CROP_MARGIN = 8


# ─── Flask API Settings ──────────────────────────────────────────
# Port Flask berjalan. Pastikan tidak bentrok dengan Laravel (8000)
# atau n8n (5678).
FLASK_PORT = 5000
FLASK_DEBUG = True  # Ganti False saat production


# ─── Auto-create folders saat settings diimport ──────────────────
# Supaya tidak perlu buat folder manual, cukup import settings
# dan semua folder storage otomatis terbentuk.
for _dir in [INPUT_DIR, PAGES_DIR, CROPS_DIR, TEMPLATES_DIR]:
    _dir.mkdir(parents=True, exist_ok=True)