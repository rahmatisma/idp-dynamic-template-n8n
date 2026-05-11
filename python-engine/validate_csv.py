"""
validate_csv.py — Validasi dataset/labels.csv sebelum fine-tuning TrOCR
Jalankan: python validate_csv.py
"""

import csv
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent / "Dataset" / "labels.csv"
RAW_DIR  = Path(__file__).resolve().parent / "Dataset" / "raw_crops"

# ── Baca CSV ─────────────────────────────────────────────────────────
valid_rows    = []
problem_rows  = []
empty_label   = []

print(f"\n{'='*55}")
print("  Validasi Dataset labels.csv")
print(f"{'='*55}")
print(f"  Path : {CSV_PATH}\n")

if not CSV_PATH.exists():
    print("  [ERROR] File labels.csv tidak ditemukan!")
    exit(1)

with open(CSV_PATH, newline="", encoding="utf-8") as f:
    reader = csv.reader(f)
    for line_num, row in enumerate(reader, start=1):
        if len(row) == 2:
            filename, label = row
            if label.strip() == "":
                empty_label.append((line_num, row))
            else:
                valid_rows.append((line_num, row))
        else:
            problem_rows.append((line_num, row))

total = len(valid_rows) + len(problem_rows) + len(empty_label)

# ── Cek file gambar ada di disk ──────────────────────────────────────
missing_files = []
for _, row in valid_rows:
    img_path = RAW_DIR / row[0]
    if not img_path.exists():
        missing_files.append(row[0])

# ── Cek label duplikat (filename sama, label beda) ───────────────────
seen = {}
duplicates = []
for _, row in valid_rows:
    fn = row[0]
    if fn in seen and seen[fn] != row[1]:
        duplicates.append((fn, seen[fn], row[1]))
    seen[fn] = row[1]

# ── Ringkasan ────────────────────────────────────────────────────────
print(f"  Total baris   : {total:,}")
print(f"  ✅ Valid       : {len(valid_rows):,}")
print(f"  ⚠️  Label kosong: {len(empty_label):,}")
print(f"  ❌ Bermasalah  : {len(problem_rows):,}  (kolom ≠ 2)")
print(f"  🔍 File hilang : {len(missing_files):,}  (gambar tidak ada di disk)")
print(f"  🔁 Duplikat    : {len(duplicates):,}  (filename sama, label beda)")

# ── 5 Contoh valid ───────────────────────────────────────────────────
print(f"\n{'─'*55}")
print("  5 Contoh Baris VALID:")
print(f"{'─'*55}")
for line_num, row in valid_rows[:5]:
    print(f"  Baris {line_num:>5} │ {row[0]:<35} │ '{row[1]}'")

# ── 5 Contoh bermasalah ──────────────────────────────────────────────
if problem_rows:
    print(f"\n{'─'*55}")
    print("  5 Contoh Baris BERMASALAH (kolom ≠ 2):")
    print(f"{'─'*55}")
    for line_num, row in problem_rows[:5]:
        print(f"  Baris {line_num:>5} │ {len(row)} kolom │ {row}")

# ── 5 Contoh label kosong ────────────────────────────────────────────
if empty_label:
    print(f"\n{'─'*55}")
    print("  5 Contoh Label KOSONG:")
    print(f"{'─'*55}")
    for line_num, row in empty_label[:5]:
        print(f"  Baris {line_num:>5} │ {row[0]}")

# ── 5 File hilang ────────────────────────────────────────────────────
if missing_files:
    print(f"\n{'─'*55}")
    print("  5 File Gambar TIDAK ADA di disk:")
    print(f"{'─'*55}")
    for fn in missing_files[:5]:
        print(f"  {fn}")

# ── Duplikat ─────────────────────────────────────────────────────────
if duplicates:
    print(f"\n{'─'*55}")
    print("  5 Duplikat (filename sama, label beda):")
    print(f"{'─'*55}")
    for fn, lbl1, lbl2 in duplicates[:5]:
        print(f"  {fn}")
        print(f"    Label 1 : '{lbl1}'")
        print(f"    Label 2 : '{lbl2}'")

# ── Verdict ──────────────────────────────────────────────────────────
print(f"\n{'='*55}")
issues = len(problem_rows) + len(empty_label) + len(missing_files) + len(duplicates)
min_rows = 100

if len(valid_rows) < min_rows:
    print(f"  ⛔ BELUM SIAP  — hanya {len(valid_rows)} baris valid, minimal {min_rows} untuk fine-tuning.")
elif issues == 0:
    print(f"  ✅ SIAP FINE-TUNING — {len(valid_rows):,} baris valid, tidak ada masalah.")
else:
    print(f"  ⚠️  PERLU DIBERSIHKAN dulu sebelum fine-tuning:")
    if problem_rows  : print(f"     - {len(problem_rows):,} baris format salah")
    if empty_label   : print(f"     - {len(empty_label):,} label masih kosong")
    if missing_files : print(f"     - {len(missing_files):,} file gambar tidak ditemukan")
    if duplicates    : print(f"     - {len(duplicates):,} entri duplikat konflik")
    print(f"     ({len(valid_rows):,} baris bersih siap dipakai)")
print(f"{'='*55}\n")
