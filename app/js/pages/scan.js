/* Employee scan & stamp: barcode scan, member search, stamp, redeem */
import { get, post } from "../api.js";
import { S, bus, nowServer } from "../store.js";
import {
  icon, esc, toast, showError, sheet, confirmSheet, emptyState, fmtRp, fmtClock, timeAgo,
  avatar, setBusy, chip, statusPill,
} from "../ui.js";
import { reload } from "../nav.js";

let stopCamera = null;

function stampGrid(n, target = 9) {
  return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:190px;margin:0 auto">
    ${Array.from({ length: target }, (_, i) => i < n
      ? `<div style="aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 32% 28%,#9AF0D0,#3FBF92 62%,#259B74);color:#06301F;box-shadow:inset 0 -2px 6px rgba(0,0,0,.16)">${icon("check", 18)}</div>`
      : `<div style="aspect-ratio:1;border-radius:50%;display:grid;place-items:center;border:1.5px dashed var(--line);color:var(--text-2);font-size:11px;font-weight:700">${i + 1}</div>`
    ).join("")}
  </div>`;
}

function memberSummary(data) {
  const m = data.member;
  const pending = data.pending;
  const favorites = (data.favorites || []).map((f) => `<span class="chip blue">${esc(f.aroma_nama)} · ${f.jumlah}x</span>`).join("");
  const history = (data.history || []).slice(0, 3).map((h) => `<div class="row-between small" style="padding:7px 0;border-top:1px solid var(--line)">
    <span class="row gap-8">${icon(h.jenis === "redeem" ? "gift" : "sparkles", 14)}<span>${h.jenis === "redeem" ? "Redeem reward" : "Stempel"}</span></span>
    <span class="muted">${timeAgo(h.waktu)}</span></div>`).join("");
  return `<div class="stack">
    <div class="row">
      <span class="li-ico ico-blue" style="width:46px;height:46px;font-weight:800">${esc((m.nama || "?").slice(0, 1).toUpperCase())}</span>
      <div class="grow"><div class="h3">${esc(m.nama)}</div>
        <div class="small muted">${esc(m.hp_mask || m.hp)} · ${esc(m.kode)}</div></div>
      <span class="chip ${data.stempel >= 9 ? "green" : "blue"}">${data.stempel}/9 cap</span>
    </div>
    ${pending ? `<div class="banner purple">${icon("gift", 16)}
      <div><b>Permintaan redeem menunggu konfirmasi.</b><br>Member sudah menekan redeem dari kartunya.</div></div>` : ""}
    <div class="card flat tight">${stampGrid(data.stempel)}</div>
    ${favorites ? `<div><div class="label mb-8">Aroma favorit</div><div class="row wrap gap-6">${favorites}</div></div>` : ""}
    ${history ? `<div><div class="label mb-8">Aktivitas terakhir</div>${history}</div>` : ""}
    <div class="grid2">
      <button class="btn btn-primary" data-stamp ${data.stempel >= 9 ? "disabled" : ""}>${icon("sparkles", 16)} Beri Stempel</button>
      <button class="btn ${data.stempel >= 9 ? "btn-navy" : "btn-outline"}" data-redeem ${data.stempel >= 9 ? "" : "disabled"}>
        ${icon("gift", 16)} Redeem</button>
    </div>
    ${data.stempel >= 9 ? `<div class="banner ok" style="font-size:11px">${icon("checkCircle", 15)}<span>Kartu penuh! Konfirmasi redeem untuk menukar 9 cap.</span></div>` : ""}
  </div>`;
}

async function openMemberByCode(code) {
  let data;
  try {
    data = await get("/api/member/code/" + encodeURIComponent(code));
  } catch (e) {
    toast(e.message, "err");
    return;
  }
  openMemberSheet(data);
}

async function openMemberById(id) {
  try {
    const data = await get("/api/member/" + id);
    openMemberSheet(data);
  } catch (e) {
    showError(e);
  }
}

function openMemberSheet(data) {
  const modal = sheet({ title: "Kartu member", body: memberSummary(data), tall: true });
  const el = modal.overlay.querySelector(".sheet");
  const bind = () => {
    const stampBtn = el.querySelector("[data-stamp]");
    if (stampBtn) stampBtn.onclick = () => { modal.close(); openStamp(data); };
    const redeemBtn = el.querySelector("[data-redeem]");
    if (redeemBtn) redeemBtn.onclick = () => { modal.close(); openRedeem(data); };
  };
  bind();
  modal.refresh = () => {
    get("/api/member/code/" + encodeURIComponent(data.member.kode)).then((next) => {
      data = next;
      modal.body.innerHTML = memberSummary(data);
      bind();
    }).catch(showError);
  };
  return modal;
}

async function openStamp(data) {
  let catalog = { aroma: [] };
  try { catalog = await get("/api/aroma"); } catch (e) { /* optional */ }
  const aromas = catalog.aroma || [];
  const modal = sheet({
    title: "Beri stempel",
    sub: `${data.member.nama} · ${data.stempel}/9 cap`,
    body: `<div class="stack">
      <div class="center">${stampGrid(data.stempel)}</div>
      <div class="field"><label class="label">Aroma yang dibeli (opsional)</label>
        <select class="select" data-aroma><option value="">— Tidak dicatat —</option>
          ${aromas.map((a) => `<option value="${a.id}">${esc(a.nama)} · ${esc(a.kategori)}</option>`).join("")}
        </select></div>
      <div class="field"><label class="label">Ukuran</label>
        <div class="segmented" data-size>
          <button type="button" class="active" data-ml="30">30 ml</button>
          <button type="button" data-ml="50">50 ml</button>
          <button type="button" data-ml="100">100 ml</button>
        </div></div>
      <div class="banner" style="font-size:11px">${icon("info", 15)}
        <span>Satu stempel per transaksi. Sistem menolak stempel ganda dalam 30 detik.</span></div>
      <div class="field-error" data-err style="display:none"></div>
    </div>`,
    actions: `<button class="btn btn-outline grow" data-close>Batal</button>
      <button class="btn btn-primary grow" data-go>${icon("sparkles", 16)} Stempel Sekarang</button>`,
  });
  const el = modal.overlay.querySelector(".sheet");
  let ml = "30";
  el.querySelectorAll("[data-ml]").forEach((b) => {
    b.onclick = () => {
      ml = b.dataset.ml;
      el.querySelectorAll("[data-ml]").forEach((x) => x.classList.toggle("active", x === b));
    };
  });
  const err = el.querySelector("[data-err]");
  const btn = el.querySelector("[data-go]");

  const send = async (force) => {
    err.style.display = "none";
    setBusy(btn, true);
    try {
      const aromaId = el.querySelector("[data-aroma]").value;
      const res = await post("/api/stamps", {
        kode: data.member.kode,
        aroma_id: aromaId ? Number(aromaId) : undefined,
        ukuran: aromaId ? ml : undefined,
        force: !!force,
      });
      modal.close();
      stampSuccess(res, data.member.nama);
    } catch (e) {
      setBusy(btn, false);
      if (/ganda/i.test(e.message)) {
        const ok = await confirmSheet({
          title: "Stempel ganda?",
          body: `${esc(e.message)}<br><br>Lanjutkan hanya jika transaksi ini memang berbeda.`,
          confirm: "Tetap beri stempel",
          danger: true,
        });
        if (ok) send(true);
        return;
      }
      err.textContent = e.message;
      err.style.display = "block";
    }
  };
  btn.onclick = () => send(false);
}

function stampSuccess(res, nama) {
  const body = `<div class="center" style="padding:6px 0 4px">
    <div style="width:96px;height:96px;border-radius:50%;margin:0 auto 16px;display:grid;place-items:center;background:radial-gradient(circle at 34% 30%,#9AF0D0,#3FBF92 64%,#259B74);color:#06301F;box-shadow:0 16px 34px rgba(31,166,122,.28)">
      ${icon("check", 44)}
    </div>
    <div class="h2">Stempel ke-${res.stempel}</div>
    <div class="small muted mt-8">${esc(nama)} · ${res.sisa > 0 ? `Tinggal ${res.sisa} cap lagi` : "Kartu penuh!"}</div>
    <div class="mt-16">${stampGrid(res.stempel)}</div>
    ${res.penuh ? `<div class="banner ok mt-16" style="text-align:left">${icon("gift", 16)}
      <span><b>Kartu penuh.</b> Minta member membuka kartunya untuk redeem, lalu konfirmasi dari halaman ini.</span></div>` : ""}
  </div>`;
  sheet({
    title: "Stempel berhasil",
    body,
    center: true,
    actions: res.penuh
      ? `<button class="btn btn-outline grow" data-close>Scan lagi</button>
         <button class="btn btn-navy grow" data-redeem>${icon("gift", 16)} Redeem</button>`
      : `<button class="btn btn-primary btn-block" data-close>Selesai</button>`,
    onMount(el, close) {
      const btn = el.querySelector("[data-redeem]");
      if (btn) btn.onclick = async () => {
        close();
        try {
          const data = await get("/api/member/code/" + encodeURIComponent(res.member.kode));
          openRedeem(data);
        } catch (e) { showError(e); }
      };
    },
  });
}

async function openRedeem(data) {
  const diskon = Number(S.settings.diskon || 24000);
  const jenisAwal = (data.pending && data.pending.jenis) || "diskon";
  const body = `<div class="stack">
    <div class="banner purple">${icon("gift", 16)}
      <div><b>${esc(data.member.nama)}</b> memiliki 9 cap. Pilih reward untuk ditukar.</div></div>
    <div class="list">
      <button class="list-item ${jenisAwal === "diskon" ? "" : "plain"}" data-jenis="diskon" style="text-align:left">
        <span class="li-ico ico-green">${icon("wallet", 18)}</span>
        <span class="li-body"><span class="li-title">Potongan ${fmtRp(diskon)}</span>
        <span class="li-sub">Diskon langsung untuk pembelian berikutnya</span></span>
        ${jenisAwal === "diskon" ? `<span class="pill tepat">Dipilih</span>` : ""}</button>
      <button class="list-item ${jenisAwal === "poin" ? "" : "plain"}" data-jenis="poin" style="text-align:left">
        <span class="li-ico ico-gold">${icon("star", 18)}</span>
        <span class="li-body"><span class="li-title">Random point</span>
        <span class="li-sub">5–50 poin, cocok untuk repeat order</span></span>
        ${jenisAwal === "poin" ? `<span class="pill tepat">Dipilih</span>` : ""}</button>
    </div>
    ${data.pending ? `<div class="banner" style="font-size:11px">${icon("info", 15)}<span>Permintaan dari kartu member: ${esc(data.pending.jenis)}. Konfirmasi untuk menyelesaikan.</span></div>` : ""}
    <div class="field-error" data-err style="display:none"></div>
  </div>`;
  const modal = sheet({
    title: "Konfirmasi redeem",
    body,
    center: true,
    actions: `<button class="btn btn-outline grow" data-close>Batal</button>
      <button class="btn btn-navy grow" data-go>${icon("gift", 16)} Tukar Sekarang</button>`,
  });
  const el = modal.overlay.querySelector(".sheet");
  let jenis = jenisAwal;
  el.querySelectorAll("[data-jenis]").forEach((b) => {
    b.onclick = () => {
      jenis = b.dataset.jenis;
      el.querySelectorAll("[data-jenis]").forEach((x) => {
        x.classList.toggle("plain", x !== b);
        const pill = x.querySelector(".pill");
        if (x === b && !pill) x.insertAdjacentHTML("beforeend", '<span class="pill tepat">Dipilih</span>');
        if (x !== b && pill) pill.remove();
      });
    };
  });
  const btn = el.querySelector("[data-go]");
  const err = el.querySelector("[data-err]");
  btn.onclick = async () => {
    err.style.display = "none";
    setBusy(btn, true);
    try {
      const res = await post(`/api/member/${data.member.id}/redeem`, { jenis });
      modal.close();
      const nilai = res.redemption.jenis === "diskon" ? fmtRp(res.redemption.nilai) : res.redemption.nilai + " poin";
      sheet({
        title: "Redeem berhasil",
        center: true,
        body: `<div class="center" style="padding:8px 0">
          <div class="trophy" style="width:110px;height:110px;margin:0 auto;background:radial-gradient(circle at 40% 30%,rgba(94,223,176,.35),rgba(94,223,176,.05) 70%)">
            ${icon("gift", 44)}
          </div>
          <div class="h2 mt-16">${esc(nilai)}</div>
          <div class="small muted mt-8">Kartu ${esc(data.member.nama)} direset ke 0 cap.</div>
        </div>`,
        actions: `<button class="btn btn-primary btn-block" data-close>Selesai</button>`,
      });
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
      setBusy(btn, false);
    }
  };
}

/* ------------------------------------------------------------------ pending requests */
function pendingHTML(items) {
  if (!items.length) return "";
  return `<div class="section-head"><span class="section-title">Menunggu konfirmasi</span>
      <span class="chip purple">${items.length} permintaan</span></div>
    <div class="list">
      ${items.map((r) => `<div class="list-item">
        <span class="li-ico ico-purple">${icon("gift", 18)}</span>
        <span class="li-body"><span class="li-title">${esc(r.member_nama)}</span>
          <span class="li-sub">${esc(r.hp_mask || "")} · ${r.jenis === "diskon" ? "Diskon" : "Poin"} · ${timeAgo(r.waktu)}</span></span>
        <button class="btn btn-sm btn-navy" data-confirm="${r.member_id}">Konfirmasi</button>
      </div>`).join("")}
    </div>`;
}

/* ------------------------------------------------------------------ camera */
function cameraPanel() {
  return `<div class="card" style="padding:0;overflow:hidden;background:#08152E;position:relative">
    <video playsinline muted style="width:100%;height:232px;object-fit:cover;display:block;background:#08152E"></video>
    <div style="position:absolute;inset:0;display:grid;place-items:center;pointer-events:none">
      <div style="width:216px;height:118px;border-radius:18px;border:2px dashed rgba(255,255,255,.6);box-shadow:0 0 0 999px rgba(8,21,46,.28)"></div>
    </div>
    <div style="position:absolute;left:12px;right:12px;bottom:10px;display:flex;gap:8px;align-items:center;justify-content:center">
      <button class="btn btn-sm" data-cam style="background:rgba(255,255,255,.9);color:#0B2A5B">${icon("camera", 15)} Aktifkan kamera</button>
    </div>
    <div class="tiny" data-cam-state style="position:absolute;top:10px;left:12px;color:#fff;opacity:.8">Kamera belum aktif</div>
  </div>`;
}

async function startCamera(root, onCode) {
  const video = root.querySelector("video");
  const state = root.querySelector("[data-cam-state]");
  if (!video) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    state.textContent = "Kamera tidak didukung browser ini";
    toast("Kamera tidak tersedia. Gunakan input kode manual.", "err");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    stopCamera = () => {
      stream.getTracks().forEach((t) => t.stop());
      stopCamera = null;
    };
    state.textContent = "Arahkan barcode ke dalam kotak";
    if ("BarcodeDetector" in window) {
      let detector;
      try { detector = new window.BarcodeDetector({ formats: ["code_39", "code_128", "qr_code"] }); } catch (e) { detector = null; }
      if (detector) {
        let busy = false;
        const loop = async () => {
          if (!stopCamera) return;
          if (!busy && video.readyState >= 2) {
            busy = true;
            try {
              const codes = await detector.detect(video);
              if (codes && codes.length) {
                const raw = String(codes[0].rawValue || "").trim().toUpperCase();
                if (raw) {
                  stopCamera();
                  onCode(raw);
                  return;
                }
              }
            } catch (e) { /* keep scanning */ }
            busy = false;
          }
          setTimeout(loop, 280);
        };
        loop();
      } else {
        state.textContent = "Deteksi otomatis tidak tersedia — masukkan kode manual";
      }
    } else {
      state.textContent = "Perangkat belum mendukung scan otomatis";
    }
  } catch (e) {
    state.textContent = "Izin kamera ditolak";
    toast("Tidak bisa mengakses kamera. Gunakan kode manual.", "err");
  }
}

/* ------------------------------------------------------------------ page */
export async function render() {
  let pending = { items: [] };
  try { pending = await get("/api/redeem-requests"); } catch (e) { /* ignore */ }

  const html = `<main class="screen">
    <div class="sub-hero">
      <div class="st"><div class="grow"><h1>Presensi & Stempel</h1>
        <div class="stp">Scan kartu member atau cari pelanggan</div></div>
        <span class="chip dark">${icon("clock", 12)} <span data-clock>${fmtClock(nowServer())}</span></span></div>
    </div>
    <div class="pad" style="margin-top:-16px;position:relative;z-index:2">
      <div class="segmented mb-16" data-mode>
        <button class="active" data-m="scan">${icon("scan", 14)} Scan Kartu</button>
        <button data-m="cari">${icon("search", 14)} Cari Member</button>
      </div>

      <div data-panel-scan>
        ${cameraPanel()}
        <div class="card mt-16">
          <div class="label mb-8">Kode kartu manual</div>
          <div class="row gap-8">
            <input class="input grow" data-code placeholder="Contoh: AJMTV2AXBV" autocapitalize="characters">
            <button class="btn btn-primary btn-icon" data-code-go style="width:48px;height:48px;border-radius:14px">${icon("arrowRight", 18)}</button>
          </div>
          <div class="small muted mt-8">Kode terdiri dari 10 karakter, diawali <b>AJ</b>. Bisa juga ketik nomor HP member.</div>
          ${S.demo ? `<button class="btn btn-soft btn-block mt-16" data-demo>${icon("users", 16)} Cari member demo</button>` : ""}
        </div>
      </div>

      <div data-panel-cari class="hide">
        <div class="searchbar">${icon("search", 18)}<input data-q placeholder="Nama atau 4 digit terakhir nomor HP" autocomplete="off"></div>
        <div class="list mt-16" data-results>
          ${emptyState("users", "Cari pelanggan", "Hasil pencarian muncul otomatis saat kamu mengetik.")}
        </div>
      </div>

      <div data-pending>${pendingHTML(pending.items || [])}</div>

      <div class="banner mt-16" style="font-size:11px">${icon("info", 15)}
        <span>Stempel hanya bisa diberikan jika member belum memiliki 9 cap. Kartu penuh harus diredeem dulu.</span></div>
    </div>
  </main>`;

  let cleanupFn = null;

  return {
    html,
    mount(root) {
      const modeWrap = root.querySelector("[data-mode]");
      const panelScan = root.querySelector("[data-panel-scan]");
      const panelCari = root.querySelector("[data-panel-cari]");
      const codeInput = root.querySelector("[data-code]");
      const searchInput = root.querySelector("[data-q]");
      const results = root.querySelector("[data-results]");

      const clockTimer = setInterval(() => {
        const el = root.querySelector("[data-clock]");
        if (el) el.textContent = fmtClock(nowServer());
      }, 1000);

      modeWrap.querySelectorAll("[data-m]").forEach((btn) => {
        btn.onclick = () => {
          modeWrap.querySelectorAll("[data-m]").forEach((x) => x.classList.toggle("active", x === btn));
          const scan = btn.dataset.m === "scan";
          panelScan.classList.toggle("hide", !scan);
          panelCari.classList.toggle("hide", scan);
          if (!scan) {
            searchInput.focus();
            if (stopCamera) { stopCamera(); root.querySelector("[data-cam-state]").textContent = "Kamera dimatikan"; }
          }
        };
      });

      root.querySelector("[data-cam]").onclick = () => startCamera(root, (code) => {
        root.querySelector("[data-code]").value = code;
        toast("Kartu terdeteksi: " + code, "ok");
        openMemberByCode(code);
      });

      const submitCode = () => {
        const value = codeInput.value.trim().toUpperCase();
        if (!value) return;
        if (/^AJ[A-Z0-9]{6,}$/.test(value)) openMemberByCode(value);
        else {
          searchInput.value = value;
          modeWrap.querySelector('[data-m="cari"]').click();
          doSearch(value);
        }
      };
      root.querySelector("[data-code-go]").onclick = submitCode;
      codeInput.onkeydown = (e) => { if (e.key === "Enter") submitCode(); };

      const demoBtn = root.querySelector("[data-demo]");
      if (demoBtn) demoBtn.onclick = () => {
        modeWrap.querySelector('[data-m="cari"]').click();
        searchInput.value = "0812";
        doSearch("0812");
      };

      const doSearch = async (q) => {
        if (!q || q.length < 2) {
          results.innerHTML = emptyState("users", "Cari pelanggan", "Ketik minimal 2 karakter.");
          return;
        }
        results.innerHTML = `<div class="center" style="padding:22px"><span class="spinner dark" style="display:inline-block"></span></div>`;
        try {
          const data = await get("/api/member/lookup?q=" + encodeURIComponent(q));
          if (!data.items.length) {
            results.innerHTML = emptyState("search", "Tidak ditemukan", "Coba nama lain atau 4 digit terakhir nomor HP.");
            return;
          }
          results.innerHTML = data.items.map((m) => `<button class="list-item" data-member="${m.id}" style="text-align:left">
            <span class="li-ico ico-blue" style="font-weight:800">${esc(m.nama.slice(0, 1).toUpperCase())}</span>
            <span class="li-body"><span class="li-title">${esc(m.nama)}</span>
              <span class="li-sub">${esc(m.hp_mask)} · ${m.favorites.length ? "Suka " + esc(m.favorites[0].nama) : "Belum ada favorit"}</span></span>
            <span class="chip ${m.stempel >= 9 ? "green" : "blue"}">${m.stempel}/9</span>
          </button>`).join("");
          results.querySelectorAll("[data-member]").forEach((btn) => {
            btn.onclick = () => openMemberById(btn.dataset.member);
          });
        } catch (e) {
          results.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
        }
      };

      let searchTimer = null;
      searchInput.oninput = () => {
        clearTimeout(searchTimer);
        const value = searchInput.value.trim();
        searchTimer = setTimeout(() => doSearch(value), 320);
      };

      const bindPending = () => {
        root.querySelectorAll("[data-confirm]").forEach((btn) => {
          btn.onclick = async () => {
            const id = btn.dataset.confirm;
            btn.disabled = true;
            try {
              const data = await get("/api/member/" + id);
              openRedeem(data);
            } catch (e) {
              showError(e);
              btn.disabled = false;
            }
          };
        });
      };
      bindPending();

      const refreshPending = async () => {
        try {
          const data = await get("/api/redeem-requests");
          root.querySelector("[data-pending]").innerHTML = pendingHTML(data.items || []);
          bindPending();
        } catch (e) { /* ignore */ }
      };
      const onReq = () => refreshPending();
      bus.addEventListener("sse:redeem_request", onReq);

      cleanupFn = () => {
        clearInterval(clockTimer);
        clearTimeout(searchTimer);
        bus.removeEventListener("sse:redeem_request", onReq);
        if (stopCamera) { stopCamera(); stopCamera = null; }
      };
      return cleanupFn;
    },
  };
}
