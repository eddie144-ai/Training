// The Floor (floor/) tests. Runs the real app in Chromium against a local server.
// Needs Playwright:  npm i playwright   Run from the repo root:  node floor/tests/app.test.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { js: 'text/javascript', html: 'text/html', json: 'application/json', png: 'image/png' };
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
const URL_ = `http://localhost:${server.address().port}/floor/`;
const browser = await chromium.launch();
const results = [];
async function test(name, fn) {
  try { await fn(); results.push(true); console.log(`  ✓ ${name}`); }
  catch (e) { results.push(false); console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

async function open({ stored, time = '2026-10-12T12:00:00+01:00' } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.addInitScript((stored) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    if (stored) localStorage.setItem('the-floor-v1', JSON.stringify(stored));
  }, stored);
  await ctx.clock.setFixedTime(new Date(time));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Fonts are external; don't let the test depend on the network.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(URL_);
  return { page, ctx, errors };
}
const state = (page) => page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); return JSON.parse(localStorage.getItem('the-floor-v1')); });

await test('first open shows day one and every tab renders without errors', async () => {
  const { page, ctx, errors } = await open();
  assert(await page.isVisible('#recovery'), 'day one banner hidden');
  assert((await page.textContent('#recovery')).includes('Day one'), 'not the day one text');
  assert(await page.locator('#items .item').count() === 6, 'not six items');
  for (const t of ['girls', 'parked', 'today']) { await page.click('#tab-' + t); assert(await page.isVisible('#panel-' + t), t + ' panel hidden'); }
  assert(errors.length === 0, errors.join('; '));
  await ctx.close();
});

await test('four ticks make the day count, and it survives a reload', async () => {
  const { page, ctx } = await open();
  for (const id of ['light', 'meal', 'girls', 'lights']) await page.click(`.tick[data-item="${id}"]`);
  assert((await page.textContent('#scoreNum')) === '4', 'score not 4');
  assert((await page.textContent('#scoreWord')) === 'Day counts', 'word not "Day counts"');
  await page.reload();
  assert((await page.textContent('#scoreNum')) === '4', 'score lost on reload');
  await ctx.close();
});

await test('typing steps ticks the walk', async () => {
  const { page, ctx } = await open();
  await page.fill('#steps', '5200');
  assert((await page.getAttribute('.tick[data-item="walk"]', 'aria-pressed')) === 'true', 'walk not ticked');
  const s = await state(page);
  assert(s.days['2026-10-12'].steps === '5200' && s.days['2026-10-12'].checks.walk, 'steps not stored');
  await ctx.close();
});

await test('a slipped yesterday shows the recovery banner; low mood shows support', async () => {
  const { page, ctx } = await open({ stored: { meta: {}, days: { '2026-10-10': { checks: { light: true, walk: true, meal: true, girls: true } }, '2026-10-11': { checks: { light: true } } } } });
  assert((await page.textContent('#recovery')).includes('Yesterday slipped'), 'no slip banner');
  await page.click('#mood button:nth-child(2)');
  assert(await page.isVisible('#support'), 'support hidden at mood 2');
  await ctx.close();
});

await test('girls log: a planned visit is stored and shows as next', async () => {
  const { page, ctx } = await open();
  await page.click('#tab-girls');
  await page.fill('#gDate', '2026-10-14');
  await page.selectOption('#gType', 'planned');
  await page.fill('#gNote', 'Pick up 13:00');
  await page.click('#gAdd');
  assert((await page.textContent('#nextGirls')).includes('in 2 days'), 'next visit not shown');
  const s = await state(page);
  assert(s.meta.contacts.length === 1 && s.meta.contacts[0].note === 'Pick up 13:00', 'entry not stored');
  await ctx.close();
});

await test('parked ideas lock for seven days, then can become the one project', async () => {
  const at = new Date('2026-10-01T10:00:00+01:00').getTime();
  const { page, ctx } = await open({ stored: { meta: { oneProject: 'Old', parked: [{ text: 'New idea', at }, { text: 'Fresh', at: Date.parse('2026-10-11T10:00:00+01:00') }] }, days: {} } });
  await page.click('#tab-parked');
  const pills = await page.locator('#pList .pill').allTextContents();
  assert(pills.join(',') === 'Decide,Locked', 'pills were ' + pills.join(','));
  await page.click('#pList .btn:not(.ghost)');
  await page.click('#pList .btn:not(.ghost)');
  const s = await state(page);
  assert(s.meta.oneProject === 'New idea', 'not swapped');
  assert(s.meta.parked.some((p) => p.text === 'Old'), 'old project not parked');
  await ctx.close();
});

await test('backup restore merges without wiping what is already on the phone', async () => {
  const { page, ctx } = await open({ stored: { meta: { contacts: [{ date: '2026-10-05', type: 'happened', note: 'local', at: 1 }] }, days: { '2026-10-11': { checks: { light: true } } } } });
  const backup = { app: 'the-floor', v: 1, meta: { contacts: [{ date: '2026-10-05', type: 'happened', note: 'local', at: 1 }, { date: '2026-10-08', type: 'cancelled-them', note: 'from backup', at: 2 }], parked: [] },
    days: { '2026-10-11': { checks: { meal: true } }, '2026-10-09': { checks: { light: true, walk: true, meal: true, girls: true } } } };
  await page.evaluate((b) => window.__floor.restoreFrom(JSON.stringify(b)), backup);
  const s = await state(page);
  assert(s.meta.contacts.length === 2, 'contacts ' + s.meta.contacts.length);
  assert(s.days['2026-10-11'].checks.light && !s.days['2026-10-11'].checks.meal, 'local day overwritten');
  assert(s.days['2026-10-09'].checks.girls, 'backup day not added');
  await page.evaluate(() => window.__floor.restoreFrom('not json'));
  assert((await state(page)).meta.contacts.length === 2, 'bad backup changed data');
  await ctx.close();
});

await test('the day rolls over when the app comes back after midnight', async () => {
  const { page, ctx } = await open({ time: '2026-10-12T23:59:00+01:00' });
  await page.click('.tick[data-item="light"]');
  await ctx.clock.setFixedTime(new Date('2026-10-13T07:00:00+01:00'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  assert((await page.textContent('#scoreNum')) === '0', 'still on yesterday');
  assert((await page.textContent('#recovery')).includes('Two days down'), 'no slip banner after rollover');
  await ctx.close();
});

await browser.close();
server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
