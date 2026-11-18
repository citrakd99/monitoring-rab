/* Perhitungan budget vs realisasi.
 * Transaksi: { id, jenis:'PO'|'NP', kat, no, tgl, pihak, uraian, nilai, bayar, batal, alok:[{t:'L:<itemId>'|'P:<pkgId>', k:'mat'|'upah'|'lain', v}] }
 *  - "Realisasi" (komitmen) = nilai transaksi (PO terbit / obname / bayar).
 *  - "Terbayar"  = nilai yang sudah dibayar (PO bisa bertahap; Non-PO biasanya = nilai).
 *  - Alokasi ke Paket dibagi ke item anggota paket sebanding budget item.
 */
(function (root) {
  'use strict';

  var KAT = {
    PO: [
      { id: 'po-mat', nama: 'PO Material', k: 'mat' },
      { id: 'po-sub', nama: 'PO Subkon / Jasa', k: 'upah' },
      { id: 'po-sewa', nama: 'PO Sewa Alat', k: 'lain' }
    ],
    NP: [
      { id: 'np-obname', nama: 'Obname (upah mandor)', k: 'upah' },
      { id: 'np-mat', nama: 'Material (beli langsung)', k: 'mat' },
      { id: 'np-orang', nama: 'Bayar orang / harian', k: 'upah' },
      { id: 'np-lain', nama: 'Lain-lain', k: 'lain' },
      // otomatis dari sheet Amprah (tidak bisa dipilih di form transaksi manual)
      { id: 'np-amprah', nama: 'Amprah (kas kecil)', k: 'lain', auto: true }
    ]
  };
  var KAT_ALL = KAT.PO.concat(KAT.NP);
  var KAT_BY = {}; KAT_ALL.forEach(function (k) { KAT_BY[k.id] = k; });
  var KOMP = { mat: 'Material', upah: 'Upah / Jasa', lain: 'Lain-lain' };

  function status(budget, real) {
    if (!budget) return real > 0 ? { c: 'crit', t: 'Tanpa budget' } : { c: '', t: '—' };
    var p = real / budget;
    if (p > 1.0001) return { c: 'crit', t: 'Over budget' };
    if (p >= 0.9) return { c: 'warn', t: 'Hampir habis' };
    if (p > 0) return { c: 'ok', t: 'Aman' };
    return { c: '', t: 'Belum ada' };
  }

  function compute(rab, data) {
    var items = rab ? rab.items : [];
    var L = {};
    items.forEach(function (it) {
      L[it.id] = { it: it, real: 0, paid: 0, r: { mat: 0, upah: 0, lain: 0 }, tx: {} };
    });
    // seksi RAB sebagai target alokasi (S:<kelompok>-<hash nama seksi>)
    var SEC = {};
    items.forEach(function (it) { var k = secKey(it.g, it.sec); (SEC[k] = SEC[k] || []).push(it.id); });
    var pkgs = {};
    (data.pkgs || []).forEach(function (p) {
      var lines = p.lines.filter(function (id) { return L[id]; });
      var budget = lines.reduce(function (a, id) { return a + L[id].it.total; }, 0);
      pkgs[p.id] = { p: p, lines: lines, budget: budget, real: 0, paid: 0, direct: 0, tx: {} };
    });

    var tot = { real: 0, paid: 0, unalloc: 0, unallocTx: [], byKat: {}, byJenis: { PO: 0, NP: 0 }, byMonth: {}, orphan: 0, txCount: 0 };
    KAT_ALL.forEach(function (k) { tot.byKat[k.id] = 0; });

    function addLine(id, v, ratio, k, txId) {
      var x = L[id]; if (!x) return false;
      x.real += v; x.paid += v * ratio; x.r[k] = (x.r[k] || 0) + v; x.tx[txId] = (x.tx[txId] || 0) + v;
      return true;
    }

    (data.tx || []).forEach(function (t) {
      if (t.batal || t.noCommit) return;
      var nilai = +t.nilai || 0;
      var ratio = nilai ? Math.min(1, Math.max(0, (+t.bayar || 0) / nilai)) : 0;
      tot.txCount++;
      tot.real += nilai; tot.paid += nilai * ratio;
      tot.byKat[t.kat] = (tot.byKat[t.kat] || 0) + nilai;
      tot.byJenis[t.jenis] = (tot.byJenis[t.jenis] || 0) + nilai;
      var m = (t.tgl || '').slice(0, 7) || 'tanpa-tgl';
      var bm = tot.byMonth[m] = tot.byMonth[m] || { PO: 0, NP: 0 };
      bm[t.jenis] += nilai;

      var alloc = 0;
      (t.alok || []).forEach(function (a) {
        var v = +a.v || 0; if (!v) return;
        var k = a.k || 'lain';
        if (a.t.indexOf('L:') === 0) {
          if (addLine(a.t.slice(2), v, ratio, k, t.id)) alloc += v; else tot.orphan += v;
        } else if (a.t.indexOf('P:') === 0) {
          var P = pkgs[a.t.slice(2)];
          if (!P || !P.lines.length) { tot.orphan += v; return; }
          P.direct += v; P.tx[t.id] = (P.tx[t.id] || 0) + v;
          var w = P.budget > 0 ? null : 1 / P.lines.length;
          P.lines.forEach(function (id) {
            var share = w != null ? w : L[id].it.total / P.budget;
            addLine(id, v * share, ratio, k, t.id);
          });
          alloc += v;
        } else if (a.t.indexOf('S:') === 0) {
          var sids = SEC[a.t];
          if (!sids) { tot.orphan += v; return; }
          var sb = sids.reduce(function (acc, id) { return acc + L[id].it.total; }, 0);
          sids.forEach(function (id) { addLine(id, v * (sb > 0 ? L[id].it.total / sb : 1 / sids.length), ratio, k, t.id); });
          alloc += v;
        } else tot.orphan += v;
      });
      var sisa = nilai - alloc;
      if (Math.abs(sisa) >= 1) { tot.unalloc += sisa; tot.unallocTx.push({ t: t, sisa: sisa }); }
    });

    // Paket: realisasi = jumlah realisasi item anggotanya (termasuk alokasi langsung ke item)
    Object.keys(pkgs).forEach(function (pid) {
      var P = pkgs[pid];
      P.lines.forEach(function (id) {
        P.real += L[id].real; P.paid += L[id].paid;
        Object.keys(L[id].tx).forEach(function (tid) { P.tx[tid] = (P.tx[tid] || 0); });
      });
    });

    // Rekap per kelompok & per seksi
    var groups = (rab ? rab.groups : []).map(function (g) {
      return { g: g, budget: 0, real: 0, paid: 0, b: { mat: 0, upah: 0, lain: 0 }, r: { mat: 0, upah: 0, lain: 0 }, secs: {} };
    });
    var G = {}; groups.forEach(function (x) { G[x.g.id] = x; });
    var bK = { mat: 0, upah: 0, lain: 0 }, rK = { mat: 0, upah: 0, lain: 0 };
    items.forEach(function (it) {
      var x = L[it.id], g = G[it.g]; if (!g) return;
      g.budget += it.total; g.real += x.real; g.paid += x.paid;
      ['mat', 'upah', 'lain'].forEach(function (k) { g.b[k] += it[k] || 0; g.r[k] += x.r[k] || 0; bK[k] += it[k] || 0; rK[k] += x.r[k] || 0; });
      var s = g.secs[it.sec] = g.secs[it.sec] || { nama: it.sec, budget: 0, real: 0, paid: 0, items: [] };
      s.budget += it.total; s.real += x.real; s.paid += x.paid; s.items.push(it.id);
    });

    var budget = items.reduce(function (a, it) { return a + it.total; }, 0);
    return { L: L, pkgs: pkgs, SEC: SEC, groups: groups, tot: tot, budget: budget, bK: bK, rK: rK };
  }

  /* ---------- Analisa harga satuan ----------
   * Kebutuhan sumber daya = Σ (volume item Bill × koefisien komponen AHS × faktor),
   * faktor = harga satuan item / total blok AHS (menangani pembulatan, diskon, blok non-per-unit).
   * Harga aktual dari "rincian harga" transaksi: rinc:[{h:'S<row>'|'', nama, qty, sat, harga}].
   */
  function nu(u) { u = String(u || '').toLowerCase().replace(/[^a-z0-9]/g, ''); return { m1: 'm', mlari: 'm', buah: 'bh', btg: 'batang', zak: 'sak' }[u] || u; }
  function nk(t) { t = String(t || ''); var i = t.lastIndexOf('›'); if (i >= 0) t = t.slice(i + 1); return t.toLowerCase().replace(/\s+/g, ' ').trim(); }

  function computeHarga(rab, data, L) {
    var res = { B: {}, use: {}, need: {}, act: {}, H: {}, rows: [], hasAhs: !!(rab && rab.ahs && rab.ahs.length) };
    if (!rab || !rab.ahs) return res;
    rab.ahs.forEach(function (b) { res.B[b.id] = b; res.use[b.id] = { items: [], value: 0, real: 0 }; });
    var hsByKey = {};
    (rab.harsat || []).forEach(function (h) { res.H[h.id] = h; var k = nk(h.nama); if (!hsByKey[k]) hsByKey[k] = h; });
    res.hsByKey = hsByKey;

    var matchHs = res.matchHs = function (c) {
      var h = hsByKey[nk(c.nama)]; if (!h) return null;
      var p = h.harga, near = function (v) { return v && p && Math.abs(v - p) / p < 0.01; };
      var unitOk = nu(c.sat) && nu(c.sat) === nu(h.sat);
      return near(c.hm) || near(c.hu) || near(c.hm + c.hu) || unitOk ? h : null;
    };
    rab.items.forEach(function (it) {
      if (!it.ahs) return;
      var b = res.B[it.ahs]; if (!b) return;
      var u = res.use[b.id]; u.items.push(it.id); u.value += it.total; u.real += L && L[it.id] ? L[it.id].real : 0;
      if (!it.qty || !b.total) return;
      var f = (it.total / it.qty) / b.total;
      b.comps.forEach(function (c) {
        var k = nk(c.nama), h = matchHs(c);
        var key = h ? h.id : 'x:' + k;
        var x = res.need[key] = res.need[key] || { qty: 0, val: 0, blocks: {}, items: 0, nama: c.nama, sat: c.sat };
        x.qty += it.qty * c.koef * f; x.val += it.qty * (c.jm + c.ju) * f; x.blocks[b.id] = (x.blocks[b.id] || 0) + it.qty * c.koef * f; x.items++;
      });
    });

    (data.tx || []).forEach(function (t) {
      if (t.batal) return;
      (t.rinc || []).forEach(function (r) {
        var q = +r.qty || 0, p = +r.harga || 0; if (!q || !p) return;
        var h = r.h && res.H[r.h] ? res.H[r.h] : hsByKey[nk(r.nama)];
        if (!h) return;
        var a = res.act[h.id] = res.act[h.id] || { qty: 0, val: 0, n: 0, list: [] };
        a.qty += q; a.val += q * p; a.n++;
        a.list.push({ tx: t.id, tgl: t.tgl, pihak: t.pihak, no: t.no, qty: q, harga: p, sat: r.sat });
        if (!a.last || (t.tgl || '') >= (a.last.tgl || '')) a.last = { tgl: t.tgl, harga: p, pihak: t.pihak };
      });
    });

    var dampak = 0, nAct = 0, needVal = { mat: 0, upah: 0, alat: 0 };
    res.R = {};
    res.rows = (rab.harsat || []).map(function (h) {
      var nd = res.need[h.id], a = res.act[h.id];
      // harga pembanding = harga yang benar-benar dipakai di AHS (rata-rata tertimbang), bila ada
      var ref = nd && nd.qty ? nd.val / nd.qty : h.harga;
      var mismatch = nd && h.harga && Math.abs(ref - h.harga) / h.harga > 0.01;
      var avg = a ? a.val / a.qty : null;
      var d = avg != null ? avg - ref : null;
      var imp = d != null ? d * Math.max(nd ? nd.qty : 0, a.qty) : 0;
      if (a) { nAct++; dampak += imp; }
      if (nd) needVal[h.jenis] = (needVal[h.jenis] || 0) + nd.val;
      var row = { h: h, ref: ref, mismatch: mismatch, need: nd || null, act: a || null, avg: avg, d: d, pct: d != null && ref ? d / ref : null, imp: imp };
      res.R[h.id] = row;
      return row;
    });
    res.nMismatch = res.rows.filter(function (r) { return r.mismatch; }).length;
    res.sum = { dampak: dampak, nAct: nAct, needVal: needVal, nUsed: res.rows.filter(function (r) { return r.need; }).length,
      nLinked: rab.items.filter(function (it) { return it.ahs; }).length,
      valLinked: rab.items.reduce(function (s, it) { return s + (it.ahs ? it.total : 0); }, 0) };
    return res;
  }

  /* Harga satuan blok AHS bila harga komponen diganti harga aktual (rata-rata). */
  function ahsActual(b, HG) {
    var tot = 0, changed = 0;
    b.comps.forEach(function (c) {
      var h = HG.matchHs(c), a = h && HG.act[h.id], unit = c.hm + c.hu;
      if (a && unit) {
        // ganti harga satuan komponen di AHS dengan harga aktual rata-rata
        var ratio = (a.val / a.qty) / unit; changed++;
        tot += (c.jm + c.ju) * ratio;
      } else tot += c.jm + c.ju;
    });
    return { total: tot, changed: changed };
  }

  function hash36(str) { var h = 0x811c9dc5; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }
  /** Kunci target seksi — harus sama dengan Po.secKey. */
  function secKey(g, sec) { return 'S:' + g + '-' + hash36(String(sec == null ? '' : sec).replace(/\s+/g, ' ').trim().toLowerCase()); }

  root.Calc = { compute: compute, secKey: secKey, status: status, KAT: KAT, KAT_ALL: KAT_ALL, KAT_BY: KAT_BY, KOMP: KOMP,
    computeHarga: computeHarga, ahsActual: ahsActual, nk: nk };
})(window);
