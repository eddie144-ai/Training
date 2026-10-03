/* MASSA app: runs the automated cycle while open, and shows the bankroll, bets, the board and settings.
   All data lives in localStorage on this device. Export/import moves it to and from run.mjs. */

import { evaluateFixture } from './engine.js';
import { LEAGUES } from './feeds.js';
import {
  newState, DEFAULT_SETTINGS, deposit, withdraw, equity, openStakes, validationGate, confirmPlaced, skipPending,
  rebaseAndResume, drawdownMultiplier,
} from './bankroll.js';
import { runCycle, activeAccount, engineOptions } from './pipeline.js';

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
    const parts = [`${r.settled} settled`, `${r.placed.length} ${r.account === 'paper' ? 'paper bets placed' : 'bets to place'}`];
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
      <h2>${acct === 'paper' ? 'Paper account' : 'Real account'} <span class="right">${activeAccount(state) === acct ? 'Active' : ''}</span></h2>
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

function gateCard() {
  const g = validationGate(state);
  return `
    <div class="card ${g.passed ? '' : 'flag'}">
      <h2>Validation gate <span class="right">${g.passed ? '<span class="good">Passed</span>' : 'Locked'}</span></h2>
      <p class="muted">Real money stays locked until the paper record proves an edge (Betting Council v1.1).</p>
      <div class="list">${g.checks.map((c) => `
        <div class="row between"><span>${c.ok ? '<span class="good">✓</span>' : '<span class="muted">✗</span>'} ${esc(c.label)}</span><b>${esc(c.value)}</b></div>`).join('')}
      </div>
      <p class="muted small">Paper: ${g.n} settled, staked ${gbp(g.staked)}, profit ${gbp(g.profit)}, ROI ${pct(g.roi)}</p>
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
  return `
    <div class="item">
      <div class="top"><b>${esc(b.selection)} @ ${b.odds}</b><span class="tag ${b.status}">${b.status}${res ? ` ${gbp(b.profit)}` : ''}</span></div>
      <span class="muted small">${esc(b.fixture)}${b.score ? ` (${b.score})` : ''} · ${esc(b.league)} · ${when(b.commence)}</span>
      <span class="muted small">${b.account} · ${gbp(b.stake)} at ${esc(b.book ?? '—')} · model ${pct(b.modelProb)} v fair ${pct(b.fairProb)} · EV ${signPct(b.ev)}</span>
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

function boardView() {
  const rows = state.lastEval;
  return `
    <div class="card"><h2>Board <span class="right">${rows.length} fixtures · ${ago(state.lastRun)}</span></h2>
      <p class="muted">Every priced fixture from the last cycle. One bet at most per fixture, so legs never correlate.</p>
      <div class="list">${rows.map((r) => `
        <details class="item">
          <summary>
            <div class="top"><b>${esc(r.home)} v ${esc(r.away)}</b><span class="tag ${r.best ? 'won' : ''}">${r.best ? `${esc(r.best.selection)} ${signPct(r.best.ev)}` : 'No bet'}</span></div>
            <span class="muted small">${esc(r.league)} · ${when(r.commence)}${r.xg ? ` · xG ${r.xg.home.toFixed(2)}–${r.xg.away.toFixed(2)}` : ''}</span>
            ${r.reason ? `<span class="muted small">${esc(r.reason)}</span>` : ''}
          </summary>
          ${r.markets.map(marketTable).join('')}
        </details>`).join('') || '<p class="muted">Run a cycle to fill the board.</p>'}
      </div>
    </div>
    ${calculatorCard()}`;
}

let calc = { lambda: 1.5, mu: 1.1, home: '', draw: '', away: '', over: '', under: '', yes: '', no: '' };

function calculatorCard() {
  const f = (k, label) => `<label class="field">${label}<input inputmode="decimal" data-calc="${k}" value="${esc(calc[k])}"></label>`;
  let out = '';
  try {
    const n = (k) => Number(calc[k]);
    const prices = {};
    if (n('home') && n('draw') && n('away')) prices.h2h = { home: n('home'), draw: n('draw'), away: n('away') };
    if (n('over') && n('under')) prices.totals = { line: 2.5, over: n('over'), under: n('under') };
    if (n('yes') && n('no')) prices.btts = { yes: n('yes'), no: n('no') };
    if (n('lambda') > 0 && n('mu') > 0 && Object.keys(prices).length) {
      const ev = evaluateFixture({ lambda: n('lambda'), mu: n('mu') }, prices, engineOptions(state.settings));
      out = `<p class="muted small">Top scores: ${ev.probabilities.topScores.map((s) => `${s.score} ${pct(s.prob)}`).join(' · ')}</p>${ev.markets.map(marketTable).join('')}`;
    }
  } catch (e) { out = `<p class="bad small">${esc(e.message)}</p>`; }
  return `
    <div class="card"><h2>Manual check</h2>
      <p class="muted">Enter expected goals and any prices. Stakes are % of bankroll after caps.</p>
      <div class="fields">${f('lambda', 'Home xG (λ)')}${f('mu', 'Away xG (μ)')}${f('home', 'Home odds')}${f('draw', 'Draw odds')}${f('away', 'Away odds')}${f('over', 'Over 2.5')}${f('under', 'Under 2.5')}${f('yes', 'BTTS Yes')}${f('no', 'BTTS No')}</div>
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

function settingsView() {
  const s = state.settings;
  const gate = validationGate(state);
  const num = (k, label, step = 'any') => `<label class="field">${label}<input type="number" step="${step}" data-set="${k}" value="${s[k]}"></label>`;
  return `
    <div class="card"><h2>Mode</h2>
      <label class="check"><input type="radio" name="mode" data-set="mode" value="paper" ${s.mode === 'paper' ? 'checked' : ''}> Paper: bets placed automatically on practice capital</label>
      <label class="check"><input type="radio" name="mode" data-set="mode" value="real" ${s.mode === 'real' ? 'checked' : ''} ${gate.passed ? '' : 'disabled'}> Real: cycles list bets for you to place${gate.passed ? '' : ' (locked by the gate)'}</label>
      <p class="muted small">MASSA never logs in to a bookmaker or moves money. UK bookmakers have no public API for bets, deposits or withdrawals, and their terms ban bots.</p>
    </div>
    <div class="card"><h2>Odds feed</h2>
      <label class="field">The Odds API key<input type="password" autocomplete="off" data-set="apiKey" value="${esc(s.apiKey)}" placeholder="the-odds-api.com"></label>
      <p class="muted small">Each league costs about 2 requests a cycle (4 when settling). The free plan has 500 a month.</p>
      <div class="list">${Object.entries(LEAGUES).map(([k, l]) => `<label class="check"><input type="checkbox" data-league="${k}" ${s.sports.includes(k) ? 'checked' : ''}> ${esc(l.name)}</label>`).join('')}</div>
      <label class="field">Bookmakers you hold accounts with (Odds API keys, comma separated; blank = all)<input data-set="bookmakers" value="${esc(s.bookmakers.join(', '))}" placeholder="williamhill, paddypower, betfair_ex_uk"></label>
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
      ${Object.entries(state.ratings).map(([k, r]) => `<p class="small">${esc(LEAGUES[k]?.name ?? k)}: ${r.matches} matches, ${Object.keys(r.teams).length} teams, home ${r.league.avgHomeGoals.toFixed(2)} / away ${r.league.avgAwayGoals.toFixed(2)} goals · ${ago(r.fetchedAt)}</p>`).join('') || '<p class="muted">Fitted on the first cycle from football-data.co.uk results.</p>'}
    </div>
    <div class="card"><h2>Reset</h2><button class="danger" data-act="reset">Delete all MASSA data</button></div>`;
}

const VIEWS = { home: homeView, bets: betsView, board: boardView, money: moneyView, settings: settingsView };

function render() {
  const acct = activeAccount(state);
  const pill = $('#mode-pill');
  pill.textContent = acct === 'real' ? 'Real' : 'Paper';
  pill.className = `pill ${acct}`;
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
      state = { ...newState(), ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings } };
      if (!state.settings.apiKey) state.settings.apiKey = apiKey;
      save(); render(); toast('Imported.');
    } catch (err) { toast(err.message); }
    return;
  }
  if (t.dataset.league) {
    const set = new Set(state.settings.sports);
    if (t.checked) set.add(t.dataset.league); else set.delete(t.dataset.league);
    state.settings.sports = [...set];
  } else if (t.dataset.set) {
    const k = t.dataset.set;
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
  if (!k) return;
  calc[k] = e.target.value;
  const html = calculatorCard();
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  $('#calc-out').innerHTML = tmp.querySelector('#calc-out').innerHTML;
});

document.addEventListener('visibilitychange', autoTick);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
render();
autoTick();
setInterval(autoTick, 5 * 60000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
