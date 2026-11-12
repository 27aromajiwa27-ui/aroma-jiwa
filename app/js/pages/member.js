/* Member digital card: flip card, stamps, realtime, redeem, rating, history, profile */
import { get, post, patch } from "../api.js";
import { S, bus, nowServer, applyTheme, disconnectStream, setSession } from "../store.js";
import {
  icon, esc, toast, sheet, confirmSheet, emptyState, fmtRp, fmtDateShort, fmtDateTime, fmtClock,
  timeAgo, barcodeSVG, progressBar, confetti, starsRow, setBusy, showError, initials, chip,
  fmtDateFull, minutesText,
} from "../ui.js";
import { go, reload } from "../nav.js";

const TAGS = ["Wangi tahan lama", "Pelayanan ramah", "Harga pas", "Tempat nyaman", "Cepat"];
const REWARD_LABEL = { diskon: "Potongan harga", poin: "Random point" };

/* ------------------------------------------------------------------ card parts */
function stampGrid(stempel) {
  return Array.from({ length: 9 }, (_, i) => {
    const filled = i < stempel;
    return `<div class="stamp ${filled ? "filled" : ""}">
      ${filled ? `<span class="stamp-in">${icon("check", 17)}</span>` : i + 1}
    </div>`;
  }).join("");
}

function flipCard(d) {
  const m = d.member;
  return `<div class="mcard-scene" style="height:420px">
    <div class="mcard" data-flip role="button" tabindex="0" aria-label="Kartu member, ketuk untuk membalik">
      <div class="mface front">
        <div class="mcard-top">
          <div class="mcard-brand">${icon("bottle", 18)} Aroma Jiwa Hadir</div>
          <span class="mcard-chip">MEMBER</span>
        </div>
        <div class="mcard-ribbon">KARTU LOYALITAS</div>
        <div class="mcard-fields">
          <div class="mcard-field"><div class="lbl">Nama member</div><div class="val">${esc(m.nama)}</div></div>
          <div class="mcard-field" style="flex:0 0 33%"><div class="lbl">Nomor kartu</div><div class="val">${esc(m.kode.slice(-5))}</div></div>
        </div>
        <div class="mcard-grid" style="max-width:252px;margin:0 auto">${stampGrid(d.stempel)}</div>
        <div class="loyalty-vertical">AROMA JIWA HADIR</div>
        <div class="mcard-foot"><span>SEJAK ${esc(String(m.dibuat || "").slice(0, 4))}</span><span>${d.stempel}/9 STEMPEL</span></div>
      </div>
      <div class="mface back">
        <div class="mcard-top">
          <div class="mcard-brand">${icon("bottle", 18)} Aroma Jiwa Hadir</div>
          <span class="mcard-chip">SCAN DI KASIR</span>
        </div>
        <div style="padding:16px 20px 0;position:relative;z-index:2">
          <div class="barcode-box" style="width:100%;padding:12px 14px 8px">
            <div style="height:82px">${barcodeSVG(m.kode, { height: 82 })}</div>
            <div class="barcode-num">${esc(m.kode)}</div>
          </div>
          <div class="small" style="opacity:.78;margin-top:14px;line-height:1.55">
            Tunjukkan kartu ini ke pegawai untuk menambah stempel atau mengonfirmasi redeem.
          </div>
          <div class="row-between" style="margin-top:14px;font-size:10px;opacity:.62">
            <span>${esc(m.hp_mask)}</span><span>${d.stempel}/9</span>
          </div>
        </div>
        <div class="mcard-foot"><span>KETUK UNTUK KEMBALI</span><span>AROMA JIWA</span></div>
      </div>
    </div>
  </div>`;
}

