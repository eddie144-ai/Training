/* Darts (501, double out). From each player's 3-dart average and checkout %:
   1. the number of visits each needs to win a leg (a distribution, not a single figure);
   2. the chance of winning a leg with and without the throw;
   3. the full match score distribution for legs or sets formats, with the throw alternating.
   Markets then come from the score distribution: match winner, handicap, total legs/sets. */

import { modelFromScores, evaluateModel } from '../engine.js';

export const DARTS_DEFAULTS = {
  dartsAtDouble: 2,  // darts thrown at a double in a typical checkout visit
  scoringSdBase: 0.4,
  scoringSdRate: 0.18, // visit-count spread grows with the number of scoring visits
  maxVisits: 40,
};

/**
 * Distribution of visits to win a leg: P[v] for v = 0..maxVisits.
 * A won leg of D darts has average 1503 / D by definition, so mean visits ≈ 501 / average.
 * Visits = scoring visits (to reach a finish, at least 2) + checkout visits (geometric: each visit
 * at a double succeeds with 1 − (1 − checkout)^dartsAtDouble).
 */
export function legVisits({ average, checkout }, opts = {}) {
  const o = { ...DARTS_DEFAULTS, ...opts };
  if (!(average > 20 && average < 130)) throw new RangeError(`3-dart average ${average} is out of range`);
  if (!(checkout > 0.05 && checkout < 0.8)) throw new RangeError(`Checkout ${checkout} must be a fraction, e.g. 0.40`);
  const pCheck = 1 - (1 - checkout) ** o.dartsAtDouble;
  const meanTotal = 501 / average;
  const meanScoring = Math.max(2, meanTotal - 1 / pCheck);
  const sd = o.scoringSdBase + o.scoringSdRate * meanScoring;
  // Scoring visits: a normal discretised onto integers ≥ 2.
  const scoring = new Array(o.maxVisits + 1).fill(0);
  const phi = (x) => Math.exp(-0.5 * ((x - meanScoring) / sd) ** 2);
  let z = 0;
  for (let v = 2; v <= o.maxVisits; v++) { scoring[v] = phi(v); z += scoring[v]; }
  for (let v = 2; v <= o.maxVisits; v++) scoring[v] /= z;
  // Convolve with checkout visits (1, 2, 3 … with geometric chance).
  const dist = new Array(o.maxVisits + 1).fill(0);
  for (let s = 2; s <= o.maxVisits; s++) {
    if (!scoring[s]) continue;
    for (let g = 1; s + g <= o.maxVisits; g++) dist[s + g] += scoring[s] * pCheck * (1 - pCheck) ** (g - 1);
  }
  const total = dist.reduce((a, b) => a + b, 0);
  return dist.map((p) => p / total);
}

/**
 * Leg-win chances for player A: hold = A throws first, break = B throws first.
 * Throwing first, A wins if A needs no more visits than B; throwing second, A needs fewer.
 */
export function legWinProbs(distA, distB) {
  const n = distA.length;
  const geB = new Array(n + 1).fill(0); // P(V_B >= v)
  for (let v = n - 1; v >= 0; v--) geB[v] = geB[v + 1] + distB[v];
  let hold = 0, brk = 0;
  for (let v = 0; v < n; v++) {
    hold += distA[v] * geB[v];
    brk += distA[v] * geB[v + 1];
  }
  return { hold, break: brk };
}

/** Score distribution of a race to `target` with alternating throw. Returns Map 'a-b' → p. */
function race(target, pWinIfAThrows, pWinIfBThrows, aThrowsFirst) {
  const out = new Map();
  let layer = new Map([['0-0', 1]]);
  while (layer.size) {
    const next = new Map();
    for (const [k, p] of layer) {
      const [a, b] = k.split('-').map(Number);
      const aThrows = ((a + b) % 2 === 0) === aThrowsFirst;
      const w = aThrows ? pWinIfAThrows : pWinIfBThrows;
      for (const [na, nb, q] of [[a + 1, b, w], [a, b + 1, 1 - w]]) {
        const key = `${na}-${nb}`;
        const target_ = na === target || nb === target ? out : next;
        target_.set(key, (target_.get(key) ?? 0) + p * q);
      }
    }
    layer = next;
  }
  return out;
}

