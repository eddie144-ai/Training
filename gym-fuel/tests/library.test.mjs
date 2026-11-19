// Search, the Iron & Eggs pack, joint tags, plates, gyms and machine-label matching.
//   node --test gym-fuel/tests/library.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = vm.createContext({});
vm.runInContext(`${fs.readFileSync(path.join(root, 'library.js'), 'utf8')}\nglobalThis.Library = Library;\n`, context);
const L = context.Library;
const db = JSON.parse(fs.readFileSync(path.join(root, 'exercises.json'), 'utf8'));

function catalog() {
  const items = db.items.map(([id, name, level, equipment, primary, secondary, category, mechanic, steps, images]) =>
    L.prepare({ id, name, level, equipment, primary, secondary, category, mechanic, steps, images, source: 'free' }));
  for (const p of L.PACK) items.push(L.prepare({ ...p, joints: { ...p.joints }, also: [...(p.also || [])] }));
  return items;
}
const items = catalog();
const top = (q) => L.search(items, q, {}).slice(0, 5).map((x) => x.name);

test('the pack is original, small, and covers the machines and rehab moves', () => {
  assert.ok(L.PACK.length >= 60 && L.PACK.length <= 80, `pack size ${L.PACK.length}`);
  const names = new Set(L.PACK.map((p) => p.name));
  for (const name of ['Pendulum squat', 'Belt squat', 'Bulgarian split squat', 'Chest-supported row', 'Machine seated row', 'Pec deck', 'Bayesian curl', 'Bird dog', 'McGill curl-up', 'Copenhagen plank', 'Nordic hamstring curl', 'Wall sit', 'Incline treadmill walk']) {
    assert.ok(names.has(name), name);
  }
  const raw = fs.readFileSync(path.join(root, 'library.js'), 'utf8');
  assert.equal(/wger|exercisedb|ascendapi/i.test(raw), false);
  const bytes = Buffer.byteLength(JSON.stringify(L.PACK));
  assert.ok(bytes < 40000, `pack json ${bytes}`);
});

test('search is typo-tolerant and understands gym shorthand', () => {
  assert.equal(top('rdl')[0], 'Romanian Deadlift');
  assert.ok(top('ohp').includes('Standing Military Press') || top('ohp').includes('Dumbbell Shoulder Press'));
  assert.equal(top('pec deck')[0], 'Pec deck');
  assert.ok(top('pec deck').includes('Butterfly'));
  assert.equal(top('chest supported row')[0], 'Chest-supported row');
  assert.equal(top('incline dumbbell pr')[0], 'Incline Dumbbell Press');
  assert.equal(top('romanian deadlfit')[0], 'Romanian Deadlift');
  assert.equal(top('bayesian')[0], 'Bayesian curl');
  assert.equal(top('hex bar')[0], 'Trap-bar deadlift');
  assert.equal(top('bird dog')[0], 'Bird dog');
});

test('joint tags are guidance, and chin does not match inside machine', () => {
  const tag = (name) => items.find((x) => x.name === name).joints;
  assert.equal(tag('Barbell Deadlift').back, 'avoid');
  assert.equal(tag('Chin-Up').bicep, 'avoid');
  assert.equal(tag('Preacher Curl').bicep, 'avoid');
  assert.equal(tag('Ab Crunch Machine').bicep, 'ok');
  assert.equal(tag('Smith Machine Squat').bicep, 'ok');
  assert.equal(tag('Incline Dumbbell Press').back, 'ok');
  assert.equal(L.PACK.find((p) => p.name === 'Bird dog').joints.back, 'ok');
  assert.equal(L.PACK.find((p) => p.name === 'Bulgarian split squat').joints.hip, 'avoid');
  const kind = L.search(items, 'curl', { kind: true });
  assert.equal(kind.some((x) => x.name === 'Preacher Curl'), false);
  assert.ok(kind.some((x) => x.name === 'Hammer Curls' || x.name === 'Cable hammer curl'));
  assert.match(L.GUIDANCE, /not medical advice/);
});

