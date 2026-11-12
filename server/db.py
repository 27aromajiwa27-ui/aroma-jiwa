"""SQLite storage for Aroma Jiwa Hadir."""
import os
import sqlite3
import threading

from . import util

DB_PATH = os.environ.get("AJ_DB", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "aroma.db"))

_lock = threading.RLock()
_conn = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  hp TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  peran TEXT NOT NULL DEFAULT 'pegawai',
  avatar TEXT,
  prefs TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  dibuat TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  hp TEXT NOT NULL UNIQUE,
  kode TEXT NOT NULL UNIQUE,
  stempel_aktif INTEGER NOT NULL DEFAULT 0,
  prefs TEXT,
  dibuat TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'Aroma Jiwa',
  alamat TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  radius INTEGER NOT NULL DEFAULT 50,
  jam_tutup TEXT NOT NULL DEFAULT '20:30',
  aktif INTEGER NOT NULL DEFAULT 1,
  urutan INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tanggal TEXT NOT NULL,
  shift TEXT NOT NULL,
  branch_id INTEGER NOT NULL,
  created_by TEXT,
  UNIQUE(user_id, tanggal, shift)
);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  shift TEXT NOT NULL,
  tanggal TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  menit_telat INTEGER NOT NULL DEFAULT 0,
  jam_pulang_min TEXT,
  dispensasi INTEGER NOT NULL DEFAULT 0,
  tipe_checkout TEXT,
  kategori_khusus TEXT,
  alasan_khusus TEXT,
  lat REAL, lng REAL, akurasi REAL, jarak REAL,
  mock INTEGER NOT NULL DEFAULT 0,
  kas_cash INTEGER,
  kas_expenses TEXT,
  kas_catatan TEXT,
  catatan_admin TEXT,
  dibuat TEXT NOT NULL,
  diubah TEXT
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  branch_id INTEGER,
  jenis TEXT,
  alasan TEXT,
  jarak REAL,
  akurasi REAL,
  lat REAL,
  lng REAL,
  mock INTEGER NOT NULL DEFAULT 0,
  waktu TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stamps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  pegawai_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  waktu TEXT NOT NULL,
  sumber TEXT NOT NULL DEFAULT 'scan',
  catatan TEXT
);
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  aroma_id INTEGER,
  aroma_nama TEXT,
  ukuran TEXT,
  catatan TEXT,
  stamp_id INTEGER,
  pegawai_id INTEGER,
  branch_id INTEGER,
  waktu TEXT NOT NULL,
  sumber TEXT
);
CREATE TABLE IF NOT EXISTS redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  jenis TEXT NOT NULL,
  nilai TEXT,
  waktu TEXT NOT NULL,
  pegawai_id INTEGER,
  branch_id INTEGER
);
CREATE TABLE IF NOT EXISTS redemption_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  jenis TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  waktu TEXT NOT NULL,
  pegawai_id INTEGER,
  nilai TEXT,
  waktu_konfirmasi TEXT
);
CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  stamp_id INTEGER,
  pegawai_id INTEGER,
  branch_id INTEGER,
  bintang INTEGER NOT NULL,
  tag TEXT,
  komentar TEXT,
  waktu TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS aroma (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  kategori TEXT NOT NULL,
  deskripsi TEXT,
  harga INTEGER,
  aktif INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  kategori TEXT NOT NULL DEFAULT 'Perlengkapan',
  satuan TEXT,
  batas INTEGER,
  aktif INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS stock_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_id INTEGER NOT NULL,
  item_id INTEGER,
  item_nama TEXT NOT NULL,
  tingkat TEXT NOT NULL,
  perkiraan_sisa TEXT,
  catatan TEXT,
  foto TEXT,
  pelapor INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Baru',
  jumlah_pelapor INTEGER NOT NULL DEFAULT 1,
  dibuat TEXT NOT NULL,
  diproses_oleh TEXT
);
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  judul TEXT NOT NULL,
  isi TEXT NOT NULL,
  gambar TEXT,
  kategori TEXT NOT NULL DEFAULT 'Info Operasional',
  semua INTEGER NOT NULL DEFAULT 1,
  branch_id INTEGER,
  mulai TEXT NOT NULL,
  berakhir TEXT,
  sematkan INTEGER NOT NULL DEFAULT 0,
  kirim_notif INTEGER NOT NULL DEFAULT 1,
  dibuat TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  waktu TEXT NOT NULL,
  PRIMARY KEY (announcement_id, user_id)
);
CREATE TABLE IF NOT EXISTS advances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  nominal INTEGER NOT NULL,
  tanggal TEXT NOT NULL,
  alasan TEXT,
  skema TEXT NOT NULL DEFAULT 'sekali',
  cicilan INTEGER NOT NULL DEFAULT 1,
  sisa INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Aktif',
  dibuat TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS advance_deductions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  advance_id INTEGER NOT NULL,
  payroll_id INTEGER,
  nominal INTEGER NOT NULL,
  tanggal TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payroll (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  periode_mulai TEXT NOT NULL,
  periode_selesai TEXT NOT NULL,
  detail TEXT,
  bonus INTEGER NOT NULL DEFAULT 0,
  potongan_lain TEXT,
  potongan_kasbon INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Draf',
  catatan TEXT,
  dibuat TEXT NOT NULL,
  diubah TEXT
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  aktor TEXT NOT NULL,
  aksi TEXT NOT NULL,
  nilai_lama TEXT,
  nilai_baru TEXT,
  waktu TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kunci TEXT UNIQUE NOT NULL,
  jenis TEXT NOT NULL,
  user_id INTEGER,
  member_id INTEGER,
  branch_id INTEGER,
  waktu TEXT NOT NULL,
  bukti TEXT,
  status TEXT NOT NULL DEFAULT 'Baru',
  catatan TEXT,
  dibuat TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tanggal TEXT UNIQUE NOT NULL,
  data TEXT NOT NULL,
  dibuat TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL,
  ref_id INTEGER,
  device_id TEXT,
  remember INTEGER NOT NULL DEFAULT 0,
  dibuat TEXT NOT NULL,
  terakhir TEXT NOT NULL,
  kedaluwarsa TEXT NOT NULL,
  dicabut INTEGER NOT NULL DEFAULT 0,
  info TEXT
);
CREATE TABLE IF NOT EXISTS notification_reads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kunci TEXT NOT NULL,
  waktu TEXT NOT NULL,
  UNIQUE(user_id, kunci)
);
CREATE TABLE IF NOT EXISTS member_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  kunci TEXT UNIQUE NOT NULL,
  jenis TEXT NOT NULL,
  isi TEXT NOT NULL,
  dibaca INTEGER NOT NULL DEFAULT 0,
  waktu TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hp TEXT NOT NULL,
  kode TEXT NOT NULL,
  kedaluwarsa TEXT NOT NULL,
  dipakai INTEGER NOT NULL DEFAULT 0,
  dibuat TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_att_user ON attendance(user_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_att_date ON attendance(tanggal);
CREATE INDEX IF NOT EXISTS idx_stamp_member ON stamps(member_id, waktu);
CREATE INDEX IF NOT EXISTS idx_sched_user ON schedules(user_id, tanggal);
"""


def connect():
    global _conn
    with _lock:
        if _conn is None:
            os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
            _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
            _conn.row_factory = sqlite3.Row
            _conn.execute("PRAGMA journal_mode=WAL")
            _conn.execute("PRAGMA foreign_keys=ON")
            _conn.executescript(SCHEMA)
            _conn.commit()
        return _conn


def query(sql, args=()):
    with _lock:
        cur = connect().execute(sql, args)
        rows = [dict(r) for r in cur.fetchall()]
        return rows


def one(sql, args=()):
    rows = query(sql, args)
    return rows[0] if rows else None


def scalar(sql, args=(), default=None):
    rows = query(sql, args)
    if not rows:
        return default
    return list(rows[0].values())[0]


def execute(sql, args=()):
    with _lock:
        cur = connect().execute(sql, args)
        connect().commit()
        return cur.lastrowid


def execute_many(sql, seq):
    with _lock:
        cur = connect().executemany(sql, seq)
        connect().commit()
        return cur.rowcount


DEFAULT_SETTINGS = {
    "pin_hash": "",
    "toleransi_menit": 0,
    "radius_default": 50,
    "jam_tutup_default": "20:30",
    "reminder_shift_menit": 30,
    "reminder_checkin_menit": 10,
    "reminder_checkout_menit": 30,
    "rate_pagi": 60000,
    "rate_sore": 65000,
    "rate_fullday": 110000,
    "stamp_gap_detik": 30,
    "cari_limit_menit": 20,
    "stamp_per_jam": 10,
    "stamp_member_per_hari": 2,
    "stamp_manual_per_hari": 5,
    "geofence_gagal_per_hari": 3,
    "telat_per_7hari": 3,
    "khusus_per_14hari": 2,
    "member_aktif_hari": 30,
    "stamp_thresholds": "7,8,9",
    "stamp_inaktif_hari": 30,
    "potongan_maks_persen": 50,
    "maks_akun": 6,
    "sesi_hari": 30,
    "ringkasan_jam": "21:30",
    "poin_random_min": 5,
    "poin_random_max": 50,
    "diskon_redeem": 24000,
    "fitur_lencana": "1",
    "fitur_pengumuman": "1",
    "fitur_pengingat_stempel": "1",
    "fitur_rating": "1",
    "demo_mode": "1",
}


def get_settings():
    rows = query("SELECT key, value FROM settings")
    data = dict(DEFAULT_SETTINGS)
    for r in rows:
        data[r["key"]] = r["value"]
    return data


def set_setting(key, value):
    execute("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, str(value)))


def audit(aktor, aksi, lama=None, baru=None):
    execute("INSERT INTO audit_logs(aktor, aksi, nilai_lama, nilai_baru, waktu) VALUES(?,?,?,?,?)",
            (aktor, aksi, util.dump_json(lama) if lama is not None else None,
             util.dump_json(baru) if baru is not None else None, util.iso(util.now())))


def init():
    connect()
    if scalar("SELECT COUNT(*) FROM settings", default=0) == 0:
        for k, v in DEFAULT_SETTINGS.items():
            set_setting(k, v)
        set_setting("pin_hash", util.hash_password("2727"))
    from . import seed
    if scalar("SELECT COUNT(*) FROM users", default=0) == 0:
        seed.run()
