'use strict';
/* Council: personal therapy and life app.
   Daily commitments, goals, projects, Council sessions and a mirror that compares words with actions.
   All data lives in localStorage on this device. Content is in data.js. */

// ===========================================================================
// Constants
// ===========================================================================
const STORE_KEY = 'council.v1';
// Shredded Trainer is the daily log since 5 Oct 2026; the original Trainer is the fallback. Read-only.
const TRAINER_KEYS = ['shtrainer.v1', 'trainer.v1'];
const START_MIN = 10; // The Start button's timer. Small on purpose: starting is the expensive part.

const TABS = [
  ['today', 'Today', '<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/><circle cx="12" cy="12" r="4"/>'],
  ['goals', 'Goals', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>'],
  ['council', 'Council', '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="4" r="1.6"/><circle cx="19" cy="8.5" r="1.6"/><circle cx="19" cy="15.5" r="1.6"/><circle cx="12" cy="20" r="1.6"/><circle cx="5" cy="15.5" r="1.6"/><circle cx="5" cy="8.5" r="1.6"/>'],
  ['mirror', 'Mirror', '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
  ['me', 'Me', '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'],
];

// ===========================================================================
// Helpers
// ===========================================================================
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };
const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (s) => { const d = parseDate(s); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
const fmtShort = (s) => { const d = parseDate(s); return `${d.getDate()} ${MON[d.getMonth()]}`; };
const relDay = (s) => { const n = daysBetween(today(), s); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : fmtDate(s); };
const mondayOf = (s) => { const d = parseDate(s); return addDays(s, -((d.getDay() + 6) % 7)); };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const minutesOf = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const mean = (arr) => (arr.length ? sum(arr) / arr.length : null);
const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${pad(Math.round(m % 60))}m` : `${Math.round(m)}m`);
const fmtClock = (ms) => { const neg = ms < 0; const s = Math.floor(Math.abs(ms) / 1000); return `${neg ? '+' : ''}${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
const dom = (id) => DOMAINS.find((d) => d.id === id) || DOMAINS[DOMAINS.length - 1];
const range = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };

// ===========================================================================
// State
// ===========================================================================
function freshState() {
  const t = today();
  return {
    v: 1,
    created: t,
    notice: 'welcome',
    settings: { highContrast: false, wip: 2, coolDays: 7, councilMin: 15, worryAt: '19:00', reviewAt: '18:00', maxDaily: 3, trainer: true },
    priorities: DOMAINS.map((d) => d.id),
    vision: VISION_SEED,
    rules: [...RULES_SEED],
    goals: [],
    projects: PROJECT_SEED.map((p) => ({ id: uid(), status: 'vault', created: addDays(t, -30), seed: true, done: '', kill: '', deadline: '', next: '', ...p })),
    commits: [],
    days: {},
    sessions: [],
    records: [],
    worries: [],
    postpones: [],
    evidence: EVIDENCE_SEED.map(([domain, text]) => ({ id: uid(), date: null, domain, text, seed: true })),
    weeks: {},
    timer: null,
    draft: null,
  };
}

function normalise(s) {
  const d = freshState();
  if (!s || typeof s !== 'object') return d;
  const out = { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
  for (const k of ['goals', 'projects', 'commits', 'sessions', 'records', 'worries', 'postpones', 'evidence', 'rules']) if (!Array.isArray(out[k])) out[k] = d[k];
  for (const k of ['days', 'weeks']) if (!out[k] || typeof out[k] !== 'object') out[k] = {};
  const known = new Set(DOMAINS.map((x) => x.id));
  out.priorities = [...new Set((out.priorities || []).filter((x) => known.has(x)))];
  for (const x of DOMAINS) if (!out.priorities.includes(x.id)) out.priorities.push(x.id);
  return out;
}

let storageOk = true;
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? normalise(JSON.parse(raw)) : freshState();
  } catch {
    storageOk = false;
    return freshState();
  }
}
let S = load();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); storageOk = true; } catch { storageOk = false; }
}
const dayRec = (date) => (S.days[date] ||= {});

// ===========================================================================
// Trainer bridge (read-only). Works when both apps are served from the same site.
// ===========================================================================
let trainerCache = null;
function trainer() {
  if (trainerCache) return trainerCache;
  let t = null;
  if (S.settings.trainer) {
    try { for (const k of TRAINER_KEYS) { const raw = localStorage.getItem(k); if (raw) { t = JSON.parse(raw); break; } } } catch { t = null; }
  }
  const sleep = new Map((t?.sleep || []).map((x) => [x.date, Number(x.hours)]));
  const trained = new Set((t?.workouts || []).map((w) => w.date));
  const weights = [...(t?.weights || [])].sort((a, b) => a.date.localeCompare(b.date));
  trainerCache = {
    ok: !!t,
    sleep: (d) => (sleep.has(d) ? sleep.get(d) : null),
    steps: (d) => t?.days?.[d]?.steps ?? null,
    trained: (d) => (t ? trained.has(d) : null),
    weight: weights.length ? weights[weights.length - 1] : null,
    weight7: (() => { const from = addDays(today(), -6); const w = weights.filter((x) => x.date >= from).map((x) => Number(x.kg)); return w.length ? mean(w) : null; })(),
  };
  return trainerCache;
}
const sleepOf = (d) => S.days[d]?.sleep ?? trainer().sleep(d);
const trainedOf = (d) => (S.days[d]?.trained != null ? S.days[d].trained : trainer().trained(d));

// ===========================================================================
// Commitments and the Say/Do score
// ===========================================================================
// Kept = done. Broken = missed, or still open after its day. Retracted = killed on or before its day,
// which is honest renegotiation and doesn't count against you. Killed after the day counts as broken.
function outcome(c, t = today()) {
  if (c.status === 'done') return 'kept';
  if (c.status === 'missed') return 'broken';
  if (c.status === 'killed') return (c.resolvedAt || '9999') <= c.date ? 'retracted' : 'broken';
  return c.date < t ? 'broken' : 'pending';
}
function sayDo(from, to) {
  const list = S.commits.filter((c) => c.date >= from && c.date <= to);
  const kept = list.filter((c) => outcome(c) === 'kept').length;
  const broken = list.filter((c) => outcome(c) === 'broken').length;
  const retracted = list.filter((c) => outcome(c) === 'retracted').length;
  return { kept, broken, retracted, n: kept + broken, rate: kept + broken ? kept / (kept + broken) : null };
}
const commitsOn = (d) => S.commits.filter((c) => c.date === d && !c.week);
const weekCommits = (mon) => S.commits.filter((c) => c.week && c.date >= mon && c.date <= addDays(mon, 6));
const oneOn = (d) => S.commits.find((c) => c.date === d && c.one && c.status !== 'killed');
function oneResult(d) {
  const c = oneOn(d);
  if (!c) return null;
  const o = outcome(c);
  return o === 'kept' ? 1 : o === 'broken' ? 0 : null;
}
const unresolved = () => S.commits.filter((c) => c.status === 'open' && c.date < today()).sort((a, b) => a.date.localeCompare(b.date));
const activeToday = () => commitsOn(today()).filter((c) => c.status !== 'killed');

function addCommit(fields) {
  const c = { id: uid(), status: 'open', postponed: 0, created: new Date().toISOString(), domain: 'mind', ...fields };
  c.origDate = c.date;
  if (c.one) S.commits.filter((x) => x.date === c.date && x.one && x.id !== c.id).forEach((x) => { x.one = false; });
  S.commits.push(c);
  return c;
}
function resolve(c, status) {
  c.status = status;
  c.resolvedAt = status === 'open' ? null : today();
}

// ===========================================================================
// Time logs
// ===========================================================================
const sessionsOn = (d) => S.sessions.filter((x) => x.date === d);
const buildMin = (d) => sum(sessionsOn(d).map((x) => x.min)) + (S.days[d]?.build || 0);
const consumeMin = (d) => S.days[d]?.consume || 0;
const worriesOn = (d) => S.worries.filter((w) => w.date === d);
const hasData = (d) => { const r = S.days[d]; return !!(r && (r.checkAt || r.reviewAt)) || sessionsOn(d).length > 0; };

function lastTouched(p) {
  const ids = new Set(S.commits.filter((c) => c.projectId === p.id).map((c) => c.id));
  const dates = [
    ...S.sessions.filter((x) => ids.has(x.commitId)).map((x) => x.date),
    ...S.commits.filter((c) => c.projectId === p.id && c.status === 'done').map((c) => c.resolvedAt || c.date),
  ];
  return dates.sort().pop() || null;
}

// ===========================================================================
// Mirror: hypotheses, patterns and words vs actions
// ===========================================================================
function testHypothesis(h) {
  const t = today();
  const from = [S.created, addDays(t, -120)].sort().pop();
  const A = [], B = [];
  for (const d of range(from, t)) {
    let g = null;
    const r = S.days[d] || {};
    switch (h.id) {
      case 'sleep': { const s = sleepOf(d); g = s == null ? null : s < 7; break; }
      case 'consume': g = hasData(d) && (buildMin(d) || consumeMin(d)) ? consumeMin(d) > buildMin(d) : null; break;
      case 'train': { const x = trainedOf(d); g = x == null ? null : !!x; break; }
      case 'novelty': g = r.urge == null ? null : r.urge >= 4; break;
      case 'ruminate': g = hasData(d) ? worriesOn(d).length >= 2 : null; break;
      case 'actmood': { const y = oneResult(addDays(d, -1)); g = y == null ? null : y === 1; break; }
      default: g = null;
    }
    const out = h.outcome === 'mood' ? (r.mood ?? null) : oneResult(d);
    if (g == null || out == null) continue;
    (g ? A : B).push(out);
  }
  const need = 5;
  const a = mean(A), b = mean(B);
  const res = { nA: A.length, nB: B.length, a, b };
  if (A.length < need || B.length < need) return { ...res, verdict: 'unresolved', note: `Needs ${Math.max(0, need - A.length) + Math.max(0, need - B.length)} more qualifying days.` };
  const thr = h.outcome === 'mood' ? 0.5 : 0.15;
  const diff = a - b;
  const dir = h.expect === 'lower' ? -diff : diff;
  if (dir >= thr) return { ...res, verdict: 'supported' };
  if (dir <= -thr) return { ...res, verdict: 'contradicted' };
  if (Math.abs(diff) < thr / 2 && A.length >= 10 && B.length >= 10) return { ...res, verdict: 'noeffect' };
  return { ...res, verdict: 'weak' };
}
const VERDICTS = {
  supported: ['good', 'Supported by your data'],
  contradicted: ['bad', 'Contradicted by your data'],
  noeffect: ['acc', 'No effect seen'],
  weak: ['warn', 'Weak, keep logging'],
  unresolved: ['', 'Unresolved'],
};

function patternSignal(id) {
  const t = today(), w7 = addDays(t, -6), w14 = addDays(t, -13);
  switch (id) {
    case 'novelty': {
      const n = S.projects.filter((p) => !p.seed && p.created >= w7).length;
      const shipped = S.projects.filter((p) => p.status === 'shipped').length;
      return { on: n >= 3, text: `${n} new idea${n === 1 ? '' : 's'} in 7 days. ${shipped} project${shipped === 1 ? '' : 's'} shipped in total.` };
    }
    case 'research': {
      const days = range(w7, t).filter((d) => buildMin(d) || consumeMin(d));
      const over = days.filter((d) => consumeMin(d) > buildMin(d)).length;
      if (!days.length) return { on: null, text: 'No build or consume minutes logged this week.' };
      return { on: over >= 3, text: `Consuming beat building on ${over} of ${days.length} logged days.` };
    }
    case 'tomorrow': {
      const loops = S.commits.filter((c) => c.status === 'open' && c.postponed >= 2).length;
      const moves = S.postpones.filter((d) => d >= w7).length;
      return { on: loops > 0 || moves >= 3, text: `${moves} postponement${moves === 1 ? '' : 's'} this week. ${loops} commitment${loops === 1 ? '' : 's'} moved twice or more.` };
    }
    case 'overanalysis': {
      const over = S.records.filter((r) => r.date >= w14 && r.overtime).length;
      const worries = S.worries.filter((x) => x.date >= w7).length;
      return { on: over >= 2 || worries >= 5, text: `${worries} rumination catch${worries === 1 ? '' : 'es'} this week. ${over} Council session${over === 1 ? '' : 's'} ran past the timebox in 14 days.` };
    }
    case 'inconsistency': {
      const xs = range(w7, t).map((d) => S.days[d]?.irrit).filter((x) => x != null);
      if (xs.length < 3) return { on: null, text: 'Needs 3 or more check-ins this week.' };
      const m = mean(xs);
      return { on: m >= 3.5, text: `Average irritation ${m.toFixed(1)} of 5 this week.` };
    }
    default: return { on: null, text: 'No automatic signal. Notice it yourself.' };
  }
}

