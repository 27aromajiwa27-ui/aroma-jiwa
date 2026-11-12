# Aroma Jiwa Hadir — APK Android

Pembungkus WebView untuk aplikasi PWA Aroma Jiwa Hadir. Aplikasi web-nya
sendiri tetap satu sumber di folder `app/` dan dilayani oleh server Python
(`python3 run.py`); APK ini hanya menampilkan alamat server tersebut.

## Yang dibutuhkan

Sudah terpasang di mesin ini, jadi build tidak perlu Android Studio:

- JDK 17 — `/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home`
- Android SDK — `~/Library/Android/sdk` (platform `android-37.0`, build-tools `36.0.0`)
- Gradle 9.9.1 lewat wrapper yang ikut di folder ini (`./gradlew`)

- HP Android 7.0 (API 24) ke atas.
- Server aplikasi berjalan dan bisa dijangkau HP:
  - uji lokal: Mac menjalankan `python3 run.py`, HP di Wi-Fi yang sama,
    alamat `http://<IP-Mac>:4000` (IP saat ini: `192.168.1.117`)
  - produksi: alamat publik `https://...`

## Build lewat terminal (tercepat)

```
cd android
export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home
./gradlew assembleRelease     # -> dist/AromaJiwaHadir-1.0.0.apk
./gradlew assembleDebug       # -> dist/AromaJiwaHadir-1.0.0-debug.apk
```

Alamat server bisa diganti tanpa mengedit berkas:

```
./gradlew assembleRelease -PAROMA_BASE_URL=https://aromajiwa.duckdns.org
```

## Langkah build lewat Android Studio

1. Buka **Android Studio → Open**, pilih folder `android/` ini.
2. Tunggu **Gradle Sync** selesai (unduhan pertama butuh internet).
3. Opsional, ubah alamat server: buka `gradle.properties`, sesuaikan baris
   `AROMA_BASE_URL=http://192.168.1.117:4000` lalu **Sync** lagi.
4. Menu **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
5. Klik **locate** pada notifikasi, atau ambil berkasnya di:
   `android/app/build/outputs/apk/debug/app-debug.apk`

Untuk APK rilis/rilis internal:

```
./gradlew assembleRelease     # butuh Gradle wrapper (lihat catatan di bawah)
```

APK rilis sudah ditandatangani dengan debug keystore sehingga bisa langsung
dipasang. Untuk Play Store, ganti `signingConfig` di `app/build.gradle.kts`
dengan keystore rilis milik Anda.

## Memasang di HP

Tiga APK di `dist/`, isinya sama, bedanya hanya alamat server yang tertanam:

| Berkas | Alamat server |
|---|---|
| `AromaJiwaHadir-1.0.0.apk` | `http://192.168.1.117:4000` (uji di Wi-Fi yang sama) |
| `AromaJiwaHadir-1.0.0-online.apk` | `https://fc07411bccf19b.lhr.life` (tunnel sementara, bisa dari mana saja) |
| `AromaJiwaHadir-1.0.0-debug.apk` | versi debug, id aplikasi `.debug` |

- Salin salah satunya ke HP (kabel/USB, Google Drive, atau WhatsApp diri sendiri),
  ketuk berkasnya, izinkan "Install unknown apps".
- Atau lewat kabel: `adb install -r dist/AromaJiwaHadir-1.0.0.apk`
- Debug dan rilis punya applicationId berbeda (`...hadir.debug` vs `...hadir`),
  jadi keduanya bisa terpasang berdampingan.
- Alamat server bisa diganti tanpa build ulang: tahan tombol back, atau tombol
  *Ubah alamat server* di layar offline.

## Mengubah alamat server tanpa rebuild

- Saat server tidak terjangkau, APK menampilkan halaman **"Server tidak
  terjangkau"** dengan tombol *Ubah alamat server*.
- Kapan pun: **tahan tombol back** ±0,5 detik → dialog alamat server.
- Pilihan *Kembalikan default* menghapus simpanan lokal dan memakai
  `AROMA_BASE_URL` dari build.

## Perilaku native yang sudah dijembatani

