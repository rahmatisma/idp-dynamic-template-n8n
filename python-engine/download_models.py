"""
Script untuk pre-download model TrOCR ke local cache HuggingFace.
Jalankan SEKALI sebelum mengaktifkan TROCR_ENABLED=true di .env

Gunakan format safetensors (aman untuk torch < 2.6).
"""

from transformers import TrOCRProcessor, VisionEncoderDecoderModel
import time

def download_trocr():
    model_name = "microsoft/trocr-large-handwritten"
    print(f"🚀 Memulai download model: {model_name}")
    print("📦 Format: safetensors (~2.23GB). Pastikan koneksi internet stabil.\n")

    start_time = time.time()

    try:
        print("[1/2] Downloading Processor...")
        processor = TrOCRProcessor.from_pretrained(model_name)
        print("[1/2] ✅ Processor selesai!\n")

        print("[2/2] Downloading & loading Model (safetensors)...")
        model = VisionEncoderDecoderModel.from_pretrained(
            model_name,
            use_safetensors=True   # Gunakan safetensors, hindari torch CVE
        )
        print("[2/2] ✅ Model selesai!\n")

        duration = time.time() - start_time
        print(f"✅ Selesai dalam {duration/60:.1f} menit.")
        print("📍 Cache tersimpan di HuggingFace Hub cache directory.")
        print("\n👉 Langkah selanjutnya:")
        print("   1. Buka file python-engine/.env")
        print("   2. Ubah TROCR_ENABLED=false  →  TROCR_ENABLED=true")
        print("   3. Restart: python main.py")

    except Exception as e:
        print(f"\n❌ Gagal: {e}")

if __name__ == "__main__":
    download_trocr()
