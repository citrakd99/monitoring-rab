# Monitoring RAB — Budget vs Realisasi

Web statis (HTML/CSS/JS murni, tanpa server & tanpa build) untuk memantau pemakaian budget RAB
terhadap belanja aktual, lengkap dengan dashboard.

## Menjalankan

    python -m http.server 8771 --directory webapp

lalu buka http://localhost:8771 (atau klik dua kali `index.html`).

## Alur pakai
1. **Data & Backup → Impor RAB**: pilih file RAB `.xlsx` (file RAB tender/pelaksanaan).
   Budget dibaca dari:
   - **Bill 3–8** (CSA & MEP) per item, dengan pecahan **Material / Upah** dari kolom MATERIAL–UPAH
     (MEP: Total Material / Total Install).
   - **Persiapan., Alat., Penunjang., Pegawai., Umum.** (prelim / biaya tak langsung) → komponen "Lain-lain".
   - **RABT**: pos lain di Biaya Langsung (Sertifikat ME, Revit/SAP, Damkar).
   Tabel cek menampilkan jumlah item tiap sheet vs total di sheet.
2. **+ Transaksi**: catat belanja
   - **PO**: PO Material, PO Subkon/Jasa, PO Sewa Alat — isi nilai PO dan nilai yang *sudah dibayar* (bisa bertahap).
   - **Non-PO**: Obname (upah mandor), Material beli langsung, Bayar orang/harian, Lain-lain.
   - **Alokasi**: satu transaksi bisa dibagi ke beberapa item budget dan/atau paket
     (tombol *Bagi sebanding budget*, *Bagi rata*, *Sisa ke baris terakhir*).
3. **Paket Pekerjaan**: gabungkan beberapa item budget (mis. beton overlay Building 2 + 4) menjadi satu
   paket. Transaksi ke paket dibagi ke item anggotanya sebanding budget item.
   Cara cepat: centang item di tab Budget RAB → *Buat paket*.
4. **Dashboard**: KPI, budget vs realisasi per kelompok & per komponen, realisasi per kategori dan
   per bulan (PO vs Non-PO), daftar item/paket ≥ 90% budget, transaksi belum dialokasikan.

5. **Analisa Harga**:
   - *Harga dasar & kebutuhan* — daftar HARSAT CSA dengan **kebutuhan proyek** (volume item Bill ×
     koefisien AHS), nilai kebutuhan, harga aktual rata-rata, selisih %, dan **proyeksi dampak**
     = (harga aktual − harga di AHS) × kebutuhan. Baris bertanda `HARSAT` = harga di AHS berbeda dari
     daftar HARSAT (cek kemungkinan salah ketik, mis. harga ×10).
   - *Analisa per pekerjaan (AHS)* — blok dari sheet **AHS CSA** dan **Analisa Harga**: komponen,
     koefisien, harga material/upah, harga satuan, dan harga satuan bila memakai harga aktual.
   - Detail item Bill menampilkan AHS-nya (koefisien disesuaikan bila harga item ≠ total blok).
   - Harga aktual diisi lewat **Rincian harga satuan** di form transaksi (pilih dari HARSAT, isi qty & harga).
   - Tautan item → AHS dibaca dari rumus sel MATERIAL/UPAH di Bill (termasuk rantai Bill 4 → Bill 3 → AHS).
     Item yang harganya diketik langsung (mis. bongkaran) dan Bill 8 MEP (harga vendor) tidak punya AHS.

## Istilah
- **Realisasi (komitmen)** = nilai transaksi (PO terbit / obname / pembayaran).
- **Dibayar** = nilai yang sudah dibayar (untuk Non-PO otomatis = nilai).
- Transaksi bertanda **Batal** tidak dihitung.

## Pasang di laptop sebagai aplikasi (PWA)
Buka situs di **Chrome/Edge** → tombol **⤓ Pasang aplikasi** di kanan atas (atau ikon ⊕ di kolom alamat).
Aplikasi mendapat ikon di Start Menu/desktop/taskbar, terbuka di jendela sendiri, dan tetap bisa dibuka saat offline.
Klik kanan ikon di taskbar untuk pintasan **+ Transaksi**, Dashboard, Analisa Harga (`?go=newTx|dash|ahs`).
Safari Mac: *File → Add to Dock*. Detail per browser ada di tab **Data & Backup**.

- `sw.js` menyimpan **hanya berkas aplikasi** (network-first: selalu versi terbaru saat online, cache saat offline).
  Data server tidak pernah di-cache oleh service worker. Naikkan `VERSION` di `sw.js` bila daftar `SHELL` berubah.
- Ikon: `icons/` (192, 512, maskable 512, apple-touch, favicon).

## Penyimpanan data
- **Mode server (disarankan)**: RAB, transaksi, paket, dan rincian harga disimpan di **Google Sheet database**
  terpisah lewat Apps Script — dipakai bersama tim tanpa impor, dengan kode akses Admin / Input / Lihat.
  Pemasangan: lihat [`../backend/README.md`](../backend/README.md). Alamat server & kode hanya disimpan di
  browser pemakai (tidak ada di kode). Browser menyimpan salinan (cache) agar cepat dan tetap jalan saat offline.
- **Mode lokal** (belum tersambung): data hanya di localStorage browser ini; buat **backup .json** rutin.
- **Laporan Excel** berisi sheet Ringkasan, Budget vs Realisasi per item, Paket, Transaksi, Alokasi.
- Impor ulang RAB revisi aman: alokasi dipetakan ulang ke item yang sama (bill + uraian + satuan + sub).

## Struktur
- `js/parse-rab.js` — pembaca workbook RAB (bisa dites di Node).
- `js/calc.js` — hitung budget vs realisasi, alokasi paket.
- `js/store.js` — data di memori + cache localStorage, backup, pemetaan ulang saat impor RAB baru.
- `js/sync.js` — koneksi ke server Apps Script: antrean tulis (offline), cek perubahan berkala, bentrok.
- `js/charts.js` — grafik SVG ringan.
- `js/app.js` — tampilan.
- `vendor/xlsx.full.min.js` — SheetJS 0.x (salinan dari ProjCASH).
