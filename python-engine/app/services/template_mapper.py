"""
app/services/template_mapper.py
--------------------------------
Inti dari Dynamic Template Mapping sistem ini.

Berisi dua kelompok fungsi utama:
    1. PEMBUATAN TEMPLATE - Interaktif, kamu gambar kotak di atas dokumen,
       sistem hitung offset otomatis, simpan ke JSON.
       (Dipakai saat development/testing via generate_template.py)
       (Di production, digantikan oleh Canvas Editor di Laravel)

    2. PEMBACAAN TEMPLATE - Dipakai saat dokumen masuk ke sistem,
       baca JSON template, cari anchor di dokumen, tentukan area crop.
       (Dipakai permanen sampai production)
"""

import json
import cv2
import numpy as np
from pathlib import Path
from typing import Any, TypedDict
from config.settings import TEMPLATES_DIR, ANCHOR_FUZZY_THRESHOLD, CROP_MARGIN
from app.utils.fuzzy_matcher import find_best_anchor_match, OcrResult

# Generic ndarray alias — shape and dtype intentionally unspecified.
# type: ignore is needed here because NumPy stubs require Any for unparameterized arrays.
MatLike = np.ndarray[Any, np.dtype[Any]]  # pyright: ignore[reportAny]


class BoxCoords(TypedDict):
    """Koordinat kotak {x, y, width, height} dalam piksel."""
    x: int
    y: int
    width: int
    height: int


class TargetCoord(TypedDict, total=False):
    """Koordinat target isian beserta offset-nya."""
    label: str
    key: str
    box: BoxCoords
    offset_x: int
    offset_y: int
    width: int
    height: int
    text_type: str


class FieldConfig(TypedDict):
    """Struktur konfigurasi satu field dalam grup."""
    field_name: str
    field_key: str
    field_anchor: str
    anchor_box: BoxCoords
    targets: list[TargetCoord]


class GroupConfig(TypedDict):
    """Struktur satu grup (Kategori/Tabel)."""
    group_anchor: str
    group_key: str
    group_type: str  # fixed, checklist, list
    fields: list[FieldConfig]


class TemplateData(TypedDict):
    """Struktur data template lengkap yang kompatibel dengan React Editor."""
    template_name: str
    type_name: str
    pdf_path: str
    groups: list[GroupConfig]


class CropCoords(TypedDict):
    """Koordinat area crop hasil dari get_crop_coordinates()."""
    x: int
    y: int
    width: int
    height: int
    anchor_found_at: dict[str, int]


# ═══════════════════════════════════════════════════════════════════
# BAGIAN 1 — PEMBUATAN TEMPLATE (Development/Testing only)
# ═══════════════════════════════════════════════════════════════════

# Variabel global untuk menyimpan state saat menggambar kotak
_drawing: bool = False
_start_x: int = -1
_start_y: int = -1
_end_x: int = -1
_end_y: int = -1
_current_box: BoxCoords | None = None


def _mouse_callback(event: int, x: int, y: int, flags: int, param: object) -> None:
    """
    Callback untuk mendeteksi klik dan drag mouse di jendela gambar.
    Dipanggil otomatis oleh OpenCV setiap ada event mouse.
    """
    global _drawing, _start_x, _start_y, _end_x, _end_y, _current_box

    if event == cv2.EVENT_LBUTTONDOWN:
        # Mulai menggambar kotak
        _drawing = True
        _start_x, _start_y = x, y
        _end_x, _end_y = x, y

    elif event == cv2.EVENT_MOUSEMOVE:
        # Update ujung kotak saat mouse digerak
        if _drawing:
            _end_x, _end_y = x, y

    elif event == cv2.EVENT_LBUTTONUP:
        # Selesai menggambar, simpan koordinat kotak
        _drawing = False
        _end_x, _end_y = x, y
        _current_box = {
            "x": min(_start_x, _end_x),
            "y": min(_start_y, _end_y),
            "width": abs(_end_x - _start_x),
            "height": abs(_end_y - _start_y),
        }


