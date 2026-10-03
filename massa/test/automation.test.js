import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResultsCsv, fitRatings, normaliseTeam, findTeam } from '../ratings.js';
import { seasonCodes } from '../feeds.js';
import {
  newState, deposit, withdraw, equity, sizeStake, placeBet, settleBets, applyMoneyRules, validationGate,
  confirmPlaced, blockReason,
} from '../bankroll.js';
import { runCycle, activeAccount } from '../pipeline.js';

const NOW = Date.parse('2026-10-03T12:00:00Z');

// A small league: Strong beats everyone, Weak loses to everyone.
function leagueCsv() {
  const teams = ['Strong FC', 'Mid Town', 'Other City', 'Weak United'];
  const goals = { 'Strong FC': 3, 'Mid Town': 1, 'Other City': 1, 'Weak United': 0 };
  const rows = ['Div,Date,HomeTeam,AwayTeam,FTHG,FTAG'];
  for (let round = 0; round < 4; round++) {
    for (const h of teams) for (const a of teams) {
      if (h === a) continue;
      const d = new Date(Date.parse('2026-08-10') + round * 7 * 86400000);
      const date = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
      rows.push(`E0,${date},${h},${a},${goals[h]},${goals[a]}`);
    }
  }
  return rows.join('\n');
}

test('Season codes', () => {
  assert.deepEqual(seasonCodes(new Date(NOW)), ['2627', '2526']);
  assert.deepEqual(seasonCodes(new Date('2027-03-01')), ['2627', '2526']);
});

test('Ratings: strong team attacks above 1, weak team defends above 1', () => {
  const r = fitRatings(parseResultsCsv(leagueCsv()), { asOf: '2026-10-03' });
  assert.ok(r.teams['Strong FC'].attack > 1.5);
  assert.ok(r.teams['Weak United'].attack < 0.6);
  assert.ok(r.teams['Weak United'].defense > 1);
  assert.equal(r.teams['Strong FC'].games, 24);
});

test('Team names match across feeds', () => {
  assert.equal(normaliseTeam('Manchester United'), normaliseTeam('Man United'));
  assert.equal(normaliseTeam('Nottingham Forest'), normaliseTeam("Nott'm Forest"));
  assert.equal(normaliseTeam('Brighton and Hove Albion'), normaliseTeam('Brighton'));
  assert.equal(normaliseTeam('AC Milan'), normaliseTeam('Milan'));
  const r = fitRatings(parseResultsCsv(leagueCsv()), { asOf: '2026-10-03' });
  assert.ok(findTeam(r, 'Strong'));
});

test('Ledger: deposit, caps, settle, sweep, stop-loss', () => {
  const s = newState();
  deposit(s, 'paper', 100, NOW);
  assert.equal(equity(s, 'paper'), 100);
  // A 7% Kelly suggestion is cut to the per-bet cap upstream (stakeFraction 0.01), so £1.
  const sel = { market: '1X2', selection: 'Home', odds: 2.5, modelProb: 0.5, fairProb: 0.38, ev: 0.25, stakeFraction: 0.01 };
  const fx = { id: 'e1', sport: 'soccer_epl', league: 'Premier League', home: 'A', away: 'B', commence: '2026-10-03T15:00:00Z' };
  const { stake } = sizeStake(s, 'paper', sel, 'e1', NOW);
  assert.equal(stake, 1);
  placeBet(s, 'paper', fx, sel, stake, NOW);
  assert.equal(s.accounts.paper.cash, 99);
  assert.equal(equity(s, 'paper'), 100);
  // The day cap (3%) limits a large suggestion.
  const big = { ...sel, stakeFraction: 0.5 };
  assert.equal(sizeStake(s, 'paper', big, 'e2', NOW).stake, 2);
  // Settle a win.
  assert.equal(settleBets(s, [{ id: 'e1', completed: true, hg: 2, ag: 0 }], NOW), 1);
  assert.equal(s.accounts.paper.cash, 101.5);
  assert.throws(() => withdraw(s, 'paper', 500), RangeError);

  // Profit sweep once up 20%.
  s.accounts.paper.cash = 125;
  const msgs = applyMoneyRules(s, 'paper', NOW);
  assert.match(msgs[0], /Swept £25.00/);
  assert.equal(s.accounts.paper.cash, 100);
  assert.equal(s.accounts.paper.principal, 100);

  // Stop-loss at 30% down.
  s.accounts.paper.cash = 69;
  applyMoneyRules(s, 'paper', NOW);
  assert.match(s.accounts.paper.halted, /Stop-loss/);
  assert.match(blockReason(s, 'paper', NOW), /Stop-loss/);
});

