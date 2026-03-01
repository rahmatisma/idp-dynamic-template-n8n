"""
generate_template.py
---------------------
Script CLI untuk membuat template secara interaktif.
Hanya dipakai saat development/testing.
Di production, fungsi ini digantikan Canvas Editor di Laravel.

Cara pakai:
    python generate_template.py

Atau dengan argumen langsung:
    python generate_template.py --image storage/pages/form_pm/page_1.png --name form_pm_vendor_a
"""

import argparse
from pathlib import Path
from app.services.template_mapper import (
    create_template_interactively,
    list_available_templates
)
from app.services.pdf_converter import convert_if_not_exists
from config.settings import PAGES_DIR, INPUT_DIR


def pilih_gambar_interaktif() -> Path | None:
    """
    Tampilkan daftar file PNG yang tersedia dan minta user memilih.
    """
    # Cari semua PNG di storage/pages/
    all_pages = list(PAGES_DIR.rglob("page_*.png"))

    if not all_pages:
        print("\n[!] Tidak ada halaman PNG di storage/pages/")
        print("[!] Konversi PDF dulu atau masukkan path manual.\n")

        # Tawarkan untuk convert dari PDF yang ada di inputs
        pdfs = list(INPUT_DIR.glob("*.pdf"))
        if pdfs:
            print("PDF tersedia di storage/inputs/:")
            for i, pdf in enumerate(pdfs, 1):
                print(f"  {i}. {pdf.name}")

            pilihan = input("\nPilih nomor PDF untuk dikonversi (atau ENTER untuk skip): ").strip()
            if pilihan.isdigit() and 1 <= int(pilihan) <= len(pdfs):
                pdf_path = pdfs[int(pilihan) - 1]
                print(f"\n[+] Mengkonversi {pdf_path.name}...")
                pages = convert_if_not_exists(str(pdf_path))
                all_pages = pages
            else:
                return None
        else:
            return None

    print("\nHalaman PNG tersedia:")
    for i, page in enumerate(all_pages, 1):
        # Tampilkan nama relatif agar lebih mudah dibaca
        relative = page.relative_to(PAGES_DIR)
        print(f"  {i}. {relative}")

    pilihan = input("\nPilih nomor halaman yang akan dijadikan template: ").strip()
    if pilihan.isdigit() and 1 <= int(pilihan) <= len(all_pages):
        return all_pages[int(pilihan) - 1]

    print("[!] Pilihan tidak valid.")
    return None


def main():
    parser = argparse.ArgumentParser(
        description="Buat template Dynamic Mapping secara interaktif"
    )
    parser.add_argument(
        "--image",
        type=str,
        help="Path ke file PNG dokumen (opsional, bisa dipilih interaktif)"
    )
    parser.add_argument(
        "--name",
        type=str,
        help="Nama template yang akan dibuat (opsional)"
    )
    args = parser.parse_args()

    print("\n" + "="*60)
    print("  GENERATOR TEMPLATE — Dynamic Template Mapping")
    print("="*60)

    # Tampilkan template yang sudah ada
    existing = list_available_templates()
    if existing:
        print(f"\nTemplate yang sudah ada ({len(existing)}):")
        for t in existing:
            print(f"  - {t}")
    else:
        print("\nBelum ada template tersimpan.")

    print()

    # Tentukan file gambar yang akan dipakai
    if args.image:
        image_path = Path(args.image)
        if not image_path.exists():
            print(f"[ERROR] File tidak ditemukan: {image_path}")
            return
    else:
        image_path = pilih_gambar_interaktif()
        if image_path is None:
            print("[!] Tidak ada gambar dipilih. Program selesai.")
            return

    # Tentukan nama template
    if args.name:
        template_name = args.name
    else:
        # Sarankan nama berdasarkan nama file gambar
        suggested = image_path.parent.name
        template_name = input(
            f"Nama template (saran: '{suggested}'): "
        ).strip() or suggested

    # Mulai pembuatan template secara interaktif
    output_path = create_template_interactively(str(image_path), template_name)

    print(f"\n{'='*60}")
    print(f"  SELESAI!")
    print(f"  Template disimpan di: {output_path}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
    