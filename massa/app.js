/* MASSA app: runs the automated cycle while open, and shows the bankroll, bets, the board and settings.
   All data lives in localStorage on this device. Export/import moves it to and from run.mjs. */

import { evaluateFixture } from './engine.js';
import { LEAGUES, fetchSports, parseGenericResults } from './feeds.js';
import { evaluateDarts, parseFormat } from './sports/darts.js';
import { evaluateTennis } from './sports/tennis.js';
import { sportConfig } from './sports/registry.js';
import {
  newState, DEFAULT_SETTINGS, deposit, withdraw, equity, openStakes, validationGate, confirmPlaced, skipPending,
  rebaseAndResume, drawdownMultiplier, manualSettle,
} from './bankroll.js';
import { runCycle, engineOptions, addResults } from './pipeline.js';

// Shown before the sports list is loaded from the Odds API (Settings → Load all sports).
const COMMON_SPORTS = [
  ['basketball_nba', 'NBA'], ['americanfootball_nfl', 'NFL'], ['icehockey_nhl', 'NHL'], ['baseball_mlb', 'MLB'],
  ['basketball_euroleague', 'EuroLeague'], ['americanfootball_ncaaf', 'NCAA football'], ['aussierules_afl', 'AFL'],
  ['rugbyleague_nrl', 'NRL'], ['mma_mixed_martial_arts', 'MMA'], ['boxing_boxing', 'Boxing'],
];
const sportName = (k) => LEAGUES[k]?.name ?? state.sportsList?.find((x) => x.key === k)?.title ?? COMMON_SPORTS.find(([x]) => x === k)?.[1] ?? k;

const STORE_KEY = 'massa.v1';
const TABS = [
  ['home', 'Home', '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'],
  ['bets', 'Bets', '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'],
  ['board', 'Board', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
  ['money', 'Money', '<rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="3"/><path d="M6 9.5v6M18 9.5v6"/>'],
  ['settings', 'Settings', '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const gbp = (x) => `${x < 0 ? '−' : ''}£${Math.abs(x).toFixed(2)}`;
const pct = (x, dp = 1) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(dp)}%`);
const signPct = (x) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`);
const when = (isoStr) => {
  const d = new Date(isoStr);
  return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const ago = (isoStr) => {
  if (!isoStr) return 'never';
  const m = Math.round((Date.now() - Date.parse(isoStr)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 4000);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      s.settings = { ...DEFAULT_SETTINGS, ...s.settings };
      s.results ??= {};
      return s;
    }
  } catch { /* storage blocked or corrupt: start fresh */ }
  return newState();
}

let state = load();
let tab = 'home';
let running = false;
let betFilter = 'active';

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { toast('Could not save: storage is full or blocked.'); }
}

// ---------------------------------------------------------------------------
// Automation: run a cycle on open and every settings.autoHours while the app is open.
// ---------------------------------------------------------------------------
async function cycle(manual = false) {
  if (running) return;
  if (!state.settings.apiKey) { if (manual) toast('Add an Odds API key in Settings first.'); return; }
  running = true;
  render();
  try {
    const r = await runCycle(state, { fetchFn: fetch.bind(window) });
    save();
    const real = r.placed.filter((b) => b.status === 'pending').length;
    const parts = [`${r.settled} settled`, `${r.placed.length - real} paper bets placed`, ...(real ? [`${real} real bets to place`] : [])];
    toast([parts.join(', '), ...r.messages, ...r.errors].join('. '));
  } catch (e) {
    toast(`Cycle failed: ${e.message}`);
  } finally {
    running = false;
    render();
  }
}

