"""
main.py
--------
Entry point Flask untuk Python Engine.
Jalankan dengan: python main.py
"""

from dotenv import load_dotenv
load_dotenv()  # Load environment variables dari .env

import os
print(f"[ENV] TROCR_ENABLED = {os.getenv('TROCR_ENABLED')}")

from flask import Flask
from flask_cors import CORS
from app.api.routes import register_routes
from config.settings import FLASK_PORT, FLASK_DEBUG

def create_app():
    app = Flask(__name__)
    CORS(app)  # Izinkan request dari Laravel & n8n
    register_routes(app)
    return app

if __name__ == "__main__":
    app = create_app()

    # Pre-warm TrOCR di background thread saat server start
    # Sehingga tidak memblokir request pertama dari n8n
    from app.services.trocr_service import prewarm_trocr
    prewarm_trocr()

    print(f"\n{'='*50}")
    print(f"  Python Engine berjalan di http://localhost:{FLASK_PORT}")
    print(f"  Mode: {'DEBUG' if FLASK_DEBUG else 'PRODUCTION'}")
    print(f"{'='*50}\n")

    # use_reloader=False WAJIB agar prewarm_trocr tidak dipanggil 2x oleh Flask reloader
    app.run(debug=FLASK_DEBUG, host="0.0.0.0", port=FLASK_PORT, use_reloader=False)