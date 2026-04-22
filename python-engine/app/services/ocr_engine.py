"""
app/services/ocr_engine.py
---------------------------
Orkestrator pipeline ekstraksi dokumen hybrid IDP.

Pipeline terdiri dari 5 tahap:
    1. Preprocessing
    2. Deteksi Anchor & Template Mapping (Dynamic Mapping)
    3. Hybrid Decision Logic (Cetak vs Tulis)
    4. Character Recognition (PaddleOCR / TrOCR)
    5. JSON Structuring

Mendukung dua tipe grup:
    - "fixed": Pemetaan field-by-field menggunakan anchor + offset
    - "dynamic_table": Pemetaan tabel hirarkis berbasis node + kolom

Lihat:
    - app/services/template_mapper.py  → logika untuk "fixed"
    - app/services/table_extractor.py  → logika untuk "dynamic_table"
    - app/services/json_builder.py     → assembly JSON akhir
"""

import logging
from typing import Any
import cv2
import numpy as np

from app.services.template_mapper import FieldConfig
from app.services.table_extractor import extract_dynamic_table
from app.services.rule_based_extractor import process_rule_based_table
from app.services.json_builder import build_hierarchical_json

logger = logging.getLogger(__name__)

# Type alias
MatLike = np.ndarray[Any, np.dtype[Any]]  # pyright: ignore[reportAny]


# ══════════════════════════════════════════════════════════════
# TAHAP 1: PREPROCESSING
# ══════════════════════════════════════════════════════════════
def perform_preprocessing(image_path: str) -> MatLike:
    """
    Tahap 1: Preprocessing (Grayscale & Noise Reduction).

    Args:
        image_path: Path ke file PNG dokumen.

    Returns:
        Gambar terproses sebagai numpy array grayscale.
    """
    logger.info(f"[Tahap 1] Preprocessing citra: {image_path}")
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Gagal memuat gambar: {image_path}")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    return blurred


# ══════════════════════════════════════════════════════════════
# TAHAP 2: TEMPLATE MAPPING (untuk grup "fixed")
# ══════════════════════════════════════════════════════════════
def perform_detection_and_mapping(image: MatLike, field_conf: FieldConfig) -> list[dict]:
    """
    Tahap 2: Text Detection & Dynamic Template Mapping (Persamaan 2.5).
    Digunakan khusus untuk grup bertipe "fixed".

    Menghitung posisi crop setiap target berdasarkan offset dari anchor_box.
    Pada implementasi produksi, anchor dicari menggunakan PaddleOCR fuzzy
    matching. Di sini masih menggunakan koordinat absolut dari konfigurasi.

    Args:
        image: Gambar terproses numpy array.
        field_conf: Konfigurasi satu field dari template.

    Returns:
        List dict berisi { key, region (crop), text_type }.
    """
    logger.info(
        f"[Tahap 2] Mapping field: {field_conf.get('field_key')}"
    )

    anchor_box = field_conf.get("anchor_box")
    if not anchor_box:
        logger.warning(f"Field {field_conf.get('field_key')} tidak memiliki anchor_box.")
        return []

    # Posisi anchor di gambar (sementara pakai koordinat absolut)
    anchor_x = int(anchor_box.get("x", 0)) + 5
    anchor_y = int(anchor_box.get("y", 0)) + 2

    targets_to_extract = []

    for target in field_conf.get("targets", []):
        key = target.get("label", "value").strip().lower().replace(" ", "_")
        text_type = target.get("text_type", "printed")

        # PERSAMAAN 2.5: Translasi Vektor
        # x_target = x_anchor + offset_x
        # y_target = y_anchor + offset_y
        crop_x = max(0, int(anchor_x + target.get("offset_x", 0)))
        crop_y = max(0, int(anchor_y + target.get("offset_y", 0)))
        crop_w = min(int(target.get("width", 50)), image.shape[1] - crop_x)
        crop_h = min(int(target.get("height", 20)), image.shape[0] - crop_y)

        if crop_w <= 0 or crop_h <= 0:
            continue

        region = image[crop_y:crop_y+crop_h, crop_x:crop_x+crop_w]

        targets_to_extract.append({
            "key": key,
            "region": region,
            "text_type": text_type
        })

    return targets_to_extract


# ══════════════════════════════════════════════════════════════
# TAHAP 3 & 4: HYBRID OCR ROUTER
# ══════════════════════════════════════════════════════════════
def hybrid_ocr_router(region: MatLike, text_type: str) -> str:
    """
    Tahap 3 & 4: Hybrid Decision Logic & Character Recognition.
    Memilah dan menjalankan model AI yang paling tepat.

    Args:
        region: Gambar crop area isian (numpy array).
        text_type: "handwritten" atau "printed".

    Returns:
        String hasil OCR.
    """
    logger.info(f"[Tahap 3] Hybrid Router → mode: '{text_type}'")

    if text_type == "handwritten":
        logger.info("[Tahap 4] Menggunakan model TrOCR untuk tulisan tangan.")
        # TODO: return call_trocr_inference(region)
        return "[TULISAN TANGAN]"
    else:
        logger.info("[Tahap 4] Menggunakan model PaddleOCR untuk teks cetak.")
        # TODO: return call_paddleocr_inference(region)
        return "[TEKS CETAK]"


