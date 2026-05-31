import logging
import threading
import cv2
import numpy as np
logger = logging.getLogger(__name__)

_ocr = None
_ocr_lock = threading.Lock()

def get_ocr_instance():
    global _ocr
    with _ocr_lock:
        if _ocr is None:
            from paddleocr import PaddleOCR
            logger.info("Initializing PaddleOCR instance...")
            _ocr = PaddleOCR(use_angle_cls=True, lang='en', show_log=False, enable_mkldnn=False,
                             cpu_threads=4, rec_batch_num=1)
    return _ocr

def predict_text(image_path: str, box: dict = None) -> str:
    """
    Menjalankan OCR pada gambar (atau area tertentu dari gambar).
    
    Args:
        image_path: Path ke file gambar (PNG).
        box: Dict koordinat {x, y, w, h} dalam rasio (0-1). 
             Jika None, OCR dilakukan pada seluruh gambar.
             
    Returns:
        String hasil ekstraksi teks.
    """
    try:
        print(f"[OCR] Predicting text for: {image_path}")
        img = cv2.imread(image_path)
        if img is None:
            print(f"[OCR] Error: Image not found or cannot be read at {image_path}")
            return ""

        h_img, w_img = img.shape[:2]
        print(f"[OCR] Image Size: {w_img}x{h_img}")

        # 1. Crop jika ada koordinat box (format ratio)
        if box:
            print(f"[OCR] Box Ratio: {box}")
            x = int(box.get('x', 0) * w_img)
            y = int(box.get('y', 0) * h_img)
            w = int(box.get('w', 1) * w_img)
            h = int(box.get('h', 1) * h_img)
            
            # Validasi koordinat
            x = max(0, min(x, w_img - 1))
            y = max(0, min(y, h_img - 1))
            w = max(1, min(w, w_img - x))
            h = max(1, min(h, h_img - y))
            
            print(f"[OCR] Box Pixels: x={x}, y={y}, w={w}, h={h}")
            img = img[y:y+h, x:x+w]

        # 2. Jalankan OCR
        ocr_engine = get_ocr_instance()
        with _ocr_lock:
            result = ocr_engine.ocr(img, cls=True)

        print(f"[OCR] Raw Result: {result}")

        if not result or not result[0]:
            print("[OCR] No text detected.")
            return ""

        # result[0] berisi list of [box, (text, confidence)]
        texts = [line[1][0] for line in result[0]]
        detected_text = " ".join(texts).strip()
        print(f"[OCR] Final Text: {detected_text}")
        return detected_text

    except Exception as e:
        print(f"[OCR] Exception: {str(e)}")
        logger.error(f"Error during OCR prediction: {str(e)}")
        return ""

