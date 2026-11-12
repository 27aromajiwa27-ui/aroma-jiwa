/* Aroma Jiwa Hadir - API client */
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status || 0;
    this.data = data || {};
  }
}

const JSON_HEADERS = { "Content-Type": "application/json" };

async function request(path, { method = "GET", body, signal } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? JSON_HEADERS : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError("Tidak bisa menghubungi server. Periksa koneksi kamu.", 0);
  }
  const type = res.headers.get("Content-Type") || "";
  if (type.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) window.dispatchEvent(new CustomEvent("aj:unauth"));
      throw new ApiError(data.error || "Permintaan gagal diproses.", res.status, data);
    }
    return data;
  }
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent("aj:unauth"));
    throw new ApiError("Permintaan gagal (" + res.status + ").", res.status);
  }
  return res;
}

export const get = (path, opts) => request(path, opts || {});
export const post = (path, body) => request(path, { method: "POST", body: body === undefined ? {} : body });
export const patch = (path, body) => request(path, { method: "PATCH", body: body === undefined ? {} : body });
export const del = (path, body) => request(path, { method: "DELETE", body });

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("Berkas gagal dibaca."));
    reader.readAsDataURL(blob);
  });
}

export async function download(url, fallback) {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    let message = "Gagal mengunduh laporan.";
    try {
      const data = await res.json();
      message = data.error || message;
    } catch (e) { /* ignore */ }
    throw new ApiError(message, res.status);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const match = cd.match(/filename="([^"]+)"/);
  const name = match ? match[1] : fallback || "laporan.pdf";

  // Di dalam APK Android, blob URL tidak bisa diunduh WebView: kirim lewat jembatan native.
  const bridge = window.AromaAndroid;
  if (bridge && typeof bridge.saveFile === "function") {
    bridge.saveFile(name, blob.type || "application/octet-stream", await blobToBase64(blob));
    return name;
  }

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  return name;
}

export async function health() {
  try {
    return await get("/api/health");
  } catch (err) {
    return null;
  }
}
