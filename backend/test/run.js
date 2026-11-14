/**
 * Uji backend tanpa Google (lihat gas-sim.js). Jalankan:  node backend/test/run.js
 * Opsional uji pulang-pergi dengan file RAB asli:  RAB_XLSX="path\ke\RAB.xlsx" node backend/test/run.js
 */
const assert = require('assert');
const path = require('path');
const { createSim } = require('./gas-sim');

const sim = createSim();
const { X, sheets, props, cacheMap } = sim;
const ADM = 'ADM-uji-rahasia-1', INP = 'INP-uji-rahasia-2', LHT = 'LHT-uji-rahasia-3';
const adm = (a, p) => sim.call(ADM, a, p), inp = (a, p) => sim.call(INP, a, p), lht = (a, p) => sim.call(LHT, a, p);
const ok = (r, m) => { assert.ok(r.ok, (m || '') + ' -> ' + JSON.stringify(r.error || r)); return r.data; };
const err = (r, code, m) => { assert.strictEqual(r.ok, false, m + ' harusnya gagal'); assert.strictEqual(r.error.code, code, m + ' -> ' + JSON.stringify(r.error)); };

let n = 0;
const test = (name, fn) => { try { fn(); n++; console.log('  ok  ' + name); } catch (e) { console.log('  GAGAL  ' + name + '\n        ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n        ')); process.exitCode = 1; } };

const RAB = {
  info: { proyek: 'Proyek Contoh', owner: 'Owner Contoh' },
  groups: [{ id: 'B3', nama: 'BILL 3 - CONTOH', sheet: 'Bill 3 - CONTOH', jenis: 'Langsung', bidang: 'CSA' }, { id: 'PRS', nama: 'Persiapan', sheet: 'Persiapan.', jenis: 'Langsung' }],
  checks: [{ g: 'B3', sheet: 'Bill 3 - CONTOH', count: 3, sum: 1, sheetTotal: 1, diff: 0, ok: true }],
  file: 'contoh.xlsx', importedAt: '2026-11-14T10:00:00.000Z', ahsLinked: 1,
  items: [
    { id: 'B3-10', g: 'B3', row: 10, sec: 'CONCRETE WORKS', sub: 'Overlay', no: '001', desc: '- Concrete fc 30Mpa', unit: "m'", qty: 538.2, mat: 601842150, upah: 56511000, lain: 0, total: 658353150, rem: '=include', ahs: 'A397' },
    { id: 'B3-11', g: 'B3', row: 11, sec: 'CONCRETE WORKS', sub: '', no: '2', desc: '+ Wire mesh', unit: 'm2', qty: null, mat: 0, upah: 100, lain: 0, total: 100, rem: '' },
    { id: 'PRS-11', g: 'PRS', row: 11, sec: 'PAGAR', sub: '', no: '1', desc: 'Banner', unit: '1 Org × 7 Bln', qty: 230, mat: 0, upah: 0, lain: 28750000, total: 28750000, rem: '2021-10-27' }
  ],
  ahs: [{ id: 'A397', src: 'AHS CSA', r0: 397, r1: 405, sumRow: 403, no: '1', sec: 'WIRE MESH', title: '1 m2 wire mesh M10', per: '1 m2', bulat: 124310,
    comps: [{ nama: 'Wire Mesh M10', sat: 'm2', koef: 1.1, hm: 87740, hu: 0, jm: 96514, ju: 0 }, { nama: 'Upah pasang', sat: 'ls', koef: 1, hm: 0, hu: 8000, jm: 0, ju: 8000 }] }],
  harsat: [{ id: 'S243', no: '001', sec: 'BESI WIRE MESH', nama: 'Wire Mesh M10', harga: 87740, sat: 'm2', upd: '2021-10-27', brand: '', lok: 'Jakarta', vendor: 'CV Contoh', ket: '-', jenis: 'mat' }]
};
RAB.total = RAB.items.reduce((s, i) => s + i.total, 0);
RAB.ahs.forEach(b => { b.tm = 96514; b.tu = 8000; b.total = 104514; });

