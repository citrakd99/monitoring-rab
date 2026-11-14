/* Sinkronisasi ke server Google Sheets (Apps Script Web App).
 * - Alamat server & kode akses hanya disimpan di localStorage browser ini (tidak ada di kode).
 * - Setiap perubahan langsung tampil (optimistis) lalu masuk ANTREAN yang dikirim berurutan.
 *   Bila offline, antrean disimpan dan dikirim ulang otomatis saat koneksi kembali.
 * - Perubahan pengguna lain diperiksa ringan tiap 45 detik (aksi "ver"); data dimuat ulang hanya bila berubah.
 */
(function (root) {
  'use strict';
  var KEY_CFG = 'rabmon.v1.server', KEY_OUT = 'rabmon.v1.outbox', KEY_VER = 'rabmon.v1.vers';
  function read(k, d) { try { var s = localStorage.getItem(k); return s ? JSON.parse(s) : d; } catch (e) { return d; } }
  function write(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* abaikan */ } }

  var Sync = {
    cfg: read(KEY_CFG, null),          // {url, code}
    role: null,                        // admin | input | view
    vers: read(KEY_VER, { rabVer: '', dataVer: '' }),
    outbox: read(KEY_OUT, []),
    status: 'local',                   // local | connecting | online | saving | offline | error
    statusMsg: '',
    lastSync: null,
    busy: false,
    needLoad: false,
    onChange: function () {},          // dipasang app.js → render ulang
    onError: function (m) { alert(m); },

    enabled: function () { return !!(this.cfg && this.cfg.url && this.cfg.code); },
    canWrite: function () { return !this.enabled() || this.role === 'admin' || this.role === 'input'; },
    isAdmin: function () { return !this.enabled() || this.role === 'admin'; },

    setStatus: function (s, msg) { this.status = s; this.statusMsg = msg || ''; this.onChange('status'); },
    saveState: function () { write(KEY_OUT, this.outbox); write(KEY_VER, this.vers); },

    api: function (action, payload) {
      var self = this;
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 90000) : null;
      return fetch(self.cfg.url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow',
        body: JSON.stringify({ code: self.cfg.code, action: action, payload: payload || {} }), signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        if (timer) clearTimeout(timer);
        return res.text().then(function (t) {
          var out;
          try { out = JSON.parse(t); } catch (e) { var er = new Error('Jawaban server bukan JSON (cek alamat Web App /exec dan akses "Anyone")'); er.network = true; throw er; }
          if (!out.ok) { var e2 = new Error(out.error.message); e2.code = out.error.code; throw e2; }
          if (out.role) self.role = out.role;
          return out.data;
        });
      }, function (e) { if (timer) clearTimeout(timer); var er = new Error('Tidak bisa menghubungi server: ' + e.message); er.network = true; throw er; });
    },

    /* ---- sambung / putus ---- */
    connect: function (url, code) {
      var self = this;
      url = String(url || '').trim(); code = String(code || '').trim();
      if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url))
        return Promise.reject(new Error('Alamat harus URL Web App Apps Script (https://script.google.com/macros/s/…/exec)'));
      var prev = this.cfg;
      this.cfg = { url: url, code: code };
      this.setStatus('connecting');
      return this.api('login').then(function (d) {
        write(KEY_CFG, self.cfg);
        self.role = d.role;
        self.setStatus('online');
        return d;
      }, function (e) { self.cfg = prev; self.setStatus(prev ? 'error' : 'local', e.message); throw e; });
    },
    disconnect: function () {
      this.cfg = null; this.role = null; this.outbox = []; this.vers = { rabVer: '', dataVer: '' };
      write(KEY_CFG, null); this.saveState(); this.setStatus('local');
    },

    /* ---- muat dari server ---- */
    load: function (force) {
      var self = this;
      if (!this.enabled()) return Promise.resolve(false);
      return this.flush().then(function (flushed) {
        if (!flushed) return false; // masih ada antrean (offline) → jangan timpa data lokal
        return self.api('load', { rabVer: force ? '' : (Store.rab ? self.vers.rabVer : '') }).then(function (d) {
          if (d.rab !== undefined) { Store.rab = d.rab; Store.saveRab(); }
          Store.data = { tx: d.data.tx, pkgs: d.data.pkgs, set: d.data.set || {}, amOvr: d.data.amOvr || {}, seq: (Store.data && Store.data.seq) || 1 };
          Store.save(true);
          self.vers = { rabVer: d.rabVer, dataVer: d.dataVer }; self.needLoad = false; self.saveState();
          self.lastSync = new Date();
          self.setStatus('online');
          self.onChange('data');
          return true;
        });
      }).catch(function (e) { self.handleErr(e); return false; });
    },

    /* ---- antrean tulis ---- */
    push: function (action, payload) {
      if (!this.enabled()) return;
      var id = payload.tx ? payload.tx.id : payload.pkg ? payload.pkg.id : payload.key || payload.id;
      // gabungkan dengan perubahan yang belum terkirim untuk objek yang sama
      for (var i = this.outbox.length - 1; i >= 0; i--) {
        var o = this.outbox[i];
        if (o.sending || o.oid !== id) continue;
        if (o.action === action && ['saveTx', 'savePkg', 'saveSetting', 'saveAmprahOvr'].indexOf(action) >= 0) {
          var keepPrev = o.payload.prevUpdated; o.payload = payload; if (keepPrev !== undefined) o.payload.prevUpdated = keepPrev;
          this.saveState(); this.flush(); return;
        }
        break;
      }
      this.outbox.push({ action: action, payload: payload, oid: id, t: Date.now() });
      this.saveState();
      this.flush();
    },

    flush: function () {
      var self = this;
      if (!this.enabled()) return Promise.resolve(true);
      if (this._flushing) return this._flushing;
      if (!this.outbox.length) return Promise.resolve(true);
      this.setStatus('saving');
      var step = function () {
        if (!self.outbox.length) { self.setStatus('online'); return Promise.resolve(true); }
        var op = self.outbox[0]; op.sending = true;
        return self.api(op.action, op.payload).then(function (res) {
          self.outbox.shift();
          self.afterWrite(op, res);
          return step();
        }, function (e) {
          op.sending = false;
          if (e.network || e.code === 'BUSY') { self.setStatus('offline', e.message); self.retryLater(); self.saveState(); return false; }
          if (e.code === 'BAD_CODE' || e.code === 'LOCKED' || e.code === 'NOT_CONFIGURED') { self.setStatus('error', e.message); self.saveState(); return false; }
          // CONFLICT / VALIDATION / FORBIDDEN: perubahan ini ditolak → buang, beri tahu, muat ulang data server
          self.outbox.shift(); self.saveState();
          self.onError((e.code === 'CONFLICT' ? '' : 'Perubahan ditolak server: ') + e.message);
          self.needLoad = true;
          return step();
        });
      };
      this._flushing = step().then(function (r) {
        self._flushing = null;
        if (r && self.needLoad) return self.load().then(function () { return true; });
        return r;
      });
      return this._flushing;
    },

    afterWrite: function (op, res) {
      // perubahan orang lain terlewat di antara tulis kita → perlu muat ulang
      if (res.prevDataVer !== undefined && res.prevDataVer !== this.vers.dataVer) this.needLoad = true;
      if (res.dataVer) this.vers.dataVer = res.dataVer;
      if (res.rabVer) this.vers.rabVer = res.rabVer;
      if (op.action === 'saveTx' && res.tx) {
        var t = Store.data.tx.find(function (x) { return x.id === res.tx.id; });
        if (t) { t.updated = res.tx.updated; t.oleh = this.role; }
        // antrean berikutnya untuk transaksi yang sama memakai cap waktu terbaru
        this.outbox.forEach(function (o) { if (o.action === 'saveTx' && o.oid === res.tx.id) o.payload.prevUpdated = res.tx.updated; });
        Store.save(true);
      }
      this.lastSync = new Date();
      this.saveState();
    },

    retryLater: function () {
      var self = this;
      clearTimeout(this._retry);
      this._retry = setTimeout(function () { self.flush(); }, 20000);
    },

    /* ---- periksa perubahan pengguna lain ---- */
    poll: function () {
      var self = this;
      if (!this.enabled() || this.outbox.length || document.hidden) return;
      this.api('ver').then(function (v) {
        if (v.rabVer !== self.vers.rabVer || v.dataVer !== self.vers.dataVer) self.load();
        else if (self.status !== 'online') self.setStatus('online');
      }, function (e) { self.handleErr(e); });
    },
    start: function () {
      var self = this;
      clearInterval(this._poll);
      this._poll = setInterval(function () { self.poll(); }, 45000);
      window.addEventListener('online', function () { self.flush().then(function () { self.poll(); }); });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) { self.flush(); self.poll(); } });
    },
    handleErr: function (e) {
      if (e.network) this.setStatus('offline', e.message);
      else this.setStatus('error', e.message);
    },

    /** Link untuk dibagikan ke tim (alamat server di bagian #, tidak terkirim ke server web). */
    shareLink: function (withCode) {
      var base = location.href.split('#')[0];
      return base + '#s=' + encodeURIComponent(this.cfg.url) + (withCode ? '&k=' + encodeURIComponent(this.cfg.code) : '');
    },
    readHash: function () {
      var h = location.hash.replace(/^#/, ''); if (!h) return null;
      var p = {}; h.split('&').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
      if (!p.s) return null;
      try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) { location.hash = ''; }
      return { url: p.s, code: p.k || '' };
    }
  };
  root.Sync = Sync;
})(window);
