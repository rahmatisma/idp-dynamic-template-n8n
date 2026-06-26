"""
app/services/field_extractor.py
---------------------------------
Ekstraksi field header dokumen menggunakan anchor-based coordinate mapping.

Mendukung tiga mode berdasarkan field.type:
    - "printed"     → get_text_in_bbox() dari global PaddleOCR scan (cepat)
    - "handwritten" → TrOCR crop-and-read (akurat untuk tulisan tangan)
    - "checkbox"    → pixel darkness detection (untuk kolom centang/checklist)

Prinsip utama: Global OCR hanya jalan SATU KALI per halaman.
Untuk field printed, hasilnya di-filter spasial.
Untuk field handwritten, gambar di-crop dan dikasih ke TrOCR.
Untuk field checkbox, tidak pakai OCR — analisis rasio piksel gelap.
"""

import logging
import re
from app.services.template_mapper import find_anchor, calculate_target_box, get_text_in_bbox, get_text_and_conf_in_bbox

logger = logging.getLogger(__name__)


def extract_fields(
    ocr_results: list,
    fields_config: list,
    image_path: str = None,
    ocr_results_fallback=None,
) -> dict:
    """
    Ekstrak semua field header dokumen berdasarkan konfigurasi template.

    Flow per field:
      1. find_anchor()           → cari posisi kata kunci di halaman
      2. calculate_target_box()  → hitung kotak area isian (offset dari anchor)
      3a. get_text_in_bbox()     → [PRINTED] ambil dari global OCR
      3b. TrOCR crop-and-read   → [HANDWRITTEN] crop gambar → baca dengan TrOCR

    Args:
        ocr_results          : hasil global OCR satu halaman (list of dict)
        fields_config        : list field dari mapping_config['fields']
        image_path           : path PNG halaman — WAJIB untuk field handwritten
        ocr_results_fallback : OCR dari gambar ASLI (raw, sebelum preprocessing),
                               dipakai find_anchor() sebagai fallback ketika anchor
                               di gambar preprocessed lemah (score<85, mis. "S/N"
                               yang rusak jadi "N/S"). Boleh berupa list hasil OCR,
                               ATAU callable zero-arg yang mengembalikan list (lazy —
                               raw OCR baru dijalankan saat pertama kali dibutuhkan).
                               None = fitur fallback nonaktif (perilaku lama).

    Returns:
        dict {field_name: value_string, _conf_field_name: float|None, _ocr_source_field_name: str|None}
        Contoh: {"location": "Grand Mall Bekasi", "_conf_location": 87.4, "_ocr_source_location": "paddle"}
    """
    result       = {}
    anchor_y_dict = {}

    # Resolver lazy untuk fallback raw OCR: materialize maksimal SEKALI, dan hanya
    # ketika benar-benar dibutuhkan (ada field yang anchornya lemah di preprocessed).
    _fb_state = {'done': False, 'val': None}

    def _resolve_fallback():
        if not _fb_state['done']:
            _fb_state['done'] = True
            fb = ocr_results_fallback
            _fb_state['val'] = fb() if callable(fb) else fb
        return _fb_state['val']

    for field in fields_config:
        if not field.get('field_name'):
            continue
        field_name  = field.get('field_name', 'unknown')
        anchor_text = field.get('anchor_text', '')
        offset_x    = field.get('offset_x', 0)
        offset_y    = field.get('offset_y', 0)
        width       = field.get('width', 100)
        height      = field.get('height', 50)
        field_type  = field.get('type', 'printed')   # ← "printed" atau "handwritten"

        print(f"[FIELD] '{field_name}' [{field_type}] — mencari anchor '{anchor_text}'...")

        # ── Step 1: Cari anchor (preprocessed dulu) ───────────────
        anchor = find_anchor(ocr_results, anchor_text)

        # ── Step 1b: Fallback raw OCR — HANYA bila preprocessed lemah ──────────
        # Additive: field yang sudah kuat (score>=85) TIDAK menyentuh jalur ini,
        # jadi perilakunya tidak berubah. Raw OCR baru di-materialize (via resolver
        # lazy) saat field pertama yang lemah muncul. find_anchor() sendiri yang
        # memutuskan memakai hasil raw hanya jika skornya lebih tinggi.
        if anchor is None or anchor.get('score', 100) < 85:
            _fb = _resolve_fallback()
            if _fb:
                _prev_score = anchor.get('score', 0) if anchor else 0
                _fb_anchor = find_anchor(ocr_results, anchor_text, ocr_results_fallback=_fb)
                if _fb_anchor is not None:
                    if _fb_anchor.get('score', 0) > _prev_score:
                        print(f"[FIELD] ⤴ '{field_name}': fallback RAW OCR menang "
                              f"'{_fb_anchor['text']}' score={_fb_anchor['score']} "
                              f"(preprocessed score={_prev_score})")
                        logger.info(
                            f"[FieldExtractor] Field '{field_name}': fallback raw OCR menang "
                            f"'{_fb_anchor['text']}' score={_fb_anchor['score']} "
                            f"> preprocessed score={_prev_score}"
                        )
                    anchor = _fb_anchor

        if not anchor:
            print(f"[FIELD] ✗ '{field_name}': anchor '{anchor_text}' tidak ditemukan → kosong")
            logger.warning(f"[FieldExtractor] Anchor '{anchor_text}' tidak ketemu untuk field '{field_name}'")
            result[field_name] = ""
            result[f"_conf_{field_name}"] = None      # OCR tidak dicoba → tidak ada warning
            result[f"_ocr_source_{field_name}"] = None
            anchor_y_dict[field_name] = None
            continue

        anchor_y_dict[field_name] = anchor['y']

        print(f"[FIELD] ✓ Anchor '{anchor_text}' → match '{anchor['text']}' "
              f"di ({anchor['x']},{anchor['y']}) score={anchor.get('score','?')}")

        # ── Step 2: Hitung bounding box target ───────────────────
        bbox = calculate_target_box(anchor, offset_x, offset_y, width, height)

        # ── Step 3: Baca teks sesuai jenis tulisan ───────────────
        conf: float | None = None
        ocr_src: str | None = None

        if field_type == "checkbox":
            value = _detect_checkbox_field(image_path, bbox, field)
            engine_log = "Checkbox"
            # Checkbox tidak pakai OCR → tidak ada confidence
        elif field_type == "handwritten":
            # Voting ensemble (ink-check + TrOCR vs PaddleOCR) — setara kolom tabel
            value, hw_conf, ocr_src = _read_handwritten_field(
                image_path, bbox, field_name, ocr_results
            )
            conf = round(hw_conf, 1) if hw_conf is not None else 0.0
            engine_log = "TrOCR" if ocr_src == "trocr" else "PaddleOCR (voting)"
        else:
            # Default: printed → ambil dari hasil global OCR
            value, raw_conf = get_text_and_conf_in_bbox(ocr_results, bbox)
            conf = round(raw_conf, 1) if raw_conf is not None else 0.0
            ocr_src = "paddle"
            engine_log = "PaddleOCR"

        if field_type != "checkbox" and value:
            value = value.lstrip(":.- ").strip()
            # Strip anchor text jika ikut terbaca di awal nilai (rule-based, generic)
            if anchor_text and value:
                anchor_alnum = re.sub(r'[^a-zA-Z0-9]', '', anchor_text).lower()
                value_prefix_alnum = re.sub(r'[^a-zA-Z0-9]', '', value[:len(anchor_text) + 5]).lower()
                if len(anchor_alnum) >= 3 and value_prefix_alnum.startswith(anchor_alnum):
                    skipped = 0
                    cut = 0
                    for i, ch in enumerate(value):
                        if ch.isalnum():
                            skipped += 1
                        if skipped == len(anchor_alnum):
                            cut = i + 1
                            break
                    stripped = value[cut:].lstrip(' .:-/').strip()
                    if stripped:
                        value = stripped
        status_icon = "✓" if value else "○"
        print(f"[FIELD] {status_icon} '{field_name}' [{engine_log}] → '{value or '(kosong)'}'"
              + (f" (conf={conf}%)" if conf is not None else ""))
        logger.info(f"[FieldExtractor] Field '{field_name}' [{engine_log}] → '{value}'")
        result[field_name] = value
        result[f"_conf_{field_name}"] = conf
        result[f"_ocr_source_{field_name}"] = ocr_src

    field_count = sum(1 for k in result if not k.startswith('_'))
    logger.info(f"[FieldExtractor] Selesai. {field_count} field diekstrak.")
    return result, anchor_y_dict


