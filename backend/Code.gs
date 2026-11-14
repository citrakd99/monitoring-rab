/**
 * Monitoring RAB — API (Google Apps Script Web App) dengan Google Sheet sebagai database.
 *
 * Permintaan : POST  Content-Type: text/plain  body JSON {"code":"...","action":"...","payload":{...}}
 * Jawaban    : {"ok":true,"role":"admin|input|view","data":...}  atau  {"ok":false,"error":{"code","message","details"}}
 *
 * Peran dari KODE AKSES di Script Properties: CODE_ADMIN (wajib), CODE_INPUT, CODE_VIEW (opsional).
 *  - admin : semua aksi, termasuk menerbitkan RAB dan memindahkan data
 *  - input : catat/ubah/hapus transaksi dan paket
 *  - view  : hanya membaca
 */
const API_VERSION = '1.1.0';
const MAX_FAILS = 10;
const LOCK_SECONDS = 600;
const ALL = ['admin', 'input', 'view'], WRITE = ['admin', 'input'], ADMIN = ['admin'];

function apiError_(code, message, details) { const e = new Error(message); e.isApi = true; e.code = code; e.details = details; return e; }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function fail_(code, message, details) { return { ok: false, error: { code: code, message: message, details: details || null } }; }

function doGet() { return json_({ ok: true, service: 'rab-monitor', version: API_VERSION }); }

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_(fail_('BAD_REQUEST', 'Body bukan JSON yang valid')); }
  const auth = authenticate_(req.code);
  if (!auth.ok) return json_(auth);
  const def = ACTIONS[req.action];
  if (!def) return json_(fail_('UNKNOWN_ACTION', 'Aksi tidak dikenal: ' + req.action));
  if (def.roles.indexOf(auth.role) < 0) return json_(fail_('FORBIDDEN', 'Peran "' + auth.role + '" tidak boleh menjalankan ' + req.action));
  try {
    const run = function () {
      if (!def.write) return def.fn(req.payload || {}, auth);
      // versi sebelum tulis: klien tahu apakah ada perubahan orang lain yang terlewat di antaranya
      const before = vers_().dataVer;
      const out = def.fn(req.payload || {}, auth);
      out.prevDataVer = before;
      return out;
    };
    const data = def.write ? withLock_(run) : run();
    return json_({ ok: true, role: auth.role, data: data });
  } catch (err) {
    if (err && err.isApi) return json_(fail_(err.code, err.message, err.details));
    console.error(err && err.stack ? err.stack : err);
    return json_(fail_('SERVER_ERROR', 'Terjadi kesalahan di server: ' + (err && err.message ? err.message : err)));
  }
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw apiError_('BUSY', 'Server sedang sibuk, coba lagi');
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- Autentikasi ---------- */
function safeEqual_(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function authenticate_(code) {
  const cache = CacheService.getScriptCache();
  if (Number(cache.get('fails') || 0) >= MAX_FAILS) return fail_('LOCKED', 'Terlalu banyak percobaan salah. Coba lagi beberapa menit lagi.');
  const p = PropertiesService.getScriptProperties();
  const codes = { admin: p.getProperty('CODE_ADMIN'), input: p.getProperty('CODE_INPUT'), view: p.getProperty('CODE_VIEW') };
  if (!codes.admin) return fail_('NOT_CONFIGURED', 'Kode akses belum dipasang di Script Properties (minimal CODE_ADMIN)');
  code = String(code === undefined || code === null ? '' : code);
  let role = null;
  // semua kode selalu dibandingkan agar waktu respons tidak membocorkan kode mana yang benar
  ['admin', 'input', 'view'].forEach(function (r) { if (codes[r] && safeEqual_(code, codes[r]) && !role) role = r; });
  if (!role || code.length < 6) {
    cache.put('fails', String(Number(cache.get('fails') || 0) + 1), LOCK_SECONDS);
    return fail_('BAD_CODE', 'Kode akses salah');
  }
  cache.remove('fails');
  return { ok: true, role: role };
}

/* ---------- Versi data (agar klien cukup memeriksa perubahan secara ringan) ---------- */
function vers_() {
  const p = PropertiesService.getScriptProperties();
  return { rabVer: p.getProperty('RAB_VER') || '', dataVer: p.getProperty('DATA_VER') || '' };
}
function bump_(key) {
  const v = String(Date.now()) + Math.floor(Math.random() * 1000);
  PropertiesService.getScriptProperties().setProperty(key, v);
  return v;
}

/* ---------- Serialisasi RAB ---------- */
function num_(v) { return v === '' || v === null || v === undefined ? null : Number(v); }
function str_(v) { return v === null || v === undefined ? '' : String(v); }

function readRab_() {
  const meta = getMeta_();
  if (!meta.importedAt) return null;
  const parse = function (k, d) { try { return meta[k] ? JSON.parse(meta[k]) : d; } catch (e) { return d; } };
  const items = readTable_('Budget').map(function (r) {
    const it = { id: str_(r.id), g: str_(r.g), row: num_(r.row), sec: str_(r.sec), sub: str_(r.sub), no: str_(r.no), desc: str_(r.desc), unit: str_(r.unit),
      qty: num_(r.qty), mat: num_(r.mat) || 0, upah: num_(r.upah) || 0, lain: num_(r.lain) || 0, total: num_(r.total) || 0, rem: str_(r.rem) };
    if (r.ahs) it.ahs = str_(r.ahs);
    return it;
  });
  const blocks = [], byId = {};
  readTable_('AHS').forEach(function (r) {
    const id = str_(r.id);
    let b = byId[id];
    if (!b) {
      b = byId[id] = { id: id, src: str_(r.src), r0: num_(r.r0), r1: num_(r.r1), sumRow: num_(r.sumRow), no: str_(r.no), sec: str_(r.sec), title: str_(r.title), per: str_(r.per), bulat: num_(r.bulat), comps: [] };
      blocks.push(b);
    }
    b.comps.push({ nama: str_(r.nama), sat: str_(r.sat), koef: num_(r.koef) || 0, hm: num_(r.hm) || 0, hu: num_(r.hu) || 0, jm: num_(r.jm) || 0, ju: num_(r.ju) || 0 });
  });
  blocks.forEach(function (b) {
    b.tm = 0; b.tu = 0; b.comps.forEach(function (c) { b.tm += c.jm; b.tu += c.ju; }); b.total = b.tm + b.tu;
  });
  const harsat = readTable_('HARSAT').map(function (r) {
    return { id: str_(r.id), no: str_(r.no), sec: str_(r.sec), nama: str_(r.nama), harga: num_(r.harga) || 0, sat: str_(r.sat), upd: str_(r.upd),
      brand: str_(r.brand), lok: str_(r.lok), vendor: str_(r.vendor), ket: str_(r.ket), jenis: str_(r.jenis) || 'mat' };
  });
  return {
    info: parse('info', {}), groups: parse('groups', []), checks: parse('checks', []), file: str_(meta.file), importedAt: str_(meta.importedAt),
    ahsLinked: num_(meta.ahsLinked) || 0, items: items, total: items.reduce(function (s, it) { return s + it.total; }, 0),
    ahs: blocks, harsat: harsat
  };
}

function writeRab_(rab) {
  const items = (rab.items || []).map(function (it) {
    return { id: it.id, g: it.g, row: it.row, sec: it.sec, sub: it.sub, no: it.no, desc: it.desc, unit: it.unit, qty: it.qty, mat: it.mat, upah: it.upah, lain: it.lain, total: it.total, rem: it.rem, ahs: it.ahs || '' };
  });
  const ahs = [];
  (rab.ahs || []).forEach(function (b) {
    b.comps.forEach(function (c) {
      ahs.push({ id: b.id, src: b.src, r0: b.r0, r1: b.r1, sumRow: b.sumRow, no: b.no, sec: b.sec, title: b.title, per: b.per, bulat: b.bulat, nama: c.nama, sat: c.sat, koef: c.koef, hm: c.hm, hu: c.hu, jm: c.jm, ju: c.ju });
    });
  });
  writeTable_('Budget', items);
  writeTable_('AHS', ahs);
  writeTable_('HARSAT', rab.harsat || []);
  writeTable_('Meta', [
    { key: 'info', value: JSON.stringify(rab.info || {}) },
    { key: 'groups', value: JSON.stringify(rab.groups || []) },
    { key: 'checks', value: JSON.stringify(rab.checks || []) },
    { key: 'file', value: str_(rab.file) },
    { key: 'importedAt', value: str_(rab.importedAt || nowIso_()) },
    { key: 'ahsLinked', value: String(rab.ahsLinked || 0) },
    { key: 'publishedAt', value: nowIso_() }
  ]);
  return { items: items.length, ahs: ahs.length, harsat: (rab.harsat || []).length };
}

/* ---------- Serialisasi transaksi & paket ---------- */
function readData_() {
  const alok = {}, rinc = {}, pitems = {};
  readTable_('Alokasi').forEach(function (r) { (alok[r.tx_id] = alok[r.tx_id] || []).push({ t: str_(r.target), k: str_(r.komponen) || 'lain', v: num_(r.nilai) || 0 }); });
  readTable_('Rincian').forEach(function (r) { (rinc[r.tx_id] = rinc[r.tx_id] || []).push({ h: str_(r.h), nama: str_(r.nama), qty: num_(r.qty) || 0, sat: str_(r.sat), harga: num_(r.harga) || 0 }); });
  readTable_('Paket_Item').forEach(function (r) { (pitems[r.pkg_id] = pitems[r.pkg_id] || []).push(str_(r.item_id)); });
  const tx = readTable_('Transaksi').map(function (r) {
    const id = str_(r.id);
    return { id: id, jenis: str_(r.jenis), kat: str_(r.kat), no: str_(r.no), tgl: str_(r.tgl), pihak: str_(r.pihak), uraian: str_(r.uraian),
      nilai: num_(r.nilai) || 0, bayar: num_(r.bayar) || 0, batal: r.batal === true || r.batal === 'TRUE' || r.batal === 'Ya', ket: str_(r.ket),
      created: num_(r.created) || 0, updated: num_(r.updated) || 0, oleh: str_(r.oleh), alok: alok[id] || [], rinc: rinc[id] || [] };
  });
  const pkgs = readTable_('Paket').map(function (r) { const id = str_(r.id); return { id: id, nama: str_(r.nama), ket: str_(r.ket), updated: num_(r.updated) || 0, lines: pitems[id] || [] }; });
  const set = {};
  readTable_('Setting').forEach(function (r) { try { set[str_(r.key)] = JSON.parse(str_(r.value)); } catch (e) { /* abaikan nilai rusak */ } });
  const amOvr = {};
  readTable_('Amprah_Koreksi').forEach(function (r) {
    try { const d = JSON.parse(str_(r.data)); d.updated = num_(r.updated) || 0; d.oleh = str_(r.oleh); amOvr[str_(r.key)] = d; } catch (e) { /* abaikan */ }
  });
  return { tx: tx, pkgs: pkgs, set: set, amOvr: amOvr };
}

const SETTING_KEYS = ['amprahSrc', 'amprahRules'];
function cleanSetting_(key, value) {
  if (SETTING_KEYS.indexOf(key) < 0) throw apiError_('VALIDATION', 'Pengaturan tidak dikenal: ' + key);
  const s = JSON.stringify(value === undefined ? null : value);
  if (s.length > 45000) throw apiError_('VALIDATION', 'Pengaturan terlalu besar');
  return s;
}
function cleanOvr_(key, ovr) {
  if (!/^[A-Za-z0-9:_.|-]{4,200}$/.test(str_(key))) throw apiError_('VALIDATION', 'Kunci baris Amprah tidak valid');
  if (ovr === null) return null;
  const alok = (ovr.alok || []).map(function (a) {
    if (!/^[LPX]:[A-Za-z0-9_-]+$/.test(str_(a.t))) throw apiError_('VALIDATION', 'Target alokasi tidak valid: ' + a.t);
    if (['mat', 'upah', 'lain'].indexOf(a.k) < 0) throw apiError_('VALIDATION', 'Komponen alokasi tidak valid');
    return { t: a.t, k: a.k, v: Number(a.v) || 0 };
  }).filter(function (a) { return a.v; });
  const rinc = (ovr.rinc || []).map(function (r) {
    return { h: str_(r.h).slice(0, 20), nama: str_(r.nama).slice(0, 200), qty: Number(r.qty) || 0, sat: str_(r.sat).slice(0, 20), harga: Number(r.harga) || 0 };
  }).filter(function (r) { return r.nama; });
  const s = JSON.stringify({ alok: alok, rinc: rinc, ket: str_(ovr.ket).slice(0, 300) });
  if (s.length > 45000) throw apiError_('VALIDATION', 'Koreksi terlalu besar');
  return s;
}
function writeSettings_(set) {
  writeTable_('Setting', Object.keys(set || {}).filter(function (k) { return SETTING_KEYS.indexOf(k) >= 0; })
    .map(function (k) { return { key: k, value: cleanSetting_(k, set[k]), updated: Date.now() }; }));
}
function writeOvrs_(amOvr, role) {
  writeTable_('Amprah_Koreksi', Object.keys(amOvr || {}).map(function (k) {
    const o = amOvr[k];
    return { key: k, data: cleanOvr_(k, o), updated: Number(o.updated) || Date.now(), oleh: str_(o.oleh) || role };
  }));
}

const KATS = ['po-mat', 'po-sub', 'po-sewa', 'np-obname', 'np-mat', 'np-orang', 'np-lain'];
function cleanTx_(t) {
  if (!t || typeof t !== 'object') throw apiError_('VALIDATION', 'Data transaksi kosong');
  const id = str_(t.id);
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) throw apiError_('VALIDATION', 'ID transaksi tidak valid');
  if (['PO', 'NP'].indexOf(t.jenis) < 0) throw apiError_('VALIDATION', 'Jenis harus PO atau NP');
  if (KATS.indexOf(t.kat) < 0) throw apiError_('VALIDATION', 'Kategori tidak dikenal: ' + t.kat);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str_(t.tgl))) throw apiError_('VALIDATION', 'Tanggal harus YYYY-MM-DD');
  const nilai = Number(t.nilai), bayar = Number(t.bayar || 0);
  if (!isFinite(nilai) || nilai <= 0) throw apiError_('VALIDATION', 'Nilai transaksi harus > 0');
  if (!isFinite(bayar) || bayar < 0) throw apiError_('VALIDATION', 'Nilai dibayar tidak valid');
  const alok = (t.alok || []).map(function (a) {
    if (!/^[LPX]:[A-Za-z0-9_-]+$/.test(str_(a.t))) throw apiError_('VALIDATION', 'Target alokasi tidak valid: ' + a.t);
    if (['mat', 'upah', 'lain'].indexOf(a.k) < 0) throw apiError_('VALIDATION', 'Komponen alokasi tidak valid');
    const v = Number(a.v); if (!isFinite(v)) throw apiError_('VALIDATION', 'Nilai alokasi tidak valid');
    return { t: a.t, k: a.k, v: v };
  }).filter(function (a) { return a.v; });
  const rinc = (t.rinc || []).map(function (r) {
    return { h: str_(r.h).slice(0, 20), nama: str_(r.nama).slice(0, 200), qty: Number(r.qty) || 0, sat: str_(r.sat).slice(0, 20), harga: Number(r.harga) || 0 };
  }).filter(function (r) { return r.nama; });
  const cut = function (s, n) { return str_(s).slice(0, n); };
  return { id: id, jenis: t.jenis, kat: t.kat, no: cut(t.no, 80), tgl: t.tgl, pihak: cut(t.pihak, 120), uraian: cut(t.uraian, 300), nilai: nilai, bayar: bayar,
    batal: !!t.batal, ket: cut(t.ket, 300), created: Number(t.created) || Date.now(), updated: Date.now(), alok: alok, rinc: rinc };
}
function writeTx_(t, role) {
  upsertRow_('Transaksi', { id: t.id, jenis: t.jenis, kat: t.kat, no: t.no, tgl: t.tgl, pihak: t.pihak, uraian: t.uraian, nilai: t.nilai, bayar: t.bayar,
    batal: t.batal, ket: t.ket, created: t.created, updated: t.updated, oleh: role });
  replaceChildren_('Alokasi', t.id, t.alok.map(function (a) { return { tx_id: t.id, target: a.t, komponen: a.k, nilai: a.v }; }));
  replaceChildren_('Rincian', t.id, t.rinc.map(function (r) { return { tx_id: t.id, h: r.h, nama: r.nama, qty: r.qty, sat: r.sat, harga: r.harga }; }));
}
function cleanPkg_(p) {
  if (!p || !/^[A-Za-z0-9_-]{4,64}$/.test(str_(p.id))) throw apiError_('VALIDATION', 'ID paket tidak valid');
  if (!str_(p.nama).trim()) throw apiError_('VALIDATION', 'Nama paket wajib diisi');
  const lines = (p.lines || []).map(str_).filter(function (x) { return /^[A-Za-z0-9_-]+$/.test(x); });
  return { id: str_(p.id), nama: str_(p.nama).slice(0, 200), ket: str_(p.ket).slice(0, 300), updated: Date.now(), lines: lines };
}

