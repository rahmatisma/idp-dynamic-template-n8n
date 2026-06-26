"""
app/services/repeating_extractor.py
--------------------------------------
Ekstraksi repeating_section — section yang berulang dalam satu halaman dokumen,
masing-masing dengan fields dan/atau tables sendiri. Contoh: Bank pada Battery.

Tidak ada logika OCR baru — semua di-reuse dari:
  - find_anchor()                   → template_mapper (+ hint_position baru)
  - calculate_target_box()          → template_mapper
  - get_text_and_conf_in_bbox()     → template_mapper
  - _read_handwritten_field()       → field_extractor (private helper)
  - _detect_checkbox_field()        → field_extractor (private helper)
  - extract_table()                 → table_extractor

Format mapping_config.repeating_sections:
[
  {
    "section_name": "Bank",
    "json_key":     "banks",
    "instances": [
      {
        "instance_key":   "bank_1",
        "hint_position":  {"x": 0.25, "y": 0.30},   ← rasio 0-1 dari canvas editor
        "hint_tolerance": 0.15,                       ← radius zona (default 0.15)
        "fields": [
          {
            "field_name":   "battery_type",
            "anchor_text":  "Battery Type",
            "hint_position": {"x": 0.25, "y": 0.32}, ← opsional, override instance
            "offset_x": 200, "offset_y": 0,
            "width": 400, "height": 60,
            "type": "printed"
          }
        ],
        "tables": [
          {
            "table_name": "String 1",
            "json_key":   "string_1",
            "anchor": {
              "texts": ["No"],
              "hint_position": {"x": 0.25, "y": 0.42}  ← opsional
            },
            ... (format sama dengan tables biasa)
          }
        ]
      }
    ]
  }
]
"""

import logging
from app.services.template_mapper import (
    find_anchor,
    calculate_target_box,
    get_text_and_conf_in_bbox,
)

logger = logging.getLogger(__name__)


