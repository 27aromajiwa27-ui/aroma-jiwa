/* Employee profile, badges, notifications, announcements, stock reports */
import { get, post, patch } from "../api.js";
import { S, applyTheme, resolveTheme, nowServer } from "../store.js";
import {
  icon, esc, toast, sheet, emptyState, fmtDateShort, fmtDateFull, fmtDateTime, timeAgo,
  initials, spinner, setBusy, showError, chip, progressBar,
} from "../ui.js";
import { go, reload } from "../nav.js";

/* ------------------------------------------------------------------ shared header */
function subHero(title, sub, back) {
  return `<div class="sub-hero">
    <div class="st">
      ${back ? `<a class="back-btn" href="${back}">${icon("arrowLeft", 18)}</a>` : ""}
      <div class="grow"><h1>${esc(title)}</h1>${sub ? `<div class="stp">${esc(sub)}</div>` : ""}</div>
    </div>
  </div>`;
}

const NOTIF_ICON = { shift: "clock", checkin: "alert", checkout: "logout" };

/* ------------------------------------------------------------------ profile */
export async function render() {
  const data = await get("/api/me");
  const user = data.user;
  const d = data.dashboard;
  const unread = (d.notifications || []).filter((n) => !n.dibaca).length;
  const theme = S.theme || "system";
  const prefs = user.prefs || {};
  const notif = prefs.notif || { shift: true, checkin: true, checkout: true, pengumuman: true };

  const html = `<main class="screen">
    <div class="hero" style="padding-bottom:64px">
      <div class="hero-top">
        <div class="brand"><span class="brand-mark">${icon("bottle", 18)}</span>Aroma Jiwa Hadir</div>
        <div class="hero-actions">
          <a class="icon-btn" href="#/notifikasi">${icon("bell", 18)}
            ${unread ? '<span class="bell-dot"></span>' : ""}</a>
        </div>
      </div>
      <div class="row" style="margin-top:22px;gap:14px">
        <span style="width:60px;height:60px;border-radius:20px;background:rgba(255,255,255,.18);
          border:1px solid rgba(255,255,255,.3);display:grid;place-items:center;font-size:21px;font-weight:800">
          ${esc(initials(user.nama))}</span>
        <div class="grow">
          <div class="hero-name" style="font-size:20px;margin:0">${esc(user.nama)}</div>
          <div class="small" style="opacity:.82">${esc(user.hp_mask)} · Pegawai</div>
          <div class="row gap-6 mt-8">
            <span class="chip dark" style="background:rgba(255,255,255,.2);color:#fff">${icon("flame", 12)} ${d.streak} streak</span>
            <span class="chip dark" style="background:rgba(255,255,255,.2);color:#fff">${icon("award", 12)} ${d.badges_terbuka} lencana</span>
          </div>
        </div>
      </div>
    </div>

    <div class="pad" style="margin-top:-42px;position:relative;z-index:3">
      <div class="stat-row">
        <div class="stat-card"><div class="stat-ico ico-blue">${icon("calendar", 16)}</div>
          <div class="v">${d.stats.shift || 0}</div><div class="k">Shift bulan ini</div></div>
        <div class="stat-card"><div class="stat-ico ico-green">${icon("checkCircle", 16)}</div>
          <div class="v">${d.stats.persen_tepat || 0}%</div><div class="k">Tepat waktu</div></div>
        <div class="stat-card"><div class="stat-ico ico-gold">${icon("clock", 16)}</div>
          <div class="v">${d.stats.jam_kerja || 0}</div><div class="k">Jam kerja</div></div>
      </div>

      <div class="section-head"><span class="section-title">Akun & aktivitas</span></div>
      <div class="list">
        <a class="list-item" href="#/lencana">
          <span class="li-ico ico-gold">${icon("award", 18)}</span>
          <span class="li-body"><span class="li-title">Lencana & pencapaian</span>
            <span class="li-sub">${d.badges_terbuka} dari ${d.badges.length} terbuka</span></span>
          <span class="chev">${icon("chevronRight", 16)}</span></a>
        <a class="list-item" href="#/notifikasi">
          <span class="li-ico ico-blue">${icon("bell", 18)}</span>
          <span class="li-body"><span class="li-title">Notifikasi</span>
            <span class="li-sub">Pengingat shift, check-in, check-out</span></span>
          ${unread ? `<span class="pill telat">${unread} baru</span>` : `<span class="chev">${icon("chevronRight", 16)}</span>`}</a>
        <a class="list-item" href="#/pengumuman">
          <span class="li-ico ico-purple">${icon("megaphone", 18)}</span>
          <span class="li-body"><span class="li-title">Pengumuman</span>
            <span class="li-sub">Informasi dari owner</span></span>
          <span class="chev">${icon("chevronRight", 16)}</span></a>
        <a class="list-item" href="#/stok">
          <span class="li-ico ico-red">${icon("box", 18)}</span>
          <span class="li-body"><span class="li-title">Laporan stok</span>
            <span class="li-sub">Laporkan barang menipis atau habis</span></span>
          <span class="chev">${icon("chevronRight", 16)}</span></a>
      </div>

      <div class="section-head"><span class="section-title">Tampilan</span></div>
      <div class="card">
        <div class="row-between mb-8"><span class="h4">Tema aplikasi</span>
          <span class="tiny muted">${theme === "system" ? "Ikut perangkat" : theme === "dark" ? "Gelap" : "Terang"}</span></div>
        <div class="segmented" data-theme-pick>
          <button data-mode="light" class="${theme === "light" ? "active" : ""}">Terang</button>
          <button data-mode="dark" class="${theme === "dark" ? "active" : ""}">Gelap</button>
          <button data-mode="system" class="${theme === "system" ? "active" : ""}">Sistem</button>
        </div>
      </div>

      <div class="section-head"><span class="section-title">Preferensi notifikasi</span></div>
      <div class="card">
        ${[["shift", "Pengingat shift", "Notifikasi sebelum shift dimulai"],
           ["checkin", "Pengingat check-in", "Saat kamu belum check-in"],
           ["checkout", "Pengingat check-out", "Saat jam pulang sudah tiba"],
           ["pengumuman", "Pengumuman", "Info operasional dari owner"]].map(([key, title, sub]) => `
          <div class="row-between" style="padding:10px 0;border-bottom:1px solid var(--line)">
            <div class="grow"><div class="strong small">${title}</div><div class="tiny muted">${sub}</div></div>
            <button class="switch ${notif[key] !== false ? "on" : ""}" data-notif="${key}" aria-label="${title}"></button>
          </div>`).join("")}
      </div>

      <div class="section-head"><span class="section-title">Keamanan & perangkat</span></div>
      <div class="list">
        <button class="list-item" data-swap>
          <span class="li-ico ico-navy">${icon("swap", 18)}</span>
          <span class="li-body"><span class="li-title">Ganti akun</span>
            <span class="li-sub">Kata sandi diminta setiap kali berganti</span></span>
          <span class="chev">${icon("chevronRight", 16)}</span></button>
        <a class="list-item" href="#/reset">
          <span class="li-ico ico-blue">${icon("lock", 18)}</span>
          <span class="li-body"><span class="li-title">Lupa kata sandi?</span>
            <span class="li-sub">Atur ulang dari halaman masuk</span></span>
          <span class="chev">${icon("chevronRight", 16)}</span></a>
        <button class="list-item" data-logout>
          <span class="li-ico ico-red">${icon("logout", 18)}</span>
          <span class="li-body"><span class="li-title">Keluar</span>
            <span class="li-sub">Akhiri sesi di perangkat ini</span></span>
          <span class="chev">${icon("chevronRight", 16)}</span></button>
      </div>

      <div class="center tiny muted mt-24" style="line-height:1.7">
        Aroma Jiwa Hadir v1.0 · Portal Pegawai<br>
        Semua waktu mengikuti WIB (Asia/Jakarta)
      </div>
    </div>
  </main>`;

  return {
    html,
    mount(root) {
      root.querySelectorAll("[data-mode]").forEach((btn) => {
        btn.onclick = async () => {
          const mode = btn.dataset.mode;
          root.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b === btn));
          applyTheme(mode, true);
          if (S.session && S.session.user) S.session.user.prefs = Object.assign({}, S.session.user.prefs, { tema: mode });
          try {
            await patch("/api/me/prefs", { tema: mode });
            toast("Tema diperbarui.", "ok");
          } catch (e) { showError(e); }
        };
      });

      root.querySelectorAll("[data-notif]").forEach((btn) => {
        btn.onclick = async () => {
          const key = btn.dataset.notif;
          const next = !btn.classList.contains("on");
          btn.classList.toggle("on", next);
          try {
            await patch("/api/me/prefs", { notif: { [key]: next } });
          } catch (e) {
            btn.classList.toggle("on", !next);
            showError(e);
          }
        };
      });

      const logout = root.querySelector("[data-logout]");
      if (logout) logout.onclick = () => {
        sheet({
          title: "Keluar dari akun?",
          body: '<div class="small muted">Kamu dapat masuk kembali dengan nomor HP dan kata sandi. Akun tersimpan di perangkat ini akan dihapus.</div>',
          center: true,
          actions: `<button class="btn btn-outline grow" data-close>Batal</button>
            <button class="btn btn-danger grow" data-yes>Keluar</button>`,
          onMount(el, close) {
            el.querySelector("[data-yes]").onclick = () => {
              close();
              if (window.AromaJiwa) window.AromaJiwa.doLogout();
            };
          },
        });
      };
    },
  };
}