function progressBlock(d) {
  const sisa = Math.max(0, 9 - d.stempel);
  const pending = d.pending;
  return `<div class="card">
    <div class="row-between">
      <div><div class="tiny muted">Progres kartu</div>
        <div class="h2" style="margin-top:2px">${d.stempel} <span class="muted" style="font-size:15px;font-weight:700">/ 9 stempel</span></div></div>
      <span class="chip ${d.stempel >= 9 ? "green" : "blue"}">${d.stempel >= 9 ? "Siap redeem" : `${sisa} lagi`}</span>
    </div>
    <div class="mt-16">${progressBar((d.stempel / 9) * 100, d.stempel >= 9 ? "green" : "")}</div>
    ${pending ? `<div class="banner purple mt-16">${icon("gift", 16)}
      <div><b>Menunggu konfirmasi pegawai</b><br>Permintaan ${REWARD_LABEL[pending.jenis] || pending.jenis} sudah dikirim. Tunjukkan barcode ke kasir.</div></div>`
      : `<button class="btn ${d.bisa_redeem ? "btn-primary" : "btn-soft"} btn-block mt-16" data-redeem ${d.bisa_redeem ? "" : "disabled"}>
          ${icon("gift", 17)} ${d.bisa_redeem ? "Tukar 9 stempel" : "Kumpulkan 9 stempel untuk redeem"}</button>`}
  </div>`;
}

function ratingPrompt(d) {
  if (!d.show_rating || !d.last_stamp) return "";
  return `<button class="card" data-rating style="width:100%;text-align:left;border-color:rgba(245,197,66,.5);background:linear-gradient(135deg,#FFFBEF,#FFF6DE)">
    <div class="row">
      <span class="stat-ico ico-gold" style="width:40px;height:40px">${icon("star", 18)}</span>
      <div class="grow"><div class="strong small">Bagaimana pengalamanmu?</div>
        <div class="tiny muted">Beri rating untuk kunjungan tadi</div></div>
      <span class="pill gold">Beri rating</span>
    </div>
  </button>`;
}

function favoritesBlock(d) {
  const favs = d.favorites || [];
  const similar = d.similar || [];
  if (!favs.length && !similar.length) return "";
  return `<div class="card">
    <div class="row-between mb-8"><div class="card-title">Aroma favoritmu</div>
      ${favs.length ? `<span class="tiny muted">${favs.reduce((n, f) => n + f.jumlah, 0)}x pembelian</span>` : ""}</div>
    ${favs.length ? `<div class="row wrap gap-6">${favs.map((f) => `<span class="chip blue">${esc(f.aroma_nama)} · ${f.jumlah}x</span>`).join("")}</div>`
      : '<div class="small muted">Belum ada catatan aroma. Minta pegawai mencatat aroma saat memberi stempel.</div>'}
    ${similar.length ? `<div class="divider" style="height:1px;background:var(--line);margin:14px 0"></div>
      <div class="tiny muted mb-8">Mungkin kamu suka</div>
      ${similar.map((a) => `<div class="row-between" style="padding:6px 0">
        <div class="row gap-8">${icon("droplet", 14)}<span class="small strong">${esc(a.nama)}</span>
          <span class="tiny muted">${esc(a.kategori)}</span></div>
        <span class="tiny muted">${a.harga ? fmtRp(a.harga) : ""}</span></div>`).join("")}` : ""}
  </div>`;
}