def read_header(image_path: str) -> dict:
    """
    Membaca Header secara cerdas:
    1. Title: Teks besar di tengah.
    2. Doc Number: Teks yang diawali 'No. Dok'.
    """
    import time
    max_retry = 3
    for attempt in range(max_retry):
        try:
            img = cv2.imread(image_path)
            if img is None:
                return {"title": "", "doc_number": None, "version": None}

            h_img, w_img = img.shape[:2]
            ocr_engine = get_ocr_instance()
            with _ocr_lock:
                result = ocr_engine.ocr(img, cls=True)

            if not result or not result[0]:
                return {"title": "", "doc_number": None, "version": None}

            header_candidates = []
            for line in result[0]:
                box, (text, conf) = line
                y_coord = box[0][1]
                y_ratio = y_coord / h_img

                if y_ratio < 0.35:
                    box_height = box[2][1] - box[0][1]
                    x_center = ((box[0][0] + box[1][0]) / 2) / w_img
                    header_candidates.append({
                        "text": text,
                        "height": box_height,
                        "x_center": x_center,
                        "y": y_coord,
                        "conf": conf
                    })

            # Filter noise — buang teks pendek di pojok kiri
            # Pengecualian: label "VERSI"/"VERSION" tidak dibuang meski x_center < 0.20
            header_candidates = [
                c for c in header_candidates
                if len(c['text'].strip()) >= 3
                and not (
                    c['x_center'] < 0.20
                    and len(c['text'].strip()) < 10
                    and "VERSI" not in c['text'].upper()
                    and "VERSION" not in c['text'].upper()
                )
            ]

            if not header_candidates:
                return {"title": "", "doc_number": None, "version": None, "confidence": 0}

            # --- 1. EKSTRAK JUDUL (Robust Seed Clustering) ---
            potential_seeds = [c for c in header_candidates if len(c['text'].strip()) >= 4]
            if not potential_seeds:
                potential_seeds = header_candidates

            center_seeds = [c for c in potential_seeds if 0.35 <= c['x_center'] <= 0.75]
            seed_pool = center_seeds if center_seeds else potential_seeds

            primary = max(
                seed_pool,
                key=lambda c: c['height'] * len(c['text'])
                              * max(0.1, 1.0 - abs(c['x_center'] - 0.5) * 2)
                              * max(0.1, 1.0 - (c['y'] / h_img) * 5)
            )
            target_x_center = primary['x_center']

            # Ambil yang 'sejajar' alignment-nya sama si Raja
            all_aligned = [c for c in header_candidates if abs(c['x_center'] - target_x_center) < 0.18]
            all_aligned.sort(key=lambda c: c['y'])

            try:
                p_idx = all_aligned.index(primary)
            except ValueError:
                p_idx = 0

            title_indices = {p_idx}

            # Expand 1.5x -> Toleran buat judul yang agak renggang
            for direction in [1, -1]:
                curr = p_idx
                steps = 0
                while 0 <= curr + direction < len(all_aligned):
                    steps += 1
                    if steps > 2:
                        break
                    next_node = all_aligned[curr + direction]
                    this_node = all_aligned[curr]

                    if direction == 1:
                        gap = next_node['y'] - (this_node['y'] + this_node['height'])
                    else:
                        gap = this_node['y'] - (next_node['y'] + next_node['height'])

                    if gap < (max(this_node['height'], next_node['height']) * 1.5):
                        curr += direction
                        title_indices.add(curr)
                    else:
                        break

            selected_lines = [all_aligned[i] for i in sorted(list(title_indices))]
            title = " ".join([c['text'] for c in selected_lines]).strip()

            conf_scores = [c.get('conf', 0.95) for c in selected_lines]
            avg_conf = sum(conf_scores) / len(conf_scores) if conf_scores else 0

            # --- 2. EKSTRAK NO DOKUMEN ---
            doc_number = None
            keywords = ["DOK", "NO.", "NOMOR", "REF", "CODE", "KODE"]
            for c in header_candidates:
                t = c['text'].upper()
                if any(k in t for k in keywords):
                    raw = c['text']
                    # Cari titik pisah paling belakang dari label (biasanya : atau .)
                    if ":" in raw:
                        doc_number = raw.split(":", 1)[1].strip()
                    elif "Dok." in raw:
                        doc_number = raw.split("Dok.", 1)[1].strip()
                    elif "No." in raw:
                        doc_number = raw.split("No.", 1)[1].strip()
                    else:
                        # Jika tidak ada pemisah jelas, hapus keywords-nya saja
                        temp = raw
                        for k in ["No. Dok.", "No. Dok", "No.Dok", "Dok.", "No."]:
                            temp = temp.replace(k, "").replace(k.upper(), "")
                        doc_number = temp.strip()

                    if doc_number:
                        # Pembersihan Akhir: Buang label nempel (Versi/Hal) dan simbol awal
                        doc_number = doc_number.split("Versi")[0].split("Hal")[0].strip()
                        doc_number = doc_number.lstrip(":.- ").strip()
                        break

            if not doc_number:
                import re
                for c in header_candidates:
                    if re.search(r'[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+', c['text']):
                        doc_number = c['text'].strip().split("Versi")[0].split("Hal")[0].strip()
                        doc_number = doc_number.lstrip(":.- ").strip()
                        break

            # --- 3. EKSTRAK VERSI ---
            version = None
            for c in header_candidates:
                t = c['text'].upper()
                if "VERSI" in t or "VERSION" in t:
                    raw = c['text']
                    if ":" in raw:
                        v = raw.split(":", 1)[1].strip()
                        if v:
                            version = v
                            break

            # Fallback: label dan nilai versi di bounding box terpisah (tabel dua kolom)
            # Cari item "VERSI" sebagai label, lalu ambil item di sebelah kanan + Y berdekatan
            if version is None:
                versi_label = None
                for c in header_candidates:
                    if "VERSI" in c['text'].upper() or "VERSION" in c['text'].upper():
                        versi_label = c
                        break

                if versi_label is not None:
                    row_h   = versi_label['height'] if versi_label['height'] > 0 else 20
                    y_tol   = row_h * 0.8
                    candidates_right = [
                        c for c in header_candidates
                        if c is not versi_label
                        and abs(c['y'] - versi_label['y']) < y_tol
                        and c['x_center'] > versi_label['x_center']
                    ]
                    if candidates_right:
                        min_y_dist = min(abs(c['y'] - versi_label['y']) for c in candidates_right)
                        same_row   = [c for c in candidates_right if abs(c['y'] - versi_label['y']) == min_y_dist]
                        nearest    = min(same_row, key=lambda c: c['x_center'])
                        v = nearest['text'].strip().lstrip(':').strip()
                        if v:
                            version = v

            logger.info(f"[OCR] Header Final -> Title: '{title}', DocNum: '{doc_number}', Conf: {avg_conf:.2f}")
            return {
                "title": title,
                "doc_number": doc_number,
                "version": version,
                "confidence": round(avg_conf, 4)
            }

        except Exception as e:
            logger.error(f"Error in read_header attempt {attempt+1}: {str(e)}")
            if "could not execute a primitive" in str(e):
                global _ocr
                with _ocr_lock:
                    _ocr = None
                logger.warning(f"[OCR] Reset PaddleOCR, retry {attempt+1}/{max_retry}...")
                time.sleep(2)
                continue
            else:
                break
    return {"title": "", "doc_number": None, "version": None, "confidence": 0}
