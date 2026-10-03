/* MASSA engine: Dixon-Coles goal model, de-vig, EV and capped fractional Kelly.
   Pure functions with no DOM or network, so the app and the Node runner share them.
   Probabilities stay unrounded here; round only for display. */

export const DEFAULTS = {
  rho: -0.13,          // Dixon-Coles low-score correlation
  maxGoals: 10,        // score grid is 0..maxGoals for each side
  minEv: 0.02,         // 2% minimum EV to flag value
  maxMarginPct: 8,     // reject markets with a bookmaker margin above this
  kellyFraction: 0.25, // quarter Kelly
  maxStakePct: 1,      // hard cap per bet, % of bankroll (Betting Council v1.1: 0.25–1%)
  devig: 'power',      // 'proportional' or 'power'
};

// ---------------------------------------------------------------------------
// Goal model
// ---------------------------------------------------------------------------

/** Poisson P(k; λ), built iteratively so large k never overflows a factorial. */
export function poissonPmf(k, lambda) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

/** Dixon-Coles adjustment for the four low scores. */
export function dixonColesTau(x, y, lambda, mu, rho) {
  if (x === 0 && y === 0) return 1 - lambda * mu * rho;
  if (x === 1 && y === 0) return 1 + mu * rho;
  if (x === 0 && y === 1) return 1 + lambda * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/** λ (home) and μ (away) expected goals from attack/defence multipliers and league averages. */
export function expectedGoals(home, away, league) {
  const lambda = home.attack * away.defense * league.avgHomeGoals;
  const mu = away.attack * home.defense * league.avgAwayGoals;
  return { lambda: Math.max(0.01, lambda), mu: Math.max(0.01, mu) };
}

/** Score matrix m[x][y] = P(home x, away y), renormalised to sum to 1. */
export function scoreMatrix(lambda, mu, rho = DEFAULTS.rho, maxGoals = DEFAULTS.maxGoals) {
  const ph = Array.from({ length: maxGoals + 1 }, (_, k) => poissonPmf(k, lambda));
  const pa = Array.from({ length: maxGoals + 1 }, (_, k) => poissonPmf(k, mu));
  const m = ph.map((h, x) => pa.map((a, y) => Math.max(0, h * a * dixonColesTau(x, y, lambda, mu, rho))));
  const total = m.flat().reduce((s, p) => s + p, 0);
  return m.map((row) => row.map((p) => p / total));
}

/** Market probabilities from a score matrix. Totals cover lines 0.5 to 6.5. */
export function matchProbabilities(lambda, mu, { rho = DEFAULTS.rho, maxGoals = DEFAULTS.maxGoals } = {}) {
  const m = scoreMatrix(lambda, mu, rho, maxGoals);
  let homeWin = 0, draw = 0, awayWin = 0, btts = 0;
  const totalGoals = new Array(2 * maxGoals + 1).fill(0);
  const scores = [];
  m.forEach((row, x) => row.forEach((p, y) => {
    if (x > y) homeWin += p; else if (x === y) draw += p; else awayWin += p;
    if (x > 0 && y > 0) btts += p;
    totalGoals[x + y] += p;
    scores.push({ score: `${x}-${y}`, prob: p });
  }));
  const over = {};
  for (let line = 0.5; line <= 6.5; line += 1) {
    over[line] = totalGoals.reduce((s, p, n) => (n > line ? s + p : s), 0);
  }
  scores.sort((a, b) => b.prob - a.prob);
  return {
    expectedGoals: { home: lambda, away: mu },
    homeWin, draw, awayWin, btts, over,
    topScores: scores.slice(0, 5),
    matrix: m,
  };
}

// ---------------------------------------------------------------------------
// Market maths
// ---------------------------------------------------------------------------

/** Throws on odds that would corrupt overround or Kelly (≤ 1, NaN, Infinity). */
export function assertOdds(odds) {
  for (const o of odds) {
    if (!Number.isFinite(o) || o <= 1) throw new RangeError(`Invalid decimal odds: ${o}`);
  }
}

/** Overround as a fraction: Σ(1/o) − 1. */
export function overround(odds) {
  assertOdds(odds);
  return odds.reduce((s, o) => s + 1 / o, 0) - 1;
}

/** Fair probabilities with the margin removed.
    'proportional' scales 1/o evenly. 'power' solves Σ(1/o)^k = 1, which takes more margin off
    longshots and so partly corrects favourite-longshot bias. */
export function devig(odds, method = DEFAULTS.devig) {
  assertOdds(odds);
  const implied = odds.map((o) => 1 / o);
  const sum = implied.reduce((s, p) => s + p, 0);
  if (method !== 'power' || sum <= 1) return implied.map((p) => p / sum);
  let lo = 1, hi = 10;
  for (let i = 0; i < 100; i++) {
    const k = (lo + hi) / 2;
    const s = implied.reduce((acc, p) => acc + p ** k, 0);
    if (s > 1) lo = k; else hi = k;
  }
  const k = (lo + hi) / 2;
  const fair = implied.map((p) => p ** k);
  const fs = fair.reduce((s, p) => s + p, 0);
  return fair.map((p) => p / fs);
}

/** EV per unit staked: p·o − 1. */
export const expectedValue = (p, odds) => p * odds - 1;

/** Fractional Kelly as a fraction of bankroll, capped. Zero when there's no edge. */
export function kellyStake(p, odds, fraction = DEFAULTS.kellyFraction, capPct = DEFAULTS.maxStakePct) {
  assertOdds([odds]);
  const b = odds - 1;
  const full = (p * b - (1 - p)) / b;
  if (!(full > 0)) return 0;
  return Math.min(full * fraction, capPct / 100);
}

/**
 * Evaluates one market of mutually exclusive outcomes (1X2, Over/Under, BTTS Yes/No).
 * outcomes: [{ selection, odds, modelProb, book? }]
 */
export function evaluateMarket(market, outcomes, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const odds = outcomes.map((x) => x.odds);
  const marginPct = overround(odds) * 100;
  const fair = devig(odds, o.devig);
  const marginOk = marginPct <= o.maxMarginPct;
  const evaluations = outcomes.map((x, i) => {
    const ev = expectedValue(x.modelProb, x.odds);
    const value = marginOk && ev >= o.minEv;
    return {
      market,
      selection: x.selection,
      book: x.book ?? null,
      odds: x.odds,
      impliedProb: 1 / x.odds,
      fairProb: fair[i],
      modelProb: x.modelProb,
      modelFairOdds: x.modelProb > 0 ? 1 / x.modelProb : null,
      edge: x.modelProb - fair[i],
      ev,
      stakeFraction: value ? kellyStake(x.modelProb, x.odds, o.kellyFraction, o.maxStakePct) : 0,
      value,
    };
  });
  const hasValue = evaluations.some((e) => e.value);
  let confidence = 'REJECT';
  if (hasValue) confidence = marginPct < 5 ? 'HIGH' : 'MEDIUM';
  const reason = !marginOk ? `Margin ${marginPct.toFixed(1)}% is over ${o.maxMarginPct}%`
    : !hasValue ? `No outcome reaches ${(o.minEv * 100).toFixed(0)}% EV` : null;
  return { market, marginPct, confidence, reason, evaluations };
}

/**
 * Evaluates every priced market for one fixture.
 * prices: { h2h?: {home, draw, away, books?}, totals?: {line, over, under, books?}, btts?: {yes, no, books?} }
 * books (optional) names the bookmaker behind each price, keyed like the prices.
 */
export function evaluateFixture({ lambda, mu }, prices, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const probs = matchProbabilities(lambda, mu, o);
  const markets = [];
  if (prices.h2h) {
    const { home, draw, away, books = {} } = prices.h2h;
    markets.push(evaluateMarket('1X2', [
      { selection: 'Home', odds: home, modelProb: probs.homeWin, book: books.home },
      { selection: 'Draw', odds: draw, modelProb: probs.draw, book: books.draw },
      { selection: 'Away', odds: away, modelProb: probs.awayWin, book: books.away },
    ], o));
  }
  if (prices.totals && probs.over[prices.totals.line] != null) {
    const { line, over, under, books = {} } = prices.totals;
    const pOver = probs.over[line];
    markets.push(evaluateMarket(`Total ${line}`, [
      { selection: `Over ${line}`, odds: over, modelProb: pOver, book: books.over },
      { selection: `Under ${line}`, odds: under, modelProb: 1 - pOver, book: books.under },
    ], o));
  }
  if (prices.btts) {
    const { yes, no, books = {} } = prices.btts;
    markets.push(evaluateMarket('BTTS', [
      { selection: 'BTTS Yes', odds: yes, modelProb: probs.btts, book: books.yes },
      { selection: 'BTTS No', odds: no, modelProb: 1 - probs.btts, book: books.no },
    ], o));
  }
  return { expectedGoals: probs.expectedGoals, probabilities: probs, markets };
}

/** The single best value selection in a fixture (one bet per fixture: no correlated legs). */
export function bestSelection(fixtureEval) {
  const values = fixtureEval.markets.flatMap((m) => m.evaluations.filter((e) => e.value));
  values.sort((a, b) => b.ev - a.ev);
  return values[0] ?? null;
}

/** Settles a selection against a full-time score: 'won' or 'lost'. */
export function settleSelection(selection, homeGoals, awayGoals) {
  const total = homeGoals + awayGoals;
  let won;
  if (selection === 'Home') won = homeGoals > awayGoals;
  else if (selection === 'Draw') won = homeGoals === awayGoals;
  else if (selection === 'Away') won = awayGoals > homeGoals;
  else if (selection === 'BTTS Yes') won = homeGoals > 0 && awayGoals > 0;
  else if (selection === 'BTTS No') won = homeGoals === 0 || awayGoals === 0;
  else {
    const m = /^(Over|Under) (\d+(?:\.\d+)?)$/.exec(selection);
    if (!m) throw new Error(`Unknown selection: ${selection}`);
    const line = Number(m[2]);
    if (total === line) return 'void'; // whole-number lines push
    won = m[1] === 'Over' ? total > line : total < line;
  }
  return won ? 'won' : 'lost';
}