/* ------------------------------------------------------------------ member card page */
export async function card() {
  let data = await get("/api/member/me");

  const html = `<main class="screen">
    <div class="kartu-head">
      <div class="brand" style="color:var(--text)"><span class="brand-mark" style="background:var(--grad);color:#fff">${icon("bottle", 17)}</span>
        Aroma Jiwa Hadir</div>
      <div class="row gap-6">
        <button class="icon-btn surface" data-notif>${icon("bell", 17)}
          ${data.unread ? '<span class="bell-dot"></span>' : ""}</button>
        <button class="icon-btn surface" data-logout>${icon("logout", 17)}</button>
      </div>
    </div>
    <div class="kartu-body">
      <div class="small muted mb-8" style="margin-top:2px">Halo, <b style="color:var(--text)">${esc(data.member.nama)}</b></div>
      <div data-card>${flipCard(data)}</div>
      <div class="stack mt-16" data-extra>
        ${progressBlock(data)}
        ${ratingPrompt(data)}
        ${favoritesBlock(data)}
      </div>
      <div class="center tiny muted mt-24" style="line-height:1.7">
        Kartu tersinkron otomatis dengan kasir.<br>Stempel sah hanya setelah dikonfirmasi pegawai.
      </div>
    </div>
  </main>`;

  return {
    html,
    mount(root) {
      const cardEl = root.querySelector("[data-card]");
      const extraEl = root.querySelector("[data-extra]");

      const bindFlip = () => {
        const el = cardEl.querySelector("[data-flip]");
        if (!el) return;
        const flip = () => el.classList.toggle("flipped");
        el.onclick = flip;
        el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } };
      };
      const bindExtra = () => {
        const redeem = extraEl.querySelector("[data-redeem]");
        if (redeem) redeem.onclick = () => openRedeem(data);
        const rating = extraEl.querySelector("[data-rating]");
        if (rating) rating.onclick = () => openRating(data, refresh);
      };
      const paint = () => {
        cardEl.innerHTML = flipCard(data);
        extraEl.innerHTML = progressBlock(data) + ratingPrompt(data) + favoritesBlock(data);
        bindFlip();
        bindExtra();
      };
      bindFlip();
      bindExtra();

      async function refresh() {
        try {
          data = await get("/api/member/me");
          paint();
          const bell = root.querySelector("[data-notif]");
          const dot = bell.querySelector(".bell-dot");
          if (data.unread && !dot) bell.insertAdjacentHTML("beforeend", '<span class="bell-dot"></span>');
          if (!data.unread && dot) dot.remove();
        } catch (e) { /* keep last data */ }
      }

      root.querySelector("[data-notif]").onclick = () => openNotifications(data, refresh);
      root.querySelector("[data-logout]").onclick = async () => {
        const ok = await confirmSheet({
          title: "Keluar dari kartu?",
          body: "Kamu bisa masuk lagi dengan nomor HP dan kode OTP.",
          confirm: "Keluar",
          danger: true,
        });
        if (!ok) return;
        try { await post("/api/member/logout"); } catch (e) { /* ignore */ }
        setSession(null);
        disconnectStream();
        go("login-member");
      };

      const onStamp = (event) => {
        const payload = event.detail || {};
        toast(`Stempel baru! ${payload.stempel || ""}${payload.stempel ? "/9" : ""}`.trim(), "ok");
        refresh();
      };
      const onCelebrate = () => {
        refresh();
        celebrate(data);
      };
      const onRedeem = (event) => {
        const d = event.detail || {};
        toast(`Redeem berhasil: ${REWARD_LABEL[d.jenis] || d.jenis}${d.nilai ? " " + (d.jenis === "diskon" ? fmtRp(d.nilai) : d.nilai + " poin") : ""}`, "ok");
        refresh();
      };
      const onNotify = (event) => {
        const d = event.detail || {};
        toast(d.isi || "Kartu kamu mendekati penuh.", "ok");
        refresh();
      };

      bus.addEventListener("sse:stamp", onStamp);
      bus.addEventListener("sse:celebrate", onCelebrate);
      bus.addEventListener("sse:redeem", onRedeem);
      bus.addEventListener("sse:member_notify", onNotify);

      if (data.show_rating && data.last_stamp) {
        setTimeout(() => openRating(data, refresh), 1200);
      }

      return () => {
        bus.removeEventListener("sse:stamp", onStamp);
        bus.removeEventListener("sse:celebrate", onCelebrate);
        bus.removeEventListener("sse:redeem", onRedeem);
        bus.removeEventListener("sse:member_notify", onNotify);
      };
    },
  };
}

