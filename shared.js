// Felles regler for navnelisten. Brukes både av server.js og av nettsidene,
// slik at alle regner likt når en endring (op) kommer inn.
(function (root) {
  var MODES = { ticket: 1, book: 1, ares: 1 };
  var FIELDS = { v: 1, tel: 1, adr: 1 };

  function str(x) { return String(x == null ? "" : x).slice(0, 300); }
  function int(x) { var n = parseInt(x, 10); return isNaN(n) ? null : n; }
  function emptyTbl() { return { ticket: [], book: [], ares: [] }; }

  function find(rows, m, k, p) {
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.k === k && (m !== "book" || (r.p || null) === (p || null))) return r;
    }
    return null;
  }
  function isEmpty(r) { return !r.v && !r.tel && !r.adr; }

  function normTbl(t) {
    var out = emptyTbl();
    ["ticket", "book", "ares"].forEach(function (m) {
      var src = t && Array.isArray(t[m]) ? t[m] : [];
      src.forEach(function (r) {
        var k = int(r && r.k);
        if (k === null) return;
        var o = { k: k, v: str(r.v) };
        if (r.tel) o.tel = str(r.tel);
        if (r.adr) o.adr = str(r.adr);
        if (m === "book") o.p = int(r.p) || null;
        if (!isEmpty(o)) out[m].push(o);
      });
    });
    return out;
  }

  // state = { tbl, cfg }. Returnerer true hvis noe ble gjort.
  function applyOp(state, op) {
    if (!op || typeof op !== "object") return false;
    if (op.op === "cfg") {
      if (!op.cfg || typeof op.cfg !== "object") return false;
      var c = state.cfg || (state.cfg = {});
      ["books", "per", "start", "aFrom", "aTo"].forEach(function (k) {
        var n = int(op.cfg[k]);
        if (n !== null && n >= 0 && n <= 1000000) c[k] = n;
      });
      ["title", "theme"].forEach(function (k) { if (k in op.cfg) c[k] = str(op.cfg[k]); });
      if ("local" in op.cfg) c.local = !!op.cfg.local;
      return true;
    }
    if (op.op === "replace") { state.tbl = normTbl(op.tbl); return true; }
    if (!MODES[op.m]) return false;
    var m = op.m, rows = state.tbl[m];

    if (op.op === "set") {
      var k = int(op.k), p = m === "book" ? (int(op.p) || null) : null;
      if (k === null || !FIELDS[op.f]) return false;
      var val = str(op.v), r = find(rows, m, k, p);
      if (!r) {
        if (!val) return true;
        r = { k: k, v: "" };
        if (m === "book") r.p = p;
        rows.push(r);
      }
      if (val) r[op.f] = val; else delete r[op.f];
      if (r.v === undefined) r.v = "";
      if (isEmpty(r)) rows.splice(rows.indexOf(r), 1);
      return true;
    }
    if (op.op === "del") {
      var lo = op.all ? -Infinity : int(op.lo), hi = op.all ? Infinity : int(op.hi);
      if (lo === null || hi === null) return false;
      state.tbl[m] = rows.filter(function (r) { return !(r.k >= lo && r.k <= hi); });
      return true;
    }
    if (op.op === "bulk") {
      if (!Array.isArray(op.rows)) return false;
      op.rows.forEach(function (x) {
        var k = int(x && x.k), p = m === "book" ? (int(x.p) || null) : null;
        if (k === null) return;
        var r = find(rows, m, k, p);
        if (!r) { r = { k: k, v: "" }; if (m === "book") r.p = p; rows.push(r); }
        r.v = str(x.v);
        if (x.tel) r.tel = str(x.tel);
        if (x.adr) r.adr = str(x.adr);
        if (isEmpty(r)) rows.splice(rows.indexOf(r), 1);
      });
      return true;
    }
    return false;
  }

  var api = { applyOp: applyOp, find: find, normTbl: normTbl, emptyTbl: emptyTbl };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.JLShared = api;
})(typeof window !== "undefined" ? window : this);
