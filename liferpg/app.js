'use strict';
/* Life RPG: the 4 pillars as one-tap quests, with six stats, HP, streaks and levels.
   Everything is recalculated from the logs on each render, so reopening or editing a day can never pay out twice.
   Life RPG writes only its own keys (liferpg.*). Trainer's data is read through trainer-adapter.js and never written.
   Storage contract and schema: STORAGE.md. */

// ===========================================================================
// Constants
// ===========================================================================
const STORE_KEY = 'liferpg.v1'; // namespace; the schema version is S.v
const CORRUPT_KEY = 'liferpg.corrupt.v1'; // an unreadable save is moved here instead of being overwritten
const SCHEMA = 2;
const CUT_REFS = ['gironda1', 'gironda2']; // Trainer's two Gironda meals, in order
const HP_MAX = 100;
const PERFECT_DISC = 20;
const WEEK_DISC = 50;
const MULT_STEP = 0.1;
const MULT_MAX_STEPS = 5; // ×1.5
const STAT_CAP = 99;
const NEUTRAL = new Set(['rest', 'paused', 'moved']);
const PAUSE_REASONS = [['ill', 'Illness'], ['injury', 'Injury'], ['clinician', 'Doctor\'s orders'], ['other', 'Other']];

const TABS = [
  ['today', 'Today', '<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/><circle cx="12" cy="12" r="4"/>'],
  ['quests', 'Quests', '<path d="M4 5h16M4 12h16M4 19h10"/><path d="m16 17 2 2 4-4"/>'],
  ['hero', 'Hero', '<path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/>'],
  ['setup', 'Setup', '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'],
];

// ===========================================================================
// Helpers. Dates are local calendar days (YYYY-MM-DD); day maths uses local midnight
// and rounds, so BST/GMT changes (23- or 25-hour days) can't shift a date.
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
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return v === '' || v == null || !Number.isFinite(n) ? null : n; };
const fmtNum = (n) => Math.round(n).toLocaleString('en-GB');
const statKeys = STATS.map((s) => s[0]);
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// ===========================================================================
// State, schema version 2. Migrations run on load and on restore.
// ===========================================================================
function defaultSettings() {
  return {
    highContrast: false,
    trainer: true,
    trainDays: [1, 4], // Mon, Thu; Trainer's own plan wins on days it covers
    graceDays: 1, // days after a missed session in which training still counts
    abstainAlcohol: true,
    abstainCoffee: false, // a personal rule, off unless you choose it
    hpMiss: 10,
    hpRegen: 10,
    respec: true,
    perfectMode: 'core', // 'core' | 'all'
    discPerfectCap: 5, // perfect days per week that pay DISC
  };
}
function freshState() {
  const t = today();
  return {
    v: SCHEMA, created: t, start: t, notice: 'welcome',
    settings: defaultSettings(),
    log: {}, // date → { questId: true | false | 'rest' | number }
    week: {}, // monday → { questId: date done }
    edits: {}, // questId → { label, xp, target, stat, off, core }
    custom: [], // your own quests
    pauses: [], // { id, from, to (inclusive, null = open), reason }
    traits: {},
    events: [], // append-only activity log: { at, kind, ... }
    ack: { respecs: 0 },
  };
}

// v1 → v2: the single Gironda quest becomes two meal quests; settings, pauses, events and ack appear.
function migrate(s) {
  const out = { ...s };
  const from = Number(out.v) || 1;
  if (from < 2) {
    for (const d of Object.keys(isObj(out.log) ? out.log : {})) {
      const r = out.log[d];
      if (isObj(r) && 'gironda' in r) {
        const v = r.gironda;
        if (v === true || v === false) { if (!('meal1' in r)) r.meal1 = v; if (!('meal2' in r)) r.meal2 = v; }
        delete r.gironda;
      }
    }
    if (isObj(out.edits)) delete out.edits.gironda;
    out.events = [...(Array.isArray(out.events) ? out.events : []), { at: new Date().toISOString(), kind: 'migrate', from, to: 2 }];
  }
  out.v = SCHEMA;
  return out;
}
function normalise(raw) {
  const d = freshState();
  if (!isObj(raw)) return d;
  const s = migrate(raw);
  const out = { ...d, ...s, settings: { ...d.settings, ...(isObj(s.settings) ? s.settings : {}) }, ack: { ...d.ack, ...(isObj(s.ack) ? s.ack : {}) } };
  for (const k of ['log', 'week', 'edits', 'traits']) if (!isObj(out[k])) out[k] = {};
  for (const k of ['custom', 'pauses', 'events']) if (!Array.isArray(out[k])) out[k] = [];
  if (!DATE_RE.test(out.start || '')) out.start = d.start;
  if (!Array.isArray(out.settings.trainDays)) out.settings.trainDays = d.settings.trainDays;
  out.notice = s.notice === undefined ? d.notice : s.notice;
  return out;
}

let storageOk = true;
let loadNote = null;
function load() {
  let raw;
  try { raw = localStorage.getItem(STORE_KEY); } catch { storageOk = false; return freshState(); }
  if (raw == null) return freshState();
  try {
    const parsed = JSON.parse(raw);
    if (isObj(parsed) && Number(parsed.v) > SCHEMA) {
      try { localStorage.setItem(CORRUPT_KEY, raw); } catch { /* storage full or blocked */ }
      loadNote = 'Your data was saved by a newer version of Life RPG. It\'s kept on this phone; reload to get the new version.';
      return freshState();
    }
    return normalise(parsed);
  } catch {
    // Keep the unreadable save instead of overwriting it.
    try { localStorage.setItem(CORRUPT_KEY, raw); } catch { /* storage full or blocked */ }
    loadNote = 'Your saved data couldn\'t be read, so Life RPG started fresh. The old data is kept on this phone; restore a backup in Setup if you have one.';
    return freshState();
  }
}
let S = load();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); storageOk = true; } catch { storageOk = false; }
}
// Append-only: the app never edits or removes entries (only "Delete all" does).
function record(kind, extra = {}) { S.events.push({ at: new Date().toISOString(), kind, ...extra }); }

