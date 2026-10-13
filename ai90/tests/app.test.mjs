// AI 90 (ai90/) tests. Runs the real app in Chromium against a local server.
// Needs Playwright:  npm i playwright   Run from the repo root:  node ai90/tests/app.test.mjs
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
const URL_ = `http://localhost:${server.address().port}/ai90/`;
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
    if (stored) localStorage.setItem('ai90-v1', JSON.stringify(stored));
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
const state = (page) => page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); return JSON.parse(localStorage.getItem('ai90-v1')); });


await test('first open starts day one today, and every tab renders without errors', async () => {
  const { page, ctx, errors } = await open();
  assert((await page.textContent('#dayNum')) === '1', 'not day 1');
  assert((await page.textContent('#title')).includes('profile'), 'day 1 is not the profile setup');
  for (const t of ['plan', 'tools', 'money', 'setup', 'today']) { await page.click('#tab-' + t); assert(await page.isVisible('#panel-' + t), t + ' panel hidden'); }
  assert(await page.locator('.dot').count() === 90, 'plan does not have 90 days');
  const s = await state(page);
  assert(s.meta.start === '2026-10-12', 'start date not stored');
  assert(errors.length === 0, errors.join('; '));
  await ctx.close();
});

await test('every one of the 90 days has a title, and prompts have no unfilled placeholders', async () => {
  const { page, ctx } = await open();
  const bad = await page.evaluate(() => {
    const out = [];
    for (let n = 1; n <= 90; n++) {
      const i = window.__ai90.dayInfo(n);
      if (!i.task || !i.task.t) out.push(n + ' no title');
    }
    return out;
  });
  assert(bad.length === 0, bad.join(', '));
  for (let n = 1; n < 90; n++) await page.click('#nextDay');
  assert((await page.textContent('#kind')) === 'Day 90', 'last day is not Day 90');
  for (let n = 0; n < 89; n++) {
    const p = await page.textContent('#prompt');
    assert(!/\{(offer|audience|niche|channel|price|lane)\}/.test(p), 'placeholder left on a day: ' + p.slice(0, 60));
    await page.click('#prevDay');
  }
  await ctx.close();
});

await test('marking a day done and picking a bake-off winner persist and show in the plan', async () => {
  const { page, ctx } = await open({ time: '2026-10-16T12:00:00+01:00', stored: { meta: { start: '2026-10-12' } } });
  assert((await page.textContent('#dayNum')) === '5', 'not day 5');
  assert((await page.textContent('#kind')) === 'Bake-off', 'day 5 is not the bake-off');
  await page.click('#winner [data-bot="grok"]');
  await page.click('#doneBtn');
  await page.reload();
  const s = await state(page);
  assert(s.days['5'].done && s.days['5'].winner === 'grok', 'day 5 not stored');
  await page.click('#tab-plan');
  assert(await page.locator('.dot.done[data-day="5"]').count() === 1, 'day 5 dot not done');
  assert((await page.textContent('#tally')).startsWith('0'), 'tally wrong');
  assert((await page.locator('#tally strong').nth(2).textContent()) === '1', 'grok win not counted');
  await ctx.close();
});

await test('the lane fills the prompts, and edits to it show straight away', async () => {
  const { page, ctx } = await open();
  await page.click('#tab-setup');
  await page.selectOption('#setLane', 'content');
  await page.fill('#setAudience', 'dads who lift');
  await page.click('#tab-today');
  await page.click('#nextDay');
  await page.click('#nextDay');
  await page.click('#nextDay');
  assert((await page.textContent('#prompt')).includes('dads who lift'), 'audience not in prompt');
  const s = await state(page);
  assert(s.meta.lane === 'content' && s.meta.offer.includes('12-week'), 'lane defaults not applied');
  await ctx.close();
});

