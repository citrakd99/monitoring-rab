# Monitoring RAB — Budget vs Realisasi

Aplikasi web untuk memantau pemakaian budget RAB proyek konstruksi terhadap belanja aktual (PO, obname,
material, bayar orang, lain-lain), lengkap dengan dashboard, paket pekerjaan, dan analisa harga satuan (AHS).

- `webapp/` — aplikasi web statis (HTML/CSS/JS murni, tanpa build), tayang di GitHub Pages. Lihat [`webapp/README.md`](webapp/README.md).
- `backend/` — Google Apps Script yang menjadikan **Google Sheet** sebagai database (bersama tim, tanpa impor ulang).
  Lihat [`backend/README.md`](backend/README.md). File siap tempel: [`backend/AppsScript-SalinSemua.gs`](backend/AppsScript-SalinSemua.gs).

**Repo ini tidak berisi data proyek maupun kode akses.** File RAB (.xlsx) dibaca di browser pemakai; alamat server
Apps Script dan kode akses hanya disimpan di browser masing-masing pengguna. `.gitignore` menolak semua file Excel.

## Menerbitkan aplikasi web
Aplikasi tayang di GitHub Pages dari cabang `gh-pages` (isi folder `webapp/`). Setelah mengubah `webapp/`:

```bash
git add -A && git commit -m "pesan"
sh deploy.sh
```

## Uji
```bash
node backend/test/run.js            # uji API dengan Google Sheet tiruan
node backend/test/dev-server.js     # coba webapp + server tiruan di http://localhost:8772
```