/* ---------- Aksi ---------- */
const ACTIONS = {
  login: { roles: ALL, fn: function (p, a) { const v = vers_(); return { role: a.role, apiVersion: API_VERSION, rabVer: v.rabVer, dataVer: v.dataVer }; } },

  /** Ringan: hanya versi — dipakai klien untuk memeriksa perubahan berkala. */
  ver: { roles: ALL, fn: function () { return vers_(); } },

  /** Muat semua. RAB hanya dikirim bila versi klien berbeda (hemat). */
  load: { roles: ALL, fn: function (p) {
    const v = vers_();
    const out = { rabVer: v.rabVer, dataVer: v.dataVer, data: readData_() };
    if (!p.rabVer || p.rabVer !== v.rabVer) out.rab = readRab_();
    return out;
  } },

  saveTx: { roles: WRITE, write: true, fn: function (p, a) {
    const t = cleanTx_(p.tx);
    // deteksi bentrok: transaksi sudah diubah orang lain sejak klien memuatnya
    if (p.prevUpdated) {
      const cur = readTable_('Transaksi').filter(function (r) { return String(r.id) === t.id; })[0];
      if (cur && Number(cur.updated) && Number(cur.updated) !== Number(p.prevUpdated))
        throw apiError_('CONFLICT', 'Transaksi ini baru saja diubah pengguna lain. Data dimuat ulang — silakan ulangi perubahan Anda.');
    }
    writeTx_(t, a.role);
    appendLog_(a.role, 'saveTx', { id: t.id, no: t.no, nilai: t.nilai });
    return { tx: t, dataVer: bump_('DATA_VER') };
  } },

  deleteTx: { roles: WRITE, write: true, fn: function (p, a) {
    const id = str_(p.id);
    const found = deleteById_('Transaksi', id);
    replaceChildren_('Alokasi', id, []);
    replaceChildren_('Rincian', id, []);
    appendLog_(a.role, 'deleteTx', { id: id, found: found });
    return { deleted: found, dataVer: bump_('DATA_VER') };
  } },

  savePkg: { roles: WRITE, write: true, fn: function (p, a) {
    const k = cleanPkg_(p.pkg);
    upsertRow_('Paket', { id: k.id, nama: k.nama, ket: k.ket, updated: k.updated });
    replaceChildren_('Paket_Item', k.id, k.lines.map(function (l) { return { pkg_id: k.id, item_id: l }; }));
    appendLog_(a.role, 'savePkg', { id: k.id, nama: k.nama, items: k.lines.length });
    return { pkg: k, dataVer: bump_('DATA_VER') };
  } },

  deletePkg: { roles: WRITE, write: true, fn: function (p, a) {
    const id = str_(p.id);
    deleteById_('Paket', id);
    replaceChildren_('Paket_Item', id, []);
    // alokasi ke paket ini dilepas (menjadi belum dialokasikan)
    const al = readTable_('Alokasi');
    const keep = al.filter(function (r) { return r.target !== 'P:' + id; });
    if (keep.length !== al.length) writeTable_('Alokasi', keep);
    appendLog_(a.role, 'deletePkg', { id: id, alokasiDilepas: al.length - keep.length });
    return { dataVer: bump_('DATA_VER') };
  } },

  /** Admin: pengaturan aplikasi (link sheet Amprah, aturan pemetaan). value = JSON apa saja (≤45 rb karakter). */
  saveSetting: { roles: ADMIN, write: true, fn: function (p, a) {
    const key = str_(p.key), s = cleanSetting_(key, p.value);
    const r = findRow_('Setting', key);
    upsertRow_('Setting', { key: key, value: s, updated: Date.now() });
    appendLog_(a.role, 'saveSetting', { key: key, baru: !r });
    return { dataVer: bump_('DATA_VER') };
  } },

  /** Koreksi alokasi untuk satu baris Amprah (ovr = null → kembali ke aturan otomatis). */
  saveAmprahOvr: { roles: WRITE, write: true, fn: function (p, a) {
    const key = str_(p.key), s = cleanOvr_(key, p.ovr === undefined ? null : p.ovr);
    if (s === null) deleteById_('Amprah_Koreksi', key);
    else upsertRow_('Amprah_Koreksi', { key: key, data: s, updated: Date.now(), oleh: a.role });
    appendLog_(a.role, 'saveAmprahOvr', { key: key, hapus: s === null });
    return { dataVer: bump_('DATA_VER') };
  } },

  /** Admin: terbitkan RAB hasil baca file .xlsx. Opsional sekaligus menulis ulang data hasil pemetaan ulang id item. */
  publishRab: { roles: ADMIN, write: true, fn: function (p, a) {
    const rab = p.rab;
    if (!rab || !rab.items || !rab.items.length) throw apiError_('VALIDATION', 'RAB kosong');
    const v = vers_();
    if (p.data && p.baseDataVer !== undefined && String(p.baseDataVer) !== String(v.dataVer))
      throw apiError_('CONFLICT', 'Data transaksi berubah saat RAB diterbitkan. Coba terbitkan lagi.');
    const res = writeRab_(rab);
    let dataVer = v.dataVer;
    if (p.data) { replaceAllData_(p.data, a.role); dataVer = bump_('DATA_VER'); }
    appendLog_(a.role, 'publishRab', { file: rab.file, items: res.items, ahs: res.ahs, harsat: res.harsat, remap: !!p.data });
    return { rabVer: bump_('RAB_VER'), dataVer: dataVer, written: res };
  } },

  /** Admin: kirim data dari browser (mode lokal lama) ke server. mode 'merge' (per id) atau 'replace'. */
  importData: { roles: ADMIN, write: true, fn: function (p, a) {
    const d = p.data || {};
    const incomingTx = (d.tx || []).map(cleanTx_), incomingPk = (d.pkgs || []).map(cleanPkg_);
    let tx = incomingTx, pkgs = incomingPk, set = d.set || null, amOvr = d.amOvr || null;
    if (p.mode !== 'replace') {
      const cur = readData_();
      const txMap = {}; cur.tx.forEach(function (t) { txMap[t.id] = t; }); incomingTx.forEach(function (t) { txMap[t.id] = t; });
      const pkMap = {}; cur.pkgs.forEach(function (k) { pkMap[k.id] = k; }); incomingPk.forEach(function (k) { pkMap[k.id] = k; });
      tx = Object.keys(txMap).map(function (k) { return txMap[k]; });
      pkgs = Object.keys(pkMap).map(function (k) { return pkMap[k]; });
      if (set) set = Object.assign({}, cur.set, set);
      if (amOvr) amOvr = Object.assign({}, cur.amOvr, amOvr);
    }
    replaceAllData_({ tx: tx, pkgs: pkgs, set: set, amOvr: amOvr }, a.role);
    appendLog_(a.role, 'importData', { mode: p.mode || 'merge', tx: incomingTx.length, pkgs: incomingPk.length });
    return { tx: tx.length, pkgs: pkgs.length, dataVer: bump_('DATA_VER') };
  } },

  getLog: { roles: ADMIN, fn: function (p) {
    const rows = readTable_('Log');
    return rows.slice(-Math.min(Number(p.limit) || 200, 1000)).reverse().map(function (r) { return { waktu: r.waktu, peran: r.peran, aksi: r.aksi, detail: r.detail }; });
  } }
};

