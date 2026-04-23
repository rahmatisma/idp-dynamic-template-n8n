import logging
import cv2
import numpy as np
from paddleocr import PaddleOCR

logger = logging.getLogger(__name__)

# Inisialisasi PaddleOCR (lang='en' untuk deteksi teks umum)
# show_log=False untuk mengurangi polusi log di terminal
_ocr = None

def get_ocr_instance():
    global _ocr
    if _ocr is None:
        logger.info("Initializing PaddleOCR instance...")
        # enable_mkldnn=False seringkali memperbaiki error "could not execute a primitive" di Windows
        _ocr = PaddleOCR(use_angle_cls=True, lang='en', show_log=False, enable_mkldnn=False)
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
    try:
        img = cv2.imread(image_path)
        if img is None:
            return {"title": "", "doc_number": None}
        
        h_img, w_img = img.shape[:2]
        ocr_engine = get_ocr_instance()
        result = ocr_engine.ocr(img, cls=True)
        
        if not result or not result[0]:
            return {"title": "", "doc_number": None}
            
        header_candidates = []
        for line in result[0]:
            box, (text, conf) = line
            y_coord = box[0][1]
            y_ratio = y_coord / h_img
            
            # Kita pake area sedikit lebih luas (20%) buat nyari label No Dokumen
            if y_ratio < 0.20:
                box_height = box[2][1] - box[0][1]
                x_center = ((box[0][0] + box[1][0]) / 2) / w_img
                header_candidates.append({
                    "text": text,
                    "height": box_height,
                    "x_center": x_center,
                    "y": y_coord
                })

        if not header_candidates:
            return {"title": "", "doc_number": None}

        # --- 1. EKSTRAK JUDUL (Visual Center & Vertical Cluster) ---
        # Cari yang skor "Centeredness" paling tinggi
        primary = max(header_candidates, key=lambda c: c['height'] / (abs(c['x_center'] - 0.5) + 0.1))
        target_x_center = primary['x_center']
        max_h = primary['height']
        
        # Ambil semua yang sejajar vertikal sama yang paling gede
        potential_title_lines = [c for c in header_candidates 
                                if abs(c['x_center'] - target_x_center) < 0.15 
                                and c['height'] >= (max_h * 0.6)]
        
        # Urutkan berdasarkan Y (dari atas ke bawah)
        potential_title_lines.sort(key=lambda c: c['y'])
        
        title_parts = []
        last_y = None
        for c in potential_title_lines:
            if last_y is not None:
                # Jika jarak antar baris terlalu jauh (gap > 1.5x tinggi font)
                # Berarti sudah keluar dari kluster judul
                if (c['y'] - last_y) > (c['height'] * 1.5):
                    break
            
            title_parts.append(c['text'])
            # Update last_y ke bagian bawah kotak teks ini
            last_y = c['y'] + c['height']

        title = " ".join(title_parts).strip()

        # --- 2. EKSTRAK NO DOKUMEN ---
        doc_number = None
        for c in header_candidates:
            t = c['text'].upper().replace(" ", "")
            if "NO.DOK" in t:
                raw = c['text']
                if ":" in raw:
                    doc_number = raw.split(":", 1)[1].strip()
                elif "Dok." in raw:
                    doc_number = raw.split("Dok.", 1)[1].strip()
                else:
                    doc_number = raw.replace("No. Dok", "").replace("No.Dok", "").strip()
                break

        logger.info(f"[OCR] Analysis Result -> Title: '{title}', DocNum: '{doc_number}'")
        return {
            "title": title,
            "doc_number": doc_number
        }

    except Exception as e:
        logger.error(f"Error in read_header: {str(e)}")
        return {"title": "", "doc_number": None}
