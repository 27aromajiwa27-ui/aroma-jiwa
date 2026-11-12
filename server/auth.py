"""Authentication: employees, members (OTP), admin PIN, sessions."""
import re
from datetime import timedelta

from . import db, util

SESSION_COOKIE = "aj_session"
SHORT_SESSION_HOURS = 12
ADMIN_IDLE_MINUTES = 30
MAX_LOGIN_FAILS = 5
FAIL_WINDOW_MINUTES = 15


def check_phone(hp):
    hp = re.sub(r"[^0-9+]", "", str(hp or ""))
    if hp.startswith("+62"):
        hp = "0" + hp[3:]
    if hp.startswith("62"):
        hp = "0" + hp[2:]
    return hp


def public_user(user):
    prefs = util.read_json(user.get("prefs"), {})
    return {
        "id": user["id"], "nama": user["nama"], "hp": user["hp"], "hp_mask": util.mask_phone(user["hp"]),
        "peran": user["peran"], "avatar": (user.get("nama") or "?")[:1].upper(), "prefs": prefs,
    }


def create_session(kind, ref_id, remember=False, device_id=None, info=None):
    token = util.new_token()
    now = util.now()
    if kind == "admin":
        expires = now + timedelta(minutes=ADMIN_IDLE_MINUTES)
    elif remember:
        expires = now + timedelta(days=int(db.get_settings().get("sesi_hari", 30)))
    else:
        expires = now + timedelta(hours=SHORT_SESSION_HOURS)
    db.execute("""INSERT INTO sessions(token_hash, kind, ref_id, device_id, remember, dibuat, terakhir, kedaluwarsa, dicabut, info)
                  VALUES(?,?,?,?,?,?,?,?,0,?)""",
               (util.token_hash(token), kind, ref_id, device_id, 1 if remember else 0,
                util.iso(now), util.iso(now), util.iso(expires), info))
    return token, expires


def get_session(token):
    if not token:
        return None
    row = db.one("SELECT * FROM sessions WHERE token_hash=?", (util.token_hash(token),))
    if not row or row["dicabut"]:
        return None
    now = util.now()
    expires = util.parse_iso(row["kedaluwarsa"])
    if not expires or expires < now:
        db.execute("UPDATE sessions SET dicabut=1 WHERE id=?", (row["id"],))
        return None
    # sliding expiry
    last = util.parse_iso(row["terakhir"])
    if last and util.minutes_between(last, now) >= 5:
        if row["kind"] == "admin":
            new_exp = now + timedelta(minutes=ADMIN_IDLE_MINUTES)
        elif row["remember"]:
            new_exp = now + timedelta(days=int(db.get_settings().get("sesi_hari", 30)))
        else:
            new_exp = now + timedelta(hours=SHORT_SESSION_HOURS)
        db.execute("UPDATE sessions SET terakhir=?, kedaluwarsa=? WHERE id=?", (util.iso(now), util.iso(new_exp), row["id"]))
        row["kedaluwarsa"] = util.iso(new_exp)
    return row


def revoke(token):
    if token:
        db.execute("UPDATE sessions SET dicabut=1 WHERE token_hash=?", (util.token_hash(token),))


def revoke_all(kind, ref_id):
    db.execute("UPDATE sessions SET dicabut=1 WHERE kind=? AND ref_id=? AND dicabut=0", (kind, ref_id))


def session_payload(session):
    if not session:
        return None
    if session["kind"] == "pegawai":
        user = db.one("SELECT * FROM users WHERE id=?", (session["ref_id"],))
        if not user or not user["aktif"]:
            return None
        return {"kind": "pegawai", "user": public_user(user),
                "expires": session["kedaluwarsa"], "remember": bool(session["remember"])}
    if session["kind"] == "member":
        member = db.one("SELECT * FROM members WHERE id=?", (session["ref_id"],))
        if not member:
            return None
        return {"kind": "member", "member": public_member(member), "expires": session["kedaluwarsa"]}
    if session["kind"] == "admin":
        return {"kind": "admin", "admin": {"nama": "Owner Aroma Jiwa", "peran": "admin"},
                "expires": session["kedaluwarsa"]}
    return None


def public_member(member):
    prefs = util.read_json(member.get("prefs"), {})
    return {"id": member["id"], "nama": member["nama"], "hp": member["hp"],
            "hp_mask": util.mask_phone(member["hp"]), "kode": member["kode"],
            "stempel": member["stempel_aktif"], "prefs": prefs, "dibuat": member["dibuat"]}


def register_employee(nama, hp, password):
    nama = (nama or "").strip()
    hp = check_phone(hp)
    if len(nama) < 3:
        raise ValueError("Nama lengkap minimal 3 karakter.")
    if not re.match(r"^08[0-9]{8,12}$", hp):
        raise ValueError("Nomor HP tidak valid. Gunakan format 08xxxxxxxxxx.")
    if len(password or "") < 6:
        raise ValueError("Kata sandi minimal 6 karakter.")
    if db.one("SELECT id FROM users WHERE hp=?", (hp,)):
        raise ValueError("Nomor HP sudah terdaftar. Silakan masuk.")
    prefs = {"tema": "system", "notif": {"shift": True, "checkin": True, "checkout": True, "pengumuman": True}}
    uid = db.execute("INSERT INTO users(nama, hp, password_hash, peran, prefs, dibuat) VALUES(?,?,?,'pegawai',?,?)",
                     (nama, hp, util.hash_password(password), util.dump_json(prefs), util.iso(util.now())))
    db.audit(nama, "Daftar akun pegawai", None, {"hp": util.mask_phone(hp)})
    return db.one("SELECT * FROM users WHERE id=?", (uid,))


