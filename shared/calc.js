/* Reine Rechenfunktionen – ohne DOM, getestet in tests/calc.test.js */
(function (root) {
  'use strict';

  const MICRO_KEYS = ['vitA', 'b1', 'b2', 'b3', 'b6', 'b12', 'vitC', 'vitD', 'vitE', 'vitK', 'folate',
    'calcium', 'magnesium', 'potassium', 'sodium', 'iron', 'zinc', 'iodine', 'selenium', 'epadha', 'ala'];
  const MACRO_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fiber'];
  const ALL_KEYS = MACRO_KEYS.concat(MICRO_KEYS);
  const COVERAGE_FULL = 0.9;   // ab hier gilt ein Wert als belastbar
  const COVERAGE_PARTIAL = 0.6; // darunter: nicht bestimmbar

  const isNum = (x) => typeof x === 'number' && isFinite(x);
  const round = (x, d = 0) => { const p = Math.pow(10, d); return Math.round(x * p) / p; };
  const roundTo = (x, step) => Math.round(x / step) * step;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  /** Grammzahl validieren: keine negativen, keine NaN, max. 5 kg pro Zutat. */
  function cleanGrams(g) {
    const v = Number(g);
    if (!isFinite(v) || v < 0) return 0;
    return Math.min(v, 5000);
  }

  /** Summe aller Nährstoffe: sum(quantity_g * nutrient_per_100g / 100).
   *  Fehlende Werte (null) zählen NICHT als 0 – stattdessen sinkt die Datenabdeckung.
   *  coverage[k] = Anteil der Grammmenge, für die der Wert bekannt ist (0..1). */
  function sumNutrients(ingredients, foods, keys) {
    keys = keys || ALL_KEYS;
    const totals = {}, known = {};
    keys.forEach((k) => { totals[k] = 0; known[k] = 0; });
    let grams = 0; const unknownFoods = [];
    for (const ing of ingredients || []) {
      const f = foods[ing.foodId];
      const g = cleanGrams(ing.grams);
      if (!f) { if (g > 0) unknownFoods.push(ing.foodId); continue; }
      if (g <= 0) continue;
      grams += g;
      for (const k of keys) {
        const v = f.n[k];
        if (!isNum(v)) continue;
        totals[k] += g * v / 100;
        known[k] += g;
      }
    }
    const coverage = {};
    keys.forEach((k) => {
      coverage[k] = grams > 0 ? known[k] / grams : null;
      if (grams > 0 && known[k] === 0) totals[k] = null;
    });
    return { totals, coverage, grams, unknownFoods };
  }

  /** Mittelwert über mehrere Tage: Summe aller Zutaten / Anzahl Tage mit Daten. */
  function meanOverDays(dayIngredientLists, foods, keys) {
    const withData = dayIngredientLists.filter((l) => (l || []).some((i) => cleanGrams(i.grams) > 0));
    const n = withData.length;
    const res = sumNutrients([].concat(...withData), foods, keys);
    if (n === 0) return Object.assign(res, { days: 0 });
    const totals = {};
    Object.keys(res.totals).forEach((k) => { totals[k] = res.totals[k] === null ? null : res.totals[k] / n; });
    return { totals, coverage: res.coverage, grams: res.grams / n, days: n, unknownFoods: res.unknownFoods };
  }

  /** Kohlenhydrat-Ziel als Rest: (kcal − P·4 − F·9) / 4 */
  function carbsFromRest(kcal, protein, fat) {
    const c = (Number(kcal) - Number(protein) * 4 - Number(fat) * 9) / 4;
    return isFinite(c) ? Math.max(0, c) : 0;
  }
  function deriveTargets(t) {
    const carbs = carbsFromRest(t.kcal, t.protein, t.fat);
    return { kcal: t.kcal, protein: t.protein, fat: t.fat, carbs, fiber: t.fiber, fruitVeg: t.fruitVeg,
      warning: (t.protein * 4 + t.fat * 9) > t.kcal ? 'Protein und Fett liefern zusammen schon mehr Energie als das Kalorienziel.' : null };
  }

  /** Referenzmenge für einen Nährstoff (ALA hängt vom Kalorienziel ab). */
  function referenceAmount(key, refs, targets) {
    if (key in { kcal: 1, protein: 1, fat: 1, carbs: 1 }) return targets[key];
    if (key === 'fiber') return targets.fiber;
    const r = refs[key];
    if (!r) return null;
    if (r.perKcal) return targets.kcal * r.perKcal / 9 * 1000; // g Fett → mg
    return r.amount;
  }

  function percentOf(total, ref) {
    if (!isNum(total) || !isNum(ref) || ref <= 0) return null;
    return total / ref * 100;
  }
  /** Balkenbreite: visuell auf 0..100 % begrenzt. */
  function barWidth(pct) { return isNum(pct) ? clamp(pct, 0, 100) : 0; }

  /** Bewertung eines Nährstoffs inkl. Datenlage.
   *  status: keine-daten | nicht-bestimmbar | unvollstaendig | erreicht | nah | niedrig | im-rahmen | ueber-max
   *  Bei Teil-Abdeckung ist der Wert eine Untergrenze (lowerBound). */
  function assessNutrient(total, coverage, ref, kind) {
    const pct = percentOf(total, ref);
    if (coverage === null || coverage === undefined) return { status: 'keine-daten', pct: null, showBar: false, lowerBound: false };
    if (total === null || coverage < COVERAGE_PARTIAL) return { status: 'nicht-bestimmbar', pct: null, showBar: false, lowerBound: false };
    const lowerBound = coverage < COVERAGE_FULL;
    if (kind === 'max') {
      if (lowerBound) return { status: 'unvollstaendig', pct, showBar: true, lowerBound };
      return { status: pct <= 100 ? 'im-rahmen' : 'ueber-max', pct, showBar: true, lowerBound };
    }
    if (pct === null) return { status: 'keine-daten', pct: null, showBar: false, lowerBound };
    if (pct >= 100) return { status: 'erreicht', pct, showBar: true, lowerBound };
    if (lowerBound) return { status: 'unvollstaendig', pct, showBar: true, lowerBound };
    if (pct >= 70) return { status: 'nah', pct, showBar: true, lowerBound };
    return { status: 'niedrig', pct, showBar: true, lowerBound };
  }

  /** Nährstoff-Score: Mittel aus min(100, %) über alle Vitamine/Mineralstoffe mit
   *  belastbarer Datenlage (Abdeckung ≥ 90 %), ohne Obergrenzen (Natrium) und ohne
   *  als unsicher markierte Werte (Jod). Gibt an, aus wie vielen Nährstoffen er stammt. */
  function nutrientScore(result, refs, targets, nutrientMeta) {
    const used = [], skipped = [];
    for (const m of nutrientMeta) {
      if (m.group === 'makro') continue;
      const r = refs[m.key];
      if (!r || r.kind === 'max' || m.uncertain) { skipped.push(m.key); continue; }
      const cov = result.coverage[m.key];
      const ref = referenceAmount(m.key, refs, targets);
      const pct = percentOf(result.totals[m.key], ref);
      if (cov === null || cov < COVERAGE_FULL || pct === null) { skipped.push(m.key); continue; }
      used.push(Math.min(100, pct));
    }
    const of = used.length + skipped.length;
    if (!used.length) return { score: null, used: 0, of };
    return { score: used.reduce((a, b) => a + b, 0) / used.length, used: used.length, of };
  }

  /** Obst + Gemüse in Gramm (Kartoffeln zählen nicht). */
  function fruitVegGrams(ingredients, foods) {
    let g = 0;
    for (const i of ingredients || []) { const f = foods[i.foodId]; if (f && f.fv) g += cleanGrams(i.grams); }
    return g;
  }

  // ---------------- Preise ----------------
  function unitPrice(food, scenario, priceOverrides) {
    const p = (priceOverrides && priceOverrides[food.id]) || food.price;
    if (!p) return null;
    const v = p[scenario];
    return isNum(v) && v >= 0 ? v : null;
  }
  /** Einkaufsmenge aus essbarer Menge (Schale, Knochen, Kern berücksichtigt). */
  function purchaseAmount(food, edibleG) {
    const g = cleanGrams(edibleG);
    if (food.unit === 'stueck') return { pieces: g / (food.gramsPerPiece || 1), grams: g };
    return { pieces: null, grams: g / (food.ediblePortion || 1) };
  }
  /** item_cost_czk = Einkaufsmenge_g / 1000 * Preis_pro_kg (bzw. Stück × Stückpreis). */
  function ingredientCost(food, edibleG, scenario, priceOverrides) {
    const price = unitPrice(food, scenario, priceOverrides);
    if (price === null) return null;
    const a = purchaseAmount(food, edibleG);
    if (food.unit === 'stueck') return a.pieces * price;
    return a.grams / 1000 * price;
  }
  function costOf(ingredients, foods, scenario, priceOverrides) {
    let sum = 0, missing = 0;
    for (const i of ingredients || []) {
      const f = foods[i.foodId]; if (!f) continue;
      const c = ingredientCost(f, i.grams, scenario, priceOverrides);
      if (c === null) missing++; else sum += c;
    }
    return { czk: sum, missing };
  }
  /** Einkaufsliste: alle Zutaten aggregiert nach Lebensmittel. */
  function aggregateShopping(ingredientLists, foods, scenario, priceOverrides) {
    const map = {};
    for (const list of ingredientLists) for (const i of list || []) {
      const f = foods[i.foodId]; const g = cleanGrams(i.grams);
      if (!f || g <= 0) continue;
      map[i.foodId] = (map[i.foodId] || 0) + g;
    }
    return Object.keys(map).map((id) => {
      const f = foods[id]; const edible = map[id];
      const a = purchaseAmount(f, edible);
      return { foodId: id, edibleG: edible, purchaseG: a.grams, pieces: a.pieces, cost: ingredientCost(f, edible, scenario, priceOverrides) };
    });
  }
  /** Monatlicher Durchschnitt: Woche × 52 / 12 (≈ 4,33), nicht × 4. */
  function monthlyFromWeekly(w) { return w * 52 / 12; }
  function czkToEur(czk, rate) { return isNum(rate) && rate > 0 ? czk / rate : null; }

  // ---------------- Gewicht ----------------
  const dayNum = (iso) => Math.floor(Date.parse(iso + 'T12:00:00Z') / 86400000);
  function sortWeights(entries) {
    return (entries || []).filter((e) => isNum(e.kg) && e.kg > 0 && e.date).slice().sort((a, b) => a.date < b.date ? -1 : 1);
  }
  /** Gleitender Mittelwert über die letzten `days` Kalendertage (inkl. aktuellem Eintrag). */
  function movingAverage(entries, days) {
    days = days || 7;
    const s = sortWeights(entries);
    return s.map((e, idx) => {
      const d = dayNum(e.date);
      const win = s.slice(0, idx + 1).filter((x) => d - dayNum(x.date) < days);
      return { date: e.date, kg: e.kg, avg: win.reduce((a, b) => a + b.kg, 0) / win.length };
    });
  }
  /** Trend kg/Woche per linearer Regression über die letzten `windowDays` Tage.
   *  null bei < 3 Messungen oder < 10 Tagen Zeitspanne (zu wenig für eine Aussage). */
  function weeklyTrend(entries, windowDays) {
    windowDays = windowDays || 21;
    const s = sortWeights(entries);
    if (!s.length) return null;
    const last = dayNum(s[s.length - 1].date);
    const win = s.filter((e) => last - dayNum(e.date) < windowDays);
    const span = dayNum(win[win.length - 1].date) - dayNum(win[0].date);
    if (win.length < 3 || span < 10) return { kgPerWeek: null, n: win.length, spanDays: span };
    const xs = win.map((e) => dayNum(e.date)), ys = win.map((e) => e.kg);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0, den = 0;
    xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) * (x - mx); });
    const slope = den === 0 ? 0 : num / den; // kg pro Tag
    return { kgPerWeek: slope * 7, n: win.length, spanDays: span };
  }
  function targetGainBand(weightKg, minPct, maxPct) {
    return { min: weightKg * minPct / 100, max: weightKg * maxPct / 100 };
  }

  // ---------------- Plan ----------------
  /** Zutaten eines Planeintrags (Override oder Rezept × Portionen). */
  function entryIngredients(entry, recipesById) {
    if (!entry) return [];
    if (Array.isArray(entry.ingredients)) return entry.ingredients.map((i) => ({ foodId: i.foodId, grams: cleanGrams(i.grams), preparation: i.preparation || '' }));
    const r = recipesById[entry.recipeId];
    if (!r) return [];
    const p = isNum(entry.portions) && entry.portions > 0 ? entry.portions : 1;
    return r.ingredients.map((i) => ({ foodId: i.foodId, grams: cleanGrams(i.grams * p), preparation: i.preparation || '' }));
  }

  /** „Portionen an Tagesziel anpassen“ – Vorschlag, keine stille Änderung.
   *  Reihenfolge: 1) Protein über Fleisch/Fisch (±40 %, 120–350 g, 10-g-Schritte)
   *  2) Fett über Öl (min. 5 g je Gericht)  3) Kalorien über Beilagen (±40 %/+50 %).
   *  Nur die Slots in `editable` (Standard: Mittag, Abend) werden verändert. */
  function adjustDayToTargets(slotIngredients, foods, targets, editable) {
    editable = editable || ['mittag', 'abend'];
    const work = {};
    Object.keys(slotIngredients).forEach((s) => { work[s] = (slotIngredients[s] || []).map((i) => Object.assign({}, i)); });
    const all = () => [].concat(...Object.values(work));
    const tot = () => sumNutrients(all(), foods, MACRO_KEYS).totals;
    const before = tot();
    const editIngs = (pred) => [].concat(...editable.map((s) => work[s] || [])).filter((i) => pred(foods[i.foodId]) && cleanGrams(i.grams) > 0);

    // 1) Protein
    let t = tot();
    const prot = editIngs((f) => f && (f.category === 'fleisch' || f.category === 'fisch'));
    const pSrc = prot.reduce((a, i) => a + i.grams * foods[i.foodId].n.protein / 100, 0);
    const dP = targets.protein - t.protein;
    if (Math.abs(dP) > 5 && pSrc > 0) {
      const s = clamp((pSrc + dP) / pSrc, 0.6, 1.4);
      prot.forEach((i) => { i.grams = clamp(roundTo(i.grams * s, 10), 120, 350); });
    }
    // 2) Fett über Öl
    t = tot();
    const oils = editIngs((f) => f && f.category === 'oel');
    const excess = t.fat - targets.fat;
    if (excess > 5 && oils.length) {
      const reducible = oils.reduce((a, i) => a + Math.max(0, i.grams - 5), 0);
      if (reducible > 0) {
        const ratio = Math.min(1, excess / reducible);
        oils.forEach((i) => { i.grams = Math.max(5, roundTo(i.grams - Math.max(0, i.grams - 5) * ratio, 5)); });
      }
    } else if (excess < -15 && oils.length) {
      const add = Math.min(10, -excess / oils.length);
      oils.forEach((i) => { i.grams = roundTo(i.grams + add, 5); });
    }
    // 3) Kalorien über Beilagen
    t = tot();
    const carbs = editIngs((f) => f && f.category === 'beilage');
    const kC = carbs.reduce((a, i) => a + i.grams * foods[i.foodId].n.kcal / 100, 0);
    const dK = targets.kcal - t.kcal;
    if (Math.abs(dK) > 50 && kC > 0) {
      const s = clamp((kC + dK) / kC, 0.6, 1.5);
      carbs.forEach((i) => {
        const step = (i.foodId === 'kartoffel' || i.foodId === 'suesskartoffel') ? 25 : 5;
        i.grams = Math.max(step, roundTo(i.grams * s, step));
      });
    }
    const after = tot();
    const changes = [];
    Object.keys(work).forEach((s) => work[s].forEach((i, idx) => {
      const old = slotIngredients[s][idx];
      if (old && old.grams !== i.grams) changes.push({ slot: s, foodId: i.foodId, before: old.grams, after: i.grams });
    }));
    return { slots: work, before, after, changes };
  }


  /** Faktor, mit dem der Basis-Plan eines Tages für eine Person skaliert wird (Ziel-kcal / Plan-kcal). */
  function dayScaleFactor(baseKcal, targetKcal) {
    if (!isNum(baseKcal) || baseKcal <= 0 || !isNum(targetKcal) || targetKcal <= 0) return 1;
    return clamp(targetKcal / baseKcal, 0.4, 2);
  }
  /** Zutaten skalieren, alltagstauglich gerundet: Stückware auf ganze Stück, sonst 5-g-Schritte (min. 5 g). */
  function scaleIngredients(ings, factor, foods) {
    return (ings || []).map((i) => {
      const f = foods[i.foodId];
      const raw = cleanGrams(i.grams) * factor;
      let g;
      if (f && f.unit === 'stueck' && f.gramsPerPiece) g = Math.max(1, Math.round(raw / f.gramsPerPiece)) * f.gramsPerPiece;
      else g = raw <= 0 ? 0 : Math.max(5, roundTo(raw, 5));
      return Object.assign({}, i, { grams: g });
    });
  }

  // ---------------- Datum ----------------
  function isoDate(d) { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); }
  function weekdayIndex(iso) { const d = new Date(iso + 'T12:00:00'); return (d.getDay() + 6) % 7; } // Mo = 0
  function addDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDate(d); }
  function weekDates(iso) { const start = addDays(iso, -weekdayIndex(iso)); return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(start, i)); }

  const Calc = { MICRO_KEYS, MACRO_KEYS, ALL_KEYS, COVERAGE_FULL, COVERAGE_PARTIAL, isNum, round, roundTo, clamp, cleanGrams,
    sumNutrients, meanOverDays, carbsFromRest, deriveTargets, referenceAmount, percentOf, barWidth, assessNutrient,
    nutrientScore, fruitVegGrams, unitPrice, purchaseAmount, ingredientCost, costOf, aggregateShopping, monthlyFromWeekly,
    czkToEur, movingAverage, weeklyTrend, targetGainBand, entryIngredients, adjustDayToTargets, dayScaleFactor, scaleIngredients,
    isoDate, weekdayIndex, addDays, weekDates };
  if (typeof module !== 'undefined' && module.exports) module.exports = Calc; else root.NCalc = Calc;
})(typeof window !== 'undefined' ? window : globalThis);
