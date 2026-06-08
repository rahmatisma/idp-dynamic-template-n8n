"""
app/api/routes.py
------------------
Semua endpoint Flask yang bisa dipanggil oleh n8n dan Laravel.

Endpoint yang tersedia:
    GET  /health          → cek apakah server hidup
    POST /convert-pdf     → convert PDF ke PNG per halaman
    POST /extract         → jalankan OCR pada dokumen
"""

import logging
import requests as _requests
from flask import Blueprint, request, jsonify
from pathlib import Path
from app.services.pdf_converter import convert_if_not_exists
from app.services.processor import HybridProcessor
from config.settings import INPUT_DIR

logger = logging.getLogger(__name__)
api_bp = Blueprint("api", __name__)


def _notify_laravel_failed(document_id: int, error_msg: str):
    """
    Notifikasi darurat ke Laravel bahwa dokumen gagal.
    Dipanggil ketika Python Engine error dan n8n mungkin tidak bisa routing
    status 'failed' kembali ke Laravel secara normal.
    """
    if not document_id:
        return
    from config.settings import LARAVEL_API_URL
    url = f"{LARAVEL_API_URL}/api/webhook/ocr-result"
    payload = {
        'document_id': document_id,
        'status': 'failed',
        'error': str(error_msg)[:500],
    }
    try:
        resp = _requests.patch(url, json=payload, timeout=5)
        if resp.ok:
            print(f"[NOTIFY] ✅ Laravel dinotifikasi: dokumen #{document_id} → FAILED")
        else:
            print(f"[NOTIFY] ⚠️  Laravel jawab {resp.status_code}: {resp.text[:100]}")
    except Exception as e:
        print(f"[NOTIFY] ❌ Tidak bisa hubungi Laravel ({url}): {e}")


# ── 1. Health Check ────────────────────────────────────────────
@api_bp.route("/health", methods=["GET"])
def health():
    """
    Endpoint untuk memastikan Python Engine hidup.
    Dipanggil Laravel saat pertama kali booting untuk cek koneksi.
    
    Response:
        { "status": "ok", "message": "Python Engine berjalan!" }
    """
    return jsonify({
        "status": "ok",
        "message": "Python Engine berjalan!"
    })


