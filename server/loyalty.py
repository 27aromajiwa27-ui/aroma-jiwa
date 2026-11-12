"""Loyalty domain: member cards, stamps, redeem, aroma, ratings."""
from datetime import timedelta

from . import db, realtime, util


def get_member(member_id):
    return db.one("SELECT * FROM members WHERE id=?", (member_id,))


def by_code(kode):
    return db.one("SELECT * FROM members WHERE kode=?", ((kode or "").strip().upper(),))


def stamps_for(member_id, limit=40):
    rows = db.query("""SELECT s.*, b.nama AS branch_nama, u.nama AS pegawai_nama FROM stamps s
                       JOIN branches b ON b.id=s.branch_id JOIN users u ON u.id=s.pegawai_id
                       WHERE s.member_id=? ORDER BY s.waktu DESC LIMIT ?""", (member_id, limit))
    return rows


def purchases_for(member_id, limit=20):
    return db.query("""SELECT p.*, b.nama AS branch_nama FROM purchases p
                       LEFT JOIN branches b ON b.id=p.branch_id
                       WHERE p.member_id=? ORDER BY p.waktu DESC LIMIT ?""", (member_id, limit))


def favorites(member_id, limit=3):
    rows = db.query("""SELECT aroma_nama, COUNT(*) AS jumlah, MAX(waktu) AS terakhir FROM purchases
                       WHERE member_id=? AND aroma_nama IS NOT NULL
                       GROUP BY aroma_nama ORDER BY jumlah DESC, terakhir DESC LIMIT ?""", (member_id, limit))
    for r in rows:
        a = db.one("SELECT * FROM aroma WHERE nama=?", (r["aroma_nama"],))
        r["aroma"] = a
    return rows


def similar_aroma(member_id):
    fav = favorites(member_id, 1)
    if not fav or not fav[0].get("aroma"):
        return []
    kat = fav[0]["aroma"]["kategori"]
    return db.query("""SELECT * FROM aroma WHERE aktif=1 AND kategori=? AND nama<>? ORDER BY RANDOM() LIMIT 3""",
                    (kat, fav[0]["aroma_nama"]))


def member_notifications(member_id):
    now = util.now()
    s = db.get_settings()
    member = get_member(member_id)
    out = []
    rows = db.query("SELECT * FROM member_notifications WHERE member_id=? ORDER BY waktu DESC LIMIT 30", (member_id,))
    for r in rows:
        out.append({"id": r["id"], "kunci": r["kunci"], "jenis": r["jenis"], "isi": r["isi"],
                    "dibaca": bool(r["dibaca"]), "waktu": r["waktu"]})
    if str(s.get("fitur_pengingat_stempel", "1")) == "1":
        last = db.one("SELECT * FROM stamps WHERE member_id=? ORDER BY waktu DESC LIMIT 1", (member_id,))
        if last:
            last_dt = util.parse_iso(last["waktu"])
            inactive = int(s.get("stamp_inaktif_hari", 30))
            if member["stempel_aktif"] >= 7 and util.minutes_between(last_dt, now) >= inactive * 24 * 60:
                key = "inaktif_%s_%s" % (member_id, last_dt.strftime("%Y%m%d"))
                out.append({"id": key, "kunci": key, "jenis": "inaktif",
                            "isi": "Kartu kamu hampir penuh, ayo selesaikan!", "dibaca": False,
                            "waktu": util.iso(last_dt + timedelta(days=inactive))})
    return out


