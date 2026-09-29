'use strict';
/* Trainer: offline habit, training and nutrition companion.
   All data lives in localStorage on this device. Content templates are in data.js. */

// ===========================================================================
// Constants
// ===========================================================================
const STORE_KEY = 'trainer.v1';
const OLD_KEY = 'trainer.v2-backup';

// Chains: strict day-by-day streaks. pts = XP per day kept.
const CHAINS = [
  { id: 'coffee', name: 'No coffee', stat: 'MND', pts: 5, desc: 'No coffee today. Tea is fine.' },
  { id: 'diet', name: 'Diet dialled in', stat: 'NUT', pts: 4, desc: 'Every meal inside your eating window and calories under target, or a fast day.' },
  { id: 'training', name: 'Training plan followed', stat: 'STR', pts: 3, desc: 'Trained on a training day, or rested on a rest or fast day.' },
  { id: 'walk', name: 'Morning walk', stat: 'END', pts: 3, desc: 'The morning walk, logged.' },
  { id: 'plan', name: 'Tomorrow planned', stat: 'MND', pts: 3, desc: 'Tomorrow\'s plan saved today.' },
];

// Only the walk has a time window.
const WALK_WINDOW = { from: '06:30', to: '08:30' };
const QUESTS = {
  walk:     { name: 'Morning Walk',      stat: 'END', note: `${WALK_WINDOW.from}–${WALK_WINDOW.to} for the on-time bonus. Hydrate before and after.` },
  training: { name: 'Training Session',  stat: 'STR', note: 'Log it in Train, or tap to mark done.' },
  protein:  { name: 'Protein Goal',      stat: 'NUT', note: 'Hit your protein inside the window.' },
  fluids:   { name: 'Hydration Goal',    stat: 'VIT', note: 'Water, tea and electrolytes all count.' },
  sleep:    { name: 'Log Sleep',         stat: 'VIT', note: 'Log last night when you wake.' },
  plan:     { name: 'Plan Tomorrow',     stat: 'MND', note: 'After your last meal: meals, training, top 3.' },
  journal:  { name: 'Gratitude Journal', stat: 'MND', note: 'Three good things and a lesson.' },
};
const QUEST_BASE = 10;
const QUEST_BONUS = 5;

const STATS = [
  ['STR', 'Strength', 'Training sessions, PRs and following the plan'],
  ['END', 'Endurance', 'Morning walks'],
  ['NUT', 'Nutrition', 'Diet chain, protein and fasts'],
  ['VIT', 'Recovery', 'Sleep and hydration'],
  ['MND', 'Mind', 'No coffee, planning, journal and goals'],
];
const STAT_LEVEL_XP = 60;

const PTS = { session: 15, pr: 5, weigh: 2, measure: 5, author: 10, review: 20, week: 20, milestone: 15, goal: 50, ach: 25, fastDay: 10 };

const MEASURES = ['waist', 'chest', 'arms', 'thighs', 'hips', 'neck'];
const FLUID_TYPES = [['water', 'Water'], ['electrolytes', 'Electrolytes'], ['tea', 'Tea'], ['other', 'Other']];
const COMPOUND_CATS = ['Supplement', 'Peptide', 'Medication', 'Other'];
const UNITS = ['mg', 'mcg', 'g', 'IU', 'ml', 'units', 'tsp', 'caps'];
const ROUTES = ['Oral', 'Sub-Q injection', 'IM injection', 'Topical', 'Nasal', 'Other'];
const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dressing', 'Juice'];
const SLOTS = ['Breakfast', 'Lunch', 'Dinner'];
const LOG_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const DAY_KINDS = [['train', 'Train'], ['rest', 'Rest'], ['fast', 'Fast']];

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
const fmtTime = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const minutesOf = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const minuteOfIso = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const inRange = (iso, w) => { const m = minuteOfIso(iso); return m >= minutesOf(w.from) && m <= minutesOf(w.to); };
const atOn = (date, hhmm) => { const d = parseDate(date); const [h, m] = (hhmm || '12:00').split(':').map(Number); d.setHours(h, m, 0, 0); return d.toISOString(); };
const nowOn = (date) => (date === today() ? new Date().toISOString() : atOn(date, '12:00'));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const round1 = (n) => Math.round(n * 10) / 10;
const fmtNum = (n) => (n === null || n === undefined ? '—' : Number.isInteger(n) ? String(n) : String(round1(n)));
const clone = (x) => JSON.parse(JSON.stringify(x));
const sum = (arr, f) => arr.reduce((t, x) => t + (f(x) || 0), 0);
function fmtDur(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d) return `${d} d ${h} h`;
  return h ? `${h} h ${pad(mm)} m` : `${mm} m`;
}

// ===========================================================================
// State
// ===========================================================================
function programFromTemplate(t) {
  const p = clone(t);
  p.days = p.days.map((d, i) => ({ ...d, id: `${t.id}-d${i}`, exercises: d.exercises.map((e, j) => ({ ...e, id: `${t.id}-d${i}-e${j}` })) }));
  p.template = t.id;
  return p;
}

function seedGoals() {
  return GOAL_SEED.map((g, i) => ({
    id: `goal${i}`, area: g.area, title: g.title, main: !!g.main, why: '', deadline: '', doneAt: null,
    milestones: g.milestones.map((m, j) => ({ id: `goal${i}-m${j}`, text: m.text, metric: m.metric || null, doneAt: null })),
  }));
}

function freshState() {
  return {
    v: 3,
    settings: {
      proteinGoal: 180, kcalGoal: 1900, carbGoal: 80, fatGoal: 90, fluidMl: 3500, walkExtraMl: 750,
      startWeight: 90, target: 77, heightCm: null, cycleStart: '2026-10-05', highContrast: false,
      window: { from: '09:00', to: '15:00' }, chainStart: '2026-10-01',
      family: 'hit', tier: 'intermediate', active: { cycle: 'my4week', hit: 'mentzer_ab' },
    },
    programs: Object.fromEntries(PROGRAM_TEMPLATES.map((t) => [t.id, programFromTemplate(t)])),
    baselines: {},
    days: {},
    plans: {},
    weekPlans: {},
    fasts: [],
    shopping: {},
    meals: [],
    myFoods: [],
    workouts: [],
    sleep: [],
    weights: [],
    measurements: [],
    fluids: [],
    compounds: [],
    goals: seedGoals(),
    journal: {},
    author: {},
    reviews: {},
    seen: { level: 1, ach: {} },
    notice: null,
  };
}

// Version 1 (the first Trainer build) → version 2 shape.
function migrateV1(s) {
  const n = { ...freshState(), v: 2 };
  const st = s.settings || {};
  Object.assign(n.settings, {
    proteinGoal: st.proteinGoal ?? n.settings.proteinGoal, kcalGoal: st.kcalGoal ?? n.settings.kcalGoal,
    highContrast: !!st.highContrast, startWeight: st.startWeight ?? 90, target: st.target ?? 77,
  });
  n.days = s.days || {};
  const dolceMap = { d_breakfast: 'dplate_b', d_lunch: 'dplate_l', d_dinner: 'dplate_d', d_snack: 'dplate_s' };
  n.meals = (s.meals || []).map((m) => {
    const ref = dolceMap[m.source] || m.source;
    const staple = STAPLES.find((x) => x.id === ref);
    return staple
      ? { id: m.id, date: m.date, at: m.at, name: staple.name, kcal: staple.kcal, p: staple.p, c: staple.c, f: staple.f, servings: 1, ref: staple.id, kind: 'staple' }
      : { id: m.id, date: m.date, at: m.at, name: m.name, kcal: m.kcal ?? null, p: m.protein ?? 0, c: null, f: null, servings: 1, ref: null, kind: 'oneoff' };
  });
  n.workouts = (s.workouts || []).map((w) => {
    let pid, dayIdx;
    if (w.program === 'mentzer') { pid = 'mentzer_ab'; dayIdx = w.day === 'B' ? 1 : 0; }
    else { pid = 'my4week'; dayIdx = (w.phase === 2 ? 4 : 0) + (Number(w.day) || 1) - 1; }
    const prog = n.programs[pid];
    const day = prog.days[dayIdx] || prog.days[0];
    const entries = day.exercises.map((e, i) => {
      const s1 = w.sets?.[i];
      return { exId: e.id, name: e.name, sets: s1 ? [{ kg: s1.kg ?? null, reps: s1.reps ?? null }] : [], note: '' };
    }).filter((e) => e.sets.length);
    return { id: w.id, date: w.date, at: w.at, programId: pid, programName: prog.name, family: prog.family, dayId: day.id, dayName: day.name, entries, quick: !!w.quick };
  });
  n.sleep = s.sleep || [];
  n.weights = s.weights || [];
  n.measurements = s.measurements || [];
  return n;
}

// Any older version → current shape, keeping all data (used by Restore).
function normalise(s) {
  if (!s || typeof s !== 'object') return freshState();
  if (!s.v || s.v === 1) s = migrateV1(s);
  const d = freshState();
  const out = {
    ...d, ...s, v: 3,
    settings: { ...d.settings, ...s.settings, window: { ...d.settings.window, ...(s.settings?.window || {}) }, active: { ...d.settings.active, ...(s.settings?.active || {}) } },
    seen: { ...d.seen, ...s.seen },
  };
  for (const t of PROGRAM_TEMPLATES) if (!out.programs[t.id]) out.programs[t.id] = programFromTemplate(t);
  out.fluids = (out.fluids || []).map((f) => (f.type === 'coffee' ? { ...f, type: 'tea' } : f));
  delete out.refeeds;
  return out;
}

// The last weight and reps used for every exercise, from all logged sessions.
function baselinesFrom(s) {
  const out = { ...(s.baselines || {}) };
  for (const w of [...(s.workouts || [])].sort((a, b) => a.at.localeCompare(b.at))) {
    for (const e of w.entries || []) {
      const sets = (e.sets || []).filter((x) => x.kg != null || x.reps != null || x.hold != null);
      if (sets.length) out[exKey(e.name)] = { name: e.name, sets, date: w.date };
    }
  }
  return out;
}

// Start clean, keeping only exercise starting points and the display preference.
function cleanSlate(old, keepWeights = true) {
  const n = freshState();
  if (keepWeights) n.baselines = baselinesFrom(old);
  n.settings.highContrast = !!old.settings?.highContrast;
  return n;
}

let storageOk = true;
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    if ((parsed.v || 1) < 3) {
      // One-time fresh start for version 3. The old data is kept aside, untouched, in case it's needed.
      localStorage.setItem(OLD_KEY, raw);
      const n = cleanSlate(normalise(parsed), true);
      n.notice = 'v3';
      localStorage.setItem(STORE_KEY, JSON.stringify(n));
      return n;
    }
    return normalise(parsed);
  } catch {
    storageOk = false;
    return freshState();
  }
}
// Match exercises across programs: case, punctuation and plurals ignored ("Incline Presses" = "incline press").
const exKey = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
  .map((w) => (w.endsWith('sses') ? w.slice(0, -2) : w.endsWith('s') && !w.endsWith('ss') && w.length > 3 ? w.slice(0, -1) : w)).join(' ');
let S = load();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); storageOk = true; } catch { storageOk = false; }
}
const dayRec = (date) => (S.days[date] ||= {});
const planRec = (date) => (S.plans[date] ||= {});
const oldBackup = () => { try { return localStorage.getItem(OLD_KEY); } catch { return null; } };

// ===========================================================================
// Derived data
// ===========================================================================
const mealKcal = (m) => (m.kcal ?? (4 * (m.p || 0) + 4 * (m.c || 0) + 9 * (m.f || 0)));
const mealTotals = (m) => {
  const k = m.servings ?? 1;
  return { kcal: mealKcal(m) * k, p: (m.p || 0) * k, c: (m.c || 0) * k, f: (m.f || 0) * k };
};
const mealsOn = (date) => S.meals.filter((m) => m.date === date).sort((a, b) => a.at.localeCompare(b.at));
function macrosOn(date) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const m of mealsOn(date)) { const x = mealTotals(m); t.kcal += x.kcal; t.p += x.p; t.c += x.c; t.f += x.f; }
  return t;
}
const sleepOn = (date) => S.sleep.find((x) => x.date === date);
const workoutsOn = (date) => S.workouts.filter((w) => w.date === date).sort((a, b) => a.at.localeCompare(b.at));
const fluidsOn = (date) => S.fluids.filter((f) => f.date === date).sort((a, b) => a.at.localeCompare(b.at));
const fluidTotal = (date) => sum(fluidsOn(date), (f) => f.ml);
const fluidGoal = (date) => S.settings.fluidMl + (S.days[date]?.walk ? S.settings.walkExtraMl : 0);
const latestWeight = () => [...S.weights].sort((a, b) => a.date.localeCompare(b.date)).pop() || null;
const chainStart = () => S.settings.chainStart;

function fluidGoalAt(date) {
  const goal = fluidGoal(date);
  let t = 0;
  for (const f of fluidsOn(date)) { t += f.ml; if (t >= goal) return f.at; }
  return null;
}

// ---- eating window and fasting ---------------------------------------------
const win = () => S.settings.window;
const windowHours = () => round1((minutesOf(win().to) - minutesOf(win().from)) / 60);
const windowLabel = () => { const h = windowHours(); const p = WINDOW_PRESETS.find(([, n]) => n === h); return p ? p[0] : `${24 - h}:${h}`; };
const inWindow = (iso) => inRange(iso, win());
// Has the given time of day passed on that date?
function passed(date, hhmm) {
  const t = today();
  if (date < t) return true;
  if (date > t) return false;
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes() >= minutesOf(hhmm);
}
const activeFast = () => S.fasts.find((f) => !f.end) || null;
const fastEnd = (f) => (f.end ? new Date(f.end) : new Date());
const fastHours = (f) => (fastEnd(f) - new Date(f.start)) / 3600000;
// A fast that spans the whole eating window on this date.
function fastCovers(date) {
  const open = new Date(atOn(date, win().from)), close = new Date(atOn(date, win().to));
  return S.fasts.some((f) => new Date(f.start) <= open && (f.end ? new Date(f.end) >= close : new Date() >= open));
}
const planKind = (date) => S.plans[date]?.kind || null;
const isFastDay = (date) => mealsOn(date).length === 0 && (planKind(date) === 'fast' || fastCovers(date) || !!S.days[date]?.fast);

function lastMealBefore(when) {
  const iso = when.toISOString();
  return S.meals.filter((m) => m.at <= iso).sort((a, b) => b.at.localeCompare(a.at))[0] || null;
}

function windowStatus() {
  const now = new Date();
  const d = today();
  const open = new Date(atOn(d, win().from)), close = new Date(atOn(d, win().to));
  const last = lastMealBefore(now);
  const lastClose = now >= close ? close : new Date(atOn(addDays(d, -1), win().to));
  const fastSince = last && new Date(last.at) > lastClose ? new Date(last.at) : lastClose;
  if (now < open) return { state: 'before', open, close, fastSince };
  if (now <= close) return { state: 'open', open, close, fastSince: null };
  return { state: 'after', open: new Date(atOn(addDays(d, 1), win().from)), close, fastSince: last && new Date(last.at) > close ? new Date(last.at) : close };
}

function fastStage(h) {
  let cur = null, next = null;
  for (const s of FAST_STAGES) { if (h >= s[0]) cur = s; else { next = s; break; } }
  return { cur, next };
}

// ---- chains ----------------------------------------------------------------
function trainingRecovered(date) {
  // No plan for the day: resting counts while you're within Mentzer's recovery window of your last session.
  const before = S.workouts.filter((w) => w.date < date).map((w) => w.date).sort().pop() || addDays(chainStart(), -1);
  return daysBetween(before, date) <= 7;
}

function chainAuto(date, id) {
  const t = today();
  const past = date < t;
  switch (id) {
    case 'coffee': return past ? 'miss' : 'pending';
    case 'diet': {
      const meals = mealsOn(date);
      if (!meals.length) {
        if (isFastDay(date) && passed(date, win().to)) return 'done';
        return past ? 'miss' : 'pending';
      }
      if (meals.some((m) => !inWindow(m.at))) return 'miss';
      if (macrosOn(date).kcal > S.settings.kcalGoal) return 'miss';
      return passed(date, win().to) ? 'done' : 'pending';
    }
    case 'training': {
      const trained = workoutsOn(date).length > 0;
      const kind = planKind(date);
      if (kind === 'train') return trained ? 'done' : past ? 'miss' : 'pending';
      if (kind === 'rest' || kind === 'fast') return trained ? 'miss' : 'done';
      if (trained || trainingRecovered(date)) return 'done';
      return past ? 'miss' : 'pending';
    }
    case 'walk': return S.days[date]?.walk ? 'done' : past ? 'miss' : 'pending';
    case 'plan': {
      const p = S.plans[addDays(date, 1)];
      return p?.madeOn && p.madeOn <= date ? 'done' : past ? 'miss' : 'pending';
    }
  }
  return 'pending';
}

function chainStatus(date, id) {
  if (date < chainStart() || date > today()) return 'off';
  const o = S.days[date]?.chains?.[id];
  if (o === true) return 'done';
  if (o === false) return 'miss';
  return chainAuto(date, id);
}

let chainMemo = null;
function chainStreak(id) {
  chainMemo ||= {};
  if (chainMemo[id]) return chainMemo[id];
  const t = today();
  let cur = 0, best = 0, days = 0;
  for (let d = chainStart(); d <= t; d = addDays(d, 1)) {
    const s = chainStatus(d, id);
    if (s === 'done') { cur++; days++; best = Math.max(best, cur); } else if (s === 'miss') cur = 0;
  }
  return (chainMemo[id] = { cur, best, days, today: t >= chainStart() ? chainStatus(t, id) : 'off' });
}

// ---- quests ----------------------------------------------------------------
function questAt(date, key) {
  switch (key) {
    case 'walk': return S.days[date]?.walk?.at || null;
    case 'training': return workoutsOn(date)[0]?.at || null;
    case 'protein': {
      if (macrosOn(date).p < S.settings.proteinGoal) return null;
      let p = 0;
      for (const m of mealsOn(date)) { p += mealTotals(m).p; if (p >= S.settings.proteinGoal) return m.at; }
      return null;
    }
    case 'fluids': return fluidGoalAt(date);
    case 'sleep': return sleepOn(date)?.at || null;
    case 'plan': { const p = S.plans[addDays(date, 1)]; return p?.madeOn === date ? p.madeAt : null; }
    case 'journal': return S.journal[date]?.at || null;
  }
  return null;
}
function questPoints(date, key) {
  const at = questAt(date, key);
  return at ? QUEST_BASE + (key === 'walk' && inRange(at, WALK_WINDOW) ? QUEST_BONUS : 0) : 0;
}
// Quests that apply on a date: no training quest on rest or fast days, no protein quest on fast days.
function questsFor(date) {
  const kind = planKind(date);
  return Object.keys(QUESTS).filter((k) => {
    if (k === 'training') return !(kind === 'rest' || kind === 'fast') || !!questAt(date, k);
    if (k === 'protein') return !(kind === 'fast' || activeFastOn(date)) || !!questAt(date, k);
    return true;
  });
}
const activeFastOn = (date) => date === today() && !!activeFast();

function sleepPoints(s) {
  let p = s.hours >= 7.5 ? 10 : s.hours >= 6.5 ? 5 : 2;
  p += s.quality >= 8 ? 5 : s.quality >= 6 ? 2 : 0;
  return p;
}

function allDates() {
  const set = new Set(Object.keys(S.days));
  for (const list of [S.meals, S.workouts, S.sleep, S.fluids]) list.forEach((x) => set.add(x.date));
  Object.keys(S.journal).forEach((d) => set.add(d));
  Object.values(S.plans).forEach((p) => p.madeOn && set.add(p.madeOn));
  return [...set].sort();
}

