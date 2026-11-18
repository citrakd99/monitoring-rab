/* Integrasi sheet SUMMARY COST: tab PO (komitmen biaya), PO TERBAYAR (actual), HUTANG (tagihan belum dibayar).
 * - Mode server: dibaca oleh Apps Script atas nama pemilik sheet (sheet tetap PRIVAT) lewat aksi "loadPo".
 * - Mode lokal: upload file .xlsx SUMMARY COST (dibaca di browser).
 * - Semua angka dihitung TANPA PAJAK: komitmen = DPP (jumlah baris PO); pembayaran & hutang (yang termasuk PPN /
 *   dipotong PPh) dikonversi ke DPP dengan faktor pajak per PO (dari baris ringkasan PO, deteksi pola, atau koreksi).
 * - Setiap baris PO dialokasikan ke item / seksi / paket budget memakai ATURAN (kategori + kata kunci),
 *   atau koreksi manual per PO.
 */
(function (root) {
  'use strict';
  var KEY_CACHE = 'rabmon.v1.po';
  var TAXF = { none: 1, ppn: 1.11, 'ppn-pph2': 1.09, pph2: 0.98 };
  var TAX_LABEL = { none: 'Tanpa pajak', ppn: 'PPN 11%', 'ppn-pph2': 'PPN 11% − PPh 2%', pph2: 'PPh 2% saja', sheet: 'Dari baris ringkasan PO' };
  var BLN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, agt: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    januari: 1, februari: 2, maret: 3, juni: 6, juli: 7, agustus: 8, oktober: 10, desember: 12 };

  function s(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }
  function num(v) { if (typeof v === 'number') return isFinite(v) ? v : 0; var t = s(v).replace(/^rp\.?\s*/i, '').replace(/,\d{1,2}$/, '').replace(/[^0-9-]/g, ''); return t ? Number(t) : 0; }
  function hash36(str) { var h = 0x811c9dc5; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }
  function secKey(g, sec) { return 'S:' + g + '-' + hash36(s(sec).toLowerCase()); }
  function toIso(v) {
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    if (typeof v === 'number' && v > 30000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
    var t = s(v), m;
    if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[0];
    if ((m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    if ((m = t.match(/^(\d{1,2})[\/\s.-]([A-Za-z]+)[\/\s.,-]+(\d{2,4})$/)) && BLN[m[2].toLowerCase()]) {
      var y = m[3].length === 2 ? '20' + m[3] : m[3];
      return y + '-' + String(BLN[m[2].toLowerCase()]).padStart(2, '0') + '-' + m[1].padStart(2, '0');
    }
    return '';
  }
  /** "123.26-008", "001/123-26.008/2" → "12326008" (kunci pencocokan PO). */
  function poKey(t) { var m = s(t).match(/(\d{3})\D(\d{2})\D(\d{3})/); return m ? m[1] + m[2] + m[3] : ''; }
  /* Kata kunci dicocokkan di AWAL kata (mis. "ht" tidak cocok dengan "light"; "scaffold" cocok dengan "scaffolding"). */
  function wordStart(txt, w) {
    var i = -1;
    while ((i = txt.indexOf(w, i + 1)) >= 0) if (i === 0 || !/[a-z0-9]/.test(txt.charAt(i - 1))) return true;
    return false;
  }
  function textMatch(kata, txt) {
    kata = s(kata).toLowerCase(); if (!kata) return true;
    return kata.split('|').some(function (alt) { return alt.split('&').every(function (w) { w = w.trim(); return !w || wordStart(txt, w); }); });
  }

  /* ---------- data mentah: sama persis dengan keluaran server (readPoSource_) ---------- */
  function rawFromWorkbook(XLSX, wb, name) {
    var find = function (re) { var n = wb.SheetNames.filter(function (x) { return re.test(x.trim()); })[0]; return n ? wb.Sheets[n] : null; };
    var nz = function (x) { return typeof x === 'number' && isFinite(x) && x !== 0; };
    var pick = function (ws, cols, keep) {
      if (!ws) return [];
      var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }), out = [];
      aoa.forEach(function (r) { var row = cols.map(function (c) { return r[c] === undefined ? '' : r[c]; }); if (keep(row)) out.push(row); });
      return out;
    };
    var shPo = find(/^po$/i);
    if (!shPo) throw new Error('Tab "PO" tidak ditemukan — pastikan ini file SUMMARY COST');
    return {
      id: 'file', title: name || 'SUMMARY COST (file)', fetchedAt: new Date().toISOString(),
      po: pick(shPo, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19], function (r) { return (s(r[0]) && nz(r[9])) || (!s(r[0]) && nz(r[10])); }),
      pay: pick(find(/^po\s*terbayar/i), [0, 2, 4, 5, 6, 7, 8], function (r) { return nz(r[6]) || nz(r[5]); }),
      hut: pick(find(/^hutang/i), [1, 2, 3, 4, 5, 6, 7], function (r) { return nz(r[6]); })
    };
  }

  /* ---------- kelompokkan per PO, cocokkan pembayaran & hutang, deteksi pajak ---------- */
  function parse(raw) {
    var pos = {}, order = [], pending = null;
    (raw.po || []).forEach(function (r) {
      var code = s(r[0]);
      if (!code) { pending = { dpp: num(r[10]), ppn: num(r[11]), pph: num(r[12]), adm: num(r[13]), ong: num(r[14]) }; return; }
      var k = poKey(code) || code.replace(/\W/g, '');
      var p = pos[k];
      if (!p) { p = pos[k] = { key: k, code: code, tgl: toIso(r[1]), vendor: s(r[2]), no: s(r[3]), pr: s(r[4]), cat: '', lines: [], pays: [], huts: [], sum: pending }; order.push(k); pending = null; }
      var cat = s(r[17]).toUpperCase();
      if (!p.cat && cat) p.cat = cat;
      p.lines.push({ i: p.lines.length, desc: s(r[5]), qty: num(r[6]), sat: s(r[7]), harga: num(r[8]), nilai: num(r[9]), cat: cat || p.cat });
    });
    var unmatched = [], hutUn = [];
    (raw.pay || []).forEach(function (r, i) {
      var kredit = num(r[6]); if (!kredit) return;
      if (!s(r[0]) && !s(r[3]) && !s(r[4])) return; // baris total
      var pay = { tgl: toIso(r[0]), bkk: s(r[2]), vendor: s(r[3]), ref: s(r[4]), nilai: kredit, i: i };
      var p = pos[poKey(pay.ref)];
      if (p) p.pays.push(pay); else unmatched.push(pay);
    });
    (raw.hut || []).forEach(function (r) {
      var sisa = num(r[6]); if (!sisa || (!s(r[2]) && !s(r[3]))) return;
      var h = { tgl: toIso(r[0]), due: s(r[1]), vendor: s(r[2]), ref: s(r[3]), kw: s(r[4]), sisa: sisa };
      var p = pos[poKey(h.ref)];
      if (p) p.huts.push(h); else hutUn.push(h);
    });
    var list = order.map(function (k) {
      var p = pos[k];
      p.dpp = p.lines.reduce(function (a, l) { return a + l.nilai; }, 0);
      p.paidGross = p.pays.reduce(function (a, x) { return a + x.nilai; }, 0);
      p.hutGross = p.huts.reduce(function (a, x) { return a + x.sisa; }, 0);
      detectTax(p);
      return p;
    });
    return { title: raw.title, fetchedAt: raw.fetchedAt, pos: list, unmatched: unmatched, hutUn: hutUn };
  }
  /** Faktor bruto→DPP. Prioritas: baris ringkasan PO (PPN/PPh) → pola pembayaran (porsi bulat 5%) → tanpa pajak. */
  function detectTax(p) {
    if (p.sum && p.dpp && (p.sum.ppn || p.sum.pph)) { p.taxAuto = 'sheet'; p.taxF = (p.dpp + p.sum.ppn - Math.abs(p.sum.pph)) / p.dpp; return; }
    // pembayaran & tagihan (hutang) sama-sama bruto → dipakai untuk menebak pajak
    var vals = p.pays.map(function (x) { return x.nilai; }).concat(p.huts.map(function (x) { return x.sisa; }));
    if (vals.length && p.dpp) {
      var best = null;
      ['none', 'ppn', 'ppn-pph2', 'pph2'].forEach(function (m) {
        var sc = vals.reduce(function (a, v) { var f = v / p.dpp / TAXF[m]; return a + Math.abs(f - Math.round(f / 0.05) * 0.05); }, 0);
        if (!best || sc < best.sc - 1e-9) best = { m: m, sc: sc };
      });
      p.taxAuto = best.m; p.taxF = TAXF[best.m]; return;
    }
    p.taxAuto = 'none'; p.taxF = 1;
  }

  /* ---------- aturan pemetaan baris PO → budget ---------- */
  function defaultRules(rab) {
    var items = rab ? rab.items : [];
    var item = function (g, re, secRe) { var it = items.filter(function (x) { return x.g === g && re.test(x.desc) && (!secRe || secRe.test(x.sec)); })[0]; return it ? 'L:' + it.id : ''; };
    var sec = function (g, re) { var it = items.filter(function (x) { return x.g === g && re.test(x.sec); })[0]; return it ? secKey(g, it.sec) : ''; };
    return [
      // subkon MEP besar: dicek PERTAMA agar barisnya tidak tertangkap kata kunci umum (kabel, AC, …)
      { cat: 'VENDOR MEP', kata: 'laik operasi|slo', t: item('PRS', /^slo$/i) },
      { cat: 'VENDOR MEP', kata: 'penyambungan|tambah daya|biaya sambung|jaminan langganan', t: item('PRS', /sarana listrik kerja/i) },
      { cat: 'VENDOR MEP', kata: '', t: '', note: 'Subkon MEP — alokasikan lewat Paket / item Bill 8' },
      { cat: '', kata: 'sap2000|sap 2000', t: item('LNL', /^sap$/i) },
      { cat: '', kata: 'revit|architecture engineering|autodesk', t: item('LNL', /revit/i) },
      { cat: 'TEST', kata: 'hydraulic|sprinkler|perhitungan desain|perhitungan design|hydrant|total', t: item('LNL', /hydraulic/i) },
      { cat: '', kata: 'laik operasi|slo ', t: item('PRS', /^slo$/i) },
      { cat: '', kata: 'penyambungan|pasang baru pln|tambah daya|biaya sambung', t: item('PRS', /sarana listrik kerja/i) },
      { cat: '', kata: 'scaffold|scafold', t: item('ALT', /scaf+olding/i) },
      { cat: '', kata: 'boomlift|boom lift', t: item('ALT', /boom lift/i) },
      { cat: '', kata: 'scissor', t: item('ALT', /scissor/i) },
      { cat: '', kata: 'auto level|autolevel', t: item('ALT', /auto level/i) },
      { cat: '', kata: 'theodolite|total station', t: item('ALT', /theodolite/i) },
      { cat: '', kata: 'jack hammer|jackdrill|jack drill|jackdril', t: item('ALT', /jack ?drill/i) },
      { cat: '', kata: 'truk|truck|fuso', t: item('ALT', /dump truck/i) },
      { cat: '', kata: 'molen|concrete mixer', t: item('ALT', /mixer|molen/i) },
      { cat: '', kata: 'vibrator', t: item('ALT', /concrete vibrator$/i) },
      { cat: '', kata: 'mesin las|trafo las|welding', t: item('ALT', /mesin las/i) },
      { cat: '', kata: 'gerinda|grinda', t: item('ALT', /gerinda/i) },
      { cat: '', kata: 'harness', t: item('PRS', /body harnes.*beli/i) },
      { cat: '', kata: 'helm', t: item('PRS', /safety helmet.*pekerja/i) },
      { cat: '', kata: 'sepatu|safety shoes', t: item('PRS', /safety shoes pekerja/i) },
      { cat: '', kata: 'apar|pemadam', t: item('PRS', /apar/i) },
      { cat: '', kata: 'p3k|kotak obat', t: item('PRS', /kotak obat/i) },
      { cat: '', kata: 'ht baofeng|handy talky|ht|radio komunikasi', t: item('PRS', /^ht /i) },
      { cat: 'APD', kata: '', t: sec('PRS', /safety/i) },
      { cat: '', kata: 'laptop|notebook|vivobook|asus|komputer|desktop pc', t: item('UMM', /komputer untuk engineer/i) },
      { cat: '', kata: 'printer|canon ira|photocopy|fotokopi', t: item('UMM', /^printer$/i) },
      { cat: '', kata: 'meja|kursi|lemari', t: item('UMM', /^perabot$/i) },
      { cat: '', kata: 'dispenser', t: item('UMM', /dispenser/i) },
      { cat: '', kata: 'laminating|atk|kertas', t: item('UMM', /alat2? tulis/i) },
      { cat: '', kata: 'banner|spanduk', t: item('PRS', /^banner$/i) },
      { cat: '', kata: 'ac |ac standing|ac portable|air conditioner|refrigerant|pipa refrig', t: sec('PRS', /bangunan sementara/i) },
      { cat: '', kata: 'panel temporary|container|kontainer|partisi', t: sec('PRS', /bangunan sementara/i) },
      { cat: '', kata: 'kempu|toren|tandon|tangki air|pompa', t: sec('PRS', /air kerja/i) },
      { cat: '', kata: 'kabel|nym|nyy|nfa2x|stop kontak|steker|industrial plug|lampu|mcb|panel listrik', t: item('PRS', /sarana listrik kerja/i) },
      { cat: '', kata: 'kawat ayam|baja ringan|triplek|seng |pagar', t: sec('PRS', /pagar sementara/i) },
      { cat: 'RENTAL', kata: '', t: sec('ALT', /alat sewa/i) },
      { cat: 'ASET', kata: '', t: sec('ALT', /alat beli/i) },
      { cat: 'ASSET', kata: '', t: sec('ALT', /alat beli/i) },
      { cat: 'INVENTARIS', kata: '', t: sec('ALT', /alat beli/i) },
      { cat: 'ELECTRIC', kata: '', t: sec('PRS', /listrik kerja/i) },
      { cat: 'MATERIAL BANGUNAN', kata: '', t: sec('PRS', /bangunan sementara/i) },
      { cat: 'CONSUMABLE', kata: '', t: sec('PNJ', /perlengkapan kerja/i) }
    ];
  }
  function rulesOf(set, rab) { return set && Array.isArray(set.poRules) ? set.poRules : defaultRules(rab); }
  function ruleMatch(rule, line, po) {
    var c = s(rule.cat).toUpperCase();
    if (c && (line.cat || po.cat || '').indexOf(c) < 0) return false;
    return textMatch(rule.kata, (line.desc + ' ' + po.vendor).toLowerCase() + ' ');
  }
  function katOf(cat) { return /RENTAL|SEWA/.test(cat) ? 'po-sewa' : /VENDOR|SUBKON|TEST|SERTIFIKAT|INTERIOR|JASA/.test(cat) ? 'po-sub' : 'po-mat'; }
  var KOMP = { 'po-sewa': 'lain', 'po-sub': 'upah', 'po-mat': 'mat' };

  /** Alokasi otomatis per baris: {alok, lines(+target), unalloc}. */
  function autoAlloc(po, rules, ok) {
    var agg = {}, order = [], un = 0, k = KOMP[katOf(po.cat)];
    var lines = po.lines.map(function (l) {
      var ri = -1;
      for (var i = 0; i < rules.length; i++) if (ruleMatch(rules[i], l, po)) { ri = i; break; }
      var t = ri >= 0 && ok(rules[ri].t) ? rules[ri].t : '';
      if (t) { if (!agg[t]) { agg[t] = 0; order.push(t); } agg[t] += l.nilai; } else un += l.nilai;
      return Object.assign({}, l, { rule: ri, t: t });
    });
    return { alok: order.map(function (t) { return { t: t, k: k, v: agg[t] }; }), lines: lines, unalloc: un };
  }

  function toTx(parsed, rules, poOvr, rab) {
    if (!parsed) return [];
    var ids = {}, secs = {};
    (rab ? rab.items : []).forEach(function (it) { ids[it.id] = 1; secs[secKey(it.g, it.sec)] = 1; });
    var ok = function (t) { return !!t && (t.indexOf('P:') === 0 || (t.indexOf('L:') === 0 && ids[t.slice(2)]) || (t.indexOf('S:') === 0 && secs[t])); };
    poOvr = poOvr || {};
    var out = parsed.pos.map(function (p) {
      var key = 'PO-' + p.key, ovr = poOvr[key];
      var taxMode = ovr && ovr.tax && ovr.tax !== 'auto' ? ovr.tax : p.taxAuto;
      var f = taxMode === 'sheet' ? p.taxF : TAXF[taxMode] || 1;
      var auto = autoAlloc(p, rules, ok);
      var useOvr = !!(ovr && ovr.alok);
      var paidNet = p.paidGross / f, hutNet = p.hutGross / f;
      var top = p.lines.slice().sort(function (a, b) { return b.nilai - a.nilai; })[0];
      var kat = katOf(p.cat);
      return {
        id: 'po-' + p.key, src: 'po', key: key, jenis: 'PO', kat: kat,
        no: p.no || p.code, tgl: p.tgl, pihak: p.vendor,
        uraian: (top ? top.desc : p.code) + (p.lines.length > 1 ? ' (+' + (p.lines.length - 1) + ' baris)' : ''),
        nilai: p.dpp, bayar: paidNet, ket: [p.cat, p.pr].filter(Boolean).join(' · '),
        poCode: p.code, poCat: p.cat, poPr: p.pr, poLines: auto.lines, pays: p.pays, huts: p.huts,
        paidGross: p.paidGross, hutGross: p.hutGross, hutNet: hutNet, taxMode: taxMode, taxF: f, taxAuto: p.taxAuto,
        status: paidNet >= p.dpp - 1 && p.dpp ? 'Lunas' : paidNet > 0 ? 'Dibayar sebagian' : hutNet > 0 ? 'Ditagih' : 'Terbit',
        alok: useOvr ? ovr.alok.map(function (a) { return { t: a.t, k: a.k, v: a.v }; }) : auto.alok,
        autoUnalloc: auto.unalloc, ovr: useOvr, ovrTax: !!(ovr && ovr.tax && ovr.tax !== 'auto'), ovrBy: ovr ? ovr.oleh : '',
        rinc: p.lines.filter(function (l) { return l.qty > 0 && l.harga > 0; }).slice(0, 300).map(function (l) { return { h: '', nama: l.desc, qty: l.qty, sat: l.sat, harga: l.harga }; }),
        created: 0, updated: 0
      };
    });
    // pembayaran yang tidak menunjuk PO mana pun (mis. biaya transfer)
    parsed.unmatched.forEach(function (x) {
      var key = 'PB-' + hash36(x.tgl + '|' + x.ref + '|' + x.vendor + '|' + x.nilai), ovr = poOvr[key];
      out.push({ id: 'pb-' + key.slice(3), src: 'po', key: key, jenis: 'NP', kat: 'np-lain', no: x.bkk ? 'BKK ' + x.bkk : '', tgl: x.tgl, pihak: x.vendor,
        uraian: 'Pembayaran tanpa PO: ' + (x.ref || '—'), nilai: x.nilai, bayar: x.nilai, ket: 'PO TERBAYAR', payOnly: true,
        alok: ovr && ovr.alok ? ovr.alok : [], ovr: !!(ovr && ovr.alok), ovrBy: ovr ? ovr.oleh : '', rinc: [], created: 0, updated: 0 });
    });
    return out;
  }

  /* ---------- ambil data ---------- */
  var Po = {
    cache: (function () { try { return JSON.parse(localStorage.getItem(KEY_CACHE) || 'null'); } catch (e) { return null; } })(),
    loading: null, error: '', onChange: function () {}, _parsed: null, _parsedOf: null,
    TAX_LABEL: TAX_LABEL, TAXF: TAXF, secKey: secKey, poKey: poKey, parse: parse, rawFromWorkbook: rawFromWorkbook, toIso: toIso,
    defaultRules: defaultRules, rulesOf: rulesOf, ruleMatch: ruleMatch, toTx: toTx, hash36: hash36,

    save: function (raw) { this.cache = raw; this._parsed = null; try { localStorage.setItem(KEY_CACHE, JSON.stringify(raw)); } catch (e) { /* abaikan */ } },
    clearCache: function () { this.cache = null; this._parsed = null; try { localStorage.removeItem(KEY_CACHE); } catch (e) { /* abaikan */ } },
    /** Data terurai untuk sumber yang aktif (server: id sheet di pengaturan; lokal: file yang di-upload). */
    parsed: function (src) {
      if (!this.cache || !src) return null;
      if (src.id !== this.cache.id) return null;
      if (this._parsedOf !== this.cache) { this._parsed = parse(this.cache); this._parsedOf = this.cache; }
      return this._parsed;
    },
    refresh: function (force) {
      var self = this;
      if (!root.Sync || !Sync.enabled()) return Promise.resolve(null);
      if (this.loading) return this.loading;
      this.error = ''; this.onChange('status');
      this.loading = Sync.api('loadPo', { force: !!force }).then(function (d) {
        self.loading = null;
        if (!d.configured) { self.onChange('status'); return null; }
        self.save(d); self.onChange('data'); return d;
      }, function (e) {
        self.loading = null;
        self.error = e.network ? 'Tidak bisa menghubungi server (offline). Memakai data PO terakhir.' : e.message;
        self.onChange('status'); return null;
      });
      return this.loading;
    },
    loadFile: function (file) {
      var self = this;
      return file.arrayBuffer().then(function (buf) {
        var wb = XLSX.read(buf, { type: 'array', cellHTML: false, cellStyles: false });
        var raw = rawFromWorkbook(XLSX, wb, file.name);
        self.save(raw); self.onChange('data');
        return raw;
      });
    }
  };
  root.Po = Po;
  if (typeof module !== 'undefined' && module.exports) module.exports = Po;
})(typeof window !== 'undefined' ? window : globalThis);