await test('money and leads: log, total, stage and summary', async () => {
  const { page, ctx } = await open();
  await page.click('#tab-money');
  await page.fill('#inAmount', '19');
  await page.fill('#inSource', 'First PDF');
  await page.click('#inAdd');
  await page.fill('#inAmount', '25.50');
  await page.click('#inAdd');
  assert((await page.textContent('#earned')) === '£44.50', 'total wrong: ' + await page.textContent('#earned'));
  await page.fill('#leadName', 'Dave PT');
  await page.click('#leadAdd');
  await page.selectOption('#leadList select', 'replied');
  const sum = await page.evaluate(() => window.__ai90.summaryText());
  assert(sum.includes('Earned: £44.50') && sum.includes('replied 1'), 'summary wrong: ' + sum);
  await ctx.close();
});

await test('missed days show the never-miss-twice banner; after day 90 shows the finish', async () => {
  let { page, ctx } = await open({ time: '2026-10-15T12:00:00+01:00', stored: { meta: { start: '2026-10-12' }, days: { 1: { done: true } } } });
  assert((await page.textContent('#banner')).includes('Two days behind'), 'no behind banner');
  await ctx.close();
  ({ page, ctx } = await open({ time: '2027-02-01T12:00:00Z', stored: { meta: { start: '2026-10-12' } } }));
  assert((await page.textContent('#dayNum')) === '90', 'not capped at 90');
  assert((await page.textContent('#banner')).includes('90 days done'), 'no finish banner');
  await ctx.close();
});

await test('backup restores into an empty phone and merges without wiping', async () => {
  const { page, ctx } = await open({ stored: { meta: { start: '2026-10-12' }, days: { 1: { done: true, note: 'mine' } }, income: [{ date: '2026-10-12', amount: 10, source: 'a', at: 1 }] } });
  const json = await page.evaluate(() => window.__ai90.backupJSON());
  const other = JSON.parse(json);
  other.days['1'] = { done: false, note: 'theirs' };
  other.days['2'] = { done: true, note: '' };
  other.income.push({ date: '2026-10-13', amount: 5, source: 'b', at: 2 });
  await page.evaluate((t) => window.__ai90.restoreFrom(t), JSON.stringify(other));
  const s = await state(page);
  assert(s.days['1'].note === 'mine', 'local day overwritten');
  assert(s.days['2'].done, 'new day not merged');
  assert(s.income.length === 2, 'income not merged once');
  await page.evaluate(() => window.__ai90.restoreFrom('{"hello":1}'));
  assert((await state(page)).income.length === 2, 'junk changed data');
  await ctx.close();
});

await test('Perplexity is the fourth tool, and parked ideas persist and show in the summary', async () => {
  const { page, ctx } = await open({ time: '2026-10-16T12:00:00+01:00', stored: { meta: { start: '2026-10-12' } } });
  assert(await page.locator('#winner .chip').count() === 4, 'bake-off does not offer four tools');
  await page.click('#winner [data-bot="perplexity"]');
  await page.click('#tab-tools');
  assert((await page.textContent('#toolCards')).includes('Perplexity Pro'), 'no Perplexity card');
  await page.click('#tab-plan');
  await page.fill('#parkText', 'Mushroom business');
  await page.click('#parkAdd');
  await page.reload();
  await page.click('#tab-plan');
  assert((await page.textContent('#parkedList')).includes('Mushroom business'), 'parked idea lost on reload');
  const sum = await page.evaluate(() => window.__ai90.summaryText());
  assert(sum.includes('Perplexity 1') && sum.includes('Parked until Day 90: Mushroom business'), 'summary wrong: ' + sum);
  await ctx.close();
});

await test('data saved before Perplexity and Parked existed still loads', async () => {
  const { page, ctx, errors } = await open({ stored: { meta: { start: '2026-10-12', lane: 'apps', goal: 500 }, days: { 5: { done: true, winner: 'grok' } }, income: [], leads: [] } });
  const s = await state(page);
  assert(Array.isArray(s.meta.parked) && s.meta.goal === 500 && s.days['5'].winner === 'grok', 'old data not kept');
  assert(errors.length === 0, errors.join('; '));
  await ctx.close();
});

await browser.close();
server.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
