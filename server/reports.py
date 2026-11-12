"""PDF report builders."""
from datetime import datetime

from . import admin, analytics, attendance, db, payroll, util
from .pdf import MARGIN, PAGE_W, PDF, GRAY, NAVY, BLUE

INNER = PAGE_W - 2 * MARGIN


def _meta(filters):
    items = [("Dibuat", util.now().strftime("%d/%m/%Y %H:%M") + " WIB")]
    for f in filters:
        if f[1]:
            items.append((f[0], str(f[1])))
    return items


def _status(row):
    if not row.get("check_in"):
        return "Tidak hadir"
    if row.get("tipe_checkout") == "khusus":
        return "Pulang khusus"
    if (row.get("menit_telat") or 0) > attendance.tolerance():
        return "Terlambat"
    return "Tepat waktu"


def attendance_report(start, end, branch_id=None, user_id=None, branch_nama=None, user_nama=None):
    data = admin.attendance_list(start, end, branch_id, user_id)
    pdf = PDF("Laporan Absensi")
    pdf.gradient_header("Laporan Absensi", "Periode %s s/d %s" % (start, end))
    pdf.meta(_meta([("Periode", "%s - %s" % (start, end)), ("Cabang", branch_nama or "Semua cabang"),
                    ("Pegawai", user_nama or "Semua pegawai")]))
    t = data["totals"]
    pdf.kv_grid([("Total kehadiran", "%d shift" % t["hadir"]), ("Terlambat", "%d shift" % t["terlambat"]),
                 ("Total jam kerja", "%.1f jam" % t["jam"]), ("Pulang khusus", "%d" % t["khusus"]),
                 ("Kas akhir shift", util.rupiah(t["kas"])), ("Pengeluaran", util.rupiah(t["pengeluaran"]))])
    pdf.heading("Rincian Absensi")
    rows = []
    for r in data["records"]:
        rows.append([r["tanggal"][8:] + "/" + r["tanggal"][5:7], (r.get("user_nama") or "")[:18], r["shift_nama"],
                     r["check_in_jam"] or "-", r["check_out_jam"] or "-", str(r["menit_telat"]),
                     _status(r), util.rupiah(r["kas"]["cash"] or 0)])
    pdf.table(["Tgl", "Pegawai", "Shift", "Masuk", "Pulang", "Telat", "Status", "Kas"], rows,
              [34, 128, 48, 48, 48, 34, 72, 95], ["left", "left", "left", "left", "left", "right", "left", "right"])
    pdf.heading("Catatan")
    pdf.paragraph("Keterlambatan dihitung dari jam check-in aktual terhadap jam masuk terjadwal. "
                  "Penalti pemunduran jam pulang tidak berlaku pada shift Sore yang memenuhi syarat dispensasi multi-shift. "
                  "Seluruh waktu mengikuti waktu server WIB.")
    return pdf.build(), "laporan-absensi-%s.pdf" % start


