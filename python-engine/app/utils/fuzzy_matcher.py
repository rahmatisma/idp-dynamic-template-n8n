"""
app/utils/fuzzy_matcher.py
---------------------------
Utilitas untuk mencari kata kunci anchor di hasil OCR
dengan toleransi kesalahan (fuzzy matching).

Kenapa perlu fuzzy matching?
    OCR kadang salah baca label teks, misalnya:
    - "Suhu Ruangan" terbaca "Suhu Ruanqan"
    - "Tanggal" terbaca "Tanqqal"
    Fuzzy matching memastikan anchor tetap ditemukan
    meskipun ada kesalahan kecil seperti ini.
"""

from difflib import SequenceMatcher

# Tipe alias untuk struktur hasil PaddleOCR
# Setiap deteksi: [[x1,y1],[x2,y2],[x3,y3],[x4,y4]], (text, confidence)
OcrBox = list[list[float]]          # 4 titik sudut kotak teks
OcrEntry = tuple[OcrBox, tuple[str, float]]  # satu deteksi lengkap
OcrResult = list[OcrEntry]          # seluruh hasil OCR


def similarity_ratio(text_a: str, text_b: str) -> float:
    """
    Hitung tingkat kemiripan antara dua string.
    Menggunakan algoritma SequenceMatcher dari Python standard library.

    Args:
        text_a: String pertama.
        text_b: String kedua.

    Returns:
        Float antara 0.0 (tidak mirip sama sekali) hingga 1.0 (identik).
    """
    return SequenceMatcher(None,
                           text_a.lower().strip(),
                           text_b.lower().strip()).ratio()


def find_best_anchor_match(
    ocr_results: OcrResult,
    anchor_keyword: str,
    threshold: float = 0.8
) -> tuple[int, int] | None:
    """
    Cari posisi anchor keyword di hasil OCR menggunakan fuzzy matching.

    Args:
        ocr_results: Hasil deteksi teks dari PaddleOCR.
                     Format per item:
                     [[[x1,y1],[x2,y2],[x3,y3],[x4,y4]], (text, confidence)]
        anchor_keyword: Kata kunci yang dicari (misal "Suhu Ruangan").
        threshold: Batas minimum kemiripan (default 0.8 = 80% mirip).

    Returns:
        Tuple (x, y) posisi pojok kiri atas anchor yang ditemukan,
        atau None jika tidak ada yang memenuhi threshold.
    """
    best_score = 0.0
    best_position = None

    for detection in ocr_results:
        # Struktur hasil PaddleOCR:
        # detection[0] = koordinat 4 sudut kotak teks
        # detection[1] = (text, confidence)
        box_coords = detection[0]
        text = detection[1][0]

        score = similarity_ratio(text, anchor_keyword)

        if score > best_score and score >= threshold:
            best_score = score
            # Ambil koordinat pojok kiri atas kotak teks
            # box_coords = [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
            x = int(min(point[0] for point in box_coords))
            y = int(min(point[1] for point in box_coords))
            best_position = (x, y)

    if best_position:
        print(f"[Fuzzy Matcher] Anchor '{anchor_keyword}' ditemukan "
              f"dengan skor {best_score:.2f} di posisi {best_position}")
    else:
        print(f"[Fuzzy Matcher] Anchor '{anchor_keyword}' tidak ditemukan "
              f"(skor tertinggi: {best_score:.2f}, threshold: {threshold})")

    return best_position


def find_all_matches(
    ocr_results: OcrResult,
    anchor_keyword: str,
    threshold: float = 0.8
) -> list[dict[str, float | str | int]]:
    """
    Cari SEMUA kemunculan anchor keyword di dokumen.
    Berguna untuk dokumen yang memiliki label yang sama berulang
    (misal tabel dengan banyak baris "Tanggal").

    Args:
        ocr_results: Hasil deteksi teks dari PaddleOCR.
        anchor_keyword: Kata kunci yang dicari.
        threshold: Batas minimum kemiripan.

    Returns:
        List dict berisi {text, score, x, y} untuk setiap kemunculan,
        diurutkan dari skor tertinggi.
    """
    matches = []

    for detection in ocr_results:
        box_coords = detection[0]
        text = detection[1][0]
        score = similarity_ratio(text, anchor_keyword)

        if score >= threshold:
            x = int(min(point[0] for point in box_coords))
            y = int(min(point[1] for point in box_coords))
            matches.append({
                "text": text,
                "score": score,
                "x": x,
                "y": y
            })

    # Urutkan dari skor tertinggi
    matches.sort(key=lambda m: m["score"], reverse=True)
    return matches