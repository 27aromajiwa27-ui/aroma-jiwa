/* Owner portal: PIN gate and every admin screen (dashboard, editors, analytics, PDF) */
import { get, post, patch, del, download } from "../api.js";
import { S, setSession, connectStream, nowServer, wib, isoDate } from "../store.js";
import { locate } from "../geo.js";
import {
  icon, esc, toast, sheet, confirmSheet, emptyState, fmtRp, fmtNum, fmtDateShort, fmtDateFull,
  fmtDateTime, fmtClock, timeAgo, setBusy, showError, statusPill, shiftMark, ringSVG, areaChart,
  donutSVG, progressBar, starsRow, barChart, kvRow, DAY_SHORT, MONTH_SHORT,
} from "../ui.js";
import { go, reload } from "../nav.js";

/* ------------------------------------------------------------------ helpers */
const pad2 = (n) => String(n).padStart(2, "0");
const today = () => isoDate(nowServer());
function monthStart() {
  const d = wib(nowServer());
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}
function monthValue() {
  const d = wib(nowServer());
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function shiftName(slug) {
  return (S.shifts && S.shifts[slug] && S.shifts[slug].nama) || slug;
}
function qs(params) {
  const parts = Object.entries(params || {}).filter(([, v]) => v !== "" && v !== null && v !== undefined);
  return parts.length
    ? "?" + parts.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")
    : "";
}
async function exportPdf(type, params, fallback) {
  try {
    const name = await download("/api/admin/export" + qs(Object.assign({ type }, params)), fallback);
    toast("PDF siap: " + name, "ok");
  } catch (e) { showError(e); }
}
function shell(title, sub, actions, body) {
  return `<div class="admin-top">
    <div class="row gap-10">
      <button class="icon-btn surface menu-toggle" data-menu-toggle aria-label="Menu">${icon("list", 18)}</button>
      <div><h1>${esc(title)}</h1><div class="sub">${esc(sub)}</div></div>
    </div>
    <div class="admin-actions">${actions || ""}</div>
  </div>
  <div class="admin-grid" data-body>${body}</div>`;
}
function kpi(value, label, sub, iconName, tone) {
  return `<div class="kpi">
    <span class="li-ico ico-${tone}">${icon(iconName, 17)}</span>
    <div style="font-size:24px;font-weight:800;letter-spacing:-.8px;margin-top:10px">${value}</div>
    <div class="kl">${esc(label)}</div>
    ${sub ? `<div class="tiny muted" style="margin-top:6px">${sub}</div>` : ""}
  </div>`;
}
function delta(now, before) {
  const a = Number(now) || 0;
  const b = Number(before) || 0;
  if (!b && !a) return "";
  const diff = a - b;
  const cls = diff >= 0 ? "up" : "down";
  return `<span class="kd ${cls}">${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff)} vs kemarin</span>`;
}
function panel(title, body, headExtra) {
  return `<div class="panel"><div class="panel-head">
    <div class="panel-title">${esc(title)}</div>${headExtra || ""}</div>${body}</div>`;
}
function table(headers, rows, numIndex = []) {
  return `<div class="table-wrap"><table class="tbl">
    <thead><tr>${headers.map((h, i) => `<th class="${numIndex.includes(i) ? "num" : ""}">${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.length ? rows.map((r) => `<tr>${r.map((cell, i) => `<td class="${numIndex.includes(i) ? "num" : ""}">${cell}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${headers.length}" class="center muted" style="padding:26px">Belum ada data.</td></tr>`}</tbody>
  </table></div>`;
}
function field(label, input, hint) {
  return `<div class="field"><label class="label">${esc(label)}</label>${input}${hint ? `<div class="field-hint">${esc(hint)}</div>` : ""}</div>`;
}
function selectHTML(name, options, value, extra) {
  return `<select class="select" name="${name}" ${extra || ""}>${options.map(([val, label]) =>
    `<option value="${esc(val)}" ${String(val) === String(value) ? "selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
}
function branchOptions(selected, withAll) {
  const list = (S.branches || []).map((b) => [b.id, b.nama]);
  if (withAll) list.unshift(["", "Semua cabang"]);
  return selectHTML("branch_id", list, selected || "");
}
function badgeCount(n, tone) {
  return n ? `<span class="chip ${tone || "blue"}">${n}</span>` : "";
}
function activityList(items) {
  if (!items || !items.length) return emptyState("clock", "Belum ada aktivitas", "Aktivitas hari ini akan tampil di sini.");
  return `<div>${items.map((a) => `<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--line)">
    <div class="row gap-10">
      <span class="li-ico ${a.jenis === "stempel" ? "ico-green" : a.jenis === "pulang" ? "ico-purple" : "ico-blue"}"
        style="width:32px;height:32px">${icon(a.jenis === "stempel" ? "sparkles" : a.jenis === "pulang" ? "logout" : "login", 15)}</span>
      <div><div class="strong small">${esc(a.nama)}</div>
        <div class="tiny muted">${esc(a.cabang || "")}${a.shift ? " · " + esc(a.shift) : ""}</div></div>
    </div>
    <div class="right"><div class="tiny strong mono">${esc(a.waktu || "-")}</div>
      ${a.status ? statusPill(a.status) : ""}</div>
  </div>`).join("")}</div>`;
}

/* ------------------------------------------------------------------ PIN gate */
export async function pinPage() {
  const html = `<div class="pin-screen">
    <a class="pin-back" href="#/login" aria-label="Kembali">${icon("arrowLeft", 18)}</a>
    <div class="pin-box">
      <div style="width:66px;height:66px;border-radius:21px;margin:0 auto 16px;background:rgba(255,255,255,.16);
        border:1px solid rgba(255,255,255,.24);display:grid;place-items:center">${icon("shield", 30)}</div>
      <div style="font-size:21px;font-weight:800">Portal Owner</div>
      <div class="small" style="opacity:.74;margin-top:6px">Masukkan PIN untuk membuka data operasional</div>
      <div class="pin-dots" data-dots>${[0, 1, 2, 3].map(() => '<span class="pin-dot"></span>').join("")}</div>
      <div class="pin-hint" data-hint style="min-height:18px"></div>
      <div class="admin-pin-numpad" data-pad>
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-digit="${n}">${n}</button>`).join("")}
        <button data-clear style="font-size:13px">Hapus</button>
        <button data-digit="0">0</button>
        <button data-back aria-label="Backspace">${icon("chevronLeft", 20)}</button>
      </div>
      <div class="small" style="opacity:.55;margin-top:20px;line-height:1.6">
        Sesi berakhir otomatis setelah 30 menit tidak aktif.<br>PIN dikelola owner pada menu Pengaturan.
      </div>
    </div>
  </div>`;

  return {
    html,
    title: "Portal Owner",
    mount(root) {
      let pin = "";
      let busy = false;
      const dots = root.querySelectorAll(".pin-dot");
      const hint = root.querySelector("[data-hint]");
      const paint = () => {
        dots.forEach((d, i) => d.classList.toggle("filled", i < pin.length));
      };
      const submit = async () => {
        if (busy || pin.length < 4) return;
        busy = true;
        hint.textContent = "";
        try {
          const res = await post("/api/admin/pin", { pin });
          setSession({ kind: "admin", admin: { nama: res.nama || "Owner Aroma Jiwa", peran: "admin" } });
          connectStream();
          toast("Selamat datang, " + (res.nama || "Owner") + ".", "ok");
          go("admin/dashboard");
        } catch (e) {
          hint.textContent = e.message;
          hint.style.color = "#FFB4B6";
          pin = "";
          paint();
          const box = root.querySelector(".pin-box");
          box.animate(
            [{ transform: "translateX(0)" }, { transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "translateX(0)" }],
            { duration: 260 }
          );
        } finally {
          busy = false;
        }
      };
      const add = (digit) => {
        if (pin.length >= 8) return;
        pin += digit;
        paint();
        if (pin.length === 4) setTimeout(submit, 120);
      };
      root.querySelectorAll("[data-digit]").forEach((btn) => {
        btn.onclick = () => add(btn.dataset.digit);
      });
      root.querySelector("[data-clear]").onclick = () => { pin = ""; paint(); hint.textContent = ""; };
      root.querySelector("[data-back]").onclick = () => { pin = pin.slice(0, -1); paint(); };
      root.addEventListener("keydown", (event) => {
        if (/^[0-9]$/.test(event.key)) add(event.key);
        else if (event.key === "Backspace") { pin = pin.slice(0, -1); paint(); }
      });
      root.setAttribute("tabindex", "0");
      root.focus();
    },
  };
}

/* ------------------------------------------------------------------ dispatcher */
export async function render(ctx) {
  const slug = String(ctx.name || "admin/dashboard").split("/")[1] || "dashboard";
  const screen = SCREENS[slug] || SCREENS.dashboard;
  const data = await screen.load();
  return screen.view(data);
}

/* ------------------------------------------------------------------ dashboard */
function dashboardView(d) {
  const t = d.today || {};
  const ring = d.ring || {};
  const perf = d.performance || [];
  const body = `
    <div class="g4">
      ${kpi(t.hadir || 0, "Hadir hari ini", `${t.shift || 0} shift · ${delta(t.hadir, d.yesterday && d.yesterday.hadir)}`.replace(" · ", " · ") || "", "users", "blue")}
      ${kpi(t.terlambat || 0, "Terlambat", `${t.belum_checkout || 0} belum check-out`, "alert", "red")}
      ${kpi(d.stamp_today || 0, "Stempel hari ini", `${d.redeem_today || 0} redeem`, "sparkles", "green")}
      ${kpi(d.warnings || 0, "Peringatan baru", `${(d.redeem_requests || []).length} redeem menunggu`, "shield", "gold")}
    </div>
    <div class="g21">
      ${panel("Performa 14 hari", `${areaChart(perf.map((p) => p.tepat), { height: 150 })}
        <div class="chart-legend mt-8" style="justify-content:space-between">
          <span>${icon("checkCircle", 12)} Persen tepat waktu</span>
          <span>${perf.length ? fmtDateShort(perf[0].tanggal) + " – " + fmtDateShort(perf[perf.length - 1].tanggal) : ""}</span>
        </div>`, `<span class="tiny muted">Rata-rata ${perf.length ? Math.round(perf.reduce((a, p) => a + p.tepat, 0) / perf.length) : 0}%</span>`)}
      ${panel("Kehadiran bulan ini", `<div class="row" style="gap:18px;align-items:center">
        <div>${donutSVG(ring.persen_tepat || 0, { size: 116, stroke: 12 })}</div>
        <div class="grow donut-legend">
          <div class="k"><i class="sw" style="width:8px;height:8px;border-radius:3px;background:var(--blue)"></i>Hadir<span class="v">${ring.hadir || 0}</span></div>
          <div class="k"><i class="sw" style="width:8px;height:8px;border-radius:3px;background:var(--late)"></i>Terlambat<span class="v">${ring.telat || 0}</span></div>
          <div class="k"><i class="sw" style="width:8px;height:8px;border-radius:3px;background:var(--line)"></i>Total shift<span class="v">${ring.shift || 0}</span></div>
        </div></div>`)}
    </div>
    <div class="g21">
      ${panel("Kas hari ini", `<div class="g3">
        <div><div class="tiny muted">Masuk</div><div style="font-size:19px;font-weight:800">${fmtRp((d.cash || {}).masuk)}</div></div>
        <div><div class="tiny muted">Keluar</div><div style="font-size:19px;font-weight:800;color:var(--late)">${fmtRp((d.cash || {}).keluar)}</div></div>
        <div><div class="tiny muted">Bersih</div><div style="font-size:19px;font-weight:800;color:var(--ok)">${fmtRp((d.cash || {}).bersih)}</div></div>
      </div>
      <div class="mt-16 flex-end"><button class="btn btn-sm btn-outline" data-kas-pdf>${icon("download", 14)} Laporan kas PDF</button></div>`,
        `<span class="tiny muted">${fmtDateFull(today())}</span>`)}
      ${panel(d.activity_label || "Aktivitas", activityList(d.activity))}
    </div>
    <div class="g3">
      ${panel("Per cabang", `<div>${(d.branches || []).map((b) => `<div style="padding:8px 0;border-bottom:1px solid var(--line)">
        <div class="row-between mb-8"><span class="small strong">${esc(b.nama)}</span>
          <span class="tiny muted">${b.stempel} stempel · ${b.hadir} hadir</span></div>
        ${progressBar(Math.min(100, (b.stempel / Math.max(1, (d.branches || [])[0].stempel || 1)) * 100))}</div>`).join("")}</div>`)}
      ${panel("Streak teratas", `<div>${(d.top_streak || []).map((u, i) => `<div class="row-between" style="padding:7px 0;border-bottom:1px solid var(--line)">
        <div class="row gap-8"><span class="chip ${i === 0 ? "gold" : "blue"}">${i + 1}</span><span class="small strong">${esc(u.nama)}</span></div>
        <span class="small strong">${u.streak} shift</span></div>`).join("")}</div>`)}
      ${panel("Antrean redeem", `${(d.redeem_requests || []).length ? `<div>${d.redeem_requests.map((r) => `<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--line)">
        <div><div class="small strong">${esc(r.member_nama)}</div><div class="tiny muted">${r.jenis === "diskon" ? "Potongan harga" : "Random point"}</div></div>
        <span class="pill khusus">Menunggu</span></div>`).join("")}</div>`
        : emptyState("gift", "Tidak ada antrean", "Semua permintaan redeem sudah dikonfirmasi.")}`)}
    </div>
    ${panel("Audit terbaru", table(["Waktu", "Aktor", "Aksi"],
      (d.audit || []).map((a) => [`<span class="tiny mono">${fmtDateTime(a.waktu)}</span>`, esc(a.aktor), esc(a.aksi)]), []))}`;

  return {
    html: shell("Dashboard", `${fmtDateFull(today())} · Waktu server WIB`, `
      <button class="btn btn-outline btn-sm" data-refresh>${icon("refresh", 15)} Muat ulang</button>
      <button class="btn btn-navy btn-sm" data-pdf>${icon("download", 15)} Ringkasan PDF</button>`, body),
    mount(root) {
      root.querySelector("[data-refresh]").onclick = () => reload();
      root.querySelector("[data-pdf]").onclick = () => exportPdf("ringkasan", { tanggal: today() }, "ringkasan.pdf");
      const kasBtn = root.querySelector("[data-kas-pdf]");
      if (kasBtn) kasBtn.onclick = () => exportPdf("kas", { start: monthStart(), end: today() }, "kas.pdf");
    },
  };
}

/* ------------------------------------------------------------------ absensi */
function absensiBody(d, f) {
  const totals = d.totals || {};
  return `<div class="g4">
    ${kpi(totals.hadir || 0, "Kehadiran", "shift dengan check-in", "checkCircle", "green")}
    ${kpi(totals.terlambat || 0, "Terlambat", "melewati toleransi", "alert", "red")}
    ${kpi(totals.jam || 0, "Jam kerja", "akumulasi periode", "clock", "blue")}
    ${kpi(fmtRp(totals.kas || 0), "Kas akhir shift", `${fmtRp(totals.pengeluaran || 0)} pengeluaran`, "wallet", "gold")}
  </div>
  <div class="panel">
    <div class="admin-actions mb-16">
      <input class="input" type="date" data-f="start" value="${esc(f.start)}" style="height:38px;width:150px">
      <span class="tiny muted">s/d</span>
      <input class="input" type="date" data-f="end" value="${esc(f.end)}" style="height:38px;width:150px">
      ${branchOptions(f.branch_id, true)}
      <select class="select" data-f="user_id" style="min-width:150px">
        <option value="">Semua pegawai</option>
        ${(d.employees || []).map((e) => `<option value="${e.id}" ${String(f.user_id) === String(e.id) ? "selected" : ""}>${esc(e.nama)}</option>`).join("")}
      </select>
      <input class="input" data-f="q" value="${esc(f.q || "")}" placeholder="Cari nama" style="height:38px;width:140px">
      <button class="btn btn-sm btn-primary" data-apply>Terapkan</button>
    </div>
    ${table(["Tanggal", "Pegawai", "Shift", "Masuk", "Pulang", "Telat", "Status", "Kas", ""],
      (d.records || []).map((r) => [
        `<span class="nowrap">${fmtDateShort(r.tanggal)}</span>`,
        `<div class="nm">${esc(r.user_nama || "-")}</div><div class="sub">${esc(r.branch_nama || "")}</div>`,
        `<div class="row gap-6">${shiftMark(r.shift)}<span class="tiny">${esc(r.shift_nama)}</span></div>`,
        r.check_in_jam || "-", r.check_out_jam || "-",
        r.menit_telat ? `<span style="color:var(--late)">${r.menit_telat} m</span>` : "0",
        statusPill(r.status, r.menit_telat),
        `<span class="mono tiny">${fmtRp(r.kas && r.kas.cash ? r.kas.cash : 0)}</span>`,
        `<div class="row-actions">
          <button class="mini-btn" data-edit="${r.id}" aria-label="Ubah">${icon("edit", 14)}</button>
          <button class="mini-btn danger" data-del="${r.id}" aria-label="Hapus">${icon("trash", 14)}</button></div>`,
      ]), [5, 7])}
  </div>`;
}

function absensiEditor(row, d, onDone) {
  const isEdit = !!row;
  const data = row || { tanggal: today(), shift: "pagi", branch_id: (S.branches[0] || {}).id };
  const modal = sheet({
    title: isEdit ? "Ubah data absensi" : "Tambah data absensi",
    sub: "Perubahan tercatat di log audit",
    tall: true,
    body: `<div class="stack">
      ${field("Pegawai", selectHTML("user_id", (d.employees || []).map((e) => [e.id, e.nama]), data.user_id || (d.employees[0] || {}).id))}
      ${field("Cabang", selectHTML("branch_id", (S.branches || []).map((b) => [b.id, b.nama]), data.branch_id))}
      <div class="grid2">
        ${field("Tanggal", `<input class="input" type="date" name="tanggal" value="${esc(data.tanggal)}">`)}
        ${field("Shift", selectHTML("shift", [["pagi", "Pagi"], ["sore", "Sore"], ["fullday", "Full Day"]], data.shift))}
      </div>
      <div class="grid2">
        ${field("Jam masuk", `<input class="input" type="time" name="check_in" value="${data.check_in_jam || ""}">`)}
        ${field("Jam pulang", `<input class="input" type="time" name="check_out" value="${data.check_out_jam || ""}">`)}
      </div>
      <div class="grid2">
        ${field("Tipe check-out", selectHTML("tipe_checkout", [["normal", "Normal"], ["khusus", "Khusus"]], data.tipe_checkout || "normal"))}
        ${field("Kas akhir shift", `<input class="input" name="kas_cash" inputmode="numeric" value="${data.kas && data.kas.cash !== null ? data.kas.cash : ""}" placeholder="0">`)}
      </div>
      <label class="check"><input type="checkbox" name="dispensasi" ${data.dispensasi ? "checked" : ""}> Dispensasi multi-shift (tanpa penalti telat)</label>
      <div class="grid2">
        ${field("Kategori khusus", selectHTML("kategori_khusus", [["", "—"], ["sakit", "Sakit"], ["keluarga", "Keluarga"], ["darurat", "Darurat"], ["lainnya", "Lainnya"]], data.kategori_khusus || ""))}
        ${field("Alasan khusus", `<input class="input" name="alasan_khusus" value="${esc(data.alasan_khusus || "")}" placeholder="Wajib untuk khusus">`)}
      </div>
      ${field("Catatan admin", `<textarea class="textarea" name="catatan_admin" rows="2">${esc(data.catatan_admin || "")}</textarea>`)}
      <div class="field-error" data-err style="display:none"></div>
    </div>`,
    actions: `<button class="btn btn-outline grow" data-close>Batal</button>
      <button class="btn btn-primary grow" data-go>${icon("check", 16)} Simpan</button>`,
  });
  const el = modal.overlay.querySelector(".sheet");
  const err = el.querySelector("[data-err]");
  const btn = el.querySelector("[data-go]");
  btn.onclick = async () => {
    const val = (name) => {
      const node = el.querySelector(`[name="${name}"]`);
      return node ? node.value : "";
    };
    const checked = (name) => {
      const node = el.querySelector(`[name="${name}"]`);
      return node ? node.checked : false;
    };
    const payload = {
      user_id: Number(val("user_id")),
      branch_id: Number(val("branch_id")),
      tanggal: val("tanggal"),
      shift: val("shift"),
      check_in: val("check_in") || null,
      check_out: val("check_out") || null,
      dispensasi: checked("dispensasi"),
      tipe_checkout: val("tipe_checkout"),
      kategori_khusus: val("kategori_khusus") || null,
      alasan_khusus: val("alasan_khusus") || null,
      kas_cash: val("kas_cash") === "" ? null : Number(String(val("kas_cash")).replace(/\D/g, "")),
      catatan_admin: val("catatan_admin"),
    };
    err.style.display = "none";
    setBusy(btn, true);
    try {
      if (isEdit) await patch("/api/admin/attendance/" + row.id, payload);
      else await post("/api/admin/attendance", payload);
      modal.close();
      toast(isEdit ? "Absensi diperbarui." : "Absensi ditambahkan.", "ok");
      onDone();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
      setBusy(btn, false);
    }
  };
}

function absensiView(initial) {
  const now = wib(nowServer());
  let filters = { start: monthStart(), end: today(), branch_id: "", user_id: "", q: "" };
  let data = initial;

  const body = absensiBody(data, filters);

  return {
    html: shell("Absensi", "Editor presensi dengan jejak audit", `
      <button class="btn btn-outline btn-sm" data-pdf>${icon("download", 15)} PDF Absensi</button>
      <button class="btn btn-primary btn-sm" data-add>${icon("plus", 15)} Tambah</button>`, body),
    mount(root) {
      const bodyEl = root.querySelector("[data-body]");
      const bind = () => {
        const apply = bodyEl.querySelector("[data-apply]");
        if (!apply) return;
        apply.onclick = () => {
          filters = {
            start: bodyEl.querySelector('[data-f="start"]').value,
            end: bodyEl.querySelector('[data-f="end"]').value,
            branch_id: bodyEl.querySelector('[data-f="branch_id"]').value,
            user_id: bodyEl.querySelector('[data-f="user_id"]').value,
            q: bodyEl.querySelector('[data-f="q"]').value.trim(),
          };
          load();
        };
        bodyEl.querySelectorAll("[data-edit]").forEach((btn) => {
          btn.onclick = () => {
            const row = data.records.find((r) => String(r.id) === btn.dataset.edit);
            if (row) absensiEditor(row, data, load);
          };
        });
        bodyEl.querySelectorAll("[data-del]").forEach((btn) => {
          btn.onclick = async () => {
            const ok = await confirmSheet({
              title: "Hapus absensi?",
              body: "Data absensi dan laporan kas ikut terhapus. Tindakan ini tercatat di audit.",
              confirm: "Hapus",
              danger: true,
            });
            if (!ok) return;
            try {
              await del("/api/admin/attendance/" + btn.dataset.del);
              toast("Absensi dihapus.", "ok");
              load();
            } catch (e) { showError(e); }
          };
        });
      };
      const load = async () => {
        bodyEl.style.opacity = ".5";
        try {
          const [att, staff] = await Promise.all([
            get("/api/admin/attendance" + qs(filters)),
            get("/api/admin/employees"),
          ]);
          data = Object.assign({}, att, { employees: staff.employees });
          bodyEl.innerHTML = absensiBody(data, filters);
          bodyEl.style.opacity = "1";
          bind();
          bindTop();
        } catch (e) {
          bodyEl.style.opacity = "1";
          showError(e);
        }
      };
      const bindTop = () => {
        root.querySelector("[data-add]").onclick = () => absensiEditor(null, data, load);
      };
      bind();
      bindTop();
      root.querySelector("[data-pdf]").onclick = () => exportPdf("absensi", filters, "absensi.pdf");
    },
  };
}

/* ------------------------------------------------------------------ schedules */
function jadwalBody(d, f) {
  const rows = (d.schedules || []).filter((s) =>
    (!f.branch_id || String(s.branch_id) === String(f.branch_id)) &&
    (!f.start || s.tanggal >= f.start) && (!f.end || s.tanggal <= f.end));
  return `<div class="g4">
    ${kpi(rows.length, "Shift terjadwal", `periode ${fmtDateShort(d.start)} – ${fmtDateShort(d.end)}`, "calendar", "blue")}
    ${kpi((d.employees || []).length, "Pegawai aktif", "dapat ditugaskan", "users", "green")}
    ${kpi((S.branches || []).length, "Cabang", "titik presensi", "mapPin", "gold")}
    ${kpi(rows.filter((s) => s.tanggal === today()).length, "Shift hari ini", fmtDateFull(today()), "clock", "purple")}
  </div>
  <div class="panel">
    <div class="admin-actions mb-16">
      <input class="input" type="date" data-f="start" value="${esc(f.start || d.start)}" style="height:38px;width:150px">
      <span class="tiny muted">s/d</span>
      <input class="input" type="date" data-f="end" value="${esc(f.end || d.end)}" style="height:38px;width:150px">
      ${branchOptions(f.branch_id, true)}
      <button class="btn btn-sm btn-primary" data-apply>Terapkan</button>
    </div>
    ${table(["Tanggal", "Hari", "Shift", "Pegawai", "Cabang", ""],
      rows.slice(0, 120).map((s) => {
        const dt = new Date(s.tanggal + "T00:00:00+07:00");
        return [
          `<span class="nowrap">${fmtDateShort(s.tanggal)}</span>`,
          DAY_SHORT[dt.getDay()],
          `<div class="row gap-6">${shiftMark(s.shift)}<span class="tiny">${esc(shiftName(s.shift))}</span></div>`,
          `<span class="nm">${esc(s.user_nama)}</span>`,
          esc(s.branch_nama),
          `<div class="row-actions"><button class="mini-btn danger" data-del="${s.id}" aria-label="Hapus">${icon("trash", 14)}</button></div>`,
        ];
      }))}
  </div>`;
}

function scheduleEditor(d, onDone) {
  const modal = sheet({
    title: "Tambah jadwal shift",
    sub: "Jadwal muncul di kalender pegawai",
    tall: true,
    body: `<div class="stack">
      ${field("Pegawai", selectHTML("user_id", (d.employees || []).map((e) => [e.id, e.nama]), (d.employees[0] || {}).id))}
      ${field("Tanggal", `<input class="input" type="date" name="tanggal" value="${today()}">`)}
      ${field("Shift", selectHTML("shift", [["pagi", "Pagi (10:00–16:00)"], ["sore", "Sore (15:00–tutup)"], ["fullday", "Full Day (10:00–tutup)"]], "pagi"))}
      ${field("Cabang", selectHTML("branch_id", (S.branches || []).map((b) => [b.id, b.nama]), (S.branches[0] || {}).id))}
      <div class="field-error" data-err style="display:none"></div>
    </div>`,
    actions: `<button class="btn btn-outline grow" data-close>Batal</button>
      <button class="btn btn-primary grow" data-go>${icon("check", 16)} Simpan jadwal</button>`,
  });
  const el = modal.overlay.querySelector(".sheet");
  const err = el.querySelector("[data-err]");
  const btn = el.querySelector("[data-go]");
  btn.onclick = async () => {
    setBusy(btn, true);
    err.style.display = "none";
    try {
      await post("/api/admin/schedules", {
        user_id: Number(el.querySelector('[name="user_id"]').value),
        tanggal: el.querySelector('[name="tanggal"]').value,
        shift: el.querySelector('[name="shift"]').value,
        branch_id: Number(el.querySelector('[name="branch_id"]').value),
      });
      modal.close();
      toast("Jadwal disimpan.", "ok");
      onDone();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
      setBusy(btn, false);
    }
  };
}

function jadwalView(initial) {
  let data = initial;
  let filters = { start: initial.start, end: initial.end, branch_id: "" };
  return {
    html: shell("Jadwal Shift", "Penugasan pegawai per cabang", `
      <button class="btn btn-primary btn-sm" data-add>${icon("plus", 15)} Tambah jadwal</button>`,
      jadwalBody(data, filters)),
    mount(root) {
      const bodyEl = root.querySelector("[data-body]");
      const bind = () => {
        const apply = bodyEl.querySelector("[data-apply]");
        if (!apply) return;
        apply.onclick = async () => {
          filters = {
            start: bodyEl.querySelector('[data-f="start"]').value,
            end: bodyEl.querySelector('[data-f="end"]').value,
            branch_id: bodyEl.querySelector('[data-f="branch_id"]').value,
          };
          data = await get("/api/admin/schedules" + qs(filters));
          bodyEl.innerHTML = jadwalBody(data, filters);
          bind();
        };
        bodyEl.querySelectorAll("[data-del]").forEach((btn) => {
          btn.onclick = async () => {
            const ok = await confirmSheet({ title: "Hapus jadwal?", body: "Shift ini dihapus dari kalender pegawai.", confirm: "Hapus", danger: true });
            if (!ok) return;
            try {
              await del("/api/admin/schedules/" + btn.dataset.del);
              toast("Jadwal dihapus.", "ok");
              data = await get("/api/admin/schedules" + qs(filters));
              bodyEl.innerHTML = jadwalBody(data, filters);
              bind();
            } catch (e) { showError(e); }
          };
        });
      };
      bind();
      root.querySelector("[data-add]").onclick = () => scheduleEditor(data, async () => {
        data = await get("/api/admin/schedules" + qs(filters));
        bodyEl.innerHTML = jadwalBody(data, filters);
        bind();
      });
    },
  };
}

/* ------------------------------------------------------------------ announcements */
const KATEGORI = ["Info Operasional", "Promo", "Peringatan", "Pelatihan", "Maintenance"];

function pengumumanBody(d) {
  const items = d.items || [];
  return `<div class="g4">
    ${kpi(items.length, "Total pengumuman", "semua status", "megaphone", "blue")}
    ${kpi(items.filter((a) => a.sematkan).length, "Disematkan", "tampil paling atas", "star", "gold")}
    ${kpi(items.filter((a) => a.semua).length, "Semua cabang", "penerima penuh", "users", "green")}
    ${kpi(items.length ? Math.round(items.reduce((n, a) => n + a.dibaca_persen, 0) / items.length) + "%" : "0%", "Rata-rata dibaca", "per pengumuman", "eye", "purple")}
  </div>
  <div class="stack">
    ${items.length ? items.map((a) => `<div class="panel">
      <div class="panel-head" style="align-items:flex-start">
        <div>
          <div class="row gap-6 mb-8">
            <span class="chip ${a.sematkan ? "gold" : "blue"}">${esc(a.kategori || "Info")}</span>
            ${a.semua ? '<span class="chip green">Semua cabang</span>' : `<span class="chip purple">${esc(a.branch_nama || "Cabang")}</span>`}
          </div>
          <div class="panel-title">${esc(a.judul)}</div>
          <div class="tiny muted mt-8">${fmtDateTime(a.mulai)}${a.berakhir ? " · s.d. " + fmtDateShort(a.berakhir) : ""}</div>
        </div>
        <div class="row-actions">
          <button class="mini-btn" data-edit="${a.id}" aria-label="Ubah">${icon("edit", 14)}</button>
          <button class="mini-btn danger" data-del="${a.id}" aria-label="Hapus">${icon("trash", 14)}</button>
        </div>
      </div>
      <div class="small muted" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(a.isi || "")}</div>
      <div class="row-between mt-16">
        <div class="row gap-10"><span class="tiny muted">${a.penerima} penerima</span>
          <span class="tiny muted">${a.dibaca} dibaca</span></div>
        <div style="width:130px">${progressBar(a.dibaca_persen)}</div>
      </div>
    </div>`).join("") : emptyState("megaphone", "Belum ada pengumuman", "Buat pengumuman pertama untuk tim.")}
  </div>`;
}

function announcementEditor(item, d, onDone) {
  const isEdit = !!item;
  const modal = sheet({
    title: isEdit ? "Ubah pengumuman" : "Pengumuman baru",
    sub: "Terkirim ke pegawai sesuai cabang",
    tall: true,
    body: `<div class="stack">
      ${field("Judul", `<input class="input" name="judul" maxlength="80" value="${esc(item ? item.judul : "")}" placeholder="Contoh: Stok botol 50 ml menipis">`)}
      ${field("Kategori", selectHTML("kategori", KATEGORI.map((k) => [k, k]), item ? item.kategori : KATEGORI[0]))}
      ${field("Isi", `<textarea class="textarea" name="isi" rows="5" maxlength="2000" placeholder="Tulis instruksi atau informasi…">${esc(item ? item.isi : "")}</textarea>`)}
      <label class="check"><input type="checkbox" name="semua" ${!item || item.semua ? "checked" : ""}> Kirim ke semua cabang</label>
      <div data-branch-wrap style="${!item || item.semua ? "display:none" : ""}">
        ${field("Cabang tujuan", selectHTML("branch_id", (d.branches || []).map((b) => [b.id, b.nama]), item ? item.branch_id : ""))}
      </div>
      <div class="grid2">
        ${field("Mulai", `<input class="input" type="date" name="mulai" value="${item && item.mulai ? item.mulai.slice(0, 10) : today()}">`)}
        ${field("Berakhir", `<input class="input" type="date" name="berakhir" value="${item && item.berakhir ? item.berakhir.slice(0, 10) : ""}">`)}
      </div>
      <label class="check"><input type="checkbox" name="sematkan" ${item && item.sematkan ? "checked" : ""}> Sematkan di atas</label>
      <label class="check"><input type="checkbox" name="kirim_notif" ${!item || item.kirim_notif ? "checked" : ""}> Kirim notifikasi realtime</label>
      <div class="field-error" data-err style="display:none"></div>
    </div>`,
    actions: `<button class="btn btn-outline grow" data-close>Batal</button>
      <button class="btn btn-primary grow" data-go>${icon("megaphone", 16)} ${isEdit ? "Simpan" : "Kirim"}</button>`,
  });
  const el = modal.overlay.querySelector(".sheet");
  const semua = el.querySelector('[name="semua"]');
  const wrap = el.querySelector("[data-branch-wrap]");
  semua.onchange = () => { wrap.style.display = semua.checked ? "none" : ""; };
  const err = el.querySelector("[data-err]");
  const btn = el.querySelector("[data-go]");
  btn.onclick = async () => {
    const val = (n) => (el.querySelector(`[name="${n}"]`) || {}).value || "";
    setBusy(btn, true);
    err.style.display = "none";
    try {
      await post("/api/admin/announcements", {
        id: isEdit ? item.id : undefined,
        judul: val("judul"),
        isi: val("isi"),
        kategori: val("kategori"),
        semua: semua.checked,
        branch_id: semua.checked ? null : Number(val("branch_id")),
        mulai: val("mulai") ? val("mulai") + "T00:00:00" : undefined,
        berakhir: val("berakhir") || null,
        sematkan: el.querySelector('[name="sematkan"]').checked,
        kirim_notif: el.querySelector('[name="kirim_notif"]').checked,
      });
      modal.close();
      toast(isEdit ? "Pengumuman diperbarui." : "Pengumuman dikirim.", "ok");
      onDone();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
      setBusy(btn, false);
    }
  };
}

function pengumumanView(initial) {
  let data = initial;
  return {
    html: shell("Pengumuman", "Informasi dan instruksi untuk tim", `
      <button class="btn btn-primary btn-sm" data-add>${icon("plus", 15)} Buat pengumuman</button>`,
      pengumumanBody(data)),
    mount(root) {
      const bodyEl = root.querySelector("[data-body]");
      const load = async () => {
        data = await get("/api/admin/announcements");
        bodyEl.innerHTML = pengumumanBody(data);
        bind();
      };
      const bind = () => {
        bodyEl.querySelectorAll("[data-edit]").forEach((btn) => {
          btn.onclick = () => {
            const item = data.items.find((a) => String(a.id) === btn.dataset.edit);
            if (item) announcementEditor(item, data, load);
          };
        });
        bodyEl.querySelectorAll("[data-del]").forEach((btn) => {
          btn.onclick = async () => {
            const ok = await confirmSheet({ title: "Hapus pengumuman?", body: "Pengumuman akan hilang dari aplikasi pegawai.", confirm: "Hapus", danger: true });
            if (!ok) return;
            try {
              await del("/api/admin/announcements/" + btn.dataset.del);
              toast("Pengumuman dihapus.", "ok");
              load();
            } catch (e) { showError(e); }
          };
        });
      };
      bind();
      root.querySelector("[data-add]").onclick = () => announcementEditor(null, data, load);
    },
  };
}

/* ------------------------------------------------------------------ warnings */
const WARN_TABS = ["Semua", "Baru", "Ditinjau", "Diabaikan"];

function peringatanBody(d, status) {
  return `<div class="g4">
    ${kpi(d.counts.Baru || 0, "Baru", "perlu ditinjau", "alert", "red")}
    ${kpi(d.counts.Ditinjau || 0, "Ditinjau", "sudah dicek owner", "eye", "blue")}
    ${kpi(d.counts.Diabaikan || 0, "Diabaikan", "tidak perlu tindakan", "checkCircle", "green")}
    ${kpi(d.items.length, "Total tampil", "maksimal 200 data", "shield", "gold")}
  </div>
  <div class="panel">
    <div class="admin-actions mb-16">
      <div class="range-tabs">${WARN_TABS.map((t) => `<button data-tab="${t}" class="${t === status ? "active" : ""}">${t}</button>`).join("")}</div>
      <div class="ml-auto"></div>
    </div>
    <div class="stack">
      ${d.items.length ? d.items.map((w) => `<div class="card flat tight">
        <div class="row-between" style="align-items:flex-start">
          <div>
            <div class="row gap-6 mb-8"><span class="chip ${w.status === "Baru" ? "red" : w.status === "Diabaikan" ? "green" : "blue"}">${esc(w.status)}</span>
              <span class="chip gold">${esc(w.jenis)}</span></div>
            <div class="strong small">${esc((w.bukti || {}).catatan || w.jenis)}</div>
            <div class="tiny muted mt-8">${fmtDateTime(w.waktu)} · ${esc(w.user_nama || w.member_nama || "-")}${w.branch_nama ? " · " + esc(w.branch_nama) : ""}</div>
          </div>
          <div class="row-actions">
            <button class="mini-btn" data-set="${w.id}" data-status="Ditinjau" aria-label="Tinjau">${icon("eye", 14)}</button>
            <button class="mini-btn" data-set="${w.id}" data-status="Diabaikan" aria-label="Abaikan">${icon("check", 14)}</button>
            <button class="mini-btn" data-set="${w.id}" data-status="Baru" aria-label="Baru">${icon("refresh", 14)}</button>
          </div>
        </div>
      </div>`).join("") : emptyState("shield", "Tidak ada peringatan", "Sistem belum menemukan anomali.")}
    </div>
  </div>
  <div class="banner">${icon("info", 16)}<span>Peringatan adalah penanda untuk ditinjau. Sistem tidak memblokir pegawai atau memotong gaji otomatis.</span></div>`;
}

function peringatanView(initial) {
  let data = initial;
  let status = "Semua";
  return {
    html: shell("Peringatan", "Anomali presensi, stempel, dan redeem", `
      <button class="btn btn-outline btn-sm" data-pdf>${icon("download", 15)} PDF peringatan</button>`,
      peringatanBody(data, status)),
    mount(root) {
      const bodyEl = root.querySelector("[data-body]");
      const bind = () => {
        bodyEl.querySelectorAll("[data-tab]").forEach((btn) => {
          btn.onclick = async () => {
            status = btn.dataset.tab;
            data = await get("/api/admin/warnings" + qs({ status }));
            bodyEl.innerHTML = peringatanBody(data, status);
            bind();
          };
        });
        bodyEl.querySelectorAll("[data-set]").forEach((btn) => {
          btn.onclick = async () => {
            try {
              await patch("/api/admin/warnings/" + btn.dataset.set, { status: btn.dataset.status });
              toast("Status peringatan diperbarui.", "ok");
              data = await get("/api/admin/warnings" + qs({ status }));
              bodyEl.innerHTML = peringatanBody(data, status);
              bind();
            } catch (e) { showError(e); }
          };
        });
      };
      bind();
      root.querySelector("[data-pdf]").onclick = () => exportPdf("peringatan", {}, "peringatan.pdf");
    },
  };
}

/* ------------------------------------------------------------------ stock */
const STOCK_TABS = ["Semua", "Baru", "Diproses", "Ditutup"];
const STOCK_TONE = { Menipis: "gold", "Hampir Habis": "orange", Habis: "telat" };

function stokBody(d, status) {
  return `<div class="g4">
    ${kpi(d.counts.Baru || 0, "Laporan baru", "belum diproses", "box", "red")}
    ${kpi((d.items || []).filter((i) => i.tingkat === "Habis").length, "Stok habis", "perlu restock segera", "alert", "gold")}
    ${kpi((d.items || []).filter((i) => i.tingkat === "Hampir Habis").length, "Hampir habis", "sisa tipis", "trendUp", "purple")}
    ${kpi((d.items || []).length, "Total tampil", "laporan stok", "list", "blue")}
  </div>
  <div class="panel">
    <div class="admin-actions mb-16">
      <div class="range-tabs">${STOCK_TABS.map((t) => `<button data-tab="${t}" class="${t === status ? "active" : ""}">${t}</button>`).join("")}</div>
    </div>
    ${table(["Barang", "Cabang", "Tingkat", "Pelapor", "Dibuat", "Status", "Aksi"],
      (d.items || []).map((s) => [
        `<span class="nm">${esc(s.item_nama)}</span>${s.perkiraan_sisa ? `<div class="sub">${esc(s.perkiraan_sisa)}</div>` : ""}`,
        esc(s.branch_nama),
        `<span class="pill ${STOCK_TONE[s.tingkat] || "gold"}">${esc(s.tingkat)}</span>`,
        `<span class="small">${esc(s.pelapor_nama || "-")}</span>${s.jumlah_pelapor > 1 ? `<div class="sub">${s.jumlah_pelapor} pelapor</div>` : ""}`,
        `<span class="tiny">${fmtDateTime(s.dibuat)}</span>`,
        `<span class="pill ${s.status === "Baru" ? "telat" : s.status === "Ditutup" ? "tepat" : "blue"}">${esc(s.status)}</span>`,
        `<div class="row-actions">
          <button class="mini-btn" data-set="${s.id}" data-status="Diproses" aria-label="Proses">${icon("refresh", 14)}</button>
          <button class="mini-btn" data-set="${s.id}" data-status="Ditutup" aria-label="Tutup">${icon("check", 14)}</button>
        </div>`,
      ]))}
  </div>`;
}

function stokView(initial) {
  let data = initial;
  let status = "Semua";
  return {
    html: shell("Laporan Stok", "Laporan barang menipis dari cabang", "", stokBody(data, status)),
    mount(root) {
      const bodyEl = root.querySelector("[data-body]");
      const bind = () => {
        bodyEl.querySelectorAll("[data-tab]").forEach((btn) => {
          btn.onclick = async () => {
            status = btn.dataset.tab;
            data = await get("/api/admin/stock" + qs({ status }));
            bodyEl.innerHTML = stokBody(data, status);
            bind();
          };
        });
        bodyEl.querySelectorAll("[data-set]").forEach((btn) => {
          btn.onclick = async () => {
            try {
              await patch("/api/admin/stock/" + btn.dataset.set, { status: btn.dataset.status });
              toast("Status laporan diperbarui.", "ok");
              data = await get("/api/admin/stock" + qs({ status }));
              bodyEl.innerHTML = stokBody(data, status);
              bind();
            } catch (e) { showError(e); }
          };
        });
      };
      bind();
    },
  };
}

/* ------------------------------------------------------------------ payroll */
function payrollBody(d, periode) {
  const o = d.overview || {};
  const rows = o.pegawai || [];
  const totalUpah = rows.reduce((n, r) => n + (r.total || 0), 0);
  const totalKasbon = (d.advances || []).reduce((n, a) => n + (a.sisa || 0), 0);
  const finalCount = rows.filter((r) => r.status === "Final").length;
  return `<div class="g4">
    ${kpi(fmtRp(totalUpah), "Total gaji bersih", `${finalCount} dari ${rows.length} pegawai final`, "wallet", "blue")}
    ${kpi(rows.length, "Pegawai aktif", `periode ${periode}`, "users", "green")}
    ${kpi(fmtRp(totalKasbon), "Sisa kasbon", `${(d.advances || []).length} pinjaman tercatat`, "receipt", "gold")}
    ${kpi(rows.reduce((n, r) => n + (r.telat || 0), 0), "Total menit telat", "akumulasi periode", "clock", "purple")}
  </div>
  <div class="panel">
    <div class="panel-head">
      <div class="panel-title">Rekap gaji periode</div>
      <div class="admin-actions">
        <input class="input" type="month" data-periode value="${esc(periode)}" style="height:34px;width:150px">
        <button class="btn btn-outline btn-sm" data-pdf>${icon("download", 14)} PDF Gaji</button>
      </div>
    </div>
    ${table(["Pegawai", "Shift", "Jam", "Telat", "Upah", "Kasbon", "Potongan", "Total", "Status", ""],
      rows.map((r) => [
        `<span class="nm">${esc(r.user.nama)}</span><div class="sub">${esc(r.user.hp_mask || "")}</div>`,
        String(r.jumlah_shift), String(r.total_jam), r.telat ? `${r.telat} m` : "0",
        fmtRp(r.upah), fmtRp(r.kasbon), fmtRp(r.potongan_lain),
        `<span class="strong">${fmtRp(r.total)}</span>`,
        `<span class="pill ${r.status === "Final" ? "tepat" : r.status === "Draf" ? "gold" : "libur"}">${esc(r.status)}</span>`,
        `<div class="row-actions">
          <button class="mini-btn" data-pay="${r.user.id}" aria-label="Hitung">${icon("fileText", 14)}</button>
          ${r.payroll_id && r.status === "Final" ? `<button class="mini-btn" data-reopen="${r.payroll_id}" aria-label="Buka kembali">${icon("refresh", 14)}</button>` : ""}
        </div>`,
      ]), [1, 2, 3, 4, 5, 6, 7])}
  </div>
  <div class="g2">
    ${panel("Tarif per shift", `<div class="stack">
      ${kvRow("Shift Pagi", fmtRp((d.rates || {}).pagi))}
      ${kvRow("Shift Sore", fmtRp((d.rates || {}).sore))}
      ${kvRow("Full Day", fmtRp((d.rates || {}).fullday))}
      ${kvRow("Batas potongan", ((d.settings || {}).potongan_maks_persen || 50) + "% dari upah")}
    </div>`, `<button class="mini-btn" data-goto-settings aria-label="Pengaturan">${icon("settings", 14)}</button>`)}
    ${panel("Kasbon aktif", `${(d.advances || []).length ? `<div class="stack">
      ${d.advances.map((a) => `<div class="row-between" style="padding:8px 0;border-bottom:1px solid var(--line)">
        <div><div class="small strong">${esc(a.user_nama)}</div>
          <div class="tiny muted">${fmtRp(a.nominal)} · ${esc(a.skema || "sekali")} · ${fmtDateShort(a.tanggal)}</div></div>
        <div class="right"><div class="small strong">${fmtRp(a.sisa)}</div>
          <div class="tiny muted">sisa</div></div>
      </div>`).join("")}</div>` : emptyState("receipt", "Tidak ada kasbon", "Kasbon pegawai akan tampil di sini.")}`,
      `<button class="btn btn-sm btn-outline" data-add-advance>${icon("plus", 14)} Kasbon</button>`)}
  </div>
  ${panel("Riwayat payroll", table(["Periode", "Pegawai", "Total", "Status", "Diubah", ""],
    (d.history || []).map((h) => [
      `<span class="tiny mono">${esc((h.periode_mulai || "").slice(0, 7))}</span>`,
      esc(h.user_nama), fmtRp(h.total),
      `<span class="pill ${h.status === "Final" ? "tepat" : "gold"}">${esc(h.status)}</span>`,
      `<span class="tiny muted">${h.diubah ? fmtDateTime(h.diubah) : "-"}</span>`,
      h.status === "Final" ? `<button class="mini-btn" data-reopen="${h.id}" aria-label="Buka kembali">${icon("refresh", 14)}</button>` : "",
    ]), [2]))}`;
}

function payrollEditor(row, periode, onDone) {
  const modal = sheet({
    title: "Hitung gaji",
    sub: `${row.user.nama} · periode ${periode}`,
    tall: true,
    body: `<div data-preview><div class="center muted" style="padding:28px">Memuat rincian shift…</div></div>
      <div class="stack mt-16">
        <div class="grid2">
          ${field("Bonus (Rp)", `<input class="input" name="bonus" inputmode="numeric" value="0">`)}
          ${field("Potongan kasbon (Rp)", `<input class="input" name="kasbon" inputmode="numeric" value="0">`)}
        </div>
        <div>
          <label class="label">Potongan lain</label>
          <div class="stack" data-plain></div>
          <button class="btn btn-sm btn-outline mt-8" data-add-plain>${icon("plus", 14)} Tambah potongan</button>
        </div>
        <label class="check"><input type="checkbox" name="konfirmasi"> Konfirmasi owner bila gaji bersih nol atau negatif</label>
        <div class="field-error" data-err style="display:none"></div>
      </div>`,
    actions: `<button class="btn btn-outline grow" data-close>Batal</button>
      <button class="btn btn-outline grow" data-draft>Simpan draf</button>
      <button class="btn btn-primary grow" data-final>Finalisasi</button>`,
  });
  const el = modal.overlay.querySelector(".sheet");
  const previewEl = el.querySelector("[data-preview]");
  const plainWrap = el.querySelector("[data-plain]");
  const err = el.querySelector("[data-err]");
  const bonusEl = el.querySelector('[name="bonus"]');
  const kasbonEl = el.querySelector('[name="kasbon"]');
  let preview = null;

  const money = (v) => Number(String(v || "").replace(/\D/g, "")) || 0;
  const plainRows = () => Array.from(plainWrap.querySelectorAll("[data-plain-row]")).map((row) => ({
    keterangan: row.querySelector('[name="pk"]').value.trim(),
    nominal: money(row.querySelector('[name="pn"]').value),
  })).filter((p) => p.keterangan && p.nominal > 0);
  const refreshTotal = () => {
    if (!preview) return;
    const lain = plainRows().reduce((n, p) => n + p.nominal, 0);
    const total = (preview.upah || 0) + money(bonusEl.value) - lain - money(kasbonEl.value);
    const node = el.querySelector("[data-total]");
    if (node) {
      node.textContent = fmtRp(total);
      node.style.color = total <= 0 ? "var(--late)" : "var(--ok)";
    }
  };
  const addPlain = () => {
    const row = document.createElement("div");
    row.dataset.plainRow = "1";
    row.className = "row gap-8";
    row.style.marginBottom = "8px";
    row.innerHTML = `<input class="input" name="pk" placeholder="Keterangan" style="flex:1;height:38px">
      <input class="input" name="pn" inputmode="numeric" placeholder="0" style="width:120px;height:38px">
      <button class="mini-btn danger" data-rm aria-label="Hapus">${icon("close", 14)}</button>`;
    row.querySelector("[data-rm]").onclick = () => { row.remove(); refreshTotal(); };
    row.querySelectorAll("input").forEach((i) => i.addEventListener("input", refreshTotal));
    plainWrap.appendChild(row);
  };
  el.querySelector("[data-add-plain]").onclick = addPlain;
  [bonusEl, kasbonEl].forEach((i) => i.addEventListener("input", refreshTotal));

  post("/api/admin/payroll/preview", { user_id: row.user.id, periode }).then((p) => {
    preview = p;
    kasbonEl.value = String(p.potongan_kasbon || 0);
    previewEl.innerHTML = `<div class="g3">
        ${kpi(p.jumlah_shift, "Shift", `${p.total_jam} jam kerja`, "calendar", "blue")}
        ${kpi(p.total_telat, "Menit telat", "periode ini", "clock", "red")}
        ${kpi(fmtRp(p.upah), "Upah pokok", `${p.jumlah_shift} shift`, "wallet", "green")}
      </div>
      ${p.shifts.length ? table(["Tanggal", "Shift", "Masuk", "Pulang", "Jam", "Upah"],
        p.shifts.slice(0, 12).map((s) => [
          fmtDateShort(s.tanggal), shiftName(s.shift), s.masuk || "-", s.pulang || "-",
          s.menit ? Math.round(s.menit / 6) / 10 : "0", fmtRp(s.upah),
        ]), [4, 5]) : `<div class="banner">${icon("info", 16)}<span>Belum ada absensi pada periode ini.</span></div>`}
      ${p.kasbon_detail && p.kasbon_detail.length ? `<div class="mt-16"><div class="tiny muted mb-8">Pemotongan kasbon otomatis</div>
        ${p.kasbon_detail.map((a) => `<div class="row-between tiny" style="padding:5px 0"><span>${esc(a.alasan || "Kasbon")}</span>
          <span class="strong">${fmtRp(a.nominal)}</span></div>`).join("")}</div>` : ""}
      <div class="card flat tight mt-16" style="background:var(--bg)">
        <div class="row-between"><span class="small muted">Gaji bersih</span>
          <span style="font-size:22px;font-weight:800" data-total>${fmtRp(p.total)}</span></div>
      </div>
      ${(p.peringatan || []).length ? `<div class="banner warn mt-8">${icon("alert", 16)}<span>${esc(p.peringatan.join(" "))}</span></div>` : ""}`;
    refreshTotal();
  }).catch((e) => {
    previewEl.innerHTML = `<div class="banner warn">${icon("alert", 16)}<span>${esc(e.message)}</span></div>`;
  });

  const save = async (finalize, btn) => {
    if (!preview) return;
    err.style.display = "none";
    setBusy(btn, true);
    try {
      await post("/api/admin/payroll", {
        user_id: row.user.id,
        periode,
        bonus: money(bonusEl.value),
        potongan_lain: plainRows(),
        potongan_kasbon: money(kasbonEl.value),
        konfirmasi_negatif: el.querySelector('[name="konfirmasi"]').checked,
        finalize,
      });
      modal.close();
      toast(finalize ? "Gaji difinalisasi." : "Draf gaji disimpan.", "ok");
      onDone();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
      setBusy(btn, false);
    }
  };
  el.querySelector("[data-draft]").onclick = (event) => save(false, event.currentTarget);
  el.querySelector("[data-final]").onclick = (event) => save(true, event.currentTarget);
}

function advanceEditor(d, onDone) {
  const modal = sheet({
    title: "Catat kasbon",
    sub: "Pemotongan otomatis mengikuti skema",
    body: `<div class="stack">
      ${field("Pegawai", selectHTML("user_id", (d.employees || []).map((e) => [e.id, e.nama]), (d.employees[0] || {}).id))}
      <div class="grid2">
        ${field("Nominal (Rp)", `<input class="input" name="nominal" inputmode="numeric" placeholder="0">`)}
        ${field("Tanggal", `<input class="input" type="date" name="tanggal" value="${today()}">`)}
      </div>
      <div class="grid2">
        ${field("Skema", selectHTML("skema", [["sekali", "Potong sekali"], ["cicilan", "Cicilan"], ["nominal", "Nominal tetap"]], "sekali"))}
        ${field("Jumlah cicilan", `<input class="input" name="cicilan" inputmode="numeric" value="1">`)}
      </div>
      ${field("Alasan", `<input class="input" name="alasan" placeholder="Contoh: kebutuhan keluarga">`)}
      <div class="field-error" data-err style="display:none"></div>
    </div>`,
    actions: `<button class="btn btn-outline grow" data-close>Batal</button>
      <button class="btn btn-primary grow" data-go>${icon("check", 16)} Simpan</button>`,
  });
  const el = modal.overlay.querySelector(".sheet");
  const err = el.querySelector("[data-err]");
  const btn = el.querySelector("[data-go]");
  btn.onclick = async () => {
    setBusy(btn, true);
    err.style.display = "none";
    try {
      await post("/api/admin/advances", {
        user_id: Number(el.querySelector('[name="user_id"]').value),
        nominal: Number(String(el.querySelector('[name="nominal"]').value).replace(/\D/g, "")),
        tanggal: el.querySelector('[name="tanggal"]').value,
        alasan: el.querySelector('[name="alasan"]').value,
        skema: el.querySelector('[name="skema"]').value,
        cicilan: Number(el.querySelector('[name="cicilan"]').value || 1),
      });
      modal.close();
      toast("Kasbon tercatat.", "ok");
      onDone();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
      setBusy(btn, false);
    }
  };
}

function gajiView(initial) {
  let data = initial;
  let periode = (initial.overview || {}).periode || monthValue();
  return {
    html: shell("Gaji & Kasbon", "Perhitungan upah dari absensi aktual", `
      <button class="btn btn-outline btn-sm" data-add-advance>${icon("plus", 15)} Kasbon</button>`,
      payrollBody(data, periode)),
    mount(root) {
      const bodyEl = root.querySelector("[data-body]");
      const load = async () => {
        bodyEl.style.opacity = ".5";
        data = await get("/api/admin/payroll?periode=" + encodeURIComponent(periode));
        bodyEl.style.opacity = "1";
        bodyEl.innerHTML = payrollBody(data, periode);
        bind();
      };
      const bind = () => {
        const month = bodyEl.querySelector("[data-periode]");
        if (!month) return;
        month.onchange = () => { periode = month.value || periode; load(); };
        bodyEl.querySelector("[data-pdf]").onclick = () => exportPdf("gaji", { periode }, "gaji.pdf");
        bodyEl.querySelectorAll("[data-pay]").forEach((btn) => {
          btn.onclick = () => {
            const row = data.overview.pegawai.find((r) => String(r.user.id) === btn.dataset.pay);
            if (row) payrollEditor(row, periode, load);
          };
        });
        bodyEl.querySelectorAll("[data-reopen]").forEach((btn) => {
          btn.onclick = async () => {
            const ok = await confirmSheet({ title: "Buka kembali gaji?", body: "Status kembali menjadi draf dan pemotongan kasbon dibatalkan.", confirm: "Buka kembali" });
            if (!ok) return;
            try {
              await post("/api/admin/payroll/" + btn.dataset.reopen + "/reopen", {});
              toast("Gaji dibuka kembali.", "ok");
              load();
            } catch (e) { showError(e); }
          };
        });
        bodyEl.querySelector("[data-add-advance]").onclick = () => advanceEditor(data, load);
        const gs = bodyEl.querySelector("[data-goto-settings]");
        if (gs) gs.onclick = () => go("admin/pengaturan");
      };
      bind();
      const topAdd = root.querySelector("[data-add-advance]");
      if (topAdd) topAdd.onclick = () => advanceEditor(data, load);
    },
  };
}

/* ------------------------------------------------------------------ ringkasan */
function ringkasanBody(d, tanggal) {
  const t = (d.today || {}).total || {};
  const perBranch = (d.today || {}).per_branch || [];
  const kas = (d.today || {}).kas_per_branch || [];
  const stock = (d.today || {}).stock || [];
  const warn = (d.today || {}).warnings || [];
  const rating = (d.today || {}).rating || {};
  return `<div class="g4">
    ${kpi(t.hadir || 0, "Pegawai hadir", `${t.belum_checkout || 0} belum check-out`, "users", "blue")}
    ${kpi(t.terlambat || 0, "Terlambat", `${t.menit_telat || 0} menit total`, "clock", "red")}
    ${kpi(t.stempel || 0, "Stempel", `${t.redeem || 0} redeem`, "sparkles", "green")}
    ${kpi(fmtRp((t.kas || 0) - (t.pengeluaran || 0)), "Kas bersih", `${fmtRp(t.pengeluaran)} pengeluaran`, "wallet", "gold")}
  </div>
  <div class="panel">
    <div class="panel-head">
      <div class="panel-title">Ringkasan ${fmtDateFull(tanggal)}</div>
      <div class="admin-actions">
        <input class="input" type="date" data-tanggal value="${esc(tanggal)}" style="height:34px">
        <button class="btn btn-sm btn-outline" data-generate>${icon("refresh", 14)} Perbarui</button>
        <button class="btn btn-sm btn-primary" data-pdf>${icon("download", 14)} PDF</button>
      </div>
    </div>
    ${table(["Cabang", "Hadir", "Belum pulang", "Telat", "Khusus", "Stempel", "Redeem", "Kas", "Pengeluaran"],
      perBranch.map((b) => [
        `<span class="nm">${esc(b.branch)}</span>`,
        String((b.hadir || []).length), String((b.belum_checkout || []).length),
        String((b.telat || []).length), String((b.khusus || []).length),
        String(b.stempel || 0), String(b.redeem || 0),
        fmtRp(b.kas || 0), fmtRp(b.pengeluaran || 0),
      ]), [1, 2, 3, 4, 5, 6, 7, 8])}
  </div>
  <div class="g3">
    ${panel("Kas per cabang", `<div class="stack">${kas.map((k) => `<div class="row-between" style="padding:7px 0;border-bottom:1px solid var(--line)">
      <span class="small">${esc(k.branch)}</span><span class="small strong">${fmtRp(k.bersih)}</span></div>`).join("") || '<div class="muted small">Belum ada data kas.</div>'}</div>`)}
    ${panel("Stok menipis", `<div class="stack">${stock.length ? stock.map((s) => `<div class="row-between" style="padding:7px 0;border-bottom:1px solid var(--line)">
      <div><div class="small">${esc(s.item_nama || s.nama || "Barang")}</div>
        <div class="tiny muted">${esc(s.branch_nama || "")}</div></div>
      <span class="pill gold">${esc(s.tingkat || "Menipis")}</span></div>`).join("") : '<div class="muted small">Tidak ada laporan stok.</div>'}</div>`)}
    ${panel("Peringatan & rating", `<div class="stack">
      ${kvRow("Peringatan hari ini", String(t.peringatan || 0))}
      ${kvRow("Rating rata-rata", rating.rata ? rating.rata + " / 5" : "-")}
      ${kvRow("Jumlah rating", String(rating.jumlah || 0))}
      ${kvRow("Member baru", String(t.member_baru || 0))}
    </div>`)}
  </div>
  ${panel("Riwayat ringkasan tersimpan", table(["Tanggal", "Hadir", "Stempel", "Redeem", "Kas bersih", ""],
    (d.items || []).map((s) => {
      const st = (s.data || {}).total || {};
      return [
        `<span class="nowrap">${fmtDateShort(s.tanggal)}</span>`,
        String(st.hadir || 0), String(st.stempel || 0), String(st.redeem || 0),
        fmtRp((st.kas || 0) - (st.pengeluaran || 0)),
        `<button class="mini-btn" data-load="${esc(s.tanggal)}" aria-label="Lihat">${icon("eye", 14)}</button>`,
      ];
    }), [1, 2, 3, 4]))}`;
}

function ringkasanView(initial) {
  let data = initial;
  let tanggal = initial.today ? initial.today.tanggal : today();
  return {
    html: shell("Ringkasan Harian", "Laporan operasional harian untuk owner", "", ringkasanBody(data, tanggal)),
    mount(root) {
      const bodyEl = root.querySelector("[data-body]");
      const load = async (tgl) => {
        bodyEl.style.opacity = ".5";
        try {
          let gen = null;
          if (tgl) gen = await post("/api/admin/summaries", { tanggal: tgl });
          data = await get("/api/admin/summaries");
          if (gen) data.today = gen.data;
          tanggal = tgl || (data.today && data.today.tanggal) || tanggal;
          bodyEl.style.opacity = "1";
          bodyEl.innerHTML = ringkasanBody(data, tanggal);
          bind();
        } catch (e) {
          bodyEl.style.opacity = "1";
          showError(e);
        }
      };
      const bind = () => {
        const input = bodyEl.querySelector("[data-tanggal]");
        if (!input) return;
        bodyEl.querySelector("[data-generate]").onclick = () => load(input.value || today());
        bodyEl.querySelector("[data-pdf]").onclick = () => exportPdf("ringkasan", { tanggal: input.value || today() }, "ringkasan.pdf");
        bodyEl.querySelectorAll("[data-load]").forEach((btn) => {
          btn.onclick = () => load(btn.dataset.load);
        });
      };
      bind();
    },
  };
}

/* ------------------------------------------------------------------ members */
function memberBody(d, q) {
  const items = d.items || [];
  const aktif = items.filter((m) => {
    if (!m.terakhir) return false;
    const span = (nowServer() - new Date(m.terakhir).getTime()) / 86400000;
    return span <= (d.aktif_hari || 30);
  }).length;
  return `<div class="g4">
    ${kpi(d.total || 0, "Total member", "kartu digital aktif", "users", "blue")}
    ${kpi(aktif, "Aktif " + (d.aktif_hari || 30) + " hari", "punya stempel terbaru", "sparkles", "green")}
    ${kpi(items.filter((m) => m.stempel_aktif >= 7).length, "Hampir penuh", "7–8 stempel", "gift", "gold")}
    ${kpi(items.reduce((n, m) => n + (m.total_redeem || 0), 0), "Total redeem", "hadiah terpakai", "award", "purple")}
  </div>
  <div class="panel">
    <div class="admin-actions mb-16">
      <input class="input" data-q value="${esc(q || "")}" placeholder="Cari nama, nomor HP, atau kode" style="height:38px;flex:1;max-width:320px">
      <button class="btn btn-sm btn-primary" data-search>${icon("search", 14)} Cari</button>
      <div class="ml-auto tiny muted">Menampilkan ${items.length} member</div>
    </div>
    ${table(["Member", "Kontak", "Kode", "Stempel", "Total", "Redeem", "Terakhir", ""],
      items.map((m) => [
        `<span class="nm">${esc(m.nama)}</span><div class="sub">${fmtDateShort(m.dibuat)}</div>`,
        `<span class="small">${esc(m.hp || "-")}</span>`,
        `<span class="tiny mono">${esc(m.kode)}</span>`,
        `<span class="chip ${m.stempel_aktif >= 7 ? "gold" : "blue"}">${m.stempel_aktif}/9</span>`,
        String(m.total_stempel || 0), String(m.total_redeem || 0),
        `<span class="tiny muted">${m.terakhir ? fmtDateShort(m.terakhir) : "-"}</span>`,
        `<button class="mini-btn" data-open="${m.id}" aria-label="Detail">${icon("eye", 14)}</button>`,
      ]), [3, 4, 5])}
  </div>`;
}

function memberDetailSheet(id) {
  const modal = sheet({
    title: "Detail member",
    sub: "Memuat data kartu…",
    tall: true,
    body: `<div data-detail><div class="center muted" style="padding:28px">Memuat…</div></div>`,
    actions: `<button class="btn btn-outline grow" data-close>Tutup</button>
      <button class="btn btn-primary grow" data-pdf>${icon("download", 16)} PDF Riwayat</button>`,
  });
  const el = modal.overlay.querySelector(".sheet");
  el.querySelector("[data-pdf]").onclick = () => exportPdf("member", { member_id: id }, "member.pdf");
  get("/api/admin/members/" + id).then((d) => {
    const m = d.member || {};
    const stamps = d.stamps || [];
    el.querySelector(".sheet-sub").textContent = m.nama || "Member";
    el.querySelector("[data-detail]").innerHTML = `
      <div class="g3">
        ${kpi((d.stempel || 0) + "/9", "Stempel aktif", "menuju hadiah", "sparkles", "blue")}
        ${kpi((d.history || []).length, "Total kunjungan", "riwayat stempel", "clock", "green")}
        ${kpi((d.redemptions || []).length, "Redeem", "hadiah diambil", "gift", "gold")}
      </div>
      <div class="stack mt-16">
        ${kvRow("Nama", esc(m.nama || "-"))}
        ${kvRow("Nomor HP", esc(m.hp || "-"))}
        ${kvRow("Kode kartu", `<span class="mono">${esc(m.kode || "-")}</span>`)}
        ${kvRow("Member sejak", m.dibuat ? fmtDateFull(m.dibuat) : "-")}
        ${kvRow("Aroma favorit", (d.favorites || []).length ? esc(d.favorites.map((f) => f.aroma_nama || f.nama || "-").join(", ")) : "-")}
        ${kvRow("Rating terakhir", d.rating ? starsRow(d.rating.bintang) : "-")}
      </div>
      <div class="mt-16">
        <div class="panel-title mb-8">Riwayat stempel</div>
        ${(d.history || []).length ? table(["Waktu", "Cabang", "Pegawai", "Aroma"],
          d.history.slice(0, 10).map((h) => [
            fmtDateTime(h.waktu), esc(h.branch_nama || "-"), esc(h.pegawai_nama || "-"),
            esc(h.aroma_nama || "-"),
          ])) : '<div class="muted small">Belum ada stempel.</div>'}
      </div>
      <div class="mt-16">
        <div class="panel-title mb-8">Redeem</div>
        ${(d.redemptions || []).length ? table(["Waktu", "Hadiah", "Cabang", "Nilai"],
          d.redemptions.map((r) => [
            fmtDateTime(r.waktu), r.jenis === "diskon" ? "Potongan harga" : "Random point",
            esc(r.branch_nama || "-"), r.nilai ? fmtRp(r.nilai) : "-",
          ])) : '<div class="muted small">Belum pernah redeem.</div>'}
      </div>
      <div class="mt-16">
        <div class="panel-title mb-8">Rating & komentar</div>
        ${(d.ratings || []).length ? d.ratings.map((r) => `<div class="card flat tight mb-8">
          <div class="row-between"><div>${starsRow(r.bintang)}</div>
            <span class="tiny muted">${fmtDateShort(r.waktu)}</span></div>
          ${r.komentar ? `<div class="small muted mt-8">${esc(r.komentar)}</div>` : ""}
        </div>`).join("") : '<div class="muted small">Belum ada rating.</div>'}
      </div>`;
  }).catch((e) => {
    el.querySelector("[data-detail]").innerHTML = `<div class="banner warn">${icon("alert", 16)}<span>${esc(e.message)}</span></div>`;
  });
}

function memberView(initial) {
  let data = initial;
  let q = "";
  return {
    html: shell("Data Member", "Kartu loyalitas dan riwayat pelanggan", "", memberBody(data, q)),
    mount(root) {
      const bodyEl = root.querySelector("[data-body]");
      const load = async () => {
        bodyEl.style.opacity = ".5";
        try {
          data = await get("/api/admin/members" + qs({ q }));
          bodyEl.style.opacity = "1";
          bodyEl.innerHTML = memberBody(data, q);
          bind();
        } catch (e) {
          bodyEl.style.opacity = "1";
          showError(e);
        }
      };
      const bind = () => {
        const input = bodyEl.querySelector("[data-q]");
        if (!input) return;
        const submit = () => { q = input.value.trim(); load(); };
        bodyEl.querySelector("[data-search]").onclick = submit;
        input.addEventListener("keydown", (event) => { if (event.key === "Enter") submit(); });
        bodyEl.querySelectorAll("[data-open]").forEach((btn) => {
          btn.onclick = () => memberDetailSheet(btn.dataset.open);
        });
      };
      bind();
    },
  };
}

/* ------------------------------------------------------------------ analytics */
function distRows(distribusi, total, tone) {
  return (distribusi || []).map((b) => `<div class="row gap-10" style="padding:5px 0">
    <span class="tiny strong" style="width:34px">${b.bintang ? "★ " + b.bintang : b.cap + "×"}</span>
    <div class="grow">${progressBar(total ? (b.jumlah / total) * 100 : 0, tone)}</div>
    <span class="tiny muted" style="width:26px;text-align:right">${b.jumlah}</span>
  </div>`).join("");
}

function analitikBody(d, f) {
  const c = d.customer || {};
  const ov = c.overview || {};
  const r = d.rating || {};
  const a = d.aroma || {};
  const hm = c.heatmap || {};
  const growth = c.growth || {};
  const redeem = c.redeem || {};
  const progress = c.progress || {};
  const maxAroma = ((a.top || [])[0] || {}).jumlah || 1;
  return `<div class="panel">
    <div class="admin-actions">
      <input class="input" type="date" data-f="start" value="${esc(f.start)}" style="height:38px;width:148px">
      <span class="tiny muted">s/d</span>
      <input class="input" type="date" data-f="end" value="${esc(f.end)}" style="height:38px;width:148px">
      ${branchOptions(f.branch_id, true)}
      <select class="select" data-f="pegawai_id" style="min-width:150px">
        <option value="">Semua pegawai</option>
        ${(d.employees || []).map((e) => `<option value="${e.id}" ${String(f.pegawai_id) === String(e.id) ? "selected" : ""}>${esc(e.nama)}</option>`).join("")}
      </select>
      <button class="btn btn-sm btn-primary" data-apply>Terapkan</button>
      <div class="ml-auto tiny muted">${fmtDateShort(f.start)} – ${fmtDateShort(f.end)}</div>
    </div>
  </div>
  <div class="g4">
    ${kpi(ov.stamps || 0, "Stempel", `${redeem.total || 0} redeem periode ini`, "sparkles", "blue")}
    ${kpi(ov.new_members || 0, "Member baru", `${ov.total_members || 0} total member`, "users", "green")}
    ${kpi(ov.active_members || 0, "Member aktif", `aktif ${ov.active_days || 30} hari`, "flame", "gold")}
    ${kpi((r.rata || 0) + " / 5", "Rating pelanggan", `${r.total || 0} ulasan · ${r.rendah || 0} rendah`, "star", "purple")}
  </div>
  <div class="g21">
    ${panel("Tren stempel harian", `${areaChart((growth.per_hari || []).map((g) => g.jumlah), { height: 150 })}
      <div class="chart-legend mt-8" style="justify-content:space-between">
        <span>${icon("sparkles", 12)} ${growth.total || 0} stempel tercatat</span>
        <span>Puncak: ${hm.peak && hm.peak.hari ? esc(hm.peak.hari) + " " + pad2(hm.peak.jam) + ":00" : "-"}</span>
      </div>`, `<span class="tiny muted">${ov.stamps_per_member || 0} stempel / member aktif</span>`)}
    ${panel("Jam & hari ramai", `
      <div class="tiny muted mb-8">Stempel per jam</div>
      ${barChart((hm.per_jam || []).map((h) => h.jumlah), (hm.per_jam || []).map((h) => String(h.jam)))}
      <div class="tiny muted mt-16 mb-8">Stempel per hari</div>
      ${barChart((hm.per_hari || []).map((h) => h.jumlah), (hm.per_hari || []).map((h) => h.hari.slice(0, 3)), { color: "#5EDFB0" })}`)}
  </div>
  <div class="g21">
    ${panel("Distribusi rating", `<div class="row" style="gap:18px;align-items:center">
      <div style="text-align:center">
        <div style="font-size:38px;font-weight:800;letter-spacing:-1.5px">${r.rata || 0}</div>
        <div>${starsRow(Math.round(r.rata || 0), 13)}</div>
        <div class="tiny muted mt-8">${r.total || 0} ulasan</div>
      </div>
      <div class="grow">${distRows(r.distribusi, r.total || 1, "")}</div>
    </div>
    <div class="row gap-6 mt-16" style="flex-wrap:wrap">${(r.tags || []).slice(0, 6).map((t) => `<span class="chip blue">${esc(t.tag)} · ${t.jumlah}</span>`).join("") || '<span class="tiny muted">Belum ada tag.</span>'}</div>`)}
    ${panel("Progres kartu member", `
      <div class="g3 mb-16">
        <div><div class="tiny muted">Hampir penuh (7–8)</div><div style="font-size:20px;font-weight:800">${progress.hampir || 0}</div></div>
        <div><div class="tiny muted">Member aktif</div><div style="font-size:20px;font-weight:800">${ov.active_members || 0}</div></div>
        <div><div class="tiny muted">Tidak aktif</div><div style="font-size:20px;font-weight:800">${ov.inactive_members || 0}</div></div>
      </div>
      ${distRows(progress.distribusi, Math.max(1, ov.total_members || 1), "green")}`)}
  </div>
  <div class="g21">
    ${panel("Aroma terpopuler", `${(a.top || []).length ? `<div class="stack">${a.top.map((t, i) => `<div>
      <div class="row-between mb-8"><span class="small strong">${i + 1}. ${esc(t.nama)}</span>
        <span class="tiny muted">${t.jumlah} transaksi</span></div>
      ${progressBar((t.jumlah / maxAroma) * 100)}</div>`).join("")}</div>` : emptyState("bottle", "Belum ada data", "Catat pembelian aroma dari kasir.")}`,
      `<span class="tiny muted">${a.pencatatan || 0}/${a.total_stempel || 0} tercatat</span>`)}
    ${panel("Kategori & ukuran", `<div class="g2">
      <div><div class="tiny muted mb-8">Kategori</div>
        ${(a.kategori || []).map((k) => kvRow(k.nama, String(k.jumlah))).join("") || '<div class="muted small">-</div>'}</div>
      <div><div class="tiny muted mb-8">Ukuran botol</div>
        ${(a.ukuran || []).map((k) => kvRow(k.nama, String(k.jumlah))).join("") || '<div class="muted small">-</div>'}</div>
    </div>
    <div class="banner mt-16">${icon("info", 16)}<span>${a.tanpa_catatan || 0} stempel belum dicatat aromanya.</span></div>`)}
  </div>
  <div class="g2">
    ${panel("Performa pegawai (rating)", table(["Pegawai", "Ulasan", "Rata-rata", "Tampil"],
      (r.pegawai || []).map((e) => [
        esc(e.nama || "-"), String(e.total || 0),
        `<span class="row gap-6">${starsRow(Math.round(e.rata || 0), 11)}<span class="tiny muted">${e.rata}</span></span>`,
        e.tampil ? '<span class="chip green">Publik</span>' : '<span class="chip gold">Min. 5 ulasan</span>',
      ]), [1, 2]))}
    ${panel("Perbandingan cabang", table(["Cabang", "Stempel", "Redeem", "Hadir"],
      (c.branches || []).map((b) => [esc(b.nama), String(b.stempel || 0), String(b.redeem || 0), String(b.hadir || 0)]),
      [1, 2, 3]))}
  </div>
  ${panel("Komentar pelanggan", `${(r.komentar || []).length ? `<div class="stack">${r.komentar.map((k) => `<div class="card flat tight">
    <div class="row-between"><div class="row gap-8">${starsRow(k.bintang, 12)}
      <span class="tiny muted">${esc(k.member || "Member")} · ${esc(k.branch || "")}</span></div>
      <span class="tiny muted">${fmtDateShort(k.waktu)}</span></div>
    <div class="small mt-8">${esc(k.komentar)}</div>
    ${k.pegawai ? `<div class="tiny muted mt-8">Dilayani ${esc(k.pegawai)}</div>` : ""}
  </div>`).join("")}</div>` : emptyState("star", "Belum ada komentar", "Komentar pelanggan tampil setelah rating dikirim.")}`)}
  ${panel("Member paling aktif", table(["Member", "Kontak", "Stempel periode", "Redeem", "Terakhir"],
    (c.members || []).slice(0, 12).map((m) => [
      `<span class="nm">${esc(m.nama)}</span>${m.aktif ? '<span class="chip green" style="margin-left:6px">Aktif</span>' : ""}`,
      esc(m.hp || "-"), String(m.stempel_periode || 0), String(m.redeem || 0),
      m.terakhir ? fmtDateShort(m.terakhir) : "-",
    ]), [2, 3]))}`;
}

function analitikView(initial) {
  let data = initial;
  let filters = { start: monthStart(), end: today(), branch_id: "", pegawai_id: "" };
  return {
    html: shell("Analitik", "Perilaku pelanggan, rating, dan aroma", `
      <button class="btn btn-outline btn-sm" data-pdf>${icon("download", 15)} PDF Analitik</button>`,
      analitikBody(data, filters)),
    mount(root) {
      const bodyEl = root.querySelector("[data-body]");
      const load = async () => {
        bodyEl.style.opacity = ".5";
        try {
          data = await get("/api/admin/analytics" + qs(filters));
          bodyEl.style.opacity = "1";
          bodyEl.innerHTML = analitikBody(data, filters);
          bind();
        } catch (e) {
          bodyEl.style.opacity = "1";
          showError(e);
        }
      };
      const bind = () => {
        const apply = bodyEl.querySelector("[data-apply]");
        if (!apply) return;
        apply.onclick = () => {
          filters = {
            start: bodyEl.querySelector('[data-f="start"]').value,
            end: bodyEl.querySelector('[data-f="end"]').value,
            branch_id: bodyEl.querySelector('[data-f="branch_id"]').value,
            pegawai_id: bodyEl.querySelector('[data-f="pegawai_id"]').value,
          };
          load();
        };
      };
      bind();
      root.querySelector("[data-pdf]").onclick = () => exportPdf("analitik", {
        start: filters.start, end: filters.end, branch_id: filters.branch_id,
      }, "analitik.pdf");
    },
  };
}

/* ------------------------------------------------------------------ catalog */
const AROMA_CATS = ["Floral", "Sweet", "Woody", "Fresh", "Oriental"];
const ITEM_CATS = ["Botol", "Kemasan", "Label", "Perlengkapan", "Bibit"];

function aromaEditor(item, onDone) {
  const isEdit = !!item;
  const modal = sheet({
    title: isEdit ? "Ubah aroma" : "Aroma baru",
    sub: "Data katalog dipakai saat stempel member",
    body: `<div class="stack">
      ${field("Nama aroma", `<input class="input" name="nama" value="${esc(item ? item.nama : "")}" placeholder="Contoh: Sakura Bloom">`)}
      <div class="grid2">
        ${field("Kategori", selectHTML("kategori", AROMA_CATS.map((c) => [c, c]), item ? item.kategori : AROMA_CATS[0]))}
        ${field("Harga (Rp)", `<input class="input" name="harga" inputmode="numeric" value="${item ? item.harga : 35000}">`)}
      </div>
      ${field("Deskripsi", `<textarea class="textarea" name="deskripsi" rows="2">${esc(item ? item.deskripsi || "" : "")}</textarea>`)}
      <label class="check"><input type="checkbox" name="aktif" ${!item || item.aktif ? "checked" : ""}> Tampil di pilihan pegawai</label>
      <div class="field-error" data-err style="display:none"></div>
    </div>`,
    actions: `<button class="btn btn-outline grow" data-close>Batal</button>
      <button class="btn btn-primary grow" data-go>${icon("check", 16)} Simpan</button>`,
  });
  const el = modal.overlay.querySelector(".sheet");
  const err = el.querySelector("[data-err]");
  const btn = el.querySelector("[data-go]");
  btn.onclick = async () => {
    setBusy(btn, true);
    err.style.display = "none";
    try {
      await post("/api/admin/aroma", {
        id: isEdit ? item.id : undefined,
        nama: el.querySelector('[name="nama"]').value,
        kategori: el.querySelector('[name="kategori"]').value,
        harga: Number(String(el.querySelector('[name="harga"]').value).replace(/\D/g, "")),
        deskripsi: el.querySelector('[name="deskripsi"]').value,
        aktif: el.querySelector('[name="aktif"]').checked,
      });
      modal.close();
      toast("Katalog aroma diperbarui.", "ok");
      onDone();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
      setBusy(btn, false);
    }
  };
}

function itemEditor(item, onDone) {
  const isEdit = !!item;
  const modal = sheet({
    title: isEdit ? "Ubah barang" : "Barang inventaris baru",
    sub: "Dipakai pada laporan stok cabang",
    body: `<div class="stack">
      ${field("Nama barang", `<input class="input" name="nama" value="${esc(item ? item.nama : "")}" placeholder="Contoh: Botol Kaca 50 ml">`)}
      <div class="grid2">
        ${field("Kategori", selectHTML("kategori", ITEM_CATS.map((c) => [c, c]), item ? item.kategori : ITEM_CATS[0]))}
        ${field("Satuan", `<input class="input" name="satuan" value="${esc(item ? item.satuan || "pcs" : "pcs")}">`)}
      </div>
      ${field("Batas minimum", `<input class="input" name="batas" inputmode="numeric" value="${item && item.batas ? item.batas : 5}">`, "Peringatan muncul saat sisa di bawah batas.")}
      <label class="check"><input type="checkbox" name="aktif" ${!item || item.aktif ? "checked" : ""}> Aktif</label>
      <div class="field-error" data-err style="display:none"></div>
    </div>`,
    actions: `<button class="btn btn-outline grow" data-close>Batal</button>
      <button class="btn btn-primary grow" data-go>${icon("check", 16)} Simpan</button>`,
  });
  const el = modal.overlay.querySelector(".sheet");
  const err = el.querySelector("[data-err]");
  const btn = el.querySelector("[data-go]");
  btn.onclick = async () => {
    setBusy(btn, true);
    err.style.display = "none";
    try {
      await post("/api/admin/items", {
        id: isEdit ? item.id : undefined,
        nama: el.querySelector('[name="nama"]').value,
        kategori: el.querySelector('[name="kategori"]').value,
        satuan: el.querySelector('[name="satuan"]').value,
        batas: Number(el.querySelector('[name="batas"]').value || 0),
        aktif: el.querySelector('[name="aktif"]').checked,
      });
      modal.close();
      toast("Inventaris diperbarui.", "ok");
      onDone();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
      setBusy(btn, false);
    }
  };
}

function katalogBody(d) {
  const aroma = d.aroma || [];
  const inv = d.inventory || [];
  const cats = Array.from(new Set(aroma.map((a) => a.kategori)));
  return `<div class="g4">
    ${kpi(aroma.filter((a) => a.aktif).length, "Aroma aktif", `${aroma.length} total aroma`, "bottle", "blue")}
    ${kpi(cats.length, "Kategori aroma", cats.join(", ") || "-", "tag", "green")}
    ${kpi(inv.length, "Barang inventaris", `${inv.filter((i) => i.aktif).length} aktif`, "box", "gold")}
    ${kpi(inv.filter((i) => i.batas > 0).length, "Barang berbatas", "memicu laporan stok", "alert", "purple")}
  </div>
  <div class="g2">
    ${panel("Katalog aroma", table(["Aroma", "Kategori", "Harga", "Status", ""],
      aroma.map((a) => [
        `<span class="nm">${esc(a.nama)}</span>${a.deskripsi ? `<div class="sub">${esc(a.deskripsi.slice(0, 42))}</div>` : ""}`,
        `<span class="chip blue">${esc(a.kategori)}</span>`,
        fmtRp(a.harga), a.aktif ? '<span class="pill tepat">Aktif</span>' : '<span class="pill libur">Nonaktif</span>',
        `<button class="mini-btn" data-aroma="${a.id}" aria-label="Ubah">${icon("edit", 14)}</button>`,
      ]), [2]), `<button class="btn btn-sm btn-primary" data-add-aroma>${icon("plus", 14)} Aroma</button>`)}
    ${panel("Barang inventaris", table(["Barang", "Kategori", "Satuan", "Batas", ""],
      inv.map((i) => [
        `<span class="nm">${esc(i.nama)}</span>`,
        `<span class="tiny muted">${esc(i.kategori || "-")}</span>`,
        esc(i.satuan || "-"), i.batas ? String(i.batas) : "-",
        `<button class="mini-btn" data-item="${i.id}" aria-label="Ubah">${icon("edit", 14)}</button>`,
      ]), [3]), `<button class="btn btn-sm btn-primary" data-add-item>${icon("plus", 14)} Barang</button>`)}
  </div>`;
}

function katalogView(initial) {
  let data = initial;
  return {
    html: shell("Katalog Aroma", "Katalog parfum dan barang inventaris", "", katalogBody(data)),
    mount(root) {
      const bodyEl = root.querySelector("[data-body]");
      const load = async () => {
        data = await get("/api/admin/catalog");
        bodyEl.innerHTML = katalogBody(data);
        bind();
      };
      const bind = () => {
        const addAroma = bodyEl.querySelector("[data-add-aroma]");
        if (!addAroma) return;
        addAroma.onclick = () => aromaEditor(null, load);
        bodyEl.querySelector("[data-add-item]").onclick = () => itemEditor(null, load);
        bodyEl.querySelectorAll("[data-aroma]").forEach((btn) => {
          btn.onclick = () => {
            const item = (data.aroma || []).find((a) => String(a.id) === btn.dataset.aroma);
            if (item) aromaEditor(item, load);
          };
        });
        bodyEl.querySelectorAll("[data-item]").forEach((btn) => {
          btn.onclick = () => {
            const item = (data.inventory || []).find((i) => String(i.id) === btn.dataset.item);
            if (item) itemEditor(item, load);
          };
        });
      };
      bind();
    },
  };
}

/* ------------------------------------------------------------------ branches */
function branchCard(b) {
  return `<div class="panel">
    <div class="panel-head" style="align-items:flex-start">
      <div>
        <div class="row gap-6 mb-8"><span class="chip ${b.aktif ? "green" : "gold"}">${b.aktif ? "Aktif" : "Nonaktif"}</span>
          <span class="chip blue">${esc(b.brand || "Aroma Jiwa")}</span></div>
        <div class="panel-title">${esc(b.nama)}</div>
        <div class="tiny muted mt-8">${esc(b.alamat || "Alamat belum diisi")}</div>
      </div>
      <div class="row-actions">
        <button class="mini-btn" data-edit="${b.id}" aria-label="Ubah">${icon("edit", 14)}</button>
      </div>
    </div>
    <div class="g3 mt-16">
      <div><div class="tiny muted">Radius</div><div class="strong">${b.radius} m</div></div>
      <div><div class="tiny muted">Jam tutup</div><div class="strong">${esc(b.jam_tutup || "-")}</div></div>
      <div><div class="tiny muted">Hadir hari ini</div><div class="strong">${b.hadir_hari_ini || 0}</div></div>
    </div>
    <div class="row-between mt-16">
      <span class="tiny muted mono">${Number(b.lat).toFixed(5)}, ${Number(b.lng).toFixed(5)} · ${b.stempel_hari_ini || 0} stempel</span>
      <a class="btn btn-sm btn-outline" href="https://maps.google.com/?q=${b.lat},${b.lng}" target="_blank" rel="noopener">
        ${icon("mapPin", 14)} Peta</a>
    </div>
  </div>`;
}

function cabangBody(d) {
  const rows = d.branches || [];
  return `<div class="g4">
    ${kpi(rows.length, "Total cabang", `${rows.filter((b) => b.aktif).length} aktif`, "mapPin", "blue")}
    ${kpi(rows.reduce((n, b) => n + (b.hadir_hari_ini || 0), 0), "Hadir hari ini", "semua cabang", "users", "green")}
    ${kpi(rows.reduce((n, b) => n + (b.stempel_hari_ini || 0), 0), "Stempel hari ini", "lintas cabang", "sparkles", "gold")}
    ${kpi((d.radius_default || 50) + " m", "Radius default", "geofence standar", "shield", "purple")}
  </div>
  <div class="g2">${rows.map(branchCard).join("")}</div>
  <div class="banner">${icon("info", 16)}<span>Radius 20–200 meter. Pegawai hanya bisa presensi di dalam radius cabang yang ditugaskan.</span></div>`;
}

function branchEditor(item, d, onDone) {
  const isEdit = !!item;
  const modal = sheet({
    title: isEdit ? "Ubah cabang" : "Cabang baru",
    sub: "Titik geofence presensi",
    tall: true,
    body: `<div class="stack">
      ${field("Nama cabang", `<input class="input" name="nama" value="${esc(item ? item.nama : "")}" placeholder="Aroma Jiwa ...">`)}
      ${field("Brand", `<input class="input" name="brand" value="${esc(item ? item.brand || "Aroma Jiwa" : "Aroma Jiwa")}">`)}
      ${field("Alamat", `<textarea class="textarea" name="alamat" rows="2">${esc(item ? item.alamat || "" : "")}</textarea>`)}
      <div class="grid2">
        ${field("Latitude", `<input class="input" name="lat" value="${item ? item.lat : ""}" placeholder="-7.888900">`)}
        ${field("Longitude", `<input class="input" name="lng" value="${item ? item.lng : ""}" placeholder="110.324100">`)}
      </div>
      <button class="btn btn-sm btn-outline" data-locate>${icon("mapPin", 14)} Gunakan lokasi saya</button>
      <div class="grid2">
        ${field("Radius (20–200 m)", `<input class="input" name="radius" inputmode="numeric" value="${item ? item.radius : d.radius_default || 50}">`)}
        ${field("Jam tutup", `<input class="input" type="time" name="jam_tutup" value="${esc(item ? item.jam_tutup || "20:30" : "20:30")}">`)}
      </div>
      <label class="check"><input type="checkbox" name="aktif" ${!item || item.aktif ? "checked" : ""}> Cabang aktif</label>
      <div class="field-error" data-err style="display:none"></div>
    </div>`,
    actions: `<button class="btn btn-outline grow" data-close>Batal</button>
      <button class="btn btn-primary grow" data-go>${icon("check", 16)} Simpan</button>`,
  });
  const el = modal.overlay.querySelector(".sheet");
  const err = el.querySelector("[data-err]");
  const btn = el.querySelector("[data-go]");
  el.querySelector("[data-locate]").onclick = async () => {
    const pos = await locate(12000);
    if (!pos) { toast("Gagal mengambil lokasi. Isi koordinat manual bila perlu.", "warn"); return; }
    el.querySelector('[name="lat"]').value = pos.lat.toFixed(6);
    el.querySelector('[name="lng"]').value = pos.lng.toFixed(6);
    toast("Koordinat terisi dari lokasi perangkat.", "ok");
  };
  btn.onclick = async () => {
    setBusy(btn, true);
    err.style.display = "none";
    try {
      await post("/api/admin/branches", {
        id: isEdit ? item.id : undefined,
        nama: el.querySelector('[name="nama"]').value,
        brand: el.querySelector('[name="brand"]').value,
        alamat: el.querySelector('[name="alamat"]').value,
        lat: el.querySelector('[name="lat"]').value,
        lng: el.querySelector('[name="lng"]').value,
        radius: Number(el.querySelector('[name="radius"]').value || 50),
        jam_tutup: el.querySelector('[name="jam_tutup"]').value,
        aktif: el.querySelector('[name="aktif"]').checked,
      });
      modal.close();
      toast("Cabang disimpan.", "ok");
      if (typeof onDone === "function") onDone();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
      setBusy(btn, false);
    }
  };
}

function cabangView(initial) {
  let data = initial;
  return {
    html: shell("Cabang & Geofence", "Titik presensi dan radius kehadiran", `
      <button class="btn btn-primary btn-sm" data-add>${icon("plus", 15)} Cabang</button>`,
      cabangBody(data)),
    mount(root) {
      const bodyEl = root.querySelector("[data-body]");
      const load = async () => {
        data = await get("/api/admin/branches");
        bodyEl.innerHTML = cabangBody(data);
        bind();
      };
      const bind = () => {
        bodyEl.querySelectorAll("[data-edit]").forEach((btn) => {
          btn.onclick = () => {
            const item = (data.branches || []).find((b) => String(b.id) === btn.dataset.edit);
            if (item) branchEditor(item, data, load);
          };
        });
      };
      bind();
      root.querySelector("[data-add]").onclick = () => branchEditor(null, data, load);
    },
  };
}

/* ------------------------------------------------------------------ settings */
const SET_TOGGLES = [
  ["fitur_lencana", "Lencana & pencapaian", "Tampilkan lencana pegawai"],
  ["fitur_pengumuman", "Pengumuman", "Kirim pengumuman ke pegawai"],
  ["fitur_pengingat_stempel", "Pengingat stempel", "Notifikasi member"],
  ["fitur_rating", "Rating pelanggan", "Minta rating setelah stempel"],
  ["demo_mode", "Mode demo", "Tampilkan kode OTP pada layar"],
];

function settingInput(key, label, hint, value) {
  return `<div class="field"><label class="label">${esc(label)}</label>
    <input class="input" data-s="${key}" inputmode="numeric" value="${esc(value)}">
    ${hint ? `<div class="field-hint">${esc(hint)}</div>` : ""}</div>`;
}

function pengaturanBody(d) {
  const s = d.settings || {};
  const sessions = d.sessions || [];
  return `<div class="g4">
    ${kpi(s.toleransi_menit || 0, "Toleransi telat", "menit", "clock", "blue")}
    ${kpi(s.radius_default || 50, "Radius default", "meter", "mapPin", "green")}
    ${kpi(fmtRp(s.diskon_redeem || 0), "Diskon redeem", "per kartu penuh", "gift", "gold")}
    ${kpi(sessions.length, "Sesi pegawai", "perangkat aktif", "shield", "purple")}
  </div>
  <div class="g2">
    ${panel("Operasional & tarif", `<div class="stack">
      ${settingInput("toleransi_menit", "Toleransi telat (menit)", "0 berarti telat dihitung tepat waktu", s.toleransi_menit)}
      ${settingInput("radius_default", "Radius geofence default (m)", "20–200 meter", s.radius_default)}
      <div class="grid2">
        ${settingInput("rate_pagi", "Tarif pagi (Rp)", "", s.rate_pagi)}
        ${settingInput("rate_sore", "Tarif sore (Rp)", "", s.rate_sore)}
      </div>
      <div class="grid2">
        ${settingInput("rate_fullday", "Tarif full day (Rp)", "", s.rate_fullday)}
        ${settingInput("potongan_maks_persen", "Batas potongan (%)", "", s.potongan_maks_persen)}
      </div>
      <div class="grid2">
        ${field("Jam tutup default", `<input class="input" type="time" data-s="jam_tutup_default" value="${esc(s.jam_tutup_default || "20:30")}">`)}
        ${field("Jam ringkasan harian", `<input class="input" type="time" data-s="ringkasan_jam" value="${esc(s.ringkasan_jam || "21:30")}">`)}
      </div>
      <div class="grid2">
        ${settingInput("reminder_shift_menit", "Pengingat shift (menit)", "", s.reminder_shift_menit)}
        ${settingInput("reminder_checkin_menit", "Pengingat check-in (menit)", "", s.reminder_checkin_menit)}
        ${settingInput("reminder_checkout_menit", "Pengingat check-out (menit)", "", s.reminder_checkout_menit)}
      </div>
    </div>`)}
    ${panel("Loyalty & keamanan", `<div class="stack">
      <div class="grid2">
        ${settingInput("diskon_redeem", "Diskon redeem (Rp)", "", s.diskon_redeem)}
        ${settingInput("poin_random_min", "Poin random min", "", s.poin_random_min)}
      </div>
      <div class="grid2">
        ${settingInput("poin_random_max", "Poin random max", "", s.poin_random_max)}
        ${settingInput("member_aktif_hari", "Member aktif (hari)", "", s.member_aktif_hari)}
      </div>
      <div class="grid2">
        ${settingInput("stamp_per_jam", "Stempel / jam", "", s.stamp_per_jam)}
        ${settingInput("stamp_member_per_hari", "Stempel / member / hari", "", s.stamp_member_per_hari)}
      </div>
      <div class="grid2">
        ${settingInput("stamp_manual_per_hari", "Stempel manual / hari", "", s.stamp_manual_per_hari)}
        ${settingInput("stamp_gap_detik", "Jeda stempel (detik)", "", s.stamp_gap_detik)}
      </div>
      <div class="grid2">
        ${settingInput("maks_akun", "Maks akun perangkat", "", s.maks_akun)}
        ${settingInput("sesi_hari", "Masa sesi (hari)", "", s.sesi_hari)}
      </div>
      ${field("Ambang peringatan", `<input class="input" data-s="stamp_thresholds" value="${esc(s.stamp_thresholds || "7,8,9")}">`, "Daftar persen cap stempel, pisahkan dengan koma.")}
      <div class="grid2">
        ${settingInput("telat_per_7hari", "Telat / 7 hari", "", s.telat_per_7hari)}
        ${settingInput("khusus_per_14hari", "Khusus / 14 hari", "", s.khusus_per_14hari)}
      </div>
      ${settingInput("geofence_gagal_per_hari", "Geofence gagal / hari", "", s.geofence_gagal_per_hari)}
    </div>`)}
  </div>
  <div class="g2">
    ${panel("Fitur aplikasi", `<div>${SET_TOGGLES.map(([key, title, sub]) => `
      <div class="row-between" style="padding:10px 0;border-bottom:1px solid var(--line)">
        <div class="grow"><div class="strong small">${esc(title)}</div><div class="tiny muted">${esc(sub)}</div></div>
        <button class="switch ${String(s[key]) === "1" ? "on" : ""}" data-t="${key}" aria-label="${esc(title)}"></button>
      </div>`).join("")}</div>`)}
    ${panel("Keamanan portal", `<div class="stack">
      ${field("PIN baru", `<input class="input" name="pin" inputmode="numeric" maxlength="6" placeholder="4–6 angka">`)}
      ${field("Ulangi PIN", `<input class="input" name="pin2" inputmode="numeric" maxlength="6" placeholder="Ulangi PIN">`)}
      <button class="btn btn-navy" data-pin>${icon("lock", 15)} Ubah PIN portal</button>
      <div class="banner">${icon("info", 16)}<span>PIN hanya tersimpan sebagai hash. Sesi admin berakhir otomatis setelah 30 menit tidak aktif.</span></div>
    </div>`)}
  </div>
  ${panel("Perangkat & sesi pegawai", table(["Pegawai", "Perangkat", "Terakhir aktif", "Kedaluwarsa"],
    sessions.map((s2) => [
      `<span class="nm">${esc(s2.user_nama || "-")}</span>`,
      `<span class="tiny mono">${esc((s2.device_id || "-").slice(0, 18))}</span>`,
      `<span class="tiny">${s2.terakhir ? fmtDateTime(s2.terakhir) : "-"}</span>`,
      `<span class="tiny muted">${s2.kedaluwarsa ? fmtDateShort(s2.kedaluwarsa) : "-"}</span>`,
    ]), []), `<span class="tiny muted">${sessions.length} sesi</span>`)}`;
}

function pengaturanView(initial) {
  let data = initial;
  return {
    html: shell("Pengaturan", "Konfigurasi operasional, loyalitas, dan keamanan", `
      <button class="btn btn-primary btn-sm" data-save>${icon("check", 15)} Simpan pengaturan</button>`,
      pengaturanBody(data)),
    mount(root) {
      const bodyEl = root.querySelector("[data-body]");
      bodyEl.querySelectorAll("[data-t]").forEach((btn) => {
        btn.onclick = () => btn.classList.toggle("on");
      });
      const save = async (btn) => {
        const payload = {};
        bodyEl.querySelectorAll("[data-s]").forEach((input) => {
          const key = input.dataset.s;
          const raw = input.value.trim();
          payload[key] = /^(rate_|toleransi|radius|reminder|potongan|stamp_|cari_|geofence|telat_|khusus_|member_|maks_|sesi_|poin_|diskon_)/.test(key) && raw !== "" && key !== "stamp_thresholds"
            ? Number(raw.replace(/\D/g, ""))
            : raw;
        });
        bodyEl.querySelectorAll("[data-t]").forEach((btn) => {
          payload[btn.dataset.t] = btn.classList.contains("on") ? "1" : "0";
        });
        setBusy(btn, true);
        try {
          const res = await patch("/api/admin/settings", payload);
          data.settings = res.settings;
          toast("Pengaturan disimpan.", "ok");
          if (S.settings) Object.assign(S.settings, {
            diskon: Number(res.settings.diskon_redeem || 0),
            toleransi: Number(res.settings.toleransi_menit || 0),
            sesi_hari: Number(res.settings.sesi_hari || 30),
            fitur_lencana: String(res.settings.fitur_lencana) === "1",
            fitur_rating: String(res.settings.fitur_rating) === "1",
          });
        } catch (e) { showError(e); }
        setBusy(btn, false);
      };
      const topSave = root.querySelector("[data-save]");
      if (topSave) topSave.onclick = () => save(topSave);
      const pinBtn = bodyEl.querySelector("[data-pin]");
      if (pinBtn) {
        pinBtn.onclick = async () => {
          const pin = bodyEl.querySelector('[name="pin"]').value.trim();
          const pin2 = bodyEl.querySelector('[name="pin2"]').value.trim();
          if (!/^[0-9]{4,6}$/.test(pin)) { toast("PIN harus 4–6 angka.", "warn"); return; }
          if (pin !== pin2) { toast("Konfirmasi PIN tidak sama.", "warn"); return; }
          const ok = await confirmSheet({ title: "Ubah PIN portal?", body: "PIN lama tidak berlaku lagi untuk masuk portal owner.", confirm: "Ubah PIN" });
          if (!ok) return;
          try {
            await patch("/api/admin/settings", { pin });
            toast("PIN portal diperbarui.", "ok");
            bodyEl.querySelector('[name="pin"]').value = "";
            bodyEl.querySelector('[name="pin2"]').value = "";
          } catch (e) { showError(e); }
        };
      }
    },
  };
}

/* ------------------------------------------------------------------ audit */
function auditBody(items) {
  return `<div class="g4">
    ${kpi(items.length, "Entri log", "maksimal 100 terbaru", "list", "blue")}
    ${kpi(new Set(items.map((i) => i.aktor)).size, "Aktor", "unik", "users", "green")}
    ${kpi(items.filter((i) => (i.aksi || "").toLowerCase().includes("hapus")).length, "Aksi hapus", "perlu perhatian", "trash", "red")}
    ${kpi(items.filter((i) => (i.aksi || "").toLowerCase().includes("gaji")).length, "Aksi payroll", "finalisasi & draf", "wallet", "gold")}
  </div>
  <div class="panel">
    <div class="admin-actions mb-16">
      <input class="input" data-q placeholder="Cari aktor atau aksi" style="height:38px;flex:1;max-width:320px">
      <div class="ml-auto tiny muted">Log tidak dapat diubah</div>
    </div>
    <div data-table>${auditTable(items)}</div>
  </div>`;
}

function auditTable(items) {
  return table(["Waktu", "Aktor", "Aksi", "Perubahan", ""],
    items.map((a, i) => [
      `<span class="tiny mono nowrap">${fmtDateTime(a.waktu)}</span>`,
      `<span class="small strong">${esc(a.aktor)}</span>`,
      esc(a.aksi),
      `<span class="tiny muted">${a.nilai_baru ? esc(JSON.stringify(a.nilai_baru).slice(0, 48)) : a.nilai_lama ? esc(JSON.stringify(a.nilai_lama).slice(0, 48)) : "-"}</span>`,
      a.nilai_baru || a.nilai_lama ? `<button class="mini-btn" data-detail="${i}" aria-label="Detail">${icon("eye", 14)}</button>` : "",
    ]), [0]);
}

function auditDetail(item) {
  const modal = sheet({
    title: "Detail audit",
    sub: `${item.aktor} · ${item.aksi}`,
    body: `<div class="stack">
      ${kvRow("Waktu", fmtDateTime(item.waktu))}
      ${kvRow("Aktor", esc(item.aktor))}
      ${kvRow("Aksi", esc(item.aksi))}
      <div><div class="tiny muted mb-8">Nilai lama</div>
        <pre class="code-block" style="white-space:pre-wrap;font-size:11px">${esc(JSON.stringify(item.nilai_lama, null, 2) || "null")}</pre></div>
      <div><div class="tiny muted mb-8">Nilai baru</div>
        <pre class="code-block" style="white-space:pre-wrap;font-size:11px">${esc(JSON.stringify(item.nilai_baru, null, 2) || "null")}</pre></div>
    </div>`,
    actions: `<button class="btn btn-outline grow" data-close>Tutup</button>`,
  });
  return modal;
}

function auditView(initial) {
  let items = initial.items || [];
  return {
    html: shell("Log Audit", "Jejak perubahan data operasional", "", auditBody(items)),
    mount(root) {
      const bodyEl = root.querySelector("[data-body]");
      const paint = (list) => {
        bodyEl.querySelector("[data-table]").innerHTML = auditTable(list);
        bindRows(list);
      };
      const bindRows = (list) => {
        bodyEl.querySelectorAll("[data-detail]").forEach((btn) => {
          btn.onclick = () => auditDetail(list[Number(btn.dataset.detail)]);
        });
      };
      paint(items);
      const input = bodyEl.querySelector("[data-q]");
      if (input) {
        input.addEventListener("input", () => {
          const q = input.value.trim().toLowerCase();
          paint(!q ? items : items.filter((a) => (a.aktor + " " + a.aksi).toLowerCase().includes(q)));
        });
      }
    },
  };
}

/* ------------------------------------------------------------------ registry */
const SCREENS = {
  dashboard: { load: () => get("/api/admin/dashboard"), view: dashboardView },
  absensi: {
    load: async () => {
      const [att, staff] = await Promise.all([get("/api/admin/attendance"), get("/api/admin/employees")]);
      return Object.assign({}, att, { employees: staff.employees });
    },
    view: absensiView,
  },
  jadwal: { load: () => get("/api/admin/schedules"), view: jadwalView },
  pengumuman: { load: () => get("/api/admin/announcements"), view: pengumumanView },
  peringatan: { load: () => get("/api/admin/warnings"), view: peringatanView },
  stok: { load: () => get("/api/admin/stock"), view: stokView },
  gaji: { load: () => get("/api/admin/payroll?periode=" + monthValue()), view: gajiView },
  ringkasan: { load: () => get("/api/admin/summaries"), view: ringkasanView },
  member: { load: () => get("/api/admin/members"), view: memberView },
  analitik: { load: () => get("/api/admin/analytics"), view: analitikView },
  katalog: { load: () => get("/api/admin/catalog"), view: katalogView },
  cabang: { load: () => get("/api/admin/branches"), view: cabangView },
  pengaturan: { load: () => get("/api/admin/settings"), view: pengaturanView },
  audit: { load: () => get("/api/admin/audit"), view: auditView },
};

