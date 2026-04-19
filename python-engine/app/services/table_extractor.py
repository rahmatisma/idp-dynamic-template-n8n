"""
app/services/table_extractor.py
--------------------------------
Modul khusus untuk mengekstrak data dari grup bertipe "dynamic_table".

Berbeda dengan grup "fixed" yang menggunakan offset dari anchor tunggal,
modul ini memproses seluruh area tabel dengan pendekatan berbasis Node:
    - Setiap Node memiliki anchor_box (lokasi label/deskripsi di dokumen)
    - Sistem mencari anchor di hasil OCR menggunakan fuzzy matching
    - Setelah anchor ditemukan, sistem mengambil nilai dari kotak "values"
      dengan menerapkan offset relatif terhadap posisi anchor yang ditemukan
    - Mendukung hirarki: Category → Item → Parent Item → Sub-Item

Struktur grup dynamic_table yang didukung:
{
    "group_type": "dynamic_table",
    "group_key": "checklist",
    "group_anchor": "Nama Tabel",
    "columns": [...],
    "nodes": [
        {
            "node_type": "category",
            "label": "Visual Check",
            "no": 1,
            "children": [
                {
                    "node_type": "item",
                    "label": "Environment Condition",
                    "sub": "a",
                    "anchor_box": { x, y, w, h },
                    "anchor_keyword": "Environment",
                    "values": {
                        "result":   { "box": {x,y,w,h}, "text_type": "handwritten", "multi_line": false },
                        "standard": { "box": {x,y,w,h}, "text_type": "printed",     "multi_line": false },
                        "status":   { "box": {x,y,w,h}, "text_type": "handwritten", "multi_line": false }
                    }
                }
            ]
        }
    ]
}
"""

import logging
from typing import Any
import numpy as np
from app.utils.fuzzy_matcher import find_best_anchor_match, OcrResult
from config.settings import ANCHOR_FUZZY_THRESHOLD, CROP_MARGIN

logger = logging.getLogger(__name__)

# Type alias
MatLike = np.ndarray[Any, np.dtype[Any]]  # pyright: ignore[reportAny]


def _crop_region(image: MatLike, box: dict, anchor_offset_x: int = 0, anchor_offset_y: int = 0) -> MatLike | None:
    """
    Crop area gambar berdasarkan box konfigurasi.
    Jika anchor ditemukan di posisi berbeda dari konfigurasi awal,
    `anchor_offset_x/y` digunakan untuk menggeser posisi crop.

    Args:
        image: Gambar dokumen numpy array.
        box: Dict {x, y, width, height} dari konfigurasi.
        anchor_offset_x: Selisih posisi X anchor ditemukan vs konfigurasi.
        anchor_offset_y: Selisih posisi Y anchor ditemukan vs konfigurasi.

    Returns:
        Numpy array hasil crop, atau None jika area tidak valid.
    """
    img_h, img_w = image.shape[:2]

    x = max(0, int(box["x"] + anchor_offset_x) - CROP_MARGIN)
    y = max(0, int(box["y"] + anchor_offset_y) - CROP_MARGIN)
    w = min(int(box["width"]) + CROP_MARGIN * 2, img_w - x)
    h = min(int(box["height"]) + CROP_MARGIN * 2, img_h - y)

    if w <= 0 or h <= 0:
        return None

    return image[y:y+h, x:x+w]


def _ocr_region(region: MatLike | None, text_type: str, ocr_fn: Any) -> str:
    """
    Jalankan OCR pada region yang diberikan.

    Args:
        region: Numpy array area gambar.
        text_type: "handwritten" atau "printed".
        ocr_fn: Fungsi OCR yang menerima (region, text_type) -> str.

    Returns:
        String hasil OCR, atau "" jika region kosong.
    """
    if region is None or region.size == 0:
        return ""
    return ocr_fn(region, text_type)


def _process_node(
    node: dict,
    image: MatLike,
    ocr_results: OcrResult,
    ocr_fn: Any,
) -> dict | None:
    """
    Proses satu node (item atau sub_item) dan ekstrak nilai-nilainya.

    Alur:
    1. Cari anchor_box di OCR results menggunakan anchor_keyword (fuzzy matching).
    2. Hitung offset antara anchor yang dikonfigurasi vs yang ditemukan di dokumen.
    3. Crop setiap value box dengan offset tersebut.
    4. Jalankan OCR pada setiap crop.

    Args:
        node: Dict konfigurasi node.
        image: Gambar dokumen.
        ocr_results: Hasil OCR seluruh halaman.
        ocr_fn: Fungsi OCR (handwritten/printed router).

    Returns:
        Dict berisi hasil ekstraksi, atau None jika anchor tidak ditemukan.
    """
    node_type = node.get("node_type", "item")
    anchor_box = node.get("anchor_box")
    anchor_keyword = node.get("anchor_keyword", "").strip()
    values_config = node.get("values", {})

    # ── Hitung Offset Anchor ────────────────────────────────────────
    offset_x = 0
    offset_y = 0

    if anchor_keyword and ocr_results and anchor_box:
        # Cari anchor di dokumen via fuzzy matching
        found = find_best_anchor_match(
            ocr_results,
            anchor_keyword,
            threshold=ANCHOR_FUZZY_THRESHOLD
        )
        if found:
            # Hitung selisih dari posisi konfigurasi ke posisi yang ditemukan
            offset_x = found[0] - int(anchor_box.get("x", 0))
            offset_y = found[1] - int(anchor_box.get("y", 0))
            logger.info(
                f"[TableExtractor] Anchor '{anchor_keyword}' ditemukan, "
                f"offset: ({offset_x}, {offset_y})"
            )
        else:
            logger.warning(
                f"[TableExtractor] Anchor '{anchor_keyword}' tidak ditemukan. "
                f"Menggunakan koordinat absolut dari konfigurasi."
            )
    else:
        logger.info(
            f"[TableExtractor] Node '{node.get('label')}' tidak punya keyword. "
            f"Menggunakan koordinat absolut."
        )

    # ── Ekstraksi Nilai ─────────────────────────────────────────────
    extracted_values: dict[str, Any] = {}

    for value_key, value_config in values_config.items():
        box = value_config.get("box")
        if not box:
            extracted_values[value_key] = ""
            continue

        text_type = value_config.get("text_type", "printed")
        multi_line = value_config.get("multi_line", False)

        region = _crop_region(image, box, offset_x, offset_y)
        raw_text = _ocr_region(region, text_type, ocr_fn)

        if multi_line and raw_text:
            # Pisahkan teks multi-baris menjadi array (split per newline)
            lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
            extracted_values[value_key] = lines if len(lines) > 1 else (lines[0] if lines else "")
        else:
            extracted_values[value_key] = raw_text

    return {
        "node_type": node_type,
        "label": node.get("label", ""),
        "sub": node.get("sub"),
        "extracted_values": extracted_values,
    }


