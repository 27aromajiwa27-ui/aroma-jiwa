/* Employee home: greeting, live clock, calendar strip, attendance ring, cash report */
import { get, post } from "../api.js";
import { S, nowServer, isoDate, wib, greeting, clockText, getWeather } from "../store.js";
import {
  icon, esc, toast, showError, sheet, ringSVG, weatherChip, emptyState, statusPill, shiftPill,
  fmtRp, fmtClock, fmtDateShort, fmtDateFull, countdown, minutesText, avatar, setBusy, chip,
  DAY_SHORT, MONTH_SHORT,
} from "../ui.js";
import { go, reload } from "../nav.js";
import { locate, distanceM } from "../geo.js";

function locationBanner(pos, branch) {
  if (!pos) {
    return `<div class="banner warn">${icon("mapPin", 17)}
      <div><b>Lokasi belum terbaca.</b><br>Aktifkan izin lokasi (GPS) lalu coba lagi.
      ${S.demo ? " Atau gunakan mode demo di bawah." : ""}</div></div>`;
  }
  const dist = branch ? distanceM(pos.lat, pos.lng, branch.lat, branch.lng) : null;
  const inside = branch ? dist <= branch.radius : false;
  const acc = Math.round(pos.accuracy || 0);
  return `<div class="banner ${inside ? "ok" : "warn"}">${icon("mapPin", 17)}
    <div><b>${inside ? "Dalam radius cabang" : "Di luar radius"}</b><br>
    Akurasi ±${acc} m${dist !== null ? ` · ${dist} m dari ${esc(branch.nama)} (maks ${branch.radius} m)` : ""}
    ${!inside && branch ? "<br>Dekatkan diri ke titik cabang atau gunakan check-out khusus." : ""}</div></div>`;
}

async function chooseBranchSheet(title, onDone) {
  const branches = S.branches || [];
  const body = `<div class="stack">
    <div class="small muted">Pilih cabang tempat kamu berada sekarang.</div>
    <div class="list">${branches.map((b, i) => `<button class="list-item" data-branch="${b.id}" style="text-align:left">
      <span class="li-ico ${i === 0 ? "ico-blue" : "ico-navy"}">${icon("mapPin", 18)}</span>
      <span class="li-body"><span class="li-title">${esc(b.nama)}</span>
      <span class="li-sub">${esc(b.brand || "")} · radius ${b.radius} m</span></span>
      ${icon("chevronRight", 16)}</button>`).join("")}</div>
  </div>`;
  sheet({
    title, body, center: true,
    onMount(el, close) {
      el.querySelectorAll("[data-branch]").forEach((btn) => {
        btn.onclick = () => {
          const b = branches.find((x) => String(x.id) === btn.dataset.branch);
          close();
          onDone(b);
        };
      });
    },
  });
}

/* ------------------------------------------------------------------ money input */
function attachMoney(input) {
  input.addEventListener("input", () => {
    const digits = input.value.replace(/\D/g, "");
    input.value = digits ? Number(digits).toLocaleString("id-ID") : "";
  });
  return () => Number(input.value.replace(/\D/g, "") || 0);
}