def login_employee(hp, password):
    hp = check_phone(hp)
    user = db.one("SELECT * FROM users WHERE hp=?", (hp,))
    if not user or not util.verify_password(password or "", user["password_hash"]):
        db.execute("INSERT INTO attempts(user_id, jenis, alasan, waktu) VALUES(?,?,?,?)",
                   (user["id"] if user else None, "login", "login gagal", util.iso(util.now())))
        raise ValueError("Nomor HP atau kata sandi salah.")
    if not user["aktif"]:
        raise ValueError("Akun dinonaktifkan. Hubungi owner.")
    return user


def login_member_by_password(hp, password):
    member = db.one("SELECT * FROM members WHERE hp=?", (check_phone(hp),))
    if not member or not util.verify_password(password or "", member.get("password_hash") or ""):
        raise ValueError("Nomor HP atau kata sandi salah.")
    return member


def reset_password(hp, nama, new_password):
    hp = check_phone(hp)
    nama = (nama or "").strip()
    if len(new_password or "") < 6:
        raise ValueError("Kata sandi baru minimal 6 karakter.")
    user = db.one("SELECT * FROM users WHERE hp=?", (hp,))
    if not user or user["nama"].strip().lower() != nama.lower():
        db.audit(nama or "Tidak dikenal", "Reset kata sandi gagal", None, {"hp": util.mask_phone(hp)})
        raise ValueError("Nomor HP dan nama lengkap tidak cocok.")
    db.execute("UPDATE users SET password_hash=? WHERE id=?", (util.hash_password(new_password), user["id"]))
    revoke_all("pegawai", user["id"])
    db.audit(user["nama"], "Reset kata sandi dari halaman login", None, {"hp": util.mask_phone(hp)})
    return user


def change_password(user_id, old_password, new_password):
    user = db.one("SELECT * FROM users WHERE id=?", (user_id,))
    if not user or not util.verify_password(old_password or "", user["password_hash"]):
        raise ValueError("Kata sandi lama tidak cocok.")
    if len(new_password or "") < 6:
        raise ValueError("Kata sandi baru minimal 6 karakter.")
    if old_password == new_password:
        raise ValueError("Kata sandi baru harus berbeda dari yang lama.")
    return user


def verify_admin_pin(pin):
    stored = db.get_settings().get("pin_hash") or ""
    return util.verify_password(str(pin or ""), stored)


def set_admin_pin(new_pin):
    if not re.match(r"^[0-9]{4,6}$", str(new_pin or "")):
        raise ValueError("PIN harus 4 sampai 6 angka.")
    db.set_setting("pin_hash", util.hash_password(str(new_pin)))
    db.audit("Owner", "Mengubah PIN portal", None, {"panjang": len(str(new_pin))})


def request_otp(hp, nama=None):
    """Customer card login. Creates the member when `nama` is supplied."""
    hp = check_phone(hp)
    if not re.match(r"^08[0-9]{8,12}$", hp):
        raise ValueError("Nomor HP tidak valid.")
    member = db.one("SELECT * FROM members WHERE hp=?", (hp,))
    if not member:
        nama = (nama or "").strip()
        if len(nama) < 3:
            raise ValueError("Nomor belum terdaftar. Isi nama untuk membuat kartu baru.")
        mid = db.execute("INSERT INTO members(nama, hp, kode, stempel_aktif, prefs, dibuat) VALUES(?,?,?,0,?,?)",
                         (nama, hp, "TEMP%s" % hp[-6:], util.dump_json({"tema": "system", "notif": {"stamp": True}}),
                          util.iso(util.now())))
        db.execute("UPDATE members SET kode=? WHERE id=?", (util.member_code(mid), mid))
        member = db.one("SELECT * FROM members WHERE id=?", (mid,))
        db.audit("Sistem", "Member baru", None, {"nama": nama, "hp": util.mask_phone(hp)})
    kode = util.random_code(6)
    db.execute("INSERT INTO otps(hp, kode, kedaluwarsa, dipakai, dibuat) VALUES(?,?,?,0,?)",
               (hp, kode, util.iso(util.now() + timedelta(minutes=10)), util.iso(util.now())))
    return member, kode


def verify_otp(hp, kode):
    hp = check_phone(hp)
    row = db.one("SELECT * FROM otps WHERE hp=? AND kode=? AND dipakai=0 ORDER BY id DESC LIMIT 1", (hp, str(kode or "")))
    if not row:
        raise ValueError("Kode akses salah.")
    if util.parse_iso(row["kedaluwarsa"]) < util.now():
        raise ValueError("Kode akses kedaluwarsa. Minta kode baru.")
    db.execute("UPDATE otps SET dipakai=1 WHERE id=?", (row["id"],))
    member = db.one("SELECT * FROM members WHERE hp=?", (hp,))
    if not member:
        raise ValueError("Kartu tidak ditemukan.")
    return member


def switch_account(user_id, password, remember=True, device_id=None):
    user = db.one("SELECT * FROM users WHERE id=?", (user_id,))
    if not user or not util.verify_password(password or "", user["password_hash"]):
        raise ValueError("Kata sandi salah.")
    return user