def extract_repeating_section(
    ocr_results:          list,
    section_cfg:          dict,
    image_path:           str        = None,
    image_size:           tuple      | None = None,
    ocr_results_original: list       | None = None,
) -> tuple:
    """
    Ekstrak satu repeating_section dari mapping_config.

    Format section_cfg (flat, tanpa wrapper instances[]):
    {
        "section_name": "Bank 1",
        "json_key":     "bank_1",
        "anchor_text":  "Bank",
        "hint_position":  {"x": 0.25, "y": 0.30},   ← rasio 0-1 dari canvas editor
        "hint_tolerance": 0.15,
        "fields": [ { field_name, anchor_text, hint_position, ... } ],
        "tables": [ { table_name, anchor: { texts, hint_position, ... }, ... } ]
    }

    Hint untuk tabel dibaca dari table_cfg['anchor']['hint_position'] dan
    table_cfg['anchor']['hint_tolerance'] — bukan dari level section.
    Fallback ke section-level hint jika anchor tabel tidak punya hint sendiri.

    Args:
        ocr_results          : hasil global OCR satu halaman (list of dict)
        section_cfg          : satu item dari mapping_config['repeating_sections']
        image_path           : path PNG halaman — wajib untuk field handwritten/checkbox
        image_size           : (img_w, img_h) piksel — wajib agar hint rasio bisa dikonversi
        ocr_results_original : OCR dari gambar asli (sebelum preprocessing) — diteruskan ke
                               find_anchor() sebagai fallback jika skor primer < 85

    Returns:
        (result_dict, avg_confidence)
        result_dict   : { field_name: value, table_key: [...] }  — flat dict
        avg_confidence: rata-rata confidence semua ekstraksi (None jika tidak ada data)
    """
    section_name  = section_cfg.get('section_name', 'section')
    inst_key      = section_cfg.get('json_key', section_name)
    inst_hint     = section_cfg.get('hint_position')          # hint level section
    inst_tol      = float(section_cfg.get('hint_tolerance', 0.08))
    fields_config = section_cfg.get('fields', [])
    tables_config = section_cfg.get('tables', [])

    if not fields_config and not tables_config:
        logger.warning(
            f"[RepeatExtractor] section '{section_name}' (key='{inst_key}') "
            f"tidak ada fields maupun tables — skip."
        )
        return {}, None

    print(f"\n[RepeatSection] ── '{section_name}' / '{inst_key}' ──")
    if inst_hint and image_size:
        img_w, img_h = image_size
        print(f"[RepeatSection] hint=({inst_hint.get('x','?'):.3f},"
              f"{inst_hint.get('y','?'):.3f}) "
              f"→ ({inst_hint.get('x',0)*img_w:.0f},"
              f"{inst_hint.get('y',0)*img_h:.0f})px  tol={inst_tol}")

    inst_result: dict = {}
    inst_confs:  list = []

    # ── A. Ekstrak fields ─────────────────────────────────────────────────────
    for field in fields_config:
        field_name  = field.get('field_name', 'unknown')
        anchor_text = (field.get('anchor_text') or '').strip()
        offset_x    = int(field.get('offset_x', 0))
        offset_y    = int(field.get('offset_y', 0))
        width       = int(field.get('width', 100))
        height      = int(field.get('height', 50))
        field_type  = field.get('type', 'printed')

        # Field boleh punya hint sendiri; fallback ke hint section
        field_hint = field.get('hint_position') or inst_hint
        field_tol  = float(field.get('hint_tolerance', inst_tol))

        print(f"[RepeatSection] Field '{field_name}' [{field_type}] "
              f"anchor='{anchor_text}'")

        anchor = (
            find_anchor(
                ocr_results, anchor_text,
                hint_position=field_hint,
                hint_tolerance=field_tol,
                image_size=image_size,
                ocr_results_fallback=ocr_results_original,
            )
            if anchor_text else None
        )

        if not anchor:
            logger.warning(
                f"[RepeatExtractor] Anchor '{anchor_text}' tidak ketemu "
                f"untuk field '{field_name}' di section '{inst_key}'"
            )
            inst_result[field_name]                      = ''
            inst_result[f'_conf_{field_name}']           = None
            inst_result[f'_ocr_source_{field_name}']     = None
            continue

        print(f"[RepeatSection] ✓ Anchor '{anchor_text}' → "
              f"'{anchor['text']}' ({anchor['x']},{anchor['y']}) "
              f"score={anchor.get('score', '?')}")

        bbox = calculate_target_box(anchor, offset_x, offset_y, width, height)

        # ── Baca nilai sesuai jenis field ─────────────────────────────
        conf: float | None   = None
        ocr_src: str | None  = None

        if field_type == 'checkbox':
            from app.services.field_extractor import _detect_checkbox_field
            value   = _detect_checkbox_field(image_path, bbox, field)
            ocr_src = 'checkbox'

        elif field_type == 'handwritten':
            from app.services.field_extractor import _read_handwritten_field
            hw_text, hw_conf, hw_source = _read_handwritten_field(image_path, bbox, field_name)
            if hw_text:
                value   = hw_text
                conf    = round(hw_conf, 1) if hw_conf is not None else 0.0
                ocr_src = hw_source  # "trocr" | "paddle" sesuai hasil voting (konsisten dgn field_extractor)
            else:
                # TrOCR kosong → fallback PaddleOCR global scan
                value, raw_conf = get_text_and_conf_in_bbox(ocr_results, bbox)
                conf    = round(raw_conf, 1) if raw_conf is not None else 0.0
                ocr_src = 'paddle'

        else:  # printed
            value, raw_conf = get_text_and_conf_in_bbox(ocr_results, bbox)
            conf    = round(raw_conf, 1) if raw_conf is not None else 0.0
            ocr_src = 'paddle'

        if field_type != 'checkbox' and value:
            value = value.lstrip(':.- ').strip()

        inst_result[field_name]                  = value
        inst_result[f'_conf_{field_name}']       = conf
        inst_result[f'_ocr_source_{field_name}'] = ocr_src
        if conf is not None:
            inst_confs.append(conf)

        status = '✓' if value else '○'
        print(f"[RepeatSection] {status} '{field_name}' → "
              f"'{value or '(kosong)'}'"
              + (f' (conf={conf}%)' if conf is not None else ''))

    # ── B. Ekstrak tables ─────────────────────────────────────────────────────
    for tbl_cfg in tables_config:
        from app.services.table_extractor import extract_table

        tbl_name     = tbl_cfg.get('table_name', 'table')
        anchor_texts = tbl_cfg.get('anchor', {}).get('texts', [])
        anchor_text  = (anchor_texts[0] if anchor_texts else '').strip()
        tbl_key      = tbl_cfg.get('json_key', tbl_name)

        # Hint tabel dibaca dari table_cfg['anchor']['hint_position'].
        # Fallback ke hint level section jika anchor tabel tidak punya hint sendiri.
        tbl_hint = tbl_cfg.get('anchor', {}).get('hint_position') or inst_hint
        tbl_tol  = float(
            tbl_cfg.get('anchor', {}).get('hint_tolerance', inst_tol)
        )

        print(f"\n[RepeatSection] Table '{tbl_name}' anchor='{anchor_text}'")

        tbl_anchor = (
            find_anchor(
                ocr_results, anchor_text,
                hint_position=tbl_hint,
                hint_tolerance=tbl_tol,
                image_size=image_size,
                ocr_results_fallback=ocr_results_original,
            )
            if anchor_text else None
        )

        if tbl_anchor:
            print(f"[RepeatSection] ✓ Anchor '{anchor_text}' → "
                  f"'{tbl_anchor['text']}' "
                  f"({tbl_anchor['x']},{tbl_anchor['y']}) "
                  f"score={tbl_anchor.get('score', '?')}")
        else:
            print(f"[RepeatSection] ✗ Anchor '{anchor_text}' tidak ditemukan "
                  f"— tabel '{tbl_name}' dilewati")

        rows, tbl_conf = extract_table(
            ocr_results, tbl_cfg, tbl_anchor, image_path=image_path
        )
        inst_result[tbl_key] = rows
        _tbl_col_cfg = tbl_cfg.get('columns', [])
        if _tbl_col_cfg:
            inst_result[tbl_key + '__col_order'] = [
                col['key'] for col in sorted(_tbl_col_cfg, key=lambda c: c.get('offset_x_start', 0))
            ]

        conf_str = f'{tbl_conf:.1f}%' if tbl_conf is not None else 'N/A'
        print(f"[RepeatSection] Tabel '{tbl_name}': "
              f"{len(rows)} baris | confidence={conf_str}")
        if tbl_conf is not None:
            inst_confs.append(tbl_conf)

    # ── Selesai ───────────────────────────────────────────────────────────────
    section_conf = (
        round(sum(inst_confs) / len(inst_confs), 1) if inst_confs else None
    )
    conf_str = f"{section_conf}%" if section_conf is not None else "N/A"
    print(f"[RepeatSection] '{inst_key}' selesai. confidence={conf_str}")
    logger.info(
        f"[RepeatExtractor] section '{section_name}' (key='{inst_key}'): "
        f"{len(fields_config)} fields, {len(tables_config)} tables "
        f"| confidence={section_conf}%"
    )
    # Return flat dict — ocr_engine menyimpannya sebagai repeating_data[sec_key]
    return inst_result, section_conf
