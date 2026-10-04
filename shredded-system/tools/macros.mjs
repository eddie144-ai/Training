// Prints the macros of every meal template from data/foods.csv and data/meal-templates.csv.
// Used to fill the tables in docs/ and checked by tools/build.mjs.
import fs from 'node:fs';
const dir = new URL('../data/', import.meta.url);
export function csv(name) {
  const [head, ...rows] = fs.readFileSync(new URL(name, dir), 'utf8').trim().split('\n');
  const keys = head.split(',');
  return rows.map((r) => { const v = r.split(','); return Object.fromEntries(keys.map((k, i) => [k, v[i] ?? ''])); });
}
export function templates() {
  const foods = Object.fromEntries(csv('foods.csv').map((f) => [f.id, f]));
  const out = {};
  for (const r of csv('meal-templates.csv')) {
    const t = (out[r.template_id] ||= { id: r.template_id, name: r.template_name, day_type: r.day_type, meals: {} });
    const m = (t.meals[r.meal] ||= { n: Number(r.meal), name: r.meal_name, items: [] });
    const f = foods[r.food_id];
    if (!f) throw new Error(`Unknown food ${r.food_id}`);
    m.items.push({ food: r.food_id, g: Number(r.grams) });
  }
  const mac = (items) => { const s = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0, fibre_g: 0, satfat_g: 0 }; for (const it of items) for (const k of Object.keys(s)) s[k] += Number(foods[it.food][k]) * it.g / 100; return s; };
  for (const t of Object.values(out)) { t.meals = Object.values(t.meals); for (const m of t.meals) m.macros = mac(m.items); t.macros = mac(t.meals.flatMap((m) => m.items)); }
  return { foods, templates: out };
}
if (process.argv[1] && process.argv[1].endsWith('macros.mjs')) {
  const { templates: ts } = templates();
  const r = (x) => Math.round(x);
  for (const t of Object.values(ts)) {
    console.log(`\n${t.name}: ${r(t.macros.kcal)} kcal, P ${r(t.macros.protein_g)}, F ${r(t.macros.fat_g)} (sat ${r(t.macros.satfat_g)}), C ${r(t.macros.carbs_g)}, fibre ${r(t.macros.fibre_g)}`);
    for (const m of t.meals) console.log(`  ${m.name}: ${r(m.macros.kcal)} kcal, P ${r(m.macros.protein_g)}, F ${r(m.macros.fat_g)}, C ${r(m.macros.carbs_g)}, fibre ${r(m.macros.fibre_g)}`);
  }
}