// ---- training analytics ---------------------------------------------------
const e1rm = (kg, reps) => (kg && reps ? kg * (1 + reps / 30) : 0);
const entryBest = (e) => Math.max(0, ...(e.sets || []).map((s) => e1rm(s.kg, s.reps)));
const techOf = (e) => TECHNIQUES.find((t) => t.id === e?.tech) || null;
const logMode = (e) => techOf(e)?.log || 'normal';
const setText = (s) => (s.hold != null ? `${fmtNum(s.kg)} kg${s.reps != null ? `×${fmtNum(s.reps)}` : ''} · ${fmtNum(s.hold)} s hold` : `${fmtNum(s.kg)}×${fmtNum(s.reps)}`);

function prSessions() {
  const best = {};
  const prs = new Set();
  for (const w of [...S.workouts].sort((a, b) => a.at.localeCompare(b.at))) {
    for (const e of w.entries || []) {
      const b = entryBest(e);
      if (!b) continue;
      const k = exKey(e.name);
      const prior = best[k] ?? (S.baselines[k] ? entryBest(S.baselines[k]) : 0);
      if (prior && b > prior + 0.01) prs.add(w.id);
      best[k] = Math.max(prior || 0, b);
    }
  }
  return prs;
}

// Last time you did an exercise, falling back to the starting point kept from before the reset.
function lastEntryFor(name) {
  const k = exKey(name);
  const ws = [...S.workouts].sort((a, b) => b.at.localeCompare(a.at));
  for (const w of ws) {
    const e = (w.entries || []).find((x) => exKey(x.name) === k && x.sets?.some((s) => s.kg != null || s.reps != null || s.hold != null));
    if (e) return { entry: e, date: w.date };
  }
  const b = S.baselines[k];
  return b ? { entry: b, date: b.date, baseline: true } : null;
}

function repRange(reps) {
  const m = String(reps).match(/(\d+)(?:\s*[–-]\s*(\d+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] || m[1])];
}

function progressionHint(ex, family) {
  const last = lastEntryFor(ex.name);
  const range = repRange(ex.reps);
  const mode = logMode(ex);
  if (!last || !range || mode === 'singles') return '';
  if (mode === 'hold') {
    const holds = last.entry.sets.filter((s) => s.hold);
    return holds.length && holds.every((s) => s.hold >= range[1]) ? `Held ${range[1]} s or more last time: add weight.` : '';
  }
  const sets = last.entry.sets.filter((s) => s.reps);
  if (!sets.length || !sets.every((s) => s.reps >= range[1])) return '';
  return family === 'hit' ? 'Top of the range last time: add about 10% weight.' : 'All sets at the top of the range last time: add 2.5 kg.';
}

// ---- goals ----------------------------------------------------------------
function metricMet(m) {
  if (!m) return false;
  switch (m.type) {
    case 'weight': { const w = latestWeight(); return !!w && w.kg <= m.value; }
    case 'sessions': return S.workouts.length >= m.value;
    case 'hitSessions': return S.workouts.filter((w) => w.family === 'hit').length >= m.value;
    case 'vision': return !!(S.author.vision && S.author.vision.trim());
    case 'streak': return chainStreak('coffee').best >= m.value;
    case 'planStreak': return chainStreak('plan').best >= m.value;
    case 'dietStreak': return chainStreak('diet').best >= m.value;
    case 'reflections': return Object.keys(S.journal).length >= m.value;
  }
  return false;
}
const milestoneDone = (m) => !!m.doneAt || metricMet(m.metric);
const goalDone = (g) => !!g.doneAt || (g.milestones.length > 0 && g.milestones.every(milestoneDone));

// ---- XP -------------------------------------------------------------------
const bestFast = () => Math.max(0, ...S.fasts.filter((f) => f.end).map(fastHours));
const ACHIEVEMENTS = [
  ['coffee3', 'Through the Fog', '3 days coffee-free', () => chainStreak('coffee').best >= 3],
  ['coffee7', 'Clean Week', '7 days coffee-free', () => chainStreak('coffee').best >= 7],
  ['coffee30', 'Unshakeable', '30 days coffee-free', () => chainStreak('coffee').best >= 30],
  ['diet7', 'Dialled In', '7-day diet chain', () => chainStreak('diet').best >= 7],
  ['plan7', 'Architect', 'Plan tomorrow 7 nights running', () => chainStreak('plan').best >= 7],
  ['walk7', 'Early Riser', '7 morning walks in a row', () => chainStreak('walk').best >= 7],
  ['fast24', 'One Full Day', 'Finish a 24-hour fast', () => bestFast() >= 24],
  ['fast48', 'Iron Will', 'Finish a 48-hour fast', () => bestFast() >= 48],
  ['weekplan', 'Weekend Planner', 'Save a weekly plan', () => Object.keys(S.weekPlans).length > 0],
  ['mentzer', 'Heavy Duty', 'Complete a Mentzer HIT session', () => S.workouts.some((w) => w.family === 'hit')],
  ['advanced', 'Beyond Failure', 'Log an advanced-technique set', () => S.workouts.some((w) => (w.entries || []).some((e) => e.tech && e.sets.length))],
  ['first_pr', 'New Record', 'Beat your best on any lift', () => prSessions().size > 0],
  ['first_weigh', 'On the Scale', 'Log your first weigh-in', () => S.weights.length > 0],
  ['lost5', 'Five Down', 'Lose 5 kg from your start weight', () => { const w = latestWeight(); return !!w && w.kg <= S.settings.startWeight - 5; }],
  ['reflect7', 'Grateful', '7 gratitude entries', () => Object.keys(S.journal).length >= 7],
  ['author', 'Author', 'Write your 12-month vision', () => !!(S.author.vision && S.author.vision.trim())],
  ['first_goal', 'Quest Complete', 'Complete a goal', () => S.goals.some(goalDone)],
  ['level5', 'Level 5', 'Reach level 5', null],
  ['level10', 'Level 10', 'Reach level 10', null],
];

function computeXP() {
  const events = [];
  const add = (date, pts, label, stat) => { if (pts) events.push({ date, pts, label, stat }); };
  for (const d of allDates()) {
    for (const k of Object.keys(QUESTS)) {
      const p = questPoints(d, k);
      add(d, p, QUESTS[k].name + (p > QUEST_BASE ? ' · on time' : ''), QUESTS[k].stat);
    }
  }
  for (let d = chainStart(); d <= today(); d = addDays(d, 1)) {
    for (const c of CHAINS) if (chainStatus(d, c.id) === 'done') add(d, c.pts, `Chain: ${c.name}`, c.stat);
  }
  const prs = prSessions();
  for (const w of S.workouts) {
    add(w.date, PTS.session, `Session: ${w.dayName}`, 'STR');
    if (prs.has(w.id)) add(w.date, PTS.pr, 'Personal record', 'STR');
  }
  S.fasts.filter((f) => f.end).forEach((f) => add(f.end.slice(0, 10), PTS.fastDay * Math.floor(fastHours(f) / 24), `Fast · ${Math.floor(fastHours(f))} h`, 'NUT'));
  S.sleep.forEach((s) => add(s.date, sleepPoints(s), `Sleep ${s.hours} h · quality ${s.quality}`, 'VIT'));
  S.weights.forEach((w) => add(w.date, PTS.weigh, 'Weigh-in', 'MND'));
  S.measurements.forEach((m) => add(m.date, PTS.measure, 'Measurements', 'MND'));
  for (const [k] of AUTHOR_PROMPTS) if (S.author[k]?.trim()) add(S.author[`${k}At`] || '', PTS.author, 'Author: ' + k, 'MND');
  Object.entries(S.reviews).forEach(([wk, r]) => add(r.date || wk, PTS.review, 'Weekly review', 'MND'));
  Object.entries(S.weekPlans).forEach(([wk, r]) => add(r.madeOn || wk, PTS.week, 'Weekly plan', 'MND'));
  for (const g of S.goals) {
    for (const m of g.milestones) if (milestoneDone(m)) add(m.doneAt ? m.doneAt.slice(0, 10) : '', PTS.milestone, `Milestone: ${m.text}`, 'MND');
    if (goalDone(g)) add(g.doneAt ? g.doneAt.slice(0, 10) : '', PTS.goal, `Goal complete: ${g.title}`, 'MND');
  }
  const unlocked = {};
  for (const [id, name, , test] of ACHIEVEMENTS) if (test && test()) { unlocked[id] = true; add('', PTS.ach, `Achievement: ${name}`, null); }
  let total = sum(events, (e) => e.pts);
  for (const [id, lvl, name] of [['level5', 5, 'Level 5'], ['level10', 10, 'Level 10']]) {
    if (Math.floor(total / 100) + 1 >= lvl) { unlocked[id] = true; total += PTS.ach; events.push({ date: '', pts: PTS.ach, label: `Achievement: ${name}`, stat: null }); }
  }
  const stats = Object.fromEntries(STATS.map(([k]) => [k, 0]));
  events.forEach((e) => { if (e.stat) stats[e.stat] += e.pts; });
  const level = Math.floor(total / 100) + 1;
  return { total, level, intoLevel: total % 100, unlocked, events, stats };
}
const xpOn = (date, P) => sum(P.events.filter((e) => e.date === date), (e) => e.pts);

// ===========================================================================
// Programs
// ===========================================================================
const programs = (family, tier) => Object.values(S.programs).filter((p) => p.family === family && (!tier || (p.tier || 'intermediate') === tier));
const activeProgram = () => {
  const fam = S.settings.family;
  const p = S.programs[S.settings.active[fam]];
  if (p && (fam !== 'hit' || (p.tier || 'intermediate') === S.settings.tier)) return p;
  return (fam === 'hit' ? programs(fam, S.settings.tier)[0] : null) || p || programs(fam)[0];
};
const cycleWeek = () => Math.floor(daysBetween(S.settings.cycleStart, today()) / 7) + 1;
const sessionsOf = (pid) => S.workouts.filter((w) => w.programId === pid).sort((a, b) => a.at.localeCompare(b.at));

function nextDay(prog) {
  const hist = sessionsOf(prog.id);
  const last = hist[hist.length - 1];
  let pool = prog.days;
  if (prog.family === 'cycle') {
    const wk = cycleWeek();
    const inWeek = prog.days.filter((d) => d.weeks?.includes(wk));
    if (inWeek.length) pool = inWeek;
  }
  if (!last) return pool[0];
  const idx = pool.findIndex((d) => d.id === last.dayId);
  return idx === -1 ? pool[0] : pool[(idx + 1) % pool.length];
}

function recovery(prog) {
  if (!prog.restDays) return null;
  const hist = sessionsOf(prog.id);
  const last = hist[hist.length - 1];
  if (!last) return { cls: '', text: 'No sessions yet' };
  const days = daysBetween(last.date, today());
  const [min, max] = prog.restDays;
  if (days < min) return { cls: 'warn', text: `Recovering · day ${days} of ${min}–${max}` };
  if (days <= max) return { cls: 'good', text: `Ready to train · day ${days}` };
  return { cls: 'bad', text: `Overdue · ${days} days since last session` };
}

// ===========================================================================
// Planning
// ===========================================================================
function weekStart(date) { const d = parseDate(date); const back = (d.getDay() + 6) % 7; return addDays(date, -back); }
// Over the weekend you plan the coming week; otherwise this week.
function planningWeek() { const d = parseDate(today()).getDay(); return d === 0 || d >= 5 ? addDays(weekStart(today()), 7) : weekStart(today()); }

function suggestWeek(ws) {
  const prog = activeProgram();
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  if (prog.family === 'cycle') {
    days.forEach((d, i) => { if (planKind(d) !== 'fast') planRec(d).kind = [0, 1, 3, 4].includes(i) ? 'train' : 'rest'; });
    return;
  }
  const gap = Math.max(2, prog.restDays?.[0] || 4);
  const lastDate = sessionsOf(prog.id).map((w) => w.date).pop() || S.workouts.map((w) => w.date).sort().pop();
  let next = lastDate ? addDays(lastDate, gap) : ws;
  if (next < ws) next = ws;
  for (const d of days) {
    if (planKind(d) === 'fast') { if (d === next) next = addDays(next, 1); continue; }
    if (d === next) { planRec(d).kind = 'train'; next = addDays(d, gap); } else planRec(d).kind = 'rest';
  }
}

function weekWarning(d) {
  const kind = planKind(d);
  if (kind === 'train' && planKind(addDays(d, -1)) === 'fast') return 'Coming off a fast: eat before you train, or move this session.';
  if (kind === 'train' && planKind(addDays(d, -1)) === 'train' && S.settings.family === 'hit') return 'Back-to-back HIT days leave no time to recover.';
  if (kind === 'fast' && planKind(addDays(d, -1)) === 'fast' && planKind(addDays(d, -2)) === 'fast') return 'Past 72 hours: check with your GP first.';
  return '';
}

function foodLibrary() {
  return [
    ...STAPLES.map((x) => ({ ...x, meal: 'Staple', kind: 'staple' })),
    ...RECIPES.map((x) => ({ ...x, kind: 'recipe' })),
    ...S.myFoods.map((x) => ({ ...x, meal: x.meal || 'My food', kind: 'mine', mine: true })),
  ];
}
const findFood = (id) => foodLibrary().find((f) => f.id === id);
const plannedMeals = (date) => SLOTS.map((slot) => [slot, S.plans[date]?.meals?.[slot]]).filter(([, id]) => id && findFood(id));
function plannedMacros(date) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const [, id] of plannedMeals(date)) { const f = findFood(id); t.kcal += mealKcal(f); t.p += f.p || 0; t.c += f.c || 0; t.f += f.f || 0; }
  return t;
}
const slotLogged = (date, slot, id) => mealsOn(date).find((m) => m.ref === id && (!m.slot || m.slot === slot));

function slotForTime(iso) {
  const m = minuteOfIso(iso), a = minutesOf(win().from), b = minutesOf(win().to);
  if (m > b + 60 || m < a - 60) return 'Snack';
  const third = (b - a) / 3 || 1;
  return m < a + third ? 'Breakfast' : m < a + 2 * third ? 'Lunch' : 'Dinner';
}

// ===========================================================================
// UI state
// ===========================================================================
const TABS = [['today', 'Today'], ['plan', 'Plan'], ['train', 'Train'], ['fuel', 'Fuel'], ['body', 'Body'], ['hero', 'Hero']];
const SUBTABS = {
  plan: [['tomorrow', 'Tomorrow'], ['week', 'Week'], ['shop', 'Shopping']],
  fuel: [['log', 'Log'], ['recipes', 'Recipes'], ['fluids', 'Fluids'], ['stack', 'Stack']],
  body: [['weight', 'Weight'], ['measure', 'Measure'], ['sleep', 'Sleep'], ['settings', 'Settings']],
  hero: [['character', 'Character'], ['goals', 'Goals'], ['journal', 'Journal'], ['calendar', 'Chains']],
};
const ui = {
  tab: 'today', sub: { plan: 'tomorrow', fuel: 'log', body: 'weight', hero: 'character' },
  fuelDate: null, calDate: null, calChain: 'all', planDate: null, weekStart: null, dayId: null, editProgram: false, drafts: {},
  recipeFilter: 'All', recipeQuery: '', openRecipe: null, ingChecks: {}, fluidType: 'water',
  sleepHours: 7.5, sleepQuality: null, openSession: null, openTech: null,
};
try {
  const saved = JSON.parse(sessionStorage.getItem('trainer.ui') || '{}');
  if (saved.tab && TABS.some(([k]) => k === saved.tab)) ui.tab = saved.tab;
  if (saved.sub) for (const k of Object.keys(ui.sub)) if (SUBTABS[k].some(([v]) => v === saved.sub[k])) ui.sub[k] = saved.sub[k];
} catch { /* private mode */ }
const rememberUi = () => { try { sessionStorage.setItem('trainer.ui', JSON.stringify({ tab: ui.tab, sub: ui.sub })); } catch { /* ignore */ } };