/* ------------------------------------------------------------------ celebration */
function celebrate(data) {
  if (document.getElementById("celebrate-layer")) return;
  const el = document.createElement("div");
  el.id = "celebrate-layer";
  el.className = "celebrate";
  el.innerHTML = `<div class="trophy">${icon("gift", 66)}</div>
    <h2>Kartu penuh!</h2>
    <p>Selamat ${esc((data.member && data.member.nama) || "")}! Sembilan stempel sudah lengkap. Pilih reward, lalu tunjukkan barcode ke kasir.</p>
    <div class="redeem-options">
      <button class="redeem-opt" data-jenis="diskon">
        <span class="ro-ico">${icon("wallet", 18)}</span>
        <span class="grow"><span style="font-weight:800;font-size:13px;display:block">Potongan ${fmtRp(data.diskon || 24000)}</span>
          <span style="font-size:11px;opacity:.75">Diskon langsung pembelian berikutnya</span></span>
        ${icon("chevronRight", 16)}</button>
      <button class="redeem-opt" data-jenis="poin">
        <span class="ro-ico">${icon("star", 18)}</span>
        <span class="grow"><span style="font-weight:800;font-size:13px;display:block">Random point</span>
          <span style="font-size:11px;opacity:.75">5–50 poin untuk repeat order</span></span>
        ${icon("chevronRight", 16)}</button>
    </div>
    <button class="btn btn-ghost mt-24" data-close style="color:#fff">Nanti saja</button>`;
  document.body.appendChild(el);
  confetti(el, 60);

  el.querySelector("[data-close]").onclick = () => el.remove();
  el.querySelectorAll("[data-jenis]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await post("/api/member/me/redeem", { jenis: btn.dataset.jenis });
        el.remove();
        toast("Permintaan redeem terkirim. Tunjukkan barcode ke kasir.", "ok");
        reload();
      } catch (e) { showError(e); }
    };
  });
  setTimeout(() => { if (el.isConnected) el.querySelector("[data-close]").focus(); }, 200);
}

/* ------------------------------------------------------------------ redeem request */
function openRedeem(d) {
  const diskon = Number(d.diskon || 24000);
  const modal = sheet({
    title: "Tukar 9 stempel",
    sub: "Pilih satu reward, lalu konfirmasi bersama pegawai",
    center: true,
    body: `<div class="list">
      <button class="list-item" data-jenis="diskon" style="text-align:left">
        <span class="li-ico ico-green">${icon("wallet", 18)}</span>
        <span class="li-body"><span class="li-title">Potongan ${fmtRp(diskon)}</span>
          <span class="li-sub">Berlaku untuk pembelian berikutnya</span></span>
        ${icon("chevronRight", 16)}</button>
      <button class="list-item" data-jenis="poin" style="text-align:left">
        <span class="li-ico ico-gold">${icon("star", 18)}</span>
        <span class="li-body"><span class="li-title">Random point</span>
          <span class="li-sub">5–50 poin sesuai pengaturan owner</span></span>
        ${icon("chevronRight", 16)}</button>
    </div>
    <div class="banner mt-16" style="font-size:11px">${icon("info", 15)}
      <span>Setelah memilih, tunjukkan barcode ke pegawai. Stempel akan direset setelah dikonfirmasi.</span></div>`,
  });
  modal.overlay.querySelectorAll("[data-jenis]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await post("/api/member/me/redeem", { jenis: btn.dataset.jenis });
        modal.close();
        toast("Permintaan redeem terkirim.", "ok");
        reload();
      } catch (e) { showError(e); }
    };
  });
}

