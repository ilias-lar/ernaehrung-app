'use strict';
/**
 * Fachlogik für die API: gleiche Rechenwege wie im Web-Dashboard
 * (shared/calc.js + shared/data.js), nur serverseitig.
 */
const D = require('../../shared/data.js');
const C = require('../../shared/calc.js');

const PIDS = ['ilias', 'freundin'];
/** Uhrzeiten der Mahlzeiten (für „Nächste Mahlzeit“, Widgets und Dynamic Island). */
const SLOT_TIMES = { fruehstueck: '08:00', mittag: '13:00', snack: '16:30', abend: '19:00' };

const clone = (o) => JSON.parse(JSON.stringify(o));

function defaultState() {
  return {
    settings: Object.assign(clone(D.DEFAULT_SETTINGS), { priceOverrides: {}, foodOverrides: {}, favorites: [], checks: {}, slotTimes: clone(SLOT_TIMES) }),
    weights: { ilias: [], freundin: [] },
    persons: clone(D.DEFAULT_PERSONS),
    plan: clone(D.DEFAULT_PLAN),
    recipes: {},
    logs: { ilias: {}, freundin: {} },
    updated: { settings: 0, plan: 0, recipes: 0, logs: 0 },
  };
}

/** Lebensmittel (mit Rohlik-/manuellen Korrekturen) und Rezepte (mit eigenen Änderungen). */
function context(state) {
  const foods = D.buildFoods();
  Object.entries((state.settings && state.settings.foodOverrides) || {}).forEach(([id, ov]) => { if (foods[id]) Object.assign(foods[id].n, ov); });
  const recipes = D.RECIPES.map((r) => (state.recipes && state.recipes[r.id]) ? Object.assign({}, r, state.recipes[r.id]) : r);
  return { foods, recipes, byId: Object.fromEntries(recipes.map((r) => [r.id, r])) };
}

function plannedSlotsBase(state, ctx, dayIdx) {
  const day = state.plan[dayIdx] || {}; const out = {};
  D.SLOTS.forEach((s) => { out[s.id] = C.entryIngredients(day[s.id], ctx.byId); });
  return out;
}

function personFactor(state, ctx, dayIdx, pid) {
  const person = state.persons[pid];
  if (!person || !person.autoScale) return 1;
  const base = C.sumNutrients([].concat(...Object.values(plannedSlotsBase(state, ctx, dayIdx))), ctx.foods, ['kcal']).totals.kcal;
  return C.dayScaleFactor(base, person.targets.kcal);
}

/** Geplante Zutaten je Mahlzeit, auf die Kalorien der Person skaliert. */
function plannedSlots(state, ctx, dayIdx, pid) {
  const base = plannedSlotsBase(state, ctx, dayIdx); const f = personFactor(state, ctx, dayIdx, pid);
  if (f === 1) return base;
  const out = {};
  Object.keys(base).forEach((k) => {
    out[k] = C.scaleIngredients(base[k], f, ctx.foods).map((i) => {
      const fd = ctx.foods[i.foodId];
      if (fd && fd.unit === 'stueck') return Object.assign(i, { preparation: Math.round(i.grams / fd.gramsPerPiece) + ' Stück' });
      if (/Stück|Frucht|Handvoll|Scheibe|Zehe|Wraps|Zitrone/.test(i.preparation || '')) return Object.assign(i, { preparation: '' });
      return i;
    });
  });
  return out;
}

const r0 = (x) => (C.isNum(x) ? Math.round(x) : null);
const r1 = (x) => (C.isNum(x) ? Math.round(x * 10) / 10 : null);
function macros(ings, foods) {
  const t = C.sumNutrients(ings, foods, C.MACRO_KEYS).totals;
  return { kcal: r0(t.kcal) || 0, protein: r0(t.protein) || 0, carbs: r0(t.carbs) || 0, fat: r0(t.fat) || 0, fiber: r0(t.fiber) || 0 };
}

