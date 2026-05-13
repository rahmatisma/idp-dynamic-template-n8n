"""
app/services/ocr_engine.py
---------------------------
Orkestrator pipeline ekstraksi dokumen hybrid IDP.
"""

import logging
import re
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
    Mengambil daftar template aktif langsung dari Supabase.
    Wajib pakai Supabase karena Colab tidak bisa akses Laravel lokal.
    """
    from config.settings import SUPABASE_URL, SUPABASE_KEY

    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.warning("[Fetcher] Kredensial Supabase tidak dikonfigurasi di .env!")
        return []

    url = f"{SUPABASE_URL}/rest/v1/document_templates?is_active=eq.true&select=*"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }

    try:
        logger.info(f"[Fetcher] Mengambil template dari Supabase...")
        response = requests.get(url, headers=headers, timeout=10)

        if response.status_code == 200:
            templates = response.json()
            logger.info(f"[Fetcher] ✅ Berhasil! Dapat {len(templates)} template dari Supabase.")
            for t in templates:
                logger.info(f"  - {t.get('type_name')} | identifier: '{t.get('identifier_text')}'")
            return templates
        else:
            logger.error(f"[Fetcher] ❌ Supabase jawab status {response.status_code}: {response.text[:100]}")
            return []
    except Exception as e:
        logger.error(f"[Fetcher] ❌ ERROR KONEKSI ke Supabase: {str(e)}")
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
    Deteksi template via composite key (suffix no. dok + judul ternormalisasi).
    3 level: exact composite → suffix+fuzzy judul → fuzzy lama.
    """
    header_data = read_header(image_path)
    if not header_data:
        return {"template": None, "score": 0, "status": "unknown", "header": ""}

    title  = header_data.get('title', '')
    doc_no = header_data.get('doc_number') or ''
    searchable_text = f"{title} {doc_no}".strip()

    if not searchable_text:
        return {"template": None, "score": 0, "status": "unknown", "header": ""}

    logger.info(f"[Auto-Detect] Header raw → title='{title}' | doc_no='{doc_no}'")

    # Helper: ambil 3 digit terakhir dari string no. dok
    def _suffix(s: str):
        m = re.search(r'(\d{3})\D*$', (s or '').strip())
        return m.group(1) if m else None

    # Helper: hapus angka dan spasi di akhir judul
    def _norm_title(s: str) -> str:
        return re.sub(r'[\s\d]+$', '', s or '').strip()

    # ── STEP 1: Suffix no. dok dari header ────────────────────────────────
    suffix_header = _suffix(doc_no)
    logger.info(f"[Auto-Detect] STEP 1 - suffix header: '{suffix_header}' (dari doc_no='{doc_no}')")

    # ── STEP 2: Normalisasi judul dari header ─────────────────────────────
    title_norm = _norm_title(title)
    logger.info(f"[Auto-Detect] STEP 2 - title normalized: '{title_norm}' (dari title='{title}')")

    # ── STEP 3: Composite key header ──────────────────────────────────────
    ck_header = f"{suffix_header}_{title_norm}" if suffix_header else None
    logger.info(f"[Auto-Detect] STEP 3 - composite_key_header: '{ck_header}'")

    # ── STEP 5 LEVEL 1: Exact composite key match ─────────────────────────
    if ck_header:
        for t in all_templates:
            t_suffix = _suffix(t.get('identifier_text', ''))
            t_title  = _norm_title(t.get('type_name', ''))
            ck_template = f"{t_suffix}_{t_title}" if t_suffix else None
            logger.debug(f"[Auto-Detect] L1 → header='{ck_header}' vs template='{ck_template}' ({t.get('type_name')})")
            if ck_template and ck_header == ck_template:
                logger.info(f"[Auto-Detect] LEVEL 1 EXACT MATCH → '{t.get('type_name')}' | composite='{ck_template}'")
                return {"template": t, "score": 100, "status": "matched", "header": searchable_text}

    # ── STEP 5 LEVEL 2: Suffix only, fuzzy judul tertinggi ───────────────
    if suffix_header:
        candidates = []
        for t in all_templates:
            t_suffix = _suffix(t.get('identifier_text', ''))
            if t_suffix != suffix_header:
                continue
            t_title = _norm_title(t.get('type_name', ''))
            title_score = max(
                fuzz.partial_ratio(title_norm.lower(), t_title.lower()),
                fuzz.token_sort_ratio(title_norm.lower(), t_title.lower()),
            )
            logger.debug(f"[Auto-Detect] L2 suffix='{suffix_header}' match → '{t.get('type_name')}' title_score={title_score}")
            candidates.append((t, title_score))

        if candidates:
            best_t, best_score = max(candidates, key=lambda x: x[1])
            logger.info(f"[Auto-Detect] LEVEL 2 SUFFIX MATCH → '{best_t.get('type_name')}' (title_score={best_score})")
            return {"template": best_t, "score": best_score, "status": "low_confidence", "header": searchable_text}

    # ── STEP 5 LEVEL 3: Fallback fuzzy lama ──────────────────────────────
    logger.info(f"[Auto-Detect] STEP 5 LEVEL 3 - Fallback fuzzy (title+doc_no vs identifier_text)...")
    best_template = None
    highest_score = 0
    for t in all_templates:
        identifier = t.get('identifier_text')
        if not identifier:
            continue
        score = max(
            fuzz.partial_ratio(identifier.lower(), searchable_text.lower()),
            fuzz.token_sort_ratio(identifier.lower(), searchable_text.lower()),
        )
        logger.debug(f"[Auto-Detect] L3 fuzzy → '{t.get('type_name')}' score={score}")
        if score > highest_score:
            highest_score = score
            best_template = t

    if highest_score >= 60:
        logger.info(f"[Auto-Detect] LEVEL 3 FUZZY MATCH → '{best_template.get('type_name')}' (score={highest_score})")
        return {"template": best_template, "score": highest_score, "status": "low_confidence", "header": searchable_text}

    logger.warning(f"[Auto-Detect] SEMUA LEVEL GAGAL. Highest fuzzy score={highest_score}")
    return {"template": None, "score": highest_score, "status": "unknown", "header": searchable_text}

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
    # JEMPUT BOLA: Jika n8n tidak kasih template, cari sendiri ke Supabase
    if not all_templates:
        all_templates = fetch_active_templates()

    # FALLBACK SAKTI: Jika di database cuma ada 1 template aktif, langsung pakai itu tanpa nebak-nebak!
    if not template_code and all_templates and len(all_templates) == 1:
        template_code = all_templates[0].get("template_code")
        logger.info(f"[Auto-Bypass] Hanya ada 1 template di DB. Langsung menggunakan: {template_code}")

    from app.services.pdf_converter import convert_if_not_exists
    images = convert_if_not_exists(pdf_path)
    if not images:
        raise ValueError("PDF tidak menghasilkan gambar.")

    results_per_page = []

    for i, img_path in enumerate(images):
        page_num = i + 1
        logger.info(f"[Page {page_num}] Processing...")

        # 1. Preprocess: Bersihkan gambar dulu (CLAHE + denoise) SEBELUM DETEKSI TEMPLATE
        from app.services.preprocessor import preprocess_image
        clean_img_path = preprocess_image(str(img_path))

        selected_template = None
        match_result = {"status": "matched", "score": 100, "header": "Manual Bypass (template_code dikirim langsung)"}

        # 2. Jika n8n/Laravel memberikan template_code secara spesifik (Manual Mode)
        if template_code:
            for t in all_templates:
                if t.get("template_code") == template_code:
                    selected_template = t
                    break
            if not selected_template:
                match_result = {"status": "unknown", "score": 0, "header": "None"}
        else:
            # 3. Jika tidak ada template_code, gunakan Auto-Detect pada gambar yang sudah bersih
            match_result = detect_template(str(clean_img_path), all_templates)
            selected_template = match_result.get('template')

        if not selected_template or match_result['status'] == "unknown":
            results_per_page.append({
                "page": page_num,
                "header": match_result.get('header', 'None'),
                "status": "failed",
                "error": "Template tidak dikenali (Score < 60%)",
                "confidence": 0
            })
            continue

        # ── Ekstraksi Data Nyata ──────────────────────────────────
        # (Gambar sudah dibersihkan di atas)

        # 4. Global OCR: Scan gambar yang sudah bersih — SATU KALI
        ocr_results = run_global_ocr(clean_img_path)

        # ── Hitung kualitas baca OCR dari PaddleOCR word confidence ─────────
        # Dihitung SEKARANG dari global scan; nanti akan digabung dengan
        # TrOCR table-confidence setelah tabel diekstrak.
        word_confidences = [
            item['confidence'] * 100 for item in ocr_results
            if item.get('confidence') is not None
        ]
        paddle_avg = round(sum(word_confidences) / len(word_confidences), 1) if word_confidences else 0.0
        logger.info(
            f"[Page {page_num}] PaddleOCR avg confidence: {paddle_avg:.1f}% "
            f"({len(word_confidences)} kata) | Template match: {match_result['score']:.0f}%"
        )

        # 2. Ambil mapping_config dari template yang terdeteksi
        mapping_config = selected_template.get('mapping_config', {})
        fields_config  = mapping_config.get('fields', [])
        tables_config  = mapping_config.get('tables', [])

        # 3. Ekstrak field header — printed via global OCR, handwritten via TrOCR crop
        fields_data = extract_fields(ocr_results, fields_config, image_path=clean_img_path)

        # 4. Ekstrak tiap tabel (group_by_y + split_by_x, TANPA OCR ulang)
        tables_data      = {}
        table_confidences = []  # confidence per tabel untuk rata-rata akhir
        for table_cfg in tables_config:
            anchor_texts = table_cfg.get('anchor', {}).get('texts', [])
            anchor_text  = anchor_texts[0] if anchor_texts else ''
            anchor       = find_anchor(ocr_results, anchor_text) if anchor_text else None
            rows, tbl_conf = extract_table(ocr_results, table_cfg, anchor, image_path=clean_img_path)
            table_key = table_cfg.get('json_key', table_cfg.get('table_name'))
            tables_data[table_key] = rows
            if tbl_conf is not None:
                table_confidences.append(tbl_conf)

        # 5. Susun output terstruktur via json_builder
        fixed_results  = _fields_to_fixed_results(fields_data)
        table_results  = _tables_to_table_results(tables_data)
        structured_out = build_hierarchical_json(fixed_results, table_results)

        # ── Gabungkan PaddleOCR avg + TrOCR table confidence ─────────────
        # Jika ada data dari tabel (yang mencakup TrOCR handwritten):
        #   ocr_confidence = rata-rata tertimbang paddle (bobot 40%) + tabel (bobot 60%)
        # Alasan: tabel = isian utama dokumen → lebih representatif dari kata-kata umum
        if table_confidences:
            tbl_avg = round(sum(table_confidences) / len(table_confidences), 1)
            ocr_confidence = round(paddle_avg * 0.4 + tbl_avg * 0.6, 1)
            logger.info(
                f"[Page {page_num}] OCR confidence: {ocr_confidence:.1f}% "
                f"(paddle={paddle_avg}% × 40% + tabel={tbl_avg}% × 60%)"
            )
        else:
            ocr_confidence = paddle_avg
            logger.info(f"[Page {page_num}] OCR confidence: {ocr_confidence:.1f}% (paddle only, tidak ada tabel)")

        results_per_page.append({
            "page":                 page_num,
            "status":               match_result['status'],
            "confidence":           ocr_confidence,        # ← kualitas baca (PaddleOCR + TrOCR blended)
            "template_match_score": match_result['score'],  # ← kecocokan header ke template
            "template_id":          selected_template.get('id'),
            "template_name":        selected_template.get('type_name'),
            "header":               match_result['header'],
            "fields":               structured_out,
            "tables":               tables_data
        })

    # ── Summary: hitung rata-rata OCR confidence seluruh halaman ────
    # confidence di sini = kualitas baca OCR (PaddleOCR per-kata), BUKAN template match
    all_ocr_scores  = [p['confidence'] for p in results_per_page if 'confidence' in p]
    avg_ocr_score   = round(sum(all_ocr_scores) / len(all_ocr_scores), 1) if all_ocr_scores else 0.0

    all_match_scores = [p.get('template_match_score', 0) for p in results_per_page]
    avg_match_score  = round(sum(all_match_scores) / len(all_match_scores), 1) if all_match_scores else 0.0

    return {
        "status":                "ok",
        "document_id":           document_id,
        "confidence_score":      avg_ocr_score,    # ← kualitas baca OCR (yang dikirim ke Laravel)
        "template_match_score":  avg_match_score,  # ← kecocokan template (informasi tambahan)
        "pages":                 results_per_page,
        "total_pages":           len(images)
    }