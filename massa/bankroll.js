/* Bankroll: two separate accounts (paper and real), the ledger, exposure caps, drawdown throttle,
   settlement, profit sweeps, stop-loss and the validation gate that unlocks the real account. */

import { settleSelection, settleRule } from './engine.js';

export const DEFAULT_SETTINGS = {
  mode: 'paper',          // 'paper' bets automatically; 'real' proposes bets for you to place (needs the gate)
  apiKey: '',
  sports: ['soccer_epl'],
  regions: 'uk',
  bookmakers: [],         // Odds API bookmaker keys you hold accounts with; empty = all
  markets: ['h2h', 'spreads', 'totals'], // each market costs one Odds API request per league per cycle
  dartsPlayers: '',       // "Name, 3-dart average, checkout %" per line
  dartsFormat: 'legs:6',  // legs:N (first to N legs) or sets:N:L (first to N sets of first to L legs)
  horizonHours: 48,       // only bet on fixtures starting within this window
  minGames: 6,            // each team needs this many rated matches
  minStake: 0.1,
  kellyFraction: 0.25,
  maxStakePct: 1,         // per bet
  maxEventPct: 2,         // per fixture
  maxDayPct: 3,           // stakes placed per day
  maxWeekPct: 5,          // stakes placed per rolling 7 days
  minEv: 0.02,
  maxMarginPct: 8,
  devig: 'power',
  rho: -0.13,
  profitLockPct: 20,      // sweep profit out once the account is up this much on principal
  stopLossPct: 30,        // halt once the account is down this much on principal
  dailyLossLimitPct: 5,   // no new bets for the rest of the day after this loss
  gateMinBets: 200,       // settled paper bets needed before the real account unlocks
  autoHours: 3,           // the app runs a cycle this often while it's open
};

const newAccount = () => ({ cash: 0, principal: 0, peak: 0, halted: null, entries: [] });

export function newState() {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    accounts: { paper: newAccount(), real: newAccount() },
    bets: [],
    ratings: {},
    results: {},            // results history per sport (non-football), from scores and imports
    lastEval: [],
    log: [],
    lastRun: null,
    apiRemaining: null,
  };
}

const round2 = (x) => Math.round(x * 100) / 100;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const iso = (d) => new Date(d).toISOString();
const day = (d) => iso(d).slice(0, 10);

export function addLog(state, msg, now = Date.now()) {
  state.log.unshift({ t: iso(now), msg });
  state.log.length = Math.min(state.log.length, 300);
}

/** Open stakes still at risk in an account. */
export const openStakes = (state, acct) =>
  state.bets.filter((b) => b.account === acct && b.status === 'open').reduce((s, b) => s + b.stake, 0);

/** Cash plus stakes at risk, valued at cost. */
export const equity = (state, acct) => round2(state.accounts[acct].cash + openStakes(state, acct));

function entry(state, acct, type, amount, note, now) {
  state.accounts[acct].entries.unshift({ t: iso(now), type, amount: round2(amount), note });
}

export function deposit(state, acct, amount, now = Date.now()) {
  if (!(amount > 0)) throw new RangeError('Deposit must be above 0');
  const a = state.accounts[acct];
  a.cash = round2(a.cash + amount);
  a.principal = round2(a.principal + amount);
  a.peak = Math.max(a.peak, equity(state, acct));
  entry(state, acct, 'deposit', amount, 'Capital in', now);
}

/** Withdraws from cash. Profit (equity above principal) goes first; the rest reduces principal. */
export function withdraw(state, acct, amount, note = 'Withdrawal', now = Date.now()) {
  const a = state.accounts[acct];
  if (!(amount > 0)) throw new RangeError('Withdrawal must be above 0');
  if (amount > a.cash + 1e-9) throw new RangeError(`Only £${a.cash.toFixed(2)} is free; the rest is in open bets`);
  const profit = Math.max(0, equity(state, acct) - a.principal);
  a.cash = round2(a.cash - amount);
  a.principal = round2(a.principal - Math.max(0, amount - profit));
  a.peak = equity(state, acct);
  entry(state, acct, 'withdraw', -amount, note, now);
}

/** Stake multiplier from drawdown off the account's peak: 1, then ½ past 10%, ¼ past 20%. */
export function drawdownMultiplier(state, acct) {
  const a = state.accounts[acct];
  if (a.peak <= 0) return 1;
  const dd = 1 - equity(state, acct) / a.peak;
  return dd >= 0.2 ? 0.25 : dd >= 0.1 ? 0.5 : 1;
}