// ===========================================================================
// Small renderers
// ===========================================================================
function bar(value, goal, cls = '') {
  const pct = goal ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  return `<div class="bar ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="${Math.round(goal)}" aria-valuenow="${Math.round(value)}"><i style="width:${pct}%"></i></div>`;
}
const chip = (text, cls = '') => `<span class="chip ${cls}">${esc(text)}</span>`;
const segmented = (act, items, current, label, extra = '') =>
  `<div class="seg" role="group" aria-label="${esc(label)}">${items.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${esc(v)}" ${extra} aria-pressed="${String(v) === String(current)}">${esc(l)}</button>`).join('')}</div>`;
const macroLine = (x) => `${Math.round(x.kcal)} kcal · P ${fmtNum(round1(x.p))} · C ${fmtNum(round1(x.c))} · F ${fmtNum(round1(x.f))}`;
const macroChips = (x) => `<div class="macros"><span><b>${Math.round(mealKcal(x))}</b>kcal</span><span><b>${fmtNum(round1(x.p))}</b>protein</span><span><b>${fmtNum(round1(x.c))}</b>carbs</span><span><b>${fmtNum(round1(x.f))}</b>fat</span></div>`;
function dateNav(act, date, opts = {}) {
  const t = today();
  const label = date === t ? 'Today' : date === addDays(t, 1) ? 'Tomorrow' : fmtDate(date);
  return `<div class="row between datenav">
    <button class="icon" data-act="${act}" data-dir="-1" aria-label="Previous day" ${opts.min && date <= opts.min ? 'disabled' : ''}>‹</button>
    <button class="ghost grow" data-act="${act}" data-dir="0"><b>${label}</b><span class="muted small">&nbsp;${date === t || label !== fmtDate(date) ? fmtDate(date) : '· tap to reset'}</span></button>
    <button class="icon" data-act="${act}" data-dir="1" aria-label="Next day" ${opts.max && date >= opts.max ? 'disabled' : ''}>›</button>
  </div>`;
}
const STATUS_ICON = { done: '✓', miss: '✕', pending: '', off: '' };

// ===========================================================================
// TODAY
// ===========================================================================
function questRow(date, key) {
  const q = QUESTS[key];
  const at = questAt(date, key);
  const now = new Date();
  const liveWalk = key === 'walk' && !at && inRange(now.toISOString(), WALK_WINDOW);
  const pts = at ? `+${questPoints(date, key)}` : key === 'walk' ? `${QUEST_BASE}+${QUEST_BONUS}` : `${QUEST_BASE}`;
  const sub = at ? `Done ${fmtTime(at)}${key === 'walk' && inRange(at, WALK_WINDOW) ? ' · on-time bonus' : ''}` : `${liveWalk ? 'Now · ' : ''}${q.note}`;
  return `<button class="quest ${at ? 'done' : ''} ${liveWalk ? 'now' : ''}" data-act="quest" data-key="${key}" aria-pressed="${!!at}">
    <span class="tick" aria-hidden="true">${at ? '✓' : ''}</span>
    <span class="grow"><span class="t">${q.name}</span><br><span class="muted small">${esc(sub)}</span></span>
    <span class="stat-tag">${q.stat}</span><span class="pts">${pts}</span></button>`;
}

function fastingCard() {
  const f = activeFast();
  if (f) {
    const h = fastHours(f);
    const { cur, next } = fastStage(h);
    return `<section class="card fastcard">
      <h2>Extended fast <span class="right">goal ${f.goalH} h</span></h2>
      <div class="bigtime" data-since="${f.start}">${fmtDur(Date.now() - new Date(f.start))}</div>
      ${bar(h, f.goalH, h >= f.goalH ? 'good' : 'xp')}
      <p class="small">${cur ? `<b>${esc(cur[1])}.</b> ${esc(cur[2])}` : 'Started. Water and electrolytes through the day.'}</p>
      ${next ? `<p class="muted small">Next: ${esc(next[1])} in ${fmtDur((next[0] - h) * 3600000)}</p>` : ''}
      <p class="small accent">Electrolytes: a pinch of salt in water, plus potassium and magnesium on long fasts.</p>
      <details class="small"><summary>Staying safe</summary><ul>${FAST_SAFETY.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>
      <div class="grid2"><button class="primary" data-act="fast-end">End fast</button><button data-act="fast-goal">Change goal</button></div>
    </section>`;
  }
  const w = windowStatus();
  const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  let head, line;
  if (w.state === 'open') {
    head = `<div class="row between"><b class="good-text">Eating window open</b>${chip(windowLabel())}</div>`;
    line = `Closes at ${hm(w.close)} · <span data-until="${w.close.toISOString()}">${fmtDur(w.close - Date.now())}</span> left`;
  } else {
    head = `<div class="row between"><b>Fasting</b>${chip(windowLabel())}</div>
      <div class="bigtime" data-since="${w.fastSince.toISOString()}">${fmtDur(Date.now() - w.fastSince)}</div>`;
    line = `Window opens ${w.state === 'after' ? 'tomorrow ' : ''}at ${hm(w.open)} · in <span data-until="${w.open.toISOString()}">${fmtDur(w.open - Date.now())}</span>`;
  }
  return `<section class="card fastcard">
    <h2>Eating window <span class="right">${esc(win().from)}–${esc(win().to)}</span></h2>
    ${head}<p class="small">${line}</p>
    <button data-act="fast-start">Start an extended fast</button>
  </section>`;
}

function chainRow(c) {
  const st = chainStreak(c.id);
  const s = st.today;
  const action = { diet: 'go-fuel', training: 'go-train', walk: 'quest-walk', plan: 'go-plan' }[c.id];
  const flame = `<span class="flame ${st.cur ? 'lit' : ''}" aria-label="${st.cur} day chain">${st.cur}</span>`;
  const note = s === 'done' ? 'Kept today' : s === 'miss' ? 'Broken today: start again tomorrow' : c.id === 'diet' && mealsOn(today()).length ? 'On track: finish inside the window' : c.desc;
  if (c.id === 'coffee') {
    return `<div class="chain ${s}">
      <div class="row between"><span class="grow"><b>${c.name}</b><br><span class="muted small">${s === 'pending' ? 'Tap when the day is done, or if you slip.' : esc(note)} · best ${st.best}</span></span>${flame}</div>
      <div class="grid2"><button class="${s === 'done' ? 'primary' : ''}" data-act="coffee" data-v="1" aria-pressed="${s === 'done'}">✓ Coffee-free today</button>
      <button class="${s === 'miss' ? 'danger' : ''}" data-act="coffee" data-v="0" aria-pressed="${s === 'miss'}">I had coffee</button></div></div>`;
  }
  return `<button class="chain linkish ${s}" data-act="${action}">
    <span class="row between"><span class="grow"><b>${STATUS_ICON[s] ? `<span class="st ${s}">${STATUS_ICON[s]}</span> ` : ''}${c.name}</b><br><span class="muted small">${esc(note)} · best ${st.best}</span></span>${flame}</span></button>`;
}

function coffeeSupport() {
  const st = chainStreak('coffee');
  const t = today();
  const dayNo = t < chainStart() ? 0 : st.cur + (st.today === 'pending' ? 1 : 0);
  const tip = [...COFFEE_TIPS].reverse().find(([n]) => n === dayNo) || (dayNo <= 3 && dayNo > 0 ? COFFEE_TIPS[Math.min(dayNo, 3) - 1] : null);
  if (!tip) return '';
  return `<section class="card support"><h2>No-coffee chain · ${esc(tip[1])}</h2><p>${esc(tip[2])}</p></section>`;
}

function todaysPlanCard(d) {
  const p = S.plans[d];
  if (!p) return '';
  const kind = p.kind;
  const items = [];
  if (kind) {
    const done = kind === 'train' ? workoutsOn(d).length > 0 : !workoutsOn(d).length;
    items.push(`<button class="check" role="checkbox" aria-checked="${done}" data-act="go-train"><span class="box" aria-hidden="true">${done ? '✓' : ''}</span><span>${kind === 'train' ? `Train: ${esc(nextDay(activeProgram()).name)}` : kind === 'fast' ? 'Fast day: no training, keep it easy' : 'Rest day: recovery is when you grow'}</span></button>`);
  }
  if (p.walk !== false) { const done = !!S.days[d]?.walk; items.push(`<button class="check" role="checkbox" aria-checked="${done}" data-act="quest" data-key="walk"><span class="box" aria-hidden="true">${done ? '✓' : ''}</span><span>Morning walk</span></button>`); }
  for (const [slot, id] of plannedMeals(d)) {
    const f = findFood(id);
    const done = !!slotLogged(d, slot, id);
    items.push(`<button class="check" role="checkbox" aria-checked="${done}" data-act="log-planned" data-slot="${slot}" data-id="${esc(id)}"><span class="box" aria-hidden="true">${done ? '✓' : ''}</span><span>${slot}: ${esc(f.name)}${done ? '' : ' <span class="muted small">· tap to log</span>'}</span></button>`);
  }
  (p.top || []).forEach((t, i) => { if (t) { const done = !!p.topDone?.[i]; items.push(`<button class="check" role="checkbox" aria-checked="${done}" data-act="top-done" data-i="${i}"><span class="box" aria-hidden="true">${done ? '✓' : ''}</span><span>${esc(t)}</span></button>`); } });
  if (!items.length) return '';
  return `<section class="card"><h2>Today's plan <span class="right">${kind ? esc(DAY_KINDS.find(([k]) => k === kind)[1]) + ' day' : ''}</span></h2><div class="list">${items.join('')}</div></section>`;
}

function planTomorrowPrompt(d) {
  const tm = addDays(d, 1);
  if (S.plans[tm]?.madeAt) return `<section class="card slim"><p>${chip('✓ Tomorrow is planned', 'good')} <button class="linkish inline" data-act="go-plan">View</button></p></section>`;
  const ready = passed(d, win().to) || mealsOn(d).some((m) => m.slot === 'Dinner');
  return `<section class="card ${ready ? 'callout' : ''}">
    <h2>Plan tomorrow</h2>
    <p class="small">${ready ? 'Last meal done. Take two minutes: tomorrow\'s meals, training or rest, and your top 3.' : `Best done after your last meal (window closes ${esc(win().to)}).`}</p>
    <button class="${ready ? 'primary' : ''}" data-act="go-plan">Plan ${fmtDate(tm)}</button>
  </section>`;
}

function rhythm() {
  const w = win();
  return [
    [`${WALK_WINDOW.from}–${WALK_WINDOW.to}`, 'Morning walk (sweat suit)'],
    [w.from, 'Eating window opens: first meal'],
    [`${w.from}–${w.to}`, 'Train in or just before the window'],
    [w.to, 'Last meal done: window closes'],
    ['Evening', 'Plan tomorrow, gratitude journal'],
    ['22:30', 'Lights out target'],
  ];
}

function viewToday(P) {
  const d = today();
  const w = latestWeight();
  const avg7 = avgWeight(d, 7);
  const mac = macrosOn(d);
  const fl = fluidTotal(d), fg = fluidGoal(d);
  const q = QUOTES[Math.floor(parseDate(d) / 86400000) % QUOTES.length];
  const started = d >= chainStart();
  return `
  <section class="card hero-card">
    <div class="row between"><h3>${fmtDate(d)}</h3><span class="chip">+${xpOn(d, P)} XP today</span></div>
    <div class="row between small"><b>Level ${P.level}</b><span class="muted">${P.intoLevel} / 100 XP</span></div>
    ${bar(P.intoLevel, 100, 'xp')}
    <div class="stats">
      <div class="stat"><b>${avg7 !== null ? round1(avg7) + ' kg' : w ? w.kg + ' kg' : '—'}</b><span>${avg7 !== null ? '7-day avg' : 'Weight'}</span></div>
      <div class="stat"><b>${Math.round(mac.kcal)}</b><span>kcal / ${S.settings.kcalGoal}</span></div>
      <div class="stat"><b>${Math.round(mac.p)} g</b><span>Protein / ${S.settings.proteinGoal}</span></div>
      <div class="stat"><b>${(fl / 1000).toFixed(1)} L</b><span>Fluids / ${(fg / 1000).toFixed(1)}</span></div>
    </div>
  </section>
  ${fastingCard()}
  <section class="card">
    <h2>Chains <span class="right">${started ? 'miss a day and it resets' : `start ${fmtDate(chainStart())}`}</span></h2>
    ${started ? CHAINS.map(chainRow).join('') : `<p>Your chains start on <b>${fmtDate(chainStart())}</b> (${daysBetween(d, chainStart())} day${daysBetween(d, chainStart()) === 1 ? '' : 's'} to go). No coffee comes first; then diet, training, the walk and planning.</p>
      <p class="muted small">Use these days to plan the first week and do a shop.</p>`}
  </section>
  ${started ? coffeeSupport() : ''}
  ${todaysPlanCard(d)}
  ${planTomorrowPrompt(d)}
  <section class="card">
    <h2>Daily quests</h2>
    ${questsFor(d).map((k) => questRow(d, k)).join('')}
    ${planKind(d) === 'rest' || planKind(d) === 'fast' ? `<p class="muted small">${planKind(d) === 'fast' ? 'Fast day' : 'Rest day'}: no training quest today.</p>` : ''}
  </section>
  <section class="card">
    <h2>Fluids <span class="right">${(fl / 1000).toFixed(2)} / ${(fg / 1000).toFixed(2)} L</span></h2>
    ${bar(fl, fg, fl >= fg ? 'good' : '')}
    <div class="grid4">${[250, 500, 750, 1000].map((ml) => `<button data-act="fluid-add" data-ml="${ml}">+${ml}</button>`).join('')}</div>
    ${S.days[d]?.walk ? `<p class="muted small">Walk day: target raised by ${S.settings.walkExtraMl} ml to replace sweat losses.</p>` : ''}
  </section>
  <section class="card">
    <h2>Stoic of the day</h2>
    <p class="quote">“${esc(q[0])}”</p>
    <p class="muted">— ${esc(q[1])}</p>
  </section>
  <section class="card">
    <h2>Daily rhythm</h2>
    <div class="rhythm">${rhythm().map(([t, l]) => `<b>${esc(t)}</b><span>${esc(l)}</span>`).join('')}</div>
  </section>
  ${storageOk ? '' : '<section class="card"><p class="danger">This browser is blocking storage (private mode?). Your data will not be saved.</p></section>'}`;
}

// ===========================================================================
// PLAN
// ===========================================================================
function foodOptions(slot, selected) {
  const lib = foodLibrary();
  const groups = [
    [`${slot} recipes`, lib.filter((x) => x.kind === 'recipe' && x.meal === slot)],
    ['Gironda & Dolce staples', lib.filter((x) => x.kind === 'staple')],
    ['My foods', lib.filter((x) => x.kind === 'mine')],
    ...MEAL_TYPES.filter((t) => t !== slot && t !== 'Dressing').map((t) => [`${t} recipes`, lib.filter((x) => x.kind === 'recipe' && x.meal === t)]),
  ].filter(([, xs]) => xs.length);
  return `<option value="">— Nothing planned —</option>${groups.map(([label, xs]) => `<optgroup label="${esc(label)}">${xs.map((x) => `<option value="${esc(x.id)}" ${x.id === selected ? 'selected' : ''}>${esc(x.name)} · ${Math.round(mealKcal(x))} kcal · P ${fmtNum(x.p)}</option>`).join('')}</optgroup>`).join('')}`;
}

function viewPlanTomorrow() {
  const t = today();
  const d = ui.planDate || addDays(t, 1);
  const p = S.plans[d] || {};
  const kind = p.kind || null;
  const mac = plannedMacros(d);
  const st = S.settings;
  const prog = activeProgram();
  const isTomorrow = d === addDays(t, 1);
  const ready = passed(t, win().to) || mealsOn(t).some((m) => m.slot === 'Dinner');
  return `
  ${dateNav('plan-date', d, { min: t })}
  ${isTomorrow && !p.madeAt ? `<section class="card slim"><p class="small">${ready ? 'Your eating window is closed: a good time to plan tomorrow.' : `Plan after your last meal (window closes ${esc(win().to)}). You can start now and finish later.`}</p></section>` : ''}
  <section class="card">
    <h2>Day type ${p.madeAt ? `<span class="right">${chip('saved ' + fmtTime(p.madeAt), 'good')}</span>` : ''}</h2>
    ${segmented('plan-kind', DAY_KINDS, kind, 'Day type', `data-date="${d}"`)}
    <p class="muted small">${kind === 'train' ? `Next session: <b>${esc(prog.name)} · ${esc(nextDay(prog).name)}</b>. Train in or just before your window (${esc(win().from)}–${esc(win().to)}).` : kind === 'fast' ? 'Fast day: no meals, water and electrolytes, walk only. Counts for the diet chain if nothing is logged.' : kind === 'rest' ? 'Rest day: recovery is when you grow. Training today would break the plan.' : 'Pick training, rest or fast.'}</p>
    <button class="check" role="checkbox" aria-checked="${p.walk !== false}" data-act="plan-walk" data-date="${d}"><span class="box" aria-hidden="true">${p.walk !== false ? '✓' : ''}</span><span>Morning walk ${WALK_WINDOW.from}–${WALK_WINDOW.to}</span></button>
  </section>
  <section class="card">
    <h2>Meals <span class="right">${esc(win().from)}–${esc(win().to)}</span></h2>
    ${kind === 'fast' ? '<p class="muted">Fast day: no meals planned.</p>' : `
    ${SLOTS.map((slot) => `<label class="field">${slot}<select data-plan="${d}|${slot}">${foodOptions(slot, p.meals?.[slot])}</select></label>`).join('')}
    <div class="macro"><span>Planned calories</span><b>${Math.round(mac.kcal)} / ${st.kcalGoal}</b></div>${bar(mac.kcal, st.kcalGoal, mac.kcal > st.kcalGoal ? 'over' : '')}
    <div class="macro"><span>Planned protein</span><b>${Math.round(mac.p)} / ${st.proteinGoal} g</b></div>${bar(mac.p, st.proteinGoal, mac.p >= st.proteinGoal ? 'good' : '')}
    <p class="muted small">Browse full recipe cards in Fuel → Recipes. Planned meals appear on Today as a checklist: tap one to log it.</p>`}
  </section>
  <section class="card">
    <h2>Top 3 for ${d === addDays(t, 1) ? 'tomorrow' : fmtDate(d)}</h2>
    ${[0, 1, 2].map((i) => `<input value="${esc(p.top?.[i] || '')}" placeholder="${['Most important thing', 'Second', 'Third'][i]}" maxlength="100" aria-label="Priority ${i + 1}" data-plantop="${d}|${i}">`).join('')}
  </section>
  <button class="primary" data-act="plan-save" data-date="${d}">${p.madeAt ? 'Update plan' : `Lock in the plan · +${QUEST_BASE} XP`}</button>`;
}

function viewPlanWeek() {
  const ws = ui.weekStart || planningWeek();
  ui.weekStart = ws;
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const saved = S.weekPlans[ws];
  const prog = activeProgram();
  return `
  <div class="row between datenav">
    <button class="icon" data-act="week-nav" data-dir="-7" aria-label="Previous week">‹</button>
    <span class="grow center"><b>Week of ${fmtDate(ws)}</b>${saved ? `<br>${chip('saved', 'good')}` : ''}</span>
    <button class="icon" data-act="week-nav" data-dir="7" aria-label="Next week">›</button>
  </div>
  <section class="card slim"><p class="small">A loose plan for the week, best done at the weekend: training days spaced for recovery, any fast days, and a batch-cook day. Tap to set each day; plan the details each evening.</p>
  <button data-act="week-suggest">Suggest training days · ${esc(prog.name)}</button></section>
  <section class="card"><div class="list">${days.map((d) => {
    const p = S.plans[d] || {};
    const warn = weekWarning(d);
    const meals = plannedMeals(d).length;
    return `<div class="weekday">
      <div class="row between"><b>${fmtDate(d)}</b><span class="muted small">${meals ? `${meals} meal${meals > 1 ? 's' : ''} planned` : ''}${p.madeAt ? ' · ✓ detailed' : ''}</span></div>
      ${segmented('week-kind', DAY_KINDS, p.kind || '', `Day type for ${fmtDate(d)}`, `data-date="${d}"`)}
      <div class="row wrap"><button class="small-btn pchip" data-act="week-batch" data-date="${d}" aria-pressed="${!!p.batch}">🍳 Batch cook</button>
      <button class="small-btn" data-act="plan-open" data-date="${d}">Meals & top 3 →</button></div>
      ${warn ? `<p class="small warn-text">⚠ ${esc(warn)}</p>` : ''}
    </div>`;
  }).join('')}</div></section>
  <section class="card slim"><p class="muted small">Fasting and Mentzer: schedule HIT sessions in or just before your eating window, not deep into a multi-day fast. Talk to your GP before fasting past 72 hours.</p></section>
  <button class="primary" data-act="week-save">${saved ? 'Update weekly plan' : `Save weekly plan · +${PTS.week} XP`}</button>`;
}

function shoppingItems(from, to) {
  const lines = new Map();
  const recipes = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const [, id] of plannedMeals(d)) {
      const f = findFood(id);
      recipes.push(f.name);
      for (const ing of f.ingredients || []) {
        const key = ing.toLowerCase();
        const cur = lines.get(key) || { text: ing, uses: {} };
        cur.uses[f.name] = (cur.uses[f.name] || 0) + 1;
        lines.set(key, cur);
      }
    }
  }
  return { items: [...lines.entries()].sort((a, b) => a[1].text.localeCompare(b[1].text)), recipes };
}

function viewPlanShop() {
  const from = today(), to = addDays(from, 6);
  const { items, recipes } = shoppingItems(from, to);
  const counts = recipes.reduce((m, n) => ((m[n] = (m[n] || 0) + 1), m), {});
  const done = items.filter(([k]) => S.shopping[k]).length;
  return `
  <section class="card">
    <h2>Shopping list <span class="right">${fmtDate(from)} – ${fmtDate(to)}</span></h2>
    ${recipes.length ? `<p class="small">From your planned meals: ${Object.entries(counts).map(([n, c]) => `${esc(n)}${c > 1 ? ` ×${c}` : ''}`).join(' · ')}</p>` : '<p class="muted">Plan some meals (Plan → Tomorrow, or a recipe\'s "Add to" menu) and their ingredients appear here.</p>'}
    ${items.length ? `${bar(done, items.length, done === items.length ? 'good' : '')}
    <div class="list">${items.map(([k, x]) => {
      const on = !!S.shopping[k];
      const mult = Object.entries(x.uses).map(([n, c]) => `${n}${c > 1 ? ` ×${c}` : ''}`).join(', ');
      return `<button class="check" role="checkbox" aria-checked="${on}" data-act="shop-tick" data-k="${esc(k)}"><span class="box" aria-hidden="true">${on ? '✓' : ''}</span><span class="grow ${on ? 'struck' : ''}">${esc(x.text)}<br><span class="muted small">${esc(mult)}</span></span></button>`;
    }).join('')}</div>
    <div class="grid2"><button data-act="shop-copy">Copy list</button><button class="ghost" data-act="shop-clear">Clear ticks</button></div>
    <p class="muted small">Quantities are per recipe as written; a ×2 means the recipe is planned twice.</p>` : ''}
  </section>`;
}

// ===========================================================================
// TRAIN
// ===========================================================================
function draftKey(pid, did) { return `${pid}|${did}`; }
function getDraft(pid, did) { return (ui.drafts[draftKey(pid, did)] ||= {}); }

