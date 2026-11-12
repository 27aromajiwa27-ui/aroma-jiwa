/* Aroma Jiwa Hadir - UI kit: icons, sheets, charts, barcode, formatting */
import { S, nowServer, wib } from "./store.js";

/* ------------------------------------------------------------------ icons */
const SW = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

const ICONS = {
  home: '<path d="M3 10.6 12 3.2l9 7.4V19a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 19z"/><path d="M9.2 20.8v-6.6h5.6v6.6"/>',
  calendar: '<rect x="3.2" y="5" width="17.6" height="15.8" rx="3.2"/><path d="M8 3.2v4M16 3.2v4M3.2 10.2h17.6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.4V12l3.2 2.1"/>',
  user: '<circle cx="12" cy="8.2" r="3.9"/><path d="M4.6 20.4c1.3-3.5 4-5.3 7.4-5.3s6.1 1.8 7.4 5.3"/>',
  users: '<circle cx="9.3" cy="8.4" r="3.3"/><path d="M2.8 19.6c1.1-3 3.4-4.6 6.5-4.6s5.4 1.6 6.5 4.6"/><path d="M16 5.4a3.1 3.1 0 0 1 0 5.9M17.6 15c2.3.5 3.9 1.9 4.6 4.3"/>',
  bell: '<path d="M6.2 9.3a5.8 5.8 0 0 1 11.6 0c0 4 1.3 5.3 1.9 5.9H4.3c.6-.6 1.9-1.9 1.9-5.9z"/><path d="M10 19.9a2.2 2.2 0 0 0 4 0"/>',
  scan: '<path d="M4 8.5V5.6A1.6 1.6 0 0 1 5.6 4h2.9M20 8.5V5.6A1.6 1.6 0 0 0 18.4 4h-2.9M4 15.5v2.9A1.6 1.6 0 0 0 5.6 20h2.9M20 15.5v2.9A1.6 1.6 0 0 1 18.4 20h-2.9"/><path d="M3.4 12h17.2"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1.4"/><rect x="14" y="4" width="6" height="6" rx="1.4"/><rect x="4" y="14" width="6" height="6" rx="1.4"/><path d="M14 14h2.4v2.4H14zM17.6 17.6H20V20h-2.4z"/>',
  wallet: '<path d="M3.5 8.2a2.7 2.7 0 0 1 2.7-2.7h11.6a2.7 2.7 0 0 1 2.7 2.7v9.1a2.7 2.7 0 0 1-2.7 2.7H6.2a2.7 2.7 0 0 1-2.7-2.7z"/><path d="M3.5 9.6h13.2a2 2 0 0 1 0 4H16"/><circle cx="16.4" cy="11.6" r=".9" fill="currentColor" stroke="none"/>',
  search: '<circle cx="11" cy="11" r="6.4"/><path d="m16 16 4.4 4.4"/>',
  mapPin: '<path d="M12 21.2s7-5.6 7-11.1a7 7 0 1 0-14 0c0 5.5 7 11.1 7 11.1z"/><circle cx="12" cy="10" r="2.6"/>',
  gift: '<rect x="3.4" y="8.6" width="17.2" height="4.2" rx="1.4"/><path d="M4.8 12.8v6.4a1.6 1.6 0 0 0 1.6 1.6h11.2a1.6 1.6 0 0 0 1.6-1.6v-6.4"/><path d="M12 8.6v12.2"/><path d="M12 8.6c-1.2-3.4-5.6-4-5.6-1.2 0 1.4 2 1.2 5.6 1.2zM12 8.6c1.2-3.4 5.6-4 5.6-1.2 0 1.4-2 1.2-5.6 1.2z"/>',
  star: '<path fill="currentColor" stroke="none" d="M12 3.3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.8l6.1-.9z"/>',
  flame: '<path fill="currentColor" stroke="none" d="M12.6 2.4c3.3 3.6 5.6 6.6 5.6 9.7a6.2 6.2 0 1 1-12.4 0c0-2 .8-3.7 2-5.4.1 1.5.7 2.6 1.8 3.2.2-2.7.9-5.3 3-7.5z"/>',
  sparkles: '<path d="M12 3.2l1.6 4.1 4.1 1.6-4.1 1.6L12 14.6l-1.6-4.1L6.3 8.9l4.1-1.6z"/><path d="M18.4 14.6l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8zM5.4 15.4l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/>',
  moon: '<path d="M20.2 14.4A8.4 8.4 0 1 1 9.6 3.8a6.8 6.8 0 0 0 10.6 10.6z"/>',
  cloud: '<path d="M7.3 18.4h9.6a3.4 3.4 0 0 0 .3-6.8 5.2 5.2 0 0 0-10-1.1 3.9 3.9 0 0 0 .1 7.9z"/>',
  droplet: '<path d="M12 3.2s6 6.2 6 10.2a6 6 0 0 1-12 0c0-4 6-10.2 6-10.2z"/>',
  camera: '<path d="M4.4 8.6h3l1.4-2h6.4l1.4 2h3a1.6 1.6 0 0 1 1.6 1.6v7.8a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6v-7.8a1.6 1.6 0 0 1 1.6-1.6z"/><circle cx="12" cy="13.6" r="3.2"/>',
  image: '<rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.4"/><circle cx="8.8" cy="9.6" r="1.6"/><path d="m4.6 17.6 4.4-4.2 3.4 3.2 3-2.8 3.8 3.8"/>',
  download: '<path d="M12 3.6v11.2M7.8 11l4.2 4.2 4.2-4.2"/><path d="M4.4 19.4h15.2"/>',
  trash: '<path d="M4.6 7h14.8M9.2 7V4.8h5.6V7M6.6 7l.9 12.2a1.6 1.6 0 0 0 1.6 1.5h5.8a1.6 1.6 0 0 0 1.6-1.5L17.4 7"/><path d="M10.2 11v6M13.8 11v6"/>',
  edit: '<path d="M4.5 19.5h4l10.2-10.2a2.2 2.2 0 0 0 0-3.1l-.9-.9a2.2 2.2 0 0 0-3.1 0L4.5 15.5z"/><path d="m13.6 6.6 3.8 3.8"/>',
  alert: '<path d="M12 3.8 21 20H3z"/><path d="M12 9.4v4.4M12 16.8v.2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.4M12 7.8v.2"/>',
  settings: '<path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h10M18 17h2"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="16" cy="17" r="2"/>',
  chart: '<path d="M4 20V10M9.3 20V4.6M14.6 20v-6.6M19.9 20V8"/>',
  pie: '<path d="M12 3.2a8.8 8.8 0 1 0 8.8 8.8H12z"/><path d="M14.4 3.7a8.8 8.8 0 0 1 5.9 5.9h-5.9z"/>',
  box: '<path d="m3.6 7.6 8.4-4 8.4 4-8.4 4z"/><path d="M3.6 7.6v8.8l8.4 4 8.4-4V7.6"/><path d="M12 11.6v8.8"/>',
  megaphone: '<path d="M3.4 10.4v3.2a1.6 1.6 0 0 0 1.6 1.6h2l8.6 4.2V4.6L7 8.8H5a1.6 1.6 0 0 0-1.6 1.6z"/><path d="M19 9.4a3.6 3.6 0 0 1 0 5.2M7 15.2v3.4a1.4 1.4 0 0 0 1.4 1.4h1.4"/>',
  tag: '<path d="M11.6 3.6H20v8.4l-8.6 8.6a1.6 1.6 0 0 1-2.3 0l-6.1-6.1a1.6 1.6 0 0 1 0-2.3z"/><circle cx="16.4" cy="7.6" r="1.4"/>',
  printer: '<path d="M7 9V3.6h10V9"/><rect x="3.6" y="9" width="16.8" height="7.4" rx="2"/><path d="M7 16.4h10v4H7z"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.4V10h-5.6"/>',
  lock: '<rect x="4.6" y="10.4" width="14.8" height="10" rx="2.4"/><path d="M8.2 10.4V7.8a3.8 3.8 0 0 1 7.6 0v2.6"/>',
  phone: '<path d="M8.2 3.6H5.8a2 2 0 0 0-2 2.2c.6 7.4 6.6 13.4 14 14a2 2 0 0 0 2.2-2v-2.4l-4.2-1.8-1.8 2.2a15 15 0 0 1-6.4-6.4l2.2-1.8z"/>',
  eye: '<path d="M2.4 12S5.8 6 12 6s9.6 6 9.6 6-3.4 6-9.6 6-9.6-6-9.6-6z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.2 0 9.6 6 9.6 6a17 17 0 0 1-3.2 3.7M6.4 7.9A16.3 16.3 0 0 0 2.4 12S5.8 18 12 18a9.7 9.7 0 0 0 3.6-.7"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  filter: '<path d="M3.6 5.4h16.8l-6.4 7.5v5.9l-4-2v-3.9z"/>',
  receipt: '<path d="M6 3.6h12v17.2l-3-1.8-3 1.8-3-1.8-3 1.8z"/><path d="M9 8h6M9 11.6h6M9 15.2h3.6"/>',
  list: '<path d="M8 6.4h12M8 12h12M8 17.6h12M4 6.4h.2M4 12h.2M4 17.6h.2"/>',
  shield: '<path d="M12 3.4 20 6v6c0 4.4-3.2 7.4-8 8.6-4.8-1.2-8-4.2-8-8.6V6z"/><path d="m8.8 12 2.2 2.2 4.2-4.4"/>',
  zap: '<path d="M13.4 2.8 4.6 13.6h6l-1 7.6 8.8-10.8h-6z"/>',
  award: '<circle cx="12" cy="9" r="5.4"/><path d="m8.6 13.6-1.2 7 4.6-2.4 4.6 2.4-1.2-7"/>',
  trendUp: '<path d="m3.6 17.4 5.8-5.8 3.6 3.6 7.4-7.4"/><path d="M14.6 7.8h5.8V13.6"/>',
  coffee: '<path d="M4.6 8.4h12v6a4 4 0 0 1-4 4H8.6a4 4 0 0 1-4-4z"/><path d="M16.6 9.4h1.6a2.6 2.6 0 0 1 0 5.2h-1.6M3.6 21h14"/>',
  login: '<path d="M14.4 3.6h4a2 2 0 0 1 2 2v12.8a2 2 0 0 1-2 2h-4"/><path d="M9.6 16.4 14 12 9.6 7.6M14 12H3.6"/>',
  logout: '<path d="M9.6 3.6h-4a2 2 0 0 0-2 2v12.8a2 2 0 0 0 2 2h4"/><path d="M14.4 16.4 18.8 12l-4.4-4.4M18.8 12H8.4"/>',
  barcode: '<path d="M4 5v14M7 5v14M10 5v9M13 5v14M16 5v9M20 5v14"/>',
  check: '<path d="m5 12.8 4.5 4.5L19.2 7"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.2 12.4 2.6 2.6 5-5.4"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chevronRight: '<path d="m9.4 5.6 6.5 6.4-6.5 6.4"/>',
  chevronLeft: '<path d="M14.6 5.6 8.1 12l6.5 6.4"/>',
  chevronDown: '<path d="m5.6 9.4 6.4 6.5 6.4-6.5"/>',
  arrowLeft: '<path d="M20 12H4.4M10.6 5.4 4 12l6.6 6.6"/>',
  arrowRight: '<path d="M4 12h15.6M13.4 5.4 20 12l-6.6 6.6"/>',
  arrowUpRight: '<path d="M7 17 17 7M9 7h8v8"/>',
  swap: '<path d="M4 8h13l-3.2-3.2M20 16H7l3.2 3.2"/>',
  more: '<circle cx="5.4" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18.6" cy="12" r="1.2" fill="currentColor"/>',
  copy: '<rect x="8.4" y="8.4" width="11.2" height="11.2" rx="2"/><path d="M15.6 8.4V6.4a2 2 0 0 0-2-2H6.4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 2 2h2"/>',
  fileText: '<path d="M14 3.4H7a2 2 0 0 0-2 2v13.2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.4z"/><path d="M14 3.4v5h5M8.6 13h6.8M8.6 16.4h6.8"/>',
  bottle: '<path d="M9.4 3h5.2v2.1c0 .9.3 1.7.9 2.4 1.6 1.8 2.5 4 2.5 6.4A6 6 0 0 1 12 20a6 6 0 0 1-6-6.1c0-2.4.9-4.6 2.5-6.4.6-.7.9-1.5.9-2.4V3z"/><path d="M6.4 13.2h11.2"/><path d="M10.6 6h2.8"/>',
  dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
};

