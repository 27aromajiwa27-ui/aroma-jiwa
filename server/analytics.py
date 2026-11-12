"""Owner analytics: customers, ratings, aroma, cash and performance."""
from datetime import datetime, timedelta

from . import db, util

WEEKDAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]


def _where(start, end, branch_id=None, pegawai_id=None, alias="s"):
    sql = " WHERE %s.waktu>=? AND %s.waktu<=?" % (alias, alias)
    args = [start + "T00:00:00", end + "T23:59:59"]
    if branch_id:
        sql += " AND %s.branch_id=?" % alias
        args.append(branch_id)
    if pegawai_id:
        sql += " AND %s.pegawai_id=?" % alias
        args.append(pegawai_id)
    return sql, args


def overview(start, end, branch_id=None, pegawai_id=None):
    where, args = _where(start, end, branch_id, pegawai_id)
    total_stamps = db.scalar("SELECT COUNT(*) FROM stamps s" + where, tuple(args), 0)
    total_redeem = db.scalar("SELECT COUNT(*) FROM redemptions r" + where.replace("s.", "r."), tuple(args), 0)
    new_members = db.scalar("SELECT COUNT(*) FROM members WHERE dibuat>=? AND dibuat<=?",
                            (start + "T00:00:00", end + "T23:59:59"), 0)
    active_days = int(db.get_settings().get("member_aktif_hari", 30))
    cutoff = util.iso(util.now() - timedelta(days=active_days))
    active_members = db.scalar("SELECT COUNT(DISTINCT member_id) FROM stamps WHERE waktu>=?", (cutoff,), 0)
    total_members = db.scalar("SELECT COUNT(*) FROM members", default=0)
    stamps_per_member = db.scalar("SELECT COUNT(*) FROM stamps s" + where, tuple(args), 0)
    return {
        "stamps": total_stamps, "redeem": total_redeem, "new_members": new_members,
        "active_members": active_members, "inactive_members": max(0, total_members - active_members),
        "total_members": total_members, "stamps_per_member": round(stamps_per_member / float(active_members), 1) if active_members else 0,
        "active_days": active_days,
    }


def heatmap(start, end, branch_id=None, pegawai_id=None):
    where, args = _where(start, end, branch_id, pegawai_id)
    rows = db.query("SELECT waktu FROM stamps s" + where, tuple(args))
    grid = [[0] * 24 for _ in range(7)]
    for r in rows:
        dt = util.parse_iso(r["waktu"])
        if dt:
            grid[dt.weekday()][dt.hour] += 1
    peak = {"hari": None, "jam": None, "jumlah": 0}
    for d in range(7):
        for h in range(24):
            if grid[d][h] > peak["jumlah"]:
                peak = {"hari": WEEKDAYS[d], "jam": h, "jumlah": grid[d][h]}
    hours = [{"jam": h, "jumlah": sum(grid[d][h] for d in range(7))} for h in range(8, 23)]
    days = [{"hari": WEEKDAYS[d], "jumlah": sum(grid[d])} for d in range(7)]
    return {"grid": grid, "peak": peak, "per_jam": hours, "per_hari": days}


def growth(start, end):
    rows = db.query("SELECT dibuat FROM members WHERE dibuat>=? AND dibuat<=?",
                    (start + "T00:00:00", end + "T23:59:59"))
    per_day = {}
    for r in rows:
        day = (r["dibuat"] or "")[:10]
        per_day[day] = per_day.get(day, 0) + 1
    per_month = {}
    for day, n in per_day.items():
        per_month[day[:7]] = per_month.get(day[:7], 0) + n
    return {"per_hari": [{"tanggal": k, "jumlah": v} for k, v in sorted(per_day.items())],
            "per_bulan": [{"bulan": k, "jumlah": v} for k, v in sorted(per_month.items())],
            "total": len(rows)}


def stamp_progress(start, end, branch_id=None, pegawai_id=None):
    rows = db.query("SELECT stempel_aktif, COUNT(*) AS n FROM members GROUP BY stempel_aktif")
    dist = {i: 0 for i in range(10)}
    for r in rows:
        if 0 <= r["stempel_aktif"] <= 9:
            dist[r["stempel_aktif"]] = r["n"]
    return {"distribusi": [{"cap": k, "jumlah": v} for k, v in sorted(dist.items())],
            "hampir": sum(v for k, v in dist.items() if 7 <= k <= 8)}