const PROTEIN_CATS = { fleisch: 1, fisch: 1 };
function mainIngredient(ings, foods) {
  const prot = ings.filter((i) => foods[i.foodId] && PROTEIN_CATS[foods[i.foodId].category]).sort((a, b) => b.grams - a.grams)[0];
  const pick = prot || ings.slice().sort((a, b) => b.grams - a.grams)[0];
  return pick ? { name: foods[pick.foodId] ? foods[pick.foodId].name : pick.foodId, grams: r0(pick.grams) } : null;
}

function ingredientList(ings, foods) {
  return ings.map((i) => ({ foodId: i.foodId, name: foods[i.foodId] ? foods[i.foodId].name : i.foodId, grams: r0(i.grams), note: i.preparation || '' }));
}

/** Mikronährstoffe für eine Zutatenliste, relativ zur Referenz der Person. */
function micronutrients(ings, foods, person) {
  const refs = person.sex === 'w' ? D.REFERENCES_F : D.REFERENCES;
  const targets = C.deriveTargets(person.targets);
  const res = C.sumNutrients(ings, foods);
  return D.NUTRIENTS.filter((n) => n.group !== 'makro').map((n) => {
    const ref = C.referenceAmount(n.key, refs, targets);
    const kind = refs[n.key] ? refs[n.key].kind : null;
    const a = C.assessNutrient(res.totals[n.key], res.coverage[n.key], ref, kind);
    return { key: n.key, label: n.label, unit: n.unit, amount: r1(res.totals[n.key]), reference: ref, pct: r0(a.pct), status: a.status, isMax: kind === 'max' };
  });
}

function minutesOf(hhmm) { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); }

/**
 * Alles, was die App für „Heute“ braucht.
 * @param {object} state  gespeicherter Zustand
 * @param {string} pid    Person (ilias | freundin)
 * @param {string} iso    Datum JJJJ-MM-TT (lokal)
 * @param {number} nowMin Minuten seit Mitternacht (lokal), für „Nächste Mahlzeit“
 */
