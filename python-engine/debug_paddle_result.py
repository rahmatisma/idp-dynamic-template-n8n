import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from app.services.ocr_engine import run_global_ocr

IMAGE_PATH = r'D:\laragon\www\idp-lintasarta\python-engine\storage\pages\temp_109_69f5be609a046_FORM PM POP GRAND MALL BEKASI-5\page_1.png'

if not os.path.exists(IMAGE_PATH):
    print("ERROR: File tidak ada:", IMAGE_PATH)
    pages_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "storage", "pages")
    for name in sorted(os.listdir(pages_dir), reverse=True)[:5]:
        page_path = os.path.join(pages_dir, name, "page_1.png")
        ok = "OK" if os.path.exists(page_path) else "XX"
        print(f"  [{ok}] {name}")
    sys.exit(1)

print("Menjalankan PaddleOCR global scan...")
results = run_global_ocr(IMAGE_PATH)
print(f"Total item terdeteksi: {len(results)}")
print()
print("{:>5} {:>5} {:>5} {:>4} {:>5}  Teks".format("Y","X","W","H","Conf"))
print("-" * 65)
for item in sorted(results, key=lambda x: x['y']):
    print("{:5d} {:5d} {:5d} {:4d} {:5.2f}  {}".format(
        item['y'], item['x'], item['w'], item['h'], item['confidence'], item['text']
    ))

print()
print("=== CEK NILAI KOLOM RESULT ===")
expected = ["Clean","Normal","Tighten","236","220","0,3","2,44","2,43","27","Berputar","OK","NOK"]
for keyword in expected:
    matches = [i for i in results if keyword.lower() in i['text'].lower()]
    if matches:
        for m in matches:
            print("  FOUND '{}' => '{}' y={} x={} conf={:.2f}".format(
                keyword, m['text'], m['y'], m['x'], m['confidence']))
    else:
        print("  MISS  '{}' => tidak ditemukan".format(keyword))

print()
print("=== ITEM DALAM X RANGE 400-850 (estimasi kolom Result) ===")
col_items = [i for i in results if 400 <= i['x'] <= 850]
if col_items:
    for item in sorted(col_items, key=lambda x: x['y']):
        print("  y={:4d} x={:4d}  '{}' conf={:.2f}".format(
            item['y'], item['x'], item['text'], item['confidence']))
else:
    print("  Tidak ada item dalam range x=400-850")
