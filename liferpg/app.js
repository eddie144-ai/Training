'use strict';
/* Life RPG: the 4 pillars as one-tap quests, with six stats, HP, streaks and levels.
   Everything is recalculated from the logs on each render, so edits can never leave XP or HP wrong.
   All data lives in localStorage on this device. Trainer's data (same site) is read, never written. */

// ===========================================================================
// Constants
// ===========================================================================
const STORE_KEY = 'liferpg.v1';
const TRAINER_KEY = 'trainer.v1';
const CUT_REFS = ['gironda1', 'gironda2']; // Trainer's two Gironda meals.
const HP_MAX = 100;
const HP_MISS = 10; // per core quest missed
const HP_REGEN = 10; // per perfect day
const PERFECT_DISC = 20;
const WEEK_DISC = 50;
const MULT_STEP = 0.1;
const MULT_MAX_STEPS = 5; // ×1.5

const TABS = [
  ['today', 'Today', '<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/><circle cx="12" cy="12" r="4"/>'],
  ['quests', 'Quests', '<path d="M4 5h16M4 12h16M4 19h10"/><path d="m16 17 2 2 4-4"/>'],
  ['hero', 'Hero', '<path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/>'],
  ['setup', 'Setup', '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'],
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
const relDay = (s) => { const n = daysBetween(today(), s); return n === 0 ? 'Today' : n === -1 ? 'Yesterday' : fmtDate(s); };
const mondayOf = (s) => { const d = parseDate(s); return addDays(s, -((d.getDay() + 6) % 7)); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return v === '' || v == null || !Number.isFinite(n) ? null : n; };
const fmtNum = (n) => Math.round(n).toLocaleString('en-GB');
const statKeys = STATS.map((s) => s[0]);

// ===========================================================================
// State
// ===========================================================================
function freshState() {
  const t = today();
  return {
    v: 1,
    created: t,
    start: t,
    notice: 'welcome',
    settings: { highContrast: false, trainer: true },
    log: {}, // date → { questId: true | false | 'rest' | number }
    week: {}, // monday → { questId: date done }
    edits: {}, // questId → { label, xp, target, off }
    custom: [], // your own quests: { id, goal, label, type, xp, stat, metric, unit, target }
    traits: {},
  };
}

function normalise(s) {
  const d = freshState();
  if (!s || typeof s !== 'object') return d;
  const out = { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
  for (const k of ['log', 'week', 'edits', 'traits']) if (!out[k] || typeof out[k] !== 'object' || Array.isArray(out[k])) out[k] = {};
  if (!Array.isArray(out.custom)) out.custom = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.start || '')) out.start = d.start;
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

// ===========================================================================
// Quests: seed quests from data.js, with your edits, plus your own
// ===========================================================================
let questMemo = null;
function allQuests() {
  if (questMemo) return questMemo;
  const out = [];
  for (const dom of DOMAINS) {
    for (const g of dom.goals) {
      for (const q of g.quests) out.push({ ...q, goal: g.id, domain: dom.id, seed: true, ...(S.edits[q.id] || {}) });
      for (const c of S.custom.filter((x) => x.goal === g.id)) out.push({ ...c, domain: dom.id, ...(S.edits[c.id] || {}) });
    }
  }
  questMemo = out;
  return out;
}
const activeQuests = () => allQuests().filter((q) => !q.off);
const dailyQuests = () => activeQuests().filter((q) => q.type === 'daily');
const weeklyQuests = () => activeQuests().filter((q) => q.type === 'weekly');
const questById = (id) => allQuests().find((q) => q.id === id);
const goalById = (id) => { for (const d of DOMAINS) for (const g of d.goals) if (g.id === id) return { ...g, domain: d }; return null; };
// Optional quests (volume, steps) earn XP but a perfect day doesn't need them.
const required = (q) => !q.optional;

// ===========================================================================
// Trainer bridge (read-only). Works when both apps are served from the same site.
// ===========================================================================
let trainerMemo = null;
function trainer() {
  if (trainerMemo) return trainerMemo;
  let t = null;
  if (S.settings.trainer) {
    try { const raw = localStorage.getItem(TRAINER_KEY); if (raw) t = JSON.parse(raw); } catch { t = null; }
  }
  const workouts = Array.isArray(t?.workouts) ? t.workouts : [];
  const meals = Array.isArray(t?.meals) ? t.meals : [];
  const byDate = (arr) => { const m = new Map(); for (const x of arr) { if (!x?.date) continue; if (!m.has(x.date)) m.set(x.date, []); m.get(x.date).push(x); } return m; };
  const wByDate = byDate(workouts), mByDate = byDate(meals);
  const trainedDates = [...wByDate.keys()].sort();
  const chainOverride = (d, id) => t?.days?.[d]?.chains?.[id];
  trainerMemo = {
    ok: !!t,
    // true = trained; 'rest' = a planned rest or fast day, or within 7 days of the last session (Mentzer recovery).
    workout(d) {
      if (!t) return null;
      if (wByDate.has(d)) return true;
      const kind = t.plans?.[d]?.kind;
      if (kind === 'rest' || kind === 'fast') return 'rest';
      if (kind === 'train') return null;
      const last = trainedDates.filter((x) => x < d).pop();
      return last && daysBetween(last, d) <= 7 ? 'rest' : null;
    },
    volume(d) {
      if (!t || !wByDate.has(d)) return null;
      let v = 0;
      for (const w of wByDate.get(d)) for (const e of w.entries || []) for (const s of e.sets || []) v += (Number(s.kg) || 0) * (Number(s.reps) || 0);
      return v > 0 ? Math.round(v) : null;
    },
    steps(d) {
      if (!t) return null;
      const s = t.days?.[d]?.steps ?? t.garmin?.[d]?.steps;
      return s ? Number(s) : null;
    },
    // Both Gironda meals and nothing else, or a fast day. Trainer's own correction of the cut chain wins.
    gironda(d) {
      if (!t) return null;
      const o = chainOverride(d, 'cut');
      if (o === true || o === false) return o;
      const ms = mByDate.get(d) || [];
      if (ms.some((m) => !CUT_REFS.includes(m.ref))) return false;
      if (CUT_REFS.every((r) => ms.some((m) => m.ref === r))) return true;
      if (!ms.length && d < today() && (t.plans?.[d]?.kind === 'fast' || t.days?.[d]?.fast)) return true;
      return null;
    },
    // Trainer only knows about coffee slips; alcohol is yours to report here.
    coffee(d) {
      if (!t) return null;
      const o = chainOverride(d, 'coffee');
      return o === true || o === false ? o : null;
    },
  };
  return trainerMemo;
}
const trainerValue = (q, d) => (q.auto && trainer()[q.auto] ? trainer()[q.auto](d) : null);

// ===========================================================================
// Quest status for a day: done | rest | miss | pending | off
// ===========================================================================
function rawValue(q, d) {
  const own = S.log[d]?.[q.id];
  if (own !== undefined) return { v: own, from: 'you' };
  const tv = trainerValue(q, d);
  if (tv !== null && tv !== undefined) return { v: tv, from: 'Trainer' };
  return { v: undefined, from: null };
}

function statusOf(q, d) {
  const t = today();
  if (d < S.start || d > t) return 'off';
  const past = d < t;
  const { v } = rawValue(q, d);
  if (q.metric === 'numeric') {
    if (typeof v === 'number') return v >= (q.target || 1) ? 'done' : past ? 'miss' : 'pending';
    if (v === false) return 'miss';
    return past ? 'miss' : 'pending';
  }
  if (v === true) return 'done';
  if (v === 'rest') return 'rest';
  if (v === false) return 'miss';
  // Clean quests (zero alcohol/coffee) keep counting on their own: a past day is clean unless you reported a slip.
  if (q.clean) return past ? 'done' : 'pending';
  return past ? 'miss' : 'pending';
}

// ===========================================================================
// The engine: replays every day from the start date
// ===========================================================================
const levelOf = (xp) => Math.floor((1 + Math.sqrt(1 + xp / 31.25)) / 2);
const levelFloor = (L) => 125 * L * (L - 1);
const statValue = (xp) => 1 + Math.floor(Math.sqrt(xp / 10));
const statFloor = (v) => 10 * (v - 1) * (v - 1);
const multFor = (streak) => 1 + MULT_STEP * Math.min(MULT_MAX_STEPS, streak);

let gameMemo = null;
function game() {
  if (gameMemo) return gameMemo;
  const t = today();
  const daily = dailyQuests(), weekly = weeklyQuests();
  const req = daily.filter(required);
  const stat = Object.fromEntries(statKeys.map((k) => [k, 0]));
  let xp = 0, hp = HP_MAX, streak = 0, best = 0, perfects = 0, respecs = 0;
  const days = {}, events = [];
  const gain = (k, n) => { stat[k] = (stat[k] || 0) + n; xp += n; };

  for (let d = S.start; d <= t; d = addDays(d, 1)) {
    const past = d < t;
    const mult = multFor(streak);
    const st = {};
    let earned = 0;
    for (const q of daily) {
      st[q.id] = statusOf(q, d);
      if (st[q.id] === 'done') { const n = Math.round(q.xp * mult); gain(q.stat, n); earned += n; }
    }
    // Weekly quests pay out on the day you ticked them.
    const mon = mondayOf(d);
    for (const q of weekly) if (S.week[mon]?.[q.id] === d) { const n = Math.round(q.xp * mult); gain(q.stat, n); earned += n; }
    if (weekly.length && weekly.every((q) => S.week[mon]?.[q.id]) && weekly.map((q) => S.week[mon][q.id]).sort().pop() === d) {
      gain('DISC', WEEK_DISC); earned += WEEK_DISC;
      events.push({ d, k: 'good', text: `Full week of weekly quests · +${WEEK_DISC} DISC` });
    }
    const perfect = req.length > 0 && req.every((q) => st[q.id] === 'done' || st[q.id] === 'rest');
    let hpDelta = 0;
    if (perfect) {
      gain('DISC', PERFECT_DISC); earned += PERFECT_DISC;
      hpDelta += Math.min(HP_REGEN, HP_MAX - hp);
      streak += 1; perfects += 1; best = Math.max(best, streak);
    } else if (past) {
      if (streak >= 2) events.push({ d, k: 'warn', text: `Streak of ${streak} ended` });
      streak = 0;
    }
    const missed = past ? daily.filter((q) => q.core && st[q.id] === 'miss') : [];
    if (missed.length) {
      hpDelta -= HP_MISS * missed.length;
      events.push({ d, k: 'bad', text: `−${HP_MISS * missed.length} HP · missed ${missed.map((q) => q.label).join(', ')}` });
    }
    hp = clamp(hp + hpDelta, 0, HP_MAX);
    let respec = false;
    if (hp <= 0) {
      const lost = xp - levelFloor(levelOf(xp));
      xp -= lost; hp = HP_MAX; respecs += 1; respec = true;
      events.push({ d, k: 'bad', text: `Respec: 0 HP. Lost ${fmtNum(lost)} XP from level ${levelOf(xp)}; HP refilled.` });
    }
    const doneN = req.filter((q) => st[q.id] === 'done' || st[q.id] === 'rest').length;
    days[d] = { st, perfect, mult, earned, hpDelta, respec, doneN, reqN: req.length, missedCore: missed.length };
  }
  const L = levelOf(xp);
  gameMemo = {
    xp, hp, stat, streak, best, perfects, respecs, days, events: events.reverse(),
    level: L, into: xp - levelFloor(L), span: levelFloor(L + 1) - levelFloor(L),
    multToday: days[t]?.mult ?? 1,
  };
  return gameMemo;
}

function invalidate() { questMemo = null; gameMemo = null; trainerMemo = null; }
function commit() { save(); invalidate(); render(); }

// ===========================================================================
// UI state and shell
// ===========================================================================
const ui = { tab: 'today', day: today(), sheet: null, flash: null };
const $ = (id) => document.getElementById(id);

function bar(frac, cls = '') { return `<div class="bar ${cls}"><i style="width:${clamp(frac, 0, 1) * 100}%"></i></div>`; }
function statChip(k) { return `<span class="chip stat" style="--c:var(--${k})">${k}</span>`; }

function renderHud() {
  const g = game();
  $('hud').innerHTML = `
    <div class="hud-top">
      <span class="lvl">LV ${g.level}</span>
      <h1>Life RPG</h1>
      ${g.multToday > 1 ? `<span class="chip acc" title="Streak multiplier">×${g.multToday.toFixed(1)}</span>` : ''}
      <button class="icon ghost" data-act="contrast" aria-label="Toggle high contrast" aria-pressed="${S.settings.highContrast}">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>
      </button>
    </div>
    <div class="meters">
      <div class="meter"><div class="lab"><span>HP</span><span>${g.hp}/${HP_MAX}</span></div>${bar(g.hp / HP_MAX, 'hp')}</div>
      <div class="meter"><div class="lab"><span>XP</span><span>${Math.floor((g.into / g.span) * 100)}%</span></div>${bar(g.into / g.span, 'xp')}</div>
    </div>
    <div class="statrow">${statKeys.map((k) => `<div class="st" id="st-${k}" style="--c:var(--${k})"><b>${statValue(g.stat[k])}</b><span>${k}</span></div>`).join('')}</div>`;
}

function renderNav() {
  $('nav').innerHTML = TABS.map(([id, label, path]) => `<button data-tab="${id}" ${ui.tab === id ? 'aria-current="page"' : ''}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>${label}</button>`).join('');
}

function renderDock() {
  const t = today();
  const qs = dailyQuests().filter((q) => q.dock);
  $('dock').innerHTML = qs.map((q) => {
    const s = statusOf(q, t);
    const on = s === 'done' || s === 'rest';
    return `<button data-act="dock" data-q="${q.id}" class="${on ? 'on' : ''}" aria-pressed="${on}">${on ? '✓ ' : ''}${esc(q.dock)}</button>`;
  }).join('');
}

function render() {
  document.documentElement.dataset.contrast = S.settings.highContrast ? 'high' : 'normal';
  renderHud();
  renderNav();
  renderDock();
  const view = { today: viewToday, quests: viewQuests, hero: viewHero, setup: viewSetup }[ui.tab] || viewToday;
  $('view').innerHTML = view();
  if (ui.flash) {
    const el = document.querySelector(`[data-q="${ui.flash}"].quest`);
    if (el) el.classList.add('flash');
    ui.flash = null;
  }
  renderSheet();
}

// ===========================================================================
// Today
// ===========================================================================
function questRow(q, d) {
  const s = statusOf(q, d);
  const { v, from } = rawValue(q, d);
  const tick = { done: '✓', rest: 'R', miss: '✕' }[s] || '';
  const mult = game().days[d]?.mult ?? 1;
  let sub = q.sub || '';
  if (q.metric === 'numeric') {
    const val = typeof v === 'number' ? `${fmtNum(v)} ${q.unit || ''}` : 'Tap to enter';
    sub = `${val}${q.target > 1 ? ` · target ${fmtNum(q.target)}` : ''}`;
  }
  if (s === 'rest') sub = 'Rest day (counts as kept)';
  if (from === 'Trainer') sub = `${sub ? `${sub} · ` : ''}from Trainer`;
  if (q.clean && s === 'pending') sub = 'Counts unless you report a slip';
  return `<button class="quest ${s} ${q.core ? 'core' : ''}" data-act="quest" data-q="${q.id}" data-d="${d}" aria-label="${esc(q.label)}: ${s}">
    <span class="tick" aria-hidden="true">${tick}</span>
    <span class="grow"><span class="qlabel">${esc(q.label)}</span>${sub ? `<span class="qsub">${esc(sub)}</span>` : ''}</span>
    <span class="qxp">+${Math.round(q.xp * (q.type === 'daily' ? mult : 1))}<br>${q.stat}</span></button>`;
}

function weeklyRow(q, d) {
  const mon = mondayOf(d);
  const when = S.week[mon]?.[q.id];
  return `<button class="quest ${when ? 'done' : 'pending'}" data-act="weekly" data-q="${q.id}" data-d="${d}" aria-label="${esc(q.label)}: ${when ? 'done' : 'open'}">
    <span class="tick" aria-hidden="true">${when ? '✓' : ''}</span>
    <span class="grow"><span class="qlabel">${esc(q.label)}</span><span class="qsub">${when ? `Done ${relDay(when)}` : 'This week'}</span></span>
    <span class="qxp">+${q.xp}<br>${q.stat}</span></button>`;
}

function viewToday() {
  const t = today();
  const d = ui.day < S.start ? S.start : ui.day > t ? t : ui.day;
  const g = game();
  const day = g.days[d] || { doneN: 0, reqN: 0 };
  const daily = dailyQuests(), weekly = weeklyQuests();
  const mon = mondayOf(d);
  const wkDone = weekly.filter((q) => S.week[mon]?.[q.id]).length;
  const coreOpen = d === t ? daily.filter((q) => q.core && statusOf(q, t) === 'pending') : [];
  const out = [];

  if (S.notice === 'welcome') {
    out.push(`<section class="card focus"><h2>Briefing</h2>
      <p>Every quest is one tap. Red-edged quests are <b>core</b>: miss one and it costs ${HP_MISS} HP once the day is over. A perfect day restores HP and builds your streak multiplier up to ×1.5.</p>
      <p class="muted">${trainer().ok ? 'Trainer data found on this phone: workouts, volume, steps, Gironda meals and coffee slips fill in by themselves.' : 'Open Trainer on this site and its workouts, steps and meals will fill in quests here by themselves.'}</p>
      <button class="primary" data-act="dismiss">Start</button></section>`);
  }

  out.push(`<section class="card">
    <div class="daynav">
      <button class="icon" data-act="day" data-v="-1" ${d <= S.start ? 'disabled' : ''} aria-label="Previous day">◀</button>
      <b>${esc(relDay(d))}</b>
      <button class="icon" data-act="day" data-v="1" ${d >= t ? 'disabled' : ''} aria-label="Next day">▶</button>
    </div>
    <div class="kpis">
      <div class="kpi"><b class="${day.perfect ? 'good-text' : ''}">${day.doneN}/${day.reqN}</b><span>${day.perfect ? 'Perfect day' : 'Required done'}</span></div>
      <div class="kpi"><b>${g.streak}</b><span>Streak · ×${(day.mult || 1).toFixed(1)}</span></div>
      <div class="kpi"><b class="accent">+${fmtNum(day.earned || 0)}</b><span>XP ${d === t ? 'today' : 'that day'}</span></div>
    </div>
    ${bar(day.reqN ? day.doneN / day.reqN : 0)}
    ${coreOpen.length && new Date().getHours() >= 18 ? `<p class="small bad-text">Core still open: ${coreOpen.map((q) => esc(q.label)).join(', ')}. −${HP_MISS * coreOpen.length} HP at midnight.</p>` : ''}
  </section>`);

  DOMAINS.forEach((dom, i) => {
    const qs = daily.filter((q) => q.domain === dom.id);
    if (!qs.length) return;
    out.push(`<section class="card"><div class="pillar-h"><span class="n">${i + 1}</span>${esc(dom.name)}</div>
      <div class="qgrid">${qs.map((q) => questRow(q, d)).join('')}</div></section>`);
  });

  if (weekly.length) {
    out.push(`<section class="card"><h2>Weekly · w/c ${fmtShort(mon)}<span class="right">${wkDone}/${weekly.length}</span></h2>
      <div class="qgrid">${weekly.map((q) => weeklyRow(q, d)).join('')}</div>
      <p class="muted small">All ${weekly.length} in one week: +${WEEK_DISC} DISC.</p></section>`);
  }
  return out.join('');
}

// ===========================================================================
// Quests: the 4 pillars as a tree, with history and editing
// ===========================================================================
function dots(q) {
  const t = today();
  if (q.type === 'weekly') {
    const weeks = [3, 2, 1, 0].map((n) => mondayOf(addDays(t, -7 * n)));
    return `<span class="dots" aria-label="Last 4 weeks">${weeks.map((m) => `<i class="${addDays(m, 6) < S.start ? 'off' : S.week[m]?.[q.id] ? 'done' : ''}"></i>`).join('')}</span>`;
  }
  const ds = [6, 5, 4, 3, 2, 1, 0].map((n) => addDays(t, -n));
  return `<span class="dots" aria-label="Last 7 days">${ds.map((d) => `<i class="${statusOf(q, d)}"></i>`).join('')}</span>`;
}

function viewQuests() {
  const out = [`<section class="card"><h2>Main quest engine</h2>
    <p class="muted small">The 4 pillars, their goals and the quests that feed them. Tap a quest to rename it, change its XP or switch it off. Dots: last 7 days (weekly: last 4 weeks).</p></section>`];
  DOMAINS.forEach((dom, i) => {
    out.push(`<section class="card"><div class="pillar-h"><span class="n">${i + 1}</span>${esc(dom.name)}</div>
      ${dom.goals.map((g) => {
        const qs = allQuests().filter((q) => q.goal === g.id);
        return `<div class="goal"><div class="goal-t">${esc(g.title)} ${g.stats.map(statChip).join('')}</div>
          <div class="list">${qs.map((q) => `<div class="row between" data-act="edit" data-q="${q.id}" role="button" tabindex="0" style="cursor:pointer;${q.off ? 'opacity:.45' : ''}">
            <span class="grow"><b class="small">${esc(q.label)}</b><br><span class="muted small">${q.type} · +${q.xp} ${q.stat}${q.core ? ' · <span class="bad-text">core</span>' : ''}${q.optional ? ' · optional' : ''}${q.off ? ' · off' : ''}${q.auto ? ' · auto' : ''}</span></span>
            ${q.off ? '' : dots(q)}</div>`).join('')}</div>
          <button class="small-btn ghost" data-act="add" data-goal="${g.id}">+ Add quest</button></div>`;
      }).join('')}</section>`);
  });
  return out.join('');
}

// ===========================================================================
// Hero: character sheet, calendar, log, traits, rules
// ===========================================================================
function viewHero() {
  const g = game();
  const t = today();
  const out = [];
  out.push(`<section class="card"><h2>Character<span class="right">${fmtNum(g.xp)} XP</span></h2>
    <div class="row between"><span class="big">LV ${g.level}</span><span class="muted mono">${fmtNum(g.span - g.into)} XP to LV ${g.level + 1}</span></div>
    ${bar(g.into / g.span, 'xp')}
    <div class="kpis">
      <div class="kpi"><b>${g.hp}</b><span>HP</span></div>
      <div class="kpi"><b>${g.streak}<small class="muted"> / ${g.best}</small></b><span>Streak / best</span></div>
      <div class="kpi"><b>${g.perfects}</b><span>Perfect days</span></div>
    </div>
    ${g.respecs ? `<p class="small bad-text">Respecs so far: ${g.respecs}.</p>` : ''}</section>`);

  out.push(`<section class="card"><h2>Stats</h2>
    <div class="list">${STATS.map(([k, name, why]) => {
      const x = g.stat[k], v = statValue(x), lo = statFloor(v), hi = statFloor(v + 1);
      return `<div style="--c:var(--${k})"><div class="statline"><b>${k}</b>${bar((x - lo) / (hi - lo))}<span class="mono" style="text-align:right">${v}</span></div>
        <span class="muted small">${esc(name)} · ${esc(why)} · ${fmtNum(x)} XP</span></div>`;
    }).join('')}</div></section>`);

  // Five weeks, Monday first.
  const from = mondayOf(addDays(t, -28));
  const cells = [];
  for (let d = from; d <= addDays(mondayOf(t), 6); d = addDays(d, 1)) {
    const r = g.days[d];
    const cls = !r ? 'off' : [r.perfect ? 'perfect' : r.doneN ? 'part' : '', r.hpDelta < 0 ? 'hurt' : '', d === t ? 'today' : ''].join(' ');
    cells.push(`<div class="${cls}" title="${fmtDate(d)}">${parseDate(d).getDate()}</div>`);
  }
  out.push(`<section class="card"><h2>Last 5 weeks</h2>
    <div class="cal">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<span>${x}</span>`).join('')}${cells.join('')}</div>
    <p class="muted small">Green: perfect day. Pale: some quests. Red ring: lost HP.</p></section>`);

  out.push(`<section class="card"><h2>Combat log</h2>${g.events.length
    ? `<div class="list">${g.events.slice(0, 20).map((e) => `<div class="event"><span>${fmtShort(e.d)}</span><span class="${e.k === 'bad' ? 'bad-text' : e.k === 'good' ? 'good-text' : 'warn-text'}">${esc(e.text)}</span></div>`).join('')}</div>`
    : '<p class="muted">Nothing yet. HP losses, respecs, ended streaks and full weeks show here.</p>'}</section>`);

  const tr = S.traits;
  out.push(`<section class="card"><h2>Trait profile<span class="right"><button class="small-btn ghost" data-act="traits">Edit</button></span></h2>
    ${TRAITS.some(([k]) => tr[k] != null) ? `<div class="list">${TRAITS.map(([k, name]) => `<div class="statline" style="--c:var(--accent);grid-template-columns:150px 1fr 40px"><span class="small">${name}</span>${bar((tr[k] ?? 0) / 100)}<span class="mono" style="text-align:right">${tr[k] ?? '—'}</span></div>`).join('')}</div>
      ${tr.C != null && tr.C < 40 ? '<p class="muted small">Low conscientiousness is why this app is built the way it is: one tap per quest, Trainer fills in what it can, and the streak multiplier pays you for showing up.</p>' : ''}`
    : '<p class="muted">Add your Big Five scores (0–100). They stay on this phone.</p>'}</section>`);

  out.push(`<section class="card"><h2>How it works</h2><div class="list">${RULES.map(([h, p]) => `<div><b class="small">${esc(h)}</b><p class="muted small">${esc(p)}</p></div>`).join('')}</div></section>`);
  return out.join('');
}

// ===========================================================================
// Setup
// ===========================================================================
function viewSetup() {
  const T = trainer();
  return `
  <section class="card"><h2>Start date</h2>
    <p class="muted small">Days before this don't count. Moving it earlier replays those days (missed core quests will cost HP).</p>
    <label class="field">Game starts<input type="date" id="start" value="${S.start}" max="${today()}"></label></section>
  <section class="card"><h2>Trainer link</h2>
    <div class="row between"><span>Read Trainer data</span><div class="seg" style="width:140px">
      <button data-act="trainer" data-v="off" aria-pressed="${!S.settings.trainer}">Off</button><button data-act="trainer" data-v="on" aria-pressed="${S.settings.trainer}">On</button></div></div>
    <p class="muted small">${!S.settings.trainer ? 'Off.' : T.ok ? '✓ Trainer data found. Workouts and rest days, lifting volume, steps (including Garmin), the Gironda meals and coffee slips fill in by themselves. Anything you tap here wins.' : 'No Trainer data on this phone yet. Trainer has to be opened on this same site (eddie144-ai.github.io/training/).'}</p></section>
  <section class="card"><h2>Display</h2>
    <div class="row between"><span>High contrast</span><div class="seg" style="width:140px">
      <button data-act="contrast-set" data-v="off" aria-pressed="${!S.settings.highContrast}">Off</button><button data-act="contrast-set" data-v="on" aria-pressed="${S.settings.highContrast}">On</button></div></div></section>
  <section class="card"><h2>Backup</h2>
    <p class="muted small">Your data lives only on this phone${storageOk ? '' : ' <b class="bad-text">and saving is failing right now</b>'}. Keep a copy.</p>
    <div class="btns"><button data-act="backup-dl">Download</button><button data-act="backup-copy">Copy</button></div>
    <label class="btn" style="cursor:pointer">Restore from file<input type="file" id="restore" accept="application/json,.json" class="sr"></label></section>
  <section class="card"><h2>Danger zone</h2>
    <button class="danger" data-act="reset">Reset all Life RPG data</button>
    <p class="muted small">Trainer's data is never touched.</p></section>
  <p class="muted small" style="text-align:center">Life RPG v1 · offline · no account</p>`;
}

// ===========================================================================
// Sheets (bottom dialogs)
// ===========================================================================
function renderSheet() {
  let wrap = document.querySelector('.sheet-wrap');
  if (!ui.sheet) { if (wrap) wrap.remove(); return; }
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'sheet-wrap'; document.body.appendChild(wrap); }
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${ui.sheet.html()}</div>`;
  const first = wrap.querySelector('input:not([type=checkbox]), select');
  if (first && ui.sheet.focus !== false) { first.focus(); ui.sheet.focus = false; }
}
function closeSheet() { ui.sheet = null; renderSheet(); }