/* ------------------------------------------------------------------ badges */
export async function badges() {
  const data = await get("/api/me");
  const d = data.dashboard;
  const list = d.badges || [];

  const html = `<main class="screen">
    ${subHero("Lencana", `${d.badges_terbuka} dari ${list.length} lencana terbuka`, "#/profil")}
    <div class="pad" style="margin-top:-14px;position:relative;z-index:2">
      <div class="streak-card">
        <div class="row-between">
          <div>
            <div class="tiny" style="opacity:.86;letter-spacing:1.4px;font-weight:800">STREAK SAAT INI</div>
            <div style="font-size:32px;font-weight:800;margin-top:4px">${d.streak} shift</div>
            <div class="small" style="opacity:.86">Tepat waktu berturut-turut</div>
          </div>
          <div class="flame-wrap">${icon("flame", 42)}</div>
        </div>
      </div>

      <div class="section-head"><span class="section-title">Koleksi lencana</span></div>
      <div class="badge-grid">
        ${list.map((b) => `<div class="badge ${b.terbuka ? "" : "locked"}">
          <div class="b-ico" style="${b.terbuka ? "background:linear-gradient(135deg,#FFF3C4,#FFD873);color:#7A5400" : ""}">
            ${icon(b.terbuka ? "award" : "lock", 22)}</div>
          <div class="b-name">${esc(b.nama)}</div>
          <div class="b-prog">${b.progress}/${b.target}</div>
          <div class="mt-8">${progressBar(b.persen, b.terbuka ? "green" : "")}</div>
        </div>`).join("")}
      </div>

      <div class="section-head"><span class="section-title">Cara membuka</span></div>
      <div class="list">
        ${list.map((b) => `<div class="list-item plain" style="cursor:default">
          <span class="li-ico ${b.terbuka ? "ico-green" : "ico-navy"}">${icon(b.terbuka ? "checkCircle" : "award", 18)}</span>
          <span class="li-body"><span class="li-title">${esc(b.nama)}</span>
            <span class="li-sub">${esc(b.syarat)}</span></span>
          <span class="pill ${b.terbuka ? "tepat" : "libur"}">${b.terbuka ? "Terbuka" : `${b.progress}/${b.target}`}</span>
        </div>`).join("")}
      </div>
      <div class="banner mt-16" style="font-size:11px">${icon("info", 15)}
        <span>Lencana hanya penanda apresiasi. Tidak memengaruhi gaji atau penilaian otomatis.</span></div>
    </div>
  </main>`;

  return { html };
}

/* ------------------------------------------------------------------ notifications */
export async function notifications() {
  const data = await get("/api/me/notifications");
  const items = data.items || [];
  const anns = data.announcements || [];

  const html = `<main class="screen">
    ${subHero("Notifikasi", `${items.filter((n) => !n.dibaca).length} belum dibaca`, "#/profil")}
    <div class="pad" style="margin-top:-14px;position:relative;z-index:2">
      <div class="row-between mb-8">
        <span class="tiny muted">Pengingat otomatis dari sistem</span>
        <button class="link" data-read-all>${icon("checkCircle", 13)} Tandai dibaca</button>
      </div>
      <div class="list" data-list>
        ${items.length ? items.map((n) => `<button class="list-item" data-key="${esc(n.kunci)}" style="text-align:left;align-items:flex-start">
          <span class="li-ico ${n.jenis === "checkout" ? "ico-purple" : n.jenis === "checkin" ? "ico-red" : "ico-blue"}">
            ${icon(NOTIF_ICON[n.jenis] || "bell", 18)}</span>
          <span class="li-body"><span class="li-title">${esc(n.judul)}
            ${n.dibaca ? "" : '<span class="chip blue" style="margin-left:6px">Baru</span>'}</span>
            <span class="li-sub">${esc(n.isi)}</span>
            <span class="tiny muted">${timeAgo(n.waktu)}</span></span>
        </button>`).join("") : emptyState("bell", "Tidak ada notifikasi", "Semua pengingat shift sudah beres.")}
      </div>
      ${anns.length ? `<div class="section-head"><span class="section-title">Pengumuman belum dibaca</span></div>
        <div class="list">${anns.map((a) => `<a class="list-item" href="#/pengumuman">
          <span class="li-ico ico-purple">${icon("megaphone", 18)}</span>
          <span class="li-body"><span class="li-title">${esc(a.judul)}</span>
            <span class="li-sub">${fmtDateShort(a.mulai)}</span></span>
          <span class="unread-dot"></span></a>`).join("")}</div>` : ""}
    </div>
  </main>`;

  return {
    html,
    mount(root) {
      root.querySelectorAll("[data-key]").forEach((btn) => {
        btn.onclick = async () => {
          try {
            await post("/api/me/notifications/read", { keys: [btn.dataset.key] });
            btn.querySelector(".chip")?.remove();
            toast("Ditandai dibaca.", "ok");
          } catch (e) { showError(e); }
        };
      });
      const all = root.querySelector("[data-read-all]");
      if (all) all.onclick = async () => {
        try {
          await post("/api/me/notifications/read", { keys: items.map((n) => n.kunci) });
          reload();
        } catch (e) { showError(e); }
      };
    },
  };
}

/* ------------------------------------------------------------------ announcements */
export async function announcements() {
  const data = await get("/api/announcements");
  const items = data.items || [];

  const html = `<main class="screen">
    ${subHero("Pengumuman", `${items.filter((a) => !a.dibaca).length} belum dibaca`, "#/profil")}
    <div class="pad" style="margin-top:-14px;position:relative;z-index:2">
      ${items.length ? `<div class="stack">${items.map((a) => `<button class="card" data-ann="${a.id}" style="text-align:left">
        <div class="row-between mb-8">
          <span class="chip ${a.sematkan ? "gold" : "blue"}">${esc(a.kategori || "Info")}</span>
          ${a.dibaca ? "" : '<span class="chip red">Baru</span>'}
        </div>
        <div class="h3">${esc(a.judul)}</div>
        <div class="small muted mt-8" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(a.isi || "")}</div>
        <div class="row-between mt-16">
          <span class="tiny muted">${fmtDateShort(a.mulai)}${a.branch_nama ? " · " + esc(a.branch_nama) : ""}</span>
          <span class="link">${icon("clock", 12)} ${a.waktu_baca || 1} menit baca</span>
        </div>
      </button>`).join("")}</div>`
      : emptyState("megaphone", "Belum ada pengumuman", "Owner belum mengirim pengumuman.")}
    </div>
  </main>`;

  return {
    html,
    mount(root) {
      root.querySelectorAll("[data-ann]").forEach((btn) => {
        btn.onclick = () => {
          const a = items.find((x) => String(x.id) === btn.dataset.ann);
          if (!a) return;
          sheet({
            title: a.judul,
            sub: `${a.kategori || "Info"} · ${fmtDateFull(a.mulai)}`,
            tall: true,
            body: `<div class="stack-sm">
              ${a.sematkan ? `<div class="banner gold" style="background:rgba(245,197,66,.16);color:#8A6300;border-color:rgba(245,197,66,.4)">
                ${icon("star", 15)}<span>Disematkan owner</span></div>` : ""}
              <div style="font-size:13px;line-height:1.7;white-space:pre-wrap">${esc(a.isi || "")}</div>
              ${a.branch_nama ? `<div class="chip blue mt-8">${esc(a.branch_nama)}</div>` : `<div class="chip purple mt-8">Semua cabang</div>`}
            </div>`,
          });
          if (!a.dibaca) {
            post(`/api/announcements/${a.id}/read`).then(() => {
              btn.querySelector(".chip.red")?.remove();
            }).catch(() => { /* ignore */ });
          }
        };
      });
    },
  };
}

/* ------------------------------------------------------------------ stock reports */
const TINGKAT = [["Menipis", "Menipis"], ["Hampir Habis", "Hampir habis"], ["Habis", "Habis"]];
const TONE = { Menipis: "gold", "Hampir Habis": "orange", Habis: "telat" };

export async function stock() {
  const mine = await get("/api/stock-reports/mine");
  let catalog = { inventory: [] };
  try { catalog = await get("/api/aroma"); } catch (e) { /* optional */ }
  const inventory = catalog.inventory || [];

  const html = `<main class="screen">
    ${subHero("Laporan Stok", "Laporkan barang yang menipis di cabangmu", "#/profil")}
    <div class="pad" style="margin-top:-14px;position:relative;z-index:2">
      <button class="card" data-new style="width:100%;text-align:left;background:var(--grad);color:#fff;border:0">
        <div class="row-between">
          <div><div class="h3" style="color:#fff">Laporkan stok</div>
            <div class="small" style="opacity:.88">Isi 3 langkah, owner langsung menerima</div></div>
          <span style="width:44px;height:44px;border-radius:14px;background:rgba(255,255,255,.2);display:grid;place-items:center">
            ${icon("box", 22)}</span>
        </div>
      </button>

      <div class="section-head"><span class="section-title">Laporan saya</span>
        <span class="tiny muted">${(mine.items || []).length} data</span></div>
      <div class="list">
        ${(mine.items || []).length ? (mine.items || []).map((r) => `<div class="list-item plain" style="cursor:default;align-items:flex-start">
          <span class="li-ico ${r.tingkat === "Habis" ? "ico-red" : "ico-gold"}">${icon("box", 18)}</span>
          <span class="li-body"><span class="li-title">${esc(r.item_nama)}</span>
            <span class="li-sub">${esc(r.branch_nama)} · ${fmtDateTime(r.dibuat)}</span>
            ${r.catatan ? `<span class="tiny muted">${esc(r.catatan)}</span>` : ""}</span>
          <span class="pill ${TONE[r.tingkat] || "gold"}">${esc(r.tingkat)}</span>
        </div>`).join("") : emptyState("box", "Belum ada laporan", "Laporan stok yang kamu kirim muncul di sini.")}
      </div>

      <div class="banner mt-16" style="font-size:11px">${icon("info", 15)}
        <span>Laporan dengan barang dan cabang sama dalam 24 jam akan digabung otomatis.</span></div>
    </div>
  </main>`;

  return {
    html,
    mount(root) {
      root.querySelector("[data-new]").onclick = () => {
        const branches = S.branches || [];
        const modal = sheet({
          title: "Laporkan stok",
          sub: `Dicatat atas nama ${(S.session && S.session.user && S.session.user.nama) || "kamu"}`,
          tall: true,
          body: `<div class="stack">
            <div class="field"><label class="label">Cabang</label>
              <select class="select" data-branch>
                ${branches.map((b) => `<option value="${b.id}">${esc(b.nama)}</option>`).join("")}
              </select></div>
            <div class="field"><label class="label">Barang</label>
              <select class="select" data-item>
                <optgroup label="Perlengkapan & stok">
                  ${inventory.map((i) => `<option value="${i.id}" data-nama="${esc(i.nama)}">${esc(i.nama)}${i.satuan ? " (" + esc(i.satuan) + ")" : ""}</option>`).join("")}
                </optgroup>
                <option value="" data-nama="Barang lain">— Barang lain —</option>
              </select></div>
            <div class="field" data-other-wrap style="display:none"><label class="label">Nama barang</label>
              <input class="input" data-other placeholder="Contoh: Botol 100 ml"></div>
            <div class="field"><label class="label">Tingkat stok</label>
              <div class="segmented" data-tingkat>
                ${TINGKAT.map(([val, label], i) => `<button type="button" data-val="${val}" class="${i === 0 ? "active" : ""}">${label}</button>`).join("")}
              </div></div>
            <div class="field"><label class="label">Perkiraan sisa (opsional)</label>
              <input class="input" data-sisa inputmode="numeric" placeholder="Contoh: 3 botol"></div>
            <div class="field"><label class="label">Catatan (opsional)</label>
              <textarea class="textarea" data-note rows="2" placeholder="Kondisi barang atau kebutuhan restock"></textarea></div>
            <div class="field-error" data-err style="display:none"></div>
          </div>`,
          actions: `<button class="btn btn-outline grow" data-close>Batal</button>
            <button class="btn btn-primary grow" data-go>${icon("box", 16)} Kirim laporan</button>`,
        });
        const el = modal.overlay.querySelector(".sheet");
        let tingkat = "Menipis";
        const itemSel = el.querySelector("[data-item]");
        const otherWrap = el.querySelector("[data-other-wrap]");
        itemSel.onchange = () => {
          otherWrap.style.display = itemSel.value ? "none" : "block";
        };
        el.querySelectorAll("[data-val]").forEach((b) => {
          b.onclick = () => {
            tingkat = b.dataset.val;
            el.querySelectorAll("[data-val]").forEach((x) => x.classList.toggle("active", x === b));
          };
        });
        const err = el.querySelector("[data-err]");
        const btn = el.querySelector("[data-go]");
        btn.onclick = async () => {
          err.style.display = "none";
          const opt = itemSel.options[itemSel.selectedIndex];
          const itemName = itemSel.value ? opt.dataset.nama : el.querySelector("[data-other]").value.trim();
          if (!itemName) {
            err.textContent = "Nama barang wajib diisi.";
            err.style.display = "block";
            return;
          }
          setBusy(btn, true);
          try {
            const res = await post("/api/stock-reports", {
              branch_id: Number(el.querySelector("[data-branch]").value),
              item_id: itemSel.value ? Number(itemSel.value) : undefined,
              item_nama: itemName,
              tingkat,
              perkiraan_sisa: el.querySelector("[data-sisa]").value.trim() || undefined,
              catatan: el.querySelector("[data-note]").value.trim() || undefined,
            });
            modal.close();
            toast(res.merged ? "Laporan digabung dengan laporan serupa hari ini." : "Laporan stok terkirim.", "ok");
            reload();
          } catch (e) {
            err.textContent = e.message;
            err.style.display = "block";
            setBusy(btn, false);
          }
        };
      };
    },
  };
}
