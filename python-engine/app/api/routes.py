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
from flask import Blueprint, request, jsonify
from pathlib import Path
from app.services.pdf_converter import convert_if_not_exists
from app.services.ocr_engine import extract_document
from app.services.processor import HybridProcessor
from config.settings import INPUT_DIR

logger = logging.getLogger(__name__)
api_bp = Blueprint("api", __name__)


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

            return jsonify({
                "status":      "ok",
                "total_pages": len(pages),
                "image_url":   f"http://localhost:5000/static/pages/{stem}/page_1.png",
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

    # Resolusi Path Otomatis (Supabase vs Lokal)
    from config.settings import BASE_DIR
    if file_path.startswith("http://") or file_path.startswith("https://"):
        filename = Path(file_path).name
        pdf_path = INPUT_DIR / f"temp_{document_id}_{filename}"
        if not pdf_path.exists():
            try:
                from app.services.supabase_storage import download_from_supabase
                download_from_supabase(file_path, str(pdf_path))
            except Exception as e:
                return jsonify({"error": f"Gagal mendownload dari Supabase: {str(e)}"}), 500
    else:
        # Fallback lokal untuk testing atau Laragon
        pdf_path = Path(file_path)
        if not pdf_path.exists():
             pdf_path = BASE_DIR.parent / "storage" / "app" / "public" / file_path

    if not pdf_path.exists():
        return jsonify({"status": "failed", "error": f"File PDF tidak ditemukan: {pdf_path}"}), 404

    try:
        from app.services.ocr_engine import extract_document
        result = extract_document(
            pdf_path=str(pdf_path),
            template_code=template_code,
            document_id=document_id,
            all_templates=all_templates,
        )

        # Kembalikan seluruh hasil (termasuk array pages, total_pages, TP/FP/FN)
        return jsonify(result)

    except FileNotFoundError as e:
        return jsonify({
            "status":      "failed",
            "document_id": document_id,
            "error":       str(e)
        }), 200

    except Exception as e:
        logger.error(f"Error dalam process: {str(e)}", exc_info=True)
        return jsonify({
            "status":      "failed",
            "document_id": document_id,
            "error":       f"Kesalahan saat ekstraksi: {str(e)}"
        }), 200 # Kembalikan 200 agar n8n bisa memproses percabangan IF dengan mudah


# ── 4. Detect Header (Auto-Detect Helper) ─────────────────────
@api_bp.route("/detect-header", methods=["POST"])
def detect_header():
    """
    Endpoint untuk membantu Admin mendeteksi header secara otomatis 
    saat membuat template baru di Canvas Editor.
    
    Request JSON: { "file_path": "path/to/master.pdf" }
    """
    data = request.get_json()
    file_path = data.get("file_path")

    if not file_path:
        return jsonify({"error": "file_path wajib diisi"}), 400

    from config.settings import BASE_DIR
    from app.services.pdf_converter import convert_if_not_exists
    from app.services.ocr_service import read_header

    # Resolusi path
    input_path = Path(file_path)
    if not input_path.is_absolute():
        pdf_path = BASE_DIR.parent / "storage" / "app" / "public" / file_path
    else:
        pdf_path = input_path

    if not pdf_path.exists():
        return jsonify({"error": f"File tidak ditemukan: {pdf_path}"}), 404

    try:
        # 1. Pastikan sudah jadi image
        pages = convert_if_not_exists(str(pdf_path))
        if not pages:
            return jsonify({"error": "Gagal konversi PDF"}), 500

        # 2. Baca header (Kembaliannya sekarang DICT {title, doc_number})
        header_data = read_header(str(pages[0]))

        return jsonify({
            "status": "ok",
            "header": header_data,
            "suggestion": header_data['title'][:50] if header_data.get('title') else ""
        })

    except Exception as e:
        print(f"Error dalam detect-header: {str(e)}")
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

    # Pastikan path absolut
    if "storage/" in rel_path:
        full_path = BASE_DIR / rel_path
    else:
        full_path = Path(rel_path)

    if not full_path.exists():
        return jsonify({"error": f"Gambar tidak ditemukan: {rel_path}"}), 404

    # ── Routing ke engine yang tepat ──────────────────────────────
    print(f"[PredictOCR] text_type diterima: '{text_type}' | image: {rel_path}")

    if text_type == "handwritten":
        # Pakai TrOCR untuk tulisan tangan
        try:
            import app.services.trocr_service as trocr_svc
            from PIL import Image as PILImage

            print(f"[PredictOCR] TrOCR status → ready={trocr_svc._trocr_ready} | loading={trocr_svc._trocr_loading} | failed={trocr_svc._trocr_failed}")

            # Konversi box ratio → koordinat pixel absolut
            img = PILImage.open(str(full_path))
            img_w, img_h = img.size
            x1 = int(box['x'] * img_w)
            y1 = int(box['y'] * img_h)
            x2 = int((box['x'] + box['w']) * img_w)
            y2 = int((box['y'] + box['h']) * img_h)

            crop = trocr_svc.crop_image_for_trocr(str(full_path), (x1, y1, x2, y2))

            if trocr_svc._trocr_loading:
                from app.services.ocr_service import predict_text
                text   = predict_text(str(full_path), box)
                engine = "PaddleOCR (TrOCR masih loading...)"
            elif crop is not None:
                text, _conf = trocr_svc.read_handwritten(crop)
                engine = "TrOCR"
                if not text and not trocr_svc._trocr_ready:
                    from app.services.ocr_service import predict_text
                    text   = predict_text(str(full_path), box)
                    engine = "PaddleOCR (TrOCR belum siap)"
            else:
                text   = ""
                engine = "TrOCR (crop gagal)"

            print(f"[PredictOCR] Hasil TrOCR: engine={engine} | text='{text}'")

        except Exception as e:
            logger.error(f"[PredictOCR] TrOCR error: {e}")
            from app.services.ocr_service import predict_text
            text   = predict_text(str(full_path), box)
            engine = f"PaddleOCR (TrOCR error: {str(e)[:50]})"
    else:
        # Pakai PaddleOCR untuk teks cetak (default)
        from app.services.ocr_service import predict_text
        text   = predict_text(str(full_path), box)
        engine = "PaddleOCR"

    print(f"[PredictOCR] Final → engine={engine} | text='{text[:30]}'")

    return jsonify({
        "status": "ok",
        "text":   text,
        "engine": engine
    })


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
    print("  GET  /static/pages/<filename>")
    print("  GET  /static/crops/<filename>")