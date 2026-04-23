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

from rapidfuzz import fuzz
from app.services.ocr_service import read_header

# ══════════════════════════════════════════════════════════════
# DETEKSI TEMPLATE (Auto-Detect)
# ══════════════════════════════════════════════════════════════
def detect_template(image_path: str, all_templates: list) -> dict:
    """
    Mencari identifier text di area header menggunakan Fuzzy Matching.
    Taktis: Menggunakan max(partial_ratio, token_sort_ratio).
    """
    header_text = read_header(image_path)
    if not header_text:
        return {"template": None, "score": 0, "status": "unknown", "header": ""}

    logger.info(f"[Auto-Detect] Analyzing Header: '{header_text[:50]}...'")
    
    best_template = None
    highest_score = 0

    for t in all_templates:
        identifier = t.get('identifier_text')
        if not identifier:
            continue
            
        # Strategi Dua Lapis: Tahan Typo + Tahan Urutan Terbalik
        score = max(
            fuzz.partial_ratio(identifier.lower(), header_text.lower()),
            fuzz.token_sort_ratio(identifier.lower(), header_text.lower())
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
        logger.info(f"[Auto-Detect] Result: {status.upper()} (Score: {highest_score:.1f})")

    return {
        "template": best_template,
        "score": highest_score,
        "status": status,
        "header": header_text
    }

# ══════════════════════════════════════════════════════════════
# ORKESTRATOR UTAMA
# ══════════════════════════════════════════════════════════════
def extract_document(pdf_path: str, template_code: str = None, document_id: int = None, all_templates: list = None) -> dict:
    """
    Fungsi utama untuk menjalankan ekstraksi per halaman dengan output yang kaya.
    """
    logger.info(f"--- Memulai Ekstraksi ID #{document_id} ---")

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
                "error": "Template tidak dikenali (Score < 60%)"
            })
            continue

        # [DUMMY] Ekstraksi Data (Step 7 kita isi logika benerannya)
        results_per_page.append({
            "page": page_num,
            "header": match_result['header'],
            "status": match_result['status'], # matched / low_confidence
            "template_id": selected_template.get('id'),
            "template_name": selected_template.get('type_name'),
            "confidence": match_result['score'],
            "extracted_data": {
                "message": f"Halaman {page_num} terdeteksi sebagai {selected_template.get('type_name')}",
                "dummy_fields": {} # Diisi di Step 7-9
            }
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