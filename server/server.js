'use strict';
/**
 * Ernährungs-App – Backend (Node ≥ 20, keine Abhängigkeiten).
 * Liefert das Web-Dashboard aus und die API für die iPhone-App.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Store } = require('./lib/store');
const A = require('./lib/auth');
const model = require('./lib/model');

const DOCS = ['settings', 'plan', 'recipes', 'logs'];
const TZ = process.env.TZ_LOCAL || 'Europe/Prague';
const ROOT = path.join(__dirname, '..');
const STATIC = {
  '/': ['web/index.html', 'text/html; charset=utf-8'],
  '/index.html': ['web/index.html', 'text/html; charset=utf-8'],
  '/app.js': ['web/app.js', 'text/javascript; charset=utf-8'],
  '/api.js': ['web/api.js', 'text/javascript; charset=utf-8'],
  '/login.html': ['web/login.html', 'text/html; charset=utf-8'],
  '/data.js': ['shared/data.js', 'text/javascript; charset=utf-8'],
  '/calc.js': ['shared/calc.js', 'text/javascript; charset=utf-8'],
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function localNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { iso: parts.year + '-' + parts.month + '-' + parts.day, min: Number(parts.hour) * 60 + Number(parts.minute), hhmm: parts.hour + ':' + parts.minute };
}
const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T12:00:00Z'));
const isHhmm = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

function publicUser(u) { return u && { id: u.id, name: u.name, email: u.email, role: u.role, pid: u.pid }; }

/** Was eine Person vom Gesamtzustand sehen darf. */
function stateFor(user, st) {
  if (user.role === 'admin') return st;
  const own = (obj) => ({ [user.pid]: (obj || {})[user.pid] || (Array.isArray(obj) ? [] : {}) });
  return Object.assign({}, st, { logs: own(st.logs), weights: { [user.pid]: st.weights[user.pid] || [] } });
}

