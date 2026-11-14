/**
 * Jalankan SEKALI dari editor Apps Script: pilih fungsi `setup` lalu Run.
 * Membuat semua tab + header, memformat kolom teks, dan (bila belum ada) membuat kode akses acak
 * di Script Properties. Aman dijalankan ulang: data yang sudah ada tidak ditimpa.
 */
function setup() {
  const ss = ss_();
  Object.keys(TABLES).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const head = TABLES[name];
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    applyTextFormat_(sh, name);
  });
  const removeDefault = ss.getSheetByName('Sheet1') || ss.getSheetByName('Sheet 1') || ss.getSheetByName('Lembar1');
  if (removeDefault && ss.getSheets().length > 1 && removeDefault.getLastRow() === 0) ss.deleteSheet(removeDefault);

  const p = PropertiesService.getScriptProperties();
  const made = [];
  [['CODE_ADMIN', 'ADM'], ['CODE_INPUT', 'INP'], ['CODE_VIEW', 'LHT']].forEach(function (k) {
    if (!p.getProperty(k[0])) { p.setProperty(k[0], k[1] + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12)); made.push(k[0]); }
  });
  const msg = 'Setup selesai. ' + (made.length ? 'Kode akses dibuat: ' + made.join(', ') + ' — lihat Project Settings → Script Properties. ' : '') +
    'Langkah berikut: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).';
  console.log(msg);
  return msg;
}

/** Tampilkan kode akses di log eksekusi (jalankan dari editor bila lupa). */
function lihatKodeAkses() {
  const p = PropertiesService.getScriptProperties();
  const s = ['CODE_ADMIN', 'CODE_INPUT', 'CODE_VIEW'].map(function (k) { return k + ' = ' + (p.getProperty(k) || '(kosong)'); }).join('\n');
  console.log(s);
  return s;
}
