"""
Dataset Labeler — Pemilah Crop OCR Tulisan Tangan
Gunakan keyboard atau tombol untuk memilah gambar.
"""

import tkinter as tk
from tkinter import ttk, messagebox
from pathlib import Path
from PIL import Image, ImageTk
import json
import shutil
import sys

# ─── Konfigurasi Path ───────────────────────────────────────────────
BASE_DIR      = Path(r"D:\laragon\www\idp-lintasarta\python-engine\Dataset")
RAW_DIR       = BASE_DIR / "raw_crops"
SAMPAH_DIR    = BASE_DIR / "sampah"
PROGRESS_FILE = BASE_DIR / "labeling_progress.json"

EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".tif", ".webp"}

# ─── Muat semua path gambar ──────────────────────────────────────────
def load_all_images():
    """Kumpulkan semua file gambar dari raw_crops + sampah (rekursif), sorted."""
    raw   = sorted(RAW_DIR.rglob("*"))
    trash = sorted(SAMPAH_DIR.rglob("*")) if SAMPAH_DIR.exists() else []
    raw_imgs   = [p for p in raw   if p.suffix.lower() in EXTS]
    trash_imgs = [p for p in trash if p.suffix.lower() in EXTS]

    # Bangun mapping: relative key → path aktual
    # Key = path relatif terhadap BASE_DIR (misal raw_crops/folder/img.png)
    all_keys = []
    path_map = {}

    for p in raw_imgs:
        key = p.relative_to(BASE_DIR).as_posix()
        all_keys.append(key)
        path_map[key] = p

    for p in trash_imgs:
        key = p.relative_to(BASE_DIR).as_posix()
        all_keys.append(key)
        path_map[key] = p

    # Urutkan berdasarkan nama file (bukan full path) agar konsisten
    all_keys.sort(key=lambda k: k.split("/")[-1])
    return all_keys, path_map

def reload_path_map(all_keys):
    """Perbarui path_map untuk semua key (cari di raw maupun sampah)."""
    path_map = {}
    for key in all_keys:
        # key formatnya raw_crops/... atau sampah/...
        # Coba cari file aslinya berdasarkan nama relatif dari BASE_DIR
        p = BASE_DIR / key
        if p.exists():
            path_map[key] = p
        else:
            # Cari di sampah jika sudah dipindah
            raw_rel = "/".join(key.split("/")[1:])  # hilangkan prefix folder
            in_sampah = SAMPAH_DIR / raw_rel
            if in_sampah.exists():
                path_map[key] = in_sampah
    return path_map


