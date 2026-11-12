"""HTTP API: routing, auth guards, handlers."""
import json
import re
import threading
import time
from datetime import datetime, timedelta

from . import admin, analytics, attendance, auth, db, loyalty, payroll, reports, util

ROUTES = []
RL_LOCK = threading.Lock()
RL = {}


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


def route(method, pattern):
    def deco(fn):
        ROUTES.append((method, re.compile("^" + pattern + "$"), fn))
        return fn
    return deco


def match(method, path):
    for m, rx, fn in ROUTES:
        if m != method:
            continue
        found = rx.match(path)
        if found:
            return fn, found.groupdict()
    return None, None


def rate_limit(key, limit, window, message="Terlalu banyak percobaan. Coba lagi nanti."):
    now = time.time()
    with RL_LOCK:
        bucket = RL.setdefault(key, [])
        bucket[:] = [t for t in bucket if now - t < window]
        if len(bucket) >= limit:
            raise ApiError(message, 429)
        bucket.append(now)


def _int(v, default=None):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


# --------------------------------------------------------------------------- guards
def require_employee(ctx):
    s = ctx.session
    if not s or s["kind"] != "pegawai":
        raise ApiError("Sesi pegawai tidak ditemukan. Silakan masuk lagi.", 401)
    user = db.one("SELECT * FROM users WHERE id=?", (s["ref_id"],))
    if not user or not user["aktif"]:
        raise ApiError("Akun tidak aktif.", 401)
    return user


def require_member(ctx):
    s = ctx.session
    if not s or s["kind"] != "member":
        raise ApiError("Sesi member tidak ditemukan.", 401)
    member = db.one("SELECT * FROM members WHERE id=?", (s["ref_id"],))
    if not member:
        raise ApiError("Kartu tidak ditemukan.", 401)
    return member


def require_admin(ctx):
    s = ctx.session
    if not s or s["kind"] != "admin":
        raise ApiError("Sesi admin berakhir. Masukkan PIN kembali.", 401)
    return s


def public_catalog():
    return [dict(a) for a in db.query("SELECT * FROM aroma WHERE aktif=1 ORDER BY kategori, nama")]


def public_branches(lat=None, lng=None):
    rows = db.query("SELECT id, nama, brand, alamat, lat, lng, radius, jam_tutup FROM branches WHERE aktif=1 ORDER BY urutan, id")
    if lat is not None and lng is not None:
        for b in rows:
            b["jarak"] = round(util.haversine(lat, lng, b["lat"], b["lng"]), 1)
            b["dalam_radius"] = b["jarak"] <= b["radius"]
    return rows


# --------------------------------------------------------------------------- public
@route("GET", "/api/health")
def health(ctx):
    return {"ok": True, "time": util.iso(util.now())}


@route("GET", "/api/bootstrap")
def bootstrap(ctx):
    s = db.get_settings()
    return {
        "server_time": util.iso(util.now()),
        "shifts": util.SHIFTS,
        "demo_mode": str(s.get("demo_mode", "1")) == "1",
        "branches": public_branches(),
        "settings": {
            "diskon": int(s.get("diskon_redeem", 24000)), "toleransi": int(s.get("toleransi_menit", 0)),
            "jam_tutup_default": s.get("jam_tutup_default"), "sesi_hari": int(s.get("sesi_hari", 30)),
            "maks_akun": int(s.get("maks_akun", 6)), "fitur_lencana": str(s.get("fitur_lencana", "1")) == "1",
            "fitur_rating": str(s.get("fitur_rating", "1")) == "1",
            "stamp_thresholds": s.get("stamp_thresholds", "7,8,9"),
            "ringkasan_jam": s.get("ringkasan_jam", "21:30"),
        },
        "session": auth.session_payload(ctx.session),
    }


@route("GET", "/api/session")
def get_session(ctx):
    return {"session": auth.session_payload(ctx.session), "server_time": util.iso(util.now())}


@route("POST", "/api/auth/register")
def register(ctx):
    rate_limit("register:" + ctx.ip, 10, 600)
    body = ctx.body
    if body.get("password") != body.get("password_confirm") and body.get("password_confirm") is not None:
        raise ApiError("Konfirmasi kata sandi tidak sama.")
    user = auth.register_employee(body.get("nama"), body.get("hp"), body.get("password"))
    token, expires = auth.create_session("pegawai", user["id"], bool(body.get("remember")), ctx.device)
    ctx.set_cookie(token, expires, bool(body.get("remember")))
    return {"user": auth.public_user(user), "expires": util.iso(expires)}


