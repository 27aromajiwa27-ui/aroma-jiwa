/* Employee attendance history: performance, weekly trend, filters, detail sheet */
import { get } from "../api.js";
import { S, nowServer, wib } from "../store.js";
import {
  icon, esc, sheet, emptyState, statusPill, shiftMark, fmtRp, fmtDateFull, fmtClock,
  minutesText, areaChart, ringSVG, progressBar, DAY_SHORT, chip,
} from "../ui.js";

const FILTERS = [
  ["semua", "Semua"],
  ["tepat", "Tepat waktu"],
  ["telat", "Terlambat"],
  ["khusus", "Khusus"],
];

function rangeStats(data, range) {
  if (range === "minggu") return data.stats_minggu || {};
  if (range === "bulan") return data.stats_bulan || {};
  return data.stats || {};
}

function lastDays(n) {
  const base = wib(nowServer());
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    out.push({
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      label: DAY_SHORT[d.getDay()].slice(0, 1),
    });
  }
  return out;
}

function trendBlock(records) {
  const days = lastDays(7);
  const map = {};
  (records || []).forEach((r) => {
    if (!r.durasi_menit) return;
    map[r.tanggal] = (map[r.tanggal] || 0) + Number(r.durasi_menit);
  });
  const values = days.map((d) => Math.round((map[d.iso] || 0) / 60 * 10) / 10);
  return `<div class="card">
    <div class="row-between mb-8">
      <div class="card-title">Jam kerja 7 hari</div>
      <span class="tiny muted">${values.reduce((a, b) => a + b, 0).toFixed(1)} jam total</span>
    </div>
    ${areaChart(values, { height: 96 })}
    <div class="row-between" style="font-size:9px;color:var(--text-2);margin-top:4px">
      ${days.map((d) => `<span>${esc(d.label)}</span>`).join("")}
    </div>
  </div>`;
}

function statsBlock(stats) {
  const ring = Number(stats.persen_tepat || 0);
  const c = 2 * Math.PI * ((132 - 10) / 2);
  return `<div class="card">
    <div class="row" style="gap:16px;align-items:center">
      <div style="position:relative;width:132px;height:132px;flex-shrink:0">
        ${ringSVG(ring / 100, { size: 132, stroke: 10 })}
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="font-size:26px;font-weight:800;letter-spacing:-1px">${ring}%</div>
          <div class="tiny muted">tepat waktu</div>
        </div>
      </div>
      <div class="grow">
        <div class="kv" style="padding:5px 0"><span class="k">Total shift</span><span class="v">${stats.shift || 0}</span></div>
        <div class="kv" style="padding:5px 0"><span class="k">Jam kerja</span><span class="v">${stats.jam_kerja || 0} jam</span></div>
        <div class="kv" style="padding:5px 0"><span class="k">Terlambat</span><span class="v" style="color:var(--late)">${stats.telat || 0}</span></div>
        <div class="kv" style="padding:5px 0"><span class="k">Pulang khusus</span><span class="v" style="color:var(--purple)">${stats.khusus || 0}</span></div>
        ${stats.dispensasi ? `<div class="kv" style="padding:5px 0"><span class="k">Dispensasi</span><span class="v">${stats.dispensasi}</span></div>` : ""}
      </div>
    </div>
  </div>`;
}

function recordRow(r, openDetail) {
  return `<button class="list-item" data-rec="${r.id}" style="text-align:left">
    <span class="li-ico ${r.status === "telat" ? "ico-red" : r.status === "khusus" ? "ico-purple" : "ico-green"}"
      style="background:transparent;border:0">${shiftMark(r.shift)}</span>
    <span class="li-body">
      <span class="li-title">${esc(r.shift_nama)} · ${esc(r.branch_nama || "-")}</span>
      <span class="li-sub">${fmtClock(r.check_in)} – ${r.check_out_jam ? r.check_out_jam : "belum pulang"}
        ${r.durasi_menit ? " · " + minutesText(r.durasi_menit) : ""}</span>
    </span>
    ${statusPill(r.status, r.menit_telat)}
  </button>`;
}

