# Backend Monitoring RAB (Google Sheets + Apps Script)

Database = **satu Google Sheet baru yang terpisah** dari file RAB. File RAB (.xlsx) tidak perlu dikonversi:
admin cukup "menerbitkan" RAB sekali per revisi dari webapp, lalu semua pengguna memuat data dari sheet ini.

| Tab | Isi | Ditulis oleh |
|---|---|---|
| `Meta`, `Budget`, `AHS`, `HARSAT` | hasil baca RAB (beberapa ribu baris) | Admin, saat terbitkan RAB |
| `Transaksi`, `Alokasi`, `Rincian` | transaksi, pembagian ke item/paket, rincian harga satuan | Admin & Input |
| `Paket`, `Paket_Item` | paket pekerjaan dan anggotanya | Admin & Input |
| `Log` | jejak siapa mengubah apa | otomatis |

Isi tab boleh dibaca/difilter langsung di Google Sheets. **Jangan mengubah urutan kolom atau nama tab.**

## Pasang (sekali, ±10 menit)

1. Buat **Google Sheet kosong** baru, mis. "Monitoring RAB – Database".
2. Menu **Ekstensi → Apps Script**. Hapus seluruh isi `Code.gs` bawaan, lalu tempel **seluruh isi
   [`AppsScript-SalinSemua.gs`](AppsScript-SalinSemua.gs)** (satu file berisi semua kode) → 💾 Simpan.
   - Di GitHub: buka file itu → tombol **Copy raw file** (ikon salin) → tempel.
   - Alternatif: buat 3 file `Db.gs`, `Code.gs`, `Setup.gs` terpisah — hasilnya sama. Jangan pakai keduanya sekaligus.
   - `appsscript.json` opsional (pengaturan Web App dipilih saat Deploy).
3. Pilih fungsi **`setup`** di toolbar → **Run** → beri izin (Review permissions → pilih akun → Advanced → Go to …).
   Ini membuat 10 tab dan **3 kode akses acak**.
4. Lihat kodenya: ⚙ **Project Settings → Script Properties**, atau jalankan fungsi `lihatKodeAkses` lalu buka *Execution log*.

   | Property | Peran | Untuk |
   |---|---|---|
   | `CODE_ADMIN` | Admin | Anda: terbitkan RAB, kirim data backup, semua akses |
   | `CODE_INPUT` | Input | Tim yang mencatat transaksi & paket |
   | `CODE_VIEW` | Lihat | PM/SM/owner yang hanya memantau |

   Kode boleh diganti kapan saja di Script Properties (minimal 6 karakter; tidak perlu deploy ulang).
   Hapus `CODE_INPUT`/`CODE_VIEW` bila peran itu tidak dipakai.
5. **Deploy → New deployment** → ⚙ *Select type*: **Web app**. *Execute as*: **Me**. *Who has access*: **Anyone**.
   → Deploy → salin **Web app URL** (berakhiran `/exec`).
6. Cek: buka URL `/exec` di browser → harus tampil `{"ok":true,"service":"rab-monitor",...}`.

## Menyambungkan webapp
1. Buka webapp → **Data & Backup → Server Google Sheets** → tempel URL `/exec` + kode **Admin** → *Sambungkan*.
   - Bila browser ini sudah punya RAB/transaksi dari mode lokal, webapp menawarkan untuk mengirimnya ke server.
2. Terbitkan RAB: di kartu *Terbitkan / perbarui RAB ke server* pilih file RAB `.xlsx` (±10 dtk baca + ±20–60 dtk tulis).
   Untuk RAB revisi, ulangi langkah ini — alokasi transaksi otomatis dipetakan ulang ke item yang sama.
3. Bagikan ke tim: *Salin link untuk tim*. Link berbentuk `…/index.html#s=<url>&k=<kode>`; bagian setelah `#`
   tidak terkirim ke server web dan langsung dihapus dari address bar setelah dibuka.
   Pilih tanpa kode bila penerima harus mengetik kode sendiri. **Jangan bagikan kode Admin.**

## Cara kerja sinkron
- Saat dibuka, webapp menampilkan salinan terakhir (cepat), lalu memuat dari server. RAB hanya diunduh ulang bila
  versinya berubah (`rabVer`), jadi pemuatan berikutnya ringan (hanya transaksi & paket).
- Setiap simpan/hapus langsung tampil dan masuk **antrean** yang dikirim berurutan. Bila offline, antrean disimpan di
  browser dan dikirim otomatis saat koneksi kembali (status di pojok kanan atas: *Offline · n menunggu*).
- Perubahan pengguna lain diperiksa tiap 45 detik lewat aksi ringan `ver`; data dimuat ulang hanya bila berubah.
- Bentrok: bila dua orang mengubah **transaksi yang sama**, simpanan kedua ditolak (`CONFLICT`), pengguna diberi tahu
  dan datanya dimuat ulang. Semua tulis memakai `LockService` sehingga tidak saling menimpa.

## Mengubah kode backend
1. Ubah `Db.gs` / `Code.gs` / `Setup.gs`, lalu buat ulang file gabungan: `node backend/build.js` (uji memeriksa ini).
2. Tempel ulang `AppsScript-SalinSemua.gs` ke editor Apps Script → Simpan.
3. **Deploy → Manage deployments → ✏ → Version: New version → Deploy** agar URL `/exec` yang sama memakai kode baru.
   (Jangan "New deployment" — itu membuat URL baru.)

## Uji lokal (tanpa Google)
```
node backend/test/run.js                                   # 16 uji API dengan Google Sheet tiruan
RAB_XLSX="..\RAB....xlsx" node backend/test/run.js         # + uji pulang-pergi RAB asli
node backend/test/dev-server.js                            # webapp + server tiruan di http://localhost:8772
```
Kode demo dev-server: `ADM-DEMO-123`, `INP-DEMO-123`, `LHT-DEMO-123`; URL server: `http://localhost:8772/exec`.

## Aksi API
POST `Content-Type: text/plain`, body `{"code","action","payload"}`.

| Aksi | Peran | Payload | Keterangan |
|---|---|---|---|
| `login` | semua | – | peran + versi |
| `ver` | semua | – | `{rabVer, dataVer}` (ringan, untuk cek berkala) |
| `load` | semua | `{rabVer?}` | data transaksi & paket; RAB hanya bila versi berbeda |
| `saveTx` / `deleteTx` | admin, input | `{tx, prevUpdated?}` / `{id}` | `prevUpdated` untuk deteksi bentrok |
| `savePkg` / `deletePkg` | admin, input | `{pkg}` / `{id}` | hapus paket melepas alokasinya |
| `publishRab` | admin | `{rab, data?, baseDataVer?}` | tulis Budget/AHS/HARSAT/Meta (+ data hasil pemetaan ulang) |
| `importData` | admin | `{data:{tx,pkgs}, mode:'merge'\|'replace'}` | pindahkan data dari backup/browser |
| `getLog` | admin | `{limit?}` | jejak audit |
