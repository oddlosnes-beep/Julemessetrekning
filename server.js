// Julelotteri – liten server uten tilleggspakker (bare det som følger med Node).
// Starter med:  node server.js   (eller dobbeltklikk start.bat)
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const shared = require("./shared.js");

const PORT = parseInt(process.env.PORT || process.argv[2] || "3000", 10);
const DATA = process.env.JL_DATA || path.join(__dirname, "data");
const BACKUP = path.join(DATA, "backup");
fs.mkdirSync(BACKUP, { recursive: true });

const PAGES = {
  "/": "julelotteri.html",
  "/julelotteri.html": "julelotteri.html",
  "/registrer": "registrer.html",
  "/registrer.html": "registrer.html",
  "/shared.js": "shared.js",
  "/mobil": "mobil.html",
  "/mobil.html": "mobil.html",
  "/qr.js": "qr.js",
};
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

// ---------- Tilstand (delt navneliste + innstillinger) ----------
const FILE = path.join(DATA, "delt.json");
let state = { tbl: shared.emptyTbl(), cfg: {}, rev: 0 };
try {
  const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
  state.tbl = shared.normTbl(d.tbl);
  state.cfg = d.cfg && typeof d.cfg === "object" ? d.cfg : {};
  state.rev = d.rev || 0;
  console.log("Leste " + count() + " navn fra " + FILE);
} catch (e) { /* første gangen finnes ingen fil */ }

function count() { return state.tbl.ticket.length + state.tbl.book.length + state.tbl.ares.length; }
function stamp() { return new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19); }

function writeAtomic(file, text) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
let dirty = false, saveTimer = null, lastBackupRev = -1;
function saveSoon() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(flush, 300);
}
function flush() {
  saveTimer = null;
  if (!dirty) return;
  dirty = false;
  try { writeAtomic(FILE, JSON.stringify(state)); } catch (e) { console.error("Kunne ikke lagre:", e.message); }
}
function pruneBackups() {
  try {
    const files = fs.readdirSync(BACKUP).sort();
    ["delt-", "state-", "trekninger-"].forEach(function (pre) {
      const mine = files.filter(function (f) { return f.indexOf(pre) === 0; });
      mine.slice(0, Math.max(0, mine.length - 40)).forEach(function (f) { fs.unlinkSync(path.join(BACKUP, f)); });
    });
  } catch (e) { /* ignorer */ }
}
function backup() {
  if (state.rev === lastBackupRev && !fs.existsSync(path.join(DATA, "state.json"))) return;
  lastBackupRev = state.rev;
  const t = stamp();
  try {
    flush();
    if (fs.existsSync(FILE)) fs.copyFileSync(FILE, path.join(BACKUP, "delt-" + t + ".json"));
    [["state.json", "state-" + t + ".json"], ["trekninger.csv", "trekninger-" + t + ".csv"]].forEach(function (p) {
      const src = path.join(DATA, p[0]);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(BACKUP, p[1]));
    });
    pruneBackups();
  } catch (e) { console.error("Sikkerhetskopi feilet:", e.message); }
}
if (fs.existsSync(FILE)) backup();
setInterval(backup, 10 * 60 * 1000);

// ---------- Bilder fra mobil (forslag som kontrolleres på PC) ----------
const FOTO = path.join(DATA, "foto");
fs.mkdirSync(FOTO, { recursive: true });
const FIDX = path.join(FOTO, "index.json");
let fotos = [];
try { fotos = JSON.parse(fs.readFileSync(FIDX, "utf8")); } catch (e) { /* ingen ennå */ }
function saveFotos() { try { writeAtomic(FIDX, JSON.stringify(fotos)); } catch (e) { console.error("Kunne ikke lagre bildeliste:", e.message); } }
const FTYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

// ---------- Live-oppdatering (Server-Sent Events) ----------
const clients = new Set();
function broadcast(msg) {
  const line = "data: " + JSON.stringify(msg) + "\n\n";
  clients.forEach(function (res) { try { res.write(line); } catch (e) { clients.delete(res); } });
}
setInterval(function () {
  clients.forEach(function (res) { try { res.write(": hjerteslag\n\n"); } catch (e) { clients.delete(res); } });
}, 20000);