@route("POST", "/api/auth/login")
def login(ctx):
    rate_limit("login:" + ctx.ip, 20, 600)
    body = ctx.body
    if not body.get("hp") or not body.get("password"):
        raise ApiError("Nomor HP dan kata sandi wajib diisi.")
    user = auth.login_employee(body.get("hp"), body.get("password"))
    token, expires = auth.create_session("pegawai", user["id"], bool(body.get("remember")), ctx.device)
    ctx.set_cookie(token, expires, bool(body.get("remember")))
    db.audit(user["nama"], "Login", None, {"perangkat": body.get("device") or "Perangkat"})
    return {"user": auth.public_user(user), "remember": bool(body.get("remember")),
            "expires": util.iso(expires)}


@route("POST", "/api/auth/switch")
def switch(ctx):
    rate_limit("switch:" + ctx.ip, 20, 600)
    body = ctx.body
    user = auth.switch_account(_int(body.get("user_id")), body.get("password"), True, ctx.device)
    auth.revoke(ctx.token)
    token, expires = auth.create_session("pegawai", user["id"], True, ctx.device)
    ctx.set_cookie(token, expires, True)
    db.audit(user["nama"], "Ganti akun di perangkat", None, {"perangkat": body.get("device") or "Perangkat"})
    return {"user": auth.public_user(user), "ok": True}


@route("POST", "/api/auth/logout")
def logout(ctx):
    if ctx.session and ctx.session["kind"] == "pegawai":
        u = db.one("SELECT nama FROM users WHERE id=?", (ctx.session["ref_id"],))
        db.audit(u["nama"] if u else "Pegawai", "Keluar", None, {})
    auth.revoke(ctx.token)
    ctx.clear_cookie()
    return {"ok": True}


@route("POST", "/api/auth/reset")
def reset(ctx):
    rate_limit("reset:" + ctx.ip, 5, 900, "Terlalu banyak permintaan reset. Coba lagi 15 menit lagi.")
    body = ctx.body
    user = auth.reset_password(body.get("hp"), body.get("nama"), body.get("password"))
    return {"ok": True, "nama": user["nama"],
            "pesan": "Kata sandi berhasil diubah. Semua sesi tersimpan di perangkat lain telah diakhiri."}


@route("POST", "/api/member/otp")
def member_otp(ctx):
    rate_limit("otp:" + ctx.ip, 12, 600)
    body = ctx.body
    member, kode = auth.request_otp(body.get("hp"), body.get("nama"))
    db.execute("INSERT INTO attempts(user_id, jenis, alasan, waktu) VALUES(?,?,?,?)",
               (None, "otp", "kode untuk " + util.mask_phone(member["hp"]), util.iso(util.now())))
    return {"nama": member["nama"], "hp_mask": util.mask_phone(member["hp"]), "kode_demo": kode,
            "pesan": "Kode akses 6 angka dikirim ke WhatsApp/SMS."}


@route("POST", "/api/member/verify")
def member_verify(ctx):
    rate_limit("otpverify:" + ctx.ip, 20, 600)
    body = ctx.body
    member = auth.verify_otp(body.get("hp"), body.get("kode"))
    token, expires = auth.create_session("member", member["id"], True, ctx.device)
    ctx.set_cookie(token, expires, True)
    db.audit("Member " + member["nama"], "Buka kartu digital", None, {})
    return {"member": auth.public_member(member)}


@route("POST", "/api/admin/pin")
def admin_pin(ctx):
    rate_limit("pin:" + ctx.ip, 5, 900, "PIN salah. Coba lagi 15 menit lagi.")
    body = ctx.body
    if not auth.verify_admin_pin(body.get("pin")):
        db.audit("Tidak dikenal", "PIN portal salah", None, {"ip": ctx.ip})
        raise ApiError("PIN salah.", 401)
    with RL_LOCK:
        RL.pop("pin:" + ctx.ip, None)
    token, expires = auth.create_session("admin", None, False, ctx.device, info=ctx.ip)
    ctx.set_cookie(token, expires, False)
    db.audit("Owner", "Masuk portal admin", None, {"ip": ctx.ip})
    return {"ok": True, "nama": "Owner Aroma Jiwa", "expires": util.iso(expires)}


@route("POST", "/api/admin/logout")
def admin_logout(ctx):
    require_admin(ctx)
    auth.revoke(ctx.token)
    ctx.clear_cookie()
    db.audit("Owner", "Keluar portal admin", None, {})
    return {"ok": True}


# --------------------------------------------------------------------------- employee
@route("GET", "/api/me")
def me(ctx):
    user = require_employee(ctx)
    return {"user": auth.public_user(user), "dashboard": attendance.employee_dashboard(user)}


@route("GET", "/api/me/dashboard")
def dashboard_me(ctx):
    user = require_employee(ctx)
    return attendance.employee_dashboard(user)


