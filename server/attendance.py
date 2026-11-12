"""Attendance domain: geofencing, shifts, penalties, cash reports, streaks."""
import math
from datetime import datetime, timedelta

from . import db, util


def get_branch(branch_id):
    return db.one("SELECT * FROM branches WHERE id=?", (branch_id,))


def shift_start(tanggal, shift):
    return util.dt_at(tanggal, util.SHIFTS[shift]["mulai"])


def shift_end(tanggal, shift, branch):
    clock = util.SHIFTS[shift]["pulang"] or (branch["jam_tutup"] if branch else "20:30")
    return util.dt_at(tanggal, clock)


def tolerance():
    return int(db.get_settings().get("toleransi_menit", 0) or 0)


def demo_mode():
    return str(db.get_settings().get("demo_mode", "1")) == "1"


def branch_distances(lat, lng):
    branches = db.query("SELECT * FROM branches WHERE aktif=1 ORDER BY urutan, id")
    out = []
    for b in branches:
        d = None if lat is None or lng is None else round(util.haversine(lat, lng, b["lat"], b["lng"]), 1)
        out.append(dict(b, jarak=d, dalam_radius=(d is not None and d <= b["radius"])))
    return out


def _validate_location(payload, branch):
    """Returns (lat, lng, accuracy, distance, mock) or raises ValueError."""
    demo = bool(payload.get("demo")) and demo_mode()
    try:
        lat = float(payload.get("lat"))
        lng = float(payload.get("lng"))
        accuracy = float(payload.get("accuracy") or 0)
    except (TypeError, ValueError):
        lat = lng = accuracy = None
    mock = bool(payload.get("mock"))
    if demo:
        return branch["lat"], branch["lng"], 8.0, 0.0, False
    if lat is None or lng is None:
        raise ValueError("Lokasi tidak terbaca. Aktifkan izin lokasi lalu coba lagi.")
    if mock:
        raise ValueError("Lokasi palsu (mock location) terdeteksi. Presensi ditolak.")
    if accuracy and accuracy > 50:
        raise ValueError("Akurasi GPS %d m (maksimal 50 m). Tunggu sinyal lebih baik." % round(accuracy))
    distance = util.haversine(lat, lng, branch["lat"], branch["lng"])
    if distance > branch["radius"]:
        raise ValueError("Di luar radius %s. Jarak kamu %d m dari titik cabang (maksimal %d m)."
                         % (branch["nama"], round(distance), branch["radius"]))
    return lat, lng, accuracy, round(distance, 1), False


def _log_attempt(user_id, branch_id, jenis, alasan, distance=None, accuracy=None, lat=None, lng=None, mock=False):
    db.execute("""INSERT INTO attempts(user_id, branch_id, jenis, alasan, jarak, akurasi, lat, lng, mock, waktu)
                  VALUES(?,?,?,?,?,?,?,?,?,?)""",
               (user_id, branch_id, jenis, alasan, distance, accuracy, lat, lng, 1 if mock else 0,
                util.iso(util.now())))


