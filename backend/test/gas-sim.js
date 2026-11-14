/**
 * Simulator Google Apps Script untuk uji lokal (BUKAN produksi): memuat file .gs ke konteks VM dengan tiruan
 * SpreadsheetApp / PropertiesService / CacheService / LockService / Utilities / ContentService.
 * Meniru konversi otomatis Sheets: di kolom NON-teks, "2026-01-02" → Date, "123" → angka, "=..." / "-x" → #ERROR!.
 * Di kolom berformat "@" (teks) nilai disimpan apa adanya sebagai teks.
 */
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');

function createSim(files) {
  const sheets = {}, props = {}, cacheMap = {};
  const stats = { getValues: 0, setValues: 0 };

  function colNum(letters) { let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }

  function makeSheet(name) {
    const rows = [];          // rows[i][j]
    const textCols = new Set(); // nomor kolom (1-based) berformat teks
    const conv = (v, col) => {
      if (v === '' || v === null || v === undefined) return '';
      if (textCols.has(col)) return typeof v === 'string' ? v : String(v);
      if (typeof v !== 'string') return v;
      if (/^[=+\-]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v)) return '#ERROR!';
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00+07:00');
      if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
      if (v === 'TRUE' || v === 'FALSE') return v === 'TRUE';
      return v;
    };
    let maxRows = 1000; // seperti tab baru di Google Sheets
    const lastRow = () => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i] && rows[i].some(c => c !== '' && c !== undefined)) return i + 1; return 0; };
    function rangeObj(r, c, nr, nc) {
      return {
        setValues(v) {
          stats.setValues++;
          if (v.length !== nr || v.some(x => x.length !== nc)) throw new Error('setValues: ukuran tidak cocok ' + v.length + 'x' + (v[0] || []).length + ' vs ' + nr + 'x' + nc);
          v.forEach((row, i) => { const R = r - 1 + i; rows[R] = rows[R] || []; row.forEach((val, j) => { rows[R][c - 1 + j] = conv(val, c + j); }); });
          return this;
        },
        getValues() {
          stats.getValues++;
          const out = [];
          for (let i = 0; i < nr; i++) { const src = rows[r - 1 + i] || []; const o = []; for (let j = 0; j < nc; j++) { const x = src[c - 1 + j]; o.push(x === undefined ? '' : x); } out.push(o); }
          return out;
        },
        clearContent() { for (let i = 0; i < nr; i++) { const R = rows[r - 1 + i]; if (R) for (let j = 0; j < nc; j++) R[c - 1 + j] = ''; } return this; },
        setFontWeight() { return this; },
        setNumberFormat(fmt) { if (fmt === '@') for (let j = 0; j < nc; j++) textCols.add(c + j); return this; }
      };
    }
    return {
      rows, textCols, getName: () => name,
      getLastRow: lastRow,
      getDataRange: () => rangeObj(1, 1, Math.max(lastRow(), 1), Math.max(...rows.map(r => (r || []).length), 1)),
      getMaxRows: () => maxRows,
      insertRowsAfter(after, k) { maxRows += k; },
      deleteRow(n) {
        if (maxRows - 1 <= 1) throw new Error('Sorry, it is not possible to delete all non-frozen rows.');
        rows.splice(n - 1, 1); maxRows--;
      },
      setFrozenRows() {},
      getRange(r, c, nr, nc) {
        if (typeof r !== 'string' && r + (nr || 1) - 1 > maxRows) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
        if (typeof r === 'string') { // "B2:B"
          const m = r.match(/^([A-Z]+)\d+:([A-Z]+)$/);
          const a = colNum(m[1]), b = colNum(m[2]);
          return rangeObj(2, a, 1, b - a + 1);
        }
        if (r < 1 || c < 1 || (nr !== undefined && nr < 1)) throw new Error('getRange: koordinat tidak valid ' + [r, c, nr, nc]);
        return rangeObj(r, c, nr || 1, nc || 1);
      }
    };
  }
  const ss = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = makeSheet(n)),
    getSheets: () => Object.values(sheets), deleteSheet() {}
  };
  const sandbox = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: k => cacheMap[k] || null, put: (k, v) => { cacheMap[k] = v; }, remove: k => { delete cacheMap[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate(d, tz, fmt) {
        const w = new Date(d.getTime() + 7 * 3600e3), p = n => String(n).padStart(2, '0');
        const date = `${w.getUTCFullYear()}-${p(w.getUTCMonth() + 1)}-${p(w.getUTCDate())}`;
        return fmt.indexOf('HH') >= 0 ? `${date}T${p(w.getUTCHours())}:${p(w.getUTCMinutes())}:${p(w.getUTCSeconds())}` : date;
      }
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ getContent: () => s, setMimeType() { return this; } }) }
  };
  vm.createContext(sandbox);
  const dir = path.join(__dirname, '..');
  (files || ['Db.gs', 'Code.gs', 'Setup.gs']).forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f }));
  vm.runInContext('globalThis.__x={doPost,doGet,setup,TABLES}', sandbox);
  const X = sandbox.__x;
  const raw = body => X.doPost({ postData: { contents: body } }).getContent();
  const call = (code, action, payload) => JSON.parse(raw(JSON.stringify({ code, action, payload })));
  return { X, sheets, props, cacheMap, stats, raw, call };
}

module.exports = { createSim };
