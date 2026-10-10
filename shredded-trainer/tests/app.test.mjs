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
  const tabs = [['today', []], ['plan', ['tomorrow', 'week', 'shop']], ['train', []], ['fuel', ['log', 'recipes', 'fluids', 'stack']], ['body', ['weight', 'garmin', 'measure', 'sleep', 'guide', 'settings']], ['hero', ['character', 'goals', 'journal', 'calendar', 'channel', 'apps']]];
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
  eq([sum.v, sum.date, sum.chains.map((c) => c.id)], [1, '2026-10-08', ['coffee', 'diet', 'cut', 'fasting', 'protein', 'training', 'sessions', 'steps', 'sleep', 'plan']], 'summary');
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

await test('New chains: fasting window, protein, and 4 sessions a week', async () => {
  const own = await seeded((s) => {
    const meal = (id, d, hhmm, ref, p) => ({ id, date: d, at: new Date(`${d}T${hhmm}:00+01:00`).toISOString(), name: ref, kcal: 900, p, c: 4, f: 60, servings: 1, ref });
    s.meals.push(meal('a', '2026-10-05', '09:30', 'gironda1', 77), meal('b', '2026-10-05', '14:00', 'gironda2', 93));
    s.meals.push(meal('c', '2026-10-06', '09:30', 'gironda1', 77), meal('d', '2026-10-06', '19:30', 'gironda2', 93));
    s.meals.push(meal('e', '2026-10-07', '12:00', 'other', 20));
    s.workouts.push(...['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09'].map((d, i) => ({ id: `w${i}`, date: d, at: `${d}T17:00:00.000Z`, programId: 'my4week', dayId: 'x', entries: [] })));
  });
  const { ctx, page, errors } = await open({ own, time: '2026-10-12T10:00:00+01:00' });
  const r = await page.evaluate(() => ({
    fast: [chainStatus('2026-10-05', 'fasting'), chainStatus('2026-10-06', 'fasting')],
    prot: [chainStatus('2026-10-05', 'protein'), chainStatus('2026-10-07', 'protein')],
    wk: sessionsWeek('2026-10-05'), wk2: sessionsWeek('2026-10-12'), st: chainStreak('sessions'),
    sum: JSON.parse(localStorage.getItem('shtrainer.chains')).chains.find((c) => c.id === 'sessions'),
  }));
  eq(r.fast, ['done', 'miss'], 'fasting: inside the 09:00-15:00 window, then a 19:30 meal breaks it');
  eq(r.prot, ['done', 'miss'], 'protein: 170 g hit, then an off-plan 20 g day');
  eq([r.wk.count, r.wk.need, r.wk.status, r.wk2.status, r.st.cur], [4, 4, 'done', 'pending', 1], 'one week of 4 sessions won; this week open');
  eq([r.sum.unit, r.sum.day], ['wk', 1], 'home page summary in weeks');
  await page.click('nav [data-tab="today"]');
  assert(await page.locator('text=Sessions this week').count(), 'shown on Today');
  eq(errors, [], 'errors');
  await ctx.close();
});

await test('Quick log on Today saves weight and sleep, and feeds the sleep chain', async () => {
  const own = await seeded(() => {});
  const { ctx, page } = await open({ own });
  await page.fill('#quick-log input[name="kg"]', '94.3');
  await page.fill('#quick-log input[name="hours"]', '7.8');
  await page.click('#quick-log button[type=submit]');
  eq(await page.evaluate(() => [S.weights.find((w) => w.date === today())?.kg, sleepOn(today())?.hours, chainStatus(today(), 'sleep')]), [94.3, 7.8, 'done'], 'saved');
  await page.fill('#quick-log input[name="hours"]', '6');
  await page.click('#quick-log button[type=submit]');
  eq(await page.evaluate(() => [S.sleep.filter((x) => x.date === today()).length, chainStatus(today(), 'sleep')]), [1, 'miss'], 'updated, not duplicated');
  await page.fill('#quick-log input[name="kg"]', '9000');
  await page.click('#quick-log button[type=submit]');
  eq(await page.evaluate(() => S.weights.find((w) => w.date === today()).kg), 94.3, 'bad weight rejected');
  await ctx.close();
});

