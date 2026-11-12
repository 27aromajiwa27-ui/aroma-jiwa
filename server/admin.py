"""Owner portal operations: dashboard, editors, warnings, summaries, settings."""
from datetime import datetime, timedelta

from . import analytics, attendance, db, payroll, util

REWARD_LABELS = {"diskon": "Potongan Rp 24.000", "poin": "Random Point"}


def employees():
    return db.query("SELECT id, nama, hp, aktif, dibuat FROM users WHERE peran='pegawai' ORDER BY nama")


def branches():
    return db.query("SELECT * FROM branches ORDER BY urutan, id")


def branch_options():
    return [{"id": b["id"], "nama": b["nama"], "brand": b["brand"], "aktif": bool(b["aktif"]),
             "radius": b["radius"], "jam_tutup": b["jam_tutup"]} for b in branches()]


def admin_rows(rows):
    out = []
    for r in rows:
        item = attendance.serialize(r, with_kas=True)
        item["user_id"] = r["user_id"]
        item["user_nama"] = r.get("user_nama")
        item["kas_total_pengeluaran"] = sum(e.get("nominal", 0) for e in item["kas"]["expenses"])
        item["mock"] = bool(r.get("mock"))
        out.append(item)
    return out


def attendance_list(start, end, branch_id=None, user_id=None, q=None):
    sql = """SELECT a.*, b.nama AS branch_nama, u.nama AS user_nama FROM attendance a
             JOIN branches b ON b.id=a.branch_id JOIN users u ON u.id=a.user_id
             WHERE a.tanggal BETWEEN ? AND ?"""
    args = [start, end]
    if branch_id:
        sql += " AND a.branch_id=?"
        args.append(branch_id)
    if user_id:
        sql += " AND a.user_id=?"
        args.append(user_id)
    if q:
        sql += " AND u.nama LIKE ?"
        args.append("%" + q + "%")
    sql += " ORDER BY a.tanggal DESC, a.check_in DESC LIMIT 300"
    rows = db.query(sql, tuple(args))
    totals = {
        "hadir": len([r for r in rows if r["check_in"]]),
        "terlambat": len([r for r in rows if (r["menit_telat"] or 0) > attendance.tolerance() and r["check_in"]]),
        "khusus": len([r for r in rows if r["tipe_checkout"] == "khusus"]),
        "kas": sum(r["kas_cash"] or 0 for r in rows),
        "pengeluaran": sum(sum(e.get("nominal", 0) for e in util.read_json(r["kas_expenses"], [])) for r in rows),
        "jam": round(sum((r["durasi_menit"] or 0) for r in admin_rows(rows)) / 60.0, 1),
    }
    return {"records": admin_rows(rows), "totals": totals}


def _as_dt(tanggal, value):
    if not value:
        return None
    if len(str(value)) <= 5:
        return util.dt_at(tanggal, str(value))
    return util.parse_iso(value)