function recordsBlock(records, filter, openDetail) {
  const rows = (records || []).filter((r) => (filter === "semua" ? true : r.status === filter));
  if (!rows.length) {
    return emptyState("coffee", "Belum ada data", "Tidak ada presensi untuk filter ini.");
  }
  const groups = [];
  rows.forEach((r) => {
    let g = groups.find((x) => x.tanggal === r.tanggal);
    if (!g) {
      g = { tanggal: r.tanggal, records: [] };
      groups.push(g);
    }
    g.records.push(r);
  });
  return groups.map((g) => `<div class="mb-16">
    <div class="row-between mb-8">
      <span class="tiny strong">${fmtDateFull(g.tanggal)}</span>
      <span class="tiny muted">${g.records.length} shift</span>
    </div>
    <div class="list">${g.records.map((r) => recordRow(r, openDetail)).join("")}</div>
  </div>`).join("");
}

function openDetail(r) {
  const expenses = (r.kas && r.kas.expenses) || [];
  const totalExpense = expenses.reduce((sum, e) => sum + (Number(e.nominal) || 0), 0);
  const body = `<div class="stack-sm">
    <div class="row-between">
      <div><div class="h3">${esc(r.shift_nama)}</div>
        <div class="small muted">${fmtDateFull(r.tanggal)}</div></div>
      ${statusPill(r.status, r.menit_telat)}
    </div>
    <div class="card flat tight mt-8">
      ${`<div class="kv"><span class="k">Cabang</span><span class="v">${esc(r.branch_nama || "-")}</span></div>`}
      <div class="kv"><span class="k">Check-in</span><span class="v">${r.check_in_jam || "—"}</span></div>
      <div class="kv"><span class="k">Check-out</span><span class="v">${r.check_out_jam || "belum"}</span></div>
      <div class="kv"><span class="k">Jam pulang minimum</span><span class="v">${r.jam_pulang_min_jam || "-"}</span></div>
      <div class="kv"><span class="k">Keterlambatan</span><span class="v">${r.menit_telat ? r.menit_telat + " menit" : "—"}</span></div>
      <div class="kv"><span class="k">Durasi kerja</span><span class="v">${r.durasi_menit ? minutesText(r.durasi_menit) : "—"}</span></div>
      ${r.dispensasi ? `<div class="kv"><span class="k">Dispensasi</span><span class="v">Multi-shift</span></div>` : ""}
      ${r.jarak ? `<div class="kv"><span class="k">Jarak presensi</span><span class="v">${r.jarak} m</span></div>` : ""}
    </div>
    ${r.tipe_checkout === "khusus" ? `<div class="banner purple">${icon("alert", 16)}
      <div><b>Pulang khusus.</b><br>${esc(r.kategori_khusus || "lainnya")} — ${esc(r.alasan_khusus || "-")}</div></div>` : ""}
    <div class="card flat tight">
      <div class="row-between mb-8"><span class="label" style="margin:0">Laporan kas</span>
        <span class="chip ${r.kas && r.kas.cash !== null ? "green" : "red"}">${r.kas && r.kas.cash !== null ? "Lengkap" : "Belum diisi"}</span></div>
      <div class="kv"><span class="k">Uang tunai</span><span class="v">${r.kas && r.kas.cash !== null ? fmtRp(r.kas.cash) : "—"}</span></div>
      <div class="kv"><span class="k">Pengeluaran</span><span class="v">${fmtRp(totalExpense)}</span></div>
      <div class="kv"><span class="k">Kas bersih</span><span class="v">${fmtRp((Number(r.kas && r.kas.cash) || 0) - totalExpense)}</span></div>
      ${expenses.length ? `<div class="divider"></div>${expenses.map((e) => `<div class="kv">
        <span class="k">${esc(e.keterangan || e.kategori || "Pengeluaran")}</span>
        <span class="v">${fmtRp(e.nominal)}</span></div>`).join("")}` : ""}
      ${r.kas && r.kas.catatan ? `<div class="small muted mt-8">${esc(r.kas.catatan)}</div>` : ""}
    </div>
  </div>`;
  sheet({ title: "Detail presensi", body, center: true });
}

