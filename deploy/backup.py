"""Salinan cadangan database (aman dijalankan saat server hidup).

    python3 deploy/backup.py              # ke data/backup/
    python3 deploy/backup.py /srv/backup  # ke folder lain

Menyimpan 14 berkas terakhir. Contoh cron harian pukul 02:00:

    0 2 * * * cd /opt/aroma && /usr/bin/python3 deploy/backup.py
"""
import datetime
import os
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "aroma.db")
KEEP = 14


def main():
    if not os.path.isfile(SRC):
        print("Database tidak ditemukan:", SRC)
        return 1
    dest_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "data", "backup")
    os.makedirs(dest_dir, exist_ok=True)
    out = os.path.join(dest_dir, "aroma-%s.db" % datetime.date.today().isoformat())

    source = sqlite3.connect(SRC)
    target = sqlite3.connect(out)
    with target:
        source.backup(target)
    target.close()
    source.close()
    print("Cadangan:", out)

    files = sorted(f for f in os.listdir(dest_dir) if f.startswith("aroma-") and f.endswith(".db"))
    for old in files[:-KEEP]:
        os.remove(os.path.join(dest_dir, old))
        print("Hapus cadangan lama:", old)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
