/* Aroma Jiwa Hadir - client state, clock sync, theme, realtime */
import { get } from "./api.js";

export const S = {
  boot: null,
  session: null,
  settings: {},
  branches: [],
  shifts: {},
  demo: true,
  theme: "system",
  skew: 0,
  es: null,
};

export const bus = new EventTarget();

export function emit(type, detail) {
  bus.dispatchEvent(new CustomEvent(type, { detail }));
}

/* ------------------------------------------------------------------ time (WIB) */
export function nowServer() {
  return new Date(Date.now() + S.skew);
}

export function syncClock(iso) {
  if (!iso) return;
  const target = new Date(iso).getTime();
  if (!Number.isNaN(target)) S.skew = target - Date.now();
}

/** Date object whose local getters read the WIB wall clock. */
export function wib(d) {
  const base = d || nowServer();
  try {
    return new Date(base.toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  } catch (e) {
    return base;
  }
}

export function isoDate(d) {
  const x = wib(d);
  return (
    x.getFullYear() +
    "-" +
    String(x.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(x.getDate()).padStart(2, "0")
  );
}

export function clockText(d, seconds) {
  const x = wib(d);
  const base =
    String(x.getHours()).padStart(2, "0") + ":" + String(x.getMinutes()).padStart(2, "0");
  return seconds ? base + ":" + String(x.getSeconds()).padStart(2, "0") : base;
}

export function greeting() {
  const h = wib().getHours();
  if (h >= 4 && h < 11) return "Selamat pagi";
  if (h >= 11 && h < 15) return "Selamat siang";
  if (h >= 15 && h < 18) return "Selamat sore";
  return "Selamat malam";
}

/* ------------------------------------------------------------------ theme */
export function resolveTheme() {
  if (S.theme === "system") {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return S.theme;
}

export function applyTheme(mode, persist) {
  if (mode) S.theme = mode;
  if (persist !== false) {
    try { localStorage.setItem("aj_theme", S.theme); } catch (e) { /* ignore */ }
  }
  const resolved = resolveTheme();
  document.documentElement.setAttribute("data-theme", resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#0B1220" : "#2F6BEA");
}

export function initTheme() {
  let saved = "system";
  try { saved = localStorage.getItem("aj_theme") || "system"; } catch (e) { /* ignore */ }
  S.theme = saved;
  applyTheme(saved, false);
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", () => applyTheme(null, false));
  }
}

/* ------------------------------------------------------------------ boot */
export async function loadBoot() {
  const data = await get("/api/bootstrap");
  S.boot = data;
  S.session = data.session || null;
  S.settings = data.settings || {};
  S.branches = data.branches || [];
  S.shifts = data.shifts || {};
  S.demo = !!data.demo_mode;
  syncClock(data.server_time);
  if (data.session && data.session.user && data.session.user.prefs && data.session.user.prefs.tema) {
    S.theme = data.session.user.prefs.tema;
    applyTheme(S.theme, false);
  }
  if (data.session && data.session.member && data.session.member.prefs && data.session.member.prefs.tema) {
    S.theme = data.session.member.prefs.tema;
    applyTheme(S.theme, false);
  }
  return data;
}

export function setSession(session) {
  S.session = session || null;
}

export function sessionUser() {
  if (!S.session) return null;
  return S.session.user || S.session.member || S.session.admin || null;
}

/* ------------------------------------------------------------------ realtime */
const STREAM_EVENTS = [
  "ready", "stamp", "celebrate", "member_notify", "redeem", "redeem_request",
  "announcement", "admin_refresh", "stock",
];

export function connectStream() {
  disconnectStream();
  if (!S.session) return;
  if (typeof EventSource === "undefined") return;
  let es;
  try {
    es = new EventSource("/api/stream");
  } catch (e) {
    return;
  }
  S.es = es;
  STREAM_EVENTS.forEach((name) => {
    es.addEventListener(name, (ev) => {
      let data = null;
      try { data = ev.data ? JSON.parse(ev.data) : null; } catch (e) { data = ev.data; }
      if (name === "ready") return;
      emit("sse", { name, data });
      emit("sse:" + name, data);
    });
  });
  es.onerror = () => { /* EventSource retries automatically */ };
}

export function disconnectStream() {
  if (S.es) {
    try { S.es.close(); } catch (e) { /* ignore */ }
    S.es = null;
  }
}

/* ------------------------------------------------------------------ accounts */
export function savedAccounts() {
  try {
    const raw = localStorage.getItem("aj_accounts");
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

export function rememberAccount(user) {
  if (!user || !user.id) return;
  const list = savedAccounts().filter((a) => a.id !== user.id);
  list.unshift({
    id: user.id, nama: user.nama, hp: user.hp, hp_mask: user.hp_mask,
    avatar: user.avatar || (user.nama || "?").slice(0, 1).toUpperCase(), last: Date.now(),
  });
  try {
    localStorage.setItem("aj_accounts", JSON.stringify(list.slice(0, Number(S.settings.maks_akun || 6))));
  } catch (e) { /* ignore */ }
}

export function forgetAccount(id) {
  const list = savedAccounts().filter((a) => a.id !== id);
  try { localStorage.setItem("aj_accounts", JSON.stringify(list)); } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------------ weather */
const WEATHER_KEY = "aj_weather_v1";

export async function getWeather() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(WEATHER_KEY) || "null");
    if (cached && Date.now() - cached.at < 20 * 60 * 1000) return cached.data;
  } catch (e) { /* ignore */ }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=-7.888&longitude=110.328" +
      "&current=temperature_2m,weather_code,relative_humidity_2m&timezone=Asia%2FJakarta";
    const res = await fetch(url, { signal: controller.signal });
    const json = await res.json();
    const cur = json.current || {};
    const code = Number(cur.weather_code);
    let label = "Cerah";
    let ic = "sun";
    if (code >= 1 && code <= 3) { label = "Berawan"; ic = "cloud"; }
    else if (code === 45 || code === 48) { label = "Berkabut"; ic = "cloud"; }
    else if (code >= 51 && code <= 67) { label = "Hujan ringan"; ic = "droplet"; }
    else if (code >= 80 && code <= 82) { label = "Hujan"; ic = "droplet"; }
    else if (code >= 95) { label = "Hujan petir"; ic = "cloud"; }
    const data = {
      suhu: Math.round(Number(cur.temperature_2m)),
      lembap: Math.round(Number(cur.relative_humidity_2m || 0)),
      label, ic,
    };
    sessionStorage.setItem(WEATHER_KEY, JSON.stringify({ at: Date.now(), data }));
    return data;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
