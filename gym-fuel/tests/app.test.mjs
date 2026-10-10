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
// A fake camera, so the scanner can be opened headless.
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
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

async function open({ iron, own, extra = {}, time = '2026-10-07T12:00:00+01:00' } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', permissions: ['camera'] });
  await ctx.addInitScript(([iron, own, extra]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    if (iron) localStorage.setItem('shtrainer.v1', JSON.stringify(iron));
    if (own) localStorage.setItem('gymfuel.v1', JSON.stringify(own));
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, JSON.stringify(v));
  }, [iron, own, extra]);
  await ctx.clock?.setFixedTime?.(new Date(time));
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
  assert(await page.locator('.list button').filter({ hasText: '30×8' }).isVisible(), 'record listed');
  await ctx.close();
});

await test('food log: add a recipe, a one-off meal and see the totals', async () => {
  const { page, ctx } = await open({ own: { v: 1, settings: { kcalGoal: 2000 } } });
  assert(!(await page.getByText('Quick add:').count()), 'no quick add for someone who has logged nothing');
  await page.getByRole('button', { name: '+ Add food' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Gironda Meal 1/ }).click();
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
  assert(await page.getByRole('heading', { name: /Gironda bar/ }).isVisible(), 'logging a Gironda meal brings up the Gironda bar');
  assert(!(await page.getByRole('button', { name: 'Gironda Meal 1', exact: true }).count()), 'and it is not repeated as a quick add');
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

// Open Food Facts search answers, as the live service sends them (brands as a list).
const HITS = { hits: [
  { code: '0894700010137', product_name: 'Nonfat Greek Yogurt', brands: ['Chobani'], nutriments: { 'energy-kcal_100g': 52.9, proteins_100g: 9.41, carbohydrates_100g: 3.53, fat_100g: 0 } },
  { code: '1111111111116', product_name: 'No calories listed', brands: ['X'], nutriments: {} },
] };

await test('food search: finds Open Food Facts products by name, logs by grams, remembers them offline', async () => {
  const { page, ctx } = await open({ own: { v: 1, settings: {} } });
  let calls = 0;
  await page.route('https://search.openfoodfacts.org/**', (r) => { calls += 1; r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(HITS) }); });
  await page.getByRole('button', { name: '+ Add food' }).click();
  await page.getByLabel('Search').pressSequentially('greek yogurt', { delay: 40 });
  await page.getByRole('button', { name: /Nonfat Greek Yogurt · Chobani/ }).click();
  assert(calls === 1, `one request for one burst of typing, got ${calls}`);
  assert(!(await page.getByText('No calories listed').count()), 'products without calories are left out');
  await page.locator('#x-sg').fill('200');
  await page.getByRole('button', { name: 'Add to log' }).click();
  const s = await state(page);
  const m = s.meals[0];
  assert(m.name === 'Nonfat Greek Yogurt · Chobani (200 g)' && m.kcal === 106 && m.p === 18.8, `meal ${JSON.stringify(m)}`);
  assert(s.scanned.some((x) => x.code === '0894700010137'), 'remembered');
  // Offline next time: the saved product is in the picker without any request.
  await ctx.setOffline(true);
  await page.getByRole('button', { name: '+ Add food' }).click();
  await page.getByLabel('Search').fill('nonfat');
  assert(await page.getByRole('button', { name: /Nonfat Greek Yogurt · Chobani Saved product/ }).isVisible(), 'saved product listed offline');
  assert(await page.getByText('Offline: showing your own foods').isVisible(), 'offline note');
  assert(calls === 1, 'no request while offline');
  await ctx.close();
});

await test('food search: a busy Open Food Facts shows a plain message', async () => {
  const { page, ctx } = await open({ own: { v: 1, settings: {} } });
  await page.route('https://search.openfoodfacts.org/**', (r) => r.fulfill({ status: 429, headers: { 'access-control-allow-origin': '*' }, body: '' }));
  await page.getByRole('button', { name: '+ Add food' }).click();
  await page.getByLabel('Search').fill('oats');
  await page.getByText('Open Food Facts is busy. Wait a minute and search again.').waitFor();
  await ctx.close();
});

