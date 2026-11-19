'use strict';
/* In-house meal plates and a small ingredient table.
   Gironda plates are the cut style (eggs, meat, fish, liver). Dolce-style plates are
   whole-food ideas for after the cut. Neither copies a book. Macros are estimates
   from the ingredient table, per 100 g, and an egg is counted as 50 g (a white as 33 g). */
const Meals = (() => {
  const round1 = (n) => Math.round(n * 10) / 10;
  // [id, name, kcal, p, c, f, fibre per 100 g, extra names]. Figures are standard UK/USDA-style estimates.
  const RAW = [
    ['egg', 'Whole egg', 143, 12.6, 0.7, 9.5, 0, ['eggs', 'egg']],
    ['eggwhite', 'Egg white', 52, 10.9, 0.7, 0.2, 0, ['egg whites', 'egg white']],
    ['beef', 'Lean beef, cooked', 200, 29, 0, 9, 0, ['beef', 'steak', 'rump', 'mince']],
    ['chicken', 'Chicken breast, cooked', 165, 31, 0, 3.6, 0, ['chicken']],
    ['turkey', 'Turkey breast, cooked', 135, 30, 0, 1, 0, ['turkey']],
    ['cod', 'White fish, cooked', 96, 21, 0, 1, 0, ['white fish', 'cod', 'haddock']],
    ['salmon', 'Salmon, cooked', 208, 20, 0, 13, 0, ['salmon']],
    ['tuna', 'Tuna in water', 116, 26, 0, 1, 0, ['tuna']],
    ['sardine', 'Sardines, drained', 208, 25, 0, 11, 0, ['sardines', 'sardine']],
    ['prawn', 'Prawns, cooked', 99, 24, 0.2, 0.3, 0, ['prawns', 'prawn']],
    ['liver', 'Beef liver, cooked', 175, 27, 5, 5, 0, ['liver']],
    ['cottage', 'Cottage cheese', 98, 11, 3.4, 4.3, 0, ['cottage cheese', 'cottage']],
    ['yogurt', 'Greek-style yogurt, 0%', 59, 10.3, 3.6, 0.4, 0, ['yogurt', 'yoghurt']],
    ['cream', 'Double cream', 340, 2, 3, 36, 0, ['double cream', 'cream']],
    ['milk', 'Whole milk', 61, 3.2, 4.8, 3.3, 0, ['milk']],
    ['oats', 'Oats, dry', 379, 13, 68, 7, 10.6, ['oats', 'oat']],
    ['quinoa', 'Quinoa, cooked', 120, 4.4, 21, 1.9, 2.8, ['quinoa']],
    ['potato', 'Sweet potato, cooked', 90, 2, 21, 0.1, 3.3, ['sweet potato']],
    ['broccoli', 'Broccoli', 34, 2.8, 7, 0.4, 2.6, ['broccoli']],
    ['spinach', 'Spinach', 23, 2.9, 3.6, 0.4, 2.2, ['spinach']],
    ['onion', 'Onion', 40, 1.1, 9, 0.1, 1.7, ['onions', 'onion']],
    ['pepper', 'Pepper', 31, 1, 6, 0.3, 2.1, ['pepper', 'peppers']],
    ['tomato', 'Tomato', 18, 0.9, 3.9, 0.2, 1.2, ['tomato', 'tomatoes']],
    ['mushroom', 'Mushrooms', 22, 3.1, 3.3, 0.3, 1, ['mushrooms', 'mushroom']],
    ['courgette', 'Courgette', 17, 1.2, 3.1, 0.3, 1, ['courgette', 'courgettes']],
    ['carrot', 'Carrot', 41, 0.9, 10, 0.2, 2.8, ['carrot', 'carrots']],
    ['peas', 'Peas, boiled', 81, 5.4, 14, 0.4, 5.5, ['peas']],
    ['berries', 'Berries', 57, 0.7, 14, 0.3, 2.4, ['berries', 'blueberries']],
    ['banana', 'Banana', 89, 1.1, 23, 0.3, 2.6, ['banana']],
    ['apple', 'Apple', 52, 0.3, 14, 0.2, 2.4, ['apple']],
    ['almonds', 'Almonds', 579, 21, 22, 50, 12.5, ['almonds', 'almond']],
    ['seeds', 'Mixed seeds', 570, 24, 15, 48, 8, ['seeds', 'seed']],
    ['oil', 'Olive oil', 884, 0, 0, 100, 0, ['olive oil']],
    ['tallow', 'Beef fat', 902, 0, 0, 100, 0, ['beef fat', 'tallow']],
    ['f-broccoli', 'Frozen broccoli florets', 34, 2.8, 7, 0.4, 2.6, ['frozen broccoli']],
    ['f-spinach', 'Bagged spinach', 23, 2.9, 3.6, 0.4, 2.2, ['bagged spinach']],
    ['f-berries', 'Frozen berries', 57, 0.7, 14, 0.3, 2.4, ['frozen berries', 'frozen blueberries']],
    ['f-peas', 'Frozen peas', 81, 5.4, 14, 0.4, 5.5, ['frozen peas']],
    ['f-pepper', 'Frozen sliced peppers', 31, 1, 6, 0.3, 2.1, ['frozen peppers']],
    ['f-courgette', 'Frozen courgette', 17, 1.2, 3.1, 0.3, 1, ['frozen courgette']],
    ['tinned-tom', 'Tinned chopped tomatoes', 32, 1.6, 7, 0.3, 1.9, ['chopped tomatoes', 'tinned tomatoes']],
    ['chickpeas', 'Tinned chickpeas, drained', 130, 7, 18, 2.6, 6, ['chickpeas']],
    ['lentils', 'Tinned lentils, drained', 116, 9, 16, 0.5, 4.5, ['lentils']],
    ['pouch-quinoa', 'Microwave quinoa', 120, 4.4, 21, 1.9, 2.8, ['microwave quinoa']],
    ['cooked-chicken', 'Ready-cooked chicken', 190, 25, 0, 10, 0, ['rotisserie', 'ready chicken', 'cooked chicken']],
    ['tin-salmon', 'Tinned salmon', 180, 20, 0, 11, 0, ['tinned salmon']],
    ['tin-tuna', 'Tinned tuna in water', 116, 26, 0, 1, 0, ['tinned tuna']],
    ['salad', 'Bagged salad', 17, 1.4, 1.8, 0.3, 1.5, ['bagged salad', 'salad leaves']],
  ];
  const INGREDIENTS = RAW.map(([id, name, kcal, p, c, f, fi, also]) => ({ id, name, kcal, p, c, f, fi, also }));
  const byId = new Map(INGREDIENTS.map((x) => [x.id, x]));

  function ofGrams(id, grams) {
    const ing = byId.get(id);
    const g = Number(grams);
    if (!ing || !(g > 0)) return null;
    const k = g / 100;
    return { id, grams: Math.round(g), name: ing.name, kcal: Math.round(ing.kcal * k), p: round1(ing.p * k), c: round1(ing.c * k), f: round1(ing.f * k), fi: round1((ing.fi || 0) * k) };
  }
  function sum(lines) {
    const t = { kcal: 0, p: 0, c: 0, f: 0, fi: 0 };
    for (const line of lines || []) {
      const bit = line.kcal != null && line.fi != null ? line : ofGrams(line.id, line.grams);
      if (!bit) continue;
      t.kcal += bit.kcal; t.p += bit.p; t.c += bit.c; t.f += bit.f; t.fi += bit.fi || 0;
    }
    return { kcal: Math.round(t.kcal), p: round1(t.p), c: round1(t.c), f: round1(t.f), fi: round1(t.fi) };
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
      fi: round1((Number(meal.fi) || 0) / n),
    };
  }
  function recipe(id, name, meal, serves, parts, minutes, steps) {
    const lines = parts.map(([fid, grams]) => ofGrams(fid, grams)).filter(Boolean);
    return { id, name, meal, style: 'dolce-recipe', serves, minutes, tag: 'No chopping', steps, lines, ...sum(lines) };
  }
  // Original low-prep plates for after the cut. Written here. Not taken from Mike Dolce's books.
  // Every one uses food that is already in pieces: tins, frozen veg, pouches, oats, eggs, ready chicken.
  const CREDIT = "Coach Mike's Dolce-style recipes, not from Mike Dolce's books";
  const DOLCE_RECIPES = [
    recipe('dr-porridge', 'Porridge, egg whites and frozen blueberries', 'breakfast', 1, [['oats', 60], ['milk', 200], ['eggwhite', 200], ['f-berries', 80]], 8, [
      'Stir the oats into the milk and microwave for 2 minutes, then stir and microwave until thick.',
      'Stir the egg whites through and microwave for another minute.',
      'Top with the frozen berries and leave them a minute to thaw.',
    ]),
    recipe('dr-hash', 'Microwave sweet potato, chicken and spinach', 'breakfast', 1, [['potato', 250], ['cooked-chicken', 100], ['f-spinach', 80], ['egg', 50]], 10, [
      'Pierce the sweet potato and microwave it until soft. Split it with a spoon.',
      'Warm the ready-cooked chicken. Wilt the bagged spinach in the same bowl.',
      'Fry the egg and put everything in one bowl.',
    ]),
    recipe('dr-cottage-oats', 'Cottage cheese, oats and frozen berries', 'breakfast', 1, [['oats', 40], ['milk', 120], ['cottage', 200], ['f-berries', 100], ['almonds', 10]], 6, [
      'Microwave the oats and milk until soft.',
      'Stir in the cottage cheese.',
      'Add the frozen berries and the whole almonds.',
    ]),
    recipe('dr-quinoa-apple', 'Quinoa pouch, yogurt and seeds', 'breakfast', 1, [['pouch-quinoa', 180], ['yogurt', 150], ['f-berries', 80], ['seeds', 10]], 3, [
      'Heat the quinoa pouch as the packet says, or eat it cold.',
      'Stir in the yogurt, frozen berries and seeds.',
    ]),
    recipe('dr-eggs-mush', 'Eggs, tinned tomatoes and spinach', 'breakfast', 1, [['egg', 100], ['tinned-tom', 150], ['f-spinach', 60], ['oats', 40], ['milk', 80]], 10, [
      'Microwave the oats and milk into a small porridge.',
      'Scramble the eggs in a non-stick pan.',
      'Warm the tinned tomatoes and bagged spinach in the same pan and eat with the porridge.',
    ]),
    recipe('dr-chicken-tray', 'Ready chicken, quinoa and frozen broccoli', 'lunch', 1, [['cooked-chicken', 150], ['pouch-quinoa', 200], ['f-broccoli', 200], ['oil', 5]], 8, [
      'Heat the quinoa pouch.',
      'Microwave the frozen broccoli until hot.',
      'Add the ready chicken and the oil. No tray to wash if you use one bowl.',
    ]),
    recipe('dr-tuna-potato', 'Tinned tuna and a microwave sweet potato', 'lunch', 1, [['tin-tuna', 150], ['potato', 250], ['f-pepper', 100], ['f-spinach', 40]], 10, [
      'Microwave the sweet potato until soft and split it with a spoon.',
      'Microwave the frozen peppers and spinach until hot.',
      'Tip in the tuna, brine drained.',
    ]),
    recipe('dr-turkey-courgette', 'Turkey mince and tinned tomatoes', 'lunch', 2, [['turkey', 300], ['tinned-tom', 400], ['f-courgette', 300], ['pouch-quinoa', 400]], 15, [
      'Brown the turkey mince in one pan. It is already minced.',
      'Add the tinned tomatoes and frozen courgette and simmer until hot.',
      'Heat two quinoa pouches and share the pan between them.',
    ]),
    recipe('dr-prawn-quinoa', 'Prawns, quinoa and bagged spinach', 'lunch', 1, [['prawn', 150], ['pouch-quinoa', 200], ['f-spinach', 80], ['f-pepper', 80], ['oil', 5]], 8, [
      'Heat the quinoa pouch.',
      'Warm the cooked prawns, frozen peppers and spinach in a pan with the oil.',
      'Tip onto the quinoa.',
    ]),
    recipe('dr-salmon-lunch', 'Tinned salmon, broccoli and sweet potato', 'lunch', 1, [['tin-salmon', 120], ['f-broccoli', 200], ['potato', 250]], 12, [
      'Microwave the sweet potato and the frozen broccoli.',
      'Drain the salmon and flake it with a fork.',
      'Eat the three together.',
    ]),
    recipe('dr-beef-carrot', 'Bagged salad, tuna and chickpeas', 'lunch', 1, [['salad', 80], ['tin-tuna', 120], ['chickpeas', 80], ['oil', 5]], 4, [
      'Tip the bagged salad into a bowl.',
      'Drain the tuna and the chickpeas and add them.',
      'Add the oil.',
    ]),
    recipe('dr-cod-peas', 'Frozen fish, peas and sweet potato', 'dinner', 1, [['cod', 180], ['f-peas', 120], ['potato', 250], ['f-spinach', 40]], 14, [
      'Microwave the sweet potato.',
      'Microwave or pan-cook the frozen fillet with the frozen peas until the fish flakes.',
      'Wilt the bagged spinach on top.',
    ]),
    recipe('dr-chicken-mush', 'Ready chicken and frozen broccoli', 'dinner', 2, [['cooked-chicken', 300], ['f-broccoli', 400], ['potato', 500], ['oil', 8]], 15, [
      'Microwave two sweet potatoes.',
      'Microwave the frozen broccoli.',
      'Share the ready chicken, broccoli and oil across the two potatoes.',
    ]),
    recipe('dr-turkey-bake', 'Turkey mince and lentils', 'dinner', 2, [['turkey', 300], ['lentils', 250], ['tinned-tom', 300], ['f-spinach', 120], ['pouch-quinoa', 400]], 16, [
      'Brown the turkey mince in one pan.',
      'Add the drained lentils, tinned tomatoes and spinach and heat through.',
      'Heat two quinoa pouches and share the pan.',
    ]),
    recipe('dr-haddock', 'Tinned sardines, spinach and broccoli', 'dinner', 1, [['sardine', 120], ['f-spinach', 80], ['f-broccoli', 180], ['potato', 200]], 12, [
      'Microwave the sweet potato and the frozen broccoli.',
      'Warm the bagged spinach.',
      'Drain the sardines and put them on top.',
    ]),
    recipe('dr-beef-peppers', 'Lentils, frozen peppers and tomatoes', 'dinner', 1, [['lentils', 200], ['f-pepper', 150], ['tinned-tom', 200], ['potato', 250], ['oil', 5]], 12, [
      'Microwave the sweet potato.',
      'Heat the drained lentils, frozen peppers and tinned tomatoes with the oil in one pan.',
      'Spoon it over the potato.',
    ]),
    recipe('dr-salmon-peas', 'Tinned salmon, peas and quinoa', 'dinner', 1, [['tin-salmon', 120], ['f-peas', 120], ['pouch-quinoa', 200], ['f-broccoli', 150]], 10, [
      'Heat the quinoa pouch with the frozen peas and broccoli.',
      'Drain the salmon and flake it with a fork.',
      'Stir the salmon through.',
    ]),
    recipe('dr-cottage-apple', 'Cottage cheese and frozen berries', 'snack', 1, [['cottage', 200], ['f-berries', 100], ['almonds', 12]], 2, [
      'Put the cottage cheese in a bowl.',
      'Add the frozen berries and the whole almonds.',
    ]),
    recipe('dr-yogurt-berries', 'Yogurt, frozen berries and seeds', 'snack', 1, [['yogurt', 200], ['f-berries', 100], ['seeds', 10]], 2, [
      'Spoon the yogurt into a bowl.',
      'Stir in the frozen berries and the seeds.',
    ]),
    recipe('dr-shake', 'Oat and egg-white shake', 'snack', 1, [['oats', 30], ['eggwhite', 150], ['milk', 200], ['f-berries', 80]], 4, [
      'Tip the oats, egg whites, milk and frozen berries into a blender.',
      'Blend and drink it.',
    ]),
  ];
  const recipeById = (id) => DOLCE_RECIPES.find((r) => r.id === id) || null;
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
    INGREDIENTS, GIRONDA, DOLCE, DOLCE_RECIPES, CREDIT, ofGrams, sum, parseLine, parseRecipeText, perServing, cleanRecipe, matchFood, recipeById,
  };
})();
