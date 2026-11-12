"""Generate Android launcher mipmaps from the shared brand rasterizer.

Run from the repo root:  python3 tools/make_android_icons.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from make_icons import render, write_png  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
    "mipmap-xxxhdpi-playstore": 0,  # placeholder, skipped
}

if __name__ == "__main__":
    for folder, size in DENSITIES.items():
        if not size:
            continue
        target = os.path.join(RES, folder)
        os.makedirs(target, exist_ok=True)
        raw = render(size)
        write_png(os.path.join(target, "ic_launcher.png"), size, raw)
        write_png(os.path.join(target, "ic_launcher_round.png"), size, raw)
    print("done")
