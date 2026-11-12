/* Geolocation helper.
 *
 * Di browser biasa memakai navigator.geolocation. Di dalam APK Android,
 * WebView yang memuat server http:// bisa menolak geolocation (butuh secure
 * context), jadi bila jembatan native tersedia kita minta koordinat dari GPS
 * perangkat lewat window.AromaAndroid.requestLocation().
 */

function fromBridge(timeout) {
  const bridge = window.AromaAndroid;
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      window.__aromaGeoResult = null;
      resolve(value);
    };
    window.__aromaGeoResult = (json) => {
      try {
        const data = JSON.parse(json);
        finish(data && typeof data.lat === "number" ? data : null);
      } catch (e) {
        finish(null);
      }
    };
    try {
      bridge.requestLocation();
    } catch (e) {
      finish(null);
      return;
    }
    setTimeout(() => finish(null), timeout + 2000);
  });
}

function fromBrowser(timeout) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 20000 }
    );
  });
}

export function locate(timeout = 15000) {
  const bridge = window.AromaAndroid;
  if (bridge && typeof bridge.requestLocation === "function") return fromBridge(timeout);
  return fromBrowser(timeout);
}

/** Selisih meter antara dua koordinat (haversine). */
export function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
