/* Aroma Jiwa Hadir - app shell, router, realtime wiring */
import { S, initTheme, loadBoot, applyTheme, setSession, connectStream, disconnectStream, savedAccounts, rememberAccount, forgetAccount, emit, bus, resolveTheme } from "./store.js";
import { get, post } from "./api.js";
import { icon, toast, sheet, showError, esc, avatar, spinner, initials, setBusy } from "./ui.js";
import { go, reload, currentPath } from "./nav.js";
import * as Auth from "./pages/auth.js";
import * as Home from "./pages/home.js";
import * as Schedule from "./pages/schedule.js";
import * as Scan from "./pages/scan.js";
import * as History from "./pages/history.js";
import * as Profile from "./pages/profile.js";
import * as Member from "./pages/member.js";
import * as Admin from "./pages/admin.js";

/* ------------------------------------------------------------------ routes */
const PAGES = {
  login: { shell: "auth", page: Auth.login, title: "Masuk" },
  "login-member": { shell: "auth", page: Auth.memberLogin, title: "Kartu Member" },
  register: { shell: "auth", page: Auth.register, title: "Daftar Pegawai" },
  reset: { shell: "auth", page: Auth.reset, title: "Lupa Kata Sandi" },
  home: { shell: "employee", page: Home.render, tab: "home", title: "Beranda" },
  jadwal: { shell: "employee", page: Schedule.render, tab: "jadwal", title: "Jadwal" },
  scan: { shell: "employee", page: Scan.render, tab: "scan", title: "Presensi" },
  riwayat: { shell: "employee", page: History.render, tab: "riwayat", title: "Riwayat" },
  profil: { shell: "employee", page: Profile.render, tab: "profil", title: "Profil" },
  lencana: { shell: "employee", page: Profile.badges, tab: "profil", title: "Lencana" },
  notifikasi: { shell: "employee", page: Profile.notifications, tab: "profil", title: "Notifikasi" },
  pengumuman: { shell: "employee", page: Profile.announcements, tab: "profil", title: "Pengumuman" },
  stok: { shell: "employee", page: Profile.stock, tab: "profil", title: "Laporan Stok" },
  kartu: { shell: "member", page: Member.card, tab: "kartu", title: "Kartu Member" },
  "kartu/riwayat": { shell: "member", page: Member.history, tab: "riwayat", title: "Riwayat Kartu" },
  "kartu/profil": { shell: "member", page: Member.profile, tab: "profil", title: "Profil Member" },
  admin: { shell: "auth", page: Admin.pinPage, title: "Portal Owner" },
};

const ADMIN_PAGES = [
  ["dashboard", "Dashboard", "home"],
  ["absensi", "Absensi", "calendar"],
  ["jadwal", "Jadwal Shift", "clock"],
  ["pengumuman", "Pengumuman", "megaphone"],
  ["peringatan", "Peringatan", "alert"],
  ["stok", "Laporan Stok", "box"],
  ["gaji", "Gaji & Kasbon", "wallet"],
  ["ringkasan", "Ringkasan Harian", "receipt"],
  ["member", "Data Member", "users"],
  ["analitik", "Analitik", "chart"],
  ["katalog", "Katalog Aroma", "tag"],
  ["cabang", "Cabang & Geofence", "mapPin"],
  ["pengaturan", "Pengaturan", "settings"],
  ["audit", "Log Audit", "shield"],
];
ADMIN_PAGES.forEach(([slug, label, ico]) => {
  PAGES["admin/" + slug] = { shell: "admin", page: Admin.render, admin: slug, title: label, label, ico };
});

const EMPLOYEE_TABS = [
  ["home", "Beranda", "home"],
  ["jadwal", "Jadwal", "calendar"],
  ["scan", "Presensi", "scan"],
  ["riwayat", "Riwayat", "clock"],
  ["profil", "Profil", "user"],
];
const MEMBER_TABS = [
  ["kartu", "Kartu", "barcode"],
  ["kartu/riwayat", "Riwayat", "clock"],
  ["kartu/profil", "Profil", "user"],
];

/* ------------------------------------------------------------------ chrome */
function tabbarHTML(tabs, active, withSwap) {
  const items = tabs.map(([slug, label, ico]) => {
    const on = slug === active;
    const href = slug.startsWith("kartu") ? "#/" + slug : "#/" + slug;
    return `<a class="tab ${on ? "active" : ""}" href="${href}">
      ${icon(ico, 20)}<span class="t-label">${esc(label)}</span></a>`;
  }).join("");
  const swap = withSwap
    ? `<button class="fab-swap" data-swap title="Ganti akun">${icon("swap", 21)}
        ${savedAccounts().length > 1 ? `<span class="cnt">${savedAccounts().length}</span>` : ""}</button>`
    : "";
  return `<div class="tabbar-wrap"><nav class="tabbar">${items}</nav>${swap}</div>`;
}