test('plates use the bar and the plates he has, per side', () => {
  const uk = [25, 20, 15, 10, 5, 2.5, 1.25];
  const sixty = L.plates(60, 20, uk);
  assert.equal(sixty.ok, true);
  assert.equal(sixty.eachSide, 20);
  assert.match(sixty.text, /Each side: 20/);
  const heavy = L.plates(82.5, 20, uk);
  assert.equal(heavy.ok, true);
  assert.equal(heavy.eachSide, 31.25);
  const odd = L.plates(61, 20, uk);
  assert.equal(odd.ok, false);
  assert.match(odd.text, /60 kg/);
  assert.match(L.plates(15, 20, uk).reason, /lighter than the bar/);
});

test('a gym plan keeps the split and swaps what the gym lacks or what is tagged avoid', () => {
  const gym = { id: 'puregym-shiprow', name: 'PureGym Aberdeen Shiprow', gear: ['dumbbell', 'machine', 'body only', 'cable'], machines: [], typical: true };
  const dead = items.find((x) => x.name === 'Barbell Deadlift');
  const curl = items.find((x) => x.name === 'Hammer Curls');
  const plan = L.fitPlan([
    { name: 'Barbell Deadlift', item: dead, swaps: [{ name: 'Chest-supported row', libId: 'ie-chest-supported-row' }] },
    { name: 'Hammer Curls', item: curl, swaps: [] },
  ], gym, items);
  assert.equal(plan[0].action, 'swap');
  assert.equal(plan[0].replacement.id, 'ie-chest-supported-row');
  assert.equal(plan[1].action, 'keep');
  const seeds = L.seedGyms();
  assert.equal(JSON.stringify(seeds.map((g) => g.name)), JSON.stringify([
    'PureGym Aberdeen Shiprow',
    'PureGym Aberdeen Kittybrewster',
    'David Lloyd Aberdeen',
    "Bannatyne's Aberdeen",
    'Aberdeen Sports Village',
  ]));
  assert.equal(seeds.every((g) => g.typical && g.machines.length === 0), true);
  assert.equal(L.TYPICAL_NOTE, 'Typical, please confirm');
  const kept = L.ensureGyms([{ id: 'puregym-shiprow', name: 'PureGym Aberdeen Shiprow', gear: ['dumbbell'], machines: ['ie-pec-deck'], typical: false }]);
  assert.equal(kept.find((g) => g.id === 'puregym-shiprow').typical, false);
  assert.equal(JSON.stringify(kept.find((g) => g.id === 'puregym-shiprow').gear), '["dumbbell"]');
  assert.equal(kept.length, 5);
});

test('a machine photo is matched from words, and custom exercises round-trip', () => {
  const found = L.matchMachineText('MATRIX\nPEC DECK\n', items);
  assert.equal(found.matches[0].name, 'Pec deck');
  assert.equal(L.matchMachineText('Life Fitness', items).matches.length, 0);
  const guess = L.guess('Cable hammer curl');
  assert.equal(guess.equipment, 'cable');
  assert.equal(guess.primary, 'biceps');
  assert.equal(guess.joints.bicep, 'ok');
  const custom = L.cleanCustom({ id: 'cx-1', name: 'Tuesday belt squat', equipment: 'machine', primary: ['quadriceps'], joints: { back: 'ok', hip: 'caution', knee: 'caution', bicep: 'ok' }, photoId: 'mx-1' });
  assert.equal(custom.name, 'Tuesday belt squat');
  assert.equal(custom.photoId, 'mx-1');
  assert.equal(L.cleanCustom({ name: '' }), null);
  assert.equal(JSON.stringify(L.cleanAliases({ 'High Bar Squat': 'barbell squat', loop: 'loop' })), JSON.stringify({ 'high bar squat': 'barbell squat' }));
  const old = L.ensureGyms(undefined);
  assert.equal(old.length, 5);
  assert.equal(JSON.stringify(L.cleanPhotos({ 'ie-pec-deck': 'mx-9', bad: 4 })), JSON.stringify({ 'ie-pec-deck': 'mx-9' }));
});

test('the picture cache is separate from the versioned app cache', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(sw, /const VERSION = 'gymfuel-v1\.25'/);
  assert.match(sw, /gymfuel-pics/);
  assert.match(sw, /startsWith\('gymfuel-v'\)/);
  assert.match(sw, /\.\/library\.js/);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<script src="library\.js"><\/script>/);
});
