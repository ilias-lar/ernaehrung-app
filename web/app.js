/* Ernährungs-Dashboard – UI (Vanilla JS, keine Abhängigkeiten) */
(function () {
  'use strict';
  const D = window.NData, C = window.NCalc;
  const LS_KEY = 'ernaehrung-dashboard-v1';
  const DOCS = ['settings', 'plan', 'recipes', 'logs'];

  // ---------- Helfer ----------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d) => C.isNum(n) ? n.toLocaleString('de-DE', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }) : '–';
  const fmtAuto = (n) => !C.isNum(n) ? '–' : Math.abs(n) >= 100 ? fmt(n, 0) : Math.abs(n) >= 10 ? fmt(n, 1) : fmt(n, 2);
  const parseNum = (v) => { const x = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isFinite(x) ? x : NaN; };
  const rid = () => Math.random().toString(36).slice(2, 10);
  const todayIso = () => C.isoDate(new Date());
  const dateLabel = (iso, opts) => new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', opts || { weekday: 'long', day: 'numeric', month: 'long' });
  const sumBy = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

  // ---------- Zustand ----------
  const ROHLIK_DEFAULT = { wishes: '', review: false, applyPrices: true, applyNutrition: true, last: null, sources: {} };
  function defaultState() {
    return {
      settings: Object.assign(clone(D.DEFAULT_SETTINGS), { priceOverrides: {}, foodOverrides: {}, favorites: [], checks: {}, rohlik: clone(ROHLIK_DEFAULT) }),
      weights: { ilias: [], freundin: [] }, persons: clone(D.DEFAULT_PERSONS), active: 'ilias',
      plan: clone(D.DEFAULT_PLAN), recipes: {}, logs: { ilias: {}, freundin: {} },
      updated: { settings: 0, plan: 0, recipes: 0, logs: 0 },
    };
  }
  function mergeSettings(s) {
    const d = defaultState().settings; s = s || {};
    return Object.assign(d, s, {
      profile: Object.assign(d.profile, s.profile), targets: Object.assign(d.targets, s.targets),
      currency: Object.assign(d.currency, s.currency), prefs: Object.assign(d.prefs, s.prefs),
      priceOverrides: s.priceOverrides || {}, foodOverrides: s.foodOverrides || {}, favorites: s.favorites || [], checks: s.checks || {},
      rohlik: Object.assign(clone(ROHLIK_DEFAULT), s.rohlik || {}),
    });
  }
  function mergePersons(ps, legacySettings) {
    const d = clone(D.DEFAULT_PERSONS); ps = ps || {};
    Object.keys(d).forEach((k) => {
      const x = ps[k] || {};
      d[k] = Object.assign(d[k], x, { profile: Object.assign(d[k].profile, x.profile), targets: Object.assign(d[k].targets, x.targets) });
    });
    if (!ps.ilias && legacySettings && legacySettings.profile) { // Daten aus der Ein-Personen-Version übernehmen
      Object.assign(d.ilias.profile, legacySettings.profile); Object.assign(d.ilias.targets, legacySettings.targets || {});
    }
    return d;
  }
  const isDateMap = (o) => o && Object.keys(o).some((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  function mergeLogs(l) {
    if (!l) return { ilias: {}, freundin: {} };
    if (isDateMap(l)) return { ilias: l, freundin: {} };
    return { ilias: l.ilias || {}, freundin: l.freundin || {} };
  }
  function mergeWeights(w) {
    if (Array.isArray(w)) return { ilias: w, freundin: [] };
    return { ilias: (w && w.ilias) || [], freundin: (w && w.freundin) || [] };
  }
  let state = defaultState();
  const P = () => state.persons[state.active];
  const W = () => state.weights[state.active];
  const L = () => state.logs[state.active];
  const REFS = () => (P().sex === 'w' ? D.REFERENCES_F : D.REFERENCES);
  const ui = { view: 'uebersicht', date: todayIso(), mode: 'geplant', period: 'tag', planDay: C.weekdayIndex(todayIso()),
    nutrPeriod: 'woche', nutrFilter: 'alle', recipeFilter: 'alle', modal: null, sync: 'local', addSlot: 'snack' };
  let FOODS = {}, RECIPES = [], RBYID = {}, TARGETS = {};

  function derive() {
    const base = D.buildFoods();
    Object.entries(state.settings.foodOverrides || {}).forEach(([id, ov]) => { if (base[id]) Object.assign(base[id].n, ov); });
    FOODS = base;
    RECIPES = D.RECIPES.map((r) => state.recipes[r.id] ? Object.assign({}, r, state.recipes[r.id], { edited: true }) : r);
    RBYID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
    TARGETS = C.deriveTargets(P().targets);
    document.body.dataset.person = state.active === 'freundin' ? 'freundin' : 'ilias';
  }

  // ---------- Speicherung (eigener Server) ----------
  let ME = null; // { name, role, pid }
  const isAdmin = () => !ME || ME.role === 'admin';
  const base = { settings: 0, plan: 0, recipes: 0, logs: 0 }; // Stand, auf dem die lokalen Änderungen beruhen
  const dirty = new Set(); const inflight = {}; let saveTimer = null; let connected = false;
  function payload(n) {
    if (n === 'settings') return { settings: state.settings, weights: state.weights, persons: state.persons, active: state.active };
    if (n === 'plan') return { plan: state.plan };
    if (n === 'recipes') return { recipes: state.recipes };
    return { logs: state.logs };
  }
  function applyDoc(n, p) {
    if (!p) return;
    if (n === 'settings') {
      const legacy = p.settings; const keepActive = state.active;
      if (p.settings) state.settings = mergeSettings(p.settings);
      if (p.weights) state.weights = Object.assign(mergeWeights(state.weights), p.weights);
      if (p.persons) state.persons = mergePersons(p.persons, legacy);
      state.active = p.active && state.persons[p.active] ? p.active : keepActive;
    }
    else if (n === 'plan' && Array.isArray(p.plan) && p.plan.length === 7) state.plan = p.plan;
    else if (n === 'recipes') state.recipes = p.recipes || {};
    else if (n === 'logs') state.logs = Object.assign(mergeLogs(state.logs), p.logs || {});
  }
  const lsKey = () => LS_KEY + (ME ? '-' + ME.id : '');
  function saveLocal() { try { localStorage.setItem(lsKey(), JSON.stringify({ state, base })); } catch (e) { /* kein Speicher verfügbar */ } }
  function loadLocal() {
    try {
      const raw = localStorage.getItem(lsKey()); if (!raw) return;
      const p = JSON.parse(raw); const st = p.state || p;
      DOCS.forEach((n) => applyDoc(n, st));
      if (p.base) Object.assign(base, p.base);
    } catch (e) { /* ignorieren */ }
  }
  function commit(...names) {
    names.forEach((n) => { state.updated[n] = Date.now(); dirty.add(n); });
    derive(); render();
    clearTimeout(saveTimer); saveTimer = setTimeout(flush, 700);
  }
  /** Server-Zustand übernehmen (nur Dokumente ohne eigene ungespeicherte Änderungen). */
  function applyServer(st, force) {
    let changed = false;
    DOCS.forEach((n) => {
      const u = (st.updated || {})[n] || 0;
      if (force || (!dirty.has(n) && !inflight[n] && u > base[n])) {
        const active = state.active;
        applyDoc(n, n === 'settings' ? { settings: st.settings, weights: st.weights, persons: st.persons } : st);
        state.active = active; base[n] = u; changed = true;
      }
    });
    if (ME && !isAdmin()) state.active = ME.pid;
    return changed;
  }
  async function flush() {
    saveLocal();
    if (!connected) return;
    const names = [...dirty]; dirty.clear();
    for (const n of names) {
      if (inflight[n]) { dirty.add(n); continue; }
      inflight[n] = true;
      try {
        const r = await API.call('PUT', '/api/state/' + n, { base: base[n], data: payload(n) });
        if (r.ok) { base[n] = r.data.updated; setSync('cloud'); }
        else if (r.status === 409) {
          inflight[n] = false;
          applyServer(r.data.state, true); derive(); render(); saveLocal();
          toast('Wurde inzwischen in der App geändert – neu geladen');
        } else if (r.status === 403) { toast(r.data.error || 'Keine Berechtigung'); refresh(true); }
        else { dirty.add(n); setSync('error'); }
      } catch (e) { dirty.add(n); setSync('error'); }
      finally { inflight[n] = false; }
    }
    saveLocal();
    if (dirty.size) { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 3000); }
  }
  function setSync(s) { ui.sync = s; const el = document.getElementById('sync'); if (el) { el.dataset.s = s; el.querySelector('span').textContent = SYNC_LABEL[s]; } }
  const SYNC_LABEL = { local: 'Offline – lokal gesichert', cloud: 'Gespeichert · synchron mit der App', error: 'Server nicht erreichbar – lokal gesichert', slow: 'Verbinde mit dem Server …' };

  async function refresh(force) {
    try {
      const r = await API.call('GET', '/api/state');
      if (!r.ok) return setSync('error');
      const first = !ME; ME = r.data.me;
      if (first) loadLocal();
      if (applyServer(r.data.state, force || first)) { derive(); render(); saveLocal(); }
      else if (first) { derive(); render(); }
      connected = true; setSync('cloud');
      if (dirty.size) flush();
    } catch (e) { setSync('error'); }
  }
  async function connectDb() {
    if (!API.token()) { location.href = '/login.html'; return; }
    setSync('slow');
    await refresh(false);
    setInterval(() => { if (document.visibilityState === 'visible') refresh(false); }, 30000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(false); });
  }

  // ---------- Datenzugriff ----------
  function plannedSlotsBase(dayIdx) {
    const day = state.plan[dayIdx] || {}; const out = {};
    D.SLOTS.forEach((s) => { out[s.id] = C.entryIngredients(day[s.id], RBYID); });
    return out;
  }
  /** Skalierungsfaktor einer Person für einen Tag (Basisplan → eigene Kalorien). */
  function personFactor(dayIdx, pid) {
    const person = state.persons[pid || state.active];
    if (!person.autoScale) return 1;
    const base = C.sumNutrients([].concat(...Object.values(plannedSlotsBase(dayIdx))), FOODS, ['kcal']).totals.kcal;
    return C.dayScaleFactor(base, person.targets.kcal);
  }
  function plannedSlots(dayIdx, pid) {
    const base = plannedSlotsBase(dayIdx); const f = personFactor(dayIdx, pid);
    if (f === 1) return base;
    const out = {};
    Object.keys(base).forEach((k) => {
      out[k] = C.scaleIngredients(base[k], f, FOODS).map((i) => {
        const fd = FOODS[i.foodId];
        if (fd && fd.unit === 'stueck') return Object.assign(i, { preparation: Math.round(i.grams / fd.gramsPerPiece) + ' Stück' });
        if (/Stück|Frucht|Handvoll|Scheibe|Zehe|Wraps|Zitrone/.test(i.preparation || '')) return Object.assign(i, { preparation: '' });
        return i;
      });
    });
    return out;
  }
  const plannedDay = (i, pid) => [].concat(...Object.values(plannedSlots(i, pid)));
  const logOf = (iso) => L()[iso];
  const loggedDay = (iso) => { const l = logOf(iso); return l ? [].concat(...l.meals.map((m) => m.ingredients)) : []; };
  const dayIngs = (iso, mode) => mode === 'geplant' ? plannedDay(C.weekdayIndex(iso)) : loggedDay(iso);
  function periodResult(iso, mode, period) {
    if (period === 'tag') { const ings = dayIngs(iso, mode); const r = C.sumNutrients(ings, FOODS); r.days = r.grams > 0 ? 1 : 0; r.ings = ings; r.lists = [ings]; return r; }
    const lists = C.weekDates(iso).map((d) => dayIngs(d, mode));
    const r = C.meanOverDays(lists, FOODS); r.ings = [].concat(...lists); r.lists = lists; return r;
  }
  function entryName(entry) { const r = entry && RBYID[entry.recipeId]; return r ? r.name : 'Unbekanntes Rezept'; }
  const sc = () => state.settings.scenario;
  const costIngs = (ings) => C.costOf(ings, FOODS, sc(), state.settings.priceOverrides).czk;
  function money(czk, d) {
    if (!C.isNum(czk)) return '–';
    const s = fmt(czk, d === undefined ? 0 : d) + ' Kč';
    if (!state.settings.currency.showEur) return s;
    return s + ' <span class="sub">≈ ' + fmt(C.czkToEur(czk, state.settings.currency.rate), 2) + ' €</span>';
  }
  const moneyPlain = (czk) => fmt(czk, 0) + ' Kč' + (state.settings.currency.showEur ? ' (≈ ' + fmt(C.czkToEur(czk, state.settings.currency.rate), 2) + ' €)' : '');

  // ---------- Status ----------
  const STATUS = {
    'im-ziel': ['good', 'Im Ziel'], ueber: ['warn', 'Über Ziel'], unter: ['warn', 'Unter Ziel'],
    erreicht: ['good', 'Erreicht'], nah: ['near', 'Fast erreicht'], niedrig: ['warn', 'Näher prüfen'],
    unvollstaendig: ['partial', 'Daten unvollständig'], 'nicht-bestimmbar': ['none', 'Nicht bestimmbar'], 'keine-daten': ['none', 'Keine Daten'],
    'im-rahmen': ['good', 'Unter Obergrenze'], 'ueber-max': ['warn', 'Über Obergrenze'],
  };
  function macroStatus(key, val, target) {
    const pct = C.percentOf(val, target);
    if (pct === null) return { status: 'keine-daten', pct };
    if (key === 'fiber') return { status: pct >= 100 ? 'erreicht' : pct >= 70 ? 'nah' : 'niedrig', pct };
    return { status: pct > 110 ? 'ueber' : pct < 90 ? 'unter' : 'im-ziel', pct };
  }
  const pill = (status) => { const [s, l] = STATUS[status] || ['none', status]; return '<span class="pill" data-s="' + s + '">' + l + '</span>'; };
  const barHtml = (pct, status) => '<div class="bar" data-s="' + (STATUS[status] ? STATUS[status][0] : 'none') + '"><i style="width:' + C.barWidth(pct) + '%"></i></div>';

  // ---------- Icons ----------
  const ICON = {
    uebersicht: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    wochenplan: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    naehrstoffe: '<path d="M4 6h10M4 12h16M4 18h7"/>',
    einkauf: '<path d="M3 4h2l2.4 11h11l2-8H6.2"/><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>',
    rezepte: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
    fortschritt: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    einstellungen: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    left: '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  const icon = (k) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[k] + '</svg>';
  const VIEWS = [['uebersicht', 'Übersicht'], ['wochenplan', 'Wochenplan'], ['naehrstoffe', 'Nährstoffe'], ['einkauf', 'Einkauf & Budget'], ['rezepte', 'Rezepte'], ['fortschritt', 'Fortschritt'], ['einstellungen', 'Einstellungen']];

  // ---------- Grafiken ----------
  function plateSvg(ings, size) {
    size = size || 64;
    const g = { protein: 0, carb: 0, veg: 0, fat: 0 };
    ings.forEach((i) => {
      const f = FOODS[i.foodId]; if (!f) return;
      const c = f.category;
      const k = (c === 'fleisch' || c === 'fisch' || c === 'ei' || c === 'milch') ? 'protein' : (c === 'beilage' || c === 'brot') ? 'carb' : (c === 'oel' || c === 'nuesse') ? 'fat' : 'veg';
      g[k] += i.grams;
    });
    const total = g.protein + g.carb + g.veg + g.fat;
    const cx = size / 2, r = size * 0.34;
    let a0 = -Math.PI / 2, paths = '';
    const col = { protein: 'var(--plate-protein)', carb: 'var(--plate-carb)', veg: 'var(--plate-veg)', fat: 'var(--plate-fat)' };
    if (total > 0) ['protein', 'carb', 'veg', 'fat'].forEach((k) => {
      if (!g[k]) return;
      const a1 = a0 + g[k] / total * Math.PI * 2;
      if (g[k] === total) { paths += '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="' + col[k] + '"/>'; }
      else {
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const p = (a) => (cx + r * Math.cos(a)).toFixed(2) + ' ' + (cx + r * Math.sin(a)).toFixed(2);
        paths += '<path d="M' + cx + ' ' + cx + ' L' + p(a0) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p(a1) + ' Z" fill="' + col[k] + '" stroke="#262522" stroke-width="1.6"/>';
      }
      a0 = a1;
    });
    const label = 'Teller: ' + ['protein', 'carb', 'veg', 'fat'].filter((k) => g[k]).map((k) => ({ protein: 'Protein', carb: 'Beilage', veg: 'Gemüse/Obst', fat: 'Öl/Nüsse' }[k]) + ' ' + fmt(g[k]) + ' g').join(', ');
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + esc(label) + '" data-tip="' + esc(label) + '">' +
      '<circle cx="' + cx + '" cy="' + cx + '" r="' + (size / 2 - 1) + '" fill="#262522" stroke="rgba(255,255,255,.1)"/>' +
      '<circle cx="' + cx + '" cy="' + cx + '" r="' + (size * 0.4) + '" fill="none" stroke="rgba(255,255,255,.06)"/>' + paths + '</svg>';
  }

  function ringSvg(t) {
    const parts = [
      { k: 'protein', label: 'Protein', kcal: (t.protein || 0) * 4, g: t.protein, color: 'var(--series-1)' },
      { k: 'carbs', label: 'Kohlenhydrate', kcal: (t.carbs || 0) * 4, g: t.carbs, color: 'var(--series-2)' },
      { k: 'fat', label: 'Fett', kcal: (t.fat || 0) * 9, g: t.fat, color: 'var(--series-3)' },
    ];
    const sum = sumBy(parts, (p) => p.kcal);
    const S = 170, R = 66, W = 16, circ = 2 * Math.PI * R; let off = 0, segs = '';
    const gap = sum > 0 ? 3 : 0;
    parts.forEach((p) => {
      const len = sum > 0 ? p.kcal / sum * circ : 0;
      if (len > gap) segs += '<circle cx="85" cy="85" r="' + R + '" fill="none" stroke="' + p.color + '" stroke-width="' + W + '" stroke-dasharray="' + (len - gap).toFixed(2) + ' ' + (circ - len + gap).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 85 85)" data-tip="' + esc(p.label + ': ' + fmt(p.g) + ' g × ' + (p.k === 'fat' ? 9 : 4) + ' kcal = ' + fmt(p.kcal) + ' kcal (' + fmt(p.kcal / sum * 100) + ' %)') + '"/>';
      off += len;
    });
    const svg = '<svg width="' + S + '" height="' + S + '" viewBox="0 0 ' + S + ' ' + S + '" role="img" aria-label="Kalorienverteilung nach Makronährstoffen">' +
      '<circle cx="85" cy="85" r="' + R + '" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="' + W + '"/>' + segs +
      '<text x="85" y="82" text-anchor="middle" fill="var(--ink)" style="font:600 26px var(--font-display)">' + fmt(sum) + '</text>' +
      '<text x="85" y="102" text-anchor="middle" fill="var(--muted)" style="font:500 11.5px var(--font-body)">kcal aus Makros</text></svg>';
    const legend = parts.map((p) => '<div class="legend-row"><i style="background:' + p.color + '"></i><span>' + p.label + '</span><b>' + fmt(p.g) + ' g · ' + (sum ? fmt(p.kcal / sum * 100) : '–') + ' %</b></div>').join('');
    return '<div class="ring-wrap">' + svg + '<div class="legend">' + legend + '<div class="sub">Atwater-Faktoren 4 / 4 / 9 kcal pro g. Ballaststoffe und Rundung erklären kleine Abweichungen zur Gesamtenergie.</div></div></div>';
  }

  function barChart(values, labels, target, unit, highlight, tipLabels) {
    const W = 360, H = 160, L = 38, B = 24, T = 14, plotH = H - B - T, plotW = W - L - 6;
    const vmax = Math.max(target * 1.15, ...values.filter(C.isNum).map((v) => v * 1.05), 1);
    const y = (v) => T + plotH - v / vmax * plotH;
    const slot = plotW / values.length, bw = Math.min(26, slot * 0.58);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Balkendiagramm ' + esc(unit) + ' pro Tag">';
    s += '<line x1="' + L + '" x2="' + (W - 4) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="#383835"/>';
    s += '<line x1="' + L + '" x2="' + (W - 4) + '" y1="' + y(target) + '" y2="' + y(target) + '" stroke="var(--ink-2)" stroke-dasharray="4 4" stroke-width="1"/>';
    s += '<text x="' + (L - 6) + '" y="' + (y(target) + 4) + '" text-anchor="end">' + fmt(target) + '</text><text x="' + (L - 6) + '" y="' + (y(0) + 4) + '" text-anchor="end">0</text>';
    values.forEach((v, i) => {
      const x = L + slot * i + (slot - bw) / 2;
      if (C.isNum(v) && v > 0) {
        const top = y(v), h = y(0) - top, r = Math.min(4, h);
        const st = Math.abs(v - target) / target <= 0.1 ? 'var(--series-1)' : '#2a5f9f';
        s += '<path d="M' + x + ' ' + y(0) + ' V' + (top + r) + ' Q' + x + ' ' + top + ' ' + (x + r) + ' ' + top + ' H' + (x + bw - r) + ' Q' + (x + bw) + ' ' + top + ' ' + (x + bw) + ' ' + (top + r) + ' V' + y(0) + ' Z" fill="' + st + '"' + (i === highlight ? ' stroke="var(--ink)" stroke-width="1.5"' : '') + '/>';
      }
      s += '<rect x="' + (L + slot * i) + '" y="' + T + '" width="' + slot + '" height="' + (plotH + B) + '" fill="transparent" data-tip="' + esc(tipLabels[i] + ': ' + (C.isNum(v) && v > 0 ? fmt(v) + ' ' + unit + ' (' + fmt(v / target * 100) + ' % vom Ziel)' : 'keine Daten')) + '"/>';
      s += '<text x="' + (L + slot * i + slot / 2) + '" y="' + (H - 6) + '" text-anchor="middle"' + (i === highlight ? ' style="fill:var(--ink);font-weight:700"' : '') + '>' + labels[i] + '</text>';
    });
    return s + '</svg>';
  }

  // ---------- Bausteine ----------
  function hero(title, sub, controls) {
    return '<section class="hero"><div><div class="eyebrow">' + ({ aufbau: 'Muskelaufbau &amp; Gesundheit', halten: 'Fit &amp; gesund', abnehmen: 'Leicht &amp; gesund' })[P().goal] + ' · ' + esc(P().name) + '</div><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div><div class="controls">' + (controls || '') + '</div></section>';
  }
  const seg = (act, options, current) => '<div class="seg" role="group">' + options.map(([v, l]) => '<button data-act="' + act + '" data-v="' + v + '" aria-pressed="' + (v === current) + '">' + l + '</button>').join('') + '</div>';
  const dateNav = () => '<div class="datenav"><button class="icon-btn" data-act="date-step" data-v="-1" aria-label="Vorheriger Tag">' + icon('left') + '</button><input type="date" id="date-input" data-change="date" value="' + ui.date + '" aria-label="Datum"><button class="icon-btn" data-act="date-step" data-v="1" aria-label="Nächster Tag">' + icon('right') + '</button>' + (ui.date !== todayIso() ? '<button class="btn small ghost" data-act="date-today">Heute</button>' : '') + '</div>';

  function macroLine(t) {
    return '<div class="macros"><span><b>' + fmt(t.kcal) + '</b> kcal</span><span>P <b>' + fmt(t.protein) + '</b> g</span><span>KH <b>' + fmt(t.carbs) + '</b> g</span><span>F <b>' + fmt(t.fat) + '</b> g</span><span>Bal <b>' + fmt(t.fiber, 0) + '</b> g</span></div>';
  }

  function kpiCards(res, periodWord) {
    const t = res.totals;
    const tg = TARGETS;
    const cards = [
      ['kcal', 'Kalorien', 'kcal', tg.kcal, 'Ziel ' + fmt(tg.kcal) + ' kcal (Startwert, nach 2–3 Wochen Gewichtstrend anpassen)'],
      ['protein', 'Protein', 'g', tg.protein, 'Ziel ' + fmt(tg.protein) + ' g (≈ ' + fmt(tg.protein / P().profile.weightKg, 1) + ' g pro kg Körpergewicht)'],
      ['carbs', 'Kohlenhydrate', 'g', tg.carbs, 'Ziel als Rest: (' + fmt(tg.kcal) + ' − ' + fmt(tg.protein) + '×4 − ' + fmt(tg.fat) + '×9) / 4 = ' + fmt(tg.carbs, 1) + ' g'],
      ['fat', 'Fett', 'g', tg.fat, 'Ziel ' + fmt(tg.fat) + ' g (≈ ' + fmt(tg.fat * 9 / tg.kcal * 100) + ' % der Energie)'],
      ['fiber', 'Ballaststoffe', 'g', tg.fiber, 'DGE-Richtwert ' + fmt(tg.fiber) + ' g'],
    ];
    return '<div class="grid kpis">' + cards.map(([k, label, unit, target, tip]) => {
      const v = t[k];
      const ms = macroStatus(k, v, target);
      const diff = C.isNum(v) ? v - target : null;
      const diffTxt = diff === null || res.days === 0 ? 'keine Daten' : (diff >= 0 ? '+' : '−') + fmt(Math.abs(diff)) + ' ' + unit + ' zum Ziel';
      const calc = 'Berechnung: Summe über ' + (res.ings ? res.ings.length : 0) + ' Zutaten, Menge × Wert pro 100 g / 100' + (periodWord === 'woche' ? ', geteilt durch ' + res.days + ' Tag(e) mit Daten' : '') + '.\n' + tip;
      return '<div class="card kpi"><div class="label"><span>' + label + '</span>' + (res.days ? pill(ms.status) : '') + '</div>' +
        '<div class="big" data-tip="' + esc(calc) + '">' + (res.days ? fmt(v) : '–') + '<small>' + unit + '</small></div>' +
        '<div class="of">von ' + fmt(target) + ' ' + unit + (periodWord === 'woche' ? ' · Ø pro Tag' : '') + '</div>' +
        barHtml(res.days ? ms.pct : null, res.days ? ms.status : 'keine-daten') +
        '<div class="foot"><span class="sub">' + diffTxt + '</span><span class="num sub">' + (res.days && C.isNum(ms.pct) ? fmt(ms.pct) + ' %' : '') + '</span></div></div>';
    }).join('') + '</div>';
  }

  function foodOptions(selected) {
    const byCat = {};
    Object.values(FOODS).forEach((f) => { (byCat[f.category] = byCat[f.category] || []).push(f); });
    return Object.keys(D.CATEGORIES).filter((c) => byCat[c]).map((c) => '<optgroup label="' + D.CATEGORIES[c] + '">' + byCat[c].sort((a, b) => a.name.localeCompare(b.name, 'de')).map((f) => '<option value="' + f.id + '"' + (f.id === selected ? ' selected' : '') + '>' + esc(f.name) + '</option>').join('') + '</optgroup>').join('');
  }
  const foodName = (id) => FOODS[id] ? FOODS[id].name : id;
  const slotLabel = (id) => (D.SLOTS.find((s) => s.id === id) || { label: id }).label;

  // ---------- Ansicht: Übersicht ----------
  function viewOverview() {
    const wd = C.weekdayIndex(ui.date);
    const res = periodResult(ui.date, ui.mode, ui.period);
    const isWeek = ui.period === 'woche';
    const days = Math.max(1, res.days);
    const fv = C.fruitVegGrams(res.ings, FOODS) / days;
    const cost = costIngs(res.ings) / days;
    const score = C.nutrientScore(res, REFS(), TARGETS, D.NUTRIENTS);
    const wdates = C.weekDates(ui.date);
    const modeWord = ui.mode === 'geplant' ? 'Geplant laut Wochenplan' : 'Tatsächlich gegessen (Tagebuch)';
    const sub = (isWeek ? 'Woche ' + dateLabel(wdates[0], { day: 'numeric', month: 'short' }) + ' – ' + dateLabel(wdates[6], { day: 'numeric', month: 'short' }) + ' · Ø pro Tag' : dateLabel(ui.date)) + ' · ' + modeWord;
    let h = hero('Übersicht', esc(sub), dateNav() + seg('period', [['tag', 'Tag'], ['woche', 'Woche']], ui.period) + seg('mode', [['geplant', 'Geplant'], ['gegessen', 'Gegessen']], ui.mode));

    if (ui.mode === 'gegessen' && res.days === 0) h += '<div class="note info" style="margin-bottom:14px">Für ' + (isWeek ? 'diese Woche' : 'diesen Tag') + ' ist noch nichts geloggt. Unten im Tagebuch kannst du die geplanten Mahlzeiten mit einem Klick als gegessen übernehmen.</div>';
    h += kpiCards(res, ui.period);

    // Makros + Kennzahlen
    const fvSt = fv >= TARGETS.fruitVeg ? 'erreicht' : fv >= TARGETS.fruitVeg * 0.7 ? 'nah' : 'niedrig';
    h += '<div class="grid two section"><div class="stack"><div class="card"><div class="card-head"><h2>Kalorien nach Makros</h2><span class="sub">' + (isWeek ? 'Ø pro Tag' : 'Tag') + '</span></div>' + (res.days ? ringSvg(res.totals) : '<div class="empty">Keine Daten</div>') + '</div>';
    h += '<div class="grid three">' +
      '<div class="card kpi"><div class="label"><span>Obst &amp; Gemüse</span></div><div class="big" data-tip="' + esc('Summe aller Zutaten der Kategorien Obst und Gemüse (roh gewogen). Kartoffeln, Knoblauch und Zitronensaft zählen nicht.\nMindestziel ' + fmt(TARGETS.fruitVeg) + ' g, gern 600–800 g.') + '">' + (res.days ? fmt(fv) : '–') + '<small>g</small></div><div class="of">Ziel mind. ' + fmt(TARGETS.fruitVeg) + ' g</div>' + barHtml(res.days ? fv / TARGETS.fruitVeg * 100 : null, res.days ? fvSt : 'keine-daten') + '</div>' +
      '<div class="card kpi"><div class="label"><span>Nährstoff-Score</span><span class="demo-badge" data-tip="Nährwerte sind Demo-/Richtwerte (an USDA angelehnt, nicht einzeln geprüft).">DEMO</span></div><div class="big" data-tip="' + esc('Methode: Mittelwert aus min(100, % der Referenz) über alle Vitamine und Mineralstoffe mit mindestens 90 % Datenabdeckung. Ohne Natrium (Obergrenze) und Jod (zu unsicher). Referenzwerte sind Durchschnittswerte über längere Zeit.') + '">' + (score.score === null ? '–' : fmt(score.score)) + '<small>/ 100</small></div><div class="of">aus ' + score.used + ' von ' + score.of + ' Nährstoffen</div>' + barHtml(score.score, score.score === null ? 'keine-daten' : score.score >= 90 ? 'erreicht' : score.score >= 70 ? 'nah' : 'niedrig') + '</div>' +
      '<div class="card kpi"><div class="label"><span>Kosten</span><span class="sub">' + ({ gut: 'Gut', premium: 'Premium', luxus: 'Luxus' })[sc()] + '</span></div><div class="big" data-tip="' + esc('Verbrauchte Mengen × deine Preisliste (CZK/kg Einkaufsgewicht, Schale/Knochen berücksichtigt). Keine Live-Preise, keine Packungsgrößen.') + '">' + (res.days ? fmt(cost) : '–') + '<small>Kč</small></div><div class="of">' + (isWeek ? 'Ø pro Tag' : 'pro Tag') + (state.settings.currency.showEur && res.days ? ' · ≈ ' + fmt(C.czkToEur(cost, state.settings.currency.rate), 2) + ' €' : '') + '</div><div class="foot"><span class="sub">Monat ≈ ' + (res.days ? fmt(C.monthlyFromWeekly(cost * 7)) + ' Kč' : '–') + '</span></div></div>' +
      '</div></div>';

    // Mahlzeiten des Tages
    const slots = plannedSlots(wd);
    const log = logOf(ui.date);
    h += '<div class="card"><div class="card-head"><h2>Mahlzeiten ' + (ui.date === todayIso() ? 'heute' : 'am ' + dateLabel(ui.date, { weekday: 'short', day: 'numeric', month: 'short' })) + '</h2><button class="btn small ghost" data-act="goto-plan" data-v="' + wd + '">Im Wochenplan öffnen</button></div>';
    D.SLOTS.forEach((s) => {
      const ings = slots[s.id]; const t = C.sumNutrients(ings, FOODS, C.MACRO_KEYS).totals;
      const logged = log && log.meals.find((m) => m.slot === s.id && m.fromPlan);
      h += '<div class="meal-row">' + plateSvg(ings, 52) + '<div><div class="slot">' + s.label + '</div><div class="name">' + esc(entryName(state.plan[wd][s.id])) + '</div>' + macroLine(t) + '</div><div>' +
        (logged ? '<button class="btn small on" data-act="unlog" data-id="' + logged.id + '" data-tip="Klicken, um den Eintrag wieder zu entfernen">✓ Gegessen</button>' : '<button class="btn small" data-act="log-slot" data-v="' + s.id + '">Als gegessen</button>') + '</div></div>';
    });
    h += '</div></div>';

    // Woche
    const wkLists = wdates.map((d) => dayIngs(d, ui.mode));
    const wkTot = wkLists.map((l) => l.length ? C.sumNutrients(l, FOODS, C.MACRO_KEYS).totals : { kcal: null, protein: null });
    const tips = wdates.map((d) => dateLabel(d, { weekday: 'short', day: 'numeric', month: 'numeric' }));
    h += '<div class="card section"><div class="card-head"><h2>Woche im Blick</h2><span class="sub">' + modeWord + ' · gestrichelt = Ziel · hell = innerhalb ±10 %</span></div><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">' +
      '<div class="chart"><h3 style="margin-bottom:6px">Kalorien pro Tag</h3>' + barChart(wkTot.map((t) => t.kcal), D.DAYS_SHORT, TARGETS.kcal, 'kcal', wd, tips) + '</div>' +
      '<div class="chart"><h3 style="margin-bottom:6px">Protein pro Tag</h3>' + barChart(wkTot.map((t) => t.protein), D.DAYS_SHORT, TARGETS.protein, 'g', wd, tips) + '</div></div></div>';

    h += diaryCard();
    return h;
  }

  function diaryCard() {
    const log = logOf(ui.date);
    let h = '<div class="card section"><div class="card-head"><h2>Tagebuch · ' + esc(dateLabel(ui.date)) + '</h2><span class="sub">Was du wirklich gegessen hast. Mengen sind anpassbar.</span></div>';
    if (!log || !log.meals.length) h += '<div class="empty">Noch nichts geloggt. <button class="btn small primary" data-act="log-all">Geplante Mahlzeiten übernehmen</button></div>';
    else {
      log.meals.forEach((m) => {
        const t = C.sumNutrients(m.ingredients, FOODS, C.MACRO_KEYS).totals;
        h += '<details class="meal-row" style="display:block"><summary style="display:grid;grid-template-columns:52px 1fr auto;gap:12px;align-items:center;cursor:pointer;list-style:none">' + plateSvg(m.ingredients, 44) + '<div><div class="slot">' + slotLabel(m.slot) + (m.time ? ' · ' + esc(m.time) : '') + '</div><div class="name">' + esc(m.name) + '</div>' + macroLine(t) + '</div><button class="btn small ghost" data-act="unlog" data-id="' + m.id + '" aria-label="Eintrag löschen">Entfernen</button></summary>' +
          '<table class="ing-table" style="margin-top:8px">' + m.ingredients.map((i, idx) => '<tr><td>' + esc(foodName(i.foodId)) + '</td><td><input class="g-input" inputmode="decimal" data-change="log-gram" data-id="' + m.id + '" data-idx="' + idx + '" value="' + fmt(i.grams) + '" aria-label="Gramm ' + esc(foodName(i.foodId)) + '"> g</td></tr>').join('') + '</table></details>';
      });
    }
    // Freie Zutat
    h += '<div class="btn-row" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line)"><b style="font-size:13px">Freie Zutat:</b>' +
      '<select class="inp" id="add-slot" aria-label="Mahlzeit">' + D.SLOTS.map((s) => '<option value="' + s.id + '"' + (s.id === ui.addSlot ? ' selected' : '') + '>' + s.label + '</option>').join('') + '</select>' +
      '<select class="inp" id="add-food" aria-label="Lebensmittel">' + foodOptions('banane') + '</select>' +
      '<input class="g-input" id="add-grams" inputmode="decimal" value="100" aria-label="Gramm" style="width:80px"> g' +
      '<button class="btn" data-act="add-food">Hinzufügen</button></div>';
    // Getränke
    const water = log ? log.water || 0 : 0; const coffee = log ? log.coffee || [] : [];
    const known = coffee.filter((c) => C.isNum(c.mg));
    h += '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-top:14px">' +
      '<div class="card" style="background:var(--card-2)"><div class="card-head"><h3>Wasser</h3><span class="num" style="font-family:var(--font-display);font-size:20px">' + fmt(water / 1000, 2) + ' l</span></div><div class="btn-row"><button class="btn small" data-act="water" data-v="-250">− 250 ml</button><button class="btn small" data-act="water" data-v="250">+ 250 ml</button><button class="btn small" data-act="water" data-v="500">+ 500 ml</button></div></div>' +
      '<div class="card" style="background:var(--card-2)"><div class="card-head"><h3>Kaffee</h3><span class="num" style="font-family:var(--font-display);font-size:20px">' + coffee.length + ' Tasse' + (coffee.length === 1 ? '' : 'n') + '</span></div><div class="btn-row"><input class="g-input" id="caf-mg" inputmode="decimal" placeholder="mg" aria-label="Koffein in mg (optional)" style="width:70px"><button class="btn small" data-act="coffee-add">+ Tasse</button>' + (coffee.length ? '<button class="btn small ghost" data-act="coffee-remove">− Tasse</button>' : '') + '</div><div class="sub" style="margin-top:6px">Koffein nur, wenn du die Menge einträgst: ' + (known.length ? fmt(sumBy(known, (c) => c.mg)) + ' mg aus ' + known.length + ' von ' + coffee.length + ' Tassen' : 'keine Angabe') + '. Milch bitte als Zutat erfassen.</div></div></div>';
    return h + '</div>';
  }

  // ---------- Ansicht: Wochenplan ----------
  function viewPlan() {
    const d = ui.planDay;
    const dates = C.weekDates(ui.date);
    let h = hero('Wochenplan', 'Gleiche Gerichte für euch beide · Mengen von ' + esc(P().name) + (P().autoScale ? ' automatisch auf ' + fmt(P().targets.kcal) + ' kcal skaliert (×' + fmt(personFactor(ui.planDay), 2) + ' der Basis)' : ' = Basis-Rezept') + ' · roh/trocken gewogen',
      '<button class="btn primary" data-act="adjust">Portionen an Tagesziel anpassen</button><button class="btn" data-act="plan-reset-ask">Plan zurücksetzen</button>');
    h += '<div class="day-tabs" role="tablist">' + D.DAYS_SHORT.map((s, i) => {
      const t = C.sumNutrients(plannedDay(i), FOODS, C.MACRO_KEYS).totals;
      return '<button class="day-tab" data-act="plan-day" data-v="' + i + '" aria-pressed="' + (i === d) + '"><b>' + s + '</b><span>' + fmt(t.kcal) + ' kcal</span><span>' + fmt(t.protein) + ' g P</span></button>';
    }).join('') + '</div>';
    const slots = plannedSlots(d);
    const all = [].concat(...Object.values(slots));
    const res = C.sumNutrients(all, FOODS);
    res.days = 1; res.ings = all;
    h += '<div class="card" style="margin-bottom:14px"><div class="card-head"><h2>' + D.DAYS[d] + ' · Tagessumme</h2><span class="sub">Obst &amp; Gemüse ' + fmt(C.fruitVegGrams(all, FOODS)) + ' g · Kosten ' + money(costIngs(all)) + '</span></div>' +
      '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">' + [['kcal', 'Kalorien', 'kcal'], ['protein', 'Protein', 'g'], ['carbs', 'Kohlenhydrate', 'g'], ['fat', 'Fett', 'g'], ['fiber', 'Ballaststoffe', 'g']].map(([k, l, u]) => {
        const ms = macroStatus(k, res.totals[k], TARGETS[k]);
        return '<div><div class="sub" style="display:flex;justify-content:space-between"><span>' + l + '</span><span class="num">' + fmt(res.totals[k]) + ' / ' + fmt(TARGETS[k]) + ' ' + u + '</span></div>' + barHtml(ms.pct, ms.status) + '</div>';
      }).join('') + '</div>' +
      (res.totals.protein > TARGETS.protein * 1.1 || res.totals.fat > TARGETS.fat * 1.1 ? '<div class="note" style="margin-top:12px">Dieser Tag liegt ehrlich gerechnet über deinem Ziel (' + [res.totals.protein > TARGETS.protein * 1.1 ? 'Protein' : '', res.totals.fat > TARGETS.fat * 1.1 ? 'Fett' : ''].filter(Boolean).join(' und ') + '). „Portionen an Tagesziel anpassen“ macht dir einen Vorschlag und zeigt jede Änderung.</div>' : '') + '</div>';

    h += '<div class="grid plan-grid">' + D.SLOTS.map((s) => mealCard(d, s, slots[s.id], dates[d])).join('') + '</div>';
    return h;
  }

  function mealCard(d, s, ings, dateIso) {
    const entry = state.plan[d][s.id];
    const t = C.sumNutrients(ings, FOODS, C.MACRO_KEYS).totals;
    const custom = Array.isArray(entry.ingredients);
    const portions = custom ? null : entry.portions;
    return '<div class="card meal-card"><div class="meal-top">' + plateSvg(ings, 76) + '<div><div class="eyebrow">' + s.label + (custom ? ' · <span class="tag">angepasst</span>' : '') + '</div><h3 style="font-size:16px;margin:2px 0 6px">' + esc(entryName(entry)) + '</h3>' + macroLine(t) + '</div></div>' +
      '<table class="ing-table">' + ings.map((i, idx) => '<tr><td>' + esc(foodName(i.foodId)) + (i.preparation ? ' <span class="prep">· ' + esc(i.preparation) + '</span>' : '') + ' <span class="prep">(' + (FOODS[i.foodId] ? FOODS[i.foodId].basis : '') + ')</span></td><td><input class="g-input" inputmode="decimal" data-change="plan-gram" data-slot="' + s.id + '" data-idx="' + idx + '" value="' + fmt(i.grams) + '" aria-label="Gramm ' + esc(foodName(i.foodId)) + '"> g</td></tr>').join('') + '</table>' +
      '<div class="btn-row" style="justify-content:space-between"><div class="btn-row">' +
      (custom ? '<span class="sub">Mengen individuell</span>' : '<div class="stepper" aria-label="Portionen"><button data-act="portion" data-slot="' + s.id + '" data-v="-0.25" aria-label="Weniger">−</button><span>' + fmt(portions, 2) + '×</span><button data-act="portion" data-slot="' + s.id + '" data-v="0.25" aria-label="Mehr">+</button></div>') +
      '<span class="sub">' + money(costIngs(ings)) + '</span></div>' +
      '<div class="btn-row"><button class="btn small" data-act="swap" data-slot="' + s.id + '">Tauschen</button><button class="btn small" data-act="copy" data-slot="' + s.id + '">Kopieren</button>' +
      (custom || portions !== 1 ? '<button class="btn small ghost" data-act="reset-entry" data-slot="' + s.id + '">Zurücksetzen</button>' : '') +
      '<button class="btn small" data-act="plan-log" data-slot="' + s.id + '" data-tip="Loggt diese Mahlzeit als gegessen am ' + esc(dateLabel(dateIso, { weekday: 'short', day: 'numeric', month: 'numeric' })) + '">Gegessen</button></div></div></div>';
  }

  // ---------- Ansicht: Nährstoffe ----------
  function viewNutrients() {
    const res = periodResult(ui.date, ui.mode, ui.nutrPeriod);
    const isWeek = ui.nutrPeriod === 'woche';
    const wdates = C.weekDates(ui.date);
    const dayRes = wdates.map((d) => C.sumNutrients(dayIngs(d, ui.mode), FOODS));
    const sub = (isWeek ? 'Wochenmittel ' + dateLabel(wdates[0], { day: 'numeric', month: 'short' }) + ' – ' + dateLabel(wdates[6], { day: 'numeric', month: 'short' }) : dateLabel(ui.date)) + ' · ' + (ui.mode === 'geplant' ? 'Geplant' : 'Gegessen') + ' · Referenz: ' + (P().sex === 'w' ? 'Frau' : 'Mann') + ' 19–24 J.';
    let h = hero('Nährstoffe', esc(sub), dateNav() + seg('nutr-period', [['tag', 'Tag'], ['woche', 'Wochenmittel']], ui.nutrPeriod) + seg('mode', [['geplant', 'Geplant'], ['gegessen', 'Gegessen']], ui.mode));
    const score = C.nutrientScore(res, REFS(), TARGETS, D.NUTRIENTS);
    const micro = D.NUTRIENTS.filter((m) => m.group !== 'makro');
    const assess = (m, r) => {
      const ref = C.referenceAmount(m.key, REFS(), TARGETS);
      if (m.group === 'makro') { const ms = macroStatus(m.key, r.totals[m.key], ref); return Object.assign(ms, { showBar: r.grams > 0, lowerBound: false, ref }); }
      const ref0 = REFS()[m.key];
      return Object.assign(C.assessNutrient(r.totals[m.key], r.coverage[m.key], ref, ref0 && ref0.kind), { ref });
    };
    const determinable = micro.filter((m) => { const a = assess(m, res); return a.status !== 'nicht-bestimmbar' && a.status !== 'keine-daten'; }).length;
    h += '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-bottom:14px">' +
      '<div class="card kpi"><div class="label"><span>Nährstoff-Score</span><span class="demo-badge">DEMO</span></div><div class="big">' + (score.score === null ? '–' : fmt(score.score)) + '<small>/ 100</small></div><div class="of">aus ' + score.used + ' von ' + score.of + ' Vitaminen & Mineralstoffen mit belastbarer Datenlage</div></div>' +
      '<div class="card kpi"><div class="label"><span>Datenlage</span></div><div class="big">' + determinable + '<small>/ ' + micro.length + '</small></div><div class="of">Mikronährstoffe bestimmbar (≥ 60 % der Menge mit hinterlegtem Wert)</div></div>' +
      '<div class="card"><div class="sub" style="font-size:13px">Balken zeigen max. 100 %, höhere Werte stehen als Zahl daneben. Schraffiert = nur ein Teil der Lebensmittel hat einen Wert, die Zahl ist eine <b>Untergrenze</b>. Referenzwerte gelten für den Durchschnitt über längere Zeit – das Wochenmittel ist aussagekräftiger als ein einzelner Tag.</div></div></div>';
    h += '<div class="card"><div class="card-head"><div class="chips">' + [['alle', 'Alle'], ['makro', 'Makros'], ['vitamin', 'Vitamine'], ['mineral', 'Mineralstoffe'], ['fett', 'Omega-3']].map(([v, l]) => '<button class="chip" data-act="nutr-filter" data-v="' + v + '" aria-pressed="' + (ui.nutrFilter === v) + '">' + l + '</button>').join('') + '</div><span class="sub">Fahre über Werte für Quelle &amp; Rechenweg</span></div>';
    h += '<div class="table-wrap"><table class="data"><thead><tr><th>Nährstoff</th><th class="r">Menge</th><th class="r">Referenz</th><th class="r">%</th><th class="nut-bar">Abdeckung</th><th class="r">Daten</th><th>Status</th><th>' + (ui.mode === 'geplant' ? 'Mo–So geplant' : 'Mo–So gegessen') + '</th></tr></thead><tbody>';
    D.NUTRIENTS.filter((m) => ui.nutrFilter === 'alle' || m.group === ui.nutrFilter).forEach((m) => {
      const a = assess(m, res);
      const ref0 = REFS()[m.key];
      const total = res.totals[m.key];
      const cov = res.coverage[m.key];
      const refTxt = m.group === 'makro' ? 'Dein Ziel' : (D.KIND_LABEL[ref0.kind] || '');
      const refTip = m.group === 'makro' ? 'Persönliches Ziel aus den Einstellungen.' : ref0.source + '\n' + D.REF_CHECK + (ref0.kind === 'max' ? '\nHier ist weniger besser: Obergrenze, kein Ziel.' : ref0.kind !== 'empfehlung' ? '\n' + D.KIND_LABEL[ref0.kind] + ': Orientierungswert, keine harte medizinische Grenze.' : '');
      const amount = (a.status === 'nicht-bestimmbar' || a.status === 'keine-daten') ? '–' : (a.lowerBound ? '≥ ' : '') + fmtAuto(total) + ' ' + m.unit;
      const calcTip = 'Σ Menge × Wert/100 g über alle Zutaten' + (isWeek ? ', geteilt durch ' + res.days + ' Tag(e)' : '') + '.' + (m.note ? '\n' + m.note : '');
      const spark = dayRes.map((r, i) => {
        const da = assess(m, r);
        const st = STATUS[da.status] ? STATUS[da.status][0] : 'none';
        const hgt = da.showBar && C.isNum(da.pct) ? Math.max(3, Math.min(100, da.pct) / 100 * 22) : 3;
        return '<i data-s="' + (da.showBar ? st : 'none') + '" style="height:' + hgt.toFixed(1) + 'px" data-tip="' + esc(D.DAYS_SHORT[i] + ': ' + (da.showBar ? (da.lowerBound ? '≥ ' : '') + fmtAuto(r.totals[m.key]) + ' ' + m.unit + ' (' + fmt(da.pct) + ' %)' : STATUS[da.status][1])) + '"></i>';
      }).join('');
      h += '<tr><td><span class="nut-name" data-tip="' + esc(calcTip) + '">' + m.label + '</span>' + (m.uncertain ? ' <span class="tag" data-tip="' + esc(m.note) + '">unsicher</span>' : '') + '</td>' +
        '<td class="r num">' + amount + '</td>' +
        '<td class="r num"><span data-tip="' + esc(refTip) + '">' + fmtAuto(a.ref) + ' ' + m.unit + '</span><div class="sub">' + refTxt + '</div></td>' +
        '<td class="r num">' + (a.showBar && C.isNum(a.pct) ? (a.lowerBound ? '≥ ' : '') + fmt(a.pct) + ' %' : '–') + '</td>' +
        '<td class="nut-bar">' + barHtml(a.showBar ? a.pct : null, a.showBar ? a.status : 'keine-daten') + '</td>' +
        '<td class="r num"><span data-tip="Anteil der Lebensmittelmenge (in Gramm), für die ein Wert hinterlegt ist.">' + (cov === null ? '–' : fmt(cov * 100) + ' %') + '</span></td>' +
        '<td>' + pill(a.status) + '</td><td><span class="spark">' + spark + '</span></td></tr>';
    });
    h += '</tbody></table></div></div>';
    h += '<div class="notes section">' +
      '<div class="note">Vitamin D: Über Essen wird der Referenzwert selten erreicht. Sonne und Supplemente sind nicht erfasst – Klarheit gibt nur eine Blutuntersuchung.</div>' +
      '<div class="note">Jod: Für die meisten Lebensmittel fehlt ein verlässlicher Wert, Jodsalz ist nicht eingerechnet. Darum meist „nicht bestimmbar“ statt Scheinpräzision.</div>' +
      '<div class="note">Natrium: Nur aus Lebensmitteln, ohne zugesetztes Salz. Sparsam mit Jodsalz würzen.</div>' +
      '<div class="note info">Alle Nährwerte sind Demo-/Richtwerte, an USDA FoodData Central angelehnt, aber nicht live abgerufen. Sie ersetzen keine Blutwerte oder ärztliche Betreuung und sagen nichts über einen Mangel aus.</div></div>';
    return h;
  }

  // ---------- Ansicht: Einkauf ----------
  function weekShopping() {
    const lists = [].concat(...Object.keys(state.persons).map((pid) => [0, 1, 2, 3, 4, 5, 6].map((i) => plannedDay(i, pid))));
    return { lists, items: C.aggregateShopping(lists, FOODS, sc(), state.settings.priceOverrides) };
  }
  const amountTxt = (it) => {
    const f = FOODS[it.foodId];
    if (f.unit === 'stueck') return fmt(Math.ceil(it.pieces - 1e-9)) + ' Stück';
    const g = it.purchaseG;
    return g >= 1000 ? fmt(g / 1000, 2) + ' kg' : fmt(Math.ceil(g / 10) * 10) + ' g';
  };
  function viewShop() {
    const { items } = weekShopping();
    const week = sumBy(items, (i) => i.cost || 0);
    const cur = state.settings.currency;
    let h = hero('Einkauf &amp; Budget', 'Basis: Wochenplan, alle 7 Tage inkl. Frühstück &amp; Snacks · Preise in Prag sind deine manuellen Schätzungen, keine Live-Preise',
      seg('scenario', [['gut', 'Gut'], ['premium', 'Premium'], ['luxus', 'Luxus']], sc()) +
      '<button class="btn' + (cur.showEur ? ' on' : '') + '" data-act="eur-toggle" aria-pressed="' + cur.showEur + '">EUR anzeigen</button>' +
      '<label class="sub" style="display:flex;align-items:center;gap:6px">Kurs <input class="price-input" inputmode="decimal" data-change="rate" value="' + fmt(cur.rate, 2) + '" aria-label="Wechselkurs CZK pro EUR"> Kč/€</label>');
    const month = C.monthlyFromWeekly(week);
    h += '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">' + [
      ['Pro Tag', week / 7, 'Woche / 7'], ['Pro Woche', week, 'Summe aller Zutaten × Preis'], ['Pro Monat', month, 'Woche × 52 / 12 (≈ 4,33 Wochen), nicht × 4'], ['Pro Mahlzeit (Ø)', week / 28, 'Woche / 28 Mahlzeiten (inkl. Snack)'],
    ].map(([l, v, tip]) => '<div class="card kpi"><div class="label"><span>' + l + '</span></div><div class="big" data-tip="' + esc(tip) + '">' + fmt(v) + '<small>Kč</small></div><div class="of">' + (cur.showEur ? '≈ ' + fmt(C.czkToEur(v, cur.rate), 2) + ' € · ' : '') + 'Kurs ' + fmt(cur.rate, 1) + ' (manuell, kein Live-Kurs)</div></div>').join('') + '</div>';
    if (window.claude && window.claude.use) h += rohlikCard();
    const lo = 17000, hi = 24500;
    h += '<div class="note info section">Deine bisherige Budget-Annahme: 17.000–24.500 Kč/Monat (≈ 700–1.000 €). Durchgerechnet ergibt der aktuelle Plan im Szenario „' + ({ gut: 'Gut', premium: 'Premium', luxus: 'Luxus' })[sc()] + '“ <b>' + fmt(month) + ' Kč/Monat</b> – ' + (month < lo ? 'also günstiger als angenommen.' : month > hi ? 'also teurer als angenommen.' : 'also im angenommenen Rahmen.') + ' Gerechnet wird mit Verbrauchsmengen ohne Packungsgrößen, Reste oder Gewürze.</div>';

    const checks = state.settings.checks || {};
    h += '<div class="grid two section"><div class="card"><div class="card-head"><h2>Einkaufsliste für 1 Woche</h2><div class="btn-row"><button class="btn small" data-act="shop-copy">Als Text kopieren</button><button class="btn small" data-act="shop-csv">CSV speichern</button><button class="btn small ghost" data-act="shop-reset">Haken zurücksetzen</button></div></div>';
    D.SHOP_GROUPS.forEach((g) => {
      const its = items.filter((i) => g.cats.includes(FOODS[i.foodId].category)).sort((a, b) => foodName(a.foodId).localeCompare(foodName(b.foodId), 'de'));
      if (!its.length) return;
      h += '<div class="shop-group" style="margin-top:12px"><h3>' + g.label + ' · ' + money(sumBy(its, (i) => i.cost || 0)) + '</h3>';
      its.forEach((it) => {
        const f = FOODS[it.foodId]; const done = !!checks[it.foodId];
        const edibleNote = f.unit !== 'stueck' && f.ediblePortion < 1 ? ' <span class="sub">(essbar ' + fmt(it.edibleG) + ' g)</span>' : '';
        h += '<label class="shop-item' + (done ? ' done' : '') + '"><input type="checkbox" data-change="shop-check" data-food="' + it.foodId + '"' + (done ? ' checked' : '') + '><span class="nm">' + esc(f.name) + edibleNote + '</span><span class="amt">' + amountTxt(it) + '</span><span class="cost">' + money(it.cost) + '</span></label>';
      });
      h += '</div>';
    });
    h += '</div>';
    // Preisliste
    h += '<div class="card"><div class="card-head"><h2>Preisliste</h2><span class="sub">Kč pro kg Einkaufsgewicht · Eier pro Stück</span></div><div class="table-wrap"><table class="data"><thead><tr><th>Lebensmittel</th><th class="r">Gut</th><th class="r">Premium</th><th class="r">Luxus</th></tr></thead><tbody>' +
      Object.values(FOODS).sort((a, b) => a.name.localeCompare(b.name, 'de')).map((f) => {
        const p = state.settings.priceOverrides[f.id] || f.price;
        return '<tr><td>' + esc(f.name) + (f.ediblePortion < 1 && f.unit !== 'stueck' ? ' <span class="sub" data-tip="' + esc(f.note || 'Essbarer Anteil') + '">' + fmt(f.ediblePortion * 100) + ' % essbar</span>' : '') + '</td>' + ['gut', 'premium', 'luxus'].map((s) => '<td class="r"><input class="price-input" inputmode="decimal" data-change="price" data-food="' + f.id + '" data-sc="' + s + '" value="' + fmt(p[s]) + '" aria-label="Preis ' + esc(f.name) + ' ' + s + '"></td>').join('') + '</tr>';
      }).join('') + '</tbody></table></div><div class="sub" style="margin-top:8px">Startwerte sind grobe Spannen für Prag (z. B. Hähnchenbrust 220–400, Lachs 500–1.300, Rinderfilet 1.100–2.700 Kč/kg). Trag deine echten Preise ein.</div></div></div>';
    return h;
  }
  function shopText(csv) {
    const { items } = weekShopping(); const checks = state.settings.checks || {};
    if (csv) {
      const rows = [['Gruppe', 'Lebensmittel', 'Menge', 'Einheit', 'Essbar (g)', 'Kosten (CZK)', 'Erledigt']];
      D.SHOP_GROUPS.forEach((g) => items.filter((i) => g.cats.includes(FOODS[i.foodId].category)).forEach((it) => {
        const f = FOODS[it.foodId];
        rows.push([g.label, f.name, f.unit === 'stueck' ? Math.ceil(it.pieces) : Math.round(it.purchaseG), f.unit === 'stueck' ? 'Stück' : 'g', Math.round(it.edibleG), it.cost === null ? '' : it.cost.toFixed(2), checks[it.foodId] ? 'ja' : 'nein']);
      }));
      return rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n');
    }
    let t = 'Einkaufsliste (1 Woche)\n';
    D.SHOP_GROUPS.forEach((g) => {
      const its = items.filter((i) => g.cats.includes(FOODS[i.foodId].category));
      if (!its.length) return;
      t += '\n' + g.label + '\n' + its.map((it) => (checks[it.foodId] ? '[x] ' : '[ ] ') + FOODS[it.foodId].name + ' – ' + amountTxt(it)).join('\n') + '\n';
    });
    return t + '\nGeschätzte Kosten: ' + moneyPlain(sumBy(items, (i) => i.cost || 0)) + ' pro Woche';
  }

  // ---------- Rohlik-Autopilot ----------
  const RH = 'host:Rohlik__Ern_hrungs-Dashboard_';
  let rohlikRun = null; // { phase, done, total, steps:[], error, picks, cart }
  const RH_ERR = {
    server_not_connected: 'Der Rohlik-Server ist nicht erreichbar. Öffne das Dashboard in der Claude-App am PC und prüfe, ob der Server eingerichtet ist (Einstellungen → Entwickler).',
    not_in_manifest: 'Du hast dem Dashboard den Zugriff auf den Rohlik-Server nicht erlaubt. Klick nochmal auf Go und bestätige die Abfrage.',
    cancelled: 'Abgebrochen – die Bestätigung in der Claude-App wurde abgelehnt.',
    approval_required: 'Die Claude-App braucht deine Bestätigung. Klick nochmal auf Go.',
    tool_error: 'Rohlik hat einen Fehler gemeldet',
    not_granted: 'Claude darf in diesem Dashboard nicht genutzt werden – bei der Abfrage bitte „Erlauben“ wählen.',
    rate_limited: 'Gerade zu viele Anfragen an Claude – bitte in ein paar Minuten nochmal.',
    invalid_json: 'Claudes Auswahl war nicht lesbar. Bitte nochmal auf Go klicken.',
  };
  const rhErr = (e) => (RH_ERR[e && e.code] || 'Unerwarteter Fehler') + (e && e.code === 'tool_error' && e.message ? ': ' + e.message : '') + (e && e.code && !RH_ERR[e.code] ? ' (' + e.code + ')' : '');
  const scLabel = () => ({ gut: 'Gut', premium: 'Premium', luxus: 'Luxus' })[sc()];
  const QUALITY_RULE = {
    gut: 'Niveau GUT: günstigstes Produkt, das ordentliche Qualität hat (frisch statt verarbeitet).',
    premium: 'Niveau PREMIUM: gute Qualität (frisch, gute Herkunft, z. B. CZ/EU, Weidehaltung, Bio wenn höchstens ca. 25 % teurer), aber kein Luxus-Aufpreis ohne klaren Grund.',
    luxus: 'Niveau LUXUS: beste verfügbare Qualität, Preis zweitrangig.',
  };
  async function useCap(name) { try { return window.claude && window.claude.use ? await window.claude.use(name) : null; } catch (e) { return null; } }
  function rhStep(text, state) { rohlikRun.steps.push({ text, state: state || 'run' }); render(); }
  function rhDone(state) { const s = rohlikRun.steps[rohlikRun.steps.length - 1]; if (s) s.state = state || 'ok'; }

  async function rohlikGo() {
    if (rohlikRun && rohlikRun.phase !== 'fertig' && rohlikRun.phase !== 'fehler' && rohlikRun.phase !== 'pruefen') return;
    const cfg = state.settings.rohlik;
    const { items } = weekShopping();
    rohlikRun = { phase: 'suche', done: 0, total: items.length, steps: [], error: null, picks: null, startedAt: Date.now() };
    const mcp = await useCap('mcp'); const sample = await useCap('sample');
    if (!mcp || !sample) { rohlikRun.phase = 'fehler'; rohlikRun.error = 'Der Autopilot läuft nur, wenn du das Dashboard in der Claude-App am PC öffnest (nicht im normalen Browser oder am Handy).'; return render(); }
    try {
      // 1) Suchen
      rhStep('Suche ' + items.length + ' Zutaten auf rohlik.cz');
      const cands = {};
      let i = 0;
      const worker = async () => {
        while (i < items.length) {
          const it = items[i++];
          const q = D.ROHLIK_QUERIES[it.foodId] || FOODS[it.foodId].name;
          try {
            const r = await mcp.callTool(RH, 'rohlik_search', { query: q, limit: 8 });
            cands[it.foodId] = ((r.payload && r.payload.products) || []).filter((p) => p.inStock);
          } catch (e) {
            if (['server_not_connected', 'not_in_manifest', 'cancelled', 'approval_required', 'not_granted', 'capability_disabled'].includes(e && e.code)) throw e;
            cands[it.foodId] = [];
          }
          rohlikRun.done++; render();
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      rhDone();
      // 2) Auswahl durch Claude
      rohlikRun.phase = 'auswahl';
      rhStep('Claude wählt die besten Produkte (' + scLabel() + ')');
      const extraSeen = {};
      const list = items.map((it) => {
        const f = FOODS[it.foodId];
        return { key: it.foodId, zutat: f.name, basis: f.basis, benoetigt: f.unit === 'stueck' ? Math.ceil(it.pieces) + ' Stück' : Math.round(it.purchaseG) + ' g Einkaufsgewicht',
          kandidaten: (cands[it.foodId] || []).map((p) => ({ id: p.productId, name: p.name, marke: p.brand, packung: p.amount, preis: p.salePrice || p.price, kc_pro_einheit: p.pricePerUnit, einheit: p.unit, angebot: !!p.salePrice })) };
      });
      const wishes = (cfg.wishes || '').trim();
      const limits = await sample.limits().catch(() => null);
      const canTools = !!(limits && limits.tools) && !!wishes;
      const prompt = [
        'Du bist ein Einkaufsassistent für rohlik.cz (Prag). Für einen Wocheneinkauf (2 Personen, gesunde proteinreiche Ernährung; Mengen sind bereits für beide zusammengerechnet) wählst du pro Zutat GENAU EIN Produkt aus den Kandidaten.',
        'Regeln:',
        '- ' + QUALITY_RULE[sc()],
        '- Vergleiche über den Preis pro Einheit (kc_pro_einheit, meist Kč/kg), nicht über den Packungspreis.',
        '- Nur das reine Lebensmittel: keine Fertiggerichte, Marinaden, gewürzten/panierten Produkte, kein Tierfutter, kein Fleischersatz, kein Tofu/Tempeh/Quinoa.',
        '- Frisches Fleisch/Fisch bevorzugen; TK nur, wenn kein gutes frisches Produkt da ist (Erbsen dürfen TK sein).',
        '- Menge = Anzahl Packungen, sodass die benötigte Menge gedeckt ist (aufrunden, möglichst wenig Überschuss). Bei „cca“-Gewicht zählt die ca.-Angabe einer Packung. Eier: Packungsgröße beachten (z. B. 10 ks).',
        '- Passt kein Kandidat: productId null und kurz warum.',
        wishes ? '- Wünsche des Nutzers für diese Woche (haben Vorrang, können Mengen ändern, Zutaten streichen oder Extras ergänzen): """' + wishes.slice(0, 1500) + '"""' : '',
        wishes ? (canTools ? '- Für Extras aus den Wünschen nutze das Werkzeug rohlik_suche (Suchbegriff auf Tschechisch) und nimm sie mit key "extra:<kurzer Name>" auf.' : '- Extras aus den Wünschen kannst du nicht suchen – erwähne sie nur in "hinweis".') : '',
        '',
        'Zutaten mit Kandidaten (JSON):',
        JSON.stringify(list),
        '',
        'Antworte NUR mit JSON in diesem Format:',
        '{"items":[{"key":"haehnchenbrust","productId":1353701,"name":"Produktname","quantity":2,"price":248.43,"note":"kurzer Grund auf Deutsch, max. 12 Wörter"}],"hinweis":"optional, 1 Satz"}',
        'Für jede Zutat (key) genau ein Eintrag, auch wenn productId null ist. price = Preis einer Packung.',
      ].filter(Boolean).join('\n');
      const opts = { modelTier: 'default' };
      if (canTools) {
        opts.tools = [{ name: 'rohlik_suche', description: 'Sucht Produkte auf rohlik.cz. Gibt bis zu 6 Treffer mit id, name, packung, preis, kc_pro_einheit zurück.',
          inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
          execute: async (inp, ctx) => {
            const r = await mcp.callTool(RH, 'rohlik_search', { query: String(inp.query || ''), limit: 6 }, { signal: ctx.signal });
            const ps = ((r.payload && r.payload.products) || []).filter((p) => p.inStock);
            ps.forEach((p) => { extraSeen[p.productId] = p; });
            return ps.map((p) => ({ id: p.productId, name: p.name, packung: p.amount, preis: p.salePrice || p.price, kc_pro_einheit: p.pricePerUnit, einheit: p.unit }));
          } }];
      } else opts.cache = false;
      const ans = await sample.json(prompt, opts);
      const byKey = {};
      ((ans && ans.items) || []).forEach((x) => { if (x && x.key) byKey[x.key] = x; });
      const picks = [];
      items.forEach((it) => {
        const x = byKey[it.foodId] || {};
        const cand = (cands[it.foodId] || []).find((p) => p.productId === Number(x.productId));
        const qty = Math.round(Number(x.quantity));
        picks.push({ key: it.foodId, label: FOODS[it.foodId].name, need: it, product: cand || null,
          quantity: cand && qty >= 1 && qty <= 30 ? qty : 0, note: cand ? String(x.note || '').slice(0, 120) : (x.note ? String(x.note).slice(0, 120) : 'Kein passendes Produkt gefunden'), status: cand ? 'gewaehlt' : 'fehlt' });
      });
      Object.keys(byKey).filter((k) => k.startsWith('extra:')).forEach((k) => {
        const x = byKey[k]; const p = extraSeen[Number(x.productId)]; const qty = Math.round(Number(x.quantity));
        if (p && qty >= 1 && qty <= 30) picks.push({ key: k, label: k.slice(6), extra: true, product: p, quantity: qty, note: String(x.note || 'Extra-Wunsch').slice(0, 120), status: 'gewaehlt' });
      });
      rohlikRun.picks = picks; rohlikRun.hint = ans && ans.hinweis ? String(ans.hinweis).slice(0, 300) : '';
      rhDone();
      if (cfg.review) { rohlikRun.phase = 'pruefen'; return render(); }
      await rohlikAdd(mcp);
    } catch (e) {
      rhDone('err'); rohlikRun.phase = 'fehler'; rohlikRun.error = rhErr(e); render();
    }
  }

  async function rohlikAdd(mcpIn) {
    const cfg = state.settings.rohlik;
    const mcp = mcpIn || await useCap('mcp');
    if (!mcp) { rohlikRun.phase = 'fehler'; rohlikRun.error = RH_ERR.server_not_connected; return render(); }
    try {
      const chosen = rohlikRun.picks.filter((p) => p.product && p.quantity > 0);
      rohlikRun.phase = 'warenkorb';
      rhStep('Lege ' + chosen.length + ' Produkte in deinen Warenkorb');
      const r = await mcp.callTool(RH, 'rohlik_add_to_cart', { items: chosen.map((p) => ({ productId: p.product.productId, quantity: p.quantity })) });
      const res = (r.payload && r.payload.results) || [];
      chosen.forEach((p) => { const x = res.find((y) => y.productId === p.product.productId); p.status = x && x.ok ? 'im-korb' : 'fehler'; p.err = x && x.error; });
      rhDone((r.payload && r.payload.failed) ? 'warn' : 'ok');
      // Preise übernehmen
      if (cfg.applyPrices) {
        let n = 0;
        chosen.forEach((p) => {
          const f = FOODS[p.key]; if (!f || p.extra) return;
          let v = null;
          if (f.unit === 'stueck') { const m = /(\d+)\s*(ks|kus)/i.exec(p.product.amount || ''); if (m && p.product.price) v = (p.product.salePrice || p.product.price) / Number(m[1]); }
          else if ((p.product.unit === 'kg' || p.product.unit === 'l') && p.product.pricePerUnit) v = p.product.pricePerUnit;
          if (C.isNum(v) && v > 0) { const cur = Object.assign({}, state.settings.priceOverrides[f.id] || f.price); cur[sc()] = Math.round(v * 100) / 100; state.settings.priceOverrides[f.id] = cur; n++; }
        });
        rhStep(n + ' Preise in deine Preisliste übernommen (' + scLabel() + ')', 'ok');
      }
      // Nährwerte übernehmen
      if (cfg.applyNutrition) {
        rohlikRun.phase = 'naehrwerte';
        rhStep('Hole Nährwerte von den Produkt-Etiketten');
        let n = 0;
        for (const p of chosen) {
          if (p.extra) continue;
          try {
            const r = await mcp.callTool(RH, 'rohlik_product_details', { productId: p.product.productId });
            const nu = r.payload && r.payload.nutrition;
            if (nu && C.isNum(nu.kcal) && C.isNum(nu.protein)) {
              const ov = {}; [['kcal', 'kcal'], ['protein', 'protein'], ['carbs', 'carbs'], ['fat', 'fat'], ['fiber', 'fiber']].forEach(([a, b]) => { if (C.isNum(nu[a])) ov[b] = nu[a]; });
              if (C.isNum(nu.salt)) ov.sodium = Math.round(nu.salt * 400);
              state.settings.foodOverrides[p.key] = Object.assign({}, state.settings.foodOverrides[p.key], ov);
              cfg.sources[p.key] = { productId: p.product.productId, name: p.product.name, at: todayIso() };
              n++;
            }
          } catch (e) { /* Produkt ohne Daten überspringen */ }
        }
        rhDone('ok');
        rhStep(n + ' Lebensmittel nutzen jetzt Etikett-Werte von Rohlik (Frischware hat oft keine)', 'ok');
      }
      rohlikRun.phase = 'fertig';
      cfg.last = { at: new Date().toISOString(), scenario: sc(), picks: rohlikRun.picks.map((p) => ({ label: p.label, extra: !!p.extra, status: p.status, quantity: p.quantity, note: p.note,
        product: p.product ? { productId: p.product.productId, name: p.product.name, amount: p.product.amount, price: p.product.salePrice || p.product.price, pricePerUnit: p.product.pricePerUnit, unit: p.product.unit } : null })) };
      commit('settings');
    } catch (e) {
      rhDone('err'); rohlikRun.phase = 'fehler'; rohlikRun.error = rhErr(e); render();
    }
  }

  async function rohlikCart() {
    const mcp = await useCap('mcp');
    if (!mcp) return toast('Nur in der Claude-App am PC verfügbar');
    try {
      const r = await mcp.callTool(RH, 'rohlik_get_cart', {}, { cache: false });
      const c = r.payload || {};
      toast('Warenkorb: ' + (c.items || []).length + ' Artikel · ' + fmt(c.totalPrice) + ' Kč' + (c.canOrder ? '' : ' (Mindestbestellwert ' + fmt(c.minimalOrderPrice) + ' Kč)'));
    } catch (e) { toast(rhErr(e)); }
  }

  function rohlikCard() {
    const cfg = state.settings.rohlik;
    const run = rohlikRun;
    const busy = run && ['suche', 'auswahl', 'warenkorb', 'naehrwerte'].includes(run.phase);
    const picks = run && run.picks ? run.picks : (cfg.last ? cfg.last.picks : null);
    let h = '<div class="card section" style="border-color:rgba(54,196,143,.35);background:linear-gradient(180deg,rgba(54,196,143,.07),var(--card) 40%)">' +
      '<div class="card-head"><div><div class="eyebrow">Rohlik-Autopilot</div><h2 style="font-size:19px;margin-top:2px">Wocheneinkauf mit einem Klick</h2></div>' +
      '<div class="btn-row"><button class="btn small ghost" data-act="rh-cart">Warenkorb prüfen</button><button class="btn primary" data-act="rh-go"' + (busy ? ' disabled' : '') + ' style="padding:10px 22px;font-size:15px">' + (busy ? 'Läuft …' : 'Go') + '</button></div></div>' +
      '<div class="grid" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:14px">' +
      '<div class="field"><label for="rh-wishes">Wünsche für diese Woche (optional)</label><textarea id="rh-wishes" data-change="rh-wishes" style="min-height:74px;font-family:var(--font-body);font-size:13.5px" placeholder="z. B. Lachs doppelt, kein Spargel, dazu 2 l Milch und Kaffeebohnen">' + esc(cfg.wishes) + '</textarea></div>' +
      '<div class="stack" style="gap:8px;font-size:13.5px">' +
      ['review|Vor dem Warenkorb erst Auswahl prüfen', 'applyPrices|Echte Preise in die Preisliste übernehmen', 'applyNutrition|Nährwerte von Produkt-Etiketten übernehmen'].map((x) => { const [k, l] = x.split('|'); return '<label class="btn-row"><input type="checkbox" data-change="rh-opt" data-k="' + k + '"' + (cfg[k] ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:var(--accent)"> ' + l + '</label>'; }).join('') +
      '<span class="sub">Qualität: <b>' + scLabel() + '</b> (oben umschaltbar) · Basis: Wochenplan, ' + weekShopping().items.length + ' Zutaten · bestellt und bezahlt wird nie automatisch</span></div></div>';
    if (run) {
      const pct = run.phase === 'suche' ? run.done / Math.max(1, run.total) * 60 : { auswahl: 70, pruefen: 80, warenkorb: 88, naehrwerte: 94, fertig: 100, fehler: 100 }[run.phase] || 0;
      h += '<div style="margin-top:14px"><div class="sub" style="display:flex;justify-content:space-between"><span>' + ({ suche: 'Suche auf rohlik.cz … ' + run.done + '/' + run.total, auswahl: 'Claude vergleicht Preise und Qualität … (dauert 30–90 s)', pruefen: 'Auswahl fertig – bitte prüfen', warenkorb: 'Lege in den Warenkorb …', naehrwerte: 'Hole Nährwerte …', fertig: 'Fertig ✓', fehler: 'Abgebrochen' })[run.phase] + '</span><span class="num">' + fmt(pct) + ' %</span></div>' +
        '<div class="bar" data-s="' + (run.phase === 'fehler' ? 'warn' : 'good') + '"><i style="width:' + pct + '%"></i></div>' +
        '<div class="sub" style="margin-top:8px;display:grid;gap:3px">' + run.steps.map((s) => '<span>' + ({ run: '…', ok: '✓', warn: '!', err: '✗' })[s.state] + ' ' + esc(s.text) + '</span>').join('') + '</div>' +
        (run.error ? '<div class="note" style="margin-top:10px">' + esc(run.error) + '</div>' : '') + (run.hint ? '<div class="note info" style="margin-top:10px">' + esc(run.hint) + '</div>' : '') + '</div>';
    }
    if (picks && picks.length) {
      const sum = sumBy(picks.filter((p) => p.product && p.quantity), (p) => (p.product.salePrice || p.product.price || 0) * p.quantity);
      h += '<div class="table-wrap" style="margin-top:14px"><table class="data"><thead><tr><th>Zutat</th><th>Produkt auf Rohlik</th><th class="r">Packungen</th><th class="r">Preis</th><th class="r">Kč/Einheit</th><th>Warum</th><th>Status</th></tr></thead><tbody>' +
        picks.map((p) => '<tr><td>' + esc(p.label) + (p.extra ? ' <span class="tag">Extra</span>' : '') + '</td><td>' + (p.product ? esc(p.product.name) + '<div class="sub">' + esc(p.product.amount || '') + '</div>' : '<span class="sub">–</span>') + '</td><td class="r num">' + (p.quantity || '–') + '</td><td class="r num">' + (p.product ? fmt((p.product.salePrice || p.product.price) * p.quantity, 0) + ' Kč' : '–') + '</td><td class="r num">' + (p.product && p.product.pricePerUnit ? fmt(p.product.pricePerUnit, 0) + '/' + esc(p.product.unit || '') : '–') + '</td><td class="sub">' + esc(p.note || '') + (p.err ? ' · ' + esc(p.err) : '') + '</td><td>' +
          ({ 'im-korb': '<span class="pill" data-s="good">Im Warenkorb</span>', gewaehlt: '<span class="pill" data-s="near">Ausgewählt</span>', fehlt: '<span class="pill" data-s="warn">Nicht gefunden</span>', fehler: '<span class="pill" data-s="warn">Fehler</span>' })[p.status] + '</td></tr>').join('') +
        '</tbody></table></div><div class="btn-row" style="justify-content:space-between;margin-top:10px"><span class="sub">Summe laut Auswahl: <b>' + money(sum) + '</b>' + (cfg.last && !run ? ' · letzter Lauf ' + new Date(cfg.last.at).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '') + '</span>' +
        (run && run.phase === 'pruefen' ? '<button class="btn primary" data-act="rh-add">Jetzt in den Warenkorb legen</button>' : '<a class="btn small" href="https://www.rohlik.cz" target="_blank" rel="noopener">Zu rohlik.cz</a>') + '</div>';
    }
    if (!run && !picks) h += '<div class="sub" style="margin-top:12px">Funktioniert nur in der Claude-App am PC mit eingerichtetem Rohlik-Server. Beim ersten Go fragt die App, ob das Dashboard den Server und Claude nutzen darf.</div>';
    return h + '</div>';
  }

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act^="rh-"]'); if (!el) return;
    const act = el.dataset.act;
    if (act === 'rh-go') rohlikGo();
    else if (act === 'rh-add' && rohlikRun && rohlikRun.picks) rohlikAdd();
    else if (act === 'rh-cart') rohlikCart();
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-change^="rh-"]'); if (!el) return;
    const cfg = state.settings.rohlik;
    if (el.dataset.change === 'rh-wishes') { cfg.wishes = el.value.slice(0, 1500); commit('settings'); }
    else if (el.dataset.change === 'rh-opt') { cfg[el.dataset.k] = el.checked; commit('settings'); }
  });

  // ---------- Ansicht: Rezepte ----------
  function recipeMatches(r) {
    const f = ui.recipeFilter;
    if (r.optional && !state.settings.prefs.showDairySnack && f !== 'snack') return false;
    if (f === 'alle') return true;
    if (f === 'favoriten') return state.settings.favorites.includes(r.id);
    if (f === 'fruehstueck' || f === 'snack') return r.slot === f;
    return r.protein === f;
  }
  function viewRecipes() {
    let h = hero('Rezepte', 'Kurz, einfach, lecker · Basis-Mengen (1 Portion) · im Wochenplan automatisch pro Person skaliert');
    h += '<div class="chips" style="margin-bottom:14px">' + [['alle', 'Alle'], ['favoriten', 'Favoriten ★'], ['haehnchen', 'Hähnchen'], ['fisch', 'Fisch & Garnelen'], ['rind', 'Rind'], ['fruehstueck', 'Frühstück'], ['snack', 'Snacks']].map(([v, l]) => '<button class="chip" data-act="recipe-filter" data-v="' + v + '" aria-pressed="' + (ui.recipeFilter === v) + '">' + l + '</button>').join('') + '</div>';
    const list = RECIPES.filter(recipeMatches);
    if (!list.length) return h + '<div class="card empty">Noch keine Rezepte in dieser Auswahl. Markiere Favoriten mit ★.</div>';
    h += '<div class="grid recipe-grid">' + list.map((r) => {
      const ings = C.entryIngredients({ recipeId: r.id, portions: 1 }, RBYID);
      const t = C.sumNutrients(ings, FOODS, C.MACRO_KEYS).totals;
      const fav = state.settings.favorites.includes(r.id);
      const inPlan = state.plan.some((d) => Object.values(d).some((e) => e.recipeId === r.id));
      return '<div class="card recipe-card" data-act="open-recipe" data-id="' + r.id + '" role="button" tabindex="0"><div class="top">' + plateSvg(ings, 58) + '<button class="star" data-act="fav" data-id="' + r.id + '" aria-pressed="' + fav + '" aria-label="Favorit">' + (fav ? '★' : '☆') + '</button></div>' +
        '<div><div class="eyebrow">' + ({ fruehstueck: 'Frühstück', snack: 'Snack', haupt: 'Hauptgericht' })[r.slot] + ' · ' + r.time + ' Min.' + (inPlan ? ' · im Plan' : '') + (r.edited ? ' · <span class="tag">angepasst</span>' : '') + '</div><h3 style="font-size:15px;margin-top:3px">' + esc(r.name) + '</h3></div>' + macroLine(t) + '<div class="sub">' + money(costIngs(ings)) + ' pro Portion</div></div>';
    }).join('') + '</div>';
    return h;
  }
  function recipeModal(id) {
    const r = RBYID[id]; if (!r) return '';
    const ings = C.entryIngredients({ recipeId: id, portions: 1 }, RBYID);
    const t = C.sumNutrients(ings, FOODS, C.MACRO_KEYS).totals;
    const fav = state.settings.favorites.includes(id);
    const mainProt = ings.find((i) => FOODS[i.foodId] && (FOODS[i.foodId].category === 'fleisch' || FOODS[i.foodId].category === 'fisch'));
    const protFoods = Object.values(FOODS).filter((f) => f.category === 'fleisch' || f.category === 'fisch');
    const slotsFor = D.SLOTS.filter((s) => s.recipeSlot === r.slot);
    let h = '<div class="modal-head"><div><div class="eyebrow">' + ({ fruehstueck: 'Frühstück', snack: 'Snack', haupt: 'Hauptgericht' })[r.slot] + ' · ' + r.time + ' Min. · 1 Portion</div><h2>' + esc(r.name) + '</h2></div><div class="btn-row"><button class="star" data-act="fav" data-id="' + id + '" aria-pressed="' + fav + '" aria-label="Favorit">' + (fav ? '★' : '☆') + '</button><button class="icon-btn" data-act="modal-close" aria-label="Schließen">' + icon('x') + '</button></div></div>';
    h += '<div class="meal-top" style="margin-bottom:12px">' + plateSvg(ings, 76) + '<div>' + macroLine(t) + '<div class="sub" style="margin-top:4px">' + money(costIngs(ings)) + ' pro Portion · Obst &amp; Gemüse ' + fmt(C.fruitVegGrams(ings, FOODS)) + ' g</div></div></div>';
    h += '<h3 style="margin:10px 0 4px">Zutaten</h3><table class="ing-table">' + ings.map((i, idx) => '<tr><td>' + esc(foodName(i.foodId)) + (i.preparation ? ' <span class="prep">· ' + esc(i.preparation) + '</span>' : '') + ' <span class="prep">(' + FOODS[i.foodId].basis + ')</span></td><td><input class="g-input" inputmode="decimal" data-change="recipe-gram" data-id="' + id + '" data-idx="' + idx + '" value="' + fmt(i.grams) + '" aria-label="Gramm ' + esc(foodName(i.foodId)) + '"> g</td></tr>').join('') + '</table>';
    if (mainProt) h += '<div class="btn-row" style="margin-top:12px"><label class="sub" for="prot-swap">Protein tauschen (gleiche Proteinmenge):</label><select class="inp" id="prot-swap" data-change="recipe-protein" data-id="' + id + '">' + protFoods.map((f) => '<option value="' + f.id + '"' + (f.id === mainProt.foodId ? ' selected' : '') + '>' + esc(f.name) + '</option>').join('') + '</select></div>';
    h += '<h3 style="margin:16px 0 6px">Zubereitung</h3><ol class="steps">' + r.steps.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol>';
    h += '<div class="btn-row" style="margin-top:18px;padding-top:14px;border-top:1px solid var(--line)"><span class="sub">In den Plan:</span><select class="inp" id="rp-day" aria-label="Tag">' + D.DAYS.map((d, i) => '<option value="' + i + '"' + (i === ui.planDay ? ' selected' : '') + '>' + d + '</option>').join('') + '</select><select class="inp" id="rp-slot" aria-label="Mahlzeit">' + slotsFor.map((s) => '<option value="' + s.id + '">' + s.label + '</option>').join('') + '</select><button class="btn primary" data-act="recipe-to-plan" data-id="' + id + '">Übernehmen</button>' +
      (r.edited ? '<button class="btn ghost" data-act="recipe-reset" data-id="' + id + '">Original-Rezept wiederherstellen</button>' : '') + '</div>';
    return h;
  }

  // ---------- Ansicht: Fortschritt ----------
  function weightChart(entries) {
    const ma = C.movingAverage(entries, 7);
    if (!ma.length) return '<div class="empty">Noch keine Messungen. Trag rechts dein erstes Gewicht ein – Profil-Startwert: ' + fmt(P().profile.weightKg, 1) + ' kg (nicht gemessen).</div>';
    const W = 460, H = 220, L = 34, R = 10, T = 12, B = 24;
    const dn = (iso) => Date.parse(iso + 'T12:00:00Z') / 86400000;
    const x0 = dn(ma[0].date), x1 = Math.max(dn(ma[ma.length - 1].date), x0 + 14);
    const t = P().targets;
    const startAvg = ma[0].avg;
    const bandAt = (d) => ({ lo: startAvg * (1 + t.gainPctPerWeekMin / 100 * (d - x0) / 7), hi: startAvg * (1 + t.gainPctPerWeekMax / 100 * (d - x0) / 7) });
    const ys = ma.map((e) => e.kg).concat([bandAt(x1).hi, startAvg]);
    const y0 = Math.floor(Math.min(...ys) - 0.5), y1 = Math.ceil(Math.max(...ys) + 0.5);
    const X = (d) => L + (d - x0) / (x1 - x0) * (W - L - R);
    const Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gewichtsverlauf">';
    for (let v = y0; v <= y1; v++) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#2c2c2a"/><text x="' + (L - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v + '</text>';
    const b0 = bandAt(x0), b1 = bandAt(x1);
    s += '<path d="M' + X(x0) + ' ' + Y(b0.lo) + ' L' + X(x1) + ' ' + Y(b1.lo) + ' L' + X(x1) + ' ' + Y(b1.hi) + ' L' + X(x0) + ' ' + Y(b0.hi) + ' Z" fill="rgba(54,196,143,.12)" data-tip="' + esc('Zielkorridor: +' + fmt(t.gainPctPerWeekMin, 2) + ' bis +' + fmt(t.gainPctPerWeekMax, 2) + ' % Körpergewicht pro Woche ab dem ersten 7-Tage-Schnitt') + '"/>';
    s += '<path d="' + ma.map((e, i) => (i ? 'L' : 'M') + X(dn(e.date)).toFixed(1) + ' ' + Y(e.avg).toFixed(1)).join(' ') + '" fill="none" stroke="var(--accent)" stroke-width="2"/>';
    ma.forEach((e) => { s += '<circle cx="' + X(dn(e.date)) + '" cy="' + Y(e.kg) + '" r="4.5" fill="var(--ink)" stroke="#1b1a18" stroke-width="2" data-tip="' + esc(dateLabel(e.date, { day: 'numeric', month: 'short', year: 'numeric' }) + ': ' + fmt(e.kg, 1) + ' kg · 7-Tage-Schnitt ' + fmt(e.avg, 2) + ' kg') + '"/>'; });
    s += '<text x="' + L + '" y="' + (H - 6) + '">' + dateLabel(ma[0].date, { day: 'numeric', month: 'short' }) + '</text><text x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + dateLabel(C.isoDate(new Date(x1 * 86400000)), { day: 'numeric', month: 'short' }) + '</text>';
    return s + '</svg>';
  }
  function viewProgress() {
    const ws = W();
    const ma = C.movingAverage(ws, 7);
    const trend = C.weeklyTrend(ws, 21);
    const cur = ma.length ? ma[ma.length - 1].avg : P().profile.weightKg;
    const t = P().targets;
    const band = C.targetGainBand(cur, t.gainPctPerWeekMin, t.gainPctPerWeekMax);
    let verdict = 'Für eine Aussage brauchst du mindestens 3 Messungen über 10+ Tage. Am besten morgens nüchtern, nach dem Klo, 3–7× pro Woche wiegen.';
    if (trend && C.isNum(trend.kgPerWeek)) {
      if (trend.kgPerWeek < band.min) verdict = 'Der Trend liegt unter dem Zielkorridor. Wenn das über 2–3 Wochen so bleibt: Kalorienziel um ca. 100–200 kcal erhöhen.';
      else if (trend.kgPerWeek > band.max) verdict = 'Der Trend liegt über dem Zielkorridor. Wenn das über 2–3 Wochen so bleibt: Kalorienziel um ca. 100–200 kcal senken.';
      else verdict = 'Der Trend liegt im Zielkorridor – Kalorien beibehalten.';
    }
    let h = hero('Fortschritt', 'Gewichtstrend statt Einzelmessung · Ziel: ' + ({ aufbau: 'langsamer Muskelaufbau', halten: 'Gewicht halten', abnehmen: 'langsam abnehmen' })[P().goal]);
    h += '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">' +
      '<div class="card kpi"><div class="label"><span>Gewicht (7-Tage-Schnitt)</span></div><div class="big">' + fmt(cur, 1) + '<small>kg</small></div><div class="of">' + ws.length + ' Messung' + (ws.length === 1 ? '' : 'en') + '</div></div>' +
      '<div class="card kpi"><div class="label"><span>Trend</span></div><div class="big" data-tip="Lineare Regression über alle Messungen der letzten 21 Tage.">' + (trend && C.isNum(trend.kgPerWeek) ? (trend.kgPerWeek >= 0 ? '+' : '−') + fmt(Math.abs(trend.kgPerWeek), 2) : '–') + '<small>kg/Woche</small></div><div class="of">' + (trend && C.isNum(trend.kgPerWeek) ? fmt(trend.kgPerWeek / cur * 100, 2) + ' % pro Woche' : 'noch zu wenig Daten') + '</div></div>' +
      '<div class="card kpi"><div class="label"><span>Zielkorridor</span></div><div class="big">+' + fmt(band.min, 2) + '–' + fmt(band.max, 2) + '<small>kg/Woche</small></div><div class="of">' + fmt(t.gainPctPerWeekMin, 2) + '–' + fmt(t.gainPctPerWeekMax, 2) + ' % des Körpergewichts</div></div></div>';
    h += '<div class="note info section">' + verdict + '</div>';
    h += '<div class="grid two section"><div class="card chart"><div class="card-head"><h2>Gewichtsverlauf</h2><span class="sub">Punkte = Messung · Linie = 7-Tage-Schnitt · Fläche = Zielkorridor</span></div>' + weightChart(ws) + '</div>';
    h += '<div class="card"><div class="card-head"><h2>Messung eintragen</h2></div><div class="btn-row"><input type="date" class="inp" id="w-date" value="' + todayIso() + '" style="color-scheme:dark;background:rgba(255,255,255,.05);border:1px solid var(--line-2);border-radius:9px;padding:7px 9px" aria-label="Datum"><input class="g-input" id="w-kg" inputmode="decimal" placeholder="kg" style="width:90px;padding:8px" aria-label="Gewicht in kg"><button class="btn primary" data-act="weight-add">Speichern</button></div>' +
      '<table class="data" style="margin-top:12px"><tbody>' + ws.slice().sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 12).map((e) => '<tr><td>' + dateLabel(e.date, { weekday: 'short', day: 'numeric', month: 'short' }) + (e.note ? '<div class="sub">' + esc(e.note) + '</div>' : '') + '</td><td class="r num">' + fmt(e.kg, 1) + ' kg</td><td class="r"><button class="btn small ghost" data-act="weight-del" data-v="' + e.date + '">Löschen</button></td></tr>').join('') + '</tbody></table></div></div>';
    h += '<div class="note section">Ernährungsdaten ersetzen keine ärztliche Betreuung. Trainingsbelastung bitte erst steigern, wenn ärztlich abgeklärt ist, dass nichts dagegen spricht.</div>';
    return h;
  }

  // ---------- Ansicht: Einstellungen ----------
  function field(label, path, value, opts) {
    opts = opts || {};
    const id = 'f-' + path.replace(/\./g, '-');
    if (opts.options) return '<div class="field"><label for="' + id + '">' + label + '</label><select id="' + id + '" data-change="set" data-path="' + path + '">' + opts.options.map(([v, l]) => '<option value="' + v + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' + (opts.hint ? '<span class="hint">' + opts.hint + '</span>' : '') + '</div>';
    return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" inputmode="decimal" data-change="set" data-path="' + path + '" data-min="' + (opts.min !== undefined ? opts.min : 0) + '" data-max="' + (opts.max || 100000) + '" value="' + fmt(value, opts.d || 0) + '">' + (opts.hint ? '<span class="hint">' + opts.hint + '</span>' : '') + '</div>';
  }
  // ---------- Konten (nur Admin) ----------
  let ACCOUNTS = null;
  async function loadAccounts() {
    const r = await API.call('GET', '/api/users');
    if (r.ok) { ACCOUNTS = r.data; if (ui.view === 'einstellungen') render(); }
  }
  function accountsCard() {
    if (!ME || !isAdmin()) return '';
    if (!ACCOUNTS) { setTimeout(loadAccounts, 0); return '<div class="card section"><div class="card-head"><h2>Konten</h2></div><div class="sub">Lade …</div></div>'; }
    const byPid = Object.fromEntries(ACCOUNTS.users.map((u) => [u.pid, u]));
    let h = '<div class="card section"><div class="card-head"><h2>Konten &amp; Logins</h2><span class="sub">Jede Person hat ihren eigenen Login. Nur du siehst beide.</span></div>';
    Object.keys(state.persons).forEach((pid) => {
      const u = byPid[pid]; const inv = ACCOUNTS.invites.find((i) => i.pid === pid);
      h += '<div class="meal-row" style="grid-template-columns:auto 1fr auto"><i class="pdot ' + pid + '" style="width:12px;height:12px"></i><div><div class="name">' + esc(state.persons[pid].name) + '</div><div class="sub">' +
        (u ? esc(u.email) + ' · ' + (u.role === 'admin' ? 'Admin' : 'App-Konto') : inv ? 'Einladung offen bis ' + new Date(inv.expires).toLocaleDateString('de-DE') : 'Noch kein Konto') + '</div>' +
        (!u && inv ? '<div style="margin-top:8px;display:flex;gap:8px;align-items:center"><code style="font:600 20px var(--font-display);letter-spacing:.08em">' + esc(inv.code) + '</code><button class="btn small" data-act="acc-copy" data-v="' + esc(inv.code) + '">Kopieren</button></div><div class="sub" style="margin-top:4px">In der App auf „Registrieren“ tippen und diesen Code eingeben.</div>' : '') + '</div><div>' +
        (u ? (u.role === 'admin' ? '' : '<button class="btn small ghost" data-act="acc-reset" data-v="' + esc(u.id) + '">Login entfernen</button>') : '<button class="btn small primary" data-act="acc-invite" data-v="' + pid + '">' + (inv ? 'Neuer Code' : 'Einladen') + '</button>') + '</div></div>';
    });
    return h + '</div>';
  }

  function viewSettings() {
    const s = state.settings, pr = P(), p = pr.profile, t = pr.targets;
    let h = hero('Einstellungen', 'Alle Ziele sind Startwerte – passe sie an, wenn dein Gewichtstrend es zeigt');
    h += '<div class="grid two"><div class="stack">';
    h += '<div class="card"><div class="card-head"><h2>Profil von ' + esc(pr.name) + '</h2><span class="sub">umschalten oben rechts</span></div><div class="form-grid">' +
      '<div class="field"><label for="f-name">Name</label><input id="f-name" data-change="person-name" value="' + esc(pr.name) + '" maxlength="24"></div>' +
      field('Ziel', 'person.goal', pr.goal, { options: [['aufbau', 'Muskelaufbau'], ['halten', 'Gewicht halten'], ['abnehmen', 'Abnehmen']] }) +
      field('Geschlecht (für Referenzwerte)', 'person.sex', pr.sex, { options: [['m', 'Männlich'], ['w', 'Weiblich']] }) +
      field('Alter', 'person.profile.age', p.age, { min: 14, max: 99 }) + field('Größe (cm)', 'person.profile.heightCm', p.heightCm, { min: 120, max: 230 }) +
      field('Gewicht (kg)', 'person.profile.weightKg', p.weightKg, { min: 35, max: 250, d: 1, hint: 'Startwert ca., für Berechnungen' }) +
      field('Training pro Woche', 'person.profile.trainingPerWeek', p.trainingPerWeek, { min: 0, max: 14 }) +
      field('Aktivität im Alltag', 'person.profile.activity', p.activity, { options: [['niedrig', 'Niedrig (Büro)'], ['mittel', 'Mittel'], ['hoch', 'Hoch']] }) + '</div>' +
      '<label class="btn-row" style="margin-top:12px;font-size:13.5px"><input type="checkbox" data-change="person-autoscale"' + (pr.autoScale ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:var(--accent)"> Portionen im Wochenplan automatisch auf meine Kalorien skalieren</label></div>';
    h += '<div class="card"><div class="card-head"><h2>Ziele pro Tag</h2></div><div class="form-grid">' +
      field('Kalorien (kcal)', 'person.targets.kcal', t.kcal, { min: 1200, max: 6000, hint: 'Startwert – nach 2–3 Wochen Gewichtstrend anpassen' }) +
      field('Protein (g)', 'person.targets.protein', t.protein, { min: 40, max: 350, hint: '≈ ' + fmt(t.protein / p.weightKg, 1) + ' g pro kg Körpergewicht' }) +
      field('Fett (g)', 'person.targets.fat', t.fat, { min: 30, max: 250, hint: '≈ ' + fmt(t.fat * 9 / t.kcal * 100) + ' % der Energie' }) +
      '<div class="field"><label>Kohlenhydrate (automatisch)</label><div class="calc-out num">' + fmt(TARGETS.carbs, 1) + ' g</div><span class="hint">(' + fmt(t.kcal) + ' − ' + fmt(t.protein) + '×4 − ' + fmt(t.fat) + '×9) / 4</span></div>' +
      field('Ballaststoffe (g)', 'person.targets.fiber', t.fiber, { min: 10, max: 80, hint: 'Bei bisher wenig: schrittweise steigern' }) +
      field('Obst + Gemüse mind. (g)', 'person.targets.fruitVeg', t.fruitVeg, { min: 0, max: 2000, hint: 'Kartoffeln zählen nicht' }) +
      field('Gewicht min. (% / Woche)', 'person.targets.gainPctPerWeekMin', t.gainPctPerWeekMin, { min: -1, max: 1, d: 2, hint: 'negativ = abnehmen' }) +
      field('Gewicht max. (% / Woche)', 'person.targets.gainPctPerWeekMax', t.gainPctPerWeekMax, { min: -1, max: 1, d: 2 }) + '</div>' +
      (TARGETS.warning ? '<div class="note" style="margin-top:10px">' + TARGETS.warning + '</div>' : '') + '</div>';
    h += '<div class="card"><div class="card-head"><h2>Ernährungspräferenzen</h2></div><div class="chips">' + ['Rind, Hähnchen, Lachs, Forelle, Kabeljau, Garnelen, Eier', 'Reis, Kartoffeln, Pasta, Sauerteig'].map((x) => '<span class="pill" data-s="good">' + x + '</span>').join('') + ['Kein Tofu / Tempeh', 'Kein Quinoa', 'Kein Fleischersatz', 'Kein Quark als Hauptmahlzeit'].map((x) => '<span class="pill" data-s="none">' + x + '</span>').join('') + '</div>' +
      '<label class="btn-row" style="margin-top:12px;font-size:13.5px"><input type="checkbox" data-change="set-bool" data-path="prefs.showDairySnack"' + (s.prefs.showDairySnack ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:var(--accent)"> Skyr-Snack als optionale Alternative anzeigen</label></div>';
    h += '</div><div class="stack">';
    h += '<div class="card"><div class="card-head"><h2>Währung &amp; Preise</h2></div><div class="form-grid">' +
      field('Preisszenario', 'scenario', s.scenario, { options: [['gut', 'Gut'], ['premium', 'Premium'], ['luxus', 'Luxus']] }) +
      field('Wechselkurs (Kč pro €)', 'currency.rate', s.currency.rate, { min: 1, max: 100, d: 2, hint: 'Manuell, kein Live-Kurs' }) +
      field('EUR zusätzlich anzeigen', 'currency.showEur', s.currency.showEur ? 'ja' : 'nein', { options: [['ja', 'Ja'], ['nein', 'Nein']] }) + '</div></div>';
    h += '<div class="card"><div class="card-head"><h2>Nährwertquelle</h2><span class="demo-badge">DEMO-DATEN</span></div><p class="sub" style="font-size:13px;margin:0 0 10px">Lokaler Datensatz mit ' + Object.keys(FOODS).length + ' Lebensmitteln, Werte pro 100 g essbarer Anteil. An USDA FoodData Central (SR Legacy) angelehnt, aber nicht live abgerufen und nicht einzeln geprüft. Fehlende Werte bleiben leer (unbekannt). Für exakte Werte: Etikett deines Produkts eintragen.</p>' +
      '<details><summary class="btn small" style="display:inline-flex">Lebensmittel-Tabelle bearbeiten</summary><div class="table-wrap" style="margin-top:10px"><table class="data"><thead><tr><th>Lebensmittel</th><th>Basis</th><th class="r">kcal</th><th class="r">P</th><th class="r">KH</th><th class="r">F</th><th class="r">Bal</th><th>Quelle</th></tr></thead><tbody>' +
      Object.values(FOODS).sort((a, b) => a.name.localeCompare(b.name, 'de')).map((f) => '<tr><td>' + esc(f.name) + '</td><td class="sub">' + f.basis + '</td>' + ['kcal', 'protein', 'carbs', 'fat', 'fiber'].map((k) => '<td class="r"><input class="price-input" style="width:60px" inputmode="decimal" data-change="food" data-food="' + f.id + '" data-key="' + k + '" value="' + fmtAuto(f.n[k]) + '" aria-label="' + esc(f.name) + ' ' + k + '"></td>').join('') + '<td>' + (state.settings.rohlik.sources[f.id] ? '<span class="pill" data-s="good" data-tip="' + esc('Makros vom Rohlik-Etikett: ' + state.settings.rohlik.sources[f.id].name + ' (' + state.settings.rohlik.sources[f.id].at + '). Mikronährstoffe weiter Demo-Werte.') + '">Rohlik-Etikett</span>' : '<span class="pill" data-s="' + (f.quality === 'schaetzung' ? 'warn' : 'none') + '" data-tip="' + esc(f.source + (f.note ? '\n' + f.note : '')) + '">' + (f.quality === 'schaetzung' ? 'Schätzung' : 'Demo/USDA') + '</span>') + '</td></tr>').join('') + '</tbody></table></div></details></div>';
    h += '<div class="card"><div class="card-head"><h2>Datenschutz &amp; Daten</h2></div><p class="sub" style="font-size:13px;margin:0 0 12px">Deine Einträge liegen privat auf deinem eigenen Server (nur für dich lesbar) und zusätzlich in diesem Browser. Es werden keine Daten an externe Dienste geschickt. Medizinische Werte werden nicht erfasst.</p>' +
      '<div class="btn-row"><button class="btn" data-act="export-json">JSON speichern</button><button class="btn" data-act="export-copy">JSON kopieren</button><label class="btn" for="imp-file">JSON importieren</label><input type="file" id="imp-file" accept=".json,application/json" data-change="import-file" style="display:none"><button class="btn ghost" data-act="reset-ask">Alles zurücksetzen</button></div>' +
      '<div class="sub" style="margin-top:10px">Status: <span class="sync" id="sync2" data-s="' + ui.sync + '"><i></i>' + SYNC_LABEL[ui.sync] + '</span></div></div>';
    h += '</div></div>';
    h += accountsCard();
    return h;
  }

  // ---------- Modals ----------
  function modalHtml() {
    const m = ui.modal; if (!m) return '';
    let body = '';
    const head = (title, sub) => '<div class="modal-head"><div>' + (sub ? '<div class="eyebrow">' + sub + '</div>' : '') + '<h2>' + title + '</h2></div><button class="icon-btn" data-act="modal-close" aria-label="Schließen">' + icon('x') + '</button></div>';
    if (m.type === 'recipe') body = recipeModal(m.id);
    else if (m.type === 'swap') {
      const slot = D.SLOTS.find((s) => s.id === m.slot);
      body = head('Gericht tauschen', D.DAYS[ui.planDay] + ' · ' + slot.label) + '<div class="grid">' + RECIPES.filter((r) => r.slot === slot.recipeSlot && (!r.optional || state.settings.prefs.showDairySnack)).map((r) => {
        const ings = C.entryIngredients({ recipeId: r.id, portions: 1 }, RBYID);
        const cur = state.plan[ui.planDay][m.slot].recipeId === r.id;
        return '<button class="card" style="display:grid;grid-template-columns:52px 1fr;gap:12px;align-items:center;text-align:left;cursor:pointer' + (cur ? ';border-color:rgba(54,196,143,.6)' : '') + '" data-act="swap-pick" data-id="' + r.id + '">' + plateSvg(ings, 48) + '<div><b>' + esc(r.name) + '</b>' + (cur ? ' <span class="pill" data-s="good">aktuell</span>' : '') + macroLine(C.sumNutrients(ings, FOODS, C.MACRO_KEYS).totals) + '</div></button>';
      }).join('') + '</div>';
    } else if (m.type === 'copy') {
      body = head('Mahlzeit kopieren', entryName(state.plan[ui.planDay][m.slot])) + '<p class="sub">Auf welchen Tag kopieren? (gleiche Mahlzeit, ersetzt den Eintrag dort)</p><div class="btn-row">' + D.DAYS.map((d, i) => i === ui.planDay ? '' : '<button class="btn" data-act="copy-to" data-v="' + i + '">' + d + '</button>').join('') + '</div>';
    } else if (m.type === 'adjust') {
      const r = m.result;
      const row = (k, l, u) => { const tg = TARGETS[k]; return '<tr><td>' + l + '</td><td class="r num">' + fmt(r.before[k]) + ' ' + u + '</td><td class="r num"><b>' + fmt(r.after[k]) + ' ' + u + '</b></td><td class="r num">' + fmt(tg) + ' ' + u + '</td></tr>'; };
      body = head('Portionen an Tagesziel anpassen', D.DAYS[ui.planDay] + ' · Vorschlag') +
        '<p class="sub" style="font-size:13px">Angepasst werden nur Mittag und Abend: zuerst Fleisch/Fisch (Protein), dann Öl (Fett), dann Beilagen (Kalorien). Frühstück und Snack bleiben gleich. Gerundet auf alltagstaugliche Mengen.</p>' +
        '<table class="data"><thead><tr><th>Wert</th><th class="r">Vorher</th><th class="r">Nachher</th><th class="r">Ziel</th></tr></thead><tbody>' + row('kcal', 'Kalorien', 'kcal') + row('protein', 'Protein', 'g') + row('carbs', 'Kohlenhydrate', 'g') + row('fat', 'Fett', 'g') + '</tbody></table>' +
        '<h3 style="margin:16px 0 6px">Änderungen</h3>' + (r.changes.length ? '<table class="data"><tbody>' + r.changes.map((c) => '<tr><td>' + slotLabel(c.slot) + '</td><td>' + esc(foodName(c.foodId)) + '</td><td class="r num">' + fmt(c.before) + ' g → <b>' + fmt(c.after) + ' g</b></td><td class="r num ' + (c.after > c.before ? 'diff-up' : 'diff-down') + '">' + (c.after > c.before ? '+' : '−') + fmt(Math.abs(c.after - c.before)) + ' g</td></tr>').join('') + '</tbody></table>' : '<div class="empty">Der Tag liegt schon nah genug an deinen Zielen – keine Änderung nötig.</div>') +
        '<div class="btn-row" style="margin-top:16px;justify-content:flex-end"><button class="btn ghost" data-act="modal-close">Verwerfen</button>' + (r.changes.length ? '<button class="btn primary" data-act="adjust-apply">Übernehmen</button>' : '') + '</div>';
    } else if (m.type === 'confirm') {
      body = head(m.title) + '<p>' + m.text + '</p><div class="btn-row" style="justify-content:flex-end"><button class="btn ghost" data-act="modal-close">Abbrechen</button><button class="btn primary" data-act="' + m.act + '">' + m.ok + '</button></div>';
    } else if (m.type === 'text') {
      body = head(m.title) + '<p class="sub">Kopieren hat nicht geklappt – markiere den Text und kopiere ihn manuell.</p><textarea readonly>' + esc(m.text) + '</textarea>';
    }
    return '<div class="overlay" data-act="overlay"><div class="modal" role="dialog" aria-modal="true">' + body + '</div></div>';
  }

  // ---------- Render ----------
  function navHtml() {
    return VIEWS.map(([id, label]) => '<button class="nav-btn" data-act="nav" data-v="' + id + '"' + (ui.view === id ? ' aria-current="page"' : '') + '>' + icon(id) + '<span>' + label + '</span></button>').join('');
  }
  function personSwitch(where) {
    if (!isAdmin()) return '';
    return '<div class="person-switch ' + where + '" role="group" aria-label="Person">' + Object.keys(state.persons).map((pid) =>
      '<button data-act="person" data-v="' + pid + '" aria-pressed="' + (state.active === pid) + '"><i class="pdot ' + pid + '"></i>' + esc(state.persons[pid].name) + '</button>').join('') + '</div>';
  }
  function render() {
    const side = document.getElementById('side');
    side.innerHTML = '<div class="brand"><div class="brand-mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#07140f" stroke-width="2.4" stroke-linecap="round"><path d="M5 19c8 0 14-6 14-14C11 5 5 11 5 19z"/><path d="M5 19l7-7"/></svg></div><div><b>Ernährung</b><small>' + (state.active === 'freundin' ? '♡ ' + esc(P().name) : esc(P().name) + ' · Muskelaufbau') + '</small></div></div>' + navHtml() +
      personSwitch('in-side') + '<div class="side-foot"><span class="sync" id="sync" data-s="' + ui.sync + '"><i></i><span>' + SYNC_LABEL[ui.sync] + '</span></span><div style="margin-top:6px">Nährwerte: Demo-/Richtwerte</div>' + (ME ? '<div class="acct"><span>' + esc(ME.name) + (isAdmin() ? ' · Admin' : '') + '</span><button class="btn small ghost" data-act="logout">Abmelden</button></div>' : '') + '</div>';
    document.getElementById('mobnav').innerHTML = navHtml();
    const fn = { uebersicht: viewOverview, wochenplan: viewPlan, naehrstoffe: viewNutrients, einkauf: viewShop, rezepte: viewRecipes, fortschritt: viewProgress, einstellungen: viewSettings }[ui.view] || viewOverview;
    const main = document.getElementById('main');
    const y = window.scrollY;
    main.innerHTML = '<div class="top-switch">' + personSwitch('top') + '</div>' + fn();
    document.getElementById('modal-root').innerHTML = modalHtml();
    window.scrollTo(0, y);
  }

  // ---------- Aktionen ----------
  let toastTimer;
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 2200);
  }
  async function copyText(text, title) {
    try { await navigator.clipboard.writeText(text); toast('In die Zwischenablage kopiert'); }
    catch (e) { ui.modal = { type: 'text', title: title || 'Text', text }; render(); }
  }
  async function saveFile(filename, data, fallbackTitle) {
    try {
      const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
      if (!dl) return copyText(data, fallbackTitle);
      await dl.save({ filename, data });
    } catch (e) {
      if (e && e.code === 'declined') return;
      copyText(data, fallbackTitle);
    }
  }
  function ensureLog(iso) { const l = L(); if (!l[iso]) l[iso] = { meals: [], water: 0, coffee: [] }; return l[iso]; }
  const nowTime = () => new Date().toTimeString().slice(0, 5);
  function logPlanned(iso, slot) {
    const wd = C.weekdayIndex(iso);
    const log = ensureLog(iso);
    log.meals = log.meals.filter((m) => !(m.fromPlan && m.slot === slot));
    log.meals.push({ id: rid(), slot, fromPlan: true, name: entryName(state.plan[wd][slot]), recipeId: state.plan[wd][slot].recipeId, ingredients: plannedSlots(wd)[slot] || [], time: iso === todayIso() ? nowTime() : '' });
    const order = D.SLOTS.map((s) => s.id);
    log.meals.sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
  }
  function setEntryIngs(slot, ings) { const e = state.plan[ui.planDay][slot]; e.ingredients = ings; e.portions = 1; }
  function setPath(obj, path, val) { const ks = path.split('.'); let o = obj; ks.slice(0, -1).forEach((k) => { o = o[k]; }); o[ks[ks.length - 1]] = val; }

  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act, v = el.dataset.v;
    if (act === 'overlay') { if (ev.target === el) { ui.modal = null; render(); } return; }
    if (act === 'open-recipe' && ev.target.closest('.star')) return;
    switch (act) {
      case 'nav': location.hash = v; break;
      case 'person': if (isAdmin() && state.persons[v] && v !== state.active) { state.active = v; ui.modal = null; derive(); render(); saveLocal(); } break;
      case 'logout': API.logout(); break;
      case 'acc-invite': {
        const r = await API.call('POST', '/api/invites', { pid: el.dataset.v || 'freundin' });
        if (!r.ok) { toast(r.data.error || 'Ging nicht'); break; }
        await loadAccounts(); toast('Einladungscode erstellt'); break;
      }
      case 'acc-reset': {
        if (!window.confirm('Konto wirklich entfernen? Die Ernährungsdaten bleiben erhalten, nur der Login wird gelöscht.')) break;
        const r = await API.call('POST', '/api/users/reset', { id: el.dataset.v });
        if (!r.ok) { toast(r.data.error || 'Ging nicht'); break; }
        await loadAccounts(); toast('Konto entfernt – Daten bleiben erhalten'); break;
      }
      case 'acc-copy': copyText(el.dataset.v, 'Einladungscode'); break;
      case 'date-step': ui.date = C.addDays(ui.date, Number(v)); render(); break;
      case 'date-today': ui.date = todayIso(); render(); break;
      case 'period': ui.period = v; render(); break;
      case 'mode': ui.mode = v; render(); break;
      case 'nutr-period': ui.nutrPeriod = v; render(); break;
      case 'nutr-filter': ui.nutrFilter = v; render(); break;
      case 'goto-plan': ui.planDay = Number(v); location.hash = 'wochenplan'; break;
      case 'log-slot': logPlanned(ui.date, v); commit('logs'); toast(slotLabel(v) + ' als gegessen geloggt'); break;
      case 'log-all': D.SLOTS.forEach((s) => logPlanned(ui.date, s.id)); commit('logs'); break;
      case 'unlog': { ev.preventDefault(); const l = logOf(ui.date); if (l) { l.meals = l.meals.filter((m) => m.id !== el.dataset.id); commit('logs'); } break; }
      case 'add-food': {
        const fid = document.getElementById('add-food').value, g = C.cleanGrams(parseNum(document.getElementById('add-grams').value));
        const slot = document.getElementById('add-slot').value; ui.addSlot = slot;
        if (!g) { toast('Bitte eine Grammzahl über 0 eingeben'); break; }
        ensureLog(ui.date).meals.push({ id: rid(), slot, name: foodName(fid), ingredients: [{ foodId: fid, grams: g }], time: ui.date === todayIso() ? nowTime() : '' });
        commit('logs'); break;
      }
      case 'water': { const l = ensureLog(ui.date); l.water = Math.max(0, (l.water || 0) + Number(v)); commit('logs'); break; }
      case 'coffee-add': { const mg = parseNum(document.getElementById('caf-mg').value); const l = ensureLog(ui.date); (l.coffee = l.coffee || []).push({ t: nowTime(), mg: isFinite(mg) && mg > 0 && mg < 1000 ? mg : null }); commit('logs'); break; }
      case 'coffee-remove': { const l = logOf(ui.date); if (l && l.coffee) { l.coffee.pop(); commit('logs'); } break; }
      case 'plan-day': ui.planDay = Number(v); render(); break;
      case 'portion': { const e = state.plan[ui.planDay][el.dataset.slot]; e.portions = C.clamp(Math.round(((e.portions || 1) + Number(v)) * 100) / 100, 0.25, 3); commit('plan'); break; }
      case 'swap': ui.modal = { type: 'swap', slot: el.dataset.slot }; render(); break;
      case 'swap-pick': state.plan[ui.planDay][ui.modal.slot] = { recipeId: el.dataset.id, portions: 1, ingredients: null }; ui.modal = null; commit('plan'); break;
      case 'copy': ui.modal = { type: 'copy', slot: el.dataset.slot }; render(); break;
      case 'copy-to': { const s = ui.modal.slot; state.plan[Number(v)][s] = clone(state.plan[ui.planDay][s]); ui.modal = null; commit('plan'); toast('Kopiert nach ' + D.DAYS[Number(v)]); break; }
      case 'reset-entry': state.plan[ui.planDay][el.dataset.slot] = { recipeId: state.plan[ui.planDay][el.dataset.slot].recipeId, portions: 1, ingredients: null }; commit('plan'); break;
      case 'plan-log': { const iso = C.weekDates(ui.date)[ui.planDay]; logPlanned(iso, el.dataset.slot); commit('logs'); toast('Geloggt für ' + dateLabel(iso, { weekday: 'short', day: 'numeric', month: 'numeric' })); break; }
      case 'adjust': ui.modal = { type: 'adjust', factor: personFactor(ui.planDay), result: C.adjustDayToTargets(plannedSlots(ui.planDay), FOODS, TARGETS) }; render(); break;
      case 'adjust-apply': { const r = ui.modal.result, f = ui.modal.factor || 1; ['mittag', 'abend'].forEach((s) => setEntryIngs(s, r.slots[s].map((i) => Object.assign({}, i, { grams: Math.round(i.grams / f * 10) / 10 })))); ui.modal = null; commit('plan'); toast('Portionen angepasst (für euch beide)'); break; }
      case 'plan-reset-ask': ui.modal = { type: 'confirm', title: 'Wochenplan zurücksetzen?', text: 'Alle Tausch- und Mengenänderungen im Wochenplan gehen verloren. Tagebuch und Rezepte bleiben.', ok: 'Zurücksetzen', act: 'plan-reset' }; render(); break;
      case 'plan-reset': state.plan = clone(D.DEFAULT_PLAN); ui.modal = null; commit('plan'); break;
      case 'scenario': state.settings.scenario = v; commit('settings'); break;
      case 'eur-toggle': state.settings.currency.showEur = !state.settings.currency.showEur; commit('settings'); break;
      case 'shop-copy': copyText(shopText(false), 'Einkaufsliste'); break;
      case 'shop-csv': saveFile('einkaufsliste.csv', '﻿' + shopText(true), 'Einkaufsliste (CSV)'); break;
      case 'shop-reset': state.settings.checks = {}; commit('settings'); break;
      case 'recipe-filter': ui.recipeFilter = v; render(); break;
      case 'open-recipe': ui.modal = { type: 'recipe', id: el.dataset.id }; render(); break;
      case 'fav': { ev.stopPropagation(); const f = state.settings.favorites; const i = f.indexOf(el.dataset.id); if (i >= 0) f.splice(i, 1); else f.push(el.dataset.id); commit('settings'); break; }
      case 'recipe-to-plan': { const d = Number(document.getElementById('rp-day').value), s = document.getElementById('rp-slot').value; state.plan[d][s] = { recipeId: el.dataset.id, portions: 1, ingredients: null }; ui.modal = null; commit('plan'); toast('Im Plan: ' + D.DAYS[d] + ', ' + slotLabel(s)); break; }
      case 'recipe-reset': delete state.recipes[el.dataset.id]; commit('recipes'); break;
      case 'weight-add': {
        const d = document.getElementById('w-date').value, kg = parseNum(document.getElementById('w-kg').value);
        if (!d || !(kg > 30 && kg < 300)) { toast('Bitte ein Gewicht zwischen 30 und 300 kg eingeben'); break; }
        state.weights[state.active] = W().filter((w) => w.date !== d).concat([{ date: d, kg: Math.round(kg * 10) / 10 }]);
        P().profile.weightKg = Math.round(C.movingAverage(W(), 7).slice(-1)[0].avg * 10) / 10;
        commit('settings'); break;
      }
      case 'weight-del': state.weights[state.active] = W().filter((w) => w.date !== v); commit('settings'); break;
      case 'export-json': saveFile('ernaehrung-daten.json', JSON.stringify(state, null, 2), 'Daten (JSON)'); break;
      case 'export-copy': copyText(JSON.stringify(state), 'Daten (JSON)'); break;
      case 'reset-ask': ui.modal = { type: 'confirm', title: 'Alles zurücksetzen?', text: 'Plan, Tagebuch, Gewicht, Preise und Einstellungen werden auf die Startwerte gesetzt. Exportiere vorher, wenn du etwas behalten willst.', ok: 'Alles zurücksetzen', act: 'reset-all' }; render(); break;
      case 'reset-all': { const u = Date.now(); state = defaultState(); DOCS.forEach((n) => { state.updated[n] = u; }); ui.modal = null; commit(...DOCS); break; }
      case 'modal-close': ui.modal = null; render(); break;
    }
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-change]');
    if (!el) return;
    const kind = el.dataset.change;
    const num = parseNum(el.value);
    switch (kind) {
      case 'date': if (el.value) { ui.date = el.value; render(); } break;
      case 'log-gram': { const m = logOf(ui.date).meals.find((x) => x.id === el.dataset.id); if (m) { m.ingredients[Number(el.dataset.idx)].grams = C.cleanGrams(num); commit('logs'); } break; }
      case 'plan-gram': { const f = personFactor(ui.planDay); const ings = plannedSlotsBase(ui.planDay)[el.dataset.slot]; ings[Number(el.dataset.idx)].grams = Math.round(C.cleanGrams(num) / f * 10) / 10; setEntryIngs(el.dataset.slot, ings); commit('plan'); break; }
      case 'recipe-gram': {
        const id = el.dataset.id; const ings = C.entryIngredients({ recipeId: id, portions: 1 }, RBYID);
        ings[Number(el.dataset.idx)].grams = C.cleanGrams(num); state.recipes[id] = { ingredients: ings }; commit('recipes'); break;
      }
      case 'recipe-protein': {
        const id = el.dataset.id; const ings = C.entryIngredients({ recipeId: id, portions: 1 }, RBYID);
        const i = ings.find((x) => FOODS[x.foodId].category === 'fleisch' || FOODS[x.foodId].category === 'fisch');
        const nf = FOODS[el.value]; if (!i || !nf) break;
        const prot = i.grams * FOODS[i.foodId].n.protein / 100;
        i.foodId = nf.id; i.grams = C.clamp(C.roundTo(prot / nf.n.protein * 100, 10), 120, 350); i.preparation = '';
        state.recipes[id] = { ingredients: ings }; commit('recipes'); toast('Protein getauscht – Menge für gleiche Proteinmenge angepasst'); break;
      }
      case 'set': {
        let path = el.dataset.path, target = state.settings;
        if (path.startsWith('person.')) { target = P(); path = path.slice(7); }
        if (['scenario', 'profile.activity', 'goal', 'sex'].includes(path)) {
          setPath(target, path, el.value);
          if (path === 'goal') { const b = { aufbau: [0.1, 0.25], halten: [-0.1, 0.1], abnehmen: [-0.75, -0.25] }[el.value]; P().targets.gainPctPerWeekMin = b[0]; P().targets.gainPctPerWeekMax = b[1]; }
          commit('settings'); break;
        }
        if (path === 'currency.showEur') { state.settings.currency.showEur = el.value === 'ja'; commit('settings'); break; }
        if (!isFinite(num)) { toast('Bitte eine Zahl eingeben'); render(); break; }
        const v = C.clamp(num, Number(el.dataset.min), Number(el.dataset.max));
        if (v !== num) toast('Wert auf ' + fmt(v, 2) + ' begrenzt');
        setPath(target, path, v); commit('settings'); break;
      }
      case 'set-bool': setPath(state.settings, el.dataset.path, el.checked); commit('settings'); break;
      case 'person-name': P().name = (el.value || '').trim().slice(0, 24) || (state.active === 'ilias' ? 'Ilias' : 'Freundin'); commit('settings'); break;
      case 'person-autoscale': P().autoScale = el.checked; commit('settings'); break;
      case 'rate': if (num > 0 && num < 100) { state.settings.currency.rate = num; commit('settings'); } else { toast('Kurs zwischen 1 und 100'); render(); } break;
      case 'price': {
        if (!(num >= 0)) { toast('Preis muss 0 oder größer sein'); render(); break; }
        const f = FOODS[el.dataset.food]; const p = Object.assign({}, state.settings.priceOverrides[f.id] || f.price);
        p[el.dataset.sc] = num; state.settings.priceOverrides[f.id] = p; commit('settings'); break;
      }
      case 'food': {
        if (!(num >= 0)) { toast('Wert muss 0 oder größer sein'); render(); break; }
        const ov = state.settings.foodOverrides[el.dataset.food] = state.settings.foodOverrides[el.dataset.food] || {};
        ov[el.dataset.key] = num; commit('settings'); break;
      }
      case 'shop-check': state.settings.checks[el.dataset.food] = el.checked; commit('settings'); break;
      case 'import-file': {
        const file = el.files && el.files[0]; if (!file) break;
        file.text().then((txt) => {
          try {
            const p = JSON.parse(txt);
            if (!p || !p.plan || !p.settings) throw new Error('format');
            const u = Date.now();
            DOCS.forEach((n) => { applyDoc(n, p); state.updated[n] = u; });
            commit(...DOCS); toast('Daten importiert');
          } catch (e) { toast('Datei konnte nicht gelesen werden (kein Dashboard-Export?)'); }
        });
        break;
      }
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && ui.modal) { ui.modal = null; render(); }
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('.recipe-card')) { ev.preventDefault(); ev.target.click(); }
  });

  // Tooltip
  const tip = document.getElementById('tip');
  let tipEl = null;
  function showTip(el, x, y) {
    tipEl = el; tip.textContent = el.getAttribute('data-tip'); tip.classList.add('show');
    const r = tip.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    tip.style.left = Math.max(8, left) + 'px'; tip.style.top = Math.max(8, top) + 'px';
  }
  document.addEventListener('mousemove', (ev) => {
    const el = ev.target.closest && ev.target.closest('[data-tip]');
    if (el) showTip(el, ev.clientX, ev.clientY);
    else if (tipEl) { tip.classList.remove('show'); tipEl = null; }
  });
  document.addEventListener('touchstart', (ev) => {
    const el = ev.target.closest && ev.target.closest('[data-tip]');
    if (el && !el.closest('button')) { const t = ev.touches[0]; showTip(el, t.clientX, t.clientY); }
    else { tip.classList.remove('show'); tipEl = null; }
  }, { passive: true });

  // Routing
  function route() { const h = (location.hash || '').slice(1); ui.view = VIEWS.some((v) => v[0] === h) ? h : 'uebersicht'; ui.modal = null; render(); window.scrollTo(0, 0); }
  window.addEventListener('hashchange', route);

  // Start
  loadLocal(); derive(); route();
  setTimeout(() => connectDb(0), 0);
})();
