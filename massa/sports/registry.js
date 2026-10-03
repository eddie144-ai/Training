/* Which model each Odds API sport uses, how it is fitted from results, and how a fixture is
   evaluated. Every sport is validated on its own (Betting Council v1.1: no edge transfers
   between sports without fresh out-of-sample evidence). */

import { DEFAULTS, expectedGoals, evaluateFixture, scoreMatrix, modelFromScores, modelFromNormal, evaluateModel, evaluateMarket } from '../engine.js';
import { fitRatings, findTeam, normaliseTeam } from '../ratings.js';
import { fitElo, eloWinProb } from './elo.js';
import { evaluateDarts, parsePlayers, parseFormat } from './darts.js';

/**
 * kind:
 *   football  Dixon-Coles goals (ratings from football-data.co.uk)
 *   points    attack/defence on points, normal margin and total (basketball, gridiron, rugby, AFL)
 *   goals     attack/defence on goals or runs, Poisson score grid; level scores split for overtime
 *   darts     leg model from the player table, Elo when a player isn't in it
 *   elo       Elo on winners only: two-way match market
 * markets lists what's evaluated; settle names the score unit the feed must report.
 */
const RULES = [
  [/^soccer_/, { kind: 'football', label: 'Football' }],
  [/^basketball_nba$/, { kind: 'points', label: 'NBA', marginSd: 12.5, totalSd: 18 }],
  [/^basketball_wnba$/, { kind: 'points', label: 'WNBA', marginSd: 11, totalSd: 16 }],
  [/^basketball_ncaab$/, { kind: 'points', label: 'NCAA basketball', marginSd: 11, totalSd: 17 }],
  [/^basketball_/, { kind: 'points', label: 'Basketball', marginSd: 12, totalSd: 17 }],
  [/^americanfootball_nfl$/, { kind: 'points', label: 'NFL', marginSd: 13.5, totalSd: 13.5 }],
  [/^americanfootball_ncaaf$/, { kind: 'points', label: 'NCAA football', marginSd: 16, totalSd: 16 }],
  [/^americanfootball_/, { kind: 'points', label: 'American football', marginSd: 14, totalSd: 14 }],
  [/^aussierules_/, { kind: 'points', label: 'AFL', marginSd: 36, totalSd: 26 }],
  [/^rugbyleague_/, { kind: 'points', label: 'Rugby league', marginSd: 14, totalSd: 13 }],
  [/^rugbyunion_/, { kind: 'points', label: 'Rugby union', marginSd: 14, totalSd: 14 }],
  [/^icehockey_/, { kind: 'goals', label: 'Ice hockey', maxGoals: 12, markets: ['h2h', 'spreads', 'totals'] }],
  [/^baseball_/, { kind: 'goals', label: 'Baseball', maxGoals: 20, markets: ['h2h', 'spreads'] }], // runs are overdispersed: no totals
  [/^darts_/, { kind: 'darts', label: 'Darts' }],
  [/^tennis_/, { kind: 'elo', label: 'Tennis', k: 32 }],
  [/^mma_/, { kind: 'elo', label: 'MMA', k: 32 }],
  [/^boxing_/, { kind: 'elo', label: 'Boxing', k: 32 }],
  [/^cricket_/, { kind: 'elo', label: 'Cricket', k: 24 }],
  [/./, { kind: 'elo', label: 'Other', k: 24 }],
];

const OUTRIGHT = /_winner$|_championship_winner$|^golf_|^politics_/;

export function sportConfig(key) {
  if (OUTRIGHT.test(key)) return null; // futures and outrights have no fixture to model
  const hit = RULES.find(([re]) => re.test(key));
  return { key, ...hit[1] };
}

/** Fits the model for a non-football sport from its results history. */
export function fitSport(cfg, results, asOf) {
  if (!results.length) throw new Error('No results yet');
  if (cfg.kind === 'points' || cfg.kind === 'goals') {
    // Points sports get a little more shrinkage per game; the fit is the same multiplicative one.
    return { kind: cfg.kind, ...fitRatings(results, { asOf, halfLifeDays: 120, shrink: 3 }) };
  }
  return { kind: 'elo', ...fitElo(results, { k: cfg.k ?? 24 }), matches: results.length };
}

const findElo = (fit, name) => {
  const want = normaliseTeam(name);
  const hit = Object.entries(fit.players).find(([n]) => normaliseTeam(n) === want);
  return hit ? hit[1] : null;
};