# ══════════════════════════════════════════════════════════════
# ORKESTRATOR UTAMA
# ══════════════════════════════════════════════════════════════
def extract_document(image_paths: list[str], template_config: list[dict]) -> dict:
    """
    Orkestrator Utama Algoritma Hybrid OCR untuk IDP.
    Meliputi ke-5 tahapan sesuai arsitektur.

    Menangani dua tipe grup:
        - "fixed": Field-by-field mapping via anchor + offset.
        - "dynamic_table": Node-based table extraction via table_extractor.

    Args:
        image_paths: List path gambar PNG per halaman dokumen.
        template_config: List grup dari mapping_config template.

    Returns:
        Dict JSON terstruktur hasil ekstraksi.
    """
    logger.info("Memulai Algoritma Ekstraksi Dokumen Hybrid IDP.")

    # Jika mapping_config dalam format Baru (Rule-Based)
    if isinstance(mapping_config, dict) and ('tables' in mapping_config or 'fields' in mapping_config):
        return _extract_rule_based(image_paths, mapping_config)

    # ELSE: Jalankan Legacy Pipeline...
    fixed_results: list[dict] = []
    table_results: list[dict] = []

    for image_path in image_paths:
        # TAHAP 1: Preprocessing
        processed_img = perform_preprocessing(image_path)
        original_img  = cv2.imread(image_path)  # Gambar asli untuk crop yang lebih akurat

        # Placeholder OCR results (PaddleOCR pada seluruh halaman)
        # TODO: ocr_results = run_paddleocr(original_img)
        ocr_results_placeholder: list = []

        for group in template_config:
            group_type = group.get("group_type", "fixed")
            group_key  = group.get("group_key", "")

            # ────────────────────────────────────────────────────
            # GRUP FIXED: Pemetaan field-by-field
            # ────────────────────────────────────────────────────
            if group_type == "fixed":
                group_extracted_fields = []

                for field in group.get("fields", []):
                    field_conf = dict(field)
                    field_conf["group_key"] = group_key

                    # TAHAP 2: Mapping
                    target_regions = perform_detection_and_mapping(processed_img, field_conf)  # type: ignore[arg-type]

                    extracted_obj: dict[str, str] = {}
                    for tr in target_regions:
                        # TAHAP 3 & 4: OCR
                        hasil_teks = hybrid_ocr_router(tr["region"], tr["text_type"])
                        extracted_obj[tr["key"]] = hasil_teks

                    group_extracted_fields.append({
                        "field_key":  field.get("field_key", ""),
                        "field_name": field.get("field_name", ""),
                        "extracted_values": extracted_obj,
                    })

                fixed_results.append({
                    "group_type": "fixed",
                    "group_key":  group_key,
                    "group_name": group.get("group_anchor", ""),
                    "fields": group_extracted_fields,
                })

            # ────────────────────────────────────────────────────
            # GRUP DYNAMIC TABLE: Node-based extraction
            # ────────────────────────────────────────────────────
            elif group_type == "dynamic_table":
                logger.info(f"[Tahap 2] Memproses dynamic_table: '{group.get('group_anchor')}'")

                # Jalankan ekstraksi berbasis node/kolom
                table_data = extract_dynamic_table(
                    image=original_img if original_img is not None else processed_img,
                    group_config=group,
                    ocr_results=ocr_results_placeholder,
                    ocr_fn=hybrid_ocr_router,
                )

                table_results.append({
                    "group_type": "dynamic_table",
                    "group_key":  group_key,
                    "group_name": group.get("group_anchor", ""),
                    "data": table_data,  # List category results
                })

            else:
                logger.warning(f"Group type '{group_type}' tidak dikenali. Dilewati.")

    # TAHAP 5: Structuring — Susun semua hasil ke JSON hirarkis
    logger.info("[Tahap 5] Menyusun data ke format JSON Hierarkis.")
    final_output = build_hierarchical_json(fixed_results, table_results)

    return final_output


def _extract_rule_based(image_paths: list[str], config: dict) -> dict:
    """
    Internal orkestrator untuk format Rule-Based baru.
    """
    results = {
        "fields": {},
        "tables": {}
    }
    
    # PaddleOCR full page placeholder (nanti ditarik dari service sesungguhnya)
    # ocr_results = run_full_page_ocr(image_paths[0])
    ocr_results: list = [] 

    for table_cfg in config.get('tables', []):
        t_key = table_cfg.get('key', 'table')
        # TAHAP 2: Rule-Based Extraction
        table_data = process_rule_based_table(None, table_cfg, ocr_results, hybrid_ocr_router)
        results["tables"][t_key] = table_data

    # Dummy confidence score
    return {
        "confidence_score": 95.0,
        "extracted_data": results
    }