def card(member, reveal=False):
    mid = member["id"]
    stamps = stamps_for(mid, 60)
    redemptions = db.query("""SELECT r.*, b.nama AS branch_nama FROM redemptions r LEFT JOIN branches b ON b.id=r.branch_id
                              WHERE r.member_id=? ORDER BY r.waktu DESC LIMIT 20""", (mid,))
    last_stamp = stamps[0] if stamps else None
    rating = db.one("SELECT * FROM ratings WHERE stamp_id=? AND member_id=? ORDER BY id DESC LIMIT 1",
                    (last_stamp["id"], mid)) if last_stamp else None
    rated_today = db.one("SELECT id FROM ratings WHERE member_id=? AND waktu>=?",
                         (mid, util.iso(util.now().replace(hour=0, minute=0, second=0))))
    notifs = member_notifications(mid)
    history = []
    for s in stamps:
        history.append({"jenis": "stempel", "waktu": s["waktu"], "branch": s["branch_nama"],
                        "pegawai": s["pegawai_nama"], "sumber": s["sumber"], "id": s["id"]})
    for r in redemptions:
        history.append({"jenis": "redeem", "waktu": r["waktu"], "branch": r["branch_nama"],
                        "nilai": r["nilai"], "reward": r["jenis"], "id": r["id"]})
    history.sort(key=lambda x: x["waktu"], reverse=True)
    show_rating = bool(last_stamp) and not rated_today and util.minutes_between(
        util.parse_iso(last_stamp["waktu"]), util.now()) <= 60
    return {
        "member": {"id": member["id"], "nama": member["nama"],
                   "hp": member["hp"] if reveal else util.mask_phone(member["hp"]),
                   "hp_mask": util.mask_phone(member["hp"]),
                   "kode": member["kode"], "dibuat": member["dibuat"]},
        "stempel": member["stempel_aktif"], "target": 9,
        "bisa_redeem": member["stempel_aktif"] >= 9,
        "stamps": [{"id": s["id"], "waktu": s["waktu"], "branch": s["branch_nama"], "sumber": s["sumber"]}
                   for s in stamps[:9]],
        "history": history[:40], "redemptions": [dict(r) for r in redemptions],
        "favorites": favorites(mid), "similar": similar_aroma(mid), "purchases": purchases_for(mid),
        "notifications": notifs, "unread": len([n for n in notifs if not n["dibaca"]]),
        "last_stamp": last_stamp, "rating": rating, "show_rating": show_rating,
        "prefs": util.read_json(member["prefs"], {}),
        "diskon": int(db.get_settings().get("diskon_redeem", 24000)),
    }


def _push_member(member_id, event, payload):
    realtime.publish(event, payload, ("member", member_id))
    realtime.publish("admin_refresh", {"scope": "member"}, ("admin",))


def give_stamp(pegawai, payload):
    kode = payload.get("kode") or payload.get("member_code")
    member = by_code(kode) if kode else get_member(int(payload.get("member_id") or 0))
    if not member:
        raise ValueError("Kartu member tidak ditemukan.")
    if member["stempel_aktif"] >= 9:
        raise ValueError("Kartu sudah penuh (9 cap). Minta pelanggan redeem dulu.")
    last = db.one("SELECT * FROM stamps WHERE member_id=? ORDER BY waktu DESC LIMIT 1", (member["id"],))
    gap = int(db.get_settings().get("stamp_gap_detik", 30))
    if last and not payload.get("force"):
        delta = int((util.now() - util.parse_iso(last["waktu"])).total_seconds())
        if delta < gap:
            raise ValueError("Stempel ganda terdeteksi (%d detik lalu). Konfirmasi untuk melanjutkan." % delta)
    branch_id = payload.get("branch_id")
    if not branch_id:
        active = db.one("""SELECT branch_id FROM attendance WHERE user_id=? AND check_out IS NULL
                           AND tanggal>=? ORDER BY check_in DESC LIMIT 1""",
                        (pegawai["id"], util.today_str()))
        branch_id = active["branch_id"] if active else db.scalar("SELECT id FROM branches WHERE aktif=1 LIMIT 1")
    sumber = payload.get("sumber") or "scan"
    if sumber not in ("scan", "manual"):
        sumber = "scan"
    now = util.iso(util.now())
    stamp_id = db.execute("INSERT INTO stamps(member_id, pegawai_id, branch_id, waktu, sumber) VALUES(?,?,?,?,?)",
                          (member["id"], pegawai["id"], branch_id, now, sumber))
    db.execute("UPDATE members SET stempel_aktif=stempel_aktif+1 WHERE id=?", (member["id"],))
    member = get_member(member["id"])
    aroma_id = payload.get("aroma_id")
    if aroma_id:
        a = db.one("SELECT * FROM aroma WHERE id=?", (aroma_id,))
        if a:
            db.execute("""INSERT INTO purchases(member_id, aroma_id, aroma_nama, ukuran, catatan, stamp_id, pegawai_id,
                          branch_id, waktu, sumber) VALUES(?,?,?,?,?,?,?,?,?,?)""",
                       (member["id"], a["id"], a["nama"], payload.get("ukuran"), payload.get("catatan"),
                        stamp_id, pegawai["id"], branch_id, now, sumber))
    sisa = 9 - member["stempel_aktif"]
    thresholds = [int(x) for x in str(db.get_settings().get("stamp_thresholds", "7,8,9")).split(",") if x.strip()]
    msgs = {2: "Tinggal 2 cap lagi untuk parfum gratis!", 1: "Tinggal 1 cap lagi, ayo isi ulang!",
            0: "Kartu kamu penuh! Redeem sekarang."}
    if member["stempel_aktif"] in thresholds and sisa in msgs:
        key = "cap_%s_%s" % (member["id"], member["stempel_aktif"])
        db.execute("""INSERT OR IGNORE INTO member_notifications(member_id, kunci, jenis, isi, dibaca, waktu)
                      VALUES(?,?,?,?,0,?)""", (member["id"], key, "stamp", msgs[sisa], now))
        realtime.publish("member_notify", {"isi": msgs[sisa], "stempel": member["stempel_aktif"]},
                         ("member", member["id"]))
    db.audit(pegawai["nama"], "Memberi stempel", None,
             {"member": member["nama"], "sumber": sumber, "stempel": member["stempel_aktif"]})
    data = {"stamp_id": stamp_id, "stempel": member["stempel_aktif"], "sisa": sisa,
            "member": {"id": member["id"], "nama": member["nama"], "hp_mask": util.mask_phone(member["hp"]),
                       "kode": member["kode"]}, "sumber": sumber, "waktu": now,
            "penuh": member["stempel_aktif"] >= 9}
    _push_member(member["id"], "stamp", data)
    if member["stempel_aktif"] >= 9:
        _push_member(member["id"], "celebrate", {"member": member["nama"]})
    return data