def _detect_checkbox_field(image_path: str, bbox: tuple, field_config: dict) -> str:
    """
    Deteksi centang berdasarkan rasio piksel gelap di area bbox.

    Tidak menggunakan OCR — centang meninggalkan tinta signifikan
    yang bisa diukur dari grayscale darkness ratio.

    Returns:
        checkbox_checked_value (default "OK")  jika dark_ratio > threshold
        checkbox_empty_value   (default "")    jika kosong
    """
    if not image_path:
        return ""
    try:
        from PIL import Image
        import numpy as np

        checked_val = field_config.get('checkbox_checked_value', 'OK')
        empty_val   = field_config.get('checkbox_empty_value', '')
        threshold   = float(field_config.get('checkbox_threshold', 0.12))

        img_gray = np.array(Image.open(image_path).convert('L'))
        img_h, img_w = img_gray.shape

        x1, y1, x2, y2 = [int(v) for v in bbox]
        x1 = max(0, x1);       y1 = max(0, y1 + 3)
        x2 = min(img_w, x2);   y2 = min(img_h, y2 - 3)

        if x2 <= x1 or y2 <= y1:
            return empty_val

        crop = img_gray[y1:y2, x1:x2]
        dark_ratio = float((crop < 180).mean())
        is_checked = dark_ratio > threshold

        logger.info(
            f"[FieldExtractor] Checkbox dark={dark_ratio:.3f} threshold={threshold} "
            f"→ '{'checked' if is_checked else 'empty'}'"
        )
        return checked_val if is_checked else empty_val

    except Exception as e:
        print(f"[FIELD] ❌ Error checkbox detection: {e}")
        logger.error(f"[FieldExtractor] Error deteksi checkbox: {e}")
        return ""