const TX = { id: 'tabc12345', jenis: 'PO', kat: 'po-mat', no: '007', tgl: '2026-11-03', pihak: 'Vendor Contoh', uraian: '- beton & wiremesh', nilai: 700000000, bayar: 0, ket: '',
  created: 1, alok: [{ t: 'L:B3-10', k: 'mat', v: 500000000 }, { t: 'L:B3-11', k: 'mat', v: 200000000 }], rinc: [{ h: 'S243', nama: 'Wire Mesh M10', qty: 500, sat: 'm2', harga: 92000 }] };

console.log('Backend Monitoring RAB');

test('tanpa kode akses -> NOT_CONFIGURED', () => { err(sim.call('apa', 'login'), 'NOT_CONFIGURED', 'tanpa props'); });

test('setup membuat semua tab + kode acak, idempoten', () => {
  X.setup();
  Object.keys(X.TABLES).forEach(t => assert.ok(sheets[t], 'tab ' + t));
  assert.ok(/^ADM-/.test(props.CODE_ADMIN) && /^INP-/.test(props.CODE_INPUT) && /^LHT-/.test(props.CODE_VIEW));
  const k = props.CODE_ADMIN; X.setup(); assert.strictEqual(props.CODE_ADMIN, k, 'kode tidak berubah saat setup ulang');
  assert.strictEqual(sheets.Budget.rows.length, 1, 'hanya header');
  props.CODE_ADMIN = ADM; props.CODE_INPUT = INP; props.CODE_VIEW = LHT;
});

test('login: peran dikenali, kode salah ditolak, dikunci setelah 10x salah', () => {
  assert.strictEqual(ok(adm('login')).role, 'admin');
  assert.strictEqual(ok(inp('login')).role, 'input');
  assert.strictEqual(ok(lht('login')).role, 'view');
  err(sim.call('salah', 'login'), 'BAD_CODE', 'kode salah');
  for (let i = 0; i < 10; i++) sim.call('salah' + i, 'login');
  err(adm('login'), 'LOCKED', 'terkunci');
  delete cacheMap.fails;
  ok(adm('login'));
});

test('request rusak / aksi asing / izin peran', () => {
  assert.strictEqual(JSON.parse(sim.raw('{x')).error.code, 'BAD_REQUEST');
  err(adm('hapusSemua'), 'UNKNOWN_ACTION', 'asing');
  ['saveTx', 'deleteTx', 'savePkg', 'deletePkg', 'publishRab', 'importData', 'getLog', 'saveSetting', 'saveAmprahOvr'].forEach(a => err(lht(a, {}), 'FORBIDDEN', 'view ' + a));
  ['publishRab', 'importData', 'getLog', 'saveSetting'].forEach(a => err(inp(a, {}), 'FORBIDDEN', 'input ' + a));
});

test('load sebelum RAB terbit: rab null, data kosong', () => {
  const d = ok(lht('load'));
  assert.strictEqual(d.rab, null); assert.deepStrictEqual(d.data, { tx: [], pkgs: [], set: {}, amOvr: {} });
});

let rabVer;
test('publishRab lalu load: RAB kembali utuh (teks "- …", "=…", "001", tanggal tetap teks)', () => {
  const r = ok(adm('publishRab', { rab: RAB }));
  rabVer = r.rabVer; assert.ok(rabVer);
  const d = ok(lht('load'));
  assert.deepStrictEqual(d.rab.items, RAB.items);
  assert.deepStrictEqual(d.rab.ahs, RAB.ahs);
  assert.deepStrictEqual(d.rab.harsat, RAB.harsat);
  assert.deepStrictEqual(d.rab.groups, RAB.groups);
  assert.deepStrictEqual(d.rab.info, RAB.info);
  assert.strictEqual(d.rab.total, RAB.total);
  assert.strictEqual(d.rabVer, rabVer);
  assert.ok(!sheets.Budget.rows.flat().includes('#ERROR!'), 'tidak ada sel #ERROR!');
});

