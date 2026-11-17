/* Ernährungs-Dashboard – Seed-Daten
 * WICHTIG: Nährwerte sind DEMO-/RICHTWERTE. Sie sind an USDA FoodData Central (SR Legacy)
 * angelehnt, wurden aber nicht live abgerufen und nicht einzeln geprüft. Produkte mit
 * quality "schaetzung" sind grobe Schätzwerte (z. B. Sauerteigbrot, Passata, Tortilla).
 * null = Wert unbekannt (wird NIE als 0 oder 100 % interpretiert).
 * Alle Werte pro 100 g ESSBARER Anteil in der angegebenen Bezugsbasis (roh/trocken).
 */
(function (root) {
  'use strict';

  // Reihenfolge der Werte im kompakten Seed-Array
  const SEED_KEYS = ['kcal', 'protein', 'carbTotal', 'fat', 'fiber',
    'vitA', 'b1', 'b2', 'b3', 'b6', 'b12', 'vitC', 'vitD', 'vitE', 'vitK', 'folate',
    'calcium', 'magnesium', 'potassium', 'sodium', 'iron', 'zinc', 'iodine', 'selenium',
    'epadha', 'ala'];

  const NUTRIENTS = [
    { key: 'kcal', label: 'Energie', unit: 'kcal', group: 'makro' },
    { key: 'protein', label: 'Protein', unit: 'g', group: 'makro' },
    { key: 'carbs', label: 'Kohlenhydrate', unit: 'g', group: 'makro', note: 'Verwertbare Kohlenhydrate (ohne Ballaststoffe), wie auf EU-Etiketten.' },
    { key: 'fat', label: 'Fett', unit: 'g', group: 'makro' },
    { key: 'fiber', label: 'Ballaststoffe', unit: 'g', group: 'makro' },
    { key: 'vitA', label: 'Vitamin A', unit: 'µg', group: 'vitamin', note: 'Als Retinol-Aktivitätsäquivalente (RAE).' },
    { key: 'b1', label: 'Vitamin B1 (Thiamin)', unit: 'mg', group: 'vitamin' },
    { key: 'b2', label: 'Vitamin B2 (Riboflavin)', unit: 'mg', group: 'vitamin' },
    { key: 'b3', label: 'Niacin (B3)', unit: 'mg', group: 'vitamin', note: 'Datenbasis ist präformiertes Niacin. Der Anteil aus Tryptophan ist nicht eingerechnet, die echte Zufuhr (Niacin-Äquivalente) liegt bei proteinreicher Kost deutlich höher.' },
    { key: 'b6', label: 'Vitamin B6', unit: 'mg', group: 'vitamin' },
    { key: 'b12', label: 'Vitamin B12', unit: 'µg', group: 'vitamin' },
    { key: 'vitC', label: 'Vitamin C', unit: 'mg', group: 'vitamin', note: 'Rohwerte. Beim Kochen gehen je nach Methode ca. 20–50 % verloren, das ist hier nicht abgezogen.' },
    { key: 'vitD', label: 'Vitamin D', unit: 'µg', group: 'vitamin', note: 'Über Lebensmittel wird der Referenzwert selten erreicht. Bildung durch Sonne und Supplemente sind NICHT erfasst.' },
    { key: 'vitE', label: 'Vitamin E', unit: 'mg', group: 'vitamin' },
    { key: 'vitK', label: 'Vitamin K', unit: 'µg', group: 'vitamin' },
    { key: 'folate', label: 'Folat', unit: 'µg', group: 'vitamin', note: 'Nahrungsfolat; Kochverluste nicht abgezogen.' },
    { key: 'calcium', label: 'Calcium', unit: 'mg', group: 'mineral' },
    { key: 'magnesium', label: 'Magnesium', unit: 'mg', group: 'mineral' },
    { key: 'potassium', label: 'Kalium', unit: 'mg', group: 'mineral' },
    { key: 'sodium', label: 'Natrium', unit: 'mg', group: 'mineral', note: 'Nur Natrium aus den Lebensmitteln. Zugesetztes Salz ist nicht eingerechnet (1 g Salz ≈ 400 mg Natrium).' },
    { key: 'iron', label: 'Eisen', unit: 'mg', group: 'mineral' },
    { key: 'zinc', label: 'Zink', unit: 'mg', group: 'mineral' },
    { key: 'iodine', label: 'Jod', unit: 'µg', group: 'mineral', uncertain: true, note: 'Jodgehalte schwanken stark (Futter, Boden, Jodsalz). Für die meisten Lebensmittel ist hier kein Wert hinterlegt – daher meist „nicht bestimmbar“. Jodsalz ist nicht eingerechnet.' },
    { key: 'selenium', label: 'Selen', unit: 'µg', group: 'mineral' },
    { key: 'epadha', label: 'Omega-3 EPA + DHA', unit: 'mg', group: 'fett', note: 'Langkettige Omega-3-Fettsäuren, v. a. aus fettem Fisch. Wochenmittel ist aussagekräftiger als ein einzelner Tag.' },
    { key: 'ala', label: 'Omega-3 ALA', unit: 'mg', group: 'fett', note: 'Pflanzliche Omega-3-Fettsäure (Walnüsse, Öl). Wird kaum in EPA/DHA umgewandelt, daher getrennt.' },
  ];

  const REF_SOURCE = 'D-A-CH-Referenzwerte (DGE/ÖGE/SGE), Männer 19 bis unter 25 Jahre';
  const REF_CHECK = 'Werte aus Modellwissen übernommen, Stand ca. 2024/25 – bitte bei dge.de gegenprüfen.';
  // kind: empfehlung | schaetzwert | richtwert | ai | max
  const REFERENCES = {
    fiber: { amount: 30, kind: 'richtwert', source: 'DGE-Richtwert für Erwachsene' },
    vitA: { amount: 850, kind: 'empfehlung', source: REF_SOURCE },
    b1: { amount: 1.3, kind: 'empfehlung', source: REF_SOURCE },
    b2: { amount: 1.4, kind: 'empfehlung', source: REF_SOURCE },
    b3: { amount: 16, kind: 'empfehlung', source: REF_SOURCE + ' (als Niacin-Äquivalente)' },
    b6: { amount: 1.6, kind: 'empfehlung', source: REF_SOURCE },
    b12: { amount: 4.0, kind: 'schaetzwert', source: REF_SOURCE },
    vitC: { amount: 110, kind: 'empfehlung', source: REF_SOURCE },
    vitD: { amount: 20, kind: 'schaetzwert', source: REF_SOURCE + ' (bei fehlender Eigensynthese)' },
    vitE: { amount: 15, kind: 'schaetzwert', source: REF_SOURCE },
    vitK: { amount: 70, kind: 'schaetzwert', source: REF_SOURCE },
    folate: { amount: 300, kind: 'empfehlung', source: REF_SOURCE + ' (Folat-Äquivalente)' },
    calcium: { amount: 1000, kind: 'empfehlung', source: REF_SOURCE },
    magnesium: { amount: 400, kind: 'schaetzwert', source: REF_SOURCE },
    potassium: { amount: 4000, kind: 'schaetzwert', source: REF_SOURCE },
    sodium: { amount: 2000, kind: 'max', source: 'WHO: höchstens 2.000 mg Natrium/Tag (≈ 5 g Salz). DGE-Schätzwert für den Bedarf: 1.500 mg.' },
    iron: { amount: 11, kind: 'empfehlung', source: REF_SOURCE },
    zinc: { amount: 14, kind: 'empfehlung', source: REF_SOURCE + ' (bei mittlerer Phytatzufuhr)' },
    iodine: { amount: 200, kind: 'empfehlung', source: REF_SOURCE + ' (Deutschland)' },
    selenium: { amount: 70, kind: 'schaetzwert', source: REF_SOURCE },
    epadha: { amount: 250, kind: 'ai', source: 'EFSA: adäquate Zufuhr (AI) 250 mg EPA+DHA/Tag für Erwachsene' },
    ala: { amount: null, perKcal: 0.005, kind: 'ai', source: 'EFSA: adäquate Zufuhr (AI) 0,5 % der Energie' },
  };


  // Referenzwerte Frauen 19 bis unter 25 Jahre (D-A-CH/DGE) – gleiche Struktur wie REFERENCES
  const REF_SOURCE_F = 'D-A-CH-Referenzwerte (DGE/ÖGE/SGE), Frauen 19 bis unter 25 Jahre';
  const REFERENCES_F = Object.assign({}, REFERENCES, {
    vitA: { amount: 700, kind: 'empfehlung', source: REF_SOURCE_F },
    b1: { amount: 1.0, kind: 'empfehlung', source: REF_SOURCE_F },
    b2: { amount: 1.1, kind: 'empfehlung', source: REF_SOURCE_F },
    b3: { amount: 13, kind: 'empfehlung', source: REF_SOURCE_F + ' (als Niacin-Äquivalente)' },
    b6: { amount: 1.4, kind: 'empfehlung', source: REF_SOURCE_F },
    b12: { amount: 4.0, kind: 'schaetzwert', source: REF_SOURCE_F },
    vitC: { amount: 95, kind: 'empfehlung', source: REF_SOURCE_F },
    vitD: { amount: 20, kind: 'schaetzwert', source: REF_SOURCE_F + ' (bei fehlender Eigensynthese)' },
    vitE: { amount: 12, kind: 'schaetzwert', source: REF_SOURCE_F },
    vitK: { amount: 60, kind: 'schaetzwert', source: REF_SOURCE_F },
    folate: { amount: 300, kind: 'empfehlung', source: REF_SOURCE_F + ' (Folat-Äquivalente; bei Kinderwunsch zusätzlich Folsäure empfohlen)' },
    calcium: { amount: 1000, kind: 'empfehlung', source: REF_SOURCE_F },
    magnesium: { amount: 310, kind: 'schaetzwert', source: REF_SOURCE_F },
    potassium: { amount: 4000, kind: 'schaetzwert', source: REF_SOURCE_F },
    iron: { amount: 16, kind: 'empfehlung', source: REF_SOURCE_F + ' (Frauen mit Menstruation)' },
    zinc: { amount: 8, kind: 'empfehlung', source: REF_SOURCE_F + ' (bei mittlerer Phytatzufuhr)' },
    iodine: { amount: 200, kind: 'empfehlung', source: REF_SOURCE_F + ' (Deutschland)' },
    selenium: { amount: 60, kind: 'schaetzwert', source: REF_SOURCE_F },
  });

  const DEFAULT_PERSONS = {
    ilias: { name: 'Ilias', sex: 'm', goal: 'aufbau', autoScale: true,
      profile: { age: 30, heightCm: 180, weightKg: 80, trainingPerWeek: 3, activity: 'mittel' },
      targets: { kcal: 2900, protein: 160, fat: 90, fiber: 30, fruitVeg: 500, gainPctPerWeekMin: 0.1, gainPctPerWeekMax: 0.25 } },
    freundin: { name: 'Freundin', sex: 'w', goal: 'halten', autoScale: true,
      profile: { age: 28, heightCm: 168, weightKg: 60, trainingPerWeek: 2, activity: 'mittel' },
      targets: { kcal: 2000, protein: 100, fat: 65, fiber: 30, fruitVeg: 500, gainPctPerWeekMin: -0.1, gainPctPerWeekMax: 0.1 } },
  };

  const KIND_LABEL = {
    empfehlung: 'Empfehlung', schaetzwert: 'Schätzwert', richtwert: 'Richtwert',
    ai: 'Adäquate Zufuhr (AI)', max: 'Obergrenze', ziel: 'Dein Ziel'
  };

  const CATEGORIES = {
    fleisch: 'Fleisch', fisch: 'Fisch & Meeresfrüchte', ei: 'Eier', beilage: 'Beilagen',
    brot: 'Brot', gemuese: 'Gemüse', obst: 'Obst', nuesse: 'Nüsse', oel: 'Öl', milch: 'Milchprodukte', wuerze: 'Würzen'
  };
  const SHOP_GROUPS = [
    { id: 'fleischfisch', label: 'Fleisch & Fisch', cats: ['fleisch', 'fisch'] },
    { id: 'obstgemuese', label: 'Obst & Gemüse', cats: ['gemuese', 'obst', 'wuerze'] },
    { id: 'beilagen', label: 'Beilagen & Brot', cats: ['beilage', 'brot'] },
    { id: 'milch', label: 'Milchprodukte & Eier', cats: ['milch', 'ei'] },
    { id: 'vorraete', label: 'Vorräte', cats: ['nuesse', 'oel'] },
  ];

  const USDA = 'USDA FoodData Central, SR Legacy (Richtwert, nicht live abgerufen)';
  const EST = 'Schätzwert (typisches Produkt, kein Datenbankwert)';

  // [id, name, category, basis, n[], price {gut,premium,luxus} CZK/kg Einkaufsgewicht bzw. pro Stück, extra]
  const F = (id, name, category, basis, n, price, extra) => Object.assign({ id, name, category, basis, n, price, unit: 'g', ediblePortion: 1, source: USDA, quality: 'demo', fv: category === 'gemuese' || category === 'obst' }, extra || {});
  const _ = null;

  const FOODS_RAW = [
    F('ei', 'Ei (Größe M/L)', 'ei', 'roh', [143, 12.6, 0.72, 9.5, 0, 160, .04, .457, .075, .17, .89, 0, 2.0, 1.05, .3, 47, 56, 12, 138, 142, 1.75, 1.29, _, 30.7, 37, 48], { gut: 5, premium: 7, luxus: 10 }, { unit: 'stueck', gramsPerPiece: 55, note: 'Preis pro Stück; ca. 55 g essbarer Anteil je Ei.' }),
    F('sauerteigbrot', 'Sauerteigbrot (Weizen-Roggen)', 'brot', 'verzehrfertig', [240, 8.5, 51, 1.5, 4.5, 0, .15, .08, 2.0, .12, 0, 0, 0, .4, 1.0, 30, 25, 40, 200, 500, 1.6, 1.1, _, 12, 0, 60], { gut: 80, premium: 120, luxus: 180 }, { source: EST, quality: 'schaetzung', note: 'Je nach Bäcker stark unterschiedlich. Produkt-Etikett eintragen.' }),
    F('avocado', 'Avocado', 'obst', 'roh', [160, 2.0, 8.53, 14.66, 6.7, 7, .067, .13, 1.738, .257, 0, 10, 0, 2.07, 21, 81, 12, 29, 485, 7, .55, .64, _, .4, 0, 111], { gut: 150, premium: 200, luxus: 280 }, { ediblePortion: 0.7, note: 'Preis pro kg ganze Frucht; ca. 70 % essbar.' }),
    F('tomate', 'Tomaten', 'gemuese', 'roh', [18, .88, 3.89, .2, 1.2, 42, .037, .019, .594, .08, 0, 13.7, 0, .54, 7.9, 15, 10, 11, 237, 5, .27, .17, _, 0, 0, 3], { gut: 60, premium: 90, luxus: 140 }),
    F('orange', 'Orange', 'obst', 'roh', [47, .94, 11.75, .12, 2.4, 11, .087, .04, .282, .06, 0, 53.2, 0, .18, 0, 30, 40, 10, 181, 0, .1, .07, _, .5, 0, 7], { gut: 35, premium: 50, luxus: 80 }, { ediblePortion: 0.73 }),
    F('banane', 'Banane', 'obst', 'roh', [89, 1.09, 22.84, .33, 2.6, 3, .031, .073, .665, .367, 0, 8.7, 0, .1, .5, 20, 5, 27, 358, 1, .26, .15, _, 1.0, 0, 27], { gut: 30, premium: 40, luxus: 60 }, { ediblePortion: 0.65 }),
    F('walnuss', 'Walnüsse', 'nuesse', 'roh', [654, 15.23, 13.71, 65.21, 6.7, 1, .341, .15, 1.125, .537, 0, 1.3, 0, .7, 2.7, 98, 98, 158, 441, 2, 2.91, 3.09, _, 4.9, 0, 9080], { gut: 280, premium: 380, luxus: 550 }, { fv: false }),
    F('mandel', 'Mandeln', 'nuesse', 'roh', [579, 21.15, 21.55, 49.93, 12.5, 0, .205, 1.138, 3.618, .137, 0, 0, 0, 25.63, 0, 44, 269, 270, 733, 1, 3.71, 3.12, _, 4.1, 0, 3], { gut: 250, premium: 350, luxus: 500 }, { fv: false }),
    F('heidelbeere', 'Heidelbeeren', 'obst', 'roh', [57, .74, 14.49, .33, 2.4, 3, .037, .041, .418, .052, 0, 9.7, 0, .57, 19.3, 6, 6, 6, 77, 1, .28, .16, _, .1, 0, 58], { gut: 250, premium: 350, luxus: 500 }),
    F('himbeere', 'Himbeeren', 'obst', 'roh', [52, 1.2, 11.94, .65, 6.5, 2, .032, .038, .598, .055, 0, 26.2, 0, .87, 7.8, 21, 25, 22, 151, 1, .69, .42, _, .2, 0, 126], { gut: 300, premium: 450, luxus: 650 }),
    F('erdbeere', 'Erdbeeren', 'obst', 'roh', [32, .67, 7.68, .3, 2.0, 1, .024, .022, .386, .047, 0, 58.8, 0, .29, 2.2, 24, 16, 13, 153, 1, .41, .14, _, .4, 0, 65], { gut: 120, premium: 180, luxus: 300 }),

    F('haehnchenbrust', 'Hähnchenbrust', 'fleisch', 'roh', [120, 22.5, 0, 2.62, 0, 9, .094, .177, 9.6, .811, .21, 0, _, .21, _, 4, 5, 28, 334, 45, .37, .68, _, 22.8, _, _], { gut: 220, premium: 300, luxus: 400 }, { protein: 'haehnchen' }),
    F('haehnchenschenkel', 'Hähnchenschenkel (ohne Haut)', 'fleisch', 'roh', [121, 19.66, 0, 4.12, 0, 9, .085, .19, 5.3, .4, .55, 0, _, _, _, 8, 7, 23, 235, 95, .8, 1.6, _, 23, _, _], { gut: 120, premium: 180, luxus: 260 }, { protein: 'haehnchen', ediblePortion: 0.65, note: 'Preis pro kg Schenkel mit Knochen und Haut; ca. 65 % essbares Fleisch. Haut nicht eingerechnet (falls mitgegessen: ca. +35 kcal und +3 g Fett pro 10 g Haut).' }),
    F('rinderfilet', 'Rinderfilet', 'fleisch', 'roh', [143, 21.8, 0, 6.2, 0, _, .1, .25, 6.0, .6, 1.7, 0, _, _, _, 7, 6, 23, 330, 54, 2.5, 3.9, _, 23, _, _], { gut: 1100, premium: 1700, luxus: 2700 }, { protein: 'rind' }),
    F('rumpsteak', 'Rumpsteak (mit Fettrand)', 'fleisch', 'roh', [160, 21.5, 0, 8.0, 0, _, .08, .22, 6.5, .6, 1.6, 0, _, _, _, 8, 10, 24, 330, 55, 1.9, 3.8, _, 25, _, _], { gut: 650, premium: 950, luxus: 1400 }, { protein: 'rind', source: EST, quality: 'schaetzung', note: 'Fettgehalt hängt stark vom Zuschnitt ab.' }),
    F('ribeye', 'Ribeye (Entrecôte)', 'fleisch', 'roh', [250, 18.4, 0, 19.6, 0, _, .08, .17, 5.2, .5, 2.0, 0, _, _, _, 6, 12, 18, 290, 55, 1.8, 4.2, _, 18, _, _], { gut: 800, premium: 1200, luxus: 1800 }, { protein: 'rind', source: EST, quality: 'schaetzung', note: 'Deutlich fetter und energiereicher als Rumpsteak oder Filet.' }),
    F('rinderhack', 'Rinderhack (mager, ca. 5 % Fett)', 'fleisch', 'roh', [137, 21.4, 0, 5.0, 0, _, .04, .18, 5.8, .38, 2.2, 0, _, _, _, 6, 6, 21, 340, 66, 2.3, 5.2, _, 18, _, _], { gut: 260, premium: 350, luxus: 480 }, { protein: 'rind' }),
    F('lachs', 'Lachsfilet (Zucht)', 'fisch', 'roh', [208, 20.42, 0, 13.42, 0, 58, .207, .155, 8.672, .636, 3.23, 3.9, 11.0, 3.55, .5, 26, 9, 27, 363, 59, .34, .36, _, 24.0, 1966, _], { gut: 500, premium: 800, luxus: 1300 }, { protein: 'fisch' }),
    F('kabeljau', 'Kabeljaufilet', 'fisch', 'roh', [82, 17.81, 0, .67, 0, 12, .076, .065, 2.063, .245, .91, 1.0, .9, .64, .1, 7, 16, 32, 413, 54, .38, .45, 150, 33.1, 158, 1], { gut: 350, premium: 600, luxus: 900 }, { protein: 'fisch', note: 'Jodwert (150 µg) ist ein grober Mittelwert, schwankt stark.' }),
    F('forelle', 'Forellenfilet', 'fisch', 'roh', [141, 20.77, 0, 6.18, 0, 74, .133, .1, 4.6, .34, 3.5, 2.9, 16, _, _, 12, 33, 27, 361, 35, .29, .5, _, 12.6, 920, _], { gut: 350, premium: 550, luxus: 900 }, { protein: 'fisch' }),
    F('garnelen', 'Garnelen (roh, geschält)', 'fisch', 'roh', [85, 20.1, 0, .51, 0, _, .02, .015, 1.78, .16, 1.11, _, _, 1.32, _, 19, 64, 22, 264, 119, .21, .97, _, 38, 240, _], { gut: 350, premium: 600, luxus: 900 }, { protein: 'fisch', quality: 'schaetzung', note: 'Natrium kann bei vorbehandelter Ware deutlich höher sein.' }),

    F('basmati', 'Basmatireis', 'beilage', 'trocken', [365, 7.13, 79.95, .66, 1.3, 0, .07, .049, 1.6, .164, 0, 0, 0, .11, .1, 8, 28, 25, 115, 5, .8, 1.09, _, 15.1, 0, _], { gut: 50, premium: 90, luxus: 160 }),
    F('pasta', 'Pasta / Linguine (Hartweizen)', 'beilage', 'trocken', [371, 13.04, 74.67, 1.51, 3.2, 0, .09, .06, 1.7, .142, 0, 0, 0, .11, .1, 18, 21, 53, 223, 6, 1.3, 1.41, _, 63.2, 0, _], { gut: 50, premium: 90, luxus: 180 }),
    F('tortilla', 'Weizen-Tortilla', 'beilage', 'verzehrfertig', [306, 8.2, 50.6, 8.0, 3.5, 0, _, _, _, _, 0, 0, 0, _, _, _, 120, _, _, 740, _, _, _, _, 0, _], { gut: 120, premium: 160, luxus: 220 }, { source: EST, quality: 'schaetzung' }),
    F('kartoffel', 'Kartoffeln', 'beilage', 'roh', [77, 2.05, 17.49, .09, 2.1, 0, .081, .032, 1.061, .298, 0, 19.7, 0, .01, 2.0, 15, 12, 23, 425, 6, .81, .3, _, .4, 0, 10], { gut: 25, premium: 40, luxus: 60 }, { ediblePortion: 0.9, note: 'Zählt nicht als Gemüseportion.' }),
    F('suesskartoffel', 'Süßkartoffel', 'beilage', 'roh', [86, 1.57, 20.12, .05, 3.0, 709, .078, .061, .557, .209, 0, 2.4, 0, .26, 1.8, 11, 30, 25, 337, 55, .61, .3, _, .6, 0, 1], { gut: 50, premium: 70, luxus: 100 }, { ediblePortion: 0.9 }),

    F('brokkoli', 'Brokkoli', 'gemuese', 'roh', [34, 2.82, 6.64, .37, 2.6, 31, .071, .117, .639, .175, 0, 89.2, 0, .78, 101.6, 63, 47, 21, 316, 33, .73, .41, _, 2.5, 0, 21], { gut: 60, premium: 90, luxus: 130 }, { ediblePortion: 0.8 }),
    F('spargel', 'Grüner Spargel', 'gemuese', 'roh', [20, 2.2, 3.88, .12, 2.1, 38, .143, .141, .978, .091, 0, 5.6, 0, 1.13, 41.6, 52, 24, 14, 202, 2, 2.14, .54, _, 2.3, 0, 10], { gut: 150, premium: 250, luxus: 350 }, { ediblePortion: 0.8 }),
    F('karotte', 'Karotten', 'gemuese', 'roh', [41, .93, 9.58, .24, 2.8, 835, .066, .058, .983, .138, 0, 5.9, 0, .66, 13.2, 19, 33, 12, 320, 69, .3, .24, _, .1, 0, 2], { gut: 20, premium: 30, luxus: 50 }, { ediblePortion: 0.9 }),
    F('bohnen', 'Grüne Bohnen', 'gemuese', 'roh', [31, 1.83, 6.97, .22, 2.7, 35, .082, .104, .734, .141, 0, 12.2, 0, .41, 14.4, 33, 37, 25, 211, 6, 1.03, .24, _, .6, 0, 39], { gut: 80, premium: 120, luxus: 180 }, { ediblePortion: 0.9 }),
    F('spinat', 'Blattspinat (frisch)', 'gemuese', 'roh', [23, 2.86, 3.63, .39, 2.2, 469, .078, .189, .724, .195, 0, 28.1, 0, 2.03, 482.9, 194, 99, 79, 558, 79, 2.71, .53, _, 1.0, 0, 138], { gut: 120, premium: 180, luxus: 250 }, { note: 'Calcium und Eisen aus Spinat werden schlecht aufgenommen.' }),
    F('passata', 'Passata / gehackte Tomaten', 'gemuese', 'verzehrfertig', [32, 1.4, 6.0, .2, 1.5, 25, .05, .05, 1.0, .1, 0, 8, 0, 1.2, 4, 10, 20, 18, 330, 15, .9, .25, _, .5, 0, 5], { gut: 40, premium: 60, luxus: 100 }, { source: EST, quality: 'schaetzung' }),
    F('zucchini', 'Zucchini', 'gemuese', 'roh', [17, 1.21, 3.11, .32, 1.0, 10, .045, .094, .451, .163, 0, 17.9, 0, .12, 4.3, 24, 16, 18, 261, 8, .37, .32, _, .2, 0, _], { gut: 40, premium: 60, luxus: 90 }, { ediblePortion: 0.95 }),
    F('paprika', 'Rote Paprika', 'gemuese', 'roh', [31, .99, 6.03, .3, 2.1, 157, .054, .085, .979, .291, 0, 127.7, 0, 1.58, 4.9, 46, 7, 12, 211, 4, .43, .25, _, .1, 0, 25], { gut: 70, premium: 100, luxus: 150 }, { ediblePortion: 0.85 }),
    F('gurke', 'Gurke', 'gemuese', 'roh', [15, .65, 3.63, .11, .5, 5, .027, .033, .098, .04, 0, 2.8, 0, .03, 16.4, 7, 16, 13, 147, 2, .28, .2, _, .3, 0, 5], { gut: 40, premium: 60, luxus: 90 }, { ediblePortion: 0.97 }),
    F('erbsen', 'Erbsen (TK)', 'gemuese', 'roh', [77, 5.22, 13.62, .4, 4.5, 105, .283, .1, 2.09, .136, 0, 18, 0, _, _, 53, 22, 22, 153, 108, 1.47, .65, _, .6, 0, _], { gut: 60, premium: 80, luxus: 120 }),
    F('zwiebel', 'Zwiebeln', 'gemuese', 'roh', [40, 1.1, 9.34, .1, 1.7, 0, .046, .027, .116, .12, 0, 7.4, 0, .02, .4, 19, 23, 10, 146, 4, .21, .17, _, .5, 0, 4], { gut: 20, premium: 30, luxus: 50 }, { ediblePortion: 0.9 }),
    F('champignon', 'Champignons', 'gemuese', 'roh', [22, 3.09, 3.26, .34, 1.0, 0, .081, .402, 3.607, .104, .04, 2.1, .2, .01, 0, 17, 3, 9, 318, 5, .5, .52, _, 9.3, 0, 0], { gut: 80, premium: 120, luxus: 180 }, { ediblePortion: 0.97 }),
    F('knoblauch', 'Knoblauch', 'wuerze', 'roh', [149, 6.36, 33.06, .5, 2.1, 0, .2, .11, .7, 1.235, 0, 31.2, 0, .08, 1.7, 3, 181, 25, 401, 17, 1.7, 1.16, _, 14.2, 0, 20], { gut: 150, premium: 200, luxus: 300 }, { ediblePortion: 0.87, fv: false }),
    F('zitrone', 'Zitrone (Saft)', 'wuerze', 'roh', [22, .35, 6.9, .24, .3, 1, .024, .015, .091, .046, 0, 38.7, 0, .15, 0, 20, 6, 6, 103, 1, .08, .05, _, .1, 0, _], { gut: 50, premium: 70, luxus: 100 }, { ediblePortion: 0.45, fv: false, note: 'Preis pro kg Zitronen; ca. 45 % Saft.' }),

    F('olivenoel', 'Olivenöl (extra vergine)', 'oel', 'verzehrfertig', [884, 0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 14.35, 60.2, 0, 1, 0, 1, 2, .56, 0, 0, 0, 0, 761], { gut: 250, premium: 400, luxus: 700 }, { note: 'Preis pro kg (1 l ≈ 0,92 kg).' }),

    F('feta', 'Feta', 'milch', 'verzehrfertig', [264, 14.21, 4.09, 21.28, 0, 125, .154, .844, .991, .424, 1.69, 0, .4, .18, 1.8, 32, 493, 19, 62, 1116, .65, 2.88, _, 15, _, _], { gut: 250, premium: 350, luxus: 450 }),
    F('gouda', 'Gouda / Hartkäse', 'milch', 'verzehrfertig', [356, 24.94, 2.22, 27.44, 0, 165, .03, .334, .063, .08, 1.54, 0, .5, .24, 2.3, 21, 700, 29, 121, 819, .24, 3.9, _, 14.5, _, _], { gut: 200, premium: 300, luxus: 450 }),
    F('skyr', 'Skyr natur', 'milch', 'verzehrfertig', [63, 11, 4, .2, 0, _, _, _, _, _, _, 0, _, _, _, _, 120, _, _, 40, _, _, _, _, _, _], { gut: 100, premium: 140, luxus: 200 }, { source: EST, quality: 'schaetzung', note: 'Optionaler Snack, nicht fest im Plan.' }),
  ];

  // ---------------- Rezepte ----------------
  const I = (foodId, grams, preparation) => ({ foodId, grams, preparation: preparation || '' });
  const RECIPES = [
    // Frühstück
    { id: 'fr-klassik', slot: 'fruehstueck', protein: 'ei', name: 'Spiegeleier auf Sauerteig mit Avocado', time: 10,
      ingredients: [I('ei', 165, '3 Stück'), I('sauerteigbrot', 120, '2 dicke Scheiben, geröstet'), I('avocado', 80, 'halbe Frucht'), I('tomate', 150), I('orange', 150, '1 Stück')],
      steps: ['Brot rösten.', 'Eier in einer beschichteten Pfanne braten (ohne oder mit wenig Öl).', 'Avocado auf das Brot drücken, mit Salz, Pfeffer und Chiliflocken würzen, Eier drauf.', 'Tomaten in Scheiben dazu, Orange als Nachtisch.'] },
    { id: 'fr-feta-ruehrei', slot: 'fruehstueck', protein: 'ei', name: 'Rührei mit Feta & Spinat auf Sauerteig', time: 12,
      ingredients: [I('ei', 165, '3 Stück'), I('feta', 30, 'zerbröselt'), I('spinat', 60), I('sauerteigbrot', 120, 'geröstet'), I('tomate', 100), I('orange', 150, '1 Stück')],
      steps: ['Spinat in der Pfanne kurz zusammenfallen lassen.', 'Verquirlte Eier dazugeben, bei mittlerer Hitze cremig stocken lassen.', 'Feta darüber bröseln, pfeffern (Feta ist schon salzig).', 'Mit geröstetem Brot, Tomaten und Orange servieren.'] },
    { id: 'fr-omelett', slot: 'fruehstueck', protein: 'ei', name: 'Omelett mit Champignons & Paprika', time: 15,
      ingredients: [I('ei', 165, '3 Stück'), I('champignon', 100, 'in Scheiben'), I('paprika', 100, 'gewürfelt'), I('olivenoel', 5), I('sauerteigbrot', 120), I('orange', 150, '1 Stück')],
      steps: ['Champignons und Paprika im Öl 4–5 Minuten anbraten.', 'Eier verquirlen, salzen, darübergießen und bei kleiner Hitze stocken lassen.', 'Zusammenklappen, mit Brot und Orange servieren.'] },
    // Snacks
    { id: 'sn-beeren', slot: 'snack', protein: 'mix', name: 'Banane, Walnüsse & Beeren', time: 2,
      ingredients: [I('banane', 120, '1 Stück'), I('walnuss', 30, 'eine Handvoll'), I('heidelbeere', 100), I('himbeere', 50)],
      steps: ['Alles in eine Schale geben – fertig. Gut zum Mitnehmen.'] },
    { id: 'sn-mandel', slot: 'snack', protein: 'mix', name: 'Banane, Mandeln & Erdbeeren', time: 2,
      ingredients: [I('banane', 120, '1 Stück'), I('mandel', 30, 'eine Handvoll'), I('erdbeere', 150)],
      steps: ['Erdbeeren waschen, mit Banane und Mandeln snacken.'] },
    { id: 'sn-brot-kaese', slot: 'snack', protein: 'mix', name: 'Sauerteig mit Gouda & Obst', time: 3,
      ingredients: [I('sauerteigbrot', 60, '1 Scheibe'), I('gouda', 40), I('erdbeere', 150), I('walnuss', 15)],
      steps: ['Brot mit Käse belegen, Obst und Nüsse dazu.'] },
    { id: 'sn-skyr', slot: 'snack', protein: 'mix', name: 'Skyr mit Beeren & Walnüssen (optional)', time: 2, optional: true,
      ingredients: [I('skyr', 250), I('heidelbeere', 100), I('himbeere', 50), I('walnuss', 20)],
      steps: ['Skyr in eine Schale, Beeren und gehackte Walnüsse drüber.'] },
    // Hauptgerichte
    { id: 'm-zitronen-haehnchen', slot: 'haupt', protein: 'haehnchen', name: 'Zitronen-Knoblauch-Hähnchen mit Basmati & Brokkoli', time: 25,
      ingredients: [I('haehnchenbrust', 220), I('basmati', 110, 'trocken gewogen'), I('brokkoli', 250, 'Röschen'), I('olivenoel', 15), I('knoblauch', 6, '2 Zehen'), I('zitrone', 20, 'Saft einer halben Zitrone')],
      steps: ['Reis nach Packung kochen.', 'Hähnchen in Streifen schneiden, salzen, in 10 g Öl 6–7 Minuten goldbraun braten.', 'Knoblauch kurz mitbraten, mit Zitronensaft ablöschen.', 'Brokkoli 4 Minuten dämpfen, mit dem restlichen Öl beträufeln.'] },
    { id: 'm-ofenlachs', slot: 'haupt', protein: 'fisch', name: 'Ofenlachs mit Rosmarinkartoffeln & grünem Spargel', time: 35,
      ingredients: [I('lachs', 230), I('kartoffel', 400, 'geviertelt'), I('spargel', 200), I('olivenoel', 10), I('zitrone', 20)],
      steps: ['Ofen auf 200 °C. Kartoffeln mit der Hälfte des Öls, Salz und Rosmarin 25 Minuten backen.', 'Lachs und Spargel aufs Blech legen, restliches Öl darüber, 12 Minuten mitbacken.', 'Mit Zitrone beträufeln.'] },
    { id: 'm-gyros-pfanne', slot: 'haupt', protein: 'haehnchen', name: 'Hähnchen-Gyros-Pfanne mit Ofenkartoffeln & Karotten', time: 40,
      ingredients: [I('haehnchenbrust', 220, 'in Streifen'), I('kartoffel', 400), I('karotte', 200, 'in Stiften'), I('zwiebel', 80), I('olivenoel', 15)],
      steps: ['Kartoffeln und Karotten mit 8 g Öl bei 210 °C ca. 30 Minuten rösten.', 'Hähnchen mit Gyros-Gewürz (Paprika, Oregano, Knoblauch, Kreuzkümmel) marinieren.', 'Mit Zwiebelringen im restlichen Öl scharf anbraten.'] },
    { id: 'm-rinderfilet', slot: 'haupt', protein: 'rind', name: 'Rinderfilet mit Knoblauch-Bohnen & Kartoffeln', time: 30,
      ingredients: [I('rinderfilet', 200), I('kartoffel', 350), I('bohnen', 250), I('olivenoel', 10), I('knoblauch', 6)],
      steps: ['Kartoffeln in Salzwasser 20 Minuten kochen.', 'Filet 30 Minuten vorher aus dem Kühlschrank nehmen, pro Seite 3 Minuten scharf anbraten, 5 Minuten ruhen lassen.', 'Bohnen 6 Minuten blanchieren, mit Knoblauch im Öl schwenken.'] },
    { id: 'm-kabeljau-spinat', slot: 'haupt', protein: 'fisch', name: 'Kabeljau mit Knoblauch-Spinat & Reis', time: 25,
      ingredients: [I('kabeljau', 250), I('basmati', 120, 'trocken'), I('spinat', 250), I('olivenoel', 15), I('knoblauch', 8), I('zitrone', 20)],
      steps: ['Reis kochen.', 'Kabeljau salzen, in 8 g Öl pro Seite 3–4 Minuten braten.', 'Spinat mit Knoblauch im restlichen Öl zusammenfallen lassen, mit Zitrone abschmecken.'] },
    { id: 'm-haehnchen-pasta', slot: 'haupt', protein: 'haehnchen', name: 'Hähnchen-Pasta in Tomaten-Zucchini-Sauce', time: 30,
      ingredients: [I('haehnchenbrust', 200, 'gewürfelt'), I('pasta', 120, 'trocken'), I('passata', 250), I('zucchini', 200), I('zwiebel', 50), I('olivenoel', 15), I('knoblauch', 6)],
      steps: ['Pasta kochen.', 'Hähnchen in Öl anbraten, herausnehmen.', 'Zwiebel, Knoblauch und Zucchini 5 Minuten braten, Passata dazu, 10 Minuten köcheln.', 'Hähnchen und Pasta unterheben, mit Basilikum servieren.'] },
    { id: 'm-hack-bowl', slot: 'haupt', protein: 'rind', name: 'Rinderhack-Bowl mit Reis, Paprika & Gurke', time: 20,
      ingredients: [I('rinderhack', 200), I('basmati', 110, 'trocken'), I('paprika', 150), I('gurke', 150), I('zwiebel', 50), I('olivenoel', 10)],
      steps: ['Reis kochen.', 'Hack mit Zwiebel krümelig braten, mit Paprikapulver, Kreuzkümmel, Salz würzen.', 'Paprika kurz mitbraten, Gurke frisch dazu.', 'Optional: Joghurt-Knoblauch-Sauce oder Chili.'] },
    { id: 'm-forelle', slot: 'haupt', protein: 'fisch', name: 'Forelle mit Petersilienkartoffeln & Brokkoli', time: 30,
      ingredients: [I('forelle', 230), I('kartoffel', 400), I('brokkoli', 250), I('olivenoel', 10), I('zitrone', 20)],
      steps: ['Kartoffeln kochen, mit Petersilie schwenken.', 'Forelle auf der Hautseite in Öl knusprig braten, kurz wenden.', 'Brokkoli dämpfen, alles mit Zitrone servieren.'] },
    { id: 'm-wraps', slot: 'haupt', protein: 'haehnchen', name: 'Hähnchen-Wraps mit Paprika, Feta & Gurke', time: 20,
      ingredients: [I('haehnchenbrust', 200, 'in Streifen'), I('tortilla', 130, '2 große Wraps'), I('paprika', 100), I('gurke', 100), I('tomate', 100), I('feta', 30), I('olivenoel', 10)],
      steps: ['Hähnchen mit Paprikapulver und Salz in Öl braten.', 'Paprika kurz mitbraten.', 'Wraps kurz erwärmen, mit Hähnchen, Gemüse und Feta füllen und einrollen.'] },
    { id: 'm-garnelen-linguine', slot: 'haupt', protein: 'fisch', name: 'Knoblauch-Garnelen-Linguine mit Tomaten & Spinat', time: 20,
      ingredients: [I('garnelen', 220), I('pasta', 130, 'Linguine, trocken'), I('tomate', 200, 'Kirschtomaten halbiert'), I('spinat', 150), I('olivenoel', 15), I('knoblauch', 8), I('zitrone', 20)],
      steps: ['Linguine kochen, etwas Nudelwasser aufheben.', 'Knoblauch in Öl anschwitzen, Garnelen 2 Minuten pro Seite braten.', 'Tomaten und Spinat dazu, mit Nudelwasser und Zitrone eine leichte Sauce ziehen.', 'Linguine unterheben, mit Chili servieren.'] },
    { id: 'm-lachs-bowl', slot: 'haupt', protein: 'fisch', name: 'Lachs-Reis-Bowl mit Avocado & Gurke', time: 25,
      ingredients: [I('lachs', 200), I('basmati', 110, 'trocken'), I('avocado', 80), I('gurke', 150), I('karotte', 80, 'geraspelt'), I('olivenoel', 5), I('zitrone', 20)],
      steps: ['Reis kochen und etwas abkühlen lassen.', 'Lachs in Würfeln kurz braten oder im Ofen garen (10 Min., 200 °C).', 'Reis in eine Schale, Lachs, Avocado, Gurke und Karotte drauf.', 'Dressing aus Öl, Zitrone, etwas Sojasauce oder Salz.'] },
    { id: 'm-rumpsteak', slot: 'haupt', protein: 'rind', name: 'Rumpsteak mit Ofenkartoffeln & Spargel', time: 35,
      ingredients: [I('rumpsteak', 230), I('kartoffel', 400), I('spargel', 250), I('olivenoel', 10)],
      steps: ['Kartoffeln mit 5 g Öl bei 210 °C 30 Minuten rösten.', 'Steak salzen, pro Seite 2–3 Minuten scharf braten, 5 Minuten ruhen lassen.', 'Spargel in der Steakpfanne mit dem restlichen Öl 5 Minuten braten.'] },
    { id: 'm-reispfanne', slot: 'haupt', protein: 'haehnchen', name: 'Hähnchen-Reispfanne mit Erbsen & Karotten', time: 25,
      ingredients: [I('haehnchenbrust', 220), I('basmati', 110, 'trocken, am besten vom Vortag'), I('karotte', 150), I('erbsen', 150), I('zwiebel', 50), I('olivenoel', 10)],
      steps: ['Reis kochen (oder Reste vom Vortag nehmen).', 'Hähnchen anbraten, Zwiebel, Karotte und Erbsen 4 Minuten mitbraten.', 'Reis dazu, scharf anbraten, mit Sojasauce oder Salz und Pfeffer würzen.'] },
    { id: 'm-ofenhaehnchen', slot: 'haupt', protein: 'haehnchen', name: 'Ofenhähnchen-Schenkel mit Kartoffeln, Zucchini & Paprika', time: 50,
      ingredients: [I('haehnchenschenkel', 250, 'essbarer Anteil, ohne Haut gerechnet'), I('kartoffel', 400), I('zucchini', 200), I('paprika', 150), I('olivenoel', 15)],
      steps: ['Ofen auf 200 °C.', 'Schenkel mit Paprikapulver, Knoblauch und Salz würzen.', 'Kartoffeln und Gemüse mit Öl aufs Blech, Schenkel drauf, 40–45 Minuten backen.'] },
    // Alternativen, nicht fest im Plan
    { id: 'm-suesskartoffel-hack', slot: 'haupt', protein: 'rind', name: 'Süßkartoffel-Rinderhack-Pfanne mit Spinat', time: 30,
      ingredients: [I('rinderhack', 200), I('suesskartoffel', 350, 'gewürfelt'), I('spinat', 150), I('zwiebel', 50), I('olivenoel', 10)],
      steps: ['Süßkartoffelwürfel in 5 g Öl 12 Minuten braten.', 'Hack mit Zwiebel dazugeben und krümelig braten.', 'Spinat unterheben, mit Paprika und Kreuzkümmel würzen.'] },
    { id: 'm-ribeye', slot: 'haupt', protein: 'rind', name: 'Ribeye mit Kartoffeln & Champignons', time: 30,
      ingredients: [I('ribeye', 230), I('kartoffel', 350), I('champignon', 200), I('bohnen', 150), I('olivenoel', 5)],
      steps: ['Kartoffeln kochen.', 'Ribeye scharf braten (Fettrand zuerst anbraten), ruhen lassen.', 'Champignons und Bohnen im Bratfett schwenken.'] },
    { id: 'm-kabeljau-ofen', slot: 'haupt', protein: 'fisch', name: 'Kabeljau aus dem Ofen mit Süßkartoffel & Bohnen', time: 35,
      ingredients: [I('kabeljau', 250), I('suesskartoffel', 350), I('bohnen', 200), I('olivenoel', 15), I('zitrone', 20)],
      steps: ['Süßkartoffelspalten mit Öl bei 210 °C 25 Minuten backen.', 'Kabeljau und Bohnen dazulegen, 12 Minuten mitbacken.', 'Mit Zitrone und Kräutern servieren.'] },
  ];

  const SLOTS = [
    { id: 'fruehstueck', label: 'Frühstück', recipeSlot: 'fruehstueck' },
    { id: 'mittag', label: 'Mittag', recipeSlot: 'haupt' },
    { id: 'snack', label: 'Snack', recipeSlot: 'snack' },
    { id: 'abend', label: 'Abend', recipeSlot: 'haupt' },
  ];
  const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const DAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  const E = (recipeId) => ({ recipeId, portions: 1, ingredients: null });
  const DEFAULT_PLAN = [
    { fruehstueck: E('fr-klassik'), mittag: E('m-zitronen-haehnchen'), snack: E('sn-beeren'), abend: E('m-ofenlachs') },
    { fruehstueck: E('fr-feta-ruehrei'), mittag: E('m-gyros-pfanne'), snack: E('sn-beeren'), abend: E('m-rinderfilet') },
    { fruehstueck: E('fr-klassik'), mittag: E('m-kabeljau-spinat'), snack: E('sn-mandel'), abend: E('m-haehnchen-pasta') },
    { fruehstueck: E('fr-omelett'), mittag: E('m-hack-bowl'), snack: E('sn-beeren'), abend: E('m-forelle') },
    { fruehstueck: E('fr-klassik'), mittag: E('m-wraps'), snack: E('sn-mandel'), abend: E('m-garnelen-linguine') },
    { fruehstueck: E('fr-feta-ruehrei'), mittag: E('m-lachs-bowl'), snack: E('sn-beeren'), abend: E('m-rumpsteak') },
    { fruehstueck: E('fr-klassik'), mittag: E('m-reispfanne'), snack: E('sn-mandel'), abend: E('m-ofenhaehnchen') },
  ];

  const DEFAULT_SETTINGS = {
    profile: { age: 30, sex: 'm', heightCm: 180, weightKg: 80, trainingPerWeek: 3, activity: 'mittel' },
    targets: { kcal: 2900, protein: 160, fat: 90, fiber: 30, fruitVeg: 500, gainPctPerWeekMin: 0.1, gainPctPerWeekMax: 0.25 },
    currency: { showEur: false, rate: 24.5 },
    scenario: 'premium',
    prefs: { showDairySnack: false },
  };

  function buildFoods() {
    const foods = {};
    for (const f of FOODS_RAW) {
      const n = {};
      SEED_KEYS.forEach((k, i) => { n[k] = f.n[i] === undefined ? null : f.n[i]; });
      // verwertbare KH = Gesamt-KH (USDA, inkl. Ballaststoffe) − Ballaststoffe
      n.carbs = n.carbTotal === null ? null : Math.max(0, Math.round((n.carbTotal - (n.fiber || 0)) * 100) / 100);
      delete n.carbTotal;
      foods[f.id] = Object.assign({}, f, { n });
    }
    return foods;
  }

  // Suchbegriffe für rohlik.cz (Tschechisch)
  const ROHLIK_QUERIES = {
    ei: 'vejce', sauerteigbrot: 'kváskový chléb', avocado: 'avokádo', tomate: 'rajčata', orange: 'pomeranče', banane: 'banány',
    walnuss: 'vlašské ořechy', mandel: 'mandle', heidelbeere: 'borůvky', himbeere: 'maliny', erdbeere: 'jahody',
    haehnchenbrust: 'kuřecí prsa', haehnchenschenkel: 'kuřecí stehna', rinderfilet: 'hovězí svíčková', rumpsteak: 'rumpsteak',
    ribeye: 'ribeye steak', rinderhack: 'hovězí mleté maso', lachs: 'lososový filet', kabeljau: 'treska filet', forelle: 'pstruh filet',
    garnelen: 'krevety loupané', basmati: 'rýže basmati', pasta: 'linguine', tortilla: 'tortilla pšeničná', kartoffel: 'brambory',
    suesskartoffel: 'batáty', brokkoli: 'brokolice', spargel: 'zelený chřest', karotte: 'mrkev', bohnen: 'zelené fazolky',
    spinat: 'baby špenát', passata: 'passata', zucchini: 'cuketa', paprika: 'červená paprika', gurke: 'okurka salátová',
    erbsen: 'hrášek mražený', zwiebel: 'cibule', champignon: 'žampiony', knoblauch: 'česnek', zitrone: 'citrony',
    olivenoel: 'olivový olej extra panenský', feta: 'feta sýr', gouda: 'gouda', skyr: 'skyr',
  };

  const Data = { ROHLIK_QUERIES, REFERENCES_F, DEFAULT_PERSONS, NUTRIENTS, REFERENCES, KIND_LABEL, CATEGORIES, SHOP_GROUPS, RECIPES, SLOTS, DAYS, DAYS_SHORT, DEFAULT_PLAN, DEFAULT_SETTINGS, buildFoods, REF_CHECK };
  if (typeof module !== 'undefined' && module.exports) module.exports = Data; else root.NData = Data;
})(typeof window !== 'undefined' ? window : globalThis);
