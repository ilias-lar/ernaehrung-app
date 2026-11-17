const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../shared/calc.js');
const D = require('../../shared/data.js');

const foods = D.buildFoods();
const recipesById = Object.fromEntries(D.RECIPES.map((r) => [r.id, r]));
const approx = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('Kohlenhydrate als Rest: Beispiel aus dem Brief = 362,5 g', () => {
  approx(C.carbsFromRest(2900, 160, 90), 362.5);
  assert.equal(C.carbsFromRest(1000, 200, 100), 0); // nie negativ
});

test('Makro-Aggregation: sum(g × Wert / 100)', () => {
  const r = C.sumNutrients([{ foodId: 'haehnchenbrust', grams: 200 }, { foodId: 'basmati', grams: 100 }], foods);
  approx(r.totals.kcal, 200 * 1.20 + 365, 0.001);
  approx(r.totals.protein, 45 + 7.13, 0.001);
  assert.equal(r.grams, 300);
});

test('Verwertbare KH = Gesamt-KH − Ballaststoffe', () => {
  approx(foods.basmati.n.carbs, 79.95 - 1.3);
  assert.equal(foods.haehnchenbrust.n.carbs, 0);
});

test('Fehlende Werte sind null, nicht 0, und senken die Abdeckung', () => {
  const r = C.sumNutrients([{ foodId: 'haehnchenbrust', grams: 300 }, { foodId: 'lachs', grams: 100 }], foods);
  approx(r.coverage.vitD, 0.25);              // Vitamin D nur für Lachs bekannt
  approx(r.totals.vitD, 11.0);                 // nur der bekannte Anteil
  const only = C.sumNutrients([{ foodId: 'haehnchenbrust', grams: 300 }], foods);
  assert.equal(only.totals.vitD, null);        // komplett unbekannt → null
  assert.equal(only.coverage.vitD, 0);
});

test('Leere Liste: Abdeckung null, Summe 0', () => {
  const r = C.sumNutrients([], foods);
  assert.equal(r.coverage.kcal, null);
  assert.equal(r.totals.kcal, 0);
});

test('Validierung: negative/NaN-Grammzahlen werden 0', () => {
  assert.equal(C.cleanGrams(-50), 0);
  assert.equal(C.cleanGrams('abc'), 0);
  assert.equal(C.cleanGrams(99999), 5000);
  const r = C.sumNutrients([{ foodId: 'basmati', grams: -100 }], foods);
  assert.equal(r.grams, 0);
});

test('Bewertung: Teil-Abdeckung → Untergrenze, wenig Daten → nicht bestimmbar', () => {
  assert.equal(C.assessNutrient(10, 0.5, 20, 'schaetzwert').status, 'nicht-bestimmbar');
  const partial = C.assessNutrient(10, 0.75, 20, 'schaetzwert');
  assert.equal(partial.status, 'unvollstaendig');
  assert.equal(partial.lowerBound, true);
  assert.equal(C.assessNutrient(25, 1, 20, 'empfehlung').status, 'erreicht');
  assert.equal(C.assessNutrient(15, 1, 20, 'empfehlung').status, 'nah');
  assert.equal(C.assessNutrient(5, 1, 20, 'empfehlung').status, 'niedrig');
  assert.equal(C.assessNutrient(2500, 1, 2000, 'max').status, 'ueber-max');
  assert.equal(C.assessNutrient(null, null, 20, 'x').status, 'keine-daten');
});

test('Balken max. 100 %, Prozent darf darüber liegen', () => {
  approx(C.percentOf(300, 100), 300);
  assert.equal(C.barWidth(300), 100);
  assert.equal(C.barWidth(-5), 0);
  assert.equal(C.percentOf(5, 0), null);
});

test('ALA-Referenz = 0,5 % der Energie', () => {
  const t = C.deriveTargets(D.DEFAULT_SETTINGS.targets);
  approx(C.referenceAmount('ala', D.REFERENCES, t), 2900 * 0.005 / 9 * 1000, 0.1);
  assert.equal(C.referenceAmount('protein', D.REFERENCES, t), 160);
});

test('Nährstoff-Score nutzt nur belastbare Werte', () => {
  const day = C.sumNutrients([{ foodId: 'haehnchenbrust', grams: 300 }], foods);
  const s = C.nutrientScore(day, D.REFERENCES, C.deriveTargets(D.DEFAULT_SETTINGS.targets), D.NUTRIENTS);
  assert.ok(s.used < s.of);
  assert.ok(s.score === null || (s.score >= 0 && s.score <= 100));
});