/* ------------------------------------------------------------------ rating */
function openRating(d, refresh) {
  let bintang = 5;
  let picked = [];
  const modal = sheet({
    title: "Beri rating",
    sub: "Penilaianmu membantu kualitas layanan",
    center: true,
    tall: true,
    body: `<div class="stack">
      <div class="stars" data-stars>
        ${[1, 2, 3, 4, 5].map((i) => `<button class="star-btn ${i <= bintang ? "on" : ""}" data-star="${i}">★</button>`).join("")}
      </div>
      <div class="center small muted" data-star-label>${bintang} bintang</div>
      <div class="field"><div class="label">Apa yang paling berkesan?</div>
        <div class="tag-pick" data-tags>
          ${TAGS.map((t) => `<button data-tag="${esc(t)}">${esc(t)}</button>`).join("")}
        </div></div>
      <div class="field"><div class="label">Komentar (opsional)</div>
        <textarea class="textarea" data-komentar rows="2" maxlength="200" placeholder="Tulis pengalamanmu…"></textarea></div>
      <div class="field-error" data-err style="display:none"></div>
    </div>`,
    actions: `<button class="btn btn-outline grow" data-close>Nanti</button>
      <button class="btn btn-primary grow" data-go>${icon("star", 16)} Kirim rating</button>`,
  });
  const el = modal.overlay.querySelector(".sheet");
  el.querySelectorAll("[data-star]").forEach((btn) => {
    btn.onclick = () => {
      bintang = Number(btn.dataset.star);
      el.querySelectorAll("[data-star]").forEach((b) => b.classList.toggle("on", Number(b.dataset.star) <= bintang));
      el.querySelector("[data-star-label]").textContent = bintang + " bintang";
    };
  });
  el.querySelectorAll("[data-tag]").forEach((btn) => {
    btn.onclick = () => {
      const tag = btn.dataset.tag;
      if (picked.includes(tag)) {
        picked = picked.filter((t) => t !== tag);
        btn.classList.remove("on");
      } else if (picked.length < 4) {
        picked.push(tag);
        btn.classList.add("on");
      } else {
        toast("Maksimal 4 tag.", "err");
      }
    };
  });
  const err = el.querySelector("[data-err]");
  const goBtn = el.querySelector("[data-go]");
  goBtn.onclick = async () => {
    err.style.display = "none";
    setBusy(goBtn, true);
    try {
      await post("/api/member/me/rating", {
        stamp_id: d.last_stamp.id,
        bintang,
        tag: picked,
        komentar: el.querySelector("[data-komentar]").value.trim(),
      });
      modal.close();
      toast("Terima kasih atas penilaianmu!", "ok");
      refresh();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = "block";
      setBusy(goBtn, false);
    }
  };
}

/* ------------------------------------------------------------------ notifications sheet */
function openNotifications(d, refresh) {
  const items = d.notifications || [];
  const modal = sheet({
    title: "Notifikasi",
    sub: `${d.unread || 0} belum dibaca`,
    tall: true,
    body: `<div class="stack-sm" data-list>
      ${items.length ? items.map((n) => `<div class="list-item plain" style="align-items:flex-start;cursor:default">
        <span class="li-ico ${n.jenis === "stamp" ? "ico-green" : n.jenis === "redeem" ? "ico-purple" : "ico-blue"}">${icon(n.jenis === "stamp" ? "sparkles" : n.jenis === "redeem" ? "gift" : "bell", 17)}</span>
        <span class="li-body"><span class="li-title">${esc(n.isi)}</span>
          <span class="tiny muted">${timeAgo(n.waktu)}${n.dibaca ? "" : " · Baru"}</span></span>
      </div>`).join("") : emptyState("bell", "Belum ada notifikasi", "Pengingat stempel akan muncul di sini.")}
    </div>
    ${items.length ? `<button class="btn btn-soft btn-block mt-16" data-read>${icon("checkCircle", 16)} Tandai semua dibaca</button>` : ""}`,
  });
  const btn = modal.overlay.querySelector("[data-read]");
  if (btn) btn.onclick = async () => {
    try {
      await post("/api/member/me/notifications/read");
      modal.close();
      refresh();
      toast("Notifikasi ditandai dibaca.", "ok");
    } catch (e) { showError(e); }
  };
}