await test('Goal-pack link imports clean chains with their history and starting weights', async () => {
  const own = await seeded(() => {});
  const { ctx, page } = await open({ own });
  const pack = { kind: 'trainer-goals', name: 'Test pack', chains: [{ id: 'weed', name: 'No weed', since: '2026-07-08' }, { id: 'energy', name: 'No energy drinks', since: '2026-07-16' }], baselines: [{ name: 'Barbell Squat', date: '2026-09-23', sets: [[110, 8], [110, 8], [110, 8]] }] };
  const link = 'https://example/#import=' + Buffer.from(JSON.stringify(pack)).toString('base64url');
  const p = await page.evaluate((l) => decodePack(l), link);
  eq(p.name, 'Test pack', 'decodes');
  await page.evaluate((x) => { applyPack(x); commit(); }, p);
  const r = await page.evaluate(() => ({ weed: dayNumber(chainStreak('weed')), energy: dayNumber(chainStreak('energy')), base: S.baselines[exKey('Barbell Squat')].sets[0] }));
  eq([r.weed, r.energy, r.base], [93, 85, { kg: 110, reps: 8 }], 'No weed day 93 and No energy drinks day 85 on 8 Oct; squat baseline 110 x 8');
  await ctx.close();
});

await test('Previous weights are built in; a newer weight you already have is kept', async () => {
  const own = await seeded(() => {});
  eq([Object.keys(own.baselines).length, own.baselines['reverse grip bench press'].sets[0]], [22, { kg: 25, reps: 8 }], 'fresh start has all 22 lifts');
  const old = await seeded((s) => { delete s.settings.seededLifts; s.baselines = { 'barbell squat': { name: 'Barbell Squat', date: '2026-10-01', sets: [{ kg: 120, reps: 5 }] } }; });
  const { ctx, page, errors } = await open({ own: old });
  const r = await page.evaluate(() => ({ n: Object.keys(S.baselines).length, squat: S.baselines[exKey('Barbell Squat')].sets[0].kg, saved: JSON.parse(localStorage.getItem('shtrainer.v1')).settings.seededLifts }));
  eq(r, { n: 22, squat: 120, saved: true }, 'merged once, newer squat kept');
  await page.click('nav [data-tab="train"]');
  assert(await page.locator('text=/Starting point/').count(), 'starting points shown in the logger');
  eq(errors, [], 'errors');
  await ctx.close();
});

await test('Eating modes: 18:6, one meal, fast day; diet chains kept unless the log or I broke it says otherwise', async () => {
  const own = await seeded((s) => {
    const meal = (id, d, hhmm, ref, p) => ({ id, date: d, at: new Date(`${d}T${hhmm}:00+01:00`).toISOString(), name: ref, kcal: 900, p, c: 4, f: 60, servings: 1, ref });
    s.days['2026-10-06'] = { eat: 'omad' };
    s.meals.push(meal('a', '2026-10-06', '19:30', 'gironda2', 93));
    s.days['2026-10-07'] = { eat: 'omad' };
    s.meals.push(meal('b', '2026-10-07', '12:00', 'gironda1', 77), meal('c', '2026-10-07', '18:00', 'gironda2', 93));
  });
  const { ctx, page, errors } = await open({ own, time: '2026-10-08T10:00:00+01:00' });
  const ids = ['diet', 'cut', 'fasting', 'protein'];
  const r = await page.evaluate((ids) => ({
    blank: ids.map((id) => chainStatus('2026-10-05', id)),
    omad: ids.map((id) => chainStatus('2026-10-06', id)),
    two: chainStatus('2026-10-07', 'fasting'),
  }), ids);
  eq(r.blank, ['done', 'done', 'done', 'done'], 'a past day with nothing logged counts as kept');
  eq(r.omad, ['done', 'done', 'done', 'done'], 'one meal at 19:30 keeps every diet chain');
  eq(r.two, 'miss', 'two sittings on a one-meal day break the fasting chain');
  await page.click('[data-act="eat-mode"][data-v="fast"]');
  eq(await page.evaluate(() => [eatMode(today()), S.days[today()].fast, chainStatus(today(), 'fasting')]), ['fast', true, 'pending'], 'fast day set; counts once the window has passed');
  assert(await page.locator('text=/Fast day\./').count(), 'fast-day note on Today');
  await page.click('[data-act="eat-mode"][data-v="omad"]');
  eq(await page.evaluate(() => [eatMode(today()), !!S.days[today()].fast]), ['omad', false], 'switched to one meal');
  await page.click('[data-act="chain-mark"][data-chain="cut"][data-v="0"]');
  eq(await page.evaluate(() => chainStatus(today(), 'cut')), 'miss', 'I broke it');
  await page.click('[data-act="chain-mark"][data-chain="cut"][data-v="0"]');
  eq(await page.evaluate(() => chainStatus(today(), 'cut')), 'pending', 'tap again: back to automatic');
  const order = await page.evaluate(() => [...document.querySelectorAll('#view h2')].map((h) => h.textContent));
  const at = (t) => order.findIndex((x) => x.startsWith(t));
  assert(at('Eating today') < at('Diet & health') && at('Diet & health') < at('Clean chains') && at('Clean chains') < at('A little for everything else'), `Today order: ${order.join(' | ')}`);
  await page.click('[data-act="life"][data-k="youtube"]');
  eq(await page.evaluate(() => S.days[today()].life), { youtube: true }, 'a bit for YouTube ticked');
  eq(errors, [], 'errors');
  await ctx.close();
});

