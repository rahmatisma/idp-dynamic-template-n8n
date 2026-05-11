import os, sys
# Paksa UTF-8 agar emoji/karakter non-ASCII di model log tidak crash di Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv()

import app.services.pdf_converter as pc
def mock_convert(path):
    print(f"Mocking convert for {path}")
    return [path]
pc.convert_if_not_exists = mock_convert

from app.services.ocr_engine import extract_document
from app.services.trocr_service import _load_trocr
import json

# Load TrOCR secara sinkron agar hasil handwritten terisi (bukan fallback PaddleOCR)
print("Loading TrOCR model (sinkron)...")
_load_trocr()
print("TrOCR siap.")

IMAGE_PATH = r'D:\laragon\www\idp-lintasarta\python-engine\storage\pages\temp_109_69f5be609a046_FORM PM POP GRAND MALL BEKASI-5\page_1.png'

if not os.path.exists(IMAGE_PATH):
    print("ERROR: File tidak ada:", IMAGE_PATH)
    pages_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "storage", "pages")
    for name in sorted(os.listdir(pages_dir), reverse=True)[:5]:
        page_path = os.path.join(pages_dir, name, "page_1.png")
        if os.path.exists(page_path):
            print(f"Menggunakan: {page_path}")
            IMAGE_PATH = page_path
            break

print("Running extract_document...")
res = extract_document(IMAGE_PATH)
print("Done.")

print("=== RAW RES ===")
print(json.dumps(res, indent=2, ensure_ascii=False, default=str))
print()
print("=== OUTPUT TABLES ===")
for page in res.get('pages', []):
    print(f"\n[Page {page.get('page')}] template='{page.get('template_name','?')}' confidence={page.get('confidence')}")
    tables = page.get('tables', {})
    if not tables:
        print("  (tidak ada tabel)")
        continue
    for table_key, rows in tables.items():
        print(f"\n--- Tabel: {table_key} ({len(rows)} baris) ---")
        for i, row in enumerate(rows):
            result_val  = row.get('result', '')
            status_val  = row.get('status', '')
            src_result  = row.get('_ocr_source_result', '-')
            src_status  = row.get('_ocr_source_status', '-')
            conf_result = row.get('_conf_result', '')
            conf_status = row.get('_conf_status', '')
            print(
                f"  [{i+1:2d}] no='{row.get('no','')}' | "
                f"desc='{row.get('descriptions','')[:35]:<35}' | "
                f"result='{result_val:<10}' src={src_result:<7} conf={conf_result} | "
                f"status='{status_val:<10}' src={src_status:<7} conf={conf_status}"
            )