function domainActions(days = 28) {
  const from = addDays(today(), -(days - 1));
  const rows = S.priorities.map((id, i) => {
    const list = S.commits.filter((c) => c.domain === id && c.date >= from && c.date <= today());
    const kept = list.filter((c) => outcome(c) === 'kept').length;
    const broken = list.filter((c) => outcome(c) === 'broken').length;
    const ids = new Set(list.map((c) => c.id));
    const min = sum(S.sessions.filter((x) => ids.has(x.commitId)).map((x) => x.min));
    return { id, rank: i + 1, kept, broken, min };
  });
  const total = sum(rows.map((r) => r.kept));
  const byAction = [...rows].sort((a, b) => b.kept - a.kept || b.min - a.min);
  rows.forEach((r) => { r.share = total ? r.kept / total : 0; r.actionRank = byAction.indexOf(r) + 1; });
  return { rows, total };
}

function weekStats(mon) {
  const end = addDays(mon, 6) < today() ? addDays(mon, 6) : today();
  const days = range(mon, end);
  const sd = sayDo(mon, addDays(mon, 6));
  const ones = days.map(oneResult).filter((x) => x != null);
  return {
    sd,
    oneHit: ones.filter((x) => x === 1).length, oneN: ones.length,
    build: sum(days.map(buildMin)), consume: sum(days.map(consumeMin)),
    worries: S.worries.filter((w) => w.date >= mon && w.date <= end).length,
    moves: S.postpones.filter((d) => d >= mon && d <= end).length,
    evidence: S.evidence.filter((e) => e.date && e.date >= mon && e.date <= end).length,
    records: S.records.filter((r) => r.date >= mon && r.date <= end).length,
  };
}

// ===========================================================================
// UI state
// ===========================================================================
const ui = { tab: 'today', councilMode: 'session', sheet: null, goalsView: 'goals', reviewOpen: false };
let toastTimer = null;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