function exerciseLogCard(prog, day, e, i) {
  const draft = getDraft(prog.id, day.id)[e.id] || {};
  const last = lastEntryFor(e.name);
  const hint = progressionHint(e, prog.family);
  const tech = techOf(e);
  const mode = logMode(e);
  const nSets = Math.max(1, Number(e.sets) || 1, mode === 'singles' ? tech.sets : 1);
  const ref = `${esc(prog.id)}|${esc(day.id)}|${esc(e.id)}`;
  const input = (s, field, ph, label, mode2 = 'numeric') => `<input inputmode="${mode2}" placeholder="${ph}" value="${esc(draft.sets?.[s]?.[field] ?? '')}" aria-label="${esc(e.name)} ${label}" data-draft="${ref}|${s}|${field}">`;
  const rows = Array.from({ length: nSets }, (_, s) => {
    const ls = last?.entry.sets[s] || last?.entry.sets[last.entry.sets.length - 1];
    const kg = input(s, 'kg', ls?.kg ?? 'kg', `set ${s + 1} kg`, 'decimal');
    if (mode === 'singles') return `<div class="setrow two"><span class="muted small">Rep ${s + 1}</span>${kg}<span class="muted">kg × 1</span></div>`;
    if (mode === 'hold') return `<div class="setrow"><span class="muted small">Hold</span>${kg}<span class="muted">kg ·</span>${input(s, 'hold', ls?.hold ?? 'sec', `set ${s + 1} seconds held`)}</div>`;
    const reps = input(s, 'reps', ls?.reps ?? 'reps', `set ${s + 1} reps`);
    if (mode === 'failhold') return `<div class="setrow three"><span class="muted small">Set</span>${kg}<span class="muted">×</span>${reps}<span class="muted">+</span>${input(s, 'hold', ls?.hold ?? 'sec', `set ${s + 1} hold seconds`)}</div>`;
    return `<div class="setrow"><span class="muted small">Set ${s + 1}</span>${kg}<span class="muted">kg ×</span>${reps}</div>`;
  }).join('');
  const prevSs = i > 0 && day.exercises[i - 1].ss;
  return `<div class="excard ${e.ss ? 'ss-start' : ''} ${prevSs ? 'ss-end' : ''}">
    <div class="row between wrap"><b>${esc(e.name)}</b><span class="muted small">${esc(e.sets)} × ${esc(e.reps)}</span></div>
    ${tech ? `<p class="small"><span class="chip tech">${esc(tech.name)}</span> ${esc(tech.summary)}</p>` : ''}
    ${e.note ? `<p class="muted small">${esc(e.note)}</p>` : ''}
    ${e.ss ? '<p class="small accent">Superset: go straight to the next exercise, no rest.</p>' : ''}
    ${last ? `<p class="muted small">${last.baseline ? 'Starting point' : 'Last'} (${fmtDate(last.date)}): ${last.entry.sets.filter((s) => s.kg != null || s.reps != null || s.hold != null).map(setText).join(', ')}</p>` : ''}
    ${hint ? `<p class="small good-text">▲ ${esc(hint)}</p>` : ''}
    ${mode === 'hold' ? `<p class="muted small">Target: ${esc(e.reps)}. Hold at full contraction, then lower slowly.</p>` : ''}
    ${rows}
    <div class="row wrap">
      ${mode === 'singles' ? '<button class="small-btn" data-act="rp-timer">10 s rest</button>' : ''}
      ${last ? `<button class="small-btn" data-act="copy-last" data-pid="${esc(prog.id)}" data-did="${esc(day.id)}" data-eid="${esc(e.id)}">Fill from last time</button>` : ''}
      <input class="grow" placeholder="Note (forced reps, negatives, feel…)" value="${esc(draft.note || '')}" aria-label="${esc(e.name)} note" data-draft="${ref}|note">
    </div>
  </div>`;
}