await test('Workout log: different weight per set, extra sets, how it felt; a half-logged session survives a reload', async () => {
  const own = await seeded(() => {});
  const { ctx, page, errors } = await open({ own });
  await page.click('nav [data-tab="train"]');
  const card = page.locator('.excard').filter({ has: page.locator('[data-act="set-add"]') }).first();
  const name = (await card.locator('b').first().textContent()).trim();
  const kg = (s) => card.locator(`input[data-draft$="|${s}|kg"]`);
  const reps = (s) => card.locator(`input[data-draft$="|${s}|reps"]`);
  const planned = await card.locator('input[data-draft$="|kg"]').count();
  const weights = [25, 25, 20, 15, 15, 15].slice(0, planned);
  for (let s = 0; s < planned; s++) { await kg(s).fill(String(weights[s])); await reps(s).fill('8'); }
  await page.reload();
  await page.click('nav [data-tab="train"]');
  eq(await kg(0).inputValue(), '25', 'draft kept after reload');
  await card.locator('[data-act="set-add"]').click();
  await card.locator('[data-act="set-add"]').click();
  eq(await kg(planned + 1).inputValue(), String(weights[planned - 1]), 'extra set starts at the last weight');
  await kg(planned).fill('20'); await kg(planned + 1).fill('20');
  await reps(planned).fill('10'); await reps(planned + 1).fill('9');
  assert(await card.locator('text=Extra 2').count(), 'extra sets labelled');
  await page.click('[data-act="feel"][data-v="4"]');
  await page.fill('input[aria-label="Session notes"]', 'Strong on bench');
  await page.click('[data-act="complete"]');
  const w = await page.evaluate((n) => { const w = S.workouts[S.workouts.length - 1]; return { feel: w.feel, note: w.note, sets: w.entries.find((e) => e.name === n).sets }; }, name);
  eq([w.feel, w.note, w.sets.length, w.sets[0].kg, w.sets[planned].kg, w.sets[planned + 1].reps], [4, 'Strong on bench', planned + 2, 25, 20, 9], 'saved with extra sets and feel');
  assert(await page.locator('text=Felt: Good').count(), 'feel shown in history');
  eq(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('shtrainer.drafts')))), [], 'draft cleared after completing');
  eq(errors, [], 'errors');
  await ctx.close();
});

await test('After the 4 weeks: Mentzer HIT is offered on 2 November', async () => {
  const own = await seeded(() => {});
  const a = await open({ own, time: '2026-10-28T10:00:00+01:00' });
  assert(await a.page.locator('text=/Last week of the 4-week programme/').count(), 'week 4 heads-up');
  await a.ctx.close();
  const { ctx, page, errors } = await open({ own, time: '2026-11-02T10:00:00+00:00' });
  assert(await page.locator('text=4 weeks done: Mentzer next').count(), 'offer on Today');
  await page.click('#view [data-act="go-mentzer"]');
  eq(await page.evaluate(() => [S.settings.family, ui.tab, activeProgram().family]), ['hit', 'train', 'hit'], 'switched');
  eq(await page.locator('text=4 weeks done: Mentzer next').count(), 0, 'offer gone');
  eq(errors, [], 'errors');
  await ctx.close();
});