/* ------------------------------------------------------------------ history page */
export async function history() {
  const d = await get("/api/member/me");
  const rows = d.history || [];
  const purchases = d.purchases || [];
  const stamps = rows.filter((r) => r.jenis === "stempel").length;
  const redeems = rows.filter((r) => r.jenis === "redeem").length;
  let filter = "semua";

  const html = `<main class="screen">
    <div class="sub-hero">
      <div class="st"><div class="grow"><h1>Riwayat Kartu</h1>
        <div class="stp">${esc(d.member.kode)} · ${esc(d.member.nama)}</div></div>
        <a class="back-btn" href="#/kartu">${icon("barcode", 17)}</a></div>
    </div>
    <div class="pad" style="margin-top:-14px;position:relative;z-index:2">
      <div class="stat-row">
        <div class="stat-card"><div class="stat-ico ico-green">${icon("sparkles", 16)}</div>
          <div class="v">${stamps}</div><div class="k">Stempel</div></div>
        <div class="stat-card"><div class="stat-ico ico-purple">${icon("gift", 16)}</div>
          <div class="v">${redeems}</div><div class="k">Redeem</div></div>
        <div class="stat-card"><div class="stat-ico ico-blue">${icon("droplet", 16)}</div>
          <div class="v">${purchases.length}</div><div class="k">Pembelian</div></div>
      </div>

      <div class="section-head" style="margin-top:20px"><span class="section-title">Aktivitas</span></div>
      <div class="range-tabs mb-8" data-filters>
        ${[["semua", "Semua"], ["stempel", "Stempel"], ["redeem", "Redeem"]].map(([slug, label]) =>
          `<button data-filter="${slug}" class="${slug === filter ? "active" : ""}">${label}</button>`).join("")}
      </div>
      <div class="list" data-list></div>

      ${purchases.length ? `<div class="section-head"><span class="section-title">Pembelian tercatat</span></div>
        <div class="list">${purchases.map((p) => `<div class="list-item plain" style="cursor:default">
          <span class="li-ico ico-blue">${icon("droplet", 17)}</span>
          <span class="li-body"><span class="li-title">${esc(p.aroma_nama || "Aroma")}${p.ukuran ? " · " + p.ukuran + " ml" : ""}</span>
            <span class="li-sub">${esc(p.branch_nama || "-")} · ${fmtDateShort(p.waktu)}</span></span>
          <span class="tiny muted">${fmtClock(p.waktu)}</span>
        </div>`).join("")}</div>` : ""}
    </div>
  </main>`;

  return {
    html,
    mount(root) {
      const listEl = root.querySelector("[data-list]");
      const draw = () => {
        const shown = rows.filter((r) => (filter === "semua" ? true : r.jenis === filter));
        listEl.innerHTML = shown.length ? shown.map((r) => `<div class="list-item plain" style="cursor:default">
          <span class="li-ico ${r.jenis === "redeem" ? "ico-purple" : "ico-green"}">${icon(r.jenis === "redeem" ? "gift" : "sparkles", 17)}</span>
          <span class="li-body"><span class="li-title">${r.jenis === "redeem"
            ? `Redeem ${REWARD_LABEL[r.reward] || r.reward || ""}${r.nilai ? " · " + (r.reward === "diskon" ? fmtRp(r.nilai) : r.nilai + " poin") : ""}`
            : "Stempel diperoleh"}</span>
            <span class="li-sub">${esc(r.branch || "-")}${r.pegawai ? " · " + esc(r.pegawai) : ""}</span></span>
          <span class="tiny muted nowrap">${fmtDateShort(r.waktu)}<br>${fmtClock(r.waktu)}</span>
        </div>`).join("") : emptyState("clock", "Belum ada aktivitas", "Stempel pertama akan muncul di sini.");
      };
      draw();
      root.querySelectorAll("[data-filter]").forEach((btn) => {
        btn.onclick = () => {
          filter = btn.dataset.filter;
          root.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("active", b === btn));
          draw();
        };
      });
    },
  };
}

