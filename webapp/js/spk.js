/* SPK Mandor (Surat Perintah Kerja) dari file Excel draft SPK.
 * - Setiap tab "SPK …" = satu SPK: header (SPK, MANDOR, PEKERJAAN) + baris item (deskripsi, spesifikasi,
 *   volume 100%, volume SPK, satuan, harga satuan upah, jumlah). Tab "NON SPK" = daftar harga upah tanpa volume.
 * - Item dicocokkan ke item RAB otomatis: (1) cari seksi RAB yang paling banyak cocok volume+uraian,
 *   (2) cocokkan berurutan di seksi itu (uraian, satuan, volume, urutan).
 * - SPK = KOMITMEN upah per item; obname yang ditautkan ke SPK = pembayaran (bukan komitmen baru).
 */
(function (root) {
  'use strict';

  function s(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }
  function num(v) { if (typeof v === 'number') return isFinite(v) ? v : 0; var t = s(v).replace(/^rp\.?\s*/i, '').replace(/,\d{1,2}$/, '').replace(/[^0-9.-]/g, ''); return t ? Number(t) || 0 : 0; }
  function norm(t) { return s(t).toLowerCase().replace(/^[\s\-–•*]+/, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function toks(t) { var o = {}; norm(t).split(' ').forEach(function (w) { if (w.length > 1) o[w] = 1; }); return o; }
  function sim(a, b) { var A = toks(a), B = toks(b), na = Object.keys(A).length, nb = Object.keys(B).length, i = 0; Object.keys(A).forEach(function (w) { if (B[w]) i++; }); return i / Math.max(1, Math.min(na, nb)); }
  function unitEq(a, b) { var f = function (u) { u = norm(u).replace(/ /g, ''); return { m1: 'm', 'm\'': 'm' }[u] || u.replace(/[²2]$/, '2').replace(/[³3]$/, '3'); }; return f(a) && f(a) === f(b); }
  function volEq(a, b) { return a > 0 && b > 0 && Math.abs(a - b) / Math.max(a, b) < 0.02; }

  /* ---------- baca satu tab SPK ---------- */
  function readSheet(XLSX, ws) {
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    var head = {}, hi = -1, col = null;
    for (var r = 0; r < Math.min(aoa.length, 30); r++) {
      var a = aoa[r], k = s(a[0]).toUpperCase();
      if (/^(SPK|MANDOR|PEKERJAAN|PROJECT|OWNER)$/.test(k)) head[k.toLowerCase()] = s(a[3] !== '' ? a[3] : a[2]).replace(/^=\s*/, '');
      if (hi < 0 && a.some(function (c) { return /deskripsi/i.test(s(c)); }) && a.some(function (c) { return /harga/i.test(s(c)); })) {
        hi = r; col = {};
        a.forEach(function (c, j) {
          var t = s(c).toLowerCase();
          if (/deskripsi/.test(t)) col.desc = j; else if (/spesifikasi/.test(t)) col.spec = j;
          else if (/volume\s*100/.test(t)) col.v100 = j;
          else if (/^volume/.test(t)) { if (col.vol === undefined) col.vol = j; else if (col.v100 === undefined) { col.v100 = col.vol; col.vol = j; } }
          else if (/^sat/.test(t)) col.sat = j; else if (/harga/.test(t)) col.harga = j; else if (/jumlah/.test(t)) col.jml = j;
        });
      }
    }
    if (hi < 0 || col.desc === undefined || col.harga === undefined) return null;
    // faktor volume (mis. 0,80) — sel angka 0<x<=1 di kanan header
    var factor = null;
    for (var rr = hi; rr < Math.min(aoa.length, hi + 6) && factor == null; rr++) {
      aoa[rr].forEach(function (c, j) { if (j > (col.jml || 9) && typeof c === 'number' && c > 0 && c <= 1 && factor == null) factor = c; if (j > (col.jml || 9) && /^\d{1,3}%$/.test(s(c)) && factor == null) factor = Number(s(c).replace('%', '')) / 100; });
    }
    var items = [], sec = '';
    for (var R = hi + 1; R < aoa.length; R++) {
      var row = aoa[R], d = s(row[col.desc]);
      if (/^total$/i.test(s(row[col.harga]))) break;
      if (!d) continue;
      if (/^\*|keterangan/i.test(d)) break;
      var harga = row[col.harga], vol = col.vol !== undefined ? row[col.vol] : '', v100 = col.v100 !== undefined ? row[col.v100] : '';
      var isItem = typeof harga === 'number' || (s(harga) && num(harga) >= 0 && /\d|-/.test(s(harga)) && s(row[col.sat]));
      if (!isItem || (typeof vol !== 'number' && typeof v100 !== 'number' && vol === '' && v100 === '')) { if (!s(row[col.harga])) sec = d; continue; }
      var h = num(harga), vv = typeof vol === 'number' ? vol : num(vol), v1 = typeof v100 === 'number' ? v100 : (num(v100) || null);
      items.push({ r: R + 1, sec: sec, desc: d, spec: col.spec !== undefined ? s(row[col.spec]) : '', sat: col.sat !== undefined ? s(row[col.sat]) : '',
        v100: v1, vol: vv || (v1 || 0), harga: h, jml: col.jml !== undefined && typeof row[col.jml] === 'number' ? row[col.jml] : (vv || v1 || 0) * h });
    }
    return { head: head, factor: factor, items: items };
  }

  /* ---------- cocokkan item SPK ke item RAB ---------- */
  function match(items, rab, pekerjaan) {
    // nama pekerjaan di header SPK (mis. "SIPIL - OVERLAY OF PEDESTRIAN WALKWAY") membantu memilih seksi
    var pk = s(pekerjaan).replace(/^(sipil|mep|arsitektur|struktur)\s*-\s*/i, '');
    var secBonus = function (it) { return pk && sim(pk, it.sec) >= 0.6 ? 0.3 : 0; };
    var all = (rab ? rab.items : []).filter(function (it) { return it.g !== 'LNL'; });
    // 1) seksi dominan dari pasangan yang sangat yakin (volume sama + uraian mirip)
    var votes = {};
    items.forEach(function (x) {
      var vol = x.v100 || x.vol;
      all.forEach(function (it) { if (volEq(vol, it.qty) && sim(x.desc, it.desc) >= 0.5) { var k = it.g + '|' + it.sec; votes[k] = (votes[k] || 0) + 1; } });
    });
    var keys = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a]; });
    var secs = {}; keys.forEach(function (k) { secs[k] = 1; });
    all.forEach(function (it) { if (secBonus(it)) secs[it.g + '|' + it.sec] = 1; });
    var cand = Object.keys(secs).length ? all.filter(function (it) { return secs[it.g + '|' + it.sec]; }) : all;
    // 2) cocokkan berurutan
    var used = {}, lastIdx = -1, idx = {}; cand.forEach(function (it, i) { idx[it.id] = i; });
    items.forEach(function (x) {
      var vol = x.v100 || x.vol, best = null;
      cand.forEach(function (it, i) {
        if (used[it.id]) return;
        var sc = sim(x.desc, it.desc);
        if (unitEq(x.sat, it.unit)) sc += 0.15;
        if (volEq(vol, it.qty)) sc += 0.4;
        if (i > lastIdx && i - lastIdx <= 12) sc += 0.1; // urutan mengikuti RAB
        sc += secBonus(it);
        if (!best || sc > best.sc) best = { sc: sc, it: it, i: i };
      });
      if (best && best.sc >= 0.75) { used[best.it.id] = 1; lastIdx = best.i; x.item = best.it.id; x.score = Math.round(best.sc * 100) / 100; }
      else { x.item = ''; x.score = best ? Math.round(best.sc * 100) / 100 : 0; }
    });
    return { sections: keys.filter(function (k) { return secs[k]; }) };
  }

  /** Baca seluruh workbook draft SPK. */
  function parseWorkbook(XLSX, wb, rab, fileName) {
    var out = { file: fileName || '', mandor: '', spks: [], nonspk: [] };
    wb.SheetNames.forEach(function (n) {
      if (/klausul/i.test(n)) return;
      var res = readSheet(XLSX, wb.Sheets[n]);
      if (!res || !res.items.length) return;
      if (res.head.mandor && !out.mandor) out.mandor = res.head.mandor;
      if (/non\s*spk/i.test(n)) {
        out.nonspk = res.items.map(function (x) { return { desc: x.desc, spec: x.spec, sat: x.sat, harga: x.harga, sec: x.sec }; });
        return;
      }
      var m = match(res.items, rab, res.head.pekerjaan);
      var no = s(res.head.spk) || (n.match(/\d+/) || [''])[0];
      out.spks.push({ sheet: n.trim(), no: no.padStart(3, '0'), pekerjaan: res.head.pekerjaan || n, factor: res.factor, sections: m.sections, items: res.items });
    });
    if (!out.mandor) out.mandor = (fileName || 'MANDOR').replace(/\.xlsx?$/i, '');
    return out;
  }

  /* ---------- baris datar (untuk server) ⇄ struktur ---------- */
  function toRows(parsed) {
    var rows = [];
    parsed.spks.forEach(function (sp) {
      sp.items.forEach(function (x, i) {
        rows.push({ mandor: parsed.mandor, spk: sp.no, pekerjaan: sp.pekerjaan, sheet: sp.sheet, urut: i + 1, item_id: x.item || '', desc: x.desc, spec: x.spec.slice(0, 300), sat: x.sat,
          vol100: x.v100 == null ? '' : x.v100, vol: x.vol, harga: x.harga, jumlah: x.jml, faktor: sp.factor == null ? '' : sp.factor, file: parsed.file });
      });
    });
    parsed.nonspk.forEach(function (x, i) {
      rows.push({ mandor: parsed.mandor, spk: 'NON', pekerjaan: 'NON SPK', sheet: 'NON SPK', urut: i + 1, item_id: '', desc: x.desc, spec: x.spec.slice(0, 300), sat: x.sat, vol100: '', vol: 0, harga: x.harga, jumlah: 0, faktor: '', file: parsed.file });
    });
    return rows;
  }
  /** Kelompokkan baris tersimpan → [{key, mandor, no, pekerjaan, factor, items:[...]}], nonspk per mandor. */
  function group(rows) {
    var spks = {}, order = [], non = {};
    (rows || []).forEach(function (r) {
      if (r.spk === 'NON') { (non[r.mandor] = non[r.mandor] || []).push(r); return; }
      var k = 'SPK-' + norm(r.mandor).replace(/ /g, '_') + '-' + r.spk;
      if (!spks[k]) { spks[k] = { key: k, mandor: r.mandor, no: r.spk, pekerjaan: r.pekerjaan, sheet: r.sheet, factor: r.faktor === '' ? null : Number(r.faktor), file: r.file, items: [] }; order.push(k); }
      spks[k].items.push(r);
    });
    return { spks: order.map(function (k) { return spks[k]; }), nonspk: non };
  }

  /** SPK → transaksi komitmen virtual. bayar = jumlah obname (dibayar) yang ditautkan. */
  function toTx(grouped, rab, linked) {
    var ids = {}; (rab ? rab.items : []).forEach(function (it) { ids[it.id] = 1; });
    return grouped.spks.map(function (sp) {
      var agg = {}, order = [], un = 0, total = 0, v100 = 0;
      sp.items.forEach(function (x) {
        var v = Number(x.jumlah) || 0; total += v;
        v100 += (Number(x.vol100) || Number(x.vol) || 0) * (Number(x.harga) || 0);
        if (x.item_id && ids[x.item_id]) { var t = 'L:' + x.item_id; if (!agg[t]) { agg[t] = 0; order.push(t); } agg[t] += v; } else un += v;
      });
      var ln = (linked && linked[sp.key]) || [];
      var paid = ln.reduce(function (a, t) { return a + (+t.bayar || 0); }, 0), prog = ln.reduce(function (a, t) { return a + (+t.nilai || 0); }, 0);
      return {
        id: 'spk-' + sp.key, src: 'spk', key: sp.key, jenis: 'NP', kat: 'np-obname', no: 'SPK ' + sp.no, tgl: '', pihak: sp.mandor,
        uraian: sp.pekerjaan + ' (' + sp.items.length + ' item)', nilai: total, bayar: paid, ket: sp.file,
        spk: sp, spkV100: v100, spkProg: prog, spkRet: prog - paid, spkUnalloc: un, obnames: ln,
        alok: order.map(function (t) { return { t: t, k: 'upah', v: agg[t] }; }), rinc: [], created: 0, updated: 0
      };
    });
  }

  root.Spk = { parseWorkbook: parseWorkbook, readSheet: readSheet, match: match, toRows: toRows, group: group, toTx: toTx, sim: sim };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Spk;
})(typeof window !== 'undefined' ? window : globalThis);