@route("GET", "/api/branches")
def branches_ctx(ctx):
    lat = ctx.query.get("lat")
    lng = ctx.query.get("lng")
    try:
        lat = float(lat) if lat else None
        lng = float(lng) if lng else None
    except ValueError:
        lat = lng = None
    return {"branches": public_branches(lat, lng)}


@route("GET", "/api/me/month")
def my_month(ctx):
    user = require_employee(ctx)
    now = util.now()
    tahun = _int(ctx.query.get("tahun"), now.year)
    bulan = _int(ctx.query.get("bulan"), now.month)
    data = attendance.month_data(user["id"], tahun, bulan)
    start = data["start"]
    end = data["end"]
    return {"month": data, "stats": attendance.period_stats(user["id"], start, end),
            "schedules": attendance.schedule_range(user["id"], start, end),
            "badges": attendance.badge_data(user["id"]), "sapaan": util.greeting_for(util.now())}


@route("GET", "/api/me/history")
def my_history(ctx):
    user = require_employee(ctx)
    end = util.today_str()
    start = (util.now() - timedelta(days=180)).strftime("%Y-%m-%d")
    rows = db.query("""SELECT a.*, b.nama AS branch_nama FROM attendance a JOIN branches b ON b.id=a.branch_id
                       WHERE a.user_id=? AND a.tanggal BETWEEN ? AND ? ORDER BY a.tanggal DESC, a.check_in DESC""",
                    (user["id"], start, end))
    stats = attendance.period_stats(user["id"], start, end)
    week_start = (util.now() - timedelta(days=6)).strftime("%Y-%m-%d")
    return {"records": [attendance.serialize(r) for r in rows], "stats": stats,
            "stats_minggu": attendance.period_stats(user["id"], week_start, end),
            "stats_bulan": attendance.period_stats(user["id"], util.now().replace(day=1).strftime("%Y-%m-%d"), end),
            "streak": attendance.streak(user["id"]), "badges": attendance.badge_data(user["id"]),
            "notifications": attendance.notifications(user["id"])}


@route("GET", "/api/me/notifications")
def my_notifications(ctx):
    user = require_employee(ctx)
    return {"items": attendance.notifications(user["id"]), "announcements": unread_announcements(user)}


@route("POST", "/api/me/notifications/read")
def read_notifications(ctx):
    user = require_employee(ctx)
    for key in ctx.body.get("keys") or []:
        db.execute("INSERT OR IGNORE INTO notification_reads(user_id, kunci, waktu) VALUES(?,?,?)",
                   (user["id"], key, util.iso(util.now())))
    return {"ok": True}


@route("PATCH", "/api/me/prefs")
def save_prefs(ctx):
    user = require_employee(ctx)
    prefs = util.read_json(user.get("prefs"), {})
    incoming = ctx.body or {}
    if "tema" in incoming:
        prefs["tema"] = incoming["tema"] if incoming["tema"] in ("light", "dark", "system") else "system"
    if "notif" in incoming and isinstance(incoming["notif"], dict):
        prefs.setdefault("notif", {}).update({k: bool(v) for k, v in incoming["notif"].items()})
    db.execute("UPDATE users SET prefs=? WHERE id=?", (util.dump_json(prefs), user["id"]))
    return {"prefs": prefs}


@route("POST", "/api/attendance/checkin")
def checkin(ctx):
    user = require_employee(ctx)
    att = attendance.check_in(user, ctx.body)
    return {"attendance": att, "dashboard": attendance.employee_dashboard(user)}


@route("POST", "/api/attendance/checkout")
def checkout(ctx):
    user = require_employee(ctx)
    att = attendance.check_out(user, ctx.body, khusus=False)
    return {"attendance": att, "dashboard": attendance.employee_dashboard(user)}


@route("POST", "/api/attendance/checkout-khusus")
def checkout_khusus(ctx):
    user = require_employee(ctx)
    att = attendance.check_out(user, ctx.body, khusus=True)
    return {"attendance": att, "dashboard": attendance.employee_dashboard(user)}


@route("GET", "/api/announcements")
def announcements_ctx(ctx):
    require_employee(ctx)
    user = ctx.session and db.one("SELECT * FROM users WHERE id=?", (ctx.session["ref_id"],))
    rows = db.query("""SELECT a.*, b.nama AS branch_nama FROM announcements a LEFT JOIN branches b ON b.id=a.branch_id
                       WHERE a.mulai<=? AND (a.berakhir IS NULL OR a.berakhir>=?)
                       ORDER BY a.sematkan DESC, a.mulai DESC""",
                    (util.iso(util.now()), util.today_str()))
    reads = set(r["announcement_id"] for r in db.query("SELECT announcement_id FROM announcement_reads WHERE user_id=?",
                                                       (user["id"],)))
    month_sched_branches = set(s["branch_id"] for s in db.query(
        "SELECT branch_id FROM schedules WHERE user_id=? AND tanggal>=?", (user["id"], util.today_str())))
    out = []
    for a in rows:
        if not a["semua"] and a["branch_id"] not in month_sched_branches:
            continue
        item = dict(a)
        item["dibaca"] = a["id"] in reads
        item["waktu_baca"] = max(1, round(len(a["isi"]) / 200.0))
        out.append(item)
    return {"items": out}