test('load dengan rabVer sama tidak mengirim RAB lagi (hemat)', () => {
  const d = ok(inp('load', { rabVer: rabVer }));
  assert.strictEqual(d.rab, undefined);
  assert.ok(ok(inp('load', { rabVer: 'lama' })).rab);
});

let saved;
test('saveTx: simpan + alokasi + rincian, dibaca kembali utuh', () => {
  const v0 = ok(inp('ver')).dataVer;
  const r = ok(inp('saveTx', { tx: TX }));
  saved = r.tx; assert.notStrictEqual(r.dataVer, v0);
  const t = ok(lht('load')).data.tx[0];
  assert.strictEqual(t.no, '007'); assert.strictEqual(t.tgl, '2026-11-03'); assert.strictEqual(t.uraian, '- beton & wiremesh');
  assert.deepStrictEqual(t.alok, TX.alok); assert.deepStrictEqual(t.rinc, TX.rinc);
  assert.strictEqual(t.oleh, 'input'); assert.strictEqual(t.batal, false);
});

test('saveTx update: anak diganti, bukan ditambah; transaksi lain tidak tersentuh', () => {
  ok(inp('saveTx', { tx: Object.assign({}, TX, { id: 'tlain0001', no: 'N-2', alok: [{ t: 'L:B3-11', k: 'upah', v: 5 }], rinc: [] , nilai: 5 }) }));
  ok(inp('saveTx', { tx: Object.assign({}, TX, { bayar: 350000000, batal: true, alok: [{ t: 'P:pk00001', k: 'mat', v: 700000000 }], rinc: [] }) }));
  const d = ok(lht('load')).data;
  assert.strictEqual(d.tx.length, 2);
  const t = d.tx.find(x => x.id === TX.id);
  assert.strictEqual(t.bayar, 350000000); assert.strictEqual(t.batal, true);
  assert.deepStrictEqual(t.alok, [{ t: 'P:pk00001', k: 'mat', v: 700000000 }]); assert.deepStrictEqual(t.rinc, []);
  assert.deepStrictEqual(d.tx.find(x => x.id === 'tlain0001').alok, [{ t: 'L:B3-11', k: 'upah', v: 5 }]);
  assert.strictEqual(sheets.Alokasi.rows.filter(r => r.some(c => c !== '')).length - 1, 2);
});

test('validasi saveTx', () => {
  err(inp('saveTx', { tx: Object.assign({}, TX, { jenis: 'XX' }) }), 'VALIDATION', 'jenis');
  err(inp('saveTx', { tx: Object.assign({}, TX, { kat: 'ngawur' }) }), 'VALIDATION', 'kat');
  err(inp('saveTx', { tx: Object.assign({}, TX, { tgl: '3/11/2026' }) }), 'VALIDATION', 'tgl');
  err(inp('saveTx', { tx: Object.assign({}, TX, { nilai: 0 }) }), 'VALIDATION', 'nilai');
  err(inp('saveTx', { tx: Object.assign({}, TX, { id: 'a b' }) }), 'VALIDATION', 'id');
  err(inp('saveTx', { tx: Object.assign({}, TX, { alok: [{ t: 'Z:1', k: 'mat', v: 1 }] }) }), 'VALIDATION', 'target');
  err(inp('saveTx', {}), 'VALIDATION', 'kosong');
});

test('CONFLICT bila transaksi sudah diubah orang lain', () => {
  const cur = ok(lht('load')).data.tx.find(x => x.id === TX.id);
  err(inp('saveTx', { tx: TX, prevUpdated: cur.updated - 5 }), 'CONFLICT', 'basi');
  ok(inp('saveTx', { tx: Object.assign({}, TX, { batal: false }), prevUpdated: cur.updated }));
});