# ── 2. Convert PDF ke PNG ──────────────────────────────────────
@api_bp.route("/convert-pdf", methods=["POST"])
def convert_pdf():
    """
    Menerima path file PDF, mengkonversinya ke PNG per halaman.
    Dipanggil oleh:
        - n8n (saat dokumen baru diupload user)
        - Laravel TemplateController (saat Admin upload PDF master template)

    Request body (JSON):
        {
            "document_id": 1,
            "file_path": "C:/laragon/www/idp-lintasarta/storage/app/public/documents/namafile.pdf"
        }
    
    ATAU form-data (dari TemplateController):
        file: <binary PDF>

    Response:
        {
            "status": "ok",
            "document_id": 1,
            "total_pages": 3,
            "pages": [
                "storage/pages/namafile/page_1.png",
                "storage/pages/namafile/page_2.png",
                "storage/pages/namafile/page_3.png"
            ],
            "image_url": "http://localhost:5000/static/pages/namafile/page_1.png"
        }
    """

    # ── Kasus 1: Dipanggil n8n via JSON ──────────────────────
    if request.is_json:
        data = request.get_json()
        document_id = data.get("document_id")
        file_path   = data.get("file_path")

        if not file_path:
            return jsonify({"error": "file_path wajib diisi"}), 400

        file_path = str(file_path).strip()

        # Resolusi Path Otomatis (Supabase vs Lokal)
        from config.settings import BASE_DIR
        if file_path.lower().startswith("http"):
            filename = Path(file_path).name
            pdf_path = INPUT_DIR / f"temp_{document_id}_{filename}"
            if not pdf_path.exists():
                try:
                    from app.services.supabase_storage import download_from_supabase
                    download_from_supabase(file_path, str(pdf_path))
                except Exception as e:
                    logger.error(f"[Supabase] Gagal download: {str(e)}")
                    return jsonify({"error": f"Gagal mendownload dari Supabase: {str(e)}"}), 500
        else:
            # Fallback lokal untuk testing atau Laragon
            pdf_path = Path(file_path)
            if not pdf_path.exists():
                 pdf_path = BASE_DIR.parent / "storage" / "app" / "public" / file_path

        if not pdf_path.exists():
            logger.error(f"[Convert] File tidak ditemukan di path: {pdf_path}")
            return jsonify({"error": f"File tidak ditemukan: {file_path}"}), 404

        # ── Jalankan Konversi ──
        try:
            pages = convert_if_not_exists(str(pdf_path))
            page_paths = [str(p) for p in pages]

            return jsonify({
                "status":      "ok",
                "document_id": document_id,
                "total_pages": len(pages),
                "pages":       page_paths,
                # Halaman pertama untuk preview
                "image_url":   f"http://localhost:5000/static/pages/{pdf_path.stem}/page_1.png",
            })
        except Exception as e:
            logger.error(f"[Convert] Gagal konversi: {str(e)}")
            return jsonify({"error": str(e)}), 500

    # ── Kasus 2: Dipanggil Laravel TemplateController via form-data ──
    if "pdf" in request.files:
        file = request.files["pdf"]
        if not file.filename or not file.filename.endswith(".pdf"):
            return jsonify({"error": "File harus berformat PDF"}), 400

        # Simpan sementara ke storage/inputs/
        save_path = INPUT_DIR / file.filename
        file.save(str(save_path))

        try:
            pages = convert_if_not_exists(str(save_path))
            stem  = save_path.stem
            base  = f"http://localhost:5000/static/pages/{stem}"

            return jsonify({
                "status":             "ok",
                "total_pages":        len(pages),
                "image_url":          f"{base}/page_1.png",
                "page_images":        [f"{base}/page_{i+1}.png" for i in range(len(pages))],
                "python_image_paths": [f"storage/pages/{stem}/page_{i+1}.png" for i in range(len(pages))],
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    return jsonify({"error": "Kirim JSON dengan file_path atau form-data dengan key 'pdf'"}), 400


# ── 3. Ekstraksi OCR ───────────────────────────────────────────
@api_bp.route("/process", methods=["POST"])
def process():
    """
    Endpoint utama OCR — menerima info dokumen dan template,
    menjalankan seluruh pipeline ekstraksi, mengembalikan hasil JSON.

    Dipanggil oleh n8n setelah /convert-pdf berhasil.

    Request body (JSON):
        {
            "document_id": 1,
            "file_path": "C:/laragon/.../namafile.pdf",
            "template_id": 3,
            "template_code": "form_pm_vendor_a"
        }

    Response sukses:
        {
            "status": "ok",
            "document_id": 1,
            "confidence_score": 87.5,
            "extracted_data": {
                "fields": [
                    {
                        "field_name": "location",
                        "anchor_keyword": "Location",
                        "value": "Grand Mall Bekasi",
                        "confidence": 0.92,
                        "field_type": "handwritten",
                        "crop_path": "crops/doc_1/location.png"
                    }
                ]
            }
        }

    Response gagal:
        {
            "status": "failed",
            "document_id": 1,
            "error": "Template tidak ditemukan"
        }
    """
    if not request.is_json:
        return jsonify({"error": "Content-Type harus application/json"}), 400

    data = request.get_json()

    document_id   = data.get("document_id")
    file_path     = data.get("file_path")
    template_code = data.get("template_code")
    
    # Sanitasi template_code dari n8n (seringkali mengirim string 'null' atau 'undefined')
    if template_code in ["", "null", "undefined", "None", "[object Object]"] or not isinstance(template_code, str):
        template_code = None
        
    all_templates = data.get("all_templates", [])

    if not file_path:
        return jsonify({"status": "failed", "error": "file_path wajib diisi"}), 400

    print(f"\n{'='*60}")
    print(f"[PROSES] Dokumen ID #{document_id}")
    print(f"[PROSES] Template   : {template_code or '(Auto-Detect)'}")
    print(f"[PROSES] File       : {file_path[:80]}")
    print(f"{'='*60}")

    # Resolusi Path Otomatis (Supabase vs Lokal)
    from config.settings import BASE_DIR
    if file_path.startswith("http://") or file_path.startswith("https://"):
        filename = Path(file_path).name
        pdf_path = INPUT_DIR / f"temp_{document_id}_{filename}"
        if not pdf_path.exists():
            print(f"[PROSES] ⬇️  Download dari Supabase: {filename}")
            try:
                from app.services.supabase_storage import download_from_supabase
                download_from_supabase(file_path, str(pdf_path))
                print(f"[PROSES] ✅ Download selesai → {pdf_path}")
            except Exception as e:
                error_msg = f"Gagal mendownload dari Supabase: {str(e)}"
                print(f"[PROSES] ❌ {error_msg}")
                _notify_laravel_failed(document_id, error_msg)
                return jsonify({"error": error_msg}), 500
    else:
        # Fallback lokal untuk testing atau Laragon
        pdf_path = Path(file_path)
        if not pdf_path.exists():
             pdf_path = BASE_DIR.parent / "storage" / "app" / "public" / file_path

    if not pdf_path.exists():
        error_msg = f"File PDF tidak ditemukan: {pdf_path}"
        print(f"[PROSES] ❌ {error_msg}")
        _notify_laravel_failed(document_id, error_msg)
        return jsonify({"status": "failed", "error": error_msg}), 404

    try:
        print(f"[PROSES] ▶️  Memulai pipeline OCR...")
        result = HybridProcessor.process(
            pdf_path=str(pdf_path),
            template_code=template_code,
            document_id=document_id,
            all_templates=all_templates,
        )

        # Jika semua halaman gagal (template tidak dikenali), notifikasi Laravel
        all_failed = result.get("pages") and all(
            p.get("status") == "failed" for p in result["pages"]
        )
        if all_failed:
            first_err = result["pages"][0].get("error", "Template tidak dikenali")
            print(f"[PROSES] ❌ Semua halaman gagal: {first_err}")
            _notify_laravel_failed(document_id, first_err)

        conf = result.get("confidence_score", 0)
        pages = result.get("total_pages", 0)
        print(f"[PROSES] ✅ Selesai — {pages} hal | confidence: {conf:.1f}%")
        print(f"{'='*60}\n")
        return jsonify(result)

    except FileNotFoundError as e:
        error_msg = str(e)
        print(f"[PROSES] ❌ File tidak ditemukan: {error_msg}")
        _notify_laravel_failed(document_id, error_msg)
        return jsonify({
            "status":      "failed",
            "document_id": document_id,
            "error":       error_msg
        }), 200

    except Exception as e:
        error_msg = f"Kesalahan saat ekstraksi: {str(e)}"
        print(f"[PROSES] ❌ ERROR: {error_msg}")
        logger.error(error_msg, exc_info=True)
        _notify_laravel_failed(document_id, error_msg)
        return jsonify({
            "status":      "failed",
            "document_id": document_id,
            "error":       error_msg
        }), 200


# ── 4. Detect Header (Auto-Detect Helper) ─────────────────────
@api_bp.route("/detect-header", methods=["POST"])
def detect_header():
    """
    Endpoint untuk membantu Admin mendeteksi header secara otomatis 
    saat membuat template baru di Canvas Editor.
    
    Request JSON: { "file_path": "path/to/master.pdf" }
    """
    data = request.get_json()
    file_path  = data.get("file_path")
    image_path = data.get("image_path")  # path PNG yang sudah ada di server Python (opsional)

    if not file_path:
        return jsonify({"error": "file_path wajib diisi"}), 400

    from config.settings import BASE_DIR
    from app.services.pdf_converter import convert_if_not_exists
    from app.services.ocr_service import read_header

    print(f"[DetectHeader] file_path  : {file_path[:80]}")

    # Prioritas 1: gunakan image_path PNG yang sudah ada (dari /convert-pdf sebelumnya)
    # Ini menghindari keharusan akses file PDF di filesystem Laravel (berbeda server/OS)
    page_image = None
    if image_path:
        candidate = BASE_DIR / image_path if not Path(image_path).is_absolute() else Path(image_path)
        print(f"[DetectHeader] image_path : {image_path}")
        print(f"[DetectHeader] image_full : {candidate}")
        print(f"[DetectHeader] img_exists : {candidate.exists()}")
        if candidate.exists():
            page_image = str(candidate)
            print(f"[DetectHeader] ✅ Menggunakan PNG yang sudah ada, skip konversi PDF")

    if not page_image:
        # Prioritas 2: konversi dari PDF
        input_path = Path(file_path)
        if input_path.is_absolute():
            pdf_path = input_path
        else:
            pdf_path = BASE_DIR.parent / "storage" / "app" / "public" / file_path

        print(f"[DetectHeader] pdf_path   : {pdf_path}")
        print(f"[DetectHeader] file_exists: {pdf_path.exists()}")

        if not pdf_path.exists():
            print(f"[DetectHeader] ❌ File PDF tidak ditemukan dan image_path juga tidak tersedia!")
            return jsonify({"error": f"File tidak ditemukan: {pdf_path}"}), 404

        print(f"[DetectHeader] Mengkonversi PDF ke gambar...")
        pages = convert_if_not_exists(str(pdf_path))
        if not pages:
            return jsonify({"error": "Gagal konversi PDF ke gambar"}), 500
        page_image = str(pages[0])
        print(f"[DetectHeader] Gambar siap: {page_image}")

    try:
        # 2. Baca header dari halaman pertama
        print(f"[DetectHeader] Membaca header dokumen...")
        header_data = read_header(page_image)

        title   = header_data.get('title', '')
        doc_num = header_data.get('doc_number', '')
        version = header_data.get('version', '')
        conf    = header_data.get('confidence', 0)

        print(f"[DetectHeader] ✅ Hasil:")
        print(f"  Title     : '{title}'")
        print(f"  Doc Number: '{doc_num}'")
        print(f"  Version   : '{version}'")
        print(f"  Confidence: {conf:.2f}")

        if not title:
            print(f"[DetectHeader] ⚠️  Title kosong — header mungkin tidak terbaca dengan baik")

        return jsonify({
            "status": "ok",
            "header": header_data,
            "suggestion": title[:50] if title else ""
        })

    except Exception as e:
        print(f"[DetectHeader] ❌ Error: {str(e)}")
        logger.error(f"[DetectHeader] Error: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ── 4. Predict OCR (Real-time Feedback) ───────────────────────
@api_bp.route("/predict-ocr", methods=["POST"])
def predict_ocr():
    """
    Endpoint untuk OCR cepat pada area tertentu (crop).
    Dipanggil Laravel saat Admin menggambar kotak di editor.

    Request JSON:
        {
            "image_path": "storage/pages/namafile/page_1.png",
            "box": { "x": 0.1, "y": 0.2, "w": 0.05, "h": 0.02 },
            "text_type": "printed" | "handwritten"  ← opsional, default: printed
        }
    """
    from config.settings import BASE_DIR

    data      = request.get_json()
    rel_path  = data.get("image_path")
    box       = data.get("box")
    text_type = data.get("text_type", "printed")

    if not rel_path:
        return jsonify({"error": "image_path wajib diisi"}), 400

    # Resolusi path: absolut langsung pakai, relatif gabung dengan BASE_DIR
    if Path(rel_path).is_absolute():
        full_path = Path(rel_path)
    elif "storage/" in rel_path:
        full_path = BASE_DIR / rel_path
    else:
        full_path = BASE_DIR / "storage" / rel_path

    print(f"[PredictOCR] image_path  : {rel_path[:80]}")
    print(f"[PredictOCR] full_path   : {full_path}")
    print(f"[PredictOCR] file_exists : {full_path.exists()}")
    print(f"[PredictOCR] text_type   : '{text_type}' | box: {box}")

    if not full_path.exists():
        print(f"[PredictOCR] ❌ File gambar tidak ditemukan!")
        return jsonify({"error": f"Gambar tidak ditemukan: {full_path}"}), 404

    from app.services.ocr_service import predict_text

    if text_type == "handwritten":
        # Pakai TrOCR untuk tulisan tangan
        try:
            import app.services.trocr_service as trocr_svc
            from PIL import Image as PILImage

            print(f"[PredictOCR] TrOCR status → ready={trocr_svc._trocr_ready} | loading={trocr_svc._trocr_loading} | failed={trocr_svc._trocr_failed}")

            if trocr_svc._trocr_loading:
                return jsonify({"status": "error", "message": "TrOCR masih loading, coba lagi dalam beberapa detik"})

            # Konversi box ratio → koordinat pixel absolut
            img = PILImage.open(str(full_path))
            img_w, img_h = img.size
            x1 = int(box['x'] * img_w)
            y1 = int(box['y'] * img_h)
            x2 = int((box['x'] + box['w']) * img_w)
            y2 = int((box['y'] + box['h']) * img_h)
            print(f"[PredictOCR] Crop coords: ({x1},{y1}) → ({x2},{y2}) | img: {img_w}×{img_h}")

            crop = trocr_svc.crop_image_for_trocr(str(full_path), (x1, y1, x2, y2))

            if crop is None:
                return jsonify({"status": "error", "message": "Crop gagal, coba perbesar area seleksi"})

            text, _conf = trocr_svc.read_handwritten(crop)
            engine = "TrOCR"

            print(f"[PredictOCR] Hasil TrOCR: engine={engine} | text='{text}'")

        except Exception as e:
            logger.error(f"[PredictOCR] TrOCR error: {e}")
            return jsonify({"status": "error", "message": f"TrOCR error: {str(e)[:100]}"})
    else:
        # Printed text → PaddleOCR
        text   = predict_text(str(full_path), box)
        engine = "PaddleOCR"

    print(f"[PredictOCR] ✅ Final → engine='{engine}' | text='{text[:50] if text else '(kosong)'}'")

    return jsonify({
        "status": "ok",
        "text":   text,
        "engine": engine
    })


# ── 6. Debug OCR (Global Scan Bounding Boxes) ─────────────────
@api_bp.route("/debug-ocr", methods=["POST"])
def debug_ocr():
    """
    Jalankan global OCR scan dan kembalikan seluruh bounding box
    beserta dimensi gambar. Berguna untuk debugging anchor/offset
    di template editor.

    Request JSON:
        { "image_path": "storage/pages/namafile/page_1.png" }

    Response:
        {
            "image_width": 2499,
            "image_height": 3513,
            "boxes": [
                { "text": "No.Dok.", "x": 351, "y": 171,
                  "w": 185, "h": 62, "confidence": 0.97 }
            ]
        }
    """
    from config.settings import BASE_DIR
    from app.services.ocr_engine import run_global_ocr
    from PIL import Image as PILImage

    data     = request.get_json()
    rel_path = data.get("image_path") if data else None

    if not rel_path:
        return jsonify({"error": "image_path wajib diisi"}), 400

    if Path(rel_path).is_absolute():
        full_path = Path(rel_path)
    elif "storage/" in rel_path:
        full_path = BASE_DIR / rel_path
    else:
        full_path = BASE_DIR / "storage" / rel_path

    print(f"[DebugOCR] image_path  : {rel_path[:80]}")
    print(f"[DebugOCR] full_path   : {full_path}")
    print(f"[DebugOCR] file_exists : {full_path.exists()}")

    if not full_path.exists():
        return jsonify({"error": f"Gambar tidak ditemukan: {full_path}"}), 404

    try:
        img = PILImage.open(str(full_path))
        img_w, img_h = img.size

        boxes = run_global_ocr(str(full_path))
        print(f"[DebugOCR] ✅ {len(boxes)} box ditemukan | ukuran: {img_w}×{img_h}")

        return jsonify({
            "image_width":  img_w,
            "image_height": img_h,
            "boxes":        boxes,
        })

    except Exception as e:
        logger.error(f"[DebugOCR] Error: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ── 7. Debug Template Mapping ──────────────────────────────────
@api_bp.route("/debug-template", methods=["POST"])
def debug_template():
    """
    Jalankan global OCR + template mapping dan kembalikan posisi anchor/value
    per field dan per tabel. Berguna untuk debug config mapping_config.

    Request JSON:
        {
            "image_path":     "storage/pages/namafile/page_1.png",
            "mapping_config": { "fields": [...], "tables": [...] }
        }

    Response:
        {
            "image_width": 2499,
            "image_height": 3513,
            "fields": [
                {
                    "field_name": "no_dok",
                    "anchor_text": "No.Dok.",
                    "field_type": "printed",
                    "found": true,
                    "anchor":    {"text": "No.Dok.", "x": 351, "y": 171, "w": 185, "h": 62},
                    "value_box": {"x": 589, "y": 169, "w": 524, "h": 67}
                }
            ],
            "tables": [
                {
                    "table_name": "Checklist",
                    "anchor_text": "Descriptions",
                    "found": true,
                    "anchor": {"text": "Descriptions", "x": 690, "y": 754, "w": 250, "h": 58},
                    "area":   {"x": 351, "y": 812, "w": 1322, "h": 1143},
                    "columns": [
                        {"name": "No", "x_start": 351, "x_end": 447, "type": "printed"}
                    ]
                }
            ]
        }
    """
    from config.settings import BASE_DIR
    from app.services.ocr_engine import run_global_ocr
    from app.services.template_mapper import find_anchor, calculate_target_box
    from PIL import Image as PILImage

    data           = request.get_json()
    rel_path       = data.get("image_path") if data else None
    mapping_config = data.get("mapping_config", {}) if data else {}

    if not rel_path:
        return jsonify({"error": "image_path wajib diisi"}), 400

    if Path(rel_path).is_absolute():
        full_path = Path(rel_path)
    elif "storage/" in rel_path:
        full_path = BASE_DIR / rel_path
    else:
        full_path = BASE_DIR / "storage" / rel_path

    print(f"[DebugTemplate] image_path  : {rel_path[:80]}")
    print(f"[DebugTemplate] full_path   : {full_path}")
    print(f"[DebugTemplate] file_exists : {full_path.exists()}")

    if not full_path.exists():
        return jsonify({"error": f"Gambar tidak ditemukan: {full_path}"}), 404

    try:
        img = PILImage.open(str(full_path))
        img_w, img_h = img.size

        ocr_results = run_global_ocr(str(full_path))
        print(f"[DebugTemplate] Global OCR: {len(ocr_results)} item terdeteksi")

        fields_config = mapping_config.get("fields", [])
        tables_config = mapping_config.get("tables", [])

        # ── Proses Fields ──────────────────────────────────────────
        fields_out = []
        for field in fields_config:
            field_name  = field.get("field_name", "unknown")
            anchor_text = (field.get("anchor_text") or "").strip()
            offset_x    = int(field.get("offset_x", 0))
            offset_y    = int(field.get("offset_y", 0))
            width       = int(field.get("width", 100))
            height      = int(field.get("height", 50))

            anchor = find_anchor(ocr_results, anchor_text) if anchor_text else None

            entry = {
                "field_name":  field_name,
                "anchor_text": anchor_text,
                "field_type":  field.get("type", "printed"),
                "found":       anchor is not None,
                "anchor":      None,
                "value_box":   None,
            }

            if anchor:
                entry["anchor"] = {
                    "text": anchor["text"],
                    "x": anchor["x"], "y": anchor["y"],
                    "w": anchor["w"], "h": anchor["h"],
                }
                x1, y1, x2, y2 = calculate_target_box(anchor, offset_x, offset_y, width, height)
                entry["value_box"] = {
                    "x": int(x1), "y": int(y1),
                    "w": int(x2 - x1), "h": int(y2 - y1),
                }

            fields_out.append(entry)

        # ── Proses Tables ──────────────────────────────────────────
        tables_out = []
        for table_cfg in tables_config:
            table_name   = table_cfg.get("table_name", "unknown")
            anchor_texts = table_cfg.get("anchor", {}).get("texts", [])
            anchor_text  = (anchor_texts[0] if anchor_texts else "").strip()

            anchor = find_anchor(ocr_results, anchor_text) if anchor_text else None

            entry = {
                "table_name":  table_name,
                "anchor_text": anchor_text,
                "found":       anchor is not None,
                "anchor":      None,
                "area":        None,
                "columns":     [],
            }

            if anchor:
                entry["anchor"] = {
                    "text": anchor["text"],
                    "x": anchor["x"], "y": anchor["y"],
                    "w": anchor["w"], "h": anchor["h"],
                }

                area_cfg     = table_cfg.get("area", {})
                offset_y_val = int(area_cfg.get("offset_y", 0))
                area_height  = int(area_cfg.get("height", 500))
                area_y1      = anchor["y"] + offset_y_val

                print(f"[DebugTemplate] Table '{table_name}' anchor at x={anchor['x']}, "
                      f"offset_y={offset_y_val}")

                columns_cfg = table_cfg.get("columns", [])
                if columns_cfg:
                    xs = (
                        [anchor["x"] + int(c.get("offset_x_start", 0)) for c in columns_cfg]
                        + [anchor["x"] + int(c.get("offset_x_end",   0)) for c in columns_cfg]
                    )
                    area_x1 = max(0, min(xs))
                    area_x2 = max(xs)
                else:
                    area_x1 = anchor["x"]
                    area_x2 = anchor["x"] + 500

                entry["area"] = {
                    "x": int(area_x1), "y": int(area_y1),
                    "w": int(area_x2 - area_x1), "h": int(area_height),
                }

                for col in columns_cfg:
                    entry["columns"].append({
                        "name":    col.get("name", col.get("col_name", "?")),
                        "x_start": int(anchor["x"] + int(col.get("offset_x_start", 0))),
                        "x_end":   int(anchor["x"] + int(col.get("offset_x_end",   0))),
                        "type":    col.get("type", "printed"),
                    })

            tables_out.append(entry)

        # ── Proses Repeating Sections ────────────────────────────────
        repeating_out = []
        for sec_cfg in mapping_config.get("repeating_sections", []):
            sec_name    = sec_cfg.get("section_name", "section")
            sec_key     = sec_cfg.get("json_key", sec_name)
            sec_hint    = sec_cfg.get("hint_position")
            sec_tol     = float(sec_cfg.get("hint_tolerance", 0.08))
            sec_anchor_text = (sec_cfg.get("anchor_text") or "").strip()
            img_size    = (img_w, img_h)

            sec_anchor = find_anchor(ocr_results, sec_anchor_text, hint_position=sec_hint, hint_tolerance=sec_tol, image_size=img_size) if sec_anchor_text else None

            sec_entry = {
                "section_name": sec_name,
                "json_key":     sec_key,
                "anchor_text":  sec_anchor_text,
                "found":        sec_anchor is not None,
                "anchor":       None,
                "fields":       [],
                "tables":       [],
            }

            if sec_anchor:
                sec_entry["anchor"] = {
                    "text": sec_anchor["text"],
                    "x": sec_anchor["x"], "y": sec_anchor["y"],
                    "w": sec_anchor["w"], "h": sec_anchor["h"],
                }

            for field in sec_cfg.get("fields", []):
                f_name      = field.get("field_name", "unknown")
                f_anchor    = (field.get("anchor_text") or "").strip()
                f_hint      = field.get("hint_position") or sec_hint
                f_tol       = float(field.get("hint_tolerance", sec_tol))
                f_off_x     = int(field.get("offset_x", 0))
                f_off_y     = int(field.get("offset_y", 0))
                f_width     = int(field.get("width", 100))
                f_height    = int(field.get("height", 50))

                f_anchor_r  = find_anchor(ocr_results, f_anchor, hint_position=f_hint, hint_tolerance=f_tol, image_size=img_size) if f_anchor else None
                f_entry     = {
                    "field_name":  f_name,
                    "anchor_text": f_anchor,
                    "found":       f_anchor_r is not None,
                    "anchor":      None,
                    "value_box":   None,
                }
                if f_anchor_r:
                    f_entry["anchor"] = {"text": f_anchor_r["text"], "x": f_anchor_r["x"], "y": f_anchor_r["y"], "w": f_anchor_r["w"], "h": f_anchor_r["h"]}
                    x1, y1, x2, y2 = calculate_target_box(f_anchor_r, f_off_x, f_off_y, f_width, f_height)
                    f_entry["value_box"] = {"x": int(x1), "y": int(y1), "w": int(x2-x1), "h": int(y2-y1)}
                sec_entry["fields"].append(f_entry)

            for tbl in sec_cfg.get("tables", []):
                t_name   = tbl.get("table_name", "table")
                t_key    = tbl.get("json_key", t_name)
                t_texts  = tbl.get("anchor", {}).get("texts", [])
                t_anchor_text = (t_texts[0] if t_texts else "").strip()
                t_hint   = tbl.get("anchor", {}).get("hint_position") or sec_hint
                t_tol    = float(tbl.get("anchor", {}).get("hint_tolerance", sec_tol))
                t_anchor_r = find_anchor(ocr_results, t_anchor_text, hint_position=t_hint, hint_tolerance=t_tol, image_size=img_size) if t_anchor_text else None
                t_entry  = {
                    "table_name":  t_name,
                    "anchor_text": t_anchor_text,
                    "found":       t_anchor_r is not None,
                    "anchor":      None,
                    "area":        None,
                    "area_label":  f"{sec_key}_{t_key}_area",
                    "columns":     [],
                }
                if t_anchor_r:
                    t_entry["anchor"] = {"text": t_anchor_r["text"], "x": t_anchor_r["x"], "y": t_anchor_r["y"], "w": t_anchor_r["w"], "h": t_anchor_r["h"]}
                    t_area_cfg  = tbl.get("area", {})
                    t_offset_y  = int(t_area_cfg.get("offset_y", 0))
                    t_height    = int(t_area_cfg.get("height", 500))
                    t_area_y1   = t_anchor_r["y"] + t_offset_y
                    t_cols_cfg  = tbl.get("columns", [])
                    if t_cols_cfg:
                        xs = (
                            [t_anchor_r["x"] + int(c.get("offset_x_start", 0)) for c in t_cols_cfg]
                            + [t_anchor_r["x"] + int(c.get("offset_x_end",   0)) for c in t_cols_cfg]
                        )
                        t_area_x1 = max(0, min(xs))
                        t_area_x2 = max(xs)
                    else:
                        t_area_x1 = t_anchor_r["x"]
                        t_area_x2 = t_anchor_r["x"] + 500
                    t_entry["area"] = {
                        "x": int(t_area_x1), "y": int(t_area_y1),
                        "w": int(t_area_x2 - t_area_x1), "h": int(t_height),
                    }
                    for col in t_cols_cfg:
                        t_entry["columns"].append({
                            "name":    col.get("name", col.get("col_name", "?")),
                            "x_start": int(t_anchor_r["x"] + int(col.get("offset_x_start", 0))),
                            "x_end":   int(t_anchor_r["x"] + int(col.get("offset_x_end",   0))),
                            "type":    col.get("type", "printed"),
                        })
                sec_entry["tables"].append(t_entry)

            repeating_out.append(sec_entry)

        found_f  = sum(1 for f in fields_out if f["found"])
        found_t  = sum(1 for t in tables_out if t["found"])
        found_rs = sum(1 for s in repeating_out if s["found"])
        print(f"[DebugTemplate] ✅ Fields: {found_f}/{len(fields_out)} | Tables: {found_t}/{len(tables_out)} | Sections: {found_rs}/{len(repeating_out)}")

        return jsonify({
            "image_width":       img_w,
            "image_height":      img_h,
            "fields":            fields_out,
            "tables":            tables_out,
            "repeating_sections": repeating_out,
        })

    except Exception as e:
        logger.error(f"[DebugTemplate] Error: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ── Register semua blueprint ke Flask app ─────────────────────
def register_routes(app):
    """
    Dipanggil dari main.py untuk mendaftarkan semua endpoint.
    """
    app.register_blueprint(api_bp)

    # Serve file statis (PNG hasil convert dan crop)
    # Supaya gambar bisa diakses via URL dari Laravel dan n8n
    import os
    from flask import send_from_directory
    from config.settings import BASE_DIR

    @app.route("/static/pages/<path:filename>")
    def serve_pages(filename):
        """Serve PNG halaman dokumen untuk ditampilkan di canvas template editor."""
        pages_dir = BASE_DIR / "storage" / "pages"
        return send_from_directory(str(pages_dir), filename)

    @app.route("/static/crops/<path:filename>")
    def serve_crops(filename):
        """Serve PNG crop hasil OCR untuk ditampilkan di halaman validasi."""
        crops_dir = BASE_DIR / "storage" / "crops"
        return send_from_directory(str(crops_dir), filename)

    print("[Routes] Semua endpoint terdaftar:")
    print("  GET  /health")
    print("  POST /convert-pdf")
    print("  POST /process")
    print("  POST /detect-header")
    print("  POST /predict-ocr")
    print("  POST /debug-ocr")
    print("  POST /debug-template")
    print("  GET  /static/pages/<filename>")
    print("  GET  /static/crops/<filename>")