export function icon(name, size = 20, cls = "") {
  const body = ICONS[name] || ICONS.dot;
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" ${SW} aria-hidden="true">${body}</svg>`;
}

export function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();
}

/* ------------------------------------------------------------------ format */
export const DAY_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
export const DAY_FULL = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const MONTH_FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function toDate(iso) {
  if (!iso) return null;
  if (iso instanceof Date) return iso;
  const text = String(iso);
  const d = new Date(text.length === 10 ? text + "T00:00:00+07:00" : text);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function esc(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function fmtRp(n) {
  const num = Math.round(Number(n) || 0);
  return "Rp " + num.toLocaleString("id-ID");
}

export function fmtNum(n) {
  return (Number(n) || 0).toLocaleString("id-ID");
}

export function fmtClock(iso) {
  const d = toDate(iso);
  if (!d) return "--:--";
  const x = wib(d);
  return String(x.getHours()).padStart(2, "0") + ":" + String(x.getMinutes()).padStart(2, "0");
}

export function fmtClockSec(d) {
  const x = wib(d);
  return (
    String(x.getHours()).padStart(2, "0") + ":" +
    String(x.getMinutes()).padStart(2, "0") + ":" +
    String(x.getSeconds()).padStart(2, "0")
  );
}

export function fmtDateShort(iso) {
  const d = toDate(iso);
  if (!d) return "-";
  const x = wib(d);
  return `${DAY_SHORT[x.getDay()]}, ${x.getDate()} ${MONTH_SHORT[x.getMonth()]}`;
}

export function fmtDateFull(iso) {
  const d = toDate(iso);
  if (!d) return "-";
  const x = wib(d);
  return `${DAY_FULL[x.getDay()]}, ${x.getDate()} ${MONTH_FULL[x.getMonth()]} ${x.getFullYear()}`;
}

export function fmtDateNum(iso) {
  const d = toDate(iso);
  if (!d) return "-";
  const x = wib(d);
  return `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}/${x.getFullYear()}`;
}

export function fmtDateTime(iso) {
  const d = toDate(iso);
  if (!d) return "-";
  return `${fmtDateShort(d)} · ${fmtClock(d)}`;
}

export function timeAgo(iso) {
  const d = toDate(iso);
  if (!d) return "-";
  const diff = Math.max(0, Math.floor((nowServer().getTime() - d.getTime()) / 1000));
  if (diff < 60) return "baru saja";
  if (diff < 3600) return Math.floor(diff / 60) + " menit lalu";
  if (diff < 86400) return Math.floor(diff / 3600) + " jam lalu";
  if (diff < 604800) return Math.floor(diff / 86400) + " hari lalu";
  return fmtDateShort(d);
}

export function minutesText(total) {
  const m = Math.max(0, Math.round(Number(total) || 0));
  if (m < 60) return m + " mnt";
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} j ${rest} m` : `${h} jam`;
}

export function countdown(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function pct(a, b) {
  if (!b) return 0;
  return Math.round((Number(a) / Number(b)) * 100);
}

/* ------------------------------------------------------------------ small components */
export function avatar(name, cls = "") {
  return `<span class="av ${cls}">${esc(initials(name))}</span>`;
}

export function spinner(dark) {
  return `<span class="spinner ${dark ? "dark" : ""}"></span>`;
}

export function emptyState(iconName, title, sub) {
  return `<div class="empty"><div class="em-ico">${icon(iconName, 24)}</div>
    <div class="em-title">${esc(title)}</div>${sub ? `<div>${esc(sub)}</div>` : ""}</div>`;
}

const STATUS_LABEL = { tepat: "Tepat waktu", telat: "Telat", khusus: "Khusus", absen: "Belum absen", libur: "Libur", selesai: "Selesai" };

export function statusPill(status, minutes) {
  const label = STATUS_LABEL[status] || status || "-";
  if (status === "telat" && minutes) return `<span class="pill telat">Telat ${minutes} mnt</span>`;
  return `<span class="pill ${status || "libur"}">${esc(label)}</span>`;
}

export function shiftPill(shift) {
  const s = (S.shifts && S.shifts[shift]) || { nama: shift };
  const cls = shift === "pagi" ? "gold" : shift === "sore" ? "orange" : "blue";
  return `<span class="pill ${cls}">${esc(s.nama)}</span>`;
}

export function shiftMark(shift) {
  const s = (S.shifts && S.shifts[shift]) || { kode: "?" };
  const cls = shift === "pagi" ? "pagi" : shift === "sore" ? "sore" : "fullday";
  return `<span class="mk ${cls}">${esc(s.kode || "?")}</span>`;
}

export function chip(text, cls = "") {
  return `<span class="chip ${cls}">${esc(text)}</span>`;
}

export function statCard(value, label, iconName, tone = "blue") {
  return `<div class="stat-card"><div class="stat-ico ico-${tone}">${icon(iconName, 16)}</div>
    <div class="v">${value}</div><div class="k">${esc(label)}</div></div>`;
}

export function kvRow(key, value, cls = "") {
  return `<div class="kv"><span class="k">${esc(key)}</span><span class="v ${cls}">${value}</span></div>`;
}

export function menuItem(href, iconName, title, sub, tone = "blue", action = "") {
  return `<a class="menu-item" ${href ? `href="${href}"` : ""} ${action ? `data-act="${action}"` : ""}>
    <span class="li-ico ico-${tone}">${icon(iconName, 18)}</span>
    <span class="grow"><span class="li-title">${esc(title)}</span>${sub ? `<span class="li-sub">${esc(sub)}</span>` : ""}</span>
    <span class="chev">${icon("chevronRight", 16)}</span>
  </a>`;
}

/* ------------------------------------------------------------------ toasts + sheets */
export function toast(message, type = "") {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const el = document.createElement("div");
  el.className = "toast " + type;
  const ic = type === "err" ? "alert" : type === "ok" ? "checkCircle" : "info";
  el.innerHTML = `${icon(ic, 17)}<span>${esc(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .2s, transform .2s";
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    setTimeout(() => el.remove(), 220);
  }, type === "err" ? 4200 : 3000);
}

const openSheets = [];

function lockScroll(lock) {
  document.body.style.overflow = lock ? "hidden" : "";
}

export function closeSheets() {
  while (openSheets.length) {
    const entry = openSheets.pop();
    entry.remove();
  }
  lockScroll(false);
}

export function sheet({ title, sub, body, actions, tall, center, onMount, className = "" }) {
  const root = document.getElementById("overlay-root");
  const overlay = document.createElement("div");
  overlay.className = "overlay" + (center ? " center-sheet" : "");
  overlay.innerHTML = `<div class="sheet ${tall ? "tall" : ""} ${className}">
    <div class="handle"></div>
    ${title ? `<div class="sheet-head"><div><div class="sheet-title">${esc(title)}</div>${sub ? `<div class="sheet-sub">${esc(sub)}</div>` : ""}</div>
      <button class="icon-btn plain" data-close aria-label="Tutup">${icon("close", 18)}</button></div>` : ""}
    <div class="sheet-body">${body || ""}</div>
    ${actions ? `<div class="sheet-actions">${actions}</div>` : ""}
  </div>`;
  root.appendChild(overlay);
  lockScroll(true);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    const idx = openSheets.findIndex((s) => s.overlay === overlay);
    if (idx >= 0) openSheets.splice(idx, 1);
    overlay.style.transition = "opacity .16s";
    overlay.style.opacity = "0";
    setTimeout(() => {
      overlay.remove();
      if (!openSheets.length) lockScroll(false);
    }, 150);
  };
  const entry = { overlay, remove: () => overlay.remove() };
  openSheets.push(entry);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest("[data-close]")) close();
  });
  const onKey = (event) => {
    if (event.key === "Escape") {
      close();
      document.removeEventListener("keydown", onKey);
    }
  };
  document.addEventListener("keydown", onKey);

  const bodyEl = overlay.querySelector(".sheet-body");
  if (onMount) onMount(overlay.querySelector(".sheet"), close);
  setTimeout(() => {
    const focusable = overlay.querySelector("input, textarea, select");
    if (focusable && !center) focusable.focus({ preventScroll: true });
  }, 220);
  return { overlay, body: bodyEl, close };
}