/* ------------------------------------------------------------------ attendance actions */
async function openCheckin(d, shiftHint) {
  let branch = (S.branches || [])[0];
  if (!branch) return toast("Belum ada cabang aktif.", "err");
  const shifts = [
    ["pagi", "Pagi", "10:00 – 16:00"],
    ["sore", "Sore", "15:00 – tutup"],
    ["fullday", "Full Day", "10:00 – tutup"],
  ];
  const preselected = shiftHint || (d.today_schedules && d.today_schedules[0] && d.today_schedules[0].shift) || "pagi";

  const modal = sheet({
    title: "Check-in presensi",
    sub: fmtDateFull(nowServer()),
    tall: true,
    body: `<div class="stack">
      <div data-loc>${locationBanner(null, branch)}</div>
      <div class="field"><div class="label">Shift</div>
        <div class="segmented" data-shifts>
          ${shifts.map(([slug, nm, jam]) => `<button type="button" data-shift="${slug}" class="${slug === preselected ? "active" : ""}">
            <span style="display:block">${nm}</span><span style="font-size:9px;display:block;opacity:.7">${jam}</span></button>`).join("")}
        </div>
      </div>
      <div class="field"><div class="label">Cabang</div>
        <div class="list" data-branches>
          ${(S.branches || []).slice(0, 1).map((b) => `<button type="button" class="list-item plain" data-bid="${b.id}" style="text-align:left">
            <span class="li-ico ico-blue">${icon("mapPin", 18)}</span>
            <span class="li-body"><span class="li-title">${esc(b.nama)}</span><span class="li-sub">radius ${b.radius} m · tutup ${esc(b.jam_tutup)}</span></span>
            <span class="check-mark">${icon("checkCircle", 20)}</span></button>`).join("")}
        </div>
      </div>
      ${S.demo ? `<label class="check"><input type="checkbox" data-demo> Gunakan lokasi demo (lewati GPS)</label>` : ""}
      <div class="field-error" data-err style="display:none"></div>
      <div class="banner" style="font-size:11px">${icon("info", 15)}<span>Presensi memakai GPS. Titik harus di dalam radius cabang.</span></div>
    </div>`,
    actions: `<button class="btn btn-outline grow" data-close>Batal</button>
      <button class="btn btn-primary grow" data-go>Check-in${icon("login", 17)}</button>`,
  });

  const el = modal.overlay.querySelector(".sheet");
  let shift = preselected;
  let branchId = branch.id;
  let pos = null;
  const demoInput = el.querySelector("[data-demo]");
  const err = el.querySelector("[data-err]");
  const btn = el.querySelector("[data-go]");

  el.querySelectorAll("[data-shift]").forEach((b) => {
    b.onclick = () => {
      shift = b.dataset.shift;
      el.querySelectorAll("[data-shift]").forEach((x) => x.classList.toggle("active", x === b));
    };
  });

  el.querySelectorAll("[data-bid]").forEach((b) => {
    b.onclick = () => {
      branchId = Number(b.dataset.bid);
      branch = S.branches.find((x) => x.id === branchId);
      el.querySelectorAll("[data-bid]").forEach((x) => {
        x.classList.toggle("plain", x !== b);
        const mark = x.querySelector(".check-mark");
        if (mark) mark.style.display = x === b ? "" : "none";
      });
      el.querySelector("[data-loc]").innerHTML = locationBanner(pos, branch);
    };
  });

  pos = await locate();
  if (!modal.overlay.isConnected) return;
  if (pos) {
    const scored = S.branches.map((b) => ({ b, d: distanceM(pos.lat, pos.lng, b.lat, b.lng) }));
    scored.sort((a, b) => a.d - b.d);
    const list = el.querySelector("[data-branches]");
    list.innerHTML = scored.map(({ b, d }) => `<button type="button" class="list-item ${b.id === branchId ? "" : "plain"}" data-bid="${b.id}" style="text-align:left">
      <span class="li-ico ${d <= b.radius ? "ico-green" : "ico-navy"}">${icon("mapPin", 18)}</span>
      <span class="li-body"><span class="li-title">${esc(b.nama)}</span>
      <span class="li-sub">${d} m · radius ${b.radius} m</span></span>
      <span class="check-mark" style="${b.id === branchId ? "" : "display:none"}">${icon("checkCircle", 20)}</span></button>`).join("");
    list.querySelectorAll("[data-bid]").forEach((b) => {
      b.onclick = () => {
        branchId = Number(b.dataset.bid);
        branch = S.branches.find((x) => x.id === branchId);
        list.querySelectorAll("[data-bid]").forEach((x) => {
          x.classList.toggle("plain", x !== b);
          const mark = x.querySelector(".check-mark");
          if (mark) mark.style.display = x === b ? "" : "none";
        });
        el.querySelector("[data-loc]").innerHTML = locationBanner(pos, branch);
      };
    });
    const nearest = scored.find((s) => s.d <= s.b.radius);
    if (nearest) {
      branchId = nearest.b.id;
      branch = nearest.b;
    }
  }
  el.querySelector("[data-loc]").innerHTML = locationBanner(pos, branch);
  if (!pos && demoInput) demoInput.checked = true;

  btn.onclick = async () => {
    err.style.display = "none";
    setBusy(btn, true);
    try {
      const payload = { shift, branch_id: branchId, demo: !!(demoInput && demoInput.checked) };
      if (pos) Object.assign(payload, { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, mock: false });
      const res = await post("/api/attendance/checkin", payload);
      modal.close();
      const att = res.attendance;
      toast(att.status === "telat" ? `Check-in pada ${att.check_in_jam} (telat ${att.menit_telat} mnt).` : `Check-in tepat waktu pukul ${att.check_in_jam}.`, att.status === "telat" ? "" : "ok");
      if (att.menit_telat > 0) toast(`Jam pulang bergeser ke ${att.jam_pulang_min_jam}.`, "");
      reload();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
      setBusy(btn, false);
    }
  };
}

function expenseRowHTML() {
  return `<div class="card flat tight" data-row style="padding:10px;margin-top:8px">
    <div class="row-between gap-8">
      <input class="input" name="ket" placeholder="Keterangan pengeluaran" style="height:40px">
      <button type="button" class="mini-btn danger" data-del>${icon("trash", 15)}</button>
    </div>
    <div class="grid2 mt-8">
      <select class="select" name="kat" style="height:40px">
        <option value="belanja">Belanja stok</option>
        <option value="transport">Transport</option>
        <option value="operasional">Operasional</option>
        <option value="lainnya">Lainnya</option>
      </select>
      <input class="input" name="nom" inputmode="numeric" placeholder="Nominal" style="height:40px">
    </div>
  </div>`;
}

