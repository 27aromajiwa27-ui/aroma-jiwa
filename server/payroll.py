"""Payroll calculator with kasbon (advance) handling."""
import math
from datetime import datetime

from . import db, util


def rates():
    s = db.get_settings()
    return {"pagi": int(s.get("rate_pagi", 60000)), "sore": int(s.get("rate_sore", 65000)),
            "fullday": int(s.get("rate_fullday", 110000))}


def _upah(shift, rates_map):
    return {"pagi": rates_map["pagi"], "sore": rates_map["sore"], "fullday": rates_map["fullday"]}.get(shift, 0)


def advances_for(user_id):
    rows = db.query("SELECT * FROM advances WHERE user_id=? ORDER BY tanggal DESC", (user_id,))
    out = []
    for a in rows:
        deducted = db.scalar("SELECT COALESCE(SUM(nominal),0) FROM advance_deductions WHERE advance_id=?", (a["id"],), 0)
        out.append(dict(a, terpotong=deducted, sisa=a["sisa"]))
    return out


def auto_kasbon(user_id):
    """Suggested deduction following each advance scheme."""
    total = 0
    detail = []
    for a in db.query("SELECT * FROM advances WHERE user_id=? AND sisa>0 AND status='Aktif'", (user_id,)):
        if a["skema"] == "sekali":
            nominal = a["sisa"]
        else:
            cicilan = max(1, int(a["cicilan"] or 1))
            nominal = min(a["sisa"], int(math.ceil(a["nominal"] / float(cicilan))))
        if nominal:
            detail.append({"advance_id": a["id"], "nominal": nominal, "alasan": a["alasan"],
                           "skema": a["skema"], "sisa_sebelum": a["sisa"]})
            total += nominal
    return total, detail


