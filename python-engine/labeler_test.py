"""
labeler_test.py — TrOCR Dataset Labeling Tool (TEST SET)
Jalankan: python labeler_test.py
Akses   : http://localhost:5002

Perbedaan dari labeler_app.py:
  - Load gambar dari Dataset/test_set/
  - Simpan label ke Dataset/labels_test.csv (append-safe, tidak overwrite)
  - Progress disimpan di Dataset/labeler_test_progress.json
  - Port 5002 (bisa jalan bersamaan dengan labeler_app.py)
"""

import shutil
from flask import Flask, jsonify, request, send_file
from pathlib import Path
import csv, json

# ── PaddleOCR singleton (lazy load) ─────────────────────────────────
_paddle = None

def get_paddle():
    global _paddle
    if _paddle is None:
        from paddleocr import PaddleOCR
        _paddle = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    return _paddle

app = Flask(__name__)

BASE_DIR   = Path(__file__).resolve().parent
RAW_DIR    = BASE_DIR / "Dataset" / "test_set"       # <── test_set, bukan raw_crops
SAMPAH_DIR = BASE_DIR / "Dataset" / "sampah_test"
CSV_PATH   = BASE_DIR / "Dataset" / "labels_test.csv"
PROG_PATH  = BASE_DIR / "Dataset" / "labeler_test_progress.json"
EXTS       = {".png", ".jpg", ".jpeg", ".bmp", ".tiff"}

ALL_IMAGES = sorted(
    (p for p in RAW_DIR.rglob("*") if p.suffix.lower() in EXTS),
    key=lambda p: (p.parent.name, p.name),
)


def rel(p: Path) -> str:
    return p.relative_to(RAW_DIR).as_posix()


def reset_to_first_unlabeled():
    """Panggil saat startup: set current_idx ke gambar belum dilabel pertama."""
    labels = load_labels()
    for i, p in enumerate(ALL_IMAGES):
        if rel(p) not in labels:
            _, skipped = load_progress()
            save_progress(i, skipped)
            return i
    return -1


# ── CSV helpers ──────────────────────────────────────────────────────

def load_labels() -> dict:
    if not CSV_PATH.exists():
        return {}
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        return {row[0]: row[1] for row in csv.reader(f) if len(row) >= 2}