def _process_category(
    category_node: dict,
    image: MatLike,
    ocr_results: OcrResult,
    ocr_fn: Any,
) -> dict:
    """
    Proses satu kategori beserta seluruh anak-anaknya secara rekursif.

    Returns:
        Dict berisi { no, category, items: [...] }
    """
    items_result = []

    for child in category_node.get("children", []):
        child_type = child.get("node_type", "item")

        if child_type == "item":
            result = _process_node(child, image, ocr_results, ocr_fn)
            if result:
                items_result.append({
                    "sub": child.get("sub"),
                    "description": child.get("label", ""),
                    **result["extracted_values"],
                })

        elif child_type == "parent_item":
            # Parent item tidak memiliki nilai sendiri, hanya punya children
            sub_items_result = []
            for sub_child in child.get("children", []):
                sub_result = _process_node(sub_child, image, ocr_results, ocr_fn)
                if sub_result:
                    sub_items_result.append({
                        "label": sub_child.get("label", ""),
                        **sub_result["extracted_values"],
                    })

            items_result.append({
                "sub": child.get("sub"),
                "description": child.get("label", ""),
                "sub_items": sub_items_result,
            })

    return {
        "no": category_node.get("no", 0),
        "category": category_node.get("label", ""),
        "items": items_result,
    }


def _get_anchor_y(node: dict) -> float:
    """Ambil posisi Y dari anchor_box node untuk keperluan sorting."""
    box = node.get("anchor_box")
    if box:
        return float(box.get("y", 0))
    return float("inf")  # Node tanpa anchor ditaruh paling bawah


def extract_dynamic_table(
    image: MatLike,
    group_config: dict,
    ocr_results: OcrResult,
    ocr_fn: Any,
) -> list[dict]:
    """
    Fungsi utama ekstraksi untuk grup bertipe "dynamic_table".

    Mengiterasi semua nodes di group_config, memproses setiap node
    sesuai tipenya (category, item, parent_item, sub_item), dan
    mengembalikan list hasil ekstraksi yang sudah terstruktur.

    Kategori diurutkan otomatis berdasarkan posisi Y anchor_box
    (dari atas ke bawah di dokumen), sehingga admin tidak perlu
    mengisi nomor urut secara manual.

    Args:
        image: Gambar dokumen numpy array.
        group_config: Dict konfigurasi grup (dari mapping_config di database).
        ocr_results: Hasil OCR seluruh halaman dari PaddleOCR.
        ocr_fn: Fungsi router OCR hybrid(region, text_type) -> str.

    Returns:
        List berisi dict hierarki: [{ no, category, items: [...] }]
    """
    nodes = group_config.get("nodes", [])
    results = []

    logger.info(
        f"[TableExtractor] Memproses grup tabel '{group_config.get('group_anchor')}' "
        f"dengan {len(nodes)} node root."
    )

    # ── Auto-sort kategori berdasarkan posisi Y anchor (atas → bawah) ──
    category_nodes = [n for n in nodes if n.get("node_type") == "category"]
    non_category_nodes = [n for n in nodes if n.get("node_type") != "category"]

    category_nodes_sorted = sorted(category_nodes, key=_get_anchor_y)

    # Auto-assign nomor urut berdasarkan hasil sort posisi Y
    for auto_no, cat_node in enumerate(category_nodes_sorted, start=1):
        cat_node["no"] = auto_no
        logger.info(
            f"[TableExtractor] Kategori '{cat_node.get('label')}' "
            f"→ No. {auto_no} (Y={_get_anchor_y(cat_node):.0f}px)"
        )

    # Susun ulang nodes: kategori yang sudah terurut + non-kategori
    ordered_nodes = category_nodes_sorted + non_category_nodes

    for node in ordered_nodes:
        node_type = node.get("node_type", "")

        if node_type == "category":
            category_result = _process_category(node, image, ocr_results, ocr_fn)
            results.append(category_result)

        elif node_type == "item":
            # Node item di root level (tanpa kategori) — jarang terjadi
            result = _process_node(node, image, ocr_results, ocr_fn)
            if result:
                results.append({
                    "sub": node.get("sub"),
                    "description": node.get("label", ""),
                    **result["extracted_values"],
                })

        else:
            logger.warning(
                f"[TableExtractor] Node type '{node_type}' di root level tidak dikenali. Dilewati."
            )

    logger.info(
        f"[TableExtractor] Selesai. Total kategori ditemukan: {len(results)}"
    )
    return results
