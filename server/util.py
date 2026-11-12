"""Shared helpers: time (WIB), hashing, geo, misc formatting."""
import hashlib
import hmac
import json
import math
import os
import secrets
import string
from datetime import datetime, timedelta, timezone

WIB = timezone(timedelta(hours=7))
SHIFTS = {
    "pagi": {"nama": "Pagi", "mulai": "10:00", "pulang": "16:00", "kode": "P", "warna": "emas"},
    "sore": {"nama": "Sore", "mulai": "15:00", "pulang": None, "kode": "S", "warna": "oranye"},
    "fullday": {"nama": "Full Day", "mulai": "10:00", "pulang": None, "kode": "F", "warna": "biru"},
}

ROLE_EMPLOYEE = "pegawai"


def now():
    return datetime.now(WIB).replace(microsecond=0)


def today_str():
    return now().strftime("%Y-%m-%d")


def iso(dt):
    if dt is None:
        return None
    return dt.astimezone(WIB).replace(microsecond=0).isoformat()


def parse_iso(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def dt_at(date_str, clock):
    """Combine a YYYY-MM-DD date with HH:MM in WIB."""
    hh, mm = [int(x) for x in clock.split(":")]
    d = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=WIB)
    return d.replace(hour=hh, minute=mm)


def minutes_between(a, b):
    return int((b - a).total_seconds() // 60)


def fmt_clock(dt):
    return dt.astimezone(WIB).strftime("%H:%M")


def fmt_date_id(dt):
    hari = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
    bulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
             "Agustus", "September", "Oktober", "November", "Desember"]
    return "%s, %d %s %d" % (hari[dt.weekday()], dt.day, bulan[dt.month - 1], dt.year)


def rupiah(n):
    try:
        n = int(round(float(n)))
    except (TypeError, ValueError):
        n = 0
    return "Rp " + format(n, ",d").replace(",", ".")


def haversine(lat1, lng1, lat2, lng2):
    """Distance in meters."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120000).hex()
    return "pbkdf2$120000$%s$%s" % (salt, digest)


def verify_password(password, stored):
    try:
        _, rounds, salt, digest = stored.split("$")
        calc = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(rounds)).hex()
        return hmac.compare_digest(calc, digest)
    except Exception:
        return False


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def new_token():
    return secrets.token_urlsafe(32)


def member_code(member_id):
    secret = os.environ.get("AJ_SECRET", "aroma-jiwa-hadri-2026").encode()
    mac = hmac.new(secret, ("member:%s" % member_id).encode(), hashlib.sha256).hexdigest()
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    raw = int(mac[:16], 16)
    out = []
    for _ in range(8):
        raw, rem = divmod(raw, len(alphabet))
        out.append(alphabet[rem])
    return "AJ" + "".join(out)


def mask_phone(hp):
    hp = str(hp or "")
    if len(hp) <= 7:
        return hp
    return hp[:4] + "-" + "*" * (len(hp) - 7) + "-" + hp[-3:]


def read_json(value, default):
    if value is None or value == "":
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return default


def dump_json(value):
    return json.dumps(value, ensure_ascii=False)


def random_code(digits=6):
    return "".join(secrets.choice(string.digits) for _ in range(digits))


def greeting_for(dt):
    h = dt.hour
    if 4 <= h < 11:
        return "Selamat pagi"
    if 11 <= h < 15:
        return "Selamat siang"
    if 15 <= h < 18:
        return "Selamat sore"
    return "Selamat malam"