def redeem(member, payload):
    if member["stempel_aktif"] < 9:
        raise ValueError("Kartu belum penuh. Butuh 9 cap untuk redeem.")
    jenis = payload.get("jenis") or "diskon"
    if jenis not in ("diskon", "poin"):
        raise ValueError("Jenis reward tidak valid.")
    pegawai = db.one("SELECT * FROM users WHERE id=?", (payload.get("pegawai_id") or 1,))
    branch_id = payload.get("branch_id")
    if not branch_id and pegawai:
        active = db.one("""SELECT branch_id FROM attendance WHERE user_id=? AND check_out IS NULL
                           AND tanggal>=? ORDER BY check_in DESC LIMIT 1""",
                        (pegawai["id"], util.today_str()))
        branch_id = active["branch_id"] if active else db.scalar("SELECT id FROM branches WHERE aktif=1 LIMIT 1")
    now = util.iso(util.now())
    if jenis == "diskon":
        nilai = str(int(db.get_settings().get("diskon_redeem", 24000)))
    else:
        lo = int(db.get_settings().get("poin_random_min", 5))
        hi = int(db.get_settings().get("poin_random_max", 50))
        nilai = str(__import__("random").randint(lo, hi))
    rid = db.execute("INSERT INTO redemptions(member_id, jenis, nilai, waktu, pegawai_id, branch_id) VALUES(?,?,?,?,?,?)",
                     (member["id"], jenis, nilai, now, pegawai["id"] if pegawai else None, branch_id))
    db.execute("UPDATE members SET stempel_aktif=0 WHERE id=?", (member["id"],))
    db.audit(pegawai["nama"] if pegawai else "Sistem", "Redeem reward", {"member": member["nama"]},
             {"jenis": jenis, "nilai": nilai})
    _push_member(member["id"], "redeem", {"jenis": jenis, "nilai": nilai, "id": rid})
    return {"id": rid, "jenis": jenis, "nilai": nilai, "waktu": now}


def mark_notifications_read(member_id, kunci=None):
    if kunci:
        db.execute("UPDATE member_notifications SET dibaca=1 WHERE member_id=? AND kunci=?", (member_id, kunci))
    else:
        db.execute("UPDATE member_notifications SET dibaca=1 WHERE member_id=?", (member_id,))


