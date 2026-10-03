import test from 'node:test';
import assert from 'node:assert/strict';
import { settleRule, kellyStake, expectedValue, modelFromNormal, modelFromScores, evaluateModel, normalCdf } from '../engine.js';
import { legVisits, legWinProbs, matchScores, evaluateDarts, parseFormat, parsePlayers } from '../sports/darts.js';
import { holdProb, tiebreakProb, matchModel, evaluateTennis } from '../sports/tennis.js';
import { fitElo, eloWinProb } from '../sports/elo.js';
import { sportConfig, fitSport, evaluateSport } from '../sports/registry.js';
import { bestPrices, parseGenericResults } from '../feeds.js';
import { newState, deposit, placeBet, manualSettle, validationGate, DEFAULT_SETTINGS } from '../bankroll.js';
import { runCycle, addResults } from '../pipeline.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const sum = (xs) => xs.reduce((s, x) => s + x.p, 0);

test('Normal CDF', () => {
  close(normalCdf(0), 0.5);
  close(normalCdf(1.96), 0.975, 1e-4);
  close(normalCdf(-1), 1 - normalCdf(1));
});

test('Settlement rules: winner, spread, total, pushes', () => {
  assert.equal(settleRule({ kind: 'winner', side: 'away' }, 98, 101), 'won');
  assert.equal(settleRule({ kind: 'spread', side: 'home', line: -5.5 }, 110, 104), 'won');
  assert.equal(settleRule({ kind: 'spread', side: 'home', line: -6 }, 110, 104), 'void');
  assert.equal(settleRule({ kind: 'spread', side: 'away', line: 5.5 }, 110, 104), 'lost');
  assert.equal(settleRule({ kind: 'total', side: 'under', line: 220.5 }, 110, 104), 'won');
  assert.equal(settleRule({ kind: 'total', side: 'over', line: 214 }, 110, 104), 'void');
});

test('Push-aware EV and Kelly', () => {
  close(expectedValue(0.5, 2.1, 0.1), 0.5 * 2.1 + 0.1 - 1);
  // With no push it matches the standard formula.
  close(kellyStake(0.55, 2, 1, 100), 0.1);
  // A push shrinks nothing when the win/lose odds are the same conditional on a result.
  close(kellyStake(0.5, 2.2, 1, 100, 0.1), (0.5 * 1.2 - 0.4) / (1.2 * 0.9));
});

test('Darts: leg model calibrates to the average', () => {
  const d = legVisits({ average: 100, checkout: 0.42 });
  close(sum(d.map((p) => ({ p }))), 1);
  const meanDarts = 3 * d.reduce((s, p, v) => s + p * v, 0);
  assert.ok(Math.abs(meanDarts - 1503 / 100) < 0.5, `mean darts ${meanDarts}`);
  assert.throws(() => legVisits({ average: 100, checkout: 42 }), RangeError);
});

test('Darts: equal players split 50/50 and hold throw above 50%', () => {
  const p = { average: 95, checkout: 0.4 };
  const l = legWinProbs(legVisits(p), legVisits(p));
  close(l.hold + l.break, 1);
  assert.ok(l.hold > 0.55 && l.hold < 0.7);
  for (const f of [parseFormat('legs:6'), parseFormat('sets:4:3')]) {
    const m = matchScores(l, f);
    close(m.pA, 0.5);
    close(sum(m.scores), 1);
  }
});

test('Darts: the better player wins more often in longer matches', () => {
  const l = legWinProbs(legVisits({ average: 100, checkout: 0.42 }), legVisits({ average: 95, checkout: 0.4 }));
  const short = matchScores(l, parseFormat('legs:6')).pA;
  const long = matchScores(l, parseFormat('legs:11')).pA;
  const sets = matchScores(l, parseFormat('sets:7:3')).pA;
  assert.ok(short > 0.55 && long > short && sets > long);
});

