// Shredded System tests: the acceptance tests in app-spec/product-spec.md section 8, plus the features in section 9.
// Needs Playwright:  npm i playwright   Run from the repo root:  node shredded-system/tests/app.test.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APP = path.join(ROOT, 'shredded-system/app');
let BUILD = 1;
const TYPES = { js: 'text/javascript', html: 'text/html', json: 'application/json', png: 'image/png' };
const server = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (err, body) => {
    if (err) { res.writeHead(404); res.end(); return; }
    if (f === path.join(APP, 'app.js')) body = Buffer.concat([body, Buffer.from(`\n;window.__BUILD = ${BUILD};\n`)]);
    res.writeHead(200, { 'content-type': TYPES[f.split('.').pop()] || 'text/plain', 'cache-control': 'no-cache' });
    res.end(body);
  });
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/shredded-system/app/`;
const browser = await chromium.launch();
const results = [];
async function test(name, fn) {
  try { await fn(); results.push(true); console.log(`  ✓ ${name}`); }
  catch (e) { results.push(false); console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const iso = (d) => d.toISOString().slice(0, 10);

async function open({ time = '2026-10-08T10:00:00+01:00', state, trainer, ctxOpts = {}, off } = {}) {
  const ctx = await browser.newContext({ timezoneId: 'Europe/London', serviceWorkers: 'block', acceptDownloads: true, ...ctxOpts });
  await ctx.addInitScript(() => {
    window.__writes = [];
    const P = Storage.prototype;
    for (const m of ['setItem', 'removeItem', 'clear']) { const o = P[m]; P[m] = function (...a) { window.__writes.push([m, a[0] ?? null]); return o.apply(this, a); }; }
  });
  // Open Food Facts is faked: `off` maps barcodes to product JSON (or a status code).
  await ctx.route(/openfoodfacts\.org/, (route) => {
    const code = route.request().url().match(/product\/(\d+)/)?.[1];
    const hit = off?.[code];
    if (typeof hit === 'number') return route.fulfill({ status: hit, body: '' });
    if (!hit) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ status: 0 }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 1, product: hit }) });
  });
  await ctx.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date(time) });
  await page.goto(URL_);
  await page.evaluate(({ state, trainer }) => {
    localStorage.clear();
    if (state) localStorage.setItem('shredded.v1', JSON.stringify(state));
    if (trainer !== undefined) localStorage.setItem('trainer.v1', typeof trainer === 'string' ? trainer : JSON.stringify(trainer));
  }, { state, trainer });
  await page.reload();
  return { ctx, page, errors };
}
const base = (over = {}) => ({ v: 1, profile: { sex: 'male', age: 40, height: 180, startWeight: 95, startDate: '2026-10-05', goalLow: 70, goalHigh: 75, activity: 1.375 }, targets: { kcal: null, protein: 160, fat: 75, carbs: 50, fibre: 28 }, carbupHours: 96, trainDays: [1, 4], days: {}, workouts: [], plan: { cut: 4, modern: 2, carbup: 1, strict: 0 }, notice: null, ...over });

console.log('Shredded System tests');

// ---- Spec section 8 -------------------------------------------------------
await test('8.1 Fresh install: welcome note, baseline week before the start date, strict template', async () => {
  const { ctx, page, errors } = await open({ time: '2026-10-04T09:00:00+01:00' });
  assert(await page.locator('text=Start here').count(), 'welcome');
  assert(await page.locator('text=Baseline week').count(), 'baseline panel');
  eq(await page.evaluate(() => typeOf(today())), 'strict', 'template');
  eq(errors, [], 'errors');
  await ctx.close();
});

await test('8.2 Ticking every Cut meal shows 1,678 kcal and 187 g protein', async () => {
  const { ctx, page } = await open({ state: base({ days: { '2026-10-08': { type: 'cut' } } }) });
  for (const n of [1, 2, 3]) await page.click(`.meal[data-v="${n}"]`);
  const m = await page.evaluate(() => eaten(today()));
  eq([Math.round(m.kcal), Math.round(m.p)], [1678, 187], 'totals');
  assert(await page.locator('.mrow').first().textContent().then((t) => t.includes('1,678')), 'shown on screen');
  await ctx.close();
});

await test('8.3 Twenty days losing 0.12 kg a day: "On track" and measured maintenance', async () => {
  const days = {};
  const start = new Date('2026-09-18T12:00:00Z');
  for (let i = 0; i < 20; i++) { const d = new Date(start); d.setUTCDate(d.getUTCDate() + i); days[iso(d)] = { type: 'cut', meals: { 1: true, 2: true, 3: true }, weight: +(95 - i * 0.12).toFixed(2), energy: 4 }; }
  const { ctx, page } = await open({ state: base({ days, profile: { ...base().profile, startDate: '2026-09-18' } }) });
  const r = await page.evaluate(() => ({ dec: decide().id, src: maintenance().src }));
  eq(r.dec, 'on_track', 'decision');
  assert(r.src.startsWith('measured'), `maintenance ${r.src}`);
  await ctx.close();
});

await test('8.4 A red-flag symptom shows the advice panel; unticking removes it', async () => {
  const { ctx, page } = await open({ state: base() });
  await page.click('[data-act="symptom"][data-v="abdo"]');
  assert(await page.locator('text=Get medical advice').count(), 'panel shown');
  await page.click('[data-act="symptom"][data-v="abdo"]');
  eq(await page.locator('text=Get medical advice').count(), 0, 'panel gone');
  await ctx.close();
});

await test('8.5 A 1,200 kcal target (male) shows the floor warning', async () => {
  const { ctx, page } = await open({ state: base({ targets: { kcal: 1200, protein: 160, fat: 75, carbs: 50, fibre: 28 } }) });
  await page.click('[data-act="setup"]');
  assert(await page.locator('text=under the 1500 kcal floor').count(), 'warning');
  await ctx.close();
});

await test('8.6 A Full Body A session appears in history and makes the day a training day', async () => {
  const { ctx, page } = await open({ state: base() });
  await page.click('nav [data-tab="train"]');
  await page.fill('#s-0-0-kg', '120'); await page.fill('#s-0-0-reps', '10');
  await page.click('#session button[type=submit]');
  eq(await page.evaluate(() => [S.workouts.length, S.days[today()].type]), [1, 'modern'], 'saved');
  assert(await page.locator('text=Strength score').count(), 'in history');
  await ctx.close();
});

await test('8.7 Daily-log CSV has exactly the template columns', async () => {
  const { ctx, page } = await open({ state: base({ days: { '2026-10-07': { weight: 94.2, meals: { 1: true } } } }) });
  const head = fs.readFileSync(path.join(ROOT, 'shredded-system/templates/daily-log.csv'), 'utf8').split('\n')[0];
  eq((await page.evaluate(() => exportDaily())).split('\n')[0], head, 'header');
  await ctx.close();
});

await test('8.8 Restore rejects anything that is not a backup', async () => {
  const { ctx, page } = await open({ state: base() });
  await page.click('[data-act="setup"]');
  for (const bad of ['not json', '{"v":2,"days":{}}', '{"v":1}', '[]']) {
    await page.fill('#restore', bad);
    await page.click('[data-act="restore"]');
    assert(!(await page.locator('[data-act="ask-ok"]').count()), `accepted ${bad}`);
  }
  await ctx.close();
});

await test('8.9 Works offline after the first load, picks up a deploy, and the single file opens from disk', async () => {
  const ctx = await browser.newContext({ timezoneId: 'Europe/London' });
  await ctx.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
  const page = await ctx.newPage();
  BUILD = 1;
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  assert(await page.evaluate(() => !!navigator.serviceWorker.controller), 'controlled');
  BUILD = 2;
  await page.reload();
  eq(await page.evaluate(() => window.__BUILD), 2, 'new deploy served');
  await ctx.setOffline(true);
  await page.reload();
  eq(await page.evaluate(() => [window.__BUILD, !!document.querySelector('.brand')]), [2, true], 'offline restart');
  await ctx.close();
  const c2 = await browser.newContext();
  const p2 = await c2.newPage();
  const errs = []; p2.on('pageerror', (e) => errs.push(e.message));
  await p2.goto(`file://${path.join(APP, 'shredded-system-single.html')}`);
  assert(await p2.locator('.meal').count() > 0, 'single file renders');
  eq(errs, [], 'single file errors');
  await c2.close();
});

