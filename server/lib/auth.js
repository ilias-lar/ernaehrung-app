'use strict';
/** Passwörter (scrypt), Sitzungen (zufällige Tokens, nur Hash gespeichert), Einladungscodes. */
const crypto = require('node:crypto');

const SESSION_DAYS = 365;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return 'scrypt$' + salt.toString('base64') + '$' + hash.toString('base64');
}

function verifyPassword(password, stored) {
  const [kind, saltB64, hashB64] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const got = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, got);
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

function newSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions[sha(token)] = { userId, created: Date.now(), expires: Date.now() + SESSION_DAYS * 86400000 };
  return token;
}

function userForToken(db, token) {
  if (!token) return null;
  const s = db.sessions[sha(token)];
  if (!s || s.expires < Date.now()) return null;
  return db.users.find((u) => u.id === s.userId) || null;
}

function dropSession(db, token) { if (token) delete db.sessions[sha(token)]; }

function cleanup(db) {
  const now = Date.now();
  Object.keys(db.sessions).forEach((k) => { if (db.sessions[k].expires < now) delete db.sessions[k]; });
  db.invites = db.invites.filter((i) => !i.usedAt && i.expires > now);
}

/** Lesbarer Einladungscode ohne verwechselbare Zeichen (0/O, 1/I). */
function inviteCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += abc[b[i] % abc.length];
  return s.slice(0, 4) + '-' + s.slice(4);
}

const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
function checkPassword(p) {
  if (typeof p !== 'string' || p.length < 8) return 'Passwort muss mindestens 8 Zeichen haben.';
  if (p.length > 200) return 'Passwort ist zu lang.';
  return null;
}

/**
 * Bremse gegen Passwort-/Code-Raten:
 * max. 10 Versuche je IP und max. 200 insgesamt in 15 Minuten.
 */
const attempts = new Map();
let global = [];
function rateLimited(ip) {
  const now = Date.now(); const win = 15 * 60000;
  const list = (attempts.get(ip) || []).filter((t) => now - t < win);
  list.push(now); attempts.set(ip, list);
  global = global.filter((t) => now - t < win); global.push(now);
  if (attempts.size > 5000) attempts.clear(); // Speicher begrenzen
  return list.length > 10 || global.length > 200;
}

/** Echte Client-IP hinter dem Railway-Proxy (X-Real-IP bzw. letzter X-Forwarded-For-Eintrag). */
function clientIp(req) {
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real) return real.trim();
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : (req.socket.remoteAddress || '?');
}

/** Gleiche Rechenzeit, auch wenn es die E-Mail nicht gibt (verrät nicht, wer ein Konto hat). */
const DUMMY = hashPassword('dummy-passwort-zum-zeitausgleich');

module.exports = { clientIp, DUMMY, hashPassword, verifyPassword, newSession, userForToken, dropSession, cleanup, inviteCode, normEmail, validEmail, checkPassword, rateLimited };