await test('Iron & Eggs: Apps tab backs up every app in one file and restores it', async () => {
  const own = await seeded((s) => { s.weights.push({ date: '2026-10-07', kg: 94.4 }); });
  const { ctx, page, errors } = await open({ own });
  await page.evaluate(() => { localStorage.setItem('council.v1', '{"commits":[]}'); localStorage.setItem('council.anthropicKey', 'SECRET'); });
  eq(await page.locator('#title').textContent(), 'Iron & Eggs', 'branded');
  assert(await page.locator('text=No backup for a week').count(), 'backup nudge on Today');
  await page.click('[data-act="go-apps"]');
  assert(await page.locator('a.applink', { hasText: 'Council' }).count(), 'other apps listed');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="backup-all"]')]);
  const file = await dl.path();
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  eq([data.kind, !!data.keys['shtrainer.v1'], data.keys['council.v1'], JSON.stringify(data).includes('SECRET')], ['iron-eggs-backup', true, '{"commits":[]}', false], 'backup contents');
  await page.evaluate(() => { S.weights = []; commit(); localStorage.setItem('council.v1', '{"commits":[1]}'); });
  fs.writeFileSync(file + '.json', JSON.stringify(data));
  await page.setInputFiles('#restore-all', file + '.json');
  await Promise.all([page.waitForEvent('load'), page.click('[data-act="ask-yes"]')]);
  eq(await page.evaluate(() => [S.weights.length, localStorage.getItem('council.v1')]), [1, '{"commits":[]}'], 'restored');
  eq(errors, [], 'errors');
  await ctx.close();
});

