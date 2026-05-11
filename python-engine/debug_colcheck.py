import os, sys
sys.path.insert(0, '.')
from dotenv import load_dotenv
load_dotenv()
from app.services.ocr_engine import fetch_active_templates

tmps = fetch_active_templates()
cols = tmps[0]['mapping_config']['tables'][0]['columns']
print("Kolom tabel descriptions:")
for c in cols:
    key    = c['key']
    xs     = c.get('offset_x_start', 'N/A')
    xe     = c.get('offset_x_end', 'N/A')
    anchor = c.get('is_row_anchor', False)
    multi  = c.get('multi_line', False)
    side   = "KIRI (left_col)" if isinstance(xs, (int,float)) and xs < 0 else "kanan"
    print("  {:15s}  x_start={:>6}  x_end={:>6}  is_row_anchor={}  multi_line={}  {}".format(
        key, xs, xe, anchor, multi, side
    ))