def payroll_report(periode, branch_id=None):
    overview = payroll.period_overview(periode)
    pdf = PDF("Laporan Gaji")
    pdf.gradient_header("Laporan Gaji", "Periode %s" % periode)
    total = sum(p["total"] for p in overview["pegawai"])
    pdf.meta([("Periode", "%s - %s" % (overview["start"], overview["end"])),
              ("Jumlah pegawai", str(len(overview["pegawai"]))), ("Total gaji", util.rupiah(total))])
    pdf.kv_grid([("Total upah", util.rupiah(sum(p["upah"] for p in overview["pegawai"]))),
                 ("Total potongan kasbon", util.rupiah(sum(p["kasbon"] for p in overview["pegawai"]))),
                 ("Total potongan lain", util.rupiah(sum(p["potongan_lain"] for p in overview["pegawai"]))),
                 ("Gaji bersih", util.rupiah(total))], columns=2)
    rows = []
    for p in overview["pegawai"]:
        rows.append([p["user"]["nama"], str(p["jumlah_shift"]), "%.1f" % p["total_jam"], util.rupiah(p["upah"]),
                     util.rupiah(p["kasbon"]), util.rupiah(p["potongan_lain"]), util.rupiah(p["total"]), p["status"]])
    pdf.table(["Pegawai", "Shift", "Jam", "Upah", "Kasbon", "Pot. Lain", "Bersih", "Status"], rows,
              [120, 36, 40, 76, 66, 66, 82, 61],
              ["left", "right", "right", "right", "right", "right", "right", "left"])
    pdf.heading("Rincian per Pegawai")
    for p in overview["pegawai"]:
        pdf.ensure(80)
        detail = payroll.preview(p["user"]["id"], overview["start"], overview["end"])
        pdf.text(MARGIN, pdf.y, "%s  ·  %d shift  ·  %.1f jam  ·  %s" %
                 (p["user"]["nama"], p["jumlah_shift"], p["total_jam"], util.rupiah(p["total"])), 9, True, NAVY)
        pdf.y += 14
        for s in detail["shifts"][:12]:
            pdf.text(MARGIN + 10, pdf.y, "%s  %s  %s  %s-%s  %s" %
                     (s["tanggal"], s["shift"], (s["branch"] or "")[:26], s["masuk"] or "-", s["pulang"] or "-",
                      util.rupiah(s["upah"])), 7.5, False, GRAY)
            pdf.y += 11
        if not detail["shifts"]:
            pdf.text(MARGIN + 10, pdf.y, "Belum ada absensi pada periode ini.", 7.5, False, GRAY)
            pdf.y += 11
        if detail["potongan_kasbon"]:
            pdf.text(MARGIN + 10, pdf.y, "Potongan kasbon: %s" % util.rupiah(detail["potongan_kasbon"]), 7.5, False, GRAY)
            pdf.y += 11
        pdf.y += 6
    return pdf.build(), "laporan-gaji-%s.pdf" % periode


def summary_report(tanggal):
    data = admin.summary_data(tanggal)
    pdf = PDF("Ringkasan Harian")
    pdf.gradient_header("Ringkasan Harian", util.fmt_date_id(util.dt_at(tanggal, "00:00")))
    t = data["total"]
    pdf.meta([("Tanggal", tanggal), ("Cabang aktif", str(len(data["per_branch"]))),
              ("Peringatan", str(t["peringatan"]))])
    pdf.kv_grid([("Hadir", str(t["hadir"])), ("Belum check-out", str(t["belum_checkout"])),
                 ("Terlambat", str(t["terlambat"])), ("Menit terlambat", str(t["menit_telat"])),
                 ("Stempel", str(t["stempel"])), ("Redeem", str(t["redeem"])),
                 ("Member baru", str(t["member_baru"])), ("Kas akhir", util.rupiah(t["kas"])),
                 ("Pengeluaran", util.rupiah(t["pengeluaran"]))])
    pdf.heading("Per Cabang")
    rows = []
    for b in data["per_branch"]:
        rows.append([b["branch"], str(len(b["hadir"])), ", ".join(b["hadir"])[:60] or "-",
                     str(len(b["belum_checkout"])), str(b["stempel"]), str(b["redeem"]), util.rupiah(b["kas"])])
    pdf.table(["Cabang", "Hadir", "Pegawai hadir", "Blm out", "Stempel", "Redeem", "Kas"], rows,
              [104, 38, 186, 44, 44, 44, 91], ["left", "right", "left", "right", "right", "right", "right"])
    pdf.heading("Keterlambatan & Pulang Khusus")
    late_rows = []
    for b in data["per_branch"]:
        for l in b["telat"]:
            late_rows.append([l["nama"], b["branch"], "%d menit" % l["menit"]])
        for k in b["khusus"]:
            late_rows.append([k["nama"], b["branch"], "Pulang khusus: " + (k["alasan"] or "-")[:40]])
    if late_rows:
        pdf.table(["Pegawai", "Cabang", "Keterangan"], late_rows, [120, 130, 257], ["left", "left", "left"])
    else:
        pdf.paragraph("Tidak ada keterlambatan atau pulang khusus pada tanggal ini.")
    pdf.heading("Kas & Pengeluaran per Cabang")
    pdf.table(["Cabang", "Kas akhir", "Pengeluaran", "Kas bersih"],
              [[c["branch"], util.rupiah(c["kas"]), util.rupiah(c["pengeluaran"]), util.rupiah(c["bersih"])]
               for c in data["kas_per_branch"]], [200, 110, 110, 87],
              ["left", "right", "right", "right"])
    if data["stock"]:
        pdf.heading("Laporan Stok")
        pdf.table(["Cabang", "Barang", "Tingkat", "Status"],
                  [[s["branch_nama"], s["item_nama"], s["tingkat"], s["status"]] for s in data["stock"]],
                  [150, 170, 100, 87], ["left", "left", "left", "left"])
    return pdf.build(), "ringkasan-harian-%s.pdf" % tanggal