async function openCheckout(d, khusus) {
  const att = d.active;
  if (!att) return toast("Tidak ada shift aktif.", "err");
  const branch = S.branches.find((b) => b.id === att.branch_id) || (S.branches || [])[0];
  const early = !att.bisa_checkout;
  if (!khusus && early) {
    toast(`Check-out normal baru bisa pukul ${att.jam_pulang_min_jam}.`, "err");
    return;
  }

  const modal = sheet({
    title: khusus ? "Check-out khusus" : "Check-out shift",
    sub: `${att.shift_nama} · ${att.branch_nama} · masuk ${att.check_in_jam}`,
    tall: true,
    body: `<div class="stack">
      ${khusus ? `<div class="banner purple">${icon("alert", 17)}<div>Check-out lebih awal akan dicatat sebagai <b>Khusus</b> dan memerlukan alasan. Jam pulang minimum tetap ${att.jam_pulang_min_jam}.</div></div>
        <div class="field"><label class="label">Kategori kondisi</label>
          <select class="select" data-kategori>
            <option value="sakit">Sakit</option><option value="keluarga">Keperluan keluarga</option>
            <option value="darurat">Darurat</option><option value="lainnya">Lainnya</option>
          </select></div>
        <div class="field"><label class="label">Alasan tertulis</label>
          <textarea class="textarea" data-alasan placeholder="Jelaskan alasan check-out lebih awal (min. 5 karakter)"></textarea></div>`
      : `<div class="banner ok">${icon("checkCircle", 17)}<div>Shift kamu sudah memenuhi jam minimal. Lengkapi laporan kas di bawah untuk check-out.</div></div>`}
      <div data-loc></div>
      <div class="field"><label class="label">Uang tunai di kasir (wajib)</label>
        <div class="amount-input"><span class="rp">Rp</span><input data-cash inputmode="numeric" placeholder="0"></div>
        <div class="field-hint">Total uang fisik di laci kasir saat ini.</div>
      </div>
      <div>
        <div class="row-between"><span class="label">Pengeluaran shift</span>
          <button type="button" class="btn btn-ghost btn-sm" data-add>${icon("plus", 14)} Tambah</button></div>
        <div data-expenses></div>
        <div class="row-between mt-8 small"><span class="muted">Total pengeluaran</span><b data-exp-total>Rp 0</b></div>
      </div>
      <div class="field"><label class="label">Catatan shift (opsional)</label>
        <textarea class="textarea" data-catatan placeholder="Contoh: stok sakura menipis, ada komplain pelanggan." style="min-height:70px"></textarea></div>
      <div class="field-error" data-err style="display:none"></div>
    </div>`,
    actions: `<button class="btn btn-outline grow" data-close>Batal</button>
      <button class="btn ${khusus ? "btn-danger" : "btn-primary"} grow" data-go>${khusus ? "Check-out Khusus" : "Check-out"}</button>`,
  });

  const el = modal.overlay.querySelector(".sheet");
  const err = el.querySelector("[data-err]");
  const btn = el.querySelector("[data-go]");
  const cashInput = el.querySelector("[data-cash]");
  const getCash = attachMoney(cashInput);
  const expWrap = el.querySelector("[data-expenses]");
  const expTotal = el.querySelector("[data-exp-total]");

  const recalc = () => {
    let total = 0;
    expWrap.querySelectorAll("[data-row]").forEach((row) => {
      total += Number((row.querySelector('[name="nom"]').value || "").replace(/\D/g, "") || 0);
    });
    expTotal.textContent = fmtRp(total);
  };

  el.querySelector("[data-add]").onclick = () => {
    expWrap.insertAdjacentHTML("beforeend", expenseRowHTML());
    const row = expWrap.lastElementChild;
    row.querySelector("[data-del]").onclick = () => { row.remove(); recalc(); };
    const nom = row.querySelector('[name="nom"]');
    nom.addEventListener("input", () => {
      const digits = nom.value.replace(/\D/g, "");
      nom.value = digits ? Number(digits).toLocaleString("id-ID") : "";
      recalc();
    });
  };
  recalc();

  const pos = await locate();
  if (modal.overlay.isConnected) {
    el.querySelector("[data-loc]").innerHTML = locationBanner(pos, branch);
  }

  btn.onclick = async () => {
    err.style.display = "none";
    const cash = getCash();
    if (!cash && cash !== 0) {
      err.textContent = "Jumlah uang tunai wajib diisi.";
      err.style.display = "block";
      return;
    }
    const payload = {
      cash,
      catatan: el.querySelector("[data-catatan]").value.trim(),
      expenses: [...expWrap.querySelectorAll("[data-row]")].map((row) => ({
        keterangan: row.querySelector('[name="ket"]').value.trim(),
        kategori: row.querySelector('[name="kat"]').value,
        nominal: Number(row.querySelector('[name="nom"]').value.replace(/\D/g, "") || 0),
      })).filter((e) => e.keterangan || e.nominal),
    };
    if (pos) Object.assign(payload, { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy });
    if (khusus) {
      payload.kategori = el.querySelector("[data-kategori]").value;
      payload.alasan = el.querySelector("[data-alasan]").value.trim();
      if (payload.alasan.length < 5) {
        err.textContent = "Alasan minimal 5 karakter.";
        err.style.display = "block";
        return;
      }
    }
    setBusy(btn, true);
    try {
      const res = await post(khusus ? "/api/attendance/checkout-khusus" : "/api/attendance/checkout", payload);
      modal.close();
      toast(`Check-out pukul ${res.attendance.check_out_jam}. Terima kasih!`, "ok");
      reload();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
      setBusy(btn, false);
    }
  };
}

