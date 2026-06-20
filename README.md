# Lumina L1 Chrome Extension Wallet

Repositori ini berisi kode sumber untuk **Lumina Chrome Extension Wallet**, sebuah dompet digital non-custodial yang berjalan langsung di browser Google Chrome / Chromium-based. 

Dompet ini dirancang untuk memudahkan pengguna berinteraksi dengan **Lumina L1 Blockchain Network**, mengelola kunci, mengirim koin LUM, dan menghubungkan dompet ke aplikasi dApp (melalui integrasi injection provider global).

## Fitur Utama

- **Non-Custodial Account Management:** Pembuatan dompet baru, backup mnemonic seed, dan import wallet menggunakan Private Key atau Mnemonic secara lokal dan terenkripsi.
- **Transaction Submission:** Mengirim koin native LUM ke sesama pengguna dengan estimasi biaya (fee estimation) real-time dari node jaringan.
- **DApp Connector Integration:** Menginjeksi `lumina` provider ke objek `window` browser sehingga aplikasi dApp (seperti DEX Swap) dapat melakukan request koneksi akun, meminta otorisasi tanda tangan transaksi, dan memeriksa saldo pengguna.
- **Secure Storage:** Kunci privat disimpan secara aman di storage lokal browser menggunakan enkripsi standar industri.
- **Clean UI & UX:** Menggunakan **React**, **Vite**, **TypeScript**, dan **TailwindCSS** untuk desain antarmuka yang modern, cepat, dan responsif.

---

## Struktur Repositori

```text
├── ext-chrome/         # Direktori utama kode sumber extension
│   ├── src/
│   │   ├── background.ts # Background service worker untuk mengelola runtime & port dApp
│   │   ├── content.ts    # Script perantara komunikasi halaman web dan extension
│   │   ├── inpage.js     # Script yang diinjeksi ke window.lumina untuk API DApp
│   │   ├── components/   # Komponen UI React reusable
│   │   ├── pages/        # Halaman Onboarding & Dashboard utama
│   │   └── store/        # State management lokal menggunakan Zustand
│   ├── public/           # Aset statis (ikon manifest, svg, logo)
│   └── vite.config.ts    # Konfigurasi build Vite
```

---

## Cara Build dan Uji Coba Lokal

Ikuti langkah-langkah di bawah ini untuk mem-build extension dan memasangnya ke browser Chrome Anda:

### 1. Masuk dan Instal Dependensi
```bash
cd ext-chrome
npm install
```

### 2. Jalankan Build
Lakukan kompilasi kode TypeScript dan bundling menggunakan Vite:
```bash
npm run build
```
Hasil build akhir berupa file siap pakai akan berada di folder **`ext-chrome/dist`**.

### 3. Pasang Extension ke Google Chrome
1. Buka browser Google Chrome Anda, lalu akses halaman ekstensi di:
   `chrome://extensions/`
2. Aktifkan **Developer mode** di pojok kanan atas halaman.
3. Klik tombol **Load unpacked** (Muat yang belum dikemas) di pojok kiri atas.
4. Pilih folder **`dist`** hasil build Anda (`ext-chrome/dist`).
5. Ikon Lumina Wallet akan muncul di bilah ekstensi Chrome Anda dan siap digunakan!