def draw_box_on_image(image_path: str, instruction: str) -> BoxCoords | None:
    """
    Tampilkan gambar dokumen dan minta user menggambar satu kotak.

    Args:
        image_path: Path ke file PNG dokumen.
        instruction: Teks instruksi yang ditampilkan di jendela.

    Returns:
        Dict berisi koordinat kotak {x, y, width, height},
        atau None jika user membatalkan (tekan ESC).
    """
    global _current_box, _drawing

    image = cv2.imread(str(image_path))
    if image is None:
        raise FileNotFoundError(f"Gambar tidak ditemukan: {image_path}")

    # Resize untuk tampilan layar (agar tidak terlalu besar)
    # Tapi koordinat tetap dalam skala asli
    screen_height = 1200
    scale = screen_height / image.shape[1]
    display_image = cv2.resize(image, (0, 0), fx=scale, fy=scale)
    original_image = display_image.copy()

    window_name = instruction
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    cv2.setMouseCallback(window_name, _mouse_callback)
    _current_box = None

    print(f"\n[Template Mapper] {instruction}")
    print("[Template Mapper] Klik dan drag untuk menggambar kotak.")
    print("[Template Mapper] Tekan ENTER untuk konfirmasi, ESC untuk batal.\n")

    while True:
        display = original_image.copy()

        # Gambar kotak sementara saat mouse digerak
        if _drawing and _start_x != -1:
            _ = cv2.rectangle(display, (_start_x, _start_y),
                          (_end_x, _end_y), (0, 255, 0), 2)

        # Gambar kotak final setelah mouse dilepas
        current_box = _current_box
        if current_box is not None and not _drawing:
            _ = cv2.rectangle(display,
                          (current_box["x"], current_box["y"]),
                          (current_box["x"] + current_box["width"], current_box["y"] + current_box["height"]),
                          (0, 200, 0), 2)

        cv2.imshow(window_name, display)
        key: int = int(cv2.waitKey(1)) & 0xFF

        if key == 13 and _current_box:  # ENTER
            cv2.destroyWindow(window_name)
            # Konversi koordinat display kembali ke koordinat asli
            box = BoxCoords(
                x=int(_current_box["x"] / scale),
                y=int(_current_box["y"] / scale),
                width=int(_current_box["width"] / scale),
                height=int(_current_box["height"] / scale),
            )
            print(f"[Template Mapper] Kotak dikonfirmasi: {box}")
            return box

        elif key == 27:  # ESC
            cv2.destroyWindow(window_name)
            print("[Template Mapper] Dibatalkan.")
            return None

    return None  # fallback (tidak seharusnya tercapai)


def create_template_interactively(image_path: str, template_name: str) -> Path:
    """
    Buat template baru secara interaktif dengan menggambar kotak di dokumen.
    Dipanggil oleh generate_template.py saat development/testing.

    Alur:
        1. Tampilkan gambar, minta gambar kotak ANCHOR (label teks)
        2. Tampilkan gambar lagi, minta gambar kotak VALUE (area isian)
        3. Hitung offset antara anchor dan value
        4. Simpan ke JSON di storage/templates/

    Args:
        image_path: Path ke PNG dokumen yang akan dijadikan template.
        template_name: Nama template (misal "form_pm_vendor_a").

    Returns:
        Path ke file JSON template yang disimpan.
    """
    template_data: TemplateData = {
        "template_name": template_name,
        "source_image": str(image_path),
        "fields": []
    }

    print(f"\n{'='*60}")
    print(f"  PEMBUATAN TEMPLATE: {template_name}")
    print(f"{'='*60}")
    print("Kamu akan mendefinisikan field satu per satu.")
    print("Setiap field butuh 2 kotak: ANCHOR (label) dan VALUE (area isian).\n")

    while True:
        field_name = input("Nama field (contoh: suhu_ruangan) atau 'selesai' untuk berhenti: ").strip()
        if field_name.lower() == "selesai":
            break
        if not field_name:
            continue

        anchor_keyword = input(f"Kata kunci anchor untuk '{field_name}' (teks label di dokumen): ").strip()
        if not anchor_keyword:
            print("Kata kunci anchor tidak boleh kosong.")
            continue

        print(f"\n--- Field: {field_name} ---")

        # Langkah 1: Gambar kotak di atas teks ANCHOR (label)
        anchor_box = draw_box_on_image(
            image_path,
            f"[1/2] Gambar kotak di atas LABEL '{anchor_keyword}' lalu tekan ENTER"
        )
        if anchor_box is None:
            print("Dilewati.")
            continue

        # Langkah 2: Gambar kotak di atas area VALUE (isian)
        value_box = draw_box_on_image(
            image_path,
            f"[2/2] Gambar kotak di atas AREA ISIAN untuk '{field_name}' lalu tekan ENTER"
        )
        if value_box is None:
            print("Dilewati.")
            continue

        # Hitung offset (jarak dari anchor ke value)
        offset_x = value_box["x"] - anchor_box["x"]
        offset_y = value_box["y"] - anchor_box["y"]

        field_config = FieldConfig(
            field_name=field_name,
            anchor_keyword=anchor_keyword,
            anchor_box=anchor_box,
            value_box=value_box,
            offset_x=offset_x,
            offset_y=offset_y,
            value_width=value_box["width"],
            value_height=value_box["height"],
            field_type="handwritten"  # default, bisa diubah manual di JSON
        )

        template_data["fields"].append(field_config)
        print(f"\n[OK] Field '{field_name}' disimpan.")
        print(f"     Offset: x={offset_x}, y={offset_y}")
        print(f"     Dimensi area isian: {value_box['width']}x{value_box['height']} piksel\n")

    # Simpan ke JSON
    output_path = TEMPLATES_DIR / f"{template_name}.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(template_data, f, indent=2, ensure_ascii=False)

    print(f"\n[Template Mapper] Template berhasil disimpan: {output_path}")
    print(f"[Template Mapper] Total field terdefinisi: {len(template_data['fields'])}")
    return output_path