def unread_announcements(user):
    rows = db.query("""SELECT a.* FROM announcements a WHERE a.mulai<=? AND (a.berakhir IS NULL OR a.berakhir>=?)
                       AND a.id NOT IN (SELECT announcement_id FROM announcement_reads WHERE user_id=?)
                       ORDER BY a.sematkan DESC, a.mulai DESC LIMIT 5""",
                    (util.iso(util.now()), util.today_str(), user["id"]))
    return rows


@route("POST", "/api/announcements/(?P<aid>[0-9]+)/read")
def announcement_read(ctx):
    user = require_employee(ctx)
    db.execute("INSERT OR IGNORE INTO announcement_reads(announcement_id, user_id, waktu) VALUES(?,?,?)",
               (_int(ctx.params["aid"]), user["id"], util.iso(util.now())))
    return {"ok": True}


@route("GET", "/api/aroma")
def aroma_list(ctx):
    require_employee(ctx)
    return {"aroma": public_catalog(), "inventory": db.query("SELECT * FROM inventory_items WHERE aktif=1")}


@route("GET", "/api/member/lookup")
def member_lookup(ctx):
    pegawai = require_employee(ctx)
    rate_limit("lookup:%s" % pegawai["id"], int(db.get_settings().get("cari_limit_menit", 20)), 60,
               "Pencarian dibatasi 20 kali per menit. Coba lagi sebentar.")
    return {"items": loyalty.search(ctx.query.get("q") or "")}


@route("GET", "/api/member/code/(?P<kode>[A-Za-z0-9]+)")
def member_by_code(ctx):
    require_employee(ctx)
    member = loyalty.by_code(ctx.params["kode"])
    if not member:
        raise ApiError("Kartu tidak dikenali. Coba scan ulang atau cari manual.", 404)
    data = loyalty.card(member)
    data["pending"] = db.one("""SELECT * FROM redemption_requests WHERE member_id=? AND status='pending'
                                ORDER BY id DESC LIMIT 1""", (member["id"],))
    return data


@route("GET", "/api/member/(?P<mid>[0-9]+)")
def member_view(ctx):
    pegawai = require_employee(ctx)
    member = loyalty.get_member(_int(ctx.params["mid"]))
    if not member:
        raise ApiError("Member tidak ditemukan.", 404)
    data = loyalty.card(member)
    data["pending"] = db.one("""SELECT * FROM redemption_requests WHERE member_id=? AND status='pending'
                                ORDER BY id DESC LIMIT 1""", (member["id"],))
    return data


@route("POST", "/api/stamps")
def stamp_create(ctx):
    pegawai = require_employee(ctx)
    result = loyalty.give_stamp(pegawai, ctx.body)
    realtime_ping_admin()
    return result


@route("POST", "/api/member/(?P<mid>[0-9]+)/redeem")
def redeem_confirm(ctx):
    pegawai = require_employee(ctx)
    member = loyalty.get_member(_int(ctx.params["mid"]))
    if not member:
        raise ApiError("Member tidak ditemukan.", 404)
    body = ctx.body
    pending = db.one("SELECT * FROM redemption_requests WHERE member_id=? AND status='pending' ORDER BY id DESC LIMIT 1",
                     (member["id"],))
    jenis = body.get("jenis") or (pending["jenis"] if pending else "diskon")
    result = loyalty.redeem(member, {"jenis": jenis, "pegawai_id": pegawai["id"],
                                     "branch_id": body.get("branch_id")})
    if pending:
        db.execute("UPDATE redemption_requests SET status='confirmed', pegawai_id=?, nilai=?, waktu_konfirmasi=? WHERE id=?",
                   (pegawai["id"], result["nilai"], util.iso(util.now()), pending["id"]))
    return {"redemption": result, "member": loyalty.card(loyalty.get_member(member["id"]))}


@route("GET", "/api/redeem-requests")
def redeem_requests(ctx):
    require_employee(ctx)
    rows = db.query("""SELECT r.*, m.nama AS member_nama, m.hp, m.stempel_aktif FROM redemption_requests r
                       JOIN members m ON m.id=r.member_id WHERE r.status='pending' ORDER BY r.id DESC LIMIT 20""")
    for r in rows:
        r["hp_mask"] = util.mask_phone(r["hp"])
        r.pop("hp", None)
    return {"items": rows}


@route("POST", "/api/ratings")
def rating_create(ctx):
    member = require_member(ctx)
    result = loyalty.save_rating(member, ctx.body)
    return result


