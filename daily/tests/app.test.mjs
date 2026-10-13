// Daily (daily/) tests. Runs the real app, with the real Iron & Eggs and The Floor next to it, in Chromium.
// Needs Playwright:  npm i playwright   Run from the repo root:  node daily/tests/app.test.mjs
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
const BASE = `http://localhost:${server.address().port}`;
const browser = await chromium.launch();
const results = [];
async function test(name, fn) {
  try { await fn(); results.push(true); console.log(`  ✓ ${name}`); }
  catch (e) { results.push(false); console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

// iron: true opens Iron & Eggs first, so its own code writes a real, set-up store (as on a phone).
async function open({ floor, iron = false, ironPatch, time = '2026-10-13T08:00:00+01:00', raw } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.addInitScript(([floor, raw]) => {
    // Once per test (a second page in the same test shares the storage and must not wipe it).
    if (localStorage.getItem('test.seeded')) return;
    localStorage.clear();
    localStorage.setItem('test.seeded', '1');
    if (floor) localStorage.setItem('the-floor-v1', JSON.stringify(floor));
    for (const [k, v] of Object.entries(raw || {})) localStorage.setItem(k, v);
  }, [floor, raw]);
  await ctx.clock.setFixedTime(new Date(time));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (iron) {
    await page.goto(BASE + '/gym-fuel/');
    await page.evaluate((patch) => {
      const s = JSON.parse(localStorage.getItem('gymfuel.v1'));
      s.settings.setupDone = true; s.settings.installDismissed = true;
      Object.assign(s, patch || {});
      localStorage.setItem('gymfuel.v1', JSON.stringify(s));
    }, ironPatch);
  }
  await page.goto(BASE + '/daily/');
  return { page, ctx, errors };
}
const floorState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('the-floor-v1')));
const ironState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('gymfuel.v1')));
const upNext = (page) => page.textContent('#upNextTitle');