/* ------------------------------------------------------------------ month sheet */
function monthGrid(data, year, month) {
  const first = new Date(year, month - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const today = isoDate();
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push('<div class="day-cell blank"></div>');
  data.days.forEach((day) => {
    const marks = (day.shifts || []).map((s) => {
      const rec = (day.records || []).find((r) => r.shift === s);
      if (rec) {
        const cls = s === "pagi" ? "pagi" : s === "sore" ? "sore" : "fullday";
        return `<span class="mk ${cls}">${(S.shifts[s] || {}).kode || "?"}</span>`;
      }
      if (day.future) return `<span class="mk ${s === "pagi" ? "pagi" : s === "sore" ? "sore" : "fullday"}" style="opacity:.35">${(S.shifts[s] || {}).kode}</span>`;
      return `<span class="mk absent">!</span>`;
    }).join("");
    cells.push(`<button type="button" class="day-cell ${day.tanggal === today ? "today" : ""}" data-day="${day.tanggal}">
      <span class="dn">${Number(day.tanggal.slice(8))}</span><span class="dm">${marks}</span></button>`);
  });
  return `<div class="day-grid">
    ${["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => `<div class="dow">${d}</div>`).join("")}
    ${cells.join("")}
  </div>`;
}

async function openMonth(year, month) {
  const modal = sheet({
    title: "Kalender presensi",
    sub: "Ketuk tanggal untuk melihat detail",
    tall: true,
    body: `<div class="center"><span class="spinner dark" style="display:inline-block"></span></div>`,
  });
  const el = modal.overlay.querySelector(".sheet");

  const draw = async (y, m) => {
    const data = await get(`/api/me/month?tahun=${y}&bulan=${m}`);
    el.querySelector(".sheet-body").innerHTML = `
      <div class="row-between mb-16">
        <button class="icon-btn plain" data-prev>${icon("chevronLeft", 18)}</button>
        <div class="center"><div class="h3">${MONTH_FULL_SAFE(m)} ${y}</div>
          <div class="tiny muted">${data.stats.shift} shift · ${data.stats.persen_tepat}% tepat</div></div>
        <button class="icon-btn plain" data-next>${icon("chevronRight", 18)}</button>
      </div>
      ${monthGrid(data.month, y, m)}
      <div class="legend mt-16">
        <span><i class="sq" style="background:var(--gold)"></i>Pagi</span>
        <span><i class="sq" style="background:var(--orange)"></i>Sore</span>
        <span><i class="sq" style="background:var(--blue)"></i>Full Day</span>
        <span><i class="sq" style="background:var(--late-bg);border:1px solid var(--late)"></i>Tidak absen</span>
      </div>
      <div class="grid3 mt-16">
        <div class="card flat tight center"><div class="h3">${data.stats.tepat}</div><div class="tiny muted">Tepat</div></div>
        <div class="card flat tight center"><div class="h3">${data.stats.telat}</div><div class="tiny muted">Telat</div></div>
        <div class="card flat tight center"><div class="h3">${data.stats.jam_kerja}</div><div class="tiny muted">Jam kerja</div></div>
      </div>`;
    el.querySelector("[data-prev]").onclick = () => draw(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);
    el.querySelector("[data-next]").onclick = () => draw(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
    el.querySelectorAll("[data-day]").forEach((btn) => {
      btn.onclick = () => {
        const day = data.month.days.find((x) => x.tanggal === btn.dataset.day);
        if (day) openDay(day);
      };
    });
  };
  await draw(year, month);
}

function MONTH_FULL_SAFE(m) {
  return ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"][m - 1];
}

function openDay(day) {
  const recs = day.records || [];
  const body = `<div class="stack-sm">
    <div class="small muted">${fmtDateFull(day.tanggal)}</div>
    ${recs.length ? recs.map((r) => `<div class="card flat tight">
      <div class="row-between"><b>${esc(r.shift_nama)}</b>${statusPill(r.status, r.menit_telat)}</div>
      <div class="kv mt-8"><span class="k">Masuk</span><span class="v">${r.check_in_jam || "—"}</span></div>
      <div class="kv"><span class="k">Pulang</span><span class="v">${r.check_out_jam || "belum"}</span></div>
      <div class="kv"><span class="k">Cabang</span><span class="v">${esc(r.branch_nama || "-")}</span></div>
      ${r.jam_pulang_min_jam ? `<div class="kv"><span class="k">Pulang minimal</span><span class="v">${r.jam_pulang_min_jam}</span></div>` : ""}
      ${r.dispensasi ? `<div class="chip purple mt-8">${icon("swap", 13)} Dispensasi multi-shift</div>` : ""}
      ${r.tipe_checkout === "khusus" ? `<div class="banner purple mt-8" style="font-size:11px">${icon("alert", 14)}<span>${esc(r.kategori_khusus || "Khusus")} · ${esc(r.alasan_khusus || "")}</span></div>` : ""}
      ${r.kas && r.kas.cash !== null && r.kas.cash !== undefined ? `<div class="divider"></div>
        <div class="kv"><span class="k">Uang tunai</span><span class="v">${fmtRp(r.kas.cash)}</span></div>
        ${(r.kas.expenses || []).map((e) => `<div class="kv"><span class="k">${esc(e.keterangan || e.kategori)}</span><span class="v">-${fmtRp(e.nominal)}</span></div>`).join("")}` : ""}
    </div>`).join("") : emptyState("calendar", "Tidak ada absensi", "Tanggal ini tidak memiliki catatan presensi.")}
    ${(day.shifts || []).filter((s) => !recs.find((r) => r.shift === s)).length ? `<div class="card flat tight">
      <div class="h4 mb-8">Jadwal tanpa absensi</div>
      ${(day.shifts || []).filter((s) => !recs.find((r) => r.shift === s)).map((s) => `<div class="row-between small"><span>${shiftPill(s)}</span><span class="muted">${s === "pagi" ? "10:00 – 16:00" : s === "sore" ? "15:00 – tutup" : "10:00 – tutup"}</span></div>`).join("")}
    </div>` : ""}
  </div>`;
  sheet({ title: "Detail hari", body, center: true });
}

/* ------------------------------------------------------------------ announcements */
const ANN_GRAD = [
  "linear-gradient(135deg,#2F6BEA,#5EDFB0)", "linear-gradient(135deg,#6D5BFF,#9B7BFF)",
  "linear-gradient(135deg,#F59A3C,#F5C542)", "linear-gradient(135deg,#1FA67A,#5EDFB0)",
];

function openAnnouncement(a) {
  const paragraphs = String(a.isi || "").split(/\n+/).map((p) => `<p style="margin-bottom:10px">${esc(p)}</p>`).join("");
  sheet({
    title: a.judul,
    sub: `${a.kategori || "Info"} · ${fmtDateShort(a.mulai)}${a.branch_nama ? " · " + a.branch_nama : " · Semua cabang"}`,
    body: `<div class="small" style="line-height:1.65">${paragraphs}</div>
      <div class="small muted mt-16">Perkiraan waktu baca ${a.waktu_baca || 1} menit</div>`,
    actions: `<button class="btn btn-primary grow" data-close>Mengerti</button>`,
  });
  if (!a.dibaca) {
    post(`/api/announcements/${a.id}/read`).catch(() => null);
  }
}

/* ------------------------------------------------------------------ page */
export async function render() {
  const now = nowServer();
  const y = wib(now).getFullYear();
  const m = wib(now).getMonth() + 1;
  const [me, month, ann, weather] = await Promise.all([
    get("/api/me"),
    get(`/api/me/month?tahun=${y}&bulan=${m}`),
    get("/api/announcements").catch(() => ({ items: [] })),
    getWeather(),
  ]);

  const d = me.dashboard;
  const recs = d.records || [];
  const active = d.active;
  const doneShifts = new Set(recs.filter((r) => r.check_in).map((r) => r.shift));
  const nextSched = (d.today_schedules || []).find((s) => !doneShifts.has(s.shift));
  const unread = (d.notifications || []).filter((n) => !n.dibaca).length;
  const today = wib(now);

  /* calendar strip */
  const days = month.month.days;
  const idx = days.findIndex((x) => x.tanggal === d.tanggal);
  const start = Math.max(0, Math.min(idx - 3, days.length - 7));
  const week = days.slice(start, start + 7);
  const strip = week.map((day) => {
    const dt = new Date(day.tanggal + "T00:00:00+07:00");
    const marks = (day.shifts || []).slice(0, 2).map((s) => {
      const rec = (day.records || []).find((r) => r.shift === s);
      const cls = s === "pagi" ? "pagi" : s === "sore" ? "sore" : "fullday";
      return `<span class="mark ${cls}" style="opacity:${rec || day.future ? 1 : 0.25}"></span>`;
    }).join("");
    return `<button class="cal-day ${day.tanggal === d.tanggal ? "today" : ""} ${day.future ? "other" : ""}" data-calday="${day.tanggal}">
      <span class="dow">${DAY_SHORT[dt.getDay()]}</span>
      <span class="num">${dt.getDate()}</span>
      <span class="marks">${marks}</span></button>`;
  }).join("");

  /* attendance card */
  let ringCenter;
  let attStatus;
  let actions;
  let note;
  if (active) {
    attStatus = `<span class="chip blue">${icon("clock", 13)} ${esc(active.shift_nama)} · ${esc(active.branch_nama)}</span>`;
    ringCenter = `<div class="ring-time" data-countdown>${countdown(active.sisa_detik)}</div>
      <div class="ring-label">Sisa waktu shift</div>
      <div class="ring-sub">Pulang min. ${active.jam_pulang_min_jam}</div>`;
    actions = `<button class="btn ${active.bisa_checkout ? "btn-primary" : ""} btn-lg grow" data-checkout ${active.bisa_checkout ? "" : "disabled"}>
        ${icon("logout", 17)} ${active.bisa_checkout ? "Check-out" : "Check-out " + active.jam_pulang_min_jam}</button>
      <button class="btn btn-outline btn-lg ${active.bisa_checkout ? "btn-round" : "grow"}" data-khusus>${icon("alert", 17)} ${active.bisa_checkout ? "" : "Khusus"}</button>`;
    note = active.dispensasi
      ? `<div class="att-note purple">${icon("swap", 13)} Dispensasi multi-shift aktif — jam pulang tidak digeser keterlambatan.</div>`
      : active.menit_telat > 0
        ? `<div class="att-note warn">${icon("alert", 13)} Telat ${active.menit_telat} menit · jam pulang menjadi ${active.jam_pulang_min_jam}.</div>`
        : `<div class="att-note ok">${icon("checkCircle", 13)} Kamu check-in tepat waktu pukul ${active.check_in_jam}.</div>`;
  } else if (nextSched) {
    attStatus = `<span class="chip ${nextSched.shift === "pagi" ? "gold" : "blue"}">${esc((S.shifts[nextSched.shift] || {}).nama || nextSched.shift)} · ${esc(nextSched.branch_nama)}</span>`;
    ringCenter = `<div class="ring-icon">${icon("clock", 24)}</div>
      <div class="ring-time" data-clock-hm>${clockText(now)}</div>
      <div class="ring-label">Belum check-in</div>
      <div class="ring-sub">Shift mulai ${(S.shifts[nextSched.shift] || {}).mulai || "-"}</div>`;
    actions = `<button class="btn btn-primary btn-lg btn-block" data-checkin="${nextSched.shift}">${icon("login", 18)} Check-in Sekarang</button>`;
    note = `<div class="att-note">${icon("mapPin", 13)} Jadwal hari ini di ${esc(nextSched.branch_nama)}. Pastikan GPS aktif.</div>`;
  } else if (recs.length) {
    const last = recs[recs.length - 1];
    attStatus = `<span class="chip green">${icon("checkCircle", 13)} Shift selesai</span>`;
    ringCenter = `<div class="ring-icon" style="background:var(--ok-bg);color:var(--ok)">${icon("check", 26)}</div>
      <div class="ring-time" data-clock-hm>${clockText(now)}</div>
      <div class="ring-label">Semua shift selesai</div>
      <div class="ring-sub">Pulang ${last.check_out_jam || "-"}</div>`;
    actions = `<a class="btn btn-soft btn-lg btn-block" href="#/riwayat">${icon("receipt", 17)} Lihat Riwayat Hari Ini</a>`;
    note = `<div class="att-note ok">${icon("checkCircle", 13)} Terima kasih, laporan kas shift kamu sudah tercatat.</div>`;
  } else {
    attStatus = `<span class="chip">${icon("clock", 13)} Belum ada jadwal hari ini</span>`;
    ringCenter = `<div class="ring-icon">${icon("clock", 24)}</div>
      <div class="ring-time" data-clock-hm>${clockText(now)}</div>
      <div class="ring-label">Belum check-in</div>
      <div class="ring-sub">${fmtDateShort(now)}</div>`;
    actions = `<button class="btn btn-primary btn-lg btn-block" data-checkin="pagi">${icon("login", 18)} Check-in</button>`;
    note = `<div class="att-note">${icon("info", 13)} Tidak ada jadwal. Kamu tetap bisa check-in jika diminta owner.</div>`;
  }

  const ringFrac = active
    ? Math.min(1, Math.max(0, 1 - (active.sisa_detik || 0) / Math.max(1, (new Date(active.jam_pulang_min).getTime() - new Date(active.check_in).getTime()) / 1000)))
    : recs.length ? 1 : 0;

  const announcements = (ann.items || []).slice(0, 5);
  const upcoming = (d.upcoming || []).filter((s) => s.tanggal > d.tanggal || !doneShifts.has(s.shift)).slice(0, 3);

  const html = `<main class="screen">
    <header class="hero">
      <div class="hero-top">
        <div class="brand"><span class="brand-mark">${icon("bottle", 17)}</span> Aroma Jiwa</div>
        <div class="hero-actions">
          <button class="icon-btn" data-bell aria-label="Notifikasi">${icon("bell", 18)}${unread ? '<span class="bell-dot"></span>' : ""}</button>
          <button class="avatar-chip" data-profile>
            <span class="av">${esc((me.user.avatar || me.user.nama.slice(0, 1)).toUpperCase())}</span>
            <span style="font-size:11px;font-weight:700">${esc(me.user.nama.split(" ")[0])}</span>
          </button>
        </div>
      </div>
      <div class="hero-greet">${d.sapaan || greeting()},</div>
      <div class="hero-name">${esc(me.user.nama)}</div>
      <div class="hero-clock">
        <div>
          <div class="clock-time"><span data-clock-hm>${clockText(now)}</span><span class="clock-sec" data-clock-sec>:${String(wib(now).getSeconds()).padStart(2, "0")}</span></div>
          <div class="clock-date">${fmtDateFull(now)}</div>
        </div>
        <div class="grow"></div>
        ${weatherChip(weather)}
      </div>
    </header>

    <div class="pad" style="margin-top:-46px;position:relative;z-index:3">
      <div class="card" style="padding:12px 12px 6px">
        <div class="row-between" style="padding:0 4px 6px">
          <span class="small strong">${MONTH_FULL_SAFE(m)} ${y}</span>
          <button class="link" data-month>${icon("calendar", 13)} Lihat bulan</button>
        </div>
        <div class="cal-strip">${strip}</div>
      </div>

      <div class="card att-card mt-16">
        <div class="att-top">${attStatus}</div>
        <div class="ring-wrap">
          ${ringSVG(ringFrac, { size: 214, stroke: 11, from: "#2F6BEF", to: "#5EDFB0" })}
          <div class="ring-center">${ringCenter}</div>
        </div>
        ${note || ""}
        ${active ? `<div class="att-meta"><span class="chip">${icon("mapPin", 12)} ${esc(active.branch_nama)}</span>
          <span class="chip">${icon("login", 12)} ${active.check_in_jam}</span>
          ${active.menit_telat ? `<span class="chip red">${icon("alert", 12)} ${active.menit_telat} mnt</span>` : ""}</div>` : ""}
        <div class="att-actions">${actions}</div>
      </div>

      <div class="stat-row mt-16">
        <div class="stat-card"><div class="stat-ico ico-blue">${icon("calendar", 16)}</div>
          <div class="v">${d.stats.shift}</div><div class="k">Shift bulan ini</div></div>
        <div class="stat-card"><div class="stat-ico ico-green">${icon("checkCircle", 16)}</div>
          <div class="v">${d.stats.persen_tepat}%</div><div class="k">Tepat waktu</div></div>
        <div class="stat-card"><div class="stat-ico ico-gold">${icon("clock", 16)}</div>
          <div class="v">${d.stats.jam_kerja}</div><div class="k">Jam kerja</div></div>
      </div>

      <a class="streak-card mt-16" href="#/lencana" style="display:block">
        <div class="row-between">
          <div>
            <div class="small" style="opacity:.8">Streak disiplin</div>
            <div class="row" style="gap:8px;align-items:baseline"><span class="streak-days">${d.streak}</span>
              <span style="font-size:12px;opacity:.85">hari/shift berturut</span></div>
            <div class="small mt-8" style="opacity:.8">${d.badges_terbuka} dari ${d.badges.length} lencana terbuka</div>
          </div>
          <div class="flame-wrap">${icon("flame", 24)}</div>
        </div>
      </a>

      <div class="section-head"><span class="section-title">Aksi cepat</span></div>
      <div class="quick-row">
        <button class="quick-card" data-quick="checkin"><span class="ic ico-blue">${icon("login", 18)}</span><span class="t">Presensi</span></button>
        <a class="quick-card" href="#/scan"><span class="ic ico-green">${icon("scan", 18)}</span><span class="t">Scan Stempel</span></a>
        <a class="quick-card" href="#/riwayat"><span class="ic ico-purple">${icon("clock", 18)}</span><span class="t">Riwayat</span></a>
        <a class="quick-card" href="#/stok"><span class="ic ico-gold">${icon("box", 18)}</span><span class="t">Lapor Stok</span></a>
      </div>

      ${announcements.length ? `<div class="section-head"><span class="section-title">Pengumuman</span>
        <a class="link" href="#/pengumuman">Semua ${icon("chevronRight", 13)}</a></div>
        <div class="h-scroll">
          ${announcements.map((a, i) => `<button class="ann-card" data-ann="${a.id}" style="text-align:left">
            ${a.dibaca ? "" : '<span class="unread-dot"></span>'}
            <div class="ann-cover" style="background:${ANN_GRAD[i % ANN_GRAD.length]}"><span class="cat">${esc(a.kategori || "Info")}</span></div>
            <div class="ann-body"><div class="ann-title">${esc(a.judul)}</div>
              <div class="ann-meta">${icon("clock", 11)} ${fmtDateShort(a.mulai)} · ${a.waktu_baca || 1} mnt baca</div></div>
          </button>`).join("")}
        </div>` : ""}

      ${upcoming.length ? `<div class="section-head"><span class="section-title">Jadwal berikutnya</span>
        <a class="link" href="#/jadwal">Semua ${icon("chevronRight", 13)}</a></div>
        <div class="list">
          ${upcoming.map((s) => `<a class="list-item" href="#/jadwal">
            <span class="li-ico ${s.shift === "pagi" ? "ico-gold" : "ico-blue"}">${icon("calendar", 18)}</span>
            <span class="li-body"><span class="li-title">${esc((S.shifts[s.shift] || {}).nama || s.shift)} · ${esc(s.branch_nama)}</span>
            <span class="li-sub">${fmtDateShort(s.tanggal)} · ${(S.shifts[s.shift] || {}).mulai || "-"}${(S.shifts[s.shift] || {}).pulang ? " – " + S.shifts[s.shift].pulang : " – tutup"}</span></span>
            <span class="chev">${icon("chevronRight", 16)}</span></a>`).join("")}
        </div>` : ""}

      <div class="center mt-24 tiny muted">Aroma Jiwa Hadir · data tersinkron otomatis</div>
    </div>
  </main>`;

  return {
    html,
    mount(root) {
      const timer = setInterval(() => {
        const n = nowServer();
        root.querySelectorAll("[data-clock-hm]").forEach((el) => { el.textContent = clockText(n); });
        root.querySelectorAll("[data-clock-sec]").forEach((el) => { el.textContent = ":" + String(wib(n).getSeconds()).padStart(2, "0"); });
        if (active) {
          const left = Math.max(0, Math.floor((new Date(active.jam_pulang_min).getTime() - n.getTime()) / 1000));
          const cd = root.querySelector("[data-countdown]");
          if (cd) cd.textContent = countdown(left);
          const circle = root.querySelector(".ring-wrap svg circle:last-of-type");
          if (circle) {
            const total = Math.max(1, (new Date(active.jam_pulang_min).getTime() - new Date(active.check_in).getTime()) / 1000);
            const frac = Math.min(1, Math.max(0, 1 - left / total));
            const c = 2 * Math.PI * ((214 - 11) / 2);
            circle.setAttribute("stroke-dashoffset", (c * (1 - frac)).toFixed(2));
            circle.setAttribute("stroke-dasharray", c.toFixed(2));
          }
          if (left === 0 && !active.bisa_checkout) {
            setTimeout(() => reload(), 900);
          }
        }
      }, 1000);

      root.querySelector("[data-bell]").onclick = () => go("notifikasi");
      root.querySelector("[data-profile]").onclick = () => go("profil");
      root.querySelector("[data-month]").onclick = () => openMonth(y, m);
      root.querySelectorAll("[data-calday]").forEach((btn) => {
        btn.onclick = () => {
          const day = days.find((x) => x.tanggal === btn.dataset.calday);
          if (day) openDay(day);
        };
      });

      const checkoutBtn = root.querySelector("[data-checkout]");
      if (checkoutBtn) checkoutBtn.onclick = () => openCheckout(d, false);
      const khususBtn = root.querySelector("[data-khusus]");
      if (khususBtn) khususBtn.onclick = () => openCheckout(d, true);
      const checkinBtn = root.querySelector("[data-checkin]");
      if (checkinBtn) checkinBtn.onclick = () => openCheckin(d, checkinBtn.dataset.checkin);

      root.querySelector("[data-quick='checkin']").onclick = () => {
        if (active) openCheckout(d, !active.bisa_checkout);
        else openCheckin(d, nextSched && nextSched.shift);
      };

      root.querySelectorAll("[data-ann]").forEach((btn) => {
        btn.onclick = () => {
          const a = announcements.find((x) => String(x.id) === btn.dataset.ann);
          if (a) openAnnouncement(a);
        };
      });

      return () => clearInterval(timer);
    },
  };
}