def write_labels(labels: dict):
    import os, time
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = CSV_PATH.with_suffix(".tmp")
    with open(tmp_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        for fn, lbl in labels.items():
            w.writerow([fn, lbl])
    # Ganti file asli; retry 3x jika masih dipakai program lain (misal Excel)
    for attempt in range(3):
        try:
            os.replace(tmp_path, CSV_PATH)
            return
        except PermissionError:
            if attempt < 2:
                time.sleep(0.5)
    raise PermissionError(
        f"Tidak bisa menyimpan {CSV_PATH.name} — tutup file di Excel atau program lain lalu coba lagi."
    )


# ── Progress helpers ─────────────────────────────────────────────────

def load_progress():
    if PROG_PATH.exists():
        d = json.loads(PROG_PATH.read_text(encoding="utf-8"))
        return d.get("current_idx", 0), set(d.get("skipped", []))
    return 0, set()


def save_progress(idx: int, skipped: set):
    PROG_PATH.parent.mkdir(parents=True, exist_ok=True)
    PROG_PATH.write_text(
        json.dumps({"current_idx": idx, "skipped": sorted(skipped)}),
        encoding="utf-8",
    )


# ── Routes ───────────────────────────────────────────────────────────

@app.route("/")
def index():
    return HTML


@app.route("/api/state")
def api_state():
    labels = load_labels()
    idx, skipped = load_progress()
    total = len(ALL_IMAGES)
    idx = max(0, min(idx, total - 1)) if total else 0
    img = ALL_IMAGES[idx] if total else None
    filename = rel(img) if img else ""
    return jsonify({
        "idx":      idx,
        "total":    total,
        "labeled":  len(labels),
        "skipped":  len(skipped),
        "filename": filename,
        "prefill":  labels.get(filename, ""),
    })


@app.route("/api/image/<int:idx>")
def api_image(idx):
    if 0 <= idx < len(ALL_IMAGES):
        return send_file(str(ALL_IMAGES[idx]), mimetype="image/png")
    return "Not found", 404


@app.route("/api/save", methods=["POST"])
def api_save():
    d     = request.json or {}
    idx   = int(d.get("idx", 0))
    label = d.get("label", "").strip()
    if not label:
        return jsonify({"ok": False, "msg": "Label tidak boleh kosong"}), 400
    if not (0 <= idx < len(ALL_IMAGES)):
        return jsonify({"ok": False, "msg": "Indeks tidak valid"}), 400

    labels   = load_labels()
    filename = rel(ALL_IMAGES[idx])
    labels[filename] = label
    write_labels(labels)

    _, skipped = load_progress()
    skipped.discard(filename)
    next_idx = min(idx + 1, len(ALL_IMAGES) - 1)
    save_progress(next_idx, skipped)
    return jsonify({"ok": True, "next_idx": next_idx})


@app.route("/api/skip", methods=["POST"])
def api_skip():
    d   = request.json or {}
    idx = int(d.get("idx", 0))
    if not (0 <= idx < len(ALL_IMAGES)):
        return jsonify({"ok": False}), 400
    _, skipped = load_progress()
    skipped.add(rel(ALL_IMAGES[idx]))
    next_idx = min(idx + 1, len(ALL_IMAGES) - 1)
    save_progress(next_idx, skipped)
    return jsonify({"ok": True})


@app.route("/api/back", methods=["POST"])
def api_back():
    d   = request.json or {}
    idx = int(d.get("idx", 0))
    _, skipped = load_progress()
    prev_idx = max(idx - 1, 0)
    save_progress(prev_idx, skipped)
    return jsonify({"ok": True})


@app.route("/api/reset-skips", methods=["POST"])
def api_reset_skips():
    """Hapus semua entri skipped — gambar yang sudah dilabel otomatis bersih."""
    cur_idx, skipped = load_progress()
    labels = load_labels()
    # Hapus skip hanya untuk yang belum punya label; yang sudah dilabel pasti bersih
    still_skipped = {f for f in skipped if f not in labels}
    save_progress(cur_idx, still_skipped)
    return jsonify({"ok": True, "removed": len(skipped) - len(still_skipped), "remaining": len(still_skipped)})


@app.route("/api/next", methods=["POST"])
def api_next():
    """Maju ke gambar berikutnya TANPA menambah skip."""
    d   = request.json or {}
    idx = int(d.get("idx", 0))
    _, skipped = load_progress()
    next_idx = min(idx + 1, len(ALL_IMAGES) - 1)
    save_progress(next_idx, skipped)
    return jsonify({"ok": True})


@app.route("/api/jump-unlabeled", methods=["POST"])
def api_jump_unlabeled():
    """Lompat ke gambar belum dilabel terdekat (maju atau mundur)."""
    d         = request.json or {}
    from_idx  = int(d.get("from", 0))
    direction = d.get("direction", "forward")
    labels    = load_labels()
    _, skipped = load_progress()

    if direction == "forward":
        search = range(from_idx + 1, len(ALL_IMAGES))
        # wrap-around dari awal jika tidak ketemu
        wrap   = range(0, from_idx + 1)
    else:
        search = range(from_idx - 1, -1, -1)
        wrap   = range(len(ALL_IMAGES) - 1, from_idx - 1, -1)

    for i in list(search) + list(wrap):
        if rel(ALL_IMAGES[i]) not in labels:
            save_progress(i, skipped)
            return jsonify({"ok": True, "idx": i})

    return jsonify({"ok": False, "msg": "Semua gambar sudah dilabel!"})


@app.route("/api/stats-unlabeled")
def api_stats_unlabeled():
    """Hitung berapa gambar belum dilabel dan posisi pertamanya."""
    labels   = load_labels()
    unlabeled = [i for i, p in enumerate(ALL_IMAGES) if rel(p) not in labels]
    first     = unlabeled[0] if unlabeled else -1
    return jsonify({"count": len(unlabeled), "first_idx": first})


@app.route("/api/ocr/<int:idx>")
def api_ocr(idx):
    """Auto-predict teks dari gambar menggunakan PaddleOCR."""
    if not (0 <= idx < len(ALL_IMAGES)):
        return jsonify({"text": ""})
    try:
        ocr    = get_paddle()
        result = ocr.ocr(str(ALL_IMAGES[idx]), cls=True)
        lines  = []
        if result and result[0]:
            # Urutkan baris dari atas ke bawah (koordinat Y)
            items = sorted(result[0], key=lambda x: x[0][0][1])
            lines = [item[1][0] for item in items if item[1][0].strip()]
        text = " ".join(lines).strip()
        return jsonify({"text": text})
    except Exception as e:
        return jsonify({"text": "", "error": str(e)})


@app.route("/api/delete", methods=["POST"])
def api_delete():
    d   = request.json or {}
    idx = int(d.get("idx", 0))
    if not (0 <= idx < len(ALL_IMAGES)):
        return jsonify({"ok": False, "msg": "Indeks tidak valid"}), 400

    img_path = ALL_IMAGES[idx]
    filename = rel(img_path)

    dest = SAMPAH_DIR / img_path.relative_to(RAW_DIR)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(img_path), str(dest))
    ALL_IMAGES.pop(idx)

    labels = load_labels()
    if filename in labels:
        del labels[filename]
        write_labels(labels)

    cur_idx, skipped = load_progress()
    skipped.discard(filename)
    if idx < cur_idx:
        cur_idx -= 1
    cur_idx = max(0, min(cur_idx, len(ALL_IMAGES) - 1))
    save_progress(cur_idx, skipped)

    return jsonify({"ok": True, "deleted": filename, "new_total": len(ALL_IMAGES)})