def branch_compare(start, end):
    rows = db.query("""SELECT b.id, b.nama,
                        (SELECT COUNT(*) FROM stamps s WHERE s.branch_id=b.id AND s.waktu>=? AND s.waktu<=?) AS stempel,
                        (SELECT COUNT(*) FROM redemptions r WHERE r.branch_id=b.id AND r.waktu>=? AND r.waktu<=?) AS redeem,
                        (SELECT COUNT(*) FROM attendance a WHERE a.branch_id=b.id AND a.tanggal>=? AND a.tanggal<=?) AS hadir
                       FROM branches b WHERE b.aktif=1 ORDER BY stempel DESC""",
                    (start + "T00:00:00", end + "T23:59:59", start + "T00:00:00", end + "T23:59:59", start, end))
    return rows


def members_table(start, end, branch_id=None, pegawai_id=None):
    where, args = _where(start, end, branch_id, pegawai_id)
    rows = db.query("""SELECT m.id, m.nama, m.hp, m.stempel_aktif, m.dibuat,
                       (SELECT COUNT(*) FROM stamps s WHERE s.member_id=m.id %s) AS stempel_periode,
                       (SELECT MAX(waktu) FROM stamps s WHERE s.member_id=m.id) AS terakhir,
                       (SELECT COUNT(*) FROM redemptions r WHERE r.member_id=m.id) AS redeem
                       FROM members m ORDER BY stempel_periode DESC, terakhir DESC""" % (
        "AND s.waktu>=? AND s.waktu<=?" + (" AND s.branch_id=?" if branch_id else "") + (" AND s.pegawai_id=?" if pegawai_id else "")),
        tuple(args))
    for r in rows:
        r["hp"] = util.mask_phone(r["hp"])
        r["aktif"] = bool(r["terakhir"] and r["terakhir"] >= util.iso(
            util.now() - timedelta(days=int(db.get_settings().get("member_aktif_hari", 30)))))
    return rows


def redeem_stats(start, end, branch_id=None, pegawai_id=None):
    where, args = _where(start, end, branch_id, pegawai_id, alias="r")
    rows = db.query("SELECT * FROM redemptions r" + where, tuple(args))
    per_day = {}
    for r in rows:
        per_day[(r["waktu"] or "")[:10]] = per_day.get((r["waktu"] or "")[:10], 0) + 1
    avg_days = None
    if rows:
        spans = []
        for r in rows:
            m = db.one("SELECT dibuat FROM members WHERE id=?", (r["member_id"],))
            if m and m["dibuat"]:
                spans.append((util.parse_iso(r["waktu"]) - util.parse_iso(m["dibuat"])).days)
        avg_days = round(sum(spans) / float(len(spans)), 1) if spans else None
    return {"total": len(rows), "per_hari": [{"tanggal": k, "jumlah": v} for k, v in sorted(per_day.items())],
            "rata_hari": avg_days,
            "diskon": len([r for r in rows if r["jenis"] == "diskon"]),
            "poin": len([r for r in rows if r["jenis"] == "poin"])}


def customer(start, end, branch_id=None, pegawai_id=None):
    return {
        "overview": overview(start, end, branch_id, pegawai_id),
        "heatmap": heatmap(start, end, branch_id, pegawai_id),
        "growth": growth(start, end),
        "progress": stamp_progress(start, end, branch_id, pegawai_id),
        "branches": branch_compare(start, end),
        "members": members_table(start, end, branch_id, pegawai_id)[:50],
        "redeem": redeem_stats(start, end, branch_id, pegawai_id),
    }


