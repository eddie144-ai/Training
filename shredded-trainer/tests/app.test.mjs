// Shredded Trainer tests. Runs the real app in Chromium against a local server.
// Needs Playwright:  npm i playwright   Run from the repo root:  node shredded-trainer/tests/app.test.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let BUILD = 1;
const TYPES = { js: 'text/javascript', html: 'text/html', json: 'application/json', png: 'image/png' };
const server = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (err, body) => {
    if (err) { res.writeHead(404); res.end(); return; }
    if (f === path.join(ROOT, 'shredded-trainer/app.js')) body = Buffer.concat([body, Buffer.from(`\n;window.__BUILD = ${BUILD};\n`)]);
    res.writeHead(200, { 'content-type': TYPES[f.split('.').pop()] || 'text/plain', 'cache-control': 'no-cache' });
    res.end(body);
  });
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/shredded-trainer/`;
const browser = await chromium.launch();
const results = [];
async function test(name, fn) {
  try { await fn(); results.push(true); console.log(`  ✓ ${name}`); }
  catch (e) { results.push(false); console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

const TRAINER = {
  v: 3, settings: { family: 'hit', target: 77, startWeight: 96.8, chainStart: '2026-10-05', cycleStart: '2026-10-05', coffeeStart: '2026-10-01', cycleFixed: true, startFixed: true, mondayStart: true, protein170: true },
  weights: [{ date: '2026-10-06', kg: 95.2 }, { date: '2026-10-07', kg: 94.9 }],
  meals: [{ id: 'm1', date: '2026-10-07', at: '2026-10-07T09:30:00.000Z', name: 'Gironda Meal 1', kcal: 933, p: 77, c: 4, f: 66, servings: 1, ref: 'gironda1' }],
  workouts: [], journal: { '2026-10-06': { text: 'Day 2' } },
};
// Opens the app with a fixed clock. `own` is a Shredded Trainer state to seed (after a fresh start).
async function open({ time = '2026-10-08T10:00:00+01:00', trainer, own, off, ctxOpts = {} } = {}) {
  const ctx = await browser.newContext({ timezoneId: 'Europe/London', serviceWorkers: 'block', acceptDownloads: true, ...ctxOpts });
  await ctx.addInitScript(() => {
    window.__writes = [];
    const P = Storage.prototype;
    for (const m of ['setItem', 'removeItem', 'clear']) { const o = P[m]; P[m] = function (...a) { if (this === window.localStorage) window.__writes.push([m, a[0] ?? null]); return o.apply(this, a); }; }
  });
  await ctx.route(/openfoodfacts\.org/, (route) => {
    const code = route.request().url().match(/product\/(\d+)/)?.[1];
    const hit = off?.[code];
    if (!hit) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ status: 0 }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 1, product: hit }) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date(time) });
  await page.goto(URL_);
  await page.evaluate(({ trainer, own }) => {
    localStorage.clear();
    if (trainer) localStorage.setItem('trainer.v1', JSON.stringify(trainer));
    if (own) localStorage.setItem('shtrainer.v1', JSON.stringify(own));
  }, { trainer, own });
  await page.reload();
  await page.evaluate(() => { window.__writes = []; });
  return { ctx, page, errors };
}
// A fresh Shredded Trainer state, made by the app itself, with changes applied.
async function seeded(change) {
  const { ctx, page } = await open();
  await page.click('[data-act="sheet-close"]');
  const st = await page.evaluate(`(() => { const s = JSON.parse(localStorage.getItem('shtrainer.v1')); (${change.toString()})(s); return s; })()`);
  await ctx.close();
  return st;
}

console.log('Shredded Trainer tests');

await test('Fresh start: welcome offers to bring Trainer data; defaults are the cut set-up', async () => {
  const { ctx, page, errors } = await open({ trainer: TRAINER });
  assert(await page.locator('text=Bring over my Trainer data').count(), 'offer shown');
  eq(await page.evaluate(() => [S.settings.family, S.settings.active.cycle, S.settings.target, S.settings.goalLow, S.settings.carbupHours, S.settings.startWeight]), ['cycle', 'my4week', 75, 70, 96, 95], 'defaults');
  await page.click('[data-act="sheet-close"]');
  eq(await page.evaluate(() => [S.weights.length, JSON.parse(localStorage.getItem('shtrainer.v1')).notice]), [0, null], 'started fresh and saved');
  await page.reload();
  eq(await page.locator('text=Bring over my Trainer data').count(), 0, 'not shown again');
  eq(errors, [], 'errors');
  await ctx.close();
});

await test('Bring over: history copied, cut set-up kept, Trainer untouched, only shtrainer.* written', async () => {
  const { ctx, page, errors } = await open({ trainer: TRAINER });
  const before = await page.evaluate(() => localStorage.getItem('trainer.v1'));
  await page.click('[data-act="bring-trainer"]');
  const s = await page.evaluate(() => ({ w: S.weights.length, m: S.meals.length, j: Object.keys(S.journal).length, fam: S.settings.family, cyc: S.settings.active.cycle, target: S.settings.target, goalLow: S.settings.goalLow }));
  eq(s, { w: 2, m: 1, j: 1, fam: 'cycle', cyc: 'my4week', target: 75, goalLow: 70 }, 'copied');
  await page.click('[data-act="symptom"][data-v="nausea"]');
  eq(await page.evaluate(() => localStorage.getItem('trainer.v1')), before, 'Trainer unchanged');
  for (const [m, k] of await page.evaluate(() => window.__writes)) assert(m !== 'clear' && String(k).startsWith('shtrainer.'), `unexpected ${m}(${k})`);
  eq(errors, [], 'errors');
  await ctx.close();
});

await test('Train opens on My 4-Week Program: Phase 1 days in week 1, Phase 2 in week 3', async () => {
  const own = await seeded(() => {});
  const { ctx, page } = await open({ own });
  await page.click('nav [data-tab="train"]');
  const t = await page.evaluate(() => document.getElementById('view').innerText);
  assert(t.includes('My 4-Week Program') && t.includes('6–8'), 'week 1 shows the strength phase');
  await ctx.close();
  const b = await open({ own, time: '2026-10-20T10:00:00+01:00' });
  await b.page.click('nav [data-tab="train"]');
  assert((await b.page.evaluate(() => document.getElementById('view').innerText)).includes('10–12'), 'week 3 shows the hypertrophy phase');
  await b.ctx.close();
});

await test('Carb-up clock: due after 96 h, a carb-up day keeps the cut and diet chains, clock resets', async () => {
  const own = await seeded((s) => { s.days['2026-10-05'] = { refeed: true }; });
  const { ctx, page } = await open({ own, time: '2026-10-09T13:00:00+01:00' });
  eq(await page.evaluate(() => carbupClock().due), true, 'due on Fri (96 h after Mon midday)');
  assert(await page.locator('text=Carb-up due').count(), 'shown on Today');
  await page.click('[data-act="refeed"][data-date="2026-10-09"]');
  eq(await page.evaluate(() => [isRefeed('2026-10-09'), chainStatus('2026-10-05', 'cut')]), [true, 'done'], 'carb-up day logged; a carb-up day counts for the cut chain');
  assert(await page.locator('text=Carb-up day').count(), 'carb-up card');
  await page.clock.setSystemTime(new Date('2026-10-10T13:00:00+01:00'));
  eq(await page.evaluate(() => { const c = carbupClock(); return [c.due, c.last]; }), [false, '2026-10-09'], 'clock resets');
  await ctx.close();
});

await test('Red flags and check-in: advice at the top of Today; ratings and medication saved', async () => {
  const own = await seeded(() => {});
  const { ctx, page } = await open({ own });
  await page.click('[data-act="symptom"][data-v="vomit"]');
  assert(await page.locator('.card.alert >> text=Repeated vomiting').count(), 'advice shown');
  await page.click('[data-act="rate"][data-k="energy"][data-v="2"]');
  await page.fill('#cut-med', 'Example 1'); await page.press('#cut-med', 'Tab');
  eq(await page.evaluate(() => { const r = S.days[today()]; return [r.symptoms, r.energy, r.med]; }), [['vomit'], 2, 'Example 1'], 'saved');
  await page.click('[data-act="symptom"][data-v="vomit"]');
  eq(await page.locator('.card.alert').count(), 0, 'advice gone');
  await ctx.close();
});

await test('Weekly decision: 20 days losing 0.12 kg a day on the cut chain is "On track"; Apply changes calories', async () => {
  const own = await seeded((s) => {
    s.settings.chainStart = '2026-09-18';
    const at = (d) => `${d}T08:30:00.000Z`;
    for (let i = 0; i < 20; i++) {
      const d = new Date(Date.UTC(2026, 8, 18 + i)).toISOString().slice(0, 10);
      s.weights.push({ date: d, kg: +(95 - i * 0.12).toFixed(2) });
      s.meals.push({ id: `a${i}`, date: d, at: at(d), name: 'Gironda Meal 1', kcal: 933, p: 77, c: 4, f: 66, servings: 1, ref: 'gironda1' });
      s.meals.push({ id: `b${i}`, date: d, at: `${d}T12:30:00.000Z`, name: 'Gironda Meal 2', kcal: 952, p: 93, c: 2.5, f: 61, servings: 1, ref: 'gironda2' });
    }
  });
  const { ctx, page } = await open({ own });
  const x = await page.evaluate(() => cutDecision());
  eq([x.decision, x.ctx.records >= 12, Math.round(x.ctx.adh)], ['On track', true, 100], 'decision');
  await ctx.close();
  // Stalled with good adherence: small cut, applied once, never below the floor.
  const stall = await seeded((s) => {
    s.settings.chainStart = '2026-09-18'; s.settings.kcalGoal = 1550;
    for (let i = 0; i < 20; i++) { const d = new Date(Date.UTC(2026, 8, 18 + i)).toISOString().slice(0, 10); s.weights.push({ date: d, kg: 94 }); s.meals.push({ id: `a${i}`, date: d, at: `${d}T08:30:00.000Z`, name: 'G1', kcal: 933, p: 77, c: 4, f: 66, servings: 1, ref: 'gironda1' }, { id: `b${i}`, date: d, at: `${d}T12:30:00.000Z`, name: 'G2', kcal: 952, p: 93, c: 2.5, f: 61, servings: 1, ref: 'gironda2' }); }
  });
  const b = await open({ own: stall });
  await b.page.click('nav [data-tab="body"]'); await b.page.click('.subtabs [data-v="weight"]');
  assert(await b.page.locator('text=Small cut').count(), 'small cut');
  await b.page.click('[data-act="apply-kcal"]');
  eq(await b.page.evaluate(() => S.settings.kcalGoal), 1500, 'floored at 1,500');
  await b.ctx.close();
});

await test('Barcode: lookup adds a packaged food to the log by grams, remembered for offline use', async () => {
  const own = await seeded(() => {});
  const off = { '5000112637922': { product_name: 'Greek Style Yogurt', serving_quantity: 150, nutriments: { 'energy-kcal_100g': 97, proteins_100g: 9, fat_100g: 5, carbohydrates_100g: 4 } } };
  const { ctx, page, errors } = await open({ own, off });
  await page.click('nav [data-tab="fuel"]');
  await page.click('[data-act="scan-food"]');
  await page.fill('#x-code', '5000112637922'); await page.click('#scan-form button[type=submit]');
  await page.waitForSelector('#scan-add');
  await page.click('#scan-add button[type=submit]');
  const m = await page.evaluate(() => { const x = mealsOn(today())[0]; return [x.name, Math.round(mealTotals(x).kcal), Math.round(mealTotals(x).p * 10) / 10]; });
  eq(m, ['150 g Greek Style Yogurt', 146, 13.5], 'logged');
  eq(await page.evaluate(() => chainStatus(today(), 'cut')), 'miss', 'non-Gironda food breaks the cut-day chain, as in Trainer');
  await ctx.setOffline(true);
  await page.click('[data-act="scan-food"]'); await page.click('[data-act="scan-recent"]');
  await page.waitForSelector('text=works offline');
  eq(errors, [], 'errors');
  await ctx.close();
});

await test('Photos: saved in their own IndexedDB, compared first vs latest, deletable', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFElEQVR4nGP8z8DAwMDAxMDAwAAAGwABBmvXaQAAAABJRU5ErkJggg==', 'base64');
  const own = await seeded(() => {});
  const { ctx, page, errors } = await open({ own });
  await page.click('nav [data-tab="body"]'); await page.click('.subtabs [data-v="measure"]');
  await page.setInputFiles('.photo-in[data-pose="side"]', { name: 'a.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('#photo-grid img');
  await page.clock.setSystemTime(new Date('2026-11-05T10:00:00Z'));
  await page.setInputFiles('.photo-in[data-pose="side"]', { name: 'b.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.querySelectorAll('#photo-grid img').length === 2);
  assert(await page.locator('text=28 days apart').count(), 'compared');
  eq(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).includes('shtrainer-photos')), true, 'own database');
  await page.click('[data-act="photo-del"] >> nth=0'); await page.click('[data-act="ask-yes"]');
  await page.waitForFunction(() => document.querySelectorAll('#photo-grid img').length === 1);
  eq(errors, [], 'errors');
  await ctx.close();
});

await test('Reminders: calendar file with daily weigh-in, carb-ups and the 4-day split', async () => {
  const own = await seeded(() => {});
  const { ctx, page } = await open({ own });
  await page.click('nav [data-tab="body"]'); await page.click('.subtabs [data-v="settings"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="ics"]')]);
  const ics = fs.readFileSync(await dl.path(), 'utf8');
  assert(ics.includes('RRULE:FREQ=DAILY') && ics.includes('T070000'), 'weigh-in');
  assert(ics.includes('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,TH,FR'), 'training days');
  assert(/UID:carbup-2026-10-\d\d/.test(ics), 'carb-ups');
  await ctx.close();
});

await test('Every tab and sub-tab renders with no errors or broken text', async () => {
  const own = await seeded(() => {});
  const { ctx, page, errors } = await open({ own });
  const tabs = [['today', []], ['plan', ['tomorrow', 'week', 'shop']], ['train', []], ['fuel', ['log', 'recipes', 'fluids', 'stack']], ['body', ['weight', 'garmin', 'measure', 'sleep', 'guide', 'settings']], ['hero', ['character', 'goals', 'journal', 'calendar', 'channel']]];
  for (const [tab, subs] of tabs) {
    await page.click(`nav [data-tab="${tab}"]`);
    for (const sub of subs.length ? subs : [null]) {
      if (sub) await page.click(`.subtabs [data-act="sub"][data-v="${sub}"]`);
      const t = await page.evaluate(() => document.getElementById('view').innerText);
      assert(!/\$\{|undefined|NaN|\[object/.test(t), `${tab}/${sub}: ${(t.match(/.{0,30}(\$\{|undefined|NaN|\[object).{0,30}/) || [])[0]}`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tab}/${sub} overflows`);
    }
  }
  eq(errors, [], 'errors');
  await ctx.close();
});

