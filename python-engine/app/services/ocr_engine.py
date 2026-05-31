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
from app.services.ocr_service import read_header, get_ocr_instance, _ocr_lock
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
    import time
    import app.services.ocr_service as ocr_svc

    max_retry = 3
    last_error = None
    raw = None
    for attempt in range(max_retry):
        try:
            ocr = get_ocr_instance()
            with _ocr_lock:
                raw = ocr.ocr(image_path, cls=True)
            break
        except RuntimeError as e:
            last_error = e
            if "could not execute a primitive" in str(e):
                logger.warning(f"[OCR] MKL error attempt {attempt+1}/{max_retry}, reset...")
                with _ocr_lock:
                    ocr_svc._ocr = None
                time.sleep(2)
                continue
            else:
                raise
    else:
        raise last_error

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
    Deteksi template via composite key 4-level:
      L1: Exact (suffix No.Dok + nama + versi)  → score 100, matched
      L2: Partial (suffix + nama, skip versi)    → score 90,  matched
      L3: Nama saja                              → score 75,  low_confidence
      L4: Fuzzy fallback                         → score 60+, low_confidence
    Tiebreaker: structural_fingerprint dari template.
    """
    header_data = read_header(image_path)
    if not header_data:
        return {"template": None, "score": 0, "status": "unknown", "header": "", "doc_version": None}

    title       = header_data.get('title', '')
    doc_no      = header_data.get('doc_number') or ''
    doc_version = (header_data.get('version') or '').strip() or None
    searchable_text = f"{title} {doc_no}".strip()

    if not searchable_text:
        return {"template": None, "score": 0, "status": "unknown", "header": "", "doc_version": None}

    logger.info(f"[Auto-Detect] Header raw → title='{title}' | doc_no='{doc_no}' | version='{doc_version}'")

    def normalize_name(s: str) -> str:
        return (s or '').strip().lower()

    def name_matches(t_name: str, doc_name: str) -> bool:
        # OCR sering menambahkan teks lokasi di akhir judul (misal "...Battery Grandmall Bekasi")
        # Template DB hanya simpan nama tanpa lokasi (misal "...Battery")
        # Cocok jika sama persis ATAU template name adalah prefix dari doc name
        return t_name == doc_name or doc_name.startswith(t_name + ' ')

    def normalize_version(s: str) -> str:
        return re.sub(r'[ ()]', '', (s or '').lower())

    def extract_suffix(s: str) -> str:
        if not s:
            return ''
        clean = re.sub(r'[^A-Z0-9]', '', s.upper())
        return clean[-3:] if len(clean) >= 3 else clean

    def _pick(candidates: list):
        """Pilih best score; tiebreaker via structural_fingerprint."""
        if not candidates:
            return None, 0
        best_score = max(s for _, s in candidates)
        tied = [t for t, s in candidates if s == best_score]
        if len(tied) == 1:
            return tied[0], best_score
        with_fp = [t for t in tied if t.get('structural_fingerprint')]
        chosen = with_fp[0] if with_fp else tied[0]
        if with_fp:
            logger.info(f"[Auto-Detect] Tiebreaker → '{chosen.get('type_name')}' (has fingerprint)")
        return chosen, best_score

    doc_suffix = extract_suffix(doc_no)
    doc_name   = normalize_name(title)
    logger.info(f"[Auto-Detect] Normalized → suffix='{doc_suffix}' | name='{doc_name}' | version='{doc_version}'")

    # ── LEVEL 1: Exact composite key (suffix + nama + versi) ─────
    if doc_suffix and doc_name:
        l1 = []
        for t in all_templates:
            t_suffix  = extract_suffix(t.get('identifier_text', ''))
            t_name    = normalize_name(t.get('type_name', ''))
            t_version = (t.get('doc_version') or '').strip() or None
            if t_suffix != doc_suffix or not name_matches(t_name, doc_name):
                continue
            if not (doc_version and t_version):
                continue  # salah satu versi kosong → masuk L2
            if normalize_version(doc_version) != normalize_version(t_version):
                logger.debug(f"[Auto-Detect] L1 skip '{t.get('type_name')}' — versi beda doc='{doc_version}' tmpl='{t_version}'")
                continue
            logger.debug(f"[Auto-Detect] L1 candidate → '{t.get('type_name')}'")
            l1.append((t, 100))
        if l1:
            best_t, best_s = _pick(l1)
            logger.info(f"[Auto-Detect] LEVEL 1 EXACT → '{best_t.get('type_name')}' (score={best_s})")
            print(f"[TEMPLATE DIPILIH] Nama='{best_t.get('type_name')}' | Kode='{best_t.get('template_code')}' | No.Dok='{best_t.get('identifier_text')}' | Versi='{best_t.get('doc_version')}' | Level=L1 | Score={best_s}%")
            return {"template": best_t, "score": best_s, "status": "matched", "header": searchable_text, "doc_version": doc_version}

    # ── LEVEL 2: Partial (suffix + nama, versi tidak tersedia) ───
    if doc_suffix and doc_name:
        l2 = []
        for t in all_templates:
            t_suffix  = extract_suffix(t.get('identifier_text', ''))
            t_name    = normalize_name(t.get('type_name', ''))
            t_version = (t.get('doc_version') or '').strip() or None
            if t_suffix != doc_suffix or not name_matches(t_name, doc_name):
                continue
            if doc_version and t_version:
                continue  # keduanya ada → sudah di-handle L1
            logger.debug(f"[Auto-Detect] L2 candidate → '{t.get('type_name')}' (versi tidak lengkap)")
            l2.append((t, 90))
        if l2:
            best_t, best_s = _pick(l2)
            logger.info(f"[Auto-Detect] LEVEL 2 PARTIAL → '{best_t.get('type_name')}' (score={best_s})")
            print(f"[TEMPLATE DIPILIH] Nama='{best_t.get('type_name')}' | Kode='{best_t.get('template_code')}' | No.Dok='{best_t.get('identifier_text')}' | Versi='{best_t.get('doc_version')}' | Level=L2 | Score={best_s}%")
            return {"template": best_t, "score": best_s, "status": "matched", "header": searchable_text, "doc_version": doc_version}

    # ── LEVEL 3: Nama + suffix (jika suffix tersedia) ────────────
    if doc_name:
        l3 = []
        for t in all_templates:
            t_name = normalize_name(t.get('type_name', ''))
            if not name_matches(t_name, doc_name):
                continue
            if doc_suffix:
                t_suffix = extract_suffix(t.get('identifier_text', ''))
                if t_suffix != doc_suffix:
                    logger.debug(f"[Auto-Detect] L3 skip '{t.get('type_name')}' — suffix beda (doc='{doc_suffix}', tmpl='{t_suffix}')")
                    continue
            logger.debug(f"[Auto-Detect] L3 candidate → '{t.get('type_name')}'")
            l3.append((t, 75))
        if l3:
            best_t, best_s = _pick(l3)
            logger.info(f"[Auto-Detect] LEVEL 3 NAME → '{best_t.get('type_name')}' (score={best_s})")
            print(f"[TEMPLATE DIPILIH] Nama='{best_t.get('type_name')}' | Kode='{best_t.get('template_code')}' | No.Dok='{best_t.get('identifier_text')}' | Versi='{best_t.get('doc_version')}' | Level=L3 | Score={best_s}%")
            return {"template": best_t, "score": best_s, "status": "low_confidence", "header": searchable_text, "doc_version": doc_version}

    # ── LEVEL 4: Fuzzy fallback (suffix-guarded) ─────────────────
    # Hanya masukkan template yang suffix-nya cocok dengan dokumen.
    # Tanpa filter ini, template dengan No.Dok yang sama sekali berbeda
    # bisa menang hanya karena score fuzzy tinggi (false positive).
    logger.info(f"[Auto-Detect] LEVEL 4 - Fuzzy fallback (suffix='{doc_suffix}')...")
    l4 = []
    highest_score = 0
    for t in all_templates:
        identifier = t.get('identifier_text')
        if not identifier:
            continue
        if doc_suffix:
            t_suffix = extract_suffix(identifier)
            if t_suffix != doc_suffix:
                logger.debug(f"[Auto-Detect] L4 skip '{t.get('type_name')}' — suffix beda (doc='{doc_suffix}', tmpl='{t_suffix}')")
                continue
        score = max(
            fuzz.partial_ratio(identifier.lower(), searchable_text.lower()),
            fuzz.token_sort_ratio(identifier.lower(), searchable_text.lower()),
        )
        logger.debug(f"[Auto-Detect] L4 fuzzy → '{t.get('type_name')}' score={score}")
        if score > highest_score:
            highest_score = score
        if score >= 60:
            l4.append((t, score))
    if l4:
        best_t, best_s = _pick(l4)
        logger.info(f"[Auto-Detect] LEVEL 4 FUZZY → '{best_t.get('type_name')}' (score={best_s})")
        print(f"[TEMPLATE DIPILIH] Nama='{best_t.get('type_name')}' | Kode='{best_t.get('template_code')}' | No.Dok='{best_t.get('identifier_text')}' | Versi='{best_t.get('doc_version')}' | Level=L4 | Score={best_s}%")
        return {"template": best_t, "score": best_s, "status": "low_confidence", "header": searchable_text, "doc_version": doc_version}

    logger.warning(f"[Auto-Detect] SEMUA LEVEL GAGAL. Highest fuzzy score={highest_score}")
    return {"template": None, "score": highest_score, "status": "unknown", "header": searchable_text, "doc_version": doc_version}

# ══════════════════════════════════════════════════════════════
# ADAPTER: Konversi format field_extractor → format json_builder
# ══════════════════════════════════════════════════════════════

# Field yang masuk ke section "document" (metadata dokumen)
_DOCUMENT_FIELDS = {'no_dok', 'versi', 'hal', 'label'}

def _fields_to_fixed_results(fields_data: dict) -> dict:
    """
    Konversi flat dict dari field_extractor ke format yang json_builder harapkan.
    Field dipisah ke dua grup: 'document' (metadata) dan 'header' (info lapangan).
    field_order hanya menyimpan key nyata (bukan _conf_* / _ocr_source_* metadata).
    """
    doc_fields    = []
    header_fields = []
    field_order   = []

    for key, value in fields_data.items():
        entry = {"field_key": key, "extracted_values": {"result": value}}
        if key.startswith("_"):
            # _conf_X / _ocr_source_X → ikut grup parent field X, tidak masuk field_order
            parent_key = re.sub(r'^_(conf|ocr_source)_', '', key)
            if parent_key in _DOCUMENT_FIELDS:
                doc_fields.append(entry)
            else:
                header_fields.append(entry)
        else:
            if key in _DOCUMENT_FIELDS:
                doc_fields.append(entry)
            else:
                header_fields.append(entry)
            field_order.append(key)

    return {
        "document":    doc_fields,
        "header":      header_fields,
        "field_order": field_order,
    }


def _tables_to_table_results(tables_data: dict) -> dict:
    """
    Konversi dict tabel dari table_extractor ke format yang json_builder harapkan.
    table_order menyimpan urutan asli dari tables_config untuk digunakan frontend.
    """
    results = []
    for key, rows in tables_data.items():
        results.append({
            "group_key":  key,
            "group_name": key.replace('_', ' ').title(),
            "data":       rows
        })
    return {
        "results":     results,
        "table_order": list(tables_data.keys()),
    }


# ══════════════════════════════════════════════════════════════
# ORKESTRATOR UTAMA
# ══════════════════════════════════════════════════════════════
def extract_document(pdf_path: str, template_code: str = None, document_id: int = None, all_templates: list = None) -> dict:
    """
    Fungsi utama untuk menjalankan ekstraksi per halaman dengan output yang kaya.
    """
    logger.info(f"--- Memulai Ekstraksi ID #{document_id} ---")

    # JEMPUT BOLA: Jika n8n tidak kasih template, cari sendiri ke Supabase
    if not all_templates:
        print(f"[OCR] Mengambil daftar template dari Supabase...")
        all_templates = fetch_active_templates()
        print(f"[OCR] {len(all_templates)} template aktif ditemukan.")

    # FALLBACK SAKTI: Jika di database cuma ada 1 template aktif, langsung pakai itu tanpa nebak-nebak!
    # S9: dinonaktifkan untuk testing multi-template
    # if not template_code and all_templates and len(all_templates) == 1:
    #     template_code = all_templates[0].get("template_code")
    #     print(f"[OCR] Auto-Bypass: hanya 1 template di DB → pakai '{template_code}'")

    from app.services.pdf_converter import convert_if_not_exists
    print(f"[OCR] Mengkonversi PDF → PNG...")
    images = convert_if_not_exists(pdf_path)
    if not images:
        raise ValueError("PDF tidak menghasilkan gambar.")
    print(f"[OCR] PDF berhasil dikonversi: {len(images)} halaman.")

    results_per_page = []

    for i, img_path in enumerate(images):
        page_num = i + 1
        print(f"\n[OCR] ── Halaman {page_num}/{len(images)} ────────────────────────")

        # 1. Preprocess: Bersihkan gambar dulu (CLAHE + denoise) SEBELUM DETEKSI TEMPLATE
        from app.services.preprocessor import preprocess_image
        clean_img_path = preprocess_image(str(img_path))

        selected_template = None
        match_result = {"status": "matched", "score": 100, "header": "Manual Bypass (template_code dikirim langsung)"}

        # 2. Jika n8n/Laravel memberikan template_code secara spesifik (Manual Mode)
        if template_code:
            print(f"[OCR] Mode MANUAL — mencari template '{template_code}'...")
            for t in all_templates:
                if t.get("template_code") == template_code:
                    selected_template = t
                    break
            if not selected_template:
                print(f"[OCR] ❌ Template '{template_code}' tidak ditemukan di database!")
                match_result = {"status": "unknown", "score": 0, "header": "None"}
            else:
                print(f"[OCR] ✅ Template ditemukan: '{selected_template.get('type_name')}'")
        else:
            # 3. Jika tidak ada template_code, gunakan Auto-Detect pada gambar yang sudah bersih
            print(f"[OCR] Mode AUTO-DETECT — membaca header dokumen...")
            match_result = detect_template(str(clean_img_path), all_templates)
            selected_template = match_result.get('template')
            if selected_template:
                print(f"[OCR] ✅ Template terdeteksi: '{selected_template.get('type_name')}' "
                      f"(score: {match_result['score']}%, header: '{match_result.get('header', '')[:50]}')")
            else:
                print(f"[OCR] ❌ Tidak ada template cocok "
                      f"(score tertinggi: {match_result.get('score', 0)}%, "
                      f"header: '{match_result.get('header', '')[:50]}')")

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
        print(f"[OCR] Menjalankan Global OCR scan...")
        ocr_results = run_global_ocr(clean_img_path)
        print(f"[OCR] Global OCR selesai: {len(ocr_results)} teks terdeteksi.")

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
        mapping_config    = selected_template.get('mapping_config', {})
        all_fields_config = mapping_config.get('fields', [])
        all_tables_config = mapping_config.get('tables', [])

        # Filter per halaman — field/tabel tanpa attr 'page' dianggap halaman 1 (backward compat)
        fields_config = [f for f in all_fields_config if f.get('page', 1) == page_num]
        tables_config = [t for t in all_tables_config if t.get('page', 1) == page_num]

        field_names = [f.get('field_name', '?') for f in fields_config]
        table_names = [t.get('table_name', '?') for t in tables_config]
        print(f"[OCR] Konfigurasi: {len(fields_config)} field, {len(tables_config)} tabel")
        if field_names:
            print(f"[OCR] Fields    : {', '.join(field_names)}")
        if table_names:
            print(f"[OCR] Tables    : {', '.join(table_names)}")

        # 3. Ekstrak field header — printed via global OCR, handwritten via TrOCR crop
        if fields_config:
            print(f"\n[OCR] ── Ekstraksi Fields ──────────────────────────────")
        fields_data, field_anchor_y = extract_fields(ocr_results, fields_config, image_path=clean_img_path)
        if fields_config:
            success_fields = sum(1 for k, v in fields_data.items() if not k.startswith('_') and v)
            print(f"[OCR] Fields selesai: {success_fields}/{len(fields_config)} berhasil diekstrak.")

        # 4. Ekstrak tiap tabel (group_by_y + split_by_x, TANPA OCR ulang)
        tables_data       = {}
        table_anchor_y    = {}
        table_confidences = []  # confidence per tabel untuk rata-rata akhir
        for table_cfg in tables_config:
            anchor_texts = table_cfg.get('anchor', {}).get('texts', [])
            anchor_text  = anchor_texts[0] if anchor_texts else ''
            tbl_name     = table_cfg.get('table_name', '?')
            print(f"\n[OCR] ── Ekstraksi Tabel '{tbl_name}' ─────────────────────")
            print(f"[OCR] Mencari anchor tabel: '{anchor_text}'...")
            anchor    = find_anchor(ocr_results, anchor_text) if anchor_text else None
            table_key = table_cfg.get('json_key', table_cfg.get('table_name'))
            table_anchor_y[table_key] = anchor['y'] if anchor else None
            if anchor:
                print(f"[OCR] ✅ Anchor '{anchor_text}' ditemukan di ({anchor['x']}, {anchor['y']}) "
                      f"score={anchor.get('score', '?')}")
            else:
                print(f"[OCR] ❌ Anchor '{anchor_text}' TIDAK ditemukan — tabel '{tbl_name}' akan dilewati.")
            rows, tbl_conf = extract_table(ocr_results, table_cfg, anchor, image_path=clean_img_path)
            tables_data[table_key] = rows
            conf_str = f"{tbl_conf:.1f}%" if tbl_conf is not None else "N/A"
            print(f"[OCR] Tabel '{tbl_name}' selesai: {len(rows)} baris | confidence: {conf_str}")
            if tbl_conf is not None:
                table_confidences.append(tbl_conf)

        # 4b. Ekstrak repeating_sections (opsional — Battery Bank, dll)
        # Tidak mengubah perilaku template yang sudah ada karena kunci ini
        # hanya ada di mapping_config template yang memang membutuhkannya.
        repeating_data        = {}
        repeating_section_meta = {}
        all_repeating_config  = mapping_config.get('repeating_sections', [])
        repeating_config     = [s for s in all_repeating_config if s.get('page', 1) == page_num]
        if repeating_config:
            from app.services.repeating_extractor import extract_repeating_section

            # Dapatkan ukuran gambar untuk konversi hint rasio → piksel
            try:
                from PIL import Image as _PILImg
                with _PILImg.open(clean_img_path) as _pil:
                    _img_size = _pil.size   # (width, height)
            except Exception as _e:
                logger.warning(f"[OCR] Gagal baca ukuran gambar untuk hint: {_e}")
                _img_size = None

            for sec_cfg in repeating_config:
                sec_name = sec_cfg.get('section_name', 'section')
                sec_key  = sec_cfg.get('json_key', sec_name)
                print(f"\n[OCR] ── Repeating Section '{sec_name}' "
                      f"────────────────────────────────────")
                sec_result, sec_conf = extract_repeating_section(
                    ocr_results, sec_cfg,
                    image_path=clean_img_path,
                    image_size=_img_size,
                )
                repeating_data[sec_key] = sec_result
                n_inst   = len(sec_result)
                conf_str = f"{sec_conf:.1f}%" if sec_conf is not None else "N/A"
                print(f"[OCR] Repeating section '{sec_name}' selesai: "
                      f"{n_inst} instances | confidence={conf_str}")
                if sec_conf is not None:
                    table_confidences.append(sec_conf)

            # Pisahkan tabel dalam section ke tables_data.
            # Key tabel diambil dari sec_cfg['tables'][i]['json_key'] (nama yg
            # didefinisikan admin), bukan dari key hasil OCR — agar key gabungan
            # menjadi "bank_1_battery_data" bukan "bank_1_no".
            for sec_cfg in repeating_config:
                sec_key  = sec_cfg.get('json_key', sec_cfg.get('section_name', 'section'))
                sec_name = sec_cfg.get('section_name', sec_key)
                if sec_key not in repeating_data:
                    continue
                sec_result = repeating_data[sec_key]
                table_keys = []

                # Pindahkan tabel berdasarkan json_key dari mapping_config
                for tbl in sec_cfg.get('tables', []):
                    tbl_key = tbl.get('json_key') or tbl.get('table_name')
                    if not tbl_key:
                        continue
                    if tbl_key in sec_result and isinstance(sec_result[tbl_key], list):
                        combined_key              = f"{sec_key}_{tbl_key}"
                        tables_data[combined_key] = sec_result.pop(tbl_key)
                        table_keys.append(combined_key)

                # Scalar keys = semua key tersisa yang bukan _ dan bukan list
                scalar_keys = [
                    k for k in sec_result.keys()
                    if not k.startswith('_') and not isinstance(sec_result[k], list)
                ]
                repeating_section_meta[sec_key] = {
                    'section_name': sec_name,
                    'fields':       scalar_keys,
                    'tables':       table_keys,
                }
                print(f"[OCR] Section '{sec_key}': "
                      f"{len(scalar_keys)} scalar fields, "
                      f"{len(table_keys)} tables → {table_keys}")

        # 5. Susun output terstruktur via json_builder
        fixed_data    = _fields_to_fixed_results(fields_data)
        field_order   = fixed_data["field_order"]
        fixed_results = []
        if fixed_data["document"]:
            fixed_results.append({"group_key": "document", "group_name": "Document", "fields": fixed_data["document"]})
        if fixed_data["header"]:
            fixed_results.append({"group_key": "header", "group_name": "Header", "fields": fixed_data["header"]})
        table_data_out = _tables_to_table_results(tables_data)
        table_results  = table_data_out["results"]
        table_order    = table_data_out["table_order"]
        structured_out = build_hierarchical_json(
            fixed_results, table_results,
            table_order=table_order,
            repeating_results=repeating_data if repeating_data else None,
        )
        structured_out["field_order"] = field_order
        structured_out["table_order"] = table_order

        all_items = (
            [(name, y) for name, y in field_anchor_y.items()] +
            [(key,  y) for key,  y in table_anchor_y.items()]
        )
        combined_order = [
            name for name, _ in sorted(
                all_items,
                key=lambda x: (
                    x[1] is None,
                    (x[1] or 0) + (0 if x[0] in table_anchor_y else 50),
                    0 if x[0] in table_anchor_y else 1,
                )
            )
        ]
        structured_out["combined_order"] = combined_order
        if repeating_section_meta:
            structured_out["_repeating_sections"] = repeating_section_meta

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
            "doc_version":          match_result.get('doc_version'),
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

    # ── Merge hasil dari semua halaman menjadi satu output terpadu ────────────
    merged_fields = {}
    merged_tables = {}

    for page_result in results_per_page:
        if page_result.get('status') in ('matched', 'low_confidence'):
            page_fields = page_result.get('fields', {})
            page_tables = page_result.get('tables', {})

            # Merge dict sections (document, header, dll) dan list sections (checklist, dll)
            for key, val in page_fields.items():
                if key in ('field_order', 'table_order', 'combined_order', 'copyright'):
                    continue
                if isinstance(val, dict):
                    if key not in merged_fields:
                        merged_fields[key] = {}
                    merged_fields[key].update(val)
                elif isinstance(val, list):
                    if key not in merged_fields:
                        merged_fields[key] = []
                    merged_fields[key].extend(val)
                else:
                    merged_fields[key] = val

            merged_tables.update(page_tables)

    # Gabungkan metadata order dari semua halaman (dedup, pertahankan urutan)
    all_field_orders    = []
    all_table_orders    = []
    all_combined_orders = []
    for page_result in results_per_page:
        pf = page_result.get('fields', {})
        all_field_orders.extend(pf.get('field_order', []))
        all_table_orders.extend(pf.get('table_order', []))
        all_combined_orders.extend(pf.get('combined_order', []))

    seen = set()
    merged_fields['field_order']    = [x for x in all_field_orders    if not (x in seen or seen.add(x))]
    seen = set()
    merged_fields['table_order']    = [x for x in all_table_orders    if not (x in seen or seen.add(x))]
    seen = set()
    merged_fields['combined_order'] = [x for x in all_combined_orders if not (x in seen or seen.add(x))]

    return {
        "status":                "ok",
        "document_id":           document_id,
        "confidence_score":      avg_ocr_score,    # kualitas baca OCR
        "template_match_score":  avg_match_score,  # kecocokan template
        "pages":                 results_per_page,  # detail per halaman (tetap ada)
        "total_pages":           len(images),
        "merged_fields":         merged_fields,    # hasil terpadu semua halaman
        "merged_tables":         merged_tables,    # tabel terpadu semua halaman
    }