// ---- Section 9 features ---------------------------------------------------
await test('Trainer: weights, steps and sleep fill in live; your entry wins; Trainer is never written', async () => {
  const trainer = { weights: [{ date: '2026-10-06', kg: 94.4 }, { date: '2026-10-07', kg: 94.1 }, { date: '2026-10-08', kg: 'heavy' }], sleep: [{ date: '2026-10-08', hours: 7.2 }], days: { '2026-10-08': { steps: 11800 } }, garmin: { '2026-10-07': { steps: 15200 } } };
  const { ctx, page, errors } = await open({ state: base({ days: { '2026-10-07': { weight: 93.9 } } }), trainer });
  const before = await page.evaluate(() => localStorage.getItem('trainer.v1'));
  const r = await page.evaluate(() => ({ w: weights().map((x) => [x.date, x.kg]), steps: [stepsOf('2026-10-07'), stepsOf('2026-10-08')], sleep: sleepOf('2026-10-08') }));
  eq(r.w, [['2026-10-06', 94.4], ['2026-10-07', 93.9]], 'weights: Trainer fills in, yours wins, bad value dropped');
  eq(r.steps, [15200, 11800], 'steps incl. Garmin');
  eq(r.sleep, 7.2, 'sleep');
  assert(await page.locator('#in-steps[placeholder="Trainer: 11,800"]').count(), 'shown as Trainer value');
  await page.fill('#in-weight', '93.5'); await page.press('#in-weight', 'Tab');
  await page.click('.meal[data-v="1"]');
  const writes = await page.evaluate(() => window.__writes);
  for (const [m, k] of writes) assert(m !== 'clear' && k === 'shredded.v1', `unexpected ${m}(${k})`);
  eq(await page.evaluate(() => localStorage.getItem('trainer.v1')), before, 'Trainer unchanged');
  eq(errors, [], 'errors');
  await ctx.close();
  for (const bad of ['{nope', '[]']) {
    const b = await open({ state: base(), trainer: bad });
    eq(await b.page.evaluate(() => trainer().ok), false, `${bad} ignored`);
    eq(b.errors, [], `${bad} errors`);
    await b.ctx.close();
  }
});