function exerciseEditRow(prog, day, e, i) {
  const base = `data-pid="${esc(prog.id)}" data-did="${esc(day.id)}" data-eid="${esc(e.id)}"`;
  return `<div class="excard edit">
    <label class="field">Exercise<input value="${esc(e.name)}" data-edit="name" ${base}></label>
    <div class="grid3">
      <label class="field">Sets<input inputmode="numeric" value="${esc(e.sets)}" data-edit="sets" ${base}></label>
      <label class="field">Reps / target<input value="${esc(e.reps)}" data-edit="reps" ${base}></label>
      <label class="field check-field"><span>Superset →</span><input type="checkbox" ${e.ss ? 'checked' : ''} data-edit="ss" ${base}></label>
    </div>
    <label class="field">Technique<select data-edit="tech" ${base}><option value="">Normal sets</option>${TECHNIQUES.map((t) => `<option value="${t.id}" ${e.tech === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
    <label class="field">Note<input value="${esc(e.note || '')}" data-edit="note" ${base}></label>
    <div class="row wrap">
      <button class="small-btn" data-act="ex-move" data-dir="-1" ${base} ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑ Up</button>
      <button class="small-btn" data-act="ex-move" data-dir="1" ${base} ${i === day.exercises.length - 1 ? 'disabled' : ''} aria-label="Move down">↓ Down</button>
      <button class="small-btn danger" data-act="ex-del" ${base}>Remove</button>
    </div>
  </div>`;
}

function techniqueCards() {
  return `<section class="card"><h2>Advanced techniques</h2>
    <p class="muted small">Tag an exercise with a technique in Edit exercises and the logger changes to match: singles for Rest-Pause, Omni-Contraction and Infitonic; seconds held for static holds.</p>
    ${TECHNIQUES.map((t) => `<details class="tech-card" ${ui.openTech === t.id ? 'open' : ''}><summary><b>${esc(t.name)}</b><br><span class="muted small">${esc(t.summary)}</span></summary>
      <ol class="small">${t.how.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      <p class="small accent">${esc(t.rules)}</p><p class="muted small">Source: ${esc(t.source)}</p></details>`).join('')}
  </section>`;
}

function viewTrain() {
  const fam = S.settings.family;
  const prog = activeProgram();
  const suggested = nextDay(prog);
  const day = prog.days.find((d) => d.id === ui.dayId) || suggested;
  const rec = recovery(prog);
  const done = workoutsOn(today());
  const groups = [...new Set(prog.days.map((d) => d.group || ''))];
  const dayButtons = groups.map((g) => `
    ${g ? `<p class="muted small grouplabel">${esc(g)}</p>` : ''}
    <div class="daychips">${prog.days.filter((d) => (d.group || '') === g).map((d) => `<button data-act="pick-day" data-v="${esc(d.id)}" aria-pressed="${d.id === day.id}">${esc(d.name)}${d.id === suggested.id ? ' <span class="nexttag">next</span>' : ''}</button>`).join('')}</div>`).join('');
  const hist = sessionsOf(prog.id).reverse().slice(0, 10);
  const tmpl = PROGRAM_TEMPLATES.find((t) => t.id === prog.template);
  const tier = TIERS.find(([k]) => k === S.settings.tier);
  const kind = planKind(today());
  const af = activeFast();
  return `
  ${segmented('family', [['cycle', '4-Week Cycle'], ['hit', 'Mentzer HIT']], fam, 'Training style')}
  ${fam === 'hit' ? `${segmented('tier', TIERS.map(([k, l]) => [k, l]), S.settings.tier, 'Mentzer level')}<p class="muted small tierdesc">${esc(tier[2])}</p>` : ''}
  <div class="chiprow">${programs(fam, fam === 'hit' ? S.settings.tier : null).map((p) => `<button class="pchip" data-act="pick-program" data-v="${esc(p.id)}" aria-pressed="${p.id === prog.id}">${esc(p.name)}</button>`).join('')}</div>
  ${done.length ? `<section class="card slim"><p>${chip('✓ Trained today', 'good')} <span class="muted small">${done.map((w) => esc(w.dayName)).join(', ')}</span></p></section>` : ''}
  ${!done.length && (kind === 'rest' || kind === 'fast') ? `<section class="card slim"><p>${chip(kind === 'fast' ? 'Fast day (planned)' : 'Rest day (planned)', 'warn')} <span class="muted small">Training today breaks the plan chain.</span></p></section>` : ''}
  ${af && fastHours(af) >= 24 ? `<section class="card slim"><p class="small warn-text">⚠ You are ${Math.floor(fastHours(af))} hours into a fast. HIT needs fuel: train after you break it, in your eating window.</p></section>` : ''}
  <section class="card">
    <div class="row between wrap"><h3>${esc(prog.name)}</h3>${rec ? chip(rec.text, rec.cls) : chip(`Cycle week ${Math.max(1, cycleWeek())}`)}</div>
    ${prog.about ? `<p class="muted small">${esc(prog.about)}</p>` : ''}
    ${prog.source ? `<p class="muted small">Source: ${esc(prog.source)}</p>` : ''}
    ${dayButtons}
    <div class="row between wrap"><h3 class="dayname">${esc(day.name)}</h3>
      <button class="small-btn" data-act="toggle-edit" aria-pressed="${ui.editProgram}">${ui.editProgram ? 'Done editing' : 'Edit exercises'}</button></div>
    ${ui.editProgram ? `
      <label class="field">Day name<input value="${esc(day.name)}" data-edit="dayname" data-pid="${esc(prog.id)}" data-did="${esc(day.id)}"></label>
      ${day.exercises.map((e, i) => exerciseEditRow(prog, day, e, i)).join('')}
      <div class="grid2">
        <button data-act="ex-add" data-pid="${esc(prog.id)}" data-did="${esc(day.id)}">+ Add exercise</button>
        <button data-act="day-add" data-pid="${esc(prog.id)}">+ Add day</button>
      </div>
      <div class="grid2">
        ${prog.days.length > 1 ? `<button class="danger" data-act="day-del" data-pid="${esc(prog.id)}" data-did="${esc(day.id)}">Delete this day</button>` : '<span></span>'}
        <button data-act="prog-copy" data-pid="${esc(prog.id)}">Save as new program</button>
      </div>
      ${tmpl ? `<button class="ghost" data-act="prog-reset" data-pid="${esc(prog.id)}">Reset to the original</button>` : `<button class="ghost danger" data-act="prog-del" data-pid="${esc(prog.id)}">Delete this program</button>`}
    ` : `
      ${day.exercises.map((e, i) => exerciseLogCard(prog, day, e, i)).join('')}
      <button class="primary" data-act="complete" data-pid="${esc(prog.id)}" data-did="${esc(day.id)}">Complete session · +${PTS.session} XP</button>
    `}
  </section>
  <section class="card">
    <h2>History · ${esc(prog.name)}</h2>
    ${hist.length ? `<div class="list">${hist.map((w) => `<div>
      <div class="row between"><button class="linkish grow" data-act="open-session" data-id="${esc(w.id)}"><b>${esc(w.dayName)}</b><br><span class="muted small">${fmtDate(w.date)} ${fmtTime(w.at)}${w.quick ? ' · quick' : ''}</span></button>
      <button class="icon ghost" data-act="del-workout" data-id="${esc(w.id)}" aria-label="Delete session">✕</button></div>
      ${ui.openSession === w.id ? `<div class="small muted">${(w.entries || []).map((e) => `${esc(e.name)}: ${e.sets.map(setText).join(', ')}${e.note ? ` (${esc(e.note)})` : ''}`).join('<br>') || 'No sets logged.'}</div>` : ''}
    </div>`).join('')}</div>` : `<p class="muted">No sessions logged for this program yet.${Object.keys(S.baselines).length ? ' Your last weights from before the reset show as starting points.' : ''}</p>`}
  </section>
  ${fam === 'hit' && S.settings.tier === 'advanced' ? techniqueCards() : ''}
  ${fam === 'hit' ? `<section class="card"><h2>Mentzer principles</h2><div class="list">${MENTZER_PRINCIPLES.map(([h, t]) => `<div><b>${h}</b><br><span class="muted small">${t}</span></div>`).join('')}</div></section>` : ''}`;
}

// ===========================================================================
// FUEL
// ===========================================================================
function viewFuelLog() {
  const d = ui.fuelDate || today();
  const meals = mealsOn(d);
  const mac = macrosOn(d);
  const st = S.settings;
  const diet = d >= chainStart() ? chainStatus(d, 'diet') : 'off';
  const quick = (id) => {
    const g = STAPLES.find((x) => x.id === id);
    return `<button class="small-btn" data-act="pick-food" data-id="${id}">${esc(g.name.split(':')[0])}</button>`;
  };
  return `
  ${dateNav('fuel-date', d, { max: today() })}
  <section class="card">
    <h2>Totals <span class="right">window ${esc(win().from)}–${esc(win().to)}</span></h2>
    <div class="macro"><span>Calories</span><b>${Math.round(mac.kcal)} / ${st.kcalGoal}</b></div>${bar(mac.kcal, st.kcalGoal, mac.kcal > st.kcalGoal ? 'over' : '')}
    <div class="macro"><span>Protein</span><b>${Math.round(mac.p)} / ${st.proteinGoal} g</b></div>${bar(mac.p, st.proteinGoal, mac.p >= st.proteinGoal ? 'good' : '')}
    <div class="macro"><span>Carbs</span><b>${Math.round(mac.c)} / ${st.carbGoal} g</b></div>${bar(mac.c, st.carbGoal, mac.c > st.carbGoal ? 'over' : '')}
    <div class="macro"><span>Fat</span><b>${Math.round(mac.f)} / ${st.fatGoal} g</b></div>${bar(mac.f, st.fatGoal, mac.f > st.fatGoal ? 'over' : '')}
    ${diet !== 'off' ? `<p class="small">${diet === 'done' ? chip('✓ Diet chain kept', 'good') : diet === 'miss' ? chip('Diet chain broken', 'bad') : chip('Diet chain: in progress')}${isFastDay(d) ? ' ' + chip('Fast day') : ''}</p>` : ''}
  </section>
  <div class="grid2">
    <button class="primary" data-act="food-picker">+ Add food</button>
    <button data-act="oneoff">+ One-off meal</button>
  </div>
  <div class="row wrap"><span class="muted small">Quick add:</span>${quick('gironda1')}${quick('gironda2')}
    ${!meals.length ? `<button class="small-btn" data-act="mark-fast" data-date="${d}" aria-pressed="${!!S.days[d]?.fast}">${S.days[d]?.fast ? '✓ Fast day' : 'Mark as fast day'}</button>` : ''}</div>
  <section class="card">
    <h2>Meals · ${d === today() ? 'today' : fmtDate(d)} <span class="right">${meals.length}</span></h2>
    ${meals.length ? `<div class="list">${meals.map((m) => {
      const t = mealTotals(m);
      const out = !inWindow(m.at);
      return `<div class="row between">
        <button class="linkish grow" data-act="edit-meal" data-id="${esc(m.id)}"><b>${esc(m.name)}</b>${m.servings !== 1 ? ` <span class="chip">×${fmtNum(m.servings)}</span>` : ''}${out ? ` ${chip('outside window', 'bad')}` : ''}<br><span class="muted small">${esc(m.slot || slotForTime(m.at))} · ${fmtTime(m.at)} · ${macroLine(t)}</span></button>
        <button class="icon ghost" data-act="del-meal" data-id="${esc(m.id)}" aria-label="Delete ${esc(m.name)}">✕</button></div>`;
    }).join('')}</div>` : '<p class="muted">Nothing logged for this day.</p>'}
    <button class="ghost" data-act="copy-yesterday" data-date="${d}">Copy meals from the day before</button>
    <p class="muted small">Tap a meal to change servings, macros, time or date.</p>
  </section>`;
}

function addToSelect(id) {
  return `<select class="addto" data-addto="${esc(id)}" aria-label="Add to a meal">
    <option value="">Add to…</option>
    <optgroup label="Log today">${LOG_SLOTS.map((s) => `<option value="log|${s}">Today · ${s}</option>`).join('')}</optgroup>
    <optgroup label="Plan tomorrow">${SLOTS.map((s) => `<option value="plan|${s}">Tomorrow · ${s}</option>`).join('')}</optgroup>
  </select>`;
}

const TAG_NAMES = { A: 'Athlete', H: 'Health', G: 'GF option', V: 'Vegan option' };
function recipeCard(rcp) {
  const open = ui.openRecipe === rcp.id;
  const prep = PREP[rcp.id];
  const checks = ui.ingChecks[rcp.id] || {};
  const time = prep ? prep[0] + prep[1] : null;
  return `<article class="rcard">
    <div class="rhead">
      <div class="row between wrap"><span class="chip meal-${esc((rcp.meal || '').toLowerCase())}">${esc(rcp.meal || 'Food')}</span>
        <span class="muted small">${time ? `⏱ ${time} min · ` : ''}${rcp.serves > 1 ? `serves ${rcp.serves}` : '1 serving'}</span></div>
      <h3>${esc(rcp.name)}</h3>
      ${rcp.tags ? `<div class="row wrap tags">${rcp.tags.split('').map((t) => `<span class="tag">${esc(TAG_NAMES[t] || t)}</span>`).join('')}</div>` : ''}
    </div>
    ${macroChips(rcp)}
    ${rcp.note ? `<p class="small accent">${esc(rcp.note)}</p>` : ''}
    <button class="ghost howto" data-act="open-recipe" data-id="${esc(rcp.id)}" aria-expanded="${open}">${open ? 'Hide method' : 'Ingredients & method'} ${open ? '▴' : '▾'}</button>
    ${open ? `<div class="rbody">
      ${rcp.ingredients?.length ? `<p class="rlabel">Ingredients${rcp.serves > 1 ? ` (makes ${rcp.serves})` : ''}</p>
      <div class="ings">${rcp.ingredients.map((x, i) => `<button class="check" role="checkbox" aria-checked="${!!checks[i]}" data-act="ing-tick" data-id="${esc(rcp.id)}" data-i="${i}"><span class="box" aria-hidden="true">${checks[i] ? '✓' : ''}</span><span class="${checks[i] ? 'struck' : ''}">${esc(x)}</span></button>`).join('')}</div>` : ''}
      ${prep ? `<p class="rlabel">Method <span class="muted small">· prep ${prep[0]} min${prep[1] ? ` · cook ${prep[1]} min` : ''}</span></p>
      <ol class="steps">${prep[2].map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      ${prep[3] ? `<p class="small tip">💡 ${esc(prep[3])}</p>` : ''}` : rcp.method ? `<p class="small">${esc(rcp.method)}</p>` : ''}
    </div>` : ''}
    <div class="row wrap rfoot">${addToSelect(rcp.id)}
      <button class="small-btn" data-act="pick-food" data-id="${esc(rcp.id)}">Servings…</button>
      ${rcp.mine ? `<button class="small-btn" data-act="edit-myfood" data-id="${esc(rcp.id)}">Edit</button>` : ''}</div>
  </article>`;
}

function filteredFoods() {
  const f = ui.recipeFilter, q = ui.recipeQuery.trim().toLowerCase();
  return foodLibrary().filter((x) => {
    if (f === 'Staples' && x.kind !== 'staple') return false;
    if (f === 'My foods' && x.kind !== 'mine') return false;
    if (MEAL_TYPES.includes(f) && x.meal !== f) return false;
    if (f === 'Cut-friendly' && !(x.p >= 25 && mealKcal(x) <= 450)) return false;
    if (f === 'All' && x.kind === 'staple') return false;
    return !q || x.name.toLowerCase().includes(q) || (x.ingredients || []).some((i) => i.toLowerCase().includes(q));
  });
}

function viewFuelRecipes() {
  const filters = ['All', 'Cut-friendly', 'Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dressing', 'Juice', 'Staples', 'My foods'];
  const list = filteredFoods();
  return `
  <section class="card">
    <label class="field" for="recipe-q">Search recipes and ingredients<input id="recipe-q" type="search" value="${esc(ui.recipeQuery)}" placeholder="e.g. chicken, salmon, oat" data-live="recipe-q"></label>
    <div class="chiprow">${filters.map((x) => `<button class="pchip" data-act="recipe-filter" data-v="${esc(x)}" aria-pressed="${ui.recipeFilter === x}">${esc(x)}</button>`).join('')}</div>
    <p class="muted small">Dolce Diet recipes from <i>Living Lean</i>. Macros are my per-serving estimates from the ingredients as written. Use <b>Add to…</b> to log a recipe now or put it in tomorrow's plan.</p>
  </section>
  <div class="rgrid">${list.map(recipeCard).join('') || '<section class="card"><p class="muted">No matches.</p></section>'}</div>
  <button data-act="new-myfood">+ Create my own food or recipe</button>`;
}

function viewFuelFluids() {
  const d = ui.fuelDate || today();
  const list = fluidsOn(d);
  const total = fluidTotal(d), goal = fluidGoal(d);
  const week = Array.from({ length: 7 }, (_, i) => addDays(d, i - 6));
  return `
  ${dateNav('fuel-date', d, { max: today() })}
  <section class="card">
    <h2>Fluids <span class="right">${(total / 1000).toFixed(2)} / ${(goal / 1000).toFixed(2)} L</span></h2>
    ${bar(total, goal, total >= goal ? 'good' : '')}
    ${segmented('fluid-type', FLUID_TYPES, ui.fluidType, 'Drink type')}
    <div class="grid4">${[250, 330, 500, 750].map((ml) => `<button data-act="fluid-add" data-ml="${ml}" data-date="${d}">+${ml} ml</button>`).join('')}</div>
    <form id="fluid-form" class="row" autocomplete="off"><input name="ml" inputmode="numeric" placeholder="Other amount (ml)" aria-label="Amount in ml"><button type="submit">Add</button></form>
    <p class="muted small">Target ${S.settings.fluidMl} ml, plus ${S.settings.walkExtraMl} ml on sweat-suit walk days. Add electrolytes after sweat-suit walks and on long fasts.</p>
  </section>
  <section class="card">
    <h2>Logged</h2>
    ${list.length ? `<div class="list">${list.map((f) => `<div class="row between"><span>${fmtTime(f.at)} · <b>${f.ml} ml</b> ${esc(FLUID_TYPES.find(([k]) => k === f.type)?.[1] || '')}</span><button class="icon ghost" data-act="del-fluid" data-id="${esc(f.id)}" aria-label="Delete">✕</button></div>`).join('')}</div>` : '<p class="muted">Nothing logged yet.</p>'}
  </section>
  <section class="card">
    <h2>Last 7 days</h2>
    <div class="list small">${week.map((x) => { const t = fluidTotal(x), g = fluidGoal(x); return `<div class="row between"><span>${fmtDate(x)}</span><span>${(t / 1000).toFixed(1)} L ${t >= g ? chip('goal', 'good') : ''}</span></div>`; }).join('')}</div>
  </section>`;
}

function viewFuelStack() {
  const list = [...S.compounds].sort((a, b) => b.at.localeCompare(a.at));
  const names = [...new Set(S.compounds.map((c) => c.name))].sort();
  const lastBy = names.map((n) => list.find((c) => c.name === n));
  return `
  <section class="card">
    <h2>Supplements & compounds</h2>
    <p class="muted small">A private log of what you take, when and how much. It records only what you enter: no XP and no dosing advice. Talk to a doctor about anything beyond basic supplements, especially injectables and peptides.</p>
    <button class="primary" data-act="compound-new">+ Log an item</button>
  </section>
  <section class="card">
    <h2>Stacks from your notebook</h2>
    ${STACK_PRESETS.map((p) => `<div class="stack">
      <div class="row between wrap"><b>${esc(p.name)}</b>${p.food?.kcal ? `<span class="muted small">≈${p.food.kcal} kcal</span>` : ''}</div>
      <p class="muted small">${p.items.map(([n, d, u]) => `${esc(n)}${d != null ? ` ${d} ${u}` : ''}`).join(' · ')}</p>
      <button class="small-btn" data-act="stack-log" data-id="${esc(p.id)}">Log this stack</button>
    </div>`).join('')}
    <p class="muted small">Calories from a stack count against your eating window.</p>
  </section>
  ${lastBy.length ? `<section class="card"><h2>Last taken</h2><div class="list small">${lastBy.map((c) => `<div class="row between"><span><b>${esc(c.name)}</b> ${c.dose != null ? `${fmtNum(c.dose)} ${esc(c.unit)}` : ''}</span><span class="muted">${daysBetween(c.date, today()) === 0 ? 'today' : `${daysBetween(c.date, today())} d ago`}</span></div>`).join('')}</div></section>` : ''}
  <section class="card">
    <h2>History</h2>
    ${list.length ? `<div class="list">${list.slice(0, 40).map((c) => `<div class="row between">
      <span class="grow"><b>${esc(c.name)}</b> ${c.dose != null ? `${fmtNum(c.dose)} ${esc(c.unit)}` : ''} <span class="chip">${esc(c.category)}</span><br>
      <span class="muted small">${fmtDate(c.date)} ${fmtTime(c.at)} · ${esc(c.route)}${c.site ? ` · ${esc(c.site)}` : ''}${c.notes ? ` · ${esc(c.notes)}` : ''}</span></span>
      <button class="icon ghost" data-act="del-compound" data-id="${esc(c.id)}" aria-label="Delete">✕</button></div>`).join('')}</div>` : '<p class="muted">Nothing logged yet.</p>'}
  </section>`;
}

// ===========================================================================
// BODY
// ===========================================================================
function avgWeight(endDate, days) {
  const from = addDays(endDate, -(days - 1));
  const xs = S.weights.filter((w) => w.date >= from && w.date <= endDate);
  return xs.length ? sum(xs, (w) => w.kg) / xs.length : null;
}

function viewBodyWeight() {
  const w = latestWeight();
  const { startWeight: start, target } = S.settings;
  const lost = w ? round1(start - w.kg) : null;
  const pct = w && start > target ? Math.max(0, Math.min(1, (start - w.kg) / (start - target))) : 0;
  const avg7 = avgWeight(today(), 7), avgPrev = avgWeight(addDays(today(), -7), 7);
  const rate = avg7 !== null && avgPrev !== null ? round1(avg7 - avgPrev) : null;
  const weights = [...S.weights].sort((a, b) => b.date.localeCompare(a.date));
  return `
  <section class="card">
    <h2>Weight</h2>
    <div class="stats">
      <div class="stat"><b>${start} kg</b><span>Start</span></div>
      <div class="stat"><b>${w ? w.kg + ' kg' : '—'}</b><span>Latest</span></div>
      <div class="stat"><b>${avg7 !== null ? round1(avg7) + ' kg' : '—'}</b><span>7-day average</span></div>
      <div class="stat"><b>${lost !== null ? lost + ' kg' : '—'}</b><span>Lost</span></div>
    </div>
    ${bar(pct * 100, 100)}
    <p class="muted small">${Math.round(pct * 100)}% of the way to ${target} kg. The 7-day average smooths out water swings from fasting and salt.${rate !== null ? ` Weekly change: ${rate > 0 ? '+' : ''}${rate} kg (${Math.abs(rate) > start * 0.01 ? 'fast: protect protein and strength' : rate > -0.2 ? 'slow' : 'on pace'}).` : ''}</p>
    <form id="weight-form" class="grid2" autocomplete="off">
      <label class="field">Weight (kg)<input name="kg" inputmode="decimal" required></label>
      <label class="field">Date<input name="date" type="date" value="${today()}" max="${today()}"></label>
      <button class="primary" style="grid-column:1/-1" type="submit">Log weight</button>
    </form>
    ${weights.length ? `<div class="list">${weights.slice(0, 14).map((x, i) => {
      const prev = weights[i + 1];
      const diff = prev ? round1(x.kg - prev.kg) : null;
      return `<div class="row between"><span>${fmtDate(x.date)}</span><span><b>${x.kg} kg</b> <span class="muted small">${diff === null ? '' : (diff > 0 ? '+' : '') + diff}</span></span>
        <button class="icon ghost" data-act="del-weight" data-date="${x.date}" aria-label="Delete weight for ${fmtDate(x.date)}">✕</button></div>`;
    }).join('')}</div>` : ''}
  </section>`;
}

// US Navy body-fat estimate (men), all in cm.
function navyBodyFat(m) {
  const h = S.settings.heightCm;
  if (!h || !m.waist || !m.neck || m.waist <= m.neck) return null;
  return round1(495 / (1.0324 - 0.19077 * Math.log10(m.waist - m.neck) + 0.15456 * Math.log10(h)) - 450);
}

function viewBodyMeasure() {
  const meas = [...S.measurements].sort((a, b) => b.date.localeCompare(a.date));
  const first = meas[meas.length - 1];
  const last = meas[0];
  const bf = last ? navyBodyFat(last) : null;
  return `
  <section class="card">
    <h2>Measurements (cm)</h2>
    ${last ? `<div class="stats">
      ${MEASURES.filter((m) => last[m] != null).map((m) => {
        const d = first && first !== last && first[m] != null ? round1(last[m] - first[m]) : null;
        return `<div class="stat"><b>${last[m]}</b><span>${m[0].toUpperCase() + m.slice(1)}${d !== null ? ` · ${d > 0 ? '+' : ''}${d}` : ''}</span></div>`;
      }).join('')}
      ${bf !== null ? `<div class="stat"><b>${bf}%</b><span>Body fat (Navy est.)</span></div>` : ''}
    </div>
    <p class="muted small">Changes are since your first entry (${fmtDate(first.date)}). ${S.settings.heightCm ? '' : 'Add your height in Body → Settings to get a body-fat estimate from waist and neck.'}</p>` : ''}
    <form id="meas-form" class="grid3" autocomplete="off">
      ${MEASURES.map((m) => `<label class="field">${m[0].toUpperCase() + m.slice(1)}<input name="${m}" inputmode="decimal" placeholder="${last?.[m] ?? ''}"></label>`).join('')}
      <label class="field" style="grid-column:1/-1">Date<input name="date" type="date" value="${today()}" max="${today()}"></label>
      <button class="primary" style="grid-column:1/-1" type="submit">Save measurements</button>
    </form>
    <p class="muted small">Measure weekly, same time of day, tape level and snug. Waist at the navel; neck below the Adam's apple.</p>
    ${meas.length ? `<div class="list">${meas.slice(0, 10).map((x) => `<div class="row between"><span class="grow"><b>${fmtDate(x.date)}</b><br><span class="muted small">${MEASURES.filter((m) => x[m] != null).map((m) => `${m} ${x[m]}`).join(' · ')}${navyBodyFat(x) !== null ? ` · ${navyBodyFat(x)}% BF` : ''}</span></span>
      <button class="icon ghost" data-act="del-meas" data-date="${x.date}" aria-label="Delete measurements">✕</button></div>`).join('')}</div>` : ''}
  </section>`;
}

function viewBodySleep() {
  const d = today();
  const existing = sleepOn(d);
  if (ui.sleepQuality === null) { ui.sleepQuality = existing?.quality ?? null; ui.sleepHours = existing?.hours ?? 7.5; }
  const hist = [...S.sleep].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
  const avg = hist.length ? round1(sum(hist.slice(0, 7), (s) => s.hours) / Math.min(7, hist.length)) : null;
  return `
  <section class="card">
    <h2>Last night ${existing ? '<span class="right">logged · edit</span>' : ''}</h2>
    <div class="row between"><span>Hours slept</span>
      <div class="stepper"><button class="icon" data-act="sleep-h" data-d="-0.5" aria-label="Less">−</button><output>${ui.sleepHours}</output><button class="icon" data-act="sleep-h" data-d="0.5" aria-label="More">+</button></div>
    </div>
    <div class="row between"><span>Quality (1–10)</span><span class="muted small">1 awful · 10 perfect</span></div>
    <div class="scale" role="radiogroup" aria-label="Sleep quality">
      ${Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `<button role="radio" aria-checked="${ui.sleepQuality === n}" aria-pressed="${ui.sleepQuality === n}" data-act="sleep-q" data-v="${n}">${n}</button>`).join('')}
    </div>
    <label class="field">Notes (optional)<textarea id="sleep-notes" maxlength="200">${esc(existing?.notes || '')}</textarea></label>
    <button class="primary" data-act="save-sleep" ${ui.sleepQuality ? '' : 'disabled'}>Save sleep · +${sleepPoints({ hours: ui.sleepHours, quality: ui.sleepQuality || 0 })} XP</button>
    <p class="muted small">Coming off coffee, sleep often improves within a week or two. Watch the 7-night average.</p>
  </section>
  <section class="card">
    <h2>Recent sleep ${avg !== null ? `<span class="right">7-night avg ${avg} h</span>` : ''}</h2>
    ${hist.length ? `<div class="list">${hist.map((s) => `<div class="row between"><span class="grow"><b>${fmtDate(s.date)}</b> · ${s.hours} h · quality ${s.quality}${s.notes ? `<br><span class="muted small">${esc(s.notes)}</span>` : ''}</span>
      <span class="chip ${s.hours >= 7.5 ? 'good' : s.hours >= 6.5 ? 'warn' : 'bad'}">+${sleepPoints(s)}</span></div>`).join('')}</div>` : '<p class="muted">No sleep logged yet.</p>'}
  </section>`;
}

function viewBodySettings() {
  const st = S.settings;
  const f = (name, label, val, mode = 'numeric') => `<label class="field">${label}<input name="${name}" inputmode="${mode}" value="${val ?? ''}"></label>`;
  const old = oldBackup();
  return `
  <section class="card">
    <h2>Eating window</h2>
    <div class="grid4">${WINDOW_PRESETS.map(([l, h]) => `<button data-act="win-preset" data-h="${h}" aria-pressed="${windowHours() === h}">${l}</button>`).join('')}</div>
    <form id="window-form" class="grid2" autocomplete="off">
      <label class="field">Opens<input name="from" type="time" value="${esc(st.window.from)}"></label>
      <label class="field">Closes<input name="to" type="time" value="${esc(st.window.to)}"></label>
      <button style="grid-column:1/-1" type="submit">Save window</button>
    </form>
    <p class="muted small">Presets keep your opening time and move the close. ${windowLabel()} = ${24 - windowHours()} hours fasting, ${windowHours()} eating.</p>
  </section>
  <section class="card">
    <h2>Targets</h2>
    <form id="settings-form" class="grid2" autocomplete="off">
      ${f('kcalGoal', 'Calories (kcal)', st.kcalGoal)}
      ${f('proteinGoal', 'Protein (g)', st.proteinGoal)}
      ${f('carbGoal', 'Carbs (g)', st.carbGoal)}
      ${f('fatGoal', 'Fat (g)', st.fatGoal)}
      ${f('fluidMl', 'Fluids (ml)', st.fluidMl)}
      ${f('walkExtraMl', 'Extra on walk days (ml)', st.walkExtraMl)}
      ${f('startWeight', 'Start weight (kg)', st.startWeight, 'decimal')}
      ${f('target', 'Target weight (kg)', st.target, 'decimal')}
      ${f('heightCm', 'Height (cm)', st.heightCm, 'decimal')}
      <label class="field">4-week cycle start<input name="cycleStart" type="date" value="${esc(st.cycleStart)}"></label>
      <label class="field" style="grid-column:1/-1">Chains start<input name="chainStart" type="date" value="${esc(st.chainStart)}"></label>
      <button class="primary" style="grid-column:1/-1" type="submit">Save targets</button>
    </form>
    <p class="muted small">The diet chain needs every meal inside the window and calories at or under target.</p>
  </section>
  <section class="card">
    <h2>Display & data</h2>
    <button data-act="contrast">${st.highContrast ? 'High contrast: ON' : 'High contrast: OFF'}</button>
    <div class="grid2">
      <button data-act="copy-backup">Copy backup</button>
      <button data-act="export">Download backup</button>
    </div>
    <label class="field" for="restore-text">Restore: paste a backup here<textarea id="restore-text" placeholder="Paste backup text, then tap Restore"></textarea></label>
    <div class="grid2">
      <button data-act="restore-paste">Restore pasted backup</button>
      <label class="btn">Restore from file<input type="file" accept="application/json" id="import" class="sr"></label>
    </div>
    <p class="muted small">Data is stored only on this device. Copy a backup now and then and keep it somewhere safe. Clearing browser data deletes it.</p>
    ${old ? `<div class="subcard"><p class="small"><b>Your data from before version 3</b> is kept aside on this device.</p>
      <div class="grid2"><button data-act="copy-old">Copy old data</button><button class="ghost danger" data-act="del-old">Delete old data</button></div></div>` : ''}
    <button class="ghost danger" data-act="reset-all">Reset all data…</button>
  </section>`;
}

// ===========================================================================
// HERO
// ===========================================================================
function viewHeroCharacter(P) {
  const recent = P.events.filter((e) => e.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  return `
  <section class="card">
    <div class="row between"><h3>Level ${P.level}</h3><span class="muted">${P.total} XP</span></div>
    ${bar(P.intoLevel, 100, 'xp')}
    <p class="muted small">${100 - P.intoLevel} XP to level ${P.level + 1}</p>
  </section>
  <section class="card">
    <h2>Stats</h2>
    ${STATS.map(([k, name, desc]) => {
      const xp = P.stats[k] || 0;
      const lvl = Math.floor(xp / STAT_LEVEL_XP) + 1;
      return `<div class="statrow"><div class="row between"><b>${k} · ${name}</b><b class="nowrap">Lv ${lvl}</b></div>${bar(xp % STAT_LEVEL_XP, STAT_LEVEL_XP)}<span class="muted small">${desc} · ${xp} XP</span></div>`;
    }).join('')}
  </section>
  <section class="card">
    <h2>Achievements <span class="right">${Object.keys(P.unlocked).length}/${ACHIEVEMENTS.length} · +${PTS.ach} each</span></h2>
    <div class="ach">${ACHIEVEMENTS.map(([id, name, desc]) => `<div class="${P.unlocked[id] ? '' : 'locked'}"><b>${P.unlocked[id] ? '★' : '☆'} ${name}</b><span class="muted small">${desc}</span></div>`).join('')}</div>
  </section>
  <section class="card">
    <h2>How XP works</h2>
    <div class="list small">
      <div>Chains, per day kept: ${CHAINS.map((c) => `${c.name} +${c.pts}`).join(' · ')}</div>
      <div>Daily quests +${QUEST_BASE} · morning walk +${QUEST_BONUS} more between ${WALK_WINDOW.from} and ${WALK_WINDOW.to}</div>
      <div>Training session +${PTS.session} · personal record +${PTS.pr}</div>
      <div>Extended fast +${PTS.fastDay} per full 24 hours</div>
      <div>Sleep up to +15 · weigh-in +${PTS.weigh} · measurements +${PTS.measure}</div>
      <div>Weekly plan +${PTS.week} · weekly review +${PTS.review} · goal milestone +${PTS.milestone} · goal complete +${PTS.goal}</div>
      <div>New level every 100 XP. Each stat levels up every ${STAT_LEVEL_XP} XP.</div>
    </div>
  </section>
  <section class="card">
    <h2>Recent XP</h2>
    ${recent.length ? `<div class="list small">${recent.map((e) => `<div class="row between"><span>${esc(e.label)} <span class="muted">· ${fmtDate(e.date)}</span></span><b>+${e.pts}</b></div>`).join('')}</div>` : '<p class="muted">Complete a quest to earn your first XP.</p>'}
  </section>`;
}

function goalCard(g) {
  const done = goalDone(g);
  const n = g.milestones.length, k = g.milestones.filter(milestoneDone).length;
  return `<section class="card goal ${done ? 'goal-done' : ''}">
    <div class="row between wrap"><span class="chip">${esc(g.area)}</span>${done ? chip('Complete', 'good') : n ? chip(`${k}/${n}`) : ''}</div>
    <div class="row between"><h3>${esc(g.title)}</h3><button class="small-btn" data-act="goal-edit" data-id="${esc(g.id)}">Edit</button></div>
    ${g.why ? `<p class="muted small">${esc(g.why)}</p>` : ''}
    ${g.deadline ? `<p class="muted small">By ${fmtDate(g.deadline)}</p>` : ''}
    ${n ? bar(k, n, done ? 'good' : '') : ''}
    <div class="list">${g.milestones.map((m) => {
      const on = milestoneDone(m);
      const auto = !m.doneAt && metricMet(m.metric);
      return `<div class="row between"><button class="check grow" role="checkbox" aria-checked="${on}" data-act="milestone" data-gid="${esc(g.id)}" data-mid="${esc(m.id)}">
        <span class="box" aria-hidden="true">${on ? '✓' : ''}</span><span>${esc(m.text)}</span>${auto ? '<span class="auto muted small">auto</span>' : ''}</button>
        <button class="icon ghost" data-act="milestone-del" data-gid="${esc(g.id)}" data-mid="${esc(m.id)}" aria-label="Delete milestone">✕</button></div>`;
    }).join('')}</div>
    <form class="row milestone-form" data-gid="${esc(g.id)}" autocomplete="off"><input name="text" placeholder="Add a milestone" aria-label="New milestone for ${esc(g.title)}" maxlength="100"><button type="submit">Add</button></form>
    ${!n ? `<button class="ghost" data-act="goal-done" data-id="${esc(g.id)}">${g.doneAt ? 'Mark not complete' : 'Mark goal complete'}</button>` : ''}
  </section>`;
}

function viewHeroGoals() {
  const main = S.goals.filter((g) => g.main);
  const side = S.goals.filter((g) => !g.main);
  const areas = [...new Set(side.map((g) => g.area))];
  return `
  <section class="card slim"><p class="muted small">Main quests drive your level. Side quests track the rest of life; milestones anywhere earn +${PTS.milestone} XP. Weight, session, chain and journal milestones tick themselves.</p>
  <button data-act="goal-new">+ New goal</button></section>
  <h2 class="section-h">Main quests</h2>
  ${main.map(goalCard).join('')}
  <h2 class="section-h">Side quests</h2>
  ${areas.map((a) => `<p class="muted small grouplabel">${esc(a)}</p>${side.filter((g) => g.area === a).map(goalCard).join('')}`).join('')}`;
}

function weekSummary(ws) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => d <= today());
  const sessions = S.workouts.filter((w) => w.date >= ws && w.date <= addDays(ws, 6)).length;
  const kept = (id) => days.filter((d) => chainStatus(d, id) === 'done').length;
  const sl = S.sleep.filter((s) => s.date >= ws && s.date <= addDays(ws, 6));
  const avgW = avgWeight(addDays(ws, 6), 7), prevW = avgWeight(addDays(ws, -1), 7);
  return { days: days.length, sessions, coffee: kept('coffee'), diet: kept('diet'), sleep: sl.length ? round1(sum(sl, (s) => s.hours) / sl.length) : null, change: avgW !== null && prevW !== null ? round1(avgW - prevW) : null };
}

function viewHeroJournal() {
  const d = today();
  const j = S.journal[d] || {};
  const ws = weekStart(d);
  const rv = S.reviews[ws] || {};
  const sm = weekSummary(ws);
  const past = Object.keys(S.journal).filter((x) => x !== d).sort().reverse().slice(0, 7);
  return `
  <section class="card">
    <h2>Gratitude journal · ${fmtDate(d)}</h2>
    <form id="reflect-form" class="grid1" autocomplete="off">
      ${REFLECTION_QUESTIONS.map(([k, q]) => `<label class="field">${q}<textarea name="${k}" rows="2" maxlength="600">${esc(j[k] || '')}</textarea></label>`).join('')}
      <button class="primary" type="submit">${j.at ? 'Update entry' : `Save entry · +${QUEST_BASE} XP`}</button>
    </form>
  </section>
  <section class="card">
    <h2>Weekly review · week of ${fmtDate(ws)}</h2>
    <div class="stats">
      <div class="stat"><b>${sm.coffee}/${sm.days}</b><span>Coffee-free</span></div>
      <div class="stat"><b>${sm.diet}/${sm.days}</b><span>Diet dialled in</span></div>
      <div class="stat"><b>${sm.sessions}</b><span>Sessions</span></div>
      <div class="stat"><b>${sm.sleep ?? '—'}</b><span>Avg sleep (h)</span></div>
      <div class="stat"><b>${sm.change === null ? '—' : (sm.change > 0 ? '+' : '') + sm.change}</b><span>Weight vs last week</span></div>
    </div>
    <form id="review-form" class="grid1" autocomplete="off">
      <label class="field">What worked this week?<textarea name="wins" rows="2" maxlength="600">${esc(rv.wins || '')}</textarea></label>
      <label class="field">What will you change next week?<textarea name="change" rows="2" maxlength="600">${esc(rv.change || '')}</textarea></label>
      <button type="submit">${rv.date ? 'Update review' : `Save review · +${PTS.review} XP`}</button>
    </form>
    <p class="muted small">Then plan next week in Plan → Week.</p>
  </section>
  <section class="card">
    <h2>Self-authoring</h2>
    <p class="muted small">Write it down and read it on hard days. Each section earns +${PTS.author} XP once.</p>
    ${AUTHOR_PROMPTS.map(([k, title, prompt]) => `<label class="field"><b>${title}</b><span class="muted small">${prompt}</span><textarea rows="4" maxlength="3000" data-author="${k}">${esc(S.author[k] || '')}</textarea></label>`).join('')}
    <p class="muted small">Saves automatically when you leave a box.</p>
  </section>
  ${past.length ? `<section class="card"><h2>Recent entries</h2><div class="list small">${past.map((x) => `<div><b>${fmtDate(x)}</b>${REFLECTION_QUESTIONS.filter(([k]) => S.journal[x][k]).map(([k, q]) => `<br><span class="muted">${q}</span> ${esc(S.journal[x][k])}`).join('')}</div>`).join('')}</div></section>` : ''}`;
}

function viewHeroCalendar() {
  const t = today();
  const cs = chainStart();
  const d = ui.calDate || (t < cs ? cs : t);
  ui.calDate = d;
  const sel = ui.calChain;
  const first = parseDate(d.slice(0, 8) + '01');
  const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < (first.getDay() + 6) % 7; i++) cells.push('<span></span>');
  for (let i = 1; i <= dim; i++) {
    const ds = `${d.slice(0, 8)}${pad(i)}`;
    const off = ds < cs || ds > t;
    let mark = '&nbsp;', cls = '';
    if (!off) {
      if (sel === 'all') { const n = CHAINS.filter((c) => chainStatus(ds, c.id) === 'done').length; mark = n || '&nbsp;'; cls = n === CHAINS.length ? 'streak' : ''; }
      else { const s = chainStatus(ds, sel); mark = STATUS_ICON[s] || '·'; cls = s === 'done' ? 'streak' : s === 'miss' ? 'missday' : ''; }
    }
    cells.push(`<button class="${ds === d ? 'sel' : ''} ${off ? 'off' : ''} ${cls}" data-act="cal-date" data-date="${ds}" aria-label="${fmtDate(ds)}">${i}<span class="dots">${mark}</span></button>`);
  }
  const before = d < cs || d > t;
  const o = S.days[d]?.chains || {};
  return `
  <div class="chiprow">${[['all', 'All chains'], ...CHAINS.map((c) => [c.id, c.name])].map(([k, l]) => `<button class="pchip" data-act="cal-chain" data-v="${k}" aria-pressed="${sel === k}">${esc(l)}</button>`).join('')}</div>
  <section class="card">
    <h2>Streaks</h2>
    <div class="list">${CHAINS.map((c) => { const st = chainStreak(c.id); return `<div class="row between"><span><b>${c.name}</b><br><span class="muted small">${st.days} days kept in total</span></span><span class="nowrap"><span class="flame ${st.cur ? 'lit' : ''}">${st.cur}</span> <span class="muted small">best ${st.best}</span></span></div>`; }).join('')}</div>
  </section>
  <section class="card">
    <h2>${MON[first.getMonth()]} ${first.getFullYear()}</h2>
    <div class="cal">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x) => `<span class="dow">${x}</span>`).join('')}${cells.join('')}</div>
    <p class="muted small">${sel === 'all' ? `Numbers = chains kept that day. Green = all ${CHAINS.length}.` : '✓ kept · ✕ broken.'} Chains started ${fmtDate(cs)}.</p>
  </section>
  <section class="card">
    ${dateNav('cal-nav', d)}
    ${before ? `<p class="muted">${d > t ? 'This day hasn\'t happened yet.' : `Chains start on ${fmtDate(cs)}.`}</p>` : `<div class="list">${CHAINS.map((c) => {
      const s = chainStatus(d, c.id);
      const cur = o[c.id] === true ? 'yes' : o[c.id] === false ? 'no' : 'auto';
      return `<div><div class="row between"><b>${STATUS_ICON[s] ? `<span class="st ${s}">${STATUS_ICON[s]}</span> ` : ''}${c.name}</b><span class="muted small">${s === 'pending' ? 'in progress' : s === 'done' ? 'kept' : 'broken'}</span></div>
        ${segmented('chain-set', [['auto', c.id === 'coffee' ? 'Not set' : 'Auto'], ['yes', 'Kept'], ['no', 'Broken']], cur, `${c.name} on ${fmtDate(d)}`, `data-date="${d}" data-chain="${c.id}"`)}</div>`;
    }).join('')}</div>
    <p class="muted small">Chains check themselves from your logs (except coffee). Correct a day here if a log was missed.</p>`}
  </section>`;
}

// ===========================================================================
// Sheets (bottom panels for forms and confirmations)
// ===========================================================================
function closeSheet() {
  document.querySelector('.sheet-wrap')?.remove();
  if (S.notice) { S.notice = null; save(); }
}
function openSheet(title, html) {
  document.querySelector('.sheet-wrap')?.remove();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="row between"><h3>${esc(title)}</h3><button class="icon ghost" data-act="sheet-close" aria-label="Close">✕</button></div>
    <div class="sheet-body">${html}</div></div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeSheet(); });
  document.body.appendChild(wrap);
  wrap.querySelector('input:not([type=hidden]),textarea,select,button:not([data-act=sheet-close])')?.focus();
}

let askYes = null, askAlt = null;
function ask(message, yesLabel, onYes, alt) {
  askYes = onYes; askAlt = alt || null;
  openSheet('Confirm', `<p class="ask-text">${esc(message)}</p><div class="ask-btns">
    <button type="button" data-act="sheet-close">Cancel</button>
    ${alt ? `<button type="button" data-act="ask-alt">${esc(alt.label)}</button>` : ''}
    <button type="button" class="primary" data-act="ask-yes">${esc(yesLabel)}</button></div>`);
}

const slotSelect = (id, selected) => `<label class="field">Meal<select id="${id}" name="slot">${LOG_SLOTS.map((s) => `<option ${s === selected ? 'selected' : ''}>${s}</option>`).join('')}</select></label>`;

function mealForm(id, m, extra = '') {
  return `<form id="${id}" class="grid2" autocomplete="off">
    <label class="field" style="grid-column:1/-1">Name<input name="name" required maxlength="80" value="${esc(m.name || '')}"></label>
    ${slotSelect(`${id}-slot`, m.slot || slotForTime(m.at || new Date().toISOString()))}
    <label class="field">Servings<input name="servings" inputmode="decimal" value="${fmtNum(m.servings ?? 1)}"></label>
    <label class="field">kcal per serving<input name="kcal" inputmode="decimal" value="${m.kcal ?? ''}" placeholder="auto from macros"></label>
    <label class="field">Protein (g)<input name="p" inputmode="decimal" value="${m.p ?? ''}"></label>
    <label class="field">Carbs (g)<input name="c" inputmode="decimal" value="${m.c ?? ''}"></label>
    <label class="field">Fat (g)<input name="f" inputmode="decimal" value="${m.f ?? ''}"></label>
    <label class="field">Time<input name="time" type="time" value="${m.at ? fmtTime(m.at) : fmtTime(new Date().toISOString())}"></label>
    <label class="field">Date<input name="date" type="date" value="${esc(m.date || ui.fuelDate || today())}"></label>
    ${extra}
    <button class="primary" style="grid-column:1/-1" type="submit">Save</button>
  </form>`;
}

function openFoodPicker() {
  const list = foodLibrary();
  openSheet('Add food', `
    ${slotSelect('picker-slot', slotForTime(new Date().toISOString()))}
    <label class="field" for="picker-q">Search<input id="picker-q" type="search" placeholder="Name or ingredient" data-live="picker-q"></label>
    <div class="list picker-list">${list.map((x) => `<button class="linkish pick" data-act="pick-food" data-id="${esc(x.id)}" data-name="${esc((x.name + ' ' + (x.ingredients || []).join(' ')).toLowerCase())}">
      <b>${esc(x.name)}</b><br><span class="muted small">${esc(x.meal || '')} · ${macroLine({ ...x, kcal: mealKcal(x) })} per serving</span></button>`).join('')}</div>`);
}

function openServings(food, slot) {
  openSheet(food.name, `
    <p class="muted small">Per serving: ${macroLine({ ...food, kcal: mealKcal(food) })}${food.serves > 1 ? ` · recipe makes ${food.serves}` : ''}</p>
    ${slotSelect('serv-slot', slot || slotForTime(new Date().toISOString()))}
    <div class="grid4">${[0.5, 1, 1.5, 2].map((k) => `<button data-act="log-food" data-id="${esc(food.id)}" data-servings="${k}">×${k}</button>`).join('')}</div>
    <form id="servings-form" class="row" data-id="${esc(food.id)}" autocomplete="off"><input name="servings" inputmode="decimal" placeholder="Other amount (servings)" aria-label="Servings"><button type="submit">Log</button></form>
    ${food.serves > 1 ? `<button class="ghost" data-act="log-food" data-id="${esc(food.id)}" data-servings="${food.serves}">Whole recipe (×${food.serves})</button>` : ''}`);
}

function openCompoundForm(prefill = {}) {
  const names = [...new Set(S.compounds.map((c) => c.name))];
  openSheet('Log an item', `<form id="compound-form" class="grid2" autocomplete="off">
    <label class="field" style="grid-column:1/-1">Name<input name="name" required maxlength="60" list="compound-names" value="${esc(prefill.name || '')}"></label>
    <datalist id="compound-names">${names.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
    <label class="field">Category<select name="category">${COMPOUND_CATS.map((c) => `<option ${prefill.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="field">Route<select name="route">${ROUTES.map((c) => `<option ${prefill.route === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="field">Dose<input name="dose" inputmode="decimal" value="${prefill.dose ?? ''}"></label>
    <label class="field">Unit<select name="unit">${UNITS.map((u) => `<option ${prefill.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
    <label class="field">Site (optional)<input name="site" maxlength="40" placeholder="e.g. left abdomen"></label>
    <label class="field">Time<input name="time" type="time" value="${fmtTime(new Date().toISOString())}"></label>
    <label class="field" style="grid-column:1/-1">Notes<input name="notes" maxlength="120"></label>
    <label class="field" style="grid-column:1/-1">Date<input name="date" type="date" value="${today()}"></label>
    <button class="primary" style="grid-column:1/-1" type="submit">Save</button>
  </form>`);
}

function openGoalForm(g) {
  const areas = [...new Set(S.goals.map((x) => x.area))];
  openSheet(g ? 'Edit goal' : 'New goal', `<form id="goal-form" class="grid1" data-id="${esc(g?.id || '')}" autocomplete="off">
    <label class="field">Goal<input name="title" required maxlength="80" value="${esc(g?.title || '')}"></label>
    <label class="field">Area<input name="area" list="goal-areas" maxlength="40" value="${esc(g?.area || 'Health & Wellness')}"></label>
    <datalist id="goal-areas">${areas.map((a) => `<option value="${esc(a)}"></option>`).join('')}</datalist>
    <label class="field">Why it matters<textarea name="why" rows="2" maxlength="300">${esc(g?.why || '')}</textarea></label>
    <label class="field">Target date (optional)<input name="deadline" type="date" value="${esc(g?.deadline || '')}"></label>
    <label class="field check-field"><span>Main quest (fitness focus)</span><input name="main" type="checkbox" ${g?.main ? 'checked' : ''}></label>
    <button class="primary" type="submit">Save goal</button>
    ${g ? `<button type="button" class="ghost danger" data-act="goal-del" data-id="${esc(g.id)}">Delete goal</button>` : ''}
  </form>`);
}

function openFastStart() {
  const last = lastMealBefore(new Date());
  openSheet('Start an extended fast', `<form id="fast-form" class="grid1" autocomplete="off">
    <p class="small">Your usual ${windowLabel()} fast runs every day on its own. This is for going longer, such as 24, 36, 48 or 72 hours.</p>
    <label class="field">Goal
      <select name="goalH">${[24, 36, 48, 72].map((h) => `<option value="${h}" ${h === 36 ? 'selected' : ''}>${h} hours</option>`).join('')}</select></label>
    <label class="field">Started
      <select name="from">${last ? `<option value="last">At my last meal (${fmtDate(last.date)} ${fmtTime(last.at)})</option>` : ''}<option value="now">Now</option></select></label>
    <ul class="small">${FAST_SAFETY.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <button class="primary" type="submit">Start fast</button>
  </form>`);
}

function showWelcome() {
  openSheet('Welcome to Trainer 3', `
    <p>A clean start for ${fmtDate(chainStart())}. Everything was wiped except <b>the last weight and reps for each exercise</b>, which now show as starting points in Train.</p>
    <ul class="small">
      <li><b>Chains:</b> no coffee first, then diet, training, the walk and planning. Miss a day and a chain resets.</li>
      <li><b>Eating window</b> ${esc(win().from)}–${esc(win().to)} (${windowLabel()}) with a fasting timer, plus extended fasts.</li>
      <li><b>Plan:</b> tomorrow after your last meal, and the week over the weekend. Shopping list included.</li>
      <li><b>Recipes</b> as cards with step-by-step methods and an Add to… menu.</li>
      <li><b>Mentzer</b> split into Beginner, Intermediate and Advanced, with Rest-Pause, Omni-Contraction and static holds.</li>
    </ul>
    <p class="muted small">Your old data is kept aside on this phone: Body → Settings → Copy old data.</p>
    <button class="primary" data-act="sheet-close">Let's go</button>`);
}

// ===========================================================================
// Render
// ===========================================================================
const ICONS = {
  today: '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  plan: '<path d="M9 5h11M9 12h11M9 19h11M4 5l1 1 2-2M4 12l1 1 2-2M4 19l1 1 2-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  train: '<path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  fuel: '<path d="M7 3v8a3 3 0 0 0 3 3v7M7 3v5M10 3v5M17 3c-2 2-2 6 0 8v10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  body: '<path d="M4 18l5-5 4 3 7-8M15 8h5v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  hero: '<path d="M12 3l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.4 6.7 19.3l1.1-5.9L3.4 9.3l6-.8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
};

function viewFor(P) {
  switch (ui.tab) {
    case 'today': return viewToday(P);
    case 'plan': return { tomorrow: viewPlanTomorrow, week: viewPlanWeek, shop: viewPlanShop }[ui.sub.plan]();
    case 'train': return viewTrain();
    case 'fuel': return { log: viewFuelLog, recipes: viewFuelRecipes, fluids: viewFuelFluids, stack: viewFuelStack }[ui.sub.fuel]();
    case 'body': return { weight: viewBodyWeight, measure: viewBodyMeasure, sleep: viewBodySleep, settings: viewBodySettings }[ui.sub.body]();
    case 'hero': return { character: () => viewHeroCharacter(P), goals: viewHeroGoals, journal: viewHeroJournal, calendar: viewHeroCalendar }[ui.sub.hero]();
  }
  return '';
}

let toastTimer, lastToast = { text: '', at: 0 };
function toast(msg) {
  // Messages that arrive together (e.g. "session complete" + an achievement) are shown together.
  if (Date.now() - lastToast.at < 600 && lastToast.text && !lastToast.text.includes(msg)) msg = `${lastToast.text} · ${msg}`;
  lastToast = { text: msg, at: Date.now() };
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3000);
}

function celebrate(P) {
  const msgs = [];
  if (P.level > S.seen.level) msgs.push(`Level up! You reached level ${P.level}`);
  for (const [id, name] of ACHIEVEMENTS) if (P.unlocked[id] && !S.seen.ach[id]) msgs.push(`Achievement: ${name} (+${PTS.ach})`);
  S.seen.level = P.level;
  S.seen.ach = { ...P.unlocked };
  if (msgs.length) { save(); toast(msgs.join(' · ')); }
}

let lastWindowState = null;
function render(opts = {}) {
  chainMemo = null;
  const P = computeXP();
  lastWindowState = windowStatus().state + (activeFast() ? 'F' : '');
  document.documentElement.dataset.contrast = S.settings.highContrast ? 'high' : 'normal';
  const themeMeta = document.querySelector('meta[name=theme-color]');
  if (themeMeta) themeMeta.content = S.settings.highContrast ? '#000000' : '#121211';
  document.getElementById('contrast-btn').setAttribute('aria-pressed', String(S.settings.highContrast));
  document.getElementById('lvl-pill').textContent = `Lv ${P.level} · ${P.total} XP`;
  document.getElementById('title').textContent = ui.tab === 'today' ? 'Trainer' : TABS.find(([k]) => k === ui.tab)[1];
  const subs = SUBTABS[ui.tab];
  document.getElementById('view').innerHTML =
    (subs ? `<div class="subtabs">${segmented('sub', subs, ui.sub[ui.tab], 'Section')}</div>` : '') + viewFor(P);
  document.getElementById('nav').innerHTML = TABS.map(([k, label]) =>
    `<button data-tab="${k}" ${ui.tab === k ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg><span>${label}</span></button>`).join('');
  if (opts.scrollTop) window.scrollTo(0, 0);
  rememberUi();
  celebrate(P);
}

function commit(opts) { save(); render(opts); }

// Live timers: update the text in place; re-render only when the window opens or closes.
function tick() {
  const now = Date.now();
  document.querySelectorAll('[data-since]').forEach((el) => { el.textContent = fmtDur(now - new Date(el.dataset.since)); });
  document.querySelectorAll('[data-until]').forEach((el) => { el.textContent = fmtDur(new Date(el.dataset.until) - now); });
  const state = windowStatus().state + (activeFast() ? 'F' : '');
  const busy = document.querySelector('.sheet-wrap') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (state !== lastWindowState && !busy) render();
}

// ===========================================================================
// Actions
// ===========================================================================
function addMealFromFood(food, servings, date, slot) {
  const d = date || ui.fuelDate || today();
  const at = nowOn(d);
  S.meals.push({
    id: uid(), date: d, at, name: food.name, kcal: mealKcal(food), p: food.p ?? 0, c: food.c ?? 0, f: food.f ?? 0,
    servings, ref: food.id, kind: food.kind || 'recipe', slot: slot || slotForTime(at),
  });
  const af = activeFast();
  if (af && d === today()) toast('Logged. You have an extended fast running: end it in Today');
  else if (!inWindow(at) && d === today()) toast(`Logged outside your ${win().from}–${win().to} window`);
}

function addFluid(ml, date) {
  const d = date || today();
  S.fluids.push({ id: uid(), date: d, at: nowOn(d), ml, type: ui.fluidType });
  toast(`+${ml} ml ${FLUID_TYPES.find(([k]) => k === ui.fluidType)[1].toLowerCase()}`);
}

function onQuest(key) {
  const d = today();
  const at = questAt(d, key);
  switch (key) {
    case 'walk':
      if (at) { ask('Undo the morning walk?', 'Undo', () => { dayRec(d).walk = undefined; }); return false; }
      dayRec(d).walk = { at: new Date().toISOString() };
      toast(inRange(new Date().toISOString(), WALK_WINDOW) ? 'Walk logged · on-time bonus' : 'Walk logged');
      return true;
    case 'training':
      if (at) { ui.tab = 'train'; return true; }
      ask('Mark today\'s training as done without logging sets?\nOr open Train to log the full session.', 'Mark done', () => {
        const prog = activeProgram();
        const day = nextDay(prog);
        S.workouts.push({ id: uid(), date: d, at: new Date().toISOString(), programId: prog.id, programName: prog.name, family: prog.family, dayId: day.id, dayName: day.name, entries: [], quick: true });
      }, { label: 'Open Train', run: () => { ui.tab = 'train'; } });
      return false;
    case 'protein': ui.tab = 'fuel'; ui.sub.fuel = 'log'; ui.fuelDate = d; return true;
    case 'fluids': ui.tab = 'fuel'; ui.sub.fuel = 'fluids'; ui.fuelDate = d; return true;
    case 'sleep': ui.tab = 'body'; ui.sub.body = 'sleep'; return true;
    case 'plan': ui.tab = 'plan'; ui.sub.plan = 'tomorrow'; ui.planDate = addDays(d, 1); return true;
    case 'journal': ui.tab = 'hero'; ui.sub.hero = 'journal'; return true;
  }
  return false;
}

function findEx(pid, did, eid) {
  const prog = S.programs[pid];
  const day = prog?.days.find((d) => d.id === did);
  const i = day ? day.exercises.findIndex((e) => e.id === eid) : -1;
  return { prog, day, i, ex: i >= 0 ? day.exercises[i] : null };
}

function completeSession(pid, did) {
  const prog = S.programs[pid];
  const day = prog.days.find((d) => d.id === did);
  const draft = getDraft(pid, did);
  const entries = day.exercises.map((e) => {
    const dr = draft[e.id] || {};
    const mode = logMode(e);
    const sets = (dr.sets || []).map((s) => ({ kg: num(s?.kg), reps: mode === 'singles' ? (num(s?.kg) != null ? 1 : null) : mode === 'hold' ? null : num(s?.reps), hold: num(s?.hold) }))
      .filter((s) => s.kg != null || s.reps != null || s.hold != null)
      .map((s) => (s.hold == null ? { kg: s.kg, reps: s.reps } : s));
    return { exId: e.id, name: e.name, tech: e.tech || '', sets, note: (dr.note || '').trim() };
  }).filter((e) => e.sets.length || e.note);
  const d = today();
  S.workouts.push({ id: uid(), date: d, at: new Date().toISOString(), programId: pid, programName: prog.name, family: prog.family, dayId: did, dayName: day.name, entries });
  delete ui.drafts[draftKey(pid, did)];
  ui.dayId = null;
  const prs = prSessions();
  const last = S.workouts[S.workouts.length - 1];
  toast(prs.has(last.id) ? `Session complete · new personal record! +${PTS.session + PTS.pr} XP` : `Session complete · +${PTS.session} XP`);
}

function restoreFrom(txt) {
  let data;
  try { data = JSON.parse(txt || ''); } catch { data = null; }
  if (!data || !data.settings || ![1, 2, 3].includes(data.v || 1)) { toast('That is not a Trainer backup'); return; }
  ask('Replace all current data with this backup?', 'Replace', () => { S = normalise(data); S.notice = null; toast('Backup restored'); });
}

function copyText(text, okMsg, fallbackEl) {
  const fallback = () => { if (fallbackEl) { fallbackEl.value = text; fallbackEl.focus(); fallbackEl.select(); toast('It\'s in the box below. Copy it from there'); } else toast('Copy is blocked in this browser'); };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast(okMsg), fallback);
  else fallback();
}

let rpTimer = null;
function restTimer(btn) {
  clearInterval(rpTimer);
  let n = 10;
  btn.textContent = `${n} s…`;
  rpTimer = setInterval(() => {
    n -= 1;
    if (!btn.isConnected) { clearInterval(rpTimer); return; }
    if (n <= 0) { clearInterval(rpTimer); btn.textContent = 'Go! · 10 s rest'; navigator.vibrate?.(200); return; }
    btn.textContent = `${n} s…`;
  }, 1000);
}

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    ui.tab = tab.dataset.tab; ui.editProgram = false;
    if (ui.tab === 'plan' && ui.sub.plan === 'tomorrow' && !ui.planDate) ui.planDate = addDays(today(), 1);
    rememberUi(); render({ scrollTop: true });
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const a = el.dataset.act;
  const prevTab = ui.tab;
  let changed = true;

  switch (a) {
    case 'sheet-close': closeSheet(); return;
    case 'ask-yes': { const f = askYes; closeSheet(); askYes = askAlt = null; if (f) { f(); commit({ scrollTop: true }); } return; }
    case 'ask-alt': { const f = askAlt?.run; closeSheet(); askYes = askAlt = null; if (f) { f(); commit({ scrollTop: true }); } return; }
    case 'sub': ui.sub[ui.tab] = el.dataset.v; rememberUi(); render({ scrollTop: true }); return;
    case 'quest': changed = onQuest(el.dataset.key); break;
    case 'quest-walk': changed = onQuest('walk'); break;
    case 'go-fuel': ui.tab = 'fuel'; ui.sub.fuel = 'log'; ui.fuelDate = today(); rememberUi(); render({ scrollTop: true }); return;
    case 'go-train': ui.tab = 'train'; rememberUi(); render({ scrollTop: true }); return;
    case 'go-plan': ui.tab = 'plan'; ui.sub.plan = 'tomorrow'; ui.planDate = addDays(today(), 1); rememberUi(); render({ scrollTop: true }); return;
    case 'coffee': {
      const c = (dayRec(today()).chains ||= {});
      const v = el.dataset.v === '1';
      if (c.coffee === v) delete c.coffee; else c.coffee = v;
      if (c.coffee === true) toast('Coffee-free · chain kept');
      if (c.coffee === false) toast('Chain reset. Tomorrow is day 1 again');
      break;
    }
    case 'chain-set': {
      const c = (dayRec(el.dataset.date).chains ||= {});
      const v = el.dataset.v;
      if (v === 'auto') delete c[el.dataset.chain]; else c[el.dataset.chain] = v === 'yes';
      break;
    }
    case 'cal-chain': ui.calChain = el.dataset.v; render(); return;
    case 'cal-nav': { const dir = Number(el.dataset.dir); ui.calDate = dir === 0 ? today() : addDays(ui.calDate || today(), dir); render(); return; }
    case 'cal-date': ui.calDate = el.dataset.date; render(); return;
    case 'fuel-date': { const dir = Number(el.dataset.dir); const cur = ui.fuelDate || today(); ui.fuelDate = dir === 0 ? today() : addDays(cur, dir); if (ui.fuelDate > today()) ui.fuelDate = today(); render(); return; }
    // Fasting
    case 'fast-start': openFastStart(); return;
    case 'fast-end': {
      const f = activeFast();
      const h = Math.floor(fastHours(f));
      ask(`End your fast at ${h} hours?${h >= 48 ? '\nBreak it gently: a small, easy meal first, then wait an hour.' : ''}`, 'End fast', () => { f.end = new Date().toISOString(); toast(`Fast complete · ${h} hours`); });
      return;
    }
    case 'fast-goal': {
      const f = activeFast();
      openSheet('Fast goal', `<div class="grid4">${[24, 36, 48, 72].map((h) => `<button data-act="fast-goal-set" data-h="${h}" aria-pressed="${f.goalH === h}">${h} h</button>`).join('')}</div>`);
      return;
    }
    case 'fast-goal-set': activeFast().goalH = Number(el.dataset.h); closeSheet(); break;
    case 'mark-fast': { const r = dayRec(el.dataset.date); r.fast = !r.fast; break; }
    // Plan
    case 'plan-date': { const dir = Number(el.dataset.dir); const t = today(); const cur = ui.planDate || addDays(t, 1); ui.planDate = dir === 0 ? addDays(t, 1) : addDays(cur, dir); if (ui.planDate < t) ui.planDate = t; render(); return; }
    case 'plan-open': ui.planDate = el.dataset.date; ui.sub.plan = 'tomorrow'; rememberUi(); render({ scrollTop: true }); return;
    case 'plan-kind': case 'week-kind': {
      const p = planRec(el.dataset.date);
      p.kind = p.kind === el.dataset.v ? null : el.dataset.v;
      break;
    }
    case 'plan-walk': { const p = planRec(el.dataset.date); p.walk = p.walk === false; break; }
    case 'plan-save': {
      const d = el.dataset.date;
      const p = planRec(d);
      if (!p.kind) { toast('Pick training, rest or fast first'); return; }
      const first = !p.madeAt;
      p.madeAt = new Date().toISOString();
      if (!p.madeOn || first) p.madeOn = today();
      toast(first ? `Plan locked in for ${fmtDate(d)}` : 'Plan updated');
      if (d === addDays(today(), 1)) { ui.tab = 'today'; }
      break;
    }
    case 'top-done': { const p = planRec(today()); (p.topDone ||= {})[el.dataset.i] = !p.topDone[el.dataset.i]; break; }
    case 'log-planned': {
      const d = today();
      const done = slotLogged(d, el.dataset.slot, el.dataset.id);
      if (done) { ask(`Remove ${done.name} from today?`, 'Remove', () => { S.meals = S.meals.filter((m) => m.id !== done.id); }); return; }
      const food = findFood(el.dataset.id);
      addMealFromFood(food, 1, d, el.dataset.slot);
      toast(`Logged ${food.name}`);
      break;
    }
    case 'week-nav': ui.weekStart = addDays(ui.weekStart || planningWeek(), Number(el.dataset.dir)); render(); return;
    case 'week-batch': { const p = planRec(el.dataset.date); p.batch = !p.batch; break; }
    case 'week-suggest': suggestWeek(ui.weekStart || planningWeek()); toast('Training days suggested: adjust as you like'); break;
    case 'week-save': {
      const ws = ui.weekStart || planningWeek();
      S.weekPlans[ws] = { madeAt: new Date().toISOString(), madeOn: S.weekPlans[ws]?.madeOn || today() };
      toast('Weekly plan saved');
      break;
    }
    case 'shop-tick': { const k = el.dataset.k; if (S.shopping[k]) delete S.shopping[k]; else S.shopping[k] = true; break; }
    case 'shop-clear': S.shopping = {}; break;
    case 'shop-copy': {
      const { items } = shoppingItems(today(), addDays(today(), 6));
      copyText(items.filter(([k]) => !S.shopping[k]).map(([, x]) => `- ${x.text}`).join('\n'), 'Shopping list copied');
      return;
    }
    // Train
    case 'family': S.settings.family = el.dataset.v; ui.dayId = null; ui.editProgram = false; break;
    case 'tier': {
      S.settings.tier = el.dataset.v;
      const cur = S.programs[S.settings.active.hit];
      if (!cur || (cur.tier || 'intermediate') !== S.settings.tier) S.settings.active.hit = programs('hit', S.settings.tier)[0]?.id;
      ui.dayId = null; ui.editProgram = false;
      break;
    }
    case 'pick-program': S.settings.active[S.settings.family] = el.dataset.v; ui.dayId = null; ui.editProgram = false; break;
    case 'pick-day': ui.dayId = el.dataset.v; render(); return;
    case 'toggle-edit': ui.editProgram = !ui.editProgram; render(); return;
    case 'rp-timer': restTimer(el); return;
    case 'copy-last': {
      const { ex } = findEx(el.dataset.pid, el.dataset.did, el.dataset.eid);
      const last = lastEntryFor(ex.name);
      if (!last) return;
      const mode = logMode(ex);
      const n = Math.max(1, Number(ex.sets) || 1, mode === 'singles' ? techOf(ex).sets : 1);
      const dr = (getDraft(el.dataset.pid, el.dataset.did)[ex.id] ||= {});
      dr.sets = Array.from({ length: n }, (_, s) => {
        const ls = last.entry.sets[s] || last.entry.sets[last.entry.sets.length - 1];
        return { kg: ls?.kg ?? '', reps: ls?.reps ?? '', hold: ls?.hold ?? '' };
      });
      render(); return;
    }
    case 'complete': completeSession(el.dataset.pid, el.dataset.did); break;
    case 'open-session': ui.openSession = ui.openSession === el.dataset.id ? null : el.dataset.id; render(); return;
    case 'del-workout': ask('Delete this session?', 'Delete', () => { S.workouts = S.workouts.filter((w) => w.id !== el.dataset.id); }); return;
    case 'ex-move': {
      const { day, i } = findEx(el.dataset.pid, el.dataset.did, el.dataset.eid);
      const j = i + Number(el.dataset.dir);
      if (j < 0 || j >= day.exercises.length) return;
      [day.exercises[i], day.exercises[j]] = [day.exercises[j], day.exercises[i]];
      break;
    }
    case 'ex-del': {
      const { day, i, ex } = findEx(el.dataset.pid, el.dataset.did, el.dataset.eid);
      ask(`Remove ${ex.name} from this day?`, 'Remove', () => { day.exercises.splice(i, 1); });
      return;
    }
    case 'ex-add': {
      const prog = S.programs[el.dataset.pid];
      const day = prog.days.find((d) => d.id === el.dataset.did);
      day.exercises.push({ id: uid(), name: 'New exercise', sets: prog.family === 'hit' ? 1 : 3, reps: prog.family === 'hit' ? '6–10' : '8–12', note: '', ss: false, tech: '' });
      break;
    }
    case 'day-add': {
      const prog = S.programs[el.dataset.pid];
      const nd = { id: uid(), name: `Day ${prog.days.length + 1}`, group: prog.days[prog.days.length - 1]?.group || '', weeks: prog.days[prog.days.length - 1]?.weeks, exercises: [] };
      prog.days.push(nd);
      ui.dayId = nd.id;
      break;
    }
    case 'day-del': {
      const prog = S.programs[el.dataset.pid];
      ask('Delete this day and its exercises? Logged sessions stay in history.', 'Delete day', () => {
        prog.days = prog.days.filter((d) => d.id !== el.dataset.did); ui.dayId = null;
      });
      return;
    }
    case 'prog-copy': {
      const src = S.programs[el.dataset.pid];
      const cp = clone(src);
      cp.id = uid(); cp.name = `${src.name} (my version)`; delete cp.template; cp.source = `Based on ${src.name}`;
      cp.days = cp.days.map((d) => ({ ...d, id: uid(), exercises: d.exercises.map((x) => ({ ...x, id: uid() })) }));
      S.programs[cp.id] = cp; S.settings.active[cp.family] = cp.id; ui.dayId = null;
      toast('Saved as a new program');
      break;
    }
    case 'prog-reset': {
      const prog = S.programs[el.dataset.pid];
      ask(`Reset ${prog.name} to the original exercises? Your logged sessions stay.`, 'Reset', () => {
        S.programs[prog.id] = programFromTemplate(PROGRAM_TEMPLATES.find((t) => t.id === prog.template));
        if (!S.programs[prog.id].days.some((d) => d.id === ui.dayId)) ui.dayId = null;
      });
      return;
    }
    case 'prog-del': {
      const prog = S.programs[el.dataset.pid];
      ask(`Delete ${prog.name}? Logged sessions stay in history.`, 'Delete', () => {
        delete S.programs[prog.id]; S.settings.active[prog.family] = programs(prog.family)[0]?.id; ui.editProgram = false; ui.dayId = null;
      });
      return;
    }
    // Fuel
    case 'food-picker': openFoodPicker(); return;
    case 'pick-food': openServings(findFood(el.dataset.id), document.getElementById('picker-slot')?.value); return;
    case 'log-food': {
      const food = findFood(el.dataset.id);
      addMealFromFood(food, num(el.dataset.servings) || 1, null, document.getElementById('serv-slot')?.value);
      closeSheet();
      toast(`Logged ${food.name}`);
      break;
    }
    case 'oneoff':
      openSheet('One-off meal', mealForm('oneoff-form', { servings: 1 }, `<label class="field check-field" style="grid-column:1/-1"><span>Also save to My foods</span><input name="keep" type="checkbox"></label>`));
      return;
    case 'edit-meal': {
      const m = S.meals.find((x) => x.id === el.dataset.id);
      openSheet('Edit meal', mealForm('meal-edit-form', m) + `<button class="ghost danger" data-act="del-meal" data-id="${esc(m.id)}">Delete meal</button>`);
      document.getElementById('meal-edit-form').dataset.id = m.id;
      return;
    }
    case 'del-meal': S.meals = S.meals.filter((m) => m.id !== el.dataset.id); closeSheet(); toast('Meal removed'); break;
    case 'copy-yesterday': {
      const d = el.dataset.date, y = addDays(d, -1);
      const src = mealsOn(y);
      if (!src.length) { toast(`Nothing logged on ${fmtDate(y)}`); return; }
      src.forEach((m) => S.meals.push({ ...m, id: uid(), date: d, at: atOn(d, fmtTime(m.at)) }));
      toast(`Copied ${src.length} meal${src.length > 1 ? 's' : ''}`);
      break;
    }
    case 'recipe-filter': ui.recipeFilter = el.dataset.v; render(); return;
    case 'open-recipe': ui.openRecipe = ui.openRecipe === el.dataset.id ? null : el.dataset.id; render(); return;
    case 'ing-tick': { const c = (ui.ingChecks[el.dataset.id] ||= {}); c[el.dataset.i] = !c[el.dataset.i]; render(); return; }
    case 'new-myfood':
      openSheet('New food or recipe', `<form id="myfood-form" class="grid2" autocomplete="off">
        <label class="field" style="grid-column:1/-1">Name<input name="name" required maxlength="80"></label>
        <label class="field">Meal<select name="meal">${MEAL_TYPES.map((t) => `<option>${t}</option>`).join('')}</select></label>
        <label class="field">Recipe makes (servings)<input name="serves" inputmode="numeric" value="1"></label>
        <label class="field">kcal per serving<input name="kcal" inputmode="decimal" placeholder="auto from macros"></label>
        <label class="field">Protein (g)<input name="p" inputmode="decimal"></label>
        <label class="field">Carbs (g)<input name="c" inputmode="decimal"></label>
        <label class="field">Fat (g)<input name="f" inputmode="decimal"></label>
        <label class="field" style="grid-column:1/-1">Ingredients (one per line, optional)<textarea name="ingredients" rows="3"></textarea></label>
        <button class="primary" style="grid-column:1/-1" type="submit">Save food</button></form>`);
      return;
    case 'edit-myfood': {
      const f = S.myFoods.find((x) => x.id === el.dataset.id);
      openSheet('Edit food', `<form id="myfood-form" class="grid2" data-id="${esc(f.id)}" autocomplete="off">
        <label class="field" style="grid-column:1/-1">Name<input name="name" required maxlength="80" value="${esc(f.name)}"></label>
        <label class="field">Meal<select name="meal">${MEAL_TYPES.map((t) => `<option ${f.meal === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="field">Recipe makes (servings)<input name="serves" inputmode="numeric" value="${f.serves || 1}"></label>
        <label class="field">kcal per serving<input name="kcal" inputmode="decimal" value="${f.kcal ?? ''}"></label>
        <label class="field">Protein (g)<input name="p" inputmode="decimal" value="${f.p ?? ''}"></label>
        <label class="field">Carbs (g)<input name="c" inputmode="decimal" value="${f.c ?? ''}"></label>
        <label class="field">Fat (g)<input name="f" inputmode="decimal" value="${f.f ?? ''}"></label>
        <label class="field" style="grid-column:1/-1">Ingredients<textarea name="ingredients" rows="3">${esc((f.ingredients || []).join('\n'))}</textarea></label>
        <button class="primary" style="grid-column:1/-1" type="submit">Save food</button>
        <button type="button" class="ghost danger" style="grid-column:1/-1" data-act="del-myfood" data-id="${esc(f.id)}">Delete food</button></form>`);
      return;
    }
    case 'del-myfood': S.myFoods = S.myFoods.filter((x) => x.id !== el.dataset.id); closeSheet(); break;
    case 'fluid-type': ui.fluidType = el.dataset.v; render(); return;
    case 'fluid-add': addFluid(Number(el.dataset.ml), el.dataset.date || today()); break;
    case 'del-fluid': S.fluids = S.fluids.filter((x) => x.id !== el.dataset.id); break;
    case 'compound-new': openCompoundForm(); return;
    case 'stack-log': {
      const p = STACK_PRESETS.find((x) => x.id === el.dataset.id);
      openSheet(p.name, `<form id="stack-form" data-id="${esc(p.id)}" class="grid1">
        <p class="small">${p.items.map(([n, d, u]) => `${esc(n)}${d != null ? ` ${d} ${u}` : ''}`).join('<br>')}</p>
        ${p.food?.kcal ? `<label class="field check-field"><span>Add its calories to Fuel (≈${p.food.kcal} kcal · P ${p.food.p} · C ${p.food.c})</span><input name="food" type="checkbox" checked></label>` : ''}
        <label class="field">Time<input name="time" type="time" value="${fmtTime(new Date().toISOString())}"></label>
        <button class="primary" type="submit">Log stack</button></form>`);
      return;
    }
    case 'del-compound': S.compounds = S.compounds.filter((x) => x.id !== el.dataset.id); break;
    // Body
    case 'sleep-h': ui.sleepHours = Math.max(0, Math.min(14, ui.sleepHours + Number(el.dataset.d))); render(); return;
    case 'sleep-q': ui.sleepQuality = Number(el.dataset.v); render(); return;
    case 'save-sleep': {
      const d = today();
      const notes = document.getElementById('sleep-notes')?.value.trim() || '';
      const prev = sleepOn(d);
      S.sleep = S.sleep.filter((s) => s.date !== d);
      S.sleep.push({ date: d, at: prev?.at || new Date().toISOString(), hours: ui.sleepHours, quality: ui.sleepQuality, notes });
      ui.sleepQuality = null;
      toast('Sleep saved');
      break;
    }
    case 'del-weight': S.weights = S.weights.filter((w) => w.date !== el.dataset.date); break;
    case 'del-meas': S.measurements = S.measurements.filter((m) => m.date !== el.dataset.date); break;
    case 'contrast': S.settings.highContrast = !S.settings.highContrast; break;
    case 'win-preset': {
      const h = Number(el.dataset.h);
      const to = Math.min(23 * 60 + 59, minutesOf(win().from) + h * 60);
      S.settings.window = { from: win().from, to: `${pad(Math.floor(to / 60))}:${pad(to % 60)}` };
      toast(`Eating window ${S.settings.window.from}–${S.settings.window.to}`);
      break;
    }
    case 'copy-backup': copyText(JSON.stringify(S), 'Backup copied. Paste it into a note to keep it', document.getElementById('restore-text')); return;
    case 'copy-old': copyText(oldBackup() || '', 'Old data copied. Paste it into a note to keep it', document.getElementById('restore-text')); return;
    case 'del-old': ask('Delete the data kept from before version 3? This can\'t be undone.', 'Delete', () => { try { localStorage.removeItem(OLD_KEY); } catch { /* ignore */ } }); return;
    case 'reset-all':
      ask('Reset all data? Everything is wiped: logs, plans, chains, goals and XP.\nCopy a backup first if you might want it.', 'Wipe everything',
        () => { S = cleanSlate(S, false); ui.drafts = {}; toast('All data reset'); },
        { label: 'Keep exercise weights', run: () => { S = cleanSlate(S, true); ui.drafts = {}; toast('Reset · exercise weights kept'); } });
      return;
    case 'restore-paste': restoreFrom(document.getElementById('restore-text')?.value.trim()); return;
    case 'export': {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), { href: url, download: `trainer-backup-${today()}.json` });
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    // Hero
    case 'goal-new': openGoalForm(null); return;
    case 'goal-edit': openGoalForm(S.goals.find((g) => g.id === el.dataset.id)); return;
    case 'goal-del': {
      const g = S.goals.find((x) => x.id === el.dataset.id);
      ask(`Delete the goal "${g.title}"?`, 'Delete', () => { S.goals = S.goals.filter((x) => x.id !== g.id); });
      return;
    }
    case 'goal-done': { const g = S.goals.find((x) => x.id === el.dataset.id); g.doneAt = g.doneAt ? null : new Date().toISOString(); break; }
    case 'milestone': {
      const g = S.goals.find((x) => x.id === el.dataset.gid);
      const m = g.milestones.find((x) => x.id === el.dataset.mid);
      if (!m.doneAt && metricMet(m.metric)) { toast('This one ticks itself from your data'); return; }
      m.doneAt = m.doneAt ? null : new Date().toISOString();
      break;
    }
    case 'milestone-del': {
      const g = S.goals.find((x) => x.id === el.dataset.gid);
      g.milestones = g.milestones.filter((x) => x.id !== el.dataset.mid);
      break;
    }
    default: return;
  }
  if (changed === false) { save(); render(); return; }
  commit({ scrollTop: ui.tab !== prevTab });
});

document.getElementById('contrast-btn').addEventListener('click', () => { S.settings.highContrast = !S.settings.highContrast; commit(); });

// Live inputs that must not re-render (typing would lose focus).
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.draft) {
    const [pid, did, eid, s, field] = t.dataset.draft.split('|');
    const dr = (getDraft(pid, did)[eid] ||= {});
    if (s === 'note') dr.note = t.value;
    else { dr.sets ||= []; (dr.sets[Number(s)] ||= {})[field] = t.value; }
    return;
  }
  if (t.dataset.live === 'recipe-q') {
    ui.recipeQuery = t.value;
    const pos = t.selectionStart;
    render();
    const again = document.getElementById('recipe-q');
    again.focus(); again.setSelectionRange(pos, pos);
    return;
  }
  if (t.dataset.live === 'picker-q') {
    const q = t.value.trim().toLowerCase();
    document.querySelectorAll('.picker-list .pick').forEach((b) => { b.hidden = !!q && !b.dataset.name.includes(q); });
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'import') {
    const file = t.files?.[0];
    if (file) file.text().then(restoreFrom).catch(() => toast('Could not read that file'));
    return;
  }
  if (t.dataset.plan) {
    const [d, slot] = t.dataset.plan.split('|');
    const p = planRec(d);
    p.meals ||= {};
    if (t.value) p.meals[slot] = t.value; else delete p.meals[slot];
    commit();
    return;
  }
  if (t.dataset.plantop) {
    const [d, i] = t.dataset.plantop.split('|');
    const p = planRec(d);
    (p.top ||= ['', '', ''])[Number(i)] = t.value.trim();
    save();
    return;
  }
  if (t.dataset.addto) {
    const [mode, slot] = t.value.split('|');
    const food = findFood(t.dataset.addto);
    if (!mode || !food) return;
    if (mode === 'log') { addMealFromFood(food, 1, today(), slot); toast(`Logged ${food.name} · ${slot}`); }
    else { const tm = addDays(today(), 1); const p = planRec(tm); (p.meals ||= {})[slot] = food.id; toast(`Planned for tomorrow · ${slot}`); }
    commit();
    return;
  }
  if (t.dataset.author) {
    const k = t.dataset.author;
    const had = !!S.author[k]?.trim();
    S.author[k] = t.value;
    if (!had && t.value.trim()) S.author[`${k}At`] = today();
    save();
    if (!had && t.value.trim()) { toast(`Saved · +${PTS.author} XP`); render(); }
    return;
  }
  if (t.dataset.edit) {
    const { day, ex } = findEx(t.dataset.pid, t.dataset.did, t.dataset.eid);
    const f = t.dataset.edit;
    if (f === 'dayname') { day.name = t.value.trim() || day.name; commit(); return; }
    if (!ex) return;
    if (f === 'ss') ex.ss = t.checked;
    else if (f === 'sets') ex.sets = Math.max(1, Math.min(10, Math.round(num(t.value) || 1)));
    else if (f === 'name') ex.name = t.value.trim() || ex.name;
    else if (f === 'tech') ex.tech = t.value;
    else ex[f] = t.value.trim();
    save();
    if (['sets', 'ss', 'name', 'tech'].includes(f)) render();
  }
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const data = Object.fromEntries(new FormData(f));
  switch (f.id || (f.classList.contains('milestone-form') && 'milestone-form')) {
    case 'oneoff-form':
    case 'meal-edit-form': {
      const name = (data.name || '').trim();
      if (!name) return toast('Give the meal a name');
      const m = f.id === 'meal-edit-form' ? S.meals.find((x) => x.id === f.dataset.id) : { id: uid(), kind: 'oneoff', ref: null };
      const date = data.date || today();
      Object.assign(m, {
        name, date, at: atOn(date, data.time), servings: num(data.servings) || 1, slot: data.slot,
        kcal: num(data.kcal), p: num(data.p) ?? 0, c: num(data.c) ?? 0, f: num(data.f) ?? 0,
      });
      if (m.kcal === null && !m.p && !m.c && !m.f) return toast('Add calories or macros');
      if (f.id === 'oneoff-form') {
        S.meals.push(m);
        if (data.keep) S.myFoods.push({ id: uid(), name, meal: data.slot === 'Snack' ? 'Snack' : data.slot, serves: 1, kcal: m.kcal, p: m.p, c: m.c, f: m.f, ingredients: [] });
      }
      closeSheet();
      toast(inWindow(m.at) ? 'Saved' : 'Saved · outside your eating window');
      break;
    }
    case 'servings-form': {
      const k = num(data.servings);
      if (!k || k <= 0) return toast('Enter the number of servings');
      const food = findFood(f.dataset.id);
      addMealFromFood(food, k, null, document.getElementById('serv-slot')?.value);
      closeSheet();
      toast(`Logged ${food.name}`);
      break;
    }
    case 'myfood-form': {
      const row = {
        name: data.name.trim(), meal: data.meal, serves: Math.max(1, Math.round(num(data.serves) || 1)),
        kcal: num(data.kcal), p: num(data.p) ?? 0, c: num(data.c) ?? 0, f: num(data.f) ?? 0,
        ingredients: (data.ingredients || '').split('\n').map((x) => x.trim()).filter(Boolean),
      };
      if (row.kcal === null) row.kcal = Math.round(4 * row.p + 4 * row.c + 9 * row.f);
      const existing = f.dataset.id && S.myFoods.find((x) => x.id === f.dataset.id);
      if (existing) Object.assign(existing, row); else S.myFoods.push({ id: uid(), ...row });
      closeSheet();
      toast('Food saved');
      break;
    }
    case 'fluid-form': {
      const ml = Math.round(num(data.ml) || 0);
      if (ml <= 0 || ml > 3000) return toast('Enter an amount in ml');
      addFluid(ml, ui.fuelDate || today());
      break;
    }
    case 'fast-form': {
      const last = lastMealBefore(new Date());
      const start = data.from === 'last' && last ? last.at : new Date().toISOString();
      S.fasts.push({ id: uid(), start, end: null, goalH: Number(data.goalH) || 36 });
      closeSheet();
      toast('Fast started. Water and electrolytes');
      break;
    }
    case 'window-form': {
      if (!data.from || !data.to || minutesOf(data.to) <= minutesOf(data.from)) return toast('The window must close after it opens');
      S.settings.window = { from: data.from, to: data.to };
      toast(`Eating window ${data.from}–${data.to}`);
      break;
    }
    case 'compound-form': {
      const name = data.name.trim();
      if (!name) return toast('Add a name');
      const date = data.date || today();
      S.compounds.push({ id: uid(), date, at: atOn(date, data.time), name, category: data.category, dose: num(data.dose), unit: data.unit, route: data.route, site: data.site.trim(), notes: data.notes.trim() });
      closeSheet();
      toast('Logged');
      break;
    }
    case 'stack-form': {
      const p = STACK_PRESETS.find((x) => x.id === f.dataset.id);
      const d = today();
      const at = atOn(d, data.time);
      p.items.forEach(([n, dose, unit]) => S.compounds.push({ id: uid(), date: d, at, name: n, category: 'Supplement', dose, unit, route: 'Oral', site: '', notes: p.name }));
      if (data.food && p.food) S.meals.push({ id: uid(), date: d, at, name: `${p.name} (stack)`, kcal: p.food.kcal, p: p.food.p, c: p.food.c, f: p.food.f, servings: 1, ref: `stack:${p.id}`, kind: 'stack', slot: 'Snack' });
      closeSheet();
      toast(`${p.name} logged`);
      break;
    }
    case 'weight-form': {
      const kg = num(data.kg);
      if (kg === null || kg < 30 || kg > 250) return toast('Enter a weight in kg');
      const d = data.date || today();
      S.weights = S.weights.filter((w) => w.date !== d);
      S.weights.push({ date: d, kg: round1(kg) });
      break;
    }
    case 'meas-form': {
      const d = data.date || today();
      const row = { date: d };
      MEASURES.forEach((m) => { const v = num(data[m]); if (v !== null) row[m] = round1(v); });
      if (Object.keys(row).length === 1) return toast('Enter at least one measurement');
      const prev = S.measurements.find((x) => x.date === d) || {};
      S.measurements = S.measurements.filter((x) => x.date !== d);
      S.measurements.push({ ...prev, ...row });
      break;
    }
    case 'settings-form': {
      for (const k of ['proteinGoal', 'kcalGoal', 'carbGoal', 'fatGoal', 'fluidMl', 'walkExtraMl', 'startWeight', 'target', 'heightCm']) {
        const v = num(data[k]);
        if (v !== null && v >= 0) S.settings[k] = v;
      }
      if (data.cycleStart) S.settings.cycleStart = data.cycleStart;
      if (data.chainStart) S.settings.chainStart = data.chainStart;
      toast('Targets saved');
      break;
    }
    case 'reflect-form': {
      const d = today();
      const prev = S.journal[d];
      const entry = Object.fromEntries(REFLECTION_QUESTIONS.map(([k]) => [k, (data[k] || '').trim()]));
      if (!Object.values(entry).some(Boolean)) return toast('Answer at least one question');
      S.journal[d] = { ...entry, at: prev?.at || new Date().toISOString() };
      toast('Journal saved');
      break;
    }
    case 'review-form': {
      const ws = weekStart(today());
      S.reviews[ws] = { wins: data.wins.trim(), change: data.change.trim(), date: S.reviews[ws]?.date || today() };
      toast('Weekly review saved');
      break;
    }
    case 'goal-form': {
      const title = data.title.trim();
      if (!title) return toast('Give the goal a name');
      const g = f.dataset.id ? S.goals.find((x) => x.id === f.dataset.id) : null;
      const row = { title, area: data.area.trim() || 'Health & Wellness', why: data.why.trim(), deadline: data.deadline, main: !!data.main };
      if (g) Object.assign(g, row); else S.goals.push({ id: uid(), ...row, doneAt: null, milestones: [] });
      closeSheet();
      break;
    }
    case 'milestone-form': {
      const text = (data.text || '').trim();
      if (!text) return;
      S.goals.find((x) => x.id === f.dataset.gid).milestones.push({ id: uid(), text, metric: null, doneAt: null });
      break;
    }
    default: return;
  }
  commit();
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

render();
if (S.notice === 'v3') showWelcome();
setInterval(tick, 30000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
