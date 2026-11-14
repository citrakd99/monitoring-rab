/* Parser workbook RAB → daftar pos budget (biaya pelaksanaan).
 * Bisa dipakai di browser (window.RabParser) dan Node (module.exports).
 * Sumber:
 *  - Bill 3..8 (item BoQ dengan pecahan Material / Upah)
 *  - Persiapan., Alat., Penunjang., Pegawai., Umum. (biaya prelim / tak langsung)
 *  - RABT: pos lain di biaya langsung (Sertifikat ME, Civil App, Damkar, dst.)
 */
(function (root) {
  'use strict';

  var BILLS = [
    { id: 'B3', match: /^bill 3\b.*build/i, fmt: 'csa' },
    { id: 'B4', match: /^bill 4\b.*build/i, fmt: 'csa' },
    { id: 'B5', match: /^bill 5\b.*found/i, fmt: 'csa' },
    { id: 'B6', match: /^bill 6\b.*util/i, fmt: 'csa' },
    { id: 'B7', match: /^bill 7\b.*infra/i, fmt: 'csa' },
    { id: 'B8', match: /^bill 8\b.*mep/i, fmt: 'mep' }
  ];
  var PRELIM = [
    { id: 'PRS', match: /^persiapan/i, nama: 'Persiapan', fmt: 'prelim', amt: 13, stopCol: 11 },
    { id: 'ALT', match: /^alat/i, nama: 'Alat', fmt: 'alat' },
    { id: 'PNJ', match: /^penunjang/i, nama: 'Alat Penunjang + Kendaraan', fmt: 'prelim', amt: 13, stopCol: 11 },
    { id: 'PGW', match: /^pegawai/i, nama: 'Gaji Pegawai', fmt: 'pegawai' },
    { id: 'UMM', match: /^umum/i, nama: 'BU Adm. / Pelaksanaan', fmt: 'prelim', amt: 12, stopCol: 11 }
  ];

  function s(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }
  function n(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function isCode(t) { return /^([0-9]+(\.[0-9]+)*|[a-zA-Z]|[ivxIVX]+)\.?$/.test(t); }
  function isText(t) { return t && !isCode(t) && !/^[=x\-]$/.test(t); }

  function rows(XLSX, ws, maxCol) {
    var ref = ws['!ref'];
    if (!ref) return [];
    var r = XLSX.utils.decode_range(ref);
    var out = [];
    var lastC = Math.min(r.e.c, maxCol);
    for (var R = 0; R <= r.e.r; R++) {
      var row = new Array(lastC + 1);
      for (var C = 0; C <= lastC; C++) {
        var cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        row[C] = cell ? (cell.t === 'e' ? null : cell.v) : null;
      }
      out.push(row);
    }
    return out;
  }

  function findSheet(names, re) {
    for (var i = 0; i < names.length; i++) if (re.test(names[i].trim())) return names[i];
    return null;
  }

  function splitAmount(total, mat, upah) {
    // Skala pecahan material/upah supaya jumlahnya = total (Amount di sheet).
    var a = Math.max(mat || 0, 0), b = Math.max(upah || 0, 0);
    if (a + b <= 0) return { mat: total, upah: 0 };
    var m = Math.round(total * a / (a + b));
    return { mat: m, upah: total - m };
  }

  /* ---------- Bill CSA (Bill 3..7) ---------- */
  function parseCsa(rs, gid, gname) {
    var items = [], section = '', sub = '', finalTotal = null;
    for (var i = 4; i < rs.length; i++) {
      var r = rs[i];
      var B = s(r[1]), C = s(r[2]), D = s(r[3]), E = s(r[4]), unit = s(r[5]);
      var amt = n(r[11]);
      if (/to final summary/i.test(s(r[10]))) { finalTotal = amt; continue; }
      if (/^page\s*:/i.test(C)) continue;
      if ((unit || isText(E)) && amt != null) {
        if (!amt) continue;
        var desc = E || D || C;
        var qty = n(r[7]); if (qty == null) qty = n(r[6]);
        var sp = splitAmount(amt, n(r[8]) || 0, n(r[9]) || 0);
        items.push({
          id: gid + '-' + (i + 1), g: gid, row: i + 1, sec: section, sub: sub,
          no: s(r[3]) && E ? s(r[3]) : (s(r[2]) && isCode(s(r[2])) ? s(r[2]) : ''),
          desc: desc, unit: unit, qty: qty, mat: sp.mat, upah: sp.upah, lain: 0, total: amt,
          rem: s(r[12])
        });
        continue;
      }
      if (unit) continue; // baris komponen tanpa nilai
      if (B && isText(C) && !D && !E) { section = C; sub = ''; continue; }
      if (!B && isText(C) && !D && !E && C === C.toUpperCase()) { section = C.replace(/\s+cont(n)?d\.?$/i, ''); sub = ''; continue; }
      if (isText(D) && !E) { sub = D; continue; }
      if (isText(E)) { sub = E; continue; }
    }
    return { items: items, finalTotal: finalTotal };
  }

  /* ---------- Bill MEP (Bill 8) ---------- */
  function parseMep(rs, gid) {
    var items = [], section = '', sub = '', finalTotal = null;
    for (var i = 4; i < rs.length; i++) {
      var r = rs[i];
      var C = s(r[2]), E = s(r[4]), D = s(r[3]), unit = s(r[5]);
      var amt = n(r[12]);
      if (/to final summary/i.test(s(r[8]))) { finalTotal = amt; continue; }
      if (/^page\s*:/i.test(C)) continue;
      if (unit && amt != null) {
        if (!amt) continue;
        var qty = n(r[7]); if (qty == null) qty = n(r[6]);
        var tm = n(r[10]), ti = n(r[11]);
        var sp = (tm != null || ti != null) ? splitAmount(amt, tm || 0, ti || 0)
          : splitAmount(amt, n(r[8]) || 0, n(r[9]) || 0);
        items.push({
          id: gid + '-' + (i + 1), g: gid, row: i + 1, sec: section, sub: sub,
          no: isCode(C) ? C : s(r[1]),
          desc: E || D || C, unit: unit, qty: qty, mat: sp.mat, upah: sp.upah, lain: 0, total: amt,
          rem: s(r[13])
        });
        continue;
      }
      if (unit) continue;
      if (isText(C) && !E && C === C.toUpperCase()) { section = C.replace(/\s*\(?cont(n)?(in)?u?e?d\)?\.?$/i, '').trim(); sub = ''; continue; }
      if (isText(E)) { sub = E; continue; }
      if (isText(D)) { sub = D; continue; }
    }
    return { items: items, finalTotal: finalTotal };
  }

  /* ---------- Prelim: Persiapan / Penunjang / Umum ---------- */
  function parsePrelim(rs, cfg) {
    var items = [], section = '', finalTotal = null;
    for (var i = 8; i < rs.length; i++) {
      var r = rs[i];
      if (/^jumlah$/i.test(s(r[cfg.stopCol]))) { finalTotal = n(r[cfg.amt]); break; }
      var C = s(r[2]), D = s(r[3]), E = s(r[4]), unit = s(r[9]);
      var amt = n(r[cfg.amt]);
      var hasPrice = n(r[11]) != null;
      if (amt) {
        var qty = n(r[8]);
        var mult = n(r[6]);
        var desc = [C, D].filter(Boolean).join(' ');
        if (!desc) desc = section;
        var unitTxt = unit;
        if (mult != null && s(r[7])) unitTxt = mult + ' ' + s(r[7]).replace(/\s*x$/i, '') + ' × ' + unit;
        items.push({
          id: cfg.id + '-' + (i + 1), g: cfg.id, row: i + 1, sec: section, sub: '',
          no: s(r[0]) || s(r[1]), desc: desc + (E ? ' (' + E + ')' : ''), unit: unitTxt, qty: qty,
          mat: 0, upah: 0, lain: amt, total: amt, rem: s(r[15]) || s(r[16])
        });
        continue;
      }
      if (C && !hasPrice && !s(r[0]) && !unit && C === C.toUpperCase()) section = C;
    }
    return { items: items, finalTotal: finalTotal };
  }

  function parseAlat(rs, cfg) {
    var items = [], finalTotal = null;
    for (var i = 8; i < rs.length; i++) {
      var r = rs[i];
      if (/^jumlah$/i.test(s(r[10]))) { finalTotal = n(r[11]); break; }
      var B = s(r[1]), amt = n(r[11]);
      if (!B || !amt) continue;
      var dur = n(r[6]);
      items.push({
        id: cfg.id + '-' + (i + 1), g: cfg.id, row: i + 1, sec: s(r[4]) ? 'Alat ' + s(r[4]).toLowerCase() : 'Alat', sub: '',
        no: s(r[0]), desc: B + (s(r[3]) ? ' (' + s(r[3]) + ')' : ''),
        unit: s(r[7]) ? (dur != null ? dur + ' ' : '') + s(r[7]) : '', qty: n(r[5]),
        mat: 0, upah: 0, lain: amt, total: amt, rem: s(r[12])
      });
    }
    return { items: items, finalTotal: finalTotal };
  }

  function parsePegawai(rs, cfg) {
    var items = [], section = '', finalTotal = null;
    for (var i = 9; i < rs.length; i++) {
      var r = rs[i];
      if (/^jumlah$/i.test(s(r[9]))) { finalTotal = n(r[10]); break; }
      var A = s(r[0]), B = s(r[1]), amt = n(r[10]);
      if (B && !A && amt == null) { section = B; continue; }
      if (!B || !amt) continue;
      items.push({
        id: cfg.id + '-' + (i + 1), g: cfg.id, row: i + 1, sec: section, sub: '',
        no: A, desc: B, unit: [n(r[3]), s(r[4])].filter(function (x) { return x != null && x !== ''; }).join(' ') +
          (n(r[5]) != null ? ' × ' + n(r[5]) + ' ' + s(r[6]) : ''),
        qty: n(r[3]), mat: 0, upah: 0, lain: amt, total: amt, rem: s(r[11])
      });
    }
    return { items: items, finalTotal: finalTotal };
  }

  /* ---------- RABT: pos lain di Biaya Langsung ---------- */
  var RABT_LINKED = /^(persiapan|csa|mep|alat)$/i;
  function parseRabtMisc(rs) {
    var items = [], group = '', inDirect = false, info = {};
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i];
      var A = s(r[0]), B = s(r[1]), E = n(r[4]);
      if (/^nama proyek$/i.test(A)) info.proyek = s(r[3]);
      if (/^nama perusahaan$/i.test(A)) info.owner = s(r[3]);
      if (/^lokasi proyek$/i.test(A)) info.lokasi = s(r[3]);
      if (/^biaya langsung$/i.test(B)) { inDirect = true; info.biayaLangsung = E; continue; }
      if (/^biaya tak langsung$/i.test(B)) { inDirect = false; info.biayaTakLangsung = E; continue; }
      if (/^biaya konstruksi$/i.test(B)) info.biayaKonstruksi = E;
      if (/^ok netto$/i.test(B)) info.okNetto = E;
      if (/^ok bruto$/i.test(B)) info.okBruto = E;
      if (!inDirect || !B) continue;
      if (A && E == null) { group = B; continue; }
      if (A) group = '';
      if (RABT_LINKED.test(B) || !E) continue;
      items.push({
        id: 'LNL-' + (i + 1), g: 'LNL', row: i + 1, sec: group || B, sub: '', no: A,
        desc: B, unit: 'ls', qty: 1, mat: 0, upah: 0, lain: E, total: E, rem: ''
      });
    }
    return { items: items, info: info };
  }

  /* ---------- AHS CSA: blok analisa (koefisien × harga) ---------- */
  function normName(t) { return s(t).toLowerCase().replace(/[^a-z0-9.,/]+/g, ' ').trim(); }
  function parseAhsCsa(rs, src) {
    var blocks = [], cur = null, sec = '';
    function close(row) { if (cur) { cur.r1 = row; finish(cur); blocks.push(cur); cur = null; } }
    for (var i = 7; i < rs.length; i++) {
      var r = rs[i], A = s(r[0]), B = s(r[1]), F = s(r[5]);
      if (/^jumlah$/i.test(F) && cur) { cur.sumRow = i + 1; continue; }
      if (/^jumlah material/i.test(F) && cur) continue;
      if (/^dibulatkan$/i.test(F) && cur) { cur.bulat = n(r[10]); close(i + 1); continue; }
      if (A && !B && isText(A)) { close(i); sec = A; continue; }
      if (B && n(r[0]) != null && n(r[5]) == null && !s(r[4])) {
        close(i);
        cur = { id: 'A' + (i + 1), src: src, r0: i + 1, no: A, sec: sec, title: B, comps: [] };
        continue;
      }
      if (cur && B && (s(r[4]) || n(r[5]) != null)) {
        cur.comps.push({ nama: B, sat: s(r[4]), koef: n(r[5]) || 0, hm: n(r[6]) || 0, hu: n(r[7]) || 0, jm: n(r[8]) || 0, ju: n(r[9]) || 0 });
      }
    }
    close(rs.length);
    return blocks;
  }
  /* Sheet "Analisa Harga": blok bebas, ditutup baris TOTAL / Total Harga. Kolom C = volume komponen. */
  function parseAnalisaHarga(rs, src) {
    var blocks = [], cur = null, grp = '';
    for (var i = 3; i < rs.length; i++) {
      var r = rs[i], B = s(r[1]), D = s(r[3]), G = s(r[6]);
      if (/total/i.test(G) && cur) { cur.r1 = i + 1; cur.sumRow = i + 1; finish(cur); blocks.push(cur); cur = null; continue; }
      if (!B) continue;
      if (!D && n(r[6]) == null && n(r[9]) == null) {
        if (!cur) { cur = { id: 'H' + (i + 1), src: src, r0: i + 1, no: '', sec: 'Analisa Harga', title: B, comps: [] }; grp = ''; }
        else grp = B;
        continue;
      }
      if (cur && D) {
        var hm = n(r[4]) || 0, hu = n(r[5]) || 0, hs = n(r[6]) || 0, v = n(r[2]) || 0;
        if (!hm && !hu && hs) hm = hs; // hanya harga satuan gabungan
        cur.comps.push({ nama: (grp ? grp + ' › ' : '') + B, sat: D, koef: v, hm: hm, hu: hu,
          jm: n(r[7]) != null ? n(r[7]) : v * hm, ju: n(r[8]) != null ? n(r[8]) : v * hu });
      }
    }
    return blocks;
  }
  function finish(b) {
    b.tm = 0; b.tu = 0;
    b.comps.forEach(function (c) { b.tm += c.jm; b.tu += c.ju; });
    b.total = b.tm + b.tu;
    var m = b.title.match(/^\s*([0-9]+(?:[.,][0-9]+)?)\s*(m3|m2|m'|m1|m|kg|ton|unit|bh|buah|titik|ls|lot|set|pcs|lbr)\b/i);
    b.per = m ? m[1] + ' ' + m[2] : '';
  }

  /* ---------- HARSAT CSA: harga satuan dasar material / upah / alat ---------- */
  function parseHarsat(rs) {
    var out = [], sec = '';
    for (var i = 8; i < rs.length; i++) {
      var r = rs[i], B = s(r[1]), C = s(r[2]), E = n(r[4]);
      if (B && !C) { sec = B; continue; }
      if (!C || E == null) continue;
      var upd = r[8];
      if (typeof upd === 'number' && upd > 30000 && upd < 80000) upd = new Date(Math.round((upd - 25569) * 864e5)).toISOString().slice(0, 10);
      out.push({ id: 'S' + (i + 1), no: s(r[0]), sec: sec, nama: C, harga: E, sat: s(r[6]), upd: s(upd), brand: s(r[9]), lok: s(r[10]), vendor: s(r[11]), ket: s(r[12]),
        jenis: /upah/i.test(sec) ? 'upah' : /sewa alat/i.test(sec) ? 'alat' : 'mat' });
    }
    return out;
  }

  /* ---------- Tautan item Bill → blok AHS, lewat rumus sel MATERIAL/UPAH ---------- */
  function linkItems(XLSX, wb, items, groups, ahsIndex) {
    var sheetOf = {}; groups.forEach(function (g) { sheetOf[g.id] = g.sheet; });
    function resolve(sheet, addr, depth) {
      if (depth > 8) return null;
      var ws = wb.Sheets[sheet]; if (!ws) return null;
      var c = ws[addr]; if (!c || !c.f) return null;
      var f = String(c.f).trim();
      var m = f.match(/^\+?\s*(?:'([^']+)'!|([A-Za-z0-9_.]+)!)?\$?([A-Z]{1,3})\$?(\d+)\s*$/);
      if (m) {
        var sh = m[1] || m[2] || sheet, row = +m[4];
        var hit = ahsIndex(sh.trim(), row);
        if (hit) return hit;
        return resolve(sh, m[3] + m[4], depth + 1);
      }
      // rumus lain: ambil rujukan AHS pertama yang menunjuk baris jumlah/total
      var re = /'([^']+)'!\$?[A-Z]{1,3}\$?(\d+)/g, mm;
      while ((mm = re.exec(f))) { var h = ahsIndex(mm[1].trim(), +mm[2]); if (h) return h; }
      return null;
    }
    var linked = 0;
    items.forEach(function (it) {
      if (!/^B[3-7]$/.test(it.g)) return;
      var sh = sheetOf[it.g];
      var hit = resolve(sh, 'I' + it.row, 0) || resolve(sh, 'J' + it.row, 0) || resolve(sh, 'K' + it.row, 0);
      if (hit) { it.ahs = hit; linked++; }
    });
    return linked;
  }

  function parseAnalisa(XLSX, wb, items, groups) {
    var names = wb.SheetNames;
    var ahsName = findSheet(names, /^ahs csa$/i), ahName = findSheet(names, /^analisa harga$/i), hsName = findSheet(names, /^harsat csa$/i);
    var blocks = [];
    if (ahsName) blocks = blocks.concat(parseAhsCsa(rows(XLSX, wb.Sheets[ahsName], 13), ahsName));
    if (ahName) blocks = blocks.concat(parseAnalisaHarga(rows(XLSX, wb.Sheets[ahName], 10), ahName));
    blocks = blocks.filter(function (b) { return b.comps.length; });
    var harsat = hsName ? parseHarsat(rows(XLSX, wb.Sheets[hsName], 13)) : [];
    // indeks: hanya baris ringkasan (Jumlah / Dibulatkan / TOTAL) yang dianggap tautan sah
    var bySheetRow = {};
    blocks.forEach(function (b) {
      var key = b.src.trim() + '|';
      for (var r = b.sumRow || b.r1; r <= b.r1; r++) bySheetRow[key + r] = b.id;
    });
    var ahsIndex = function (sheet, row) { return bySheetRow[sheet + '|' + row] || null; };
    var linked = linkItems(XLSX, wb, items, groups, ahsIndex);
    return { blocks: blocks, harsat: harsat, linked: linked, sheets: [ahsName, ahName, hsName].filter(Boolean) };
  }

  /* ---------- Entry ---------- */
  var SHEETS_NEEDED = /^(rabt|persiapan|alat\.|penunjang|pegawai|umum|bill [3-8] - (building|foundation|utility|infra|mep)|ahs csa|analisa harga|harsat csa)/i;

  function parse(XLSX, wb) {
    var names = wb.SheetNames;
    var groups = [], items = [], checks = [];
    var rabtName = findSheet(names, /^rabt$/i);
    var misc = rabtName ? parseRabtMisc(rows(XLSX, wb.Sheets[rabtName], 8)) : { items: [], info: {} };

    PRELIM.forEach(function (p) {
      var nm = findSheet(names, p.match);
      if (!nm) { checks.push({ g: p.id, msg: 'Sheet ' + p.nama + ' tidak ditemukan' }); return; }
      var rs = rows(XLSX, wb.Sheets[nm], 20);
      var res = p.fmt === 'alat' ? parseAlat(rs, p) : p.fmt === 'pegawai' ? parsePegawai(rs, p) : parsePrelim(rs, p);
      groups.push({ id: p.id, nama: p.nama, sheet: nm, jenis: p.id === 'PRS' || p.id === 'ALT' ? 'Langsung' : 'Tak langsung' });
      items = items.concat(res.items);
      checks.push(check(p.id, nm, res));
    });
    if (misc.items.length) {
      groups.push({ id: 'LNL', nama: 'Sertifikat, Aplikasi & Lainnya', sheet: rabtName, jenis: 'Langsung' });
      items = items.concat(misc.items);
    }
    BILLS.forEach(function (b) {
      var nm = findSheet(names, b.match);
      if (!nm) { checks.push({ g: b.id, msg: 'Sheet ' + b.id + ' tidak ditemukan' }); return; }
      var rs = rows(XLSX, wb.Sheets[nm], 14);
      var title = '';
      for (var i = 0; i < 3 && !title; i++) if (/^bill/i.test(s(rs[i] && rs[i][1]))) title = s(rs[i][1]);
      var res = b.fmt === 'mep' ? parseMep(rs, b.id) : parseCsa(rs, b.id);
      groups.push({ id: b.id, nama: title || nm, sheet: nm, jenis: 'Langsung', bidang: b.fmt === 'mep' ? 'MEP' : 'CSA' });
      items = items.concat(res.items);
      checks.push(check(b.id, nm, res));
    });

    var total = items.reduce(function (a, it) { return a + it.total; }, 0);
    var an = parseAnalisa(XLSX, wb, items, groups);
    return { info: misc.info, groups: groups, items: items, checks: checks, total: total,
      ahs: an.blocks, harsat: an.harsat, ahsLinked: an.linked, importedAt: new Date().toISOString() };
  }

  function check(gid, sheet, res) {
    var sum = res.items.reduce(function (a, it) { return a + it.total; }, 0);
    var diff = res.finalTotal != null ? sum - res.finalTotal : null;
    return { g: gid, sheet: sheet, count: res.items.length, sum: sum, sheetTotal: res.finalTotal, diff: diff,
      ok: diff == null || Math.abs(diff) < 1000 };
  }

  var api = { parse: parse, SHEETS_NEEDED: SHEETS_NEEDED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RabParser = api;
})(typeof window !== 'undefined' ? window : this);
