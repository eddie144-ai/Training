// Coach Mike brief and reply parser.
//   node --test gym-fuel/tests/coach.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(dir, '../coach.js'), 'utf8') + '\nglobalThis.__coach = Coach;\n';
const world = { JSON, String, Number, Array, Math };
world.globalThis = world;
vm.createContext(world);
vm.runInContext(src, world, { filename: 'coach.js' });
const Coach = world.__coach;

const sample = {
  style: 'Mentzer HIT', tier: 'intermediate', programme: 'Mentzer A/B',
  rest: '4–7 days between sessions', nextDay: 'Day A · Chest',
  exercises: [
    { name: 'Incline Press', sets: 1, reps: '3–5', last: '60 kg × 5', lastDate: '2026-11-01', due: 'Top of the range last time: add about 10% weight.' },
    { name: 'Pec Deck', sets: 1, reps: '6–10', last: '', lastDate: '', due: '' },
  ],
  otherDays: ['Day B · Legs: Leg Press, Leg Curl'],
  drive: true,
};

test('the brief names the style, the next session, a due lift, and the reply shape', () => {
  const text = Coach.brief(sample);
  assert.match(text, /STYLE: Mentzer HIT \(intermediate\)/);
  assert.match(text, /NEXT DAY: Day A · Chest/);
  assert.match(text, /Incline Press \| 1 set \| 3–5 \| last 60 kg × 5 on 2026-11-01/);
  assert.match(text, /add about 10% weight/);
  assert.match(text, /Pec Deck \| 1 set \| 6–10 \| no weight logged yet/);
  assert.match(text, /Day B · Legs: Leg Press, Leg Curl/);
  assert.match(text, /iron-and-eggs-latest\.json/);
  assert.match(text, /"kind":"coach-mike-programme"/);
});

test('a fenced reply becomes a My workouts programme, and a later JSON wins', () => {
  const reply = `Here you go.\n\`\`\`json\n${JSON.stringify({
    kind: 'coach-mike-programme', name: 'Floor HIT', rest: '4-7',
    days: [
      { name: 'Push', exercises: [{ name: 'Pec Deck', sets: 1, reps: '6-10', ss: true }, { name: 'Incline Press', sets: 1, reps: '3-5' }] },
      { name: 'Legs', weeks: [1, 2, 9], exercises: [{ name: 'Leg Press', sets: 1, reps: '12-20', note: 'Feet high' }] },
    ],
  })}\n\`\`\``;
  const parsed = Coach.programme(`${Coach.brief(sample)}\n${reply}`);
  assert.equal(parsed.ok, true);
  const p = parsed.programme;
  assert.equal(p.family, 'custom');
  assert.equal(p.name, 'Floor HIT');
  assert.equal(p.source, 'Coach Mike');
  assert.equal(JSON.stringify(p.restDays), '[4,7]');
  assert.equal(p.days.length, 2);
  assert.equal(p.days[0].exercises[0].ss, true);
  assert.equal(p.days[0].exercises[1].name, 'Incline Press');
  assert.equal(JSON.stringify(p.days[1].weeks), '[1,2]');
  assert.equal(p.days[1].exercises[0].note, 'Feet high');
});

test('chat without the JSON programme is refused', () => {
  const parsed = Coach.programme('Do pec deck then press, one set each.');
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /isn't a programme/);
});

test('a day with no exercises is dropped, and an empty programme is refused', () => {
  const parsed = Coach.programme(JSON.stringify({
    kind: 'coach-mike-programme', name: 'Empty', days: [{ name: 'Rest', exercises: [] }],
  }));
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /at least one exercise/);
});
