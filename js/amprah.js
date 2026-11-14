/* Integrasi sheet "Tracking Pengeluaran Amprah" (kas kecil) — HANYA DIBACA, tidak pernah ditulis.
 * - Dibaca langsung dari Google Sheet (ekspor .xlsx) di browser; sheet harus dibagikan "siapa saja yang punya link".
 * - Hanya kolom NO, TANGGAL, ITEM, JENIS AMPRAH, PIC, NOTA, TOTAL PENGELUARAN, REMARKS yang dibaca.
 *   Kolom nomor rekening, nama pemilik rekening, bank, dan bukti transfer TIDAK dibaca.
 * - Setiap baris menjadi transaksi Non-PO "Amprah (kas kecil)" yang dialokasikan ke item budget memakai ATURAN
 *   (jenis amprah + kata kunci → item), atau koreksi manual per baris (disimpan di database Monitoring RAB).
 */
(function (root) {
  'use strict';
  var KEY_CACHE = 'rabmon.v1.amprah';

  function s(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }
  function hash36(str) { // FNV-1a 32-bit
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  function parseId(link) {
    link = s(link);
    var m = link.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{20,}$/.test(link)) return link;
    return null;
  }
  function toIso(v) {
    if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
    if (typeof v === 'number' && v > 30000 && v < 80000) { var d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
    var t = s(v), m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); // dd/mm/yyyy
    if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[0] : '';
  }
  function toNum(v) {
    if (typeof v === 'number') return v;
    var t = s(v).replace(/^rp\.?\s*/i, '');
    if (!t) return 0;
    if (/,\d{1,2}$/.test(t)) t = t.replace(/,\d{1,2}$/, ''); // desimal ",00"
    t = t.replace(/[^0-9-]/g, '');
    return t ? Number(t) : 0;
  }

  /* ---------- baca workbook ---------- */
  var COLS = { no: /^no\.?$/, tgl: /^tanggal/, item: /^(item|uraian|keterangan item)/, jenis: /^jenis/, pic: /^pic/, nota: /^nota/, nilai: /^total/, rem: /^remarks?|^catatan/ };
  function parse(XLSX, wb) {
    var name = wb.SheetNames.filter(function (n) { return /pengeluaran/i.test(n); })[0];
    var tried = name ? [name] : wb.SheetNames;
    for (var i = 0; i < tried.length; i++) {
      var ws = wb.Sheets[tried[i]]; if (!ws || !ws['!ref']) continue;
      var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      var hi = -1, map = null;
      for (var r = 0; r < Math.min(aoa.length, 15) && hi < 0; r++) {
        var m = {};
        aoa[r].forEach(function (c, j) { var t = s(c).toLowerCase(); Object.keys(COLS).forEach(function (k) { if (m[k] === undefined && COLS[k].test(t)) m[k] = j; }); });
        if (m.tgl !== undefined && m.nilai !== undefined && m.item !== undefined) { hi = r; map = m; }
      }
      if (hi < 0) continue;
      var rows = [], seen = {};
      for (var R = hi + 1; R < aoa.length; R++) {
        var a = aoa[R], g = function (k) { return map[k] === undefined ? '' : a[map[k]]; };
        var nilai = toNum(g('nilai')), tgl = toIso(g('tgl')), item = s(g('item'));
        if (!nilai || !tgl || !item) continue;
        var base = 'A-' + tgl.replace(/-/g, '') + '-' + hash36(item.toLowerCase() + '|' + Math.round(nilai));
        var key = base, n = 2; while (seen[key]) key = base + '-' + (n++);
        seen[key] = 1;
        rows.push({ key: key, no: s(g('no')), tgl: tgl, item: item, jenis: s(g('jenis')).toUpperCase(), pic: s(g('pic')), nota: s(g('nota')).toUpperCase(), nilai: nilai, rem: s(g('rem')), row: R + 1 });
      }
      return { sheet: tried[i], rows: rows };
    }
    throw new Error('Tidak menemukan tab dengan kolom TANGGAL, ITEM, TOTAL PENGELUARAN');
  }

  /* ---------- aturan pemetaan ---------- */
  function textMatch(kata, txt) {
    kata = s(kata).toLowerCase(); if (!kata) return true;
    // "a|b" = salah satu; "a&b" = semua kata dalam satu alternatif
    return kata.split('|').some(function (alt) { return alt.split('&').every(function (w) { w = w.trim(); return !w || txt.indexOf(w) >= 0; }); });
  }
  function ruleMatch(rule, row) {
    var j = s(rule.jenis).toUpperCase();
    if (j && row.jenis.indexOf(j) < 0) return false;
    return textMatch(rule.kata, (row.item + ' ' + row.rem).toLowerCase());
  }
  /** Aturan bawaan: target dicari dari uraian item di RAB (bukan id tetap), sehingga ikut menyesuaikan RAB. */
  function defaultRules(rab) {
    var items = rab ? rab.items : [];
    var find = function (g, re, secRe) { var it = items.filter(function (x) { return x.g === g && re.test(x.desc) && (!secRe || secRe.test(x.sec)); })[0]; return it ? 'L:' + it.id : ''; };
    return [
      { jenis: '', kata: 'penggantian nota', t: '', cat: 'Isi campuran — pilih item manual per baris' },
      { jenis: 'KONTRAKAN', kata: 'cewe|putri|wanita', t: find('UMM', /rumah sewa.*wanita/i) },
      { jenis: 'KONTRAKAN', kata: 'pekerja|mandor|scafold|tukang', t: find('UMM', /barak pekerja/i) },
      { jenis: 'KONTRAKAN', kata: '', t: find('UMM', /rumah sewa.*pria/i) },
      { jenis: '', kata: 'tumpeng|syukur|upacara|selamatan', t: find('UMM', /upacara/i) },
      { jenis: '', kata: 'konsumsi|rapat|meeting|konsultan', t: find('UMM', /konsumsi rapat/i) },
      { jenis: 'ENTERTAIN', kata: '', t: find('UMM', /./, /entertain/i) },
      { jenis: '', kata: 'galon|aqua|air minum', t: find('UMM', /^aqua/i) },
      { jenis: '', kata: 'mushola|karpet', t: find('PRS', /mushola/i) },
      { jenis: '', kata: 'pekerja&kasur|pekerja&kipas|pekerja&lemari', t: find('UMM', /perabot pekerja/i) },
      { jenis: '', kata: 'kasur|kipas|lemari|perabot', t: find('UMM', /^perabot$/i) },
      { jenis: 'ATK', kata: '', t: find('UMM', /alat2? tulis/i) },
      { jenis: 'SAFETY', kata: '', t: find('PRS', /banner safety/i) },
      { jenis: 'MOTOR', kata: '', t: find('PNJ', /sepeda motor/i) },
      { jenis: 'TOL & BENSIN', kata: 'bensin|bbm|pertalite|solar', t: find('PNJ', /bahan bakar/i) },
      { jenis: 'TOL & BENSIN', kata: '', t: find('PNJ', /biaya tol/i) },
      { jenis: 'CONSUMABLE', kata: '', t: find('PRS', /kebersihan/i) },
      { jenis: 'RUMAH TANGGA', kata: '', t: find('UMM', /rumah tangga kantor/i) }
    ];
  }
  function rulesOf(set, rab) { return set && Array.isArray(set.amprahRules) ? set.amprahRules : defaultRules(rab); }

  /** Baris → transaksi Non-PO virtual. */
  function toTx(rows, rules, amOvr, rab) {
    var ids = {}; (rab ? rab.items : []).forEach(function (it) { ids[it.id] = 1; });
    var okTarget = function (t) { return t && (t.indexOf('P:') === 0 || ids[t.slice(2)]); };
    return rows.map(function (r) {
      var ovr = amOvr && amOvr[r.key];
      var ri = -1, alok = [];
      if (ovr) alok = (ovr.alok || []).map(function (a) { return { t: a.t, k: a.k, v: a.v }; });
      else {
        for (var i = 0; i < rules.length; i++) if (ruleMatch(rules[i], r)) { ri = i; break; }
        var t = ri >= 0 ? rules[ri].t : '';
        if (okTarget(t)) alok = [{ t: t, k: rules[ri].k || 'lain', v: r.nilai }];
      }
      return {
        id: 'am-' + r.key, src: 'amprah', key: r.key, jenis: 'NP', kat: 'np-amprah',
        no: r.no ? 'AMP-' + r.no : 'AMP', tgl: r.tgl, pihak: r.pic, uraian: r.item, nilai: r.nilai, bayar: r.nilai,
        ket: [r.jenis, r.rem].filter(Boolean).join(' · '), jenisAmprah: r.jenis, nota: r.nota,
        notaOk: /DONE|ADA|LENGKAP|OK/.test(r.nota) && !/TIDAK|BELUM|MASIH/.test(r.nota),
        alok: alok, rinc: ovr ? (ovr.rinc || []) : [], rule: ri, ovr: !!ovr, ovrBy: ovr ? ovr.oleh : '', created: 0, updated: 0
      };
    });
  }

  /* ---------- ambil dari Google ---------- */
  var Amprah = {
    cache: (function () { try { return JSON.parse(localStorage.getItem(KEY_CACHE) || 'null'); } catch (e) { return null; } })(),
    loading: false, error: '', onChange: function () {},
    parseId: parseId, parse: parse, defaultRules: defaultRules, rulesOf: rulesOf, ruleMatch: ruleMatch, toTx: toTx,

    refresh: function (src) {
      var self = this;
      var id = src && src.id;
      if (!id) { return Promise.resolve(null); }
      if (this.loading) return this.loading;
      this.error = '';
      this.onChange('status');
      this.loading = fetch('https://docs.google.com/spreadsheets/d/' + encodeURIComponent(id) + '/export?format=xlsx&t=' + Date.now(),
        { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status + ' — pastikan sheet dibagikan "Siapa saja yang memiliki link: Pelihat"');
          var ct = res.headers.get('content-type') || '';
          if (/text\/html/.test(ct)) throw new Error('Sheet tidak bisa diakses tanpa login — bagikan "Siapa saja yang memiliki link: Pelihat"');
          return res.arrayBuffer();
        })
        .then(function (buf) {
          var wb = XLSX.read(buf, { type: 'array', cellHTML: false, cellStyles: false }); // tanggal sebagai nomor seri → dikonversi UTC (tanpa geser zona waktu)
          var out = parse(XLSX, wb);
          self.cache = { id: id, sheet: out.sheet, rows: out.rows, fetchedAt: new Date().toISOString() };
          try { localStorage.setItem(KEY_CACHE, JSON.stringify(self.cache)); } catch (e) { /* abaikan */ }
          self.loading = null; self.onChange('data');
          return self.cache;
        })
        .catch(function (e) {
          self.loading = null;
          self.error = /Failed to fetch|NetworkError|Load failed/i.test(e.message) ? 'Tidak bisa mengambil sheet Amprah (offline atau sheet tidak dibagikan publik lewat link). Memakai data terakhir.' : e.message;
          self.onChange('status');
          return null;
        });
      return this.loading;
    },
    rows: function (src) { return this.cache && src && this.cache.id === src.id ? this.cache.rows : []; },
    clearCache: function () { this.cache = null; try { localStorage.removeItem(KEY_CACHE); } catch (e) { /* abaikan */ } }
  };
  root.Amprah = Amprah;
  if (typeof module !== 'undefined' && module.exports) module.exports = Amprah;
})(typeof window !== 'undefined' ? window : globalThis);