// ---------- Hjelpere ----------
function readBody(req, limit) {
  return new Promise(function (resolve, reject) {
    let size = 0; const chunks = [];
    req.on("data", function (c) {
      size += c.length;
      if (size > limit) { reject(new Error("for stor")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", function () { resolve(Buffer.concat(chunks).toString("utf8")); });
    req.on("error", reject);
  });
}
function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}
function lanUrls() {
  const list = [], nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (n) {
    (nets[n] || []).forEach(function (a) {
      if (a.family === "IPv4" && !a.internal) {
        let score = 0;
        if (/virtual|vethernet|vmware|vbox|virtualbox|hyper-v|vpn|tailscale|zerotier|tap|tun|docker|wsl|bluetooth|loopback|unknown/i.test(n)) score += 10;
        if (/wi-?fi|wlan|wireless/i.test(n)) score -= 10;
        else if (/ethernet|lan/i.test(n)) score -= 2;
        if (a.netmask === "255.255.255.255") score += 15;
        if (/\.1$/.test(a.address)) score += 6;
        if (/^169\.254\./.test(a.address)) score += 20;
        list.push({ score: score, url: "http://" + a.address + ":" + PORT, name: n });
      }
    });
  });
  list.sort(function (x, y) { return x.score - y.score; });
  return list.map(function (x) { return x.url; });
}

// ---------- Server ----------
const server = http.createServer(function (req, res) {
  const url = req.url.split("?")[0];

  if (req.method === "GET" && PAGES[url]) {
    fs.readFile(path.join(__dirname, PAGES[url]), function (err, buf) {
      if (err) { res.writeHead(404); res.end("Finner ikke " + PAGES[url]); return; }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(PAGES[url])], "Cache-Control": "no-store" });
      res.end(buf);
    });
    return;
  }
  if (req.method === "GET" && url === "/api/state") {
    return json(res, 200, { tbl: state.tbl, cfg: state.cfg, rev: state.rev });
  }
  if (req.method === "GET" && url === "/api/info") {
    return json(res, 200, { port: PORT, urls: lanUrls(), names: count() });
  }
  if (req.method === "GET" && url === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream", "Cache-Control": "no-store",
      "Connection": "keep-alive", "X-Accel-Buffering": "no",
    });
    res.write("retry: 1500\n\n");
    clients.add(res);
    req.on("close", function () { clients.delete(res); });
    return;
  }
  if (req.method === "GET" && url === "/api/foto") {
    return json(res, 200, { fotos: fotos });
  }
  if (req.method === "POST" && url === "/api/foto") {
    readBody(req, 30 * 1024 * 1024).then(function (txt) {
      let b; try { b = JSON.parse(txt); } catch (e) { return json(res, 400, { error: "ugyldig json" }); }
      const m = /^data:image\/(jpeg|png|webp);base64,/.exec(String(b.img || ""));
      if (!m) return json(res, 400, { error: "ikke et bilde" });
      const buf = Buffer.from(String(b.img).slice(m[0].length), "base64");
      if (buf.length < 100) return json(res, 400, { error: "tomt bilde" });
      const ext = m[1] === "jpeg" ? "jpg" : m[1];
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      try { fs.writeFileSync(path.join(FOTO, id + "." + ext), buf); }
      catch (e) { return json(res, 500, { error: e.message }); }
      const bok = parseInt(b.bok, 10);
      fotos.push({ id: id, ext: ext, bok: isNaN(bok) ? null : bok, txt: String(b.txt || "").slice(0, 20000), t: Date.now(), done: false });
      saveFotos();
      broadcast({ foto: 1 });
      json(res, 200, { ok: true, id: id });
    }).catch(function () { json(res, 413, { error: "for stort bilde" }); });
    return;
  }
  const fm = /^\/foto\/([a-z0-9]+)$/.exec(url);
  if (req.method === "GET" && fm) {
    const e = fotos.find(function (x) { return x.id === fm[1]; });
    if (!e) { res.writeHead(404); res.end("Ikke funnet"); return; }
    fs.readFile(path.join(FOTO, e.id + "." + e.ext), function (err, buf) {
      if (err) { res.writeHead(404); res.end("Ikke funnet"); return; }
      res.writeHead(200, { "Content-Type": FTYPES[e.ext], "Cache-Control": "private, max-age=3600" });
      res.end(buf);
    });
    return;
  }
  const fa = /^\/api\/foto\/([a-z0-9]+)\/(done|delete)$/.exec(url);
  if (req.method === "POST" && fa) {
    readBody(req, 10000).then(function (txt) {
      let b = {}; try { b = JSON.parse(txt || "{}"); } catch (e) { /* tom */ }
      const i = fotos.findIndex(function (x) { return x.id === fa[1]; });
      if (i < 0) return json(res, 404, { error: "finnes ikke" });
      if (fa[2] === "done") fotos[i].done = !!b.done;
      else {
        try { fs.unlinkSync(path.join(FOTO, fotos[i].id + "." + fotos[i].ext)); } catch (e) { /* alt i orden */ }
        fotos.splice(i, 1);
      }
      saveFotos();
      broadcast({ foto: 1 });
      json(res, 200, { ok: true });
    }).catch(function () { json(res, 400, { error: "feil" }); });
    return;
  }
  if (req.method === "POST" && url === "/api/op") {
    readBody(req, 8 * 1024 * 1024).then(function (txt) {
      let body; try { body = JSON.parse(txt); } catch (e) { return json(res, 400, { error: "ugyldig json" }); }
      const ops = Array.isArray(body.ops) ? body.ops.slice(0, 5000) : [];
      let changed = false;
      ops.forEach(function (op) { if (shared.applyOp(state, op)) changed = true; });
      if (changed) {
        state.rev++;
        saveSoon();
        broadcast({ cid: String(body.cid || ""), ops: ops, rev: state.rev });
      }
      json(res, 200, { ok: true, rev: state.rev });
    }).catch(function () { json(res, 413, { error: "for stor" }); });
    return;
  }
  if (req.method === "POST" && url === "/api/save") {
    readBody(req, 20 * 1024 * 1024).then(function (txt) {
      let body; try { body = JSON.parse(txt); } catch (e) { return json(res, 400, { error: "ugyldig json" }); }
      try {
        if (body.st) writeAtomic(path.join(DATA, "state.json"), JSON.stringify(body.st));
        if (typeof body.csv === "string") writeAtomic(path.join(DATA, "trekninger.csv"), body.csv);
      } catch (e) { return json(res, 500, { error: e.message }); }
      json(res, 200, { ok: true });
    }).catch(function () { json(res, 413, { error: "for stor" }); });
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Ikke funnet");
});

server.on("error", function (e) {
  if (e.code === "EADDRINUSE") console.error("\nPort " + PORT + " er allerede i bruk. Er programmet startet fra før? Lukk det andre vinduet, eller bruk en annen port:  node server.js 3001");
  else console.error(e);
  process.exit(1);
});
server.listen(PORT, "0.0.0.0", function () {
  console.log("\nJulelotteri kjører.\n");
  console.log("  Trekning (denne PC-en):          http://localhost:" + PORT);
  const l = lanUrls();
  if (l.length) l.forEach(function (u) { console.log("  Registrering fra andre PC-er:    " + u + "/registrer"); });
  else console.log("  (Fant ingen nettverksadresse. Er PC-en koblet til nettverket?)");
  console.log("\n  Data lagres i mappen: " + DATA);
  console.log("  Lukk dette vinduet (eller trykk Ctrl+C) for å stoppe.\n");
});
function bye() { flush(); backup(); process.exit(0); }
process.on("SIGINT", bye);
process.on("SIGTERM", bye);
process.on("uncaughtException", function (e) { console.error("Uventet feil:", e); });