test('savePkg / deletePkg: anggota tersimpan; hapus paket melepas alokasinya', () => {
  ok(inp('savePkg', { pkg: { id: 'pk00001', nama: '- Paket uji', ket: '', lines: ['B3-10', 'B3-11'] } }));
  ok(inp('saveTx', { tx: Object.assign({}, TX, { id: 'tpkg00001', alok: [{ t: 'P:pk00001', k: 'upah', v: 10 }, { t: 'L:B3-10', k: 'mat', v: 5 }], nilai: 15 }) }));
  let d = ok(lht('load')).data;
  assert.deepStrictEqual(d.pkgs, [{ id: 'pk00001', nama: '- Paket uji', ket: '', updated: d.pkgs[0].updated, lines: ['B3-10', 'B3-11'] }]);
  ok(inp('deletePkg', { id: 'pk00001' }));
  d = ok(lht('load')).data;
  assert.strictEqual(d.pkgs.length, 0);
  assert.deepStrictEqual(d.tx.find(x => x.id === 'tpkg00001').alok, [{ t: 'L:B3-10', k: 'mat', v: 5 }]);
  assert.strictEqual(sheets.Paket_Item.rows.filter(r => r.some(c => c !== '')).length, 1);
});

test('deleteTx menghapus baris dan anaknya', () => {
  ok(inp('deleteTx', { id: 'tpkg00001' }));
  const d = ok(lht('load')).data;
  assert.ok(!d.tx.some(x => x.id === 'tpkg00001'));
  assert.ok(!sheets.Alokasi.rows.some(r => r[0] === 'tpkg00001'));
});

test('publishRab + data hasil pemetaan ulang: CONFLICT bila basi, berhasil bila versi cocok', () => {
  const v = ok(adm('ver'));
  const d = ok(adm('load')).data;
  d.tx.forEach(t => t.alok.forEach(a => { if (a.t === 'L:B3-11') a.t = 'L:B3-12'; }));
  err(adm('publishRab', { rab: RAB, data: d, baseDataVer: 'basi' }), 'CONFLICT', 'basi');
  const r = ok(adm('publishRab', { rab: RAB, data: d, baseDataVer: v.dataVer }));
  assert.notStrictEqual(r.rabVer, rabVer);
  const after = ok(lht('load')).data;
  assert.ok(after.tx.every(t => t.alok.every(a => a.t !== 'L:B3-11')));
  assert.strictEqual(after.tx.length, 2);
});

test('importData merge per id (tidak menghapus data server lain); replace mengganti semua', () => {
  ok(adm('importData', { data: { tx: [Object.assign({}, TX, { id: 'tlokal001', no: 'LOKAL' })], pkgs: [{ id: 'pklok0001', nama: 'Paket lokal', lines: ['B3-10'] }] } }));
  let d = ok(lht('load')).data;
  assert.strictEqual(d.tx.length, 3); assert.strictEqual(d.pkgs.length, 1);
  ok(adm('importData', { mode: 'replace', data: { tx: [TX], pkgs: [] } }));
  d = ok(lht('load')).data;
  assert.strictEqual(d.tx.length, 1); assert.strictEqual(d.pkgs.length, 0);
});

test('Amprah: tab baru dibuat otomatis (database lama tanpa setup ulang)', () => {
  delete sheets.Setting; delete sheets.Amprah_Koreksi;
  const d = ok(lht('load')).data;
  assert.deepStrictEqual(d.set, {}); assert.deepStrictEqual(d.amOvr, {});
  assert.ok(sheets.Setting && sheets.Amprah_Koreksi, 'tab dibuat saat dibaca');
});

