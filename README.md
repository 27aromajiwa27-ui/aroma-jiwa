---
title: Aroma Jiwa Hadir
emoji: 🌸
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Aroma Jiwa Hadir

Aplikasi kepegawaian dan loyalitas pelanggan untuk Aroma Jiwa: presensi dengan
GPS dan kamera, kartu member dengan stempel digital, serta portal pemilik.

- **Backend:** Python 3 stdlib saja (tanpa dependensi, tanpa pip install)
- **Frontend:** PWA vanilla ES modules di `app/`, dilayani langsung oleh server
- **Data:** SQLite di `data/aroma.db`, dibuat otomatis saat boot

## Akun demo

| Peran | Kredensial |
|---|---|
| Pegawai | `081234560001` / `aroma123` |
| Pemilik | PIN `2727` |

Ganti PIN pemilik segera setelah login pertama: **Admin → Pengaturan**.

## Catatan Space ini

Instance gratis tidak punya disk permanen. Setiap kali Space dibangun ulang
atau bangun dari tidur, `data/aroma.db` kembali ke data demo — presensi dan
stempel member yang diisi sebelumnya hilang. Untuk pemakaian nyata, jalankan
di server dengan disk permanen (misalnya VPS kecil), lalu arahkan aplikasi
Android ke alamat server itu.

## Struktur

```
run.py            titik masuk
server/           app.py (HTTP), api.py (rute), auth.py, db.py, util.py
app/              PWA: index.html, css/, js/, sw.js, manifest.webmanifest
android/          pembungkus WebView, dibangun terpisah menjadi APK
```