export function confirmSheet({ title, body, confirm = "Konfirmasi", cancel = "Batal", danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet({
      title,
      body: `<div class="small muted" style="line-height:1.6">${body || ""}</div>`,
      actions: `<button class="btn btn-outline grow" data-no>${esc(cancel)}</button>
                <button class="btn ${danger ? "btn-danger" : "btn-primary"} grow" data-yes>${esc(confirm)}</button>`,
      center: true,
      onMount(el, close) {
        el.querySelector("[data-no]").onclick = () => { done = true; close(); resolve(false); };
        el.querySelector("[data-yes]").onclick = () => { done = true; close(); resolve(true); };
      },
    });
    s.overlay.addEventListener("click", (e) => {
      if (e.target === s.overlay && !done) { done = true; setTimeout(() => resolve(false), 10); }
    });
  });
}

/* ------------------------------------------------------------------ charts */
let uidCounter = 0;
function uid() { uidCounter += 1; return "g" + uidCounter; }

export function ringSVG(fraction, { size = 120, stroke = 12, from = "#2F6BEA", to = "#5EDFB0", track = "var(--line)" } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  const id = uid();
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="overflow:visible">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}" opacity=".7"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - f)).toFixed(2)}"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

export function areaChart(values, { height = 118, color = "#2F6BEA", color2 = "#5EDFB0", fill = true } = {}) {
  const data = (values || []).map((v) => Number(v) || 0);
  if (!data.length) data.push(0, 0);
  const w = 340;
  const h = height;
  const pad = 10;
  const max = Math.max(1, ...data);
  const stepX = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const pts = data.map((v, i) => [pad + i * stepX, h - pad - (v / max) * (h - pad * 2)]);
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `M${pts[0][0].toFixed(1)},${h - pad} L` + line.replace(/ /g, " L ") + ` L${pts[pts.length - 1][0].toFixed(1)},${h - pad} Z`;
  const id = uid();
  return `<div class="chart-wrap"><svg class="chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity=".28"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${[0.25, 0.5, 0.75].map((f) => `<line x1="${pad}" y1="${(h - pad) - f * (h - pad * 2)}" x2="${w - pad}" y2="${(h - pad) - f * (h - pad * 2)}" stroke="var(--line)" stroke-dasharray="3 4" stroke-width="1"/>`).join("")}
    ${fill ? `<path d="${area}" fill="url(#${id})"/>` : ""}
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    ${pts.map((p, i) => (i === pts.length - 1 ? `<circle cx="${p[0]}" cy="${p[1]}" r="3.6" fill="${color2}" stroke="#fff" stroke-width="2"/>` : "")).join("")}
  </svg></div>`;
}

