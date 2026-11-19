'use strict';
/* In-house meal plates and a small ingredient table.
   Gironda plates are the cut style (eggs, meat, fish, liver). Dolce-style plates are
   whole-food ideas for after the cut. Neither copies a book. Macros are estimates
   from the ingredient table, per 100 g, and an egg is counted as 50 g (a white as 33 g). */
const Meals = (() => {
  const round1 = (n) => Math.round(n * 10) / 10;
  // [id, name, kcal, p, c, f per 100 g, extra names the parser should recognise]
  const RAW = [
    ['egg', 'Whole egg', 143, 12.6, 0.7, 9.5, ['eggs', 'egg']],
    ['eggwhite', 'Egg white', 52, 10.9, 0.7, 0.2, ['egg whites', 'egg white']],
    ['beef', 'Lean beef, cooked', 200, 29, 0, 9, ['beef', 'steak', 'rump', 'mince']],
    ['chicken', 'Chicken breast, cooked', 165, 31, 0, 3.6, ['chicken']],
    ['turkey', 'Turkey breast, cooked', 135, 30, 0, 1, ['turkey']],
    ['cod', 'White fish, cooked', 96, 21, 0, 1, ['white fish', 'cod', 'haddock', 'fish']],
    ['salmon', 'Salmon, cooked', 208, 20, 0, 13, ['salmon']],
    ['tuna', 'Tuna in water', 116, 26, 0, 1, ['tuna']],
    ['sardine', 'Sardines, drained', 208, 25, 0, 11, ['sardines', 'sardine']],
    ['liver', 'Beef liver, cooked', 175, 27, 5, 5, ['liver']],
    ['cottage', 'Cottage cheese', 98, 11, 3.4, 4.3, ['cottage cheese', 'cottage']],
    ['cream', 'Double cream', 340, 2, 3, 36, ['double cream', 'cream']],
    ['milk', 'Whole milk', 61, 3.2, 4.8, 3.3, ['milk']],
    ['oats', 'Oats, dry', 379, 13, 68, 7, ['oats', 'oat']],
    ['quinoa', 'Quinoa, cooked', 120, 4.4, 21, 1.9, ['quinoa']],
    ['potato', 'Sweet potato, cooked', 90, 2, 21, 0.1, ['sweet potato']],
    ['broccoli', 'Broccoli', 34, 2.8, 7, 0.4, ['broccoli']],
    ['spinach', 'Spinach', 23, 2.9, 3.6, 0.4, ['spinach', 'greens']],
    ['onion', 'Onion', 40, 1.1, 9, 0.1, ['onions', 'onion']],
    ['berries', 'Berries', 57, 0.7, 14, 0.3, ['berries', 'blueberries']],
    ['banana', 'Banana', 89, 1.1, 23, 0.3, ['banana']],
    ['almonds', 'Almonds', 579, 21, 22, 50, ['almonds', 'almond']],
    ['oil', 'Olive oil', 884, 0, 0, 100, ['olive oil']],
    ['tallow', 'Beef fat', 902, 0, 0, 100, ['beef fat', 'tallow']],
  ];
  const INGREDIENTS = RAW.map(([id, name, kcal, p, c, f, also]) => ({ id, name, kcal, p, c, f, also }));
  const byId = new Map(INGREDIENTS.map((x) => [x.id, x]));

  function ofGrams(id, grams) {
    const ing = byId.get(id);
    const g = Number(grams);
    if (!ing || !(g > 0)) return null;
    const k = g / 100;
    return { id, grams: Math.round(g), name: ing.name, kcal: Math.round(ing.kcal * k), p: round1(ing.p * k), c: round1(ing.c * k), f: round1(ing.f * k) };
  }
  function sum(lines) {
    const t = { kcal: 0, p: 0, c: 0, f: 0 };
    for (const line of lines || []) {
      const bit = line.kcal != null ? line : ofGrams(line.id, line.grams);
      if (!bit) continue;
      t.kcal += bit.kcal; t.p += bit.p; t.c += bit.c; t.f += bit.f;
    }
    return { kcal: Math.round(t.kcal), p: round1(t.p), c: round1(t.c), f: round1(t.f) };
  }
  function matchFood(words) {
    const n = String(words || '').toLowerCase();
    let best = null;
    let len = 0;
    for (const ing of INGREDIENTS) {
      for (const alias of [ing.name, ...ing.also]) {
        const a = alias.toLowerCase();
        if (n.includes(a) && a.length > len) { best = ing.id; len = a.length; }
      }
    }
    return best;
  }
  function parseLine(line) {
    const s = String(line || '').toLowerCase().replace(/×/g, 'x').trim();
    if (!s) return null;
    let m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(egg whites?|eggs?)\b/);
    if (!m) m = s.match(/(egg whites?|eggs?)\s*(?:x\s*)?(\d+(?:[.,]\d+)?)/);
    if (m) {
      const count = Number(String(m[1].match(/^\d/) ? m[1] : m[2]).replace(',', '.'));
      const white = /white/.test(m[1] + (m[2] || ''));
      if (!(count > 0)) return null;
      return ofGrams(white ? 'eggwhite' : 'egg', count * (white ? 33 : 50));
    }
    m = s.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml)\b\s*(.+)/);
    if (m) {
      let grams = Number(m[1].replace(',', '.'));
      if (m[2] === 'kg') grams *= 1000;
      const id = matchFood(m[3]);
      return id ? ofGrams(id, grams) : null;
    }
    return null;
  }
  function parseRecipeText(text) {
    const missed = [];
    const lines = [];
    for (const raw of String(text || '').split(/\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const hit = parseLine(line);
      if (hit) lines.push(hit);
      else missed.push(line);
    }
    return { lines, missed, ...sum(lines) };
  }

  function plate(id, name, style, parts, blurb) {
    const lines = parts.map(([fid, grams]) => ofGrams(fid, grams)).filter(Boolean);
    return { id, name, style, blurb, lines, serves: 1, ...sum(lines) };
  }
  // Gironda (cut): eggs with meat, fish or liver. Zero or very low carbohydrate.
  const GIRONDA = [
    plate('g-hormone', 'Hormone meal: 6 eggs + 250 g beef', 'gironda', [['egg', 300], ['beef', 250]], 'The egg-and-meat plate. Six eggs counted at 50 g each.'),
    plate('g-steak4', 'Steak and 4 eggs', 'gironda', [['egg', 200], ['beef', 200]], 'A smaller steak-and-eggs plate.'),
    plate('g-fish', 'White fish and 4 eggs', 'gironda', [['egg', 200], ['cod', 200]], 'Fish and eggs.'),
    plate('g-salmon', 'Salmon and 3 eggs', 'gironda', [['egg', 150], ['salmon', 150]], 'Oily fish and eggs.'),
    plate('g-liver', 'Liver and onions', 'gironda', [['liver', 150], ['onion', 100], ['tallow', 10]], 'Liver, onion, and a little beef fat.'),
    plate('g-chicken', 'Chicken and 3 eggs', 'gironda', [['egg', 150], ['chicken', 200]], 'Chicken breast and eggs.'),
    plate('g-cottage', 'Cottage cheese and 2 eggs', 'gironda', [['cottage', 300], ['egg', 100]], 'Cottage cheese with eggs.'),
    plate('g-shake', 'Cream and egg shake', 'gironda', [['egg', 150], ['cream', 80]], 'Three eggs blended with double cream. A shake, not a recipe from a book.'),
    plate('g-mince', 'Mince and 3 eggs', 'gironda', [['egg', 150], ['beef', 200]], 'Beef mince and eggs.'),
    plate('g-tuna', 'Tuna and 4 eggs', 'gironda', [['egg', 200], ['tuna', 150]], 'Tuna in water and eggs.'),
    plate('g-sardine', 'Sardines and 2 eggs', 'gironda', [['egg', 100], ['sardine', 120]], 'Sardines and eggs.'),
    plate('g-beefliver', 'Beef and liver', 'gironda', [['beef', 150], ['liver', 100]], 'Steak and liver, no starch.'),
  ];
  // Dolce-style (post-cut): lean protein, veg, fruit, oats, quinoa, nuts. Written here.
  const DOLCE = [
    plate('d-breakfast', 'Dolce-style breakfast plate', 'dolce', [['eggwhite', 200], ['oats', 50], ['berries', 100], ['cottage', 100]], 'Egg whites, oats, berries and cottage cheese.'),
    plate('d-lunch', 'Dolce-style chicken and quinoa', 'dolce', [['chicken', 180], ['quinoa', 150], ['broccoli', 150], ['oil', 5]], 'Chicken, quinoa, broccoli, a teaspoon of olive oil.'),
    plate('d-dinner', 'Dolce-style fish and sweet potato', 'dolce', [['cod', 200], ['potato', 180], ['spinach', 100], ['oil', 5]], 'White fish, sweet potato and spinach.'),
    plate('d-snack', 'Dolce-style cottage snack', 'dolce', [['cottage', 200], ['almonds', 15], ['berries', 80]], 'Cottage cheese, a few almonds, berries.'),
    plate('d-shake', 'Dolce-style oats and berry shake', 'dolce', [['milk', 250], ['oats', 40], ['berries', 80], ['almonds', 15]], 'Milk, oats, berries and almonds blended.'),
    plate('d-turkey', 'Dolce-style turkey plate', 'dolce', [['turkey', 180], ['quinoa', 150], ['broccoli', 150]], 'Turkey, quinoa and broccoli.'),
    plate('d-beef', 'Dolce-style lean beef and fruit', 'dolce', [['beef', 150], ['spinach', 150], ['berries', 100], ['banana', 80]], 'Lean beef, greens and fruit.'),
    plate('d-salmon', 'Dolce-style salmon and greens', 'dolce', [['salmon', 150], ['broccoli', 200], ['quinoa', 100]], 'Salmon, a lot of broccoli, a small quinoa.'),
  ];

  function perServing(meal) {
    const n = Math.max(1, Number(meal?.serves) || 1);
    return {
      kcal: Math.round((Number(meal.kcal) || 0) / n),
      p: round1((Number(meal.p) || 0) / n),
      c: round1((Number(meal.c) || 0) / n),
      f: round1((Number(meal.f) || 0) / n),
    };
  }
  function cleanRecipe(x) {
    if (!x || typeof x !== 'object') return null;
    const name = String(x.name || '').trim().slice(0, 80);
    if (!name) return null;
    const serves = Math.max(1, Math.min(20, Math.round(Number(x.serves) || 1)));
    const lines = (Array.isArray(x.lines) ? x.lines : []).map((l) => ofGrams(l.id, l.grams)).filter(Boolean).slice(0, 30);
    const given = [x.kcal, x.p, x.c, x.f].every((n) => Number.isFinite(Number(n)) && Number(n) >= 0);
    const macros = given ? { kcal: Math.round(Number(x.kcal)), p: round1(Number(x.p)), c: round1(Number(x.c)), f: round1(Number(x.f)) } : sum(lines);
    if (!lines.length && !given) return null;
    return {
      id: String(x.id || '').slice(0, 40),
      name,
      serves,
      lines: lines.map((l) => ({ id: l.id, grams: l.grams })),
      ...macros,
      photoId: typeof x.photoId === 'string' ? x.photoId.slice(0, 80) : '',
      note: String(x.note || '').slice(0, 240),
    };
  }

  return {
    INGREDIENTS, GIRONDA, DOLCE, ofGrams, sum, parseLine, parseRecipeText, perServing, cleanRecipe, matchFood,
  };
})();