function sideHTML(active) {
  const group = (title, slugs) => `<div class="side-label">${title}</div>` + slugs.map((slug) => {
    const entry = ADMIN_PAGES.find((p) => p[0] === slug);
    if (!entry) return "";
    return `<a href="#/admin/${slug}" class="${active === slug ? "active" : ""}">
      ${icon(entry[2], 17)}<span>${esc(entry[1])}</span></a>`;
  }).join("");
  return `<aside class="side" id="side">
    <div class="side-brand">
      <span style="width:38px;height:38px;border-radius:12px;background:rgba(255,255,255,.14);display:grid;place-items:center">${icon("bottle", 22)}</span>
      <div><div class="nm">Aroma Jiwa Hadir</div><div class="sb">Portal Owner</div></div>
    </div>
    <nav class="side-nav">
      ${group("Operasional", ["dashboard", "absensi", "jadwal", "pengumuman", "peringatan", "stok"])}
      ${group("Keuangan", ["gaji", "ringkasan"])}
      ${group("Pelanggan", ["member", "analitik", "katalog"])}
      ${group("Sistem", ["cabang", "pengaturan", "audit"])}
    </nav>
    <div class="side-foot">
      <div class="side-user">
        <span class="av">AJ</span>
        <div class="grow"><div style="font-size:11.5px;font-weight:800">Owner Aroma Jiwa</div>
        <div style="font-size:10px;opacity:.6">Sesi 30 menit</div></div>
        <button class="icon-btn" data-admin-out style="width:30px;height:30px;background:rgba(255,255,255,.1)">${icon("logout", 15)}</button>
      </div>
      <div style="font-size:9px;opacity:.4;padding:6px 8px">v1.0 · Asia/Jakarta</div>
    </div>
  </aside>`;
}

function skeletonMobile() {
  return `<main class="screen" id="view"><div class="pad" style="padding-top:26px"><div class="stack">
    <div class="skeleton sk-card" style="height:150px"></div>
    <div class="skeleton sk-card"></div>
    <div class="skeleton sk-card"></div>
  </div></div></main>`;
}

function skeletonAdmin() {
  return `<div class="panel center" style="padding:60px"><span class="spinner dark" style="display:inline-block"></span>
    <div class="small muted mt-16">Memuat data…</div></div>`;
}

function applyChrome(def) {
  const root = document.getElementById("root");
  document.body.dataset.shell = def.shell;
  if (def.shell === "employee") {
    root.innerHTML = `<div class="phone">${skeletonMobile()}</div>` + tabbarHTML(EMPLOYEE_TABS, def.tab, true);
  } else if (def.shell === "member") {
    root.innerHTML = `<div class="phone">${skeletonMobile()}</div>` + tabbarHTML(MEMBER_TABS, def.tab, false);
  } else if (def.shell === "admin") {
    root.innerHTML = `<div class="admin-shell">${sideHTML(def.admin)}<div class="admin-main" id="view">${skeletonAdmin()}</div></div>`;
  } else {
    root.innerHTML = `<div id="view"></div>`;
  }
}

function errorBlock(err) {
  return `<div class="pad" style="padding-top:40px"><div class="empty">
    <div class="em-ico">${icon("alert", 24)}</div>
    <div class="em-title">Gagal memuat halaman</div>
    <div class="mb-16">${esc(err.message || "Terjadi kesalahan.")}</div>
    <button class="btn btn-primary btn-sm" data-retry>${icon("refresh", 15)} Coba lagi</button>
  </div></div>`;
}

/* ------------------------------------------------------------------ router */
let cleanup = null;
let rendering = false;

function payloadFor(name) {
  return { name, S };
}

function guard(def, name) {
  const kind = S.session && S.session.kind;
  if (def.shell === "employee" && kind !== "pegawai") return kind === "member" ? "kartu" : "login";
  if (def.shell === "member" && kind !== "member") return kind === "pegawai" ? "home" : "login-member";
  if (def.shell === "admin" && kind !== "admin") return "admin";
  if (name === "admin" && kind === "admin") return "admin/dashboard";
  return null;
}

