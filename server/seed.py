"""Demo dataset so every screen has believable data on first run."""
import random
from datetime import timedelta

from . import db, util

R = random.Random(20261112)


def _at(date, clock):
    return util.dt_at(date, clock)


def _near(lat, lng, meters=25):
    dlat = R.uniform(-meters, meters) / 111320.0
    dlng = R.uniform(-meters, meters) / (111320.0 * 0.98)
    return round(lat + dlat, 6), round(lng + dlng, 6)


BRANCHES = [
    # nama, alamat, lat, lng, radius, jam_tutup
    ("Aroma Jiwa Palbapang", "Jl. Raya Palbapang, Bantul", -7.888900, 110.324100, 50, "20:30"),
    ("Aroma Jiwa Sapuangin", "Jl. Sapuangin, Sewon, Bantul", -7.913500, 110.335200, 50, "21:00"),
    ("Aroma Jiwa Manding", "Jl. Manding, Bantul", -7.900400, 110.353600, 50, "20:30"),
    ("Aroma Jiwa Ganjuran", "Jl. Ganjuran, Bambanglipuro, Bantul", -7.908000, 110.330800, 50, "21:00"),
    ("Janji Wangi Kalakijo", "Kalakijo, Pleret, Bantul", -7.876000, 110.341000, 50, "20:30"),
]

# nama, hp, jadwal mingguan {weekday: [(shift, branch_index)]}
EMPLOYEES = [
    ("Rina Kusuma", "081234560001", {0: [("pagi", 0)], 1: [("pagi", 0)], 2: [("pagi", 0)],
                                     3: [("pagi", 0)], 4: [("pagi", 0)], 5: [("pagi", 1)]}),
    ("Bagas Pratama", "081234560002", {0: [("sore", 2)], 2: [("sore", 2)], 4: [("sore", 2)],
                                       1: [("fullday", 3)], 3: [("fullday", 3)]}),
    ("Sinta Maharani", "081234560003", {0: [("sore", 1)], 1: [("sore", 1)], 2: [("sore", 1)],
                                        3: [("pagi", 0), ("sore", 1)], 4: [("sore", 1)]}),
    ("Dimas Saputra", "081234560004", {0: [("pagi", 4)], 1: [("pagi", 4)], 2: [("pagi", 4)],
                                       3: [("pagi", 4)], 4: [("pagi", 4)]}),
    ("Ayu Lestari", "081234560005", {0: [("sore", 3)], 2: [("sore", 3)], 3: [("sore", 3)],
                                     4: [("sore", 3)], 5: [("fullday", 2)]}),
    ("Fajar Nugroho", "081234560006", {0: [("fullday", 1)], 1: [("fullday", 1)], 2: [("fullday", 1)],
                                       3: [("fullday", 1)], 4: [("fullday", 1)]}),
]

MEMBERS = [
    ("Anisa Rahmawati", "081298760001"), ("Dewi Anggraini", "081298760002"),
    ("Putri Handayani", "081298760003"), ("Nadia Safitri", "081298760004"),
    ("Laras Widowati", "081298760005"), ("Yuni Astuti", "081298760006"),
    ("Maya Puspita", "081298760007"), ("Kartika Sari", "081298760008"),
    ("Rizky Ramadhan", "081298760009"), ("Andi Wijaya", "081298760010"),
    ("Bambang Hermawan", "081298760011"), ("Gilang Permana", "081298760012"),
    ("Hesti Purwanti", "081298760013"), ("Indah Pertiwi", "081298760014"),
    ("Joko Susilo", "081298760015"), ("Melati Kusuma", "081298760016"),
]