const RULES = [{ jenis: 'KONTRAKAN', kata: 'cewe|putri', t: 'L:B3-10' }, { jenis: '', kata: '- penggantian', t: '' }];
test('saveSetting: link & aturan tersimpan sebagai JSON; kunci asing ditolak; hanya admin', () => {
  ok(adm('saveSetting', { key: 'amprahSrc', value: { id: '1AbC-xyz_123', sheet: 'TRACKING' } }));
  ok(adm('saveSetting', { key: 'amprahRules', value: RULES }));
  ok(adm('saveSetting', { key: 'amprahRules', value: RULES })); // update, bukan baris baru
  const d = ok(lht('load')).data;
  assert.deepStrictEqual(d.set.amprahRules, RULES);
  assert.deepStrictEqual(d.set.amprahSrc, { id: '1AbC-xyz_123', sheet: 'TRACKING' });
  assert.strictEqual(sheets.Setting.rows.filter(r => r && r[0] === 'amprahRules').length, 1);
  err(adm('saveSetting', { key: 'rahasia', value: 1 }), 'VALIDATION', 'kunci asing');
  err(inp('saveSetting', { key: 'amprahRules', value: [] }), 'FORBIDDEN', 'input');
});

test('saveAmprahOvr: simpan, ubah, hapus koreksi; validasi target', () => {
  const key = 'A-20261103-1x9k2m7';
  ok(inp('saveAmprahOvr', { key: key, ovr: { alok: [{ t: 'L:B3-10', k: 'lain', v: 7000000 }, { t: 'L:B3-11', k: 'lain', v: 5000000 }], rinc: [], ket: '- dibagi' } }));
  let o = ok(lht('load')).data.amOvr[key];
  assert.deepStrictEqual(o.alok, [{ t: 'L:B3-10', k: 'lain', v: 7000000 }, { t: 'L:B3-11', k: 'lain', v: 5000000 }]);
  assert.strictEqual(o.ket, '- dibagi'); assert.strictEqual(o.oleh, 'input');
  ok(inp('saveAmprahOvr', { key: key, ovr: { alok: [{ t: 'L:B3-11', k: 'lain', v: 12000000 }] } }));
  assert.strictEqual(sheets.Amprah_Koreksi.rows.filter(r => r && r[0] === key).length, 1);
  err(inp('saveAmprahOvr', { key: key, ovr: { alok: [{ t: 'Z:1', k: 'lain', v: 1 }] } }), 'VALIDATION', 'target');
  err(inp('saveAmprahOvr', { key: 'x', ovr: {} }), 'VALIDATION', 'kunci pendek');
  ok(inp('saveAmprahOvr', { key: key, ovr: null }));
  assert.strictEqual(ok(lht('load')).data.amOvr[key], undefined);
  ok(inp('saveAmprahOvr', { key: key, ovr: { alok: [{ t: 'L:B3-11', k: 'lain', v: 1 }] } }));
});

test('publishRab dengan data: aturan & koreksi Amprah ikut dipetakan ulang', () => {
  const v = ok(adm('ver'));
  const d = ok(adm('load')).data;
  d.set.amprahRules = [{ jenis: 'KONTRAKAN', kata: 'cewe', t: 'L:B3-12' }];
  Object.keys(d.amOvr).forEach(k => { d.amOvr[k].alok = [{ t: 'L:B3-12', k: 'lain', v: 1 }]; });
  ok(adm('publishRab', { rab: RAB, data: d, baseDataVer: v.dataVer }));
  const after = ok(lht('load')).data;
  assert.deepStrictEqual(after.set.amprahRules, [{ jenis: 'KONTRAKAN', kata: 'cewe', t: 'L:B3-12' }]);
  assert.ok(Object.values(after.amOvr).every(o => o.alok[0].t === 'L:B3-12'));
  assert.deepStrictEqual(after.set.amprahSrc, { id: '1AbC-xyz_123', sheet: 'TRACKING' });
});

test('getLog mencatat aksi', () => {
  const log = ok(adm('getLog', { limit: 5 }));
  assert.ok(log.length === 5 && log[0].aksi === 'publishRab');
});