await test('Fast timer from midnight: one tap starts it at 00:00 today', async () => {
  const own = await seeded(() => {});
  const { ctx, page, errors } = await open({ own, time: '2026-10-08T10:30:00+01:00' });
  await page.click('[data-act="fast-midnight"]');
  const f = await page.evaluate(() => { const x = activeFast(); return { start: new Date(x.start).toString(), goal: x.goalH, h: Math.round(fastHours(x) * 10) / 10 }; });
  assert(f.start.includes('Oct 08 2026 00:00:00'), `starts at local midnight (${f.start})`);
  eq([f.goal, f.h], [24, 10.5], 'goal 24 h, 10.5 h in');
  assert(await page.locator('h2:has-text("Fast timer")').count(), 'timer card on Today');
  eq(await page.locator('[data-act="fast-midnight"]').count(), 0, 'button hidden while a timer runs');
  await page.click('[data-act="fast-goal"]');
  await page.click('[data-act="fast-goal-set"][data-h="18"]');
  eq(await page.evaluate(() => activeFast().goalH), 18, 'goal changed to 18 h');
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

// A minimal zip writer (stored and deflated entries) for the Garmin import test.
function makeZip(entries) {
  const zlib = globalThis.__zlib;
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const locals = [], central = []; let off = 0;
  for (const [name, text, deflate] of entries) {
    const data = Buffer.from(text), body = deflate ? zlib.deflateRawSync(data) : data, n = Buffer.from(name);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(deflate ? 8 : 0, 8);
    h.writeUInt32LE(crc(data), 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(deflate ? 8 : 0, 10);
    c.writeUInt32LE(crc(data), 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    locals.push(h, n, body); central.push(c, n); off += 30 + n.length + body.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entries.length, 8); e.writeUInt16LE(entries.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, e]);
}

await test('Garmin import: reads the export zip into Garmin days, steps and sleep, keeping hand-logged sleep', async () => {
  globalThis.__zlib = (await import('node:zlib')).default;
  const uds = [
    { calendarDate: '2026-10-05', totalSteps: 12000, restingHeartRate: 74, maxHeartRate: 140, activeKilocalories: 900.4, totalDistanceMeters: 9800, moderateIntensityMinutes: 10, vigorousIntensityMinutes: 5,
      allDayStress: { aggregatorList: [{ type: 'AWAKE', averageStressLevel: 60 }, { type: 'TOTAL', averageStressLevel: 41 }] }, respiration: { avgWakingRespirationValue: 14 },
      bodyBattery: { bodyBatteryStatList: [{ bodyBatteryStatType: 'HIGHEST', statsValue: 38 }, { bodyBatteryStatType: 'LOWEST', statsValue: 16 }, { bodyBatteryStatType: 'SLEEPEND', statsValue: 35 }] } },
    { calendarDate: '2026-10-06', totalSteps: 3000, restingHeartRate: 72 },
  ];
  const sleep = [
    { calendarDate: '2026-10-05', sleepStartTimestampGMT: '2026-10-04T22:58:00.0', sleepEndTimestampGMT: '2026-10-05T07:20:00.0', deepSleepSeconds: 3600, lightSleepSeconds: 21600, remSleepSeconds: 3600 },
    { calendarDate: '2026-10-06', sleepStartTimestampGMT: '2026-10-05T23:00:00.0', sleepEndTimestampGMT: '2026-10-06T07:00:00.0' },
  ];
  const zip = makeZip([
    ['DI_CONNECT/DI-Connect-User/user_profile.json', '{"firstName":"x"}', true],
    ['DI_CONNECT/DI-Connect-Aggregator/UDSFile_2026-09-01_2026-10-07.json', JSON.stringify(uds), true],
    ['DI_CONNECT/DI-Connect-Wellness/2026-09-08_2026-10-07_1_sleepData.json', JSON.stringify(sleep), false],
  ]);
  const own = await seeded((s) => {
    s.days['2026-10-06'] = { steps: 5000 };
    s.sleep.push({ date: '2026-10-06', at: '2026-10-06T08:00:00.000Z', hours: 6, quality: 5, notes: 'mine' });
  });
  const { ctx, page, errors } = await open({ own });
  await page.click('nav [data-tab="body"]');
  await page.click('[data-act="sub"][data-v="garmin"]');
  await page.setInputFiles('#garmin-file', { name: 'export.zip', mimeType: 'application/zip', buffer: zip });
  await page.waitForSelector('[data-act="ask-yes"]');
  assert((await page.locator('.ask-text').innerText()).includes('Import 2 days'), 'asks to import 2 days');
  await page.click('[data-act="ask-yes"]');
  const r = await page.evaluate(() => ({ g: S.garmin, steps: [S.days['2026-10-05']?.steps, S.days['2026-10-06']?.steps], sleep: S.sleep.filter((x) => x.date >= '2026-10-05').map((x) => [x.date, x.hours, x.notes]).sort() }));
  eq(r.g['2026-10-05'], { rhr: 74, maxHr: 140, activeKcal: 900, distance: 9.8, intensity: 20, stress: 41, resp: 14, bbHigh: 38, bbLow: 16, bbWake: 35, sleepH: 8 }, 'day mapped');
  eq(r.steps, [12000, 5000], 'steps filled, higher hand-logged count kept');
  eq(r.sleep, [['2026-10-05', 8, 'From Garmin'], ['2026-10-06', 6, 'mine']], 'sleep from stages; hand-logged night kept');
  eq(r.g['2026-10-06'].sleepH, 8, 'sleep span used when there are no stages');
  await page.setInputFiles('#garmin-file', { name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  await page.waitForSelector('.toast:has-text("No Garmin")');
  eq(errors, [], 'no page errors');
  await ctx.close();
});

await test('No coffee restarts on 10 Oct 2026: day 1 that day, best kept, other chains untouched, applied once', async () => {
  const own = await seeded(() => {});
  const { ctx, page } = await open({ own, time: '2026-10-10T10:00:00+01:00' });
  const r = await page.evaluate(() => ({ slip: S.days['2026-10-09']?.chains?.coffee, coffee: chainStreak('coffee'), diet: chainStreak('diet').cur, flag: S.settings.coffeeRestart }));
  eq([r.slip, r.coffee.cur, r.coffee.today, r.flag], [false, 0, 'pending', true], 'restarted');
  assert(r.coffee.best >= 8, 'best kept');
  const sum = await page.evaluate(() => JSON.parse(localStorage.getItem('shtrainer.chains')).chains.find((c) => c.id === 'coffee'));
  eq(sum.day, 1, 'home page shows day 1');
  await page.evaluate(() => { delete S.days['2026-10-09'].chains.coffee; save(); });
  await page.reload();
  eq(await page.evaluate(() => S.days['2026-10-09']?.chains?.coffee), undefined, 'not re-applied');
  await ctx.close();
});

await browser.close();
server.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