export async function render() {
  const data = await get("/api/me/history");
  let range = "bulan";
  let filter = "semua";

  const html = `<main class="screen">
    <div class="sub-hero">
      <div class="st"><div class="grow"><h1>Riwayat Presensi</h1>
        <div class="stp">${data.records.length} presensi tercatat · 6 bulan terakhir</div></div>
        <a class="back-btn" href="#/home">${icon("home", 17)}</a></div>
    </div>
    <div class="pad" style="margin-top:-14px;position:relative;z-index:2">
      <div class="stack">
        <div class="range-tabs" data-ranges>
          ${[["minggu", "7 hari"], ["bulan", "Bulan ini"], ["semua", "6 bulan"]].map(([slug, label]) =>
            `<button data-range="${slug}" class="${slug === range ? "active" : ""}">${label}</button>`).join("")}
        </div>
        <div data-stats>${statsBlock(rangeStats(data, range))}</div>
        <div data-trend>${trendBlock(data.records)}</div>
        <div class="card tight">
          <div class="row-between mb-8">
            <div class="card-title">Rekap lencana</div>
            <a class="link" href="#/lencana">Lihat ${icon("chevronRight", 13)}</a>
          </div>
          <div class="row gap-10">
            <span class="li-ico ico-gold">${icon("flame", 18)}</span>
            <div class="grow"><div class="strong">${data.streak} shift beruntun</div>
              <div class="tiny muted">${((data.badges || {}).terbuka) || 0} lencana terbuka</div></div>
            <span class="pill gold">${data.streak > 0 ? "On fire" : "Mulai"}</span>
          </div>
        </div>
        <div class="section-head" style="margin:4px 0 0">
          <span class="section-title">Daftar presensi</span>
          <span class="tiny muted" data-count></span>
        </div>
        <div class="range-tabs" data-filters>
          ${FILTERS.map(([slug, label]) => `<button data-filter="${slug}" class="${slug === filter ? "active" : ""}">${label}</button>`).join("")}
        </div>
        <div data-records></div>
      </div>
    </div>
  </main>`;

  return {
    html,
    mount(root) {
      const statsEl = root.querySelector("[data-stats]");
      const recEl = root.querySelector("[data-records]");
      const countEl = root.querySelector("[data-count]");

      const drawRecords = () => {
        const list = data.records.filter((r) => (filter === "semua" ? true : r.status === filter));
        countEl.textContent = list.length + " data";
        recEl.innerHTML = recordsBlock(data.records, filter, openDetail);
        recEl.querySelectorAll("[data-rec]").forEach((btn) => {
          btn.onclick = () => {
            const rec = data.records.find((r) => String(r.id) === btn.dataset.rec);
            if (rec) openDetail(rec);
          };
        });
      };

      drawRecords();

      root.querySelectorAll("[data-range]").forEach((btn) => {
        btn.onclick = () => {
          range = btn.dataset.range;
          root.querySelectorAll("[data-range]").forEach((b) => b.classList.toggle("active", b === btn));
          statsEl.innerHTML = statsBlock(rangeStats(data, range));
        };
      });

      root.querySelectorAll("[data-filter]").forEach((btn) => {
        btn.onclick = () => {
          filter = btn.dataset.filter;
          root.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("active", b === btn));
          drawRecords();
        };
      });

      const list = root.querySelector("[data-rec]");
      if (!list && !data.records.length) {
        const wrap = root.querySelector("[data-records]");
        if (wrap) wrap.innerHTML = emptyState("clock", "Belum ada presensi", "Presensi pertamamu akan tampil di sini.");
      }
    },
  };
}
