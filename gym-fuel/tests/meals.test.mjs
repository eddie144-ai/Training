// Gironda plates, Dolce-style plates, and ingredient maths. No browser:
//   node --test gym-fuel/tests/meals.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({});
vm.runInContext(`${fs.readFileSync(path.join(root, 'meals.js'), 'utf8')}\nglobalThis.Meals = Meals;\n`, context);
const M = context.Meals;

test('Gironda plates are the cut, Dolce-style plates are the other list, and both have macros', () => {
  assert.ok(M.GIRONDA.length >= 10 && M.GIRONDA.length <= 15, `gironda ${M.GIRONDA.length}`);
  assert.ok(M.DOLCE.length >= 6, `dolce ${M.DOLCE.length}`);
  assert.equal(M.GIRONDA.every((m) => m.style === 'gironda' && m.kcal > 0 && m.p > 0), true);
  assert.equal(M.DOLCE.every((m) => m.style === 'dolce' && /Dolce-style/.test(m.name)), true);
  const hormone = M.GIRONDA.find((m) => m.id === 'g-hormone');
  const sixEggs = M.ofGrams('egg', 300);
  const beef = M.ofGrams('beef', 250);
  assert.equal(hormone.kcal, sixEggs.kcal + beef.kcal);
  assert.ok(hormone.c < 15, 'the hormone plate stays low carb');
  const src = fs.readFileSync(path.join(root, 'meals.js'), 'utf8');
  assert.equal(/pitbull|copyright|peterson/i.test(src), false);
});

test('ingredient lines become macros, and one serving is the whole recipe divided', () => {
  const parsed = M.parseRecipeText('200 g chicken\n150 g quinoa\n6 eggs\na pinch of mystery spice');
  assert.equal(parsed.lines.length, 3);
  assert.equal(JSON.stringify(parsed.missed), JSON.stringify(['a pinch of mystery spice']));
  const chicken = M.ofGrams('chicken', 200);
  const quinoa = M.ofGrams('quinoa', 150);
  const eggs = M.ofGrams('egg', 300);
  assert.equal(parsed.kcal, chicken.kcal + quinoa.kcal + eggs.kcal);
  const recipe = M.cleanRecipe({ id: 'rc-1', name: 'Batch', serves: 2, kcal: parsed.kcal, p: parsed.p, c: parsed.c, f: parsed.f, lines: parsed.lines });
  const one = M.perServing(recipe);
  assert.equal(one.kcal, Math.round(parsed.kcal / 2));
  assert.equal(M.cleanRecipe({ name: '' }), null);
  assert.equal(M.parseLine('3 egg whites').grams, 99);
});