/**
 * Evaluates one fixture. Returns { expected, markets, note } or { reason } when it can't.
 * fit: football ratings or the sport's fitted model. settings: the app settings.
 */
export function evaluateSport(cfg, fit, f, settings, opts = DEFAULTS) {
  const min = settings.minGames;
  if (cfg.kind === 'football') {
    const home = findTeam(fit, f.home), away = findTeam(fit, f.away);
    if (!home || !away) return { reason: `No ratings for ${!home ? f.home : f.away}` };
    if (Math.min(home.games, away.games) < min) return { reason: `Under ${min} rated matches` };
    const eg = expectedGoals(home, away, fit.league);
    const ev = evaluateFixture(eg, { h2h: f.prices.h2h, totals: f.prices.totals }, opts);
    if (f.prices.spreads) {
      // Asian handicap from the same Dixon-Coles grid. Quarter lines aren't modelled.
      const m = ev.probabilities.matrix;
      const model = modelFromScores(m.flatMap((row, h) => row.map((p, a) => ({ h, a, p }))));
      if (Number.isInteger(f.prices.spreads.line * 2)) ev.markets.push(...evaluateModel(model, { spreads: f.prices.spreads }, opts).markets);
    }
    return { expected: { home: eg.lambda, away: eg.mu, unit: 'xG' }, markets: ev.markets };
  }

  if (cfg.kind === 'points' || cfg.kind === 'goals') {
    const home = findTeam(fit, f.home), away = findTeam(fit, f.away);
    if (!home || !away) return { reason: `No ratings for ${!home ? f.home : f.away}` };
    if (Math.min(home.games, away.games) < min) return { reason: `Under ${min} rated games` };
    const eh = home.attack * away.defense * fit.league.avgHomeGoals;
    const ea = away.attack * home.defense * fit.league.avgAwayGoals;
    const allowed = cfg.markets ?? ['h2h', 'spreads', 'totals'];
    const prices = Object.fromEntries(Object.entries(f.prices).filter(([k]) => allowed.includes(k)));
    if (prices.h2h?.draw) prices.h2h = { ...prices.h2h, draw: undefined }; // these sports price the two-way line
    let model, drawSplit;
    if (cfg.kind === 'points') {
      model = modelFromNormal(eh - ea, cfg.marginSd, eh + ea, cfg.totalSd);
      drawSplit = 0.5;
    } else {
      const m = scoreMatrix(eh, ea, 0, cfg.maxGoals);
      model = modelFromScores(m.flatMap((row, h) => row.map((p, a) => ({ h, a, p }))));
      drawSplit = eh / (eh + ea); // overtime / extra innings: the stronger scorer more often wins
    }
    const { markets } = evaluateModel(model, prices, { ...opts, drawSplit });
    return { expected: { home: eh, away: ea, unit: cfg.kind === 'points' ? 'pts' : 'goals' }, markets };
  }

  // Darts with both players in the table: the full leg model.
  if (cfg.kind === 'darts') {
    const table = parsePlayers(settings.dartsPlayers);
    const a = table.get(f.home.toLowerCase()), b = table.get(f.away.toLowerCase());
    if (a && b) {
      const ev = evaluateDarts(a, b, parseFormat(settings.dartsFormat), f.prices, opts);
      return { expected: { home: ev.legs.hold, away: ev.legs.break, unit: 'leg win (on/against throw)' }, markets: ev.markets, note: `P(${f.home}) ${(ev.pA * 100).toFixed(1)}%` };
    }
    if (!fit) return { reason: `Add ${!a ? f.home : f.away} to the darts player table` };
  }

  // Elo: two-way winner only.
  if (!fit) return { reason: 'No results yet' };
  const h = findElo(fit, f.home), a = findElo(fit, f.away);
  if (!h || !a) return { reason: `No rating for ${!h ? f.home : f.away}` };
  if (Math.min(h.games, a.games) < min) return { reason: `Under ${min} rated matches` };
  if (!f.prices.h2h || f.prices.h2h.draw) return { reason: 'No two-way match price' };
  const p = eloWinProb(h.rating, a.rating, fit.hfa, fit.scale);
  const { home, away, books = {} } = f.prices.h2h;
  const market = evaluateMarket('Match', [
    { selection: 'Home', odds: home, modelProb: p, book: books.home, rule: { kind: 'winner', side: 'home' } },
    { selection: 'Away', odds: away, modelProb: 1 - p, book: books.away, rule: { kind: 'winner', side: 'away' } },
  ], opts);
  return { expected: { home: h.rating, away: a.rating, unit: 'Elo' }, markets: [market] };
}