/** Why an account can't bet right now, or null. */
export function blockReason(state, acct, now = Date.now()) {
  const a = state.accounts[acct];
  const s = state.settings;
  if (a.halted) return a.halted;
  if (equity(state, acct) <= 0) return 'No capital. Add a deposit.';
  const today = day(now);
  const lossToday = state.bets
    .filter((b) => b.account === acct && b.settledAt && day(b.settledAt) === today)
    .reduce((x, b) => x + b.profit, 0);
  if (-lossToday >= (s.dailyLossLimitPct / 100) * (equity(state, acct) - lossToday)) {
    return `Daily loss limit (${s.dailyLossLimitPct}%) reached. Betting resumes tomorrow.`;
  }
  return null;
}

/**
 * Sizes a stake for a value selection after every cap. Returns { stake, note } where stake 0
 * means skip. stakeFraction already includes fractional Kelly and the per-bet cap.
 */
export function sizeStake(state, acct, selection, eventId, now = Date.now()) {
  const s = state.settings;
  const eq = equity(state, acct);
  let stake = eq * selection.stakeFraction * drawdownMultiplier(state, acct);
  const caps = [];
  const placed = state.bets.filter((b) => b.account === acct && ['open', 'won', 'lost', 'void', 'pending'].includes(b.status));
  const sum = (bs) => bs.reduce((x, b) => x + b.stake, 0);
  const eventRoom = (s.maxEventPct / 100) * eq - sum(placed.filter((b) => b.eventId === eventId));
  const dayRoom = (s.maxDayPct / 100) * eq - sum(placed.filter((b) => day(b.placedAt) === day(now)));
  const weekRoom = (s.maxWeekPct / 100) * eq - sum(placed.filter((b) => now - Date.parse(b.placedAt) < 7 * 86400000));
  for (const [room, label] of [[eventRoom, 'event'], [dayRoom, 'day'], [weekRoom, 'week']]) {
    if (stake > room) { stake = Math.max(0, room); caps.push(label); }
  }
  stake = Math.min(stake, state.accounts[acct].cash);
  stake = Math.floor(stake * 100) / 100;
  if (stake < s.minStake) return { stake: 0, note: caps.length ? `${caps.join('/')} cap reached` : `Stake under £${s.minStake}` };
  return { stake, note: caps.length ? `Cut by ${caps.join('/')} cap` : null };
}

/** Records a bet. Paper bets are placed at once; real bets wait as 'pending' until you confirm. */
export function placeBet(state, acct, fixture, selection, stake, now = Date.now()) {
  const bet = {
    id: uid(), account: acct, eventId: fixture.id, sport: fixture.sport, league: fixture.league,
    fixture: `${fixture.home} v ${fixture.away}`, commence: fixture.commence,
    market: selection.market, selection: selection.selection, book: selection.book, rule: selection.rule ?? null,
    odds: selection.odds, modelProb: selection.modelProb, fairProb: selection.fairProb, ev: selection.ev,
    stake, status: acct === 'paper' ? 'open' : 'pending', placedAt: iso(now), settledAt: null, profit: 0, score: null,
  };
  if (bet.status === 'open') state.accounts[acct].cash = round2(state.accounts[acct].cash - stake);
  state.bets.unshift(bet);
  return bet;
}

/** Real account: you placed it (optionally at a different price or stake). */
export function confirmPlaced(state, betId, { odds, stake } = {}, now = Date.now()) {
  const b = state.bets.find((x) => x.id === betId && x.status === 'pending');
  if (!b) throw new Error('No pending bet with that id');
  if (odds) b.odds = odds;
  if (stake) b.stake = stake;
  const a = state.accounts[b.account];
  if (b.stake > a.cash + 1e-9) throw new RangeError('Not enough free cash for that stake');
  a.cash = round2(a.cash - b.stake);
  b.status = 'open';
  b.placedAt = iso(now);
}

export function skipPending(state, betId) {
  const b = state.bets.find((x) => x.id === betId && x.status === 'pending');
  if (b) b.status = 'skipped';
}

/** Pending real bets whose kick-off has passed can no longer be placed. */
export function expirePending(state, now = Date.now()) {
  for (const b of state.bets) if (b.status === 'pending' && Date.parse(b.commence) <= now) b.status = 'expired';
}

