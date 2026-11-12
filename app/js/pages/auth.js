/* Auth screens: employee login, member OTP, register, reset */
import { S, setSession, connectStream, rememberAccount, syncClock } from "../store.js";
import { post } from "../api.js";
import { icon, esc, toast, setBusy } from "../ui.js";
import { go } from "../nav.js";

function bottleArt() {
  return `<svg class="auth-bottle" width="104" height="132" viewBox="0 0 104 132" fill="none" aria-hidden="true">
    <rect x="40" y="4" width="24" height="20" rx="6" fill="#fff" fill-opacity=".22"/>
    <rect x="42" y="9" width="20" height="15" rx="4" fill="#fff" fill-opacity=".5"/>
    <path d="M28 46c0-11 5-18 11-24 2-2 3-5 3-8V9h20v5c0 3 1 6 3 8 6 6 11 13 11 24v38c0 15-10 26-24 26S28 99 28 84z" fill="#fff" fill-opacity=".2"/>
    <path d="M28 46c0-11 5-18 11-24 2-2 3-5 3-8V9h20v5c0 3 1 6 3 8 6 6 11 13 11 24" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>
    <path d="M34 66h36" stroke="#fff" stroke-opacity=".45" stroke-width="2"/>
    <path d="M44 26h16" stroke="#fff" stroke-opacity=".45" stroke-width="2"/>
    <circle cx="70" cy="30" r="16" fill="#5EDFB0" fill-opacity=".28"/>
    <path d="m64 30 4.4 4.4 8-8.4" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function hero(title, sub) {
  return `<div class="auth-hero">
    <div class="auth-brand"><span class="brand-mark">${icon("bottle", 18)}</span> Aroma Jiwa Hadir</div>
    <div class="auth-title">${title}</div>
    <div class="auth-sub">${sub}</div>
    ${bottleArt()}
  </div>`;
}

function tabs(active) {
  return `<div class="auth-tabs">
    <button class="${active === "pegawai" ? "active" : ""}" data-tab="pegawai">Pegawai</button>
    <button class="${active === "member" ? "active" : ""}" data-tab="member">Kartu Member</button>
  </div>`;
}

function passwordField(name, label, autocomplete) {
  return `<div class="field">
    <label class="label">${label}</label>
    <div class="pass-wrap">
      <input class="input input-lg" type="password" name="${name}" placeholder="••••••••" autocomplete="${autocomplete || "current-password"}">
      <button class="eye" type="button" data-eye tabindex="-1">${icon("eye", 18)}</button>
    </div>
  </div>`;
}

function bindEye(root) {
  root.querySelectorAll("[data-eye]").forEach((btn) => {
    btn.onclick = () => {
      const input = btn.parentElement.querySelector("input");
      input.type = input.type === "password" ? "text" : "password";
      btn.innerHTML = icon(input.type === "password" ? "eye" : "eyeOff", 18);
    };
  });
}

function bindTabs(root) {
  root.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.onclick = () => go(btn.dataset.tab === "member" ? "login-member" : "login");
  });
}

function finishEmployee(user, remember) {
  syncClock(new Date().toISOString());
  rememberAccount(user);
  setSession({ kind: "pegawai", user, remember: !!remember });
  connectStream();
}

function finishMember(member) {
  setSession({ kind: "member", member });
  connectStream();
}

/* ------------------------------------------------------------------ employee login */
export async function login() {
  const html = `<div class="auth">
    ${hero("Presensi rapi,<br>pelanggan setia.", "Satu aplikasi untuk absensi cabang, laporan kas, dan kartu loyalitas pelanggan Aroma Jiwa.")}
    <div class="auth-card"><div class="card">
      ${tabs("pegawai")}
      <form id="login-form" novalidate>
        <div class="stack">
          <div class="field">
            <label class="label">Nomor HP</label>
            <input class="input input-lg" type="tel" name="hp" inputmode="numeric" placeholder="08xxxxxxxxxx" autocomplete="username">
          </div>
          ${passwordField("password", "Kata sandi")}
          <div class="row-between">
            <label class="check"><input type="checkbox" name="remember" checked> Ingat saya 30 hari</label>
            <a class="link" href="#/reset">Lupa sandi?</a>
          </div>
          <div class="field-error" data-err style="display:none"></div>
          <button class="btn btn-primary btn-lg btn-block" type="submit" data-submit>Masuk${icon("arrowRight", 18)}</button>
        </div>
      </form>
      <div class="divider"></div>
      <div class="row-between">
        <span class="small muted">Belum punya akun pegawai?</span>
        <a class="link" href="#/register">Daftar sekarang</a>
      </div>
    </div></div>
    <div class="pad" style="margin-top:16px">
      <div class="row" style="justify-content:center;gap:16px">
        <a class="link" href="#/admin">${icon("shield", 14)} Portal Owner</a>
        <a class="link" href="#/login-member">${icon("barcode", 14)} Kartu Member</a>
      </div>
      ${S.demo ? `<div class="banner mt-16" style="font-size:11px">${icon("info", 16)}
        <span><b>Mode demo.</b> Pegawai: <b>081234560001</b> / <b>aroma123</b> · Owner PIN <b>2727</b></span></div>` : ""}
      <div class="auth-foot">Aroma Jiwa Hadir · v1.0</div>
    </div>
  </div>`;

  return {
    html,
    mount(root) {
      bindTabs(root);
      bindEye(root);
      const form = root.querySelector("#login-form");
      const err = root.querySelector("[data-err]");
      const submit = root.querySelector("[data-submit]");
      form.onsubmit = async (event) => {
        event.preventDefault();
        err.style.display = "none";
        const data = Object.fromEntries(new FormData(form).entries());
        if (!data.hp || !data.password) {
          err.textContent = "Nomor HP dan kata sandi wajib diisi.";
          err.style.display = "block";
          return;
        }
        setBusy(submit, true);
        try {
          const res = await post("/api/auth/login", {
            hp: data.hp, password: data.password, remember: !!data.remember, device: deviceName(),
          });
          finishEmployee(res.user, data.remember);
          toast("Selamat datang, " + res.user.nama.split(" ")[0] + "!", "ok");
          go("home");
        } catch (e) {
          err.textContent = e.message;
          err.style.display = "block";
          setBusy(submit, false);
        }
      };
    },
  };
}

/* ------------------------------------------------------------------ member OTP login */
export async function memberLogin() {
  const html = `<div class="auth">
    ${hero("Kartu loyalitas<br>di saku kamu.", "Masuk dengan nomor HP untuk membuka kartu stempel digital, riwayat aroma, dan reward.")}
    <div class="auth-card"><div class="card">
      ${tabs("member")}
      <div id="otp-step1">
        <div class="stack">
          <div class="field">
            <label class="label">Nomor HP</label>
            <input class="input input-lg" type="tel" name="hp" inputmode="numeric" placeholder="08xxxxxxxxxx" autocomplete="tel">
          </div>
          <div class="field">
            <label class="label">Nama lengkap <span class="muted" style="font-weight:500">(hanya untuk kartu baru)</span></label>
            <input class="input" type="text" name="nama" placeholder="Nama sesuai panggilan">
          </div>
          <div class="field-error" data-err style="display:none"></div>
          <button class="btn btn-primary btn-lg btn-block" data-send>Kirim kode akses${icon("arrowRight", 18)}</button>
          <div class="small muted center">Kode 6 angka dikirim ke WhatsApp/SMS.</div>
        </div>
      </div>
      <div id="otp-step2" class="hide">
        <div class="stack">
          <div class="banner">${icon("phone", 17)}<div>Kode dikirim ke <b data-hp></b>.<span data-demo style="display:none"><br>Mode demo: kode <b data-demo-code></b></span></div></div>
          <div class="field">
            <label class="label">Kode akses</label>
            <input class="input input-lg center" name="kode" inputmode="numeric" maxlength="6" placeholder="••••••" style="letter-spacing:10px;font-weight:800;font-size:20px">
          </div>
          <div class="field-error" data-err2 style="display:none"></div>
          <button class="btn btn-primary btn-lg btn-block" data-verify>Buka Kartu${icon("barcode", 18)}</button>
          <div class="row-between">
            <button class="btn btn-ghost btn-sm" data-back>${icon("arrowLeft", 15)} Ganti nomor</button>
            <button class="btn btn-ghost btn-sm" data-resend disabled>Kirim ulang</button>
          </div>
        </div>
      </div>
    </div></div>
    <div class="pad" style="margin-top:16px">
      <div class="row" style="justify-content:center"><a class="link" href="#/login">${icon("briefcase", 14)} Masuk sebagai pegawai</a></div>
      <div class="auth-foot">Kartu member gratis · 9 cap = parfum gratis</div>
    </div>
  </div>`;

  return {
    html,
    mount(root) {
      bindTabs(root);
      const step1 = root.querySelector("#otp-step1");
      const step2 = root.querySelector("#otp-step2");
      const err1 = step1.querySelector("[data-err]");
      const err2 = step2.querySelector("[data-err2]");
      const send = step1.querySelector("[data-send]");
      const verify = step2.querySelector("[data-verify]");
      const back = step2.querySelector("[data-back]");
      const resend = step2.querySelector("[data-resend]");
      let hp = "";

      const requestCode = async () => {
        const hpInput = step1.querySelector('[name="hp"]');
        const nama = step1.querySelector('[name="nama"]').value.trim();
        if (!hpInput.value) { err1.textContent = "Nomor HP wajib diisi."; err1.style.display = "block"; return; }
        setBusy(send, true);
        err1.style.display = "none";
        try {
          const res = await post("/api/member/otp", { hp: hpInput.value, nama });
          hp = hpInput.value;
          step2.querySelector("[data-hp]").textContent = res.hp_mask;
          if (res.kode_demo) {
            const demo = step2.querySelector("[data-demo]");
            demo.style.display = "block";
            step2.querySelector("[data-demo-code]").textContent = res.kode_demo;
            step2.querySelector('[name="kode"]').value = res.kode_demo;
          }
          step1.classList.add("hide");
          step2.classList.remove("hide");
          step2.querySelector('[name="kode"]').focus();
          toast("Kode akses dikirim.", "ok");
          startCooldown();
        } catch (e) {
          err1.textContent = e.message;
          err1.style.display = "block";
          setBusy(send, false);
        }
      };

      let timer = null;
      const startCooldown = () => {
        let left = 45;
        resend.disabled = true;
        resend.textContent = "Kirim ulang (" + left + "s)";
        clearInterval(timer);
        timer = setInterval(() => {
          left -= 1;
          if (left <= 0) {
            clearInterval(timer);
            resend.disabled = false;
            resend.textContent = "Kirim ulang";
          } else {
            resend.textContent = "Kirim ulang (" + left + "s)";
          }
        }, 1000);
      };

      send.onclick = requestCode;
      step1.querySelector('[name="hp"]').onkeydown = (e) => { if (e.key === "Enter") requestCode(); };
      resend.onclick = () => { step1.classList.remove("hide"); step2.classList.add("hide"); };
      back.onclick = () => { step1.classList.remove("hide"); step2.classList.add("hide"); };

      verify.onclick = async () => {
        const kode = step2.querySelector('[name="kode"]').value.trim();
        if (kode.length < 6) { err2.textContent = "Masukkan 6 angka kode akses."; err2.style.display = "block"; return; }
        setBusy(verify, true);
        err2.style.display = "none";
        try {
          const res = await post("/api/member/verify", { hp, kode });
          finishMember(res.member);
          toast("Kartu member kamu siap.", "ok");
          go("kartu");
        } catch (e) {
          err2.textContent = e.message;
          err2.style.display = "block";
          setBusy(verify, false);
        }
      };
      step2.querySelector('[name="kode"]').onkeydown = (e) => { if (e.key === "Enter") verify.click(); };
    },
  };
}

/* ------------------------------------------------------------------ register */
export async function register() {
  const html = `<div class="auth">
    ${hero("Daftar akun<br>pegawai baru.", "Akun pegawai terhubung ke jadwal shift dan absensi cabang yang ditetapkan owner.")}
    <div class="auth-card"><div class="card">
      <div class="sheet-head" style="margin-bottom:14px">
        <div><div class="sheet-title">Buat akun pegawai</div><div class="sheet-sub">Data dipakai untuk presensi & penggajian.</div></div>
        <a class="icon-btn plain" href="#/login">${icon("close", 18)}</a>
      </div>
      <form id="reg-form" novalidate><div class="stack">
        <div class="field"><label class="label">Nama lengkap</label>
          <input class="input" name="nama" placeholder="Nama sesuai KTP" autocomplete="name"></div>
        <div class="field"><label class="label">Nomor HP</label>
          <input class="input" type="tel" inputmode="numeric" name="hp" placeholder="08xxxxxxxxxx" autocomplete="username"></div>
        ${passwordField("password", "Kata sandi", "new-password")}
        ${passwordField("password_confirm", "Ulangi kata sandi", "new-password")}
        <label class="check"><input type="checkbox" name="remember" checked> Ingat saya di perangkat ini</label>
        <div class="field-error" data-err style="display:none"></div>
        <button class="btn btn-primary btn-lg btn-block" data-submit>Daftar & Masuk${icon("arrowRight", 18)}</button>
        <div class="small muted center">Sudah punya akun? <a class="link" href="#/login">Masuk di sini</a></div>
      </div></form>
    </div></div>
    <div class="auth-foot">Dengan mendaftar kamu menyetujui kebijakan privasi internal Aroma Jiwa.</div>
  </div>`;

  return {
    html,
    mount(root) {
      bindEye(root);
      const form = root.querySelector("#reg-form");
      const err = root.querySelector("[data-err]");
      const submit = root.querySelector("[data-submit]");
      form.onsubmit = async (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        err.style.display = "none";
        setBusy(submit, true);
        try {
          const res = await post("/api/auth/register", {
            nama: data.nama, hp: data.hp, password: data.password,
            password_confirm: data.password_confirm, remember: !!data.remember,
          });
          finishEmployee(res.user, data.remember);
          toast("Akun berhasil dibuat.", "ok");
          go("home");
        } catch (e) {
          err.textContent = e.message;
          err.style.display = "block";
          setBusy(submit, false);
        }
      };
    },
  };
}

/* ------------------------------------------------------------------ reset */
export async function reset() {
  const html = `<div class="auth">
    ${hero("Lupa kata sandi?", "Verifikasi nomor HP dan nama lengkap, lalu buat kata sandi baru. Semua sesi lama otomatis berakhir.")}
    <div class="auth-card"><div class="card">
      <div class="sheet-head" style="margin-bottom:14px">
        <div><div class="sheet-title">Atur ulang sandi</div><div class="sheet-sub">Hanya bisa dilakukan dari halaman login.</div></div>
        <a class="icon-btn plain" href="#/login">${icon("close", 18)}</a>
      </div>
      <form id="reset-form" novalidate><div class="stack">
        <div class="field"><label class="label">Nomor HP terdaftar</label>
          <input class="input" type="tel" inputmode="numeric" name="hp" placeholder="08xxxxxxxxxx"></div>
        <div class="field"><label class="label">Nama lengkap</label>
          <input class="input" name="nama" placeholder="Sesuai data akun"></div>
        ${passwordField("password", "Kata sandi baru", "new-password")}
        <div class="banner">${icon("shield", 17)}<div>Demi keamanan, semua sesi di perangkat lain akan diakhiri.</div></div>
        <div class="field-error" data-err style="display:none"></div>
        <button class="btn btn-primary btn-lg btn-block" data-submit>Simpan Kata Sandi</button>
        <a class="btn btn-ghost btn-block" href="#/login">${icon("arrowLeft", 16)} Kembali ke login</a>
      </div></form>
    </div></div>
  </div>`;

  return {
    html,
    mount(root) {
      bindEye(root);
      const form = root.querySelector("#reset-form");
      const err = root.querySelector("[data-err]");
      const submit = root.querySelector("[data-submit]");
      form.onsubmit = async (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        err.style.display = "none";
        setBusy(submit, true);
        try {
          const res = await post("/api/auth/reset", data);
          toast(res.pesan || "Kata sandi berhasil diubah.", "ok");
          go("login");
        } catch (e) {
          err.textContent = e.message;
          err.style.display = "block";
          setBusy(submit, false);
        }
      };
    },
  };
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