await test('Barcode: lookup adds a packaged food by grams and saves it for offline reuse', async () => {
  const off = { '5000112637922': { product_name: 'Greek Style Yogurt', brands: 'Brand', serving_quantity: 150, nutriments: { 'energy-kcal_100g': 97, proteins_100g: 9, fat_100g: 5, carbohydrates_100g: 4, fiber_100g: 0, 'saturated-fat_100g': 3.2 } }, '4006381333931': { product_name: 'Mystery', nutriments: {} }, '1234567890128': 500 };
  const { ctx, page, errors } = await open({ state: base(), off });
  await page.click('[data-act="extra"]');
  await page.fill('#x-code', '5000112637922'); await page.click('#scan-form button[type=submit]');
  await page.waitForSelector('#scan-add');
  eq(await page.inputValue('#x-sg'), '150', 'serving prefilled');
  await page.click('#scan-add button[type=submit]');
  const x = await page.evaluate(() => S.days[today()].extra[0]);
  eq([x.name, Math.round(x.kcal), Math.round(x.p * 10) / 10], ['150 g Greek Style Yogurt', 146, 13.5], 'added');
  eq(await page.evaluate(() => S.myFoods.map((f) => f.code)), ['5000112637922'], 'saved');
  // Offline: saved product still works, unknown ones explain themselves.
  await ctx.setOffline(true);
  await page.click('[data-act="extra"]');
  await page.click('[data-act="my-food"]');
  await page.waitForSelector('#scan-add');
  assert(await page.locator('text=works offline').count(), 'offline reuse');
  await ctx.setOffline(false);
  for (const [code, msg] of [['4006381333931', 'no calorie information'], ['1234567890128', 'error 500'], ['5555555555555', 'Not in Open Food Facts'], ['12ab', 'doesn\'t look like a barcode']]) {
    await page.fill('#x-code', code); await page.click('#scan-form button[type=submit]');
    await page.waitForSelector(`text=${msg}`, { timeout: 3000 });
  }
  eq(await page.evaluate(() => Scan.canScan()), false, 'no camera scanner in headless Chromium, so typing is offered');
  eq(errors, [], 'errors');
  await ctx.close();
});

