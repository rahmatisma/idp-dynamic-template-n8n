"""
app/api/routes.py
------------------
Semua endpoint Flask yang bisa dipanggil oleh n8n dan Laravel.

Endpoint yang tersedia:
    GET  /health          → cek apakah server hidup
    POST /convert-pdf     → convert PDF ke PNG per halaman
    POST /extract         → jalankan OCR pada dokumen
"""

from flask import Blueprint, request, jsonify
from pathlib import Path
from app.services.pdf_converter import convert_if_not_exists
from app.services.ocr_engine import extract_document
from config.settings import INPUT_DIR

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

        pdf_path = Path(file_path)
        if not pdf_path.exists():
            return jsonify({"error": f"File tidak ditemukan: {file_path}"}), 404

        try:
            pages = convert_if_not_exists(str(pdf_path))
            page_paths = [str(p) for p in pages]

            return jsonify({
                "status":      "ok",
                "document_id": document_id,
                "total_pages": len(pages),
                "pages":       page_paths,
                # Halaman pertama untuk preview di canvas template editor
                "image_url":   f"http://localhost:5000/static/pages/{pdf_path.stem}/page_1.png",
            })
        except Exception as e:
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
@api_bp.route("/extract", methods=["POST"])
def extract():
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

    # Validasi input wajib
    if not file_path:
        return jsonify({"status": "failed", "error": "file_path wajib diisi"}), 400
    if not template_code:
        return jsonify({"status": "failed", "error": "template_code wajib diisi"}), 400

    pdf_path = Path(file_path)
    if not pdf_path.exists():
        return jsonify({
            "status":      "failed",
            "document_id": document_id,
            "error":       f"File PDF tidak ditemukan: {file_path}"
        }), 404

    try:
        # Jalankan pipeline OCR lengkap
        # extract_document ada di app/services/ocr_engine.py
        result = extract_document(
            pdf_path=str(pdf_path),
            template_code=template_code,
            document_id=document_id,
        )

        return jsonify({
            "status":           "ok",
            "document_id":      document_id,
            "confidence_score": result["confidence_score"],
            "extracted_data":   result["extracted_data"],
        })

    except FileNotFoundError as e:
        return jsonify({
            "status":      "failed",
            "document_id": document_id,
            "error":       str(e)
        }), 404

    except Exception as e:
        return jsonify({
            "status":      "failed",
            "document_id": document_id,
            "error":       f"Kesalahan saat ekstraksi: {str(e)}"
        }), 500


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
    print("  POST /extract")
    print("  GET  /static/pages/<filename>")
    print("  GET  /static/crops/<filename>")