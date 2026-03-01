"""
app/services/ocr_engine.py
---------------------------
Pipeline OCR utama sistem.

Saat ini berisi fungsi placeholder supaya Flask bisa jalan.
Akan diisi dengan logika PaddleOCR + TrOCR setelah
infrastruktur (Flask + n8n) terbukti berjalan.
"""

from typing import Any


def extract_document(pdf_path: str, template_code: str, document_id: int | None = None) -> dict[str, Any]:
    """
    Pipeline utama ekstraksi dokumen.
    
    PLACEHOLDER — belum ada logika OCR di sini.
    Mengembalikan data dummy supaya endpoint /extract bisa ditest
    sebelum OCR diimplementasi.

    Args:
        pdf_path: Path lengkap ke file PDF.
        template_code: Kode template yang dipakai (misal "form_pm_vendor_a").
        document_id: ID dokumen di database Laravel (opsional, untuk logging).

    Returns:
        Dict berisi extracted_data dan confidence_score.
    """

    print(f"[OCR Engine] PLACEHOLDER - Menerima dokumen #{document_id}")
    print(f"[OCR Engine] PDF: {pdf_path}")
    print(f"[OCR Engine] Template: {template_code}")
    print(f"[OCR Engine] (Logika OCR belum diimplementasi)")

    # Data dummy untuk test alur end-to-end
    return {
        "confidence_score": 0.0,
        "extracted_data": {
            "note": "PLACEHOLDER - OCR belum diimplementasi",
            "document_id": document_id,
            "template_code": template_code,
            "fields": []
        }
    }