export function donutSVG(percent, { size = 96, stroke = 11, color = "#2F6BEA" } = {}) {
  return `<div style="position:relative;width:${size}px;height:${size}px">
    ${ringSVG((Number(percent) || 0) / 100, { size, stroke, from: color, to: "#5EDFB0" })}
    <div style="position:absolute;inset:0;display:grid;place-items:center;font-size:${Math.round(size / 4.6)}px;font-weight:800">${Math.round(Number(percent) || 0)}%</div>
  </div>`;
}

export function barChart(values, labels = [], { color = "" } = {}) {
  const max = Math.max(1, ...values.map((v) => Number(v) || 0));
  return `<div class="chart-bars">${values.map((v, i) => {
    const h = Math.max(4, Math.round((Number(v) || 0) / max * 84));
    return `<div class="b" style="height:${h}px;${color ? `background:${color};` : ""}" title="${esc(labels[i] || "")}">
      ${Number(v) ? `<span>${Number(v)}</span>` : ""}</div>`;
  }).join("")}</div>
  <div class="row-between" style="margin-top:6px;font-size:9px;color:var(--text-2)">${labels.map((l) => `<span>${esc(l)}</span>`).join("")}</div>`;
}

export function progressBar(percent, cls = "") {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return `<div class="progress ${cls}"><span style="width:${p}%"></span></div>`;
}

