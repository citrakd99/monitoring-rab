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
