// Per 100 g parsing and scaling for a UK nutrition panel. No browser and no OCR:
//   node --test gym-fuel/tests/label.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'label.js'), 'utf8');
const context = vm.createContext({ console, self: {} });
vm.runInContext(`${source}\nglobalThis.Label = Label;\n`, context);
const { parseLabel, scale100 } = context.Label;

// Asda roast chicken, as printed: per 100 g is the middle column. RI and kJ stay out.
const ASDA = `
NUTRITION
We suggest this product provides
8 servings
Typical Values    Per 100g    RI
Energy kJ    485    8400
Energy kcal    115    2000
Fat    3.6g    70g
of which saturates    0.9g    20g
Carbohydrate    3.0g    260g
of which sugars    <0.5g    90g
Fibre    1.0g
Protein    17g    50g
Salt    1.2g    6g
`;

test('Asda panel: per 100 g kcal, fat, carbs and protein, not the RI or the kJ', () => {
  const per = parseLabel(ASDA);
  assert.equal(per.ok, true);
  assert.deepEqual({ kcal: per.kcal, f: per.f, c: per.c, p: per.p }, { kcal: 115, f: 3.6, c: 3, p: 17 });
});

test('400 g of that panel is 460 kcal, P68, C12, F14.4', () => {
  const scaled = scale100(parseLabel(ASDA), 400);
  const expected = { kcal: 460, p: 68, c: 12, f: 14.4 };
  for (const k of Object.keys(expected)) {
    assert.equal(scaled[k], expected[k], `${k} ${scaled[k]} !== ${expected[k]}`);
  }
});

test('a serving column in front of per 100 g uses the 100 g figure', () => {
  const text = `
Typical values Per serving Per 100g
Energy kcal 230 115
Fat 7.2g 3.6g
Carbohydrate 6.0g 3.0g
Protein 34g 17g
`;
  const per = parseLabel(text);
  assert.deepEqual({ kcal: per.kcal, f: per.f, c: per.c, p: per.p }, { kcal: 115, f: 3.6, c: 3, p: 17 });
});

test('numbers on the next line, comma decimals, and a kcal row that is really the reference intake', () => {
  const text = `
Energy kJ
485 8400
Energy keal
115 2000
Fat
3,6g 70g
of which saturates 0.9g
Carbohydrate
3,0g 260g
Protein
17g
`;
  const swapped = parseLabel('Energy kcal 2000 115\nFat 3.6g\nCarbohydrate 3.0g\nProtein 17g');
  assert.equal(swapped.kcal, 115);
  const per = parseLabel(text);
  assert.deepEqual({ kcal: per.kcal, f: per.f, c: per.c, p: per.p }, { kcal: 115, f: 3.6, c: 3, p: 17 });
});

test('a photographed pack: ingredient text on the same line is not the per 100 g column, and "kel" still means kcal', () => {
  const text = `
Energy kJ 435 | 0
rotective atmosphere. Energy kel 115 | 2000
Fat 3.60] 70
of which saturates 09g | 20g
Carbohydrate 3.09 | 260
of which sugars <0.59 | 90
Fibre 1.00
fo one 01 our stores. Protein 17g | 50
em salt 129
`;
  const per = parseLabel(text);
  assert.equal(per.ok, true);
  assert.equal(per.kcal, 115);
  assert.equal(per.f, 3.6);
  assert.equal(per.p, 17);
  assert.equal(per.c, 3.1);
});

test('a panel with no calories does not pretend it was read, and scaling refuses a blank amount', () => {
  const per = parseLabel('Fat 3.6g\nSalt 1.2g\nof which saturates 0.9g');
  assert.equal(per.ok, false);
  assert.equal(per.kcal, null);
  assert.equal(per.f, 3.6);
  assert.equal(scale100(parseLabel(ASDA), 0), null);
  assert.equal(scale100(null, 400), null);
});
