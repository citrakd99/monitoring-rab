/* Penyimpanan lokal (localStorage) — data hanya ada di browser ini.
 * Gunakan menu Data & Backup untuk ekspor/impor file backup (.json). */
(function (root) {
  'use strict';
  var KEY_RAB = 'rabmon.v1.rab';
  var KEY_DATA = 'rabmon.v1.data';

  function read(k) {
    try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { alert('Gagal menyimpan ke browser: ' + e.message + '\nSegera buat backup di menu Data & Backup.'); return false; }
  }

  var Store = {
    rab: read(KEY_RAB),
    data: read(KEY_DATA) || { tx: [], pkgs: [], seq: 1 },

    saveRab: function () { write(KEY_RAB, this.rab); },
    /* Simpan salinan lokal (cache). Pengiriman ke server lewat Sync.push di fungsi-fungsi di bawah. */
    save: function () { this.data.savedAt = new Date().toISOString(); write(KEY_DATA, this.data); },
    nextId: function (p) {
      // unik antar pengguna: waktu + acak
      var rnd = '';
      try { var a = new Uint32Array(2); crypto.getRandomValues(a); rnd = a[0].toString(36) + a[1].toString(36); } catch (e) { rnd = Math.random().toString(36).slice(2, 10); }
      return p + Date.now().toString(36) + rnd.slice(0, 8);
    },
    guard: function () {
      if (window.Sync && !Sync.canWrite()) { alert('Kode akses Anda hanya untuk melihat. Perubahan tidak disimpan.'); return false; }
      return true;
    },

    upsertTx: function (tx) {
      if (!this.guard()) return false;
      var i = this.data.tx.findIndex(function (t) { return t.id === tx.id; });
      var prev = i >= 0 ? this.data.tx[i].updated : undefined;
      if (i >= 0) this.data.tx[i] = tx; else this.data.tx.push(tx);
      this.save();
      if (window.Sync) Sync.push('saveTx', { tx: tx, prevUpdated: prev });
      return true;
    },
    deleteTx: function (id) {
      if (!this.guard()) return false;
      this.data.tx = this.data.tx.filter(function (t) { return t.id !== id; }); this.save();
      if (window.Sync) Sync.push('deleteTx', { id: id });
      return true;
    },
    upsertPkg: function (p) {
      if (!this.guard()) return false;
      var i = this.data.pkgs.findIndex(function (x) { return x.id === p.id; });
      if (i >= 0) this.data.pkgs[i] = p; else this.data.pkgs.push(p);
      this.save();
      if (window.Sync) Sync.push('savePkg', { pkg: p });
      return true;
    },
    deletePkg: function (id) {
      if (!this.guard()) return false;
      this.data.pkgs = this.data.pkgs.filter(function (p) { return p.id !== id; });
      // alokasi ke paket yang dihapus dilepas (menjadi belum dialokasikan) — server melakukan hal yang sama
      this.data.tx.forEach(function (t) { t.alok = (t.alok || []).filter(function (a) { return a.t !== 'P:' + id; }); });
      this.save();
      if (window.Sync) Sync.push('deletePkg', { id: id });
      return true;
    },

    /* Impor RAB baru: petakan ulang id item yang dipakai transaksi/paket bila baris bergeser. */
    replaceRab: function (rab) {
      var old = this.rab, report = { remapped: 0, lost: [] };
      if (old) {
        var newIds = {}; rab.items.forEach(function (it) { newIds[it.id] = it; });
        var keyOf = function (it) { return it.g + '|' + it.desc.toLowerCase() + '|' + (it.unit || '').toLowerCase() + '|' + (it.sub || '').toLowerCase(); };
        var byKey = {}; rab.items.forEach(function (it) { var k = keyOf(it); (byKey[k] = byKey[k] || []).push(it.id); });
        var oldMap = {}; old.items.forEach(function (it) { oldMap[it.id] = it; });
        var mapId = function (id) {
          var o = oldMap[id];
          if (newIds[id] && o && newIds[id].desc === o.desc) return id;
          if (o) { var c = byKey[keyOf(o)]; if (c && c.length) { report.remapped++; return c[0]; } }
          if (newIds[id] && !o) return id;
          report.lost.push(o ? o.desc : id); return null;
        };
        this.data.tx.forEach(function (t) {
          (t.alok || []).forEach(function (a) { if (a.t.indexOf('L:') === 0) { var m = mapId(a.t.slice(2)); a.t = m ? 'L:' + m : 'X:' + a.t.slice(2); } });
        });
        this.data.pkgs.forEach(function (p) { p.lines = p.lines.map(mapId).filter(Boolean); });
        this.save();
      }
      this.rab = rab; this.saveRab();
      return report;
    },

    exportBackup: function () {
      return { app: 'rab-monitor', ver: 1, exportedAt: new Date().toISOString(), rab: this.rab, data: this.data };
    },
    importBackup: function (obj) {
      if (!obj || obj.app !== 'rab-monitor' || !obj.data) throw new Error('Bukan file backup Monitoring RAB');
      if (obj.rab) { this.rab = obj.rab; this.saveRab(); }
      this.data = obj.data; this.save();
    },
    resetAll: function () {
      try { localStorage.removeItem(KEY_RAB); localStorage.removeItem(KEY_DATA); } catch (e) { /* abaikan */ }
      this.rab = null; this.data = { tx: [], pkgs: [], seq: 1 };
    }
  };
  root.Store = Store;
})(window);
