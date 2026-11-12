/* Employee schedule: monthly calendar, day detail, upcoming shifts */
import { get } from "../api.js";
import { S, nowServer, isoDate, wib } from "../store.js";
import { icon, esc, sheet, emptyState, statusPill, shiftPill, shiftMark, fmtDateFull, fmtDateShort, MONTH_FULL } from "../ui.js";

function monthBlock(data, stats, y, m) {
  const first = new Date(y, m - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const today = isoDate();
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push('<div class="day-cell blank"></div>');
  data.days.forEach((day) => {
    const marks = (day.shifts || []).map((s) => {
      const rec = (day.records || []).find((r) => r.shift === s);
      if (rec) return shiftMark(s);
      if (day.future) return `<span class="mk ${s === "pagi" ? "pagi" : s === "sore" ? "sore" : "fullday"}" style="opacity:.35">${(S.shifts[s] || {}).kode || "?"}</span>`;
      if (day.tanggal === today) return `<span class="mk ${s === "pagi" ? "pagi" : s === "sore" ? "sore" : "fullday"}" style="opacity:.55">${(S.shifts[s] || {}).kode || "?"}</span>`;
      return `<span class="mk absent">!</span>`;
    }).join("");
    cells.push(`<button type="button" class="day-cell ${day.tanggal === today ? "today" : ""}" data-day="${day.tanggal}">
      <span class="dn">${Number(day.tanggal.slice(8))}</span><span class="dm">${marks}</span></button>`);
  });

  return `<div class="card">
    <div class="row-between mb-16">
      <button class="icon-btn plain" data-prev>${icon("chevronLeft", 18)}</button>
      <div class="center"><div class="h3">${MONTH_FULL[m - 1]} ${y}</div>
        <button class="link" data-today>Kembali ke hari ini</button></div>
      <button class="icon-btn plain" data-next>${icon("chevronRight", 18)}</button>
    </div>
    <div class="day-grid">
      ${["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => `<div class="dow">${d}</div>`).join("")}
      ${cells.join("")}
    </div>
    <div class="legend mt-16">
      <span><i class="sq" style="background:var(--gold)"></i>Pagi</span>
      <span><i class="sq" style="background:var(--orange)"></i>Sore</span>
      <span><i class="sq" style="background:var(--blue)"></i>Full Day</span>
      <span><i class="sq" style="background:var(--late-bg);border:1px solid var(--late)"></i>Tidak absen</span>
    </div>
  </div>
  <div class="stat-row mt-16">
    <div class="stat-card"><div class="stat-ico ico-blue">${icon("calendar", 16)}</div>
      <div class="v">${(stats || {}).shift || 0}</div><div class="k">Total shift</div></div>
    <div class="stat-card"><div class="stat-ico ico-green">${icon("checkCircle", 16)}</div>
      <div class="v">${(stats || {}).tepat || 0}</div><div class="k">Tepat waktu</div></div>
    <div class="stat-card"><div class="stat-ico ico-red">${icon("alert", 16)}</div>
      <div class="v">${(stats || {}).telat || 0}</div><div class="k">Terlambat</div></div>
  </div>`;
}

function openDay(day) {
  const recs = day.records || [];
  const scheduled = day.shifts || [];
  const body = `<div class="stack-sm">
    <div class="row-between"><span class="small muted">${fmtDateFull(day.tanggal)}</span>
      ${day.future ? '<span class="pill blue">Akan datang</span>' : ""}</div>
    ${recs.map((r) => `<div class="card flat tight">
      <div class="row-between"><b>${esc(r.shift_nama)}</b>${statusPill(r.status, r.menit_telat)}</div>
      <div class="kv mt-8"><span class="k">Masuk</span><span class="v">${r.check_in_jam || "—"}</span></div>
      <div class="kv"><span class="k">Pulang</span><span class="v">${r.check_out_jam || "belum"}</span></div>
      <div class="kv"><span class="k">Cabang</span><span class="v">${esc(r.branch_nama || "-")}</span></div>
      ${r.jam_pulang_min_jam ? `<div class="kv"><span class="k">Pulang min.</span><span class="v">${r.jam_pulang_min_jam}</span></div>` : ""}
      ${r.dispensasi ? `<div class="chip purple mt-8">${icon("swap", 12)} Dispensasi</div>` : ""}
    </div>`).join("")}
    ${scheduled.filter((s) => !recs.find((r) => r.shift === s)).map((s) => `<div class="card flat tight">
      <div class="row-between"><span class="row gap-8">${shiftMark(s)}<b>Shift ${esc((S.shifts[s] || {}).nama || s)}</b></span>
      ${day.future ? '<span class="pill blue">Terjadwal</span>' : '<span class="pill telat">Belum absen</span>'}</div>
      <div class="kv mt-8"><span class="k">Jam</span><span class="v">${(S.shifts[s] || {}).mulai || "-"} – ${(S.shifts[s] || {}).pulang || "tutup"}</span></div>
    </div>`).join("")}
    ${!recs.length && !scheduled.length ? emptyState("coffee", "Hari libur", "Tidak ada shift terjadwal.") : ""}
  </div>`;
  sheet({ title: "Detail jadwal", body, center: true });
}

export async function render() {
  const now = wib(nowServer());
  let y = now.getFullYear();
  let m = now.getMonth() + 1;

  const first = await get(`/api/me/month?tahun=${y}&bulan=${m}`);
  const upcoming = (first.schedules || []).filter((s) => s.tanggal >= isoDate()).slice(0, 6);

  const html = `<main class="screen">
    <div class="sub-hero">
      <div class="st"><div class="grow"><h1>Jadwal Shift</h1>
        <div class="stp">Kalender presensi & penugasan cabang</div></div>
        <a class="back-btn" href="#/home">${icon("home", 17)}</a></div>
    </div>
    <div class="pad" style="margin-top:-14px;position:relative;z-index:2">
      <div data-cal>${monthBlock(first.month, first.stats, y, m)}</div>
      <div class="section-head"><span class="section-title">Shift mendatang</span></div>
      <div class="list" data-upcoming>
        ${upcoming.length ? upcoming.map((s) => `<button class="list-item" data-sday="${s.tanggal}">
          <span class="li-ico ${s.shift === "pagi" ? "ico-gold" : s.shift === "sore" ? "ico-gold" : "ico-blue"}">${shiftMark(s.shift)}</span>
          <span class="li-body"><span class="li-title">${esc((S.shifts[s.shift] || {}).nama || s.shift)} · ${esc(s.branch_nama)}</span>
          <span class="li-sub">${fmtDateShort(s.tanggal)} · ${(S.shifts[s.shift] || {}).mulai || "-"}${(S.shifts[s.shift] || {}).pulang ? " – " + S.shifts[s.shift].pulang : " – tutup"}</span></span>
          ${s.attendance ? '<span class="pill tepat">Hadir</span>' : `<span class="chev">${icon("chevronRight", 16)}</span>`}
        </button>`).join("") : emptyState("calendar", "Belum ada jadwal", "Owner belum menetapkan shift berikutnya.")}
      </div>
      <div class="center mt-24 tiny muted">Jadwal dikelola owner melalui portal admin.</div>
    </div>
  </main>`;

  return {
    html,
    mount(root) {
      const calWrap = root.querySelector("[data-cal]");

      const bind = (data, yy, mm) => {
        calWrap.innerHTML = monthBlock(data.month, data.stats, yy, mm);
        calWrap.querySelector("[data-prev]").onclick = () => {
          const nm = mm === 1 ? 12 : mm - 1;
          const ny = mm === 1 ? yy - 1 : yy;
          load(ny, nm);
        };
        calWrap.querySelector("[data-next]").onclick = () => {
          const nm = mm === 12 ? 1 : mm + 1;
          const ny = mm === 12 ? yy + 1 : yy;
          load(ny, nm);
        };
        calWrap.querySelector("[data-today]").onclick = () => {
          const n = wib(nowServer());
          load(n.getFullYear(), n.getMonth() + 1);
        };
        calWrap.querySelectorAll("[data-day]").forEach((btn) => {
          btn.onclick = () => {
            const day = data.month.days.find((x) => x.tanggal === btn.dataset.day);
            if (day) openDay(day);
          };
        });
      };

      const load = async (yy, mm) => {
        calWrap.innerHTML = `<div class="card center" style="padding:36px"><span class="spinner dark" style="display:inline-block"></span></div>`;
        try {
          const data = await get(`/api/me/month?tahun=${yy}&bulan=${mm}`);
          bind(data, yy, mm);
        } catch (e) {
          calWrap.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
        }
      };

      bind(first, y, m);

      root.querySelectorAll("[data-sday]").forEach((btn) => {
        btn.onclick = () => {
          const all = first.month.days.find((d) => d.tanggal === btn.dataset.sday);
          if (all) openDay(all);
          else {
            const s = upcoming.find((x) => x.tanggal === btn.dataset.sday);
            openDay({ tanggal: s.tanggal, shifts: [s.shift], records: s.attendance ? [s.attendance] : [], future: true });
          }
        };
      });
    },
  };
}
