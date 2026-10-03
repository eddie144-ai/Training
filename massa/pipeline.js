/* One automated cycle for every enabled sport: settle → grow results → fit → fetch odds →
   evaluate → stake → money rules. Used by the app (while it's open) and by run.mjs (cron or n8n). */

import { DEFAULTS, bestSelection } from './engine.js';
import { parseResultsCsv, fitRatings } from './ratings.js';
import { LEAGUES, seasonCodes, fetchOdds, fetchScores, fetchResultsCsv, scoresToResults } from './feeds.js';
import { sportConfig, fitSport, evaluateSport } from './sports/registry.js';
import {
  addLog, blockReason, sizeStake, placeBet, settleBets, expirePending, applyMoneyRules, validationGate,
} from './bankroll.js';

const FIT_MAX_AGE = 20 * 3600 * 1000;
const MAX_RESULTS = 3000;

/** Which account a sport bets from. Real only once that sport's own gate has passed. */
export function activeAccount(state, sport) {
  return state.settings.mode === 'real' && validationGate(state, sport).passed ? 'real' : 'paper';
}

export function engineOptions(settings) {
  return {
    ...DEFAULTS,
    rho: settings.rho, minEv: settings.minEv, maxMarginPct: settings.maxMarginPct,
    kellyFraction: settings.kellyFraction, maxStakePct: settings.maxStakePct, devig: settings.devig,
  };
}

/** Adds results to a sport's history, deduplicated by id, newest kept. Returns how many were new. */
export function addResults(state, sport, rows) {
  const list = (state.results[sport] ??= []);
  const seen = new Set(list.map((r) => r.id));
  const fresh = rows.filter((r) => !seen.has(r.id));
  list.push(...fresh);
  list.sort((a, b) => a.date.localeCompare(b.date));
  if (list.length > MAX_RESULTS) list.splice(0, list.length - MAX_RESULTS);
  return fresh.length;
}

/** Football: ratings from this season and last on football-data.co.uk, unless the cached fit is fresh. */
export async function refreshRatings(state, sport, fetchFn, now = Date.now()) {
  const cached = state.ratings[sport];
  if (cached && now - Date.parse(cached.fetchedAt) < FIT_MAX_AGE) return cached;
  const div = LEAGUES[sport]?.div;
  if (!div) throw new Error(`No results source for ${sport}; football leagues need a football-data.co.uk division`);
  const matches = [];
  for (const season of seasonCodes(new Date(now))) {
    try { matches.push(...parseResultsCsv(await fetchResultsCsv(fetchFn, season, div))); } catch { /* season not published yet */ }
  }
  if (!matches.length) throw new Error(`No results downloaded for ${LEAGUES[sport].name}`);
  const fit = fitRatings(matches, { asOf: new Date(now).toISOString().slice(0, 10) });
  state.ratings[sport] = { ...fit, fetchedAt: new Date(now).toISOString() };
  return state.ratings[sport];
}

/** Other sports: fit from the stored results history; refit when results change or daily. */
export function refreshSportFit(state, sport, cfg, now = Date.now()) {
  const results = state.results[sport] ?? [];
  const cached = state.ratings[sport];
  if (cached && cached.count === results.length && now - Date.parse(cached.fetchedAt) < FIT_MAX_AGE) return cached;
  if (!results.length) return null;
  const fit = fitSport(cfg, results, new Date(now).toISOString().slice(0, 10));
  state.ratings[sport] = { ...fit, count: results.length, fetchedAt: new Date(now).toISOString() };
  return state.ratings[sport];
}

