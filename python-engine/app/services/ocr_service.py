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