def active_attendance(user_id):
    since = (util.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    return db.one("""SELECT a.*, b.nama AS branch_nama, b.jam_tutup FROM attendance a
                     JOIN branches b ON b.id=a.branch_id
                     WHERE a.user_id=? AND a.check_in IS NOT NULL AND a.check_out IS NULL AND a.tanggal>=?
                     ORDER BY a.check_in DESC LIMIT 1""", (user_id, since))


def serialize(att, with_kas=True):
    if not att:
        return None
    branch = att.get("branch_nama") or (get_branch(att["branch_id"]) or {}).get("nama")
    start = shift_start(att["tanggal"], att["shift"])
    end = util.parse_iso(att["jam_pulang_min"]) or start
    ci = util.parse_iso(att["check_in"])
    co = util.parse_iso(att["check_out"])
    toleransi = tolerance()
    status = "tepat"
    if att["tipe_checkout"] == "khusus":
        status = "khusus"
    elif att["check_in"] is None:
        status = "absen"
    elif (att["menit_telat"] or 0) > toleransi:
        status = "telat"
    else:
        status = "tepat"
    remaining = None
    ready = False
    if ci and not co:
        remaining = max(0, int((end - util.now()).total_seconds()))
        ready = util.now() >= end
    data = {
        "id": att["id"], "tanggal": att["tanggal"], "shift": att["shift"],
        "shift_nama": util.SHIFTS.get(att["shift"], {}).get("nama", att["shift"]),
        "branch_id": att["branch_id"], "branch_nama": branch,
        "check_in": att["check_in"], "check_out": att["check_out"],
        "check_in_jam": util.fmt_clock(ci) if ci else None,
        "check_out_jam": util.fmt_clock(co) if co else None,
        "menit_telat": att["menit_telat"] or 0, "jam_pulang_min": att["jam_pulang_min"],
        "jam_pulang_min_jam": util.fmt_clock(end),
        "dispensasi": bool(att["dispensasi"]), "tipe_checkout": att["tipe_checkout"],
        "kategori_khusus": att["kategori_khusus"], "alasan_khusus": att["alasan_khusus"],
        "status": status, "sisa_detik": remaining, "bisa_checkout": ready,
        "lat": att["lat"], "lng": att["lng"], "akurasi": att["akurasi"], "jarak": att["jarak"],
        "durasi_menit": int((co - ci).total_seconds() // 60) if ci and co else None,
        "shift_mulai": util.SHIFTS.get(att["shift"], {}).get("mulai"),
        "shift_pulang": util.SHIFTS.get(att["shift"], {}).get("pulang") or
                        (get_branch(att["branch_id"]) or {}).get("jam_tutup"),
    }
    if with_kas:
        data["kas"] = {
            "cash": att["kas_cash"], "expenses": util.read_json(att["kas_expenses"], []),
            "catatan": att["kas_catatan"],
        }
    return data


def check_in(user, payload):
    shift = payload.get("shift")
    if shift not in util.SHIFTS:
        raise ValueError("Shift tidak valid.")
    branch = get_branch(payload.get("branch_id"))
    if not branch or not branch["aktif"]:
        raise ValueError("Cabang tidak tersedia.")
    if active_attendance(user["id"]):
        raise ValueError("Kamu masih dalam shift aktif. Selesaikan check-out dulu.")
    tanggal = util.today_str()
    already = db.one("SELECT id FROM attendance WHERE user_id=? AND tanggal=? AND shift=? AND check_in IS NOT NULL",
                     (user["id"], tanggal, shift))
    if already:
        raise ValueError("Kamu sudah check-in shift %s hari ini." % util.SHIFTS[shift]["nama"])
    try:
        lat, lng, accuracy, distance, mock = _validate_location(payload, branch)
    except ValueError as exc:
        _log_attempt(user["id"], branch["id"], "checkin", str(exc),
                     accuracy=payload.get("accuracy"), lat=payload.get("lat"), lng=payload.get("lng"),
                     mock=bool(payload.get("mock")))
        raise
    now = util.now()
    mulai = shift_start(tanggal, shift)
    end = shift_end(tanggal, shift, branch)
    late = max(0, util.minutes_between(mulai, now))
    if late <= tolerance():
        late = 0
    # dispensasi multi-shift: shift Pagi selesai di cabang lain, lalu shift Sore
    dispensasi = 0
    earlier = db.query("""SELECT * FROM attendance WHERE user_id=? AND tanggal=? AND check_in IS NOT NULL
                          AND shift='pagi' AND branch_id<>? ORDER BY check_in LIMIT 1""",
                       (user["id"], tanggal, branch["id"]))
    if shift != "pagi" and earlier and earlier[0]["check_out"]:
        dispensasi = 1
    pulang = end if dispensasi else end + timedelta(minutes=late)
    att_id = db.execute("""INSERT INTO attendance(user_id, branch_id, shift, tanggal, check_in, menit_telat,
                           jam_pulang_min, dispensasi, lat, lng, akurasi, jarak, mock, dibuat)
                           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (user["id"], branch["id"], shift, tanggal, util.iso(now), late, util.iso(pulang),
                         dispensasi, lat, lng, accuracy, distance, 1 if mock else 0, util.iso(now)))
    db.audit(user["nama"], "Check-in", None, {"shift": shift, "cabang": branch["nama"], "telat": late})
    return serialize(active_attendance(user["id"]))


def _kas_payload(payload):
    cash = payload.get("cash", payload.get("kas_cash"))
    try:
        cash = int(round(float(cash)))
    except (TypeError, ValueError):
        raise ValueError("Jumlah uang tunai wajib diisi.")
    if cash < 0:
        raise ValueError("Jumlah uang tunai tidak valid.")
    expenses = payload.get("expenses") or []
    if isinstance(expenses, dict):
        expenses = [expenses]
    clean = []
    for e in expenses:
        try:
            nominal = int(round(float(e.get("nominal") or 0)))
        except (TypeError, ValueError):
            nominal = 0
        if not (e.get("keterangan") or "").strip() and not nominal:
            continue
        clean.append({"keterangan": (e.get("keterangan") or "").strip(), "kategori": e.get("kategori") or "lainnya",
                      "nominal": nominal, "foto": e.get("foto")})
    return cash, clean, (payload.get("catatan") or "").strip()


def check_out(user, payload, khusus=False):
    att = active_attendance(user["id"])
    if not att:
        raise ValueError("Tidak ada shift aktif untuk check-out.")
    branch = get_branch(att["branch_id"])
    if khusus:
        kategori = (payload.get("kategori") or "").strip()
        alasan = (payload.get("alasan") or "").strip()
        if kategori not in ("sakit", "keluarga", "darurat", "lainnya"):
            raise ValueError("Pilih kategori kondisi.")
        if len(alasan) < 5:
            raise ValueError("Alasan tertulis wajib diisi minimal 5 karakter.")
    cash, expenses, catatan = _kas_payload(payload)
    try:
        lat, lng, accuracy, distance, mock = _validate_location(payload, branch)
    except ValueError as exc:
        _log_attempt(user["id"], branch["id"], "checkout", str(exc),
                     accuracy=payload.get("accuracy"), lat=payload.get("lat"), lng=payload.get("lng"),
                     mock=bool(payload.get("mock")))
        raise
    now = util.now()
    pulang_min = util.parse_iso(att["jam_pulang_min"])
    if not khusus and now < pulang_min:
        sisa = int((pulang_min - now).total_seconds())
        raise ValueError("Check-out normal baru bisa pukul %s (kurang %d menit)."
                         % (util.fmt_clock(pulang_min), int(math.ceil(sisa / 60.0))))
    db.execute("""UPDATE attendance SET check_out=?, tipe_checkout=?, kategori_khusus=?, alasan_khusus=?,
                  kas_cash=?, kas_expenses=?, kas_catatan=?, lat=?, lng=?, akurasi=?, jarak=?, mock=?, diubah=?
                  WHERE id=?""",
               (util.iso(now), "khusus" if khusus else "normal",
                (payload.get("kategori") or None) if khusus else None,
                (payload.get("alasan") or None) if khusus else None,
                cash, util.dump_json(expenses), catatan or None, lat, lng, accuracy, distance,
                1 if mock else 0, util.iso(now), att["id"]))
    db.audit(user["nama"], "Check-out khusus" if khusus else "Check-out",
             {"check_out": None}, {"check_out": util.fmt_clock(now), "cabang": branch["nama"]})
    row = db.one("""SELECT a.*, b.nama AS branch_nama FROM attendance a JOIN branches b ON b.id=a.branch_id WHERE a.id=?""",
                 (att["id"],))
    return serialize(row)


def attendance_for_date(user_id, tanggal):
    return db.query("""SELECT a.*, b.nama AS branch_nama FROM attendance a JOIN branches b ON b.id=a.branch_id
                       WHERE a.user_id=? AND a.tanggal=? ORDER BY a.check_in""", (user_id, tanggal))


def month_data(user_id, tahun, bulan):
    start = "%04d-%02d-01" % (tahun, bulan)
    end_day = (datetime(tahun + (1 if bulan == 12 else 0), 1 if bulan == 12 else bulan + 1, 1) - timedelta(days=1)).day
    end = "%04d-%02d-%02d" % (tahun, bulan, end_day)
    att = db.query("""SELECT a.*, b.nama AS branch_nama FROM attendance a JOIN branches b ON b.id=a.branch_id
                      WHERE a.user_id=? AND a.tanggal BETWEEN ? AND ? ORDER BY a.tanggal, a.check_in""",
                   (user_id, start, end))
    sched = db.query("""SELECT s.*, b.nama AS branch_nama FROM schedules s JOIN branches b ON b.id=s.branch_id
                        WHERE s.user_id=? AND s.tanggal BETWEEN ? AND ? ORDER BY s.tanggal""", (user_id, start, end))
    by_date = {}
    for a in att:
        by_date.setdefault(a["tanggal"], []).append(serialize(a))
    for s in sched:
        by_date.setdefault(s["tanggal"], [])
    days = []
    today = util.today_str()
    for d in range(1, end_day + 1):
        ds = "%04d-%02d-%02d" % (tahun, bulan, d)
        items = by_date.get(ds, [])
        has = len(items) > 0
        shifts = sorted(set(i["shift"] for i in items) | set(
            s["shift"] for s in sched if s["tanggal"] == ds))
        days.append({"tanggal": ds, "shifts": shifts, "records": items, "ada": has,
                     "future": ds > today, "weekday": datetime.strptime(ds, "%Y-%m-%d").weekday()})
    return {"start": start, "end": end, "days": days, "records": [serialize(a) for a in att],
            "schedules": [dict(s) for s in sched]}


def period_stats(user_id, start, end):
    rows = db.query("SELECT * FROM attendance WHERE user_id=? AND tanggal BETWEEN ? AND ? AND check_in IS NOT NULL",
                    (user_id, start, end))
    toleransi = tolerance()
    total_min = 0
    telat = 0
    tepat = 0
    khusus = 0
    dispensasi = 0
    for r in rows:
        ci = util.parse_iso(r["check_in"])
        co = util.parse_iso(r["check_out"])
        if ci and co:
            total_min += int((co - ci).total_seconds() // 60)
        if (r["menit_telat"] or 0) > toleransi:
            telat += 1
        else:
            tepat += 1
        if r["tipe_checkout"] == "khusus":
            khusus += 1
        if r["dispensasi"]:
            dispensasi += 1
    return {"shift": len(rows), "menit_kerja": total_min, "jam_kerja": round(total_min / 60.0, 1),
            "telat": telat, "tepat": tepat, "khusus": khusus, "dispensasi": dispensasi,
            "persen_tepat": round(tepat * 100.0 / len(rows)) if rows else 0}


def streak(user_id):
    toleransi = tolerance()
    scheds = db.query("SELECT * FROM schedules WHERE user_id=? AND tanggal<=? ORDER BY tanggal DESC, shift LIMIT 90",
                      (user_id, util.today_str()))
    att = db.query("""SELECT * FROM attendance WHERE user_id=? AND check_in IS NOT NULL""", (user_id,))
    amap = {}
    for a in att:
        amap.setdefault((a["tanggal"], a["shift"]), a)
    now = util.now()
    count = 0
    for s in scheds:
        tanggal = s["tanggal"]
        if tanggal == util.today_str():
            mulai = shift_start(tanggal, s["shift"])
            if now < mulai:
                continue
        a = amap.get((tanggal, s["shift"]))
        if not a:
            break
        if (a["menit_telat"] or 0) > toleransi:
            break
        count += 1
    return count


def badge_data(user_id):
    toleransi = tolerance()
    st = streak(user_id)
    rows = db.query("SELECT * FROM attendance WHERE user_id=? AND check_in IS NOT NULL", (user_id,))
    pagi_tepat = len([r for r in rows if r["shift"] == "pagi" and (r["menit_telat"] or 0) <= toleransi])
    full_tepat = len([r for r in rows if r["shift"] == "fullday" and (r["menit_telat"] or 0) <= toleransi])
    kas_rows = db.query("""SELECT * FROM attendance WHERE user_id=? AND check_out IS NOT NULL AND tipe_checkout='normal'
                           ORDER BY check_in DESC LIMIT 30""", (user_id,))
    kas_run = 0
    for r in kas_rows:
        if r["kas_cash"] is not None:
            kas_run += 1
        else:
            break
    stamps = db.scalar("SELECT COUNT(*) FROM stamps WHERE pegawai_id=?", (user_id,), 0)
    month_start = util.now().replace(day=1).strftime("%Y-%m-%d")
    month_rows = db.query("SELECT * FROM attendance WHERE user_id=? AND tanggal>=? AND check_in IS NOT NULL",
                          (user_id, month_start))
    month_sched = db.query("SELECT * FROM schedules WHERE user_id=? AND tanggal>=? AND tanggal<=?",
                           (user_id, month_start, util.today_str()))
    perfect = bool(month_sched) and all((r["menit_telat"] or 0) <= toleransi for r in month_rows) and \
        len(month_rows) >= len(month_sched) and len(month_rows) > 0
    badges = [
        {"id": "rajin", "nama": "Si Rajin", "syarat": "Streak 7 shift berturut-turut", "progress": st, "target": 7},
        {"id": "emas", "nama": "Disiplin Emas", "syarat": "Streak 30 shift berturut-turut", "progress": st, "target": 30},
        {"id": "pagi", "nama": "Pagi Perkasa", "syarat": "20 shift Pagi tepat waktu", "progress": pagi_tepat, "target": 20},
        {"id": "fullday", "nama": "Full Day Hero", "syarat": "10 shift Full Day tepat waktu", "progress": full_tepat, "target": 10},
        {"id": "kas", "nama": "Kas Rapi", "syarat": "10 laporan kas lengkap berturut-turut", "progress": kas_run, "target": 10},
        {"id": "stempel", "nama": "Penjaga Stempel", "syarat": "50 stempel diberikan", "progress": stamps, "target": 50},
        {"id": "sempurna", "nama": "Sempurna Sebulan", "syarat": "Semua shift tepat waktu bulan ini",
         "progress": 1 if perfect else 0, "target": 1},
    ]
    for b in badges:
        b["terbuka"] = b["progress"] >= b["target"]
        b["persen"] = min(100, int(b["progress"] * 100 / b["target"]))
    return {"streak": st, "streak_terbaik": max(st, int(db.get_settings().get("streak_terbaik_%d" % user_id, 0) or 0)),
            "badges": badges, "terbuka": len([b for b in badges if b["terbuka"]])}


def notifications(user_id):
    now = util.now()
    today = util.today_str()
    s = db.get_settings()
    prefs = util.read_json((db.one("SELECT prefs FROM users WHERE id=?", (user_id,)) or {}).get("prefs"), {})
    notif_prefs = prefs.get("notif") or {"shift": True, "checkin": True, "checkout": True}
    rows = []
    recs = attendance_for_date(user_id, today)
    active = [r for r in recs if r["check_in"] and not r["check_out"]]
    scheds = db.query("""SELECT s.*, b.nama AS branch_nama FROM schedules s JOIN branches b ON b.id=s.branch_id
                         WHERE s.user_id=? AND s.tanggal=?""", (user_id, today))
    for sc in scheds:
        mulai = shift_start(today, sc["shift"])
        done = [r for r in recs if r["shift"] == sc["shift"] and r["check_in"]]
        mins_to = util.minutes_between(now, mulai)
        if notif_prefs.get("shift", True) and 0 <= mins_to <= int(s.get("reminder_shift_menit", 30)):
            rows.append({"kunci": "shift_%s_%s_%s" % (today, sc["shift"], sc["id"]), "jenis": "shift",
                         "judul": "Shift akan mulai",
                         "isi": "Shift kamu di %s mulai pukul %s." % (sc["branch_nama"], util.SHIFTS[sc["shift"]]["mulai"]),
                         "waktu": util.iso(now), "ikon": "clock"})
        if notif_prefs.get("checkin", True) and not done and 0 < util.minutes_between(mulai, now) >= int(s.get("reminder_checkin_menit", 10)):
            rows.append({"kunci": "belum_%s_%s" % (today, sc["shift"]), "jenis": "checkin",
                         "judul": "Belum check-in",
                         "isi": "Kamu belum check-in. Segera lakukan di %s." % sc["branch_nama"],
                         "waktu": util.iso(now), "ikon": "alert"})
    for a in active:
        pulang = util.parse_iso(a["jam_pulang_min"])
        if notif_prefs.get("checkout", True) and now >= pulang:
            rows.append({"kunci": "checkout_%s" % a["id"], "jenis": "checkout", "judul": "Check-out sudah bisa",
                         "isi": "Check-out normal sudah bisa diklik di %s." % a["branch_nama"],
                         "waktu": util.iso(pulang), "ikon": "logout"})
        if now >= pulang + timedelta(minutes=int(s.get("reminder_checkout_menit", 30))):
            rows.append({"kunci": "lupa_%s" % a["id"], "jenis": "checkout", "judul": "Jangan lupa check-out",
                         "isi": "Jangan lupa check-out sebelum meninggalkan cabang.",
                         "waktu": util.iso(now), "ikon": "alert"})
    reads = set(r["kunci"] for r in db.query("SELECT kunci FROM notification_reads WHERE user_id=?", (user_id,)))
    for r in rows:
        r["dibaca"] = r["kunci"] in reads
    return rows


def schedule_range(user_id, start, end):
    rows = db.query("""SELECT s.*, b.nama AS branch_nama FROM schedules s JOIN branches b ON b.id=s.branch_id
                       WHERE s.user_id=? AND s.tanggal BETWEEN ? AND ? ORDER BY s.tanggal, s.shift""",
                    (user_id, start, end))
    att = db.query("""SELECT * FROM attendance WHERE user_id=? AND tanggal BETWEEN ? AND ?""", (user_id, start, end))
    amap = {(a["tanggal"], a["shift"]): a for a in att}
    out = []
    for r in rows:
        a = amap.get((r["tanggal"], r["shift"]))
        item = dict(r)
        item["attendance"] = serialize(a) if a else None
        out.append(item)
    return out


def employee_dashboard(user):
    now = util.now()
    today = util.today_str()
    recs = [serialize(a) for a in attendance_for_date(user["id"], today)]
    active = next((r for r in recs if r["check_in"] and not r["check_out"]), None)
    scheds = db.query("""SELECT s.*, b.nama AS branch_nama FROM schedules s JOIN branches b ON b.id=s.branch_id
                         WHERE s.user_id=? AND s.tanggal>=? ORDER BY s.tanggal, s.shift LIMIT 30""",
                      (user["id"], today))
    start_month = now.replace(day=1).strftime("%Y-%m-%d")
    stats = period_stats(user["id"], start_month, today)
    bd = badge_data(user["id"])
    prefs = util.read_json(user.get("prefs"), {})
    return {
        "server_time": util.iso(now), "tanggal": today, "sapaan": util.greeting_for(now),
        "user": {"id": user["id"], "nama": user["nama"], "hp": user["hp"], "hp_mask": util.mask_phone(user["hp"])},
        "records": recs, "active": active, "today_schedules": [dict(s) for s in scheds if s["tanggal"] == today],
        "upcoming": [dict(s) for s in scheds if s["tanggal"] >= today][:8],
        "stats": stats, "streak": bd["streak"], "badges": bd["badges"], "badges_terbuka": bd["terbuka"],
        "notifications": notifications(user["id"]), "prefs": prefs,
        "tolerance": tolerance(), "demo_mode": demo_mode(),
    }
