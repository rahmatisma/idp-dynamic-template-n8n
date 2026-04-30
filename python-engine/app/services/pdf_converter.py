"""
app/services/pdf_converter.py
------------------------------
Bertanggung jawab mengkonversi file PDF menjadi gambar PNG per halaman.
Ini adalah langkah pertama sebelum OCR bisa bekerja.

Alur:
    PDF masuk → convert tiap halaman → PNG tersimpan di storage/pages/
"""

from pathlib import Path
from pdf2image import convert_from_path
from config.settings import PAGES_DIR, PDF_DPI, PAGE_FORMAT


def convert_pdf_to_images(pdf_path: str) -> list[Path]:
    """
    Convert file PDF menjadi gambar PNG per halaman.

    Args:
        pdf_path: Path lengkap ke file PDF yang akan dikonversi.

    Returns:
        List berisi Path ke setiap file PNG yang dihasilkan.
        Urutan list sesuai urutan halaman di PDF.

    Raises:
        FileNotFoundError: Jika file PDF tidak ditemukan.
        Exception: Jika konversi gagal (misal PDF rusak atau terenkripsi).

    Contoh penggunaan:
        pages = convert_pdf_to_images("storage/inputs/form_pm_001.pdf")
        # pages = [Path("storage/pages/form_pm_001/page_1.png"),
        #          Path("storage/pages/form_pm_001/page_2.png")]
    """

    pdf_file = Path(pdf_path)

    # Validasi file PDF ada
    if not pdf_file.exists():
        raise FileNotFoundError(f"File PDF tidak ditemukan: {pdf_file}")

    # Buat subfolder khusus per dokumen supaya tidak campur aduk
    # Contoh: storage/pages/form_pm_001/
    doc_name = pdf_file.stem  # Nama file tanpa ekstensi
    output_dir = PAGES_DIR / doc_name
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"[PDF Converter] Memulai konversi: {pdf_file.name}")
    print(f"[PDF Converter] Output folder: {output_dir}")

    # Convert PDF ke gambar
    # DPI 300 menghasilkan gambar berkualitas tinggi untuk OCR
    images = convert_from_path(
        str(pdf_file),
        dpi=PDF_DPI,
        fmt=PAGE_FORMAT.lower(),
    )

    print(f"[PDF Converter] Total halaman ditemukan: {len(images)}")

    # Simpan setiap halaman sebagai file PNG terpisah
    saved_pages = []
    for i, image in enumerate(images, start=1):
        page_filename = f"page_{i}.png"
        page_path = output_dir / page_filename
        image.save(str(page_path), PAGE_FORMAT)
        saved_pages.append(page_path)
        print(f"[PDF Converter] Halaman {i} disimpan: {page_path}")

    print(f"[PDF Converter] Selesai. {len(saved_pages)} halaman berhasil dikonversi.")
    return saved_pages


def get_existing_pages(doc_name: str) -> list[Path]:
    """
    Ambil halaman PNG yang sudah pernah dikonversi sebelumnya.
    Berguna untuk menghindari konversi ulang dokumen yang sama.

    Args:
        doc_name: Nama dokumen tanpa ekstensi (misal "form_pm_001")

    Returns:
        List Path PNG yang sudah ada, atau list kosong jika belum ada.
    """

    output_dir = PAGES_DIR / doc_name

    if not output_dir.exists():
        return []

    # Ambil semua PNG dengan format page_X.png (dimana X hanya angka)
    import re
    pages = []
    for p in output_dir.glob("page_*.png"):
        match = re.match(r"^page_(\d+)\.png$", p.name)
        if match:
            pages.append(p)
            
    # Urutkan berdasarkan angka halaman
    pages = sorted(pages, key=lambda p: int(re.match(r"^page_(\d+)\.png$", p.name).group(1)))

    return pages


def convert_if_not_exists(pdf_path: str) -> list[Path]:
    """
    Convert PDF hanya jika belum pernah dikonversi sebelumnya.
    Menghemat waktu dan resource jika dokumen yang sama diproses ulang.

    Args:
        pdf_path: Path lengkap ke file PDF.

    Returns:
        List Path ke file PNG (dari cache atau baru dikonversi).
    """

    pdf_file = Path(pdf_path)
    doc_name = pdf_file.stem

    # Cek apakah sudah pernah dikonversi
    existing = get_existing_pages(doc_name)
    if existing:
        print(f"[PDF Converter] Cache ditemukan: {len(existing)} halaman untuk '{doc_name}'")
        return existing

    # Belum ada, lakukan konversi
    return convert_pdf_to_images(str(pdf_file))