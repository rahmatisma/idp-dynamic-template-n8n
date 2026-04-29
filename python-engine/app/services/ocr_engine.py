"""
app/services/ocr_engine.py
---------------------------
Orkestrator pipeline ekstraksi dokumen hybrid IDP.
"""

import logging
import cv2
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)

# ══════════════════════════════════════════════════════════════
# TAHAP 1: PREPROCESSING
# ══════════════════════════════════════════════════════════════
def perform_preprocessing(image_path: str):
    image = cv2.imread(image_path)
    if image is None:
        return None
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return gray

import requests
from rapidfuzz import fuzz
from app.services.ocr_service import read_header, get_ocr_instance
from app.services.template_mapper import find_anchor, calculate_target_box, get_text_in_bbox
from app.services.field_extractor import extract_fields
from app.services.table_extractor import extract_table
from app.services.preprocessor import preprocess_image
from app.services.json_builder import build_hierarchical_json
from config.settings import LARAVEL_API_URL

# ══════════════════════════════════════════════════════════════
# DATA SOURCE: FETCH TEMPLATES FROM LARAVEL
# ══════════════════════════════════════════════════════════════
def fetch_active_templates():
    """
    Mengambil daftar template aktif dari API Laravel secara mandiri.
    """
    url = f"{LARAVEL_API_URL}/api/templates"
    
    try:
        logger.info(f"[Fetcher] Target: {url}")
        # verify=False buat lingkungan lokal yang pake https/self-signed cert
        response = requests.get(url, timeout=5, verify=False)
        
        if response.status_code == 200:
            data = response.json()
            templates = data.get('data', [])
            logger.info(f"[Fetcher] Berhasil! Dapat {len(templates)} template.")
            if len(templates) > 0:
                for t in templates:
                    logger.info(f"  - Template: {t.get('type_name')} | ID: {t.get('identifier_text')}")
            else:
                logger.warning("[Fetcher] Laravel kasih data 200 OK tapi list template-nya KOSONG.")
            return templates
        else:
            logger.error(f"[Fetcher] Gagal! Laravel jawab status {response.status_code}")
            return []
    except Exception as e:
        logger.error(f"[Fetcher] ERROR KONEKSI: Tidak bisa nyambung ke {url}. Pesan: {str(e)}")
        return []

# ══════════════════════════════════════════════════════════════
# TAHAP 2: GLOBAL OCR SCAN (1x per halaman)
# ══════════════════════════════════════════════════════════════
def run_global_ocr(image_path: str) -> list:
    """
    Jalankan PaddleOCR pada seluruh halaman SATU KALI.
    Normalize output menjadi list [{text, x, y, w, h, confidence}]
    yang bisa dipakai ulang oleh field_extractor dan table_extractor.
    """
    ocr = get_ocr_instance()
    raw = ocr.ocr(image_path, cls=True)
    results = []

    if not raw or not raw[0]:
        return results

    for line in raw[0]:
        box, (text, confidence) = line
        # box = [[x1,y1],[x2,y1],[x2,y2],[x1,y2]]
        xs = [pt[0] for pt in box]
        ys = [pt[1] for pt in box]
        x = int(min(xs))
        y = int(min(ys))
        w = int(max(xs) - x)
        h = int(max(ys) - y)
        results.append({
            'text':       text,
            'x':          x,
            'y':          y,
            'w':          w,
            'h':          h,
            'confidence': float(confidence)
        })

    logger.info(f"[GlobalOCR] {len(results)} item teks ditemukan.")
    return results

# ══════════════════════════════════════════════════════════════
# DETEKSI TEMPLATE (Auto-Detect)
# ══════════════════════════════════════════════════════════════
def detect_template(image_path: str, all_templates: list) -> dict:
    """
    Mencari identifier text di area header menggunakan Fuzzy Matching.
    Taktis: Menggunakan gabungan Judul + No Dokumen agar lebih akurat.
    """
    header_data = read_header(image_path)
    if not header_data:
        return {"template": None, "score": 0, "status": "unknown", "header": ""}

    # Gabungkan Title dan Doc Number untuk pencarian yang lebih luas
    title = header_data.get('title', '')
    doc_no = header_data.get('doc_number', '')
    searchable_text = f"{title} {doc_no}".strip()
    
    if not searchable_text:
        return {"template": None, "score": 0, "status": "unknown", "header": ""}

    logger.info(f"[Auto-Detect] Analyzing Header: '{searchable_text[:50]}...'")
    
    best_template = None
    highest_score = 0

    for t in all_templates:
        identifier = t.get('identifier_text')
        if not identifier:
            continue
            
        # Strategi Dua Lapis: Tahan Typo + Tahan Urutan Terbalik
        score = max(
            fuzz.partial_ratio(identifier.lower(), searchable_text.lower()),
            fuzz.token_sort_ratio(identifier.lower(), searchable_text.lower())
        )
        
        if score > highest_score:
            highest_score = score
            best_template = t

    # Sistem Kasta Status (Realistis)
    status = "unknown"
    if highest_score >= 80:
        status = "matched"
    elif highest_score >= 60:
        status = "low_confidence"

    if best_template:
        logger.info(f"[Auto-Detect] Result: {status.upper()} (Best Score: {highest_score:.1f} against '{best_template.get('type_name')}')")
    else:
        logger.warning(f"[Auto-Detect] No template matched. Highest score was {highest_score:.1f}")

    return {
        "template": best_template,
        "score": highest_score,
        "status": status,
        "header": searchable_text
    }