// ===========================================================================
// Small render helpers
// ===========================================================================
const scale = (key, val, act, extra = '') => `<div class="scale" role="group">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-act="${act}" data-k="${key}" data-v="${n}" ${extra} aria-pressed="${val === n}">${n}</button>`).join('')}</div>`;
const seg = (items, current, act, extra = '') => `<div class="seg" role="group">${items.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${esc(v)}" ${extra} aria-pressed="${String(v) === String(current)}">${esc(l)}</button>`).join('')}</div>`;
const domChips = (current, act, extra = '') => `<div class="chiprow">${S.priorities.map((id) => `<button type="button" class="pchip" data-act="${act}" data-v="${id}" ${extra} aria-pressed="${id === current}">${dom(id).icon} ${esc(dom(id).name)}</button>`).join('')}</div>`;
const domTag = (id) => `<span class="chip">${dom(id).icon} ${esc(dom(id).name)}</span>`;
const bar = (frac, cls = '', marker = null) => `<div class="bar ${cls}"><i style="width:${clamp(frac * 100, 0, 100)}%"></i>${marker != null ? `<em style="left:${clamp(marker * 100, 0, 100)}%"></em>` : ''}</div>`;
const why = (t) => `<p class="why">${esc(t)}</p>`;
function ring(frac, label) {
  const r = 36, c = 2 * Math.PI * r, f = frac == null ? 0 : clamp(frac, 0, 1);
  const col = frac == null ? 'var(--border)' : f >= 0.8 ? 'var(--good)' : f >= 0.6 ? 'var(--warn)' : 'var(--bad)';
  return `<svg class="ring" viewBox="0 0 84 84" role="img" aria-label="${esc(label)}"><circle cx="42" cy="42" r="${r}" fill="none" style="stroke:var(--raised)" stroke-width="8"/><circle cx="42" cy="42" r="${r}" fill="none" style="stroke:${col}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${(f * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 42 42)"/><text x="42" y="48" text-anchor="middle" font-size="19" font-weight="800" style="fill:var(--text)">${frac == null ? '—' : Math.round(f * 100)}</text></svg>`;
}
function spark(vals, max = 5) {
  const pts = vals.map((v, i) => (v == null ? null : [i / Math.max(1, vals.length - 1) * 100, 30 - (v / max) * 28]));
  let d = '', pen = false;
  for (const p of pts) { if (!p) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)} `; pen = true; }
  return `<svg class="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
const lineOfDay = () => LINES[(daysBetween('2026-01-01', today()) % LINES.length + LINES.length) % LINES.length];

// ===========================================================================
// Today
// ===========================================================================
function commitRow(c, opts = {}) {
  const o = outcome(c);
  const done = c.status === 'done';
  const running = S.timer?.commitId === c.id;
  const proj = c.projectId ? S.projects.find((p) => p.id === c.projectId) : null;
  return `<div class="commit ${c.one ? 'one' : ''} ${done ? 'done' : ''}">
    <div class="row top">
      <button class="tick ${done ? 'on' : o === 'broken' ? 'miss' : ''}" data-act="c-toggle" data-id="${c.id}" aria-label="${done ? 'Mark not done' : 'Mark done'}">${done ? '✓' : o === 'broken' ? '✕' : ''}</button>
      <div class="grow">
        <div class="ctext">${c.one ? '<span class="star">★ </span>' : ''}${esc(c.text)}</div>
        <div class="row wrap small muted" style="margin-top:4px">${domTag(c.domain)}${proj ? `<span class="chip">${esc(proj.title)}</span>` : ''}${c.postponed ? `<span class="chip ${c.postponed >= 2 ? 'bad' : 'warn'}">moved ${c.postponed}×</span>` : ''}${opts.showDate ? `<span>${esc(relDay(c.date))}</span>` : ''}</div>
      </div>
    </div>
    ${!done && !opts.noActions ? `<div class="btns">
      ${running ? '<button class="small-btn" disabled>Running…</button>' : `<button class="small-btn primary" data-act="start" data-id="${c.id}">▶ Start ${START_MIN} min</button>`}
      <button class="small-btn ghost" data-act="c-menu" data-id="${c.id}">More</button>
    </div>` : ''}
  </div>`;
}

function renderResolve() {
  const list = unresolved();
  if (!list.length) return '';
  return `<section class="card alert">
    <h2>Unresolved <span class="right">${list.length}</span></h2>
    ${why('Open commitments past their day count as broken. Close each one honestly.')}
    ${list.map((c) => `<div class="commit">
      <div class="ctext">${esc(c.text)}</div>
      <div class="row wrap small muted">${domTag(c.domain)}<span>${esc(fmtDate(c.date))}</span>${c.postponed ? `<span class="chip ${c.postponed >= 2 ? 'bad' : 'warn'}">moved ${c.postponed}×</span>` : ''}</div>
      <div class="btns">
        <button class="small-btn" data-act="r-done" data-id="${c.id}">Done</button>
        <button class="small-btn" data-act="r-missed" data-id="${c.id}">Missed</button>
        ${c.postponed >= 2
          ? `<button class="small-btn" data-act="r-shrink" data-id="${c.id}">Shrink it</button><button class="small-btn danger" data-act="r-kill" data-id="${c.id}">Kill it</button>`
          : `<button class="small-btn" data-act="r-move" data-id="${c.id}">Move to today</button>`}
      </div>
      ${c.postponed >= 2 ? '<p class="small warn-text">Tomorrow loop: moved twice already. Make a version you can finish in 20 minutes, or drop it.</p>' : ''}
    </div>`).join('')}
  </section>`;
}

function renderMissTwice() {
  const t = today(), y = oneResult(addDays(t, -1)), yy = oneResult(addDays(t, -2));
  if (y !== 0 || oneOn(t)?.status === 'done') return '';
  if (yy === 0) return `<section class="card alert"><h2>Two misses in a row</h2><p>Your rule says this is a pattern now, not noise. Shrink today's One Thing to something you can finish in 20 minutes, then do it first.</p>${why('Breaking the run with a small win matters more than the size of the win.')}</section>`;
  return `<section class="card flag"><h2>Don't miss twice</h2><p>Yesterday's One Thing was missed. One miss is noise. Today decides whether it becomes a pattern.</p></section>`;
}

function renderCheckin() {
  const t = today(), r = S.days[t] || {};
  if (r.checkAt && !ui.editCheckin) {
    return `<section class="card"><div class="row between"><h2>Check-in</h2><button class="small-btn ghost" data-act="checkin-edit">Edit</button></div>
      <div class="stats">
        <div class="stat"><b>${r.mood ?? '—'}</b><span>Mood</span></div>
        <div class="stat"><b>${r.energy ?? '—'}</b><span>Energy</span></div>
        <div class="stat"><b>${sleepOf(t) ?? '—'}</b><span>Sleep (h)</span></div>
        <div class="stat"><b>${r.urge ?? '—'}</b><span>Novelty urge</span></div>
        <div class="stat"><b>${r.irrit ?? '—'}</b><span>Irritation</span></div>
      </div></section>`;
  }
  const c = ui.checkin ||= { mood: r.mood ?? null, energy: r.energy ?? null, urge: r.urge ?? null, irrit: r.irrit ?? null, sleep: r.sleep ?? trainer().sleep(t) ?? 7 };
  const q = (k, label, lo, hi) => `<div class="scaleq"><div class="row between"><span>${label}</span><span class="small muted">1 ${lo} · 5 ${hi}</span></div>${scale(k, c[k], 'ci')}</div>`;
  return `<section class="card"><h2>Morning check-in <span class="right">30 sec</span></h2>
    ${q('mood', 'Mood', 'low', 'good')}
    ${q('energy', 'Energy', 'flat', 'high')}
    ${q('urge', 'Urge for something new', 'none', 'strong')}
    ${q('irrit', 'Irritation', 'calm', 'high')}
    <div class="row between"><span class="small" style="color:var(--text-2)">Sleep last night${trainer().sleep(t) != null ? ' (from Trainer)' : ''}</span>
      <div class="row"><button class="icon" data-act="ci-sleep" data-d="-0.5" aria-label="Less sleep">−</button><b class="bigtime" style="font-size:24px;min-width:52px;text-align:center">${c.sleep}</b><button class="icon" data-act="ci-sleep" data-d="0.5" aria-label="More sleep">+</button></div></div>
    <button class="primary" data-act="ci-save" ${c.mood && c.energy && c.urge && c.irrit ? '' : 'disabled'}>Save check-in</button>
    ${why('Feeds the hypothesis lab: does sleep, novelty-seeking or mood actually predict your follow-through?')}
  </section>`;
}

function renderCommitments() {
  const t = today();
  const list = activeToday().sort((a, b) => (b.one - a.one) || a.created.localeCompare(b.created));
  const one = list.find((c) => c.one);
  const room = list.length < S.settings.maxDaily;
  const sugg = suggestions().slice(0, 4);
  const mon = mondayOf(t);
  const wk = weekCommits(mon).filter((c) => c.status !== 'killed');
  return `<section class="card ${one ? '' : 'focus'}">
    <h2>Today's commitments <span class="right">${list.filter((c) => c.status === 'done').length} of ${list.length} · max ${S.settings.maxDaily}</span></h2>
    ${!one ? `<p><b>Set today's One Thing.</b> The single action that moves your top priority forward.</p>
      ${sugg.length ? `<div class="grid1" style="display:grid;gap:8px">${sugg.map((s, i) => `<button class="small-btn" style="justify-content:flex-start;text-align:left" data-act="one-sugg" data-i="${i}">★ ${esc(s.text)} <span class="muted small">· ${esc(s.from)}</span></button>`).join('')}</div>` : ''}` : ''}
    ${list.map((c) => commitRow(c)).join('')}
    ${room ? `<button data-act="c-add" ${one ? '' : 'data-one="1"'}>+ ${one ? 'Add a commitment' : 'Write your own One Thing'}</button>` : `<p class="small muted">Full. ${S.settings.maxDaily} is the cap.</p>`}
    ${why('Few commitments, fully kept, beat long lists. Each one you set is a promise the Mirror will score.')}
  </section>
  ${wk.length ? `<section class="card"><h2>This week</h2>${wk.map((c) => commitRow(c, { showDate: true })).join('')}</section>` : ''}`;
}

// Next actions from active projects and goals, highest priority domain first.
function suggestions() {
  const rank = (id) => S.priorities.indexOf(id);
  const out = [];
  for (const p of S.projects.filter((x) => x.status === 'active' && x.next)) out.push({ text: p.next, domain: p.domain, projectId: p.id, from: p.title });
  for (const g of S.goals.filter((x) => x.status === 'active' && x.next)) out.push({ text: g.next, domain: g.domain, goalId: g.id, from: g.title });
  const taken = new Set(activeToday().map((c) => c.text));
  return out.filter((s) => !taken.has(s.text)).sort((a, b) => rank(a.domain) - rank(b.domain));
}

function renderQuick() {
  const t = today();
  const b = buildMin(t), c = consumeMin(t), w = worriesOn(t).length;
  return `<section class="card"><h2>Log as it happens</h2>
    <div class="stats">
      <div class="stat"><b class="good-text">${fmtMin(b)}</b><span>Built</span></div>
      <div class="stat"><b class="${c > b ? 'warn-text' : ''}">${fmtMin(c)}</b><span>Consumed</span></div>
      <div class="stat"><b>${w}</b><span>Rumination</span></div>
    </div>
    <div class="grid3">
      <button class="small-btn" data-act="consume" data-d="15">+15 consumed</button>
      <button class="small-btn" data-act="worry-new">Caught ruminating</button>
      <button class="small-btn" data-act="idea-new">New idea</button>
    </div>
    ${why('Consumed means AI videos, YouTube, feeds and research not tied to this week\'s build. New ideas go to the vault so they don\'t hijack today.')}
  </section>`;
}

function renderWorryWindow() {
  const open = S.worries.filter((w) => w.status === 'parked');
  if (!open.length || nowMin() < minutesOf(S.settings.worryAt)) return '';
  return `<section class="card flag"><h2>Worry window <span class="right">from ${esc(S.settings.worryAt)}</span></h2>
    <p class="small muted">15 minutes for what you parked. For each one: does it still need thought?</p>
    ${open.map((w) => `<div class="commit"><div class="ctext" style="font-weight:600">${esc(w.text)}</div><div class="small muted">${esc(relDay(w.date))}${w.fileId ? ' · has a verdict on file' : ''}</div>
      <div class="btns"><button class="small-btn" data-act="worry-council" data-id="${w.id}">Take to Council</button><button class="small-btn" data-act="worry-drop" data-id="${w.id}">Drop it</button></div></div>`).join('')}
    ${why('Scheduled worry time (a CBT technique) stops rumination leaking into the whole day.')}
  </section>`;
}

function renderReview() {
  const t = today(), r = S.days[t] || {};
  const after = nowMin() >= minutesOf(S.settings.reviewAt);
  if (!after && !ui.reviewOpen && !r.reviewAt) {
    return `<section class="card"><div class="row between"><h2>Evening review</h2><button class="small-btn ghost" data-act="review-open">Open now</button></div><p class="small muted">Opens at ${esc(S.settings.reviewAt)}. Two minutes.</p></section>`;
  }
  if (r.reviewAt && !ui.reviewOpen) {
    const tm = oneOn(addDays(t, 1));
    return `<section class="card"><div class="row between"><h2>Evening review <span class="chip good">done</span></h2><button class="small-btn ghost" data-act="review-open">Edit</button></div>
      ${r.evidence ? `<p class="small"><b>Evidence:</b> ${esc(r.evidence)}</p>` : ''}
      <p class="small">${tm ? `<b>Tomorrow's One Thing:</b> ${esc(tm.text)}` : '<span class="warn-text">No One Thing set for tomorrow.</span>'}</p></section>`;
  }
  const v = ui.review ||= { build: r.build || 0, consume: r.consume || 0, evidence: r.evidence || '', kids: r.kids || '', note: r.note || '', trained: r.trained ?? trainer().trained(t), tomorrow: oneOn(addDays(t, 1))?.text || '', tomorrowDomain: oneOn(addDays(t, 1))?.domain || S.priorities[0] };
  const open = activeToday().filter((c) => c.status === 'open');
  const autoMin = sum(sessionsOn(t).map((x) => x.min));
  return `<section class="card focus"><h2>Evening review</h2>
    ${open.length ? `<p class="small"><b>Still open today:</b> tick what you did. Anything left open tonight counts as missed tomorrow.</p>${open.map((c) => commitRow(c, { noActions: true })).join('')}` : '<p class="small good-text">Every commitment today is closed.</p>'}
    <div class="grid2">
      <label class="field">Built (extra minutes)<input type="number" inputmode="numeric" min="0" step="15" data-rk="build" value="${v.build}"></label>
      <label class="field">Consumed (minutes)<input type="number" inputmode="numeric" min="0" step="15" data-rk="consume" value="${v.consume}"></label>
    </div>
    ${autoMin ? `<p class="small muted">Plus ${fmtMin(autoMin)} from Start timers.</p>` : ''}
    <div class="row between"><span class="small" style="color:var(--text-2)">Trained today?${trainer().trained(t) ? ' (Trainer says yes)' : ''}</span>${seg([['yes', 'Yes'], ['no', 'No']], v.trained == null ? '' : v.trained ? 'yes' : 'no', 'rv-trained')}</div>
    <label class="field">Evidence: one thing you did today that shows competence
      <input data-rk="evidence" value="${esc(v.evidence)}" placeholder="A fact, not a feeling"></label>
    <label class="field">With the kids (optional)<input data-rk="kids" value="${esc(v.kids)}" placeholder="What you did or taught"></label>
    <label class="field">One line on today (optional)<input data-rk="note" value="${esc(v.note)}"></label>
    <div class="subcard" style="display:grid;gap:8px;padding:12px;border-radius:12px;background:var(--raised)">
      <label class="field"><span><span class="star">★</span> Tomorrow's One Thing</span><input data-rk="tomorrow" value="${esc(v.tomorrow)}" placeholder="Concrete. Doable in under 2 hours."></label>
      ${domChips(v.tomorrowDomain, 'rv-dom')}
    </div>
    <button class="primary" data-act="review-save">Save review</button>
    ${why('Deciding tomorrow tonight removes the morning decision, which is where the tomorrow loop starts.')}
  </section>`;
}

function renderHealth() {
  const T = trainer(), t = today();
  if (!T.ok) return '';
  const steps = T.steps(t), sl = T.sleep(t);
  return `<section class="card"><h2>From Trainer</h2>
    <div class="stats">
      <div class="stat"><b>${steps != null ? steps.toLocaleString() : '—'}</b><span>Steps today</span></div>
      <div class="stat"><b>${sl ?? '—'}</b><span>Sleep (h)</span></div>
      <div class="stat"><b>${T.trained(t) ? 'Yes' : 'No'}</b><span>Trained</span></div>
      ${T.weight7 ? `<div class="stat"><b>${T.weight7.toFixed(1)}</b><span>7-day kg</span></div>` : ''}
    </div></section>`;
}

function renderWeekDue() {
  const t = today(), d = parseDate(t).getDay();
  const thisMon = mondayOf(t), lastMon = addDays(thisMon, -7);
  let mon = null;
  if (d === 0 && !S.weeks[thisMon]) mon = thisMon;
  else if (d === 1 && !S.weeks[lastMon] && S.created <= addDays(lastMon, 6)) mon = lastMon;
  if (!mon) return '';
  return `<section class="card flag"><div class="row between"><h2>Weekly review due</h2><button class="small-btn primary" data-act="week-open" data-mon="${mon}">Start</button></div><p class="small muted">Week of ${esc(fmtShort(mon))}. Five minutes. Includes a kill decision.</p></section>`;
}

function renderToday() {
  const [who, line] = lineOfDay();
  const welcome = S.notice === 'welcome' ? `<section class="card focus"><h2>Council</h2>
    <p>Built from your profile. The core finding: ${esc(CORE_TENSION)}</p>
    <ul class="small"><li><b>Today:</b> up to 3 commitments, one starred. Start any with a 10-minute timer.</li><li><b>Goals:</b> 90-day goals and projects, with a limit on active projects.</li><li><b>Council:</b> thought records, relationship standards and decisions. Each ends in an action.</li><li><b>Mirror:</b> your Say/Do score and tests of the hypotheses about you.</li></ul>
    <button class="primary" data-act="welcome-ok">Start</button></section>` : '';
  return `${welcome}
    ${renderResolve()}
    ${renderMissTwice()}
    ${renderWeekDue()}
    ${renderCheckin()}
    ${renderCommitments()}
    ${renderQuick()}
    ${renderWorryWindow()}
    ${renderReview()}
    ${renderHealth()}
    <section class="card"><p class="quote">"${esc(line)}"</p><p class="muted small">${esc(who)}</p></section>`;
}

// ===========================================================================
// Goals and projects
// ===========================================================================
function goalCard(g) {
  const span = Math.max(1, daysBetween(g.created, g.deadline));
  const elapsed = clamp(daysBetween(g.created, today()) / span, 0, 1);
  const prog = g.target - g.start ? clamp((g.current - g.start) / (g.target - g.start), 0, 1) : 0;
  const left = daysBetween(today(), g.deadline);
  const pace = prog >= elapsed - 0.05 ? ['good', 'On pace'] : prog >= elapsed - 0.2 ? ['warn', 'Behind pace'] : ['bad', 'Well behind'];
  return `<div class="commit">
    <div class="row between top"><div class="grow"><div class="ctext">${esc(g.title)}</div><div class="small muted">${esc(g.current)} of ${esc(g.target)} ${esc(g.metric)}</div></div><span class="chip ${pace[0]}">${pace[1]}</span></div>
    ${bar(prog, pace[0], elapsed)}
    <div class="small muted">${left >= 0 ? `${left} days left · ${esc(fmtShort(g.deadline))}` : `Deadline passed ${-left} days ago`}</div>
    ${g.next ? `<p class="small"><b>Next action:</b> ${esc(g.next)}</p>` : ''}
    ${g.why ? `<p class="small muted"><b>Why:</b> ${esc(g.why)}</p>` : ''}
    <div class="btns"><button class="small-btn" data-act="g-update" data-id="${g.id}">Update</button><button class="small-btn ghost" data-act="g-edit" data-id="${g.id}">Edit</button><button class="small-btn ghost" data-act="g-close" data-id="${g.id}">Close</button></div>
  </div>`;
}

function projectCard(p) {
  const touched = lastTouched(p);
  const idle = touched ? daysBetween(touched, today()) : daysBetween(p.promoted || p.created, today());
  const left = p.deadline ? daysBetween(today(), p.deadline) : null;
  return `<div class="commit one">
    <div class="row between top"><div class="ctext grow">${esc(p.title)}</div>${domTag(p.domain)}</div>
    <div class="row wrap small">${p.money ? `<span class="chip good">£ ${esc(p.money)}</span>` : '<span class="chip warn">No money path</span>'}
      <span class="chip ${idle >= 5 ? 'bad' : idle >= 3 ? 'warn' : ''}">${touched ? `worked ${idle === 0 ? 'today' : `${idle}d ago`}` : 'not worked yet'}</span>
      ${left != null ? `<span class="chip ${left < 0 ? 'bad' : ''}">${left >= 0 ? `${left}d to deadline` : `${-left}d overdue`}</span>` : ''}</div>
    ${p.done ? `<p class="small"><b>Done means:</b> ${esc(p.done)}</p>` : ''}
    ${p.kill ? `<p class="small"><b>Kill if:</b> ${esc(p.kill)}</p>` : ''}
    ${p.next ? `<p class="small"><b>Next action:</b> ${esc(p.next)}</p>` : '<p class="small warn-text">No next action. A project without one stalls.</p>'}
    <div class="btns"><button class="small-btn" data-act="p-edit" data-id="${p.id}">Edit</button><button class="small-btn" data-act="p-ship" data-id="${p.id}">Shipped</button><button class="small-btn ghost" data-act="p-park" data-id="${p.id}">Park</button><button class="small-btn danger" data-act="p-kill" data-id="${p.id}">Kill</button></div>
  </div>`;
}

function renderGoals() {
  const view = ui.goalsView;
  const head = `<div>${seg([['goals', 'Goals'], ['projects', 'Projects'], ['week', 'Week']], view, 'goals-view')}</div>`;
  if (view === 'projects') return head + renderProjects();
  if (view === 'week') return head + renderWeek();
  const active = S.goals.filter((g) => g.status === 'active');
  return `${head}
    <section class="card"><div class="row between"><h2>Vision</h2><button class="small-btn ghost" data-act="vision-edit">Edit</button></div><p>${esc(S.vision)}</p></section>
    <section class="card"><h2>Priorities, in words</h2>
      ${why('Your stated order. The Mirror checks it against where your kept commitments actually go.')}
      <div class="list">${S.priorities.map((id, i) => `<div class="domrow"><span class="domicon">${i + 1}</span><div><b>${esc(dom(id).name)}</b><div class="small muted">${esc(dom(id).desc)}</div></div>
        <div class="row"><button class="icon ghost" data-act="prio" data-i="${i}" data-d="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button><button class="icon ghost" data-act="prio" data-i="${i}" data-d="1" aria-label="Move down" ${i === S.priorities.length - 1 ? 'disabled' : ''}>↓</button></div></div>`).join('')}</div>
    </section>
    <h2 class="section-h">90-day goals</h2>
    ${S.priorities.map((id) => {
      const g = active.find((x) => x.domain === id);
      return `<section class="card"><h2>${dom(id).icon} ${esc(dom(id).name)}</h2>${g ? goalCard(g) : `<p class="small muted">No 90-day goal.</p><div class="btns"><button class="small-btn" data-act="g-new" data-dom="${id}">Set one</button><button class="small-btn ghost" data-act="g-new" data-dom="${id}" data-tpl="1">Use a starting point</button></div>`}</section>`;
    }).join('')}
    ${why('One goal per domain, 90 days each. Long enough to matter, short enough that you can still see the deadline.')}
    ${S.goals.some((g) => g.status !== 'active') ? `<section class="card"><details><summary>Closed goals</summary><div class="list">${S.goals.filter((g) => g.status !== 'active').map((g) => `<div><b>${esc(g.title)}</b> <span class="chip ${g.status === 'done' ? 'good' : 'bad'}">${g.status === 'done' ? 'achieved' : 'killed'}</span><div class="small muted">${esc(g.current)} of ${esc(g.target)} ${esc(g.metric)}${g.lesson ? ` · ${esc(g.lesson)}` : ''}</div></div>`).join('')}</div></details></section>` : ''}`;
}

function renderProjects() {
  const active = S.projects.filter((p) => p.status === 'active');
  const vault = S.projects.filter((p) => p.status === 'vault').sort((a, b) => b.created.localeCompare(a.created));
  const closed = S.projects.filter((p) => p.status === 'shipped' || p.status === 'killed');
  const cool = (p) => S.settings.coolDays - daysBetween(p.created, today());
  return `<section class="card ${active.length ? '' : 'focus'}"><h2>Active <span class="right">${active.length} of ${S.settings.wip}</span></h2>
      ${active.length ? active.map(projectCard).join('') : `<p><b>No active project.</b> The profile's most important open question: which project can earn money within 30 to 90 days? Promote one from the vault.</p>`}
      ${why(`At most ${S.settings.wip} at once. Ideas proliferate faster than finished projects; the limit forces a choice.`)}
    </section>
    <section class="card"><div class="row between"><h2>Idea vault</h2><button class="small-btn" data-act="idea-new">+ Idea</button></div>
      ${why(`New ideas cool off for ${S.settings.coolDays} days before they can be promoted. If an idea is still compelling after that, it's worth considering.`)}
      <div class="list">${vault.map((p) => {
        const c = cool(p);
        return `<div class="row between top"><div class="grow"><b>${esc(p.title)}</b><div class="row wrap small muted" style="margin-top:4px">${domTag(p.domain)}${p.money ? '<span class="chip good">money path</span>' : ''}${c > 0 ? `<span class="chip">cooling · ${c}d</span>` : ''}</div>${p.note ? `<div class="small muted" style="margin-top:4px">${esc(p.note)}</div>` : ''}</div>
          <div class="row"><button class="small-btn ${c > 0 ? 'ghost' : ''}" data-act="p-promote" data-id="${p.id}" ${c > 0 ? 'disabled' : ''}>Promote</button><button class="icon ghost" data-act="p-del" data-id="${p.id}" aria-label="Delete idea">✕</button></div></div>`;
      }).join('') || '<p class="muted small">Empty.</p>'}</div>
    </section>
    ${closed.length ? `<section class="card"><details><summary>Shipped and killed (${closed.length})</summary><div class="list">${closed.map((p) => `<div><b>${esc(p.title)}</b> <span class="chip ${p.status === 'shipped' ? 'good' : 'bad'}">${p.status}</span><div class="small muted">${esc(p.closed ? fmtShort(p.closed) : '')}${p.reason ? ` · ${esc(p.reason)}` : ''}</div></div>`).join('')}</div></details><p class="why">Killing a project on purpose is a decision. Letting it fade is drift.</p></section>` : ''}`;
}

function renderWeek() {
  const t = today(), mon = mondayOf(t);
  const st = weekStats(mon);
  const weeks = Object.entries(S.weeks).sort((a, b) => b[0].localeCompare(a[0]));
  return `<section class="card"><h2>This week <span class="right">from ${esc(fmtShort(mon))}</span></h2>
      <div class="stats">
        <div class="stat"><b>${pct(st.sd.rate)}</b><span>Say/Do</span></div>
        <div class="stat"><b>${st.oneHit}/${st.oneN}</b><span>One Things kept</span></div>
        <div class="stat"><b>${fmtMin(st.build)}</b><span>Built</span></div>
        <div class="stat"><b>${fmtMin(st.consume)}</b><span>Consumed</span></div>
        <div class="stat"><b>${st.moves}</b><span>Postponed</span></div>
        <div class="stat"><b>${st.worries}</b><span>Rumination</span></div>
      </div>
      <button class="primary" data-act="week-open" data-mon="${mon}">${S.weeks[mon] ? 'Edit this week\'s review' : 'Review this week'}</button>
    </section>
    ${weeks.length ? `<section class="card"><h2>Past reviews</h2><div class="list">${weeks.map(([m, w]) => `<details><summary>Week of ${esc(fmtShort(m))} · Say/Do ${pct(w.rate)}</summary><div class="small" style="display:grid;gap:4px;margin-top:6px">
      ${w.worked ? `<p><b>Worked:</b> ${esc(w.worked)}</p>` : ''}${w.failed ? `<p><b>Failed:</b> ${esc(w.failed)}</p>` : ''}${w.fix ? `<p><b>System fix:</b> ${esc(w.fix)}</p>` : ''}${w.kill ? `<p><b>Killed:</b> ${esc(w.kill)}</p>` : ''}${w.next ? `<p><b>Next week:</b> ${esc(w.next)}</p>` : ''}</div></details>`).join('')}</div></section>` : ''}`;
}

// ===========================================================================
// Council
// ===========================================================================
const COUNCIL_MODES = [['session', 'Session'], ['standards', 'Standards'], ['decide', 'Decide'], ['history', 'History']];

function draftFor(type) {
  if (!S.draft || S.draft.type !== type) return null;
  return S.draft;
}
function draftTimer(d) {
  const el = Date.now() - d.start, lim = S.settings.councilMin * 60000;
  const over = el > lim;
  return `<div class="row between"><span class="small muted">Timebox ${S.settings.councilMin} min</span><b class="${over ? 'danger' : ''}" data-elapsed="${d.start}">${fmtClock(el)}</b></div>
    ${over ? '<div class="verdict bad"><b>Timebox reached.</b><span class="small">More analysis is unlikely to change the decision. Go to the Chairman and close it.</span></div>' : ''}`;
}
const dField = (k, label, d, ph = '', area = true) => `<label class="field">${label}${area ? `<textarea data-dk="${k}" placeholder="${esc(ph)}">${esc(d.f[k] || '')}</textarea>` : `<input data-dk="${k}" value="${esc(d.f[k] || '')}" placeholder="${esc(ph)}">`}</label>`;

function chairman(d) {
  return `<div class="subcard" style="display:grid;gap:10px;padding:12px;border-radius:12px;background:var(--raised);box-shadow:inset 4px 0 0 var(--accent)">
    <b>Chairman</b><span class="small muted">Decision. Action. Deadline. Nothing else.</span>
    ${dField('decision', 'Decision', d, 'What you have decided', false)}
    ${dField('action', 'Action', d, 'The behaviour that follows from it', false)}
    <div class="row between wrap"><span class="small" style="color:var(--text-2)">When</span>${seg([['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week']], d.f.when || 'today', 'd-when')}</div>
    ${domChips(d.f.domain || 'mind', 'd-dom')}
    <div class="btns"><button class="primary" data-act="d-close" ${d.f.decision && d.f.action ? '' : 'disabled'}>Close with action</button><button class="ghost" data-act="d-close-noaction" ${d.f.decision ? '' : 'disabled'}>No action needed</button></div>
    <button class="small-btn ghost danger" data-act="d-discard">Discard this session</button>
  </div>`;
}

function renderSession() {
  const d = draftFor('session');
  if (!d) {
    return `<section class="card"><h2>Council session</h2>
      <p>A structured thought record (CBT) with the Council's lenses. Use it when something has hold of you: a reaction, a recurring thought, a person.</p>
      ${why('Writing the thought down and testing it against evidence works better than turning it over in your head.')}
      <button class="primary" data-act="d-new" data-type="session">Open a session</button></section>`;
  }
  const f = d.f;
  return `<section class="card focus"><h2>Council session</h2>${draftTimer(d)}
    <div class="row"><span class="stepnum">1</span><b>Facts</b></div>
    ${dField('situation', 'What happened? Only what a camera would record.', d, 'Who, what, when, where')}
    <div class="row"><span class="stepnum">2</span><b>Thought and feeling</b></div>
    ${dField('thought', 'The automatic thought, word for word', d)}
    <div class="grid2">${dField('emotion', 'Emotion', d, 'Anger, shame, anxiety…', false)}<label class="field">Intensity (0 to 100)<input type="number" inputmode="numeric" min="0" max="100" data-dk="intensity" value="${esc(f.intensity || '')}"></label></div>
    <label class="field">Belief in the thought (0 to 100%)<input type="number" inputmode="numeric" min="0" max="100" data-dk="belief" value="${esc(f.belief || '')}"></label>
    <div class="row"><span class="stepnum">3</span><b>Distortions</b></div>
    <div class="chiprow">${DISTORTIONS.map(([k, l]) => `<button type="button" class="pchip" data-act="d-dist" data-v="${k}" aria-pressed="${(f.dist || []).includes(k)}">${esc(l)}</button>`).join('')}</div>
    <div class="row"><span class="stepnum">4</span><b>Evidence</b></div>
    ${dField('for', 'Evidence for the thought (facts only)', d)}
    ${dField('against', 'Evidence against it', d)}
    <div class="row"><span class="stepnum">5</span><b>Lenses</b> <span class="small muted">optional, use one or two</span></div>
    ${LENSES.map((l) => `<details class="lens" ${f['lens_' + l.id] ? 'open' : ''}><summary>${esc(l.name)} · <span class="muted small">&nbsp;${esc(l.tag)}</span></summary><p class="small muted">${esc(l.q)}</p><textarea data-dk="lens_${l.id}">${esc(f['lens_' + l.id] || '')}</textarea></details>`).join('')}
    <div class="row"><span class="stepnum">6</span><b>Balanced view</b></div>
    ${dField('balanced', 'A more accurate thought, given all the evidence', d)}
    <label class="field">Belief in the original thought now (0 to 100%)<input type="number" inputmode="numeric" min="0" max="100" data-dk="belief2" value="${esc(f.belief2 || '')}"></label>
    ${chairman(d)}
  </section>`;
}

function standardsVerdict(f) {
  const vals = STANDARDS.map(([k]) => f['s_' + k]).filter(Boolean);
  const fails = vals.filter((v) => v === 'f').length, mixed = vals.filter((v) => v === 'm').length;
  if (vals.length < 4) return { cls: 'none', text: `Rate at least 4 standards (${vals.length} so far).` };
  if (fails >= 2 || (fails >= 1 && mixed >= 3)) return { cls: 'bad', text: 'Does not meet your minimum standards.', short: 'Does not meet standards' };
  if (fails === 0 && mixed <= 1) return { cls: 'good', text: 'Meets your standards.', short: 'Meets standards' };
  return { cls: 'warn', text: 'Mixed. Decide which standard is non-negotiable and whether it is being met.', short: 'Mixed' };
}

function renderStandards() {
  const d = draftFor('standards');
  const files = S.records.filter((r) => r.type === 'standards').sort((a, b) => b.date.localeCompare(a.date));
  if (!d) {
    return `<section class="card"><h2>Standards check</h2>
      <p>Judge a relationship by observable behaviour against your minimum standards, then close the file.</p>
      ${why('The useful question is whether their behaviour meets your standards, not why they behave that way. Behaviour already answers the practical question.')}
      <button class="primary" data-act="d-new" data-type="standards">Check someone</button></section>
      ${files.length ? `<section class="card"><h2>Files on record</h2><div class="list">${files.map((r) => `<div><div class="row between"><b>${esc(r.f.who)}</b><span class="small muted">${esc(fmtShort(r.date))}</span></div><div class="small">${esc(r.verdict)} · <b>Decision:</b> ${esc(r.f.decision || '—')}</div></div>`).join('')}</div></section>` : ''}`;
  }
  const v = standardsVerdict(d.f);
  return `<section class="card focus"><h2>Standards check</h2>${draftTimer(d)}
    ${dField('who', 'Who (or which situation)', d, 'A name or a label', false)}
    <p class="small muted">For each: what have they <b>done</b>? Observed behaviour only; skip guesses about motives.</p>
    <div>${STANDARDS.map(([k, name, desc]) => {
      const cur = d.f['s_' + k] || '';
      return `<div class="std"><div><b>${esc(name)}</b> <span class="small muted">${esc(desc)}</span></div>
        <div class="seg" role="group">${[['g', 'Meets'], ['w', 'Mixed'], ['b', 'Fails']].map(([c, l]) => { const val = { g: 'y', w: 'm', b: 'f' }[c]; return `<button type="button" class="${c}" data-act="d-std" data-k="${k}" data-v="${val}" aria-pressed="${cur === val}">${l}</button>`; }).join('')}</div>
        <input data-dk="e_${k}" value="${esc(d.f['e_' + k] || '')}" placeholder="What they did (optional)"></div>`;
    }).join('')}</div>
    <div class="verdict ${v.cls}"><b>${esc(v.text)}</b></div>
    ${chairman(d)}
  </section>`;
}

function renderDecide() {
  const d = draftFor('decide');
  if (!d) {
    return `<section class="card"><h2>Decide</h2>
      <p>For a decision you keep circling: options, a steelman, second-order effects and kill criteria, then a call.</p>
      ${why('If nothing you could realistically learn would change the answer, the analysis is finished.')}
      <button class="primary" data-act="d-new" data-type="decide">Make a decision</button></section>`;
  }
  return `<section class="card focus"><h2>Decide</h2>${draftTimer(d)}
    ${dField('question', 'The decision', d, 'Should I…', false)}
    ${dField('options', 'Options (including doing nothing)', d)}
    ${dField('info', 'What information would change your mind? Can you get it this week?', d, 'If none: decide now.')}
    ${dField('steelman', 'Steelman the option you are leaning against', d)}
    ${dField('second', 'Second-order effects: and then what?', d)}
    ${dField('killc', 'Kill criteria: what would make you reverse this?', d)}
    ${chairman(d)}
  </section>`;
}

function renderHistory() {
  const recs = [...S.records].sort((a, b) => b.at.localeCompare(a.at));
  if (!recs.length) return '<section class="card"><p class="muted">No closed sessions yet.</p></section>';
  const label = { session: 'Session', standards: 'Standards', decide: 'Decision' };
  return `<section class="card"><h2>Closed sessions</h2><div class="list">${recs.map((r) => `<button class="linkish" style="background:transparent;border:0;text-align:left;justify-content:flex-start;display:grid;gap:2px;font-weight:400;padding:10px 0;width:100%" data-act="rec-view" data-id="${r.id}">
      <span class="row between"><b>${esc(label[r.type])}: ${esc(r.title || '')}</b><span class="small muted">${esc(fmtShort(r.date))}</span></span>
      <span class="small muted">${r.f.decision ? `Decision: ${esc(r.f.decision)}` : ''}${r.overtime ? ' · over timebox' : ''}</span></button>`).join('')}</div></section>`;
}

function renderCouncil() {
  const m = ui.councilMode;
  const inProgress = S.draft ? `<p class="small warn-text">A ${esc(S.draft.type)} is open. Close it before starting another.</p>` : '';
  const body = m === 'session' ? renderSession() : m === 'standards' ? renderStandards() : m === 'decide' ? renderDecide() : renderHistory();
  return `<div>${seg(COUNCIL_MODES, m, 'council-mode')}</div>
    <p class="muted small" style="padding:0 4px">The Council exists to improve action, not replace it. Every session closes with a decision.</p>
    ${S.draft && S.draft.type !== m && m !== 'history' ? inProgress : ''}
    ${body}`;
}

// ===========================================================================
// Mirror
// ===========================================================================
function renderMirror() {
  const t = today();
  const w7 = sayDo(addDays(t, -6), t), w28 = sayDo(addDays(t, -27), t), all = sayDo('0000', t);
  const weeks = [];
  for (let i = 7; i >= 0; i--) { const m = addDays(mondayOf(t), -7 * i); weeks.push([m, sayDo(m, addDays(m, 6))]); }
  const da = domainActions();
  const top = da.rows[0];
  const leader = [...da.rows].sort((a, b) => a.actionRank - b.actionRank)[0];
  const mismatch = da.total >= 5 && top.actionRank > 1
    ? `Words say ${dom(top.id).name} comes first. Actions put it at #${top.actionRank}: ${top.kept} kept, against ${leader.kept} for ${dom(leader.id).name}.`
    : da.total >= 5 ? `Your top priority, ${dom(top.id).name}, also gets the most kept commitments. Words and actions agree.` : 'Needs 5 or more kept commitments in 28 days to compare.';
  const days14 = range(addDays(t, -13), t);
  const b7 = sum(range(addDays(t, -6), t).map(buildMin)), c7 = sum(range(addDays(t, -6), t).map(consumeMin));
  const maxBC = Math.max(1, ...days14.map((d) => Math.max(buildMin(d), consumeMin(d))));
  const days28 = range(addDays(t, -27), t);
  const evid = [...S.evidence].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const dayEvidence = Object.entries(S.days).filter(([, r]) => r.evidence).map(([d, r]) => ({ date: d, text: r.evidence }));
  return `<section class="card"><h2>Say / Do</h2>
      <div class="row">${ring(w7.rate, 'Say/Do, 7 days')}<div class="grow"><p><b>${w7.kept}</b> kept, <b>${w7.broken}</b> broken in 7 days${w7.retracted ? `, ${w7.retracted} retracted in time` : ''}.</p><p class="small muted">28 days: ${pct(w28.rate)} · All time: ${pct(all.rate)}</p></div></div>
      <div class="bars">${weeks.map(([m, s]) => `<div><i class="${s.rate == null ? 'empty' : ''}" style="height:${s.rate == null ? 4 : Math.max(4, s.rate * 70)}px;${s.rate != null && s.rate < 0.6 ? 'background:var(--bad)' : s.rate != null && s.rate < 0.8 ? 'background:var(--warn)' : s.rate != null ? 'background:var(--good)' : ''}"></i><span>${esc(fmtShort(m).split(' ')[0])}</span></div>`).join('')}</div>
      ${why('Your standard for other people is: say what you mean and do what you say. This is the same standard applied to you, measured.')}
    </section>
    <section class="card"><h2>Actions vs words <span class="right">28 days</span></h2>
      <div class="list">${da.rows.map((r) => `<div class="domrow"><span class="domicon">${r.rank}</span><div><div class="row between"><b>${esc(dom(r.id).name)}</b><span class="small muted">${r.kept} kept${r.min ? ` · ${fmtMin(r.min)}` : ''}</span></div>${bar(r.share, r.rank <= 2 && r.share < 0.2 && da.total >= 5 ? 'bad' : '')}</div><span class="chip">#${r.actionRank}</span></div>`).join('')}</div>
      <div class="verdict ${da.total >= 5 ? (top.actionRank > 1 ? 'warn' : 'good') : 'none'}"><span>${esc(mismatch)}</span></div>
    </section>
    <section class="card"><h2>Built vs consumed <span class="right">7 days</span></h2>
      <div class="stats"><div class="stat"><b class="good-text">${fmtMin(b7)}</b><span>Built</span></div><div class="stat"><b class="${c7 > b7 ? 'warn-text' : ''}">${fmtMin(c7)}</b><span>Consumed</span></div><div class="stat"><b>${c7 ? (b7 / c7).toFixed(1) : b7 ? '∞' : '—'}</b><span>Ratio</span></div></div>
      <div class="bars" style="height:70px">${days14.map((d) => `<div style="grid-auto-flow:column;align-items:end;display:flex;gap:1px"><i style="height:${buildMin(d) / maxBC * 60}px;background:var(--good)"></i><i style="height:${consumeMin(d) / maxBC * 60}px;background:var(--warn)"></i></div>`).join('')}</div>
      <p class="small muted">Green built, amber consumed. Last 14 days.</p>
    </section>
    <section class="card"><h2>Live pattern monitor</h2>
      ${PATTERNS.map((p) => { const s = patternSignal(p.id); return `<details class="lens"><summary><span class="grow">${esc(p.name)}</span><span class="chip ${s.on ? 'bad' : s.on === false ? 'good' : ''}">${s.on ? 'Active' : s.on === false ? 'Quiet' : 'No signal'}</span></summary>
        <p class="small">${esc(s.text)}</p><p class="small muted">${esc(p.chain)}</p><p class="small"><b>Counter:</b> ${esc(p.counter)}</p><p class="small muted">Basis: ${esc(p.confidence)}</p></details>`; }).join('')}
      <details class="lens"><summary><span class="grow">Enneagram 8 under stress</span></summary><p class="small">${esc(ENNEAGRAM.stress)}</p><p class="small">${esc(ENNEAGRAM.growth)}</p><p class="small muted">A framework, not a fact.</p></details>
    </section>
    <section class="card"><h2>Hypothesis lab</h2>
      ${why('Claims about you are hypotheses until your own data supports them. Each one compares your One Thing follow-through (or mood) on days with and without the condition.')}
      ${HYPOTHESES.map((h) => { const r = testHypothesis(h); const [cls, label] = VERDICTS[r.verdict]; const fmt = (x) => (x == null ? '—' : h.outcome === 'mood' ? x.toFixed(1) : pct(x));
        return `<div class="lens"><div class="row between top"><span class="small grow"><b>${esc(h.text)}</b></span><span class="chip ${cls}">${label}</span></div>
        <span class="small muted">With: ${fmt(r.a)} (${r.nA} days) · Without: ${fmt(r.b)} (${r.nB} days)${r.note ? ` · ${esc(r.note)}` : ''}</span></div>`; }).join('')}
      <p class="small muted">Correlation in your own logs, not proof of cause.</p>
    </section>
    <section class="card"><h2>State <span class="right">28 days</span></h2>
      <div class="small">Mood</div>${spark(days28.map((d) => S.days[d]?.mood ?? null))}
      <div class="small">Energy</div>${spark(days28.map((d) => S.days[d]?.energy ?? null))}
      <div class="small">Irritation</div>${spark(days28.map((d) => S.days[d]?.irrit ?? null))}
      <div class="small">Sleep (h)</div>${spark(days28.map((d) => sleepOf(d)), 10)}
    </section>
    <section class="card"><div class="row between"><h2>Evidence file</h2><button class="small-btn" data-act="ev-add">+ Add</button></div>
      ${why('Self-esteem scored 17 of 30. Facts about what you have done, recorded as they happen, not praise.')}
      <div class="list">${[...dayEvidence.map((e) => ({ ...e, review: true })), ...evid].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 40).map((e) => `<div class="row between top"><div class="grow"><span>${esc(e.text)}</span><div class="small muted">${e.date ? esc(fmtShort(e.date)) : 'From your profile'}${e.domain ? ` · ${esc(dom(e.domain).name)}` : ''}</div></div>${e.id ? `<button class="icon ghost" data-act="ev-del" data-id="${e.id}" aria-label="Delete">✕</button>` : ''}</div>`).join('')}</div>
    </section>`;
}

// ===========================================================================
// Me
// ===========================================================================
function aiBriefing() {
  const t = today();
  const w7 = sayDo(addDays(t, -6), t), w28 = sayDo(addDays(t, -27), t);
  const days = range(addDays(t, -13), t);
  const ck = days.filter((d) => S.days[d]?.checkAt).map((d) => { const r = S.days[d]; return `${d}: mood ${r.mood}, energy ${r.energy}, sleep ${sleepOf(d) ?? '?'}h, novelty urge ${r.urge}, irritation ${r.irrit}, One Thing ${({ 1: 'kept', 0: 'missed' })[oneResult(d)] || 'n/a'}, built ${buildMin(d)}m, consumed ${consumeMin(d)}m`; });
  const open = S.commits.filter((c) => c.status === 'open').map((c) => `- ${c.date}${c.one ? ' ★' : ''} [${dom(c.domain).name}] ${c.text}${c.postponed ? ` (moved ${c.postponed}x)` : ''}`);
  const proj = S.projects.filter((p) => p.status === 'active').map((p) => `- ${p.title} | money: ${p.money || 'none'} | done = ${p.done || '?'} | kill if ${p.kill || '?'} | next: ${p.next || '?'}`);
  const goals = S.goals.filter((g) => g.status === 'active').map((g) => `- [${dom(g.domain).name}] ${g.title}: ${g.current}/${g.target} ${g.metric} by ${g.deadline}`);
  const pats = PATTERNS.map((p) => { const s = patternSignal(p.id); return `- ${p.name}: ${s.on ? 'ACTIVE' : s.on === false ? 'quiet' : 'no signal'}: ${s.text}`; });
  const hyp = HYPOTHESES.map((h) => `- ${h.text} → ${VERDICTS[testHypothesis(h).verdict][1]}`);
  const lastRec = [...S.records].sort((a, b) => b.at.localeCompare(a.at))[0];
  return `You are advising Eddie as his Council of Mind & Action. Data below is exported from his Council app on ${t}.

${AI_PROTOCOL}

Profile (self-reported tests): Intellect 93rd pct, Emotional stability 76th, Agreeableness 25th, Extraversion 15th, Conscientiousness 9th. INTP. Enneagram 8. Holland SIR. Self-esteem 17/30.
Core tension: ${CORE_TENSION}
Priorities in stated order: ${S.priorities.map((id) => dom(id).name).join(' > ')}.
Vision: ${S.vision}
Rules: ${S.rules.map((r) => `\n- ${r}`).join('')}

Say/Do: 7 days ${pct(w7.rate)} (${w7.kept} kept, ${w7.broken} broken); 28 days ${pct(w28.rate)}.
Actions by domain (28d kept): ${domainActions().rows.map((r) => `${dom(r.id).name} ${r.kept}`).join(', ')}.

Active projects:
${proj.join('\n') || '- none'}
90-day goals:
${goals.join('\n') || '- none'}
Open commitments:
${open.join('\n') || '- none'}
Pattern monitor:
${pats.join('\n')}
Hypothesis lab:
${hyp.join('\n')}
Last 14 days:
${ck.join('\n') || '- no check-ins'}
${lastRec ? `\nLatest Council record (${lastRec.type}, ${lastRec.date}): ${lastRec.title || ''}. Decision: ${lastRec.f.decision || '—'}` : ''}

My question:
`;
}

function renderMe() {
  const st = S.settings;
  const T = trainer();
  return `<section class="card"><h2>Profile</h2>
      <p>${esc(CORE_TENSION)}</p>
      <div class="list">${BASELINE.map(([n, p, note]) => `<div><div class="row between"><b>${esc(n)}</b><span class="small muted">${p}th percentile</span></div>${bar(p / 100, p < 20 ? 'warn' : 'cool')}<div class="small muted" style="margin-top:4px">${esc(note)}</div></div>`).join('')}</div>
      <div class="list">${OTHER_RESULTS.map(([k, v]) => `<div class="row between top"><span class="small muted">${esc(k)}</span><span class="small" style="text-align:right">${esc(v)}</span></div>`).join('')}</div>
      <details class="lens"><summary>Enneagram 8: growth and stress</summary><p class="small">${esc(ENNEAGRAM.growth)}</p><p class="small">${esc(ENNEAGRAM.stress)}</p></details>
      <p class="small muted">Traits are tendencies measured once, not verdicts. The Mirror tests them against what you actually do.</p>
    </section>
    <section class="card"><div class="row between"><h2>Operating rules</h2><button class="small-btn" data-act="rule-add">+ Rule</button></div>
      <div class="list">${S.rules.map((r, i) => `<div class="row between top"><span class="grow">${esc(r)}</span><div class="row"><button class="icon ghost" data-act="rule-edit" data-i="${i}" aria-label="Edit rule">✎</button><button class="icon ghost" data-act="rule-del" data-i="${i}" aria-label="Delete rule">✕</button></div></div>`).join('')}</div>
      ${why('Rules with reasons you agreed to beat instructions from outside. Change any that stop making sense.')}
    </section>
    <section class="card"><h2>Ask an AI</h2>
      <p class="small">Copies a briefing with your profile, the protocol (no sycophancy, evidence hierarchy, decision at the end) and the last 14 days. Paste it into Claude and add your question.</p>
      <button class="primary" data-act="ai-copy">Copy briefing</button>
      <details><summary>Preview</summary><div class="pre small muted">${esc(aiBriefing())}</div></details>
    </section>
    <section class="card"><h2>Settings</h2>
      <div class="row between"><span>High contrast</span>${seg([['off', 'Off'], ['on', 'On']], st.highContrast ? 'on' : 'off', 'set-contrast')}</div>
      <div class="row between"><span>Active projects max</span>${seg([[1, '1'], [2, '2'], [3, '3']], st.wip, 'set', 'data-k="wip"')}</div>
      <div class="row between"><span>Daily commitments max</span>${seg([[2, '2'], [3, '3'], [4, '4']], st.maxDaily, 'set', 'data-k="maxDaily"')}</div>
      <div class="row between"><span>Idea cooling-off</span>${seg([[3, '3d'], [7, '7d'], [14, '14d']], st.coolDays, 'set', 'data-k="coolDays"')}</div>
      <div class="row between"><span>Council timebox</span>${seg([[10, '10'], [15, '15'], [20, '20'], [30, '30']], st.councilMin, 'set', 'data-k="councilMin"')}</div>
      <div class="grid2"><label class="field">Worry window<input type="time" data-setk="worryAt" value="${esc(st.worryAt)}"></label><label class="field">Evening review<input type="time" data-setk="reviewAt" value="${esc(st.reviewAt)}"></label></div>
      <div class="row between"><span>Read Shredded Trainer data</span>${seg([['off', 'Off'], ['on', 'On']], st.trainer ? 'on' : 'off', 'set-trainer')}</div>
      <p class="small muted">${T.ok ? 'Shredded Trainer data found on this device (or the original Trainer if that is all there is): sleep, steps and training fill in automatically.' : 'No Shredded Trainer data found. Open Shredded Trainer once on this same site.'}</p>
    </section>
    <section class="card"><h2>Data</h2>
      <p class="small muted">Everything stays on this phone. Back up now and then.${storageOk ? '' : ' <b class="danger">Storage is failing on this device.</b>'}</p>
      <div class="btns"><button data-act="export">Back up</button><button data-act="import">Restore</button></div>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
      <button class="ghost danger" data-act="reset">Reset all data</button>
    </section>
    <section class="card"><h2>If things get bad</h2>
      <p class="small">This is a self-help tool, not a clinician. If you're in crisis or thinking about harming yourself:</p>
      <ul class="small"><li><b>Samaritans:</b> 116 123, free, 24 hours (UK and Ireland)</li><li><b>NHS 111</b> and choose the mental health option</li><li><b>999</b> in an emergency</li></ul>
    </section>`;
}

// ===========================================================================
// Sheets (modal forms)
// ===========================================================================
const sv = () => (ui.sheet ||= { vals: {} }).vals;
const sField = (k, label, ph = '', type = 'text') => `<label class="field">${label}<input type="${type}" data-sk="${k}" value="${esc(sv()[k] ?? '')}" placeholder="${esc(ph)}" ${type === 'number' ? 'inputmode="decimal"' : ''}></label>`;
const sArea = (k, label, ph = '') => `<label class="field">${label}<textarea data-sk="${k}" placeholder="${esc(ph)}">${esc(sv()[k] ?? '')}</textarea></label>`;

function sheetBody() {
  const s = ui.sheet, v = s.vals;
  switch (s.kind) {
    case 'ask':
      return [s.title || '', `<p class="ask-text">${esc(s.text)}</p><div class="btns">${(s.buttons || []).map((b, i) => `<button class="${b.cls || ''}" data-act="ask-btn" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>`];
    case 'commit': {
      const projects = S.projects.filter((p) => p.status === 'active');
      return [s.id ? 'Edit commitment' : v.one ? 'Today\'s One Thing' : 'New commitment', `
        ${sField('text', 'What will you do?', 'A behaviour, not an intention')}
        ${domChips(v.domain, 'sh-dom')}
        ${projects.length ? `<label class="field">Project<select data-sk="projectId"><option value="">None</option>${projects.map((p) => `<option value="${p.id}" ${v.projectId === p.id ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></label>` : ''}
        <div class="row between"><span>One Thing (★)</span>${seg([['0', 'No'], ['1', 'Yes']], v.one ? '1' : '0', 'sh-one')}</div>
        ${why('Phrase it so a camera could confirm it was done. "Work on the agent" can\'t be checked; "Write the agent\'s first tool function" can.')}
        <button class="primary" data-act="commit-save" ${v.text?.trim() ? '' : 'disabled'}>Commit</button>`];
    }
    case 'cmenu': {
      const c = S.commits.find((x) => x.id === s.id);
      return [c.text, `<div class="btns" style="display:grid;gap:8px">
        <button data-act="c-edit" data-id="${c.id}">Edit</button>
        ${!c.one ? `<button data-act="c-star" data-id="${c.id}">Make it the One Thing</button>` : ''}
        <button data-act="c-tomorrow" data-id="${c.id}">Move to tomorrow${c.postponed >= 1 ? ' (second move)' : ''}</button>
        <button data-act="c-missed" data-id="${c.id}">Mark missed</button>
        <button class="danger" data-act="c-kill" data-id="${c.id}">Retract it</button></div>
        <p class="small muted">Retracting before the day ends is honest renegotiation and doesn't count against you. Moving it is postponing, and the Mirror counts postponements.</p>`];
    }
    case 'idea':
      return ['New idea', `${sField('title', 'Idea', 'One line')}${domChips(v.domain || 'build', 'sh-dom')}${sArea('note', 'Note (optional)')}${sField('money', 'How could it earn money? (optional)')}
        ${why(`It goes to the vault and cools for ${S.settings.coolDays} days. Capturing it lets you drop it from your head without starting it.`)}
        <button class="primary" data-act="idea-save" ${v.title?.trim() ? '' : 'disabled'}>Put in the vault</button>`];
    case 'project':
      return [s.promote ? 'Promote to active' : 'Edit project', `${sField('title', 'Project')}${domChips(v.domain || 'build', 'sh-dom')}
        ${sField('money', 'Money path: how it earns', 'Who pays, for what')}
        ${sArea('done', 'Done means (shipped, not perfect)', 'The finished state a stranger could verify')}
        ${sArea('kill', 'Kill criteria', 'e.g. no paying customer by the deadline')}
        ${sField('deadline', 'Deadline (90 days at most)', '', 'date')}
        ${sField('next', 'Next physical action', 'The first thing you\'ll do')}
        ${why('Without a done definition a project never finishes. Without kill criteria it never dies, it just drifts.')}
        <button class="primary" data-act="project-save" ${v.title?.trim() && v.done?.trim() && v.kill?.trim() && v.deadline && v.next?.trim() ? '' : 'disabled'}>${s.promote ? 'Promote' : 'Save'}</button>
        ${!(v.done?.trim() && v.kill?.trim() && v.deadline && v.next?.trim()) ? '<p class="small muted">Done, kill criteria, deadline and next action are all required.</p>' : ''}`];
    case 'goal':
      return [s.id ? 'Edit goal' : `90-day goal: ${dom(v.domain).name}`, `${sField('title', 'Outcome')}
        <div class="grid3">${sField('start', 'Start', '', 'number')}${sField('target', 'Target', '', 'number')}${sField('current', 'Now', '', 'number')}</div>
        ${sField('metric', 'Measured in', 'e.g. £, sessions, weeks')}
        ${sField('deadline', 'Deadline', '', 'date')}
        ${sField('next', 'Next action', 'Shows up as a One Thing suggestion')}
        ${sArea('why', 'Why it matters')}
        <button class="primary" data-act="goal-save" ${v.title?.trim() && v.target !== '' && v.target != null && v.deadline ? '' : 'disabled'}>Save goal</button>`];
    case 'gupdate': {
      const g = S.goals.find((x) => x.id === s.id);
      return [g.title, `${sField('current', `Now (${g.metric})`, '', 'number')}${sField('next', 'Next action')}<button class="primary" data-act="gupdate-save">Save</button>`];
    }
    case 'close':
      return [s.title, `${sArea('reason', s.label, s.ph)}<div class="btns">${s.options.map(([val, l, cls]) => `<button class="${cls || ''}" data-act="close-save" data-v="${val}">${esc(l)}</button>`).join('')}</div>`];
    case 'worry':
      return ['Park it', `<p class="small">Write it down and leave it until the worry window at ${esc(S.settings.worryAt)}.</p>
        ${sArea('text', 'What is going round in your head?')}
        ${S.records.some((r) => r.type === 'standards') ? `<label class="field">Is it about a closed file?<select data-sk="fileId"><option value="">No</option>${S.records.filter((r) => r.type === 'standards').map((r) => `<option value="${r.id}" ${v.fileId === r.id ? 'selected' : ''}>${esc(r.f.who)}</option>`).join('')}</select></label>` : ''}
        ${v.fileId ? (() => { const r = S.records.find((x) => x.id === v.fileId); return r ? `<div class="verdict bad"><b>On file since ${esc(fmtShort(r.date))}: ${esc(r.verdict)}</b><span class="small">Decision: ${esc(r.f.decision || '—')}</span><span class="small">Is there <b>new behaviour</b>? If not, the file stays closed and more analysis won't change it.</span></div>` : ''; })() : ''}
        <button class="primary" data-act="worry-save" ${v.text?.trim() ? '' : 'disabled'}>Park until ${esc(S.settings.worryAt)}</button>`];
    case 'evidence':
      return ['Evidence', `${sArea('text', 'What did you do?', 'A fact a stranger could check')}${domChips(v.domain || 'mind', 'sh-dom')}<button class="primary" data-act="ev-save" ${v.text?.trim() ? '' : 'disabled'}>Add to the file</button>`];
    case 'text':
      return [s.title, `${sArea('text', s.label)}<button class="primary" data-act="text-save">Save</button>`];
    case 'week': {
      const st = weekStats(s.mon);
      return [`Week of ${fmtShort(s.mon)}`, `<div class="stats"><div class="stat"><b>${pct(st.sd.rate)}</b><span>Say/Do</span></div><div class="stat"><b>${st.oneHit}/${st.oneN}</b><span>One Things</span></div><div class="stat"><b>${fmtMin(st.build)}</b><span>Built</span></div><div class="stat"><b>${fmtMin(st.consume)}</b><span>Consumed</span></div></div>
        ${sArea('worked', 'What worked? (behaviour, not mood)')}
        ${sArea('failed', 'What failed?')}
        ${sArea('fix', 'Which system change fixes it? (not "try harder")')}
        ${sField('kill', 'Kill something? Project, goal, habit or rule')}
        ${sField('next', 'Next week\'s one commitment')}
        ${domChips(v.domain || S.priorities[0], 'sh-dom')}
        <button class="primary" data-act="week-save">Save review</button>`];
    }
    case 'record': {
      const r = S.records.find((x) => x.id === s.id);
      const f = r.f;
      const rows = [];
      const add = (l, x) => { if (x) rows.push(`<p class="small"><b>${esc(l)}:</b> ${esc(x)}</p>`); };
      if (r.type === 'session') {
        add('Situation', f.situation); add('Thought', f.thought); add('Emotion', f.emotion && `${f.emotion} ${f.intensity || ''}`);
        add('Belief', f.belief && `${f.belief}% → ${f.belief2 || '?'}%`);
        add('Distortions', (f.dist || []).map((k) => DISTORTIONS.find((x) => x[0] === k)?.[1]).join(', '));
        add('For', f.for); add('Against', f.against);
        LENSES.forEach((l) => add(l.name, f['lens_' + l.id]));
        add('Balanced', f.balanced);
      } else if (r.type === 'standards') {
        add('Verdict', r.verdict);
        STANDARDS.forEach(([k, n]) => add(n, f['s_' + k] && `${{ y: 'Meets', m: 'Mixed', f: 'Fails' }[f['s_' + k]]}${f['e_' + k] ? ` · ${f['e_' + k]}` : ''}`));
      } else {
        add('Options', f.options); add('Info that would change it', f.info); add('Steelman', f.steelman); add('Second order', f.second); add('Kill criteria', f.killc);
      }
      add('Decision', f.decision); add('Action', f.action);
      return [`${r.title || r.type} · ${fmtShort(r.date)}`, `${rows.join('')}<p class="small muted">${r.minutes} min${r.overtime ? ', over the timebox' : ''}</p><button class="ghost danger" data-act="rec-del" data-id="${r.id}">Delete record</button>`];
    }
    default: return ['', ''];
  }
}

function renderSheet() {
  document.querySelector('.sheet-wrap')?.remove();
  if (!ui.sheet) return;
  const [title, body] = sheetBody();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="row between"><h3>${esc(title)}</h3><button class="icon ghost" data-act="sheet-close" aria-label="Close">✕</button></div><div class="sheet-body">${body}</div></div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) { ui.sheet = null; renderSheet(); } });
  document.body.appendChild(wrap);
}
function openSheet(kind, extra = {}, vals = {}) {
  ui.sheet = { kind, ...extra, vals: { ...vals } };
  renderSheet();
  const first = document.querySelector('.sheet-body input:not([type=date]), .sheet-body textarea');
  if (first && !first.value) first.focus();
}
function ask(text, buttons, title = '') { openSheet('ask', { text, buttons, title }); }
function closeSheet() { ui.sheet = null; renderSheet(); }

// ===========================================================================
// Timer (Start button)
// ===========================================================================
function renderTimer() {
  const slot = document.getElementById('timer-slot');
  const tm = S.timer;
  document.body.classList.toggle('timing', !!tm);
  if (!tm) { slot.innerHTML = ''; return; }
  const left = tm.start + tm.min * 60000 - Date.now();
  slot.innerHTML = `<div class="timerbar" role="timer"><b data-left="${tm.start + tm.min * 60000}">${fmtClock(left)}</b><span class="grow">${esc(tm.text)}</span>
    <button data-act="t-more">+10</button><button data-act="t-stop">Stop</button><button data-act="t-done">Done ✓</button></div>`;
}
function stopTimer(markDone) {
  const tm = S.timer;
  if (!tm) return;
  const min = Math.max(1, Math.round((Date.now() - tm.start) / 60000));
  S.sessions.push({ id: uid(), date: today(), commitId: tm.commitId, min, at: new Date(tm.start).toISOString() });
  const c = S.commits.find((x) => x.id === tm.commitId);
  if (markDone && c) resolve(c, 'done');
  S.timer = null;
  commit();
  toast(markDone ? `${fmtMin(min)} logged. Done.` : `${fmtMin(min)} logged as built.`);
}

// ===========================================================================
// Main render
// ===========================================================================
function render() {
  trainerCache = null;
  document.documentElement.dataset.contrast = S.settings.highContrast ? 'high' : 'normal';
  document.getElementById('contrast-btn').setAttribute('aria-pressed', String(S.settings.highContrast));
  const w7 = sayDo(addDays(today(), -6), today());
  document.getElementById('saydo-pill').textContent = `Say/Do ${pct(w7.rate)}`;
  const view = document.getElementById('view');
  const fns = { today: renderToday, goals: renderGoals, council: renderCouncil, mirror: renderMirror, me: renderMe };
  view.innerHTML = fns[ui.tab]();
  document.getElementById('nav').innerHTML = TABS.map(([id, label, icon]) => `<button data-act="tab" data-v="${id}" ${ui.tab === id ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>${label}</button>`).join('');
  renderTimer();
  renderSheet();
}
function commit() { save(); render(); }

// ===========================================================================
// Actions
// ===========================================================================
function newDraft(type) {
  S.draft = { type, start: Date.now(), f: { domain: type === 'standards' ? 'relate' : 'mind', when: 'today' } };
}
function closeDraft(withAction) {
  const d = S.draft;
  if (!d) return;
  const minutes = Math.round((Date.now() - d.start) / 60000);
  const rec = { id: uid(), type: d.type, date: today(), at: new Date().toISOString(), f: { ...d.f }, minutes, overtime: minutes > S.settings.councilMin };
  rec.title = d.type === 'session' ? (d.f.thought || d.f.situation || '').slice(0, 60) : d.type === 'standards' ? d.f.who : d.f.question;
  if (d.type === 'standards') rec.verdict = standardsVerdict(d.f).short || 'Incomplete';
  if (withAction) {
    const t = today();
    const when = d.f.when || 'today';
    const date = when === 'tomorrow' ? addDays(t, 1) : when === 'week' ? addDays(mondayOf(t), 6) : t;
    const room = when !== 'today' || activeToday().length < S.settings.maxDaily;
    const c = addCommit({ date, text: d.f.action, domain: d.f.domain || 'mind', week: when === 'week', source: 'council' });
    rec.commitId = c.id;
    if (!room) toast('Added. Today is over the usual cap.');
  }
  S.records.push(rec);
  S.draft = null;
  commit();
  if (withAction) toast('Closed. The action is on your list.');
  else toast('Closed. Decision recorded.');
}

function exportData() {
  // Download where the browser allows it, and copy too: some hosts block downloads silently.
  copyText(JSON.stringify(S)).then((ok) => { if (ok) toast('Backup copied. Paste it into a note or email to yourself.'); });
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `council-backup-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove(); return ok;
  }
}

function handle(el) {
  const a = el.dataset.act, id = el.dataset.id, v = el.dataset.v;
  const c = id ? S.commits.find((x) => x.id === id) : null;
  const t = today();
  switch (a) {
    case 'tab': ui.tab = v; ui.sheet = null; render(); window.scrollTo(0, 0); return;
    case 'welcome-ok': S.notice = null; commit(); return;
    case 'sheet-close': closeSheet(); return;
    case 'ask-btn': { const b = ui.sheet.buttons[Number(el.dataset.i)]; closeSheet(); b.fn?.(); return; }

    // Check-in
    case 'ci': ui.checkin[el.dataset.k] = Number(v); render(); return;
    case 'ci-sleep': ui.checkin.sleep = clamp(Math.round((ui.checkin.sleep + Number(el.dataset.d)) * 2) / 2, 0, 14); render(); return;
    case 'ci-save': { const r = dayRec(t); Object.assign(r, ui.checkin, { checkAt: new Date().toISOString() }); ui.checkin = null; ui.editCheckin = false; commit(); toast('Checked in.'); return; }
    case 'checkin-edit': ui.editCheckin = true; ui.checkin = null; render(); return;

    // Commitments
    case 'c-add': openSheet('commit', {}, { text: '', domain: S.priorities[0], one: !!el.dataset.one, projectId: '' }); return;
    case 'one-sugg': { if (activeToday().length >= S.settings.maxDaily) { toast(`Today is full (${S.settings.maxDaily}). Retract one first.`); return; } const s = suggestions()[Number(el.dataset.i)]; addCommit({ date: t, text: s.text, domain: s.domain, projectId: s.projectId || '', goalId: s.goalId || '', one: true, source: 'today' }); commit(); return; }
    case 'sh-dom': sv().domain = v; renderSheet(); return;
    case 'sh-one': sv().one = v === '1'; renderSheet(); return;
    case 'commit-save': {
      const x = sv();
      if (ui.sheet.id) {
        const cc = S.commits.find((y) => y.id === ui.sheet.id);
        Object.assign(cc, { text: x.text.trim(), domain: x.domain, projectId: x.projectId || '' });
        if (x.one && !cc.one) { S.commits.filter((y) => y.date === cc.date && y.one).forEach((y) => { y.one = false; }); cc.one = true; }
        if (!x.one) cc.one = false;
      } else {
        const proj = S.projects.find((p) => p.id === x.projectId);
        addCommit({ date: t, text: x.text.trim(), domain: proj ? proj.domain : x.domain, projectId: x.projectId || '', one: !!x.one, source: 'today' });
      }
      ui.sheet = null; commit(); return;
    }
    case 'c-toggle': resolve(c, c.status === 'done' ? 'open' : 'done'); commit(); if (c.status === 'done') toast(c.one ? 'One Thing kept.' : 'Kept.'); return;
    case 'c-menu': openSheet('cmenu', { id }); return;
    case 'c-edit': openSheet('commit', { id }, { text: c.text, domain: c.domain, one: !!c.one, projectId: c.projectId || '' }); return;
    case 'c-star': S.commits.filter((y) => y.date === c.date && y.one).forEach((y) => { y.one = false; }); c.one = true; closeSheet(); commit(); return;
    case 'c-tomorrow': c.date = addDays(t, 1); c.postponed = (c.postponed || 0) + 1; S.postpones.push(t); closeSheet(); commit(); toast(c.postponed >= 2 ? 'Moved twice. Tomorrow it has to shrink or go.' : 'Moved. Postponement counted.'); return;
    case 'c-missed': resolve(c, 'missed'); closeSheet(); commit(); return;
    case 'c-kill': resolve(c, 'killed'); closeSheet(); commit(); toast('Retracted.'); return;

    // Resolving past days
    case 'r-done': resolve(c, 'done'); c.resolvedAt = c.date; commit(); return;
    case 'r-missed': resolve(c, 'missed'); commit(); return;
    case 'r-move':
      if (activeToday().length >= S.settings.maxDaily) { toast(`Today is full (${S.settings.maxDaily}). Mark it missed or retract something.`); return; }
      c.date = t; c.postponed = (c.postponed || 0) + 1; S.postpones.push(t); if (c.one && oneOn(t)) c.one = false; commit(); return;
    case 'r-shrink': openSheet('text', { title: 'Shrink it', label: 'A version you can finish in 20 minutes', onSave: (txt) => { resolve(c, 'missed'); addCommit({ date: t, text: txt, domain: c.domain, projectId: c.projectId, one: !oneOn(t), source: 'shrink' }); } }, { text: c.text }); return;
    case 'r-kill': resolve(c, 'killed'); commit(); toast('Killed. It counts as broken, and it\'s off your mind.'); return;

    // Timer
    case 'start':
      if (S.timer) { toast('A timer is already running.'); return; }
      S.timer = { commitId: id, text: c.text, start: Date.now(), min: START_MIN }; commit(); return;
    case 't-more': S.timer.min += 10; commit(); return;
    case 't-stop': stopTimer(false); return;
    case 't-done': stopTimer(true); return;

    // Quick logs
    case 'consume': { const r = dayRec(t); r.consume = (r.consume || 0) + Number(el.dataset.d); if (ui.review) ui.review.consume = r.consume; commit(); return; }
    case 'worry-new': openSheet('worry', {}, { text: '', fileId: '' }); return;
    case 'worry-save': { const x = sv(); S.worries.push({ id: uid(), date: t, at: new Date().toISOString(), text: x.text.trim(), fileId: x.fileId || '', status: 'parked' }); ui.sheet = null; commit(); toast(`Parked until ${S.settings.worryAt}.`); return; }
    case 'worry-drop': { const w = S.worries.find((x) => x.id === id); w.status = 'dropped'; commit(); return; }
    case 'worry-council': {
      const w = S.worries.find((x) => x.id === id);
      if (S.draft) { toast('Close the open Council session first.'); ui.tab = 'council'; ui.councilMode = S.draft.type; render(); return; }
      w.status = 'council'; newDraft('session'); S.draft.f.situation = w.text; ui.tab = 'council'; ui.councilMode = 'session'; commit(); return;
    }
    case 'idea-new': openSheet('idea', {}, { title: '', domain: 'build', note: '', money: '' }); return;
    case 'idea-save': { const x = sv(); S.projects.push({ id: uid(), status: 'vault', created: t, title: x.title.trim(), domain: x.domain || 'build', note: x.note || '', money: x.money || '', done: '', kill: '', deadline: '', next: '' }); ui.sheet = null; commit(); toast(`In the vault. Cooling for ${S.settings.coolDays} days.`); return; }

    // Review
    case 'review-open': ui.reviewOpen = true; ui.review = null; render(); return;
    case 'rv-trained': ui.review.trained = v === 'yes'; render(); return;
    case 'rv-dom': ui.review.tomorrowDomain = v; render(); return;
    case 'review-save': {
      const r = dayRec(t), x = ui.review;
      Object.assign(r, { build: Number(x.build) || 0, consume: Number(x.consume) || 0, evidence: x.evidence.trim(), kids: x.kids.trim(), note: x.note.trim(), trained: x.trained, reviewAt: new Date().toISOString() });
      const tm = addDays(t, 1), existing = oneOn(tm);
      if (x.tomorrow.trim()) {
        if (existing) Object.assign(existing, { text: x.tomorrow.trim(), domain: x.tomorrowDomain });
        else addCommit({ date: tm, text: x.tomorrow.trim(), domain: x.tomorrowDomain, one: true, source: 'review' });
      }
      ui.reviewOpen = false; ui.review = null; commit(); toast('Logged.'); return;
    }

    // Goals
    case 'goals-view': ui.goalsView = v; render(); return;
    case 'vision-edit': openSheet('text', { title: 'Vision', label: 'The life you are building toward', onSave: (txt) => { S.vision = txt; } }, { text: S.vision }); return;
    case 'prio': { const i = Number(el.dataset.i), j = i + Number(el.dataset.d); [S.priorities[i], S.priorities[j]] = [S.priorities[j], S.priorities[i]]; commit(); return; }
    case 'g-new': {
      const d = el.dataset.dom, tpl = el.dataset.tpl ? GOAL_TEMPLATES[d] : null;
      openSheet('goal', {}, { domain: d, title: tpl?.title || '', metric: tpl?.metric || '', start: 0, target: tpl?.target ?? '', current: 0, deadline: addDays(t, 90), why: tpl?.why || '', next: '' }); return;
    }
    case 'g-edit': { const g = S.goals.find((x) => x.id === id); openSheet('goal', { id }, { ...g }); return; }
    case 'goal-save': {
      const x = sv(), num = (n) => (n === '' || n == null ? 0 : Number(n));
      const fields = { title: x.title.trim(), metric: (x.metric || '').trim(), start: num(x.start), target: num(x.target), current: num(x.current), deadline: x.deadline, why: (x.why || '').trim(), next: (x.next || '').trim() };
      if (ui.sheet.id) Object.assign(S.goals.find((g) => g.id === ui.sheet.id), fields);
      else S.goals.push({ id: uid(), domain: x.domain, status: 'active', created: t, log: [], ...fields });
      ui.sheet = null; commit(); return;
    }
    case 'g-update': { const g = S.goals.find((x) => x.id === id); openSheet('gupdate', { id }, { current: g.current, next: g.next || '' }); return; }
    case 'gupdate-save': { const g = S.goals.find((x) => x.id === ui.sheet.id), x = sv(); g.current = Number(x.current) || 0; g.next = (x.next || '').trim(); g.log.push({ date: t, value: g.current }); ui.sheet = null; commit(); return; }
    case 'g-close': {
      const g = S.goals.find((x) => x.id === id);
      openSheet('close', { title: g.title, label: 'What did you learn?', ph: 'One line', options: [['done', 'Achieved', 'primary'], ['killed', 'Kill it', 'danger']], onSave: (val, reason) => { g.status = val; g.lesson = reason; g.closed = t; } });
      return;
    }
    case 'close-save': { const f = ui.sheet.onSave, reason = (sv().reason || '').trim(); f(v, reason); ui.sheet = null; commit(); return; }

    // Projects
    case 'p-promote': {
      const p = S.projects.find((x) => x.id === id);
      const active = S.projects.filter((x) => x.status === 'active');
      if (active.length >= S.settings.wip) { ask(`You have ${active.length} active project${active.length === 1 ? '' : 's'}, the limit. Ship, kill or park one first.\n\nThis is the rule doing its job: a new idea only gets in by finishing or ending an old one.`, [{ label: 'OK', cls: 'primary' }], 'Limit reached'); return; }
      openSheet('project', { id, promote: true }, { title: p.title, domain: p.domain, money: p.money, done: p.done, kill: p.kill, deadline: p.deadline || addDays(t, 60), next: p.next });
      return;
    }
    case 'p-edit': { const p = S.projects.find((x) => x.id === id); openSheet('project', { id }, { ...p }); return; }
    case 'project-save': {
      const x = sv(), p = S.projects.find((y) => y.id === ui.sheet.id);
      const doSave = () => {
        Object.assign(p, { title: x.title.trim(), domain: x.domain, money: (x.money || '').trim(), done: x.done.trim(), kill: x.kill.trim(), deadline: x.deadline, next: x.next.trim() });
        if (ui.sheet?.promote || p.status === 'vault') { p.status = 'active'; p.promoted = t; }
        ui.sheet = null; commit();
      };
      if (daysBetween(t, x.deadline) > 90) { toast('Deadline is over 90 days out. Cut the scope.'); return; }
      if (!x.money?.trim() && ui.sheet.promote) { const keep = { ...ui.sheet }; ask('No money path. Priority 1 is income. Promote it as a hobby project anyway?', [{ label: 'Promote anyway', fn: () => { ui.sheet = keep; doSave(); } }, { label: 'Add a money path', cls: 'primary', fn: () => { ui.sheet = keep; renderSheet(); } }]); return; }
      doSave(); return;
    }
    case 'p-ship': case 'p-kill': {
      const p = S.projects.find((x) => x.id === id), ship = a === 'p-ship';
      openSheet('close', { title: p.title, label: ship ? 'What shipped?' : 'Why kill it? (this is the lesson)', ph: '', options: [[ship ? 'shipped' : 'killed', ship ? 'Mark shipped' : 'Kill it', ship ? 'primary' : 'danger']], onSave: (val, reason) => { p.status = val; p.reason = reason; p.closed = t; if (ship) S.evidence.push({ id: uid(), date: t, domain: p.domain, text: `Shipped: ${p.title}${reason ? ` (${reason})` : ''}` }); } });
      return;
    }
    case 'p-park': { const p = S.projects.find((x) => x.id === id); p.status = 'vault'; commit(); toast('Parked in the vault.'); return; }
    case 'p-del': { const p = S.projects.find((x) => x.id === id); ask(`Delete "${p.title}" from the vault?`, [{ label: 'Cancel' }, { label: 'Delete', cls: 'danger', fn: () => { S.projects = S.projects.filter((x) => x.id !== id); commit(); } }]); return; }

    // Weekly review
    case 'week-open': { const w = S.weeks[el.dataset.mon] || {}; openSheet('week', { mon: el.dataset.mon }, { worked: w.worked || '', failed: w.failed || '', fix: w.fix || '', kill: w.kill || '', next: w.next || '', domain: w.domain || S.priorities[0] }); return; }
    case 'week-save': {
      const x = sv(), mon = ui.sheet.mon, st = weekStats(mon);
      const nextMon = addDays(mon, 7);
      const prev = S.weeks[mon];
      S.weeks[mon] = { ...x, rate: st.sd.rate, at: new Date().toISOString(), commitId: prev?.commitId };
      if (x.next?.trim()) {
        const old = prev?.commitId && S.commits.find((y) => y.id === prev.commitId);
        if (old) Object.assign(old, { text: x.next.trim(), domain: x.domain });
        else S.weeks[mon].commitId = addCommit({ date: addDays(nextMon, 6), text: x.next.trim(), domain: x.domain, week: true, source: 'week' }).id;
      }
      ui.sheet = null; commit(); toast('Week reviewed.'); return;
    }

    // Council
    case 'council-mode': ui.councilMode = v; render(); return;
    case 'd-new': if (S.draft) { ui.councilMode = S.draft.type; render(); toast('Finish the open one first.'); return; } newDraft(el.dataset.type); commit(); return;
    case 'd-dist': { const l = S.draft.f.dist ||= []; S.draft.f.dist = l.includes(v) ? l.filter((x) => x !== v) : [...l, v]; commit(); return; }
    case 'd-std': S.draft.f['s_' + el.dataset.k] = S.draft.f['s_' + el.dataset.k] === v ? '' : v; commit(); return;
    case 'd-when': S.draft.f.when = v; commit(); return;
    case 'd-dom': S.draft.f.domain = v; commit(); return;
    case 'd-close': closeDraft(true); return;
    case 'd-close-noaction': closeDraft(false); return;
    case 'd-discard': ask('Discard this session? Nothing is saved.', [{ label: 'Keep it' }, { label: 'Discard', cls: 'danger', fn: () => { S.draft = null; commit(); } }]); return;
    case 'rec-view': openSheet('record', { id }); return;
    case 'rec-del': ask('Delete this record?', [{ label: 'Cancel' }, { label: 'Delete', cls: 'danger', fn: () => { S.records = S.records.filter((r) => r.id !== id); commit(); } }]); return;

    // Evidence
    case 'ev-add': openSheet('evidence', {}, { text: '', domain: 'mind' }); return;
    case 'ev-save': { const x = sv(); S.evidence.push({ id: uid(), date: t, domain: x.domain, text: x.text.trim() }); ui.sheet = null; commit(); return; }
    case 'ev-del': S.evidence = S.evidence.filter((e) => e.id !== id); commit(); return;

    // Me
    case 'rule-add': openSheet('text', { title: 'New rule', label: 'Rule, with its reason', onSave: (txt) => { if (txt) S.rules.push(txt); } }, { text: '' }); return;
    case 'rule-edit': { const i = Number(el.dataset.i); openSheet('text', { title: 'Edit rule', label: 'Rule', onSave: (txt) => { if (txt) S.rules[i] = txt; else S.rules.splice(i, 1); } }, { text: S.rules[i] }); return; }
    case 'rule-del': { const i = Number(el.dataset.i); ask(`Delete this rule?\n\n${S.rules[i]}`, [{ label: 'Cancel' }, { label: 'Delete', cls: 'danger', fn: () => { S.rules.splice(i, 1); commit(); } }]); return; }
    case 'text-save': { const f = ui.sheet.onSave; f((sv().text || '').trim()); ui.sheet = null; commit(); return; }
    case 'ai-copy': copyText(aiBriefing()).then((ok) => toast(ok ? 'Copied. Paste it into Claude and add your question.' : 'Copy failed. Use the preview.')); return;
    case 'set': S.settings[el.dataset.k] = Number(v); commit(); return;
    case 'set-contrast': S.settings.highContrast = v === 'on'; commit(); return;
    case 'set-trainer': S.settings.trainer = v === 'on'; commit(); return;
    case 'export': exportData(); return;
    case 'import': document.getElementById('import-file').click(); return;
    case 'reset': ask('Reset everything? This deletes all commitments, goals, records and logs on this phone. Back up first if unsure.', [{ label: 'Cancel' }, { label: 'Reset', cls: 'danger', fn: () => { S = freshState(); ui.tab = 'today'; commit(); } }]); return;
    default:
  }
}

// ===========================================================================
// Events
// ===========================================================================
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  handle(el);
});
// Inputs keep their text across re-renders: sheets in ui.sheet.vals, Council drafts in S.draft (saved), review in ui.review.
let draftSaveTimer = null;
function onField(e) {
  const el = e.target;
  if (el.dataset.sk && ui.sheet) {
    sv()[el.dataset.sk] = el.value;
    // Re-enable the save button without re-rendering (which would drop focus).
    const [, body] = sheetBody();
    const tmp = document.createElement('div'); tmp.innerHTML = body;
    document.querySelectorAll('.sheet-body button[data-act]').forEach((b, i) => { const nb = tmp.querySelectorAll('button[data-act]')[i]; if (nb) b.disabled = nb.disabled; });
  } else if (el.dataset.dk && S.draft) {
    S.draft.f[el.dataset.dk] = el.value;
    clearTimeout(draftSaveTimer); draftSaveTimer = setTimeout(save, 400);
    const f = S.draft.f;
    document.querySelectorAll('[data-act="d-close"]').forEach((b) => { b.disabled = !(f.decision && f.action); });
    document.querySelectorAll('[data-act="d-close-noaction"]').forEach((b) => { b.disabled = !f.decision; });
  } else if (el.dataset.rk && ui.review) {
    ui.review[el.dataset.rk] = el.value;
  } else if (el.dataset.setk) {
    S.settings[el.dataset.setk] = el.value; save();
  }
}
document.addEventListener('input', onField);
document.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT' && e.target.dataset.sk) { onField(e); renderSheet(); } });
document.getElementById('contrast-btn').addEventListener('click', () => { S.settings.highContrast = !S.settings.highContrast; commit(); });
document.addEventListener('change', (e) => {
  if (e.target.id !== 'import-file') return;
  const file = e.target.files?.[0];
  if (!file) return;
  file.text().then((txt) => {
    let data;
    try { data = JSON.parse(txt); } catch { toast('That file isn\'t a Council backup.'); return; }
    if (!data || data.v !== 1 || !Array.isArray(data.commits)) { toast('That file isn\'t a Council backup.'); return; }
    ask('Replace everything on this phone with the backup?', [{ label: 'Cancel' }, { label: 'Restore', cls: 'primary', fn: () => { S = normalise(data); commit(); toast('Restored.'); } }]);
  });
  e.target.value = '';
});

// Live clocks: the Start timer and the Council timebox.
let buzzed = null;
setInterval(() => {
  const now = Date.now();
  document.querySelectorAll('[data-left]').forEach((el) => { el.textContent = fmtClock(Number(el.dataset.left) - now); });
  document.querySelectorAll('[data-elapsed]').forEach((el) => { const ms = now - Number(el.dataset.elapsed); el.textContent = fmtClock(ms); el.classList.toggle('danger', ms > S.settings.councilMin * 60000); });
  if (S.timer && now >= S.timer.start + S.timer.min * 60000 && buzzed !== S.timer.start + S.timer.min) {
    buzzed = S.timer.start + S.timer.min;
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* ignore */ }
    toast('Time. Stop here or keep going; the minutes count either way.');
  }
}, 1000);

// Re-render when the day changes or the app comes back to the foreground.
let lastDay = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const busy = ui.sheet || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (today() !== lastDay) { lastDay = today(); ui.checkin = null; ui.review = null; ui.reviewOpen = false; }
  if (!busy) render();
});

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

render();
