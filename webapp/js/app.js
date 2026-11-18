/* Monitoring RAB — UI */
(function () {
  'use strict';
  var S = window.Store, K = window.Calc;
  var C = null; // hasil hitung terakhir
  var HG = null; // hasil analisa harga
  var ui = {
    tab: 'dash',
    h: { view: 'dasar', q: '', j: '', f: 'used', sort: 'need' },
    a: { q: '', src: '', used: true },
    b: { q: '', g: '', f: '', open: {}, sel: {} },
    t: { q: '', j: '', k: '', m: '', s: '' },
    p: { q: '' }
  };
  try { var lt = localStorage.getItem('rabmon.v1.tab'); if (lt) ui.tab = lt; } catch (e) { /* abaikan */ }

  /* ---------- util ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
  var nf2 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
  function rp(n) { return (n < 0 ? '−' : '') + 'Rp ' + nf.format(Math.abs(Math.round(n || 0))); }
  function num(n) { return nf.format(Math.round(n || 0)); }
  function short(n) {
    var a = Math.abs(n || 0), sg = n < 0 ? '−' : '';
    if (a >= 1e12) return sg + nf2.format(a / 1e12) + ' T';
    if (a >= 1e9) return sg + nf2.format(a / 1e9) + ' M';
    if (a >= 1e6) return sg + nf2.format(Math.round(a / 1e5) / 10) + ' jt';
    if (a >= 1e3) return sg + nf.format(a / 1e3) + ' rb';
    return sg + nf.format(a);
  }
  function rpS(n) { return 'Rp ' + short(n); }
  function pct(a, b) { return b ? a / b * 100 : 0; }
  function pctTxt(a, b) { return b ? nf2.format(Math.round(pct(a, b) * 10) / 10) + '%' : '—'; }
  function parseQty(s) {
    s = String(s || '').trim().replace(/\s/g, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d+\.\d{3}(\.\d{3})*$/.test(s)) s = s.replace(/\./g, '');
    var v = parseFloat(s); return isFinite(v) ? v : 0;
  }
  function parseMoney(s) { if (typeof s === 'number') return s; s = String(s || '').split(',')[0].replace(/[^0-9-]/g, ''); return s ? +s : 0; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  function monthLbl(m) { if (!/^\d{4}-\d{2}$/.test(m)) return 'Tanpa tgl'; return BLN[+m.slice(5) - 1] + ' ' + m.slice(2, 4); }
  function dateLbl(d) { if (!d) return '—'; var p = d.split('-'); return p.length === 3 ? +p[2] + ' ' + BLN[+p[1] - 1] + ' ' + p[0] : d; }
  function toast(msg) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }
  function grpName(id) { var g = S.rab && S.rab.groups.find(function (x) { return x.id === id; }); return g ? g.nama : id; }
  function grpSheet(id) { var g = S.rab && S.rab.groups.find(function (x) { return x.id === id; }); return g ? (g.sheet || '').trim() : id; }
  function shortGrp(id) { var n = grpName(id); return n.replace(/^bill\s*\d+\s*-\s*/i, '').replace(/\s*\(.*\)\s*$/, ''); }
  function grpLabel(id) { return /^B\d$/.test(id) ? 'Bill ' + id.slice(1) + ' · ' + shortGrp(id) : grpName(id); }
  function itemById(id) { return C && C.L[id] ? C.L[id].it : null; }
  function targetInfo(t) {
    if (t.indexOf('L:') === 0) {
      var x = C.L[t.slice(2)];
      if (!x) return { nama: '(item tidak ditemukan)', sub: '', budget: 0, real: 0, missing: true };
      return { nama: x.it.desc, sub: grpLabel(x.it.g) + ' › ' + x.it.sec + (x.it.sub ? ' › ' + x.it.sub : ''), budget: x.it.total, real: x.real, kind: 'item' };
    }
    if (t.indexOf('S:') === 0) {
      var ids = C.SEC[t];
      if (!ids) return { nama: '(seksi tidak ditemukan)', sub: '', budget: 0, real: 0, missing: true };
      var it0 = C.L[ids[0]].it;
      return { nama: '§ ' + it0.sec, sub: 'Seksi · ' + grpLabel(it0.g) + ' · ' + ids.length + ' item (dibagi sebanding budget)', budget: ids.reduce(function (a, id) { return a + C.L[id].it.total; }, 0), real: ids.reduce(function (a, id) { return a + C.L[id].real; }, 0), kind: 'sec' };
    }
    if (t.indexOf('P:') === 0) {
      var P = C.pkgs[t.slice(2)];
      if (!P) return { nama: '(paket dihapus)', sub: '', budget: 0, real: 0, missing: true };
      return { nama: '▣ ' + P.p.nama, sub: 'Paket · ' + P.lines.length + ' item', budget: P.budget, real: P.real, kind: 'pkg' };
    }
    return { nama: '(item lama hilang setelah impor ulang)', sub: '', budget: 0, real: 0, missing: true };
  }
  function meterHtml(nm, real, paid, budget, extra) {
    var over = budget && real > budget;
    var w1 = budget ? Math.min(100, pct(real, budget)) : (real ? 100 : 0);
    var w2 = budget ? Math.min(100, pct(paid, budget)) : (paid ? 100 : 0);
    return '<div class="meter' + (extra && extra.click ? ' clickable' : '') + '"' + (extra && extra.click ? ' data-act="' + extra.click + '" data-id="' + esc(extra.id) + '"' : '') + '>' +
      '<div class="nm" title="' + esc(nm) + '">' + esc(nm) + '</div>' +
      '<div class="trk' + (over ? ' over' : '') + '"><i class="komit" style="width:' + w1 + '%"></i><i class="paid" style="width:' + w2 + '%"></i></div>' +
      '<div class="vv">' + rpS(real) + ' / ' + rpS(budget) + ' · <b>' + pctTxt(real, budget) + '</b></div></div>';
  }
  function pillHtml(budget, real) { var s = K.status(budget, real); return s.t === '—' ? '<span class="muted">—</span>' : '<span class="pill ' + s.c + '">' + s.t + '</span>'; }
  function pctCell(budget, real) {
    var over = budget && real > budget;
    var w = budget ? Math.min(100, pct(real, budget)) : (real ? 100 : 0);
    return '<td class="pct num">' + pctTxt(real, budget) + '<div class="trk' + (over ? ' over' : '') + '"><i class="komit" style="width:' + w + '%"></i></div></td>';
  }

  /* ---------- render utama ---------- */
  function recompute() { var d = { tx: S.allTx(), pkgs: S.data.pkgs }; C = K.compute(S.rab, d); HG = K.computeHarga(S.rab, d, C.L); }
  function updateBadge() {
    var b = $('#syncBadge'); if (!b) return;
    var st = Sync.status, q = Sync.outbox.length;
    var map = {
      local: ['', 'Lokal (browser ini)'],
      connecting: ['busy', 'Menghubungkan…'],
      online: ['live', 'Tersimpan di Google Sheets'],
      saving: ['busy', 'Menyimpan… (' + q + ')'],
      offline: ['snap', 'Offline · ' + q + ' menunggu'],
      error: ['err', 'Gagal sinkron']
    };
    var m = map[st] || map.local;
    if (st === 'online' && q) m = ['busy', 'Menyimpan… (' + q + ')'];
    b.className = 'badge ' + m[0];
    b.textContent = m[1] + (Sync.enabled() && Sync.role && st === 'online' ? ' · ' + ({ admin: 'Admin', input: 'Input', view: 'Lihat' })[Sync.role] : '');
    b.title = Sync.statusMsg || (Sync.lastSync ? 'Sinkron terakhir ' + Sync.lastSync.toLocaleTimeString('id-ID') : 'Status penyimpanan');
  }
  function render() {
    document.body.classList.toggle('ro', Sync.enabled() && !!Sync.role && !Sync.canWrite());
    document.body.classList.toggle('noadmin', Sync.enabled() && !!Sync.role && !Sync.isAdmin());
    updateBadge();
    recompute();
    var info = S.rab && S.rab.info || {};
    $('#projName').textContent = info.proyek || 'Monitoring RAB';
    $('#projSub').textContent = S.rab ? [info.owner, 'Budget biaya ' + rpS(C.budget), 'RAB diimpor ' + dateLbl((S.rab.importedAt || '').slice(0, 10))].filter(Boolean).join(' · ') : 'Impor file RAB (.xlsx) di menu Data & Backup untuk mulai';
    $('#cntTx').textContent = S.allTx().length || '';
    $('#cntPkg').textContent = S.data.pkgs.length || '';
    $$('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === ui.tab); });
    $$('main .tab').forEach(function (s) { s.classList.toggle('on', s.id === 'tab-' + ui.tab); });
    ({ dash: renderDash, budget: renderBudget, ahs: renderAhs, pkg: renderPkg, tx: renderTx, data: renderData })[ui.tab]();
  }
  function go(tab) { ui.tab = tab; try { localStorage.setItem('rabmon.v1.tab', tab); } catch (e) { /* abaikan */ } render(); window.scrollTo(0, 0); }

  function needRab(host) {
    host.innerHTML = '<div class="card empty"><h2>Belum ada data RAB</h2><p>Impor file RAB Excel (.xlsx) — budget per item akan dibaca dari Bill 3–8 dan sheet Persiapan, Alat, Penunjang, Pegawai, Umum.</p><p style="margin-top:14px"><button class="btn pri" data-act="goData">Impor RAB</button></p></div>';
  }

  /* ---------- DASHBOARD ---------- */
  function renderDash() {
    var host = $('#tab-dash');
    if (!S.rab) return needRab(host);
    var t = C.tot, sisa = C.budget - t.real;
    var overItems = Object.keys(C.L).map(function (id) { return C.L[id]; }).filter(function (x) { return x.real > 0 && (x.real > x.it.total || x.real >= x.it.total * 0.9); });
    overItems.sort(function (a, b) { return pct(b.real, b.it.total || 1) - pct(a.real, a.it.total || 1); });
    var overPk = Object.keys(C.pkgs).map(function (k) { return C.pkgs[k]; }).filter(function (P) { return P.real >= P.budget * 0.9 && P.real > 0; });
    var nPO = S.allTx().filter(function (x) { return !x.batal && x.jenis === 'PO'; }).length;
    var h = '';
    h += amprahDashNote();
    h += poDashNote();
    if (t.unallocTx.length) h += '<div class="note">' + t.unallocTx.length + ' transaksi senilai <b>' + rp(t.unalloc) + '</b> belum (penuh) dialokasikan ke item/paket budget — angka per kelompok belum memasukkannya. <button class="lnk" data-act="txUnalloc">Lihat</button></div>';
    if (t.orphan) h += '<div class="note crit">Ada alokasi senilai <b>' + rp(t.orphan) + '</b> yang menunjuk item/paket yang sudah tidak ada (mis. setelah impor ulang RAB). Perbaiki di transaksi terkait.</div>';
    h += '<div class="grid kpis">' +
      kpi('Budget biaya (RAB)', rpS(C.budget), S.rab.items.length + ' item budget') +
      kpi('Realisasi (komitmen)', rpS(t.real), pctTxt(t.real, C.budget) + ' dari budget') +
      kpi('Sudah dibayar', rpS(t.paid), pctTxt(t.paid, t.real) + ' dari realisasi') +
      kpi('Sisa budget', rpS(sisa), sisa < 0 ? 'Melebihi budget' : pctTxt(sisa, C.budget) + ' tersisa') +
      kpi('Transaksi', num(t.txCount), 'PO ' + nPO + ' · Non-PO ' + (t.txCount - nPO)) +
      '</div>';
    h += '<div class="grid g2">';
    // per kelompok
    h += '<div class="card"><div class="hd"><h2>Budget vs realisasi per kelompok</h2>' + legendKomit() + '</div>' +
      C.groups.map(function (g) { return meterHtml(grpLabel(g.g.id), g.real, g.paid, g.budget, { click: 'openGroup', id: g.g.id }); }).join('') + '</div>';
    // per komponen + jenis
    h += '<div class="card"><div class="hd"><h2>Per komponen biaya</h2>' + legendKomit() + '</div>' +
      ['mat', 'upah', 'lain'].map(function (k) { return meterHtml(K.KOMP[k], C.rK[k], null, C.bK[k]).replace('<i class="paid" style="width:0%"></i>', ''); }).join('') +
      '<p class="small muted" style="margin-top:8px">Budget material/upah dari pecahan kolom MATERIAL &amp; UPAH di Bill. Biaya prelim (Persiapan, Alat, Pegawai, Umum) masuk "Lain-lain".</p>' +
      '<div class="hd" style="margin-top:16px"><h2>Realisasi per kategori</h2></div>' + katBars() + '</div>';
    h += '</div><div class="grid g2">';
    h += '<div class="card"><div class="hd"><h2>Realisasi per bulan</h2><div class="legend"><span><i style="background:var(--s1)"></i>PO</span><span><i style="background:var(--s2)"></i>Non-PO</span></div></div><div id="chMonth"></div></div>';
    h += '<div class="card"><div class="hd"><h2>Perlu perhatian</h2><span class="small muted">item/paket ≥ 90% budget</span></div>' +
      (overItems.length || overPk.length ? overPk.map(function (P) { return meterHtml('▣ ' + P.p.nama, P.real, P.paid, P.budget, { click: 'pkgDetail', id: P.p.id }); }).join('') +
        overItems.slice(0, 12).map(function (x) { return meterHtml(x.it.desc + ' — ' + shortGrp(x.it.g), x.real, x.paid, x.it.total, { click: 'line', id: x.it.id }); }).join('') +
        (overItems.length > 12 ? '<p class="small muted" style="margin-top:6px">+' + (overItems.length - 12) + ' item lain. <button class="lnk" data-act="budgetWarn">Lihat semua</button></p>' : '')
        : '<p class="muted small">Belum ada item yang mendekati atau melewati budget.</p>') + '</div>';
    h += '</div>';
    if (HG.hasAhs) {
      var hr = HG.rows.filter(function (r) { return r.act; }).sort(function (a, b) { return Math.abs(b.imp) - Math.abs(a.imp); }).slice(0, 8);
      h += '<div class="card" style="margin-bottom:12px"><div class="hd"><h2>Harga satuan aktual vs RAB</h2>' + (hr.length ? '<span class="small">Proyeksi dampak <b>' + rpSigned(HG.sum.dampak) + '</b> · <button class="lnk" data-act="goHarga">Analisa harga</button></span>' : '') + '</div>' +
        (hr.length ? '<div class="tblwrap" style="max-height:none"><table><thead><tr><th>Material / upah / alat</th><th class="num">Harga RAB</th><th class="num">Harga aktual</th><th class="num">Selisih</th><th class="num">Kebutuhan</th><th class="num">Dampak</th></tr></thead><tbody>' +
          hr.map(function (r) { return '<tr data-act="hs" data-id="' + r.h.id + '" style="cursor:pointer"><td>' + esc(r.h.nama) + '</td><td class="num">' + rp(r.ref) + ' <span class="muted">/' + esc(r.h.sat) + '</span></td><td class="num">' + rp(r.avg) + '</td><td class="num">' + pctSigned(r.pct) + '</td><td class="num">' + (r.need ? qtyTxt(r.need.qty) + ' ' + esc(r.h.sat) : '—') + '</td><td class="num">' + rpSigned(r.imp) + '</td></tr>'; }).join('') + '</tbody></table></div>'
          : '<p class="muted small">Belum ada harga aktual. Saat mencatat PO / nota, isi bagian <b>Rincian harga satuan</b> (material, qty, harga) — aplikasi akan membandingkan dengan harga RAB (HARSAT) dan menghitung dampaknya ke kebutuhan proyek.</p>') + '</div>';
    }
    h += '<div class="card"><div class="hd"><h2>Transaksi terakhir</h2><button class="lnk" data-act="goTx">Semua transaksi</button></div>' + txMini(S.allTx().slice().sort(txSort).slice(0, 8)) + '</div>';
    $('#tab-dash').innerHTML = h;
    var months = Object.keys(t.byMonth).filter(function (m) { return m !== 'tanpa-tgl'; }).sort();
    if (months.length) {
      // isi bulan kosong di antara
      var all = [], y = +months[0].slice(0, 4), mo = +months[0].slice(5), end = months[months.length - 1];
      for (var guard = 0; guard < 60; guard++) { var key = y + '-' + String(mo).padStart(2, '0'); all.push(key); if (key === end) break; mo++; if (mo > 12) { mo = 1; y++; } }
      Charts.stackedColumns($('#chMonth'), all.map(function (m) { var v = t.byMonth[m] || { PO: 0, NP: 0 }; return { label: monthLbl(m), values: v }; }),
        [{ key: 'PO', name: 'PO', color: 'var(--s1)' }, { key: 'NP', name: 'Non-PO', color: 'var(--s2)' }], short, rp);
    } else $('#chMonth').innerHTML = '<p class="muted small">Belum ada transaksi bertanggal.</p>';
  }
  function kpi(l, v, f) { return '<div class="card kpi"><div class="lbl">' + l + '</div><div class="val">' + v + '</div><div class="ft">' + f + '</div></div>'; }
  function legendKomit() { return '<div class="legend"><span><i style="background:var(--s1)"></i>Dibayar</span><span><i style="background:color-mix(in srgb,var(--s1) 38%,var(--track))"></i>Realisasi</span></div>'; }
  function katBars() {
    var rows = K.KAT_ALL.map(function (k) { return { k: k, v: C.tot.byKat[k.id] || 0 }; }).filter(function (r) { return r.v > 0; });
    if (!rows.length) return '<p class="muted small">Belum ada transaksi.</p>';
    var max = Math.max.apply(null, rows.map(function (r) { return r.v; }));
    return rows.map(function (r) {
      var po = r.k.id.indexOf('po-') === 0;
      return '<div class="meter"><div class="nm"><span class="tag ' + (po ? 'po' : 'np') + '">' + (po ? 'PO' : 'Non-PO') + '</span> ' + esc(r.k.nama) + '</div>' +
        '<div class="trk" style="background:transparent"><i style="width:' + (r.v / max * 100) + '%;background:' + (po ? 'var(--s1)' : 'var(--s2)') + '"></i></div>' +
        '<div class="vv">' + rp(r.v) + ' · ' + pctTxt(r.v, C.tot.real) + '</div></div>';
    }).join('');
  }
  function txSort(a, b) { return (b.tgl || '').localeCompare(a.tgl || '') || (b.created || 0) - (a.created || 0); }
  function txMini(list) {
    if (!list.length) return '<p class="muted small">Belum ada transaksi. Klik <b>+ Transaksi</b> untuk mencatat PO, obname, atau pembayaran.</p>';
    return '<div class="tblwrap" style="max-height:none"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>No.</th><th>Pihak</th><th>Uraian</th><th class="num">Nilai</th></tr></thead><tbody>' +
      list.map(function (x) { return '<tr data-act="editTx" data-id="' + x.id + '" style="cursor:pointer"><td>' + dateLbl(x.tgl) + '</td><td>' + jenisTag(x) + '</td><td>' + esc(x.no) + '</td><td>' + esc(x.pihak) + '</td><td>' + esc(x.uraian) + '</td><td class="num">' + rp(x.nilai) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }
  function jenisTag(x) {
    if (x.src === 'po') return x.payOnly ? '<span class="tag np">Bayar</span> <span class="small">tanpa PO</span>' + (x.ovr ? ' <span class="tag">dikoreksi</span>' : '')
      : '<span class="tag po">PO</span> <span class="small">' + esc(x.poCat || '') + '</span> <span class="pill ' + (x.status === 'Lunas' ? 'ok' : x.status === 'Terbit' ? '' : 'warn') + '">' + esc(x.status) + '</span>' + (x.ovr || x.ovrTax ? ' <span class="tag">dikoreksi</span>' : '');
    if (x.src === 'amprah') return '<span class="tag am">Amprah</span> <span class="small">' + esc(x.jenisAmprah || '') + '</span> ' + notaPill(x) + (x.ovr ? ' <span class="tag">dikoreksi</span>' : '');
    var k = K.KAT_BY[x.kat];
    return '<span class="tag ' + (x.jenis === 'PO' ? 'po' : 'np') + '">' + (x.jenis === 'PO' ? 'PO' : 'Non-PO') + '</span> <span class="small">' + esc(k ? k.nama.replace(/^PO /, '') : x.kat) + '</span>' + (x.batal ? ' <span class="pill crit">Batal</span>' : '');
  }

  /* ---------- BUDGET ---------- */
  function renderBudget() {
    var host = $('#tab-budget');
    if (!S.rab) return needRab(host);
    var b = ui.b;
    var h = '<div class="bar"><div class="grow"><input type="search" id="bq" placeholder="Cari item budget (uraian, seksi, bill)…" value="' + esc(b.q) + '"></div>' +
      '<select id="bg"><option value="">Semua kelompok</option>' + S.rab.groups.map(function (g) { return '<option value="' + g.id + '"' + (b.g === g.id ? ' selected' : '') + '>' + esc(grpLabel(g.id)) + '</option>'; }).join('') + '</select>' +
      '<select id="bf"><option value="">Semua item</option><option value="real"' + (b.f === 'real' ? ' selected' : '') + '>Ada realisasi</option><option value="warn"' + (b.f === 'warn' ? ' selected' : '') + '>≥ 90% budget</option><option value="over"' + (b.f === 'over' ? ' selected' : '') + '>Over budget</option><option value="none"' + (b.f === 'none' ? ' selected' : '') + '>Belum ada realisasi</option></select>' +
      '<button class="btn" data-act="expandAll">Buka semua</button><button class="btn" data-act="collapseAll">Tutup semua</button></div>';
    h += '<div class="tblwrap"><table><thead><tr><th style="width:28px"></th><th>Uraian</th><th class="num">Volume</th><th class="num">Budget</th><th class="num">Realisasi</th><th class="num">Sisa</th><th class="num">%</th><th>Status</th></tr></thead><tbody>';
    var flat = b.q || b.f;
    var q = b.q.toLowerCase();
    var filt = function (it) {
      var x = C.L[it.id];
      if (b.g && it.g !== b.g) return false;
      if (q && (it.desc + ' ' + it.sec + ' ' + it.sub + ' ' + grpLabel(it.g) + ' ' + (it.rem || '')).toLowerCase().indexOf(q) < 0) return false;
      if (b.f === 'real' && !x.real) return false;
      if (b.f === 'warn' && !(x.real && x.real >= it.total * 0.9)) return false;
      if (b.f === 'over' && !(x.real > it.total)) return false;
      if (b.f === 'none' && x.real) return false;
      return true;
    };
    var rows = [];
    if (flat) {
      var list = S.rab.items.filter(filt);
      var sum = list.reduce(function (a, it) { a.b += it.total; a.r += C.L[it.id].real; return a; }, { b: 0, r: 0 });
      rows.push('<tr class="grp"><td></td><td>' + list.length + ' item cocok' + (list.length > 500 ? ' (500 pertama ditampilkan)' : '') + '</td><td></td><td class="num">' + rp(sum.b) + '</td><td class="num">' + rp(sum.r) + '</td><td class="num">' + rp(sum.b - sum.r) + '</td>' + pctCell(sum.b, sum.r) + '<td></td></tr>');
      list.slice(0, 500).forEach(function (it) { rows.push(itemRow(it, true)); });
    } else {
      C.groups.forEach(function (g) {
        if (b.g && g.g.id !== b.g) return;
        var gk = 'g:' + g.g.id, open = b.open[gk] || b.g === g.g.id;
        rows.push('<tr class="grp" data-act="tog" data-k="' + gk + '"><td><span class="caret">' + (open ? '▾' : '▸') + '</span></td><td>' + esc(grpLabel(g.g.id)) + ' <span class="subtxt">· ' + g.g.jenis + '</span></td><td></td><td class="num">' + rp(g.budget) + '</td><td class="num">' + rp(g.real) + '</td><td class="num">' + rp(g.budget - g.real) + '</td>' + pctCell(g.budget, g.real) + '<td>' + pillHtml(g.budget, g.real) + '</td></tr>');
        if (!open) return;
        Object.keys(g.secs).forEach(function (sn) {
          var s = g.secs[sn], sk = 's:' + g.g.id + ':' + sn, so = b.open[sk];
          rows.push('<tr class="sec" data-act="tog" data-k="' + esc(sk) + '"><td></td><td><span class="caret">' + (so ? '▾' : '▸') + '</span>' + esc(sn || '(tanpa seksi)') + ' <span class="subtxt">· ' + s.items.length + ' item</span></td><td></td><td class="num">' + rp(s.budget) + '</td><td class="num">' + rp(s.real) + '</td><td class="num">' + rp(s.budget - s.real) + '</td>' + pctCell(s.budget, s.real) + '<td>' + pillHtml(s.budget, s.real) + '</td></tr>');
          if (so) s.items.forEach(function (id) { rows.push(itemRow(C.L[id].it, false)); });
        });
      });
    }
    h += rows.join('') + '</tbody></table></div>';
    var selIds = Object.keys(b.sel).filter(function (k) { return b.sel[k] && C.L[k]; });
    if (selIds.length) {
      var sb = selIds.reduce(function (a, id) { return a + C.L[id].it.total; }, 0);
      h += '<div class="sel-bar"><b>' + selIds.length + ' item dipilih</b><span>budget ' + rp(sb) + '</span><span style="flex:1"></span>' +
        '<button class="btn w" data-act="selTx">Catat transaksi</button><button class="btn w" data-act="selPkg">Buat paket</button>' +
        (S.data.pkgs.length ? '<button class="btn w" data-act="selAddPkg">Tambah ke paket…</button>' : '') +
        '<button class="btn" data-act="selClear">Batal pilih</button></div>';
    }
    host.innerHTML = h;
    var bq = $('#bq'), tmr;
    bq.addEventListener('input', function () { clearTimeout(tmr); tmr = setTimeout(function () { ui.b.q = bq.value; var pos = bq.selectionStart; renderBudget(); var n = $('#bq'); n.focus(); n.setSelectionRange(pos, pos); }, 250); });
    $('#bg').addEventListener('change', function (e) { ui.b.g = e.target.value; renderBudget(); });
    $('#bf').addEventListener('change', function (e) { ui.b.f = e.target.value; renderBudget(); });
  }
  function itemRow(it, showGrp) {
    var x = C.L[it.id];
    var bd = [];
    if (it.mat) bd.push('M ' + short(it.mat)); if (it.upah) bd.push('U ' + short(it.upah));
    return '<tr><td><input type="checkbox" data-act="sel" data-id="' + it.id + '"' + (ui.b.sel[it.id] ? ' checked' : '') + ' aria-label="pilih"></td>' +
      '<td class="desc"><button class="lnk" style="text-align:left;color:var(--ink);text-decoration-color:var(--axis)" data-act="line" data-id="' + it.id + '">' + esc(it.desc) + '</button>' +
      '<div class="subtxt">' + (showGrp ? esc(grpLabel(it.g) + ' › ' + it.sec) + (it.sub ? ' › ' : '') : '') + esc(it.sub) + (it.rem ? ' · ' + esc(it.rem) : '') + '</div></td>' +
      '<td class="num">' + (it.qty != null ? nf2.format(it.qty) : '') + ' <span class="muted">' + esc(it.unit) + '</span></td>' +
      '<td class="num">' + rp(it.total) + (bd.length ? '<div class="subtxt">' + bd.join(' · ') + '</div>' : '') + '</td>' +
      '<td class="num">' + (x.real ? rp(x.real) : '<span class="muted">—</span>') + '</td><td class="num">' + rp(it.total - x.real) + '</td>' + pctCell(it.total, x.real) + '<td>' + pillHtml(it.total, x.real) + '</td></tr>';
  }

  /* ---------- PAKET ---------- */
  function renderPkg() {
    var host = $('#tab-pkg');
    if (!S.rab) return needRab(host);
    var q = ui.p.q.toLowerCase();
    var list = S.data.pkgs.filter(function (p) { return !q || (p.nama + ' ' + (p.ket || '')).toLowerCase().indexOf(q) >= 0; });
    var h = '<div class="bar"><div class="grow"><input type="search" id="pq" placeholder="Cari paket…" value="' + esc(ui.p.q) + '"></div><button class="btn pri w" data-act="newPkg">+ Paket baru</button></div>';
    h += '<p class="small ink2" style="margin-bottom:12px">Paket = gabungan beberapa item budget yang dikerjakan/dibelanjakan bersama (mis. satu PO beton untuk beberapa bangunan, atau satu obname mandor untuk beberapa pekerjaan). Transaksi yang dialokasikan ke paket dibagi ke item anggotanya sebanding budget item.</p>';
    if (!list.length) h += '<div class="card empty"><h2>Belum ada paket</h2><p>Buat paket dari sini, atau pilih beberapa item di tab Budget RAB lalu klik <b>Buat paket</b>.</p></div>';
    else {
      h += '<div class="grid g2">' + list.map(function (p) {
        var P = C.pkgs[p.id];
        var ntx = Object.keys(P.tx).length;
        return '<div class="card"><div class="hd"><h2>' + esc(p.nama) + '</h2>' + pillHtml(P.budget, P.real) + '</div>' +
          (p.ket ? '<p class="small ink2" style="margin-bottom:8px">' + esc(p.ket) + '</p>' : '') +
          meterHtml(P.lines.length + ' item · ' + ntx + ' transaksi', P.real, P.paid, P.budget) +
          '<div class="list-row"><span class="ink2">Sisa</span><b class="num">' + rp(P.budget - P.real) + '</b></div>' +
          '<div class="bar" style="margin:8px 0 0"><button class="btn sm" data-act="pkgDetail" data-id="' + p.id + '">Detail</button><button class="btn sm w" data-act="editPkg" data-id="' + p.id + '">Ubah</button><button class="btn sm w" data-act="pkgTx" data-id="' + p.id + '">+ Transaksi ke paket</button></div></div>';
      }).join('') + '</div>';
    }
    host.innerHTML = h;
    var pq = $('#pq'), tmr;
    pq.addEventListener('input', function () { clearTimeout(tmr); tmr = setTimeout(function () { ui.p.q = pq.value; renderPkg(); var n = $('#pq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); });
  }

  /* ---------- TRANSAKSI ---------- */
  function txFiltered() {
    var f = ui.t, q = f.q.toLowerCase();
    return S.allTx().filter(function (x) {
      if (f.j && x.jenis !== f.j) return false;
      if (f.k && x.kat !== f.k) return false;
      if (f.s && (x.src || 'manual') !== f.s) return false;
      if (f.m && (x.tgl || '').slice(0, 7) !== f.m) return false;
      if (f.unalloc) { var u = C.tot.unallocTx.some(function (r) { return r.t.id === x.id; }); if (!u) return false; }
      if (q && (x.no + ' ' + x.pihak + ' ' + x.uraian + ' ' + (x.ket || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(txSort);
  }
  function renderTx() {
    var host = $('#tab-tx');
    var f = ui.t;
    var months = {}; S.allTx().forEach(function (x) { if (x.tgl) months[x.tgl.slice(0, 7)] = 1; });
    var h = '<div class="bar"><div class="grow"><input type="search" id="tq" placeholder="Cari no. dokumen, vendor/mandor, uraian…" value="' + esc(f.q) + '"></div>' +
      '<div class="seg" id="tj">' + [['', 'Semua'], ['PO', 'PO'], ['NP', 'Non-PO']].map(function (o) { return '<button data-v="' + o[0] + '" class="' + (f.j === o[0] ? 'on' : '') + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      '<select id="ts"><option value="">Semua sumber</option>' + [['manual', 'Dicatat manual'], ['po', 'Sheet PO'], ['amprah', 'Sheet Amprah']].map(function (o) { return '<option value="' + o[0] + '"' + (f.s === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<select id="tk"><option value="">Semua kategori</option>' + K.KAT_ALL.map(function (k) { return '<option value="' + k.id + '"' + (f.k === k.id ? ' selected' : '') + '>' + esc(k.nama) + '</option>'; }).join('') + '</select>' +
      '<select id="tm"><option value="">Semua bulan</option>' + Object.keys(months).sort().reverse().map(function (m) { return '<option value="' + m + '"' + (f.m === m ? ' selected' : '') + '>' + monthLbl(m) + '</option>'; }).join('') + '</select>' +
      (f.unalloc ? '<button class="btn" data-act="clrUnalloc">✕ Hanya belum dialokasikan</button>' : '') +
      '<button class="btn pri w" data-act="newTx">+ Transaksi</button></div>';
    var list = txFiltered();
    if (!S.allTx().length) {
      h += '<div class="card empty"><h2>Belum ada transaksi</h2><p>Catat belanja dengan <b>PO</b> (material, subkon, sewa) atau <b>Non-PO</b> (obname mandor, material beli langsung, bayar orang/harian, lain-lain).<br>Satu transaksi bisa dialokasikan ke beberapa item budget atau ke paket pekerjaan.</p>' + (S.rab ? '<p style="margin-top:14px"><button class="btn pri w" data-act="newTx">+ Transaksi pertama</button></p>' : '') + '</div>';
      host.innerHTML = h; bindTx(); return;
    }
    var sum = list.reduce(function (a, x) { if (!x.batal) { a.n += +x.nilai || 0; a.b += +x.bayar || 0; } return a; }, { n: 0, b: 0 });
    h += '<div class="tblwrap"><table><thead><tr><th>Tanggal</th><th>Jenis / kategori</th><th>No. dokumen</th><th>Vendor / mandor / penerima</th><th>Uraian</th><th>Alokasi budget</th><th class="num">Nilai</th><th class="num">Dibayar</th></tr></thead><tbody>' +
      list.map(function (x) {
        var un = C.tot.unallocTx.find(function (r) { return r.t.id === x.id; });
        var al = (x.alok || []);
        var alTxt = al.length ? esc(targetInfo(al[0].t).nama) + (al.length > 1 ? ' <span class="muted">+' + (al.length - 1) + ' lainnya</span>' : '') : '';
        if (un && !x.batal) alTxt += (alTxt ? '<br>' : '') + '<span class="pill warn">Belum dialokasi ' + rpS(un.sisa) + '</span>';
        return '<tr data-act="editTx" data-id="' + x.id + '" style="cursor:pointer' + (x.batal ? ';opacity:.55' : '') + '"><td style="white-space:nowrap">' + dateLbl(x.tgl) + '</td><td>' + jenisTag(x) + '</td><td>' + esc(x.no) + '</td><td>' + esc(x.pihak) + '</td><td>' + esc(x.uraian) + '</td><td class="small">' + alTxt + '</td><td class="num">' + rp(x.nilai) + '</td><td class="num">' + rp(x.bayar) + (x.nilai && x.bayar < x.nilai ? '<div class="subtxt">' + pctTxt(x.bayar, x.nilai) + '</div>' : '') + '</td></tr>';
      }).join('') +
      '</tbody><tfoot><tr><th colspan="6">' + list.length + ' transaksi (tidak termasuk yang batal)</th><th class="num">' + rp(sum.n) + '</th><th class="num">' + rp(sum.b) + '</th></tr></tfoot></table></div>';
    host.innerHTML = h; bindTx();
  }
  function bindTx() {
    var tq = $('#tq'), tmr;
    if (!tq) return;
    tq.addEventListener('input', function () { clearTimeout(tmr); tmr = setTimeout(function () { ui.t.q = tq.value; renderTx(); var n = $('#tq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); });
    $$('#tj button').forEach(function (b) { b.addEventListener('click', function () { ui.t.j = b.dataset.v; renderTx(); }); });
    $('#tk').addEventListener('change', function (e) { ui.t.k = e.target.value; renderTx(); });
    $('#ts').addEventListener('change', function (e) { ui.t.s = e.target.value; renderTx(); });
    $('#tm').addEventListener('change', function (e) { ui.t.m = e.target.value; renderTx(); });
  }

  /* ---------- ANALISA HARGA ---------- */
  function qtyTxt(q) { return q == null ? '' : nf2.format(Math.round(q * 100) / 100); }
  function pctSigned(p) { if (p == null) return '<span class="muted">—</span>'; var v = Math.round(p * 1000) / 10; var cls = v > 0.05 ? 'crit' : v < -0.05 ? 'ok' : ''; return '<span class="pill ' + cls + '">' + (v > 0 ? '+' : '') + nf2.format(v) + '%</span>'; }
  function rpSigned(n) { if (!n) return '<span class="muted">—</span>'; return (n > 0 ? '+' : '−') + 'Rp ' + nf.format(Math.abs(Math.round(n))); }
  function renderAhs() {
    var host = $('#tab-ahs');
    if (!S.rab) return needRab(host);
    if (!HG.hasAhs) {
      host.innerHTML = '<div class="card empty"><h2>Analisa harga belum dimuat</h2><p>Data RAB di browser ini diimpor sebelum fitur analisa harga ada. Impor ulang file RAB yang sama di menu Data &amp; Backup — transaksi & paket tetap aman.</p><p style="margin-top:14px"><button class="btn pri" data-act="goData">Impor ulang RAB</button></p></div>';
      return;
    }
    var sm = HG.sum, h = '';
    h += '<div class="grid kpis">' +
      kpi('Item Bill bertaut AHS', num(sm.nLinked), rpS(sm.valLinked) + ' nilai budget') +
      kpi('Blok analisa (AHS)', num(S.rab.ahs.length), 'AHS CSA + Analisa Harga') +
      kpi('Harga dasar dipakai', num(sm.nUsed) + ' / ' + num(S.rab.harsat.length), 'kebutuhan material ' + rpS(sm.needVal.mat)) +
      kpi('Harga aktual tercatat', num(sm.nAct), 'jenis material/upah/alat') +
      kpi('Proyeksi dampak harga', (sm.dampak > 0 ? '+' : sm.dampak < 0 ? '−' : '') + rpS(Math.abs(sm.dampak)), sm.dampak > 0 ? 'lebih mahal dari RAB' : sm.dampak < 0 ? 'lebih hemat dari RAB' : 'belum ada data harga aktual') +
      '</div>';
    h += '<div class="bar"><div class="seg" id="hv"><button data-v="dasar" class="' + (ui.h.view === 'dasar' ? 'on' : '') + '">Harga dasar &amp; kebutuhan</button><button data-v="ahs" class="' + (ui.h.view === 'ahs' ? 'on' : '') + '">Analisa per pekerjaan (AHS)</button></div></div>';
    host.innerHTML = h + '<div id="hbody"></div>';
    $$('#hv button').forEach(function (b) { b.addEventListener('click', function () { ui.h.view = b.dataset.v; renderAhs(); }); });
    if (ui.h.view === 'dasar') renderHarsat(); else renderBlocks();
  }
  function renderHarsat() {
    var f = ui.h, q = f.q.toLowerCase();
    var rows = HG.rows.filter(function (r) {
      if (f.j && r.h.jenis !== f.j) return false;
      if (f.f === 'used' && !r.need && !r.act) return false;
      if (f.f === 'act' && !r.act) return false;
      if (f.f === 'mis' && !r.mismatch) return false;
      if (q && (r.h.nama + ' ' + r.h.sec + ' ' + r.h.vendor + ' ' + r.h.brand).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var sorters = {
      need: function (a, b) { return (b.need ? b.need.val : 0) - (a.need ? a.need.val : 0); },
      imp: function (a, b) { return Math.abs(b.imp) - Math.abs(a.imp); },
      pct: function (a, b) { return Math.abs(b.pct || 0) - Math.abs(a.pct || 0); },
      sheet: function () { return 0; }
    };
    rows = rows.slice().sort(sorters[f.sort] || sorters.sheet);
    var h = '<div class="bar"><div class="grow"><input type="search" id="hq" placeholder="Cari material / upah / alat, vendor…" value="' + esc(f.q) + '"></div>' +
      '<select id="hj"><option value="">Semua jenis</option><option value="mat"' + (f.j === 'mat' ? ' selected' : '') + '>Material</option><option value="upah"' + (f.j === 'upah' ? ' selected' : '') + '>Upah pekerja</option><option value="alat"' + (f.j === 'alat' ? ' selected' : '') + '>Sewa alat</option></select>' +
      '<select id="hf"><option value="used"' + (f.f === 'used' ? ' selected' : '') + '>Dipakai di AHS / ada harga aktual</option><option value="act"' + (f.f === 'act' ? ' selected' : '') + '>Hanya yang ada harga aktual</option><option value="mis"' + (f.f === 'mis' ? ' selected' : '') + '>Harga di AHS ≠ HARSAT (' + HG.nMismatch + ')</option><option value=""' + (!f.f ? ' selected' : '') + '>Semua harga dasar</option></select>' +
      '<select id="hs"><option value="need"' + (f.sort === 'need' ? ' selected' : '') + '>Urut: nilai kebutuhan</option><option value="imp"' + (f.sort === 'imp' ? ' selected' : '') + '>Urut: dampak harga</option><option value="pct"' + (f.sort === 'pct' ? ' selected' : '') + '>Urut: selisih %</option><option value="sheet"' + (f.sort === 'sheet' ? ' selected' : '') + '>Urut: sesuai sheet HARSAT</option></select></div>';
    h += '<p class="small ink2" style="margin-bottom:10px">Kebutuhan = volume item Bill × koefisien AHS (hanya item yang bertaut ke AHS). Harga RAB = harga yang dipakai di AHS (rata-rata); bila berbeda dari daftar HARSAT diberi tanda <span class="pill warn">HARSAT</span> — periksa kemungkinan salah ketik. Harga aktual = rata-rata tertimbang dari <b>rincian harga</b> di transaksi. Dampak = (harga aktual − harga RAB) × kebutuhan (atau qty dibeli bila lebih besar).</p>';
    h += '<div class="tblwrap"><table><thead><tr><th>Material / upah / alat</th><th>Sat</th><th class="num">Harga RAB (AHS)</th><th class="num">Kebutuhan</th><th class="num">Nilai kebutuhan</th><th class="num">Harga aktual</th><th class="num">Selisih</th><th class="num">Dibeli</th><th class="num">Dampak</th></tr></thead><tbody>' +
      (rows.length ? rows.slice(0, 400).map(function (r) {
        return '<tr data-act="hs" data-id="' + r.h.id + '" style="cursor:pointer"><td class="desc">' + esc(r.h.nama) + '<div class="subtxt">' + esc(r.h.sec) + (r.h.vendor ? ' · ' + esc(r.h.vendor) : '') + '</div></td><td>' + esc(r.h.sat) + '</td><td class="num">' + rp(r.ref) + (r.mismatch ? '<div class="subtxt"><span class="pill warn">HARSAT ' + rp(r.h.harga) + '</span></div>' : '') + '</td>' +
          '<td class="num">' + (r.need ? qtyTxt(r.need.qty) : '<span class="muted">—</span>') + '</td><td class="num">' + (r.need ? rp(r.need.val) : '<span class="muted">—</span>') + '</td>' +
          '<td class="num">' + (r.avg != null ? rp(r.avg) + '<div class="subtxt">' + r.act.n + '× beli</div>' : '<span class="muted">—</span>') + '</td><td class="num">' + pctSigned(r.pct) + '</td>' +
          '<td class="num">' + (r.act ? qtyTxt(r.act.qty) : '<span class="muted">—</span>') + '</td><td class="num">' + rpSigned(r.imp) + '</td></tr>';
      }).join('') : '<tr><td colspan="9" class="muted">Tidak ada data yang cocok.</td></tr>') +
      '</tbody></table></div>' + (rows.length > 400 ? '<p class="small muted" style="margin-top:6px">400 dari ' + rows.length + ' baris ditampilkan — persempit pencarian.</p>' : '');
    $('#hbody').innerHTML = h;
    var hq = $('#hq'), tmr;
    hq.addEventListener('input', function () { clearTimeout(tmr); tmr = setTimeout(function () { ui.h.q = hq.value; renderHarsat(); var n = $('#hq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); });
    $('#hj').addEventListener('change', function (e) { ui.h.j = e.target.value; renderHarsat(); });
    $('#hf').addEventListener('change', function (e) { ui.h.f = e.target.value; renderHarsat(); });
    $('#hs').addEventListener('change', function (e) { ui.h.sort = e.target.value; renderHarsat(); });
  }
  function renderBlocks() {
    var f = ui.a, q = f.q.toLowerCase();
    var list = S.rab.ahs.filter(function (b) {
      if (f.src && b.src.trim() !== f.src) return false;
      if (f.used && !HG.use[b.id].items.length) return false;
      if (q && (b.title + ' ' + b.sec + ' ' + b.comps.map(function (c) { return c.nama; }).join(' ')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var srcs = Array.from(new Set(S.rab.ahs.map(function (b) { return b.src.trim(); })));
    var h = '<div class="bar"><div class="grow"><input type="search" id="aq" placeholder="Cari pekerjaan atau komponen (mis. beton, bekisting, pekerja)…" value="' + esc(f.q) + '"></div>' +
      '<select id="as"><option value="">Semua sheet</option>' + srcs.map(function (s) { return '<option' + (f.src === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>' +
      '<label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="au"' + (f.used ? ' checked' : '') + '> Hanya yang dipakai di Bill</label></div>';
    h += '<div class="tblwrap"><table><thead><tr><th>Analisa pekerjaan</th><th class="num">Material</th><th class="num">Upah</th><th class="num">Harga satuan</th><th class="num">Dgn harga aktual</th><th class="num">Dipakai</th><th class="num">Budget terkait</th><th class="num">Realisasi</th></tr></thead><tbody>' +
      (list.length ? list.slice(0, 400).map(function (b) {
        var u = HG.use[b.id], aa = K.ahsActual(b, HG);
        return '<tr data-act="blk" data-id="' + b.id + '" style="cursor:pointer"><td class="desc">' + esc(b.title) + '<div class="subtxt">' + esc(b.src.trim()) + ' baris ' + b.r0 + (b.sec && b.sec !== 'Analisa Harga' ? ' · ' + esc(b.sec) : '') + ' · ' + b.comps.length + ' komponen</div></td>' +
          '<td class="num">' + rp(b.tm) + '</td><td class="num">' + rp(b.tu) + '</td><td class="num"><b>' + rp(b.total) + '</b></td>' +
          '<td class="num">' + (aa.changed ? rp(aa.total) + '<div class="subtxt">' + pctSigned(b.total ? aa.total / b.total - 1 : null) + '</div>' : '<span class="muted">—</span>') + '</td>' +
          '<td class="num">' + (u.items.length ? u.items.length + ' item' : '<span class="muted">—</span>') + '</td><td class="num">' + (u.value ? rp(u.value) : '<span class="muted">—</span>') + '</td><td class="num">' + (u.real ? rp(u.real) : '<span class="muted">—</span>') + '</td></tr>';
      }).join('') : '<tr><td colspan="8" class="muted">Tidak ada analisa yang cocok.</td></tr>') + '</tbody></table></div>';
    $('#hbody').innerHTML = h;
    var aq = $('#aq'), tmr;
    aq.addEventListener('input', function () { clearTimeout(tmr); tmr = setTimeout(function () { ui.a.q = aq.value; renderBlocks(); var n = $('#aq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); });
    $('#as').addEventListener('change', function (e) { ui.a.src = e.target.value; renderBlocks(); });
    $('#au').addEventListener('change', function (e) { ui.a.used = e.target.checked; renderBlocks(); });
  }
  function compsTable(b, factor) {
    factor = factor || 1;
    var rows = b.comps.map(function (c) {
      var hs = HG.matchHs(c), a = hs && HG.act[hs.id];
      var avg = a ? a.val / a.qty : null, unit = c.hm + c.hu;
      return '<tr><td>' + (hs ? '<button class="lnk" style="text-align:left;color:var(--ink)" data-act="hs" data-id="' + hs.id + '">' + esc(c.nama) + '</button>' : esc(c.nama)) + '</td><td>' + esc(c.sat) + '</td><td class="num">' + nf2.format(Math.round(c.koef * factor * 10000) / 10000) + '</td>' +
        '<td class="num">' + (c.hm ? rp(c.hm) : '') + '</td><td class="num">' + (c.hu ? rp(c.hu) : '') + '</td><td class="num">' + rp((c.jm + c.ju) * factor) + '</td>' +
        '<td class="num">' + (avg != null ? rp(avg) + ' ' + pctSigned(unit ? avg / unit - 1 : null) : '<span class="muted">—</span>') + '</td></tr>';
    }).join('');
    return '<div class="tblwrap" style="max-height:none"><table><thead><tr><th>Komponen</th><th>Sat</th><th class="num">Koefisien</th><th class="num">Harga material</th><th class="num">Harga upah</th><th class="num">Jumlah</th><th class="num">Harga aktual</th></tr></thead><tbody>' + rows +
      '</tbody><tfoot><tr><th colspan="5">Harga satuan' + (factor !== 1 ? ' (disesuaikan ke harga item)' : '') + '</th><th class="num">' + rp(b.total * factor) + '</th><th></th></tr></tfoot></table></div>';
  }
  function blockDetail(id) {
    var b = HG.B[id]; if (!b) return;
    var u = HG.use[id], aa = K.ahsActual(b, HG);
    openModal('<header><h2>' + esc(b.title) + '</h2><button class="x" data-close aria-label="Tutup">×</button></header><div class="body">' +
      '<p class="small ink2" style="margin-bottom:10px">' + esc(b.src.trim()) + ' baris ' + b.r0 + '–' + b.r1 + (b.sec ? ' · ' + esc(b.sec) : '') + (b.per ? ' · per ' + esc(b.per) : '') + (b.bulat ? ' · dibulatkan ' + rp(b.bulat) : '') + '</p>' +
      compsTable(b) +
      (aa.changed ? '<div class="note" style="margin-top:10px">Dengan harga aktual (' + aa.changed + ' komponen), harga satuan menjadi <b>' + rp(aa.total) + '</b> ' + pctSigned(b.total ? aa.total / b.total - 1 : null) + ' vs RAB ' + rp(b.total) + '.</div>' : '<p class="small muted" style="margin-top:8px">Belum ada harga aktual untuk komponen analisa ini. Isi <b>rincian harga</b> saat mencatat transaksi.</p>') +
      '<h3 style="font-size:14px;margin:14px 0 6px">Dipakai di item Bill</h3>' +
      (u.items.length ? '<div class="tblwrap" style="max-height:300px"><table><thead><tr><th>Item</th><th class="num">Volume</th><th class="num">Harga satuan item</th><th class="num">Budget</th><th class="num">Realisasi</th></tr></thead><tbody>' +
        u.items.map(function (iid) { var x = C.L[iid], it = x.it; return '<tr><td><button class="lnk" style="text-align:left;color:var(--ink)" data-act="line" data-id="' + iid + '">' + esc(it.desc) + '</button><div class="subtxt">' + esc(grpLabel(it.g) + ' › ' + it.sec) + '</div></td><td class="num">' + qtyTxt(it.qty) + ' ' + esc(it.unit) + '</td><td class="num">' + (it.qty ? rp(it.total / it.qty) : '') + '</td><td class="num">' + rp(it.total) + '</td><td class="num">' + rp(x.real) + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="muted small">Tidak dirujuk langsung oleh item Bill (bisa dipakai sebagai harga pembanding).</p>') + '</div>');
  }
  function harsatDetail(id) {
    var h = HG.H[id]; if (!h) return;
    var nd = HG.need[id], a = HG.act[id], avg = a ? a.val / a.qty : null, R = HG.R[id], ref = R.ref;
    var blk = nd ? Object.keys(nd.blocks).map(function (bid) { return { b: HG.B[bid], q: nd.blocks[bid] }; }).sort(function (x, y) { return y.q - x.q; }) : [];
    openModal('<header><h2>' + esc(h.nama) + '</h2><button class="x" data-close aria-label="Tutup">×</button></header><div class="body">' +
      '<p class="small ink2" style="margin-bottom:10px">HARSAT CSA baris ' + h.id.slice(1) + ' · ' + esc(h.sec) + (h.vendor ? ' · vendor RAB: ' + esc(h.vendor) : '') + (h.lok ? ' (' + esc(h.lok) + ')' : '') + (h.brand ? ' · ' + esc(h.brand) : '') + (h.upd ? ' · update ' + dateLbl(h.upd) : '') + '</p>' +
      '<div class="grid kpis">' + kpi('Harga RAB (di AHS)', rp(ref), 'per ' + esc(h.sat) + (R.mismatch ? ' · HARSAT ' + rp(h.harga) + ' ⚠' : '')) + kpi('Harga aktual rata-rata', avg != null ? rp(avg) : '—', a ? a.n + ' pembelian · terakhir ' + rp(a.last.harga) : 'belum ada') +
      kpi('Kebutuhan (AHS × volume)', nd ? qtyTxt(nd.qty) + ' ' + esc(h.sat) : '—', nd ? rp(nd.val) : 'tidak dipakai item bertaut') + kpi('Dampak proyeksi', avg != null ? rpS(Math.abs(R.imp)) : '—', avg != null ? (avg > ref ? 'lebih mahal' : 'lebih hemat') + ' · ' + nf2.format(Math.round((avg / ref - 1) * 1000) / 10) + '%' : '') + '</div>' +
      '<h3 style="font-size:14px;margin:6px 0 6px">Riwayat harga aktual</h3>' +
      (a ? '<div class="tblwrap" style="max-height:260px"><table><thead><tr><th>Tanggal</th><th>No.</th><th>Pihak</th><th class="num">Qty</th><th class="num">Harga satuan</th><th class="num">vs RAB</th></tr></thead><tbody>' +
        a.list.slice().sort(function (x, y) { return (y.tgl || '').localeCompare(x.tgl || ''); }).map(function (r) { return '<tr data-act="editTx" data-id="' + r.tx + '" style="cursor:pointer"><td>' + dateLbl(r.tgl) + '</td><td>' + esc(r.no) + '</td><td>' + esc(r.pihak) + '</td><td class="num">' + qtyTxt(r.qty) + ' ' + esc(r.sat || h.sat) + '</td><td class="num">' + rp(r.harga) + '</td><td class="num">' + pctSigned(ref ? r.harga / ref - 1 : null) + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="muted small">Belum ada. Tambahkan di <b>rincian harga</b> saat mencatat PO / nota.</p>') +
      '<h3 style="font-size:14px;margin:14px 0 6px">Dipakai di analisa (AHS)</h3>' +
      (blk.length ? '<div class="tblwrap" style="max-height:260px"><table><thead><tr><th>Analisa</th><th class="num">Kebutuhan</th></tr></thead><tbody>' +
        blk.map(function (x) { return '<tr data-act="blk" data-id="' + x.b.id + '" style="cursor:pointer"><td>' + esc(x.b.title) + '<div class="subtxt">' + esc(x.b.src.trim()) + ' baris ' + x.b.r0 + '</div></td><td class="num">' + qtyTxt(x.q) + ' ' + esc(h.sat) + '</td></tr>'; }).join('') +
        '</tbody></table></div>' : '<p class="muted small">Tidak dipakai di analisa yang bertaut ke item Bill.</p>') + '</div>');
  }

  /* ---------- DATA ---------- */
  function renderData() {
    var h = serverCard();
    h += '<div class="grid g2"><div class="card adm"><div class="hd"><h2>' + (Sync.enabled() ? 'Terbitkan / perbarui RAB ke server' : 'Impor / perbarui RAB') + '</h2></div>' +
      (Sync.enabled() ? '<p class="small ink2" style="margin-bottom:8px">Admin: pilih file RAB .xlsx — hasil bacaannya (budget, AHS, HARSAT) ditulis ke Google Sheet sehingga semua pengguna langsung memakainya tanpa impor.</p>' : '') +
      '<label class="drop" id="drop"><input type="file" id="fRab" accept=".xlsx,.xlsm,.xls" class="hide"><b>Pilih file RAB (.xlsx)</b><br><span class="small">atau seret file ke sini · file besar perlu 10–40 detik</span></label>' +
      '<div id="impMsg" style="margin-top:10px">' + (ui.impMsg || '') + '</div>';
    if (S.rab) {
      h += '<p class="small ink2" style="margin-top:10px">Terakhir diimpor: <b>' + esc(S.rab.file || '') + '</b> · ' + dateLbl((S.rab.importedAt || '').slice(0, 10)) + ' · ' + S.rab.items.length + ' item · ' + rp(C.budget) + '</p>' + checksTable(S.rab);
      if (S.rab.info && S.rab.info.biayaKonstruksi) {
        var d = C.budget - S.rab.info.biayaKonstruksi;
        h += '<p class="small" style="margin-top:8px">Pembanding RABT "Biaya Konstruksi": ' + rp(S.rab.info.biayaKonstruksi) + (Math.abs(d) >= 1 ? ' · selisih <b>' + rp(d) + '</b>' : ' · <span class="pill ok">cocok</span>') + '</p>';
      }
      h += S.rab.ahs ? '<p class="small" style="margin-top:8px">Analisa harga: ' + S.rab.ahs.length + ' blok AHS, ' + (S.rab.harsat || []).length + ' harga dasar, ' + (S.rab.ahsLinked || 0) + ' item Bill bertaut ke AHS.</p>'
        : '<div class="note" style="margin-top:8px">RAB ini diimpor sebelum fitur analisa harga. Impor ulang file yang sama untuk memuat AHS &amp; HARSAT.</div>';
      h += '<p class="small muted" style="margin-top:8px">Impor ulang RAB revisi aman: alokasi transaksi & paket dipetakan ulang ke item yang sama (berdasarkan bill, uraian, satuan).</p>';
    }
    h += '</div><div class="card"><div class="hd"><h2>Backup & ekspor</h2></div>' +
      '<div class="list-row"><span>Backup lengkap (RAB + transaksi + paket)</span><button class="btn" data-act="backup">Unduh .json</button></div>' +
      (Sync.enabled() ? '' : '<div class="list-row"><span>Pulihkan dari backup</span><label class="btn">Pilih .json<input type="file" id="fBak" accept=".json" class="hide"></label></div>') +
      '<div class="list-row"><span>Laporan Excel (ringkasan, budget vs realisasi per item, transaksi, alokasi)</span><button class="btn" data-act="xls"' + (S.rab ? '' : ' disabled') + '>Unduh .xlsx</button></div>' +
      '<div class="list-row"><span>' + (Sync.enabled() ? 'Hapus salinan di browser ini & unduh ulang dari server' : 'Hapus semua data di browser ini') + '</span><button class="btn danger" data-act="reset">' + (Sync.enabled() ? 'Unduh ulang' : 'Hapus') + '</button></div>' +
      (S.data.savedAt ? '<p class="small muted" style="margin-top:8px">Disimpan terakhir ' + new Date(S.data.savedAt).toLocaleString('id-ID') + '</p>' : '') +
      '</div></div>';
    h += poCard();
    h += amprahCard();
    h += installCard();
    $('#tab-data').innerHTML = h;
    var drop = $('#drop');
    $('#fRab').addEventListener('change', function (e) { if (e.target.files[0]) importRab(e.target.files[0]); });
    ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { var f = e.dataTransfer.files[0]; if (f) importRab(f); });
    if ($('#fBak')) $('#fBak').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      f.text().then(function (txt) {
        var obj = JSON.parse(txt);
        if (!confirm('Pulihkan backup dari ' + (obj.exportedAt || '?') + '? Data di browser ini akan diganti.')) return;
        S.importBackup(obj); toast('Backup dipulihkan'); render();
      }).catch(function (err) { alert('Gagal membaca backup: ' + err.message); });
    });
  }
  function checksTable(rab) {
    return '<div class="tblwrap" style="max-height:none;margin-top:8px"><table><thead><tr><th>Sheet</th><th class="num">Item</th><th class="num">Jumlah item</th><th class="num">Total di sheet</th><th>Cek</th></tr></thead><tbody>' +
      rab.checks.map(function (c) {
        if (c.msg) return '<tr><td colspan="5"><span class="pill crit">' + esc(c.msg) + '</span></td></tr>';
        return '<tr><td>' + esc(c.sheet) + '</td><td class="num">' + c.count + '</td><td class="num">' + rp(c.sum) + '</td><td class="num">' + (c.sheetTotal != null ? rp(c.sheetTotal) : '—') + '</td><td>' + (c.ok ? '<span class="pill ok">Cocok</span>' : '<span class="pill warn">Selisih ' + rp(c.diff) + '</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (rab.checks.some(function (c) { return !c.ok; }) ? '<p class="small ink2" style="margin-top:6px">Selisih berarti subtotal di sheet tidak menjumlah semua baris item (cek rumus SUM di sheet tsb.). Aplikasi memakai jumlah semua item.</p>' : '');
  }
  function importRab(file) {
    setImp('<div class="note">Membaca <b>' + esc(file.name) + '</b>…</div>');
    setTimeout(function () {
      file.arrayBuffer().then(function (buf) {
        var t0 = Date.now();
        var book = XLSX.read(buf, { type: 'array', bookSheets: true });
        var want = book.SheetNames.filter(function (n) { return RabParser.SHEETS_NEEDED.test(n.trim()); });
        // rumus dibaca (cellFormula default) untuk menautkan item Bill ke blok AHS
        var wb = XLSX.read(buf, { type: 'array', sheets: want, cellHTML: false, cellText: false, cellStyles: false });
        var rab = RabParser.parse(XLSX, wb);
        rab.file = file.name;
        if (!rab.items.length) throw new Error('Tidak ada item budget yang terbaca. Pastikan ini file RAB dengan sheet Bill/Persiapan.');
        var secs = ((Date.now() - t0) / 1000).toFixed(1);
        var done = function (rep) {
          render();
          if (rep.lost.length) alert('Perhatian: ' + rep.lost.length + ' item lama tidak ditemukan di RAB baru. Alokasi ke item tsb. ditandai "item lama hilang":\n- ' + rep.lost.slice(0, 15).join('\n- '));
        };
        if (!Sync.enabled()) { setImp(''); done(S.replaceRab(rab)); toast('RAB diimpor: ' + rab.items.length + ' item (' + secs + ' dtk)'); return; }
        if (!Sync.isAdmin()) throw new Error('Hanya kode Admin yang bisa menerbitkan RAB ke server.');
        if (!confirm('Terbitkan RAB "' + file.name + '" (' + rab.items.length + ' item) ke server? Semua pengguna akan memakai RAB ini.')) { setImp(''); return; }
        setImp('<div class="note">Menyiapkan… memuat data terbaru dari server</div>');
        return publishRab(rab).then(done);
      }).catch(function (err) { setImp('<div class="note crit">Gagal: ' + esc(err.message) + '</div>'); });
    }, 30);
  }
  /* Terbitkan RAB ke server: muat data terbaru → petakan ulang id item → kirim RAB (+ data bila berubah). */
  function publishRab(rab) {
    return Sync.load().then(function (fresh) {
      if (!fresh) throw new Error('Tidak bisa memuat data server (offline?). Coba lagi.');
      var snap = function () { return JSON.stringify(S.data.tx.map(function (t) { return t.alok; })) + JSON.stringify(S.data.pkgs.map(function (p) { return p.lines; })) + JSON.stringify(S.data.set.amprahRules || null) + JSON.stringify(S.data.amOvr) + JSON.stringify(S.data.set.poRules || null) + JSON.stringify(S.data.poOvr); };
      var before = snap();
      var rep = S.replaceRab(rab);
      var after = snap();
      setImp('<div class="note">Mengirim RAB ke Google Sheet… (' + rab.items.length + ' item, ' + (rab.ahs || []).length + ' AHS) — bisa 20–60 detik</div>');
      var payload = { rab: rab };
      if (before !== after) { payload.data = { tx: S.data.tx, pkgs: S.data.pkgs, set: S.data.set, amOvr: S.data.amOvr, poOvr: S.data.poOvr }; payload.baseDataVer = Sync.vers.dataVer; }
      return Sync.api('publishRab', payload).then(function (r) {
        Sync.vers.rabVer = r.rabVer; Sync.vers.dataVer = r.dataVer; Sync.saveState(); Sync.lastSync = new Date();
        setImp('<div class="note ok">RAB terbit: ' + r.written.items + ' item, ' + r.written.ahs + ' baris AHS, ' + r.written.harsat + ' harga dasar' + (payload.data ? ' · alokasi transaksi dipetakan ulang (' + rep.remapped + ')' : '') + '.</div>');
        toast('RAB diterbitkan ke server');
        return rep;
      }, function (e) {
        // gagal: kembalikan ke kondisi server
        Sync.load(true);
        throw e;
      });
    });
  }
  function serverCard() {
    if (!Sync.enabled()) {
      return '<div class="card" style="margin-bottom:12px"><div class="hd"><h2>Server Google Sheets</h2><span class="badge">Belum tersambung</span></div>' +
        '<p class="small ink2" style="margin-bottom:10px">Saat ini data hanya di browser ini. Sambungkan ke Web App Apps Script (lihat <b>backend/README.md</b>) agar RAB, transaksi, dan paket tersimpan di Google Sheet dan bisa dipakai bersama tim tanpa impor.</p>' +
        '<div class="form"><label class="wide">Alamat Web App (…/exec)<input type="text" id="svUrl" placeholder="https://script.google.com/macros/s/…/exec"></label>' +
        '<label>Kode akses<input type="text" id="svCode" autocomplete="off" placeholder="ADM-… / INP-… / LHT-…"></label>' +
        '<label style="justify-content:flex-end"><button class="btn pri" data-act="svConnect">Sambungkan</button></label></div><div id="svMsg" style="margin-top:8px"></div></div>';
    }
    var roleTxt = { admin: 'Admin (semua, termasuk terbitkan RAB)', input: 'Input (transaksi & paket)', view: 'Lihat saja' }[Sync.role] || '—';
    return '<div class="card" style="margin-bottom:12px"><div class="hd"><h2>Server Google Sheets</h2>' + $('#syncBadge').outerHTML.replace('id="syncBadge"', '') + '</div>' +
      '<div class="list-row"><span class="ink2">Alamat</span><span class="small" style="word-break:break-all;text-align:right">' + esc(Sync.cfg.url) + '</span></div>' +
      '<div class="list-row"><span class="ink2">Peran</span><b>' + roleTxt + '</b></div>' +
      '<div class="list-row"><span class="ink2">Sinkron terakhir</span><span>' + (Sync.lastSync ? Sync.lastSync.toLocaleString('id-ID') : '—') + (Sync.outbox.length ? ' · ' + Sync.outbox.length + ' perubahan menunggu' : '') + '</span></div>' +
      (Sync.statusMsg && Sync.status !== 'online' ? '<div class="note crit" style="margin-top:8px">' + esc(Sync.statusMsg) + '</div>' : '') +
      '<div class="bar" style="margin:10px 0 0"><button class="btn" data-act="svReload">Muat ulang dari server</button><button class="btn" data-act="svShare">Salin link untuk tim</button>' +
      '<button class="btn adm" data-act="svPushLocal">Kirim file backup .json ke server…</button><button class="btn danger" data-act="svDisconnect">Putuskan</button></div>' +
      '<p class="small muted" style="margin-top:8px">Data di browser ini hanya salinan (cache) agar cepat dibuka & tetap bisa dipakai saat offline; sumber utamanya Google Sheet.</p></div>';
  }
  /* Saat pertama tersambung: tawarkan kirim data lokal yang sudah ada. */
  function afterConnect(prevLocal) {
    var hasLocal = prevLocal && (prevLocal.data.tx.length || prevLocal.data.pkgs.length);
    return Sync.api('load', { rabVer: '' }).then(function (d) {
      if (Sync.role === 'admin' && prevLocal && prevLocal.rab && !d.rab &&
        confirm('Server belum punya RAB. Terbitkan RAB yang ada di browser ini (' + prevLocal.rab.items.length + ' item) ke server?')) {
        return Sync.api('publishRab', { rab: prevLocal.rab }).then(function () { return hasLocal; });
      }
      return hasLocal;
    }).then(function (offer) {
      if (offer && Sync.role === 'admin' && confirm('Browser ini punya ' + prevLocal.data.tx.length + ' transaksi dan ' + prevLocal.data.pkgs.length + ' paket lokal. Kirim (gabung) ke server?')) {
        return Sync.api('importData', { mode: 'merge', data: prevLocal.data }).then(function () { toast('Data lokal dikirim ke server'); });
      }
      if (offer && Sync.role !== 'admin') {
        try { localStorage.setItem('rabmon.v1.localBackup', JSON.stringify(prevLocal)); } catch (e) { /* abaikan */ }
        alert('Data lokal di browser ini (' + prevLocal.data.tx.length + ' transaksi) disimpan sebagai cadangan. Minta Admin mengirimnya ke server bila perlu (menu Data → Unduh .json lalu Kirim ke server).');
      }
    }).then(function () { return Sync.load(true); });
  }
  function svConnect(url, code) {
    var prevLocal = S.rab || S.data.tx.length ? { rab: S.rab, data: { tx: S.data.tx.slice(), pkgs: S.data.pkgs.slice(), set: Object.assign({}, S.data.set), amOvr: Object.assign({}, S.data.amOvr), poOvr: Object.assign({}, S.data.poOvr) } } : null;
    return Sync.connect(url, code).then(function () {
      Sync.start();
      return afterConnect(prevLocal);
    }).then(function () { render(); toast('Tersambung ke server sebagai ' + Sync.role); });
  }
  var installEvt = null;
  function isStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function doInstall() {
    if (!installEvt) { go('data'); return; }
    installEvt.prompt();
    installEvt.userChoice.then(function (c) { if (c && c.outcome === 'accepted') { installEvt = null; $('#btnInstall').hidden = true; } }, function () { /* abaikan */ });
  }
  /* ---------- Integrasi Amprah (kas kecil) ---------- */
  function amprahStats() {
    var tx = S.allTx().filter(function (t) { return t.src === 'amprah'; });
    var st = { n: tx.length, total: 0, notaKurang: 0, notaKurangN: 0, unalloc: 0, unallocN: 0, ovr: 0 };
    tx.forEach(function (t) {
      st.total += t.nilai;
      if (!t.notaOk) { st.notaKurang += t.nilai; st.notaKurangN++; }
      var a = t.alok.reduce(function (s, x) { return s + (+x.v || 0); }, 0);
      if (t.nilai - a >= 1) { st.unalloc += t.nilai - a; st.unallocN++; }
      if (t.ovr) st.ovr++;
    });
    return st;
  }
  function amprahDashNote() {
    if (!S.data.set.amprahSrc) return '';
    var st = amprahStats(); if (!st.n) return '';
    return '<div class="note' + (st.unallocN ? '' : ' ok') + '">Amprah (kas kecil): <b>' + st.n + '</b> transaksi · <b>' + rp(st.total) + '</b>' +
      (st.notaKurangN ? ' · nota belum lengkap <b>' + rp(st.notaKurang) + '</b> (' + st.notaKurangN + ')' : '') +
      (st.unallocN ? ' · <b>' + st.unallocN + '</b> perlu dipilih item budget-nya' : '') +
      ' · <button class="lnk" data-act="amTx">Lihat</button>' + (Amprah.error ? ' · <span class="pill warn">' + esc(Amprah.error) + '</span>' : '') + '</div>';
  }
  function amprahCard() {
    var src = S.data.set.amprahSrc, canEdit = !Sync.enabled() || Sync.isAdmin();
    var h = '<div class="card" style="margin-top:12px"><div class="hd"><h2>Integrasi Amprah (kas kecil)</h2>' + (src ? (Amprah.loading ? '<span class="badge busy">Memuat…</span>' : Amprah.error ? '<span class="badge snap">Data terakhir</span>' : '<span class="badge live">Tersambung</span>') : '<span class="badge">Belum diatur</span>') + '</div>';
    h += '<p class="small ink2" style="margin-bottom:8px">Pengeluaran dari Google Sheet "Tracking Pengeluaran Amprah" dibaca langsung (hanya dibaca, tidak pernah diubah) dan otomatis dialokasikan ke item budget prelim (Persiapan, Penunjang, Umum, …) memakai aturan jenis amprah + kata kunci. ' +
      'Kolom nomor rekening, nama pemilik rekening, bank, dan bukti transfer <b>tidak dibaca</b>.</p>';
    if (!src) {
      h += canEdit ? '<div class="form"><label class="wide">Link Google Sheet Amprah<input type="text" id="amLink" placeholder="https://docs.google.com/spreadsheets/d/…/edit"></label>' +
        '<label style="justify-content:flex-end"><button class="btn pri" data-act="amSave">Sambungkan</button></label></div>' +
        '<p class="small muted" style="margin-top:6px">Sheet harus dibagikan "Siapa saja yang memiliki link: Pelihat".</p>'
        : '<p class="small muted">Belum diatur oleh Admin.</p>';
      return h + '</div>';
    }
    var st = amprahStats(), c = Amprah.cache && Amprah.cache.id === src.id ? Amprah.cache : null;
    h += '<div class="list-row"><span class="ink2">Sheet</span><span class="small" style="text-align:right;word-break:break-all">…' + esc(src.id.slice(-10)) + (c ? ' · tab "' + esc(c.sheet) + '"' : '') + '</span></div>' +
      '<div class="list-row"><span class="ink2">Transaksi</span><span><b>' + st.n + '</b> · ' + rp(st.total) + (c ? ' · dibaca ' + new Date(c.fetchedAt).toLocaleString('id-ID') : '') + '</span></div>' +
      '<div class="list-row"><span class="ink2">Nota belum lengkap</span><span>' + (st.notaKurangN ? rp(st.notaKurang) + ' (' + st.notaKurangN + ' transaksi)' : '—') + '</span></div>' +
      '<div class="list-row"><span class="ink2">Perlu pilih item budget</span><span>' + (st.unallocN ? '<span class="pill warn">' + st.unallocN + ' transaksi · ' + rp(st.unalloc) + '</span>' : '<span class="pill ok">Semua teralokasi</span>') + '</span></div>' +
      '<div class="list-row"><span class="ink2">Koreksi manual</span><span>' + st.ovr + ' baris</span></div>' +
      (Amprah.error ? '<div class="note crit" style="margin-top:8px">' + esc(Amprah.error) + '</div>' : '') +
      '<div class="bar" style="margin:10px 0 0"><button class="btn" data-act="amRefresh">Muat ulang dari sheet</button><button class="btn" data-act="amRules">Aturan pemetaan…</button>' +
      '<button class="btn" data-act="amTx">Lihat transaksi Amprah</button>' + (canEdit ? '<button class="btn danger" data-act="amUnlink">Lepas</button>' : '') + '</div>';
    return h + '</div>';
  }
  /* Editor aturan pemetaan (dipakai Amprah & PO). cfg: {title, key, f, fLabel, list, rows, val, match, defaults, unit, hint} */
  function rulesForm(cfg) {
    var canEdit = !Sync.enabled() || Sync.isAdmin();
    var rules = JSON.parse(JSON.stringify(cfg.rules));
    var isDefault = !Array.isArray(S.data.set[cfg.key]);
    var m = openModal('<header><h2>' + esc(cfg.title) + '</h2><button class="x" data-close aria-label="Tutup">×</button></header><div class="body">' +
      '<p class="small ink2" style="margin-bottom:8px">Aturan dicek dari atas; <b>aturan pertama yang cocok</b> dipakai. ' + esc(cfg.fLabel) + ' kosong = semua. ' + cfg.hint +
      ' Kata kunci dicocokkan di awal kata: <code>a|b</code> = salah satu, <code>a&amp;b</code> = keduanya. Target kosong = harus dipilih manual. Target bisa item, <b>§ seksi</b> (dibagi sebanding budget), atau ▣ paket. ' +
      (isDefault ? 'Saat ini memakai <b>aturan bawaan</b> (otomatis menyesuaikan RAB).' : 'Aturan sudah disesuaikan.') + ' Koreksi manual selalu mengalahkan aturan.</p>' +
      '<datalist id="dlRuleF">' + cfg.list.map(function (j) { return '<option value="' + esc(j) + '">'; }).join('') + '</datalist>' +
      '<div class="tblwrap" style="max-height:52vh"><table><thead><tr><th>#</th><th>' + esc(cfg.fLabel) + '</th><th>Kata kunci</th><th>Target budget</th><th class="num">Cocok</th><th></th></tr></thead><tbody id="rulesBody"></tbody></table></div>' +
      '<div class="sumline" id="rulesSum" style="justify-content:space-between"></div></div>' +
      '<footer><div class="bar" style="margin:0">' + (canEdit ? '<button class="btn" id="ruleAdd">+ Aturan</button><button class="btn" id="ruleReset">Kembalikan bawaan</button>' : '') + '</div>' +
      '<div class="bar" style="margin:0"><button class="btn" data-close>Tutup</button>' + (canEdit ? '<button class="btn pri" id="ruleSave">Simpan aturan</button>' : '') + '</div></footer>');
    var body = $('#rulesBody', m);
    function counts() {
      var c = rules.map(function () { return { n: 0, v: 0 }; }), none = { n: 0, v: 0 };
      cfg.rows.forEach(function (r) {
        for (var i = 0; i < rules.length; i++) if (cfg.match(rules[i], r)) { c[i].n++; c[i].v += cfg.val(r); return; }
        none.n++; none.v += cfg.val(r);
      });
      return { c: c, none: none };
    }
    function draw() {
      var cc = counts();
      body.innerHTML = rules.map(function (r, i) {
        var ti = r.t ? targetInfo(r.t) : null;
        return '<tr><td class="muted">' + (i + 1) + '</td>' +
          '<td><input type="text" list="dlRuleF" data-f="' + cfg.f + '" data-i="' + i + '" value="' + esc(r[cfg.f] || '') + '" style="width:150px"' + (canEdit ? '' : ' disabled') + '></td>' +
          '<td><input type="text" data-f="kata" data-i="' + i + '" value="' + esc(r.kata || '') + '" style="width:190px"' + (canEdit ? '' : ' disabled') + '></td>' +
          '<td style="min-width:240px"><div class="picker">' + (ti ? '<b>' + esc(ti.nama) + '</b><div class="subtxt">' + esc(ti.sub) + '</div>' : '<span class="pill warn">pilih manual</span>' + (r.note ? '<div class="subtxt">' + esc(r.note) + '</div>' : '')) +
          (canEdit ? '<div style="margin-top:4px"><input type="search" class="rpick" data-i="' + i + '" placeholder="Ganti target… (ketik item / seksi / paket)" style="width:100%"></div>' + (r.t ? '<button class="lnk small" data-clr="' + i + '">kosongkan</button>' : '') : '') + '</div></td>' +
          '<td class="num">' + cc.c[i].n + '<div class="subtxt">' + rpS(cc.c[i].v) + '</div></td>' +
          '<td style="white-space:nowrap">' + (canEdit ? '<button class="btn sm" data-up="' + i + '" title="Naik">↑</button> <button class="btn sm" data-dn="' + i + '" title="Turun">↓</button> <button class="x" data-del="' + i + '" aria-label="Hapus aturan">×</button>' : '') + '</td></tr>';
      }).join('');
      $('#rulesSum', m).innerHTML = '<span>' + cfg.rows.length + ' ' + esc(cfg.unit) + '</span><span>' + (cc.none.n ? '<span class="pill warn">' + cc.none.n + ' ' + esc(cfg.unit) + ' tidak cocok aturan mana pun · ' + rp(cc.none.v) + '</span>' : '<span class="pill ok">Semua cocok dengan aturan</span>') + '</span>';
      $$('input[data-f]', body).forEach(function (inp) { inp.addEventListener('change', function () { rules[+inp.dataset.i][inp.dataset.f] = inp.value.trim(); draw(); }); });
      $$('.rpick', body).forEach(function (inp) { attachPicker(inp, { pkgs: true }, function (r) { rules[+inp.dataset.i].t = r.key; draw(); return false; }); });
      $$('[data-clr]', body).forEach(function (b) { b.addEventListener('click', function () { rules[+b.dataset.clr].t = ''; draw(); }); });
      $$('[data-up]', body).forEach(function (b) { b.addEventListener('click', function () { var i = +b.dataset.up; if (i > 0) { var x = rules.splice(i, 1)[0]; rules.splice(i - 1, 0, x); draw(); } }); });
      $$('[data-dn]', body).forEach(function (b) { b.addEventListener('click', function () { var i = +b.dataset.dn; if (i < rules.length - 1) { var x = rules.splice(i, 1)[0]; rules.splice(i + 1, 0, x); draw(); } }); });
      $$('[data-del]', body).forEach(function (b) { b.addEventListener('click', function () { rules.splice(+b.dataset.del, 1); draw(); }); });
    }
    draw();
    if (!canEdit) return;
    $('#ruleAdd', m).addEventListener('click', function () { var r = { kata: '', t: '' }; r[cfg.f] = ''; rules.push(r); draw(); var ins = $$('input[data-f="' + cfg.f + '"]', body); ins[ins.length - 1].focus(); });
    $('#ruleReset', m).addEventListener('click', function () { if (confirm('Ganti semua aturan dengan aturan bawaan?')) { rules = cfg.defaults(); draw(); } });
    $('#ruleSave', m).addEventListener('click', function () {
      var clean = rules.map(function (r) { var o = { kata: (r.kata || '').toLowerCase(), t: r.t || '' }; o[cfg.f] = (r[cfg.f] || '').toUpperCase(); if (r.note) o.note = r.note; return o; });
      if (!S.saveSetting(cfg.key, clean)) return;
      closeModal(); render(); toast('Aturan pemetaan disimpan');
    });
  }
  function amprahRulesForm() {
    var rows = Amprah.rows(S.data.set.amprahSrc);
    rulesForm({ title: 'Aturan pemetaan Amprah → budget', key: 'amprahRules', f: 'jenis', fLabel: 'Jenis amprah', unit: 'baris Amprah',
      hint: 'Kata kunci dicari di kolom Item & Remarks.', rules: Amprah.rulesOf(S.data.set, S.rab),
      list: Array.from(new Set(rows.map(function (r) { return r.jenis; }).filter(Boolean))).sort(),
      rows: rows, val: function (r) { return r.nilai; }, match: function (rule, r) { return Amprah.ruleMatch(rule, r); },
      defaults: function () { return Amprah.defaultRules(S.rab); } });
  }
  function poRulesForm() {
    var pp = Po.parsed(S.poSrc()), rows = [];
    if (pp) pp.pos.forEach(function (po) { po.lines.forEach(function (l) { rows.push({ l: l, po: po }); }); });
    rulesForm({ title: 'Aturan pemetaan baris PO → budget', key: 'poRules', f: 'cat', fLabel: 'Kategori PO', unit: 'baris PO',
      hint: 'Kategori = kolom T di sheet PO; kata kunci dicari di deskripsi baris & nama vendor.', rules: Po.rulesOf(S.data.set, S.rab),
      list: Array.from(new Set(rows.map(function (r) { return r.l.cat || r.po.cat; }).filter(Boolean))).sort(),
      rows: rows, val: function (r) { return r.l.nilai; }, match: function (rule, r) { return Po.ruleMatch(rule, r.l, r.po); },
      defaults: function () { return Po.defaultRules(S.rab); } });
  }

  /* ---------- Integrasi PO (SUMMARY COST) ---------- */
  function poStats() {
    var tx = S.allTx().filter(function (t) { return t.src === 'po'; });
    var st = { n: 0, dpp: 0, paid: 0, paidGross: 0, hut: 0, hutN: 0, unalloc: 0, unallocN: 0, ovr: 0, lunas: 0, payOnly: 0 };
    tx.forEach(function (t) {
      if (t.payOnly) { st.payOnly += t.nilai; } else { st.n++; st.dpp += t.nilai; st.paid += t.bayar; st.paidGross += t.paidGross; if (t.hutNet > 0) { st.hut += t.hutNet; st.hutN++; } if (t.status === 'Lunas') st.lunas++; }
      var a = t.alok.reduce(function (acc, x) { return acc + (+x.v || 0); }, 0);
      if (t.nilai - a >= 1) { st.unalloc += t.nilai - a; st.unallocN++; }
      if (t.ovr || t.ovrTax) st.ovr++;
    });
    return st;
  }
  function poDupes() {
    // transaksi PO manual yang nomornya sama dengan PO di sheet → kemungkinan terhitung dua kali
    var keys = {};
    S.allTx().forEach(function (t) { if (t.src === 'po' && !t.payOnly) keys[Po.poKey(t.poCode)] = t.poCode; });
    return S.data.tx.filter(function (t) { return !t.batal && t.jenis === 'PO' && keys[Po.poKey(t.no)]; });
  }
  function poDashNote() {
    if (!S.poSrc()) return '';
    var st = poStats(); if (!st.n) return Po.error ? '<div class="note crit">PO: ' + esc(Po.error) + '</div>' : '';
    var d = poDupes();
    return '<div class="note' + (st.unallocN ? '' : ' ok') + '">PO (SUMMARY COST, tanpa pajak): <b>' + st.n + '</b> PO · komitmen <b>' + rp(st.dpp) + '</b> · terbayar <b>' + rp(st.paid) + '</b>' +
      (st.hut ? ' · tagihan belum dibayar <b>' + rp(st.hut) + '</b>' : '') +
      (st.unallocN ? ' · <b>' + rp(st.unalloc) + '</b> belum dialokasikan (' + st.unallocN + ' PO)' : '') +
      ' · <button class="lnk" data-act="poTx">Lihat</button>' +
      (d.length ? '<br><span class="pill crit">' + d.length + ' transaksi PO manual punya nomor yang sama dengan PO di sheet — kemungkinan terhitung dua kali</span>' : '') +
      (Po.error ? ' · <span class="pill warn">' + esc(Po.error) + '</span>' : '') + '</div>';
  }
  function poCard() {
    var srv = Sync.enabled(), src = S.poSrc(), canEdit = !srv || Sync.isAdmin();
    var badge = src ? (Po.loading ? '<span class="badge busy">Memuat…</span>' : Po.error ? '<span class="badge snap">Data terakhir</span>' : '<span class="badge live">Tersambung</span>') : '<span class="badge">Belum diatur</span>';
    var h = '<div class="card" style="margin-top:12px"><div class="hd"><h2>Integrasi PO (SUMMARY COST)</h2>' + badge + '</div>' +
      '<p class="small ink2" style="margin-bottom:8px">Tab <b>PO</b> = komitmen biaya, <b>PO TERBAYAR</b> = actual, <b>HUTANG</b> = tagihan belum dibayar. Semua dihitung <b>tanpa pajak</b> (DPP): pembayaran yang termasuk PPN / dipotong PPh dikonversi per PO. ' +
      'Setiap baris PO dialokasikan ke item / seksi / paket budget lewat aturan kategori + kata kunci.</p>';
    if (!src) {
      if (srv) h += canEdit ? '<div class="form"><label class="wide">Link Google Sheet SUMMARY COST<input type="text" id="poLink" placeholder="https://docs.google.com/spreadsheets/d/…/edit"></label>' +
        '<label style="justify-content:flex-end"><button class="btn pri" data-act="poSave">Sambungkan</button></label></div>' +
        '<p class="small muted" style="margin-top:6px">Sheet <b>tidak perlu dibagikan</b>: dibaca oleh server Apps Script atas nama akun Anda (pemilik sheet), lalu hanya diberikan ke pengguna yang punya kode akses.</p>'
        : '<p class="small muted">Belum diatur oleh Admin.</p>';
      else h += '<label class="drop" id="poDrop"><input type="file" id="fPo" accept=".xlsx,.xlsm" class="hide"><b>Upload file SUMMARY COST (.xlsx)</b><br><span class="small">mode lokal · untuk membaca otomatis dari Google Sheet privat, sambungkan ke server terlebih dulu</span></label>';
      return h + '</div>';
    }
    var st = poStats(), c = Po.cache, d = poDupes();
    h += '<div class="list-row"><span class="ink2">Sumber</span><span class="small" style="text-align:right;word-break:break-all">' + esc(c && c.title || '') + (srv && src.id ? ' · …' + esc(src.id.slice(-10)) : '') + (c ? ' · dibaca ' + new Date(c.fetchedAt).toLocaleString('id-ID') + (c.cached ? ' (cache server)' : '') : '') + '</span></div>' +
      '<div class="list-row"><span class="ink2">Komitmen (DPP)</span><span><b>' + rp(st.dpp) + '</b> · ' + st.n + ' PO · ' + st.lunas + ' lunas</span></div>' +
      '<div class="list-row"><span class="ink2">Terbayar tanpa pajak</span><span><b>' + rp(st.paid) + '</b> <span class="muted small">(bruto ' + rp(st.paidGross) + ')</span></span></div>' +
      '<div class="list-row"><span class="ink2">Tagihan belum dibayar</span><span>' + (st.hutN ? rp(st.hut) + ' · ' + st.hutN + ' PO' : '—') + '</span></div>' +
      (st.payOnly ? '<div class="list-row"><span class="ink2">Pembayaran tanpa PO</span><span>' + rp(st.payOnly) + '</span></div>' : '') +
      '<div class="list-row"><span class="ink2">Belum dialokasikan</span><span>' + (st.unallocN ? '<span class="pill warn">' + rp(st.unalloc) + ' · ' + st.unallocN + ' PO</span>' : '<span class="pill ok">Semua teralokasi</span>') + '</span></div>' +
      '<div class="list-row"><span class="ink2">Koreksi manual</span><span>' + st.ovr + ' PO</span></div>' +
      (d.length ? '<div class="note crit" style="margin-top:8px">' + d.length + ' transaksi PO yang dicatat manual punya nomor yang sama dengan PO di sheet (' + d.slice(0, 5).map(function (t) { return esc(t.no); }).join(', ') + '). Batalkan/hapus yang manual agar tidak terhitung dua kali.</div>' : '') +
      (Po.error ? '<div class="note crit" style="margin-top:8px">' + esc(Po.error) + '</div>' : '') +
      '<div class="bar" style="margin:10px 0 0">' + (srv ? '<button class="btn" data-act="poRefresh">Muat ulang dari sheet</button>' : '<label class="btn">Upload ulang .xlsx<input type="file" id="fPo" accept=".xlsx,.xlsm" class="hide"></label>') +
      '<button class="btn" data-act="poRules">Aturan pemetaan…</button><button class="btn" data-act="poTx">Lihat transaksi PO</button>' + (canEdit ? '<button class="btn danger" data-act="poUnlink">Lepas</button>' : '') + '</div>';
    return h + '</div>';
  }
  function poNote(t) {
    var taxSel = '<select id="ftax"' + (Sync.canWrite() ? '' : ' disabled') + '>' + [['auto', 'Otomatis: ' + (Po.TAX_LABEL[t.taxAuto] || t.taxAuto)], ['none', Po.TAX_LABEL.none], ['ppn', Po.TAX_LABEL.ppn], ['ppn-pph2', Po.TAX_LABEL['ppn-pph2']], ['pph2', Po.TAX_LABEL.pph2]]
      .map(function (o) { return '<option value="' + o[0] + '"' + ((t.ovrTax ? t.taxMode : 'auto') === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    if (t.payOnly) return '<div class="note">Dari tab <b>PO TERBAYAR</b>: pembayaran yang tidak menunjuk PO mana pun. Pilih item budget-nya di bawah.</div>';
    var lines = t.poLines.map(function (l) { var ti = l.t ? targetInfo(l.t) : null; return '<tr><td>' + esc(l.desc) + '</td><td class="num">' + (l.qty ? nf2.format(l.qty) + ' ' + esc(l.sat) : '') + '</td><td class="num">' + (l.harga ? rp(l.harga) : '') + '</td><td class="num">' + rp(l.nilai) + '</td><td class="small">' + (ti ? esc(ti.nama) : '<span class="pill warn">—</span>') + '</td></tr>'; }).join('');
    var pays = t.pays.map(function (x) { return '<tr><td>' + dateLbl(x.tgl) + '</td><td>' + esc(x.bkk) + '</td><td>' + esc(x.ref) + '</td><td class="num">' + rp(x.nilai) + '</td><td class="num">' + rp(x.nilai / t.taxF) + '</td></tr>'; }).join('');
    var huts = t.huts.map(function (x) { return '<tr><td>' + dateLbl(x.tgl) + '</td><td>' + esc(x.due) + '</td><td>' + esc(x.kw || x.ref) + '</td><td class="num">' + rp(x.sisa) + '</td><td class="num">' + rp(x.sisa / t.taxF) + '</td></tr>'; }).join('');
    return '<div class="note' + (t.alok.length ? ' ok' : '') + '">Dari sheet <b>SUMMARY COST</b> · PO <b>' + esc(t.poCode) + '</b>' + (t.poPr ? ' · ' + esc(t.poPr) : '') + ' · kategori <b>' + esc(t.poCat || '—') + '</b> · <span class="pill ' + (t.status === 'Lunas' ? 'ok' : t.status === 'Terbit' ? '' : 'warn') + '">' + esc(t.status) + '</span>' +
      '<br><span class="small">Data PO diubah di sheet. Di sini Anda hanya mengoreksi <b>alokasi ke budget</b> dan <b>mode pajak</b>. Alokasi: ' + (t.ovr ? 'koreksi manual' + (t.ovrBy ? ' (oleh ' + esc(t.ovrBy) + ')' : '') : 'otomatis per baris dari aturan') + '.</span>' +
      '<div class="bar" style="margin:8px 0 0"><span class="small">Pajak dalam pembayaran/tagihan:</span> ' + taxSel + ' <span class="small ink2" id="ftaxInfo">Terbayar ' + rp(t.paidGross) + ' bruto → <b>' + rp(t.bayar) + '</b> tanpa pajak</span></div></div>' +
      '<details style="margin-bottom:10px"><summary class="small"><b>' + t.poLines.length + ' baris PO</b> · DPP ' + rp(t.nilai) + '</summary><div class="tblwrap" style="max-height:260px;margin-top:6px"><table><thead><tr><th>Deskripsi</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Nilai</th><th>Target (aturan)</th></tr></thead><tbody>' + lines + '</tbody></table></div></details>' +
      (pays ? '<details style="margin-bottom:10px"><summary class="small"><b>' + t.pays.length + ' pembayaran</b> · ' + rp(t.paidGross) + ' bruto</summary><div class="tblwrap" style="max-height:200px;margin-top:6px"><table><thead><tr><th>Tanggal</th><th>BKK</th><th>Ref</th><th class="num">Bruto</th><th class="num">Tanpa pajak</th></tr></thead><tbody>' + pays + '</tbody></table></div></details>' : '') +
      (huts ? '<details style="margin-bottom:10px"><summary class="small"><b>Tagihan belum dibayar</b> · ' + rp(t.hutGross) + ' bruto</summary><div class="tblwrap" style="max-height:200px;margin-top:6px"><table><thead><tr><th>Diterima</th><th>Jatuh tempo</th><th>Kwitansi</th><th class="num">Bruto</th><th class="num">Tanpa pajak</th></tr></thead><tbody>' + huts + '</tbody></table></div></details>' : '');
  }

  function installCard() {
    var st;
    if (isStandalone()) st = '<span class="pill ok">Sedang berjalan sebagai aplikasi</span>';
    else if (installEvt) st = '<button class="btn pri" data-act="install">⤓ Pasang aplikasi</button>';
    else st = '<span class="pill">Pasang lewat menu browser</span>';
    return '<div class="card" style="margin-top:12px"><div class="hd"><h2>Pasang di laptop sebagai aplikasi</h2>' + st + '</div>' +
      '<p class="small ink2" style="margin-bottom:8px">Aplikasi bisa dipasang seperti program biasa: punya ikon di Start Menu / desktop / taskbar, terbuka di jendela sendiri, ' +
      'dan tetap bisa dibuka saat offline (transaksi masuk antrean dan terkirim saat online). Pembaruan terpasang otomatis setiap dibuka saat online.</p>' +
      '<div class="list-row"><span><b>Chrome / Edge</b> (Windows, Mac, Linux)</span><span class="small ink2" style="text-align:right">tombol <b>⤓ Pasang aplikasi</b> di atas, atau ikon ⊕ di ujung kanan kolom alamat, atau menu ⋮ → <i>Cast, save &amp; share</i> → <i>Install page as app</i> (Edge: ⋯ → <i>Apps</i> → <i>Install this site as an app</i>)</span></div>' +
      '<div class="list-row"><span><b>Safari</b> (Mac)</span><span class="small ink2" style="text-align:right">menu <i>File</i> → <i>Add to Dock</i></span></div>' +
      '<div class="list-row"><span><b>HP Android / iPhone</b></span><span class="small ink2" style="text-align:right">Chrome: ⋮ → <i>Add to Home screen</i> · Safari: Bagikan → <i>Add to Home Screen</i></span></div>' +
      '<p class="small muted" style="margin-top:8px">Klik kanan ikon aplikasi di taskbar untuk pintasan: <b>+ Transaksi</b>, Dashboard, Analisa Harga. Menghapus: buka aplikasi → menu ⋯ → <i>Uninstall</i>. Data di Google Sheet tidak ikut terhapus.</p></div>';
  }
  function setImp(html) { ui.impMsg = html; var el = $('#impMsg'); if (el) el.innerHTML = html; }
  function download(name, blob) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function exportXls() {
    var wb = XLSX.utils.book_new();
    var sum = [['Kelompok', 'Budget', 'Budget Material', 'Budget Upah', 'Budget Lain', 'Realisasi', 'Dibayar', 'Sisa', '% Realisasi']];
    C.groups.forEach(function (g) { sum.push([grpLabel(g.g.id), g.budget, g.b.mat, g.b.upah, g.b.lain, Math.round(g.real), Math.round(g.paid), Math.round(g.budget - g.real), g.budget ? g.real / g.budget : null]); });
    sum.push(['Belum dialokasikan', null, null, null, null, Math.round(C.tot.unalloc)]);
    sum.push(['TOTAL', C.budget, C.bK.mat, C.bK.upah, C.bK.lain, Math.round(C.tot.real), Math.round(C.tot.paid), Math.round(C.budget - C.tot.real), C.budget ? C.tot.real / C.budget : null]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), 'Ringkasan');
    var it = [['Kelompok', 'Seksi', 'Sub', 'Uraian', 'Volume', 'Satuan', 'Budget', 'Budget Material', 'Budget Upah', 'Budget Lain', 'Real Material', 'Real Upah', 'Real Lain', 'Realisasi', 'Dibayar', 'Sisa', '% Realisasi', 'Status', 'Baris sheet']];
    S.rab.items.forEach(function (x) {
      var l = C.L[x.id];
      it.push([grpLabel(x.g), x.sec, x.sub, x.desc, x.qty, x.unit, x.total, x.mat, x.upah, x.lain, Math.round(l.r.mat), Math.round(l.r.upah), Math.round(l.r.lain), Math.round(l.real), Math.round(l.paid), Math.round(x.total - l.real), x.total ? l.real / x.total : null, K.status(x.total, l.real).t, x.row]);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(it), 'Budget vs Realisasi');
    var pk = [['Paket', 'Keterangan', 'Jumlah item', 'Budget', 'Realisasi', 'Dibayar', 'Sisa', '%']];
    S.data.pkgs.forEach(function (p) { var P = C.pkgs[p.id]; pk.push([p.nama, p.ket || '', P.lines.length, P.budget, Math.round(P.real), Math.round(P.paid), Math.round(P.budget - P.real), P.budget ? P.real / P.budget : null]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pk), 'Paket');
    var tx = [['Tanggal', 'Jenis', 'Kategori', 'No. dokumen', 'Pihak', 'Uraian', 'Nilai', 'Dibayar', 'Batal', 'Catatan', 'Sumber', 'Nota']];
    var al = [['Tanggal', 'No. dokumen', 'Pihak', 'Target', 'Jenis target', 'Komponen', 'Nilai alokasi']];
    S.allTx().slice().sort(txSort).reverse().forEach(function (x) {
      tx.push([x.tgl, x.jenis === 'PO' ? 'PO' : 'Non-PO', (K.KAT_BY[x.kat] || {}).nama || x.kat, x.no, x.pihak, x.uraian, +x.nilai || 0, +x.bayar || 0, x.batal ? 'Ya' : '', x.ket || '', x.src === 'amprah' ? 'Sheet Amprah' : 'Manual', x.nota || '']);
      (x.alok || []).forEach(function (a) { var ti = targetInfo(a.t); al.push([x.tgl, x.no, x.pihak, ti.nama, ti.kind === 'pkg' ? 'Paket' : 'Item', K.KOMP[a.k] || a.k, +a.v || 0]); });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tx), 'Transaksi');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(al), 'Alokasi');
    if (HG.hasAhs) {
      var hs = [['Seksi', 'Material / upah / alat', 'Sat', 'Harga HARSAT', 'Harga di AHS', 'Kebutuhan (AHS × volume)', 'Nilai kebutuhan', 'Qty dibeli', 'Harga aktual rata2', 'Selisih %', 'Dampak proyeksi', 'Vendor RAB']];
      HG.rows.filter(function (r) { return r.need || r.act; }).forEach(function (r) {
        hs.push([r.h.sec, r.h.nama, r.h.sat, r.h.harga, Math.round(r.ref), r.need ? +r.need.qty.toFixed(3) : null, r.need ? Math.round(r.need.val) : null, r.act ? r.act.qty : null, r.avg != null ? Math.round(r.avg) : null, r.pct, r.act ? Math.round(r.imp) : null, r.h.vendor]);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hs), 'Harga Dasar vs Aktual');
      var ah = [['Sheet', 'Baris', 'Analisa pekerjaan', 'Komponen', 'Sat', 'Koefisien', 'Harga material', 'Harga upah', 'Jumlah', 'Harga satuan blok', 'Dipakai (item)', 'Budget terkait']];
      S.rab.ahs.forEach(function (b) {
        var u = HG.use[b.id];
        b.comps.forEach(function (c, i) { ah.push([b.src.trim(), b.r0, b.title, c.nama, c.sat, c.koef, c.hm, c.hu, Math.round(c.jm + c.ju), i === 0 ? Math.round(b.total) : null, i === 0 ? u.items.length : null, i === 0 ? Math.round(u.value) : null]); });
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ah), 'AHS');
      var rc = [['Tanggal', 'No. dokumen', 'Pihak', 'Material', 'Qty', 'Sat', 'Harga satuan', 'Harga RAB', 'Selisih %']];
      S.allTx().forEach(function (x) { if (x.batal) return; (x.rinc || []).forEach(function (r) { var h = r.h && HG.H[r.h]; var ref = h && HG.R[h.id] ? HG.R[h.id].ref : null; rc.push([x.tgl, x.no, x.pihak, r.nama, r.qty, r.sat, r.harga, ref, ref && r.harga ? r.harga / ref - 1 : null]); }); });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rc), 'Rincian Harga');
    }
    XLSX.writeFile(wb, 'Monitoring RAB ' + today() + '.xlsx');
  }

  /* ---------- MODAL ---------- */
  function openModal(html, cls) {
    var root = $('#modalRoot');
    root.innerHTML = '<div class="modal-bg"><div class="modal ' + (cls || '') + '" role="dialog" aria-modal="true">' + html + '</div></div>';
    var bg = root.firstChild;
    bg.addEventListener('mousedown', function (e) { if (e.target === bg) closeModal(); });
    return bg.firstChild;
  }
  function closeModal() { $('#modalRoot').innerHTML = ''; }
  document.addEventListener('keydown', function (e) {
    // Esc menutup modal, kecuali saat sedang mengetik di isian (agar form tidak hilang)
    if (e.key === 'Escape' && $('#modalRoot').innerHTML && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) closeModal();
  });

  /* Picker pencarian item / paket */
  function itemSearch(q, opts) {
    q = q.toLowerCase().trim();
    var out = [];
    if (opts.pkgs) S.data.pkgs.forEach(function (p) {
      if (!q || p.nama.toLowerCase().indexOf(q) >= 0) out.push({ key: 'P:' + p.id, label: '▣ ' + p.nama, sub: 'Paket · ' + C.pkgs[p.id].lines.length + ' item · budget ' + rpS(C.pkgs[p.id].budget) + ' · sisa ' + rpS(C.pkgs[p.id].budget - C.pkgs[p.id].real) });
    });
    if (!q) return out.slice(0, 30);
    if (opts.pkgs) {
      var seen = {}, nsec = 0;
      S.rab.items.forEach(function (it) {
        var k = K.secKey(it.g, it.sec);
        if (seen[k] || nsec >= 8) return; seen[k] = 1;
        if ((it.sec + ' ' + grpLabel(it.g)).toLowerCase().indexOf(q) < 0) return;
        var ti = targetInfo(k); nsec++;
        out.push({ key: k, label: ti.nama, sub: ti.sub + ' · budget ' + rpS(ti.budget) + ' · sisa ' + rpS(ti.budget - ti.real) });
      });
    }
    var words = q.split(/\s+/);
    for (var i = 0; i < S.rab.items.length && out.length < 60; i++) {
      var it = S.rab.items[i];
      var hay = (it.desc + ' ' + it.sec + ' ' + it.sub + ' ' + grpLabel(it.g)).toLowerCase();
      if (words.every(function (w) { return hay.indexOf(w) >= 0; })) {
        var x = C.L[it.id];
        out.push({ key: 'L:' + it.id, label: it.desc, sub: grpLabel(it.g) + ' › ' + it.sec + (it.sub ? ' › ' + it.sub : '') + ' · budget ' + rpS(it.total) + ' · sisa ' + rpS(it.total - x.real) });
      }
    }
    return out;
  }
  function harsatSearch(q) {
    q = q.toLowerCase().trim(); if (!q || !S.rab.harsat) return [];
    var words = q.split(/\s+/), out = [];
    for (var i = 0; i < S.rab.harsat.length && out.length < 40; i++) {
      var h = S.rab.harsat[i], hay = (h.nama + ' ' + h.sec + ' ' + h.brand).toLowerCase();
      if (words.every(function (w) { return hay.indexOf(w) >= 0; })) out.push({ key: h.id, label: h.nama, sub: h.sec + ' · RAB ' + rp(h.harga) + ' / ' + h.sat + (h.vendor ? ' · ' + h.vendor : '') });
    }
    out.push({ key: '', label: '+ Pakai teks "' + q + '" (tanpa harga RAB)', sub: 'Tidak dibandingkan dengan HARSAT', text: q });
    return out;
  }
  function attachPicker(input, opts, onPick) {
    var res = document.createElement('div'); res.className = 'picker-res hide'; input.parentNode.appendChild(res);
    var items = [], act = 0;
    function draw() {
      items = opts.search ? opts.search(input.value) : itemSearch(input.value, opts);
      if (!items.length) { res.innerHTML = input.value ? '<div class="muted">Tidak ada yang cocok</div>' : ''; res.classList.toggle('hide', !input.value); return; }
      act = 0;
      res.innerHTML = items.map(function (r, i) { return '<div data-i="' + i + '"' + (i === 0 ? ' class="act"' : '') + '><b>' + esc(r.label) + '</b><br><span class="small muted">' + esc(r.sub) + '</span></div>'; }).join('');
      res.classList.remove('hide');
    }
    function pick(i) {
      if (!items[i]) return;
      var keepFocus = onPick(items[i]) !== false; // onPick mengembalikan false bila memindahkan fokus sendiri
      if (!opts.keepOpen) { input.value = ''; res.classList.add('hide'); } else draw();
      if (keepFocus) input.focus();
    }
    input.addEventListener('input', draw);
    input.addEventListener('focus', draw);
    input.addEventListener('blur', function () { setTimeout(function () { res.classList.add('hide'); }, 180); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(0, Math.min(items.length - 1, act + (e.key === 'ArrowDown' ? 1 : -1))); $$('div', res).forEach(function (d, i) { d.classList.toggle('act', i === act); if (i === act) d.scrollIntoView({ block: 'nearest' }); }); }
      if (e.key === 'Enter') { e.preventDefault(); pick(act); }
      if (e.key === 'Escape') { res.classList.add('hide'); }
    });
    res.addEventListener('mousedown', function (e) { var d = e.target.closest('[data-i]'); if (d) { e.preventDefault(); pick(+d.dataset.i); } });
  }

  /* --- Form transaksi --- */
  function txForm(tx, preset) {
    if (!S.rab) { alert('Impor RAB dulu di menu Data & Backup.'); go('data'); return; }
    var isNew = !tx, isAm = !!(tx && tx.src === 'amprah'), isPo = !!(tx && tx.src === 'po'), isExt = isAm || isPo;
    tx = tx ? JSON.parse(JSON.stringify(tx)) : { id: S.nextId('t'), jenis: 'PO', kat: 'po-mat', no: '', tgl: today(), pihak: '', uraian: '', nilai: 0, bayar: 0, alok: [], created: Date.now() };
    if (preset) { if (preset.jenis) { tx.jenis = preset.jenis; tx.kat = K.KAT[preset.jenis][0].id; } (preset.targets || []).forEach(function (t) { tx.alok.push({ t: t, k: K.KAT_BY[tx.kat].k, v: 0 }); }); }
    var m = openModal('<header><h2>' + (isAm ? 'Transaksi Amprah (kas kecil)' : isPo ? (tx.payOnly ? 'Pembayaran tanpa PO' : 'PO ' + esc(tx.poCode) + ' — ' + esc(tx.pihak)) : isNew ? 'Transaksi baru' : 'Ubah transaksi') + '</h2><button class="x" data-close aria-label="Tutup">×</button></header>' +
      '<div class="body">' + (isAm ? amprahNote(tx) : isPo ? poNote(tx) : '') + '<div class="bar"><div class="seg" id="fj"><button data-v="PO">Belanja dengan PO</button><button data-v="NP">Non-PO (obname, material, bayar orang, lain-lain)</button></div></div>' +
      '<div class="form">' +
      '<label>Kategori<select id="fk"></select></label>' +
      '<label><span id="lblNo">No. PO</span><input type="text" id="fno"></label>' +
      '<label>Tanggal<input type="date" id="ftgl"></label>' +
      '<label><span id="lblPihak">Vendor / supplier</span><input type="text" id="fpihak" list="dlPihak"></label>' +
      '<label class="wide">Uraian<input type="text" id="furaian" placeholder="mis. Beton K-300 overlay gedung A & B"></label>' +
      '<label>Nilai (Rp)<input type="text" inputmode="numeric" id="fnilai" class="num"></label>' +
      '<label><span class="lblrow"><span>Sudah dibayar (Rp)</span><button type="button" class="lnk small" id="flunas">isi = lunas</button></span><input type="text" inputmode="numeric" id="fbayar" class="num"></label>' +
      '<label class="wide">Catatan<input type="text" id="fket"></label>' +
      (isNew ? '' : '<label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" id="fbatal"> Batal / dibatalkan</label>') +
      '</div>' +
      '<datalist id="dlPihak">' + Array.from(new Set(S.data.tx.map(function (x) { return x.pihak; }).filter(Boolean))).map(function (p) { return '<option value="' + esc(p) + '">'; }).join('') + '</datalist>' +
      '<div class="alloc"><h3>Alokasi ke budget</h3><p class="small ink2" style="margin-bottom:8px">Pilih satu atau beberapa item budget / paket yang dibiayai transaksi ini (pekerjaan gabungan boleh dipecah ke beberapa item).</p>' +
      '<div class="picker"><input type="search" id="fpick" placeholder="Ketik untuk mencari item budget atau paket… (mis. beton overlay)" style="width:100%"></div>' +
      '<div class="tblwrap" style="max-height:340px;margin-top:8px"><table><thead><tr><th>Item / paket budget</th><th>Komponen</th><th class="num">Sisa budget</th><th class="num">Nilai alokasi</th><th></th></tr></thead><tbody id="falok"></tbody></table></div>' +
      '<div class="bar" style="margin-top:8px;justify-content:space-between"><div class="bar" style="margin:0"><button class="btn sm" id="fdistB" type="button">Bagi sebanding budget</button><button class="btn sm" id="fdistE" type="button">Bagi rata</button><button class="btn sm" id="fdistR" type="button">Sisa ke baris terakhir</button></div>' +
      '<div class="sumline" id="fsum"></div></div></div>' +
      '<div class="alloc"><h3>Rincian harga satuan <span class="small muted" style="font-weight:400">(opsional — untuk analisa harga aktual vs RAB)</span></h3>' +
      '<div class="picker"><input type="search" id="frpick" placeholder="Cari material / upah / alat dari daftar harga RAB (HARSAT)… mis. semen, besi d13, pekerja" style="width:100%"></div>' +
      '<div class="tblwrap" style="max-height:300px;margin-top:8px"><table><thead><tr><th>Material / upah / alat</th><th class="num">Qty</th><th>Sat</th><th class="num">Harga satuan</th><th class="num">Harga RAB</th><th class="num">Selisih</th><th class="num">Jumlah</th><th></th></tr></thead><tbody id="frinc"></tbody></table></div>' +
      '<div class="bar" style="margin-top:8px;justify-content:space-between"><button class="btn sm" id="frset" type="button">Jadikan total rincian sebagai nilai transaksi</button><div class="sumline" id="frsum"></div></div></div>' +
      '</div>' +
      '<footer><div>' + (isExt ? (tx.ovr || tx.ovrTax ? '<button class="btn w" id="freset">Kembalikan ke aturan otomatis</button>' : '') : isNew ? '' : '<button class="btn danger w" id="fdel">Hapus transaksi</button>') + '</div><div class="bar" style="margin:0"><button class="btn" data-close>Batal</button><button class="btn pri w" id="fsave">Simpan</button></div></footer>');

    var fj = $('#fj', m), fk = $('#fk', m);
    function setJenis(j) {
      tx.jenis = j;
      $$('button', fj).forEach(function (b) { b.classList.toggle('on', b.dataset.v === j); });
      fk.innerHTML = K.KAT[j].filter(function (k) { return !k.auto || k.id === tx.kat; }).map(function (k) { return '<option value="' + k.id + '">' + esc(k.nama) + '</option>'; }).join('');
      if (!K.KAT[j].some(function (k) { return k.id === tx.kat; })) tx.kat = K.KAT[j][0].id;
      fk.value = tx.kat; labels();
    }
    function labels() {
      var po = tx.jenis === 'PO';
      $('#lblNo', m).textContent = po ? 'No. PO' : (tx.kat === 'np-obname' ? 'No. obname / SPK' : 'No. nota / bukti');
      $('#lblPihak', m).textContent = po ? 'Vendor / supplier' : (tx.kat === 'np-obname' ? 'Mandor' : tx.kat === 'np-orang' ? 'Penerima' : 'Toko / penerima');
    }
    $$('button', fj).forEach(function (b) { b.addEventListener('click', function () { var old = K.KAT_BY[tx.kat].k; setJenis(b.dataset.v); syncKomp(old); }); });
    fk.addEventListener('change', function () { var old = K.KAT_BY[tx.kat].k; tx.kat = fk.value; labels(); syncKomp(old); });
    function syncKomp(old) { var nk = K.KAT_BY[tx.kat].k; tx.alok.forEach(function (a) { if (a.k === old) a.k = nk; }); drawAlok(); }
    setJenis(tx.jenis);
    $('#fno', m).value = tx.no || ''; $('#ftgl', m).value = tx.tgl || ''; $('#fpihak', m).value = tx.pihak || ''; $('#furaian', m).value = tx.uraian || '';
    $('#fket', m).value = tx.ket || ''; if ($('#fbatal', m)) $('#fbatal', m).checked = !!tx.batal;
    var fn = $('#fnilai', m), fb = $('#fbayar', m);
    fn.value = tx.nilai ? num(tx.nilai) : ''; fb.value = tx.bayar ? num(tx.bayar) : '';
    var bayarTouched = !isNew;
    [fn, fb].forEach(function (inp) { inp.addEventListener('blur', function () { var v = parseMoney(inp.value); inp.value = v ? num(v) : ''; }); });
    fn.addEventListener('input', function () {
      tx.nilai = parseMoney(fn.value);
      if (!bayarTouched && tx.jenis === 'NP') fb.value = tx.nilai ? num(tx.nilai) : '';
      if (tx.alok.length === 1) { tx.alok[0].v = tx.nilai; drawAlok(); } else drawSum();
      if (rb) drawRsum();
    });
    fb.addEventListener('input', function () { bayarTouched = true; });
    $('#flunas', m).addEventListener('click', function () { fb.value = num(parseMoney(fn.value)); bayarTouched = true; });

    var tb = $('#falok', m);
    function drawAlok() {
      if (!tx.alok.length) { tb.innerHTML = '<tr><td colspan="5" class="muted small">Belum ada alokasi. Cari item/paket di atas.</td></tr>'; drawSum(); return; }
      tb.innerHTML = tx.alok.map(function (a, i) {
        var ti = targetInfo(a.t);
        var own = 0; if (!isNew) { var orig = S.allTx().find(function (x) { return x.id === tx.id; }); if (orig) (orig.alok || []).forEach(function (o) { if (o.t === a.t && !orig.batal) own += +o.v || 0; }); }
        var sisa = ti.budget - ti.real + own;
        return '<tr><td><b>' + esc(ti.nama) + '</b><div class="subtxt">' + esc(ti.sub) + '</div></td>' +
          '<td><select data-i="' + i + '" class="fkomp">' + Object.keys(K.KOMP).map(function (k) { return '<option value="' + k + '"' + (a.k === k ? ' selected' : '') + '>' + K.KOMP[k] + '</option>'; }).join('') + '</select></td>' +
          '<td class="num">' + rp(sisa) + '</td>' +
          '<td class="num"><input type="text" inputmode="numeric" class="money fv" data-i="' + i + '" value="' + (a.v ? num(a.v) : '') + '"></td>' +
          '<td><button class="x" data-del="' + i + '" title="Hapus alokasi" aria-label="Hapus alokasi">×</button></td></tr>';
      }).join('');
      $$('.fkomp', tb).forEach(function (s) { s.addEventListener('change', function () { tx.alok[+s.dataset.i].k = s.value; }); });
      $$('.fv', tb).forEach(function (inp) {
        inp.addEventListener('input', function () { tx.alok[+inp.dataset.i].v = parseMoney(inp.value); drawSum(); });
        inp.addEventListener('blur', function () { var v = parseMoney(inp.value); inp.value = v ? num(v) : ''; });
      });
      $$('[data-del]', tb).forEach(function (b) { b.addEventListener('click', function () { tx.alok.splice(+b.dataset.del, 1); drawAlok(); }); });
      drawSum();
    }
    function drawSum() {
      var n = parseMoney(fn.value), a = tx.alok.reduce(function (s, x) { return s + (+x.v || 0); }, 0);
      var d = n - a;
      $('#fsum', m).innerHTML = '<span>Nilai <b>' + rp(n) + '</b></span><span>Teralokasi <b>' + rp(a) + '</b></span><span>' + (!n && !a ? '' : Math.abs(d) < 1 ? '<span class="pill ok">Pas</span>' : d > 0 ? '<span class="pill warn">Belum dialokasi ' + rp(d) + '</span>' : '<span class="pill crit">Lebih ' + rp(-d) + '</span>') + '</span>';
    }
    function dist(mode) {
      var n = parseMoney(fn.value); if (!tx.alok.length || !n) return;
      if (mode === 'R') { var other = tx.alok.slice(0, -1).reduce(function (s, x) { return s + (+x.v || 0); }, 0); tx.alok[tx.alok.length - 1].v = Math.max(0, n - other); drawAlok(); return; }
      var w = tx.alok.map(function (a) { return mode === 'B' ? Math.max(0, targetInfo(a.t).budget) : 1; });
      var W = w.reduce(function (s, x) { return s + x; }, 0) || tx.alok.length;
      var acc = 0;
      tx.alok.forEach(function (a, i) { if (i === tx.alok.length - 1) a.v = n - acc; else { a.v = Math.round(n * (W ? (w[i] || 0) / W : 1 / tx.alok.length)); acc += a.v; } });
      drawAlok();
    }
    $('#fdistB', m).addEventListener('click', function () { dist('B'); });
    $('#fdistE', m).addEventListener('click', function () { dist('E'); });
    $('#fdistR', m).addEventListener('click', function () { dist('R'); });
    attachPicker($('#fpick', m), { pkgs: true }, function (r) {
      if (tx.alok.some(function (a) { return a.t === r.key; })) { toast('Sudah ada di alokasi'); return; }
      var n = parseMoney(fn.value), used = tx.alok.reduce(function (s, x) { return s + (+x.v || 0); }, 0);
      tx.alok.push({ t: r.key, k: K.KAT_BY[tx.kat].k, v: Math.max(0, n - used) });
      drawAlok();
    });
    drawAlok();

    /* rincian harga satuan */
    tx.rinc = tx.rinc || [];
    var rb = $('#frinc', m);
    function drawRinc() {
      if (!tx.rinc.length) { rb.innerHTML = '<tr><td colspan="8" class="muted small">Belum ada rincian. Contoh: Semen 50 kg — 200 zak × Rp 68.000.</td></tr>'; drawRsum(); return; }
      rb.innerHTML = tx.rinc.map(function (r, i) {
        var h = r.h && HG.H[r.h];
        return '<tr><td><b>' + esc(r.nama) + '</b>' + (h ? '<div class="subtxt">' + esc(h.sec) + '</div>' : '<div class="subtxt">tanpa pembanding RAB</div>') + '</td>' +
          '<td class="num"><input type="text" inputmode="decimal" class="money rq" data-i="' + i + '" style="width:90px" value="' + (r.qty ? qtyTxt(r.qty) : '') + '"></td>' +
          '<td><input type="text" class="rs" data-i="' + i + '" style="width:64px" value="' + esc(r.sat || '') + '"></td>' +
          '<td class="num"><input type="text" inputmode="numeric" class="money rh" data-i="' + i + '" style="width:120px" value="' + (r.harga ? num(r.harga) : '') + '"></td>' +
          '<td class="num">' + (h ? rp(refOf(h)) + '<div class="subtxt">/' + esc(h.sat) + '</div>' : '<span class="muted">—</span>') + '</td>' +
          '<td class="num rd" data-i="' + i + '">' + (h && r.harga ? pctSigned(r.harga / refOf(h) - 1) : '') + '</td>' +
          '<td class="num rj" data-i="' + i + '">' + rp((+r.qty || 0) * (+r.harga || 0)) + '</td>' +
          '<td><button class="x" data-rdel="' + i + '" aria-label="Hapus rincian">×</button></td></tr>';
      }).join('');
      $$('.rq', rb).forEach(function (inp) { inp.addEventListener('input', function () { tx.rinc[+inp.dataset.i].qty = parseQty(inp.value); upRow(+inp.dataset.i); }); });
      $$('.rh', rb).forEach(function (inp) {
        inp.addEventListener('input', function () { tx.rinc[+inp.dataset.i].harga = parseMoney(inp.value); upRow(+inp.dataset.i); });
        inp.addEventListener('blur', function () { var v = parseMoney(inp.value); inp.value = v ? num(v) : ''; });
      });
      $$('.rs', rb).forEach(function (inp) { inp.addEventListener('input', function () { tx.rinc[+inp.dataset.i].sat = inp.value; }); });
      $$('[data-rdel]', rb).forEach(function (b) { b.addEventListener('click', function () { tx.rinc.splice(+b.dataset.rdel, 1); drawRinc(); }); });
      drawRsum();
    }
    function upRow(i) {
      var r = tx.rinc[i], h = r.h && HG.H[r.h];
      $('.rj[data-i="' + i + '"]', rb).innerHTML = rp((+r.qty || 0) * (+r.harga || 0));
      $('.rd[data-i="' + i + '"]', rb).innerHTML = h && r.harga ? pctSigned(r.harga / refOf(h) - 1) : '';
      drawRsum();
    }
    function refOf(h) { var R = HG.R[h.id]; return R ? R.ref : h.harga; }
    function rincTotal() { return tx.rinc.reduce(function (s, r) { return s + (+r.qty || 0) * (+r.harga || 0); }, 0); }
    function drawRsum() {
      var t = rincTotal(), n = parseMoney(fn.value);
      $('#frsum', m).innerHTML = tx.rinc.length ? '<span>Total rincian <b>' + rp(t) + '</b></span>' + (n && Math.abs(n - t) >= 1 ? '<span class="muted">selisih vs nilai ' + rp(n - t) + ' (ongkir, PPN, dll.)</span>' : '') : '';
    }
    $('#frset', m).addEventListener('click', function () { var t = rincTotal(); if (!t) return; fn.value = num(t); fn.dispatchEvent(new Event('input')); });
    if (HG && HG.hasAhs) {
      attachPicker($('#frpick', m), { search: harsatSearch }, function (r) {
        var h = r.key && HG.H[r.key];
        tx.rinc.push(h ? { h: h.id, nama: h.nama, sat: h.sat, qty: 0, harga: 0 } : { h: '', nama: r.text, sat: '', qty: 0, harga: 0 });
        drawRinc();
        var q = $$('.rq', rb); if (q.length) q[q.length - 1].focus();
        return false;
      });
    } else $('#frpick', m).placeholder = 'Impor ulang RAB untuk memuat daftar harga dasar (HARSAT)';
    drawRinc();

    var alok0 = JSON.stringify(tx.alok);
    if (isPo) {
      $('#frpick', m).closest('.alloc').classList.add('hide'); // rincian harga diambil dari baris PO
      if ($('#ftax', m)) $('#ftax', m).addEventListener('change', function () {
        var mode = this.value === 'auto' ? tx.taxAuto : this.value, f = mode === 'sheet' ? tx.taxF : (Po.TAXF[mode] || 1);
        $('#ftaxInfo', m).innerHTML = 'Terbayar ' + rp(tx.paidGross) + ' bruto → <b>' + rp(tx.paidGross / f) + '</b> tanpa pajak';
      });
    }
    if (isExt) {
      // data berasal dari sheet: hanya alokasi (dan rincian harga / pajak) yang bisa dikoreksi di sini
      ['#fno', '#ftgl', '#fpihak', '#furaian', '#fnilai', '#fbayar', '#fket', '#fk'].forEach(function (q) { $(q, m).disabled = true; });
      $$('button', fj).forEach(function (b) { b.disabled = true; });
      ['#flunas', '#frset'].forEach(function (q) { $(q, m).classList.add('hide'); });
      if ($('#fbatal', m)) $('#fbatal', m).closest('label').classList.add('hide');
      $('#fsave', m).textContent = 'Simpan koreksi';
      if ($('#freset', m)) $('#freset', m).addEventListener('click', function () {
        if (!confirm('Hapus koreksi manual dan kembali ke alokasi otomatis dari aturan?')) return;
        if (!(isPo ? S.savePoOvr(tx.key, null) : S.saveAmprahOvr(tx.key, null))) return; closeModal(); render(); toast('Kembali ke aturan otomatis');
      });
    }
    $('#fsave', m).addEventListener('click', function () {
      tx.rinc = tx.rinc.filter(function (r) { return r.nama && (+r.qty || +r.harga); });
      if (isPo) {
        var pal = tx.alok.filter(function (a) { return +a.v; });
        var psa = pal.reduce(function (acc, x) { return acc + x.v; }, 0);
        if (psa - tx.nilai >= 1 && !confirm('Total alokasi (' + rp(psa) + ') melebihi nilai PO (' + rp(tx.nilai) + '). Tetap simpan?')) return;
        var tax = $('#ftax', m) ? $('#ftax', m).value : 'auto';
        var touched = tx.ovr || JSON.stringify(tx.alok) !== alok0;
        if (!touched && tax === 'auto') { if (tx.ovr || tx.ovrTax) S.savePoOvr(tx.key, null); closeModal(); render(); return; }
        if (!S.savePoOvr(tx.key, { alok: touched ? pal : null, tax: tax })) return;
        closeModal(); render(); toast('Koreksi PO disimpan');
        return;
      }
      if (isAm) {
        var al = tx.alok.filter(function (a) { return +a.v; });
        var sa = al.reduce(function (s, x) { return s + x.v; }, 0);
        if (sa - tx.nilai >= 1 && !confirm('Total alokasi (' + rp(sa) + ') melebihi nilai (' + rp(tx.nilai) + '). Tetap simpan?')) return;
        if (!S.saveAmprahOvr(tx.key, { alok: al, rinc: tx.rinc })) return;
        closeModal(); render(); toast('Koreksi alokasi Amprah disimpan');
        return;
      }
      tx.no = $('#fno', m).value.trim(); tx.tgl = $('#ftgl', m).value; tx.pihak = $('#fpihak', m).value.trim(); tx.uraian = $('#furaian', m).value.trim();
      tx.ket = $('#fket', m).value.trim(); tx.nilai = parseMoney(fn.value); tx.bayar = parseMoney(fb.value);
      if ($('#fbatal', m)) tx.batal = $('#fbatal', m).checked;
      tx.alok = tx.alok.filter(function (a) { return +a.v; });
      if (!tx.nilai) { alert('Isi nilai transaksi.'); fn.focus(); return; }
      if (!tx.tgl) { alert('Isi tanggal.'); return; }
      var a = tx.alok.reduce(function (s, x) { return s + x.v; }, 0);
      if (a - tx.nilai >= 1 && !confirm('Total alokasi (' + rp(a) + ') melebihi nilai transaksi (' + rp(tx.nilai) + '). Tetap simpan?')) return;
      if (tx.bayar > tx.nilai && !confirm('Nilai dibayar melebihi nilai transaksi. Tetap simpan?')) return;
      tx.updated = Date.now();
      if (!S.upsertTx(tx)) return; closeModal(); render(); toast('Transaksi disimpan');
    });
    if ($('#fdel', m)) $('#fdel', m).addEventListener('click', function () {
      if (!confirm('Hapus transaksi ' + (tx.no || '') + ' (' + rp(tx.nilai) + ')? Tidak bisa dibatalkan — centang "Batal" bila hanya ingin membatalkan.')) return;
      if (!S.deleteTx(tx.id)) return; closeModal(); render(); toast('Transaksi dihapus');
    });
    setTimeout(function () { (isExt ? $('#fpick', m) : isNew ? $('#fno', m) : $('#fnilai', m)).focus(); }, 30);
  }
  function amprahNote(t) {
    var rules = Amprah.rulesOf(S.data.set, S.rab), r = t.rule >= 0 ? rules[t.rule] : null;
    var how = t.ovr ? 'Koreksi manual' + (t.ovrBy ? ' (oleh ' + esc(t.ovrBy) + ')' : '')
      : r ? 'Aturan #' + (t.rule + 1) + ': ' + esc(r.jenis || 'semua jenis') + (r.kata ? ' + "' + esc(r.kata) + '"' : '') + (r.t ? '' : ' → <b>pilih item manual</b>')
        : '<b>Tidak ada aturan yang cocok</b>';
    return '<div class="note' + (t.alok.length ? ' ok' : '') + '">Dari sheet <b>Amprah</b>' + (t.no ? ' · ' + esc(t.no) : '') + ' · jenis <b>' + esc(t.jenisAmprah || '—') + '</b> · nota ' + notaPill(t) +
      '<br><span class="small">Tanggal, item, PIC, dan nilai diubah di sheet Amprah. Di sini Anda hanya mengoreksi <b>alokasi ke budget</b> dan rincian harga. Alokasi sekarang: ' + how + '.</span></div>';
  }
  function notaPill(t) { return t.notaOk ? '<span class="pill ok">' + esc(t.nota || 'OK') + '</span>' : '<span class="pill warn">' + esc(t.nota || 'belum ada') + '</span>'; }

  /* --- Form paket --- */
  function pkgForm(p, presetLines) {
    var isNew = !p;
    p = p ? JSON.parse(JSON.stringify(p)) : { id: S.nextId('p'), nama: '', ket: '', lines: [] };
    (presetLines || []).forEach(function (id) { if (p.lines.indexOf(id) < 0) p.lines.push(id); });
    var m = openModal('<header><h2>' + (isNew ? 'Paket pekerjaan baru' : 'Ubah paket') + '</h2><button class="x" data-close aria-label="Tutup">×</button></header><div class="body">' +
      '<div class="form"><label class="wide">Nama paket<input type="text" id="pn" placeholder="mis. Pengecoran overlay lantai gedung A + B"></label><label class="wide">Keterangan<input type="text" id="pk" placeholder="opsional — mandor, vendor, catatan"></label></div>' +
      '<div class="alloc"><h3>Item budget dalam paket</h3><div class="picker"><input type="search" id="ppick" placeholder="Cari item budget untuk ditambahkan…" style="width:100%"></div>' +
      '<div class="tblwrap" style="max-height:360px;margin-top:8px"><table><thead><tr><th>Item</th><th class="num">Budget</th><th class="num">Realisasi</th><th></th></tr></thead><tbody id="plines"></tbody></table></div>' +
      '<div class="sumline" id="psum"></div></div></div>' +
      '<footer><div>' + (isNew ? '' : '<button class="btn danger w" id="pdel">Hapus paket</button>') + '</div><div class="bar" style="margin:0"><button class="btn" data-close>Batal</button><button class="btn pri w" id="psave">Simpan</button></div></footer>', 'narrow');
    $('#pn', m).value = p.nama; $('#pk', m).value = p.ket || '';
    function draw() {
      var tb = $('#plines', m);
      tb.innerHTML = p.lines.length ? p.lines.map(function (id, i) {
        var x = C.L[id]; if (!x) return '';
        return '<tr><td>' + esc(x.it.desc) + '<div class="subtxt">' + esc(grpLabel(x.it.g) + ' › ' + x.it.sec + (x.it.sub ? ' › ' + x.it.sub : '')) + '</div></td><td class="num">' + rp(x.it.total) + '</td><td class="num">' + rp(x.real) + '</td><td><button class="x" data-del="' + i + '" aria-label="Keluarkan">×</button></td></tr>';
      }).join('') : '<tr><td colspan="4" class="muted small">Belum ada item.</td></tr>';
      $$('[data-del]', tb).forEach(function (b) { b.addEventListener('click', function () { p.lines.splice(+b.dataset.del, 1); draw(); }); });
      var bud = p.lines.reduce(function (s, id) { return s + (C.L[id] ? C.L[id].it.total : 0); }, 0);
      $('#psum', m).innerHTML = '<span>' + p.lines.length + ' item</span><span>Budget paket <b>' + rp(bud) + '</b></span>';
    }
    attachPicker($('#ppick', m), { pkgs: false, keepOpen: true }, function (r) {
      var id = r.key.slice(2); if (p.lines.indexOf(id) >= 0) { toast('Sudah ada di paket'); return; }
      p.lines.push(id); draw();
    });
    draw();
    $('#psave', m).addEventListener('click', function () {
      p.nama = $('#pn', m).value.trim(); p.ket = $('#pk', m).value.trim();
      if (!p.nama) { alert('Isi nama paket.'); $('#pn', m).focus(); return; }
      if (!p.lines.length) { alert('Tambahkan minimal satu item budget.'); return; }
      if (!S.upsertPkg(p)) return; ui.b.sel = {}; closeModal(); render(); toast('Paket disimpan');
    });
    if ($('#pdel', m)) $('#pdel', m).addEventListener('click', function () {
      var n = S.allTx().filter(function (t) { return (t.alok || []).some(function (a) { return a.t === 'P:' + p.id; }); }).length;
      if (!confirm('Hapus paket "' + p.nama + '"?' + (n ? '\n' + n + ' transaksi yang dialokasikan ke paket ini akan menjadi "belum dialokasikan".' : ''))) return;
      if (!S.deletePkg(p.id)) return; closeModal(); render(); toast('Paket dihapus');
    });
    setTimeout(function () { $('#pn', m).focus(); }, 30);
  }

  /* --- Detail item / paket --- */
  function txListFor(map, label) {
    var ids = Object.keys(map);
    if (!ids.length) return '<p class="muted small">Belum ada transaksi.</p>';
    var rows = ids.map(function (id) { return S.allTx().find(function (t) { return t.id === id; }); }).filter(Boolean).sort(txSort);
    return '<div class="tblwrap" style="max-height:320px"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>No.</th><th>Pihak</th><th>Uraian</th><th class="num">' + label + '</th><th class="num">Nilai transaksi</th></tr></thead><tbody>' +
      rows.map(function (t) { return '<tr data-act="editTx" data-id="' + t.id + '" style="cursor:pointer"><td>' + dateLbl(t.tgl) + '</td><td>' + jenisTag(t) + '</td><td>' + esc(t.no) + '</td><td>' + esc(t.pihak) + '</td><td>' + esc(t.uraian) + '</td><td class="num">' + (map[t.id] ? rp(map[t.id]) : '<span class="muted">via item</span>') + '</td><td class="num">' + rp(t.nilai) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function lineDetail(id) {
    var x = C.L[id]; if (!x) return;
    var it = x.it;
    var inPk = S.data.pkgs.filter(function (p) { return p.lines.indexOf(id) >= 0; });
    var row = function (k, b, r) { return '<tr><td>' + k + '</td><td class="num">' + rp(b) + '</td><td class="num">' + rp(r) + '</td><td class="num">' + rp(b - r) + '</td>' + pctCell(b, r) + '</tr>'; };
    openModal('<header><h2>' + esc(it.desc) + '</h2><button class="x" data-close aria-label="Tutup">×</button></header><div class="body">' +
      '<p class="small ink2">' + esc(grpLabel(it.g) + ' › ' + it.sec + (it.sub ? ' › ' + it.sub : '')) + ' · baris ' + it.row + ' sheet "' + esc(grpSheet(it.g)) + '"</p>' +
      '<p class="small ink2" style="margin-bottom:12px">Volume ' + (it.qty != null ? nf2.format(it.qty) : '—') + ' ' + esc(it.unit) + (it.rem ? ' · ' + esc(it.rem) : '') + '</p>' +
      '<div class="tblwrap" style="max-height:none"><table><thead><tr><th>Komponen</th><th class="num">Budget</th><th class="num">Realisasi</th><th class="num">Sisa</th><th class="num">%</th></tr></thead><tbody>' +
      (it.mat || x.r.mat ? row('Material', it.mat, x.r.mat) : '') + (it.upah || x.r.upah ? row('Upah / Jasa', it.upah, x.r.upah) : '') + (it.lain || x.r.lain ? row('Lain-lain', it.lain, x.r.lain) : '') +
      '</tbody><tfoot>' + row('<b>Total</b>', it.total, x.real).replace(/<tr>/, '<tr style="font-weight:650">') + '</tfoot></table></div>' +
      '<p class="small" style="margin:8px 0 14px">Dibayar ' + rp(x.paid) + ' · ' + pillHtml(it.total, x.real) + (inPk.length ? ' · Anggota paket: ' + inPk.map(function (p) { return '<button class="lnk" data-act="pkgDetail" data-id="' + p.id + '">' + esc(p.nama) + '</button>'; }).join(', ') : '') + '</p>' +
      ahsSection(it) +
      '<h3 style="font-size:14px;margin-bottom:6px">Transaksi</h3>' + txListFor(x.tx, 'Ke item ini') + '</div>' +
      '<footer><span></span><div class="bar" style="margin:0"><button class="btn w" data-act="lineToPkg" data-id="' + id + '">Masukkan ke paket…</button><button class="btn pri w" data-act="lineTx" data-id="' + id + '">+ Transaksi untuk item ini</button></div></footer>');
  }
  function ahsSection(it) {
    if (!HG || !HG.hasAhs) return '';
    if (!it.ahs || !HG.B[it.ahs]) {
      return /^B[3-7]$/.test(it.g) ? '<p class="small muted" style="margin-bottom:14px">Analisa harga satuan: harga item ini diketik langsung di Bill (tidak bertaut ke AHS).</p>' : '';
    }
    var b = HG.B[it.ahs], rate = it.qty ? it.total / it.qty : 0, f = b.total && rate ? rate / b.total : 1;
    return '<h3 style="font-size:14px;margin-bottom:6px">Analisa harga satuan <span class="small muted" style="font-weight:400">· <button class="lnk" data-act="blk" data-id="' + b.id + '">' + esc(b.title) + '</button> (' + esc(b.src.trim()) + ' baris ' + b.r0 + ')</span></h3>' +
      compsTable(b, Math.abs(f - 1) > 0.0005 ? f : 1) +
      '<p class="small muted" style="margin:6px 0 14px">Harga satuan item ' + rp(rate) + ' / ' + esc(it.unit) + (Math.abs(f - 1) > 0.0005 ? ' · koefisien disesuaikan ×' + nf2.format(Math.round(f * 1000) / 1000) + ' dari blok AHS (' + rp(b.total) + ')' : '') + '</p>';
  }
  function pkgDetail(pid) {
    var P = C.pkgs[pid]; if (!P) return;
    openModal('<header><h2>▣ ' + esc(P.p.nama) + '</h2><button class="x" data-close aria-label="Tutup">×</button></header><div class="body">' +
      (P.p.ket ? '<p class="small ink2" style="margin-bottom:8px">' + esc(P.p.ket) + '</p>' : '') +
      meterHtml('Paket (' + P.lines.length + ' item)', P.real, P.paid, P.budget) +
      '<p class="small muted" style="margin:6px 0 12px">Dialokasikan langsung ke paket: ' + rp(P.direct) + ' (dibagi ke item sebanding budget). Realisasi paket juga termasuk transaksi yang dialokasikan langsung ke item anggotanya.</p>' +
      '<div class="tblwrap" style="max-height:300px"><table><thead><tr><th>Item</th><th class="num">Budget</th><th class="num">Realisasi</th><th class="num">%</th></tr></thead><tbody>' +
      P.lines.map(function (id) { var x = C.L[id]; return '<tr><td><button class="lnk" style="text-align:left;color:var(--ink)" data-act="line" data-id="' + id + '">' + esc(x.it.desc) + '</button><div class="subtxt">' + esc(grpLabel(x.it.g) + ' › ' + x.it.sec) + '</div></td><td class="num">' + rp(x.it.total) + '</td><td class="num">' + rp(x.real) + '</td>' + pctCell(x.it.total, x.real) + '</tr>'; }).join('') +
      '</tbody></table></div><h3 style="font-size:14px;margin:14px 0 6px">Transaksi</h3>' + txListFor(P.tx, 'Ke paket') + '</div>' +
      '<footer><button class="btn w" data-act="editPkg" data-id="' + pid + '">Ubah paket</button><button class="btn pri w" data-act="pkgTx" data-id="' + pid + '">+ Transaksi ke paket</button></footer>');
  }
  function addToPkgDialog(ids) {
    var m = openModal('<header><h2>Tambah ' + ids.length + ' item ke paket</h2><button class="x" data-close aria-label="Tutup">×</button></header><div class="body">' +
      S.data.pkgs.map(function (p) { return '<div class="list-row"><span>' + esc(p.nama) + ' <span class="muted small">· ' + p.lines.length + ' item</span></span><button class="btn sm" data-pk="' + p.id + '">Tambahkan</button></div>'; }).join('') +
      '</div>', 'narrow');
    $$('[data-pk]', m).forEach(function (b) {
      b.addEventListener('click', function () {
        var p = S.data.pkgs.find(function (x) { return x.id === b.dataset.pk; });
        var add = ids.filter(function (id) { return p.lines.indexOf(id) < 0; });
        p.lines = p.lines.concat(add); if (!S.upsertPkg(p)) return; ui.b.sel = {}; closeModal(); render(); toast(add.length + ' item ditambahkan ke ' + p.nama);
      });
    });
  }

  /* ---------- event delegation ---------- */
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) { closeModal(); return; }
    var tabBtn = e.target.closest('#tabs button'); if (tabBtn) { go(tabBtn.dataset.tab); return; }
    var a = e.target.closest('[data-act]'); if (!a) return;
    var act = a.dataset.act, id = a.dataset.id;
    var selIds = function () { return Object.keys(ui.b.sel).filter(function (k) { return ui.b.sel[k] && C.L[k]; }); };
    switch (act) {
      case 'goData': go('data'); break;
      case 'goTx': go('tx'); break;
      case 'newTx': txForm(); break;
      case 'editTx': { var t = S.allTx().find(function (x) { return x.id === id; }); if (t) txForm(t); break; }
      case 'txUnalloc': ui.t = { q: '', j: '', k: '', m: '', s: '', unalloc: true }; go('tx'); break;
      case 'clrUnalloc': ui.t.unalloc = false; renderTx(); break;
      case 'openGroup': ui.b.q = ''; ui.b.f = ''; ui.b.g = id; ui.b.open['g:' + id] = true; go('budget'); break;
      case 'budgetWarn': ui.b.q = ''; ui.b.g = ''; ui.b.f = 'warn'; go('budget'); break;
      case 'tog': ui.b.open[a.dataset.k] = !ui.b.open[a.dataset.k]; renderBudget(); break;
      case 'expandAll': C.groups.forEach(function (g) { ui.b.open['g:' + g.g.id] = true; }); renderBudget(); break;
      case 'collapseAll': ui.b.open = {}; renderBudget(); break;
      case 'sel': ui.b.sel[id] = a.checked; renderBudget(); break;
      case 'selClear': ui.b.sel = {}; renderBudget(); break;
      case 'selTx': txForm(null, { targets: selIds().map(function (x) { return 'L:' + x; }) }); break;
      case 'selPkg': pkgForm(null, selIds()); break;
      case 'selAddPkg': addToPkgDialog(selIds()); break;
      case 'line': lineDetail(id); break;
      case 'lineTx': txForm(null, { targets: ['L:' + id] }); break;
      case 'lineToPkg': if (S.data.pkgs.length) addToPkgDialog([id]); else pkgForm(null, [id]); break;
      case 'newPkg': pkgForm(); break;
      case 'editPkg': { var p = S.data.pkgs.find(function (x) { return x.id === id; }); if (p) pkgForm(p); break; }
      case 'pkgDetail': pkgDetail(id); break;
      case 'install': doInstall(); break;
      case 'amSave': {
        var id = Amprah.parseId($('#amLink').value);
        if (!id) { alert('Link Google Sheet tidak dikenali. Tempel link lengkap (…/spreadsheets/d/…/edit).'); break; }
        if (!S.saveSetting('amprahSrc', { id: id })) break;
        render(); amprahTick(true); toast('Membaca sheet Amprah…');
        break;
      }
      case 'amRefresh': Amprah.refresh(S.data.set.amprahSrc).then(function (c) { if (c) toast('Amprah dimuat: ' + c.rows.length + ' baris'); }); break;
      case 'amRules': amprahRulesForm(); break;
      case 'amTx': ui.t = { q: '', j: '', k: '', m: '', s: 'amprah' }; go('tx'); break;
      case 'poTx': ui.t = { q: '', j: '', k: '', m: '', s: 'po' }; go('tx'); break;
      case 'poRules': poRulesForm(); break;
      case 'poSave': {
        var pid = Amprah.parseId($('#poLink').value);
        if (!pid) { alert('Link Google Sheet tidak dikenali. Tempel link lengkap (…/spreadsheets/d/…/edit).'); break; }
        if (!S.saveSetting('poSrc', { id: pid })) break;
        render(); toast('Membaca SUMMARY COST lewat server…');
        Sync.flush().then(function () { return Po.refresh(true); }).then(function (d) { if (d) toast('PO dimuat: ' + d.po.length + ' baris'); });
        break;
      }
      case 'poRefresh': Po.refresh(true).then(function (d) { if (d) toast('PO dimuat ulang'); }); break;
      case 'poUnlink':
        if (confirm('Lepas integrasi PO? Transaksi dari SUMMARY COST tidak lagi dihitung. Aturan & koreksi tetap tersimpan.')) { if (Sync.enabled()) S.saveSetting('poSrc', null); Po.clearCache(); render(); }
        break;
      case 'amUnlink':
        if (confirm('Lepas integrasi Amprah? Transaksi Amprah tidak lagi dihitung. Aturan & koreksi tetap tersimpan bila disambungkan lagi.')) { S.saveSetting('amprahSrc', null); Amprah.clearCache(); render(); }
        break;
      case 'hs': harsatDetail(id); break;
      case 'blk': blockDetail(id); break;
      case 'goHarga': ui.h.view = 'dasar'; ui.h.f = 'act'; ui.h.sort = 'imp'; go('ahs'); break;
      case 'pkgTx': txForm(null, { targets: ['P:' + id] }); break;
      case 'backup': download('backup-monitoring-rab-' + today() + '.json', new Blob([JSON.stringify(S.exportBackup())], { type: 'application/json' })); break;
      case 'xls': exportXls(); break;
      case 'reset':
        if (Sync.enabled()) {
          if (confirm('Hapus salinan data di browser ini lalu unduh ulang dari server? Data di Google Sheet tidak terhapus.')) { S.resetAll(); Sync.outbox = []; Sync.vers = { rabVer: '', dataVer: '' }; Sync.saveState(); render(); Sync.load(true); }
        } else if (confirm('Hapus SEMUA data (RAB, transaksi, paket) dari browser ini? Pastikan sudah backup.') && confirm('Yakin? Tindakan ini tidak bisa dibatalkan.')) { S.resetAll(); render(); toast('Data dihapus'); }
        break;
      case 'svConnect': {
        var m = $('#svMsg'); m.innerHTML = '<div class="note">Menghubungkan…</div>';
        svConnect($('#svUrl').value, $('#svCode').value).catch(function (er) { m.innerHTML = '<div class="note crit">' + esc(er.message) + '</div>'; });
        break;
      }
      case 'svReload': Sync.load(true).then(function (okk) { if (okk) toast('Data dimuat ulang dari server'); }); break;
      case 'svShare': {
        var withCode = confirm('Sertakan kode akses Anda di link? (OK = ya, langsung bisa dipakai; Batal = tanpa kode, penerima mengetik kode sendiri)\n\nJangan sertakan kode Admin untuk pengguna biasa.');
        var link = Sync.shareLink(withCode);
        (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { toast('Link disalin'); }, function () { prompt('Salin link ini:', link); });
        break;
      }
      case 'svDisconnect':
        if (confirm('Putuskan dari server? Salinan data di browser ini dihapus; data di Google Sheet tetap aman.' + (Sync.outbox.length ? '\n\nPERHATIAN: ' + Sync.outbox.length + ' perubahan belum terkirim akan hilang.' : ''))) {
          Sync.disconnect(); S.resetAll(); render(); toast('Terputus dari server');
        }
        break;
      case 'svPushLocal': {
        var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
        inp.onchange = function () {
          var f = inp.files[0]; if (!f) return;
          f.text().then(function (t) {
            var obj = JSON.parse(t);
            if (!obj || obj.app !== 'rab-monitor' || !obj.data) throw new Error('Bukan file backup Monitoring RAB');
            if (!confirm('Gabungkan ' + obj.data.tx.length + ' transaksi dan ' + obj.data.pkgs.length + ' paket dari backup ke server? (transaksi dengan id sama akan ditimpa)')) return;
            return Sync.api('importData', { mode: 'merge', data: obj.data }).then(function (r) { toast('Terkirim: server kini ' + r.tx + ' transaksi'); return Sync.load(); });
          }).catch(function (er) { alert('Gagal: ' + er.message); });
        };
        inp.click();
        break;
      }
    }
  });
  $('#btnNewTx').addEventListener('click', function () { txForm(); });
  var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (ui.tab === 'dash') renderDash(); }, 200); });

  /* ---------- sinkron server ---------- */
  Amprah.onChange = function (what) {
    if (what === 'status') { if (ui.tab === 'data' && !$('#modalRoot').innerHTML) renderDataSafe(); return; }
    if ($('#modalRoot').innerHTML) { recompute(); return; }
    render();
  };
  var amSrcSeen = null;
  function amprahTick(force) {
    var src = S.data.set.amprahSrc;
    if (!src || !src.id) return;
    var changed = amSrcSeen !== src.id; amSrcSeen = src.id;
    var age = Amprah.cache && Amprah.cache.id === src.id ? Date.now() - new Date(Amprah.cache.fetchedAt).getTime() : Infinity;
    if (force || changed || age > 4 * 60 * 1000) Amprah.refresh(src);
  }
  setInterval(function () { if (!document.hidden) amprahTick(); }, 60 * 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) amprahTick(); });
  Po.onChange = Amprah.onChange;
  var poSeen = null;
  function poTick(force) {
    if (!Sync.enabled()) return;
    var src = S.data.set.poSrc;
    if (!src || !src.id) return;
    var changed = poSeen !== src.id; poSeen = src.id;
    var age = Po.cache && Po.cache.id === src.id ? Date.now() - new Date(Po.cache.fetchedAt).getTime() : Infinity;
    if (force || changed || age > 5 * 60 * 1000) Po.refresh(false);
  }
  setInterval(function () { if (!document.hidden) poTick(); }, 60 * 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poTick(); });
  Sync.onChange = function (what) {
    if (what === 'data') { amprahTick(); poTick(); }
    if (what === 'status') { updateBadge(); if (ui.tab === 'data' && !$('#modalRoot').innerHTML) renderDataSafe(); return; }
    if ($('#modalRoot').innerHTML) { recompute(); updateBadge(); return; } // jangan ganggu form yang sedang dibuka
    render();
  };
  function renderDataSafe() { var a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $('#tab-data').contains(a)) return; recompute(); renderData(); }
  Sync.onError = function (m) { alert(m); };
  $('#syncBadge').addEventListener('click', function () { go('data'); });

  render();
  /* Link tim: #s=<alamat server>&k=<kode> (bagian # tidak dikirim ke server web) */
  function handleHash() {
    var fromHash = Sync.readHash();
    if (!fromHash) return false;
    if (Sync.enabled() && Sync.cfg.url === fromHash.url && (!fromHash.code || Sync.cfg.code === fromHash.code)) return true;
    if (fromHash.code) {
      if (Sync.enabled() && Sync.outbox.length && !confirm('Ada ' + Sync.outbox.length + ' perubahan belum terkirim di koneksi sekarang. Tetap ganti koneksi?')) return true;
      if (Sync.enabled()) { Sync.disconnect(); S.resetAll(); }
      svConnect(fromHash.url, fromHash.code).catch(function (e) { alert('Gagal tersambung: ' + e.message); go('data'); });
    } else { go('data'); setTimeout(function () { var u = $('#svUrl'); if (u) { u.value = fromHash.url; $('#svCode').focus(); } }, 50); }
    return true;
  }
  window.addEventListener('hashchange', handleHash);
  if (handleHash()) { /* ditangani */ } else if (Sync.enabled()) {
    Sync.setStatus('connecting');
    Sync.start();
    Sync.load();
  }

  amprahTick();
  poTick();
  // mode lokal: upload file SUMMARY COST
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'fPo' && e.target.files[0]) {
      Po.loadFile(e.target.files[0]).then(function (raw) { toast('SUMMARY COST dibaca: ' + raw.po.length + ' baris PO'); }, function (er) { alert('Gagal membaca file: ' + er.message); });
    }
  });

  /* ---------- pasang sebagai aplikasi (PWA) ---------- */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* abaikan */ }); });
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; $('#btnInstall').hidden = false; if (ui.tab === 'data') renderDataSafe(); });
  window.addEventListener('appinstalled', function () { installEvt = null; $('#btnInstall').hidden = true; toast('Aplikasi terpasang — buka dari Start Menu / desktop'); if (ui.tab === 'data') renderDataSafe(); });
  $('#btnInstall').addEventListener('click', doInstall);
  if (isStandalone()) document.body.classList.add('standalone');

  /* pintasan dari ikon aplikasi (klik kanan di taskbar): ?go=newTx | dash | ahs */
  (function () {
    var m = location.search.match(/[?&]go=([a-zA-Z]+)/);
    if (location.search) { try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* abaikan */ } }
    if (!m) return;
    var go_ = m[1];
    if (go_ === 'newTx') {
      var tries = 0;
      (function wait() { if (S.rab && !$('#modalRoot').innerHTML) txForm(); else if (++tries < 40) setTimeout(wait, 250); })();
    } else if (['dash', 'budget', 'ahs', 'pkg', 'tx', 'data'].indexOf(go_) >= 0) go(go_);
  })();
})();