/* ------------------------------------------------------------------ code 39 barcode */
const CODE39 = {
  "0": "101001101101", "1": "110100101011", "2": "101100101011", "3": "110110010101",
  "4": "101001101011", "5": "110100110101", "6": "101100110101", "7": "101001011011",
  "8": "110100101101", "9": "101100101101",
  A: "110101001011", B: "101101001011", C: "110110100101", D: "101011001011", E: "110101100101",
  F: "101101100101", G: "101010011011", H: "110101001101", I: "101101001101", J: "101011001101",
  K: "110101010011", L: "101101010011", M: "110110101001", N: "101011010011", O: "110101101001",
  P: "101101101001", Q: "101010110011", R: "110101011001", S: "101101011001", T: "101011011001",
  U: "110010101011", V: "100110101011", W: "110011010101", X: "100101101011", Y: "110010110101",
  Z: "100110110101", "-": "100101011011", ".": "110010101101", " ": "100110101101",
  "$": "100100100101", "/": "100100101001", "+": "100101001001", "%": "101001001001",
  "*": "100101101101",
};

export function barcodeSVG(code, { height = 58 } = {}) {
  const clean = String(code || "").toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, "-") || "-";
  const text = "*" + clean + "*";
  const rects = [];
  let x = 0;
  for (const ch of text) {
    const pattern = CODE39[ch] || CODE39["-"];
    let i = 0;
    while (i < pattern.length) {
      const bit = pattern[i];
      let run = 1;
      while (i + run < pattern.length && pattern[i + run] === bit) run += 1;
      if (bit === "1") rects.push(`<rect x="${x}" y="0" width="${run}" height="${height}" fill="#0B2A5B"/>`);
      x += run;
      i += run;
    }
    x += 1;
  }
  return `<svg viewBox="0 0 ${x} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Barcode ${esc(code)}">${rects.join("")}</svg>`;
}

