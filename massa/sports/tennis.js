/* Tennis from serve: each player's chance of winning a point on serve gives hold chances,
   tie-breaks, sets and the match (Barnett & Clarke's hierarchical model). The joint games
   distribution prices game handicaps and total games. Assumes a standard tie-break at 6-6 in
   every set, including the last. */

import { evaluateMarket, modelFromScores, evaluateModel } from '../engine.js';

/** P(server holds) when winning each service point with chance p. */
export function holdProb(p) {
  const q = 1 - p;
  return p ** 4 * (1 + 4 * q + 10 * q * q) + 20 * p ** 3 * q ** 3 * (p * p / (1 - 2 * p * q));
}

/** P(A wins a tie-break), A serving first. pa, pb = each player's serve point chance. */
export function tiebreakProb(pa, pb) {
  // Point n (0-based) is served by A when n = 0 or floor((n - 1) / 2) is odd.
  const aServes = (n) => n === 0 || Math.floor((n - 1) / 2) % 2 === 1;
  const memo = new Map();
  const f = (a, b) => {
    if (a >= 7 && a - b >= 2) return 1;
    if (b >= 7 && b - a >= 2) return 0;
    if (a === 6 && b === 6) {
      // From 6-6 every pair of points has one serve each: A must win a pair outright.
      const winPair = pa * (1 - pb), losePair = (1 - pa) * pb;
      return winPair / (winPair + losePair);
    }
    const key = `${a}-${b}`;
    if (memo.has(key)) return memo.get(key);
    const p = aServes(a + b) ? pa : 1 - pb;
    const v = p * f(a + 1, b) + (1 - p) * f(a, b + 1);
    memo.set(key, v);
    return v;
  };
  return f(0, 0);
}

/** Set score distribution [{ a, b, p }], A serving the first game. */
export function setScores(pa, pb, aFirst = true) {
  const ha = holdProb(pa), hb = holdProb(pb);
  const tb = aFirst ? tiebreakProb(pa, pb) : 1 - tiebreakProb(pb, pa);
  const out = [];
  let layer = new Map([['0-0', 1]]);
  while (layer.size) {
    const next = new Map();
    for (const [k, p] of layer) {
      const [a, b] = k.split('-').map(Number);
      if (a === 6 && b === 6) { out.push({ a: 7, b: 6, p: p * tb }, { a: 6, b: 7, p: p * (1 - tb) }); continue; }
      const aServing = ((a + b) % 2 === 0) === aFirst;
      const w = aServing ? ha : 1 - hb;
      for (const [na, nb, q] of [[a + 1, b, w], [a, b + 1, 1 - w]]) {
        const done = (na >= 6 && na - nb >= 2) || (nb >= 6 && nb - na >= 2);
        if (done) out.push({ a: na, b: nb, p: p * q });
        else next.set(`${na}-${nb}`, (next.get(`${na}-${nb}`) ?? 0) + p * q);
      }
    }
    layer = next;
  }
  return out;
}

/**
 * Match: best of 3 or 5. Returns { pA, sets: [{ a, b, p }] (sets score), games: [{ h, a, p }] (games
 * won by each player) }. Who serves first in each set is averaged (it barely matters).
 */
export function matchModel(pa, pb, bestOf = 3) {
  const set = [...setScores(pa, pb, true), ...setScores(pa, pb, false)].map((s) => ({ ...s, p: s.p / 2 }));
  const pSet = set.filter((s) => s.a > s.b).reduce((x, s) => x + s.p, 0);
  const need = Math.ceil(bestOf / 2);
  // State: sets won (sa, sb) → Map of games (ga-gb) → p.
  let layer = new Map([['0-0', new Map([['0-0', 1]])]]);
  const sets = new Map();
  const games = new Map();
  while (layer.size) {
    const next = new Map();
    for (const [sk, gdist] of layer) {
      const [sa, sb] = sk.split('-').map(Number);
      for (const s of set) {
        const nsa = sa + (s.a > s.b ? 1 : 0), nsb = sb + (s.b > s.a ? 1 : 0);
        const nk = `${nsa}-${nsb}`;
        const done = nsa === need || nsb === need;
        const bucket = done ? games : (next.get(nk) ?? next.set(nk, new Map()).get(nk));
        for (const [gk, gp] of gdist) {
          const [ga, gb] = gk.split('-').map(Number);
          const key = `${ga + s.a}-${gb + s.b}`;
          bucket.set(key, (bucket.get(key) ?? 0) + gp * s.p);
          if (done) sets.set(nk, (sets.get(nk) ?? 0) + gp * s.p);
        }
      }
    }
    layer = next;
  }
  const toList = (m, ka, kb) => [...m].map(([k, p]) => { const [x, y] = k.split('-').map(Number); return { [ka]: x, [kb]: y, p }; });
  const setList = toList(sets, 'a', 'b');
  return { pSet, pA: setList.filter((s) => s.a > s.b).reduce((x, s) => x + s.p, 0), sets: setList, games: toList(games, 'h', 'a') };
}

/**
 * Prices: h2h {home, away}; spreads {line, home, away} and totals {line, over, under} in games.
 * A is the home side in the feed. pa/pb are serve point chances (e.g. 0.65).
 */
export function evaluateTennis(pa, pb, bestOf, prices, opts = {}) {
  if (!(pa > 0.3 && pa < 0.9 && pb > 0.3 && pb < 0.9)) throw new RangeError('Serve points won should be fractions like 0.64');
  const m = matchModel(pa, pb, bestOf);
  const markets = [];
  if (prices.h2h) {
    const { home, away, books = {} } = prices.h2h;
    markets.push(evaluateMarket('Match', [
      { selection: 'Home', odds: home, modelProb: m.pA, book: books.home, rule: { kind: 'winner', side: 'home' } },
      { selection: 'Away', odds: away, modelProb: 1 - m.pA, book: books.away, rule: { kind: 'winner', side: 'away' } },
    ], opts));
  }
  const { markets: games } = evaluateModel(modelFromScores(m.games), { spreads: prices.spreads, totals: prices.totals }, opts);
  for (const g of games) g.market = `${g.market} games`;
  markets.push(...games);
  return { pA: m.pA, pSet: m.pSet, sets: m.sets, markets };
}
