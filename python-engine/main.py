"""
main.py
--------
Entry point Flask untuk Python Engine.
Jalankan dengan: python main.py
"""

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
    print(f"\n{'='*50}")
    print(f"  Python Engine berjalan di http://localhost:{FLASK_PORT}")
    print(f"  Mode: {'DEBUG' if FLASK_DEBUG else 'PRODUCTION'}")
    print(f"{'='*50}\n")
    app.run(debug=FLASK_DEBUG, port=FLASK_PORT)