function createServer(opts) {
  const store = new Store(opts.dataDir);
  const db = () => store.db;

  async function body(req) {
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', (c) => { size += c.length; if (size > 5 * 1024 * 1024) { reject(new HttpError(413, 'Zu groß')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => {
        if (!chunks.length) return resolve({});
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new HttpError(400, 'Ungültiges JSON')); }
      });
      req.on('error', reject);
    });
  }

  function send(res, status, data, headers) {
    const json = JSON.stringify(data);
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, SECURITY_HEADERS, headers || {}));
    res.end(json);
  }

  const token = (req) => { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7).trim() : null; };
  function auth(req) {
    const u = A.userForToken(db(), token(req));
    if (!u) throw new HttpError(401, 'Bitte neu anmelden.');
    return u;
  }
  const admin = (u) => { if (u.role !== 'admin') throw new HttpError(403, 'Nur für den Admin.'); };
  /** Welche Person ist gemeint? User: immer sich selbst. Admin: ?pid=… erlaubt. */
  function pidFor(u, q) {
    if (u.role === 'admin' && q && model.PIDS.includes(q)) return q;
    return u.pid;
  }
  const touch = (...docs) => { const st = db().state; docs.forEach((d) => { st.updated[d] = Date.now(); }); };

  const routes = {
    'GET /api/health': () => ({ ok: true }),
    'GET /api/setup': () => ({ needsSetup: db().users.length === 0 }),

    'POST /api/setup': async (req) => {
      if (db().users.length) throw new HttpError(409, 'Schon eingerichtet.');
      const b = await body(req);
      const email = A.normEmail(b.email);
      if (!A.validEmail(email)) throw new HttpError(400, 'Bitte eine gültige E-Mail eingeben.');
      const pwErr = A.checkPassword(b.password); if (pwErr) throw new HttpError(400, pwErr);
      const u = { id: 'u_' + Date.now().toString(36), name: String(b.name || 'Ilias').slice(0, 40), email, role: 'admin', pid: 'ilias', pass: A.hashPassword(b.password), created: Date.now() };
      db().users.push(u);
      const t = A.newSession(db(), u.id); await store.save();
      return { token: t, user: publicUser(u) };
    },

    'POST /api/login': async (req) => {
      if (A.rateLimited(A.clientIp(req))) throw new HttpError(429, 'Zu viele Versuche. Bitte in 15 Minuten nochmal.');
      const b = await body(req);
      const u = db().users.find((x) => x.email === A.normEmail(b.email));
      const okPw = A.verifyPassword(String(b.password || '').slice(0, 200), u ? u.pass : A.DUMMY);
      if (!u || !okPw) throw new HttpError(401, 'E-Mail oder Passwort falsch.');
      A.cleanup(db());
      const t = A.newSession(db(), u.id); await store.save();
      return { token: t, user: publicUser(u) };
    },

    'POST /api/register': async (req) => {
      if (A.rateLimited(A.clientIp(req))) throw new HttpError(429, 'Zu viele Versuche. Bitte in 15 Minuten nochmal.');
      const b = await body(req);
      const code = String(b.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const inv = db().invites.find((i) => i.code.replace('-', '') === code && !i.usedAt && i.expires > Date.now());
      if (!inv) throw new HttpError(400, 'Einladungscode ungültig oder abgelaufen.');
      const email = A.normEmail(b.email);
      if (!A.validEmail(email)) throw new HttpError(400, 'Bitte eine gültige E-Mail eingeben.');
      if (db().users.some((x) => x.email === email)) throw new HttpError(409, 'Diese E-Mail ist schon registriert.');
      if (db().users.some((x) => x.pid === inv.pid)) throw new HttpError(409, 'Für diese Person gibt es schon ein Konto.');
      const pwErr = A.checkPassword(b.password); if (pwErr) throw new HttpError(400, pwErr);
      const person = db().state.persons[inv.pid];
      const u = { id: 'u_' + Date.now().toString(36), name: String(b.name || (person && person.name) || 'Freundin').slice(0, 40), email, role: 'user', pid: inv.pid, pass: A.hashPassword(b.password), created: Date.now() };
      db().users.push(u); inv.usedAt = Date.now(); inv.userId = u.id;
      if (b.name && person) { person.name = String(b.name).slice(0, 24); touch('settings'); }
      const t = A.newSession(db(), u.id); await store.save();
      return { token: t, user: publicUser(u) };
    },

    'POST /api/logout': async (req) => { A.dropSession(db(), token(req)); await store.save(); return { ok: true }; },
    'GET /api/me': (req) => ({ user: publicUser(auth(req)) }),

    'POST /api/password': async (req) => {
      const u = auth(req); const b = await body(req);
      if (!A.verifyPassword(String(b.current || '').slice(0, 200), u.pass)) throw new HttpError(400, 'Aktuelles Passwort stimmt nicht.');
      const pwErr = A.checkPassword(b.password); if (pwErr) throw new HttpError(400, pwErr);
      u.pass = A.hashPassword(b.password); await store.save();
      return { ok: true };
    },

    // ----- Admin -----
    'GET /api/users': (req) => {
      admin(auth(req)); A.cleanup(db());
      return { users: db().users.map(publicUser), invites: db().invites.map((i) => ({ code: i.code, pid: i.pid, expires: i.expires })) };
    },
    'POST /api/invites': async (req) => {
      admin(auth(req)); const b = await body(req);
      const pid = model.PIDS.includes(b.pid) ? b.pid : 'freundin';
      if (db().users.some((x) => x.pid === pid)) throw new HttpError(409, 'Für diese Person gibt es schon ein Konto.');
      db().invites = db().invites.filter((i) => i.pid !== pid);
      const inv = { code: A.inviteCode(), pid, created: Date.now(), expires: Date.now() + 7 * 86400000 };
      db().invites.push(inv); await store.save();
      return inv;
    },
    'POST /api/users/reset': async (req) => {
      admin(auth(req)); const b = await body(req);
      const u = db().users.find((x) => x.id === b.id);
      if (!u || u.role === 'admin') throw new HttpError(400, 'Konto nicht gefunden.');
      db().users = db().users.filter((x) => x.id !== u.id);
      Object.keys(db().sessions).forEach((k) => { if (db().sessions[k].userId === u.id) delete db().sessions[k]; });
      await store.save();
      return { ok: true };
    },

    // ----- Web-Dashboard: Gesamtzustand -----
    'GET /api/state': (req) => { const u = auth(req); return { me: publicUser(u), state: stateFor(u, db().state) }; },

    // ----- App -----
    'GET /api/today': (req, q) => {
      const u = auth(req); const now = localNow();
      const iso = isIso(q.get('date')) ? q.get('date') : now.iso;
      const min = isHhmm(q.get('now')) ? Number(q.get('now').slice(0, 2)) * 60 + Number(q.get('now').slice(3)) : now.min;
      return model.today(db().state, pidFor(u, q.get('pid')), iso, min);
    },
    'GET /api/week': (req, q) => { const u = auth(req); const iso = localNow().iso; return { days: model.week(db().state, pidFor(u, q.get('pid'))), today: iso, todayIndex: (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7 }; },
    'GET /api/shopping': (req) => { auth(req); return model.shopping(db().state); },

    'POST /api/shopping/check': async (req) => {
      auth(req); const b = await body(req);
      const checks = db().state.settings.checks || (db().state.settings.checks = {});
      if (typeof b.foodId !== 'string' || b.foodId.length > 60) throw new HttpError(400, 'foodId fehlt');
      if (b.checked) checks[b.foodId] = true; else delete checks[b.foodId];
      touch('settings'); await store.save();
      return { ok: true };
    },

    'POST /api/meal': async (req, q) => {
      const u = auth(req); const b = await body(req); const now = localNow();
      const iso = isIso(b.date) ? b.date : now.iso;
      model.setMealDone(db().state, pidFor(u, b.pid || q.get('pid')), iso, b.slot, !!b.done, isHhmm(b.time) ? b.time : (iso === now.iso ? now.hhmm : ''));
      touch('logs'); await store.save();
      return { ok: true };
    },

    'POST /api/water': async (req) => {
      const u = auth(req); const b = await body(req); const now = localNow();
      const iso = isIso(b.date) ? b.date : now.iso; const pid = pidFor(u, b.pid);
      const logs = db().state.logs[pid] || (db().state.logs[pid] = {});
      const log = logs[iso] || (logs[iso] = { meals: [], water: 0, coffee: [] });
      const delta = Number(b.deltaMl); if (!isFinite(delta) || Math.abs(delta) > 3000) throw new HttpError(400, 'Menge ungültig');
      log.water = Math.max(0, Math.min(10000, (log.water || 0) + delta));
      touch('logs'); await store.save();
      return { water: log.water };
    },

    'POST /api/weight': async (req) => {
      const u = auth(req); const b = await body(req); const now = localNow();
      const iso = isIso(b.date) ? b.date : now.iso; const pid = pidFor(u, b.pid);
      const kg = Number(b.kg); if (!(kg > 30 && kg < 300)) throw new HttpError(400, 'Bitte ein Gewicht zwischen 30 und 300 kg eingeben.');
      const list = (db().state.weights[pid] || []).filter((w) => w.date !== iso);
      list.push({ date: iso, kg: Math.round(kg * 10) / 10 });
      db().state.weights[pid] = list;
      touch('settings'); await store.save();
      return { ok: true };
    },
    'DELETE /api/weight': async (req, q) => {
      const u = auth(req); const pid = pidFor(u, q.get('pid')); const iso = q.get('date');
      db().state.weights[pid] = (db().state.weights[pid] || []).filter((w) => w.date !== iso);
      touch('settings'); await store.save();
      return { ok: true };
    },
  };

  /** Web-Dashboard speichert ganze Dokumente; Rechte werden hier durchgesetzt. */
  async function putDoc(req, res, name) {
    const u = auth(req); const b = await body(req);
    const st = db().state; const p = b.data || {};
    if (typeof b.base === 'number' && st.updated[name] && b.base < st.updated[name]) {
      return send(res, 409, { error: 'Inzwischen woanders geändert.', updated: st.updated[name], state: stateFor(u, st) });
    }
    const isAdmin = u.role === 'admin';
    if (name === 'settings') {
      if (isAdmin) {
        if (p.settings) st.settings = Object.assign(st.settings, p.settings);
        if (p.persons) model.PIDS.forEach((pid) => { if (p.persons[pid]) st.persons[pid] = p.persons[pid]; });
        if (p.weights) model.PIDS.forEach((pid) => { if (Array.isArray(p.weights[pid])) st.weights[pid] = p.weights[pid]; });
      } else {
        if (p.persons && p.persons[u.pid]) st.persons[u.pid] = p.persons[u.pid];
        if (p.weights && Array.isArray(p.weights[u.pid])) st.weights[u.pid] = p.weights[u.pid];
        if (p.settings && p.settings.checks) st.settings.checks = p.settings.checks;
      }
    } else if (name === 'logs') {
      const pids = isAdmin ? model.PIDS : [u.pid];
      pids.forEach((pid) => { if (p.logs && p.logs[pid] && typeof p.logs[pid] === 'object') st.logs[pid] = p.logs[pid]; });
    } else if (name === 'plan') {
      if (!isAdmin) throw new HttpError(403, 'Den Plan ändert der Admin.');
      if (!Array.isArray(p.plan) || p.plan.length !== 7) throw new HttpError(400, 'Plan ungültig');
      st.plan = p.plan;
    } else if (name === 'recipes') {
      if (!isAdmin) throw new HttpError(403, 'Rezepte ändert der Admin.');
      st.recipes = p.recipes || {};
    }
    st.updated[name] = Date.now();
    await store.save();
    send(res, 200, { ok: true, updated: st.updated[name] });
  }

  function serveStatic(req, res, pathname) {
    const hit = STATIC[pathname];
    if (!hit) return false;
    fs.readFile(path.join(ROOT, hit[0]), (err, buf) => {
      if (err) { res.writeHead(404); return res.end('Nicht gefunden'); }
      res.writeHead(200, Object.assign({ 'Content-Type': hit[1], 'Cache-Control': 'no-cache' }, SECURITY_HEADERS));
      res.end(buf);
    });
    return true;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      if (req.method === 'GET' && serveStatic(req, res, url.pathname)) return;
      const m = url.pathname.match(/^\/api\/state\/(settings|plan|recipes|logs)$/);
      if (m && req.method === 'PUT') return await putDoc(req, res, m[1]);
      const fn = routes[req.method + ' ' + url.pathname];
      if (!fn) throw new HttpError(404, 'Nicht gefunden');
      const out = await fn(req, url.searchParams);
      send(res, 200, out);
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      send(res, status, { error: status === 500 ? 'Serverfehler' : e.message });
    }
  });
  server.store = store;
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8080;
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  createServer({ dataDir }).listen(port, () => console.log('Ernährungs-App läuft auf Port ' + port + ' (Daten: ' + dataDir + ')'));
}

module.exports = { createServer, DOCS };