await test('first open without Iron & Eggs: day one, morning first, a tick lands in The Floor', async () => {
  const { page, ctx, errors } = await open();
  assert((await page.textContent('#app')).includes('Day one'), 'no day one banner');
  assert(await page.isVisible('#ironSetup'), 'no Iron & Eggs setup note');
  assert(await page.locator('#win-0.now').count() === 1, 'morning is not the current section at 08:00');
  assert((await upNext(page)) === 'Get up and outside', `up next: ${await upNext(page)}`);
  await page.click('#upNext [data-act=tick]');
  const f = await floorState(page);
  assert(f.days['2026-10-13'].checks.light === true, 'tick not saved in The Floor');
  assert(f.meta.steps === 15000 && f.meta.bed === '23:00', 'The Floor defaults not written');
  assert((await page.textContent('#scoreNum')) === '1', 'score not 1');
  assert((await upNext(page)) === 'Name today\'s brick', `up next after: ${await upNext(page)}`);
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('The Floor opens on what Daily wrote, and four ticks make the day count', async () => {
  const { page, ctx, errors } = await open();
  for (const id of ['light', 'brick', 'girls', 'lights']) await page.click(`#item-${id} .tick`);
  assert((await page.textContent('#scoreWord')) === 'Day counts', 'not counted');
  await page.goto(BASE + '/floor/');
  assert((await page.textContent('#scoreNum')) === '4', 'The Floor does not show 4');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('a Gironda meal goes into Iron & Eggs as its own Gironda bar logs it and ticks the proper meal', async () => {
  const { page, ctx, errors } = await open({ iron: true });
  assert(!(await page.isVisible('#ironSetup')), 'setup note shown with Iron & Eggs set up');
  await page.click('#win-0 [data-act=meal][data-id=gironda1]');
  let s = await ironState(page);
  const m = s.meals.find((x) => x.ref === 'gironda1');
  assert(m && m.date === '2026-10-13' && m.kcal === 933 && m.p === 77 && m.kind === 'staple' && m.slot === 'Breakfast', `meal: ${JSON.stringify(m)}`);
  assert((await floorState(page)).days['2026-10-13'].checks.meal === true, 'proper meal not ticked');
  assert((await page.textContent('.stats')).includes('77'), 'protein not shown');
  // Iron & Eggs shows it in its Gironda bar.
  await page.goto(BASE + '/gym-fuel/');
  await page.click('#nav [data-tab=fuel]');
  assert((await page.textContent('[data-act=gironda][data-id=gironda1]')).includes('✓'), 'Iron & Eggs does not show the meal');
  await page.goto(BASE + '/daily/');
  await page.click('#win-0 [data-act=meal][data-id=gironda1]');
  s = await ironState(page);
  assert(!s.meals.some((x) => x.ref === 'gironda1'), 'meal not taken off');
  assert((await floorState(page)).days['2026-10-13'].checks.meal === true, 'taking the meal off untick the box');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('weigh-in replaces today\'s entry and shows the change', async () => {
  const { page, ctx, errors } = await open({ iron: true, ironPatch: { weights: [{ date: '2026-10-12', kg: 83 }] } });
  assert((await page.textContent('#win-0')).includes('Last: 83 kg'), 'last weight not shown');
  await page.fill('#kg', '82.44');
  await page.click('[data-act=weigh]');
  await page.fill('#kg', '82.2');
  await page.press('#kg', 'Enter');
  const s = await ironState(page);
  const t = s.weights.filter((w) => w.date === '2026-10-13');
  assert(t.length === 1 && t[0].kg === 82.2, `weights: ${JSON.stringify(s.weights)}`);
  assert((await page.textContent('#win-0')).includes('-0.8 kg since'), 'change not shown');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('next session is the one Iron & Eggs offers, and a logged session shows as trained', async () => {
  const { page, ctx, errors } = await open({ iron: true, time: '2026-10-13T13:00:00+01:00' });
  const ironNext = await (async () => {
    const p2 = await ctx.newPage(); await p2.goto(BASE + '/gym-fuel/');
    const n = await p2.evaluate(() => nextDay(activeProgram()).name); await p2.close(); return n;
  })();
  const v = await page.evaluate(() => window.__daily.snapshot());
  assert(v.next && v.next.name === ironNext, `${v.next && v.next.name} vs ${ironNext}`);
  assert((await page.textContent('#win-1 .train')).includes(ironNext), 'next session not shown');
  await page.evaluate((name) => {
    const s = JSON.parse(localStorage.getItem('gymfuel.v1'));
    const p = Object.values(s.programs).find((x) => x.days.some((d) => d.name === name));
    s.workouts.push({ id: 'w1', date: '2026-10-13', at: '2026-10-13T11:00:00.000Z', programId: p.id, dayId: p.days.find((d) => d.name === name).id, dayName: name, entries: [] });
    localStorage.setItem('gymfuel.v1', JSON.stringify(s));
  }, ironNext);
  await page.reload();
  assert((await page.textContent('#win-1 .train')).includes('✓ Trained'), 'not shown as trained');
  assert((await page.textContent('.stats')).includes('Gym this week1 / 4'), 'week count not 1');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('up next follows the clock: midday with the morning done points at training', async () => {
  const floor = { meta: { steps: 15000, bed: '23:00', contacts: [], parked: [] }, days: { '2026-10-13': { checks: { light: true }, brick: 'Pay the council tax', steps: '', mood: 0, pain: 0, sleep: '', did: '' } } };
  const { page, ctx, errors } = await open({ floor, iron: true, time: '2026-10-13T13:00:00+01:00',
    ironPatch: { weights: [{ date: '2026-10-13', kg: 82 }], meals: [{ id: 'a', date: '2026-10-13', at: '2026-10-13T07:30:00.000Z', name: 'Gironda Meal 1', kcal: 933, p: 77, c: 4, f: 66, servings: 1, ref: 'gironda1', kind: 'staple', slot: 'Breakfast' }] } });
  assert(await page.locator('#win-1.now').count() === 1, 'day section not current at 13:00');
  assert((await upNext(page)).startsWith('Train: '), `up next: ${await upNext(page)}`);
  assert((await page.textContent('#win-1')).includes('Pay the council tax'), 'brick not shown with its box');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('typing goes straight into The Floor: steps tick the walk, bricks land on today and tomorrow', async () => {
  const { page, ctx, errors } = await open({ time: '2026-10-13T20:00:00+01:00' });
  await page.fill('#steps', '7500');
  assert((await page.textContent('#stepsLabel')) === '7,500 of 15,000', 'steps label');
  assert((await page.getAttribute('#item-walk .tick', 'aria-pressed')) === 'true', 'walk not ticked');
  await page.fill('#brickToday', 'Invoice Dave');
  await page.fill('#brickTomorrow', 'Ring the dentist');
  await page.fill('#sleep', '7.5');
  await page.fill('#did', 'Fixed the bike');
  await page.click('[data-act=scale][data-field=mood][data-n="2"]');
  assert(await page.isVisible('#support'), 'support numbers not shown at mood 2');
  const f = await floorState(page);
  const d = f.days['2026-10-13'];
  assert(d.steps === '7500' && d.checks.walk && d.brick === 'Invoice Dave' && d.sleep === '7.5' && d.did === 'Fixed the bike' && d.mood === 2, JSON.stringify(d));
  assert(f.days['2026-10-14'].brick === 'Ring the dentist', 'tomorrow\'s brick');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('an open Floor picks up Daily\'s tick and doesn\'t save over it', async () => {
  const { page, ctx, errors } = await open();
  const floor = await ctx.newPage();
  await floor.goto(BASE + '/floor/');
  await page.click('#item-light .tick');
  await floor.waitForFunction(() => document.querySelector('#items .tick[data-item=light]').getAttribute('aria-pressed') === 'true');
  await floor.click('#items .tick[data-item=girls]');
  await floor.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const c = (await floorState(page)).days['2026-10-13'].checks;
  assert(c.light && c.girls, JSON.stringify(c));
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('an open Iron & Eggs picks up Daily\'s meal and doesn\'t save over it', async () => {
  const { page, ctx, errors } = await open({ iron: true });
  const iron = await ctx.newPage();
  await iron.goto(BASE + '/gym-fuel/');
  await page.click('#win-0 [data-act=meal][data-id=gironda1]');
  await iron.waitForFunction(() => S.meals.some((m) => m.ref === 'gironda1'));
  await iron.click('#nav [data-tab=fuel]');
  await iron.click('[data-act=gironda][data-id=gironda2]');
  const s = await ironState(page);
  assert(s.meals.some((m) => m.ref === 'gironda1') && s.meals.some((m) => m.ref === 'gironda2'), JSON.stringify(s.meals.map((m) => m.ref)));
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('unreadable Floor data is left alone', async () => {
  const { page, ctx, errors } = await open({ raw: { 'the-floor-v1': '{broken' } });
  assert((await page.textContent('#app')).includes('can\'t be read'), 'no warning');
  await page.click('#item-light .tick');
  assert((await page.evaluate(() => localStorage.getItem('the-floor-v1'))) === '{broken', 'overwritten');
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await test('fits a phone screen with no sideways scroll', async () => {
  const { page, ctx, errors } = await open({ iron: true });
  await page.setViewportSize({ width: 360, height: 740 });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(over <= 0, `scrolls sideways by ${over}px`);
  assert(!errors.length, errors.join('; '));
  await ctx.close();
});

await browser.close();
server.close();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