test('Real account: locked until the gate passes, bets wait for confirmation', () => {
  const s = newState();
  s.settings.mode = 'real';
  assert.equal(activeAccount(s), 'paper');
  assert.equal(validationGate(s).passed, false);
  deposit(s, 'real', 50, NOW);
  const sel = { market: '1X2', selection: 'Away', odds: 3, modelProb: 0.4, fairProb: 0.3, ev: 0.2, stakeFraction: 0.01 };
  const bet = placeBet(s, 'real', { id: 'e9', sport: 'x', league: 'x', home: 'A', away: 'B', commence: '2026-10-04T15:00:00Z' }, sel, 0.5, NOW);
  assert.equal(bet.status, 'pending');
  assert.equal(s.accounts.real.cash, 50);
  confirmPlaced(s, bet.id, { odds: 2.9 }, NOW);
  assert.equal(s.accounts.real.cash, 49.5);
  assert.equal(bet.odds, 2.9);
});

test('Full cycle with mocked feeds: places a paper bet, then settles it', async () => {
  const csv = leagueCsv();
  let completed = false;
  const fetchFn = async (url) => {
    const json = (body) => ({ ok: true, headers: { get: () => '480' }, json: async () => body, text: async () => JSON.stringify(body) });
    if (url.includes('football-data')) {
      return url.includes('/2627/') ? { ok: true, text: async () => csv } : { ok: false, status: 404, text: async () => '' };
    }
    if (url.includes('/odds?')) {
      return json([{
        id: 'ev1', commence_time: '2026-10-04T14:00:00Z', home_team: 'Strong FC', away_team: 'Weak United',
        bookmakers: [{ key: 'bet365', title: 'Bet365', markets: [
          { key: 'h2h', outcomes: [{ name: 'Strong FC', price: 2.0 }, { name: 'Weak United', price: 4.5 }, { name: 'Draw', price: 3.6 }] },
          { key: 'totals', outcomes: [{ name: 'Over', price: 1.9, point: 2.5 }, { name: 'Under', price: 1.95, point: 2.5 }] },
        ] }],
      }]);
    }
    if (url.includes('/scores?')) {
      return json([{ id: 'ev1', completed, home_team: 'Strong FC', away_team: 'Weak United',
        scores: completed ? [{ name: 'Strong FC', score: '3' }, { name: 'Weak United', score: '0' }] : null }]);
    }
    throw new Error(`unexpected ${url}`);
  };

  const s = newState();
  s.settings.apiKey = 'test';
  deposit(s, 'paper', 100, NOW);
  const r1 = await runCycle(s, { fetchFn, now: NOW });
  assert.deepEqual(r1.errors, []);
  assert.equal(r1.placed.length, 1);
  assert.equal(r1.placed[0].selection, 'Home');
  assert.equal(s.apiRemaining, 480);
  assert.ok(s.lastEval[0].expected.home > s.lastEval[0].expected.away);

  // Same fixture isn't bet twice.
  const r2 = await runCycle(s, { fetchFn, now: NOW + 3600000 });
  assert.equal(r2.placed.length, 0);

  completed = true;
  const r3 = await runCycle(s, { fetchFn, now: Date.parse('2026-10-04T17:00:00Z') });
  assert.equal(r3.settled, 1);
  assert.equal(s.bets[0].status, 'won');
  assert.ok(s.accounts.paper.cash > 100);
});