await test('Chain summary for the home page: every chain with streaks, rewritten only on change', async () => {
  const own = await seeded(() => {});
  const { ctx, page } = await open({ own });
  const sum = await page.evaluate(() => JSON.parse(localStorage.getItem('shtrainer.chains')));
  eq([sum.v, sum.date, sum.chains.map((c) => c.id)], [1, '2026-10-08', ['coffee', 'diet', 'cut', 'training', 'steps', 'sleep', 'plan']], 'summary');
  assert(sum.chains.every((c) => typeof c.day === 'number' && typeof c.best === 'number' && typeof c.name === 'string'), 'fields');
  await page.evaluate(() => { window.__writes = []; });
  await page.click('nav [data-tab="plan"]'); await page.click('nav [data-tab="today"]');
  eq((await page.evaluate(() => window.__writes)).filter(([, k]) => k === 'shtrainer.chains').length, 0, 'not rewritten when nothing changed');
  await ctx.close();
});

await test('Copy my chains from Trainer: custom chains and check-ins added, nothing else replaced, Trainer untouched', async () => {
  const trainer = { ...TRAINER, settings: { ...TRAINER.settings, coffeeStart: '2026-09-28' }, customChains: [{ id: 'cc1', name: 'No sugar', since: '2026-09-20', created: '2026-10-01' }], days: { '2026-10-06': { chains: { cc1: true, coffee: false } } } };
  const own = await seeded((s) => { s.weights.push({ date: '2026-10-07', kg: 94 }); });
  const { ctx, page } = await open({ own, trainer });
  const before = await page.evaluate(() => localStorage.getItem('trainer.v1'));
  await page.click('nav [data-tab="body"]'); await page.click('.subtabs [data-v="settings"]');
  await page.click('[data-act="trainer-chains"]');
  const r = await page.evaluate(() => ({ cc: S.customChains.map((c) => c.name), mark: S.days['2026-10-06']?.chains, coffee: S.settings.coffeeStart, w: S.weights.length, chains: JSON.parse(localStorage.getItem('shtrainer.chains')).chains.map((c) => c.name) }));
  eq([r.cc, r.mark, r.coffee, r.w], [['No sugar'], { cc1: true, coffee: false }, '2026-09-28', 1], 'copied');
  assert(r.chains.includes('No sugar'), 'on the home page summary');
  await page.click('[data-act="trainer-chains"]');
  eq(await page.evaluate(() => S.customChains.length), 1, 'no duplicates');
  eq(await page.evaluate(() => localStorage.getItem('trainer.v1')), before, 'Trainer unchanged');
  await ctx.close();
});

