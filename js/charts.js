/* Grafik SVG ringan (tanpa library). */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    var n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * p;
  }

  /* Kolom bertumpuk. rows: [{label, values:{key:num}, tip}] ; series: [{key,name,color}] */
  function stackedColumns(host, rows, series, fmtShort, fmtFull) {
    host.innerHTML = '';
    host.classList.add('chart');
    var W = Math.max(host.clientWidth || 600, 320), H = 230, m = { l: 52, r: 8, t: 10, b: 26 };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' }, host);
    var max = niceMax(Math.max.apply(null, rows.map(function (r) {
      return series.reduce(function (a, s) { return a + (r.values[s.key] || 0); }, 0);
    }).concat([0])));
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    for (var i = 0; i <= 4; i++) {
      var y = m.t + ih - ih * i / 4;
      el('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, 'class': i === 0 ? 'ax' : 'gl' }, svg);
      var tx = el('text', { x: m.l - 6, y: y + 4, 'text-anchor': 'end' }, svg); tx.textContent = fmtShort(max * i / 4);
    }
    if (!rows.length) return;
    var bw = iw / rows.length, w = Math.max(4, Math.min(44, bw * 0.62));
    var tip = document.createElement('div'); tip.className = 'tip hide'; host.appendChild(tip);
    var every = Math.ceil(rows.length / Math.max(1, Math.floor(iw / 56)));
    rows.forEach(function (r, i) {
      var x = m.l + bw * i + (bw - w) / 2, base = m.t + ih;
      var segs = series.filter(function (s) { return r.values[s.key] > 0; });
      segs.forEach(function (s, j) {
        var h = ih * r.values[s.key] / max;
        var top = j === segs.length - 1;
        var gap = j > 0 ? 2 : 0; // celah 2px antar segmen
        var hh = Math.max(0, h - gap);
        var y0 = base - hh;
        if (top && hh > 4) {
          el('path', { d: 'M' + x + ',' + base + 'V' + (y0 + 4) + 'q0,-4 4,-4h' + (w - 8) + 'q4,0 4,4V' + base + 'Z', fill: s.color }, svg);
        } else el('rect', { x: x, y: y0, width: w, height: hh, fill: s.color }, svg);
        base = y0 - gap;
      });
      if (i % every === 0) {
        var lt = el('text', { x: m.l + bw * i + bw / 2, y: H - 8, 'text-anchor': 'middle' }, svg); lt.textContent = r.label;
      }
      var hit = el('rect', { x: m.l + bw * i, y: m.t, width: bw, height: ih, fill: 'transparent' }, svg);
      hit.addEventListener('mousemove', function () {
        var total = series.reduce(function (a, s) { return a + (r.values[s.key] || 0); }, 0);
        tip.innerHTML = '<b>' + (r.tip || r.label) + '</b><br>' + series.map(function (s) {
          return '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + s.color + ';margin-right:5px"></span>' + s.name + ': ' + fmtFull(r.values[s.key] || 0);
        }).join('<br>') + '<br>Total: ' + fmtFull(total);
        tip.classList.remove('hide');
        var sx = host.clientWidth / W;
        tip.style.left = Math.min(Math.max((m.l + bw * i + bw / 2) * sx, 90), host.clientWidth - 90) + 'px';
        tip.style.top = (m.t + 20) + 'px';
      });
      hit.addEventListener('mouseleave', function () { tip.classList.add('hide'); });
    });
  }

  root.Charts = { stackedColumns: stackedColumns };
})(window);
