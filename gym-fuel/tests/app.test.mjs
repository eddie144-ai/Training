// Gym & Fuel tests. Runs the real app in Chromium against a local server.
// Needs Playwright:  npm i playwright   Run from the repo root:  node gym-fuel/tests/app.test.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { js: 'text/javascript', html: 'text/html', json: 'application/json', png: 'image/png', jpg: 'image/jpeg' };
const server = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (err, body) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[f.split('.').pop()] || 'text/plain', 'cache-control': 'no-cache' });
    res.end(body);
  });
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/gym-fuel/`;
const browser = await chromium.launch();
const results = [];
async function test(name, fn) {
  try { await fn(); results.push(true); console.log(`  ✓ ${name}`); }
  catch (e) { results.push(false); console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

const IRON = {
  v: 3, settings: { kcalGoal: 1800, proteinGoal: 170, carbGoal: 80, fatGoal: 90, target: 75, startWeight: 96.8, family: 'cycle', cycleStart: '2026-10-05', active: { cycle: 'my4week', hit: 'mentzer_ab' } },
  weights: [{ date: '2026-10-06', kg: 95.2 }, { date: '2026-10-07', kg: 94.9 }],
  meals: [{ id: 'm1', date: '2026-10-07', at: '2026-10-07T09:30:00.000Z', name: 'Gironda Meal 1', kcal: 933, p: 77, c: 4, f: 66, servings: 1, ref: 'gironda1' }],
  workouts: [{ id: 'w1', date: '2026-10-06', at: '2026-10-06T17:00:00.000Z', programId: 'my4week', programName: 'My 4-Week Program', family: 'cycle', dayId: 'my4week-d0', dayName: 'Day 1 · Chest & Triceps', entries: [{ name: 'Reverse Grip Bench Press', sets: [{ kg: 27.5, reps: 8 }] }] }],
  measurements: [{ date: '2026-10-05', waist: 104, neck: 42 }],
  baselines: {}, programs: {}, myFoods: [], journal: { secret: 'not copied' },
};

async function open({ iron, own } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.addInitScript(([iron, own]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    if (iron) localStorage.setItem('shtrainer.v1', JSON.stringify(iron));
    if (own) localStorage.setItem('gymfuel.v1', JSON.stringify(own));
  }, [iron, own]);
  await ctx.clock?.setFixedTime?.(new Date('2026-10-07T12:00:00+01:00'));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL_);
  return { page, ctx, errors };
}
const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('gymfuel.v1')));

await test('first open shows the welcome and every tab renders without errors', async () => {
  const { page, ctx, errors } = await open();
  assert(await page.getByRole('dialog', { name: 'Welcome to Gym & Fuel' }).isVisible(), 'welcome sheet');
  await page.getByRole('dialog').getByRole('button', { name: 'Set up my targets' }).click();
  await page.getByRole('button', { name: 'Close' }).click();
  assert(await page.getByText('Your calorie, protein and target weight are still the app\'s defaults').isVisible(), 'setup reminder on Today');
  for (const [tab, subs] of [['Today', []], ['Train', ['Workout', 'History']], ['Fuel', ['Log', 'Recipes']], ['Body', ['Weight', 'Measurements', 'Settings']]]) {
    await page.locator('nav').getByRole('button', { name: tab }).click();
    for (const s of subs) await page.locator('.subtabs').getByRole('button', { name: s }).click();
  }
  assert(!errors.length, errors.join('; '));
  const bg = await page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage);
  assert(bg.includes('bg.jpg'), `background photo: ${bg}`);
  assert((await page.locator('nav button').count()) === 4, 'four tabs');
  await ctx.close();
});

await test('brings Iron & Eggs data over without changing it', async () => {
  const { page, ctx } = await open({ iron: IRON });
  await page.getByRole('button', { name: 'Bring my Iron & Eggs data' }).click();
  const s = await state(page);
  assert(s.weights.length === 2 && s.workouts.length === 1 && s.meals.length === 1, 'copied records');
  assert(s.settings.kcalGoal === 1800, 'targets copied');
  assert(s.measurements.length === 1, 'measurements copied');
  assert(!s.journal, 'journal not copied');
  const iron = await page.evaluate(() => localStorage.getItem('shtrainer.v1'));
  assert(iron === JSON.stringify(IRON), 'Iron & Eggs untouched');
  await ctx.close();
});

await test('logs a workout with an extra set and shows the last weights next time', async () => {
  const { page, ctx } = await open({ own: { v: 1, settings: { cycleStart: '2026-10-05' } } });
  await page.locator('nav').getByRole('button', { name: 'Train' }).click();
  const first = page.locator('.excard').first();
  const name = (await first.locator('b').first().textContent()).trim();
  await first.getByLabel(`${name} set 1 kg`).fill('30');
  await first.getByLabel(`${name} set 1 reps`).fill('8');
  await first.getByRole('button', { name: '+ Add set' }).click();
  await page.locator('.excard').first().getByLabel(`${name} set 5 kg`).fill('25');
  await page.locator('.excard').first().getByLabel(`${name} set 5 reps`).fill('10');
  await page.reload(); // a half-logged session survives a reload
  assert((await page.locator('.excard').first().getByLabel(`${name} set 1 kg`).inputValue()) === '30', 'draft kept');
  await page.getByRole('button', { name: 'Complete session' }).click();
  const s = await state(page);
  assert(s.workouts.length === 1 && s.workouts[0].entries[0].sets.length === 2, 'two sets saved');
  await page.locator('.subtabs').getByRole('button', { name: 'History' }).click();
  assert(await page.getByText('30×8').first().isVisible(), 'record listed');
  await ctx.close();
});

await test('food log: add a recipe, a one-off meal and see the totals', async () => {
  const { page, ctx } = await open({ own: { v: 1, settings: { kcalGoal: 2000 } } });
  await page.getByRole('button', { name: 'Gironda Meal 1' }).first().click();
  await page.getByRole('button', { name: '×1', exact: true }).click();
  await page.locator('nav').getByRole('button', { name: 'Fuel' }).click();
  await page.getByRole('button', { name: '+ One-off meal' }).click();
  const f = page.locator('#oneoff-form');
  await f.getByLabel('Name').fill('Shake');
  await f.getByLabel('Protein (g)').fill('25');
  await f.getByRole('button', { name: 'Save' }).click();
  const s = await state(page);
  assert(s.meals.length === 2, 'two meals');
  assert(s.meals[1].kcal === 100, 'kcal from macros');
  assert((await page.locator('#kcal-pill').textContent()).startsWith('1033 / 2000'), 'header total');
  await ctx.close();
});

await test('weight log and targets', async () => {
  const { page, ctx } = await open({ own: { v: 1, settings: {} } });
  await page.getByLabel("Today's weight in kg").fill('94.4');
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await page.locator('nav').getByRole('button', { name: 'Body' }).click();
  await page.locator('.subtabs').getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Protein (g)').fill('180');
  await page.locator('#targets-form').getByRole('button', { name: 'Save' }).click();
  const s = await state(page);
  assert(s.weights[0].kg === 94.4 && s.settings.startWeight === 94.4, 'weight saved');
  assert(s.settings.proteinGoal === 180, 'target saved');
  await ctx.close();
});

await test('measurements: save, merge on the same day, body-fat estimate, delete', async () => {
  const { page, ctx } = await open({ own: { v: 1, settings: { heightCm: 180 }, measurements: [{ date: '2026-10-01', waist: 104 }] } });
  await page.locator('nav').getByRole('button', { name: 'Body' }).click();
  await page.locator('.subtabs').getByRole('button', { name: 'Measurements' }).click();
  const f = page.locator('#meas-form');
  await f.getByLabel('Waist').fill('100');
  await f.getByRole('button', { name: 'Save measurements' }).click();
  await page.locator('#meas-form').getByLabel('Neck').fill('41');
  await page.locator('#meas-form').getByRole('button', { name: 'Save measurements' }).click();
  let s = await state(page);
  const t = s.measurements.find((m) => m.date !== '2026-10-01');
  assert(s.measurements.length === 2 && t.waist === 100 && t.neck === 41, `merged same-day entry: ${JSON.stringify(s.measurements)}`);
  assert(await page.getByText('Waist · -4').isVisible(), 'change since first entry');
  assert(await page.getByText('Body fat (Navy est.)').isVisible(), 'body fat shown');
  await page.getByRole('button', { name: /Delete measurements for/ }).first().click();
  s = await state(page);
  assert(s.measurements.length === 1, 'deleted');
  await ctx.close();
});

await test('a new user is asked for their stats and gets their own targets', async () => {
  const { page, ctx } = await open();
  await page.getByRole('dialog').getByRole('button', { name: 'Set up my targets' }).click();
  const f = page.locator('#setup-form');
  await f.getByLabel('Age').fill('30');
  await f.getByLabel('Height (cm)').fill('180');
  await f.getByLabel('Weight now (kg)').fill('90');
  await f.getByLabel('Target weight (kg)').fill('80');
  // Mifflin-St Jeor: 10*90 + 6.25*180 - 5*30 + 5 = 1880; x1.55 = 2914; -500 = 2414 -> 2410 kcal; protein 2 x 80 = 160 g
  assert((await f.getByLabel('Calories (kcal)').inputValue()) === '2410', `kcal ${await f.getByLabel('Calories (kcal)').inputValue()}`);
  assert((await f.getByLabel('Protein (g)').inputValue()) === '160', 'protein');
  await f.getByLabel('Protein (g)').fill('175'); // typed by hand: kept when other fields change
  await f.getByLabel('Age').fill('31');
  assert((await f.getByLabel('Protein (g)').inputValue()) === '175', 'own value kept');
  await f.getByLabel('Training programme').selectOption({ label: '10 lbs of Muscle in 4 Weeks' });
  await f.getByRole('button', { name: 'Save my targets' }).click();
  const s = await state(page);
  assert(s.settings.setupDone && s.settings.target === 80 && s.settings.proteinGoal === 175 && s.settings.startWeight === 90, 'settings saved');
  assert(s.settings.active.cycle === 'tenlbs', 'programme chosen');
  assert(s.weights.length === 1 && s.weights[0].kg === 90, 'first weigh-in');
  assert(!(await page.getByText('still the app\'s defaults').count()), 'reminder gone');
  await ctx.close();
});

await test('progress photos: add, show and delete', async () => {
  const { page, ctx } = await open({ own: { v: 1, settings: {} } });
  await page.locator('nav').getByRole('button', { name: 'Body' }).click();
  await page.locator('.subtabs').getByRole('button', { name: 'Measurements' }).click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.getByLabel('Add a front photo').setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: png });
  await page.locator('#photo-grid img').first().waitFor();
  assert((await page.locator('#photo-grid img').count()) === 1, 'one photo shown');
  await page.getByRole('button', { name: /Delete front photo/ }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByText('No photos yet').waitFor();
  await ctx.close();
});

await browser.close();
server.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
