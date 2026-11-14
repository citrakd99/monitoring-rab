/** Lapisan akses Google Sheet (database Monitoring RAB). Skema tab ada di TABLES; setup() membuatnya. */
const TZ = 'Asia/Jakarta';

const TABLES = {
  Meta: ['key', 'value'],
  Budget: ['id', 'g', 'row', 'sec', 'sub', 'no', 'desc', 'unit', 'qty', 'mat', 'upah', 'lain', 'total', 'rem', 'ahs'],
  AHS: ['id', 'src', 'r0', 'r1', 'sumRow', 'no', 'sec', 'title', 'per', 'bulat', 'nama', 'sat', 'koef', 'hm', 'hu', 'jm', 'ju'],
  HARSAT: ['id', 'no', 'sec', 'nama', 'harga', 'sat', 'upd', 'brand', 'lok', 'vendor', 'ket', 'jenis'],
  Transaksi: ['id', 'jenis', 'kat', 'no', 'tgl', 'pihak', 'uraian', 'nilai', 'bayar', 'batal', 'ket', 'created', 'updated', 'oleh'],
  Alokasi: ['tx_id', 'target', 'komponen', 'nilai'],
  Rincian: ['tx_id', 'h', 'nama', 'qty', 'sat', 'harga'],
  Paket: ['id', 'nama', 'ket', 'updated'],
  Paket_Item: ['pkg_id', 'item_id'],
  Log: ['waktu', 'peran', 'aksi', 'detail'],
  // pengaturan aplikasi (link sheet Amprah, aturan pemetaan) dan koreksi alokasi per baris Amprah
  Setting: ['key', 'value', 'updated'],
  Amprah_Koreksi: ['key', 'data', 'updated', 'oleh']
};
/* Kolom teks: diformat "@" agar Sheets tidak mengubah "001" jadi 1, tanggal jadi Date, atau "- Beton" jadi rumus. */
const TEXT_COLS = {
  Meta: ['key', 'value'],
  Budget: ['id', 'g', 'sec', 'sub', 'no', 'desc', 'unit', 'rem', 'ahs'],
  AHS: ['id', 'src', 'no', 'sec', 'title', 'per', 'nama', 'sat'],
  HARSAT: ['id', 'no', 'sec', 'nama', 'sat', 'upd', 'brand', 'lok', 'vendor', 'ket', 'jenis'],
  Transaksi: ['id', 'jenis', 'kat', 'no', 'tgl', 'pihak', 'uraian', 'ket', 'oleh'],
  Alokasi: ['tx_id', 'target', 'komponen'],
  Rincian: ['tx_id', 'h', 'nama', 'sat'],
  Paket: ['id', 'nama', 'ket'],
  Paket_Item: ['pkg_id', 'item_id'],
  Log: ['waktu', 'peran', 'aksi', 'detail'],
  Setting: ['key', 'value'],
  Amprah_Koreksi: ['key', 'data', 'oleh']
};

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
/* Tab yang ditambahkan di versi lebih baru: dibuat otomatis bila belum ada (tanpa perlu setup ulang). */
const AUTO_TABLES = ['Setting', 'Amprah_Koreksi'];
function sheet_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh && AUTO_TABLES.indexOf(name) >= 0) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, TABLES[name].length).setValues([TABLES[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
    applyTextFormat_(sh, name);
  }
  if (!sh) throw apiError_('NOT_SETUP', 'Tab "' + name + '" belum ada. Jalankan setup() dulu.');
  return sh;
}
function colLetter_(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

function cell_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return v;
}
/** Nilai untuk ditulis. Kolom teks sudah berformat "@" (setup), jadi "- Beton" / "=x" tetap teks. */
function out_(v) { return v === undefined || v === null ? '' : v; }

/** Baca satu tab menjadi array objek. */
function readTable_(name) {
  const sh = sheet_(name), head = TABLES[name];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, head.length).getValues();
  const outRows = [];
  for (let r = 0; r < values.length; r++) {
    const row = values[r];
    if (row.every(function (c) { return c === '' || c === null; })) continue;
    const o = { _row: r + 2 };
    for (let c = 0; c < head.length; c++) o[head[c]] = cell_(row[c]);
    outRows.push(o);
  }
  return outRows;
}
function toArr_(name, obj) { return TABLES[name].map(function (h) { return out_(obj[h]); }); }

/** Tab baru hanya punya 1.000 baris; getRange di luar itu gagal — tambah baris dulu bila perlu. */
function ensureRows_(sh, lastNeeded) {
  const max = sh.getMaxRows();
  if (lastNeeded > max) {
    sh.insertRowsAfter(max, lastNeeded - max + 100);
    applyTextFormat_(sh, sh.getName()); // baris baru belum tentu mewarisi format teks
  }
}
function applyTextFormat_(sh, name) {
  const head = TABLES[name];
  (TEXT_COLS[name] || []).forEach(function (col) {
    const c = colLetter_(head.indexOf(col) + 1);
    sh.getRange(c + '2:' + c).setNumberFormat('@');
  });
}

/** Ganti seluruh isi tab (kecuali header) dengan objek-objek baru — satu panggilan setValues. */
function writeTable_(name, objs) {
  const sh = sheet_(name), head = TABLES[name];
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, head.length).clearContent();
  if (!objs.length) return 0;
  const rows = objs.map(function (o) { return toArr_(name, o); });
  ensureRows_(sh, rows.length + 1);
  sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  return rows.length;
}
function appendRows_(name, objs) {
  if (!objs.length) return;
  const sh = sheet_(name), head = TABLES[name];
  const rows = objs.map(function (o) { return toArr_(name, o); });
  const start = sh.getLastRow() + 1;
  ensureRows_(sh, start + rows.length - 1);
  sh.getRange(start, 1, rows.length, head.length).setValues(rows);
}
/** Cari nomor baris berdasarkan kolom pertama (id). */
function findRow_(name, id) {
  const sh = sheet_(name), last = sh.getLastRow();
  if (last < 2) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}
function upsertRow_(name, obj) {
  const r = findRow_(name, obj[TABLES[name][0]]);
  const arr = toArr_(name, obj), sh = sheet_(name);
  if (r) sh.getRange(r, 1, 1, arr.length).setValues([arr]);
  else { const nr = sh.getLastRow() + 1; ensureRows_(sh, nr); sh.getRange(nr, 1, 1, arr.length).setValues([arr]); }
  return r ? 'update' : 'insert';
}
function deleteById_(name, id) {
  const r = findRow_(name, id);
  if (!r) return false;
  const sh = sheet_(name);
  // Sheets menolak menghapus baris terakhir yang tidak dibekukan → cukup kosongkan isinya
  if (sh.getMaxRows() <= 2) sh.getRange(r, 1, 1, TABLES[name].length).clearContent();
  else sh.deleteRow(r);
  return true;
}
/** Ganti baris anak (Alokasi, Rincian, Paket_Item) milik satu induk: baca, saring, tulis ulang. */
function replaceChildren_(name, parentId, newObjs) {
  const keyCol = TABLES[name][0];
  const keep = readTable_(name).filter(function (o) { return String(o[keyCol]) !== String(parentId); });
  writeTable_(name, keep.concat(newObjs));
}

function nowIso_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function appendLog_(role, aksi, detail) {
  appendRows_('Log', [{ waktu: nowIso_(), peran: role, aksi: aksi, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }]);
}
function getMeta_() { const m = {}; readTable_('Meta').forEach(function (r) { m[r.key] = r.value; }); return m; }