test('Darts: markets, formats and the player table', () => {
  const ev = evaluateDarts({ average: 100, checkout: 0.42 }, { average: 95, checkout: 0.4 }, parseFormat('legs:6'), {
    h2h: { home: 1.6, away: 2.4 }, spreads: { line: -1.5, home: 2.0, away: 1.8 }, totals: { line: 9.5, over: 1.85, under: 1.95 },
  });
  assert.deepEqual(ev.markets.map((m) => m.market), ['Match', 'Handicap -1.5', 'Total 9.5']);
  close(ev.markets[0].evaluations[0].modelProb, ev.pA);
  assert.throws(() => parseFormat('first to 6'));
  const t = parsePlayers('Luke Humphries, 99.1, 42%\nLuke Littler,101.5,0.44\nbad line');
  assert.equal(t.size, 2);
  close(t.get('luke humphries').checkout, 0.42);
});

test('Tennis: hold, tie-break and match', () => {
  close(holdProb(0.5), 0.5);
  assert.ok(holdProb(0.64) > 0.78 && holdProb(0.64) < 0.84);
  close(tiebreakProb(0.62, 0.62), 0.5);
  const even = matchModel(0.64, 0.64, 3);
  close(even.pA, 0.5);
  close(sum(even.games), 1);
  const fav = matchModel(0.66, 0.62, 5);
  assert.ok(fav.pA > matchModel(0.66, 0.62, 3).pA);
  const ev = evaluateTennis(0.66, 0.62, 3, { h2h: { home: 1.5, away: 2.7 }, totals: { line: 22.5, over: 1.9, under: 1.9 } });
  assert.deepEqual(ev.markets.map((m) => m.market), ['Match', 'Total 22.5 games']);
});

test('Elo: winners climb, home advantage counts', () => {
  const res = [];
  for (let i = 0; i < 20; i++) res.push({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, home: 'A', away: 'B', hg: 1, ag: 0 });
  const fit = fitElo(res, { k: 20 });
  assert.ok(fit.players.A.rating > 1600 && fit.players.B.rating < 1400);
  close(eloWinProb(1500, 1500), 0.5);
  assert.ok(eloWinProb(1500, 1500, 50) > 0.5);
});

test('Normal points model and generic evaluation', () => {
  const m = modelFromNormal(4, 12, 220, 18);
  const ev = evaluateModel(m, { h2h: { home: 1.6, away: 2.4 }, spreads: { line: -4.5, home: 1.91, away: 1.91 }, totals: { line: 220.5, over: 1.91, under: 1.91 } });
  assert.equal(ev.markets.length, 3);
  const [h2h, spread, total] = ev.markets;
  close(h2h.evaluations[0].modelProb + h2h.evaluations[1].modelProb, 1);
  assert.ok(spread.evaluations[0].modelProb < 0.5); // −4.5 against a mean margin of 4
  assert.ok(Math.abs(total.evaluations[0].modelProb - 0.489) < 0.01);
  // Discrete model: pushes on whole lines.
  const d = modelFromScores([{ h: 2, a: 1, p: 0.5 }, { h: 1, a: 1, p: 0.5 }]);
  close(d.totalEqual(3), 0.5);
  close(d.marginEqual(0), 0.5);
});

test('Odds parsing: main lines and best prices', () => {
  const ev = {
    home_team: 'Lakers', away_team: 'Celtics',
    bookmakers: [
      { key: 'a', title: 'A', markets: [
        { key: 'h2h', outcomes: [{ name: 'Lakers', price: 2.1 }, { name: 'Celtics', price: 1.8 }] },
        { key: 'spreads', outcomes: [{ name: 'Lakers', price: 1.9, point: 2.5 }, { name: 'Celtics', price: 1.9, point: -2.5 }] },
        { key: 'totals', outcomes: [{ name: 'Over', price: 1.9, point: 221.5 }, { name: 'Under', price: 1.9, point: 221.5 }] }] },
      { key: 'b', title: 'B', markets: [
        { key: 'h2h', outcomes: [{ name: 'Lakers', price: 2.2 }, { name: 'Celtics', price: 1.75 }] },
        { key: 'spreads', outcomes: [{ name: 'Lakers', price: 1.95, point: 2.5 }, { name: 'Celtics', price: 1.87, point: -2.5 }] },
        { key: 'totals', outcomes: [{ name: 'Over', price: 1.95, point: 221.5 }, { name: 'Under', price: 1.85, point: 221.5 }] }] },
      { key: 'c', title: 'C', markets: [
        { key: 'spreads', outcomes: [{ name: 'Lakers', price: 2.5, point: 1.5 }, { name: 'Celtics', price: 1.5, point: -1.5 }] }] },
    ],
  };
  const p = bestPrices(ev);
  assert.deepEqual(p.h2h, { home: 2.2, away: 1.8, books: { home: 'B', away: 'A' } });
  assert.equal(p.spreads.line, 2.5); // two books on 2.5 beat one on 1.5
  assert.equal(p.spreads.home, 1.95);
  assert.equal(p.totals.over, 1.95);
  assert.equal(bestPrices(ev, ['c']).h2h, undefined);
});