def ratings(start, end, branch_id=None, pegawai_id=None):
    where = " WHERE r.waktu>=? AND r.waktu<=?"
    args = [start + "T00:00:00", end + "T23:59:59"]
    if branch_id:
        where += " AND r.branch_id=?"
        args.append(branch_id)
    if pegawai_id:
        where += " AND r.pegawai_id=?"
        args.append(pegawai_id)
    rows = db.query("""SELECT r.*, u.nama AS pegawai_nama, b.nama AS branch_nama, m.nama AS member_nama
                       FROM ratings r LEFT JOIN users u ON u.id=r.pegawai_id
                       LEFT JOIN branches b ON b.id=r.branch_id LEFT JOIN members m ON m.id=r.member_id
                       """ + where + " ORDER BY r.waktu DESC", tuple(args))
    dist = {i: 0 for i in range(1, 6)}
    tags = {}
    per_day = {}
    for r in rows:
        dist[int(r["bintang"])] = dist.get(int(r["bintang"]), 0) + 1
        for t in util.read_json(r["tag"], []):
            tags[t] = tags.get(t, 0) + 1
        d = (r["waktu"] or "")[:10]
        per_day.setdefault(d, []).append(r["bintang"])
    employees = {}
    for r in rows:
        key = r["pegawai_id"]
        e = employees.setdefault(key, {"id": key, "nama": r["pegawai_nama"], "total": 0, "sum": 0,
                                        "1": 0, "2": 0, "3": 0, "4": 0, "5": 0})
        e["total"] += 1
        e["sum"] += r["bintang"]
        e[str(r["bintang"])] = e.get(str(r["bintang"]), 0) + 1
    emp_list = []
    for e in employees.values():
        e["rata"] = round(e["sum"] / float(e["total"]), 2) if e["total"] else 0
        e["tampil"] = e["total"] >= 5
        emp_list.append(e)
    emp_list.sort(key=lambda x: (-x["rata"], -x["total"]))
    branches = {}
    for r in rows:
        b = branches.setdefault(r["branch_id"], {"id": r["branch_id"], "nama": r["branch_nama"], "total": 0, "sum": 0})
        b["total"] += 1
        b["sum"] += r["bintang"]
    for b in branches.values():
        b["rata"] = round(b["sum"] / float(b["total"]), 2) if b["total"] else 0
    comments = [{"member": (r["member_nama"] or "")[:1] + ".", "bintang": r["bintang"], "komentar": r["komentar"],
                 "waktu": r["waktu"], "pegawai": r["pegawai_nama"], "branch": r["branch_nama"]}
                for r in rows if (r["komentar"] or "").strip()][:20]
    avg = round(sum(r["bintang"] for r in rows) / float(len(rows)), 2) if rows else 0
    return {"total": len(rows), "rata": avg, "distribusi": [{"bintang": k, "jumlah": v} for k, v in sorted(dist.items(), reverse=True)],
            "tags": sorted([{"tag": k, "jumlah": v} for k, v in tags.items()], key=lambda x: -x["jumlah"]),
            "pegawai": emp_list, "cabang": sorted(branches.values(), key=lambda x: -x["rata"]),
            "tren": [{"tanggal": k, "rata": round(sum(v) / float(len(v)), 2)} for k, v in sorted(per_day.items())],
            "komentar": comments, "rendah": len([r for r in rows if r["bintang"] <= 2])}


def aroma(start, end, branch_id=None, pegawai_id=None):
    where = " WHERE p.waktu>=? AND p.waktu<=?"
    args = [start + "T00:00:00", end + "T23:59:59"]
    if branch_id:
        where += " AND p.branch_id=?"
        args.append(branch_id)
    if pegawai_id:
        where += " AND p.pegawai_id=?"
        args.append(pegawai_id)
    stamp_where = where.replace("p.", "s.")
    total_stamps = db.scalar("SELECT COUNT(*) FROM stamps s" + stamp_where, tuple(args), 0)
    rows = db.query("""SELECT p.*, b.nama AS branch_nama, a.kategori FROM purchases p
                       LEFT JOIN branches b ON b.id=p.branch_id LEFT JOIN aroma a ON a.id=p.aroma_id
                       """ + where, tuple(args))
    by_aroma = {}
    by_cat = {}
    by_size = {}
    by_branch = {}
    for r in rows:
        name = r["aroma_nama"] or "Tidak dicatat"
        by_aroma[name] = by_aroma.get(name, 0) + 1
        by_cat[r["kategori"] or "Lainnya"] = by_cat.get(r["kategori"] or "Lainnya", 0) + 1
        if r["ukuran"]:
            by_size[r["ukuran"]] = by_size.get(r["ukuran"], 0) + 1
        br = by_branch.setdefault(r["branch_nama"] or "-", {})
        br[name] = br.get(name, 0) + 1
    top = sorted([{"nama": k, "jumlah": v} for k, v in by_aroma.items()], key=lambda x: -x["jumlah"])
    return {"total": len(rows), "top": top[:8],
            "kategori": [{"nama": k, "jumlah": v} for k, v in sorted(by_cat.items(), key=lambda x: -x[1])],
            "ukuran": [{"nama": k, "jumlah": v} for k, v in sorted(by_size.items(), key=lambda x: -x[1])],
            "per_cabang": [{"cabang": k, "aroma": sorted([{"nama": n, "jumlah": c} for n, c in v.items()],
                                                         key=lambda x: -x["jumlah"])[:3]} for k, v in by_branch.items()],
            "pencatatan": len(rows), "total_stempel": total_stamps,
            "tanpa_catatan": max(0, total_stamps - len(rows))}