// ===========================================================================
// Quests
// ===========================================================================
let questMemo = null;
function allQuests() {
  if (questMemo) return questMemo;
  const st = S.settings;
  const out = [];
  for (const dom of DOMAINS) {
    for (const g of dom.goals) {
      for (const q of g.quests) {
        const x = { ...q, goal: g.id, domain: dom.id, seed: true, ...(S.edits[q.id] || {}) };
        if (q.id === 'teetotal') {
          if (!S.edits.teetotal?.label) x.label = st.abstainAlcohol && st.abstainCoffee ? 'Zero alcohol / zero coffee' : st.abstainCoffee ? 'Zero coffee' : 'Zero alcohol';
          if (!st.abstainAlcohol && !st.abstainCoffee) x.off = true;
        }
        out.push(x);
      }
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

// ===========================================================================
// Trainer (read-only, through the adapter)
// ===========================================================================
let trainerMemo = null;
function trainer() {
  if (trainerMemo) return trainerMemo;
  const res = S.settings.trainer ? TrainerAdapter.read(localStorage) : { ok: false, error: 'off' };
  const t = res.ok ? res.data : null;
  const wByDate = new Map();
  for (const w of t?.workouts || []) { if (!wByDate.has(w.date)) wByDate.set(w.date, []); wByDate.get(w.date).push(w); }
  const mByDate = new Map();
  for (const m of t?.meals || []) { if (!mByDate.has(m.date)) mByDate.set(m.date, []); mByDate.get(m.date).push(m.ref); }
  const fastDay = (d) => !!t && (t.plans[d] === 'fast' || t.days[d]?.fast === true) && !(mByDate.get(d) || []).length;
  const meal = (i) => (d) => {
    if (!t) return null;
    const cut = t.days[d]?.cut;
    if (cut === false) return false; // Trainer says the cut day was broken
    if ((mByDate.get(d) || []).includes(CUT_REFS[i])) return true;
    if (fastDay(d)) return 'rest';
    return null;
  };
  trainerMemo = {
    ok: !!t, error: res.error || null,
    plan: (d) => (t ? t.plans[d] || null : null),
    trained: (d) => (t ? wByDate.has(d) : null),
    workout: (d) => (t ? (wByDate.has(d) ? true : null) : null),
    volume(d) {
      if (!t || !wByDate.has(d)) return null;
      let v = 0;
      for (const w of wByDate.get(d)) for (const s of w.sets) v += s.kg * s.reps;
      return v > 0 ? Math.round(v) : null;
    },
    steps: (d) => (t ? (t.days[d]?.steps ?? t.garminSteps[d] ?? null) : null),
    meal1: meal(0),
    meal2: meal(1),
    // Trainer tracks coffee only. Its slips count here only if the coffee rule is on.
    abstain: (d) => (t && S.settings.abstainCoffee ? (t.days[d]?.coffee ?? null) : null),
  };
  return trainerMemo;
}
const trainerValue = (q, d) => (q.auto && trainer()[q.auto] ? trainer()[q.auto](d) : null);

// ===========================================================================
// Training schedule
// ===========================================================================
function pausedOn(d) { return S.pauses.find((p) => p.from <= d && (!p.to || d <= p.to)) || null; }
function scheduled(d) {
  const kind = trainer().plan(d);
  if (kind === 'train') return true;
  if (kind === 'rest' || kind === 'fast') return false;
  return S.settings.trainDays.includes(parseDate(d).getDay());
}
function trainedOn(d) {
  const own = S.log[d]?.workout;
  if (own !== undefined) return own === true;
  return trainer().trained(d) === true;
}
// The window for a scheduled session: the day itself plus the grace days, but never past the next scheduled day.
function windowEnd(d) {
  let end = addDays(d, S.settings.graceDays);
  for (let x = addDays(d, 1); x <= end; x = addDays(x, 1)) if (scheduled(x)) { end = addDays(x, -1); break; }
  return end;
}
function workoutStatus(d) {
  const own = S.log[d]?.workout;
  if (pausedOn(d)) return 'paused';
  if (trainedOn(d)) return 'done';
  if (own === 'rest') return 'rest'; // you moved or skipped it on purpose
  if (!scheduled(d)) return 'rest'; // recovery day: neutral
  const end = windowEnd(d);
  for (let x = addDays(d, 1); x <= end && x <= today(); x = addDays(x, 1)) if (trainedOn(x)) return 'moved';
  return today() > end ? 'miss' : 'pending';
}
// Schedule quests show on scheduled days, on days you trained, or when you've logged something.
function visibleOn(q, d) {
  if (!q.schedule) return true;
  return scheduled(d) || trainedOn(d) || (S.log[d] && q.id in S.log[d]) || workoutStatus(d) === 'paused';
}

// ===========================================================================
// Quest status for a day: done | rest | paused | moved | pending | miss | off
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
  if (q.id === 'workout') return workoutStatus(d);
  const past = d < t;
  // Volume follows the session: not shown on recovery days, and ignored if you've said you didn't train.
  if (q.schedule && (!visibleOn(q, d) || (S.log[d]?.workout === false && S.log[d]?.[q.id] === undefined))) return 'rest';
  const { v } = rawValue(q, d);
  if (q.metric === 'numeric') {
    if (typeof v === 'number') return v >= (q.target || 1) ? 'done' : past ? 'miss' : 'pending';
    if (v === false) return 'miss';
    return q.schedule && !trainedOn(d) ? 'rest' : past ? 'miss' : 'pending';
  }
  if (v === true) return 'done';
  if (v === 'rest') return 'rest';
  if (v === false) return 'miss';
  if (q.clean) return past ? 'done' : 'pending';
  return past ? 'miss' : 'pending';
}
const satisfied = (st, past) => st === 'done' || NEUTRAL.has(st) || (past && st === 'pending');

// ===========================================================================
// The engine: replays every day from the start date
// ===========================================================================
const levelOf = (xp) => Math.floor((1 + Math.sqrt(1 + xp / 31.25)) / 2);
const levelFloor = (L) => 125 * L * (L - 1);
const statValue = (xp) => Math.min(STAT_CAP, 1 + Math.floor(Math.sqrt(xp / 10)));
const statFloor = (v) => 10 * (v - 1) * (v - 1);
const multFor = (streak) => 1 + MULT_STEP * Math.min(MULT_MAX_STEPS, streak);
const perfectSet = (daily) => (S.settings.perfectMode === 'all' ? daily : daily.filter((q) => q.core));

let gameMemo = null;
function game() {
  if (gameMemo) return gameMemo;
  const st0 = S.settings;
  const t = today();
  const daily = dailyQuests(), weekly = weeklyQuests();
  const need = perfectSet(daily);
  const stat = Object.fromEntries(statKeys.map((k) => [k, 0]));
  let xp = 0, hp = HP_MAX, streak = 0, best = 0, perfects = 0, respecs = 0;
  const days = {}, events = [], perfWeek = {};
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
    const mon = mondayOf(d);
    for (const q of weekly) if (S.week[mon]?.[q.id] === d) { const n = Math.round(q.xp * mult); gain(q.stat, n); earned += n; }
    if (weekly.length && weekly.every((q) => S.week[mon]?.[q.id]) && weekly.map((q) => S.week[mon][q.id]).sort().pop() === d) {
      gain('DISC', WEEK_DISC); earned += WEEK_DISC;
      events.push({ d, k: 'good', text: `Full week of weekly quests · +${WEEK_DISC} DISC` });
    }
    const relevant = need.filter((q) => visibleOn(q, d) || st[q.id] !== 'rest');
    const perfect = relevant.length > 0 && relevant.some((q) => st[q.id] === 'done') && relevant.every((q) => satisfied(st[q.id], past));
    let hpDelta = 0;
    if (perfect) {
      perfWeek[mon] = (perfWeek[mon] || 0) + 1;
      if (perfWeek[mon] <= st0.discPerfectCap) { gain('DISC', PERFECT_DISC); earned += PERFECT_DISC; }
      hpDelta += Math.min(st0.hpRegen, HP_MAX - hp);
      streak += 1; perfects += 1; best = Math.max(best, streak);
    } else if (past) {
      if (streak >= 2) events.push({ d, k: 'warn', text: `Streak of ${streak} ended` });
      streak = 0;
    }
    const missed = daily.filter((q) => q.core && st[q.id] === 'miss');
    if (missed.length && st0.hpMiss > 0) {
      hpDelta -= st0.hpMiss * missed.length;
      events.push({ d, k: 'bad', text: `−${st0.hpMiss * missed.length} HP · missed ${missed.map((q) => q.label).join(', ')}` });
    }
    hp = clamp(hp + hpDelta, 0, HP_MAX);
    let respec = false, lost = 0;
    if (hp <= 0 && st0.respec) {
      lost = xp - levelFloor(levelOf(xp));
      xp -= lost; hp = HP_MAX; respecs += 1; respec = true;
      events.push({ d, k: 'bad', text: `Respec: 0 HP. Lost ${fmtNum(lost)} XP at level ${levelOf(xp)}; HP refilled.`, respec: true, lost });
    }
    const reqDone = relevant.filter((q) => satisfied(st[q.id], false)).length;
    days[d] = { st, perfect, mult, earned, hpDelta, respec, lost, doneN: reqDone, reqN: relevant.length };
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
const ui = { tab: 'today', day: today(), sheet: null, flash: null, out: '' };
const $ = (id) => document.getElementById(id);

function bar(frac, cls = '', label = '', now = null, max = null) {
  const pct = Math.round(clamp(frac, 0, 1) * 100);
  return `<div class="bar ${cls}" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${max ?? 100}" aria-valuenow="${now ?? pct}"><i style="width:${pct}%"></i></div>`;
}
function statChip(k) { return `<span class="chip stat" style="--c:var(--${k})">${k}</span>`; }

function renderHud() {
  const g = game();
  $('hud').innerHTML = `
    <div class="hud-top">
      <span class="lvl">LV ${g.level}</span>
      <h1>Life RPG</h1>
      ${g.multToday > 1 ? `<span class="chip acc" title="Streak multiplier">×${g.multToday.toFixed(1)}</span>` : ''}
      <button class="icon ghost" data-act="contrast" aria-label="High contrast" aria-pressed="${S.settings.highContrast}">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>
      </button>
    </div>
    <div class="meters">
      <div class="meter"><div class="lab"><span>HP</span><span>${g.hp}/${HP_MAX}</span></div>${bar(g.hp / HP_MAX, 'hp', 'Hit points', g.hp, HP_MAX)}</div>
      <div class="meter"><div class="lab"><span>XP</span><span>${Math.floor((g.into / g.span) * 100)}%</span></div>${bar(g.into / g.span, 'xp', `XP to level ${g.level + 1}`)}</div>
    </div>
    <div class="statrow">${statKeys.map((k) => `<div class="st" id="st-${k}" style="--c:var(--${k})" aria-label="${k} ${statValue(g.stat[k])}"><b>${statValue(g.stat[k])}</b><span>${k}</span></div>`).join('')}</div>`;
}
function renderNav() {
  $('nav').innerHTML = TABS.map(([id, label, path]) => `<button data-tab="${id}" ${ui.tab === id ? 'aria-current="page"' : ''}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>${label}</button>`).join('');
}
function renderDock() {
  const t = today();
  const qs = dailyQuests().filter((q) => q.dock && visibleOn(q, t));
  $('dock').innerHTML = qs.map((q) => {
    const s = statusOf(q, t);
    const on = s === 'done' || NEUTRAL.has(s);
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
  if (ui.flash) { document.querySelector(`.quest[data-q="${ui.flash}"]`)?.classList.add('flash'); ui.flash = null; }
  checkRespecAck();
  renderSheet();
}

// A respec that happened since you last looked gets acknowledged once, and the acknowledgement is logged.
function checkRespecAck() {
  const g = game();
  if (ui.sheet || g.respecs <= (S.ack.respecs || 0)) return;
  const list = g.events.filter((e) => e.respec).slice(0, g.respecs - (S.ack.respecs || 0));
  ui.sheet = { focus: false, html: () => `<h3>Respec</h3>${list.map((e) => `<p>${esc(fmtDate(e.d))}: HP hit 0, so the XP inside your level was lost (${fmtNum(e.lost)} XP). HP is back to ${HP_MAX}.</p>`).join('')}
    <p class="muted small">It's kept in the combat log. Change or switch off respecs and HP penalties in Setup.</p>
    <div class="btns"><button class="primary" data-act="ack-respec">Understood</button></div>` };
}

// ===========================================================================
// Today
// ===========================================================================
const STATUS_LABEL = { done: 'done', rest: 'recovery or rest day', paused: 'paused', moved: 'moved to a later day', pending: 'open', miss: 'missed', off: 'not counted' };
function questRow(q, d) {
  const s = statusOf(q, d);
  const { v, from } = rawValue(q, d);
  const tv = trainerValue(q, d);
  const overridden = from === 'you' && tv !== null && tv !== undefined && q.auto;
  const tick = { done: '✓', rest: 'R', paused: 'P', moved: '→', miss: '✕' }[s] || '';
  const mult = game().days[d]?.mult ?? 1;
  let sub = q.sub || '';
  if (q.metric === 'numeric') sub = `${typeof v === 'number' ? `${fmtNum(v)} ${q.unit || ''}` : 'Tap to enter'}${q.target > 1 ? ` · target ${fmtNum(q.target)}` : ''}`;
  if (q.id === 'workout') {
    const p = pausedOn(d);
    sub = { paused: `Paused: ${(PAUSE_REASONS.find((r) => r[0] === p?.reason) || ['', 'pause'])[1].toLowerCase()}`, rest: S.log[d]?.workout === 'rest' ? 'Rest day you chose (no XP, no HP loss)' : 'Recovery day (no XP, no HP loss)', moved: 'Trained within the grace window', pending: d < today() ? `Still open until ${fmtDate(windowEnd(d))}` : 'Scheduled training day', miss: 'Missed (grace window closed)', done: 'Trained' }[s] || sub;
  } else if (s === 'rest') sub = 'Fast day (neutral)';
  if (q.clean && s === 'pending') sub = 'Counts unless you report a slip';
  if (from === 'Trainer') sub = `${sub ? `${sub} · ` : ''}from Trainer`;
  const tvText = typeof tv === 'number' ? fmtNum(tv) : tv === true ? 'yes' : tv === false ? 'no' : tv === 'rest' ? 'rest' : '';
  return `<div class="qwrap"><button class="quest ${s} ${q.core ? 'core' : ''}" data-act="quest" data-q="${q.id}" data-d="${d}" aria-label="${esc(q.label)}: ${STATUS_LABEL[s] || s}${q.core ? ', core' : ''}">
    <span class="tick" aria-hidden="true">${tick}</span>
    <span class="grow"><span class="qlabel">${esc(q.label)}</span>${sub ? `<span class="qsub">${esc(sub)}</span>` : ''}${overridden ? `<span class="badge">Edited · Trainer says ${esc(tvText)}</span>` : ''}</span>
    <span class="qxp">${s === 'done' || s === 'pending' ? `+${Math.round(q.xp * (q.type === 'daily' ? mult : 1))}` : '—'}<br>${q.stat}</span></button>
    ${overridden ? `<button class="revert" data-act="revert" data-q="${q.id}" data-d="${d}" aria-label="Go back to Trainer's value for ${esc(q.label)}">Use Trainer</button>` : ''}</div>`;
}
function weeklyRow(q, d) {
  const when = S.week[mondayOf(d)]?.[q.id];
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
  const daily = dailyQuests().filter((q) => visibleOn(q, d)), weekly = weeklyQuests();
  const mon = mondayOf(d);
  const wkDone = weekly.filter((q) => S.week[mon]?.[q.id]).length;
  const coreOpen = d === t ? daily.filter((q) => q.core && statusOf(q, t) === 'pending' && q.id !== 'workout') : [];
  const out = [];
  if (loadNote) out.push(`<section class="card alert"><h2>Save problem</h2><p class="small">${esc(loadNote)}</p><button class="small-btn" data-act="dismiss-load">OK</button></section>`);
  if (S.notice === 'welcome') {
    out.push(`<section class="card focus"><h2>Briefing</h2>
      <p>Every quest is one tap. Red-edged quests are <b>core</b>: a perfect day needs only those, and missing one costs ${S.settings.hpMiss} HP once its day is over. Training only shows on your training days (${S.settings.trainDays.map((n) => DOW[n]).join(', ')}).</p>
      <p class="muted">${trainer().ok ? 'Trainer data found: workouts, volume, steps and the two Gironda meals fill in by themselves.' : 'Open Trainer on this site and its workouts, steps and meals will fill in quests here by themselves.'}</p>
      <button class="primary" data-act="dismiss">Start</button></section>`);
  }
  out.push(`<section class="card">
    <div class="daynav">
      <button class="icon" data-act="day" data-v="-1" ${d <= S.start ? 'disabled' : ''} aria-label="Previous day">◀</button>
      <b>${esc(relDay(d))}</b>
      <button class="icon" data-act="day" data-v="1" ${d >= t ? 'disabled' : ''} aria-label="Next day">▶</button>
    </div>
    <div class="kpis">
      <div class="kpi"><b class="${day.perfect ? 'good-text' : ''}">${day.doneN}/${day.reqN}</b><span>${day.perfect ? 'Perfect day' : S.settings.perfectMode === 'core' ? 'Core done' : 'Quests done'}</span></div>
      <div class="kpi"><b>${g.streak}</b><span>Streak · ×${(day.mult || 1).toFixed(1)}</span></div>
      <div class="kpi"><b class="accent">+${fmtNum(day.earned || 0)}</b><span>XP ${d === t ? 'today' : 'that day'}</span></div>
    </div>
    ${bar(day.reqN ? day.doneN / day.reqN : 0, '', 'Core quests done', day.doneN, day.reqN || 1)}
    ${coreOpen.length && new Date().getHours() >= 18 ? `<p class="small bad-text">Core still open: ${coreOpen.map((q) => esc(q.label)).join(', ')}. −${S.settings.hpMiss * coreOpen.length} HP at midnight.</p>` : ''}
  </section>`);
  DOMAINS.forEach((dom, i) => {
    const qs = daily.filter((q) => q.domain === dom.id);
    if (!qs.length) return;
    out.push(`<section class="card"><div class="pillar-h"><span class="n">${i + 1}</span>${esc(dom.name)}</div><div class="qgrid">${qs.map((q) => questRow(q, d)).join('')}</div></section>`);
  });
  if (weekly.length) {
    out.push(`<section class="card"><h2>Weekly · w/c ${fmtShort(mon)}<span class="right">${wkDone}/${weekly.length}</span></h2>
      <div class="qgrid">${weekly.map((q) => weeklyRow(q, d)).join('')}</div><p class="muted small">All ${weekly.length} in one week: +${WEEK_DISC} DISC.</p></section>`);
  }
  return out.join('');
}

// ===========================================================================
// Quests tab
// ===========================================================================
function dots(q) {
  const t = today();
  if (q.type === 'weekly') {
    const weeks = [3, 2, 1, 0].map((n) => mondayOf(addDays(t, -7 * n)));
    return `<span class="dots" aria-hidden="true">${weeks.map((m) => `<i class="${addDays(m, 6) < S.start ? 'off' : S.week[m]?.[q.id] ? 'done' : ''}"></i>`).join('')}</span>`;
  }
  return `<span class="dots" aria-hidden="true">${[6, 5, 4, 3, 2, 1, 0].map((n) => addDays(t, -n)).map((d) => { const s = statusOf(q, d); return `<i class="${NEUTRAL.has(s) ? 'rest' : s}"></i>`; }).join('')}</span>`;
}
function viewQuests() {
  const out = [`<section class="card"><h2>Main quest engine</h2>
    <p class="muted small">Tap a quest to rename it, change its XP, make it core or switch it off. Core quests (red label) cost HP when missed and are what a perfect day needs. Dots: last 7 days (weekly: last 4 weeks).</p></section>`];
  DOMAINS.forEach((dom, i) => {
    out.push(`<section class="card"><div class="pillar-h"><span class="n">${i + 1}</span>${esc(dom.name)}</div>
      ${dom.goals.map((g) => {
        const qs = allQuests().filter((q) => q.goal === g.id);
        return `<div class="goal"><div class="goal-t">${esc(g.title)} ${g.stats.map(statChip).join('')}</div>
          <div class="list">${qs.map((q) => `<div class="row between" data-act="edit" data-q="${q.id}" role="button" tabindex="0" aria-label="Edit ${esc(q.label)}" style="cursor:pointer;${q.off ? 'opacity:.55' : ''}">
            <span class="grow"><b class="small">${esc(q.label)}</b><br><span class="muted small">${q.type} · +${q.xp} ${q.stat}${q.core ? ' · <span class="bad-text">core</span>' : ''}${q.schedule ? ' · training days' : ''}${q.off ? ' · off' : ''}${q.auto ? ' · auto' : ''}</span></span>
            ${q.off ? '' : dots(q)}</div>`).join('')}</div>
          <button class="small-btn ghost" data-act="add" data-goal="${g.id}">+ Add quest</button></div>`;
      }).join('')}</section>`);
  });
  return out.join('');
}

// ===========================================================================
// Hero
// ===========================================================================
function viewHero() {
  const g = game();
  const t = today();
  const out = [];
  out.push(`<section class="card"><h2>Character<span class="right">${fmtNum(g.xp)} XP</span></h2>
    <div class="row between"><span class="big">LV ${g.level}</span><span class="muted mono">${fmtNum(g.span - g.into)} XP to LV ${g.level + 1}</span></div>
    ${bar(g.into / g.span, 'xp', `XP to level ${g.level + 1}`)}
    <div class="kpis"><div class="kpi"><b>${g.hp}</b><span>HP</span></div><div class="kpi"><b>${g.streak}<small class="muted"> / ${g.best}</small></b><span>Streak / best</span></div><div class="kpi"><b>${g.perfects}</b><span>Perfect days</span></div></div>
    ${g.respecs ? `<p class="small bad-text">Respecs so far: ${g.respecs}.</p>` : ''}</section>`);
  out.push(`<section class="card"><h2>Stats<span class="right">cap ${STAT_CAP}</span></h2>
    <div class="list">${STATS.map(([k, name, why]) => {
      const x = g.stat[k], v = statValue(x), lo = statFloor(v), hi = statFloor(v + 1);
      return `<div style="--c:var(--${k})"><div class="statline"><b>${k}</b>${bar(v >= STAT_CAP ? 1 : (x - lo) / (hi - lo), '', `${name} progress to ${v + 1}`)}<span class="mono" style="text-align:right">${v}</span></div>
        <span class="muted small">${esc(name)} · ${esc(why)} · ${fmtNum(x)} XP</span></div>`;
    }).join('')}</div></section>`);
  const from = mondayOf(addDays(t, -28));
  const cells = [];
  for (let d = from; d <= addDays(mondayOf(t), 6); d = addDays(d, 1)) {
    const r = g.days[d];
    const cls = !r ? 'off' : [r.perfect ? 'perfect' : r.earned ? 'part' : '', r.hpDelta < 0 ? 'hurt' : '', d === t ? 'today' : ''].join(' ');
    cells.push(`<div class="${cls}" title="${fmtDate(d)}">${parseDate(d).getDate()}</div>`);
  }
  out.push(`<section class="card"><h2>Last 5 weeks</h2><div class="cal" aria-label="Calendar of the last 5 weeks">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<span>${x}</span>`).join('')}${cells.join('')}</div>
    <p class="muted small">Green: perfect day. Pale: some XP. Red ring: lost HP.</p></section>`);
  out.push(`<section class="card"><h2>Combat log</h2>${g.events.length
    ? `<div class="list">${g.events.slice(0, 20).map((e) => `<div class="event"><span>${fmtShort(e.d)}</span><span class="${e.k === 'bad' ? 'bad-text' : e.k === 'good' ? 'good-text' : 'warn-text'}">${esc(e.text)}</span></div>`).join('')}</div>`
    : '<p class="muted">Nothing yet. HP losses, respecs, ended streaks and full weeks show here.</p>'}</section>`);
  const acts = S.events.slice(-15).reverse();
  out.push(`<section class="card"><h2>Activity log<span class="right">${S.events.length} entries</span></h2>
    ${acts.length ? `<div class="list">${acts.map((e) => `<div class="event"><span>${esc(e.at.slice(5, 10).replace('-', '/'))}</span><span class="small">${esc(describeEvent(e))}</span></div>`).join('')}</div>` : '<p class="muted">Every change you make is recorded here.</p>'}
    <p class="muted small">Append-only: entries can't be edited. It's included in backups.</p></section>`);
  const tr = S.traits;
  out.push(`<section class="card"><h2>Trait profile<span class="right"><button class="small-btn ghost" data-act="traits">Edit</button></span></h2>
    ${TRAITS.some(([k]) => tr[k] != null) ? `<div class="list">${TRAITS.map(([k, name]) => `<div class="statline" style="--c:var(--accent);grid-template-columns:150px 1fr 40px"><span class="small">${name}</span>${bar((tr[k] ?? 0) / 100, '', name, tr[k] ?? 0)}<span class="mono" style="text-align:right">${tr[k] ?? '—'}</span></div>`).join('')}</div>`
    : '<p class="muted">Add your Big Five scores (0–100). They stay on this phone and are left out of backups unless you choose otherwise.</p>'}</section>`);
  out.push(`<section class="card"><h2>How it works</h2><div class="list">${RULES.map(([h, p]) => `<div><b class="small">${esc(h)}</b><p class="muted small">${esc(p)}</p></div>`).join('')}</div></section>`);
  return out.join('');
}
function describeEvent(e) {
  const q = e.quest ? questById(e.quest)?.label || e.quest : '';
  const val = (v) => (v === undefined ? 'cleared' : v === true ? 'done' : v === false ? 'missed' : v === 'rest' ? 'rest' : String(v));
  switch (e.kind) {
    case 'log': return `${q} on ${fmtShort(e.date)}: ${val(e.from)} → ${val(e.to)}`;
    case 'revert': return `${q} on ${fmtShort(e.date)}: back to Trainer`;
    case 'weekly': return `${q} for w/c ${fmtShort(e.week)}: ${e.to ? 'done' : 'undone'}`;
    case 'respec-ack': return `Respec acknowledged (${e.count})`;
    case 'respec-confirm': return `Confirmed a change that caused a respec`;
    case 'pause': return `Training paused from ${fmtShort(e.from)} (${e.reason})`;
    case 'unpause': return `Training pause ended ${fmtShort(e.to)}`;
    case 'settings': return `Setting changed: ${e.key}`;
    case 'quest-edit': return `Quest edited: ${q}`;
    case 'quest-add': return `Quest added: ${e.label}`;
    case 'quest-delete': return `Quest deleted: ${e.label}`;
    case 'restore': return 'Restored from a backup';
    case 'migrate': return `Data upgraded from version ${e.from} to ${e.to}`;
    case 'traits-delete': return 'Trait profile deleted';
    default: return e.kind;
  }
}

// ===========================================================================
// Setup
// ===========================================================================
function seg(act, opts, cur, label) {
  return `<div class="seg" role="group" aria-label="${esc(label)}">${opts.map(([v, l]) => `<button data-act="${act}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
}
function viewSetup() {
  const st = S.settings;
  const T = trainer();
  const open = S.pauses.find((p) => !p.to || p.to >= today());
  const trainerMsg = { off: 'Off.', missing: 'No Trainer data on this phone yet. Trainer has to be opened on this same site.', corrupt: 'Trainer\'s data couldn\'t be read, so it\'s being ignored. Nothing was changed.', shape: 'Trainer\'s data isn\'t in the expected format, so it\'s being ignored.', unavailable: 'Browser storage is blocked.' };
  return `
  <section class="card"><h2>Training schedule</h2>
    <div style="display:grid;gap:6px"><span class="small muted">Training days (Trainer's plan wins on days it covers)</span>
      <div class="row wrap" style="gap:6px">${[1, 2, 3, 4, 5, 6, 0].map((n) => `<button class="small-btn" data-act="trainday" data-v="${n}" aria-pressed="${st.trainDays.includes(n)}" style="${st.trainDays.includes(n) ? 'background:var(--accent);color:var(--accent-ink)' : ''}">${DOW[n]}</button>`).join('')}</div></div>
    <div class="row between"><span class="small">Grace window after a missed session</span>${seg('grace', [[0, '0'], [1, '1 day'], [2, '2 days']], st.graceDays, 'Grace window')}</div>
    ${open ? `<div class="row between"><span class="small"><b>Paused</b> since ${fmtDate(open.from)} (${esc((PAUSE_REASONS.find((r) => r[0] === open.reason) || ['', open.reason])[1])})</span><button class="small-btn primary" data-act="unpause">Resume</button></div>`
      : `<div style="display:grid;gap:6px"><span class="small muted">Pause training (no XP, no HP loss, no broken streak)</span><div class="row wrap" style="gap:6px">${PAUSE_REASONS.map(([v, l]) => `<button class="small-btn" data-act="pause" data-v="${v}">${l}</button>`).join('')}</div></div>`}
  </section>
  <section class="card"><h2>Rules</h2>
    <div class="row between"><span class="small">Zero alcohol</span>${seg('abstain-alcohol', [['0', 'Off'], ['1', 'On']], st.abstainAlcohol ? 1 : 0, 'Zero alcohol')}</div>
    <div class="row between"><span class="small">Zero coffee</span>${seg('abstain-coffee', [['0', 'Off'], ['1', 'On']], st.abstainCoffee ? 1 : 0, 'Zero coffee')}</div>
    <p class="muted small">Coffee is off by default: turn it on only if it's your own rule. With it on, Trainer's "I had coffee" counts as a slip.</p>
    <div class="row between"><span class="small">HP lost per missed core quest</span>${seg('hpmiss', [[0, '0'], [5, '5'], [10, '10'], [20, '20']], st.hpMiss, 'HP per miss')}</div>
    <div class="row between"><span class="small">HP restored per perfect day</span>${seg('hpregen', [[5, '5'], [10, '10'], [20, '20']], st.hpRegen, 'HP regeneration')}</div>
    <div class="row between"><span class="small">Respec at 0 HP</span>${seg('respec', [['0', 'Off'], ['1', 'On']], st.respec ? 1 : 0, 'Respec')}</div>
    <div class="row between"><span class="small">A perfect day needs</span>${seg('perfect', [['core', 'Core quests'], ['all', 'All quests']], st.perfectMode, 'Perfect day')}</div>
  </section>
  <section class="card"><h2>Start date</h2>
    <p class="muted small">Days before this don't count. Moving it earlier replays those days.</p>
    <label class="field">Game starts<input type="date" id="start" value="${S.start}" max="${today()}"></label></section>
  <section class="card"><h2>Trainer link</h2>
    ${seg('trainer', [['off', 'Off'], ['on', 'On']], st.trainer ? 'on' : 'off', 'Read Trainer data')}
    <p class="muted small">${T.ok ? '✓ Reading Trainer: workouts, plans, lifting volume, steps, the two Gironda meals and coffee check-ins. Read-only; Trainer is never changed.' : esc(trainerMsg[T.error] || 'Not available.')}</p></section>
  <section class="card"><h2>Display</h2>${seg('contrast-set', [['off', 'Normal'], ['on', 'High contrast']], st.highContrast ? 'on' : 'off', 'Contrast')}</section>
  <section class="card"><h2>Backup</h2>
    <p class="muted small">Your data lives only on this phone${storageOk ? '' : ' <b class="bad-text">and saving is failing right now</b>'}. Keep a copy.</p>
    <label class="row small"><input type="checkbox" id="exp-traits" style="width:auto;min-height:0" ${ui.expTraits ? 'checked' : ''}> Include my trait profile</label>
    <div class="btns"><button data-act="backup-dl">Download</button><button data-act="backup-copy">Show and copy</button></div>
    ${ui.out ? `<textarea id="out" readonly aria-label="Backup" style="min-height:90px;font:12px var(--mono)">${esc(ui.out)}</textarea>` : ''}
    <label class="btn" style="cursor:pointer">Restore from file<input type="file" id="restore" accept="application/json,.json" class="sr"></label>
    <label class="field">Or paste a backup<textarea id="restore-text" style="min-height:70px;font:12px var(--mono)"></textarea></label><button data-act="restore-text">Restore pasted backup</button></section>
  <section class="card"><h2>Privacy</h2>
    <p class="muted small">Life RPG keeps everything in this browser, under its own <span class="mono">liferpg.*</span> keys. Other apps on the same site (Trainer, Council, Shredded System) share the browser's storage for this site, so treat this phone as the security boundary: use a screen lock. Nothing is sent anywhere.</p>
    <button data-act="del-traits" ${Object.keys(S.traits).length ? '' : 'disabled'}>Delete trait profile</button>
    <button class="danger" data-act="reset">Delete all Life RPG data</button>
    <p class="muted small">Deleting removes Life RPG's data and its activity log from this phone. Trainer's data is never touched.</p></section>
  <p class="muted small" style="text-align:center">Life RPG · data version ${SCHEMA} · offline · no account</p>`;
}

// ===========================================================================
// Sheets
// ===========================================================================
function renderSheet() {
  let wrap = document.querySelector('.sheet-wrap');
  if (!ui.sheet) { if (wrap) wrap.remove(); return; }
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'sheet-wrap'; document.body.appendChild(wrap); }
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${ui.sheet.html()}</div>`;
  const first = wrap.querySelector('input:not([type=checkbox]), select, button.primary');
  if (first && ui.sheet.focus !== false) { first.focus(); ui.sheet.focus = false; }
  else if (!ui.sheet.focused) { wrap.querySelector('button')?.focus(); ui.sheet.focused = true; }
}
function closeSheet() { ui.sheet = null; renderSheet(); }
function numberSheet(q, d) {
  const { v } = rawValue(q, d);
  const tv = trainerValue(q, d);
  ui.sheet = {
    html: () => `<h3>${esc(q.label)}</h3><p class="muted small">${esc(relDay(d))}${q.target > 1 ? ` · target ${fmtNum(q.target)} ${esc(q.unit || '')}` : ''}${tv != null ? ` · Trainer says ${fmtNum(tv)}` : ''}</p>
      <form id="num-form" style="display:grid;gap:10px">
        <input id="num-in" inputmode="numeric" type="number" min="0" step="any" placeholder="${esc(q.unit || '')}" value="${typeof v === 'number' ? v : ''}" aria-label="${esc(q.label)}">
        <div class="btns"><button type="button" data-act="num-clear">${tv != null ? 'Use Trainer' : 'Clear'}</button><button type="submit" class="primary">Save</button></div>
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
        ${q.type === 'daily' ? `<div class="row between"><span>Core (HP + perfect day)</span>${seg('edit-core', [['0', 'No'], ['1', 'Yes']], ui.sheet?.core ? 1 : 0, 'Core')}</div>` : ''}
        <div class="row between"><span>Active</span>${seg('edit-off', [['1', 'Off'], ['0', 'On']], ui.sheet?.off ? 1 : 0, 'Active')}</div>
        <p class="muted small">${q.type === 'daily' ? 'Daily' : 'Weekly'}${q.auto ? ' · filled in from Trainer' : ''}${q.schedule ? ' · shows on training days only' : ''}. Changes apply to past days too.</p>
        <div class="btns">${custom ? '<button type="button" class="danger" data-act="edit-delete">Delete</button>' : '<button type="button" data-act="edit-revert">Revert to default</button>'}<button type="button" data-act="close">Cancel</button><button type="submit" class="primary">Save</button></div>
      </form>`,
    q, off: !!q.off, core: !!q.core,
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
        <p class="muted small">Keep it binary: done or not. New quests aren't core; make one core from its edit screen.</p>
        <div class="btns"><button type="button" data-act="close">Cancel</button><button type="submit" class="primary">Add</button></div>
      </form>`,
    goalId,
  };
  renderSheet();
}
function traitsSheet() {
  ui.sheet = {
    html: () => `<h3>Trait profile</h3><p class="muted small">Big Five percentiles, 0–100. Leave blank to skip. Kept on this phone only.</p>
      <form id="traits-form" style="display:grid;gap:10px">
        ${TRAITS.map(([k, name, why]) => `<label class="field">${name} <span class="muted small">${why}</span><input name="${k}" type="number" min="0" max="100" value="${S.traits[k] ?? ''}"></label>`).join('')}
        <div class="btns"><button type="button" data-act="close">Cancel</button><button type="submit" class="primary">Save</button></div>
      </form>`,
  };
  renderSheet();
}
function ask(text, label, fn, danger = true) {
  ui.sheet = { html: () => `<p>${esc(text)}</p><div class="btns"><button data-act="close">Cancel</button><button class="primary ${danger ? 'danger' : ''}" data-act="ask-ok">${esc(label)}</button></div>`, fn, focus: false };
  renderSheet();
}

// ===========================================================================
// Feedback and guarded changes
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
// Applies a change. If it would cause a new respec, it is undone and you're asked first.
function change(fn, qid, confirmed = false) {
  const before = game();
  const was = { xp: before.xp, level: before.level, stat: { ...before.stat }, perfect: before.days[today()]?.perfect, respecs: before.respecs };
  const snapshot = JSON.stringify(S);
  fn();
  invalidate();
  const after = game();
  if (confirmed) S.ack.respecs = after.respecs; // you already saw and accepted it
  if (after.respecs > was.respecs && !confirmed) {
    const lost = after.events.find((e) => e.respec)?.lost || 0;
    S = JSON.parse(snapshot);
    invalidate();
    ask(`This change takes HP to 0 and causes a respec: about ${fmtNum(lost)} XP inside your level would be lost. Go ahead?`, 'Go ahead', () => change(() => { fn(); record('respec-confirm'); }, qid, true));
    return;
  }
  save();
  ui.flash = qid;
  render();
  const diffs = statKeys.map((k) => [k, after.stat[k] - was.stat[k]]).filter(([, n]) => n !== 0);
  for (const [k, n] of diffs) if (n > 0) document.getElementById(`st-${k}`)?.classList.add('bump');
  if (after.level > was.level) { toast(`LEVEL UP · LV ${after.level}`, 'xp'); return; }
  if (after.days[today()]?.perfect && !was.perfect) { toast(`PERFECT DAY · +${S.settings.hpRegen} HP`, 'xp'); return; }
  const dxp = after.xp - was.xp;
  if (dxp > 0) toast(`+${dxp} XP · ${diffs.filter(([, n]) => n > 0).map(([k]) => k).join(' ')}`, 'xp');
  else if (dxp < 0) toast(`${dxp} XP`);
}
function setLog(d, qid, v, kind = 'log') {
  const r = (S.log[d] ||= {});
  const from = r[qid];
  if (v === undefined) delete r[qid]; else r[qid] = v;
  if (!Object.keys(r).length) delete S.log[d];
  record(kind, { date: d, quest: qid, from, to: v });
}
// Tap cycles: open → done → missed (a slip, for clean quests) → open. Training: done → rest day → missed → open.
function cycleQuest(q, d) {
  const s = statusOf(q, d);
  const has = S.log[d] && q.id in S.log[d];
  const own = has ? S.log[d][q.id] : undefined;
  let next, msg;
  if (q.id === 'workout') {
    if (own === undefined) { next = s === 'done' ? false : true; msg = next ? 'Trained' : 'Marked as not trained'; }
    else if (own === true) { next = 'rest'; msg = 'Rest day (no XP, no HP loss)'; }
    else if (own === 'rest') { next = false; msg = 'Marked as not trained'; }
    else { next = undefined; msg = 'Cleared'; }
  } else if (s === 'done') { next = false; msg = q.clean ? 'Slip reported' : 'Missed'; }
  else if (has && (own === false || own === 'rest')) { next = undefined; msg = 'Cleared'; }
  else { next = true; msg = 'Done'; }
  change(() => setLog(d, q.id, next), q.id);
  if (next !== true && !ui.sheet) toast(msg, next === false ? 'hurt' : '');
}
function setSetting(key, value) { S.settings[key] = value; record('settings', { key }); commit(); }

// ===========================================================================
// Events
// ===========================================================================
document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { ui.tab = tab.dataset.tab; ui.out = ''; if (ui.tab === 'today') ui.day = today(); render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-act]');
  if (!el) { if (e.target.classList?.contains('sheet-wrap')) closeSheet(); return; }
  const act = el.dataset.act, v = el.dataset.v;
  const q = el.dataset.q ? questById(el.dataset.q) : null;
  switch (act) {
    case 'contrast': setSetting('highContrast', !S.settings.highContrast); return;
    case 'contrast-set': setSetting('highContrast', v === 'on'); return;
    case 'trainer': setSetting('trainer', v === 'on'); return;
    case 'trainday': { const n = Number(v); setSetting('trainDays', S.settings.trainDays.includes(n) ? S.settings.trainDays.filter((x) => x !== n) : [...S.settings.trainDays, n].sort()); return; }
    case 'grace': setSetting('graceDays', Number(v)); return;
    case 'abstain-alcohol': setSetting('abstainAlcohol', v === '1'); return;
    case 'abstain-coffee': setSetting('abstainCoffee', v === '1'); return;
    case 'hpmiss': change(() => { S.settings.hpMiss = Number(v); record('settings', { key: 'hpMiss' }); }); return;
    case 'hpregen': change(() => { S.settings.hpRegen = Number(v); record('settings', { key: 'hpRegen' }); }); return;
    case 'respec': change(() => { S.settings.respec = v === '1'; record('settings', { key: 'respec' }); }); return;
    case 'perfect': change(() => { S.settings.perfectMode = v; record('settings', { key: 'perfectMode' }); }); return;
    case 'pause': { const d = today(); S.pauses.push({ id: uid(), from: d, to: null, reason: v }); record('pause', { from: d, reason: v }); commit(); toast('Training paused. Resume it in Setup.'); return; }
    case 'unpause': { const p = S.pauses.find((x) => !x.to || x.to >= today()); if (p) { p.to = addDays(today(), -1) < p.from ? p.from : addDays(today(), -1); record('unpause', { to: p.to }); } commit(); return; }
    case 'dismiss': S.notice = null; commit(); return;
    case 'dismiss-load': loadNote = null; render(); return;
    case 'ack-respec': { const n = game().respecs; S.ack.respecs = n; record('respec-ack', { count: n }); ui.sheet = null; commit(); return; }
    case 'day': ui.day = addDays(ui.day, Number(v)); render(); return;
    case 'quest': if (q.metric === 'numeric') numberSheet(q, el.dataset.d); else cycleQuest(q, el.dataset.d); return;
    case 'revert': change(() => setLog(el.dataset.d, q.id, undefined, 'revert'), q.id); toast('Back to Trainer\'s value.'); return;
    case 'dock': {
      const t = today();
      if (q.metric === 'numeric') { numberSheet(q, t); return; }
      const s = statusOf(q, t);
      if (s === 'done' || NEUTRAL.has(s)) { toast(`${q.dock}: already logged. Change it in Today.`); return; }
      change(() => setLog(t, q.id, true), q.id);
      return;
    }
    case 'weekly': {
      const mon = mondayOf(el.dataset.d);
      change(() => {
        const w = (S.week[mon] ||= {});
        const to = !w[q.id];
        if (w[q.id]) delete w[q.id]; else w[q.id] = el.dataset.d;
        if (!Object.keys(w).length) delete S.week[mon];
        record('weekly', { week: mon, quest: q.id, to });
      }, q.id);
      return;
    }
    case 'num-clear': { const { q: sq, d } = ui.sheet; closeSheet(); change(() => setLog(d, sq.id, undefined), sq.id); return; }
    case 'edit': editSheet(q); return;
    case 'edit-off': ui.sheet.off = v === '1'; el.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === el))); return;
    case 'edit-core': ui.sheet.core = v === '1'; el.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === el))); return;
    case 'edit-revert': { const id = ui.sheet.q.id; closeSheet(); change(() => { delete S.edits[id]; record('quest-edit', { quest: id }); }); return; }
    case 'edit-delete': {
      const { id, label } = ui.sheet.q;
      ask('Delete this quest and its history?', 'Delete', () => {
        S.custom = S.custom.filter((c) => c.id !== id);
        delete S.edits[id];
        for (const d of Object.keys(S.log)) delete S.log[d][id];
        for (const m of Object.keys(S.week)) delete S.week[m][id];
        record('quest-delete', { label });
      });
      return;
    }
    case 'add': addSheet(el.dataset.goal); return;
    case 'traits': traitsSheet(); return;
    case 'del-traits': ask('Delete your trait profile from this phone?', 'Delete', () => { S.traits = {}; record('traits-delete'); }); return;
    case 'close': closeSheet(); return;
    case 'ask-ok': { const fn = ui.sheet.fn; closeSheet(); fn(); commit(); return; }
    case 'backup-dl': {
      const blob = new Blob([backupText()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `liferpg-backup-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return;
    }
    case 'backup-copy':
      ui.out = backupText(); render();
      navigator.clipboard?.writeText(ui.out).then(() => toast('Backup copied. Paste it into a note or email to yourself.'), () => { $('out')?.select(); toast('Selected. Copy it from the box.'); });
      return;
    case 'restore-text': restoreFrom($('restore-text').value); return;
    case 'reset': ask('Delete all Life RPG data on this phone, including the activity log? Trainer is not affected.', 'Delete all', () => {
      try { localStorage.removeItem(STORE_KEY); } catch { /* blocked */ }
      S = freshState(); ui.day = today();
    }); return;
  }
});
function backupText() {
  const copy = JSON.parse(JSON.stringify(S));
  if (!ui.expTraits) delete copy.traits;
  return JSON.stringify(copy);
}
function restoreFrom(txt) {
  let data;
  try { data = JSON.parse(txt); } catch { toast('That isn\'t a Life RPG backup.'); return; }
  if (!isObj(data) || !(data.v === 1 || data.v === 2) || !isObj(data.log)) { toast('That isn\'t a Life RPG backup.'); return; }
  ask('Replace everything on this phone with the backup?', 'Restore', () => {
    const keepTraits = S.traits;
    S = normalise(data);
    if (!isObj(data.traits)) S.traits = keepTraits; // backups leave traits out by default
    record('restore');
    toast('Restored.');
  }, false);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.sheet) closeSheet();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role=button][data-act]')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'num-form') {
    const { q, d } = ui.sheet;
    const v = num(f.querySelector('#num-in').value);
    closeSheet();
    if (v != null && v < 0) { toast('That can\'t be negative.'); return; }
    change(() => setLog(d, q.id, v == null ? undefined : v), q.id);
    return;
  }
  const fd = Object.fromEntries(new FormData(f));
  if (f.id === 'edit-form') {
    const q = ui.sheet.q;
    const patch = { label: fd.label.trim() || q.label, xp: clamp(num(fd.xp) ?? q.xp, 1, 500), off: ui.sheet.off };
    if (q.type === 'daily') patch.core = ui.sheet.core;
    if (fd.target != null) patch.target = Math.max(1, num(fd.target) ?? q.target);
    if (fd.stat) patch.stat = fd.stat;
    closeSheet();
    change(() => {
      if (q.seed) S.edits[q.id] = patch;
      else { Object.assign(S.custom.find((x) => x.id === q.id), patch); delete S.edits[q.id]; }
      record('quest-edit', { quest: q.id });
    });
    return;
  }
  if (f.id === 'add-form') {
    const label = fd.label.trim();
    S.custom.push({ id: `c_${uid()}`, goal: ui.sheet.goalId, label, type: fd.type === 'weekly' ? 'weekly' : 'daily', xp: clamp(num(fd.xp) ?? 30, 1, 500), stat: statKeys.includes(fd.stat) ? fd.stat : 'DISC', metric: 'binary' });
    record('quest-add', { label });
    closeSheet(); commit(); toast('Quest added.'); return;
  }
  if (f.id === 'traits-form') {
    S.traits = Object.fromEntries(TRAITS.map(([k]) => [k, fd[k] === '' ? null : clamp(num(fd[k]) ?? 0, 0, 100)]).filter(([, x]) => x != null));
    closeSheet(); commit();
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'exp-traits') { ui.expTraits = e.target.checked; ui.out = ''; return; }
  if (e.target.id === 'start') {
    const v = e.target.value;
    if (DATE_RE.test(v) && v <= today()) change(() => { S.start = v; if (ui.day < v) ui.day = v; record('settings', { key: 'start' }); });
    return;
  }
  if (e.target.id === 'restore') {
    const file = e.target.files?.[0];
    if (file) file.text().then(restoreFrom);
  }
});

// Trainer may change in another tab; a new day may begin while the app is open.
window.addEventListener('storage', (e) => { if (e.key === TrainerAdapter.KEY || e.key === STORE_KEY) { if (e.key === STORE_KEY) S = load(); invalidate(); render(); } });
let lastDay = today();
function dayCheck() {
  if (today() === lastDay) return;
  if (ui.day === lastDay) ui.day = today();
  lastDay = today();
  invalidate(); render();
}
setInterval(dayCheck, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { dayCheck(); invalidate(); render(); } });

render();

// Offline support. A new version takes over at the next safe moment (no sheet open).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    if (!ui.sheet) location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Ask the browser not to evict this site's storage under pressure (Android may still clear it if you clear site data).
navigator.storage?.persist?.().catch?.(() => {});