# ═══════════════════════════════════════════════════════════════════
# BAGIAN 2 — PEMBACAAN TEMPLATE (Permanen sampai production)
# ═══════════════════════════════════════════════════════════════════

def load_template(template_name: str) -> TemplateData:
    """
    Muat konfigurasi template dari file JSON.

    Args:
        template_name: Nama template tanpa ekstensi (misal "form_pm_vendor_a").

    Returns:
        Dict berisi konfigurasi template lengkap.

    Raises:
        FileNotFoundError: Jika template tidak ditemukan.
    """
    template_path = TEMPLATES_DIR / f"{template_name}.json"

    if not template_path.exists():
        raise FileNotFoundError(
            f"Template '{template_name}' tidak ditemukan di {TEMPLATES_DIR}. "
            f"Buat dulu dengan generate_template.py"
        )

    with open(template_path, "r", encoding="utf-8") as f:
        template = json.load(f)

    print(f"[Template Mapper] Template dimuat: {template_name} ({len(template['fields'])} field)")
    return template


def get_field_crops(
    ocr_results: OcrResult,
    field_config: FieldConfig,
    image_shape: tuple[int, ...]
) -> dict[str, CropCoords] | None:
    """
    Tentukan koordinat area crop untuk SEMUA target dalam satu field (result, standard, status).
    """
    anchor_box_config = field_config.get("anchor_box")
    if not anchor_box_config:
        return None

    img_height, img_width = image_shape[:2]

    # Cari anchor di hasil OCR
    anchor_position = find_best_anchor_match(
        ocr_results,
        field_config.get("field_anchor", ""),
        threshold=ANCHOR_FUZZY_THRESHOLD
    )

    if anchor_position is None:
        return None

    found_x, found_y = anchor_position
    
    crops = {}
    for target_cfg in field_config.get("targets", []):
        if not target_cfg or not target_cfg.get("box"): continue
        
        t_key = target_cfg["key"]
        offset_x = target_cfg["offset_x"]
        offset_y = target_cfg["offset_y"]
        w = target_cfg["width"]
        h = target_cfg["height"]

        crop_x = max(0, found_x + offset_x - CROP_MARGIN)
        crop_y = max(0, found_y + offset_y - CROP_MARGIN)
        crop_w = min(w + (CROP_MARGIN * 2), img_width - crop_x)
        crop_h = min(h + (CROP_MARGIN * 2), img_height - crop_y)

        crops[t_key] = CropCoords(
            x=int(crop_x),
            y=int(crop_y),
            width=int(crop_w),
            height=int(crop_h),
            anchor_found_at={"x": found_x, "y": found_y}
        )
    
    return crops


def crop_value_area(image: MatLike, crop_coords: CropCoords) -> MatLike:
    """
    Potong area nilai dari gambar dokumen berdasarkan koordinat yang
    sudah dihitung oleh get_crop_coordinates().

    Args:
        image: Gambar dokumen dalam format numpy array (dari cv2.imread).
        crop_coords: Dict koordinat {x, y, width, height}.

    Returns:
        Numpy array berisi potongan gambar area nilai.
    """
    x = crop_coords["x"]
    y = crop_coords["y"]
    w = crop_coords["width"]
    h = crop_coords["height"]

    cropped = image[y:y+h, x:x+w]
    return cropped


def list_available_templates() -> list[str]:
    """
    Tampilkan semua template yang tersedia di storage/templates/.

    Returns:
        List nama template (tanpa ekstensi .json).
    """
    templates = [p.stem for p in TEMPLATES_DIR.glob("*.json")]
    return templates