def search(q, limit=8):
    q = (q or "").strip()
    digits = "".join(ch for ch in q if ch.isdigit())
    if len(digits) >= 4:
        rows = db.query("SELECT * FROM members WHERE hp LIKE ? ORDER BY hp LIMIT ?", ("%" + digits + "%", limit))
    elif len(q) >= 2:
        rows = db.query("SELECT * FROM members WHERE nama LIKE ? ORDER BY nama LIMIT ?", ("%" + q + "%", limit))
    else:
        return []
    out = []
    for m in rows:
        last = db.one("SELECT waktu FROM stamps WHERE member_id=? ORDER BY waktu DESC LIMIT 1", (m["id"],))
        out.append({"id": m["id"], "nama": m["nama"], "hp_mask": util.mask_phone(m["hp"]), "kode": m["kode"],
                    "stempel": m["stempel_aktif"], "terakhir": last["waktu"] if last else None,
                    "favorites": [{"nama": f["aroma_nama"], "jumlah": f["jumlah"]} for f in favorites(m["id"], 2)]})
    return out


def save_rating(member, payload):
    stamp = db.one("SELECT * FROM stamps WHERE id=?", (payload.get("stamp_id"),))
    if not stamp or stamp["member_id"] != member["id"]:
        raise ValueError("Stempel tidak ditemukan.")
    bintang = int(payload.get("bintang") or 0)
    if bintang < 1 or bintang > 5:
        raise ValueError("Pilih 1 sampai 5 bintang.")
    tags = payload.get("tag") or []
    if isinstance(tags, str):
        tags = [tags]
    existing = db.one("SELECT * FROM ratings WHERE stamp_id=? AND member_id=? ORDER BY id DESC LIMIT 1",
                      (stamp["id"], member["id"]))
    now = util.now()
    if existing:
        if util.minutes_between(util.parse_iso(existing["waktu"]), now) > 60:
            raise ValueError("Rating hanya dapat diubah dalam 1 jam.")
        db.execute("UPDATE ratings SET bintang=?, tag=?, komentar=?, waktu=? WHERE id=?",
                   (bintang, util.dump_json(tags[:4]), (payload.get("komentar") or "").strip()[:200],
                    util.iso(now), existing["id"]))
        rid = existing["id"]
    else:
        rid = db.execute("""INSERT INTO ratings(member_id, stamp_id, pegawai_id, branch_id, bintang, tag, komentar, waktu)
                            VALUES(?,?,?,?,?,?,?,?)""",
                         (member["id"], stamp["id"], stamp["pegawai_id"], stamp["branch_id"], bintang,
                          util.dump_json(tags[:4]), (payload.get("komentar") or "").strip()[:200], util.iso(now)))
    if bintang <= 2:
        key = "rating_%s_%s" % (stamp["id"], rid)
        bukti = {"member": member["nama"], "bintang": bintang, "komentar": (payload.get("komentar") or "")[:120],
                 "pegawai": (db.one("SELECT nama FROM users WHERE id=?", (stamp["pegawai_id"],)) or {}).get("nama"),
                 "cabang": (db.one("SELECT nama FROM branches WHERE id=?", (stamp["branch_id"],)) or {}).get("nama")}
        db.execute("""INSERT OR IGNORE INTO warnings(kunci, jenis, user_id, member_id, branch_id, waktu, bukti, status, dibuat)
                      VALUES(?,?,?,?,?,?,?,'Baru',?)""",
                   (key, "Rating Rendah", stamp["pegawai_id"], member["id"], stamp["branch_id"], util.iso(now),
                    util.dump_json(bukti), util.iso(now)))
    realtime.publish("admin_refresh", {"scope": "rating"}, ("admin",))
    return {"id": rid, "bintang": bintang, "tag": tags, "komentar": payload.get("komentar") or ""}


def member_history(member_id):
    return {"history": card(get_member(member_id))["history"]}


def add_purchase(member, payload):
    a = db.one("SELECT * FROM aroma WHERE id=?", (payload.get("aroma_id"),))
    if not a:
        raise ValueError("Aroma tidak ditemukan.")
    now = util.iso(util.now())
    pid = db.execute("""INSERT INTO purchases(member_id, aroma_id, aroma_nama, ukuran, catatan, pegawai_id, branch_id, waktu, sumber)
                        VALUES(?,?,?,?,?,?,?,?,?)""",
                     (member["id"], a["id"], a["nama"], payload.get("ukuran"), payload.get("catatan"),
                      payload.get("pegawai_id"), payload.get("branch_id"), now, "manual"))
    return {"id": pid, "aroma": a["nama"], "waktu": now}