/**
 * Match score distribution.
 * format: { type: 'legs', target } (first to N legs) or { type: 'sets', target, legsPerSet } (first to
 * N sets, each first to legsPerSet legs; the throw alternates each set and each leg).
 * starter: 'A', 'B' or 'bull' (unknown: 50/50).
 * Returns { pA, scores: [{ h, a, p }], unit }.
 */
export function matchScores({ hold, break: brk }, format, starter = 'bull') {
  const run = (aFirst) => {
    if (format.type === 'legs') return race(format.target, hold, brk, aFirst);
    const legs = format.legsPerSet ?? 3;
    const setIfA = [...race(legs, hold, brk, true)].filter(([k]) => +k.split('-')[0] === legs).reduce((s, [, p]) => s + p, 0);
    const setIfB = [...race(legs, hold, brk, false)].filter(([k]) => +k.split('-')[0] === legs).reduce((s, [, p]) => s + p, 0);
    return race(format.target, setIfA, setIfB, aFirst);
  };
  const dists = starter === 'A' ? [[run(true), 1]] : starter === 'B' ? [[run(false), 1]] : [[run(true), 0.5], [run(false), 0.5]];
  const merged = new Map();
  for (const [d, w] of dists) for (const [k, p] of d) merged.set(k, (merged.get(k) ?? 0) + p * w);
  const scores = [...merged].map(([k, p]) => { const [h, a] = k.split('-').map(Number); return { h, a, p }; });
  const pA = scores.filter((s) => s.h > s.a).reduce((x, s) => x + s.p, 0);
  return { pA, scores, unit: format.type };
}

/** Parses a format string: "legs:6" (first to 6 legs) or "sets:4:3" (first to 4 sets of first to 3 legs). */
export function parseFormat(s) {
  const [type, a, b] = String(s).trim().toLowerCase().split(':');
  const target = Number(a);
  if (!['legs', 'sets'].includes(type) || !(target >= 1)) throw new Error(`Darts format "${s}" should look like legs:6 or sets:4:3`);
  return type === 'legs' ? { type, target } : { type, target, legsPerSet: Number(b) || 3 };
}

/**
 * Full evaluation. A is the home side in the odds feed.
 * prices: { h2h?: {home, away}, spreads?: {line, home, away}, totals?: {line, over, under} } in legs
 * (or sets, for sets formats).
 */
export function evaluateDarts(playerA, playerB, format, prices, opts = {}) {
  const legs = legWinProbs(legVisits(playerA, opts), legVisits(playerB, opts));
  const match = matchScores(legs, format, opts.starter ?? 'bull');
  const { markets } = evaluateModel(modelFromScores(match.scores), prices, { ...opts, drawSplit: 0.5 });
  const top = [...match.scores].sort((x, y) => y.p - x.p).slice(0, 5).map((s) => ({ score: `${s.h}-${s.a}`, prob: s.p }));
  return { legs, pA: match.pA, topScores: top, unit: match.unit, markets };
}

/** Parses the player table: one "Name, average, checkout%" per line. Returns Map(normalised name → stats). */
export function parsePlayers(text) {
  const out = new Map();
  for (const line of String(text || '').split(/\r?\n/)) {
    const [name, avg, co] = line.split(',').map((x) => x?.trim());
    if (!name || !avg || !co) continue;
    const checkout = Number(co.replace('%', '')) / (Number(co.replace('%', '')) > 1 ? 100 : 1);
    if (!Number.isFinite(Number(avg)) || !Number.isFinite(checkout)) continue;
    out.set(name.toLowerCase(), { name, average: Number(avg), checkout });
  }
  return out;
}