AROMA = [
    ("Sakura Bloom", "Floral", "Manis lembut dengan sentuhan kelopak sakura.", 35000),
    ("Melati Malam", "Floral", "Melati klasik yang hangat dan menenangkan.", 33000),
    ("Lavender Calm", "Floral", "Lavender herbal untuk relaksasi.", 33000),
    ("Vanilla Kiss", "Sweet", "Vanila creamy dengan aroma karamel.", 36000),
    ("White Musk", "Sweet", "Musk bersih, lembut, dan tahan lama.", 38000),
    ("Sandalwood", "Woody", "Kayu cendana hangat dan elegan.", 40000),
    ("Amber Oud", "Woody", "Oud pekat bercampur amber manis.", 45000),
    ("Ocean Breeze", "Fresh", "Segar seperti angin laut pagi.", 34000),
    ("Citrus Splash", "Fresh", "Jeruk segar untuk aktivitas harian.", 33000),
    ("Rose Velvet", "Floral", "Mawar merah dengan sentuhan beludru.", 37000),
]

INVENTORY = [
    ("Botol Kaca 30 ml", "Botol", "pcs"), ("Botol Kaca 50 ml", "Botol", "pcs"),
    ("Botol Kaca 100 ml", "Botol", "pcs"), ("Kemasan Kado", "Kemasan", "pcs"),
    ("Label Stiker Aroma", "Label", "lembar"), ("Tisu Parfum", "Perlengkapan", "pack"),
    ("Bibit Sakura Bloom", "Bibit", "ml"), ("Bibit White Musk", "Bibit", "ml"),
]


