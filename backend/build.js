/**
 * Gabungkan Db.gs + Code.gs + Setup.gs menjadi SATU file agar mudah ditempel ke editor Apps Script.
 * Jalankan setiap kali .gs diubah:   node backend/build.js
 * Hasil: backend/AppsScript-SalinSemua.gs
 */
const fs = require('fs'), path = require('path');
const dir = __dirname;
const parts = ['Db.gs', 'Code.gs', 'Setup.gs'];
const ver = (fs.readFileSync(path.join(dir, 'Code.gs'), 'utf8').match(/API_VERSION = '([^']+)'/) || [])[1] || '?';
const head = [
  '/**',
  ' * ============================================================================',
  ' *  MONITORING RAB — Apps Script (database Google Sheet)   versi API ' + ver,
  ' *  FILE GABUNGAN — salin SELURUH isi file ini ke Code.gs di editor Apps Script.',
  ' *  Jangan diedit di sini; sumbernya Db.gs, Code.gs, Setup.gs (lalu: node backend/build.js).',
  ' *',
  ' *  Langkah singkat (lengkap: backend/README.md):',
  ' *   1. Google Sheet kosong → Ekstensi → Apps Script → hapus isi Code.gs → tempel file ini → Simpan.',
  ' *   2. Pilih fungsi  setup  → Run → izinkan. (Membuat tab + 3 kode akses.)',
  ' *   3. Pilih fungsi  lihatKodeAkses  → Run → lihat kode di Execution log.',
  ' *   4. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → salin URL /exec.',
  ' * ============================================================================',
  ' */',
  ''
].join('\n');
const body = parts.map(f => '\n/* ======================= ' + f + ' ======================= */\n\n' + fs.readFileSync(path.join(dir, f), 'utf8').trim() + '\n').join('');
const out = path.join(dir, 'AppsScript-SalinSemua.gs');
fs.writeFileSync(out, head + body);
console.log('Ditulis: ' + path.relative(process.cwd(), out) + ' (' + Math.round(fs.statSync(out).size / 1024) + ' KB, API ' + ver + ')');
