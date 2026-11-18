/**
 * Server demo LOKAL: menyajikan folder webapp/ dan meniru endpoint Apps Script di POST /exec
 * memakai kode .gs asli + Google Sheet tiruan (data hilang saat server dimatikan). BUKAN untuk produksi.
 * Jalankan:  node backend/test/dev-server.js     (port 8772, atau PORT=...)
 * Kode demo: ADM-DEMO-123 (admin) · INP-DEMO-123 (input) · LHT-DEMO-123 (lihat)
 * Opsi:      DELAY=800 untuk meniru lambatnya Apps Script (ms)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { createSim } = require('./gas-sim');

const sim = createSim();
sim.X.setup();
sim.props.CODE_ADMIN = 'ADM-DEMO-123'; sim.props.CODE_INPUT = 'INP-DEMO-123'; sim.props.CODE_VIEW = 'LHT-DEMO-123';
let offline = false;

// Opsional: tiru sheet SUMMARY COST (privat) dari file lokal:  --po "path.xlsx" --po-id <id sheet>
const argv = process.argv.slice(2), arg = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
if (arg('--po')) {
  const XLSX = require(path.join(__dirname, '..', '..', 'webapp', 'vendor', 'xlsx.full.min.js'));
  const wb = XLSX.read(fs.readFileSync(arg('--po'))), tabs = {};
  wb.SheetNames.forEach(n => {
    const ws = wb.Sheets[n], aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    Object.keys(ws).forEach(a => {
      if (a[0] === '!') return; const c = ws[a];
      if (c.t === 'n' && c.z && XLSX.SSF.is_date(c.z)) { const rc = XLSX.utils.decode_cell(a), p = XLSX.SSF.parse_date_code(c.v); if (aoa[rc.r]) aoa[rc.r][rc.c] = new Date(Date.UTC(p.y, p.m - 1, p.d) - 7 * 3600e3); }
    });
    tabs[n] = aoa;
  });
  sim.addExternal(arg('--po-id') || 'DEMO-SUMMARY-COST-000000001', tabs, path.basename(arg('--po'), '.xlsx'));
  console.log('Sheet SUMMARY COST tiruan: ' + (arg('--po-id') || 'DEMO-SUMMARY-COST-000000001'));
}

const root = path.join(__dirname, '..', '..', 'webapp');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.xlsx': 'application/octet-stream' };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
const delay = Number(process.env.DELAY || 300);

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (url.pathname === '/exec') {
    if (offline) { req.socket.destroy(); return; }
    if (req.method === 'GET') { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); return res.end('{"ok":true,"service":"rab-monitor","dev":true}'); }
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => setTimeout(() => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(sim.raw(body)); }, delay));
    return;
  }
  // khusus uji lokal: lihat isi tab tiruan & simulasikan server mati
  if (url.pathname === '/__sim/sheet') {
    const sh = sim.sheets[url.searchParams.get('name')];
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(sh ? sh.rows.filter(r => r && r.some(c => c !== '')) : null));
  }
  if (url.pathname === '/__sim/offline') { offline = url.searchParams.get('on') === '1'; res.writeHead(200, cors); return res.end('offline=' + offline); }
  let f = path.normalize(path.join(root, decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname)));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
}).listen(process.env.PORT || 8772, () => console.log('Demo di http://localhost:' + (process.env.PORT || 8772) + '  API: /exec  (ADM-DEMO-123 / INP-DEMO-123 / LHT-DEMO-123)'));