# ─── App Utama ───────────────────────────────────────────────────────
class DatasetLabeler(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Dataset Labeler — OCR Tulisan Tangan")
        self.configure(bg="#1e1e2e")
        self.state("zoomed")  # Maximize on Windows

        SAMPAH_DIR.mkdir(parents=True, exist_ok=True)

        # Muat data
        self.all_keys, self.path_map = load_all_images()
        self.total = len(self.all_keys)

        if self.total == 0:
            messagebox.showerror("Error", f"Tidak ada gambar ditemukan di:\n{RAW_DIR}")
            self.destroy()
            return

        # Muat progress
        self.current_idx = self._load_progress()

        self._build_ui()
        self._bind_keys()
        self.show_image(self.current_idx)

    # ── UI Builder ──────────────────────────────────────────────────
    def _build_ui(self):
        # ── Header (progress) ──
        self.header_var = tk.StringVar()
        header = tk.Label(
            self, textvariable=self.header_var,
            font=("Segoe UI", 13, "bold"),
            bg="#1e1e2e", fg="#cdd6f4", pady=6
        )
        header.pack(fill=tk.X)

        # ── Nama file ──
        self.fname_var = tk.StringVar()
        fname_lbl = tk.Label(
            self, textvariable=self.fname_var,
            font=("Segoe UI", 9),
            bg="#1e1e2e", fg="#6c7086"
        )
        fname_lbl.pack()

        # ── Canvas gambar ──
        self.canvas = tk.Canvas(self, bg="#181825", highlightthickness=0)
        self.canvas.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)

        # ── Panel tombol bawah ──
        btn_frame = tk.Frame(self, bg="#1e1e2e")
        btn_frame.pack(fill=tk.X, pady=(0, 18))

        btn_cfg = dict(font=("Segoe UI", 13, "bold"), relief=tk.FLAT,
                       padx=28, pady=12, cursor="hand2", bd=0)

        self.prev_btn = tk.Button(
            btn_frame, text="← Previous",
            bg="#313244", fg="#cdd6f4", activebackground="#45475a",
            command=self.go_previous, **btn_cfg
        )
        self.prev_btn.pack(side=tk.LEFT, padx=(30, 8))

        self.restore_btn = tk.Button(
            btn_frame, text="↺ Pulihkan",
            bg="#fab387", fg="#1e1e2e", activebackground="#f9e2af",
            command=self.restore_image, **btn_cfg
        )
        # ditampilkan secara kondisional

        self.handwrite_btn = tk.Button(
            btn_frame, text="Tulisan Tangan  ✓",
            bg="#a6e3a1", fg="#1e1e2e", activebackground="#94e2d5",
            command=self.mark_handwriting, **btn_cfg
        )
        self.handwrite_btn.pack(side=tk.RIGHT, padx=(8, 30))

        self.trash_btn = tk.Button(
            btn_frame, text="Bukan Tulisan Tangan  ✗",
            bg="#f38ba8", fg="#1e1e2e", activebackground="#eba0ac",
            command=self.mark_trash, **btn_cfg
        )
        self.trash_btn.pack(side=tk.RIGHT, padx=8)

        # ── Shortcut hint ──
        hint = tk.Label(
            self,
            text="[→ / Enter] Tulisan Tangan   [Delete] Bukan Tulisan Tangan   [←] Previous   [R] Pulihkan",
            font=("Segoe UI", 8), bg="#1e1e2e", fg="#585b70"
        )
        hint.pack(pady=(0, 6))

        self.canvas.bind("<Configure>", lambda e: self.show_image(self.current_idx))

    # ── Key Bindings ────────────────────────────────────────────────
    def _bind_keys(self):
        self.bind("<Right>",  lambda e: self.mark_handwriting())
        self.bind("<Return>", lambda e: self.mark_handwriting())
        self.bind("<Left>",   lambda e: self.go_previous())
        self.bind("<Delete>", lambda e: self.mark_trash())
        self.bind("<r>",      lambda e: self.restore_image())
        self.bind("<R>",      lambda e: self.restore_image())

    # ── Progress I/O ────────────────────────────────────────────────
    def _load_progress(self):
        if PROGRESS_FILE.exists():
            try:
                data = json.loads(PROGRESS_FILE.read_text(encoding="utf-8"))
                idx = data.get("current_idx", 0)
                return min(max(idx, 0), self.total - 1)
            except Exception:
                pass
        return 0

    def _save_progress(self):
        data = {"current_idx": self.current_idx}
        PROGRESS_FILE.write_text(json.dumps(data), encoding="utf-8")

    # ── Statistik ───────────────────────────────────────────────────
    def _stats(self):
        n_raw   = sum(1 for k in self.all_keys if k.startswith("raw_crops/") and (BASE_DIR / k).exists())
        n_trash = sum(1 for k in self.all_keys if k.startswith("sampah/")    and (BASE_DIR / k).exists())
        return n_raw, n_trash

    # ── Tampilkan gambar ────────────────────────────────────────────
    def show_image(self, idx):
        if not self.all_keys:
            return
        idx = max(0, min(idx, self.total - 1))
        self.current_idx = idx

        key  = self.all_keys[idx]
        path = self._resolve_path(key)

        # Update header
        n_raw, n_trash = self._stats()
        self.header_var.set(
            f"Gambar {idx + 1} dari {self.total}  —  "
            f"{n_raw} tulisan tangan,  {n_trash} sampah"
        )
        self.fname_var.set(str(path) if path else key)

        # Tombol Pulihkan — muncul jika gambar ada di sampah
        in_trash = (path is not None) and (SAMPAH_DIR in path.parents)
        if in_trash:
            self.restore_btn.pack(side=tk.LEFT, padx=8)
        else:
            self.restore_btn.pack_forget()

        # Render gambar
        self.canvas.delete("all")
        if path is None or not path.exists():
            self.canvas.create_text(
                self.canvas.winfo_width() // 2,
                self.canvas.winfo_height() // 2,
                text="[File tidak ditemukan]",
                fill="#f38ba8", font=("Segoe UI", 14)
            )
            return

        try:
            img = Image.open(path).convert("RGB")
        except Exception as e:
            self.canvas.create_text(
                self.canvas.winfo_width() // 2,
                self.canvas.winfo_height() // 2,
                text=f"[Gagal buka: {e}]",
                fill="#f38ba8", font=("Segoe UI", 12)
            )
            return

        # Fit ke canvas dengan menjaga aspect ratio
        cw = max(self.canvas.winfo_width(),  100)
        ch = max(self.canvas.winfo_height(), 100)
        iw, ih = img.size
        scale = min(cw / iw, ch / ih, 4.0)   # max 4× upscale agar jelas
        nw, nh = int(iw * scale), int(ih * scale)

        resample = Image.LANCZOS if scale < 1 else Image.NEAREST
        img = img.resize((nw, nh), resample)

        # Overlay warna kalau di sampah
        if in_trash:
            overlay = Image.new("RGB", (nw, nh), (243, 139, 168))
            img = Image.blend(img, overlay, 0.15)

        self._tk_img = ImageTk.PhotoImage(img)
        x, y = cw // 2, ch // 2
        self.canvas.create_image(x, y, anchor=tk.CENTER, image=self._tk_img)

        self._save_progress()

    def _resolve_path(self, key):
        """Cari file di raw_crops atau sampah."""
        # key: raw_crops/subfolder/file.png  ATAU  sampah/subfolder/file.png
        p = BASE_DIR / key
        if p.exists():
            return p
        # Coba di sampah (jika key masih berprefix raw_crops)
        if key.startswith("raw_crops/"):
            rel = key[len("raw_crops/"):]
            in_sampah = SAMPAH_DIR / rel
            if in_sampah.exists():
                return in_sampah
        return None

    # ── Aksi ────────────────────────────────────────────────────────
    def mark_handwriting(self):
        """Gambar dibiarkan di raw_crops, lanjut ke berikutnya."""
        key  = self.all_keys[self.current_idx]
        path = self._resolve_path(key)

        # Jika ternyata ada di sampah, pindah balik dulu
        if path and SAMPAH_DIR in path.parents:
            self._move_back(path, key)

        self._advance()

    def mark_trash(self):
        """Pindahkan gambar ke folder sampah, lanjut ke berikutnya."""
        key  = self.all_keys[self.current_idx]
        path = self._resolve_path(key)

        if path and RAW_DIR in path.parents:
            rel        = path.relative_to(RAW_DIR)
            dest       = SAMPAH_DIR / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(path), str(dest))

        self._advance()

    def go_previous(self):
        if self.current_idx > 0:
            self.show_image(self.current_idx - 1)

    def restore_image(self):
        """Pindahkan gambar dari sampah kembali ke raw_crops."""
        key  = self.all_keys[self.current_idx]
        path = self._resolve_path(key)

        if path and SAMPAH_DIR in path.parents:
            self._move_back(path, key)
            self.show_image(self.current_idx)

    def _move_back(self, path, key):
        rel  = path.relative_to(SAMPAH_DIR)
        dest = RAW_DIR / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(path), str(dest))

    def _advance(self):
        if self.current_idx < self.total - 1:
            self.show_image(self.current_idx + 1)
        else:
            n_raw, n_trash = self._stats()
            messagebox.showinfo(
                "Selesai!",
                f"Semua {self.total} gambar sudah dilabeli.\n\n"
                f"Tulisan tangan : {n_raw}\n"
                f"Sampah         : {n_trash}"
            )


# ─── Entry Point ─────────────────────────────────────────────────────
if __name__ == "__main__":
    try:
        from PIL import Image, ImageTk
    except ImportError:
        import subprocess
        print("Pillow belum terinstall. Menginstall sekarang...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
        from PIL import Image, ImageTk

    app = DatasetLabeler()
    app.mainloop()
