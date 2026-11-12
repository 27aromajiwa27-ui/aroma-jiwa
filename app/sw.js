/* Aroma Jiwa Hadir - service worker (app shell cache + offline fallback) */
const CACHE = "aroma-jiwa-v2";
const SHELL = [
  "/", "/index.html", "/css/app.css", "/css/extra.css", "/js/app.js", "/js/nav.js", "/js/api.js",
  "/js/store.js", "/js/ui.js", "/js/geo.js", "/js/pages/auth.js", "/js/pages/home.js",
  "/js/pages/schedule.js", "/js/pages/scan.js",
  "/js/pages/history.js", "/js/pages/profile.js", "/js/pages/member.js", "/js/pages/admin.js",
  "/manifest.webmanifest", "/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => null).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // always live
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => null);
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/index.html")))
  );
});