# ══════════════════════════════════════════════════════════════
# ADAPTER: Konversi format field_extractor → format json_builder
# ══════════════════════════════════════════════════════════════

# Field yang masuk ke section "document" (metadata dokumen)
_DOCUMENT_FIELDS = {'no_dok', 'versi', 'hal', 'label', 'reg_number'}

def _fields_to_fixed_results(fields_data: dict) -> list:
    """
    Konversi flat dict dari field_extractor ke format yang json_builder harapkan.
    Field dipisah ke dua grup: 'document' (metadata) dan 'header' (info lapangan).
    """
    doc_fields    = []
    header_fields = []

    for key, value in fields_data.items():
        entry = {"field_key": key, "extracted_values": {"result": value}}
        if key in _DOCUMENT_FIELDS:
            doc_fields.append(entry)
        else:
            header_fields.append(entry)

    results = []
    if doc_fields:
        results.append({"group_key": "document", "group_name": "Document", "fields": doc_fields})
    if header_fields:
        results.append({"group_key": "header", "group_name": "Header", "fields": header_fields})
    return results


def _tables_to_table_results(tables_data: dict) -> list:
    """
    Konversi dict tabel dari table_extractor ke format yang json_builder harapkan.
    """
    results = []
    for key, rows in tables_data.items():
        results.append({
            "group_key":  key,
            "group_name": key.replace('_', ' ').title(),
            "data":       rows
        })
    return results


# ══════════════════════════════════════════════════════════════
# ORKESTRATOR UTAMA
# ══════════════════════════════════════════════════════════════
def extract_document(pdf_path: str, template_code: str = None, document_id: int = None, all_templates: list = None) -> dict:
    """
    Fungsi utama untuk menjalankan ekstraksi per halaman dengan output yang kaya.
    """
    logger.info(f"--- Memulai Ekstraksi ID #{document_id} ---")

    # JEMPUT BOLA: Jika n8n tidak kasih template, cari sendiri ke Laravel
    if not all_templates:
        all_templates = fetch_active_templates()

    from app.services.pdf_converter import convert_if_not_exists
    images = convert_if_not_exists(pdf_path)
    if not images:
        raise ValueError("PDF tidak menghasilkan gambar.")

    results_per_page = []

    for i, img_path in enumerate(images):
        page_num = i + 1
        logger.info(f"[Page {page_num}] Processing...")

        # Deteksi Template (Taktis)
        match_result = detect_template(str(img_path), all_templates)
        selected_template = match_result['template']
        
        if match_result['status'] == "unknown":
            results_per_page.append({
                "page": page_num,
                "header": match_result['header'],
                "status": "failed",
                "error": "Template tidak dikenali (Score < 60%)",
                "confidence": 0
            })
            continue

        # ── Ekstraksi Data Nyata ──────────────────────────────────
        # 1. Preprocess: Bersihkan gambar dulu (CLAHE + denoise)
        clean_img_path = preprocess_image(str(img_path))

        # 2. Global OCR: Scan gambar yang sudah bersih — SATU KALI
        ocr_results = run_global_ocr(clean_img_path)

        # 2. Ambil mapping_config dari template yang terdeteksi
        mapping_config = selected_template.get('mapping_config', {})
        fields_config  = mapping_config.get('fields', [])
        tables_config  = mapping_config.get('tables', [])

        # 3. Ekstrak field header — printed via global OCR, handwritten via TrOCR crop
        fields_data = extract_fields(ocr_results, fields_config, image_path=clean_img_path)

        # 4. Ekstrak tiap tabel (group_by_y + split_by_x, TANPA OCR ulang)
        tables_data = {}
        for table_cfg in tables_config:
            anchor_texts = table_cfg.get('anchor', {}).get('texts', [])
            anchor_text  = anchor_texts[0] if anchor_texts else ''
            anchor       = find_anchor(ocr_results, anchor_text) if anchor_text else None
            rows         = extract_table(ocr_results, table_cfg, anchor, image_path=clean_img_path)
            tables_data[table_cfg.get('json_key', table_cfg.get('table_name'))] = rows

        # 5. Susun output terstruktur via json_builder
        fixed_results  = _fields_to_fixed_results(fields_data)
        table_results  = _tables_to_table_results(tables_data)
        structured_out = build_hierarchical_json(fixed_results, table_results)

        results_per_page.append({
            "page":          page_num,
            "status":        match_result['status'],
            "confidence":    match_result['score'],
            "template_id":   selected_template.get('id'),
            "template_name": selected_template.get('type_name'),
            "header":        match_result['header'],
            "fields":        structured_out,  # ← sudah terstruktur via json_builder
            "tables":        tables_data       # ← raw table rows untuk akses langsung
        })

    # Summary
    all_scores = [p['confidence'] for p in results_per_page if 'confidence' in p]
    avg_confidence = sum(all_scores) / len(all_scores) if all_scores else 0

    return {
        "status": "ok",
        "document_id": document_id,
        "confidence_score": avg_confidence,
        "pages": results_per_page,
        "total_pages": len(images)
    }