/** Settles open bets from completed scores. Returns the number settled. */
export function settleBets(state, scores, now = Date.now()) {
  const byId = new Map(scores.filter((s) => s.completed && Number.isFinite(s.hg) && Number.isFinite(s.ag)).map((s) => [s.id, s]));
  let n = 0;
  for (const b of state.bets) {
    if (b.status !== 'open') continue;
    const sc = byId.get(b.eventId);
    if (!sc) continue;
    settleOne(state, b, b.rule ? settleRule(b.rule, sc.hg, sc.ag) : settleSelection(b.selection, sc.hg, sc.ag), `${sc.hg}-${sc.ag}`, now);
    n++;
  }
  return n;
}

function settleOne(state, b, result, score, now) {
  const a = state.accounts[b.account];
  const back = result === 'won' ? b.stake * b.odds : result === 'void' ? b.stake : 0;
  a.cash = round2(a.cash + back);
  b.status = result;
  b.profit = round2(back - b.stake);
  b.score = score;
  b.settledAt = iso(now);
  a.peak = Math.max(a.peak, equity(state, b.account));
}

/** Settles an open bet by hand, for events the scores feed doesn't report (some MMA, boxing, darts). */
export function manualSettle(state, betId, result, now = Date.now()) {
  const b = state.bets.find((x) => x.id === betId && x.status === 'open');
  if (!b) throw new Error('No open bet with that id');
  if (!['won', 'lost', 'void'].includes(result)) throw new Error(`Unknown result ${result}`);
  settleOne(state, b, result, 'manual', now);
}

/** Profit sweep and stop-loss. Returns a list of messages. */
export function applyMoneyRules(state, acct, now = Date.now()) {
  const a = state.accounts[acct];
  const s = state.settings;
  const msgs = [];
  if (a.principal <= 0) return msgs;
  const eq = equity(state, acct);
  if (!a.halted && eq <= a.principal * (1 - s.stopLossPct / 100)) {
    a.halted = `Stop-loss: down ${Math.round((1 - eq / a.principal) * 100)}% on principal. Betting halted.`;
    msgs.push(a.halted);
  }
  const profit = eq - a.principal;
  if (profit >= a.principal * (s.profitLockPct / 100)) {
    const amount = Math.floor(Math.min(profit, a.cash) * 100) / 100;
    if (amount > 0) {
      withdraw(state, acct, amount, `Profit sweep (+${s.profitLockPct}% reached)`, now);
      msgs.push(`Swept £${amount.toFixed(2)} profit out of the ${acct} account.`);
    }
  }
  return msgs;
}

/** Clears a stop-loss halt by resetting principal to current equity. */
export function rebaseAndResume(state, acct) {
  const a = state.accounts[acct];
  a.principal = equity(state, acct);
  a.peak = a.principal;
  a.halted = null;
}

/**
 * The validation gate (Betting Council v1.1), per sport: enough settled paper bets, a 95% confidence
 * interval on ROI that sits above zero, and model probabilities that beat the de-vigged market
 * on Brier score.
 */
export function validationGate(state, sport = null) {
  const s = state.settings;
  const bets = state.bets.filter((b) => b.account === 'paper' && (b.status === 'won' || b.status === 'lost') && (!sport || b.sport === sport));
  const n = bets.length;
  const staked = bets.reduce((x, b) => x + b.stake, 0);
  const profit = bets.reduce((x, b) => x + b.profit, 0);
  const r = bets.map((b) => b.profit / b.stake);
  const mean = n ? r.reduce((x, y) => x + y, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(r.reduce((x, y) => x + (y - mean) ** 2, 0) / (n - 1)) : 0;
  const lower = n > 1 ? mean - 1.96 * sd / Math.sqrt(n) : null;
  const y = (b) => (b.status === 'won' ? 1 : 0);
  const brierModel = n ? bets.reduce((x, b) => x + (b.modelProb - y(b)) ** 2, 0) / n : null;
  const brierMarket = n ? bets.reduce((x, b) => x + (b.fairProb - y(b)) ** 2, 0) / n : null;
  const checks = [
    { label: `${s.gateMinBets}+ settled paper bets`, ok: n >= s.gateMinBets, value: `${n}` },
    { label: 'ROI 95% CI above 0', ok: lower != null && lower > 0, value: lower == null ? '—' : `${(lower * 100).toFixed(1)}%` },
    { label: 'Model Brier beats market', ok: n > 0 && brierModel < brierMarket, value: n ? `${brierModel.toFixed(3)} v ${brierMarket.toFixed(3)}` : '—' },
  ];
  return { n, staked, profit, roi: staked ? profit / staked : null, ciLower: lower, brierModel, brierMarket, checks, passed: checks.every((c) => c.ok) };
}