async function route() {
  if (rendering) return;
  rendering = true;
  const name = currentPath();
  let def = PAGES[name];

  if (!name) {
    const kind = S.session && S.session.kind;
    rendering = false;
    return go(kind === "pegawai" ? "home" : kind === "member" ? "kartu" : kind === "admin" ? "admin/dashboard" : "login", true);
  }
  if (!def) {
    rendering = false;
    const root = document.getElementById("root");
    root.innerHTML = `<div class="phone"><main class="screen no-tab">
      <div class="pad" style="padding-top:70px"><div class="empty">
        <div class="em-ico">${icon("search", 24)}</div>
        <div class="em-title">Halaman tidak ditemukan</div>
        <div class="mb-16">Tautan yang kamu buka tidak tersedia.</div>
        <a class="btn btn-primary btn-sm" href="#/home">Kembali ke beranda</a>
      </div></div></main></div>`;
    rendering = false;
    return;
  }

  const redirect = guard(def, name);
  if (redirect) {
    rendering = false;
    return go(redirect, true);
  }

  if (cleanup) {
    try { cleanup(); } catch (e) { /* ignore */ }
    cleanup = null;
  }
  document.querySelectorAll(".overlay").forEach((o) => o.remove());
  document.body.style.overflow = "";

  applyChrome(def);
  const view = document.getElementById("view");
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

  try {
    const page = (await def.page(payloadFor(name))) || {};
    view.innerHTML = page.html || "";
    if (page.title) document.title = page.title + " · Aroma Jiwa Hadir";
    else document.title = (def.title || "Aroma Jiwa") + " · Aroma Jiwa Hadir";
    if (page.mount) {
      const maybe = await page.mount(view);
      if (typeof maybe === "function") cleanup = maybe;
    }
    if (page.cleanup) cleanup = page.cleanup;
    const retry = view.querySelector("[data-retry]");
    if (retry) retry.onclick = () => reload();
  } catch (err) {
    console.error(err);
    if (err && err.status === 401) return;
    view.innerHTML = errorBlock(err);
    const retry = view.querySelector("[data-retry]");
    if (retry) retry.onclick = () => reload();
    showError(err);
  } finally {
    rendering = false;
    document.getElementById("side")?.classList.remove("open");
  }
}

/* ------------------------------------------------------------------ account sheet */
function openAccountSheet() {
  const current = S.session && S.session.user;
  const list = savedAccounts();
  const others = list.filter((a) => !current || a.id !== current.id);
  const body = `
    ${current ? `<div class="list-item plain" style="margin-bottom:10px">
      <span class="li-ico ico-blue">${avatar(current.nama)}</span>
      <div class="li-body"><div class="li-title">${esc(current.nama)}</div>
      <div class="li-sub">${esc(current.hp_mask || "")} · Akun aktif</div></div>
      <span class="pill tepat">Aktif</span>
    </div>` : ""}
    <div class="small muted mb-8">Akun tersimpan di perangkat ini</div>
    <div class="list">
      ${others.length ? others.map((a) => `<button class="list-item" data-acc="${a.id}" style="text-align:left">
        <span class="li-ico ico-navy" style="font-weight:800">${esc(a.avatar || initials(a.nama))}</span>
        <span class="li-body"><span class="li-title">${esc(a.nama)}</span>
        <span class="li-sub">${esc(a.hp_mask || a.hp || "")}</span></span>
        ${icon("chevronRight", 16)}
      </button>`).join("") : `<div class="empty" style="padding:16px">Belum ada akun lain. Tambahkan akun untuk berpindah cepat.</div>`}
    </div>
    <button class="btn btn-soft btn-block mt-16" data-add>${icon("plus", 16)} Tambah akun lain</button>
    <button class="btn btn-ghost btn-block mt-8" data-switch-logout>${icon("logout", 16)} Keluar dari akun ini</button>`;
  const modal = sheet({
    title: "Ganti akun",
    sub: "Kata sandi selalu diminta setiap kali berganti akun.",
    body,
    center: true,
    onMount(el, close) {
      el.querySelectorAll("[data-acc]").forEach((btn) => {
        btn.onclick = () => {
          const acc = savedAccounts().find((a) => String(a.id) === btn.dataset.acc);
          if (acc) { close(); askSwitchPassword(acc); }
        };
      });
      el.querySelector("[data-add]").onclick = () => { close(); go("login"); };
      el.querySelector("[data-switch-logout]").onclick = async () => {
        close();
        await doLogout();
      };
    },
  });
  return modal;
}