/* ------------------------------------------------------------------ celebration */
export function confetti(container, count = 40) {
  const colors = ["#5EDFB0", "#2F6BEA", "#F5C542", "#FF8A8A", "#9B7BFF", "#ffffff"];
  for (let i = 0; i < count; i += 1) {
    const el = document.createElement("div");
    el.className = "confetti";
    el.style.left = Math.random() * 100 + "%";
    el.style.background = colors[i % colors.length];
    el.style.animationDuration = 2.2 + Math.random() * 2 + "s";
    el.style.animationDelay = Math.random() * 1.6 + "s";
    el.style.opacity = String(0.5 + Math.random() * 0.5);
    el.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(el);
  }
}

/* ------------------------------------------------------------------ misc */
export function debounce(fn, wait = 320) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function readForm(root) {
  const out = {};
  root.querySelectorAll("[name]").forEach((input) => {
    if (input.type === "checkbox") out[input.name] = input.checked;
    else out[input.name] = input.value;
  });
  return out;
}

export function setBusy(button, busy, text) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner" style="width:16px;height:16px;border-width:2px;border-color:rgba(255,255,255,.35);border-top-color:#fff"></span>`;
  } else {
    button.disabled = false;
    if (button.dataset.label) button.innerHTML = button.dataset.label;
    if (text) button.textContent = text;
  }
}