await test('Photos: saved in IndexedDB, first and latest compared, deletable, reset clears them', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFElEQVR4nGP8z8DAwMDAxMDAwAAAGwABBmvXaQAAAABJRU5ErkJggg==', 'base64');
  const { ctx, page, errors } = await open({ state: base() });
  assert(await page.locator('text=Photo day').count(), 'nudge on Today');
  await page.click('[data-act="go-photos"]');
  await page.setInputFiles('.photo-in[data-pose="front"]', { name: 'a.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('#photo-grid img');
  await page.clock.setSystemTime(new Date('2026-11-07T10:00:00Z')); // 30 days later
  await page.evaluate(() => render());
  await page.setInputFiles('.photo-in[data-pose="front"]', { name: 'b.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.querySelectorAll('#photo-grid img').length === 2);
  assert(await page.locator('text=30 days apart').count(), 'compared');
  eq(await page.evaluate(() => S.lastPhoto), '2026-11-07', 'last photo date');
  await page.click('[data-act="photo-del"] >> nth=1'); await page.click('[data-act="ask-ok"]');
  await page.waitForFunction(() => document.querySelectorAll('#photo-grid img').length === 1);
  await page.click('[data-act="setup"]'); await page.click('[data-act="reset"]'); await page.click('[data-act="ask-ok"]');
  await page.waitForFunction(async () => (await Photos.all()).length === 0);
  eq(errors, [], 'errors');
  await ctx.close();
});

await test('Reminders: calendar file has a daily weigh-in, carb-ups every 96 h and weekly training', async () => {
  const { ctx, page } = await open({ state: base({ days: { '2026-10-06': { type: 'carbup' } } }) });
  await page.click('[data-act="setup"]');
  await page.fill('#rm-weighTime', '06:45'); await page.press('#rm-weighTime', 'Tab');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="ics"]')]);
  eq(dl.suggestedFilename(), 'shredded-system-reminders.ics', 'file name');
  const ics = fs.readFileSync(await dl.path(), 'utf8');
  assert(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.trim().endsWith('END:VCALENDAR'), 'calendar wrapper');
  assert(ics.includes('DTSTART;TZID=Europe/London:20261008T064500') && ics.includes('RRULE:FREQ=DAILY'), 'weigh-in at 06:45 daily');
  const carbs = [...ics.matchAll(/UID:carbup-(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
  eq(carbs.slice(0, 3), ['2026-10-10', '2026-10-14', '2026-10-18'], 'carb-ups 4 days apart from the next due date');
  assert(ics.includes('RRULE:FREQ=WEEKLY;BYDAY=MO,TH'), 'training days');
  assert(ics.split('\r\n').every((l) => l.length <= 75), 'lines folded');
  await ctx.close();
});

await test('Mobile: no sideways scrolling on any tab', async () => {
  const { ctx, page } = await open({ state: base(), ctxOpts: { viewport: { width: 360, height: 760 } } });
  for (const t of ['today', 'food', 'train', 'progress', 'guide']) {
    await page.click(`nav [data-tab="${t}"]`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${t} overflows`);
  }
  await page.click('[data-act="setup"]');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'setup overflows');
  await ctx.close();
});

await browser.close();
server.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
