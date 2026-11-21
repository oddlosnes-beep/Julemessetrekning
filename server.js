// Julelotteri – liten server uten tilleggspakker (bare det som følger med Node).
// Starter med:  node server.js   (eller dobbeltklikk start.bat)
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");
const zlib = require("zlib");
const vm = require("vm");
const { spawn } = require("child_process");
const shared = require("./shared.js");

// Flagg (brukes av snarveien som installasjonsfilen lager):
//   --docs   data i Dokumenter\Julemessetrekning\data (ellers i mappen "data" ved programmet)
//   --open   åpne nettleseren (eller bare åpne siden hvis programmet allerede kjører)
//   --self   programmet kan oppdatere og starte seg selv på nytt (uten start.bat)
//   --quiet  skriv meldinger til data\server.log i stedet for til vinduet
//   --wait   (internt) vent på at porten blir ledig etter en omstart
const ARGS = process.argv.slice(2);
const FLAG = function (n) { return ARGS.indexOf(n) >= 0; };
const PORT = parseInt(process.env.PORT || ARGS.filter(function (a) { return /^\d+$/.test(a); })[0] || "3000", 10);
function docsDir() {
  const h = os.homedir(), c = [path.join(h, "Documents"), path.join(h, "OneDrive", "Documents"), path.join(h, "OneDrive", "Dokumenter")];
  for (let i = 0; i < c.length; i++) if (fs.existsSync(c[i])) return path.join(c[i], "Julemessetrekning", "data");
  return path.join(c[0], "Julemessetrekning", "data");
}
const DATA = process.env.JL_DATA || (FLAG("--docs") ? docsDir() : path.join(__dirname, "data"));
const BACKUP = path.join(DATA, "backup");
fs.mkdirSync(BACKUP, { recursive: true });
if (FLAG("--quiet")) {
  const LOG = path.join(DATA, "server.log");
  try { if (fs.statSync(LOG).size > 500000) fs.renameSync(LOG, LOG + ".old"); } catch (e) {}
  const put = function () { try { fs.appendFileSync(LOG, new Date().toISOString() + " " + Array.prototype.slice.call(arguments).join(" ") + "\n"); } catch (e) {} };
  console.log = put; console.error = put;
}
function findChrome() {
  const e = process.env, pf = e["ProgramFiles"] || "C:\\Program Files", pf86 = e["ProgramFiles(x86)"] || "C:\\Program Files (x86)", la = e["LOCALAPPDATA"] || "";
  const list = [
    pf + "\\Google\\Chrome\\Application\\chrome.exe", pf86 + "\\Google\\Chrome\\Application\\chrome.exe", la + "\\Google\\Chrome\\Application\\chrome.exe",
    pf86 + "\\Microsoft\\Edge\\Application\\msedge.exe", pf + "\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  for (let i = 0; i < list.length; i++) { try { if (fs.existsSync(list[i])) return list[i]; } catch (x) {} }
  return process.platform === "win32" ? "" : (process.env.JL_CHROME || "");
}
let skjermProc = null, lastLive = null;
function openSkjerm(x, y) {
  closeSkjerm();
  const chrome = findChrome();
  if (!chrome) return false;
  const prof = path.join(DATA, "skjerm-profil", String(Date.now()));
  try { fs.rmSync(path.join(DATA, "skjerm-profil"), { recursive: true, force: true }); } catch (e) {}
  const args = ["--kiosk", "--app=http://localhost:" + PORT + "/?kiosk=1#visning", "--user-data-dir=" + prof,
    "--window-position=" + x + "," + y, "--no-first-run", "--no-default-browser-check", "--disable-infobars",
    "--disable-session-crashed-bubble", "--disable-features=Translate"];
  try {
    const c = spawn(chrome, args, { detached: true, stdio: "ignore" });
    c.on("error", function () { if (skjermProc === c) skjermProc = null; });
    c.on("exit", function () { if (skjermProc === c) skjermProc = null; });
    c.unref(); skjermProc = c; return true;
  } catch (e) { return false; }
}
function closeSkjerm() {
  const c = skjermProc; skjermProc = null;
  if (!c) return;
  try {
    if (process.platform === "win32") spawn("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }).on("error", function () {});
    else c.kill();
  } catch (e) {}
}
function openBrowser() {
  const url = "http://localhost:" + PORT;
  function go(cmd, args) {
    try { const c = spawn(cmd, args, { detached: true, stdio: "ignore" }); c.on("error", function () {}); c.unref(); return true; } catch (e) { return false; }
  }
  if (process.platform === "win32") {
    // Eget programvindu uten faner og adressefelt (Chrome eller Edge i app-modus), som i Sangvisning.
    const ch = findChrome();
    if (ch && go(ch, ["--app=" + url, "--start-maximized"])) return;
    go("explorer.exe", [url]);
  } else go(process.platform === "darwin" ? "open" : "xdg-open", [url]);
}

const PAGES = {
  "/": "julelotteri.html",
  "/julelotteri.html": "julelotteri.html",
  "/registrer": "registrer.html",
  "/registrer.html": "registrer.html",
  "/shared.js": "shared.js",
  "/mobil": "mobil.html",
  "/mobil.html": "mobil.html",
  "/qr.js": "qr.js",
  "/icon-trekning.png": "icon-trekning.png",
  "/icon-registrering.png": "icon-registrering.png",
  "/icon-visning.png": "icon-visning.png",
  "/icon-mobil.png": "icon-mobil.png",
};
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png" };

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


// ---------- Oppdatering fra GitHub (som i Sangvisning) ----------
// Siden spør serveren om det finnes en nyere versjon. Den som styrer trekningen trykker "Oppdater nå".
// Da lastes zip-filen fra GitHub ned, filene byttes (data-mappen røres ikke) og programmet starter på nytt.
// Omstart skjer ved at serveren avslutter med kode 42, og start.bat starter den på nytt (JL_LOOP=1 settes av start.bat).
const REPO = "oddlosnes-beep/Julemessetrekning";
const RAW_VERSION = process.env.JL_UPDATE_RAW || ("https://raw.githubusercontent.com/" + REPO + "/main/version.txt");
const ZIP_URL = process.env.JL_UPDATE_ZIP || ("https://codeload.github.com/" + REPO + "/zip/refs/heads/main");
const SKIP_UPDATE = /^(data\/|start\.bat$|install\.bat$|\.gitignore$|\.github\/|installer\/)/;
const CAN_AUTO = process.env.JL_LOOP === "1" || FLAG("--self");
function localVersion() { try { return fs.readFileSync(path.join(__dirname, "version.txt"), "utf8").trim() || "ukjent"; } catch (e) { return "ukjent"; } }
const VERSION = localVersion();
const upd = { stage: "", error: "", busy: false };

function isLocal(req) {
  const a = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  if (a === "127.0.0.1" || a === "::1") return true;
  const nets = os.networkInterfaces();
  return Object.keys(nets).some(function (n) { return (nets[n] || []).some(function (x) { return x.address === a; }); });
}
function getBuf(url, maxBytes, hops) {
  return new Promise(function (resolve, reject) {
    const mod = url.indexOf("https:") === 0 ? https : http;
    const rq = mod.get(url, { headers: { "User-Agent": "Julemessetrekning-oppdatering" } }, function (r) {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && (hops || 0) < 5) {
        r.resume(); return resolve(getBuf(new URL(r.headers.location, url).toString(), maxBytes, (hops || 0) + 1));
      }
      if (r.statusCode !== 200) { r.resume(); return reject(new Error("GitHub svarte " + r.statusCode)); }
      const parts = []; let n = 0;
      r.on("data", function (c) { n += c.length; if (n > maxBytes) { rq.destroy(new Error("For stor fil")); return; } parts.push(c); });
      r.on("end", function () { resolve(Buffer.concat(parts)); });
      r.on("error", reject);
    });
    rq.setTimeout(30000, function () { rq.destroy(new Error("Tidsavbrudd")); });
    rq.on("error", reject);
  });
}
function unzip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error("Ugyldig zip-fil");
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = new Map();
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Ugyldig zip-fil");
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nl); p += 46 + nl + el + cl;
    if (name.endsWith("/")) continue;
    if (buf.readUInt32LE(lo) !== 0x04034b50) throw new Error("Ugyldig zip-fil");
    const st = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28), raw = buf.subarray(st, st + csize);
    out.set(name, method === 0 ? raw : zlib.inflateRawSync(raw));
  }
  return out;
}
function checkJs(name, data) {
  if (/\.js$/.test(name)) new vm.Script(data.toString("utf8"), { filename: name });
  if (/\.html$/.test(name)) { const m = data.toString("utf8").match(/<script>([\s\S]*)<\/script>/); if (m) new vm.Script(m[1], { filename: name }); }
}
function restartSelf() {
  try { flush(); backup(); } catch (e) {}
  const args = [__filename].concat(ARGS.filter(function (a) { return a !== "--open" && a !== "--wait"; })).concat(["--wait"]);
  try { spawn(process.execPath, args, { cwd: __dirname, detached: true, stdio: "ignore", windowsHide: true, env: process.env }).unref(); } catch (e) { console.error("Kunne ikke starte på nytt:", e); return; }
  process.exit(0);
}
async function runUpdate() {
  upd.busy = true; upd.error = ""; upd.stage = "Laster ned";
  try {
    const files = unzip(await getBuf(ZIP_URL, 60 * 1024 * 1024));
    upd.stage = "Kontrollerer";
    const apply = [];
    files.forEach(function (data, full) {
      const rel = full.split("/").slice(1).join("/");
      if (!rel || SKIP_UPDATE.test(rel)) return;
      if (rel.split("/").some(function (x) { return x === ".." || x === ""; })) throw new Error("Uventet filnavn i oppdateringen");
      checkJs(rel, data); apply.push([rel, data]);
    });
    const names = apply.map(function (a) { return a[0]; });
    ["server.js", "shared.js", "julelotteri.html", "registrer.html", "mobil.html", "version.txt"].forEach(function (f) { if (names.indexOf(f) < 0) throw new Error("Oppdateringen mangler " + f); });
    upd.stage = "Bytter filer";
    const bk = path.join(BACKUP, "program-" + VERSION.replace(/[^\w.-]/g, "_"));
    fs.mkdirSync(bk, { recursive: true });
    apply.forEach(function (a) {
      const dst = path.join(__dirname, a[0]);
      if (fs.existsSync(dst)) { fs.mkdirSync(path.dirname(path.join(bk, a[0])), { recursive: true }); fs.copyFileSync(dst, path.join(bk, a[0])); }
    });
    apply.forEach(function (a) {
      const dst = path.join(__dirname, a[0]);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst + ".ny", a[1]); fs.renameSync(dst + ".ny", dst);
    });
    upd.stage = "Starter på nytt";
    setTimeout(function () { if (FLAG("--self")) restartSelf(); else { try { flush(); backup(); } catch (e) {} process.exit(42); } }, 1200);
  } catch (e) { upd.error = String(e && e.message || e); upd.stage = ""; upd.busy = false; console.error("Oppdatering feilet:", upd.error); }
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
  if (url.indexOf("/api/skjerm") === 0 || url === "/api/live") {
    if (!isLocal(req)) return json(res, 403, { error: "Bare fra denne PC-en" });
    if (url === "/api/live") {
      if (req.method === "GET") return json(res, 200, lastLive || { t: "", d: null });
      if (req.method === "POST") {
        readBody(req, 2 * 1024 * 1024).then(function (txt) {
          let m; try { m = JSON.parse(txt); } catch (e) { return json(res, 400, { error: "ugyldig" }); }
          if (!m || (m.t !== "state" && m.t !== "roll")) return json(res, 400, { error: "ugyldig" });
          if (m.t === "state") lastLive = m;
          broadcast({ live: m }); json(res, 200, { ok: true });
        }).catch(function () { json(res, 413, { error: "for stor" }); });
        return;
      }
    }
    if (url === "/api/skjerm" && req.method === "GET") return json(res, 200, { open: !!skjermProc, chrome: !!findChrome() });
    if (url === "/api/skjerm/open" && req.method === "POST") {
      const q = new URL(req.url, "http://x").searchParams, x = parseInt(q.get("x"), 10) || 0, y = parseInt(q.get("y"), 10) || 0;
      return openSkjerm(x, y) ? json(res, 200, { ok: true }) : json(res, 400, { error: "Fant ikke Chrome eller Edge" });
    }
    if (url === "/api/skjerm/close" && req.method === "POST") { closeSkjerm(); return json(res, 200, { ok: true }); }
  }
  if (url.indexOf("/api/update/") === 0 || url === "/api/version" || url === "/api/quit") {
    if (!isLocal(req)) return json(res, 403, { error: "Bare fra denne PC-en" });
    if (req.method === "POST" && url === "/api/quit") { json(res, 200, { ok: true }); setTimeout(bye, 300); return; }
    if (url === "/api/version") return json(res, 200, { version: VERSION, canAuto: CAN_AUTO });
    if (req.method === "GET" && url === "/api/update/check") {
      getBuf(RAW_VERSION + (RAW_VERSION.indexOf("?") < 0 ? "?t=" + Date.now() : ""), 1000)
        .then(function (b) {
          const latest = b.toString("utf8").trim();
          json(res, 200, { current: VERSION, latest: latest, newer: !!latest && latest !== VERSION && /^[\w.-]{1,40}$/.test(latest), canAuto: CAN_AUTO, error: false });
        })
        .catch(function () { json(res, 200, { current: VERSION, latest: "", newer: false, canAuto: false, error: true }); });
      return;
    }
    if (req.method === "GET" && url === "/api/update/status") return json(res, 200, { stage: upd.stage, error: upd.error, busy: upd.busy });
    if (req.method === "POST" && url === "/api/update/install") {
      if (!CAN_AUTO) return json(res, 400, { error: "Programmet er ikke startet med snarveien eller start.bat. Installer på nytt for å oppdatere." });
      if (upd.busy) return json(res, 409, { error: "Oppdatering pågår allerede" });
      runUpdate(); return json(res, 200, { ok: true });
    }
  }
  if (req.method === "GET" && url === "/api/info") {
    return json(res, 200, { port: PORT, urls: lanUrls(), names: count(), version: VERSION });
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

let tries = 0;
server.on("error", function (e) {
  if (e.code === "EADDRINUSE") {
    if (FLAG("--wait") && tries++ < 40) { setTimeout(function () { server.listen(PORT, "0.0.0.0"); }, 500); return; }
    if (FLAG("--open")) { openBrowser(); process.exit(0); }
    console.error("\nPort " + PORT + " er allerede i bruk. Er programmet startet fra før? Lukk det andre vinduet, eller bruk en annen port:  node server.js 3001");
  } else console.error(e);
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
  if (FLAG("--open") && !FLAG("--wait")) openBrowser();
});
function bye() { try { closeSkjerm(); } catch (e) {} flush(); backup(); process.exit(0); }
process.on("SIGINT", bye);
process.on("SIGTERM", bye);
process.on("uncaughtException", function (e) { console.error("Uventet feil:", e); });
