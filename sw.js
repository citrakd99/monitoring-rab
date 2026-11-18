/* Service worker: menyimpan HANYA berkas aplikasi (kode, ikon) supaya bisa dipasang sebagai aplikasi
 * dan tetap terbuka saat offline. Data (Google Sheet / Apps Script) tidak pernah disimpan di cache –
 * permintaan ke server selalu langsung; antrean offline diurus aplikasi (js/sync.js).
 * Naikkan VERSION setiap mengubah daftar SHELL. */
const VERSION = 'v3';
const CACHE = 'rabmon-shell-' + VERSION;
const SHELL = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/parse-rab.js', 'js/amprah.js', 'js/po.js', 'js/store.js', 'js/sync.js', 'js/calc.js', 'js/charts.js', 'js/app.js',
  'vendor/xlsx.full.min.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('rabmon-shell-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // hanya GET berkas dari situs ini; panggilan ke server data (POST / domain Google) dilewatkan apa adanya
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/__') >= 0 || url.pathname.endsWith('/exec')) return; // endpoint uji lokal
  // jaringan dulu → versi terbaru selalu terpakai saat online; cache dipakai saat offline
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })
      .then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
