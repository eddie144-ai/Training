// Council Coach tests. Runs the real app in Chromium against a local server; the AI APIs are faked.
// Needs Playwright:  npm i playwright   Run from the repo root:  node council/tests/coach.test.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { js: 'text/javascript', html: 'text/html', json: 'application/json', png: 'image/png' };
const server = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (err, body) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[f.split('.').pop()] || 'text/plain' });
    res.end(body);
  });
});
await new Promise((r) => server.listen(0, r));
const URL_ = `http://localhost:${server.address().port}/council/`;
const browser = await chromium.launch();
const results = [];
async function test(name, fn) {
  try { await fn(); results.push(true); console.log(`  ✓ ${name}`); }
  catch (e) { results.push(false); console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

// A fake Claude: streams `reply` as server-sent events and records each request.
function sse(text) {
  const ev = (o) => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`;
  return [ev({ type: 'message_start', message: { id: 'm', model: 'claude-opus-5-5' } }),
    ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
    ...text.match(/.{1,12}/gs).map((t) => ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })),
    ev({ type: 'content_block_stop', index: 0 }), ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' } }), ev({ type: 'message_stop' })].join('');
}
async function open({ keys = {}, replies = [] } = {}) {
  const ctx = await browser.newContext({ timezoneId: 'Europe/London', serviceWorkers: 'block', acceptDownloads: true });
  const calls = [];
  await ctx.route('https://api.anthropic.com/**', (route) => {
    const req = route.request();
    calls.push({ headers: req.headers(), body: JSON.parse(req.postData()) });
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse(replies.shift() || 'OK.') });
  });
  await ctx.route('https://generativelanguage.googleapis.com/**', (route) => {
    calls.push({ gemini: true, url: route.request().url(), body: JSON.parse(route.request().postData()) });
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: replies.shift() || 'Gemini says hi.' }] }, finishReason: 'STOP' }] }) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-10-08T10:00:00+01:00') });
  await page.goto(URL_);
  await page.evaluate((keys) => { localStorage.clear(); for (const [k, v] of Object.entries(keys)) localStorage.setItem(k, v); }, keys);
  await page.reload();
  await page.locator('[data-act="welcome-ok"]').click({ timeout: 2000 }).catch(() => {});
  await page.click('nav [data-v="coach"]');
  return { ctx, page, errors, calls };
}

console.log('Council Coach tests');

await test('Every Council tab and Coach sub-tab renders with no errors', async () => {
  const { ctx, page, errors } = await open();
  for (const t of ['today', 'coach', 'goals', 'council', 'mirror', 'me']) {
    await page.click(`nav [data-v="${t}"]`, { timeout: 3000 }).catch((e) => { throw new Error('tab ' + t + ': ' + e.message.split('\n')[0]); });
    if (t === 'coach') for (const m of ['talk', 'interviews', 'author', 'prompts']) {
      await page.click(`[data-act="co-mode"][data-v="${m}"]`);
      for (const v of ['past', 'faults', 'virtues', 'future']) if (m === 'author') await page.click(`[data-act="au-view"][data-v="${v}"]`);
    }
    const txt = await page.evaluate(() => document.getElementById('view').innerText);
    assert(!/undefined|NaN|\[object/.test(txt), `${t} shows broken text`);
  }
  eq(errors, [], 'page errors');
  await ctx.close();
});

await test('Talk without a key: message saved, Copy for Claude carries the coach brief and the conversation', async () => {
  const { ctx, page, errors, calls } = await open();
  await page.click('[data-act="co-start"][data-v="therapist"]');
  await page.fill('#co-input', 'I keep starting projects and not finishing them.');
  await page.click('[data-act="co-send"]');
  assert(await page.locator('text=No AI key on this phone').count(), 'explains the missing key');
  const t = await page.evaluate(() => chatTranscript(chatById(ui.coach.chatId)));
  assert(t.includes('Mode: THERAPIST') && t.includes('Me: I keep starting projects') && t.includes('His Council data'), 'transcript has brief, mode and message');
  eq(calls.length, 0, 'no network call');
  eq(errors, [], 'errors');
  await ctx.close();
});

await test('Talk with Claude: streams the reply with the right request; ending adds the action to commitments', async () => {
  const { ctx, page, errors, calls } = await open({ keys: { anthropic_api_key: 'sk-ant-test' }, replies: ['What did you finish last, and what was different?', 'You stall at 80%.\nDECISION: Finish one thing.\nACTION: Publish the first video draft\nWHEN: today'] });
  await page.click('[data-act="co-start"][data-v="coach"]');
  await page.fill('#co-input', 'Help me finish the YouTube video.');
  await page.click('[data-act="co-send"]');
  await page.waitForSelector('.msg.assistant >> text=What did you finish last');
  const c = calls[0];
  eq([c.headers['x-api-key'], c.headers['anthropic-dangerous-direct-browser-access'], c.headers['anthropic-version'], c.body.model, c.body.stream, c.body.fallbacks, c.body.thinking.type], ['sk-ant-test', 'true', '2023-06-01', 'claude-opus-5-5', true, 'default', 'adaptive'], 'request');
  assert(c.body.system.includes('Mode: COACH') && c.body.system.includes('Say/Do'), 'system prompt has mode and Council data');
  eq(c.body.messages, [{ role: 'user', content: 'Help me finish the YouTube video.' }], 'messages');
  await page.click('[data-act="co-end"]');
  await page.waitForSelector('text=Session closed');
  eq(calls[1].body.messages.length, 3, 'summary request carries the conversation plus the closing ask');
  await page.click('[data-act="co-commit"]');
  eq(await page.evaluate(() => S.commits.map((x) => x.text)), ['Publish the first video draft'], 'commitment added');
  eq(errors, [], 'errors');
  await ctx.close();
});

await test('Gemini engine works the same way', async () => {
  const { ctx, page, calls } = await open({ keys: { gemini_api_key: 'AIza-test', 'council.provider': 'gemini' }, replies: ['Tell me more.'] });
  await page.click('[data-act="co-start"][data-v="therapist"]');
  await page.fill('#co-input', 'Rough day.');
  await page.click('[data-act="co-send"]');
  await page.waitForSelector('.msg.assistant >> text=Tell me more.');
  assert(calls[0].gemini && calls[0].url.includes('gemini-3.8-flash') && calls[0].body.contents[0].parts[0].text === 'Rough day.', 'Gemini request');
  await ctx.close();
});

await test('Crisis words show UK help straight away', async () => {
  const { ctx, page } = await open();
  await page.click('[data-act="co-start"][data-v="therapist"]');
  await page.fill('#co-input', 'Some days I want to die.');
  await page.click('[data-act="co-send"]');
  assert(await page.locator('[role="alert"] >> text=116 123').count(), 'Samaritans shown');
  await ctx.close();
});

await test('PHQ-9: scored, banded, item 9 shows help, and reflect starts a coach session', async () => {
  const { ctx, page } = await open({ keys: { anthropic_api_key: 'k' }, replies: ['Thanks for doing that.'] });
  await page.click('[data-act="co-mode"][data-v="interviews"]');
  await page.click('[data-act="iv-start"][data-v="phq9"]');
  const picks = [2, 2, 1, 2, 1, 1, 1, 0, 1];
  for (const [i, v] of picks.entries()) {
    await page.click(`[data-act="iv-pick"][data-v="${v}"]`);
    if (i === 8) assert(await page.locator('[role="alert"]').count(), 'help on item 9');
    await page.click('[data-act="iv-next"]');
  }
  assert(await page.locator('text=11 · Moderate').count(), 'score 11, moderate');
  await page.click('[data-act="iv-reflect"]');
  await page.waitForSelector('.msg.assistant >> text=Thanks for doing that.');
  assert(await page.evaluate(() => C().chats[0].messages[0].text.includes('score 11, Moderate')), 'answers sent to the coach');
  await ctx.close();
});

await test('Self-Authoring: import merges faults and analyses, the coach reads them, typing saves', async () => {
  const { ctx, page } = await open();
  const file = path.join(os.tmpdir(), 'sa-test.json');
  fs.writeFileSync(file, JSON.stringify({ kind: 'self-authoring', v: 1, faults: [
    { domain: 'Conscientiousness', text: 'Often procrastinate', analysis: { experience: 'Left the course reading for months.', alternative: 'Twenty minutes a day.', guidelines: 'Put a price on every hour.' } },
    { domain: 'Openness', text: 'Pursue too many activities at the same time', analysis: {} },
  ] }));
  await page.click('[data-act="co-mode"][data-v="author"]');
  await page.setInputFiles('#au-import', file);
  await page.setInputFiles('#au-import', file);
  eq(await page.evaluate(() => [C().author.faults.length, C().author.faults[0].analysis.guidelines]), [2, 'Put a price on every hour.'], 'imported once, analysis kept');
  assert(await page.evaluate(() => coachSystem('therapist').includes('Often procrastinate') && coachSystem('therapist').includes('Put a price on every hour')), 'in the coach brief');
  await page.click('[data-act="au-view"][data-v="future"]');
  await page.fill('textarea[data-co="a:future.oneyear"]', 'Seventy-five kilos and a channel that pays.');
  await page.waitForTimeout(500);
  eq(await page.evaluate(() => JSON.parse(localStorage.getItem('council.v1')).coach.author.future.oneyear), 'Seventy-five kilos and a channel that pays.', 'saved');
  await ctx.close();
});

await test('Prompt library: Run starts a session in the right mode with the prompt', async () => {
  const { ctx, page } = await open();
  await page.click('[data-act="co-mode"][data-v="prompts"]');
  await page.click('text=Council roundtable >> xpath=ancestor::div[1] >> [data-act="pr-run"]');
  eq(await page.evaluate(() => [C().chats[0].mode, C().chats[0].messages[0].text.startsWith('I have a decision')]), ['council', true], 'council session');
  await ctx.close();
});

await test('AI keys never go into the Council backup', async () => {
  const { ctx, page } = await open({ keys: { anthropic_api_key: 'sk-ant-secret' } });
  assert(!(await page.evaluate(() => JSON.stringify(S))).includes('sk-ant-secret'), 'not in state');
  await ctx.close();
});

await browser.close();
server.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