test('Registry: every sport has a model, outrights none', () => {
  assert.equal(sportConfig('soccer_epl').kind, 'football');
  assert.equal(sportConfig('basketball_nba').kind, 'points');
  assert.equal(sportConfig('icehockey_nhl').kind, 'goals');
  assert.deepEqual(sportConfig('baseball_mlb').markets, ['h2h', 'spreads']);
  assert.equal(sportConfig('tennis_atp_us_open').kind, 'elo');
  assert.equal(sportConfig('darts_pdc_world_championship').kind, 'darts');
  assert.equal(sportConfig('mma_mixed_martial_arts').kind, 'elo');
  assert.equal(sportConfig('basketball_nba_championship_winner'), null);
});

function seasonResults(teams, scoreOf, start = '2026-01-01', rounds = 6) {
  const rows = [];
  let d = Date.parse(start);
  for (let r = 0; r < rounds; r++) for (const h of teams) for (const a of teams) {
    if (h === a) continue;
    d += 86400000;
    rows.push({ id: `${r}${h}${a}`, date: new Date(d).toISOString().slice(0, 10), home: h, away: a, hg: scoreOf(h, a, true), ag: scoreOf(a, h, false) });
  }
  return rows;
}

test('Registry: points and goals sports evaluate from their own results', () => {
  const pts = { Lakers: 118, Celtics: 110, Knicks: 104, Pistons: 98 };
  const res = seasonResults(Object.keys(pts), (t, o, home) => pts[t] + (home ? 3 : 0) - (pts[o] - 107) / 2);
  const cfg = sportConfig('basketball_nba');
  const fit = fitSport(cfg, res, '2026-12-31');
  const f = { home: 'Lakers', away: 'Pistons', prices: { h2h: { home: 1.4, away: 3.2 }, spreads: { line: -9.5, home: 1.91, away: 1.91 }, totals: { line: 214.5, over: 1.91, under: 1.91 } } };
  const ev = evaluateSport(cfg, fit, f, { ...DEFAULT_SETTINGS });
  assert.equal(ev.markets.length, 3);
  assert.ok(ev.expected.home > ev.expected.away + 10);

  const hockey = sportConfig('icehockey_nhl');
  const goals = { Oilers: 4, Kings: 3, Ducks: 2, Sharks: 2 };
  const hfit = fitSport(hockey, seasonResults(Object.keys(goals), (t) => goals[t]), '2026-12-31');
  const hev = evaluateSport(hockey, hfit, { home: 'Oilers', away: 'Sharks', prices: { h2h: { home: 1.5, away: 2.7 }, totals: { line: 6.5, over: 2.1, under: 1.75 } } }, { ...DEFAULT_SETTINGS });
  close(hev.markets[0].evaluations[0].modelProb + hev.markets[0].evaluations[1].modelProb, 1);
});

test('Registry: darts uses the player table, else Elo, else explains', () => {
  const cfg = sportConfig('darts_pdc');
  const settings = { ...DEFAULT_SETTINGS, dartsPlayers: 'Littler, 101, 44\nSmith, 94, 39', dartsFormat: 'legs:7' };
  const f = { home: 'Littler', away: 'Smith', prices: { h2h: { home: 1.35, away: 3.3 } } };
  const ev = evaluateSport(cfg, null, f, settings);
  assert.equal(ev.markets[0].market, 'Match');
  assert.ok(ev.markets[0].evaluations[0].modelProb > 0.7);
  assert.match(evaluateSport(cfg, null, { ...f, away: 'Unknown' }, settings).reason, /darts player table/);
});