def attendance_save(aktor, payload):
    tanggal = payload.get("tanggal") or util.today_str()
    shift = payload.get("shift")
    if shift not in util.SHIFTS:
        raise ValueError("Shift tidak valid.")
    branch = attendance.get_branch(payload.get("branch_id"))
    if not branch:
        raise ValueError("Cabang tidak valid.")
    user = db.one("SELECT * FROM users WHERE id=?", (payload.get("user_id"),))
    if not user:
        raise ValueError("Pegawai tidak valid.")
    check_in = _as_dt(tanggal, payload.get("check_in"))
    check_out = _as_dt(tanggal, payload.get("check_out"))
    if check_out and not check_in:
        raise ValueError("Isi jam masuk sebelum jam pulang.")
    if check_in and check_out and check_out <= check_in:
        raise ValueError("Jam pulang harus setelah jam masuk.")
    mulai = attendance.shift_start(tanggal, shift)
    late = max(0, util.minutes_between(mulai, check_in)) if check_in else 0
    if payload.get("menit_telat") is not None and payload.get("menit_telat") != "":
        late = max(0, int(payload.get("menit_telat")))
    if late <= attendance.tolerance():
        late = 0
    base_end = attendance.shift_end(tanggal, shift, branch)
    dispensasi = 1 if payload.get("dispensasi") else 0
    pulang_min = base_end if dispensasi else base_end + timedelta(minutes=late)
    tipe = payload.get("tipe_checkout") or ("normal" if check_out else None)
    aid = payload.get("id")
    values = (user["id"], branch["id"], shift, tanggal, util.iso(check_in) if check_in else None,
              util.iso(check_out) if check_out else None, late, util.iso(pulang_min), dispensasi, tipe,
              payload.get("kategori_khusus") or None, payload.get("alasan_khusus") or None,
              payload.get("kas_cash") if payload.get("kas_cash") not in ("", None) else None,
              util.dump_json(payload.get("expenses") or []), payload.get("kas_catatan") or None,
              payload.get("catatan_admin") or None, util.iso(util.now()))
    if aid:
        old = db.one("SELECT * FROM attendance WHERE id=?", (aid,))
        if not old:
            raise ValueError("Data absensi tidak ditemukan.")
        db.execute("""UPDATE attendance SET user_id=?, branch_id=?, shift=?, tanggal=?, check_in=?, check_out=?,
                      menit_telat=?, jam_pulang_min=?, dispensasi=?, tipe_checkout=?, kategori_khusus=?, alasan_khusus=?,
                      kas_cash=?, kas_expenses=?, kas_catatan=?, catatan_admin=?, diubah=? WHERE id=?""",
                   values + (aid,))
        db.audit(aktor, "Mengubah data absensi",
                 {"tanggal": old["tanggal"], "shift": old["shift"], "check_in": old["check_in"],
                  "check_out": old["check_out"], "menit_telat": old["menit_telat"]},
                 {"tanggal": tanggal, "shift": shift, "check_in": util.iso(check_in) if check_in else None,
                  "check_out": util.iso(check_out) if check_out else None, "menit_telat": late,
                  "pegawai": user["nama"]})
        return {"id": aid}
    if db.one("SELECT id FROM attendance WHERE user_id=? AND tanggal=? AND shift=?", (user["id"], tanggal, shift)):
        raise ValueError("Pegawai sudah punya absensi untuk shift ini di tanggal tersebut.")
    aid = db.execute("""INSERT INTO attendance(user_id, branch_id, shift, tanggal, check_in, check_out, menit_telat,
                       jam_pulang_min, dispensasi, tipe_checkout, kategori_khusus, alasan_khusus, kas_cash, kas_expenses,
                       kas_catatan, catatan_admin, dibuat) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                     values[:-1] + (util.iso(util.now()),))
    db.audit(aktor, "Menambah data absensi", None,
             {"pegawai": user["nama"], "tanggal": tanggal, "shift": shift, "cabang": branch["nama"]})
    return {"id": aid}


def attendance_delete(aktor, aid):
    row = db.one("""SELECT a.*, u.nama AS user_nama FROM attendance a JOIN users u ON u.id=a.user_id WHERE a.id=?""", (aid,))
    if not row:
        raise ValueError("Data absensi tidak ditemukan.")
    db.execute("DELETE FROM attendance WHERE id=?", (aid,))
    db.audit(aktor, "Menghapus data absensi", {"pegawai": row["user_nama"], "tanggal": row["tanggal"],
                                               "shift": row["shift"], "check_in": row["check_in"]}, None)
    return {"ok": True}


def dashboard():
    generate_warnings()
    now = util.now()
    today = now.strftime("%Y-%m-%d")
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")

    def day_stats(d):
        rows = db.query("""SELECT a.*, u.nama AS user_nama, b.nama AS branch_nama FROM attendance a
                           JOIN users u ON u.id=a.user_id JOIN branches b ON b.id=a.branch_id
                           WHERE a.tanggal=? ORDER BY a.check_in DESC""", (d,))
        stamps = db.scalar("SELECT COUNT(*) FROM stamps WHERE waktu LIKE ?", (d + "%",), 0)
        redeem = db.scalar("SELECT COUNT(*) FROM redemptions WHERE waktu LIKE ?", (d + "%",), 0)
        tokens = db.scalar("SELECT COUNT(*) FROM members WHERE dibuat LIKE ?", (d + "%",), 0)
        cash = sum(r["kas_cash"] or 0 for r in rows)
        exp = sum(sum(e.get("nominal", 0) for e in util.read_json(r["kas_expenses"], [])) for r in rows)
        return {"tanggal": d, "hadir": len([r for r in rows if r["check_in"]]), "shift": len(rows),
                "terlambat": len([r for r in rows if (r["menit_telat"] or 0) > attendance.tolerance() and r["check_in"]]),
                "stempel": stamps, "redeem": redeem, "member_baru": tokens, "kas": cash, "pengeluaran": exp,
                "belum_checkout": len([r for r in rows if r["check_in"] and not r["check_out"]]),
                "rows": rows}

    t = day_stats(today)
    y = day_stats(yesterday)
    start_month = now.replace(day=1).strftime("%Y-%m-%d")
    month_rows = db.query("SELECT * FROM attendance WHERE tanggal BETWEEN ? AND ? AND check_in IS NOT NULL",
                          (start_month, today))
    tepat = len([r for r in month_rows if (r["menit_telat"] or 0) <= attendance.tolerance()])
    ring = {"persen_tepat": round(tepat * 100.0 / len(month_rows)) if month_rows else 0,
            "hadir": len([r for r in month_rows if r["check_in"]]), "telat": len(month_rows) - tepat,
            "shift": len(month_rows)}
    perf = []
    for i in range(13, -1, -1):
        d = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        rows = db.query("SELECT * FROM attendance WHERE tanggal=? AND check_in IS NOT NULL", (d,))
        okt = len([r for r in rows if (r["menit_telat"] or 0) <= attendance.tolerance()])
        perf.append({"tanggal": d, "hadir": len(rows),
                     "tepat": round(okt * 100.0 / len(rows)) if rows else 0})
    branch_rows = db.query("""SELECT b.nama,
        (SELECT COUNT(*) FROM stamps s WHERE s.branch_id=b.id AND s.waktu LIKE ?) AS stempel,
        (SELECT COUNT(*) FROM attendance a WHERE a.branch_id=b.id AND a.tanggal=?) AS hadir
        FROM branches b WHERE b.aktif=1 ORDER BY stempel DESC""", (today + "%", today))
    warnings = db.query("SELECT COUNT(*) AS n FROM warnings WHERE status='Baru'")[0]["n"]
    activity = []
    for r in t["rows"][:6]:
        s = attendance.serialize(r)
        activity.append({"waktu": s["check_in_jam"], "nama": r["user_nama"], "cabang": r["branch_nama"],
                         "shift": s["shift_nama"], "status": s["status"], "jenis": "masuk" if not r["check_out"] else "pulang"})
    for s in db.query("""SELECT s.*, m.nama AS member, u.nama AS pegawai FROM stamps s JOIN members m ON m.id=s.member_id
                         JOIN users u ON u.id=s.pegawai_id WHERE s.waktu LIKE ? ORDER BY s.waktu DESC LIMIT 5""",
                      (today + "%",)):
        activity.append({"waktu": util.fmt_clock(util.parse_iso(s["waktu"])), "nama": s["member"],
                         "cabang": s["pegawai"], "shift": "Stempel", "status": "tepat", "jenis": "stempel"})
    activity.sort(key=lambda x: x["waktu"] or "", reverse=True)
    activity_label = "Aktivitas Hari Ini"
    if not activity:
        week_ago = (now - timedelta(days=7)).strftime("%Y-%m-%d")
        for r in db.query("""SELECT a.*, u.nama AS user_nama, b.nama AS branch_nama FROM attendance a
                             JOIN users u ON u.id=a.user_id JOIN branches b ON b.id=a.branch_id
                             WHERE a.tanggal BETWEEN ? AND ? AND a.check_in IS NOT NULL
                             ORDER BY a.tanggal DESC, a.check_in DESC LIMIT 6""", (week_ago, today)):
            s = attendance.serialize(r)
            activity.append({"waktu": s["check_in_jam"], "tanggal": r["tanggal"], "nama": r["user_nama"],
                             "cabang": r["branch_nama"], "shift": s["shift_nama"], "status": s["status"],
                             "jenis": "masuk" if not r["check_out"] else "pulang"})
        activity_label = "Aktivitas Terbaru"
    summary = db.one("SELECT * FROM summaries ORDER BY tanggal DESC LIMIT 1")
    if not summary:
        summary = {"tanggal": today, "data": util.dump_json(summary_data(today))}
    return {
        "today": {k: v for k, v in t.items() if k != "rows"},
        "yesterday": {k: v for k, v in y.items() if k != "rows"},
        "ring": ring, "performance": perf, "branches": branch_rows, "warnings": warnings,
        "activity": activity[:8], "activity_label": activity_label, "cash": {"masuk": t["kas"], "keluar": t["pengeluaran"],
                                           "bersih": t["kas"] - t["pengeluaran"]},
        "summary": {"tanggal": summary["tanggal"], "data": util.read_json(summary["data"], {})},
        "stamp_today": t["stempel"], "redeem_today": t["redeem"],
        "employees": employees(), "branch_options": branch_options(),
        "top_streak": [{"nama": u["nama"], "streak": attendance.streak(u["id"])} for u in employees()][:5],
        "audit": db.query("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 6"),
    }


# --------------------------------------------------------------------------- warnings
def _insert_warning(kunci, jenis, waktu, bukti, user_id=None, member_id=None, branch_id=None):
    db.execute("""INSERT OR IGNORE INTO warnings(kunci, jenis, user_id, member_id, branch_id, waktu, bukti, status, dibuat)
                  VALUES(?,?,?,?,?,?,?,'Baru',?)""",
               (kunci, jenis, user_id, member_id, branch_id, waktu, util.dump_json(bukti), util.iso(util.now())))


def generate_warnings():
    s = db.get_settings()
    now = util.now()
    since = (now - timedelta(days=14)).strftime("%Y-%m-%d")
    stamps = db.query("""SELECT s.*, u.nama AS pegawai, m.nama AS member, b.nama AS branch FROM stamps s
                         JOIN users u ON u.id=s.pegawai_id JOIN members m ON m.id=s.member_id
                         JOIN branches b ON b.id=s.branch_id WHERE s.waktu>=?""", (since,))
    per_hour = {}
    per_member = {}
    per_manual = {}
    for st in stamps:
        dt = util.parse_iso(st["waktu"])
        hkey = dt.strftime("%Y-%m-%dT%H")
        per_hour.setdefault((st["pegawai_id"], hkey), []).append(st)
        per_member.setdefault((st["pegawai_id"], st["member_id"], dt.strftime("%Y-%m-%d")), []).append(st)
        if st["sumber"] == "manual":
            per_manual.setdefault((st["pegawai_id"], dt.strftime("%Y-%m-%d")), []).append(st)
    for (uid, hkey), items in per_hour.items():
        if len(items) > int(s.get("stamp_per_jam", 10)):
            first = items[0]
            _insert_warning("stamp_hour_%s_%s" % (uid, hkey), "Stempel berlebihan", first["waktu"],
                            {"pegawai": first["pegawai"], "jumlah": len(items), "rentang": hkey.replace("T", " "),
                             "cabang": first["branch"], "catatan": "%d stempel dalam 1 jam (ambang %s)."
                             % (len(items), s.get("stamp_per_jam", 10))}, user_id=uid, branch_id=first["branch_id"])
    for (uid, mid, day), items in per_member.items():
        if len(items) > int(s.get("stamp_member_per_hari", 2)):
            _insert_warning("stamp_member_%s_%s_%s" % (uid, mid, day), "Stempel berlebihan", items[0]["waktu"],
                            {"pegawai": items[0]["pegawai"], "member": items[0]["member"], "jumlah": len(items),
                             "catatan": "Member yang sama menerima %d stempel dalam sehari." % len(items)},
                            user_id=uid, member_id=mid, branch_id=items[0]["branch_id"])
    for (uid, day), items in per_manual.items():
        if len(items) > int(s.get("stamp_manual_per_hari", 5)):
            _insert_warning("stamp_manual_%s_%s" % (uid, day), "Stempel berlebihan", items[0]["waktu"],
                            {"pegawai": items[0]["pegawai"], "jumlah": len(items),
                             "catatan": "%d stempel manual dalam sehari (ambang %s)."
                             % (len(items), s.get("stamp_manual_per_hari", 5))}, user_id=uid,
                            branch_id=items[0]["branch_id"])
    attempts = db.query("""SELECT a.*, u.nama AS pegawai, b.nama AS branch FROM attempts a
                           LEFT JOIN users u ON u.id=a.user_id LEFT JOIN branches b ON b.id=a.branch_id
                           WHERE a.waktu>=? AND a.jenis='checkin'""", (since,))
    per_fail = {}
    for a in attempts:
        day = (a["waktu"] or "")[:10]
        if a["mock"]:
            _insert_warning("mock_%s_%s" % (a["user_id"], day), "Presensi lokasi mencurigakan", a["waktu"],
                            {"pegawai": a["pegawai"], "catatan": "Mock location terdeteksi.", "cabang": a["branch"]},
                            user_id=a["user_id"], branch_id=a["branch_id"])
        if "radius" in (a["alasan"] or "").lower():
            per_fail.setdefault((a["user_id"], day), []).append(a)
        if a["akurasi"] and a["akurasi"] > 50:
            _insert_warning("akurasi_%s_%s" % (a["user_id"], day), "Presensi lokasi mencurigakan", a["waktu"],
                            {"pegawai": a["pegawai"], "catatan": "Akurasi GPS buruk berulang (%s m)." % a["akurasi"],
                             "cabang": a["branch"]}, user_id=a["user_id"], branch_id=a["branch_id"])
    for (uid, day), items in per_fail.items():
        if len(items) >= int(s.get("geofence_gagal_per_hari", 3)):
            _insert_warning("geo_%s_%s" % (uid, day), "Presensi di luar radius berulang", items[-1]["waktu"],
                            {"pegawai": items[0]["pegawai"], "jumlah": len(items),
                             "catatan": "%d kali gagal validasi geofencing dalam sehari." % len(items)},
                            user_id=uid, branch_id=items[0]["branch_id"])
    atts = db.query("""SELECT a.*, u.nama AS pegawai, b.nama AS branch FROM attendance a
                       JOIN users u ON u.id=a.user_id JOIN branches b ON b.id=a.branch_id
                       WHERE a.tanggal>=?""", (since,))
    late_count = {}
    khusus_count = {}
    per_day_user = {}
    for a in atts:
        if not a["check_in"]:
            continue
        if (a["menit_telat"] or 0) > attendance.tolerance():
            late_count.setdefault(a["user_id"], []).append(a)
        if a["tipe_checkout"] == "khusus":
            khusus_count.setdefault(a["user_id"], []).append(a)
        per_day_user.setdefault((a["user_id"], a["tanggal"]), []).append(a)
    seven = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    for uid, items in late_count.items():
        recent = [i for i in items if i["tanggal"] >= seven]
        if len(recent) >= int(s.get("telat_per_7hari", 3)):
            _insert_warning("telat_%s_%s" % (uid, now.strftime("%Y-%m-%d")), "Keterlambatan berulang", recent[-1]["check_in"],
                            {"pegawai": recent[0]["pegawai"], "jumlah": len(recent),
                             "menit": sum(i["menit_telat"] for i in recent),
                             "catatan": "Terlambat %d kali dalam 7 hari." % len(recent)},
                            user_id=uid, branch_id=recent[0]["branch_id"])
    fourteen = (now - timedelta(days=14)).strftime("%Y-%m-%d")
    for uid, items in khusus_count.items():
        recent = [i for i in items if i["tanggal"] >= fourteen]
        if len(recent) >= int(s.get("khusus_per_14hari", 2)):
            _insert_warning("khusus_%s_%s" % (uid, now.strftime("%Y-%m-%d")), "Check-out khusus berulang",
                            recent[-1]["check_out"] or recent[-1]["check_in"],
                            {"pegawai": recent[0]["pegawai"], "jumlah": len(recent),
                             "alasan": [i["alasan_khusus"] for i in recent][:3],
                             "catatan": "%d check-out khusus dalam 14 hari." % len(recent)},
                            user_id=uid, branch_id=recent[0]["branch_id"])
    for (uid, day), items in per_day_user.items():
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                a, b = items[i], items[j]
                if a["branch_id"] == b["branch_id"] or not a["check_in"] or not b["check_in"]:
                    continue
                ba = attendance.get_branch(a["branch_id"])
                bb = attendance.get_branch(b["branch_id"])
                if not ba or not bb:
                    continue
                dist_km = util.haversine(ba["lat"], ba["lng"], bb["lat"], bb["lng"]) / 1000.0
                gap = abs((util.parse_iso(a["check_in"]) - util.parse_iso(b["check_in"])).total_seconds()) / 60.0
                if gap < (dist_km / 40.0) * 60 and gap < 120:
                    _insert_warning("travel_%s_%s" % (a["id"], b["id"]), "Presensi tidak wajar", b["check_in"],
                                    {"pegawai": a["pegawai"], "catatan": "%s → %s dalam %d menit (jarak %.1f km)."
                                     % (ba["nama"], bb["nama"], int(gap), dist_km),
                                     "cabang": bb["nama"]}, user_id=uid, branch_id=b["branch_id"])
    for r in db.query("SELECT r.*, m.nama AS member FROM redemptions r JOIN members m ON m.id=r.member_id WHERE r.waktu>=?",
                      (since,)):
        day = (r["waktu"] or "")[:10]
        same = db.query("SELECT COUNT(*) AS n FROM redemptions WHERE member_id=? AND waktu LIKE ?",
                        (r["member_id"], day + "%"))[0]["n"]
        if same > 1:
            _insert_warning("redeem_%s_%s" % (r["member_id"], day), "Redeem tidak biasa", r["waktu"],
                            {"member": r["member"], "catatan": "%d redeem dalam sehari." % same}, member_id=r["member_id"])
    for a in db.query("SELECT * FROM audit_logs WHERE waktu>=? AND (aksi LIKE '%absensi%' OR aksi LIKE '%gaji%')",
                      (since,)):
        _insert_warning("audit_%s" % a["id"], "Perubahan data sensitif", a["waktu"],
                        {"aktor": a["aktor"], "aksi": a["aksi"], "catatan": "Perubahan oleh %s." % a["aktor"]})
    return db.query("SELECT COUNT(*) AS n FROM warnings WHERE status='Baru'")[0]["n"]


def warnings_list(status=None):
    generate_warnings()
    sql = """SELECT w.*, u.nama AS user_nama, m.nama AS member_nama, b.nama AS branch_nama FROM warnings w
             LEFT JOIN users u ON u.id=w.user_id LEFT JOIN members m ON m.id=w.member_id
             LEFT JOIN branches b ON b.id=w.branch_id"""
    args = ()
    if status and status != "Semua":
        sql += " WHERE w.status=?"
        args = (status,)
    sql += " ORDER BY w.waktu DESC LIMIT 200"
    rows = db.query(sql, args)
    for r in rows:
        r["bukti"] = util.read_json(r["bukti"], {})
    counts = {r["status"]: r["n"] for r in db.query("SELECT status, COUNT(*) AS n FROM warnings GROUP BY status")}
    return {"items": rows, "counts": counts}


def warning_update(warning_id, status, catatan=None):
    row = db.one("SELECT * FROM warnings WHERE id=?", (warning_id,))
    if not row:
        raise ValueError("Peringatan tidak ditemukan.")
    if status not in ("Baru", "Ditinjau", "Diabaikan"):
        raise ValueError("Status tidak valid.")
    db.execute("UPDATE warnings SET status=?, catatan=? WHERE id=?", (status, catatan, warning_id))
    db.audit("Owner", "Menandai peringatan", {"status": row["status"]}, {"status": status, "jenis": row["jenis"]})
    return {"ok": True}


# --------------------------------------------------------------------------- daily summary
def summary_data(tanggal):
    rows = db.query("""SELECT a.*, u.nama AS user_nama, b.nama AS branch_nama FROM attendance a
                       JOIN users u ON u.id=a.user_id JOIN branches b ON b.id=a.branch_id WHERE a.tanggal=?""", (tanggal,))
    branch_rows = branches()
    per_branch = []
    for b in branch_rows:
        brows = [r for r in rows if r["branch_id"] == b["id"]]
        per_branch.append({
            "branch": b["nama"], "hadir": [r["user_nama"] for r in brows if r["check_in"]],
            "belum_checkout": [r["user_nama"] for r in brows if r["check_in"] and not r["check_out"]],
            "tidak_hadir": [], "telat": [{"nama": r["user_nama"], "menit": r["menit_telat"]} for r in brows
                                          if (r["menit_telat"] or 0) > attendance.tolerance()],
            "khusus": [{"nama": r["user_nama"], "alasan": r["alasan_khusus"]} for r in brows if r["tipe_checkout"] == "khusus"],
            "stempel": db.scalar("SELECT COUNT(*) FROM stamps WHERE branch_id=? AND waktu LIKE ?", (b["id"], tanggal + "%"), 0),
            "redeem": db.scalar("SELECT COUNT(*) FROM redemptions WHERE branch_id=? AND waktu LIKE ?", (b["id"], tanggal + "%"), 0),
            "member_baru": db.scalar("SELECT COUNT(*) FROM members WHERE dibuat LIKE ?", (tanggal + "%",), 0),
            "kas": sum(r["kas_cash"] or 0 for r in brows),
            "pengeluaran": sum(sum(e.get("nominal", 0) for e in util.read_json(r["kas_expenses"], [])) for r in brows),
        })
    stock = db.query("""SELECT s.*, b.nama AS branch_nama FROM stock_reports s JOIN branches b ON b.id=s.branch_id
                        WHERE s.dibuat LIKE ? AND s.status<>'Ditutup'""", (tanggal + "%",))
    warnings = db.query("SELECT * FROM warnings WHERE waktu LIKE ?", (tanggal + "%",))
    rating = db.one("SELECT AVG(bintang) AS rata, COUNT(*) AS n FROM ratings WHERE waktu LIKE ?", (tanggal + "%",))
    return {
        "tanggal": tanggal,
        "per_branch": per_branch,
        "total": {
            "hadir": len([r for r in rows if r["check_in"]]),
            "belum_checkout": len([r for r in rows if r["check_in"] and not r["check_out"]]),
            "terlambat": len([r for r in rows if (r["menit_telat"] or 0) > attendance.tolerance()]),
            "menit_telat": sum(r["menit_telat"] or 0 for r in rows),
            "khusus": len([r for r in rows if r["tipe_checkout"] == "khusus"]),
            "stempel": db.scalar("SELECT COUNT(*) FROM stamps WHERE waktu LIKE ?", (tanggal + "%",), 0),
            "redeem": db.scalar("SELECT COUNT(*) FROM redemptions WHERE waktu LIKE ?", (tanggal + "%",), 0),
            "member_baru": db.scalar("SELECT COUNT(*) FROM members WHERE dibuat LIKE ?", (tanggal + "%",), 0),
            "kas": sum(r["kas_cash"] or 0 for r in rows),
            "pengeluaran": sum(sum(e.get("nominal", 0) for e in util.read_json(r["kas_expenses"], [])) for r in rows),
            "peringatan": len(warnings),
        },
        "kas_per_branch": [{"branch": b["branch"], "kas": b["kas"], "pengeluaran": b["pengeluaran"],
                            "bersih": b["kas"] - b["pengeluaran"]} for b in per_branch],
        "stock": stock, "warnings": warnings,
        "rating": {"rata": round(rating["rata"], 2) if rating["rata"] else None, "jumlah": rating["n"]},
    }


def summary_generate(tanggal=None):
    tanggal = tanggal or util.today_str()
    data = summary_data(tanggal)
    db.execute("INSERT INTO summaries(tanggal, data, dibuat) VALUES(?,?,?) ON CONFLICT(tanggal) DO UPDATE SET data=excluded.data",
               (tanggal, util.dump_json(data), util.iso(util.now())))
    return {"tanggal": tanggal, "data": data}


def summary_list():
    rows = db.query("SELECT tanggal, data, dibuat FROM summaries ORDER BY tanggal DESC LIMIT 30")
    for r in rows:
        r["data"] = util.read_json(r["data"], {})
    return rows


# --------------------------------------------------------------------------- branches, schedules
def branch_save(aktor, payload):
    bid = payload.get("id")
    nama = (payload.get("nama") or "").strip()
    if len(nama) < 3:
        raise ValueError("Nama cabang minimal 3 karakter.")
    try:
        lat = float(payload.get("lat"))
        lng = float(payload.get("lng"))
    except (TypeError, ValueError):
        raise ValueError("Koordinat cabang tidak valid.")
    radius = int(payload.get("radius") or 50)
    if radius < 20 or radius > 200:
        raise ValueError("Radius harus antara 20 sampai 200 meter.")
    data = (nama, payload.get("brand") or "Aroma Jiwa", payload.get("alamat"), lat, lng, radius,
            payload.get("jam_tutup") or "20:30", 1 if payload.get("aktif") else 0)
    if bid:
        old = db.one("SELECT * FROM branches WHERE id=?", (bid,))
        db.execute("""UPDATE branches SET nama=?, brand=?, alamat=?, lat=?, lng=?, radius=?, jam_tutup=?, aktif=? WHERE id=?""",
                   data + (bid,))
        db.audit(aktor, "Mengubah cabang", {"nama": old["nama"], "radius": old["radius"]},
                 {"nama": nama, "radius": radius, "jam_tutup": data[6]})
        return {"id": bid}
    new_id = db.execute("""INSERT INTO branches(nama, brand, alamat, lat, lng, radius, jam_tutup, aktif, urutan)
                           VALUES(?,?,?,?,?,?,?,?, (SELECT COALESCE(MAX(urutan),0)+1 FROM branches))""", data)
    db.audit(aktor, "Menambah cabang", None, {"nama": nama})
    return {"id": new_id}


def schedule_list(start, end, branch_id=None):
    sql = """SELECT s.*, u.nama AS user_nama, b.nama AS branch_nama FROM schedules s
             JOIN users u ON u.id=s.user_id JOIN branches b ON b.id=s.branch_id
             WHERE s.tanggal BETWEEN ? AND ?"""
    args = [start, end]
    if branch_id:
        sql += " AND s.branch_id=?"
        args.append(branch_id)
    sql += " ORDER BY s.tanggal, s.shift"
    return db.query(sql, tuple(args))


def schedule_save(aktor, payload):
    user_id = int(payload.get("user_id"))
    tanggal = payload.get("tanggal")
    shift = payload.get("shift")
    branch_id = int(payload.get("branch_id"))
    if shift not in util.SHIFTS:
        raise ValueError("Shift tidak valid.")
    if not tanggal:
        raise ValueError("Tanggal wajib diisi.")
    db.execute("""INSERT INTO schedules(user_id, tanggal, shift, branch_id, created_by) VALUES(?,?,?,?,?)
                  ON CONFLICT(user_id, tanggal, shift) DO UPDATE SET branch_id=excluded.branch_id""",
               (user_id, tanggal, shift, branch_id, aktor))
    db.audit(aktor, "Menyusun jadwal shift", None, {"user_id": user_id, "tanggal": tanggal, "shift": shift})
    return {"ok": True}


def schedule_delete(aktor, sid):
    row = db.one("SELECT * FROM schedules WHERE id=?", (sid,))
    if not row:
        raise ValueError("Jadwal tidak ditemukan.")
    db.execute("DELETE FROM schedules WHERE id=?", (sid,))
    db.audit(aktor, "Menghapus jadwal shift", {"tanggal": row["tanggal"], "shift": row["shift"]}, None)
    return {"ok": True}


# --------------------------------------------------------------------------- members
def members_list(q=None):
    sql = """SELECT m.*, (SELECT COUNT(*) FROM stamps s WHERE s.member_id=m.id) AS total_stempel,
                    (SELECT MAX(waktu) FROM stamps s WHERE s.member_id=m.id) AS terakhir,
                    (SELECT COUNT(*) FROM redemptions r WHERE r.member_id=m.id) AS total_redeem
             FROM members m"""
    args = ()
    if q:
        sql += " WHERE m.nama LIKE ? OR m.hp LIKE ? OR m.kode LIKE ?"
        args = ("%" + q + "%", "%" + q + "%", "%" + q.upper() + "%")
    sql += " ORDER BY terakhir IS NULL, terakhir DESC LIMIT 300"
    rows = db.query(sql, args)
    for r in rows:
        r["hp"] = util.mask_phone(r["hp"])
    return rows


def member_detail(mid):
    m = db.one("SELECT * FROM members WHERE id=?", (mid,))
    if not m:
        raise ValueError("Member tidak ditemukan.")
    data = loyalty_card(m, reveal=True)
    return data


def loyalty_card(member, reveal=False):
    from . import loyalty
    data = loyalty.card(member, reveal=reveal)
    data["member"]["hp"] = util.mask_phone(member["hp"]) if not reveal else member["hp"]
    return data


# --------------------------------------------------------------------------- announcements & stock
def announcements():
    rows = db.query("""SELECT a.*, b.nama AS branch_nama,
                       (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id=a.id) AS dibaca
                       FROM announcements a LEFT JOIN branches b ON b.id=a.branch_id
                       ORDER BY a.sematkan DESC, a.mulai DESC""")
    total_emp = db.scalar("SELECT COUNT(*) FROM users WHERE peran='pegawai' AND aktif=1", default=0)
    for r in rows:
        r["penerima"] = total_emp if r["semua"] else db.scalar(
            "SELECT COUNT(DISTINCT user_id) FROM schedules WHERE branch_id=? AND tanggal>=?",
            (r["branch_id"], util.today_str()), 0)
        r["dibaca_persen"] = round(r["dibaca"] * 100.0 / r["penerima"]) if r["penerima"] else 0
    return rows


def announcement_save(aktor, payload):
    judul = (payload.get("judul") or "").strip()
    isi = (payload.get("isi") or "").strip()
    if len(judul) < 3:
        raise ValueError("Judul wajib diisi.")
    if len(judul) > 80:
        raise ValueError("Judul maksimal 80 karakter.")
    if len(isi) > 2000:
        raise ValueError("Isi maksimal 2.000 karakter.")
    aid = payload.get("id")
    values = (judul[:80], isi, payload.get("gambar"), payload.get("kategori") or "Info Operasional",
              1 if payload.get("semua", True) else 0, payload.get("branch_id"),
              payload.get("mulai") or util.iso(util.now()), payload.get("berakhir"),
              1 if payload.get("sematkan") else 0, 1 if payload.get("kirim_notif", True) else 0,
              util.iso(util.now()))
    if aid:
        db.execute("""UPDATE announcements SET judul=?, isi=?, gambar=?, kategori=?, semua=?, branch_id=?, mulai=?,
                      berakhir=?, sematkan=?, kirim_notif=?, dibuat=? WHERE id=?""", values + (aid,))
        db.audit(aktor, "Mengubah pengumuman", None, {"judul": judul})
        return {"id": aid}
    aid = db.execute("""INSERT INTO announcements(judul, isi, gambar, kategori, semua, branch_id, mulai, berakhir,
                        sematkan, kirim_notif, dibuat) VALUES(?,?,?,?,?,?,?,?,?,?,?)""", values)
    db.audit(aktor, "Membuat pengumuman", None, {"judul": judul})
    if payload.get("kirim_notif", True):
        from . import realtime
        realtime.publish("announcement", {"judul": judul, "id": aid}, None)
    return {"id": aid}


def announcement_delete(aktor, aid):
    row = db.one("SELECT * FROM announcements WHERE id=?", (aid,))
    db.execute("DELETE FROM announcements WHERE id=?", (aid,))
    db.audit(aktor, "Menghapus pengumuman", {"judul": row["judul"] if row else None}, None)
    return {"ok": True}


def stock_list(status=None, branch_id=None):
    sql = """SELECT s.*, b.nama AS branch_nama, u.nama AS pelapor_nama FROM stock_reports s
             JOIN branches b ON b.id=s.branch_id JOIN users u ON u.id=s.pelapor WHERE 1=1"""
    args = []
    if status and status != "Semua":
        sql += " AND s.status=?"
        args.append(status)
    if branch_id:
        sql += " AND s.branch_id=?"
        args.append(branch_id)
    sql += " ORDER BY CASE s.tingkat WHEN 'Habis' THEN 0 WHEN 'Hampir Habis' THEN 1 ELSE 2 END, s.dibuat DESC"
    return db.query(sql, tuple(args))


def stock_update(aktor, sid, status, catatan=None):
    row = db.one("SELECT * FROM stock_reports WHERE id=?", (sid,))
    if not row:
        raise ValueError("Laporan tidak ditemukan.")
    db.execute("UPDATE stock_reports SET status=?, catatan=?, diproses_oleh=? WHERE id=?",
               (status, catatan or row["catatan"], aktor, sid))
    db.audit(aktor, "Memperbarui laporan stok", {"status": row["status"]}, {"status": status, "item": row["item_nama"]})
    return {"ok": True}


def catalog():
    return {"aroma": db.query("SELECT * FROM aroma ORDER BY kategori, nama"),
            "inventory": db.query("SELECT * FROM inventory_items ORDER BY kategori, nama")}


def aroma_save(aktor, payload):
    aid = payload.get("id")
    nama = (payload.get("nama") or "").strip()
    if len(nama) < 2:
        raise ValueError("Nama aroma wajib diisi.")
    if aid:
        db.execute("UPDATE aroma SET nama=?, kategori=?, deskripsi=?, harga=?, aktif=? WHERE id=?",
                   (nama, payload.get("kategori") or "Floral", payload.get("deskripsi"),
                    int(payload.get("harga") or 0), 1 if payload.get("aktif", True) else 0, aid))
        return {"id": aid}
    new_id = db.execute("INSERT INTO aroma(nama, kategori, deskripsi, harga, aktif) VALUES(?,?,?,?,?)",
                        (nama, payload.get("kategori") or "Floral", payload.get("deskripsi"),
                         int(payload.get("harga") or 0), 1 if payload.get("aktif", True) else 0))
    db.audit(aktor, "Menambah aroma", None, {"nama": nama})
    return {"id": new_id}


def item_save(aktor, payload):
    iid = payload.get("id")
    if iid:
        db.execute("UPDATE inventory_items SET nama=?, kategori=?, satuan=?, batas=?, aktif=? WHERE id=?",
                   (payload.get("nama"), payload.get("kategori") or "Perlengkapan", payload.get("satuan"),
                    payload.get("batas"), 1 if payload.get("aktif", True) else 0, iid))
        return {"id": iid}
    return {"id": db.execute("INSERT INTO inventory_items(nama, kategori, satuan, batas, aktif) VALUES(?,?,?,?,1)",
                             (payload.get("nama"), payload.get("kategori") or "Perlengkapan", payload.get("satuan"),
                              payload.get("batas")))}


# --------------------------------------------------------------------------- settings / misc
def settings_payload():
    s = db.get_settings()
    s.pop("pin_hash", None)
    return s


def settings_update(aktor, payload):
    allowed = [k for k in db.DEFAULT_SETTINGS if k not in ("pin_hash",)]
    changed = {}
    for k, v in payload.items():
        if k not in allowed:
            continue
        db.set_setting(k, v)
        changed[k] = v
    db.audit(aktor, "Mengubah pengaturan", None, changed)
    return settings_payload()


def audit_list(limit=100):
    return db.query("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?", (limit,))


def sessions_admin():
    rows = db.query("""SELECT s.*, u.nama AS user_nama FROM sessions s LEFT JOIN users u ON u.id=s.ref_id
                       WHERE s.kind='pegawai' ORDER BY s.terakhir DESC LIMIT 100""")
    for r in rows:
        r["token_hash"] = r["token_hash"][:10] + "…"
    return rows