| Kebutuhan aplikasi web | Penanganan di APK |
|---|---|
| Presensi GPS (`navigator.geolocation`) | jembatan `AromaAndroid.requestLocation()` → GPS/Network provider native (WebView http sering menolak geolocation) |
| Scan kamera (`getUserMedia`) | izin kamera + `onPermissionRequest` (BarcodeDetector tidak tersedia di WebView → jatuh ke input kode manual) |
| Unduh PDF (blob dari `fetch`) | jembatan `AromaAndroid.saveFile()` → `Downloads/Aroma Jiwa/` + tawaran buka PDF |
| Sesi login | Cookie WebView persisten |
| Tombol back | mengikuti riwayat hash SPA, tekan dua kali untuk keluar |
| Server mati | `assets/offline.html` + tombol **Uji koneksi** (`AromaAndroid.probe()`, permintaan HTTP dilakukan native karena halaman offline berjalan di `file://`) |

## Catatan toolchain

- Wrapper disertakan (`gradle/wrapper/gradle-wrapper.jar`) dan dipatok ke
  **Gradle 9.9.1**.
- **AGP 9.5.1**, `compileSdk = 37`, `buildToolsVersion = "36.0.0"` mengikuti SDK
  yang terpasang (platform `android-37.0`). AGP 8.x menolak nama platform ini.
- `targetSdk` tetap **34** supaya perilaku WebView (status bar, edge-to-edge di
  Android 15+) tidak berubah. Untuk Play Store, targetSdk 35+ wajib untuk
  unggahan baru.
- `local.properties` berisi `sdk.dir` khusus mesin ini.
- APK rilis ditandatangani dengan debug keystore, cukup untuk dipasang manual.
  Untuk Play Store, ganti `signingConfig` dengan keystore rilis Anda sendiri.

## Alternatif: PWABuilder (Trusted Web Activity)

Jalur ini tidak memakai folder `android/` sama sekali. PWABuilder membungkus
situs dengan Chrome asli, jadi GPS, kamera, dan unduhan PDF bekerja tanpa
jembatan native. Syarat mutlaknya: **situs harus sudah online di HTTPS**.

1. Pastikan server aplikasi dilayani di HTTPS pada nama domain, bukan IP LAN.
2. Buka <https://www.pwabuilder.com>, masukkan `https://domain-anda/`, klik
   **Start**, lalu **Package for stores → Android**.
3. Isi *Package ID* (mis. `id.aromajiwa.hadir.twa`), nama, dan versi. Pilih
   **Create new signing key** bila belum punya, lalu **Generate**.
4. Unduh zip hasilnya. Isinya antara lain:
   - `app-release-signed.apk` → langsung bisa dipasang di HP
   - `app-release-bundle.aab` → untuk Google Play Console
   - `assetlinks.json` → wajib dipasang di server
   - `signing.keystore` + `signing-key-info.txt` → **simpan**, tanpa ini
     pembaruan aplikasi tidak bisa ditandatangani ulang
5. Salin `assetlinks.json` ke `app/.well-known/assetlinks.json` (menggantikan
   berkas contoh di folder ini), lalu jalankan ulang server:

   ```
   curl -i https://domain-anda/.well-known/assetlinks.json
   ```

   Harus `200`, `Content-Type: application/json`, tanpa redirect.
6. Pasang APK. Bila verifikasi berhasil, alamat situs tidak tampil di bagian
   atas aplikasi. Bila masih tampil, isi `assetlinks.json` belum cocok dengan
   keystore APK tersebut.

Catatan: bila nanti didistribusikan lewat Play Store dengan *Play App Signing*,
tambahkan juga SHA-256 dari Play Console ke `sha256_cert_fingerprints` (array
boleh berisi lebih dari satu fingerprint).

## Regenerasi ikon

```
python3 tools/make_android_icons.py
```

Menulis ulang `mipmap-*/ic_launcher.png` dari penanda merek yang sama dengan
`app/icon.svg`. Ikon adaptif (API 26+) memakai `res/drawable/ic_logo.xml`.