await test('Look: Gironda background by default, plain option, own photo kept in the photos database', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAFElEQVR4nGP8z8DAwMDAxMDAwAAAGwABBmvXaQAAAABJRU5ErkJggg==', 'base64');
  const own = await seeded(() => {});
  const { ctx, page, errors } = await open({ own });
  eq(await page.evaluate(() => [document.documentElement.dataset.bg, getComputedStyle(document.documentElement).getPropertyValue('--bg-photo').includes('Vince_Gironda')]), ['photo', true], 'default');
  await page.click('nav [data-tab="body"]'); await page.click('.subtabs [data-v="settings"]');
  await page.click('[data-act="bg"][data-v="none"]');
  eq(await page.evaluate(() => document.documentElement.dataset.bg), 'none', 'plain');
  await page.setInputFiles('#bg-file', { name: 'me.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => S.settings.background === 'mine' && document.documentElement.dataset.bg === 'photo');
  assert(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-photo').includes('blob:')), 'own photo');
  await page.click('nav [data-tab="body"]'); await page.click('.subtabs [data-v="measure"]');
  await page.waitForSelector('#photo-grid p');
  eq(await page.locator('#photo-grid img').count(), 0, 'background photo not in progress photos');
  eq(errors, [], 'errors');
  await ctx.close();
});

await test('Offline after the first load, and a deploy is picked up', async () => {
  const ctx = await browser.newContext({ timezoneId: 'Europe/London' });
  const page = await ctx.newPage();
  BUILD = 1;
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  assert(await page.evaluate(() => !!navigator.serviceWorker.controller), 'controlled');
  BUILD = 2;
  await page.reload();
  await page.waitForFunction(() => window.__BUILD === 2);
  await ctx.setOffline(true);
  await page.reload();
  eq(await page.evaluate(() => [window.__BUILD, !!document.getElementById('view').innerHTML]), [2, true], 'offline restart');
  await ctx.close();
});

await browser.close();
server.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