def warnings_report():
    data = admin.warnings_list("Semua")
    pdf = PDF("Laporan Peringatan")
    pdf.gradient_header("Peringatan Anomali", "Seluruh peringatan yang tercatat")
    pdf.meta([("Total peringatan", str(len(data["items"]))),
              ("Baru", str(data["counts"].get("Baru", 0))),
              ("Ditinjau", str(data["counts"].get("Ditinjau", 0))),
              ("Diabaikan", str(data["counts"].get("Diabaikan", 0)))])
    rows = []
    for w in data["items"]:
        rows.append([w["waktu"][:16].replace("T", " "), w["jenis"], (w["user_nama"] or "-")[:20],
                     (w["branch_nama"] or "-")[:22], w["status"], (w["bukti"] or {}).get("catatan", "")[:50]])
    pdf.table(["Waktu", "Jenis", "Pegawai", "Cabang", "Status", "Bukti"], rows,
              [76, 104, 92, 104, 54, 67], ["left", "left", "left", "left", "left", "left"])
    pdf.paragraph("Peringatan adalah penanda untuk ditinjau. Sistem tidak menghukum, memblokir, atau memotong gaji secara otomatis.")
    return pdf.build(), "laporan-peringatan.pdf"


def analytics_report(start, end, branch_nama="Semua cabang"):
    data = analytics.customer(start, end)
    pdf = PDF("Analitik Pelanggan")
    pdf.gradient_header("Analitik Pelanggan", "Periode %s - %s" % (start, end))
    ov = data["overview"]
    pdf.meta([("Periode", "%s - %s" % (start, end)), ("Cabang", branch_nama),
              ("Dibuat", util.now().strftime("%d/%m/%Y %H:%M"))])
    pdf.kv_grid([("Total stempel", str(ov["stamps"])), ("Redeem", str(ov["redeem"])),
                 ("Member baru", str(ov["new_members"])), ("Member aktif", str(ov["active_members"])),
                 ("Member tidak aktif", str(ov["inactive_members"])), ("Stempel/member", str(ov["stamps_per_member"]))])
    pdf.heading("Perbandingan Cabang")
    pdf.table(["Cabang", "Stempel", "Redeem", "Kehadiran pegawai"],
              [[b["nama"], str(b["stempel"]), str(b["redeem"]), str(b["hadir"])] for b in data["branches"]],
              [200, 90, 90, 127], ["left", "right", "right", "right"])
    pdf.heading("Member Paling Aktif")
    rows = [[m["nama"], m["hp"], str(m["stempel_periode"]), "%d/9" % m["stempel_aktif"], "Aktif" if m["aktif"] else "Tidak aktif"]
            for m in data["members"][:20]]
    pdf.table(["Member", "Nomor HP", "Stempel periode", "Kartu", "Status"], rows,
              [150, 120, 105, 60, 72], ["left", "left", "right", "right", "left"])
    pdf.heading("Progres Stempel")
    pdf.table(["Jumlah cap", "Member"], [[str(p["cap"]), str(p["jumlah"])] for p in data["progress"]["distribusi"]],
              [200, 200], ["left", "right"])
    pdf.heading("Redeem")
    pdf.paragraph("Total redeem %d (potongan %d, poin %d). Rata-rata waktu dari kartu dibuat sampai redeem: %s hari."
                  % (data["redeem"]["total"], data["redeem"]["diskon"], data["redeem"]["poin"],
                     data["redeem"]["rata_hari"] if data["redeem"]["rata_hari"] is not None else "-"))
    return pdf.build(), "analitik-pelanggan-%s.pdf" % start


