/* One automated cycle: settle → refresh ratings → fetch odds → evaluate → stake → money rules.
   Used by the app (while it's open) and by run.mjs (cron or n8n). */

import { DEFAULTS, expectedGoals, evaluateFixture, bestSelection } from './engine.js';
import { parseResultsCsv, fitRatings, findTeam } from './ratings.js';
import { LEAGUES, seasonCodes, fetchOdds, fetchScores, fetchResultsCsv } from './feeds.js';
import {
  addLog, blockReason, sizeStake, placeBet, settleBets, expirePending, applyMoneyRules, validationGate,
} from './bankroll.js';

const RATINGS_MAX_AGE = 20 * 3600 * 1000;

/** Which account a cycle bets from. Real only once the gate has passed. */
export function activeAccount(state) {
  return state.settings.mode === 'real' && validationGate(state).passed ? 'real' : 'paper';
}

export function engineOptions(settings) {
  return {
    ...DEFAULTS,
    rho: settings.rho, minEv: settings.minEv, maxMarginPct: settings.maxMarginPct,
    kellyFraction: settings.kellyFraction, maxStakePct: settings.maxStakePct, devig: settings.devig,
  };
}

/** Fits ratings for a league from this season and last, unless the cached fit is fresh. */
export async function refreshRatings(state, sport, fetchFn, now = Date.now()) {
  const cached = state.ratings[sport];
  if (cached && now - Date.parse(cached.fetchedAt) < RATINGS_MAX_AGE) return cached;
  const div = LEAGUES[sport]?.div;
  if (!div) throw new Error(`No results source for ${sport}`);
  const matches = [];
  for (const season of seasonCodes(new Date(now))) {
    try { matches.push(...parseResultsCsv(await fetchResultsCsv(fetchFn, season, div))); } catch { /* season not published yet */ }
  }
  if (!matches.length) throw new Error(`No results downloaded for ${LEAGUES[sport].name}`);
  const fit = fitRatings(matches, { asOf: new Date(now).toISOString().slice(0, 10) });
  state.ratings[sport] = { ...fit, fetchedAt: new Date(now).toISOString() };
  return state.ratings[sport];
}

/** Evaluates fixtures against ratings. Pure: no state changes. */
export function evaluateFixtures(fixtures, ratings, settings) {
  const opts = engineOptions(settings);
  return fixtures.map((f) => {
    const row = { ...f, xg: null, markets: [], best: null, reason: null };
    const home = findTeam(ratings, f.home);
    const away = findTeam(ratings, f.away);
    if (!home || !away) { row.reason = `No ratings for ${!home ? f.home : f.away}`; return row; }
    if (Math.min(home.games, away.games) < settings.minGames) { row.reason = `Under ${settings.minGames} rated matches`; return row; }
    if (!f.prices.h2h && !f.prices.totals) { row.reason = 'No prices'; return row; }
    const eg = expectedGoals(home, away, ratings.league);
    const ev = evaluateFixture(eg, f.prices, opts);
    row.xg = ev.expectedGoals;
    row.markets = ev.markets;
    row.best = bestSelection(ev);
    if (!row.best) row.reason = ev.markets.map((m) => `${m.market}: ${m.reason}`).join('; ');
    return row;
  });
}

/**
 * Runs a full cycle. deps.fetchFn is fetch (browser or Node 18+).
 * Returns { account, settled, placed, messages, errors }.
 */
export async function runCycle(state, { fetchFn, now = Date.now() }) {
  const s = state.settings;
  const out = { account: activeAccount(state), settled: 0, placed: [], messages: [], errors: [] };
  if (!s.apiKey) { out.errors.push('Add an Odds API key in Settings.'); return out; }
  if (s.mode === 'real' && out.account === 'paper') out.messages.push('Real mode is locked until the validation gate passes, so this cycle ran on paper.');
  const acct = out.account;
  const evalRows = [];
  const track = (r) => { if (r?.remaining != null) state.apiRemaining = r.remaining; return r; };

  for (const sport of s.sports) {
    const name = LEAGUES[sport]?.name ?? sport;
    try {
      // 1. Settle: only spend an API request if bets in this league are waiting.
      if (state.bets.some((b) => b.sport === sport && b.status === 'open' && Date.parse(b.commence) < now)) {
        const { scores } = track(await fetchScores(fetchFn, s.apiKey, sport));
        out.settled += settleBets(state, scores, now);
      }
      // 2. Ratings.
      const ratings = await refreshRatings(state, sport, fetchFn, now);
      // 3. Odds for fixtures inside the betting window.
      const { fixtures } = track(await fetchOdds(fetchFn, s.apiKey, sport, { regions: s.regions, bookmakers: s.bookmakers }));
      const upcoming = fixtures.filter((f) => {
        const t = Date.parse(f.commence);
        return t > now + 5 * 60000 && t < now + s.horizonHours * 3600000;
      });
      // 4. Evaluate, then 5. stake the best value selection per fixture.
      for (const row of evaluateFixtures(upcoming, ratings, s)) {
        evalRows.push(row);
        if (!row.best) continue;
        if (state.bets.some((b) => b.eventId === row.id && b.account === acct && b.status !== 'skipped')) { row.reason = 'Already bet'; continue; }
        const blocked = blockReason(state, acct, now);
        if (blocked) { row.reason = blocked; continue; }
        const { stake, note } = sizeStake(state, acct, row.best, row.id, now);
        if (!stake) { row.reason = note; continue; }
        const bet = placeBet(state, acct, row, row.best, stake, now);
        row.reason = note;
        row.betId = bet.id;
        out.placed.push(bet);
      }
    } catch (e) {
      out.errors.push(`${name}: ${e.message}`);
    }
  }

  expirePending(state, now);
  // 6. Money rules on both accounts: sweeps and stop-loss.
  for (const a of ['paper', 'real']) out.messages.push(...applyMoneyRules(state, a, now));

  state.lastEval = evalRows.sort((a, b) => a.commence.localeCompare(b.commence));
  state.lastRun = new Date(now).toISOString();
  const summary = `Cycle (${acct}): ${out.settled} settled, ${out.placed.length} ${acct === 'paper' ? 'placed' : 'to place'}, ${evalRows.length} fixtures checked`;
  addLog(state, [summary, ...out.messages, ...out.errors].join(' · '), now);
  return out;
}
