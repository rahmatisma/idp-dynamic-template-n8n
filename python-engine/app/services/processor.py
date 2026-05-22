"""
app/services/processor.py
--------------------------
HybridProcessor — Orchestrator utama yang membungkus ocr_engine
dan menambahkan evaluasi kualitas TP/FP/FN per field.

Alur pipeline:
    PDF
      → ocr_engine.extract_document()   [Hybrid OCR: TrOCR + PaddleOCR]
      → HybridProcessor._evaluate_page() [Hitung TP/FP/FN per halaman]
      → Return enriched result           [Siap dikirim ke n8n / Laravel]

Definisi TP/FP/FN (tanpa ground truth):
    TP : Field dalam config yang berhasil diekstrak (nilai non-empty, panjang ≥ 2 karakter)
    FP : Field diekstrak tapi nilai sangat pendek (1 karakter) → kemungkinan noise OCR
    FN : Field dalam config yang hasilnya kosong/null → gagal diekstrak

Kenapa tidak butuh ground truth?
    Untuk evaluasi PROSES (monitoring pipeline), pendekatan ini cukup.
    Evaluasi AKURASI (vs gold label) dilakukan terpisah di tahap validasi Step 11.
"""

import logging

logger = logging.getLogger(__name__)


class HybridProcessor:
    """
    Orchestrator Hybrid OCR Pipeline sesuai Step 9 proposal.

    Pembagian tanggung jawab:
        ocr_engine.py   → Ekstraksi murni (Global OCR + template mapping + TrOCR crop)
        processor.py    → Evaluasi kualitas hasil (TP/FP/FN + Precision/Recall/F1)
        routes.py       → HTTP layer (terima request, return response ke n8n)
    """

    @staticmethod
    def process(
        pdf_path: str,
        template_code: str = None,
        document_id: int = None,
        all_templates: list = None,
    ) -> dict:
        """
        Entry point utama. Dipanggil dari routes.py.

        Args:
            pdf_path      : Path absolut ke file PDF
            template_code : Kode template (opsional, jika None → auto-detect)
            document_id   : ID dokumen dari Laravel (untuk logging)
            all_templates : Daftar template dari n8n (opsional, jika None → fetch sendiri)

        Returns:
            dict lengkap dengan tambahan kunci evaluasi:
              - tp_count     : Total field berhasil diekstrak (semua halaman)
              - fp_count     : Total field noise/meragukan (semua halaman)
              - fn_count     : Total field gagal diekstrak (semua halaman)
              - eval_summary : Precision, Recall, F1 agregat
        """
        # Import di sini untuk menghindari circular import
        from app.services.ocr_engine import extract_document

        logger.info(f"[HybridProcessor] Mulai proses dokumen ID #{document_id}")

        # ── STEP 1: Jalankan ekstraksi hybrid (TrOCR + PaddleOCR) ──
        result = extract_document(
            pdf_path=pdf_path,
            template_code=template_code,
            document_id=document_id,
            all_templates=all_templates,
        )

        # ── STEP 2: Evaluasi kualitas hasil per halaman ──
        total_tp = 0
        total_fp = 0
        total_fn = 0

        for page in result.get("pages", []):
            # Skip halaman yang gagal (template tidak terdeteksi)
            if page.get("status") == "failed":
                page["tp"] = 0
                page["fp"] = 0
                page["fn"] = 0
                continue

            tp, fp, fn = HybridProcessor._evaluate_page(page)

            # Tambahkan ke masing-masing halaman
            page["tp"] = tp
            page["fp"] = fp
            page["fn"] = fn

            total_tp += tp
            total_fp += fp
            total_fn += fn

            logger.info(
                f"[HybridProcessor] Halaman {page.get('page')}: "
                f"TP={tp} FP={fp} FN={fn}"
            )

        # ── STEP 3: Tambahkan summary agregat ke root result ──
        result["tp"] = total_tp
        result["fp"] = total_fp
        result["fn"] = total_fn
        result["eval_summary"] = HybridProcessor._build_eval_summary(
            total_tp, total_fp, total_fn
        )

        logger.info(
            f"[HybridProcessor] ✅ Selesai. "
            f"TP={total_tp} | FP={total_fp} | FN={total_fn} | "
            f"Confidence={result.get('confidence_score', 0):.1f} | "
            f"F1={result['eval_summary']['f1_score']}"
        )

        return result

    # ─────────────────────────────────────────────────────────────
    # PRIVATE HELPERS
    # ─────────────────────────────────────────────────────────────

    @staticmethod
    def _evaluate_page(page: dict) -> tuple:
        """
        Hitung TP/FP/FN dari satu halaman hasil ekstraksi.

        Sumber data:
          - page['fields'] : Hasil field_extractor (nested dict via json_builder)
          - page['tables'] : Hasil table_extractor (dict of list of rows)
        """
        tp = fp = fn = 0

        # ── Evaluasi Fixed Fields (header, document) ──
        fields_section = page.get("fields", {})
        flat_fields = HybridProcessor._flatten_fields(fields_section)

        for field_key, value in flat_fields.items():
            val_str = str(value).strip() if value is not None else ""

            if val_str == "" or val_str.lower() in ("null", "none"):
                fn += 1  # Field ada di config tapi tidak berhasil dibaca
                logger.debug(f"[Eval] FN → '{field_key}': kosong")
            elif len(val_str) == 1:
                fp += 1  # Terlalu pendek → kemungkinan noise OCR
                logger.debug(f"[Eval] FP → '{field_key}': '{val_str}' (terlalu pendek)")
            else:
                tp += 1  # Berhasil diekstrak
                logger.debug(f"[Eval] TP → '{field_key}': '{val_str[:30]}'")

        # ── Evaluasi Tabel (hitung per baris) ──
        tables_section = page.get("tables", {})
        for table_key, rows in tables_section.items():
            if not isinstance(rows, list):
                continue

            for row in rows:
                if not isinstance(row, dict):
                    continue

                # Skip metadata keys (_conf_*, _ocr_source_*) — bukan nilai field
                row_values = [str(v or "").strip() for k, v in row.items() if not k.startswith("_")]
                non_empty  = [v for v in row_values if v and v.lower() not in ("null", "none")]

                if not non_empty:
                    fn += 1  # Baris tabel kosong total = FN
                else:
                    # Hitung per sel dalam baris
                    for val in row_values:
                        if val == "" or val.lower() in ("null", "none"):
                            fn += 1
                        elif len(val) == 1:
                            fp += 1
                        else:
                            tp += 1

        return tp, fp, fn

    @staticmethod
    def _flatten_fields(fields_section: dict) -> dict:
        """
        Ratakan nested dict dari json_builder menjadi flat {group.key: value}.

        Input (dari json_builder):
            {
              "document": {"no_dok": "FM-LAP", "versi": "1.0"},
              "header": {"location": "Bekasi", "date_time": null},
              "descriptions": [...]   ← list diabaikan (dievaluasi via tables)
            }

        Output:
            {
              "document.no_dok":    "FM-LAP",
              "document.versi":     "1.0",
              "header.location":    "Bekasi",
              "header.date_time":   None
            }
        """
        flat = {}
        for group_key, group_val in fields_section.items():
            if isinstance(group_val, dict):
                for field_key, field_val in group_val.items():
                    # Skip metadata keys (_conf_*, _ocr_source_*) — bukan field nyata
                    if field_key.startswith("_"):
                        continue
                    # Hanya scalar values yang dievaluasi di sini
                    if not isinstance(field_val, (dict, list)):
                        flat[f"{group_key}.{field_key}"] = field_val
            # list (contoh: descriptions) → diabaikan, dievaluasi via tables section
        return flat

    @staticmethod
    def _build_eval_summary(tp: int, fp: int, fn: int) -> dict:
        """
        Hitung metrik evaluasi standar NLP/IR dari TP/FP/FN.

        Precision = TP / (TP + FP)  → Seberapa akurat yang kita klaim berhasil
        Recall    = TP / (TP + FN)  → Seberapa banyak field yang berhasil kita baca
        F1        = Harmonic mean(Precision, Recall)
        """
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall    = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1        = (
            (2 * precision * recall) / (precision + recall)
            if (precision + recall) > 0
            else 0.0
        )

        return {
            "precision": round(precision, 3),
            "recall":    round(recall, 3),
            "f1_score":  round(f1, 3),
        }