def preview(user_id, start, end, bonus=0, potongan_lain=None, potongan_kasbon=None):
    user = db.one("SELECT * FROM users WHERE id=?", (user_id,))
    if not user:
        raise ValueError("Pegawai tidak ditemukan.")
    rows = db.query("""SELECT a.*, b.nama AS branch_nama FROM attendance a JOIN branches b ON b.id=a.branch_id
                       WHERE a.user_id=? AND a.tanggal BETWEEN ? AND ? AND a.check_in IS NOT NULL
                       ORDER BY a.tanggal, a.check_in""", (user_id, start, end))
    rmap = rates()
    shift_rows = []
    total_upah = 0
    total_minutes = 0
    late_minutes = 0
    for r in rows:
        upah = _upah(r["shift"], rmap)
        ci = util.parse_iso(r["check_in"])
        co = util.parse_iso(r["check_out"])
        minutes = int((co - ci).total_seconds() // 60) if ci and co else 0
        total_upah += upah
        total_minutes += minutes
        late_minutes += r["menit_telat"] or 0
        shift_rows.append({"id": r["id"], "tanggal": r["tanggal"], "shift": r["shift"],
                           "branch": r["branch_nama"], "masuk": util.fmt_clock(ci) if ci else None,
                           "pulang": util.fmt_clock(co) if co else None, "menit": minutes,
                           "telat": r["menit_telat"] or 0, "upah": upah,
                           "kas": r["kas_cash"], "khusus": r["tipe_checkout"] == "khusus"})
    potongan_lain = potongan_lain or []
    if isinstance(potongan_lain, dict):
        potongan_lain = [potongan_lain]
    lain_total = sum(int(round(float(p.get("nominal") or 0))) for p in potongan_lain)
    auto, detail = auto_kasbon(user_id)
    kasbon = auto if potongan_kasbon is None else int(round(float(potongan_kasbon)))
    bonus = int(round(float(bonus or 0)))
    total = total_upah + bonus - lain_total - kasbon
    max_pct = int(db.get_settings().get("potongan_maks_persen", 50))
    warnings = []
    if total_upah and (lain_total + kasbon) > total_upah * max_pct / 100.0:
        warnings.append("Total potongan melebihi %d%% dari upah (Rp %s)." % (max_pct, util.rupiah(total_upah * max_pct / 100)))
    if total <= 0:
        warnings.append("Gaji bersih nol atau negatif. Perlu konfirmasi owner.")
    return {
        "user": {"id": user["id"], "nama": user["nama"], "hp_mask": util.mask_phone(user["hp"])},
        "periode": {"start": start, "end": end},
        "shifts": shift_rows, "jumlah_shift": len(shift_rows),
        "total_menit": total_minutes, "total_jam": round(total_minutes / 60.0, 1), "total_telat": late_minutes,
        "tarif": rmap, "upah": total_upah, "bonus": bonus,
        "potongan_lain": potongan_lain, "potongan_lain_total": lain_total,
        "potongan_kasbon": kasbon, "kasbon_detail": detail,
        "advances": advances_for(user_id),
        "total": total, "peringatan": warnings,
        "maks_persen": max_pct,
    }


def period_bounds(periode):
    """periode = YYYY-MM."""
    try:
        d = datetime.strptime(periode + "-01", "%Y-%m-%d")
    except (ValueError, TypeError):
        d = util.now().replace(day=1)
    if d.month == 12:
        nxt = d.replace(year=d.year + 1, month=1)
    else:
        nxt = d.replace(month=d.month + 1)
    end = nxt.replace(day=1).strftime("%Y-%m-%d")
    from datetime import timedelta
    last = (datetime.strptime(end, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
    return d.strftime("%Y-%m-%d"), last


def period_overview(periode):
    start, end = period_bounds(periode)
    users = db.query("SELECT * FROM users WHERE peran='pegawai' AND aktif=1 ORDER BY nama")
    out = []
    for u in users:
        p = preview(u["id"], start, end)
        saved = db.one("SELECT * FROM payroll WHERE user_id=? AND periode_mulai=? ORDER BY id DESC LIMIT 1",
                       (u["id"], start))
        out.append({
            "user": p["user"], "jumlah_shift": p["jumlah_shift"], "total_jam": p["total_jam"],
            "telat": p["total_telat"], "upah": p["upah"], "kasbon": p["potongan_kasbon"],
            "potongan_lain": p["potongan_lain_total"], "total": p["total"],
            "status": saved["status"] if saved else "Belum dihitung", "payroll_id": saved["id"] if saved else None,
        })
    return {"periode": periode, "start": start, "end": end, "pegawai": out}


def save(aktor, payload):
    user_id = int(payload.get("user_id"))
    start = payload.get("start")
    end = payload.get("end")
    if not start or not end:
        start, end = period_bounds(payload.get("periode") or util.now().strftime("%Y-%m"))
    p = preview(user_id, start, end, payload.get("bonus") or 0,
                payload.get("potongan_lain") or [], payload.get("potongan_kasbon"))
    if p["total"] <= 0 and not payload.get("konfirmasi_negatif"):
        raise ValueError("Gaji bersih nol atau negatif. Centang konfirmasi owner untuk melanjutkan.")
    existing = db.one("SELECT * FROM payroll WHERE user_id=? AND periode_mulai=? AND status='Final'",
                      (user_id, start))
    if existing:
        raise ValueError("Gaji periode ini sudah final. Buka kembali dulu bila ingin mengubah.")
    draft = db.one("SELECT * FROM payroll WHERE user_id=? AND periode_mulai=? AND status='Draf'", (user_id, start))
    detail = {"shifts": p["shifts"], "tarif": p["tarif"], "jumlah_shift": p["jumlah_shift"],
              "total_jam": p["total_jam"], "upah": p["upah"], "kasbon_detail": p["kasbon_detail"]}
    now = util.iso(util.now())
    if draft:
        db.execute("""UPDATE payroll SET detail=?, bonus=?, potongan_lain=?, potongan_kasbon=?, total=?, catatan=?,
                      status=?, diubah=? WHERE id=?""",
                   (util.dump_json(detail), p["bonus"], util.dump_json(p["potongan_lain"]), p["potongan_kasbon"],
                    p["total"], payload.get("catatan"), "Final" if payload.get("finalize") else "Draf", now, draft["id"]))
        pid = draft["id"]
        lama = {"total": draft["total"], "status": draft["status"]}
    else:
        pid = db.execute("""INSERT INTO payroll(user_id, periode_mulai, periode_selesai, detail, bonus, potongan_lain,
                            potongan_kasbon, total, status, catatan, dibuat, diubah)
                            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                         (user_id, start, end, util.dump_json(detail), p["bonus"],
                          util.dump_json(p["potongan_lain"]), p["potongan_kasbon"], p["total"],
                          "Final" if payload.get("finalize") else "Draf", payload.get("catatan"), now, now))
        lama = None
    if payload.get("finalize"):
        remaining = p["potongan_kasbon"]
        for d in p["kasbon_detail"]:
            if remaining <= 0:
                break
            nominal = min(d["nominal"], remaining)
            db.execute("INSERT INTO advance_deductions(advance_id, payroll_id, nominal, tanggal) VALUES(?,?,?,?)",
                       (d["advance_id"], pid, nominal, now))
            db.execute("UPDATE advances SET sisa=MAX(0, sisa-?) WHERE id=?", (nominal, d["advance_id"]))
            db.execute("UPDATE advances SET status='Lunas' WHERE id=? AND sisa=0", (d["advance_id"],))
            remaining -= nominal
    db.audit(aktor, "Finalisasi gaji" if payload.get("finalize") else "Simpan draf gaji", lama,
             {"pegawai": p["user"]["nama"], "total": p["total"], "periode": start})
    return {"id": pid, "total": p["total"], "status": "Final" if payload.get("finalize") else "Draf"}


def reopen(aktor, payroll_id):
    row = db.one("SELECT * FROM payroll WHERE id=?", (payroll_id,))
    if not row or row["status"] != "Final":
        raise ValueError("Hanya gaji final yang dapat dibuka kembali.")
    for d in db.query("SELECT * FROM advance_deductions WHERE payroll_id=?", (payroll_id,)):
        db.execute("UPDATE advances SET sisa=sisa+? WHERE id=?", (d["nominal"], d["advance_id"]))
        db.execute("UPDATE advances SET status='Aktif' WHERE id=? AND sisa>0", (d["advance_id"],))
    db.execute("DELETE FROM advance_deductions WHERE payroll_id=?", (payroll_id,))
    db.execute("UPDATE payroll SET status='Draf', diubah=? WHERE id=?", (util.iso(util.now()), payroll_id))
    db.audit(aktor, "Membuka kembali gaji final", {"status": "Final", "total": row["total"]}, {"status": "Draf"})
    return {"id": payroll_id, "status": "Draf"}


def add_advance(aktor, payload):
    user_id = int(payload.get("user_id"))
    nominal = int(round(float(payload.get("nominal") or 0)))
    if nominal <= 0:
        raise ValueError("Nominal kasbon harus lebih dari 0.")
    skema = payload.get("skema") or "sekali"
    if skema not in ("sekali", "cicilan", "nominal"):
        raise ValueError("Skema pelunasan tidak valid.")
    cicilan = max(1, int(payload.get("cicilan") or 1))
    aid = db.execute("""INSERT INTO advances(user_id, nominal, tanggal, alasan, skema, cicilan, sisa, status, dibuat)
                        VALUES(?,?,?,?,?,?,?, 'Aktif', ?)""",
                     (user_id, nominal, payload.get("tanggal") or util.today_str(), payload.get("alasan"),
                      skema, cicilan, nominal, util.iso(util.now())))
    u = db.one("SELECT nama FROM users WHERE id=?", (user_id,))
    db.audit(aktor, "Mencatat kasbon", None, {"pegawai": u["nama"] if u else user_id, "nominal": nominal, "skema": skema})
    return {"id": aid}


def delete_advance(aktor, advance_id):
    a = db.one("SELECT * FROM advances WHERE id=?", (advance_id,))
    if not a:
        raise ValueError("Kasbon tidak ditemukan.")
    if a["sisa"] != a["nominal"]:
        raise ValueError("Kasbon yang sudah terpotong tidak dapat dihapus.")
    db.execute("DELETE FROM advances WHERE id=?", (advance_id,))
    db.audit(aktor, "Menghapus kasbon", {"nominal": a["nominal"]}, None)
    return {"ok": True}