@route("GET", "/api/stock-reports/mine")
def my_stock_reports(ctx):
    user = require_employee(ctx)
    rows = db.query("""SELECT s.*, b.nama AS branch_nama FROM stock_reports s JOIN branches b ON b.id=s.branch_id
                       WHERE s.pelapor=? ORDER BY s.dibuat DESC LIMIT 40""", (user["id"],))
    return {"items": rows}


@route("POST", "/api/stock-reports")
def stock_create(ctx):
    user = require_employee(ctx)
    body = ctx.body
    item_name = (body.get("item_nama") or "").strip()
    tingkat = body.get("tingkat")
    branch = attendance.get_branch(body.get("branch_id"))
    if not item_name:
        raise ApiError("Pilih barang yang dilaporkan.")
    if tingkat not in ("Menipis", "Hampir Habis", "Habis"):
        raise ApiError("Tingkat stok tidak valid.")
    if not branch:
        raise ApiError("Cabang tidak valid.")
    since = util.iso(util.now() - timedelta(hours=24))
    existing = db.one("""SELECT * FROM stock_reports WHERE branch_id=? AND item_nama=? AND dibuat>=? AND status<>'Ditutup'""",
                      (branch["id"], item_name, since))
    severity = {"Menipis": 0, "Hampir Habis": 1, "Habis": 2}
    if existing:
        worse = tingkat if severity[tingkat] > severity[existing["tingkat"]] else existing["tingkat"]
        db.execute("UPDATE stock_reports SET jumlah_pelapor=jumlah_pelapor+1, tingkat=? WHERE id=?", (worse, existing["id"]))
        rid = existing["id"]
    else:
        rid = db.execute("""INSERT INTO stock_reports(branch_id, item_id, item_nama, tingkat, perkiraan_sisa, catatan,
                            foto, pelapor, status, jumlah_pelapor, dibuat) VALUES(?,?,?,?,?,?,?,?, 'Baru', 1, ?)""",
                         (branch["id"], body.get("item_id"), item_name, tingkat, body.get("perkiraan_sisa"),
                          body.get("catatan"), body.get("foto"), user["id"], util.iso(util.now())))
    db.audit(user["nama"], "Melapor stok menipis", None, {"barang": item_name, "tingkat": tingkat, "cabang": branch["nama"]})
    realtime_ping_admin()
    return {"id": rid, "merged": bool(existing)}


# --------------------------------------------------------------------------- member
@route("GET", "/api/member/me")
def member_me(ctx):
    member = require_member(ctx)
    data = loyalty.card(member)
    data["pending"] = db.one("""SELECT * FROM redemption_requests WHERE member_id=? AND status='pending'
                                ORDER BY id DESC LIMIT 1""", (member["id"],))
    data["bootstrap"] = {"server_time": util.iso(util.now()), "branches": public_branches()}
    return data


@route("POST", "/api/member/me/redeem")
def member_redeem(ctx):
    member = require_member(ctx)
    if member["stempel_aktif"] < 9:
        raise ApiError("Kartu belum penuh.")
    jenis = ctx.body.get("jenis") or "diskon"
    existing = db.one("SELECT * FROM redemption_requests WHERE member_id=? AND status='pending'", (member["id"],))
    if existing:
        db.execute("UPDATE redemption_requests SET jenis=? WHERE id=?", (jenis, existing["id"]))
        rid = existing["id"]
    else:
        rid = db.execute("""INSERT INTO redemption_requests(member_id, jenis, status, waktu) VALUES(?,?, 'pending', ?)""",
                         (member["id"], jenis, util.iso(util.now())))
    db.execute("""INSERT INTO member_notifications(member_id, kunci, jenis, isi, dibaca, waktu)
                  VALUES(?,?,?,?,0,?)
                  ON CONFLICT(kunci) DO UPDATE SET isi=excluded.isi, dibaca=0, waktu=excluded.waktu""",
               (member["id"], "redeem_req_%s" % rid, "redeem",
                "Tunjukkan kartu ke kasir untuk konfirmasi redeem.", util.iso(util.now())))
    from . import realtime
    realtime.publish("redeem_request", {"member": member["nama"], "jenis": jenis, "id": rid}, ("pegawai", 0))
    realtime.publish("admin_refresh", {"scope": "redeem"}, ("admin",))
    return {"id": rid, "status": "pending", "pesan": "Tunjukkan barcode ke pegawai untuk konfirmasi."}


@route("POST", "/api/member/me/rating")
def member_rating(ctx):
    member = require_member(ctx)
    return loyalty.save_rating(member, ctx.body)


@route("POST", "/api/member/me/notifications/read")
def member_read_notif(ctx):
    member = require_member(ctx)
    loyalty.mark_notifications_read(member["id"], ctx.body.get("kunci"))
    return {"ok": True}


