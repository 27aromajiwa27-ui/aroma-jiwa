/* Navigation helpers shared by pages (kept tiny to avoid circular imports). */
export function go(path, replace) {
  const hash = "#/" + String(path || "").replace(/^#?\/?/, "");
  if (replace) {
    history.replaceState(null, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else if (location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    location.hash = hash;
  }
}

export function reload() {
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function back() {
  if (history.length > 1) history.back();
  else go("home");
}

export function currentPath() {
  return (location.hash || "#/").replace(/^#\/?/, "").split("?")[0];
}