test('Preis: essbarer Anteil und Stückpreis', () => {
  // Banane: 120 g essbar bei 65 % → 184,6 g Einkauf × 40 CZK/kg
  approx(C.ingredientCost(foods.banane, 120, 'premium'), 120 / 0.65 / 1000 * 40);
  // Eier: 165 g = 3 Stück × 7 CZK
  approx(C.ingredientCost(foods.ei, 165, 'premium'), 21);
  // Preis-Override
  approx(C.ingredientCost(foods.basmati, 100, 'gut', { basmati: { gut: 100, premium: 100, luxus: 100 } }), 10);
});

test('Monat = Woche × 52/12, nicht × 4', () => {
  approx(C.monthlyFromWeekly(1200), 5200);
  approx(C.czkToEur(245, 24.5), 10);
});

test('Einkaufsliste aggregiert über Tage', () => {
  const list = C.aggregateShopping([[{ foodId: 'kartoffel', grams: 400 }], [{ foodId: 'kartoffel', grams: 350 }]], foods, 'premium');
  assert.equal(list.length, 1);
  assert.equal(list[0].edibleG, 750);
  approx(list[0].purchaseG, 750 / 0.9);
});

test('7-Tage-Mittel: Summe / Tage mit Daten', () => {
  const days = [[{ foodId: 'basmati', grams: 100 }], [{ foodId: 'basmati', grams: 300 }], []];
  const m = C.meanOverDays(days, foods);
  assert.equal(m.days, 2);
  approx(m.totals.kcal, 365 * 2);
});

test('Gewichtstrend: lineare Regression kg/Woche', () => {
  const e = [];
  for (let i = 0; i < 21; i += 3) e.push({ date: C.addDays('2026-11-01', i), kg: 83 + i * 0.02 });
  const t = C.weeklyTrend(e, 21);
  approx(t.kgPerWeek, 0.14, 0.001);
  assert.equal(C.weeklyTrend([{ date: '2026-11-01', kg: 83 }], 21).kgPerWeek, null);
  const ma = C.movingAverage([{ date: '2026-11-01', kg: 82 }, { date: '2026-11-03', kg: 84 }], 7);
  approx(ma[1].avg, 83);
});

test('Plan: Portionen skalieren Zutaten', () => {
  const ings = C.entryIngredients({ recipeId: 'm-ofenlachs', portions: 1.5 }, recipesById);
  assert.equal(ings.find((i) => i.foodId === 'lachs').grams, 345);
});

test('Portionen an Tagesziel anpassen: nähert sich den Zielen und zeigt Änderungen', () => {
  const plan = D.DEFAULT_PLAN[0];
  const slots = {};
  for (const s of ['fruehstueck', 'mittag', 'snack', 'abend']) slots[s] = C.entryIngredients(plan[s], recipesById);
  const targets = { kcal: 2900, protein: 160, fat: 90 };
  const res = C.adjustDayToTargets(slots, foods, targets);
  assert.ok(Math.abs(res.after.protein - 160) <= Math.abs(res.before.protein - 160));
  assert.ok(Math.abs(res.after.kcal - 2900) <= Math.abs(res.before.kcal - 2900) + 1);
  assert.deepEqual(res.slots.fruehstueck, slots.fruehstueck); // Frühstück bleibt
  res.changes.forEach((c) => assert.notEqual(c.before, c.after));
});

test('Alle Rezepte im Plan verweisen auf existierende Lebensmittel', () => {
  for (const r of D.RECIPES) for (const i of r.ingredients) assert.ok(foods[i.foodId], `${r.id}: ${i.foodId}`);
  for (const day of D.DEFAULT_PLAN) for (const e of Object.values(day)) assert.ok(recipesById[e.recipeId], e.recipeId);
});

test('Datum: Wochentag Mo=0 und Wochendaten', () => {
  assert.equal(C.weekdayIndex('2026-11-16'), 0); // Montag
  assert.equal(C.weekDates('2026-11-19')[0], '2026-11-16');
});

test('Personen-Skalierung: Faktor und Rundung', () => {
  approx(C.dayScaleFactor(2900, 2000), 2000 / 2900);
  assert.equal(C.dayScaleFactor(0, 2000), 1);
  const out = C.scaleIngredients([{ foodId: 'ei', grams: 165 }, { foodId: 'basmati', grams: 110 }, { foodId: 'olivenoel', grams: 15 }], 0.69, foods);
  assert.equal(out[0].grams, 110);   // 3 Eier × 0,69 ≈ 2 Eier
  assert.equal(out[1].grams, 75);    // 75,9 → 75
  assert.equal(out[2].grams, 10);
});
test('Frauen-Referenzwerte: Eisen höher, Zink niedriger', () => {
  assert.equal(D.REFERENCES_F.iron.amount, 16);
  assert.equal(D.REFERENCES_F.zinc.amount, 8);
  assert.equal(D.REFERENCES.iron.amount, 11);
});