if (process.env.RAB_XLSX) {
  test('pulang-pergi RAB asli: parse .xlsx → publishRab → load identik', () => {
    const W = path.join(__dirname, '..', '..', 'webapp');
    const XLSX = require(path.join(W, 'vendor', 'xlsx.full.min.js'));
    const P = require(path.join(W, 'js', 'parse-rab.js'));
    const buf = require('fs').readFileSync(process.env.RAB_XLSX);
    const want = XLSX.read(buf, { type: 'buffer', bookSheets: true }).SheetNames.filter(s => P.SHEETS_NEEDED.test(s.trim()));
    const rab = P.parse(XLSX, XLSX.read(buf, { type: 'buffer', sheets: want, cellHTML: false, cellText: false, cellStyles: false }));
    rab.file = 'asli.xlsx';
    const t0 = Date.now(), st0 = Object.assign({}, sim.stats);
    ok(adm('publishRab', { rab: rab }));
    const back = ok(lht('load')).rab;
    const norm = x => JSON.parse(JSON.stringify(x));
    const strip = it => { const o = Object.assign({}, it); Object.keys(o).forEach(k => { if (o[k] === undefined) delete o[k]; }); return o; };
    assert.deepStrictEqual(back.items, norm(rab.items.map(strip)));
    const nb = norm(rab.ahs).map(b => ({ id: b.id, src: b.src, r0: b.r0, r1: b.r1, sumRow: b.sumRow == null ? null : b.sumRow, no: b.no, sec: b.sec, title: b.title, per: b.per, bulat: b.bulat == null ? null : b.bulat, comps: b.comps, tm: b.tm, tu: b.tu, total: b.total }));
    back.ahs.forEach((b, i) => { assert.deepStrictEqual(b.comps, nb[i].comps, 'komponen ' + b.id); assert.strictEqual(b.title, nb[i].title); assert.ok(Math.abs(b.total - nb[i].total) < 1e-6); });
    assert.deepStrictEqual(back.harsat, norm(rab.harsat));
    assert.strictEqual(back.items.filter(i => i.ahs).length, rab.ahsLinked);
    assert.ok(!Object.values(sheets).some(sh => sh.rows.some(r => r && r.includes('#ERROR!'))), 'tidak ada #ERROR!');
    console.log('        ' + rab.items.length + ' item, ' + rab.ahs.length + ' AHS, ' + rab.harsat.length + ' HARSAT · baris tabel: Budget ' + (sheets.Budget.rows.length - 1) + ', AHS ' + (sheets.AHS.rows.length - 1) +
      ' · panggilan Sheets: ' + (sim.stats.setValues - st0.setValues) + ' tulis, ' + (sim.stats.getValues - st0.getValues) + ' baca · ' + (Date.now() - t0) + ' ms (simulasi)');
  });
}

test('file gabungan AppsScript-SalinSemua.gs: mutakhir dan berfungsi', () => {
  const fs = require('fs'), dir = path.join(__dirname, '..');
  const bundle = path.join(dir, 'AppsScript-SalinSemua.gs');
  assert.ok(fs.existsSync(bundle), 'jalankan: node backend/build.js');
  const src = fs.readFileSync(bundle, 'utf8');
  ['Db.gs', 'Code.gs', 'Setup.gs'].forEach(f => assert.ok(src.includes(fs.readFileSync(path.join(dir, f), 'utf8').trim()), f + ' berubah tetapi file gabungan belum dibuat ulang — jalankan: node backend/build.js'));
  const s2 = createSim(['AppsScript-SalinSemua.gs']);
  s2.X.setup();
  s2.props.CODE_ADMIN = ADM;
  assert.strictEqual(s2.call(ADM, 'login').data.role, 'admin');
  assert.ok(s2.call(ADM, 'publishRab', { rab: RAB }).ok);
  assert.deepStrictEqual(s2.call(ADM, 'load').data.rab.items, RAB.items);
  assert.ok(s2.call(ADM, 'saveTx', { tx: TX }).ok);
  assert.strictEqual(s2.call(ADM, 'load').data.data.tx.length, 1);
});

console.log('\n' + n + ' uji lulus' + (process.exitCode ? ' — ADA YANG GAGAL' : ''));