# ── HTML ─────────────────────────────────────────────────────────────

HTML = r"""<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>TrOCR Labeling Tool — TEST SET</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg:      #0d0d1a;
  --surface: #16162a;
  --border:  #2a2a4a;
  --accent:  #6c63ff;
  --green:   #3ddc84;
  --yellow:  #f9c74f;
  --red:     #ef476f;
  --text:    #e2e8f0;
  --muted:   #7c8ba1;
}
body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Segoe UI', system-ui, sans-serif;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Top bar ────────────────────────────────────────── */
#top-bar {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 10px 24px 12px;
  flex-shrink: 0;
}
#top-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
#pos-label { font-size: 15px; font-weight: 700; }
#pct-label { font-size: 13px; color: var(--muted); }
#bar-wrap  { background: var(--border); border-radius: 4px; height: 5px; overflow: hidden; }
#bar       { height: 100%; background: linear-gradient(90deg, var(--accent), var(--green)); transition: width .3s; }
#stats-row { display: flex; gap: 20px; margin-top: 7px; font-size: 12px; color: var(--muted); }
.stat-chip { display: flex; align-items: center; gap: 5px; }
.dot { width: 7px; height: 7px; border-radius: 50%; }
.dot-green  { background: var(--green); }
.dot-yellow { background: var(--yellow); }
.dot-red    { background: var(--red); }

/* ── Image area ─────────────────────────────────────── */
#img-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #070712;
  overflow: hidden;
  padding: 20px;
  position: relative;
}
#main-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
}
#img-status { color: var(--muted); font-size: 13px; }
#badge-labeled {
  position: absolute;
  top: 12px; right: 16px;
  background: var(--yellow);
  color: #000;
  font-size: 11px; font-weight: 700;
  padding: 3px 10px; border-radius: 20px;
  display: none;
}

/* ── Bottom panel ───────────────────────────────────── */
#bottom {
  background: var(--surface);
  border-top: 1px solid var(--border);
  padding: 12px 24px 16px;
  flex-shrink: 0;
}
#fname {
  font-family: monospace;
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#label-input {
  width: 100%;
  background: #0a0a18;
  border: 2px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 20px;
  padding: 11px 16px;
  outline: none;
  transition: border-color .2s;
  font-family: 'Segoe UI', monospace;
}
#label-input:focus       { border-color: var(--accent); }
#label-input.is-prefill  { border-color: var(--yellow); }
#label-input.is-ocr      { border-color: var(--green); }
#label-input:disabled    { opacity: .5; cursor: wait; }

/* ── Buttons ────────────────────────────────────────── */
#btn-row { display: flex; gap: 8px; margin-top: 10px; }
.btn {
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 10px 18px;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: opacity .15s, transform .1s;
  white-space: nowrap;
}
.btn:active   { transform: scale(.97); }
.btn:disabled { opacity: .35; cursor: not-allowed; }
#btn-back        { background: #1e1e38; color: var(--muted); }
#btn-next        { background: #1e1e38; color: var(--muted); }
#btn-skip        { background: #1f2d1a; color: var(--yellow); }
#btn-reset-skips { background: #1a1a2d; color: #a78bfa; font-size: 12px; }
#btn-delete      { background: #2d1a1a; color: var(--red); }
#btn-jump-prev   { background: #1a2a2d; color: #38bdf8; font-size: 12px; }
#btn-jump-next   { background: #1a2a2d; color: #38bdf8; font-size: 12px; }
#btn-save        { background: var(--accent); color: #fff; flex: 1; justify-content: center; font-size: 15px; }
#unlabeled-badge {
  display: inline-block;
  background: #38bdf8;
  color: #000;
  font-size: 10px; font-weight: 700;
  padding: 1px 7px; border-radius: 20px;
  margin-left: 5px;
  vertical-align: middle;
}
.kbd {
  background: rgba(255,255,255,.12);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 10px;
  font-family: monospace;
}

/* ── Toast ──────────────────────────────────────────── */
#toast {
  position: fixed;
  bottom: 100px; left: 50%;
  transform: translateX(-50%) translateY(10px);
  padding: 8px 22px;
  border-radius: 20px;
  font-size: 13px; font-weight: 700;
  opacity: 0;
  transition: opacity .2s, transform .2s;
  pointer-events: none;
  z-index: 99;
}
#toast.show    { opacity: 1; transform: translateX(-50%) translateY(0); }
#toast.ok      { background: var(--green);  color: #000; }
#toast.err     { background: var(--red);    color: #fff; }
#toast.warn    { background: var(--yellow); color: #000; }

/* ── Finish screen ──────────────────────────────────── */
#finish-screen {
  display: none;
  position: fixed; inset: 0;
  background: rgba(7,7,18,.93);
  z-index: 50;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  text-align: center;
}
#finish-screen h1 { font-size: 30px; color: var(--green); }
#finish-screen p  { color: var(--muted); font-size: 14px; }
</style>
</head>
<body>

<div id="top-bar">
  <div id="top-row">
    <span id="pos-label">Gambar <b id="p-cur">-</b> dari <b id="p-tot">-</b></span>
    <span id="pct-label"><span id="p-pct">0</span>% selesai</span>
  </div>
  <div id="bar-wrap"><div id="bar" style="width:0%"></div></div>
  <div id="stats-row">
    <span class="stat-chip"><span class="dot dot-green"></span><b id="p-labeled">0</b> dilabel</span>
    <span class="stat-chip"><span class="dot dot-yellow"></span><b id="p-skipped">0</b> di-skip</span>
    <span class="stat-chip"><span class="dot dot-red"></span><b id="p-deleted">0</b> dihapus sesi ini</span>
  </div>
</div>

<div id="img-area">
  <div id="badge-labeled">Sudah punya label</div>
  <div id="img-status">Memuat gambar...</div>
  <img id="main-img" src="" alt="" style="display:none" onload="onImgLoad()">
</div>

<div id="bottom">
  <div id="fname">-</div>
  <input type="text" id="label-input"
         placeholder="Ketik label lalu tekan Enter..."
         autocomplete="off" spellcheck="false">
  <div id="btn-row">
    <button class="btn" id="btn-back"        onclick="goBack()">← <span class="kbd">←</span></button>
    <button class="btn" id="btn-next"        onclick="goNext()">→ <span class="kbd">→</span></button>
    <button class="btn" id="btn-jump-prev"   onclick="jumpUnlabeled('backward')">⏮ Belum Dilabel <span class="kbd">Q</span></button>
    <button class="btn" id="btn-jump-next"   onclick="jumpUnlabeled('forward')">Belum Dilabel ⏭ <span class="kbd">N</span><span id="unlabeled-badge">…</span></button>
    <button class="btn" id="btn-skip"        onclick="skipImage()">Lewati <span class="kbd">S</span></button>
    <button class="btn" id="btn-reset-skips" onclick="resetSkips()">Reset Skip</button>
    <button class="btn" id="btn-delete"      onclick="deleteImage()">Hapus <span class="kbd">Del</span></button>
    <button class="btn" id="btn-save"        onclick="saveLabel()">Simpan &amp; Lanjut → <span class="kbd">Enter</span></button>
  </div>
</div>

<div id="finish-screen">
  <h1>Labeling Selesai!</h1>
  <p id="finish-msg"></p>
  <p style="color:var(--muted);font-size:12px">Tersimpan di Dataset/labels.csv</p>
</div>
<div id="toast"></div>

<script>
let currentIdx   = 0;
let totalImages  = 0;
let deletedCount = 0;
let busy         = false;
let unlabeledCount = 0;

async function refreshUnlabeledBadge() {
  try {
    const r = await fetch('/api/stats-unlabeled');
    const d = await r.json();
    unlabeledCount = d.count;
    const badge = document.getElementById('unlabeled-badge');
    badge.textContent = unlabeledCount > 0 ? unlabeledCount : '✓';
    badge.style.background = unlabeledCount > 0 ? '#38bdf8' : '#3ddc84';
  } catch(e) {}
}

async function jumpUnlabeled(direction) {
  if (busy) return;
  busy = true;
  try {
    const r = await fetch('/api/jump-unlabeled', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: currentIdx, direction }),
    });
    const d = await r.json();
    if (d.ok) {
      await loadState();
    } else {
      showToast(d.msg || 'Semua sudah dilabel!', 'ok');
    }
  } finally { busy = false; }
}

async function loadState() {
  try {
    const r = await fetch('/api/state');
    const s = await r.json();
    currentIdx  = s.idx;
    totalImages = s.total;
    refreshUnlabeledBadge();

    const pct = totalImages ? Math.round((s.labeled / totalImages) * 100) : 0;
    document.getElementById('p-cur').textContent     = s.idx + 1;
    document.getElementById('p-tot').textContent     = s.total;
    document.getElementById('p-pct').textContent     = pct;
    document.getElementById('bar').style.width       = pct + '%';
    document.getElementById('p-labeled').textContent = s.labeled;
    document.getElementById('p-skipped').textContent = s.skipped;
    document.getElementById('p-deleted').textContent = deletedCount;
    document.getElementById('fname').textContent     = s.filename || '-';

    const badge = document.getElementById('badge-labeled');
    badge.style.display = s.prefill ? 'block' : 'none';

    const img    = document.getElementById('main-img');
    const status = document.getElementById('img-status');
    img.style.display    = 'none';
    status.style.display = 'block';
    status.textContent   = 'Memuat gambar...';
    img.src = '/api/image/' + s.idx + '?t=' + Date.now();

    const input = document.getElementById('label-input');
    if (s.prefill) {
      // Sudah punya label manual → pakai itu
      input.value = s.prefill;
      input.className = 'is-prefill';
      input.focus();
      input.select();
    } else {
      // Belum ada label → tembak PaddleOCR untuk pre-fill otomatis
      input.value = '';
      input.className = '';
      input.placeholder = 'PaddleOCR sedang membaca...';
      input.disabled = true;
      fetch('/api/ocr/' + s.idx)
        .then(r => r.json())
        .then(d => {
          input.disabled = false;
          input.placeholder = 'Ketik label lalu tekan Enter...';
          if (d.text) {
            input.value = d.text;
            input.className = 'is-ocr';
          }
          input.focus();
          input.select();
        })
        .catch(() => {
          input.disabled = false;
          input.placeholder = 'Ketik label lalu tekan Enter...';
          input.focus();
        });
    }

    document.getElementById('btn-back').disabled = (s.idx === 0);
    document.getElementById('btn-next').disabled = (s.idx >= s.total - 1);
  } catch(e) { console.error(e); }
}

function onImgLoad() {
  document.getElementById('main-img').style.display  = 'block';
  document.getElementById('img-status').style.display = 'none';
}

async function saveLabel() {
  if (busy) return;
  const label = document.getElementById('label-input').value.trim();
  if (!label) { showToast('Label tidak boleh kosong!', 'err'); return; }
  busy = true;
  try {
    const r = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idx: currentIdx, label }),
    });
    const d = await r.json();
    if (d.ok) {
      showToast('Tersimpan!', 'ok');
      if (currentIdx >= totalImages - 1) { showFinish(); return; }
      await loadState();
    } else {
      showToast(d.msg || 'Gagal', 'err');
    }
  } finally { busy = false; }
}

async function skipImage() {
  if (busy) return;
  busy = true;
  try {
    await fetch('/api/skip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idx: currentIdx }),
    });
    showToast('Di-skip', 'warn');
    await loadState();
  } finally { busy = false; }
}

async function goBack() {
  if (busy || currentIdx <= 0) return;
  busy = true;
  try {
    await fetch('/api/back', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idx: currentIdx }),
    });
    await loadState();
  } finally { busy = false; }
}

async function resetSkips() {
  if (busy) return;
  busy = true;
  try {
    const r = await fetch('/api/reset-skips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const d = await r.json();
    showToast(`Skip di-reset! (${d.removed} dihapus)`, 'ok');
    await loadState();
  } finally { busy = false; }
}

async function goNext() {
  if (busy || currentIdx >= totalImages - 1) return;
  busy = true;
  try {
    await fetch('/api/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idx: currentIdx }),
    });
    await loadState();
  } finally { busy = false; }
}

async function deleteImage() {
  if (busy) return;
  busy = true;
  try {
    const r = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idx: currentIdx }),
    });
    const d = await r.json();
    if (d.ok) {
      deletedCount++;
      totalImages = d.new_total;
      showToast('Dipindah ke sampah', 'err');
      if (totalImages === 0) { showFinish(); return; }
      await loadState();
    }
  } finally { busy = false; }
}

function showFinish() {
  document.getElementById('finish-msg').textContent =
    'Semua ' + totalImages + ' gambar selesai diproses!';
  document.getElementById('finish-screen').style.display = 'flex';
}

let toastTimer;
function showToast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 1600);
}

// ── Keyboard shortcuts ───────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const input   = document.getElementById('label-input');
  const focused = document.activeElement === input;

  // Enter → simpan (berlaku dari mana saja)
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    saveLabel();
    return;
  }
  // Escape → kosongkan input dan fokus ulang
  if (e.key === 'Escape') {
    input.value = '';
    input.className = '';
    input.focus();
    return;
  }
  // Navigasi & aksi → hanya aktif saat input TIDAK sedang difokus
  if (!focused) {
    if (e.key === 'ArrowLeft')          { e.preventDefault(); goBack();                      return; }
    if (e.key === 'ArrowRight')         { e.preventDefault(); goNext();                      return; }
    if (e.key === 's' || e.key === 'S') { e.preventDefault(); skipImage();                   return; }
    if (e.key === 'b' || e.key === 'B') { e.preventDefault(); goBack();                      return; }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); jumpUnlabeled('forward');      return; }
    if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); jumpUnlabeled('backward');     return; }
    if (e.key === 'Delete')             { e.preventDefault(); deleteImage();                 return; }
  }
});

document.getElementById('label-input').addEventListener('input', function () {
  this.classList.remove('is-prefill', 'is-ocr');
});

loadState();
</script>
</body>
</html>"""


if __name__ == "__main__":
    first = reset_to_first_unlabeled()
    labels_now = load_labels()
    unlabeled  = len(ALL_IMAGES) - len(labels_now)
    print()
    print("=" * 52)
    print("  TrOCR Labeling Tool — TEST SET")
    print("=" * 52)
    print(f"  Sumber       : Dataset/test_set/")
    print(f"  Dataset      : {len(ALL_IMAGES):,} gambar")
    print(f"  Sudah dilabel: {len(labels_now):,}")
    print(f"  Belum dilabel: {unlabeled:,}")
    if first >= 0:
        print(f"  Mulai dari   : [{first}] {rel(ALL_IMAGES[first])}")
    else:
        print("  Semua gambar sudah dilabel!")
    print(f"  CSV          : {CSV_PATH}")
    print(f"  Akses        : http://localhost:5002")
    print("=" * 52)
    print()
    app.run(host="0.0.0.0", port=5002, debug=False, threaded=True)