/** Evaluates fixtures. Pure: no state changes. */
export function evaluateFixtures(fixtures, cfg, fit, settings) {
  const opts = engineOptions(settings);
  return fixtures.map((f) => {
    const row = { ...f, kind: cfg.kind, expected: null, markets: [], best: null, reason: null };
    if (!Object.keys(f.prices).length) { row.reason = 'No prices'; return row; }
    try {
      const ev = evaluateSport(cfg, fit, f, settings, opts);
      if (ev.reason) { row.reason = ev.reason; return row; }
      row.expected = ev.expected;
      row.markets = ev.markets;
      row.note = ev.note ?? null;
      row.best = bestSelection(ev);
      if (!row.best) row.reason = ev.markets.map((m) => `${m.market}: ${m.reason}`).join('; ');
    } catch (e) {
      row.reason = e.message;
    }
    return row;
  });
}

/**
 * Runs a full cycle. deps.fetchFn is fetch (browser or Node 18+).
 * Returns { settled, placed, newResults, messages, errors }.
 */
export async function runCycle(state, { fetchFn, now = Date.now() }) {
  const s = state.settings;
  const out = { settled: 0, placed: [], newResults: 0, messages: [], errors: [] };
  if (!s.apiKey) { out.errors.push('Add an Odds API key in Settings.'); return out; }
  const evalRows = [];
  const track = (r) => { if (r?.remaining != null) state.apiRemaining = r.remaining; return r; };
  let lockedNote = false;

  for (const sport of s.sports) {
    const cfg = sportConfig(sport);
    const name = cfg?.label ?? sport;
    if (!cfg) { out.errors.push(`${sport}: outright markets aren't modelled`); continue; }
    try {
      // 1. Scores: settle bets, and for non-football sports grow the results history the model learns from.
      const waiting = state.bets.some((b) => b.sport === sport && b.status === 'open' && Date.parse(b.commence) < now);
      if (waiting || cfg.kind !== 'football') {
        const { scores } = track(await fetchScores(fetchFn, s.apiKey, sport));
        out.settled += settleBets(state, scores, now);
        if (cfg.kind !== 'football') out.newResults += addResults(state, sport, scoresToResults(scores));
      }
      // 2. Fit.
      const fit = cfg.kind === 'football' ? await refreshRatings(state, sport, fetchFn, now) : refreshSportFit(state, sport, cfg, now);
      // 3. Odds for fixtures inside the betting window.
      const markets = cfg.kind === 'football' || cfg.kind === 'darts' || cfg.kind === 'elo'
        ? s.markets.filter((m) => cfg.kind !== 'elo' || m === 'h2h')
        : s.markets;
      const { fixtures } = track(await fetchOdds(fetchFn, s.apiKey, sport, { regions: s.regions, bookmakers: s.bookmakers, markets, label: cfg.kind === 'football' ? undefined : cfg.label }));
      const upcoming = fixtures.filter((f) => {
        const t = Date.parse(f.commence);
        return t > now + 5 * 60000 && t < now + s.horizonHours * 3600000;
      });
      // 4. Evaluate, then 5. stake the best value selection per fixture.
      const acct = activeAccount(state, sport);
      if (s.mode === 'real' && acct === 'paper') lockedNote = true;
      for (const row of evaluateFixtures(upcoming, cfg, fit, s)) {
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

  if (lockedNote) out.messages.push('Real mode is locked for sports whose own gate hasn\'t passed, so they ran on paper.');
  expirePending(state, now);
  // 6. Money rules on both accounts: sweeps and stop-loss.
  for (const a of ['paper', 'real']) out.messages.push(...applyMoneyRules(state, a, now));

  state.lastEval = evalRows.sort((a, b) => a.commence.localeCompare(b.commence));
  state.lastRun = new Date(now).toISOString();
  const real = out.placed.filter((b) => b.status === 'pending').length;
  const summary = `Cycle: ${out.settled} settled, ${out.placed.length - real} paper placed${real ? `, ${real} real to place` : ''}, ${evalRows.length} fixtures checked${out.newResults ? `, ${out.newResults} new results` : ''}`;
  addLog(state, [summary, ...out.messages, ...out.errors].join(' · '), now);
  return out;
}