def _read_handwritten_field(
    image_path: str,
    bbox: tuple,
    field_name: str,
    ocr_results: list = None,
) -> tuple:
    """
    Baca satu field tulisan tangan dengan mekanisme SETARA kolom tabel
    handwritten di table_extractor.split_by_x():
      1. Ink-check (dark-ratio) sebelum percaya hasil TrOCR — threshold 0.20
         dihitung IDENTIK dengan split_by_x().
      2. Voting ensemble TrOCR vs PaddleOCR memakai _is_trocr_noise() yang sama.

    Catatan skala confidence: get_text_and_conf_in_bbox() mengembalikan conf
    skala 0-100, sedangkan split_by_x() memakai conf skala 0-1. Threshold noise
    0.9 di tabel ekuivalen dengan 90 di sini (makna sama: "paddle conf > 0.9").

    Returns:
        (text, conf, ocr_source)
          - text       : string terpilih ("" jika tidak ada ink terdeteksi)
          - conf       : float 0-100, atau None jika tidak diukur
          - ocr_source : "trocr" | "paddle"
    """
    from app.services.table_extractor import _is_trocr_noise

    # ── Hasil PaddleOCR dari global scan pada bbox yang sama (bahan voting) ──
    paddle_text, paddle_conf = ("", None)
    if ocr_results is not None:
        paddle_text, paddle_conf = get_text_and_conf_in_bbox(ocr_results, bbox)
    paddle_clean = (paddle_text or "").strip()

    if not image_path:
        logger.warning(f"[FieldExtractor] image_path tidak ada, field '{field_name}' fallback Paddle.")
        return paddle_clean, paddle_conf, "paddle"

    try:
        from app.services.trocr_service import crop_image_for_trocr, read_handwritten
        import numpy as np

        crop = crop_image_for_trocr(image_path, bbox)
        if crop is None:
            print(f"[FIELD] ⚠️  Crop gagal untuk field '{field_name}' (bbox={bbox}) → fallback Paddle")
            logger.warning(f"[FieldExtractor] Gagal crop untuk field '{field_name}'.")
            return paddle_clean, paddle_conf, "paddle"

        # ── Ink-check: IDENTIK dengan split_by_x() (dark-ratio, threshold 0.20) ──
        _arr   = np.array(crop.convert('L'))
        _inner = _arr[3:-3, :] if _arr.shape[0] > 6 else _arr
        _dark  = float((_inner < 180).mean())
        _has_ink = bool(paddle_clean) or (_dark > 0.20)

        if not _has_ink:
            logger.info(f"[FieldExtractor] Field '{field_name}' kosong (paddle='', dark={_dark:.3f}), skip TrOCR.")
            return "", None, "paddle"

        # ── Jalankan TrOCR ──
        trocr_text, trocr_conf = read_handwritten(crop)
        trocr_clean = (trocr_text or "").strip()

        # ── Voting Ensemble — logic SAMA dengan kolom tabel handwritten ──
        if not trocr_clean or len(trocr_clean) < 2:
            # TrOCR kosong / terlalu pendek → pakai PaddleOCR
            final_text, final_conf, ocr_source = paddle_clean, paddle_conf, "paddle"
        elif not paddle_clean:
            # PaddleOCR tidak mendeteksi apapun → pakai TrOCR
            final_text, final_conf, ocr_source = trocr_clean, trocr_conf, "trocr"
        elif (paddle_conf or 0) > 90 and _is_trocr_noise(trocr_clean):
            # Paddle conf tinggi (>0.9 ⇒ >90) dan TrOCR noise → pakai PaddleOCR
            final_text, final_conf, ocr_source = paddle_clean, paddle_conf, "paddle"
        else:
            # Keduanya ada hasil → TrOCR lebih akurat untuk handwritten
            final_text, final_conf, ocr_source = trocr_clean, trocr_conf, "trocr"

        logger.info(
            f"[FieldExtractor] Field '{field_name}' [{ocr_source.upper()}] "
            f"conf={(final_conf if final_conf is not None else 0):.1f}% → '{final_text}' "
            f"(paddle='{paddle_clean}' conf={(paddle_conf or 0):.1f} | "
            f"trocr='{trocr_clean}' conf={trocr_conf:.1f}%)"
        )
        return final_text, final_conf, ocr_source

    except Exception as e:
        print(f"[FIELD] ❌ TrOCR error untuk '{field_name}': {e}")
        logger.error(f"[FieldExtractor] TrOCR error untuk '{field_name}': {e}")
        return paddle_clean, paddle_conf, "paddle"