await test('scanner: loads the barcode polyfill where the browser has none, then looks the code up', async () => {
  const { page, ctx, errors } = await open({ own: { v: 1, settings: {} } });
  let polyfill = 0;
  await page.route('https://cdn.jsdelivr.net/npm/barcode-detector@*/**', (r) => { polyfill += 1; r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: "window.BarcodeDetector = class { static async getSupportedFormats() { return ['ean_13']; } async detect() { return [{ rawValue: '0894700010137' }]; } };" }); });
  await page.route('https://world.openfoodfacts.org/api/v2/product/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ status: 1, product: HITS.hits[0] }) }));
  const native = await page.evaluate(() => 'BarcodeDetector' in window);
  await page.getByRole('button', { name: 'Scan a barcode' }).first().click();
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await page.getByText('Nonfat Greek Yogurt · Chobani').waitFor();
  assert(native || polyfill === 1, `polyfill loaded once (native ${native}, loads ${polyfill})`);
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const noImages = (page) => page.route('https://raw.githubusercontent.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));

await test('exercise library: add from it, then open its how-to from the workout', async () => {
  const { page, ctx, errors } = await open({ own: { v: 1, settings: { cycleStart: '2026-10-05' } } });
  await noImages(page);
  await page.locator('nav').getByRole('button', { name: 'Train' }).click();
  await page.getByRole('button', { name: 'Edit exercises' }).click();
  await page.getByRole('button', { name: '+ Add exercise' }).click();
  await page.getByLabel('Search').fill('incline dumbbell pr');
  const row = page.locator('#lib-list .row').filter({ has: page.getByRole('button', { name: /^Incline Dumbbell Press chest/ }) });
  await row.getByRole('button', { name: 'Add' }).click();
  let s = await state(page);
  const added = s.programs.my4week.days[0].exercises.at(-1);
  assert(added.name === 'Incline Dumbbell Press' && added.libId === 'Incline_Dumbbell_Press', `added ${JSON.stringify(added)}`);
  await page.getByRole('button', { name: 'Done editing' }).click();
  await page.locator('.excard').filter({ hasText: 'Incline Dumbbell Press' }).getByRole('button', { name: 'How to do it' }).click();
  const sheet = page.getByRole('dialog', { name: 'Incline Dumbbell Press' });
  assert((await sheet.locator('.steps li').count()) >= 3, 'steps shown');
  assert(await sheet.getByText('Works:').isVisible(), 'muscles shown');
  assert((await sheet.locator('img').count()) === 2, 'start and end pictures');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('exercise library: an unmatched exercise can be linked without renaming it', async () => {
  const { page, ctx } = await open({ own: { v: 1, settings: { cycleStart: '2026-10-05' } } });
  await noImages(page);
  await page.locator('nav').getByRole('button', { name: 'Train' }).click();
  const card = page.locator('.excard').filter({ hasText: 'Reverse Grip Bench Press' });
  await card.getByRole('button', { name: 'Find it in the library' }).click();
  assert((await page.getByLabel('Search').inputValue()) === 'Reverse Grip Bench Press', 'search prefilled with its name');
  await page.getByLabel('Search').fill('barbell bench press medium');
  await page.locator('#lib-list .row').filter({ has: page.getByRole('button', { name: /^Barbell Bench Press - Medium Grip chest/ }) }).getByRole('button', { name: 'Link' }).click();
  const s = await state(page);
  const ex = s.programs.my4week.days[0].exercises[0];
  assert(ex.name === 'Reverse Grip Bench Press' && ex.libId === 'Barbell_Bench_Press_-_Medium_Grip', `linked ${JSON.stringify(ex)}`);
  await page.locator('.excard').filter({ hasText: 'Reverse Grip Bench Press' }).getByRole('button', { name: 'How to do it' }).click();
  assert(await page.getByRole('dialog', { name: 'Barbell Bench Press - Medium Grip' }).isVisible(), 'how-to opens the linked exercise');
  await ctx.close();
});

await test('progress chart: best estimated 1-rep max per session, tap a dot for the set', async () => {
  const w = (id, date, kg, reps) => ({ id, date, at: `${date}T17:00:00.000Z`, programId: 'my4week', programName: 'My 4-Week Program', dayId: 'my4week-d1', dayName: 'Day 2', entries: [{ name: 'Barbell Squat', sets: [{ kg: kg - 10, reps: 10 }, { kg, reps }] }] });
  const workouts = [w('a', '2026-09-23', 100, 8), w('b', '2026-09-30', 105, 8), w('c', '2026-10-07', 110, 6)];
  const { page, ctx, errors } = await open({ own: { v: 1, settings: {}, workouts } });
  await page.locator('nav').getByRole('button', { name: 'Train' }).click();
  await page.locator('.subtabs').getByRole('button', { name: 'History' }).click();
  const chart = page.locator('svg.liftchart');
  assert((await chart.locator('.pt').count()) === 3, 'three sessions plotted');
  assert(await chart.locator('path.series').count() === 1, 'one line');
  // Best set per session by weight × (1 + reps/30): 100×8 = 126.7 first; last session's 100×10 = 133.3 beats its 110×6 = 132.
  assert(await page.getByText('+6.7 kg since Wed 23 Sep · 3 sessions').isVisible(), 'change since first session');
  assert((await chart.locator('.label').textContent()) === 'Best 133.3 kg', 'best labelled');
  await chart.locator('.pt').nth(1).click();
  assert(await page.locator('#chart-read').getByText('105×8').isVisible(), 'tapped dot shows its set');
  await page.getByText('Show as a table').click();
  assert(await page.getByText('Wed 7 Oct · 100×10').isVisible(), 'table view');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('my workouts: create a blank programme, name it, add and reorder, copy a built-in, delete', async () => {
  const { page, ctx, errors } = await open({ own: { v: 1, settings: { setupDone: true } } });
  await noImages(page);
  await page.locator('nav').getByRole('button', { name: 'Train' }).click();
  await page.getByRole('button', { name: 'My workouts' }).click();
  await page.getByRole('button', { name: '+ Create a workout programme' }).click();
  const f = page.locator('#prog-new-form');
  await f.getByLabel('Name').fill('Push Pull Legs');
  await f.getByLabel('Days in the programme (for a blank one)').selectOption('3');
  await f.getByLabel('Rest between sessions').selectOption('1-2');
  await f.getByRole('button', { name: 'Create' }).click();
  let s = await state(page);
  let mine = Object.values(s.programs).filter((p) => p.family === 'custom');
  assert(mine.length === 1 && mine[0].name === 'Push Pull Legs' && mine[0].days.length === 3 && JSON.stringify(mine[0].restDays) === '[1,2]', `created ${JSON.stringify(mine)}`);
  assert(s.settings.family === 'custom' && s.settings.active.custom === mine[0].id, 'active');
  // In edit mode straight away: name the day, add from the library, move it later.
  await page.getByLabel('Day name').fill('Push');
  await page.getByLabel('Day name').press('Tab');
  await page.getByRole('button', { name: '+ Add exercise' }).click();
  await page.getByLabel('Search').fill('dumbbell bench press');
  await page.locator('#lib-list .row').filter({ has: page.getByRole('button', { name: /^Dumbbell Bench Press chest/ }) }).getByRole('button', { name: 'Add' }).click();
  await page.getByRole('button', { name: 'Later →' }).click();
  s = await state(page);
  mine = Object.values(s.programs).filter((p) => p.family === 'custom');
  assert(mine[0].days[1].name === 'Push' && mine[0].days[1].exercises[0].name === 'Dumbbell Bench Press', `edited ${JSON.stringify(mine[0].days.map((d) => d.name))}`);
  await page.getByLabel('Programme name').fill('PPL');
  await page.getByLabel('Programme name').press('Tab');
  // A copy of a built-in programme.
  await page.getByRole('button', { name: '4-Week Cycle' }).click();
  await page.getByRole('button', { name: 'Edit exercises' }).click();
  await page.getByRole('button', { name: 'Copy this programme to My workouts' }).click();
  await page.locator('#prog-new-form').getByRole('button', { name: 'Create' }).click();
  s = await state(page);
  mine = Object.values(s.programs).filter((p) => p.family === 'custom');
  const copy = mine.find((p) => p.name === 'My 4-Week Program (my copy)');
  assert(mine.some((p) => p.name === 'PPL') && copy && copy.days.length === s.programs.my4week.days.length, 'renamed and copied');
  assert(copy.days[0].exercises[0].id !== s.programs.my4week.days[0].exercises[0].id, 'copy has its own ids');
  // Delete the copy.
  await page.getByRole('button', { name: 'Edit exercises' }).click();
  await page.getByRole('button', { name: 'Delete this programme' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  s = await state(page);
  assert(Object.values(s.programs).filter((p) => p.family === 'custom').length === 1, 'deleted');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

// 21 days before today: weight 90 → 89 kg in a straight line, 2,000 kcal eaten every day.
async function seedTrend(page, settings) {
  await page.evaluate((settings) => {
    Object.assign(S.settings, settings);
    for (let i = 21; i >= 1; i -= 1) {
      const d = addDays(today(), -i);
      S.weights.push({ date: d, kg: Math.round((90 - (21 - i) * 0.05) * 100) / 100 });
      S.meals.push({ id: `m${i}`, date: d, at: atOn(d, '12:00'), name: 'Food', kcal: 2000, p: 150, c: 200, f: 67, servings: 1, ref: null, slot: 'Lunch' });
    }
    save();
  }, settings);
  await page.reload();
}

await test('adaptive target: real maintenance from the trend, a capped weekly step, apply keeps protein', async () => {
  const { page, ctx, errors } = await open({ own: { v: 1, settings: { setupDone: true } } });
  await seedTrend(page, { kcalGoal: 2400, proteinGoal: 180, carbGoal: 200, fatGoal: 70, target: 80, sex: 'male' });
  // Maintenance = 2,000 + 0.05 kg/day × 7,700 = 2,385; to lose 0.5 kg a week: 2,385 − 550 = 1,835.
  const a = await page.evaluate(() => adaptive());
  assert(a.ready && Math.abs(a.tdee - 2385) < 1 && Math.abs(a.slopeWeek + 0.35) < 0.001 && Math.abs(a.intake - 2000) < 0.01, `maths ${JSON.stringify(a)}`);
  assert(a.goal === 'lose' && Math.abs(a.ideal - 1835) <= 5 && a.suggest === 2100 && a.capped, `suggestion ${JSON.stringify(a)}`);
  const card = page.locator('#adapt-card');
  assert(await card.getByText(`eat about ${a.ideal} kcal`).isVisible(), 'ideal target shown');
  assert(await card.getByText('Suggested target: 2100 kcal').isVisible(), 'capped at 300 a week');
  await card.getByRole('button', { name: 'Use 2100 kcal' }).click();
  const s = await state(page);
  // Rest after protein = 2,100 − 720 = 1,380, split as now (carbs 800 kcal : fat 630 kcal).
  assert(s.settings.kcalGoal === 2100 && s.settings.proteinGoal === 180 && s.settings.carbGoal === 193 && s.settings.fatGoal === 68, `macros ${JSON.stringify(s.settings)}`);
  assert(s.targetLog.length === 1 && s.targetLog[0].from === 2400, 'change logged');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('adaptive target: Not this week hides it from Today; too little data shows what is missing', async () => {
  const { page, ctx } = await open({ own: { v: 1, settings: { setupDone: true } } });
  await page.evaluate(() => { S.weights.push({ date: addDays(today(), -3), kg: 90 }); save(); });
  await page.locator('nav').getByRole('button', { name: 'Body' }).click();
  assert(await page.getByText('1/8').isVisible() && await page.getByText('0/12').isVisible(), 'progress towards enough data');
  await seedTrend(page, { kcalGoal: 2400, target: 80 });
  await page.locator('nav').getByRole('button', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Not this week' }).click();
  assert(!(await page.locator('#adapt-card').count()), 'hidden on Today');
  await page.locator('nav').getByRole('button', { name: 'Body' }).click();
  assert(await page.locator('#adapt-card').isVisible(), 'still in Body');
  await ctx.close();
});

await test('fast days: a marked day counts as 0 kcal in the adaptive target', async () => {
  const { page, ctx, errors } = await open({ own: { v: 1, settings: { setupDone: true } } });
  await page.locator('nav').getByRole('button', { name: 'Fuel' }).click();
  await page.getByRole('button', { name: 'Mark as a fast day' }).click();
  let s = await state(page);
  assert(Object.keys(s.fastDays).length === 1, 'today marked');
  assert(await page.getByRole('button', { name: '✓ Fast day' }).isVisible(), 'shows as marked');
  // 21 days: 90 → 89 kg; every third day a fast day with nothing logged, the rest 2,000 kcal.
  await page.evaluate(() => {
    S.fastDays = {};
    for (let i = 21; i >= 1; i -= 1) {
      const d = addDays(today(), -i);
      S.weights.push({ date: d, kg: Math.round((90 - (21 - i) * 0.05) * 100) / 100 });
      if (i % 3 === 0) S.fastDays[d] = true;
      else S.meals.push({ id: `m${i}`, date: d, at: atOn(d, '12:00'), name: 'Food', kcal: 2000, p: 150, c: 200, f: 67, servings: 1, ref: null, slot: 'Lunch' });
    }
    save();
  });
  const a = await page.evaluate(() => adaptive());
  // 14 days × 2,000 + 7 fast days × 0 over 21 days = 1,333.3 eaten; + 0.05 kg/day × 7,700 = 1,718.3 burned.
  assert(a.ready && a.foodDays === 21 && a.fasts === 7 && Math.abs(a.intake - 1333.33) < 0.1 && Math.abs(a.tdee - 1718.33) < 1, `fast days counted ${JSON.stringify(a)}`);
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('photo logging without a key: attach the photo and enter the food yourself; deleting the meal deletes the photo', async () => {
  const { page, ctx, errors } = await open({ own: { v: 1, settings: { setupDone: true } } });
  await page.locator('nav').getByRole('button', { name: 'Fuel' }).click();
  await page.locator('#meal-photo-in').setInputFiles({ name: 'plate.png', mimeType: 'image/png', buffer: PIXEL });
  const sheet = page.getByRole('dialog', { name: 'Log from a photo' });
  await sheet.getByText('add a Gemini (free) or Anthropic API key in Body → Settings').waitFor();
  await sheet.getByRole('button', { name: 'Enter it myself' }).click();
  const f = page.locator('#oneoff-form');
  await f.getByLabel('Name').fill('Chicken and rice');
  await f.getByLabel('Protein (g)').fill('40');
  await f.getByRole('button', { name: 'Save' }).click();
  let s = await state(page);
  assert(s.meals.length === 1 && s.meals[0].photoId, 'meal keeps its photo');
  assert((await page.evaluate(() => Photos.all())).length === 1, 'photo stored');
  await page.getByRole('button', { name: /^Chicken and rice/ }).click();
  await page.locator('#meal-photo:not([hidden])').waitFor();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Delete Chicken and rice' }).click();
  await page.waitForTimeout(200);
  assert((await page.evaluate(() => Photos.all())).length === 0, 'photo deleted with the meal');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

// A stand-in for the Anthropic SDK module: records the request and answers like the API would.
const SDK_STUB = `
class APIError extends Error { constructor(status, m) { super(m); this.status = status; } }
export class AuthenticationError extends APIError {}
export class PermissionDeniedError extends APIError {}
export class RateLimitError extends APIError {}
export class BadRequestError extends APIError {}
export class APIConnectionError extends Error {}
export { APIError };
const answer = (p) => {
  window.__sent = p;
  if (p.__auth) throw new AuthenticationError(401, 'bad key');
  return { model: p.model, stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify({ kind: 'meal', notes: 'Assumed 1 tbsp olive oil.', items: [
    { name: 'Grilled steak', grams: 200, kcal: 500, protein_g: 54, carbs_g: 0, fat_g: 31, confidence: 'medium' },
    { name: 'Olive oil', grams: 14, kcal: 124, protein_g: 0, carbs_g: 0, fat_g: 14, confidence: 'low' },
    { name: 'Chips', grams: 150, kcal: 300, protein_g: 4, carbs_g: 45, fat_g: 12, confidence: 'medium' } ] }) }] };
};
export default class Anthropic {
  constructor(o) { window.__init = o; const auth = o.apiKey === 'sk-ant-bad'; this.messages = { create: async (p) => answer({ ...p, __auth: auth }) }; this.beta = { messages: { create: async (p) => answer({ ...p, __auth: auth, __beta: true }) } }; }
}`;

await test('photo logging with Claude: sends the photo, lists foods to check, grams rescale, adds them with the photo', async () => {
  const { page, ctx, errors } = await open({ own: { v: 1, settings: { setupDone: true } } });
  await page.route('https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@*/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: SDK_STUB }));
  await page.locator('nav').getByRole('button', { name: 'Body' }).click();
  await page.locator('.subtabs').getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Your Anthropic API key').fill('sk-ant-test');
  await page.getByLabel('Your Anthropic API key').press('Tab');
  const backup = await state(page);
  assert(!JSON.stringify(backup).includes('sk-ant-test'), 'key is not in the app data or backups');
  await page.locator('nav').getByRole('button', { name: 'Today' }).click();
  await page.locator('#meal-photo-in').setInputFiles({ name: 'plate.png', mimeType: 'image/png', buffer: PIXEL });
  const sheet = page.getByRole('dialog', { name: 'Log from a photo' });
  await sheet.getByLabel("Anything the photo doesn't show? (optional)").fill('ribeye, fried in olive oil');
  await sheet.getByRole('button', { name: 'Work it out with Claude' }).click();
  await sheet.getByText('Assumed 1 tbsp olive oil.').waitFor();
  const sent = await page.evaluate(() => ({ p: window.__sent, init: window.__init }));
  assert(sent.init.apiKey === 'sk-ant-test' && sent.init.dangerouslyAllowBrowser === true, 'client set up with the key');
  assert(sent.p.model === 'claude-opus-5-5' && sent.p.__beta && sent.p.fallbacks === 'default' && sent.p.betas[0] === 'server-side-fallback-2026-07-01', `model and fallback ${JSON.stringify({ ...sent.p, messages: 0, system: 0 })}`);
  assert(sent.p.output_config.format.type === 'json_schema' && sent.p.output_config.effort === 'medium', 'structured output');
  const content = sent.p.messages[0].content;
  assert(content[0].type === 'image' && content[0].source.media_type === 'image/jpeg' && content[0].source.data.length > 20, 'photo sent as JPEG');
  assert(content[1].text.includes('ribeye, fried in olive oil'), 'note sent');
  // Edit: halve the steak, drop the chips.
  await sheet.getByLabel('Grilled steak grams').fill('100');
  assert((await sheet.getByLabel('Grilled steak calories').inputValue()) === '250' && (await sheet.getByLabel('Grilled steak protein').inputValue()) === '27', 'grams rescale');
  await sheet.getByRole('button', { name: 'Remove Chips' }).click();
  await sheet.getByRole('button', { name: 'Add 2 items to the log' }).click();
  const s = await state(page);
  assert(s.meals.length === 2 && s.meals[0].name === 'Grilled steak (100 g)' && s.meals[0].kcal === 250 && s.meals[0].p === 27, `meals ${JSON.stringify(s.meals)}`);
  assert(s.meals.every((m) => m.photoId && m.photoId === s.meals[0].photoId), 'both carry the photo');
  // Cheaper model, no fallback parameter on Haiku; a rejected key gives a plain message.
  await page.evaluate(() => { FoodAI.setModel('claude-haiku-5-5'); FoodAI.setKey('sk-ant-bad'); });
  await page.locator('#meal-photo-in').first().setInputFiles({ name: 'plate.png', mimeType: 'image/png', buffer: PIXEL });
  await page.getByRole('button', { name: 'Work it out with Claude' }).click();
  await page.getByText("Anthropic didn't accept the API key. Check it in Body → Settings.").waitFor();
  const p2 = await page.evaluate(() => window.__sent);
  assert(p2.model === 'claude-haiku-5-5' && !p2.__beta && !('fallbacks' in p2), 'haiku without fallbacks');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(200);
  assert((await page.evaluate(() => Photos.all())).length === 1, 'the unused photo was dropped; the logged one kept');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('photo logging with Gemini: uses the key Deliberation Council saved, sends the photo, reads the answer', async () => {
  const { page, ctx, errors } = await open({ own: { v: 1, settings: { setupDone: true } } });
  await page.evaluate(() => localStorage.setItem('gemini_api_key', 'AIza-test-key'));
  await page.reload();
  let req = null, calls = 0, busy = false;
  await page.route('https://generativelanguage.googleapis.com/**', async (r) => {
    calls += 1;
    req = { url: r.request().url(), headers: r.request().headers(), body: JSON.parse(r.request().postData()) };
    if (busy) { await r.fulfill({ status: 429, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { message: 'Resource exhausted' } }) }); return; }
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [
      { thought: true, text: 'Looking at the plate…' },
      { text: JSON.stringify({ kind: 'label', notes: 'Per 100 g: 60 kcal.', items: [{ name: 'Greek yogurt', grams: 150, kcal: 90, protein_g: 15, carbs_g: 6, fat_g: 0, confidence: 'high' }] }) },
    ] } }] }) });
  });
  await page.locator('nav').getByRole('button', { name: 'Body' }).click();
  await page.locator('.subtabs').getByRole('button', { name: 'Settings' }).click();
  assert(await page.getByRole('button', { name: 'Gemini (free)' }).getAttribute('aria-pressed') === 'true', 'Gemini chosen because its key is on the phone');
  assert(await page.getByText('A Gemini key is saved on this phone').isVisible(), 'shared key recognised');
  await page.locator('nav').getByRole('button', { name: 'Fuel' }).click();
  await page.locator('#meal-photo-in').setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: PIXEL });
  await page.getByRole('button', { name: 'Work it out with Gemini' }).click();
  await page.getByText('Per 100 g: 60 kcal.').waitFor();
  assert(req.url.endsWith('/models/gemini-3.8-flash:generateContent') && req.headers['x-goog-api-key'] === 'AIza-test-key', `request ${req.url}`);
  const parts = req.body.contents[0].parts;
  assert(parts[0].inlineData.mimeType === 'image/jpeg' && parts[0].inlineData.data.length > 20 && parts[1].text === 'Log what is in this photo.', 'photo and prompt');
  assert(req.body.generationConfig.responseMimeType === 'application/json' && req.body.generationConfig.responseJsonSchema.required.includes('items') && req.body.systemInstruction.parts[0].text.includes('nutrition label'), 'structured JSON request');
  assert((await page.getByLabel('Greek yogurt grams').inputValue()) === '150', 'thought parts skipped, answer read');
  await page.getByRole('button', { name: 'Add 1 item to the log' }).click();
  const s = await state(page);
  assert(s.meals[0].name === 'Greek yogurt (150 g)' && s.meals[0].p === 15 && s.meals[0].photoId, 'logged');
  assert(!JSON.stringify(s).includes('AIza-test-key'), 'key not in app data');
  // Free limit reached: a plain message.
  busy = true;
  await page.locator('#meal-photo-in').setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: PIXEL });
  await page.getByRole('button', { name: 'Work it out with Gemini' }).click();
  await page.getByText("Gemini's free limit is used up for now.").waitFor();
  assert(calls === 2, 'two requests');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('share my week: draws a 1080 × 1350 card from the week and saves it', async () => {
  const workouts = [
    { id: 'w0', date: '2026-01-05', at: '2026-01-05T17:00:00.000Z', programId: 'my4week', programName: 'P', dayId: 'my4week-d1', dayName: 'Legs', entries: [{ name: 'Barbell Squat', sets: [{ kg: 100, reps: 8 }] }] },
  ];
  const { page, ctx, errors } = await open({ own: { v: 1, settings: { setupDone: true, installDismissed: true, startWeight: 96.8 }, workouts } });
  await page.evaluate(() => {
    const ws = weekStart(today());
    S.workouts.push({ id: 'w1', date: ws, at: `${ws}T17:00:00.000Z`, programId: 'my4week', programName: 'P', dayId: 'my4week-d1', dayName: 'Legs', entries: [{ name: 'Barbell Squat', sets: [{ kg: 110, reps: 8 }] }] });
    S.weights.push({ date: addDays(ws, -1), kg: 95.4 }, { date: today(), kg: 94.6 });
    S.settings.lastBackup = today();
    save();
  });
  await page.reload();
  const wd = await page.evaluate(() => weekData());
  assert(wd.weight.now === '94.6 kg' && wd.weight.week === '−0.8 kg this week' && wd.weight.total === '−2.2 kg since start', `weight ${JSON.stringify(wd.weight)}`);
  assert(wd.stats[0][0] === '1' && wd.lifts[0].name === 'Barbell Squat' && wd.lifts[0].change.startsWith('▲ +'), `lifts ${JSON.stringify(wd.lifts)}`);
  await page.getByRole('button', { name: 'Share my week' }).click();
  const img = page.locator('#share-img');
  await img.waitFor();
  await page.waitForFunction(() => document.getElementById('share-img')?.naturalWidth > 0);
  const size = await img.evaluate((i) => [i.naturalWidth, i.naturalHeight]);
  assert(size[0] === 1080 && size[1] === 1350, `card size ${size}`);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image' }).click();
  assert((await dl).suggestedFilename().startsWith('gym-fuel-week-'), 'image saved');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('cut with me: a 30-day challenge with weekly targets on Today', async () => {
  const { page, ctx } = await open({ own: { v: 1, settings: { setupDone: true, installDismissed: true } } });
  await page.getByRole('button', { name: 'Start a 30-day "Cut with me" challenge' }).click();
  assert(await page.locator('.card').getByText('day 1 of 30').isVisible(), 'day 1');
  assert(await page.getByText('0/3').isVisible(), 'sessions target');
  assert((await page.evaluate(() => weekData().subtitle)) === 'Cut with me · day 1 of 30', 'on the card');
  await page.evaluate(() => { S.challenge.start = addDays(today(), -30); save(); });
  await page.reload();
  assert(await page.getByText('Cut with me: done').isVisible(), 'finished after 30 days');
  await page.getByRole('button', { name: 'Close the challenge' }).click();
  assert(!(await page.getByText('Cut with me: done').count()), 'closed');
  await ctx.close();
});

await test('backups: a reminder once there is a log to lose, cleared by backing up', async () => {
  const { page, ctx } = await open({ own: { v: 1, settings: { setupDone: true, installDismissed: true } } });
  assert(!(await page.getByText('Back up your log').count()), 'nothing to back up yet');
  await page.evaluate(() => { for (let i = 1; i <= 5; i += 1) S.weights.push({ date: addDays(today(), -i), kg: 90 }); save(); });
  await page.reload();
  assert(await page.getByText('it has never been backed up').isVisible(), 'reminder');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up now' }).click();
  const file = await dl;
  assert(file.suggestedFilename().startsWith('gym-fuel-') && file.suggestedFilename().endsWith('.json'), 'backup file');
  await page.waitForTimeout(200);
  assert(!(await page.getByText('Back up your log').count()), 'reminder cleared');
  assert((await state(page)).settings.lastBackup, 'date recorded');
  await ctx.close();
});

await test('install help, plain background and neutral programme for new users', async () => {
  const { page, ctx } = await open({ own: { v: 1, settings: { setupDone: true } } });
  assert(await page.getByRole('heading', { name: 'Install Gym & Fuel' }).isVisible(), 'install card');
  assert(await page.getByText('Install app').first().isVisible(), 'Android steps');
  await page.getByRole('button', { name: 'Done, or not now' }).click();
  assert(!(await page.getByRole('heading', { name: 'Install Gym & Fuel' }).count()), 'dismissed');
  await page.locator('nav').getByRole('button', { name: 'Body' }).click();
  await page.locator('.subtabs').getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Background').selectOption('plain');
  assert((await page.evaluate(() => document.documentElement.dataset.bg)) === 'plain', 'plain background');
  await ctx.close();
  const fresh = await open();
  await fresh.page.getByRole('dialog').getByRole('button', { name: 'Set up my targets' }).click();
  assert((await fresh.page.locator('#setup-form').getByLabel('Training programme').inputValue()) === 'tenlbs', 'new users default to the general programme');
  await fresh.ctx.close();
});

await test('free photo logging: no key needed, uses the Gym & Fuel service, shows photos left and its limits', async () => {
  const { page, ctx, errors } = await open({ own: { v: 1, settings: { setupDone: true, installDismissed: true } } });
  await page.evaluate(() => localStorage.setItem('gymfuel.freeAiUrl', 'https://free-ai.test'));
  await page.reload();
  let sent = null, capped = false;
  await page.route('https://free-ai.test/**', async (r) => {
    sent = { url: r.request().url(), body: JSON.parse(r.request().postData()) };
    const cors = { 'access-control-allow-origin': '*' };
    if (capped) { await r.fulfill({ status: 429, contentType: 'application/json', headers: cors, body: JSON.stringify({ ok: false, error: "That's today's 10 free photos used." }) }); return; }
    await r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ ok: true, left: 9, model: 'gemini-3.8-flash', result: { kind: 'meal', notes: '', items: [{ name: 'Porridge', grams: 250, kcal: 260, protein_g: 9, carbs_g: 45, fat_g: 5, confidence: 'medium' }] } }) });
  });
  await page.locator('nav').getByRole('button', { name: 'Body' }).click();
  await page.locator('.subtabs').getByRole('button', { name: 'Settings' }).click();
  assert(await page.getByRole('button', { name: 'Free', exact: true }).getAttribute('aria-pressed') === 'true', 'Free chosen with no key');
  assert(await page.getByText('Google may use what\'s sent').isVisible(), 'free-tier note');
  await page.locator('nav').getByRole('button', { name: 'Fuel' }).click();
  await page.locator('#meal-photo-in').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: PIXEL });
  await page.getByLabel("Anything the photo doesn't show? (optional)").fill('with honey');
  await page.getByRole('button', { name: 'Work it out with AI' }).click();
  await page.getByText('9 free photos left today.').waitFor();
  assert(sent.url === 'https://free-ai.test/analyse' && sent.body.mimeType === 'image/jpeg' && sent.body.image.length > 20 && sent.body.note === 'with honey', `request ${JSON.stringify({ ...sent.body, image: 0 })}`);
  assert(Object.keys(sent.body).sort().join() === 'image,mimeType,note', 'only the photo and note are sent');
  assert((await page.getByLabel('Porridge grams').inputValue()) === '250', 'result shown');
  capped = true;
  await page.getByRole('button', { name: 'Close' }).click();
  await page.locator('#meal-photo-in').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: PIXEL });
  await page.getByRole('button', { name: 'Work it out with AI' }).click();
  await page.getByText("That's today's 10 free photos used.").waitFor();
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('Gironda bar: one tap logs each meal, a second tap takes it off; hidden for a friend, switchable', async () => {
  const { page, ctx, errors } = await open({ iron: IRON });
  await page.getByRole('button', { name: 'Bring my Iron & Eggs data' }).click();
  await page.locator('nav').getByRole('button', { name: 'Fuel' }).click();
  const bar = page.locator('section', { has: page.getByRole('heading', { name: /Gironda bar/ }) });
  assert(await bar.getByText('1/2 today').isVisible(), 'Meal 1 from Iron & Eggs already counts');
  assert(await bar.getByRole('button', { name: /Eggs \+ patties/ }).getAttribute('aria-pressed') === 'true', 'shown as logged');
  await bar.getByRole('button', { name: /Steak \+ eggs/ }).click();
  let s = await state(page);
  const today = s.meals.filter((m) => m.date === '2026-10-07' && m.ref?.startsWith('gironda'));
  assert(today.length === 2 && today.some((m) => m.kcal === 952 && m.p === 93), `logged both: ${JSON.stringify(today)}`);
  assert(await bar.getByText('2/2 today').isVisible(), 'count');
  await bar.getByRole('button', { name: /Steak \+ eggs/ }).click();
  s = await state(page);
  assert(s.meals.filter((m) => m.date === '2026-10-07' && m.ref === 'gironda2').length === 0, 'second tap takes it off');
  await page.locator('nav').getByRole('button', { name: 'Body' }).click();
  await page.locator('.subtabs').getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Gironda bar in Fuel').uncheck();
  await page.locator('nav').getByRole('button', { name: 'Fuel' }).click();
  assert(!(await page.getByRole('heading', { name: /Gironda bar/ }).count()), 'switched off');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
  const friend = await open();
  await friend.page.getByRole('button', { name: 'Close' }).click();
  await friend.page.locator('nav').getByRole('button', { name: 'Fuel' }).click();
  assert(!(await friend.page.getByRole('heading', { name: /Gironda bar/ }).count()), 'not shown to a friend without Iron & Eggs');
  await friend.ctx.close();
});

const SUMMARY = { v: 1, at: '2026-10-08T20:00:00.000Z', date: '2026-10-08', chains: [
  { id: 'coffee', name: 'No coffee', day: 8, best: 8, today: 'pending', unit: 'day' },
  { id: 'cc-1', name: 'No sugar', day: 20, best: 20, today: 'pending', unit: 'day' },
  { id: 'diet', name: 'Diet', day: 4, best: 4, today: 'pending', unit: 'day' },
  { id: 'sessions', name: 'Sessions', day: 1, best: 1, today: 'pending', unit: 'wk' },
] };
await test('My chains on Today: Iron & Eggs and Trainer chains; built-in ones restarted on 10 Oct, own ones kept', async () => {
  const trainer = { customChains: [{ id: 'cc-w', name: 'No weed', since: '2026-08-01' }, { id: 'cc-e', name: 'No energy drinks', since: '2026-09-01' }, { id: 'cc-1', name: 'No sugar', since: '2026-01-01' }], days: { '2026-09-20': { chains: { 'cc-e': false } } } };
  const { page, ctx, errors } = await open({ iron: IRON, extra: { 'shtrainer.chains': SUMMARY, 'trainer.v1': trainer }, time: '2026-10-11T12:00:00+01:00' });
  const card = page.locator('section', { has: page.getByRole('heading', { name: /My chains/ }) });
  const day = async (name) => card.locator('.chainrow', { hasText: name }).locator('.daybadge').getAttribute('aria-label');
  assert(await day('No coffee') === 'Day 2', `coffee restarted: ${await day('No coffee')}`);
  assert(await card.locator('.chainrow', { hasText: 'No coffee' }).getByText('best 8').isVisible(), 'coffee best kept');
  assert(await day('No sugar') === 'Day 23', `own chain keeps counting: ${await day('No sugar')}`);
  assert(await day('No weed') === 'Day 72', `Trainer chain: ${await day('No weed')}`);
  assert(await day('No energy drinks') === 'Day 21', `Trainer chain after a slip: ${await day('No energy drinks')}`);
  const names = await card.locator('.chainrow b').allTextContents();
  assert(JSON.stringify(names) === JSON.stringify(['No coffee', 'No weed', 'No energy drinks', 'No sugar', 'Diet', 'Sessions']), `order, no duplicates: ${names}`);
  assert(await day('Diet') === 'Day 2', 'diet restarted');
  assert(await day('Sessions') === '0 weeks', 'weekly chain restarted');
  assert(await card.getByText('last updated these').isVisible(), 'stale note');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
  const fresh = await open({ iron: IRON, extra: { 'shtrainer.chains': { ...SUMMARY, date: '2026-10-11', chains: [{ ...SUMMARY.chains[0], day: 2 }] } }, time: '2026-10-11T12:00:00+01:00' });
  // and before the reset, an own chain keeps counting by the days since the summary
  const early = await open({ iron: IRON, extra: { 'shtrainer.chains': { ...SUMMARY, date: '2026-10-06' } }, time: '2026-10-08T12:00:00+01:00' });
  const sugar = await early.page.locator('.chainrow', { hasText: 'No sugar' }).locator('.daybadge').getAttribute('aria-label');
  assert(sugar === 'Day 22', `clean chain moves on: ${sugar}`);
  await early.ctx.close();
  const c2 = fresh.page.locator('section', { has: fresh.page.getByRole('heading', { name: /My chains/ }) });
  assert(await c2.locator('.daybadge').getAttribute('aria-label') === 'Day 2', 'a fresh summary is shown as is');
  assert(!(await c2.getByText('last updated these').count()), 'no stale note');
  await fresh.ctx.close();
});

await browser.close();
server.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