function askSwitchPassword(acc) {
  const modal = sheet({
    title: "Masuk sebagai " + acc.nama,
    sub: "Masukkan kata sandi akun ini untuk melanjutkan.",
    center: true,
    body: `<div class="field"><label class="label">Kata sandi</label>
      <div class="pass-wrap"><input class="input input-lg" type="password" name="password" placeholder="••••••" autocomplete="current-password">
      <button class="eye" type="button" data-eye>${icon("eye", 18)}</button></div></div>
      <div class="field-error mt-8" data-err></div>`,
    actions: `<button class="btn btn-outline grow" data-close>Batal</button>
      <button class="btn btn-primary grow" data-go>Masuk</button>`,
    onMount(el, close) {
      const input = el.querySelector('[name="password"]');
      const err = el.querySelector("[data-err]");
      const btn = el.querySelector("[data-go]");
      el.querySelector("[data-eye]").onclick = () => {
        input.type = input.type === "password" ? "text" : "password";
      };
      const submit = async () => {
        if (!input.value) { err.textContent = "Kata sandi wajib diisi."; return; }
        setBusy(btn, true);
        try {
          const res = await post("/api/auth/switch", { user_id: acc.id, password: input.value, device: deviceName() });
          rememberAccount(res.user);
          setSession({ kind: "pegawai", user: res.user });
          connectStream();
          close();
          toast("Sekarang masuk sebagai " + res.user.nama, "ok");
          go("home");
        } catch (e) {
          err.textContent = e.message;
          setBusy(btn, false);
        }
      };
      btn.onclick = submit;
      input.onkeydown = (e) => { if (e.key === "Enter") submit(); };
    },
  });
  return modal;
}

async function doLogout() {
  try { await post("/api/auth/logout"); } catch (e) { /* ignore */ }
  if (S.session && S.session.user) forgetAccount(S.session.user.id);
  setSession(null);
  disconnectStream();
  go("login");
}

function deviceName() {
  const ua = navigator.userAgent || "Perangkat";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return ua.slice(0, 40);
}

/* ------------------------------------------------------------------ global events */
function bindGlobal() {
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-swap]")) {
      openAccountSheet();
      return;
    }
    if (event.target.closest("[data-admin-out]")) {
      event.preventDefault();
      adminLogout();
      return;
    }
    if (event.target.closest("[data-menu-toggle]")) {
      document.getElementById("side")?.classList.toggle("open");
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") document.getElementById("side")?.classList.remove("open");
  });

  window.addEventListener("aj:unauth", () => {
    const name = currentPath();
    if (["login", "login-member", "register", "reset", "admin"].includes(name)) return;
    if (!S.session) return;
    const wasMember = S.session.kind === "member";
    setSession(null);
    disconnectStream();
    toast("Sesi kamu berakhir. Silakan masuk kembali.", "err");
    go(wasMember ? "login-member" : "login");
  });

  bus.addEventListener("sse:announcement", (event) => {
    const data = event.detail || {};
    toast("Pengumuman baru: " + (data.judul || ""), "ok");
  });
  bus.addEventListener("sse:redeem_request", (event) => {
    const data = event.detail || {};
    if (S.session && S.session.kind === "pegawai") toast((data.member || "Member") + " meminta konfirmasi redeem.", "ok");
  });
  bus.addEventListener("sse:stock", () => {
    if (S.session && S.session.kind === "admin") toast("Ada laporan stok baru.", "ok");
  });

  window.addEventListener("online", () => toast("Kembali online.", "ok"));
  window.addEventListener("offline", () => toast("Kamu sedang offline. Data mungkin tidak terbaru.", "err"));

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && S.session && !S.es) connectStream();
  });
}

async function adminLogout() {
  try { await post("/api/admin/logout"); } catch (e) { /* ignore */ }
  setSession(null);
  disconnectStream();
  go("admin");
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => { /* offline install not critical */ });
}

/* ------------------------------------------------------------------ boot */
function bootError(err) {
  document.getElementById("root").innerHTML = `<div class="boot"><div class="center" style="padding:24px">
    <div class="logo-big">${icon("bottle", 30)}</div>
    <div class="h2">Tidak bisa terhubung</div>
    <div class="small" style="opacity:.8;margin:8px 0 18px">${esc(err.message || "Server tidak merespons.")}</div>
    <button class="btn btn-primary" onclick="location.reload()">${icon("refresh", 16)} Coba lagi</button>
  </div></div>`;
}

async function start() {
  initTheme();
  bindGlobal();
  try {
    await loadBoot();
  } catch (err) {
    bootError(err);
    return;
  }
  const session = S.session;
  if (session && (session.user || session.member)) rememberAccount(session.user || session.member);
  if (session) connectStream();
  registerSW();
  window.addEventListener("hashchange", route);
  if (!location.hash) {
    const kind = session && session.kind;
    go(kind === "pegawai" ? "home" : kind === "member" ? "kartu" : kind === "admin" ? "admin/dashboard" : "login", true);
    return;
  }
  route();

  setInterval(() => emit("tick"), 1000);
  setInterval(() => { if (S.session && S.session.kind === "admin") emit("admin-ping"); }, 5 * 60 * 1000);
}

export { S, resolveTheme };
export const app = { go, reload, doLogout, openAccountSheet };
window.AromaJiwa = app;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
