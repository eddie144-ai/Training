// Google Drive auto-backup. Runs without a browser:
//   node --test gym-fuel/tests/drive.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');
const SOURCE = fs.readFileSync(path.join(root, 'drive.js'), 'utf8');
const GSI = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

function historyState(settings = {}, extra = {}) {
  return {
    v: 1,
    settings: { driveAuto: true, ...settings },
    workouts: extra.workouts || [],
    meals: extra.meals || [],
    weights: extra.weights || [1, 2, 3, 4, 5].map((n) => ({ date: `2026-10-0${n}`, kg: 90 + n })),
    measurements: extra.measurements || [],
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function backupFrom(body) {
  const text = String(body);
  const marker = '{"kind":"gym-fuel-backup"';
  const i = text.indexOf(marker);
  assert.ok(i >= 0, 'backup JSON missing from upload');
  const end = text.indexOf('\r\n--', i);
  return JSON.parse(end === -1 ? text.slice(i) : text.slice(i, end));
}

function makeGoogle(bag) {
  return {
    accounts: {
      oauth2: {
        initTokenClient(opts) {
          bag.clients += 1;
          bag.clientOptions = { client_id: opts.client_id, scope: opts.scope };
          return {
            requestAccessToken(req) {
              bag.prompts.push(req && Object.prototype.hasOwnProperty.call(req, 'prompt') ? req.prompt : undefined);
              if (bag.hangAuth) return;
              if (bag.failSilent) {
                opts.error_callback({ type: 'silent_fail', message: 'no session' });
                return;
              }
              bag.tokenN += 1;
              const access_token = `secret-token-${bag.tokenN}`;
              bag.tokens.push(access_token);
              opts.callback({ access_token, expires_in: 3600 });
            },
          };
        },
      },
    },
  };
}

// Loads drive.js in a sandbox with a fake clock's timers, fetch and Google Identity Services.
function boot({ clientId = 'test-client.apps.googleusercontent.com', state = historyState(), onLine = true, debounceMs, backoffBaseMs, clock } = {}) {
  let code = SOURCE;
  const next = code.replace(/const DRIVE_CLIENT_ID = '[^']*';/, `const DRIVE_CLIENT_ID = ${JSON.stringify(clientId)};`);
  if (next === code) throw new Error('DRIVE_CLIENT_ID assignment missing');
  code = next;
  code += '\nglobalThis.__drive = Drive;\n';

  const bag = {
    prompts: [], tokens: [], tokenN: 0, calls: [], scripts: [], storage: [], saves: 0,
    clients: 0, clientOptions: null, failSilent: false, hangAuth: false, fetchImpl: null, day: '2026-11-04',
  };
  const timers = new Map();
  let seq = 1;
  const listeners = {};
  const nav = { onLine };
  const world = {};
  const document = {
    createElement() { return { src: '', async: false, onload: null, onerror: null }; },
    head: {
      appendChild(el) {
        bag.scripts.push(el.src);
        world.google = makeGoogle(bag);
        if (typeof el.onload === 'function') el.onload();
      },
    },
  };
  const localStorage = {
    getItem(k) { bag.storage.push(['getItem', k]); return null; },
    setItem(k, v) { bag.storage.push(['setItem', k, String(v)]); },
    removeItem(k) { bag.storage.push(['removeItem', k]); },
    clear() { bag.storage.push(['clear']); },
    key() { return null; },
    get length() { return 0; },
  };
  let api = null;
  const host = {
    getState: () => state,
    save() { bag.saves += 1; if (api) api.afterSave(); },
    today: () => bag.day,
    onStatus() {},
  };
  if (debounceMs != null) host.debounceMs = debounceMs;
  if (backoffBaseMs != null) host.backoffBaseMs = backoffBaseMs;
  if (clock) host.now = () => clock.t;

  Object.assign(world, {
    console, document, navigator: nav, localStorage,
    setTimeout(fn, ms) { const id = seq++; timers.set(id, { fn, ms: Number(ms) || 0 }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(url, init) {
      const headers = (init && init.headers) || {};
      const call = { url: String(url), method: init && init.method, auth: headers.Authorization || '', body: (init && init.body) || '' };
      bag.calls.push(call);
      if (bag.fetchImpl) return bag.fetchImpl(call);
      const id = call.body.includes('"name":"iron-and-eggs-latest.json"') ? 'latest-1' : `daily-${bag.calls.length}`;
      return jsonResponse({ id });
    },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    removeEventListener() {},
  });
  world.window = world;
  world.globalThis = world;
  world.self = world;
  vm.createContext(world);
  vm.runInContext(code, world, { filename: 'drive.js' });
  api = world.__drive;
  if (!api) throw new Error('Drive did not load');

  async function flush(maxMs) {
    const due = [...timers.entries()].filter(([, t]) => t.ms <= maxMs);
    for (const [id] of due) timers.delete(id);
    for (const [, t] of due) {
      const out = t.fn();
      if (out && typeof out.then === 'function') await out;
    }
  }
  async function goOnline() {
    nav.onLine = true;
    for (const fn of (listeners.online || []).slice()) await fn();
  }

  return { Drive: api, state, bag, nav, host, flush, goOnline, start: () => api.start(host) };
}

function assertTokenStaysOut(box) {
  assert.deepEqual(box.bag.storage, [], 'browser storage was touched');
  assert.equal(JSON.stringify(box.state).includes('secret-token'), false, 'token landed on the app state');
  for (const call of box.bag.calls) assert.equal(String(call.body).includes('secret-token'), false, 'token was written into a Drive file');
}

const SHIPPED_CLIENT_ID = '225800622965-hsm5f4941gmjs9a0f0pvqnrhhoee9hpj.apps.googleusercontent.com';

test('the shipped client id is set, drive.file is the only scope, and auto-save still defaults off', () => {
  assert.match(SOURCE, new RegExp(`const DRIVE_CLIENT_ID = '${SHIPPED_CLIENT_ID}';`));
  assert.match(SOURCE, new RegExp(SCOPE.replace(/[.]/g, '\\.')));
  assert.doesNotMatch(SOURCE, /auth\/drive['"]/);
  assert.match(SOURCE, /https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.doesNotMatch(SOURCE, /localStorage/);
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(app, /driveAuto: false/);
});

test('no upload and no Google script when the client id is empty', async () => {
  const box = boot({ clientId: '' });
  assert.equal(box.Drive.available(), false);
  await box.start();
  assert.equal(await box.Drive.uploadNow(), 'off');
  assert.equal(await box.Drive.enable(), 'unavailable');
  box.state.weights.push({ date: '2026-11-04', kg: 80 });
  box.Drive.afterSave();
  await box.flush(60000);
  assert.equal(box.bag.calls.length, 0);
  assert.equal(box.bag.scripts.length, 0);
  assert.equal(box.bag.prompts.length, 0);
});

test('no upload when the toggle is off', async () => {
  const box = boot({ state: historyState({ driveAuto: false }) });
  await box.start();
  assert.equal(await box.Drive.uploadNow(), 'off');
  box.state.meals.push({ id: 'm1', date: '2026-11-04', name: 'Eggs' });
  box.Drive.afterSave();
  await box.flush(60000);
  assert.equal(box.bag.calls.length, 0);
  assert.equal(box.bag.scripts.length, 0);
  assert.equal(box.Drive.status().enabled, false);
});

test('first upload creates latest and today, later uploads PATCH, and the token never touches storage', async () => {
  const box = boot();
  await box.start();
  assert.equal(await box.Drive.uploadNow(), 'ok');

  assert.deepEqual(box.bag.clientOptions, { client_id: 'test-client.apps.googleusercontent.com', scope: SCOPE });
  assert.deepEqual(box.bag.scripts, [GSI]);
  assert.equal(box.bag.clients, 1);
  assert.deepEqual(box.bag.prompts, ['']);

  const posts = box.bag.calls.filter((c) => c.method === 'POST');
  assert.equal(posts.length, 2);
  assert.ok(posts[0].url.startsWith('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart'));
  assert.match(posts[0].body, /multipart\/related|name":"iron-and-eggs-latest.json/);
  assert.ok(posts[0].body.includes('"name":"iron-and-eggs-latest.json"'));
  assert.ok(posts[1].body.includes('"name":"iron-and-eggs-2026-11-04.json"'));
  assert.match(posts[0].auth, /^Bearer secret-token-1$/);
  const backup = backupFrom(posts[0].body);
  assert.deepEqual(Object.keys(backup).sort(), ['at', 'kind', 'state']);
  assert.equal(backup.kind, 'gym-fuel-backup');
  assert.equal(backup.state.weights.length, 5);
  assert.equal(box.state.settings.driveLatestId, 'latest-1');
  assert.equal(box.state.settings.driveDailyOn, '2026-11-04');
  assert.equal(box.state.settings.lastBackup, '2026-11-04');
  assert.match(box.state.settings.lastDriveUpload, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(box.state.settings.lastDriveCount, 5);
  assert.equal(box.state.settings.drivePending, false);
  assert.equal(box.Drive.status().connected, true);

  const latestId = box.state.settings.driveLatestId;
  const dailyId = box.state.settings.driveDailyId;
  box.state.weights[0].kg = 91;
  assert.equal(await box.Drive.uploadNow(), 'ok');
  const patches = box.bag.calls.slice(posts.length).filter((c) => c.method === 'PATCH');
  assert.equal(patches.length, 2);
  assert.ok(patches.every((c) => c.method === 'PATCH' && c.url.includes('uploadType=media')));
  assert.ok(patches.some((c) => c.url.includes(`/${latestId}?`)));
  assert.ok(patches.some((c) => c.url.includes(`/${dailyId}?`)));
  assert.equal(backupFrom(patches[0].body).state.weights[0].kg, 91);
  assert.equal(box.bag.scripts.length, 1, 'Google script stays loaded');
  assert.equal(box.bag.clients, 1, 'token client is created once');

  box.bag.day = '2026-11-05';
  const before = box.bag.calls.length;
  assert.equal(await box.Drive.uploadNow(), 'ok');
  const next = box.bag.calls.slice(before);
  assert.ok(next.some((c) => c.method === 'PATCH' && c.url.includes(`/${latestId}?`)));
  assert.ok(next.some((c) => c.method === 'POST' && c.body.includes('"name":"iron-and-eggs-2026-11-05.json"')));
  assert.equal(box.state.settings.driveDailyOn, '2026-11-05');
  assert.equal(box.state.settings.lastBackup, '2026-11-05');
  assertTokenStaysOut(box);
});

test('a 404 on update creates the file again and stores the new id', async () => {
  let latestPosts = 0;
  const box = boot();
  box.bag.fetchImpl = (call) => {
    if (call.method === 'PATCH' && call.url.includes('/latest-1')) return new Response('{}', { status: 404 });
    if (call.method === 'POST' && call.body.includes('"name":"iron-and-eggs-latest.json"')) {
      latestPosts += 1;
      return jsonResponse({ id: latestPosts === 1 ? 'latest-1' : 'latest-2' });
    }
    if (call.method === 'POST') return jsonResponse({ id: 'daily-1' });
    return jsonResponse({ id: 'patched' });
  };
  await box.start();
  assert.equal(await box.Drive.uploadNow(), 'ok');
  assert.equal(box.state.settings.driveLatestId, 'latest-1');
  assert.equal(await box.Drive.uploadNow(), 'ok');
  assert.equal(latestPosts, 2);
  assert.equal(box.state.settings.driveLatestId, 'latest-2');
  assert.ok(box.bag.calls.some((c) => c.method === 'PATCH' && c.url.includes('/latest-1')));
  assert.equal(box.state.settings.driveDailyId, 'daily-1');
});

test('offline sets pending, visibility waits, and online retries', async () => {
  const box = boot();
  box.nav.onLine = false;
  await box.start();
  assert.equal(await box.Drive.uploadNow(), 'offline');
  assert.equal(box.bag.calls.length, 0);
  assert.equal(box.bag.scripts.length, 0);
  assert.equal(box.state.settings.drivePending, true);
  assert.equal(box.Drive.status().pending, true);
  assert.equal(await box.Drive.onVisible(), 'offline');
  assert.equal(box.bag.calls.length, 0);

  await box.goOnline();
  assert.ok(box.bag.calls.length >= 2);
  assert.equal(box.state.settings.drivePending, false);
  assert.equal(box.state.settings.lastBackup, '2026-11-04');
  assert.equal(box.Drive.status().error, '');
  assertTokenStaysOut(box);

  const saved = boot({
    state: historyState({ drivePending: true, lastDriveUpload: '2026-11-04T08:00:00.000Z', lastDriveCount: 5 }),
  });
  await saved.start();
  assert.ok(saved.bag.calls.length >= 2, 'opening the app retries a pending upload');
  assert.equal(saved.state.settings.drivePending, false);
});

test('a 401 drops the token and silently re-auths once', async () => {
  const box = boot();
  box.bag.fetchImpl = (call) => {
    if (call.auth.endsWith('secret-token-1')) return new Response('denied', { status: 401 });
    if (call.method === 'POST' && call.body.includes('"name":"iron-and-eggs-latest.json"')) return jsonResponse({ id: 'latest-1' });
    if (call.method === 'POST') return jsonResponse({ id: 'daily-1' });
    return jsonResponse({ id: 'patched' });
  };
  await box.start();
  assert.equal(await box.Drive.uploadNow(), 'ok');
  assert.deepEqual(box.bag.prompts, ['', '']);
  assert.ok(box.bag.calls.some((c) => c.auth.endsWith('secret-token-1')));
  assert.ok(box.bag.calls.some((c) => c.method === 'POST' && c.auth.endsWith('secret-token-2') && c.body.includes('iron-and-eggs-latest.json')));
  assert.equal(box.state.settings.driveLatestId, 'latest-1');
  assert.equal(box.Drive.status().needsReconnect, false);
  assert.equal(box.Drive.status().connected, true);
  assertTokenStaysOut(box);
});

test('a silent sign-in that never answers times out', async () => {
  const box = boot();
  box.bag.hangAuth = true;
  await box.start();
  const pending = box.Drive.uploadNow();
  await new Promise((r) => setImmediate(r));
  await box.flush(11999);
  assert.equal(box.bag.calls.length, 0);
  assert.deepEqual(box.bag.prompts, ['']);
  await box.flush(12000);
  assert.equal(await pending, 'error');
  assert.equal(box.bag.calls.length, 0);
  assert.equal(box.state.settings.drivePending, true);
  assert.equal(box.Drive.status().error, 'auth');
  assert.equal(box.Drive.status().needsReconnect, false);
  assertTokenStaysOut(box);
});

test('two silent failures need a tapped reconnect', async () => {
  const box = boot();
  box.bag.failSilent = true;
  await box.start();
  assert.equal(await box.Drive.uploadNow(), 'error');
  assert.equal(box.Drive.status().needsReconnect, false);
  assert.equal(await box.Drive.uploadNow(), 'error');
  assert.equal(box.Drive.status().needsReconnect, true);
  assert.deepEqual(box.bag.prompts, ['', '']);
  assert.equal(box.bag.calls.length, 0);
  assert.equal(await box.Drive.uploadNow(), 'reconnect');
  assert.equal(box.bag.prompts.length, 2, 'no third silent attempt');
  box.bag.failSilent = false;
  assert.equal(await box.Drive.reconnect(), 'ok');
  assert.equal(box.bag.prompts.at(-1), 'consent');
  assert.ok(box.bag.calls.length >= 2);
  assert.equal(box.Drive.status().needsReconnect, false);
  assertTokenStaysOut(box);
});

test('empty logs and a shrink of more than 30% are not uploaded', async () => {
  const empty = boot({ state: historyState({}, { weights: [], meals: [], workouts: [], measurements: [] }) });
  await empty.start();
  assert.equal(await empty.Drive.uploadNow(), 'empty');
  assert.equal(empty.bag.calls.length, 0);
  assert.equal(empty.bag.scripts.length, 0);

  const short = boot({ state: historyState({}, { weights: [{ date: '2026-11-01', kg: 90 }, { date: '2026-11-02', kg: 89 }] }) });
  await short.start();
  assert.equal(await short.Drive.uploadNow(), 'empty');
  assert.equal(short.bag.calls.length, 0);

  const wiped = boot({
    state: historyState({ lastDriveCount: 10, lastDriveUpload: '2026-11-01T00:00:00.000Z' }, { weights: [] }),
  });
  await wiped.start();
  assert.equal(await wiped.Drive.uploadNow(), 'empty');
  assert.equal(wiped.bag.calls.length, 0);
  assert.equal(wiped.Drive.status().shrink, false);
  assert.equal(wiped.Drive.status().error, 'empty');

  const meas = (n) => Array.from({ length: n }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, waist: 90 }));
  const box = boot({
    state: historyState(
      { lastDriveCount: 10, lastDriveUpload: '2026-11-01T00:00:00.000Z' },
      { weights: [], measurements: meas(7) },
    ),
  });
  await box.start();
  assert.equal(await box.Drive.uploadNow(), 'ok', 'a 30% drop is still uploaded');
  assert.equal(box.state.settings.lastDriveCount, 7);

  box.state.measurements = meas(6);
  box.state.settings.lastDriveCount = 10;
  const calls = box.bag.calls.length;
  assert.equal(await box.Drive.uploadNow(), 'shrink');
  assert.equal(box.bag.calls.length, calls);
  assert.equal(box.Drive.status().shrink, true);
  assert.equal(box.Drive.status().error, 'shrink');
  assert.equal(await box.Drive.confirmShrink(), 'ok');
  assert.ok(box.bag.calls.length > calls);
  assert.equal(box.state.settings.lastDriveCount, 6);
  assert.equal(box.state.settings.driveAllowShrink, undefined);
  assert.equal(box.Drive.status().shrink, false);
  assertTokenStaysOut(box);
});

test('a changed log uploads after the debounce, not before', async () => {
  const box = boot({ debounceMs: 45000 });
  await box.start();
  box.state.weights.push({ date: '2026-11-04', kg: 88 });
  box.Drive.afterSave();
  await box.flush(44999);
  assert.equal(box.bag.calls.length, 0);
  await box.flush(45000);
  assert.ok(box.bag.calls.length >= 2);
  assert.equal(box.state.settings.lastDriveCount, 6);
  assert.equal(box.bag.scripts.length, 1);
});

test('opening the app or coming back uploads only once the last success is over 6 hours old', async () => {
  const clock = { t: Date.parse('2026-11-04T18:00:00.000Z') };
  const fresh = boot({
    clock,
    state: historyState({ lastDriveUpload: new Date(clock.t - 6 * 60 * 60 * 1000).toISOString(), lastDriveCount: 5 }),
  });
  await fresh.start();
  assert.equal(fresh.bag.calls.length, 0, 'exactly 6 hours is not due');
  fresh.state.settings.lastDriveUpload = new Date(clock.t - 6 * 60 * 60 * 1000 - 1).toISOString();
  assert.equal(await fresh.Drive.onVisible(), 'ok');
  assert.ok(fresh.bag.calls.length >= 2);

  const quiet = boot({ clock, state: historyState({ lastDriveUpload: new Date(clock.t - 60 * 60 * 1000).toISOString(), lastDriveCount: 5 }) });
  await quiet.start();
  assert.equal(await quiet.Drive.onVisible(), 'idle');
  assert.equal(quiet.bag.calls.length, 0);
});

test('429 backs off, then the wait doubles, then a later attempt succeeds', async () => {
  const clock = { t: 10_000_000 };
  let failures = 0;
  const box = boot({ clock, backoffBaseMs: 5000, state: historyState({ lastDriveCount: 5 }) });
  box.bag.fetchImpl = (call) => {
    if (failures < 2 && call.method === 'POST') {
      failures += 1;
      return new Response('busy', { status: 429 });
    }
    if (call.method === 'POST' && call.body.includes('"name":"iron-and-eggs-latest.json"')) return jsonResponse({ id: 'latest-1' });
    if (call.method === 'POST') return jsonResponse({ id: 'daily-1' });
    return jsonResponse({ id: 'patched' });
  };
  await box.start();
  assert.equal(await box.Drive.uploadNow(), 'error');
  assert.equal(box.state.settings.drivePending, true);
  assert.equal(failures, 1);
  const afterFirst = box.bag.calls.length;
  clock.t += 4999;
  assert.equal(await box.Drive.onVisible(), 'backoff');
  assert.equal(box.bag.calls.length, afterFirst);
  clock.t += 1;
  assert.equal(await box.Drive.onVisible(), 'error');
  assert.equal(failures, 2);
  const afterSecond = box.bag.calls.length;
  clock.t += 9999;
  assert.equal(await box.Drive.onVisible(), 'backoff');
  assert.equal(box.bag.calls.length, afterSecond);
  clock.t += 1;
  assert.equal(await box.Drive.onVisible(), 'ok');
  assert.equal(box.state.settings.drivePending, false);
  assert.equal(box.state.settings.driveLatestId, 'latest-1');
  assert.equal(box.state.settings.lastDriveCount, 5);
  assert.deepEqual(box.bag.prompts, ['']);
});

test('the page, service worker and settings are wired for Drive', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(sw, /const VERSION = 'gymfuel-v1\.20'/);
  assert.match(sw, /\.\/drive\.js/);
  assert.match(sw, /accounts\.google\.com/);
  assert.match(sw, /www\.googleapis\.com/);
  assert.match(sw, /oauth2\.googleapis\.com/);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<script src="drive\.js"><\/script>/);
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(app, /driveAuto: false/);
  assert.match(app, /Drive\.afterSave\(\)/);
  assert.match(app, /Auto-save to Google Drive/);
  assert.match(app, /Reconnect Drive/);
  assert.match(app, /Upload now/);
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /DRIVE_CLIENT_ID/);
  assert.match(readme, /https:\/\/eddie144-ai\.github\.io/);
  assert.match(readme, /drive\.file/);
});
