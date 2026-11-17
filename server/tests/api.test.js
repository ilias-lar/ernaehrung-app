'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

let server, base;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ern-'));

async function call(method, url, body, token) {
  const res = await fetch(base + url, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

test.before(async () => {
  server = createServer({ dataDir: dir });
  await new Promise((r) => server.listen(0, r));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => server.close());

let adminT, userT;

test('Einrichtung: erster Account wird Admin, danach gesperrt', async () => {
  assert.equal((await call('GET', '/api/setup')).data.needsSetup, true);
  assert.equal((await call('POST', '/api/setup', { email: 'x', password: '12345678' })).status, 400);
  assert.equal((await call('POST', '/api/setup', { email: 'admin@test.de', password: 'kurz' })).status, 400);
  const r = await call('POST', '/api/setup', { name: 'Ilias', email: 'Admin@Test.de', password: 'geheim1234' });
  assert.equal(r.status, 200); assert.equal(r.data.user.role, 'admin'); assert.equal(r.data.user.pid, 'ilias');
  adminT = r.data.token;
  assert.equal((await call('POST', '/api/setup', { email: 'b@test.de', password: 'geheim1234' })).status, 409);
});

test('Login: falsches Passwort abgelehnt, richtiges klappt', async () => {
  assert.equal((await call('POST', '/api/login', { email: 'admin@test.de', password: 'falsch123' })).status, 401);
  const r = await call('POST', '/api/login', { email: 'admin@test.de', password: 'geheim1234' });
  assert.equal(r.status, 200); assert.ok(r.data.token);
});

test('Ohne Token kein Zugriff', async () => {
  assert.equal((await call('GET', '/api/today')).status, 401);
  assert.equal((await call('GET', '/api/state', null, 'quatsch')).status, 401);
});

test('Einladung → Freundin registriert sich mit eigenem Konto', async () => {
  const inv = await call('POST', '/api/invites', { pid: 'freundin' }, adminT);
  assert.equal(inv.status, 200); assert.match(inv.data.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal((await call('POST', '/api/register', { code: 'FALS-CH00', email: 'f@test.de', password: 'hase12345' })).status, 400);
  const r = await call('POST', '/api/register', { code: inv.data.code.toLowerCase(), name: 'Mia', email: 'f@test.de', password: 'hase12345' });
  assert.equal(r.status, 200); assert.equal(r.data.user.role, 'user'); assert.equal(r.data.user.pid, 'freundin');
  userT = r.data.token;
  // Code ist danach verbraucht
  assert.equal((await call('POST', '/api/register', { code: inv.data.code, email: 'g@test.de', password: 'hase12345' })).status, 400);
  // User darf keine Admin-Sachen
  assert.equal((await call('GET', '/api/users', null, userT)).status, 403);
  assert.equal((await call('POST', '/api/invites', {}, userT)).status, 403);
});

test('Heute: Freundin bekommt ihre skalierten Mengen, kann nicht Ilias abfragen', async () => {
  const a = await call('GET', '/api/today?date=2026-11-18&now=12:00', null, adminT);
  const f = await call('GET', '/api/today?date=2026-11-18&now=12:00&pid=ilias', null, userT);
  assert.equal(a.status, 200); assert.equal(f.status, 200);
  assert.equal(a.data.person.id, 'ilias'); assert.equal(f.data.person.id, 'freundin');
  assert.equal(f.data.person.name, 'Mia');
  assert.equal(a.data.meals.length, 4);
  assert.ok(f.data.planned.kcal < a.data.planned.kcal, 'Freundin isst weniger');
  assert.ok(Math.abs(a.data.planned.kcal - a.data.targets.kcal) / a.data.targets.kcal < 0.15, 'Ilias nah am Ziel');
  assert.equal(a.data.next.slot, 'mittag');
  assert.equal(a.data.eaten.kcal, 0);
  assert.equal(a.data.lowest.length, 3);
  // Admin darf sie ansehen
  const af = await call('GET', '/api/today?date=2026-11-18&pid=freundin', null, adminT);
  assert.equal(af.data.person.id, 'freundin');
});

test('Mahlzeit abhaken zählt als gegessen (mit ihren Mengen)', async () => {
  const before = await call('GET', '/api/today?date=2026-11-18&now=14:00', null, userT);
  const mittag = before.data.meals.find((m) => m.slot === 'mittag');
  assert.equal((await call('POST', '/api/meal', { date: '2026-11-18', slot: 'mittag', done: true, time: '13:10' }, userT)).status, 200);
  const after = await call('GET', '/api/today?date=2026-11-18&now=14:00', null, userT);
  assert.equal(after.data.eaten.kcal, mittag.kcal);
  assert.equal(after.data.meals.find((m) => m.slot === 'mittag').done, true);
  assert.notEqual(after.data.next.slot, 'mittag');
  // Ilias' Tag bleibt unberührt
  const il = await call('GET', '/api/today?date=2026-11-18', null, adminT);
  assert.equal(il.data.eaten.kcal, 0);
  assert.equal((await call('POST', '/api/meal', { date: '2026-11-18', slot: 'quatsch', done: true }, userT)).status, 400);
});

test('Gewicht, Wasser, Einkauf', async () => {
  assert.equal((await call('POST', '/api/weight', { date: '2026-11-18', kg: 500 }, adminT)).status, 400);
  assert.equal((await call('POST', '/api/weight', { date: '2026-11-18', kg: 83.4 }, adminT)).status, 200);
  const t = await call('GET', '/api/today?date=2026-11-18', null, adminT);
  assert.equal(t.data.weight.latest.kg, 83.4);
  const w = await call('POST', '/api/water', { date: '2026-11-18', deltaMl: 500 }, adminT);
  assert.equal(w.data.water, 500);
  const s = await call('GET', '/api/shopping', null, userT);
  assert.ok(s.data.groups.length > 0 && s.data.weekCzk > 0);
  const id = s.data.groups[0].items[0].foodId;
  await call('POST', '/api/shopping/check', { foodId: id, checked: true }, userT);
  const s2 = await call('GET', '/api/shopping', null, adminT);
  assert.equal(s2.data.groups[0].items[0].checked, true);
});

test('Web-Zustand: User sieht nur eigene Logs, darf Plan nicht ändern', async () => {
  const u = await call('GET', '/api/state', null, userT);
  assert.deepEqual(Object.keys(u.data.state.logs), ['freundin']);
  assert.equal(u.data.me.role, 'user');
  const a = await call('GET', '/api/state', null, adminT);
  assert.ok(a.data.state.logs.ilias && a.data.state.logs.freundin);
  assert.equal((await call('PUT', '/api/state/plan', { data: { plan: a.data.state.plan } }, userT)).status, 403);
  // Veralteter Stand wird abgelehnt (Handy hat inzwischen geändert)
  const conflict = await call('PUT', '/api/state/logs', { base: 1, data: { logs: { ilias: {} } } }, adminT);
  assert.equal(conflict.status, 409);
  const ok = await call('PUT', '/api/state/plan', { base: a.data.state.updated.plan, data: { plan: a.data.state.plan } }, adminT);
  assert.equal(ok.status, 200);
});

test('Daten überleben einen Neustart', async () => {
  await server.store.queue;
  const s2 = createServer({ dataDir: dir });
  assert.equal(s2.store.db.users.length, 2);
  assert.equal(s2.store.db.state.weights.ilias[0].kg, 83.4);
});