def cash_report(start, end):
    rows = db.query("""SELECT a.*, u.nama AS user_nama, b.nama AS branch_nama FROM attendance a
                       JOIN users u ON u.id=a.user_id JOIN branches b ON b.id=a.branch_id
                       WHERE a.tanggal BETWEEN ? AND ? AND a.kas_cash IS NOT NULL
                       ORDER BY a.tanggal DESC""", (start, end))
    pdf = PDF("Laporan Kas")
    pdf.gradient_header("Laporan Kas & Pengeluaran", "Periode %s - %s" % (start, end))
    total_kas = sum(r["kas_cash"] or 0 for r in rows)
    total_exp = sum(sum(e.get("nominal", 0) for e in util.read_json(r["kas_expenses"], [])) for r in rows)
    pdf.meta([("Periode", "%s - %s" % (start, end)), ("Shift dengan kas", str(len(rows))),
              ("Kas bersih", util.rupiah(total_kas - total_exp))])
    pdf.kv_grid([("Kas akhir shift", util.rupiah(total_kas)), ("Pengeluaran", util.rupiah(total_exp)),
                 ("Kas bersih", util.rupiah(total_kas - total_exp))])
    table_rows = []
    for r in rows:
        exp = sum(e.get("nominal", 0) for e in util.read_json(r["kas_expenses"], []))
        table_rows.append([r["tanggal"], r["user_nama"], r["branch_nama"], util.rupiah(r["kas_cash"] or 0),
                           util.rupiah(exp), util.rupiah((r["kas_cash"] or 0) - exp)])
    pdf.table(["Tanggal", "Pegawai", "Cabang", "Kas", "Pengeluaran", "Bersih"], table_rows,
              [74, 118, 138, 78, 78, 80], ["left", "left", "left", "right", "right", "right"])
    pdf.heading("Rincian Pengeluaran")
    exp_rows = []
    for r in rows:
        for e in util.read_json(r["kas_expenses"], []):
            exp_rows.append([r["tanggal"], r["user_nama"], e.get("keterangan", ""), e.get("kategori", ""),
                             util.rupiah(e.get("nominal", 0))])
    if exp_rows:
        pdf.table(["Tanggal", "Pegawai", "Keterangan", "Kategori", "Nominal"], exp_rows,
                  [74, 120, 190, 100, 84], ["left", "left", "left", "left", "right"])
    else:
        pdf.paragraph("Tidak ada pengeluaran tercatat pada periode ini.")
    return pdf.build(), "laporan-kas-%s.pdf" % start


def member_history_report(member_id):
    from . import loyalty
    m = db.one("SELECT * FROM members WHERE id=?", (member_id,))
    data = loyalty.card(m)
    pdf = PDF("Riwayat Member")
    pdf.gradient_header("Riwayat Member", m["nama"])
    pdf.meta([("Member", m["nama"]), ("Nomor HP", util.mask_phone(m["hp"])),
              ("Kode kartu", m["kode"]), ("Stempel aktif", "%d/9" % m["stempel_aktif"])])
    rows = []
    for h in data["history"]:
        rows.append([h["waktu"][:16].replace("T", " "), "Stempel" if h["jenis"] == "stempel" else "Redeem",
                     h.get("branch") or "-", (h.get("pegawai") or "-") if h["jenis"] == "stempel" else
                     ("Potongan Rp 24.000" if h.get("reward") == "diskon" else "Random Point")])
    pdf.table(["Waktu", "Jenis", "Cabang", "Keterangan"], rows, [110, 84, 140, 173],
              ["left", "left", "left", "left"])
    return pdf.build(), "riwayat-member-%s.pdf" % m["kode"]
