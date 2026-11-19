// Garmin screen reading. No browser:
//   node --test gym-fuel/tests/garmin.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({});
vm.runInContext(`${fs.readFileSync(path.join(root, 'garmin.js'), 'utf8')}\nglobalThis.Garmin = Garmin;\n`, context);
const G = context.Garmin;

test('a Connect-style screen fills the numbers that are actually written', () => {
  const g = G.parseGarmin(`Steps
8,432 steps
Sleep 7h 12m
HRV 48 ms
Resting HR 52
Body Battery 76
Stress 28
Calories 2,450
Intensity minutes 42`);
  assert.equal(g.steps, 8432);
  assert.equal(g.sleepMin, 7 * 60 + 12);
  assert.equal(g.hrv, 48);
  assert.equal(g.rhr, 52);
  assert.equal(g.battery, 76);
  assert.equal(g.stress, 28);
  assert.equal(g.kcal, 2450);
  assert.equal(g.intensity, 42);
  assert.equal(G.fmtSleep(g.sleepMin), '7h 12m');
});

test('missing words stay empty, and a blank day is dropped', () => {
  const g = G.parseGarmin('Just a photo of the kitchen');
  assert.equal(g.steps, null);
  assert.equal(g.sleepMin, null);
  assert.equal(g.found.length, 0);
  assert.equal(G.cleanDay({ date: '2026-11-19' }), null);
  const kept = G.cleanDay({ date: '2026-11-19', steps: 1000, photoId: 'gm-1' });
  assert.equal(kept.steps, 1000);
  assert.equal(kept.hrv, null);
  const days = G.cleanDays([
    { date: '2026-11-18', steps: 1, at: '2026-11-18T10:00:00.000Z' },
    { date: '2026-11-18', steps: 9, at: '2026-11-18T22:00:00.000Z' },
    { date: 'nope', steps: 5 },
  ]);
  assert.equal(days.length, 1);
  assert.equal(days[0].steps, 9);
});

test('the reminder copy does not promise a wake-up after the app is closed', () => {
  assert.match(G.REMINDER, /cannot wake the phone/);
  assert.match(G.REMINDER, /while this page is still open/);
});