function today(state, pid, iso, nowMin) {
  const ctx = context(state);
  const person = state.persons[pid];
  const wd = C.weekdayIndex(iso);
  const slots = plannedSlots(state, ctx, wd, pid);
  const log = (state.logs[pid] || {})[iso] || { meals: [] };
  const times = Object.assign({}, SLOT_TIMES, state.settings.slotTimes || {});
  const day = state.plan[wd] || {};

  const meals = D.SLOTS.map((s) => {
    const ings = slots[s.id] || [];
    const entry = day[s.id];
    const recipe = entry && ctx.byId[entry.recipeId];
    const logged = log.meals.find((m) => m.slot === s.id && m.fromPlan);
    return Object.assign({ slot: s.id, label: s.label, time: times[s.id], name: recipe ? recipe.name : 'Frei', recipeId: entry ? entry.recipeId : null,
      done: !!logged, doneAt: logged ? logged.time || null : null, main: mainIngredient(ings, ctx.foods), ingredients: ingredientList(ings, ctx.foods),
      steps: recipe && recipe.steps ? recipe.steps : [] }, macros(ings, ctx.foods));
  });

  const eatenIngs = [].concat(...log.meals.map((m) => m.ingredients || []));
  const plannedIngs = [].concat(...Object.values(slots));
  const targets = C.deriveTargets(person.targets);
  const next = meals.find((m) => !m.done && minutesOf(m.time) + 90 >= nowMin) || meals.find((m) => !m.done) || null;
  const micros = micronutrients(plannedIngs, ctx.foods, person);
  const weights = (state.weights[pid] || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const trend = C.weeklyTrend(weights, 21);

  return {
    person: { id: pid, name: person.name, theme: pid, goal: person.goal },
    date: iso, weekday: D.DAYS[wd],
    targets: { kcal: r0(targets.kcal), protein: r0(targets.protein), carbs: r0(targets.carbs), fat: r0(targets.fat), fiber: r0(targets.fiber) },
    eaten: macros(eatenIngs, ctx.foods),
    planned: macros(plannedIngs, ctx.foods),
    meals,
    next: next ? { slot: next.slot, label: next.label, time: next.time, name: next.name, kcal: next.kcal, protein: next.protein, main: next.main } : null,
    micros,
    lowest: micros.filter((m) => !m.isMax && C.isNum(m.pct)).sort((a, b) => a.pct - b.pct).slice(0, 3),
    water: log.water || 0,
    weight: { latest: weights.length ? weights[weights.length - 1] : null, kgPerWeek: trend && C.isNum(trend.kgPerWeek) ? Math.round(trend.kgPerWeek * 100) / 100 : null, entries: weights.slice(-60) },
  };
}

/** Wochenplan der Person (Mo–So) mit skalierten Mengen und Makros. */
function week(state, pid) {
  const ctx = context(state);
  return D.DAYS.map((label, wd) => {
    const slots = plannedSlots(state, ctx, wd, pid); const day = state.plan[wd] || {};
    const meals = D.SLOTS.map((s) => {
      const entry = day[s.id]; const recipe = entry && ctx.byId[entry.recipeId]; const ings = slots[s.id] || [];
      return Object.assign({ slot: s.id, label: s.label, name: recipe ? recipe.name : 'Frei', main: mainIngredient(ings, ctx.foods), ingredients: ingredientList(ings, ctx.foods) }, macros(ings, ctx.foods));
    });
    return Object.assign({ index: wd, label, short: D.DAYS_SHORT[wd], meals }, macros([].concat(...Object.values(slots)), ctx.foods));
  });
}

/** Einkaufsliste der Woche für beide Personen (gemeinsam gekocht). */
function shopping(state) {
  const ctx = context(state);
  const lists = [].concat(...PIDS.filter((p) => state.persons[p]).map((pid) => [0, 1, 2, 3, 4, 5, 6].map((i) => [].concat(...Object.values(plannedSlots(state, ctx, i, pid))))));
  const items = C.aggregateShopping(lists, ctx.foods, state.settings.scenario, state.settings.priceOverrides);
  const checks = state.settings.checks || {};
  const groups = D.SHOP_GROUPS.map((g) => ({ id: g.id, label: g.label, items: items.filter((it) => g.cats.includes(ctx.foods[it.foodId].category)).map((it) => {
    const f = ctx.foods[it.foodId];
    const amount = f.unit === 'stueck' ? Math.ceil(it.pieces - 1e-9) + ' Stück' : it.purchaseG >= 1000 ? (Math.round(it.purchaseG / 10) / 100).toLocaleString('de-DE') + ' kg' : Math.ceil(it.purchaseG / 10) * 10 + ' g';
    return { foodId: it.foodId, name: f.name, amount, costCzk: r0(it.cost), checked: !!checks[it.foodId] };
  }) })).filter((g) => g.items.length);
  const total = items.reduce((a, i) => a + (i.cost || 0), 0);
  return { scenario: state.settings.scenario, weekCzk: r0(total), monthCzk: r0(C.monthlyFromWeekly(total)), groups };
}

const rid = () => Math.random().toString(36).slice(2, 10);

/** Geplante Mahlzeit als gegessen eintragen (oder wieder austragen). */
function setMealDone(state, pid, iso, slot, done, time) {
  if (!D.SLOTS.some((s) => s.id === slot)) throw Object.assign(new Error('Unbekannte Mahlzeit'), { status: 400 });
  const ctx = context(state);
  const logs = state.logs[pid] || (state.logs[pid] = {});
  const log = logs[iso] || (logs[iso] = { meals: [], water: 0, coffee: [] });
  log.meals = log.meals.filter((m) => !(m.fromPlan && m.slot === slot));
  if (done) {
    const wd = C.weekdayIndex(iso); const entry = (state.plan[wd] || {})[slot];
    const recipe = entry && ctx.byId[entry.recipeId];
    log.meals.push({ id: rid(), slot, fromPlan: true, name: recipe ? recipe.name : 'Mahlzeit', recipeId: entry ? entry.recipeId : null,
      ingredients: plannedSlots(state, ctx, wd, pid)[slot] || [], time: time || '' });
    const order = D.SLOTS.map((s) => s.id);
    log.meals.sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
  }
}

module.exports = { PIDS, SLOT_TIMES, defaultState, context, plannedSlots, today, week, shopping, setMealDone, micronutrients };