@route("PATCH", "/api/member/me/prefs")
def member_prefs(ctx):
    member = require_member(ctx)
    prefs = util.read_json(member.get("prefs"), {})
    incoming = ctx.body or {}
    if "tema" in incoming:
        prefs["tema"] = incoming["tema"] if incoming["tema"] in ("light", "dark", "system") else "system"
    if "notif" in incoming and isinstance(incoming["notif"], dict):
        prefs.setdefault("notif", {}).update({k: bool(v) for k, v in incoming["notif"].items()})
    db.execute("UPDATE members SET prefs=? WHERE id=?", (util.dump_json(prefs), member["id"]))
    return {"prefs": prefs}


@route("POST", "/api/member/logout")
def member_logout(ctx):
    auth.revoke(ctx.token)
    ctx.clear_cookie()
    return {"ok": True}


@route("POST", "/api/member/me/purchase")
def member_purchase(ctx):
    member = require_member(ctx)
    return loyalty.add_purchase(member, ctx.body)


# --------------------------------------------------------------------------- admin
@route("GET", "/api/admin/dashboard")
def admin_dashboard(ctx):
    require_admin(ctx)
    data = admin.dashboard()
    data["analytics"] = analytics.customer(util.now().strftime("%Y-%m-01"), util.today_str())
    data["rating"] = analytics.ratings(util.now().strftime("%Y-%m-01"), util.today_str())
    data["stock"] = admin.stock_list()
    data["redeem_requests"] = db.query("""SELECT r.*, m.nama AS member_nama FROM redemption_requests r
                                          JOIN members m ON m.id=r.member_id WHERE r.status='pending'
                                          ORDER BY r.id DESC LIMIT 10""")
    data["settings"] = admin.settings_payload()
    return data


@route("GET", "/api/admin/attendance")
def admin_attendance(ctx):
    require_admin(ctx)
    today = util.today_str()
    start = ctx.query.get("start") or util.now().replace(day=1).strftime("%Y-%m-%d")
    end = ctx.query.get("end") or today
    branch_id = _int(ctx.query.get("branch_id"))
    user_id = _int(ctx.query.get("user_id"))
    return admin.attendance_list(start, end, branch_id, user_id, ctx.query.get("q"))


@route("POST", "/api/admin/attendance")
def admin_attendance_create(ctx):
    require_admin(ctx)
    return admin.attendance_save("Owner", ctx.body)


@route("PATCH", "/api/admin/attendance/(?P<aid>[0-9]+)")
def admin_attendance_update(ctx):
    require_admin(ctx)
    body = dict(ctx.body)
    body["id"] = _int(ctx.params["aid"])
    return admin.attendance_save("Owner", body)


@route("DELETE", "/api/admin/attendance/(?P<aid>[0-9]+)")
def admin_attendance_delete(ctx):
    require_admin(ctx)
    return admin.attendance_delete("Owner", _int(ctx.params["aid"]))


@route("GET", "/api/admin/warnings")
def admin_warnings(ctx):
    require_admin(ctx)
    return admin.warnings_list(ctx.query.get("status"))


@route("PATCH", "/api/admin/warnings/(?P<wid>[0-9]+)")
def admin_warning_update(ctx):
    require_admin(ctx)
    return admin.warning_update(_int(ctx.params["wid"]), ctx.body.get("status"), ctx.body.get("catatan"))


@route("GET", "/api/admin/analytics")
def admin_analytics(ctx):
    require_admin(ctx)
    end = ctx.query.get("end") or util.today_str()
    start = ctx.query.get("start") or util.now().replace(day=1).strftime("%Y-%m-%d")
    branch_id = _int(ctx.query.get("branch_id"))
    pegawai_id = _int(ctx.query.get("pegawai_id"))
    return {"periode": {"start": start, "end": end},
            "customer": analytics.customer(start, end, branch_id, pegawai_id),
            "rating": analytics.ratings(start, end, branch_id, pegawai_id),
            "aroma": analytics.aroma(start, end, branch_id, pegawai_id),
            "branches": admin.branch_options(), "employees": admin.employees()}


@route("GET", "/api/admin/payroll")
def admin_payroll(ctx):
    require_admin(ctx)
    periode = ctx.query.get("periode") or util.now().strftime("%Y-%m")
    return {"overview": payroll.period_overview(periode), "rates": payroll.rates(),
            "advances": db.query("""SELECT a.*, u.nama AS user_nama FROM advances a JOIN users u ON u.id=a.user_id
                                    ORDER BY a.tanggal DESC"""),
            "history": db.query("""SELECT p.*, u.nama AS user_nama FROM payroll p JOIN users u ON u.id=p.user_id
                                   ORDER BY p.id DESC LIMIT 60"""),
            "employees": admin.employees(), "settings": admin.settings_payload()}


