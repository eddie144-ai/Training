// Milestones, weekly report, strength records, swaps and catch-up. No browser:
//   node --test gym-fuel/tests/cut.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'cut.js'), 'utf8');
const context = vm.createContext({ console });
vm.runInContext(`${source}\nglobalThis.Cut = Cut;\n`, context);
const C = context.Cut;

test('milestones run from 104.8 kg on 1 Nov 2026 down to 75, with a badge every 5 kg', () => {
  const blank = C.milestones([], {});
  assert.equal(blank.start, 104.8);
  assert.equal(blank.startDate, '2026-11-01');
  assert.equal(blank.target, 75);
  assert.equal(blank.lost, null);
  assert.equal(JSON.stringify(blank.earned), '[]');
  const m = C.milestones([{ date: '2026-11-10', kg: 101 }, { date: '2026-11-11', kg: 99 }], { startWeight: 104.8, target: 75, cutStart: '2026-11-01' });
  assert.equal(m.lost, 5.8);
  assert.equal(m.toGo, 24);
  assert.equal(Math.round(m.pct * 100), 19);
  assert.equal(JSON.stringify(m.earned), '[100]');
  assert.equal(m.badges.find((b) => b.kg === 95).earned, false);
  assert.equal(JSON.stringify(C.newBadges(m.earned, [])), '[100]');
  assert.equal(JSON.stringify(C.newBadges(m.earned, [100])), '[]');
  assert.equal(C.cutDay('2026-11-01', '2026-11-01'), 1);
  assert.equal(C.cutDay('2026-11-11', '2026-11-01'), 11);
  assert.equal(C.weightOn([{ date: '2026-11-01', kg: 104.8 }, { date: '2026-11-11', kg: 98.5 }], '2026-11-10'), 104.8);
});

test('the weekly report is Monday to Sunday, and this week is offered on Sunday', () => {
  const wed = C.weeksFor('2026-11-11', '2026-11-01');
  assert.equal(wed[0].current, false);
  assert.equal(wed[0].sunday, '2026-11-08');
  const sun = C.weeksFor('2026-11-15', '2026-11-01');
  assert.equal(sun[0].current, true);
  assert.equal(sun[0].monday, '2026-11-09');
  const rep = C.weeklyReport({
    settings: { proteinGoal: 170 },
    weights: [{ date: '2026-11-05', kg: 100 }, { date: '2026-11-12', kg: 99 }, { date: '2026-11-14', kg: 98 }],
    workouts: [{ date: '2026-11-10', sec: 3600 }, { date: '2026-11-12', sec: 1800 }, { date: '2026-11-03', sec: 999 }],
    meals: [
      { date: '2026-11-10', kcal: 1900, p: 180, c: 40, f: 10, servings: 1 },
      { date: '2026-11-11', kcal: 1700, p: 100, c: 20, f: 10, servings: 1 },
    ],
    chains: [{ name: 'No coffee', since: '2026-11-02' }],
  }, '2026-11-09');
  assert.equal(rep.avgWeight, 98.5);
  assert.equal(rep.weightChange, -1.5);
  assert.equal(rep.sessions, 2);
  assert.equal(rep.sessionTarget, 4);
  assert.equal(rep.proteinDays, 1);
  assert.equal(rep.avgKcal, 1800);
  assert.equal(rep.avgCarbs, 30);
  assert.equal(rep.chains[0].day, 14);
  assert.equal(C.fmtDuration(5400), '1 h 30 min');
});

test('a set is a record when it is heavier, has more reps at that weight, or a higher Epley 1RM', () => {
  const prior = [{ kg: 80, reps: 5 }];
  assert.equal(JSON.stringify([...C.prFlags({ kg: 90, reps: 5 }, prior)].sort()), '["e1rm","weight"]');
  assert.equal(JSON.stringify(C.prFlags({ kg: 80, reps: 8 }, prior)), '["reps","e1rm"]');
  assert.equal(JSON.stringify(C.prFlags({ kg: 70, reps: 12 }, prior)), '["e1rm"]');
  assert.equal(JSON.stringify(C.prFlags({ kg: 80, reps: 5 }, prior)), '[]');
  assert.equal(JSON.stringify(C.prFlags({ kg: 100, reps: 5 }, [])), '[]');
  const list = C.personalRecords([{ date: '2026-11-10', entries: [{ name: 'Barbell Squat', sets: [{ kg: 80, reps: 5 }, { kg: 70, reps: 12 }] }] }]);
  assert.equal(list.length, 1);
  assert.equal(list[0].bestKg, 80);
  assert.equal(list[0].bestKgReps, 5);
  assert.ok(list[0].bestE1 > 80 * (1 + 5 / 30));
});

test('swaps stay on the curated list and tell him to follow his physio plan', () => {
  const dead = C.swapsFor('Barbell Deadlift');
  assert.ok(dead.some((s) => s.name === 'Chest-supported row' && s.area === 'Lower back'));
  assert.ok(C.swapsFor('Romanian Deadlift').some((s) => s.name === 'Hip thrust'));
  assert.equal(C.swapsFor('Romanian Deadlift').some((s) => s.name === 'Chest-supported row'), false);
  assert.ok(C.swapsFor('Barbell Squat').some((s) => s.name === 'Box squat'));
  assert.ok(C.swapsFor('Leg Press').some((s) => /short range/.test(s.name)));
  assert.ok(C.swapsFor('Spider Curls').every((s) => s.area === 'Left biceps'));
  assert.equal(C.swapsFor('Cross Body Hammer Curls').length, 0);
  assert.equal(C.swapsFor('Lying Tricep Zottman Curls').length, 0);
  assert.match(C.PHYSIO, /not medical advice/);
  assert.match(C.PHYSIO, /physio plan/);
  assert.equal(JSON.stringify(C.swapsFor('Barbell Deadlift')).toLowerCase().includes('diagnos'), false);
});

test('yesterday needs a catch-up only for the weigh-in or the food that is missing', () => {
  assert.equal(JSON.stringify(C.catchUp('2026-11-10', [], [])), JSON.stringify({ date: '2026-11-10', needWeight: true, needFood: true, show: true }));
  assert.equal(C.catchUp('2026-11-10', [{ date: '2026-11-10', kg: 99 }], [{ date: '2026-11-10' }]).show, false);
  assert.equal(C.catchUp('2026-11-10', [{ date: '2026-11-10', kg: 99 }], []).needFood, true);
  const photo = C.cleanPhoto({ id: 'p1', date: '2026-11-11', pose: 'front', at: '2026-11-11T12:00:00.000Z', blob: 'PIXELS' });
  assert.equal(JSON.stringify(photo).includes('PIXELS'), false);
  assert.equal(photo.pose, 'front');
  assert.equal(C.cleanPhoto({ id: 'x', date: '2026-11-11', pose: 'meal' }), null);
});

test('the cache is v1.23 and the new script is on the page', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(sw, /gymfuel-v1\.23/);
  assert.match(sw, /\.\/cut\.js/);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<script src="cut\.js"><\/script>/);
});
