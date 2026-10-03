import test from 'node:test';
import assert from 'node:assert/strict';
import {
  poissonPmf, scoreMatrix, matchProbabilities, devig, overround, kellyStake, evaluateMarket,
  evaluateFixture, bestSelection, settleSelection, assertOdds,
} from '../engine.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('Poisson pmf matches the closed form and sums to 1', () => {
  close(poissonPmf(3, 1.4), (1.4 ** 3 * Math.exp(-1.4)) / 6);
  close(Array.from({ length: 40 }, (_, k) => poissonPmf(k, 2.1)).reduce((s, p) => s + p, 0), 1);
});

test('Score matrix sums to 1 and negative rho lifts low-score draws', () => {
  const m = scoreMatrix(1.52, 1.18, -0.13, 10);
  close(m.flat().reduce((s, p) => s + p, 0), 1);
  const dc = matchProbabilities(1.52, 1.18, { rho: -0.13 });
  const indep = matchProbabilities(1.52, 1.18, { rho: 0 });
  assert.ok(dc.draw > indep.draw);
  close(dc.homeWin + dc.draw + dc.awayWin, 1);
  assert.ok(dc.over[2.5] > 0 && dc.over[2.5] < 1);
  assert.ok(dc.over[1.5] > dc.over[2.5]);
});

test('Odds of 1 or less, zero or NaN are rejected', () => {
  for (const bad of [1, 0.5, 0, NaN, Infinity]) assert.throws(() => assertOdds([2, bad]), RangeError);
});

test('Overround and de-vig', () => {
  const odds = [1.5, 4.2, 6.5];
  close(overround(odds), 1 / 1.5 + 1 / 4.2 + 1 / 6.5 - 1);
  for (const method of ['proportional', 'power']) close(devig(odds, method).reduce((s, p) => s + p, 0), 1);
  // Power takes more margin off the longshot than proportional does.
  assert.ok(devig(odds, 'power')[2] < devig(odds, 'proportional')[2]);
});

test('Kelly: quarter Kelly, capped, zero without edge', () => {
  const full = (0.6 * 1.3 - 0.4) / 1.3;
  close(kellyStake(0.6, 2.3, 0.25, 100), full * 0.25);
  close(kellyStake(0.6, 2.3, 0.25, 1), 0.01);
  assert.equal(kellyStake(0.4, 2.3), 0);
});

test('Market evaluation: margin over 8% is rejected even with EV', () => {
  const r = evaluateMarket('1X2', [
    { selection: 'Home', odds: 1.8, modelProb: 0.7 },
    { selection: 'Draw', odds: 3.0, modelProb: 0.2 },
    { selection: 'Away', odds: 4.0, modelProb: 0.1 },
  ]);
  assert.ok(r.marginPct > 8);
  assert.equal(r.confidence, 'REJECT');
  assert.ok(r.evaluations.every((e) => !e.value && e.stakeFraction === 0));
});

test('Market evaluation: value is flagged and a zero probability has no fair odds', () => {
  const r = evaluateMarket('Total 2.5', [
    { selection: 'Over 2.5', odds: 2.1, modelProb: 0.6 },
    { selection: 'Under 2.5', odds: 1.85, modelProb: 0 },
  ]);
  assert.equal(r.confidence, 'HIGH');
  assert.ok(r.evaluations[0].value);
  close(r.evaluations[0].ev, 0.6 * 2.1 - 1);
  assert.equal(r.evaluations[1].modelFairOdds, null);
});

test('Fixture evaluation returns expected goals and one best selection', () => {
  const ev = evaluateFixture({ lambda: 2.2, mu: 0.7 }, {
    h2h: { home: 2.0, draw: 3.8, away: 4.2 },
    totals: { line: 2.5, over: 1.95, under: 1.95 },
  });
  assert.deepEqual(ev.expectedGoals, { home: 2.2, away: 0.7 });
  assert.equal(ev.markets.length, 2);
  const best = bestSelection(ev);
  assert.equal(best.selection, 'Home');
});

test('Settlement', () => {
  assert.equal(settleSelection('Home', 2, 1), 'won');
  assert.equal(settleSelection('Draw', 2, 1), 'lost');
  assert.equal(settleSelection('Away', 0, 1), 'won');
  assert.equal(settleSelection('Over 2.5', 2, 1), 'won');
  assert.equal(settleSelection('Under 2.5', 2, 1), 'lost');
  assert.equal(settleSelection('Over 3', 2, 1), 'void');
  assert.equal(settleSelection('BTTS Yes', 1, 1), 'won');
  assert.equal(settleSelection('BTTS No', 1, 0), 'won');
});