test('Manual settlement and per-sport gates', () => {
  const s = newState();
  deposit(s, 'paper', 100);
  const sel = { market: 'Match', selection: 'Home', odds: 2, modelProb: 0.6, fairProb: 0.5, ev: 0.2, stakeFraction: 0.01, rule: { kind: 'winner', side: 'home' } };
  const b = placeBet(s, 'paper', { id: 'x', sport: 'mma_mixed_martial_arts', league: 'MMA', home: 'A', away: 'B', commence: '2026-10-01T00:00:00Z' }, sel, 1);
  manualSettle(s, b.id, 'won');
  assert.equal(b.status, 'won');
  assert.equal(s.accounts.paper.cash, 101);
  assert.equal(validationGate(s, 'mma_mixed_martial_arts').n, 1);
  assert.equal(validationGate(s, 'basketball_nba').n, 0);
  assert.throws(() => manualSettle(s, b.id, 'won'));
});

test('Multi-sport cycle: NBA learns from scores, darts from the table', async () => {
  const NOW = Date.parse('2026-10-20T12:00:00Z');
  const s = newState();
  s.settings.apiKey = 'k';
  s.settings.sports = ['basketball_nba', 'darts_pdc'];
  s.settings.minGames = 4;
  s.settings.dartsPlayers = 'Littler, 102, 45\nSmith, 93, 38';
  deposit(s, 'paper', 100, NOW);
  const pts = { Lakers: 120, Celtics: 110, Knicks: 105, Pistons: 95 };
  addResults(s, 'basketball_nba', seasonResults(Object.keys(pts), (t, o) => pts[t] - (pts[o] - 107) / 2, '2026-09-01', 2));
  const ko = '2026-10-21T00:00:00Z';
  const fetchFn = async (url) => {
    const json = (body) => ({ ok: true, headers: { get: () => '400' }, json: async () => body });
    if (url.includes('/scores?')) {
      return json(url.includes('basketball_nba')
        ? [{ id: 'old1', completed: true, commence_time: '2026-10-19T00:00:00Z', home_team: 'Lakers', away_team: 'Knicks', scores: [{ name: 'Lakers', score: '121' }, { name: 'Knicks', score: '100' }] }]
        : []);
    }
    if (url.includes('basketball_nba/odds')) {
      return json([{ id: 'n1', commence_time: ko, home_team: 'Lakers', away_team: 'Pistons', bookmakers: [{ key: 'b', title: 'Book', markets: [
        { key: 'h2h', outcomes: [{ name: 'Lakers', price: 2.0 }, { name: 'Pistons', price: 1.85 }] },
        { key: 'spreads', outcomes: [{ name: 'Lakers', price: 1.91, point: 1.5 }, { name: 'Pistons', price: 1.91, point: -1.5 }] }] }] }]);
    }
    if (url.includes('darts_pdc/odds')) {
      return json([{ id: 'd1', commence_time: ko, home_team: 'Littler', away_team: 'Smith', bookmakers: [{ key: 'b', title: 'Book', markets: [
        { key: 'h2h', outcomes: [{ name: 'Littler', price: 1.7 }, { name: 'Smith', price: 2.2 }] }] }] }]);
    }
    throw new Error(`unexpected ${url}`);
  };
  const r = await runCycle(s, { fetchFn, now: NOW });
  assert.deepEqual(r.errors, []);
  assert.equal(r.newResults, 1);
  assert.equal(r.placed.length, 2);
  const sports = r.placed.map((b) => b.sport).sort();
  assert.deepEqual(sports, ['basketball_nba', 'darts_pdc']);
  assert.ok(r.placed.every((b) => b.rule));
  assert.equal(parseGenericResults('date,home,away,hs,as\n2026-01-02,A,B,3,1\nbad').length, 1);
});
