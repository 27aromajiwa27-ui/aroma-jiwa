"""Titik masuk untuk Hugging Face Spaces dengan SDK Gradio.

Hugging Face menjalankan `app.py` pada Space SDK Gradio. Aplikasi ini tidak
memakai antarmuka Gradio sama sekali: yang berjalan adalah server HTTP Aroma
Jiwa sendiri di port 7860, karena proxy Space hanya meneruskan satu port.
Gradio hanya dipakai sebagai "kendaraan" agar Space tetap masuk paket gratis.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

os.environ.setdefault("HOST", "0.0.0.0")
os.environ.setdefault("PORT", "7860")
os.environ.setdefault("AJ_QUIET", "1")

from server.app import main

if __name__ == "__main__":
    main()
