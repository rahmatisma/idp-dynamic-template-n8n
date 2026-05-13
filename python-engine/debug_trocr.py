import os
from dotenv import load_dotenv
load_dotenv()  # ← baca .env manual

os.chdir(r"D:\laragon\www\idp-lintasarta\python-engine")

import logging
logging.basicConfig(level=logging.INFO)

from app.services.trocr_service import _load_trocr, read_handwritten
from PIL import Image

print(f"TROCR_ENABLED = {os.getenv('TROCR_ENABLED')}")

print("Loading model...")
_load_trocr()
print("Model loaded.")

img = Image.open("debug_crops/crop_20260513_154043_767728.png")
result, conf = read_handwritten(img)
print(f"Result: '{result}', Conf: {conf}")