def run():
    now = util.now()
    today = now.strftime("%Y-%m-%d")
    branches = []
    for i, (nama, alamat, lat, lng, radius, tutup) in enumerate(BRANCHES):
        bid = db.execute(
            "INSERT INTO branches(nama, brand, alamat, lat, lng, radius, jam_tutup, aktif, urutan) VALUES(?,?,?,?,?,?,?,1,?)",
            (nama, "Janji Wangi" if "Janji" in nama else "Aroma Jiwa", alamat, lat, lng, radius, tutup, i))
        branches.append({"id": bid, "nama": nama, "lat": lat, "lng": lng, "jam_tutup": tutup})

    users = []
    for nama, hp, pola in EMPLOYEES:
        uid = db.execute(
            "INSERT INTO users(nama, hp, password_hash, peran, prefs, dibuat) VALUES(?,?,?,'pegawai',?,?)",
            (nama, hp, util.hash_password("aroma123"),
             util.dump_json({"tema": "system", "notif": {"shift": True, "checkin": True, "checkout": True, "pengumuman": True}}),
             util.iso(now - timedelta(days=90))))
        users.append({"id": uid, "nama": nama, "hp": hp, "pola": pola})

    aroma_ids = []
    for nama, kat, desk, harga in AROMA:
        aroma_ids.append(db.execute(
            "INSERT INTO aroma(nama, kategori, deskripsi, harga, aktif) VALUES(?,?,?,?,1)",
            (nama, kat, desk, harga)))
    for nama, kat, satuan in INVENTORY:
        db.execute("INSERT INTO inventory_items(nama, kategori, satuan, aktif) VALUES(?,?,?,1)", (nama, kat, satuan))

    # ---- schedules for -60 .. +21 days -------------------------------------
    schedules = []
    start = now.date() - timedelta(days=60)
    for offset in range(0, 82):
        day = start + timedelta(days=offset)
        if day.weekday() == 6:  # Minggu tutup
            continue
        for u in users:
            for shift, bidx in u["pola"].get(day.weekday(), []):
                db.execute("INSERT OR IGNORE INTO schedules(user_id, tanggal, shift, branch_id, created_by) VALUES(?,?,?,?,?)",
                           (u["id"], day.strftime("%Y-%m-%d"), shift, branches[bidx]["id"], "Owner"))
                schedules.append({"user": u, "tanggal": day.strftime("%Y-%m-%d"), "shift": shift,
                                  "bidx": bidx, "branch": branches[bidx]})

    # ---- attendance history ------------------------------------------------
    history_end = now.date() - timedelta(days=1)
    by_day = {}
    for s in schedules:
        by_day.setdefault((s["user"]["id"], s["tanggal"]), []).append(s)

    def end_clock(branch, shift):
        return "16:00" if shift == "pagi" else branch["jam_tutup"]

    for (uid, tanggal), items in sorted(by_day.items(), key=lambda kv: kv[0][1]):
        day = util.dt_at(tanggal, "10:00")
        if day.date() > history_end:
            continue
        items = sorted(items, key=lambda x: 0 if x["shift"] == "pagi" else 1)
        prev_branch = None
        for idx, s in enumerate(items):
            if R.random() < 0.04:
                continue  # tidak masuk
            branch = s["branch"]
            shift = s["shift"]
            mulai = _at(tanggal, util.SHIFTS[shift]["mulai"])
            late = 0 if R.random() < 0.78 else R.randint(2, 22)
            if late:
                check_in = mulai + timedelta(minutes=late)
            else:
                check_in = mulai - timedelta(minutes=R.randint(1, 14))
            menit_telat = max(0, util.minutes_between(mulai, check_in))
            dispensasi = 1 if (idx > 0 and prev_branch and prev_branch["id"] != branch["id"] and shift != "pagi") else 0
            jp = _at(tanggal, end_clock(branch, shift))
            if menit_telat and not dispensasi:
                jp = jp + timedelta(minutes=menit_telat)
            checkout = jp + timedelta(minutes=R.randint(0, 9))
            tipe = "normal"
            kategori = alasan = None
            if R.random() < 0.05:
                tipe = "khusus"
                kategori = R.choice(["sakit", "keluarga", "darurat"])
                alasan = R.choice(["Demam, izin pulang lebih awal.", "Ada keperluan keluarga mendadak.",
                                   "Mengantar orang tua ke klinik."])
                checkout = check_in + timedelta(hours=R.randint(2, 4))
            if R.random() < 0.02:
                checkout = None
                tipe = None
            lat, lng = _near(branch["lat"], branch["lng"], 20)
            cash = R.choice([180000, 240000, 310000, 425000, 520000, 275000])
            expenses = []
            if R.random() < 0.45:
                expenses = [{"keterangan": R.choice(["Beli tisu", "Bensin kurir", "Beli label stiker", "Air galon"]),
                             "kategori": R.choice(["operasional", "perlengkapan", "transport", "lainnya"]),
                             "nominal": R.choice([15000, 25000, 32000, 48000])}]
            db.execute(
                """INSERT INTO attendance(user_id, branch_id, shift, tanggal, check_in, check_out, menit_telat,
                   jam_pulang_min, dispensasi, tipe_checkout, kategori_khusus, alasan_khusus, lat, lng, akurasi, jarak,
                   kas_cash, kas_expenses, kas_catatan, dibuat)
                   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (uid, branch["id"], shift, tanggal, util.iso(check_in), util.iso(checkout), menit_telat,
                 util.iso(jp), dispensasi, tipe, kategori, alasan, lat, lng, round(R.uniform(6, 24), 1),
                 round(R.uniform(4, 38), 1), cash if checkout else None,
                 util.dump_json(expenses), None if R.random() < 0.7 else "Toko ramai sore ini.",
                 util.iso(check_in)))
            prev_branch = branch

    # ---- today: a couple of early check-ins so the owner dashboard is alive --
    if now.hour >= 10 or (now.hour == 9 and now.minute >= 45):
        for u, bidx, minutes_ago in ((users[1], 4, 26), (users[3], 3, 9)):
            branch = branches[bidx]
            check_in = now - timedelta(minutes=minutes_ago)
            lat, lng = _near(branch["lat"], branch["lng"], 18)
            db.execute(
                """INSERT INTO attendance(user_id, branch_id, shift, tanggal, check_in, jam_pulang_min, menit_telat,
                   dispensasi, lat, lng, akurasi, jarak, dibuat) VALUES(?,?,?,?,?,?,0,0,?,?,?,?,?)""",
                (u["id"], branch["id"], "pagi", today, util.iso(check_in), util.iso(_at(today, "16:00")),
                 lat, lng, round(R.uniform(7, 19), 1), round(R.uniform(5, 30), 1), util.iso(check_in)))

    # ---- members + stamps --------------------------------------------------
    targets = [9, 8, 9, 5, 3, 7, 0, 1, 2, 6, 4, 8, 9, 5, 2, 0]
    member_ids = []
    for i, (nama, hp) in enumerate(MEMBERS):
        mid = db.execute("INSERT INTO members(nama, hp, kode, stempel_aktif, prefs, dibuat) VALUES(?,?,?,0,?,?)",
                         (nama, hp, "AJTEMP%03d" % i, util.dump_json({"tema": "system", "notif": {"stamp": True}}),
                          util.iso(now - timedelta(days=R.randint(20, 240)))))
        db.execute("UPDATE members SET kode=? WHERE id=?", (util.member_code(mid), mid))
        member_ids.append(mid)

    pegawai_ids = [u["id"] for u in users]
    stamp_times = []
    for i, mid in enumerate(member_ids):
        target = targets[i]
        cycles = R.randint(0, 2) if target < 5 else R.randint(1, 3)
        total = target + cycles * 9
        times = sorted(now - timedelta(days=R.uniform(2, 44), hours=R.uniform(0, 9)) for _ in range(total))
        for t in times:
            t = t.replace(minute=R.randint(0, 59), second=0, microsecond=0)
            if t > now:
                t = now - timedelta(minutes=R.randint(5, 60))
            bid = R.choice(branches)
            peg = R.choice(pegawai_ids)
            sumber = "manual" if R.random() < 0.12 else "scan"
            sid = db.execute("INSERT INTO stamps(member_id, pegawai_id, branch_id, waktu, sumber) VALUES(?,?,?,?,?)",
                             (mid, peg, bid["id"], util.iso(t), sumber))
            stamp_times.append((t, mid))
            if R.random() < 0.72:
                ai = R.randrange(len(AROMA))
                db.execute("""INSERT INTO purchases(member_id, aroma_id, aroma_nama, ukuran, stamp_id, pegawai_id, branch_id, waktu, sumber)
                              VALUES(?,?,?,?,?,?,?,?,?)""",
                           (mid, aroma_ids[ai], AROMA[ai][0], R.choice(["30 ml", "50 ml", "100 ml"]), sid, peg,
                            bid["id"], util.iso(t), sumber))
        # riwayat redeem: satu setiap kartu penuh, kartu terakhir tetap terisi
        for c in range(cycles):
            t = times[min(len(times) - 1, (c + 1) * 9 - 1)] if times else now - timedelta(days=10)
            db.execute("INSERT INTO redemptions(member_id, jenis, nilai, waktu, pegawai_id, branch_id) VALUES(?,?,?,?,?,?)",
                       (mid, "diskon" if R.random() < 0.6 else "poin", "24000" if R.random() < 0.6 else str(R.randint(5, 50)),
                        util.iso(t + timedelta(minutes=6)), R.choice(pegawai_ids), R.choice(branches)["id"]))
        db.execute("UPDATE members SET stempel_aktif=? WHERE id=?", (target, mid))

    # stempel hari ini (setelah toko buka)
    if now.hour >= 10:
        for _ in range(R.randint(4, 7)):
            t = now - timedelta(minutes=R.randint(8, min(180, max(10, now.hour * 60 + now.minute - 540))))
            mid = R.choice(member_ids[:12])
            bid = R.choice(branches)
            peg = R.choice(pegawai_ids)
            db.execute("INSERT INTO stamps(member_id, pegawai_id, branch_id, waktu, sumber) VALUES(?,?,?,?,?)",
                       (mid, peg, bid["id"], util.iso(t), "scan"))
            db.execute("UPDATE members SET stempel_aktif = (SELECT COUNT(*) FROM stamps WHERE member_id=?) WHERE id=?",
                       (mid, mid))

    # ---- ratings -----------------------------------------------------------
    stamp_rows = db.query("SELECT * FROM stamps ORDER BY waktu DESC LIMIT 90")
    for s in stamp_rows[:46]:
        if R.random() < 0.35:
            continue
        bintang = R.choices([5, 4, 3, 2, 1], weights=[55, 28, 10, 5, 2])[0]
        tags = R.sample(["Ramah", "Cepat", "Rapi", "Wangi pas", "Perlu ditingkatkan"], k=min(2, 5))
        db.execute("""INSERT INTO ratings(member_id, stamp_id, pegawai_id, branch_id, bintang, tag, komentar, waktu)
                      VALUES(?,?,?,?,?,?,?,?)""",
                   (s["member_id"], s["id"], s["pegawai_id"], s["branch_id"], bintang, util.dump_json(tags),
                    "Pelayanan cepat, aromanya pas." if bintang >= 4 else "Antrian agak lama sore ini.",
                    util.iso(util.parse_iso(s["waktu"]) + timedelta(minutes=2))))

    # ---- announcements -----------------------------------------------------
    anns = [
        ("Promo November: 9 cap, gratis 1 botol", "Kumpulkan 9 cap di kartu member, lalu tukarkan dengan potongan Rp 24.000 atau Random Point. Berlaku di semua cabang sampai 30 November 2026.",
         "Promo", 1, None, 3),
        ("SOP baru: laporan kas sebelum check-out", "Mulai pekan ini setiap check-out wajib mengisi jumlah cash di toko dan pengeluaran hari itu. Foto nota dilampirkan bila ada pengeluaran di atas Rp 50.000.",
         "SOP", 3, None, 1),
        ("Tips: tanyakan aroma favorit pelanggan", "Saat memberi stempel, tanyakan aroma favorit dan catat di langkah Catat Aroma. Data ini membantu rekomendasi isi ulang berikutnya.",
         "Tips Penjualan", 2, None, 0),
        ("Libur cabang Ganjuran, 20 November", "Cabang Ganjuran tutup pada 20 November untuk perawatan AC. Pegawai dijadwalkan ulang ke Sapuangin.",
         "Info Operasional", 0, 4, 0),
    ]
    for judul, isi, kat, semua, bid, semat in anns:
        db.execute("""INSERT INTO announcements(judul, isi, kategori, semua, branch_id, mulai, berakhir, sematkan, kirim_notif, dibuat)
                      VALUES(?,?,?,?,?,?,?,?,1,?)""",
                   (judul, isi, kat, semua, bid, util.iso(now - timedelta(days=4)),
                    util.iso(now + timedelta(days=25)), semat, util.iso(now - timedelta(days=4))))

    # ---- stock reports -----------------------------------------------------
    db.execute("""INSERT INTO stock_reports(branch_id, item_id, item_nama, tingkat, perkiraan_sisa, catatan, pelapor, status, dibuat)
                  VALUES(?,?,?,?,?,?,?,?,?)""",
               (branches[0]["id"], 1, "Botol Kaca 30 ml", "Hampir Habis", "6 pcs", "Sisa di rak atas.", users[0]["id"],
                "Baru", util.iso(now - timedelta(hours=3))))
    db.execute("""INSERT INTO stock_reports(branch_id, item_id, item_nama, tingkat, perkiraan_sisa, catatan, pelapor, status, dibuat)
                  VALUES(?,?,?,?,?,?,?,?,?)""",
               (branches[4]["id"], 7, "Bibit Sakura Bloom", "Habis", "0 ml", "Pelanggan banyak minta Sakura.",
                users[3]["id"], "Diproses", util.iso(now - timedelta(days=1, hours=2))))

    # ---- kasbon ------------------------------------------------------------
    db.execute("INSERT INTO advances(user_id, nominal, tanggal, alasan, skema, cicilan, sisa, status, dibuat) VALUES(?,?,?,?,?,?,?,?,?)",
               (users[0]["id"], 300000, (now - timedelta(days=12)).strftime("%Y-%m-%d"),
                "Keperluan keluarga", "cicilan", 2, 300000, "Aktif", util.iso(now - timedelta(days=12))))
    db.execute("INSERT INTO advances(user_id, nominal, tanggal, alasan, skema, cicilan, sisa, status, dibuat) VALUES(?,?,?,?,?,?,?,?,?)",
               (users[1]["id"], 150000, (now - timedelta(days=25)).strftime("%Y-%m-%d"),
                "Servis motor", "sekali", 1, 150000, "Aktif", util.iso(now - timedelta(days=25))))

    # ---- contoh anomali supaya panel peringatan owner terisi ----------------
    burst_day = (now - timedelta(days=1)).replace(hour=15, minute=6, second=0, microsecond=0)
    for i, mid in enumerate([member_ids[0], member_ids[2], member_ids[12]]):
        for j in range(4):
            db.execute("INSERT INTO stamps(member_id, pegawai_id, branch_id, waktu, sumber) VALUES(?,?,?,?,?)",
                       (mid, users[2]["id"], branches[0]["id"], util.iso(burst_day + timedelta(minutes=i * 12 + j * 3)),
                        "scan"))
    fajar = users[5]["id"]
    late_rows = db.query("""SELECT * FROM attendance WHERE user_id=? AND check_out IS NOT NULL ORDER BY tanggal DESC LIMIT 3""",
                         (fajar,))
    for r in late_rows:
        ci = util.parse_iso(r["check_in"]) + timedelta(minutes=9)
        jp = util.parse_iso(r["jam_pulang_min"]) + timedelta(minutes=9)
        db.execute("UPDATE attendance SET check_in=?, menit_telat=9, jam_pulang_min=? WHERE id=?",
                   (util.iso(ci), util.iso(jp), r["id"]))
    ayu = users[4]["id"]
    kh_rows = db.query("""SELECT * FROM attendance WHERE user_id=? AND check_out IS NOT NULL ORDER BY tanggal DESC LIMIT 2""",
                       (ayu,))
    for r in kh_rows:
        db.execute("""UPDATE attendance SET tipe_checkout='khusus', kategori_khusus='sakit',
                      alasan_khusus='Sakit, izin pulang lebih awal.' WHERE id=?""", (r["id"],))
    for k in range(3):
        db.execute("""INSERT INTO attempts(user_id, branch_id, jenis, alasan, jarak, akurasi, lat, lng, mock, waktu)
                      VALUES(?,?,?,?,?,?,?,?,0,?)""",
                   (users[3]["id"], branches[4]["id"], "checkin",
                    "Di luar radius Janji Wangi Kalakijo. Jarak kamu 320 m dari titik cabang (maksimal 50 m).",
                    320, 18, branches[4]["lat"], branches[4]["lng"],
                    util.iso(now - timedelta(days=1, hours=2, minutes=k * 4))))
    db.execute("""INSERT INTO attempts(user_id, branch_id, jenis, alasan, jarak, akurasi, lat, lng, mock, waktu)
                  VALUES(?,?,?,?,?,?,?,?,1,?)""",
               (users[1]["id"], branches[2]["id"], "checkin",
                "Lokasi palsu (mock location) terdeteksi. Presensi ditolak.", 0, 0,
                branches[2]["lat"], branches[2]["lng"], util.iso(now - timedelta(days=2, hours=3))))
    dbl_day = (now - timedelta(days=3)).replace(hour=13, minute=20, second=0, microsecond=0)
    for k in range(2):
        db.execute("""INSERT INTO redemptions(member_id, jenis, nilai, waktu, pegawai_id, branch_id)
                      VALUES(?,?,?,?,?,?)""",
                   (member_ids[4], "diskon", "24000", util.iso(dbl_day + timedelta(minutes=k * 40)),
                    users[0]["id"], branches[0]["id"]))

    # ---- audit -------------------------------------------------------------
    db.audit("Owner", "Mengubah jam check-in", {"user": "Dimas Saputra", "check_in": "10:14"}, {"check_in": "10:00"})
    db.audit("Owner", "Menambah cabang", None, {"nama": "Janji Wangi Kalakijo"})
    db.audit("Sinta Maharani", "Login", None, {"perangkat": "Android"})