function autoTick() {
  const due = !state.lastRun || Date.now() - Date.parse(state.lastRun) >= state.settings.autoHours * 3600000;
  if (due && state.settings.apiKey && document.visibilityState === 'visible') cycle();
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
function accountCard(acct) {
  const a = state.accounts[acct];
  const eq = equity(state, acct);
  const pl = eq - a.principal;
  const dd = a.peak > 0 ? 1 - eq / a.peak : 0;
  const mult = drawdownMultiplier(state, acct);
  return `
    <div class="card ${a.halted ? 'alert' : ''}">
      <h2>${acct === 'paper' ? 'Paper account' : 'Real account'}</h2>
      <div class="stats">
        <div class="stat"><b>${gbp(eq)}</b><span>Equity</span></div>
        <div class="stat"><b class="${pl >= 0 ? 'good' : 'bad'}">${gbp(pl)}</b><span>On principal ${gbp(a.principal)}</span></div>
        <div class="stat"><b>${gbp(openStakes(state, acct))}</b><span>In open bets</span></div>
      </div>
      <p class="muted">Free cash ${gbp(a.cash)} · drawdown ${pct(dd)}${mult < 1 ? ` · stakes ×${mult}` : ''}</p>
      ${a.halted ? `<p class="bad">${esc(a.halted)}</p>
        <button data-act="rebase" data-acct="${acct}">Reset principal and resume</button>
        <p class="muted small">This makes today's balance the new principal. Only do it after a break and a review of what went wrong.</p>` : ''}
    </div>`;
}

/** Sports to show gates for: enabled ones plus any with paper bets. */
const gateSports = () => [...new Set([...state.settings.sports, ...state.bets.filter((b) => b.account === 'paper').map((b) => b.sport)])];

function gateCard() {
  const rows = gateSports().map((k) => [k, validationGate(state, k)]);
  const any = rows.some(([, g]) => g.passed);
  return `
    <div class="card ${any ? '' : 'flag'}">
      <h2>Validation gates <span class="right">${rows.filter(([, g]) => g.passed).length} of ${rows.length} passed</span></h2>
      <p class="muted">Each sport unlocks real money on its own paper record (Betting Council v1.1: an edge never transfers between sports).</p>
      <div class="list">${rows.map(([k, g]) => `
        <details class="item">
          <summary><div class="top"><b>${esc(sportName(k))}</b><span class="tag ${g.passed ? 'won' : ''}">${g.passed ? 'Passed' : `${g.n}/${state.settings.gateMinBets}`}</span></div>
            <span class="muted small">Staked ${gbp(g.staked)} · profit ${gbp(g.profit)} · ROI ${pct(g.roi)}</span></summary>
          ${g.checks.map((c) => `<div class="row between small"><span>${c.ok ? '<span class="good">✓</span>' : '<span class="muted">✗</span>'} ${esc(c.label)}</span><b>${esc(c.value)}</b></div>`).join('')}
        </details>`).join('') || '<p class="muted">Pick sports in Settings.</p>'}
      </div>
    </div>`;
}

function pendingCard() {
  const pending = state.bets.filter((b) => b.status === 'pending');
  if (!pending.length) return '';
  return `
    <div class="card flag">
      <h2>Place these bets <span class="right">${pending.length}</span></h2>
      <p class="muted">Place each one at the bookmaker, then tap Placed. Change the odds if you got a different price.</p>
      <div class="list">${pending.map((b) => `
        <div class="item">
          <div class="top"><b>${esc(b.selection)} @ ${b.odds}</b><span class="tag pending">${gbp(b.stake)}</span></div>
          <span class="muted small">${esc(b.fixture)} · ${esc(b.book ?? '')} · ${when(b.commence)}</span>
          <div class="row"><button class="primary grow" data-act="placed" data-id="${b.id}">Placed</button><button data-act="skip" data-id="${b.id}">Skip</button></div>
        </div>`).join('')}
      </div>
    </div>`;
}

function homeView() {
  const s = state.settings;
  const setup = !s.apiKey || equity(state, 'paper') + equity(state, 'real') <= 0;
  return `
    ${setup ? `<div class="card flag"><h2>Get started</h2>
      <ol class="small" style="margin:0;padding-left:20px">
        <li>Get a free key at the-odds-api.com and add it in <b>Settings</b>.</li>
        <li>Add paper capital in <b>Money</b>.</li>
        <li>Leave the app open, or run <code>run.mjs</code> on a schedule. Each cycle settles, rates, prices, stakes and sweeps.</li>
      </ol></div>` : ''}
    <div class="card">
      <div class="row between">
        <div><h3>Automated cycle</h3><p class="muted">Last run ${ago(state.lastRun)} · every ${s.autoHours} h while open${state.apiRemaining != null ? ` · ${state.apiRemaining} API requests left` : ''}</p></div>
        <button class="primary" data-act="run" ${running ? 'disabled' : ''}>${running ? 'Running…' : 'Run now'}</button>
      </div>
    </div>
    ${pendingCard()}
    ${accountCard('paper')}
    ${state.accounts.real.principal > 0 || s.mode === 'real' ? accountCard('real') : ''}
    ${gateCard()}
    <div class="card"><h2>Log</h2>
      <div class="list">${state.log.slice(0, 8).map((l) => `<div class="small"><span class="muted">${when(l.t)}</span> ${esc(l.msg)}</div>`).join('') || '<p class="muted">Nothing yet.</p>'}</div>
    </div>`;
}

function betItem(b) {
  const res = b.status === 'won' || b.status === 'lost' || b.status === 'void';
  // The scores feed doesn't report every event (some fights, darts): settle by hand after 3 hours.
  const overdue = b.status === 'open' && Date.now() > Date.parse(b.commence) + 3 * 3600000;
  return `
    <div class="item">
      <div class="top"><b>${esc(b.selection)} @ ${b.odds}</b><span class="tag ${b.status}">${b.status}${res ? ` ${gbp(b.profit)}` : ''}</span></div>
      <span class="muted small">${esc(b.fixture)}${b.score ? ` (${b.score})` : ''} · ${esc(b.league)} · ${when(b.commence)}</span>
      <span class="muted small">${b.account} · ${esc(b.market)} · ${gbp(b.stake)} at ${esc(b.book ?? '—')} · model ${pct(b.modelProb)} v fair ${pct(b.fairProb)} · EV ${signPct(b.ev)}</span>
      ${overdue ? `<div class="row small"><span class="muted grow">No score yet. Settle by hand?</span>${['won', 'lost', 'void'].map((r) => `<button data-act="settle" data-id="${b.id}" data-r="${r}">${r[0].toUpperCase() + r.slice(1)}</button>`).join('')}</div>` : ''}
    </div>`;
}

function betsView() {
  const filters = { active: ['open', 'pending'], settled: ['won', 'lost', 'void'], other: ['skipped', 'expired'] };
  const bets = state.bets.filter((b) => filters[betFilter].includes(b.status));
  return `
    <div class="row">${Object.keys(filters).map((f) => `<button data-act="filter" data-f="${f}" class="${f === betFilter ? 'primary' : ''}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div>
    <div class="list">${bets.map(betItem).join('') || '<p class="muted">No bets here.</p>'}</div>`;
}

function marketTable(m) {
  return `
    <p class="small"><b>${esc(m.market)}</b> · margin ${m.marginPct.toFixed(1)}% · ${m.confidence}${m.reason ? ` · <span class="muted">${esc(m.reason)}</span>` : ''}</p>
    <div class="scroll"><table>
      <tr><th>Pick</th><th>Odds</th><th>Fair</th><th>Model</th><th>EV</th><th>Stake</th></tr>
      ${m.evaluations.map((e) => `<tr class="${e.value ? 'value' : ''}"><td>${esc(e.selection)}</td><td>${e.odds}</td><td>${pct(e.fairProb)}</td><td>${pct(e.modelProb)}</td><td>${signPct(e.ev)}</td><td>${pct(e.stakeFraction, 2)}</td></tr>`).join('')}
    </table></div>`;
}

function expectedText(x) {
  if (!x) return '';
  if (x.unit === 'Elo') return ` · Elo ${Math.round(x.home)}–${Math.round(x.away)}`;
  if (x.unit.startsWith('leg win')) return ` · legs ${pct(x.home)} on throw, ${pct(x.away)} against`;
  return ` · ${x.unit} ${x.home.toFixed(x.unit === 'pts' ? 1 : 2)}–${x.away.toFixed(x.unit === 'pts' ? 1 : 2)}`;
}

function boardView() {
  const rows = state.lastEval;
  return `
    <div class="card"><h2>Board <span class="right">${rows.length} fixtures · ${ago(state.lastRun)}</span></h2>
      <p class="muted">Every priced fixture from the last cycle. One bet at most per fixture, so legs never correlate.</p>
      <div class="list">${rows.map((r) => `
        <details class="item">
          <summary>
            <div class="top"><b>${esc(r.home)} v ${esc(r.away)}</b><span class="tag ${r.best ? 'won' : ''}">${r.best ? `${esc(r.best.selection)} ${signPct(r.best.ev)}` : 'No bet'}</span></div>
            <span class="muted small">${esc(r.league)} · ${when(r.commence)}${expectedText(r.expected)}${r.note ? ` · ${esc(r.note)}` : ''}</span>
            ${r.reason ? `<span class="muted small">${esc(r.reason)}</span>` : ''}
          </summary>
          ${r.markets.map(marketTable).join('')}
        </details>`).join('') || '<p class="muted">Run a cycle to fill the board.</p>'}
      </div>
    </div>
    ${calculatorCard()}`;
}

let calcType = 'football';
const calc = {
  football: { lambda: 1.5, mu: 1.1, home: '', draw: '', away: '', over: '', under: '', yes: '', no: '' },
  darts: { aAvg: 98, aCo: 41, bAvg: 94, bCo: 39, format: 'legs:6', starter: 'bull', home: '', away: '', hLine: '-1.5', hHome: '', hAway: '', tLine: '9.5', over: '', under: '' },
  tennis: { pa: 0.65, pb: 0.62, bestOf: 3, home: '', away: '', hLine: '-2.5', hHome: '', hAway: '', tLine: '22.5', over: '', under: '' },
};

function calcOutput() {
  const c = calc[calcType];
  const n = (k) => Number(c[k]);
  const two = (a, b) => n(a) > 1 && n(b) > 1;
  const opts = engineOptions(state.settings);
  if (calcType === 'football') {
    const prices = {};
    if (n('home') && n('draw') && n('away')) prices.h2h = { home: n('home'), draw: n('draw'), away: n('away') };
    if (two('over', 'under')) prices.totals = { line: 2.5, over: n('over'), under: n('under') };
    if (two('yes', 'no')) prices.btts = { yes: n('yes'), no: n('no') };
    if (!(n('lambda') > 0 && n('mu') > 0 && Object.keys(prices).length)) return '';
    const ev = evaluateFixture({ lambda: n('lambda'), mu: n('mu') }, prices, opts);
    return `<p class="muted small">Top scores: ${ev.probabilities.topScores.map((x) => `${x.score} ${pct(x.prob)}`).join(' · ')}</p>${ev.markets.map(marketTable).join('')}`;
  }
  const prices = {};
  if (two('home', 'away')) prices.h2h = { home: n('home'), away: n('away') };
  if (two('hHome', 'hAway')) prices.spreads = { line: n('hLine'), home: n('hHome'), away: n('hAway') };
  if (two('over', 'under')) prices.totals = { line: n('tLine'), over: n('over'), under: n('under') };
  if (calcType === 'darts') {
    const ev = evaluateDarts({ average: n('aAvg'), checkout: n('aCo') / 100 }, { average: n('bAvg'), checkout: n('bCo') / 100 }, parseFormat(c.format), prices, { ...opts, starter: c.starter });
    return `<p class="small"><b>Player A ${pct(ev.pA)}</b> · legs won ${pct(ev.legs.hold)} on throw, ${pct(ev.legs.break)} against</p>
      <p class="muted small">Likely scores (${ev.unit}): ${ev.topScores.map((x) => `${x.score} ${pct(x.prob)}`).join(' · ')}</p>${ev.markets.map(marketTable).join('')}`;
  }
  const ev = evaluateTennis(n('pa'), n('pb'), n('bestOf'), prices, opts);
  const sets = [...ev.sets].sort((x, y) => y.p - x.p).map((x) => `${x.a}-${x.b} ${pct(x.p)}`).join(' · ');
  return `<p class="small"><b>Player A ${pct(ev.pA)}</b> · sets ${pct(ev.pSet)}</p><p class="muted small">Set scores: ${sets}</p>${ev.markets.map(marketTable).join('')}`;
}

function calculatorCard() {
  const c = calc[calcType];
  const f = (k, label) => `<label class="field">${label}<input inputmode="decimal" data-calc="${k}" value="${esc(c[k])}"></label>`;
  let out;
  try { out = calcOutput(); } catch (e) { out = `<p class="bad small">${esc(e.message)}</p>`; }
  const fields = {
    football: `${f('lambda', 'Home xG (λ)')}${f('mu', 'Away xG (μ)')}${f('home', 'Home odds')}${f('draw', 'Draw odds')}${f('away', 'Away odds')}${f('over', 'Over 2.5')}${f('under', 'Under 2.5')}${f('yes', 'BTTS Yes')}${f('no', 'BTTS No')}`,
    darts: `${f('aAvg', 'A 3-dart avg')}${f('aCo', 'A checkout %')}${f('bAvg', 'B 3-dart avg')}${f('bCo', 'B checkout %')}${f('format', 'Format (legs:6, sets:4:3)')}
      <label class="field">First throw<select data-calc="starter">${['bull', 'A', 'B'].map((x) => `<option value="${x}" ${c.starter === x ? 'selected' : ''}>${x === 'bull' ? 'Unknown (bull)' : `Player ${x}`}</option>`).join('')}</select></label>
      ${f('home', 'A odds')}${f('away', 'B odds')}${f('hLine', 'A handicap (legs)')}${f('hHome', 'A handicap odds')}${f('hAway', 'B handicap odds')}${f('tLine', 'Total legs line')}${f('over', 'Over odds')}${f('under', 'Under odds')}`,
    tennis: `${f('pa', 'A serve points won (0.65)')}${f('pb', 'B serve points won')}
      <label class="field">Best of<select data-calc="bestOf">${[3, 5].map((x) => `<option ${Number(c.bestOf) === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      ${f('home', 'A odds')}${f('away', 'B odds')}${f('hLine', 'A games handicap')}${f('hHome', 'A handicap odds')}${f('hAway', 'B handicap odds')}${f('tLine', 'Total games line')}${f('over', 'Over odds')}${f('under', 'Under odds')}`,
  };
  const help = {
    football: 'Expected goals and any prices.',
    darts: 'Averages and checkout % from DartsDatabase or Darts Orakel (last 12 months is a good window). Sets formats price sets, not legs.',
    tennis: 'Serve points won for each player on this surface (Tennis Abstract has them). Standard tie-break at 6-6 in every set.',
  };
  return `
    <div class="card"><h2>Manual check</h2>
      <div class="row">${['football', 'darts', 'tennis'].map((k) => `<button data-act="calc" data-k="${k}" class="${k === calcType ? 'primary' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
      <p class="muted">${help[calcType]} Stakes are % of bankroll after caps.</p>
      <div class="fields">${fields[calcType]}</div>
      <div id="calc-out">${out}</div>
    </div>`;
}

function moneyView() {
  const acctBlock = (acct) => {
    const a = state.accounts[acct];
    const locked = acct === 'real' && !validationGate(state).passed;
    return `
      <div class="card">
        <h2>${acct === 'paper' ? 'Paper' : 'Real'} account <span class="right">${gbp(equity(state, acct))}</span></h2>
        ${acct === 'real' ? `<p class="muted">Real money sits with your bookmaker. Record what you deposit and withdraw there, so stakes are sized on the true balance.${locked ? ' The real account bets only after the gate passes.' : ''}</p>` : '<p class="muted">Practice capital. Cycles bet it automatically to build the record the gate needs.</p>'}
        <div class="row"><input class="grow" inputmode="decimal" placeholder="Amount £" id="amt-${acct}" style="width:auto"><button class="primary" data-act="deposit" data-acct="${acct}">Deposit</button><button data-act="withdraw" data-acct="${acct}">Withdraw</button></div>
        <p class="muted small">Free to withdraw ${gbp(a.cash)} · principal ${gbp(a.principal)}</p>
        <div class="list">${a.entries.slice(0, 12).map((e) => `<div class="row between small"><span>${esc(e.note)} <span class="muted">${when(e.t)}</span></span><b class="${e.amount >= 0 ? 'good' : ''}">${gbp(e.amount)}</b></div>`).join('') || '<p class="muted small">No entries.</p>'}</div>
      </div>`;
  };
  const s = state.settings;
  return `
    ${acctBlock('paper')}
    ${acctBlock('real')}
    <div class="card"><h2>Money rules</h2>
      <ul class="small" style="margin:0;padding-left:20px">
        <li>Profit sweep: when an account is up ${s.profitLockPct}% on principal, the profit is withdrawn.</li>
        <li>Stop-loss: down ${s.stopLossPct}% on principal halts betting.</li>
        <li>Daily loss limit ${s.dailyLossLimitPct}%. Caps: ${s.maxStakePct}% a bet, ${s.maxEventPct}% a fixture, ${s.maxDayPct}% a day, ${s.maxWeekPct}% a week.</li>
        <li>Stakes halve past 10% drawdown and quarter past 20%.</li>
      </ul>
      <p class="muted small">Only bet money you can afford to lose. If betting stops being fun: GAMSTOP (gamstop.co.uk), GamCare 0808 8020 133, BeGambleAware.org.</p>
    </div>
    <div class="card"><h2>Data</h2>
      <p class="muted">Export to move your state to <code>run.mjs</code> (save as massa-state.json), or import its file back.</p>
      <div class="row"><button data-act="export">Export</button><label class="btn">Import<input type="file" accept="application/json" id="import" hidden></label></div>
    </div>`;
}

const MODEL_LABEL = { football: 'Dixon-Coles', points: 'points model', goals: 'goals model', darts: 'leg model / Elo', elo: 'Elo' };

function otherSports() {
  const list = state.sportsList?.length ? state.sportsList.map((x) => [x.key, `${x.group}: ${x.title}`]) : COMMON_SPORTS;
  const keys = new Set(list.map(([k]) => k));
  const extra = state.settings.sports.filter((k) => !LEAGUES[k] && !keys.has(k)).map((k) => [k, k]);
  return [...list.filter(([k]) => !LEAGUES[k] && sportConfig(k)), ...extra];
}

function settingsView() {
  const s = state.settings;
  const gate = { passed: gateSports().some((k) => validationGate(state, k).passed) };
  const num = (k, label, step = 'any') => `<label class="field">${label}<input type="number" step="${step}" data-set="${k}" value="${s[k]}"></label>`;
  return `
    <div class="card"><h2>Mode</h2>
      <label class="check"><input type="radio" name="mode" data-set="mode" value="paper" ${s.mode === 'paper' ? 'checked' : ''}> Paper: bets placed automatically on practice capital</label>
      <label class="check"><input type="radio" name="mode" data-set="mode" value="real" ${s.mode === 'real' ? 'checked' : ''} ${gate.passed ? '' : 'disabled'}> Real: cycles list bets for you to place, for sports whose gate has passed${gate.passed ? '' : ' (no sport has passed yet)'}</label>
      <p class="muted small">MASSA never logs in to a bookmaker or moves money. UK bookmakers have no public API for bets, deposits or withdrawals, and their terms ban bots.</p>
    </div>
    <div class="card"><h2>Odds feed</h2>
      <label class="field">The Odds API key<input type="password" autocomplete="off" data-set="apiKey" value="${esc(s.apiKey)}" placeholder="the-odds-api.com"></label>
      <p class="muted small">Each sport costs one request per market a cycle, plus 2 for scores (other sports fetch scores every cycle to learn). The free plan has 500 a month: pick a few.</p>
      <div class="row">${['h2h', 'spreads', 'totals'].map((m) => `<label class="check"><input type="checkbox" data-market="${m}" ${s.markets.includes(m) ? 'checked' : ''}> ${{ h2h: 'Match', spreads: 'Handicap', totals: 'Totals' }[m]}</label>`).join('')}</div>
      <h3>Football</h3>
      <div class="list">${Object.entries(LEAGUES).map(([k, l]) => `<label class="check"><input type="checkbox" data-league="${k}" ${s.sports.includes(k) ? 'checked' : ''}> ${esc(l.name)}</label>`).join('')}</div>
      <h3>Other sports</h3>
      <div class="list">${otherSports().map(([k, title]) => { const cfg = sportConfig(k); return `<label class="check"><input type="checkbox" data-league="${k}" ${s.sports.includes(k) ? 'checked' : ''}> ${esc(title)} <span class="muted small">${cfg ? MODEL_LABEL[cfg.kind] : ''}</span></label>`; }).join('')}</div>
      <button data-act="sports">Load all in-season sports</button>
      <label class="field">Bookmakers you hold accounts with (Odds API keys, comma separated; blank = all)<input data-set="bookmakers" value="${esc(s.bookmakers.join(', '))}" placeholder="williamhill, paddypower, betfair_ex_uk"></label>
    </div>
    <div class="card"><h2>Darts</h2>
      <p class="muted">Players in this table are priced with the leg model; others fall back to Elo from results. One per line: name as the odds feed spells it, 3-dart average, checkout %.</p>
      <textarea data-set="dartsPlayers" rows="6" placeholder="Luke Littler, 102.1, 43&#10;Luke Humphries, 98.4, 41">${esc(s.dartsPlayers)}</textarea>
      <label class="field">Match format for automated cycles<input data-set="dartsFormat" value="${esc(s.dartsFormat)}" placeholder="legs:6 or sets:4:3"></label>
    </div>
    <div class="card"><h2>Results history</h2>
      <p class="muted">Sports other than football learn from results. Cycles add the last 3 days each time; to start faster, paste past results (date, home, away, home score, away score, one per line).</p>
      ${Object.entries(state.results).map(([k, r]) => `<p class="small">${esc(sportName(k))}: ${r.length} results, latest ${esc(r[r.length - 1]?.date ?? '—')}</p>`).join('')}
      <label class="field">Sport<select id="res-sport">${s.sports.filter((k) => sportConfig(k)?.kind !== 'football').map((k) => `<option value="${k}">${esc(sportName(k))}</option>`).join('')}</select></label>
      <textarea id="res-text" rows="4" placeholder="2026-03-01, Lakers, Celtics, 112, 108"></textarea>
      <button data-act="import-results">Add results</button>
    </div>
    <div class="card"><h2>Model and staking</h2>
      <div class="fields">
        ${num('minEv', 'Min EV (0.02 = 2%)')}${num('maxMarginPct', 'Max margin %')}${num('kellyFraction', 'Kelly fraction')}
        ${num('maxStakePct', 'Max % a bet')}${num('maxEventPct', 'Max % a fixture')}${num('maxDayPct', 'Max % a day')}
        ${num('maxWeekPct', 'Max % a week')}${num('minStake', 'Min stake £')}${num('rho', 'Dixon-Coles ρ')}
        ${num('horizonHours', 'Window (h)', 1)}${num('minGames', 'Min rated games', 1)}${num('autoHours', 'Run every (h)')}
        ${num('profitLockPct', 'Profit sweep %')}${num('stopLossPct', 'Stop-loss %')}${num('dailyLossLimitPct', 'Daily loss %')}
        ${num('gateMinBets', 'Gate: paper bets', 1)}
      </div>
      <label class="field">De-vig method<select data-set="devig"><option value="power" ${s.devig === 'power' ? 'selected' : ''}>Power</option><option value="proportional" ${s.devig === 'proportional' ? 'selected' : ''}>Proportional</option></select></label>
      <div class="row"><button data-act="defaults">Restore defaults</button><button data-act="ratings">Refresh ratings next cycle</button></div>
    </div>
    <div class="card"><h2>Ratings</h2>
      ${Object.entries(state.ratings).map(([k, r]) => `<p class="small">${esc(sportName(k))}: ${r.players
        ? `Elo, ${Object.keys(r.players).length} players from ${r.matches} results`
        : `${r.matches} games, ${Object.keys(r.teams).length} teams, home ${r.league.avgHomeGoals.toFixed(2)} / away ${r.league.avgAwayGoals.toFixed(2)} a game`} · ${ago(r.fetchedAt)}</p>`).join('') || '<p class="muted">Fitted on the first cycle: football from football-data.co.uk, other sports from their results history.</p>'}
    </div>
    <div class="card"><h2>Reset</h2><button class="danger" data-act="reset">Delete all MASSA data</button></div>`;
}

const VIEWS = { home: homeView, bets: betsView, board: boardView, money: moneyView, settings: settingsView };

function render() {
  const real = state.settings.mode === 'real';
  const pill = $('#mode-pill');
  pill.textContent = real ? 'Real (gated)' : 'Paper';
  pill.className = `pill ${real ? 'real' : 'paper'}`;
  $('#main').innerHTML = VIEWS[tab]();
  $('#nav').innerHTML = TABS.map(([k, label, icon]) => `<button data-tab="${k}" ${k === tab ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24">${icon}</svg>${label}</button>`).join('');
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab],[data-act]');
  if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const act = t.dataset.act;
  const acct = t.dataset.acct;
  try {
    if (act === 'run') return void cycle(true);
    if (act === 'filter') betFilter = t.dataset.f;
    if (act === 'deposit' || act === 'withdraw') {
      const amount = Number($(`#amt-${acct}`).value);
      if (act === 'deposit') deposit(state, acct, amount); else withdraw(state, acct, amount, 'Withdrawal');
      toast(`${act === 'deposit' ? 'Deposited' : 'Withdrew'} ${gbp(amount)}`);
    }
    if (act === 'placed') {
      const b = state.bets.find((x) => x.id === t.dataset.id);
      const got = prompt(`Odds you got for ${b.selection}?`, b.odds);
      if (got === null) return;
      confirmPlaced(state, b.id, { odds: Number(got) || b.odds });
    }
    if (act === 'skip') skipPending(state, t.dataset.id);
    if (act === 'settle') {
      if (!confirm(`Mark this bet ${t.dataset.r}?`)) return;
      manualSettle(state, t.dataset.id, t.dataset.r);
    }
    if (act === 'calc') { calcType = t.dataset.k; render(); return; }
    if (act === 'sports') return void loadSports();
    if (act === 'import-results') {
      const sport = $('#res-sport')?.value;
      if (!sport) throw new Error('Tick a non-football sport first');
      const rows = parseGenericResults($('#res-text').value);
      if (!rows.length) throw new Error('No lines matched: date, home, away, home score, away score');
      const added = addResults(state, sport, rows);
      delete state.ratings[sport];
      toast(`Added ${added} results (${rows.length - added} already there).`);
    }
    if (act === 'rebase') {
      if (!confirm('Reset principal to today\'s balance and resume betting?')) return;
      rebaseAndResume(state, acct);
    }
    if (act === 'defaults') {
      const keep = { apiKey: state.settings.apiKey, sports: state.settings.sports, bookmakers: state.settings.bookmakers, mode: state.settings.mode };
      state.settings = { ...DEFAULT_SETTINGS, ...keep };
    }
    if (act === 'ratings') { state.ratings = {}; toast('Ratings will be refitted on the next cycle.'); }
    if (act === 'export') {
      const blob = new Blob([JSON.stringify({ ...state, settings: { ...state.settings, apiKey: '' } }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'massa-state.json';
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    if (act === 'reset') {
      if (!confirm('Delete every bet, balance and setting?')) return;
      state = newState();
    }
    save();
    render();
  } catch (err) {
    toast(err.message);
  }
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'import' && t.files[0]) {
    try {
      const s = JSON.parse(await t.files[0].text());
      if (!s.accounts || !s.bets) throw new Error('Not a MASSA state file');
      const apiKey = state.settings.apiKey;
      state = { ...newState(), ...s, results: s.results ?? {}, settings: { ...DEFAULT_SETTINGS, ...s.settings } };
      if (!state.settings.apiKey) state.settings.apiKey = apiKey;
      save(); render(); toast('Imported.');
    } catch (err) { toast(err.message); }
    return;
  }
  if (t.dataset.market) {
    const set = new Set(state.settings.markets);
    if (t.checked) set.add(t.dataset.market); else set.delete(t.dataset.market);
    state.settings.markets = ['h2h', 'spreads', 'totals'].filter((m) => set.has(m));
  } else if (t.dataset.calc) {
    if (t.tagName !== 'SELECT') return; // text inputs update live on 'input'
    calc[calcType][t.dataset.calc] = t.value;
    render();
    return;
  } else if (t.dataset.league) {
    const set = new Set(state.settings.sports);
    if (t.checked) set.add(t.dataset.league); else set.delete(t.dataset.league);
    state.settings.sports = [...set];
  } else if (t.dataset.set) {
    const k = t.dataset.set;
    if (k === 'dartsFormat') { try { parseFormat(t.value); } catch (err) { return toast(err.message); } }
    if (k === 'bookmakers') state.settings[k] = t.value.split(',').map((x) => x.trim()).filter(Boolean);
    else if (typeof DEFAULT_SETTINGS[k] === 'number') {
      const v = Number(t.value);
      if (!Number.isFinite(v)) return toast('Enter a number');
      state.settings[k] = v;
    } else state.settings[k] = t.value.trim();
  } else return;
  save();
  render();
});

// The calculator updates its output without re-rendering, so typing keeps focus.
document.addEventListener('input', (e) => {
  const k = e.target.dataset.calc;
  if (!k || e.target.tagName === 'SELECT') return;
  calc[calcType][k] = e.target.value;
  try { $('#calc-out').innerHTML = calcOutput(); } catch (err) { $('#calc-out').innerHTML = `<p class="bad small">${esc(err.message)}</p>`; }
});

async function loadSports() {
  if (!state.settings.apiKey) return toast('Add an Odds API key first.');
  try {
    state.sportsList = (await fetchSports(fetch.bind(window), state.settings.apiKey)).filter((x) => sportConfig(x.key));
    save(); render();
    toast(`${state.sportsList.length} sports in season.`);
  } catch (err) { toast(err.message); }
}

document.addEventListener('visibilitychange', autoTick);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
render();
autoTick();
setInterval(autoTick, 5 * 60000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