function numberSheet(q, d) {
  const { v } = rawValue(q, d);
  const tv = trainerValue(q, d);
  ui.sheet = {
    html: () => `<h3>${esc(q.label)}</h3><p class="muted small">${esc(relDay(d))}${q.target > 1 ? ` · target ${fmtNum(q.target)} ${esc(q.unit || '')}` : ''}${tv != null ? ` · Trainer says ${fmtNum(tv)}` : ''}</p>
      <form id="num-form" class="btns" style="display:grid;gap:10px">
        <input id="num-in" inputmode="numeric" type="number" min="0" step="any" placeholder="${esc(q.unit || '')}" value="${typeof v === 'number' ? v : ''}" aria-label="${esc(q.label)}">
        <div class="btns"><button type="button" data-act="num-clear">Clear</button><button type="submit" class="primary">Save</button></div>
      </form>`,
    q, d,
  };
  renderSheet();
}

function editSheet(q) {
  const custom = !q.seed;
  ui.sheet = {
    html: () => `<h3>${custom ? 'Your quest' : 'Edit quest'}</h3>
      <form id="edit-form" style="display:grid;gap:10px">
        <label class="field">Name<input name="label" required maxlength="80" value="${esc(q.label)}"></label>
        <div class="grid2"><label class="field">XP<input name="xp" type="number" min="1" max="500" value="${q.xp}"></label>
        ${q.metric === 'numeric' ? `<label class="field">Target (${esc(q.unit || '')})<input name="target" type="number" min="1" value="${q.target || 1}"></label>` : `<label class="field">Stat<select name="stat">${statKeys.map((k) => `<option ${k === q.stat ? 'selected' : ''}>${k}</option>`).join('')}</select></label>`}</div>
        <div class="row between"><span>Active</span><div class="seg" style="width:140px"><button type="button" data-act="edit-off" data-v="1" aria-pressed="${!!q.off}">Off</button><button type="button" data-act="edit-off" data-v="0" aria-pressed="${!q.off}">On</button></div></div>
        <p class="muted small">${q.type === 'daily' ? 'Daily' : 'Weekly'}${q.core ? ' · core (costs HP when missed)' : ''}${q.auto ? ' · filled in from Trainer' : ''}. Switching a quest off removes it from past days too.</p>
        <div class="btns">${custom ? '<button type="button" class="danger" data-act="edit-delete">Delete</button>' : '<button type="button" data-act="edit-revert">Revert</button>'}<button type="button" data-act="close">Cancel</button><button type="submit" class="primary">Save</button></div>
      </form>`,
    q, off: !!q.off,
  };
  renderSheet();
}