@route("POST", "/api/admin/payroll/preview")
def admin_payroll_preview(ctx):
    require_admin(ctx)
    body = ctx.body
    start = body.get("start")
    end = body.get("end")
    if not start or not end:
        start, end = payroll.period_bounds(body.get("periode") or util.now().strftime("%Y-%m"))
    return payroll.preview(_int(body.get("user_id")), start, end, body.get("bonus") or 0,
                           body.get("potongan_lain") or [], body.get("potongan_kasbon"))


@route("POST", "/api/admin/payroll")
def admin_payroll_save(ctx):
    require_admin(ctx)
    return payroll.save("Owner", ctx.body)


@route("POST", "/api/admin/payroll/(?P<pid>[0-9]+)/reopen")
def admin_payroll_reopen(ctx):
    require_admin(ctx)
    return payroll.reopen("Owner", _int(ctx.params["pid"]))


@route("POST", "/api/admin/advances")
def admin_advance_create(ctx):
    require_admin(ctx)
    return payroll.add_advance("Owner", ctx.body)


@route("DELETE", "/api/admin/advances/(?P<aid>[0-9]+)")
def admin_advance_delete(ctx):
    require_admin(ctx)
    return payroll.delete_advance("Owner", _int(ctx.params["aid"]))


@route("GET", "/api/admin/employees")
def admin_employees(ctx):
    require_admin(ctx)
    rows = admin.employees()
    for r in rows:
        r["streak"] = attendance.streak(r["id"])
    return {"employees": rows, "branches": admin.branch_options()}


@route("GET", "/api/admin/branches")
def admin_branches(ctx):
    require_admin(ctx)
    today = util.today_str()
    rows = admin.branches()
    for b in rows:
        b["hadir_hari_ini"] = db.scalar("SELECT COUNT(*) FROM attendance WHERE branch_id=? AND tanggal=?", (b["id"], today), 0)
        b["stempel_hari_ini"] = db.scalar("SELECT COUNT(*) FROM stamps WHERE branch_id=? AND waktu LIKE ?",
                                          (b["id"], today + "%"), 0)
    return {"branches": rows, "radius_default": db.get_settings().get("radius_default")}


@route("POST", "/api/admin/branches")
def admin_branch_save(ctx):
    require_admin(ctx)
    return admin.branch_save("Owner", ctx.body)


@route("GET", "/api/admin/schedules")
def admin_schedules(ctx):
    require_admin(ctx)
    now = util.now()
    start = ctx.query.get("start") or (now - timedelta(days=now.day - 1)).strftime("%Y-%m-%d")
    end = ctx.query.get("end") or (now + timedelta(days=21)).strftime("%Y-%m-%d")
    return {"schedules": admin.schedule_list(start, end, _int(ctx.query.get("branch_id"))), "start": start, "end": end,
            "employees": admin.employees(), "branches": admin.branch_options()}


@route("POST", "/api/admin/schedules")
def admin_schedule_save(ctx):
    require_admin(ctx)
    return admin.schedule_save("Owner", ctx.body)


@route("DELETE", "/api/admin/schedules/(?P<sid>[0-9]+)")
def admin_schedule_delete(ctx):
    require_admin(ctx)
    return admin.schedule_delete("Owner", _int(ctx.params["sid"]))


@route("GET", "/api/admin/members")
def admin_members(ctx):
    require_admin(ctx)
    return {"items": admin.members_list(ctx.query.get("q")), "total": db.scalar("SELECT COUNT(*) FROM members", default=0),
            "aktif_hari": int(db.get_settings().get("member_aktif_hari", 30))}


@route("GET", "/api/admin/members/(?P<mid>[0-9]+)")
def admin_member_detail(ctx):
    require_admin(ctx)
    mid = _int(ctx.params["mid"])
    member = loyalty.get_member(mid)
    if not member:
        raise ApiError("Member tidak ditemukan.", 404)
    data = loyalty.card(member, reveal=True)
    data["member"]["hp"] = member["hp"]
    data["redemptions"] = db.query("""SELECT r.*, b.nama AS branch_nama FROM redemptions r
                                      LEFT JOIN branches b ON b.id=r.branch_id WHERE r.member_id=? ORDER BY r.waktu DESC""", (mid,))
    data["ratings"] = db.query("SELECT * FROM ratings WHERE member_id=? ORDER BY waktu DESC LIMIT 10", (mid,))
    return data


@route("GET", "/api/admin/announcements")
def admin_announcements(ctx):
    require_admin(ctx)
    return {"items": admin.announcements(), "branches": admin.branch_options()}


@route("POST", "/api/admin/announcements")
def admin_announcement_save(ctx):
    require_admin(ctx)
    return admin.announcement_save("Owner", ctx.body)