/* ------------------------------------------------------------------ profile page */
export async function profile() {
  const d = await get("/api/member/me");
  const theme = S.theme || "system";
  const prefs = d.prefs || {};
  const notif = prefs.notif || { stamp: true, promo: true };
  const favs = d.favorites || [];

  const html = `<main class="screen">
    <div class="sub-hero">
      <div class="st"><div class="grow"><h1>Profil Member</h1>
        <div class="stp">${esc(d.member.hp_mask)}</div></div>
        <a class="back-btn" href="#/kartu">${icon("barcode", 17)}</a></div>
    </div>
    <div class="pad" style="margin-top:-14px;position:relative;z-index:2">
      <div class="card">
        <div class="row">
          <span style="width:54px;height:54px;border-radius:18px;background:var(--grad);color:#fff;display:grid;place-items:center;font-weight:800;font-size:18px">
            ${esc(initials(d.member.nama))}</span>
          <div class="grow"><div class="h3">${esc(d.member.nama)}</div>
            <div class="small muted">${esc(d.member.kode)}</div></div>
          <span class="chip ${d.stempel >= 9 ? "green" : "blue"}">${d.stempel}/9</span>
        </div>
        <div class="divider" style="height:1px;background:var(--line);margin:14px 0"></div>
        <div class="kv"><span class="k">Bergabung</span><span class="v">${fmtDateFull(d.member.dibuat)}</span></div>
        <div class="kv"><span class="k">Total stempel</span><span class="v">${(d.history || []).filter((h) => h.jenis === "stempel").length}</span></div>
        <div class="kv"><span class="k">Total redeem</span><span class="v">${(d.redemptions || []).length}</span></div>
      </div>

      ${favs.length ? `<div class="section-head"><span class="section-title">Aroma favorit</span></div>
        <div class="card"><div class="row wrap gap-6">${favs.map((f) => `<span class="chip blue">${esc(f.aroma_nama)} · ${f.jumlah}x</span>`).join("")}</div></div>` : ""}

      <div class="section-head"><span class="section-title">Tampilan</span></div>
      <div class="card">
        <div class="segmented" data-theme-pick>
          <button data-mode="light" class="${theme === "light" ? "active" : ""}">Terang</button>
          <button data-mode="dark" class="${theme === "dark" ? "active" : ""}">Gelap</button>
          <button data-mode="system" class="${theme === "system" ? "active" : ""}">Sistem</button>
        </div>
      </div>

      <div class="section-head"><span class="section-title">Preferensi</span></div>
      <div class="card">
        ${[["stamp", "Pengingat stempel", "Saat kartu hampir penuh"],
           ["promo", "Info promo", "Penawaran dan aroma baru"]].map(([key, title, sub]) => `
          <div class="row-between" style="padding:10px 0;border-bottom:1px solid var(--line)">
            <div class="grow"><div class="strong small">${title}</div><div class="tiny muted">${sub}</div></div>
            <button class="switch ${notif[key] !== false ? "on" : ""}" data-notif="${key}"></button>
          </div>`).join("")}
      </div>

      <div class="section-head"><span class="section-title">Lainnya</span></div>
      <div class="list">
        <button class="list-item" data-read style="text-align:left">
          <span class="li-ico ico-blue">${icon("checkCircle", 18)}</span>
          <span class="li-body"><span class="li-title">Tandai notifikasi dibaca</span>
            <span class="li-sub">${d.unread || 0} notifikasi belum dibaca</span></span>
          <span class="chev">${icon("chevronRight", 16)}</span></button>
        <button class="list-item" data-logout style="text-align:left">
          <span class="li-ico ico-red">${icon("logout", 18)}</span>
          <span class="li-body"><span class="li-title">Keluar</span>
            <span class="li-sub">Akhiri sesi kartu di perangkat ini</span></span>
          <span class="chev">${icon("chevronRight", 16)}</span></button>
      </div>

      <div class="center tiny muted mt-24" style="line-height:1.7">
        Aroma Jiwa Hadir v1.0 · Kartu digital<br>Stempel sah setelah dikonfirmasi pegawai
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
          try { await patch("/api/member/me/prefs", { tema: mode }); } catch (e) { showError(e); }
        };
      });
      root.querySelectorAll("[data-notif]").forEach((btn) => {
        btn.onclick = async () => {
          const key = btn.dataset.notif;
          const next = !btn.classList.contains("on");
          btn.classList.toggle("on", next);
          try {
            await patch("/api/member/me/prefs", { notif: { [key]: next } });
          } catch (e) {
            btn.classList.toggle("on", !next);
            showError(e);
          }
        };
      });
      root.querySelector("[data-read]").onclick = async () => {
        try {
          await post("/api/member/me/notifications/read");
          toast("Notifikasi ditandai dibaca.", "ok");
          reload();
        } catch (e) { showError(e); }
      };
      root.querySelector("[data-logout]").onclick = async () => {
        const ok = await confirmSheet({
          title: "Keluar dari kartu?",
          body: "Kamu bisa masuk lagi dengan nomor HP dan kode OTP.",
          confirm: "Keluar",
          danger: true,
        });
        if (!ok) return;
        try { await post("/api/member/logout"); } catch (e) { /* ignore */ }
        setSession(null);
        disconnectStream();
        go("login-member");
      };
    },
  };
}