function addSheet(goalId) {
  const g = goalById(goalId);
  ui.sheet = {
    html: () => `<h3>New quest · ${esc(g.title)}</h3>
      <form id="add-form" style="display:grid;gap:10px">
        <label class="field">Name<input name="label" required maxlength="80" placeholder="One concrete action"></label>
        <div class="grid2"><label class="field">Repeats<select name="type"><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
        <label class="field">XP<input name="xp" type="number" min="1" max="500" value="30"></label></div>
        <label class="field">Stat<select name="stat">${statKeys.map((k) => `<option ${k === g.stats[0] ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <p class="muted small">Keep it binary: done or not. More daily quests make a perfect day harder.</p>
        <div class="btns"><button type="button" data-act="close">Cancel</button><button type="submit" class="primary">Add</button></div>
      </form>`,
    goalId,
  };
  renderSheet();
}

function traitsSheet() {
  ui.sheet = {
    html: () => `<h3>Trait profile</h3><p class="muted small">Big Five percentiles, 0–100. Leave blank to skip.</p>
      <form id="traits-form" style="display:grid;gap:10px">
        ${TRAITS.map(([k, name, why]) => `<label class="field">${name} <span class="muted small">${why}</span><input name="${k}" type="number" min="0" max="100" value="${S.traits[k] ?? ''}"></label>`).join('')}
        <div class="btns"><button type="button" data-act="close">Cancel</button><button type="submit" class="primary">Save</button></div>
      </form>`,
  };
  renderSheet();
}

function ask(text, label, fn) {
  ui.sheet = { html: () => `<p>${esc(text)}</p><div class="btns"><button data-act="close">Cancel</button><button class="primary danger" data-act="ask-ok">${esc(label)}</button></div>`, fn, focus: false };
  renderSheet();
}

// ===========================================================================
// Feedback: compare the game before and after a change
// ===========================================================================
let toastTimer = null;
function toast(msg, cls = '') {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

function changeWithFeedback(fn, qid) {
  const before = game();
  const was = { xp: before.xp, level: before.level, stat: { ...before.stat }, perfect: before.days[today()]?.perfect };
  fn();
  save(); invalidate();
  ui.flash = qid;
  render();
  const after = game();
  const diffs = statKeys.map((k) => [k, after.stat[k] - was.stat[k]]).filter(([, n]) => n !== 0);
  for (const [k, n] of diffs) if (n > 0) document.getElementById(`st-${k}`)?.classList.add('bump');
  if (after.level > was.level) { toast(`LEVEL UP · LV ${after.level}`, 'xp'); return; }
  if (after.days[today()]?.perfect && !was.perfect) { toast(`PERFECT DAY · +${PERFECT_DISC} DISC · +${HP_REGEN} HP`, 'xp'); return; }
  const dxp = after.xp - was.xp;
  if (dxp > 0) toast(`+${dxp} XP · ${diffs.filter(([, n]) => n > 0).map(([k]) => k).join(' ')}`, 'xp');
  else if (dxp < 0) toast(`${dxp} XP`);
}

// Tap cycles: open → done → missed (a slip, for clean quests) → open. Training goes done → rest day → missed.
function cycleQuest(q, d) {
  const s = statusOf(q, d);
  const has = S.log[d] && q.id in S.log[d];
  const set = (v) => { const r = (S.log[d] ||= {}); if (v === undefined) delete r[q.id]; else r[q.id] = v; if (!Object.keys(r).length) delete S.log[d]; };
  let next, msg;
  if (s === 'done') { next = q.id === 'workout' ? 'rest' : false; msg = q.id === 'workout' ? 'Rest day' : q.clean ? 'Slip reported' : 'Missed'; }
  else if (s === 'rest' && has) { next = false; msg = 'Missed'; }
  else if (s === 'miss' && has) { next = undefined; msg = 'Cleared'; }
  else { next = true; msg = 'Done'; }
  // Clearing a quest Trainer would fill in falls back to Trainer's value.
  changeWithFeedback(() => set(next), q.id);
  if (next !== true) toast(msg, next === false ? 'hurt' : '');
}

// ===========================================================================
// Events
// ===========================================================================
document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { ui.tab = tab.dataset.tab; if (ui.tab === 'today') ui.day = today(); render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-act]');
  if (!el) { if (e.target.classList.contains('sheet-wrap')) closeSheet(); return; }
  const act = el.dataset.act;
  const q = el.dataset.q ? questById(el.dataset.q) : null;
  switch (act) {
    case 'contrast': S.settings.highContrast = !S.settings.highContrast; commit(); return;
    case 'contrast-set': S.settings.highContrast = el.dataset.v === 'on'; commit(); return;
    case 'trainer': S.settings.trainer = el.dataset.v === 'on'; commit(); return;
    case 'dismiss': S.notice = null; commit(); return;
    case 'day': ui.day = addDays(ui.day, Number(el.dataset.v)); render(); return;
    case 'quest':
      if (q.metric === 'numeric') numberSheet(q, el.dataset.d);
      else cycleQuest(q, el.dataset.d);
      return;
    case 'dock': {
      const t = today();
      if (q.metric === 'numeric') { numberSheet(q, t); return; }
      const s = statusOf(q, t);
      if (s === 'done' || s === 'rest') { toast(`${q.dock}: already logged. Change it in Today.`); return; }
      changeWithFeedback(() => { (S.log[t] ||= {})[q.id] = true; }, q.id);
      return;
    }
    case 'weekly': {
      const mon = mondayOf(el.dataset.d);
      const w = (S.week[mon] ||= {});
      changeWithFeedback(() => { if (w[q.id]) delete w[q.id]; else w[q.id] = el.dataset.d; if (!Object.keys(w).length) delete S.week[mon]; }, q.id);
      return;
    }
    case 'num-clear': {
      const { q: sq, d } = ui.sheet;
      if (S.log[d]) { delete S.log[d][sq.id]; if (!Object.keys(S.log[d]).length) delete S.log[d]; }
      closeSheet(); commit(); return;
    }
    case 'edit': editSheet(q); return;
    case 'edit-off': ui.sheet.off = el.dataset.v === '1'; el.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === el))); return;
    case 'edit-revert': delete S.edits[ui.sheet.q.id]; closeSheet(); commit(); return;
    case 'edit-delete': {
      const id = ui.sheet.q.id;
      ask('Delete this quest and its history?', 'Delete', () => {
        S.custom = S.custom.filter((c) => c.id !== id);
        delete S.edits[id];
        for (const d of Object.keys(S.log)) delete S.log[d][id];
        for (const m of Object.keys(S.week)) delete S.week[m][id];
      });
      return;
    }
    case 'add': addSheet(el.dataset.goal); return;
    case 'traits': traitsSheet(); return;
    case 'close': closeSheet(); return;
    case 'ask-ok': { const fn = ui.sheet.fn; closeSheet(); fn(); commit(); return; }
    case 'backup-dl': {
      const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `liferpg-backup-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return;
    }
    case 'backup-copy':
      navigator.clipboard?.writeText(JSON.stringify(S)).then(() => toast('Backup copied. Paste it into a note or email to yourself.'), () => toast('Copy failed. Use Download.'));
      return;
    case 'reset': ask('Wipe all Life RPG data on this phone? Trainer is not affected.', 'Reset', () => { S = freshState(); ui.day = today(); }); return;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.sheet) closeSheet();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-act]')) { e.preventDefault(); e.target.click(); }
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'num-form') {
    const { q, d } = ui.sheet;
    const v = num(f.querySelector('#num-in').value);
    closeSheet();
    changeWithFeedback(() => {
      const r = (S.log[d] ||= {});
      if (v == null) delete r[q.id]; else r[q.id] = v;
      if (!Object.keys(r).length) delete S.log[d];
    }, q.id);
    return;
  }
  const fd = Object.fromEntries(new FormData(f));
  if (f.id === 'edit-form') {
    const q = ui.sheet.q;
    const patch = { label: fd.label.trim() || q.label, xp: clamp(num(fd.xp) ?? q.xp, 1, 500), off: ui.sheet.off };
    if (fd.target != null) patch.target = Math.max(1, num(fd.target) ?? q.target);
    if (fd.stat) patch.stat = fd.stat;
    if (q.seed) S.edits[q.id] = patch;
    else { const c = S.custom.find((x) => x.id === q.id); Object.assign(c, patch); delete S.edits[q.id]; }
    closeSheet(); commit(); return;
  }
  if (f.id === 'add-form') {
    S.custom.push({ id: `c_${uid()}`, goal: ui.sheet.goalId, label: fd.label.trim(), type: fd.type === 'weekly' ? 'weekly' : 'daily', xp: clamp(num(fd.xp) ?? 30, 1, 500), stat: statKeys.includes(fd.stat) ? fd.stat : 'DISC', metric: 'binary' });
    closeSheet(); commit(); toast('Quest added.'); return;
  }
  if (f.id === 'traits-form') {
    S.traits = Object.fromEntries(TRAITS.map(([k]) => [k, fd[k] === '' ? null : clamp(num(fd[k]) ?? 0, 0, 100)]).filter(([, v]) => v != null));
    closeSheet(); commit(); return;
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'start') {
    const v = e.target.value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v) && v <= today()) { S.start = v; if (ui.day < v) ui.day = v; commit(); }
    return;
  }
  if (e.target.id === 'restore') {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((txt) => {
      let data;
      try { data = JSON.parse(txt); } catch { toast('That file isn\'t a Life RPG backup.'); return; }
      if (!data || data.v !== 1 || typeof data.log !== 'object') { toast('That file isn\'t a Life RPG backup.'); return; }
      ask('Replace everything on this phone with the backup?', 'Restore', () => { S = normalise(data); toast('Restored.'); });
    });
  }
});

// Trainer may change in another tab; a new day may begin while the app is open.
window.addEventListener('storage', (e) => { if (e.key === TRAINER_KEY || e.key === STORE_KEY) { if (e.key === STORE_KEY) S = load(); invalidate(); render(); } });
let lastDay = today();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (today() !== lastDay) { lastDay = today(); ui.day = today(); }
  invalidate(); render();
});

render();

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