@route("DELETE", "/api/admin/announcements/(?P<aid>[0-9]+)")
def admin_announcement_delete(ctx):
    require_admin(ctx)
    return admin.announcement_delete("Owner", _int(ctx.params["aid"]))


@route("GET", "/api/admin/stock")
def admin_stock(ctx):
    require_admin(ctx)
    return {"items": admin.stock_list(ctx.query.get("status"), _int(ctx.query.get("branch_id"))),
            "catalog": admin.catalog(), "branches": admin.branch_options(),
            "counts": {r["status"]: r["n"] for r in db.query("SELECT status, COUNT(*) AS n FROM stock_reports GROUP BY status")}}


@route("PATCH", "/api/admin/stock/(?P<sid>[0-9]+)")
def admin_stock_update(ctx):
    require_admin(ctx)
    return admin.stock_update("Owner", _int(ctx.params["sid"]), ctx.body.get("status"), ctx.body.get("catatan"))


@route("GET", "/api/admin/catalog")
def admin_catalog(ctx):
    require_admin(ctx)
    return admin.catalog()


@route("POST", "/api/admin/aroma")
def admin_aroma_save(ctx):
    require_admin(ctx)
    return admin.aroma_save("Owner", ctx.body)


@route("POST", "/api/admin/items")
def admin_item_save(ctx):
    require_admin(ctx)
    return admin.item_save("Owner", ctx.body)


@route("GET", "/api/admin/settings")
def admin_settings(ctx):
    require_admin(ctx)
    return {"settings": admin.settings_payload(), "branches": admin.branch_options(),
            "sessions": admin.sessions_admin()}


@route("PATCH", "/api/admin/settings")
def admin_settings_update(ctx):
    require_admin(ctx)
    body = dict(ctx.body)
    if body.get("pin"):
        auth.set_admin_pin(body.pop("pin"))
    return {"settings": admin.settings_update("Owner", body)}


@route("GET", "/api/admin/audit")
def admin_audit(ctx):
    require_admin(ctx)
    rows = admin.audit_list()
    for r in rows:
        r["nilai_lama"] = util.read_json(r["nilai_lama"], None)
        r["nilai_baru"] = util.read_json(r["nilai_baru"], None)
    return {"items": rows}


@route("GET", "/api/admin/summaries")
def admin_summaries(ctx):
    require_admin(ctx)
    return {"items": admin.summary_list(), "today": admin.summary_data(util.today_str())}


@route("POST", "/api/admin/summaries")
def admin_summary_generate(ctx):
    require_admin(ctx)
    return admin.summary_generate(ctx.body.get("tanggal"))


@route("GET", "/api/admin/export")
def admin_export(ctx):
    require_admin(ctx)
    kind = ctx.query.get("type") or "absensi"
    start = ctx.query.get("start") or util.now().replace(day=1).strftime("%Y-%m-%d")
    end = ctx.query.get("end") or util.today_str()
    branch_id = _int(ctx.query.get("branch_id"))
    user_id = _int(ctx.query.get("user_id"))
    branch = attendance.get_branch(branch_id) if branch_id else None
    user = db.one("SELECT * FROM users WHERE id=?", (user_id,)) if user_id else None
    if kind == "absensi":
        blob, name = reports.attendance_report(start, end, branch_id, user_id,
                                               branch["nama"] if branch else None, user["nama"] if user else None)
    elif kind == "gaji":
        blob, name = reports.payroll_report(ctx.query.get("periode") or util.now().strftime("%Y-%m"))
    elif kind == "ringkasan":
        blob, name = reports.summary_report(ctx.query.get("tanggal") or util.today_str())
    elif kind == "peringatan":
        blob, name = reports.warnings_report()
    elif kind == "analitik":
        blob, name = reports.analytics_report(start, end, branch["nama"] if branch else "Semua cabang")
    elif kind == "kas":
        blob, name = reports.cash_report(start, end)
    elif kind == "member":
        member_id = _int(ctx.query.get("member_id"))
        if not member_id:
            raise ApiError("Pilih member terlebih dahulu untuk mencetak riwayat kartu.")
        blob, name = reports.member_history_report(member_id)
    else:
        raise ApiError("Jenis laporan tidak dikenal.")
    db.audit("Owner", "Ekspor PDF", None, {"jenis": kind, "file": name})
    return {"__file__": blob, "filename": name, "content_type": "application/pdf"}


def realtime_ping_admin():
    from . import realtime
    realtime.publish("admin_refresh", {"scope": "stamps"}, ("admin",))


def dispatch(ctx):
    fn, params = match(ctx.method, ctx.path)
    if not fn:
        # friendly 404 for unknown api
        return None, None
    ctx.params = params
    return fn(ctx), params