function replaceAllData_(d, role) {
  // selalu divalidasi ulang; cap waktu & pengubah asli dipertahankan
  const tx = (d.tx || []).map(function (t) { const c = cleanTx_(t); c.updated = Number(t.updated) || c.updated; c.oleh = str_(t.oleh) || role; return c; });
  const pkgs = (d.pkgs || []).map(function (k) { const c = cleanPkg_(k); c.updated = Number(k.updated) || c.updated; return c; });
  writeTable_('Transaksi', tx.map(function (t) {
    return { id: t.id, jenis: t.jenis, kat: t.kat, no: t.no, tgl: t.tgl, pihak: t.pihak, uraian: t.uraian, nilai: t.nilai, bayar: t.bayar, batal: !!t.batal,
      ket: t.ket, created: t.created, updated: t.updated, oleh: t.oleh || role };
  }));
  const al = [], rc = [], pi = [];
  tx.forEach(function (t) {
    (t.alok || []).forEach(function (a) { al.push({ tx_id: t.id, target: a.t, komponen: a.k, nilai: a.v }); });
    (t.rinc || []).forEach(function (r) { rc.push({ tx_id: t.id, h: r.h, nama: r.nama, qty: r.qty, sat: r.sat, harga: r.harga }); });
  });
  writeTable_('Alokasi', al);
  writeTable_('Rincian', rc);
  writeTable_('Paket', pkgs.map(function (k) { return { id: k.id, nama: k.nama, ket: k.ket, updated: k.updated }; }));
  pkgs.forEach(function (k) { k.lines.forEach(function (l) { pi.push({ pkg_id: k.id, item_id: l }); }); });
  writeTable_('Paket_Item', pi);
  // pengaturan & koreksi Amprah hanya ditulis bila dikirim (mis. hasil pemetaan ulang id item)
  if (d.set) writeSettings_(d.set);
  if (d.amOvr) writeOvrs_(d.amOvr, role);
}
