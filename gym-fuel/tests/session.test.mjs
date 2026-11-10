// Rest timer and tempo. No browser:
//   node --test gym-fuel/tests/session.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'session.js'), 'utf8');
const context = vm.createContext({ console });
vm.runInContext(`${source}\nglobalThis.Session = Session;\n`, context);
const S = context.Session;

test('rest is counted from the end timestamp, not a ticking counter', () => {
  const start = 1_700_000_000_000;
  const end = S.restEndsAt(start, 90);
  assert.equal(end, start + 90_000);
  assert.equal(S.restLeft(end, start), 90);
  assert.equal(S.restLeft(end, start + 30_000), 60);
  assert.equal(S.restLeft(end, start + 89_100), 1);
  assert.equal(S.restLeft(end, end), 0);
  assert.equal(S.restLeft(end, end + 60_000), 0);
  assert.equal(S.restEndsAt(start, 45), start + 90_000, 'anything other than the quick picks stays 90 s');
});

test('the rest alert fires as it ends, and stays quiet if you come back later', () => {
  const end = 5_000;
  assert.equal(S.shouldRestAlert(end, end - 1, false), false);
  assert.equal(S.shouldRestAlert(end, end, false), true);
  assert.equal(S.shouldRestAlert(end, end + 2_500, false), true);
  assert.equal(S.shouldRestAlert(end, end + 2_500, true), false);
  assert.equal(S.shouldRestAlert(end, end + 10_000, false), false);
});

test('the session clock is the time since it started', () => {
  const start = 1_700_000_000_000;
  assert.equal(S.elapsedSec(start, start + 125_000), 125);
  assert.equal(S.elapsedSec(start, start - 5_000), 0);
  assert.equal(S.formatClock(0), '0:00');
  assert.equal(S.formatClock(90), '1:30');
  assert.equal(S.formatClock(125), '2:05');
  assert.equal(S.formatClock(3661), '1:01:01');
});

test('tempo 3-1-1-0 counts lower, hold, lift, and the next rep, skipping a 0 pause', () => {
  assert.equal(JSON.stringify(S.parseTempo('3-1-1-0')), '[3,1,1,0]');
  assert.equal(S.parseTempo('3-1-1'), null);
  assert.equal(S.parseTempo('0-0-0-0'), null);
  const at = (ms) => S.tempoAt('3-1-1-0', ms);
  const start = at(0);
  assert.equal(start.rep, 1);
  assert.equal(start.phase, 'Lower');
  assert.equal(start.left, 3);
  assert.equal(start.index, 0);
  assert.equal(start.cycle, 5);
  assert.equal(at(2900).phase, 'Lower');
  const hold = at(3000);
  assert.equal(hold.phase, 'Hold');
  assert.equal(hold.left, 1);
  assert.equal(hold.index, 1);
  assert.equal(at(4000).phase, 'Lift');
  assert.equal(at(4000).index, 2);
  assert.equal(at(5000).rep, 2);
  assert.equal(at(5000).phase, 'Lower');
  assert.equal(S.tempoMark('3-1-1-0', 0), S.tempoMark('3-1-1-0', 2000));
  assert.notEqual(S.tempoMark('3-1-1-0', 0), S.tempoMark('3-1-1-0', 3000));
  assert.notEqual(S.tempoMark('3-1-1-0', 4000), S.tempoMark('3-1-1-0', 5000));
});

test('a set is logged when weight and reps are both in, and a single only needs the weight', () => {
  assert.equal(S.setReady({ kg: '30', reps: '' }, 'normal'), false);
  assert.equal(S.setReady({ kg: '30', reps: '8' }, 'normal'), true);
  assert.equal(S.setReady({ kg: '20' }, 'singles'), true);
  assert.equal(S.setReady({ kg: '20', hold: '' }, 'hold'), false);
  assert.equal(S.setReady({ kg: '20', hold: '12' }, 'hold'), true);
});
