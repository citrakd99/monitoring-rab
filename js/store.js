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

  function norm(d) {
    d = d || { tx: [], pkgs: [], seq: 1 };
    d.tx = d.tx || []; d.pkgs = d.pkgs || [];
    d.set = d.set || {};      // pengaturan: amprahSrc {id}, amprahRules [...]
    d.amOvr = d.amOvr || {};  // koreksi alokasi per baris Amprah: {key: {alok, rinc, ket}}
    return d;
  }

  var Store = {
    rab: read(KEY_RAB),
    data: norm(read(KEY_DATA)),

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
    /** Semua transaksi untuk dihitung/ditampilkan: manual + Amprah (dibaca dari sheet, tidak disimpan). */
    allTx: function () {
      if (!window.Amprah) return this.data.tx;
      var src = this.data.set.amprahSrc;
      var rows = Amprah.rows(src);
      if (!rows.length) return this.data.tx;
      return this.data.tx.concat(Amprah.toTx(rows, Amprah.rulesOf(this.data.set, this.rab), this.data.amOvr, this.rab));
    },
    findTx: function (id) { return this.allTx().find(function (t) { return t.id === id; }); },
    saveSetting: function (key, value) {
      if (window.Sync && Sync.enabled() && !Sync.isAdmin()) { alert('Hanya Admin yang bisa mengubah pengaturan ini.'); return false; }
      if (value === null || value === undefined) delete this.data.set[key]; else this.data.set[key] = value;
      this.save();
      if (window.Sync) Sync.push('saveSetting', { key: key, value: value === undefined ? null : value });
      return true;
    },
    saveAmprahOvr: function (key, ovr) {
      if (!this.guard()) return false;
      if (ovr) { ovr.updated = Date.now(); this.data.amOvr[key] = ovr; } else delete this.data.amOvr[key];
      this.save();
      if (window.Sync) Sync.push('saveAmprahOvr', { key: key, ovr: ovr || null });
      return true;
    },
    deletePkg: function (id) {
      if (!this.guard()) return false;
      this.data.pkgs = this.data.pkgs.filter(function (p) { return p.id !== id; });
      // alokasi ke paket yang dihapus dilepas (menjadi belum dialokasikan) — server melakukan hal yang sama
      this.data.tx.forEach(function (t) { t.alok = (t.alok || []).filter(function (a) { return a.t !== 'P:' + id; }); });
      var self = this; Object.keys(this.data.amOvr).forEach(function (k) { var o = self.data.amOvr[k]; o.alok = (o.alok || []).filter(function (a) { return a.t !== 'P:' + id; }); });
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
        // aturan & koreksi Amprah ikut dipetakan
        var remapT = function (a) { if (a.t && a.t.indexOf('L:') === 0) { var m = mapId(a.t.slice(2)); a.t = m ? 'L:' + m : ''; } };
        var self = this;
        Object.keys(this.data.amOvr).forEach(function (k) { (self.data.amOvr[k].alok || []).forEach(remapT); self.data.amOvr[k].alok = self.data.amOvr[k].alok.filter(function (a) { return a.t; }); });
        if (Array.isArray(this.data.set.amprahRules)) this.data.set.amprahRules.forEach(remapT);
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
      this.data = norm(obj.data); this.save();
    },
    resetAll: function () {
      try { localStorage.removeItem(KEY_RAB); localStorage.removeItem(KEY_DATA); } catch (e) { /* abaikan */ }
      this.rab = null; this.data = norm(null);
      if (window.Amprah) Amprah.clearCache();
    }
  };
  root.Store = Store;
})(window);
