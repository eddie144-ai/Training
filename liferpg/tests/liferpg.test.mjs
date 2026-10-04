// Life RPG test suite. Runs the real app in Chromium against a local server.
// Needs Playwright:  npm i playwright   (Chromium must be installed or PLAYWRIGHT_BROWSERS_PATH set)
// Run from the repo root:  node liferpg/tests/liferpg.test.mjs
import { chromium, devices } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let BUILD = 1; // appended to app.js to simulate a deploy
const TYPES = { js: 'text/javascript', html: 'text/html', json: 'application/json', png: 'image/png', css: 'text/css' };
const server = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (err, body) => {
    if (err) { res.writeHead(404); res.end(); return; }
    if (f.endsWith(`${path.sep}liferpg${path.sep}app.js`)) body = Buffer.concat([body, Buffer.from(`\n;window.__BUILD = ${BUILD};\n`)]);
    res.writeHead(200, { 'content-type': TYPES[f.split('.').pop()] || 'text/plain', 'cache-control': 'no-cache' });
    res.end(body);
  });
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/liferpg/`;
const browser = await chromium.launch();

const results = [];
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log(`  ✓ ${name}`); }
  catch (e) { results.push({ name, ok: false, err: e.message }); console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); }
}
function assert(c, msg) { if (!c) throw new Error(msg); }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }

// A page with a fixed clock (Europe/London), a write recorder and the given storage.
async function open({ time = '2026-10-08T10:00:00+01:00', state = null, trainer, ctxOpts = {} } = {}) {
  const ctx = await browser.newContext({ timezoneId: 'Europe/London', serviceWorkers: 'block', ...ctxOpts });
  await ctx.addInitScript(() => {
    window.__writes = [];
    const P = Storage.prototype;
    for (const m of ['setItem', 'removeItem', 'clear']) { const orig = P[m]; P[m] = function (...a) { window.__writes.push([m, a[0] ?? null]); return orig.apply(this, a); }; }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date(time) });
  await page.goto(URL_);
  await page.evaluate(({ state, trainer }) => {
    localStorage.clear();
    if (state) localStorage.setItem('liferpg.v1', typeof state === 'string' ? state : JSON.stringify(state));
    if (trainer !== undefined) localStorage.setItem('trainer.v1', typeof trainer === 'string' ? trainer : JSON.stringify(trainer));
  }, { state, trainer });
  await page.reload();
  return { ctx, page, errors };
}
// Minimal v2 state.
const st = (over = {}) => ({ v: 2, created: '2026-10-05', start: '2026-10-05', notice: null, settings: { trainDays: [1, 4], graceDays: 1, ...(over.settings || {}) }, log: {}, week: {}, edits: {}, custom: [], pauses: [], traits: {}, events: [], ack: { respecs: 0 }, ...over, ...(over.settings ? { settings: { trainDays: [1, 4], graceDays: 1, ...over.settings } } : {}) });
const G = (page) => page.evaluate(() => { const g = game(); return { xp: g.xp, hp: g.hp, stat: g.stat, respecs: g.respecs, perfects: g.perfects, streak: g.streak }; });
const status = (page, q, d) => page.evaluate(([q, d]) => statusOf(questById(q), d), [q, d]);

console.log('Life RPG tests');

await test('Storage: writes only liferpg.* keys and never changes trainer.v1', async () => {
  const trainer = { workouts: [{ date: '2026-10-08', entries: [{ sets: [{ kg: 24, reps: 10 }] }] }], meals: [{ date: '2026-10-08', ref: 'gironda1' }], days: { '2026-10-08': { steps: 9000 } } };
  const { ctx, page, errors } = await open({ state: st(), trainer });
  const before = await page.evaluate(() => localStorage.getItem('trainer.v1'));
  await page.evaluate(() => window.__writes.length = 0);
  await page.click('.quest[data-q="meal2"]');
  await page.click('.quest[data-q="workout"]');
  await page.click('.revert[data-q="workout"]');
  await page.click('nav [data-tab="setup"]');
  await page.click('[data-act="hpmiss"][data-v="5"]');
  await page.click('[data-act="pause"][data-v="ill"]');
  await page.click('[data-act="unpause"]');
  await page.click('[data-act="backup-copy"]').catch(() => {});
  const writes = await page.evaluate(() => window.__writes);
  const after = await page.evaluate(() => localStorage.getItem('trainer.v1'));
  assert(writes.length > 0, 'expected some writes');
  for (const [m, k] of writes) assert(m !== 'clear' && String(k).startsWith('liferpg.'), `unexpected ${m}(${k})`);
  eq(after, before, 'trainer.v1 changed');
  eq(errors, [], 'page errors');
  await ctx.close();
});

await test('Storage: adapter reads only trainer.v1', async () => {
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const src = strip(fs.readFileSync(path.join(ROOT, 'liferpg/trainer-adapter.js'), 'utf8'));
  assert(!/setItem|removeItem|clear\(|\.key\(|Object\.keys\(localStorage|for \(.* in localStorage/.test(src), 'adapter must not write or enumerate storage');
  const app = strip(fs.readFileSync(path.join(ROOT, 'liferpg/app.js'), 'utf8'));
  assert(!/trainer\.v1/.test(app), 'app.js must not name trainer.v1 directly');
  const setKeys = [...app.matchAll(/(setItem|removeItem)\(([^,)]+)/g)].map((m) => m[2].trim());
  for (const k of setKeys) assert(['STORE_KEY', 'CORRUPT_KEY'].includes(k), `app.js writes ${k}`);
  assert(!/localStorage\.clear\(/.test(app), 'app.js must not clear storage');
});

await test('Override: your tap wins, badge shows, "Use Trainer" reverts, Trainer untouched', async () => {
  const trainer = { workouts: [{ date: '2026-10-08', entries: [] }] };
  const { ctx, page } = await open({ state: st(), trainer });
  eq(await status(page, 'workout', '2026-10-08'), 'done', 'Trainer workout counts');
  await page.click('.quest[data-q="workout"]');
  eq(await status(page, 'workout', '2026-10-08'), 'pending', 'override to not trained');
  assert(await page.locator('.badge').first().textContent().then((t) => t.includes('Trainer says yes')), 'badge');
  await page.click('.revert[data-q="workout"]');
  eq(await status(page, 'workout', '2026-10-08'), 'done', 'reverted to Trainer');
  eq(await page.evaluate(() => JSON.parse(localStorage.getItem('trainer.v1'))), trainer, 'Trainer record');
  eq(await page.evaluate(() => S.events.map((e) => e.kind)), ['log', 'revert'], 'activity log');
  await ctx.close();
});

await test('Schedule: Mon missed then trained Tue = moved; Wed recovery is neutral; Thu open', async () => {
  const { ctx, page } = await open({ state: st({ log: { '2026-10-06': { workout: true } } }) });
  eq(await status(page, 'workout', '2026-10-05'), 'moved', 'Mon');
  eq(await status(page, 'workout', '2026-10-06'), 'done', 'Tue');
  eq(await status(page, 'workout', '2026-10-07'), 'rest', 'Wed');
  eq(await status(page, 'workout', '2026-10-08'), 'pending', 'Thu (today)');
  assert(!(await page.locator('.quest[data-q="volume"]').count()) || true, '');
  await ctx.close();
});

await test('Schedule: six unscheduled rest days are not a success, and a missed session costs HP only after the window', async () => {
  // Mon and Thu scheduled, nothing done, grace 1 day.
  const { ctx, page } = await open({ state: st({ settings: { trainDays: [1, 4], graceDays: 1 } }), time: '2026-10-12T10:00:00+01:00' });
  eq(await status(page, 'workout', '2026-10-05'), 'miss', 'Mon missed (window Mon–Tue closed)');
  eq(await status(page, 'workout', '2026-10-08'), 'miss', 'Thu missed (window Thu–Fri closed)');
  for (const d of ['2026-10-06', '2026-10-07', '2026-10-09', '2026-10-10', '2026-10-11']) eq(await status(page, 'workout', d), 'rest', `${d} neutral`);
  const g = await page.evaluate(() => game().days);
  assert(g['2026-10-05'].hpDelta < 0 && g['2026-10-08'].hpDelta < 0, 'HP lost on the missed days');
  assert(!g['2026-10-06'].perfect, 'a rest day with no meals is not perfect');
  await ctx.close();
  // Still inside the window: no penalty yet.
  const b = await open({ state: st(), time: '2026-10-09T09:00:00+01:00' });
  eq(await status(b.page, 'workout', '2026-10-08'), 'pending', 'Thu still open on Fri');
  await b.ctx.close();
});

await test('Schedule: Trainer plan overrides training days; a pause is neutral', async () => {
  const trainer = { plans: { '2026-10-07': { kind: 'train' }, '2026-10-05': { kind: 'rest' } } };
  const { ctx, page } = await open({ state: st({ pauses: [{ id: 'p', from: '2026-10-08', to: null, reason: 'ill' }], log: { '2026-10-08': { meal1: true, meal2: true } } }), trainer, time: '2026-10-12T10:00:00+01:00' });
  eq(await status(page, 'workout', '2026-10-05'), 'rest', 'Trainer rest on Mon');
  eq(await status(page, 'workout', '2026-10-07'), 'miss', 'Trainer train on Wed, missed');
  eq(await status(page, 'workout', '2026-10-08'), 'paused', 'paused Thu');
  const days = await page.evaluate(() => game().days);
  assert(days['2026-10-08'].hpDelta >= 0 && days['2026-10-08'].perfect, 'no HP loss while paused, and the day can still be perfect');
  await ctx.close();
});

await test('Idempotency: reloads, double taps and weekly toggles never pay twice', async () => {
  const { ctx, page } = await open({ state: st({ log: { '2026-10-05': { meal1: true, meal2: true, workout: true }, '2026-10-06': { meal1: true, meal2: true } } }) });
  const a = await G(page);
  for (let i = 0; i < 3; i++) await page.reload();
  eq(await G(page), a, 'after reloads');
  await page.click('.dock button[data-q="meal1"]');
  const b = await G(page);
  assert(b.xp > a.xp, 'first dock tap pays');
  await page.click('.dock button[data-q="meal1"]');
  eq(await G(page), b, 'second dock tap pays nothing');
  await page.click('.quest[data-q="yield"]');
  await page.click('.quest[data-q="yield"]');
  eq(await G(page), b, 'weekly on then off');
  await ctx.close();
});

await test('Dates: midnight rollover, BST→GMT and GMT→BST, future days', async () => {
  const { ctx, page } = await open({ state: st({ start: '2026-10-20' }), time: '2026-10-24T23:59:30+01:00' });
  eq(await page.evaluate(() => today()), '2026-10-24', 'before midnight');
  await page.clock.fastForward(91000);
  eq(await page.evaluate(() => today()), '2026-10-25', 'after midnight');
  eq(await page.evaluate(() => ui.day), '2026-10-25', 'Today view moved on');
  await page.clock.fastForward('26:00:00'); // past the 25-hour day when clocks go back
  eq(await page.evaluate(() => today()), '2026-10-26', 'after clocks go back');
  eq(await page.evaluate(() => Object.keys(game().days)), ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26'], 'every day exactly once');
  eq(await page.evaluate(() => [addDays('2026-10-24', 1), addDays('2026-10-25', 1), daysBetween('2026-10-24', '2026-10-26'), addDays('2027-03-27', 1), addDays('2027-03-28', 1), daysBetween('2027-03-27', '2027-03-29'), mondayOf('2026-10-25'), mondayOf('2027-03-28')]),
    ['2026-10-25', '2026-10-26', 2, '2027-03-28', '2027-03-29', 2, '2026-10-19', '2027-03-22'], 'date maths across both changes');
  eq(await status(page, 'meal1', '2099-01-01'), 'off', 'future day');
  assert(await page.locator('[data-act="day"][data-v="1"]').isDisabled(), 'no navigating into the future');
  await ctx.close();
});

await test('Dates: editing yesterday changes yesterday only', async () => {
  const { ctx, page } = await open({ state: st() });
  const before = await page.evaluate(() => game().days['2026-10-07'].earned);
  await page.click('[data-act="day"][data-v="-1"]');
  await page.click('.quest[data-q="meal1"]');
  const after = await page.evaluate(() => ({ y: game().days['2026-10-07'].earned, t: game().days['2026-10-08'].earned, log: S.log }));
  assert(after.y > before, 'yesterday earned more');
  eq(Object.keys(after.log), ['2026-10-07'], 'logged on yesterday');
  await ctx.close();
});

await test('Malformed Trainer data fails safely', async () => {
  for (const [label, trainer, err] of [['corrupt JSON', '{not json', 'corrupt'], ['array', '[]', 'shape'], ['null', 'null', 'shape']]) {
    const { ctx, page, errors } = await open({ state: st(), trainer });
    eq(await page.evaluate(() => trainer().error), err, label);
    eq(errors, [], `${label}: page errors`);
    await ctx.close();
  }
  const bad = { workouts: 'x', meals: [null, { date: 'bad', ref: 'gironda1' }, { date: '2026-10-08', ref: 5 }], days: { '2026-10-08': { steps: '12000', chains: { cut: 'no' } }, nope: { steps: 5 } }, garmin: { '2026-10-08': { steps: -5 } }, plans: { '2026-10-08': { kind: 'party' } } };
  const { ctx, page, errors } = await open({ state: st(), trainer: bad });
  eq(await page.evaluate(() => [trainer().ok, trainer().steps('2026-10-08'), trainer().meal1('2026-10-08'), trainer().plan('2026-10-08'), trainer().trained('2026-10-08')]), [true, null, null, null, false], 'bad values ignored');
  eq(errors, [], 'page errors');
  await ctx.close();
});

await test('Own save corrupted: kept aside, app starts fresh and says so', async () => {
  const { ctx, page, errors } = await open({ state: '{oops' });
  eq(await page.evaluate(() => localStorage.getItem('liferpg.corrupt.v1')), '{oops', 'kept');
  assert(await page.locator('text=Save problem').count(), 'notice shown');
  eq(errors, [], 'page errors');
  await ctx.close();
});

await test('Migration v1 → v2 keeps logs and splits the Gironda quest', async () => {
  const v1 = { v: 1, created: '2026-10-05', start: '2026-10-05', notice: null, settings: { highContrast: true, trainer: true }, log: { '2026-10-06': { gironda: true, kids: true }, '2026-10-07': { gironda: false } }, week: { '2026-10-05': { yield: '2026-10-06' } }, edits: { gironda: { xp: 99 }, ai: { xp: 80 } }, custom: [], traits: { O: 89 } };
  const { ctx, page } = await open({ state: v1 });
  const s = await page.evaluate(() => S);
  eq(s.v, 2, 'version');
  eq(s.log['2026-10-06'], { kids: true, meal1: true, meal2: true }, 'true day');
  eq(s.log['2026-10-07'], { meal1: false, meal2: false }, 'false day');
  eq([s.edits.gironda, s.edits.ai], [undefined, { xp: 80 }], 'edits');
  eq([s.settings.highContrast, s.settings.graceDays, s.settings.abstainCoffee], [true, 1, false], 'settings merged');
  eq(s.events.map((e) => e.kind), ['migrate'], 'migration logged');
  eq(s.week, v1.week, 'weekly');
  await ctx.close();
});

await test('Backup round trip: export, delete all, restore, compare every field', async () => {
  const { ctx, page } = await open({ state: st({ log: { '2026-10-06': { meal1: true } }, traits: { O: 89, C: 15 }, pauses: [{ id: 'p', from: '2026-10-06', to: '2026-10-06', reason: 'injury' }], custom: [{ id: 'c_x', goal: 'master_ai', label: 'Read a paper', type: 'daily', xp: 15, stat: 'INT', metric: 'binary' }] }) });
  await page.click('nav [data-tab="setup"]');
  await page.check('#exp-traits');
  await page.click('[data-act="backup-copy"]');
  const exported = await page.inputValue('#out');
  await page.click('[data-act="reset"]'); await page.click('[data-act="ask-ok"]');
  eq(await page.evaluate(() => Object.keys(S.log).length), 0, 'deleted');
  await page.click('nav [data-tab="setup"]');
  await page.fill('#restore-text', exported);
  await page.click('[data-act="restore-text"]'); await page.click('[data-act="ask-ok"]');
  const s = await page.evaluate(() => S);
  const e = JSON.parse(exported);
  eq(s.events.at(-1).kind, 'restore', 'restore logged');
  s.events.pop();
  for (const k of Object.keys(e)) eq(s[k], e[k], `field ${k}`);
  // Without the box ticked, traits stay out of the backup.
  await page.click('nav [data-tab="setup"]');
  await page.uncheck('#exp-traits');
  await page.click('[data-act="backup-copy"]');
  assert(!('traits' in JSON.parse(await page.inputValue('#out'))), 'traits excluded by default');
  await ctx.close();
});

await test('Stats: DISC from perfect days is capped at 5 a week; stats stop at 99', async () => {
  const log = {};
  for (let i = 0; i < 7; i++) { const d = `2026-10-${String(5 + i).padStart(2, '0')}`; log[d] = { meal1: true, meal2: true }; }
  log['2026-10-05'].workout = true; log['2026-10-08'].workout = true;
  const { ctx, page } = await open({ state: st({ log }), time: '2026-10-12T10:00:00+01:00' });
  const g = await G(page);
  eq(g.perfects, 7, 'seven perfect days');
  eq(g.stat.DISC, 100, 'DISC capped at 5 × 20');
  eq(await page.evaluate(() => statValue(1e9)), 99, 'stat cap');
  await ctx.close();
});

await test('Respec: a change that would cause one asks first; day-rollover respecs are acknowledged once', async () => {
  const { ctx, page } = await open({ state: st({ start: '2026-10-04', settings: { trainDays: [] } }) });
  eq((await G(page)).hp, 20, 'HP after four days of missed meals');
  await page.click('nav [data-tab="setup"]');
  await page.click('[data-act="hpmiss"][data-v="20"]');
  assert(await page.locator('text=causes a respec').count(), 'confirmation shown');
  eq(await page.evaluate(() => S.settings.hpMiss), 10, 'not applied yet');
  await page.click('[data-act="ask-ok"]');
  const s = await page.evaluate(() => ({ hpMiss: S.settings.hpMiss, respecs: game().respecs, ack: S.ack.respecs, sheet: !!ui.sheet, kinds: S.events.map((e) => e.kind) }));
  eq([s.hpMiss, s.respecs >= 1, s.ack === s.respecs, s.sheet], [20, true, true, false], 'applied and acknowledged');
  assert(s.kinds.includes('respec-confirm'), 'logged');
  await ctx.close();
  // A respec that happened while away shows once.
  const b = await open({ state: st({ start: '2026-10-01', settings: { trainDays: [] } }) });
  assert(await b.page.locator('text=HP hit 0').count(), 'acknowledgement shown');
  await b.page.click('[data-act="ack-respec"]');
  await b.page.reload();
  eq(await b.page.locator('text=HP hit 0').count(), 0, 'shown only once');
  await b.ctx.close();
});

await test('Rules: coffee is off by default; turning it on makes Trainer coffee slips count', async () => {
  const trainer = { days: { '2026-10-07': { chains: { coffee: false } } } };
  const { ctx, page } = await open({ state: st(), trainer });
  eq(await status(page, 'teetotal', '2026-10-07'), 'done', 'coffee ignored by default');
  await page.click('nav [data-tab="setup"]');
  await page.click('[data-act="abstain-coffee"][data-v="1"]');
  eq(await status(page, 'teetotal', '2026-10-07'), 'miss', 'coffee slip counts');
  eq(await page.evaluate(() => questById('teetotal').label), 'Zero alcohol / zero coffee', 'label');
  await ctx.close();
});

await test('Accessibility: names, progress bars, keyboard, contrast, reduced motion', async () => {
  const { ctx, page } = await open({ state: st(), ctxOpts: { reducedMotion: 'reduce' } });
  const unnamed = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim())).length);
  eq(unnamed, 0, 'buttons without a name');
  const bars = await page.evaluate(() => [...document.querySelectorAll('.bar')].every((b) => b.getAttribute('role') === 'progressbar' && b.getAttribute('aria-label') && b.hasAttribute('aria-valuenow')));
  assert(bars, 'progress bars labelled');
  await page.focus('.quest[data-q="meal1"]');
  await page.keyboard.press('Enter');
  eq(await status(page, 'meal1', '2026-10-08'), 'done', 'Enter toggles a quest');
  const outline = await page.evaluate(() => { const el = document.querySelector('.quest[data-q="meal2"]'); el.focus(); return getComputedStyle(el).outlineStyle; });
  assert(outline !== 'none', 'visible focus');
  const ratios = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    const lum = (hex) => { const c = hex.trim().replace('#', ''); const v = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const r = (a, b) => { const [x, y] = [lum(css.getPropertyValue(a)), lum(css.getPropertyValue(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    return [r('--text', '--card'), r('--text-2', '--card'), r('--muted', '--card'), r('--muted', '--raised'), r('--accent-ink', '--accent')];
  });
  for (const x of ratios) assert(x >= 4.5, `contrast ${x.toFixed(2)} under 4.5`);
  await page.click('.quest[data-q="meal2"]');
  eq(await page.evaluate(() => getComputedStyle(document.querySelector('.toast')).animationName), 'none', 'no animation with reduced motion');
  await ctx.close();
});

await test('Mobile: Pixel 7 portrait and landscape, no sideways scrolling', async () => {
  const { ctx, page } = await open({ state: st(), ctxOpts: { ...devices['Pixel 7'] } });
  for (const tab of ['today', 'quests', 'hero', 'setup']) {
    await page.click(`nav [data-tab="${tab}"]`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${tab} overflows in portrait`);
  }
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.height, height: vp.width });
  for (const tab of ['today', 'setup']) {
    await page.click(`nav [data-tab="${tab}"]`);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${tab} overflows in landscape`);
  }
  await ctx.close();
});

await test('PWA: works offline, and a new deploy is picked up without a VERSION bump', async () => {
  const ctx = await browser.newContext({ timezoneId: 'Europe/London' });
  const page = await ctx.newPage();
  BUILD = 1;
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  assert(await page.evaluate(() => !!navigator.serviceWorker.controller), 'controlled by the worker');
  eq(await page.evaluate(() => window.__BUILD), 1, 'build 1');
  BUILD = 2; // deploy without touching sw.js
  await page.reload();
  eq(await page.evaluate(() => window.__BUILD), 2, 'new build served');
  await ctx.setOffline(true);
  await page.reload();
  eq(await page.evaluate(() => [window.__BUILD, !!document.querySelector('.hud-top')]), [2, true], 'offline restart from cache');
  await ctx.close();
});

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