export function showError(err) {
  const message = err && err.message ? err.message : "Terjadi kesalahan.";
  toast(message, "err");
}

export function starsRow(n, size = 14) {
  const v = Math.round(Number(n) || 0);
  return `<span class="row" style="gap:2px;color:#F5C542">${[1, 2, 3, 4, 5]
    .map((i) => `<span style="opacity:${i <= v ? 1 : 0.22};display:inline-flex">${icon("star", size)}</span>`)
    .join("")}</span>`;
}

export function weatherChip(weather) {
  if (!weather) return "";
  return `<span class="weather-chip">${icon(weather.ic || "sun", 14)} ${weather.suhu}°C · ${esc(weather.label)}</span>`;
}

export function guestBarcodePanel(code) {
  return `<div class="barcode-box w-full"><div style="height:56px">${barcodeSVG(code, { height: 56 })}</div>
    <div class="barcode-num">${esc(code)}</div></div>`;
}

export function pageHeader(title, sub, backHref) {
  return `<div class="sub-hero"><div class="st">
    ${backHref ? `<a class="back-btn" href="${backHref}">${icon("arrowLeft", 18)}</a>` : ""}
    <div class="grow"><h1>${esc(title)}</h1>${sub ? `<div class="stp">${esc(sub)}</div>` : ""}</div>
  </div></div>`;
}
