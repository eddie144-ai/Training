'use strict';
/* Gym & Fuel: Iron & Eggs stripped down to the gym and nutrition.
   Kept: the training programmes and set logger (4-week cycles and Mentzer HIT), personal records,
   the food log with macro targets, the Dolce recipes, barcode scanning and the weight log.
   Dropped: chains, XP and levels, goals, journal, fasting, carb-ups, Garmin, the channel and the other apps.
   No build step and no dependencies; data lives in this browser's localStorage. */

// ===========================================================================
// Constants
// ===========================================================================
const STORE_KEY = 'gymfuel.v1';
const DRAFTS_KEY = 'gymfuel.drafts';
const IRON_KEY = 'shtrainer.v1'; // Iron & Eggs, read once on request to bring your history over

const LOG_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dressing', 'Juice'];
const TAG_NAMES = { A: 'Athlete', H: 'Health', G: 'GF option', V: 'Vegan option' };
const MEASURES = ['waist', 'chest', 'arms', 'thighs', 'hips', 'neck'];
const cap = (w) => w[0].toUpperCase() + w.slice(1);
const FEELS = [[1, 'Rough'], [2, 'Hard'], [3, 'OK'], [4, 'Good'], [5, 'Great']];

// ===========================================================================
// Utilities
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
const atOn = (date, hhmm) => { const d = parseDate(date); const [h, m] = (hhmm || '12:00').split(':').map(Number); d.setHours(h, m, 0, 0); return d.toISOString(); };
const nowOn = (date) => (date === today() ? new Date().toISOString() : atOn(date, '12:00'));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { if (v === null || v === undefined || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const round1 = (n) => Math.round(n * 10) / 10;
const fmtNum = (n) => (n === null || n === undefined ? '—' : Number.isInteger(n) ? String(n) : String(round1(n)));
const clone = (x) => JSON.parse(JSON.stringify(x));
const sum = (arr, f) => arr.reduce((t, x) => t + (f(x) || 0), 0);
const weekStart = (date) => addDays(date, -((parseDate(date).getDay() + 6) % 7)); // Monday
// Match exercises across programmes: case, punctuation and plurals ignored ("Incline Presses" = "incline press").
const exKey = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
  .map((w) => (w.endsWith('sses') ? w.slice(0, -2) : w.endsWith('s') && !w.endsWith('ss') && w.length > 3 ? w.slice(0, -1) : w)).join(' ');

// ===========================================================================
// State
// ===========================================================================
function programFromTemplate(t) {
  const p = clone(t);
  p.days = p.days.map((d, i) => ({ ...d, id: `${t.id}-d${i}`, exercises: d.exercises.map((e, j) => ({ ...e, id: `${t.id}-d${i}-e${j}` })) }));
  p.template = t.id;
  return p;
}

function freshState() {
  return {
    v: 1,
    settings: {
      kcalGoal: 1900, proteinGoal: 170, carbGoal: 80, fatGoal: 90,
      startWeight: null, target: 75, heightCm: null, sex: 'male', age: null, activity: 'moderate', setupDone: false,
      family: 'cycle', tier: 'intermediate', active: { cycle: 'my4week', hit: 'mentzer_ab' }, cycleStart: weekStart(today()),
      highContrast: false,
    },
    programs: Object.fromEntries(PROGRAM_TEMPLATES.map((t) => [t.id, programFromTemplate(t)])),
    baselines: {},
    workouts: [],
    meals: [],
    myFoods: [],
    scanned: [],
    weights: [],
    measurements: [],
    notice: null,
  };
}

function normalise(s) {
  if (!s || typeof s !== 'object') return freshState();
  const d = freshState();
  const out = { ...d, ...s, v: 1, settings: { ...d.settings, ...s.settings, active: { ...d.settings.active, ...(s.settings?.active || {}) } } };
  for (const k of ['workouts', 'meals', 'myFoods', 'scanned', 'weights', 'measurements']) if (!Array.isArray(out[k])) out[k] = [];
  if (!out.programs || typeof out.programs !== 'object') out.programs = {};
  if (!out.baselines || typeof out.baselines !== 'object') out.baselines = {};
  for (const t of PROGRAM_TEMPLATES) {
    const cur = out.programs[t.id];
    if (!cur || (t.version && (cur.version || 1) < t.version && !cur.edited)) out.programs[t.id] = programFromTemplate(t);
  }
  return out;
}

let storageOk = true;
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...freshState(), notice: 'start' };
    const parsed = JSON.parse(raw);
    // Anyone who used the app before the setup sheet existed has already set their targets.
    if (parsed?.settings && parsed.settings.setupDone === undefined) parsed.settings.setupDone = true;
    return normalise(parsed);
  } catch {
    storageOk = false;
    return freshState();
  }
}
let S = load();
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); storageOk = true; } catch { storageOk = false; }
}
const rawKey = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

// Bring weigh-ins, measurements, sessions, exercise weights, programmes, meals, foods and macro targets over from Iron & Eggs.
// Iron & Eggs itself is only read, never changed.
function ironData() {
  try { const d = JSON.parse(rawKey(IRON_KEY) || 'null'); return d && d.settings ? d : null; } catch { return null; }
}
function bringIron() {
  const src = ironData();
  if (!src) return false;
  const n = freshState();
  const st = src.settings || {};
  for (const k of ['kcalGoal', 'proteinGoal', 'carbGoal', 'fatGoal', 'startWeight', 'target', 'heightCm', 'sex', 'family', 'tier', 'cycleStart', 'highContrast']) if (st[k] != null) n.settings[k] = st[k];
  n.settings.active = { ...n.settings.active, ...(st.active || {}) };
  n.programs = { ...n.programs, ...(src.programs || {}) };
  n.baselines = { ...(src.baselines || {}) };
  n.workouts = (src.workouts || []).map((w) => ({ ...w }));
  n.meals = (src.meals || []).map((m) => ({ ...m }));
  n.myFoods = src.myFoods || [];
  n.scanned = src.scanned || [];
  n.weights = src.weights || [];
  n.measurements = src.measurements || [];
  n.settings.setupDone = true;
  S = normalise(n);
  Photos.importFrom('shtrainer-photos').then((k) => { if (k) { toast(`${k} progress photo${k === 1 ? '' : 's'} brought over too`); render(); } }, () => {});
  return true;
}

// ===========================================================================
// Nutrition
// ===========================================================================
const mealKcal = (m) => (m.kcal ?? (4 * (m.p || 0) + 4 * (m.c || 0) + 9 * (m.f || 0)));
const mealTotals = (m) => { const k = m.servings ?? 1; return { kcal: mealKcal(m) * k, p: (m.p || 0) * k, c: (m.c || 0) * k, f: (m.f || 0) * k }; };
const mealsOn = (date) => S.meals.filter((m) => m.date === date).sort((a, b) => a.at.localeCompare(b.at));
function macrosOn(date) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const m of mealsOn(date)) { const x = mealTotals(m); t.kcal += x.kcal; t.p += x.p; t.c += x.c; t.f += x.f; }
  return t;
}
function slotForTime(iso) {
  const h = new Date(iso).getHours();
  return h < 11 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 21 ? 'Dinner' : 'Snack';
}
function foodLibrary() {
  return [
    ...STAPLES.map((x) => ({ ...x, meal: 'Staple', kind: 'staple' })),
    ...RECIPES.map((x) => ({ ...x, kind: 'recipe' })),
    ...S.myFoods.map((x) => ({ ...x, meal: x.meal || 'My food', kind: 'mine', mine: true })),
  ];
}
const findFood = (id) => foodLibrary().find((f) => f.id === id);

// Quick-add buttons: the foods this person logs most (last 30 days), so nobody sees someone else's staples.
function quickFoods(max = 3) {
  const from = addDays(today(), -29);
  const count = {};
  for (const m of S.meals) if (m.ref && m.date >= from) count[m.ref] = (count[m.ref] || 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1]).map(([id]) => findFood(id)).filter(Boolean).slice(0, max);
}
function quickAdd() {
  const foods = quickFoods();
  return foods.length ? `<span class="muted small">Quick add:</span>${foods.map((g) => `<button class="small-btn" data-act="pick-food" data-id="${esc(g.id)}">${esc(g.name.split(':')[0])}</button>`).join('')}` : '';
}

// Average daily intake over the days in [from, to] that have food logged.
function intakeAvg(from, to) {
  const days = [...new Set(S.meals.filter((m) => m.date >= from && m.date <= to).map((m) => m.date))];
  if (!days.length) return null;
  const t = days.map(macrosOn);
  return { n: days.length, kcal: sum(t, (x) => x.kcal) / days.length, p: sum(t, (x) => x.p) / days.length };
}

// ===========================================================================
// Body weight
// ===========================================================================
const weightsSorted = () => [...S.weights].sort((a, b) => a.date.localeCompare(b.date));
const latestWeight = () => weightsSorted().pop() || null;
function avgWeight(end, days) {
  const from = addDays(end, -(days - 1));
  const w = S.weights.filter((x) => x.date >= from && x.date <= end).map((x) => Number(x.kg));
  return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null;
}

// ===========================================================================
// Training
// ===========================================================================
const e1rm = (kg, reps) => (kg && reps ? kg * (1 + reps / 30) : 0);
const entryBest = (e) => Math.max(0, ...(e.sets || []).map((s) => e1rm(s.kg, s.reps)));
const techOf = (e) => TECHNIQUES.find((t) => t.id === e?.tech) || null;
const logMode = (e) => techOf(e)?.log || 'normal';
const hasData = (s) => s.kg != null || s.reps != null || s.hold != null;
const setText = (s) => {
  const kg = s.kg == null ? 'BW' : fmtNum(s.kg);
  if (s.hold != null) return `${kg} kg${s.reps != null ? `×${fmtNum(s.reps)}` : ''} · ${fmtNum(s.hold)} s hold`;
  return s.reps == null ? `${kg} kg` : `${kg}×${fmtNum(s.reps)}`;
};
const workoutsOn = (date) => S.workouts.filter((w) => w.date === date).sort((a, b) => a.at.localeCompare(b.at));

// Sessions that beat the best estimated one-rep max for at least one exercise.
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

// Best estimated one-rep max per exercise, for the records list.
function records() {
  const out = {};
  for (const w of S.workouts) {
    for (const e of w.entries || []) {
      for (const s of e.sets || []) {
        const v = e1rm(s.kg, s.reps);
        const k = exKey(e.name);
        if (v && (!out[k] || v > out[k].e1rm)) out[k] = { name: e.name, e1rm: v, set: s, date: w.date };
      }
    }
  }
  return Object.values(out).sort((a, b) => a.name.localeCompare(b.name));
}

// Last time you did an exercise, falling back to a starting point brought over from Iron & Eggs.
function lastEntryFor(name) {
  const k = exKey(name);
  const ws = [...S.workouts].sort((a, b) => b.at.localeCompare(a.at));
  for (const w of ws) {
    const e = (w.entries || []).find((x) => exKey(x.name) === k && x.sets?.some(hasData));
    if (e) return { entry: e, date: w.date };
  }
  const b = S.baselines[k];
  return b ? { entry: b, date: b.date, baseline: true } : null;
}

function repRange(reps) {
  const m = String(reps).match(/(\d+)(?:\s*[–-]\s*(\d+))?/);
  return m ? [Number(m[1]), Number(m[2] || m[1])] : null;
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

const programs = (family, tier) => Object.values(S.programs).filter((p) => p.family === family && (!tier || (p.tier || 'intermediate') === tier));
function activeProgram() {
  const fam = S.settings.family;
  const p = S.programs[S.settings.active[fam]];
  if (p && (fam !== 'hit' || (p.tier || 'intermediate') === S.settings.tier)) return p;
  return (fam === 'hit' ? programs(fam, S.settings.tier)[0] : null) || p || programs(fam)[0] || Object.values(S.programs)[0];
}
const cycleWeek = () => Math.floor(daysBetween(S.settings.cycleStart, today()) / 7) + 1;
const sessionsOf = (pid) => S.workouts.filter((w) => w.programId === pid).sort((a, b) => a.at.localeCompare(b.at));

function nextDay(prog) {
  const hist = sessionsOf(prog.id);
  const last = hist[hist.length - 1];
  let pool = prog.days;
  if (prog.family === 'cycle') {
    const wk = ((cycleWeek() - 1) % 4 + 4) % 4 + 1; // the 4-week cycle repeats
    const inWeek = prog.days.filter((d) => d.weeks?.includes(wk));
    if (inWeek.length) pool = inWeek;
  }
  if (!last) return pool[0];
  const idx = pool.findIndex((d) => d.id === last.dayId);
  if (idx === -1) {
    // Last session was from another phase: start this phase where the day number matches.
    const lastNo = prog.days.findIndex((d) => d.id === last.dayId) % Math.max(1, pool.length);
    return lastNo >= 0 ? pool[(lastNo + 1) % pool.length] : pool[0];
  }
  return pool[(idx + 1) % pool.length];
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
// UI state
// ===========================================================================
const TABS = [['today', 'Today'], ['train', 'Train'], ['fuel', 'Fuel'], ['body', 'Body']];
const SUBTABS = {
  train: [['log', 'Workout'], ['history', 'History']],
  fuel: [['log', 'Log'], ['recipes', 'Recipes']],
  body: [['weight', 'Weight'], ['measure', 'Measurements'], ['settings', 'Settings']],
};
const ui = {
  tab: 'today', sub: { train: 'log', fuel: 'log', body: 'weight' },
  dayId: null, editProgram: false, openSession: null, openTech: null,
  fuelDate: null, recipeFilter: 'All', recipeQuery: '', openRecipe: null, ingChecks: {},
  drafts: (() => { try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}') || {}; } catch { return {}; } })(),
};
try { const r = JSON.parse(sessionStorage.getItem('gymfuel.ui') || 'null'); if (r && TABS.some(([k]) => k === r.tab)) { ui.tab = r.tab; Object.assign(ui.sub, r.sub || {}); } } catch { /* ignore */ }
const saveDrafts = () => { try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(ui.drafts)); } catch { /* ignore */ } };
const rememberUi = () => { try { sessionStorage.setItem('gymfuel.ui', JSON.stringify({ tab: ui.tab, sub: ui.sub })); } catch { /* ignore */ } };
const draftKey = (pid, did) => `${pid}|${did}`;
const getDraft = (pid, did) => (ui.drafts[draftKey(pid, did)] ||= {});
const draftStarted = (pid, did) => Object.entries(ui.drafts[draftKey(pid, did)] || {}).some(([k, v]) => k !== '_session' && (v.sets || []).some((s) => s && Object.values(s).some((x) => String(x).trim())));

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
function dateNav(act, date) {
  const t = today();
  return `<div class="row between datenav">
    <button class="icon" data-act="${act}" data-dir="-1" aria-label="Previous day">‹</button>
    <button class="ghost grow" data-act="${act}" data-dir="0"><b>${date === t ? 'Today' : fmtDate(date)}</b><span class="muted small">&nbsp;${date === t ? fmtDate(date) : '· tap for today'}</span></button>
    <button class="icon" data-act="${act}" data-dir="1" aria-label="Next day" ${date >= t ? 'disabled' : ''}>›</button>
  </div>`;
}
function macroBars(mac) {
  const st = S.settings;
  return `
    <div class="macro"><span>Calories</span><b>${Math.round(mac.kcal)} / ${st.kcalGoal}</b></div>${bar(mac.kcal, st.kcalGoal, mac.kcal > st.kcalGoal ? 'over' : '')}
    <div class="macro"><span>Protein</span><b>${Math.round(mac.p)} / ${st.proteinGoal} g</b></div>${bar(mac.p, st.proteinGoal, mac.p >= st.proteinGoal ? 'good' : '')}
    <div class="macro"><span>Carbs</span><b>${Math.round(mac.c)} / ${st.carbGoal} g</b></div>${bar(mac.c, st.carbGoal, mac.c > st.carbGoal ? 'over' : '')}
    <div class="macro"><span>Fat</span><b>${Math.round(mac.f)} / ${st.fatGoal} g</b></div>${bar(mac.f, st.fatGoal, mac.f > st.fatGoal ? 'over' : '')}`;
}
function spark(values) {
  if (values.length < 2) return '';
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - lo) / span) * 26}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

// ===========================================================================
// TODAY
// ===========================================================================
function viewToday() {
  const d = today();
  const st = S.settings;
  const prog = activeProgram();
  const next = nextDay(prog);
  const done = workoutsOn(d);
  const rec = recovery(prog);
  const mac = macrosOn(d);
  const left = { kcal: st.kcalGoal - mac.kcal, p: st.proteinGoal - mac.p };
  const lw = latestWeight();
  const avg7 = avgWeight(d, 7), avgPrev = avgWeight(addDays(d, -7), 7);
  const ws = weekStart(d);
  const weekSessions = S.workouts.filter((w) => w.date >= ws && w.date <= d).length;
  const intake = intakeAvg(ws, d);
  const inProgress = draftStarted(prog.id, next.id);
  return `
  ${!st.setupDone ? `<section class="card alert"><h2>Set up your targets</h2><p class="small">Your calorie, protein and target weight are still the app's defaults. Takes a minute.</p><button class="primary" data-act="setup">Set up my targets</button></section>` : ''}
  <section class="card hero-card">
    <h2>Training <span class="right">${esc(prog.name)}</span></h2>
    ${done.length
      ? `<p>${chip('✓ Trained today', 'good')}</p><p class="muted small">${done.map((w) => esc(w.dayName)).join(', ')}</p>
         <p class="small">Next time: <b>${esc(next.name)}</b></p>`
      : `<h3>${esc(next.name)}</h3>
         <p class="muted small">${next.exercises.length} exercises${prog.family === 'cycle' ? ` · cycle week ${((cycleWeek() - 1) % 4 + 4) % 4 + 1}` : ''}</p>
         ${rec ? `<p>${chip(rec.text, rec.cls)}</p>` : ''}
         <button class="primary" data-act="go-train" data-did="${esc(next.id)}">${inProgress ? 'Carry on with this session' : 'Start this session'}</button>`}
  </section>
  <section class="card">
    <h2>Nutrition today <span class="right">${mealsOn(d).length} logged</span></h2>
    <div class="stats">
      <div class="stat"><b>${Math.round(Math.abs(left.kcal))}</b><span>kcal ${left.kcal >= 0 ? 'left' : 'over'}</span></div>
      <div class="stat"><b>${Math.round(Math.max(0, left.p))} g</b><span>protein to go</span></div>
    </div>
    ${macroBars(mac)}
    <div class="grid2"><button class="primary" data-act="food-picker">+ Add food</button><button data-act="scan-food">Scan a barcode</button></div>
    <div class="row wrap">${quickAdd()}<button class="small-btn" data-act="go-fuel">Food log</button></div>
  </section>
  <section class="card">
    <h2>Body weight</h2>
    <div class="stats">
      <div class="stat"><b>${lw ? `${fmtNum(lw.kg)} kg` : '—'}</b><span>${lw ? (lw.date === d ? 'today' : fmtDate(lw.date)) : 'no weigh-ins yet'}</span></div>
      <div class="stat"><b>${avg7 ? `${fmtNum(round1(avg7))} kg` : '—'}</b><span>7-day average</span></div>
      <div class="stat"><b>${avg7 && avgPrev ? `${avg7 - avgPrev > 0 ? '+' : ''}${fmtNum(round1(avg7 - avgPrev))}` : '—'}</b><span>vs last week</span></div>
    </div>
    ${lw?.date === d ? '' : `<form id="weigh-form" class="row" autocomplete="off"><input name="kg" inputmode="decimal" placeholder="Today's weight (kg)" aria-label="Today's weight in kg" required><button type="submit" class="primary">Log</button></form>`}
  </section>
  <section class="card">
    <h2>This week <span class="right">from Mon ${parseDate(ws).getDate()} ${MON[parseDate(ws).getMonth()]}</span></h2>
    <div class="stats">
      <div class="stat"><b>${weekSessions}</b><span>session${weekSessions === 1 ? '' : 's'}</span></div>
      <div class="stat"><b>${intake ? Math.round(intake.kcal) : '—'}</b><span>avg kcal/day</span></div>
      <div class="stat"><b>${intake ? `${Math.round(intake.p)} g` : '—'}</b><span>avg protein/day</span></div>
    </div>
  </section>
  ${!storageOk ? '<section class="card alert"><p class="small">This browser is blocking storage, so nothing will be saved. Turn off private mode or allow site data.</p></section>' : ''}`;
}

// ===========================================================================
// TRAIN
// ===========================================================================
// The weight to beat, in a circle.
function prevBadge(last) {
  if (!last) return '<span class="prevbadge none" aria-label="No previous weight"><small>Last</small>—</span>';
  const sets = last.entry.sets.filter(hasData);
  if (!sets.length) return '';
  const top = sets.reduce((a, b) => ((b.kg ?? -1) > (a.kg ?? -1) ? b : a), sets[0]);
  const kg = top.kg == null ? 'BW' : fmtNum(top.kg);
  const tail = top.hold != null ? `${fmtNum(top.hold)} s` : top.reps != null ? `× ${fmtNum(top.reps)}` : 'kg';
  return `<span class="prevbadge ${last.baseline ? 'base' : ''}" aria-label="Last time ${kg}${top.kg != null ? ' kg' : ''} ${tail}"><small>${last.baseline ? 'Start' : 'Last'}</small>${kg}<small>${tail}</small></span>`;
}

function exerciseLogCard(prog, day, e, i) {
  const draft = getDraft(prog.id, day.id)[e.id] || {};
  const last = lastEntryFor(e.name);
  const hint = progressionHint(e, prog.family);
  const tech = techOf(e);
  const mode = logMode(e);
  const planned = Math.max(1, Number(e.sets) || 1, mode === 'singles' ? tech.sets : 1);
  const extra = Math.max(0, Number(draft.extra) || 0);
  const nSets = planned + extra;
  const ref = `${esc(prog.id)}|${esc(day.id)}|${esc(e.id)}`;
  const base = `data-pid="${esc(prog.id)}" data-did="${esc(day.id)}" data-eid="${esc(e.id)}"`;
  const input = (s, field, ph, label, im = 'numeric') => `<input inputmode="${im}" placeholder="${esc(ph)}" value="${esc(draft.sets?.[s]?.[field] ?? '')}" aria-label="${esc(e.name)} ${label}" data-draft="${ref}|${s}|${field}">`;
  const rows = Array.from({ length: nSets }, (_, s) => {
    const ls = last?.entry.sets[s] || last?.entry.sets[last.entry.sets.length - 1];
    const kg = input(s, 'kg', ls?.kg ?? 'kg', `set ${s + 1} kg`, 'decimal');
    const label = s < planned ? `Set ${s + 1}` : `Extra ${s - planned + 1}`;
    if (mode === 'singles') return `<div class="setrow two"><span class="muted small">Rep ${s + 1}</span>${kg}<span class="muted">kg × 1</span></div>`;
    if (mode === 'hold') return `<div class="setrow"><span class="muted small">Hold</span>${kg}<span class="muted">kg ·</span>${input(s, 'hold', ls?.hold ?? 'sec', `set ${s + 1} seconds held`)}</div>`;
    const reps = input(s, 'reps', ls?.reps ?? 'reps', `set ${s + 1} reps`);
    if (mode === 'failhold') return `<div class="setrow three"><span class="muted small">Set</span>${kg}<span class="muted">×</span>${reps}<span class="muted">+</span>${input(s, 'hold', ls?.hold ?? 'sec', `set ${s + 1} hold seconds`)}</div>`;
    return `<div class="setrow ${s >= planned ? 'extra' : ''}"><span class="muted small">${label}</span>${kg}<span class="muted">kg ×</span>${reps}</div>`;
  }).join('');
  const prevSs = i > 0 && day.exercises[i - 1].ss;
  return `<div class="excard ${e.ss ? 'ss-start' : ''} ${prevSs ? 'ss-end' : ''}">
    <div class="row between"><span class="grow"><b>${esc(e.name)}</b><br><span class="muted small">${esc(e.sets)} × ${esc(e.reps)}</span></span>${prevBadge(last)}</div>
    ${tech ? `<p class="small"><span class="chip tech">${esc(tech.name)}</span> ${esc(tech.summary)}</p>` : ''}
    ${e.note ? `<p class="muted small">${esc(e.note)}</p>` : ''}
    ${e.ss ? '<p class="small accent">Superset: go straight to the next exercise, no rest.</p>' : ''}
    ${last ? `<p class="muted small">${last.baseline ? 'Starting point' : 'Last'} (${fmtDate(last.date)}): ${last.entry.sets.filter(hasData).map(setText).join(', ')}${last.entry.note ? ` · ${esc(last.entry.note)}` : ''}</p>` : ''}
    ${hint ? `<p class="small good-text">▲ ${esc(hint)}</p>` : ''}
    ${rows}
    <div class="row wrap">
      ${mode === 'singles' ? '<button class="small-btn" data-act="rp-timer">10 s rest</button>' : `<button class="small-btn" data-act="set-add" ${base}>+ Add set</button>`}
      ${extra ? `<button class="small-btn" data-act="set-del" ${base}>− Remove extra set</button>` : ''}
      ${last ? `<button class="small-btn" data-act="copy-last" ${base}>Fill from last time</button>` : ''}
      <input class="grow" placeholder="Note (forced reps, negatives, feel…)" value="${esc(draft.note || '')}" aria-label="${esc(e.name)} note" data-draft="${ref}|note">
    </div>
  </div>`;
}

function sessionFeelCard(prog, day) {
  const dr = getDraft(prog.id, day.id)._session || {};
  return `<div class="excard">
    <b>How did it feel?</b>
    ${segmented('feel', FEELS, dr.feel, 'How the session felt', `data-pid="${esc(prog.id)}" data-did="${esc(day.id)}"`)}
    <input placeholder="Session notes (energy, pumps, sleep, anything off…)" value="${esc(dr.note || '')}" aria-label="Session notes" data-draft="${esc(prog.id)}|${esc(day.id)}|_session|note">
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
      <button class="small-btn" data-act="ex-move" data-dir="-1" ${base} ${i === 0 ? 'disabled' : ''}>↑ Up</button>
      <button class="small-btn" data-act="ex-move" data-dir="1" ${base} ${i === day.exercises.length - 1 ? 'disabled' : ''}>↓ Down</button>
      <button class="small-btn danger" data-act="ex-del" ${base}>Remove</button>
    </div>
  </div>`;
}

function techniqueCards() {
  return `<section class="card"><h2>Advanced techniques</h2>
    <p class="muted small">Tag an exercise with a technique in Edit exercises and the logger changes to match: singles for Rest-Pause, Omni-Contraction and Infitonic; seconds held for static holds.</p>
    ${TECHNIQUES.map((t) => `<details class="tech-card"><summary><b>${esc(t.name)}</b><br><span class="muted small">${esc(t.summary)}</span></summary>
      <ol class="small">${t.how.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      <p class="small accent">${esc(t.rules)}</p><p class="muted small">Source: ${esc(t.source)}</p></details>`).join('')}
  </section>`;
}

function viewTrainLog() {
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
  const tmpl = PROGRAM_TEMPLATES.find((t) => t.id === prog.template);
  const tier = TIERS.find(([k]) => k === S.settings.tier);
  const pd = `data-pid="${esc(prog.id)}" data-did="${esc(day.id)}"`;
  return `
  ${segmented('family', [['cycle', '4-Week Cycle'], ['hit', 'Mentzer HIT']], fam, 'Training style')}
  ${fam === 'hit' ? `${segmented('tier', TIERS.map(([k, l]) => [k, l]), S.settings.tier, 'Mentzer level')}<p class="muted small tierdesc">${esc(tier[2])}</p>` : ''}
  <div class="chiprow">${programs(fam, fam === 'hit' ? S.settings.tier : null).map((p) => `<button class="pchip" data-act="pick-program" data-v="${esc(p.id)}" aria-pressed="${p.id === prog.id}">${esc(p.name)}</button>`).join('')}</div>
  ${done.length ? `<section class="card slim"><p>${chip('✓ Trained today', 'good')} <span class="muted small">${done.map((w) => esc(w.dayName)).join(', ')}</span></p></section>` : ''}
  <section class="card">
    <div class="row between wrap"><h3>${esc(prog.name)}</h3>${rec ? chip(rec.text, rec.cls) : chip(`Cycle week ${((cycleWeek() - 1) % 4 + 4) % 4 + 1}`)}</div>
    ${prog.about ? `<p class="muted small">${esc(prog.about)}</p>` : ''}
    ${prog.source ? `<p class="muted small">Source: ${esc(prog.source)}</p>` : ''}
    ${dayButtons}
    <div class="row between wrap"><h3 class="dayname">${esc(day.name)}</h3>
      <button class="small-btn" data-act="toggle-edit" aria-pressed="${ui.editProgram}">${ui.editProgram ? 'Done editing' : 'Edit exercises'}</button></div>
    ${ui.editProgram ? `
      <label class="field">Day name<input value="${esc(day.name)}" data-edit="dayname" ${pd}></label>
      ${day.exercises.map((e, i) => exerciseEditRow(prog, day, e, i)).join('')}
      <div class="grid2">
        <button data-act="ex-add" ${pd}>+ Add exercise</button>
        <button data-act="day-add" data-pid="${esc(prog.id)}">+ Add day</button>
      </div>
      ${prog.days.length > 1 ? `<button class="danger" data-act="day-del" ${pd}>Delete this day</button>` : ''}
      ${tmpl ? `<button class="ghost" data-act="prog-reset" data-pid="${esc(prog.id)}">Reset programme to the original</button>` : ''}
    ` : `
      ${day.exercises.map((e, i) => exerciseLogCard(prog, day, e, i)).join('')}
      ${sessionFeelCard(prog, day)}
      <button class="primary" data-act="complete" ${pd}>Complete session</button>
      ${draftStarted(prog.id, day.id) ? `<button class="ghost danger" data-act="draft-clear" ${pd}>Clear what I've entered</button>` : ''}
    `}
  </section>
  ${fam === 'hit' && S.settings.tier === 'advanced' ? techniqueCards() : ''}
  ${fam === 'hit' ? `<section class="card"><h2>Mentzer principles</h2><div class="list">${MENTZER_PRINCIPLES.map(([h, t]) => `<div><b>${esc(h)}</b><br><span class="muted small">${esc(t)}</span></div>`).join('')}</div></section>` : ''}`;
}

function viewTrainHistory() {
  const prs = prSessions();
  const hist = [...S.workouts].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
  const recs = records();
  return `
  <section class="card">
    <h2>Sessions <span class="right">${S.workouts.length}</span></h2>
    ${hist.length ? `<div class="list">${hist.map((w) => `<div>
      <div class="row between"><button class="linkish grow" data-act="open-session" data-id="${esc(w.id)}" aria-expanded="${ui.openSession === w.id}"><b>${esc(w.dayName)}</b>${prs.has(w.id) ? ` ${chip('PR', 'good')}` : ''}<br><span class="muted small">${fmtDate(w.date)} ${fmtTime(w.at)} · ${esc(w.programName || '')}</span></button>
      <button class="icon ghost" data-act="del-workout" data-id="${esc(w.id)}" aria-label="Delete session">✕</button></div>
      ${w.feel || w.note ? `<p class="small">${w.feel ? chip(`Felt: ${FEELS.find(([k]) => k === w.feel)?.[1] || ''}`, w.feel >= 4 ? 'good' : w.feel <= 2 ? 'warn' : '') : ''} ${w.note ? `<span class="muted">${esc(w.note)}</span>` : ''}</p>` : ''}
      ${ui.openSession === w.id ? `<div class="small muted">${(w.entries || []).map((e) => `${esc(e.name)}: ${e.sets.map(setText).join(', ')}${e.note ? ` (${esc(e.note)})` : ''}`).join('<br>') || 'No sets logged.'}</div>` : ''}
    </div>`).join('')}</div>` : '<p class="muted">No sessions yet. Log one in Workout and it shows here.</p>'}
  </section>
  <section class="card">
    <h2>Personal records <span class="right">estimated 1-rep max</span></h2>
    ${recs.length ? `<div class="list">${recs.map((r) => `<div class="row between"><span class="grow"><b>${esc(r.name)}</b><br><span class="muted small">${setText(r.set)} · ${fmtDate(r.date)}</span></span><b class="nowrap">${fmtNum(round1(r.e1rm))} kg</b></div>`).join('')}</div>` : '<p class="muted">Records appear once you log weight and reps.</p>'}
  </section>`;
}

// ===========================================================================
// FUEL
// ===========================================================================
function viewFuelLog() {
  const d = ui.fuelDate || today();
  const meals = mealsOn(d);
  return `
  ${dateNav('fuel-date', d)}
  <section class="card"><h2>Totals</h2>${macroBars(macrosOn(d))}</section>
  <div class="grid2">
    <button class="primary" data-act="food-picker">+ Add food</button>
    <button data-act="oneoff">+ One-off meal</button>
  </div>
  <button data-act="scan-food">Scan a barcode</button>
  ${quickAdd() ? `<div class="row wrap">${quickAdd()}</div>` : ''}
  <section class="card">
    <h2>Meals · ${d === today() ? 'today' : fmtDate(d)} <span class="right">${meals.length}</span></h2>
    ${meals.length ? `<div class="list">${meals.map((m) => `<div class="row between">
        <button class="linkish grow" data-act="edit-meal" data-id="${esc(m.id)}"><b>${esc(m.name)}</b>${(m.servings ?? 1) !== 1 ? ` <span class="chip">×${fmtNum(m.servings)}</span>` : ''}<br><span class="muted small">${esc(m.slot || slotForTime(m.at))} · ${fmtTime(m.at)} · ${macroLine(mealTotals(m))}</span></button>
        <button class="icon ghost" data-act="del-meal" data-id="${esc(m.id)}" aria-label="Delete ${esc(m.name)}">✕</button></div>`).join('')}</div>` : '<p class="muted">Nothing logged for this day.</p>'}
    <button class="ghost" data-act="copy-yesterday" data-date="${d}">Copy meals from the day before</button>
    <p class="muted small">Tap a meal to change servings, macros, time or date.</p>
  </section>`;
}

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
    ${rcp.ingredients?.length || prep || rcp.method ? `<button class="ghost howto" data-act="open-recipe" data-id="${esc(rcp.id)}" aria-expanded="${open}">${open ? 'Hide method' : 'Ingredients & method'} ${open ? '▴' : '▾'}</button>` : ''}
    ${open ? `<div class="rbody">
      ${rcp.ingredients?.length ? `<p class="rlabel">Ingredients${rcp.serves > 1 ? ` (makes ${rcp.serves})` : ''}</p>
      <div class="ings">${rcp.ingredients.map((x, i) => `<button class="check" role="checkbox" aria-checked="${!!checks[i]}" data-act="ing-tick" data-id="${esc(rcp.id)}" data-i="${i}"><span class="box" aria-hidden="true">${checks[i] ? '✓' : ''}</span><span class="${checks[i] ? 'struck' : ''}">${esc(x)}</span></button>`).join('')}</div>` : ''}
      ${prep ? `<p class="rlabel">Method <span class="muted small">· prep ${prep[0]} min${prep[1] ? ` · cook ${prep[1]} min` : ''}</span></p>
      <ol class="steps">${prep[2].map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      ${prep[3] ? `<p class="small tip">💡 ${esc(prep[3])}</p>` : ''}` : rcp.method ? `<p class="small">${esc(rcp.method)}</p>` : ''}
    </div>` : ''}
    <div class="row wrap rfoot">
      <button class="small-btn primary" data-act="pick-food" data-id="${esc(rcp.id)}">Log it…</button>
      ${rcp.mine ? `<button class="small-btn" data-act="edit-myfood" data-id="${esc(rcp.id)}">Edit</button>` : ''}</div>
  </article>`;
}

function filteredFoods() {
  const f = ui.recipeFilter, q = ui.recipeQuery.trim().toLowerCase();
  return foodLibrary().filter((x) => {
    if (f === 'Staples' && x.kind !== 'staple') return false;
    if (f === 'My foods' && x.kind !== 'mine') return false;
    if (MEAL_TYPES.includes(f) && x.meal !== f) return false;
    if (f === 'High protein' && !(x.p >= 25 && mealKcal(x) <= 450)) return false;
    if (f === 'All' && x.kind === 'staple') return false;
    return !q || x.name.toLowerCase().includes(q) || (x.ingredients || []).some((i) => i.toLowerCase().includes(q));
  });
}

function viewFuelRecipes() {
  const filters = ['All', 'High protein', 'Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dressing', 'Juice', 'Staples', 'My foods'];
  return `
  <section class="card">
    <label class="field" for="recipe-q">Search recipes and ingredients<input id="recipe-q" type="search" value="${esc(ui.recipeQuery)}" placeholder="e.g. chicken, salmon, oat" data-live="recipe-q"></label>
    <div class="chiprow">${filters.map((x) => `<button class="pchip" data-act="recipe-filter" data-v="${esc(x)}" aria-pressed="${ui.recipeFilter === x}">${esc(x)}</button>`).join('')}</div>
    <p class="muted small">Dolce Diet recipes from <i>Living Lean</i>. Macros are per-serving estimates from the ingredients as written.</p>
  </section>
  <div class="rgrid">${filteredFoods().map(recipeCard).join('') || '<section class="card"><p class="muted">No matches.</p></section>'}</div>
  <button data-act="new-myfood">+ Create my own food or recipe</button>`;
}

// ===========================================================================
// BODY
// ===========================================================================
function viewBodyWeight() {
  const d = today();
  const st = S.settings;
  const list = weightsSorted();
  const lw = list[list.length - 1];
  const start = st.startWeight ?? list[0]?.kg ?? null;
  const avg7 = avgWeight(d, 7);
  const lost = start != null && lw ? start - lw.kg : null;
  const toGo = lw && st.target ? lw.kg - st.target : null;
  const pct = start != null && st.target && start !== st.target && lw ? Math.max(0, Math.min(1, (start - lw.kg) / (start - st.target))) : 0;
  const recent = list.filter((x) => x.date >= addDays(d, -59));
  return `
  <section class="card">
    <h2>Weight</h2>
    <div class="stats">
      <div class="stat"><b>${lw ? fmtNum(lw.kg) : '—'}</b><span>latest kg</span></div>
      <div class="stat"><b>${avg7 ? fmtNum(round1(avg7)) : '—'}</b><span>7-day avg</span></div>
      <div class="stat"><b>${lost != null ? `${lost >= 0 ? '−' : '+'}${fmtNum(round1(Math.abs(lost)))}` : '—'}</b><span>since start</span></div>
      <div class="stat"><b>${toGo != null ? fmtNum(round1(Math.max(0, toGo))) : '—'}</b><span>kg to ${fmtNum(st.target)}</span></div>
    </div>
    ${start != null && lw ? `${bar(pct, 1, 'good')}<p class="muted small">${Math.round(pct * 100)}% of the way from ${fmtNum(start)} kg to ${fmtNum(st.target)} kg</p>` : ''}
    ${spark(recent.map((x) => Number(x.kg)))}
    <form id="weight-form" class="grid2" autocomplete="off">
      <label class="field">Weight (kg)<input name="kg" inputmode="decimal" required></label>
      <label class="field">Date<input name="date" type="date" value="${d}" max="${d}" required></label>
      <button class="primary" style="grid-column:1/-1" type="submit">Save weigh-in</button>
    </form>
  </section>
  <section class="card">
    <h2>Weigh-ins <span class="right">${list.length}</span></h2>
    ${list.length ? `<div class="list">${[...list].reverse().slice(0, 30).map((w) => `<div class="row between"><span class="grow">${fmtDate(w.date)}</span><b>${fmtNum(w.kg)} kg</b><button class="icon ghost" data-act="del-weight" data-date="${esc(w.date)}" aria-label="Delete weigh-in for ${fmtDate(w.date)}">✕</button></div>`).join('')}</div>` : '<p class="muted">No weigh-ins yet.</p>'}
  </section>`;
}

// US Navy body-fat estimate from height, waist and neck (and hips for women), all in cm.
function navyBodyFat(m) {
  const h = S.settings.heightCm;
  if (!h || !m.waist || !m.neck) return null;
  if (S.settings.sex === 'female') {
    if (!m.hips || m.waist + m.hips <= m.neck) return null;
    return round1(495 / (1.29579 - 0.35004 * Math.log10(m.waist + m.hips - m.neck) + 0.22100 * Math.log10(h)) - 450);
  }
  if (m.waist <= m.neck) return null;
  return round1(495 / (1.0324 - 0.19077 * Math.log10(m.waist - m.neck) + 0.15456 * Math.log10(h)) - 450);
}

// ---- progress photos (photos.js): front, side and back, first next to latest
const POSES = ['front', 'side', 'back'];
let photoUrls = [];
function photosCard() {
  return `<section class="card" id="photos-card"><h2>Progress photos <span class="right">every 2–4 weeks</span></h2>
    <div class="grid3">${POSES.map((pose) => `<label class="btn">+ ${cap(pose)}<input type="file" accept="image/*" class="sr photo-in" data-pose="${pose}" aria-label="Add a ${pose} photo"></label>`).join('')}</div>
    <div id="photo-grid"><p class="muted small">Loading…</p></div>
    <p class="muted small">Same light, same place, same time of day. Photos stay on this phone only: they aren't in backups and never leave the device.</p></section>`;
}
async function fillPhotos() {
  const grid = document.getElementById('photo-grid');
  if (!grid) return;
  let all;
  try { all = (await Photos.all()).filter((p) => POSES.includes(p.pose)); } catch { grid.innerHTML = '<p class="muted small">Photos aren\'t available in this browser.</p>'; return; }
  if (!document.getElementById('photo-grid')) return;
  for (const u of photoUrls) URL.revokeObjectURL(u);
  photoUrls = [];
  if (!all.length) { grid.innerHTML = '<p class="muted small">No photos yet. Take your first set today.</p>'; return; }
  const img = (p) => { const u = URL.createObjectURL(p.blob); photoUrls.push(u); return `<figure><img src="${u}" alt="${p.pose} photo, ${fmtDate(p.date)}"><figcaption>${fmtDate(p.date)} <button class="icon ghost" data-act="photo-del" data-id="${esc(p.id)}" aria-label="Delete ${p.pose} photo from ${fmtDate(p.date)}">✕</button></figcaption></figure>`; };
  grid.innerHTML = POSES.map((pose) => {
    const ps = all.filter((p) => p.pose === pose).sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));
    if (!ps.length) return '';
    const f = ps[0], l = ps[ps.length - 1];
    const shown = ui.photoAll === pose ? ps : f === l ? [f] : [f, l];
    return `<div class="photo-row"><div class="row between"><b class="small">${cap(pose)}${ps.length > 1 ? ` <span class="muted">· first and latest, ${daysBetween(f.date, l.date)} days apart</span>` : ''}</b>
      ${ps.length > 2 ? `<button class="small-btn ghost" data-act="photo-all" data-v="${pose}">${ui.photoAll === pose ? 'Show less' : `All ${ps.length}`}</button>` : ''}</div>
      <div class="pair">${shown.map(img).join('')}</div></div>`;
  }).join('');
}

function viewBodyMeasure() {
  const meas = [...S.measurements].sort((a, b) => b.date.localeCompare(a.date));
  const first = meas[meas.length - 1];
  const last = meas[0];
  const bf = last ? navyBodyFat(last) : null;
  const waists = [...meas].reverse().filter((m) => m.waist != null).map((m) => m.waist);
  return `
  <section class="card">
    <h2>Measurements (cm)</h2>
    ${last ? `<div class="stats">
      ${MEASURES.filter((m) => last[m] != null).map((m) => {
        const d = first && first !== last && first[m] != null ? round1(last[m] - first[m]) : null;
        return `<div class="stat"><b>${fmtNum(last[m])}</b><span>${cap(m)}${d !== null ? ` · ${d > 0 ? '+' : ''}${fmtNum(d)}` : ''}</span></div>`;
      }).join('')}
      ${bf !== null ? `<div class="stat"><b>${fmtNum(bf)}%</b><span>Body fat (Navy est.)</span></div>` : ''}
    </div>
    ${waists.length > 1 ? `<p class="muted small">Waist trend</p>${spark(waists)}` : ''}
    <p class="muted small">Changes are since your first entry (${fmtDate(first.date)}).${S.settings.heightCm ? '' : ` Add your height in Body → Settings for a body-fat estimate from waist and neck${S.settings.sex === 'female' ? ' and hips' : ''}.`}</p>` : ''}
    <form id="meas-form" class="grid3" autocomplete="off">
      ${MEASURES.map((m) => `<label class="field">${cap(m)}<input name="${m}" inputmode="decimal" placeholder="${last?.[m] ?? ''}"></label>`).join('')}
      <label class="field" style="grid-column:1/-1">Date<input name="date" type="date" value="${today()}" max="${today()}"></label>
      <button class="primary" style="grid-column:1/-1" type="submit">Save measurements</button>
    </form>
    <p class="muted small">Measure weekly, same time of day, tape level and snug. Waist at the navel; neck just below the Adam's apple; arms and thighs at the widest point.</p>
  </section>
  <section class="card">
    <h2>History <span class="right">${meas.length}</span></h2>
    ${meas.length ? `<div class="list">${meas.slice(0, 20).map((x) => `<div class="row between"><span class="grow"><b>${fmtDate(x.date)}</b><br><span class="muted small">${MEASURES.filter((m) => x[m] != null).map((m) => `${m} ${fmtNum(x[m])}`).join(' · ')}${navyBodyFat(x) !== null ? ` · ${fmtNum(navyBodyFat(x))}% BF` : ''}</span></span>
      <button class="icon ghost" data-act="del-meas" data-date="${esc(x.date)}" aria-label="Delete measurements for ${fmtDate(x.date)}">✕</button></div>`).join('')}</div>` : '<p class="muted">No measurements yet.</p>'}
  </section>
  ${photosCard()}`;
}

function viewBodySettings() {
  const st = S.settings;
  const iron = ironData();
  return `
  <section class="card">
    <h2>Daily targets</h2>
    <form id="targets-form" class="grid2" autocomplete="off">
      <label class="field">Calories (kcal)<input name="kcalGoal" inputmode="numeric" value="${st.kcalGoal}" required></label>
      <label class="field">Protein (g)<input name="proteinGoal" inputmode="numeric" value="${st.proteinGoal}" required></label>
      <label class="field">Carbs (g)<input name="carbGoal" inputmode="numeric" value="${st.carbGoal}" required></label>
      <label class="field">Fat (g)<input name="fatGoal" inputmode="numeric" value="${st.fatGoal}" required></label>
      <label class="field">Start weight (kg)<input name="startWeight" inputmode="decimal" value="${st.startWeight ?? ''}" placeholder="first weigh-in"></label>
      <label class="field">Target weight (kg)<input name="target" inputmode="decimal" value="${st.target ?? ''}"></label>
      <label class="field">Height (cm)<input name="heightCm" inputmode="decimal" value="${st.heightCm ?? ''}" placeholder="for body fat"></label>
      <label class="field">Sex (for body fat)<select name="sex"><option value="male" ${st.sex !== 'female' ? 'selected' : ''}>Male</option><option value="female" ${st.sex === 'female' ? 'selected' : ''}>Female</option></select></label>
      <label class="field">4-week cycle started<input name="cycleStart" type="date" value="${esc(st.cycleStart)}" required></label>
      <button class="primary" style="grid-column:1/-1" type="submit">Save</button>
    </form>
    <button class="ghost" data-act="setup">Work out targets from my stats again</button>
  </section>
  <section class="card">
    <h2>From Iron &amp; Eggs</h2>
    ${iron
      ? `<p class="small">Bring over your weigh-ins (${(iron.weights || []).length}), measurements (${(iron.measurements || []).length}), sessions (${(iron.workouts || []).length}), exercise weights, programmes, meals (${(iron.meals || []).length}), your foods and macro targets. Iron &amp; Eggs isn't changed.</p>
         <button data-act="bring-iron">Replace this app's data with Iron &amp; Eggs data</button>`
      : '<p class="muted small">Iron &amp; Eggs data isn\'t in this browser. Open this app from the same site and phone as Iron &amp; Eggs to copy it, or restore a backup below.</p>'}
  </section>
  <section class="card">
    <h2>Backup</h2>
    <p class="muted small">Everything lives only in this browser. Save a backup file now and then.</p>
    <div class="grid2"><button data-act="backup">Save backup file</button><label class="btn" for="restore-file">Restore…</label></div>
    <input id="restore-file" type="file" accept="application/json,.json" class="sr">
  </section>
  <section class="card">
    <h2>Display</h2>
    <label class="field check-field"><span>High contrast</span><input type="checkbox" id="hc-toggle" ${st.highContrast ? 'checked' : ''}></label>
  </section>
  <section class="card">
    <h2>Reset</h2>
    <button class="danger" data-act="reset-all">Delete all data</button>
  </section>`;
}

// ===========================================================================
// Sheets (bottom panels for forms and confirmations)
// ===========================================================================
let scanState = null;
function closeSheet() {
  if (scanState) { Scan.stop(); scanState = null; }
  document.querySelector('.sheet-wrap')?.remove();
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

let askYes = null;
function ask(message, yesLabel, onYes) {
  askYes = onYes;
  openSheet('Confirm', `<p class="ask-text">${esc(message)}</p><div class="ask-btns">
    <button type="button" data-act="sheet-close">Cancel</button>
    <button type="button" class="primary" data-act="ask-yes">${esc(yesLabel)}</button></div>`);
}

const slotSelect = (id, selected) => `<label class="field">Meal<select id="${id}" name="slot">${LOG_SLOTS.map((s) => `<option ${s === selected ? 'selected' : ''}>${s}</option>`).join('')}</select></label>`;

function mealForm(id, m, extra = '') {
  return `<form id="${id}" class="grid2" autocomplete="off" ${m.id ? `data-id="${esc(m.id)}"` : ''}>
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

function myFoodForm(f = {}) {
  return `<form id="myfood-form" class="grid2" autocomplete="off" ${f.id ? `data-id="${esc(f.id)}"` : ''}>
    <label class="field" style="grid-column:1/-1">Name<input name="name" required maxlength="80" value="${esc(f.name || '')}"></label>
    <label class="field">Type<select name="meal">${MEAL_TYPES.map((t) => `<option ${t === (f.meal || 'Snack') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="field">Servings it makes<input name="serves" inputmode="numeric" value="${f.serves ?? 1}"></label>
    <label class="field">kcal per serving<input name="kcal" inputmode="decimal" value="${f.kcal ?? ''}" placeholder="auto from macros"></label>
    <label class="field">Protein (g)<input name="p" inputmode="decimal" value="${f.p ?? ''}"></label>
    <label class="field">Carbs (g)<input name="c" inputmode="decimal" value="${f.c ?? ''}"></label>
    <label class="field">Fat (g)<input name="f" inputmode="decimal" value="${f.f ?? ''}"></label>
    <label class="field" style="grid-column:1/-1">Ingredients (one per line)<textarea name="ingredients">${esc((f.ingredients || []).join('\n'))}</textarea></label>
    <label class="field" style="grid-column:1/-1">Method<textarea name="method">${esc(f.method || '')}</textarea></label>
    <button class="primary" style="grid-column:1/-1" type="submit">Save</button>
    ${f.id ? `<button class="ghost danger" style="grid-column:1/-1" type="button" data-act="del-myfood" data-id="${esc(f.id)}">Delete this food</button>` : ''}
  </form>`;
}

function openFoodPicker() {
  openSheet('Add food', `
    ${slotSelect('picker-slot', slotForTime(new Date().toISOString()))}
    <label class="field" for="picker-q">Search<input id="picker-q" type="search" placeholder="Name or ingredient" data-live="picker-q"></label>
    <div class="list picker-list">${foodLibrary().map((x) => `<button class="linkish pick" data-act="pick-food" data-id="${esc(x.id)}" data-name="${esc((x.name + ' ' + (x.ingredients || []).join(' ')).toLowerCase())}">
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

// Barcode scanning (scan.js) into the food log.
function scanSheet() {
  scanState = { status: 'idle', food: null, msg: '', code: '' };
  drawScan();
}
function drawScan() {
  const sc = scanState, f = sc.food;
  const recent = (S.scanned || []).slice(0, 6);
  const html = `
    ${sc.status === 'camera' ? '<video id="scan-video" playsinline muted aria-label="Camera view for scanning"></video><button type="button" data-act="scan-stop">Stop camera</button>' : ''}
    <form id="scan-form" class="row">${Scan.canScan() && sc.status !== 'camera' ? '<button type="button" data-act="scan-cam">Scan</button>' : ''}<input id="x-code" inputmode="numeric" placeholder="Barcode number" aria-label="Barcode number" value="${esc(sc.code)}"><button type="submit" style="white-space:nowrap" ${sc.status === 'loading' ? 'disabled' : ''}>${sc.status === 'loading' ? '…' : 'Look up'}</button></form>
    ${sc.msg ? `<p class="small ${sc.status === 'error' ? 'warn-text' : 'muted'}">${esc(sc.msg)}</p>` : ''}
    ${f ? `<form id="scan-add" class="grid2"><p class="small" style="grid-column:1/-1"><b>${esc(f.name)}</b><br><span class="muted">per 100 g: ${f.kcal} kcal · P ${round1(f.p)} · C ${round1(f.c)} · F ${round1(f.f)}</span></p>
      <label class="field">Grams eaten<input id="x-sg" inputmode="decimal" required value="${f.serving || ''}"></label><button class="primary" type="submit" style="align-self:end">Add to log</button></form>` : ''}
    ${recent.length && !f ? `<div class="row wrap">${recent.map((x) => `<button type="button" class="small-btn" data-act="scan-recent" data-v="${esc(x.code)}">${esc(x.name.split(' · ')[0])}</button>`).join('')}</div>` : ''}
    <p class="muted small">Looks up Open Food Facts; only the barcode is sent. Products are remembered for offline use.</p>`;
  const body = document.querySelector('.sheet-wrap .sheet-body');
  if (body && document.querySelector('.sheet-wrap [aria-label="Scan a barcode"]')) body.innerHTML = html;
  else openSheet('Scan a barcode', html);
}
async function scanLookup(code) {
  if (!scanState) return;
  const sc = scanState;
  sc.code = code;
  const known = (S.scanned || []).find((x) => x.code === code);
  if (known) { Object.assign(sc, { status: 'found', food: known, msg: 'Saved earlier, works offline.' }); drawScan(); return; }
  Object.assign(sc, { status: 'loading', food: null, msg: 'Looking it up…' }); drawScan();
  const res = await Scan.lookup(code);
  if (scanState !== sc) return;
  if (res.ok) {
    S.scanned = [res.food, ...(S.scanned || []).filter((x) => x.code !== code)].slice(0, 50); save();
    Object.assign(sc, { status: 'found', food: res.food, msg: 'From Open Food Facts. Check it against the pack.' });
  } else Object.assign(sc, { status: 'error', msg: res.error });
  drawScan();
}

const ACTIVITY = [['light', 'Light (train 2–3 days)', 1.375], ['moderate', 'Moderate (3–5 days)', 1.55], ['high', 'Very active (6–7 days)', 1.725]];
// A starting point from Mifflin-St Jeor: maintenance calories, then a deficit to lose or a small surplus to gain.
// Protein about 2 g per kg (of target weight when cutting), fat about 25% of calories, carbs the rest.
function suggestTargets({ sex, age, heightCm, weight, target, activity }) {
  if (!age || !heightCm || !weight) return null;
  const bmr = 10 * weight + 6.25 * heightCm - 5 * age + (sex === 'female' ? -161 : 5);
  const tdee = bmr * (ACTIVITY.find(([k]) => k === activity)?.[2] || 1.55);
  const goal = !target || Math.abs(target - weight) < 1 ? 'maintain' : target < weight ? 'lose' : 'gain';
  const floor = sex === 'female' ? 1200 : 1500;
  const kcal = Math.round(Math.max(floor, goal === 'lose' ? tdee - 500 : goal === 'gain' ? tdee + 300 : tdee) / 10) * 10;
  const protein = Math.round(2 * (goal === 'lose' ? Math.min(weight, target) : weight));
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { goal, tdee: Math.round(tdee), kcal, protein, fat, carbs };
}

function setupForm() {
  const st = S.settings;
  const lw = latestWeight();
  const progs = Object.values(S.programs);
  const progId = st.active[st.family];
  return `<form id="setup-form" class="grid2" autocomplete="off">
    <p class="small" style="grid-column:1/-1">Tell the app about you and it suggests daily targets. You can change any of it later in Body → Settings.</p>
    <label class="field">Sex<select name="sex"><option value="male" ${st.sex !== 'female' ? 'selected' : ''}>Male</option><option value="female" ${st.sex === 'female' ? 'selected' : ''}>Female</option></select></label>
    <label class="field">Age<input name="age" inputmode="numeric" value="${st.age ?? ''}" required></label>
    <label class="field">Height (cm)<input name="heightCm" inputmode="decimal" value="${st.heightCm ?? ''}" required></label>
    <label class="field">Weight now (kg)<input name="weight" inputmode="decimal" value="${lw?.kg ?? ''}" required></label>
    <label class="field">Target weight (kg)<input name="target" inputmode="decimal" value="${st.setupDone ? st.target ?? '' : ''}" required></label>
    <label class="field">Activity<select name="activity">${ACTIVITY.map(([k, l]) => `<option value="${k}" ${st.activity === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <label class="field" style="grid-column:1/-1">Training programme<select name="program">${progs.map((p) => `<option value="${esc(p.id)}" ${p.id === progId ? 'selected' : ''}>${esc(p.name)}${p.family === 'hit' ? ' (Mentzer HIT)' : ''}</option>`).join('')}</select></label>
    <p class="setup-sug small" id="setup-sug" style="grid-column:1/-1">Fill in your age, height and weight to get suggested targets.</p>
    <label class="field">Calories (kcal)<input name="kcalGoal" inputmode="numeric" value="${st.setupDone ? st.kcalGoal : ''}" required></label>
    <label class="field">Protein (g)<input name="proteinGoal" inputmode="numeric" value="${st.setupDone ? st.proteinGoal : ''}" required></label>
    <label class="field">Carbs (g)<input name="carbGoal" inputmode="numeric" value="${st.setupDone ? st.carbGoal : ''}" required></label>
    <label class="field">Fat (g)<input name="fatGoal" inputmode="numeric" value="${st.setupDone ? st.fatGoal : ''}" required></label>
    <button class="primary" style="grid-column:1/-1" type="submit">Save my targets</button>
    <p class="muted small" style="grid-column:1/-1">Suggestions are a starting estimate, not medical advice. Watch your weekly average weight and adjust by 100–200 kcal if it isn't moving the way you want.</p>
  </form>`;
}
// Recomputes the suggestion as the form changes; fills target boxes the user hasn't typed in themselves.
function refreshSetup(form) {
  const v = (k) => num(form.elements[k]?.value);
  const sug = suggestTargets({ sex: form.elements.sex.value, age: v('age'), heightCm: v('heightCm'), weight: v('weight'), target: v('target'), activity: form.elements.activity.value });
  const box = document.getElementById('setup-sug');
  if (!sug) { box.textContent = 'Fill in your age, height and weight to get suggested targets.'; return; }
  box.innerHTML = `<b>Suggested:</b> ${sug.kcal} kcal · protein ${sug.protein} g · carbs ${sug.carbs} g · fat ${sug.fat} g<br><span class="muted">Maintenance is about ${sug.tdee} kcal; this is set to ${sug.goal === 'lose' ? 'lose about 0.5 kg a week' : sug.goal === 'gain' ? 'gain slowly' : 'hold your weight'}.</span>`;
  for (const [k, val] of [['kcalGoal', sug.kcal], ['proteinGoal', sug.protein], ['carbGoal', sug.carbs], ['fatGoal', sug.fat]]) {
    const el = form.elements[k];
    if (!el.dataset.touched) el.value = val;
  }
}
function openSetup() {
  openSheet('Set up your targets', setupForm());
  const f = document.getElementById('setup-form');
  if (f) refreshSetup(f);
}

function showWelcome() {
  const iron = ironData();
  openSheet('Welcome to Gym & Fuel', `
    <p>Your training and nutrition in one place: workout programmes and a set logger, a food log with macro targets, recipes, barcode scanning, your weight, measurements and progress photos.</p>
    <p class="muted small">Everything stays on this phone. Nothing is uploaded or shared.</p>
    ${iron ? `<p class="small">Iron &amp; Eggs data is in this browser. Bring over your sessions, exercise weights, programmes, meals, weigh-ins, measurements and targets? Iron &amp; Eggs isn't changed.</p>
      <button class="primary" data-act="bring-iron-now">Bring my Iron &amp; Eggs data</button>
      <button data-act="setup">I'm new: set up my targets</button>`
      : '<button class="primary" data-act="setup">Set up my targets</button>'}`);
}

// ===========================================================================
// Render
// ===========================================================================
const ICONS = {
  today: '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  train: '<path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  fuel: '<path d="M7 3v8a3 3 0 0 0 3 3v7M7 3v5M10 3v5M17 3c-2 2-2 6 0 8v10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  body: '<path d="M4 18l5-5 4 3 7-8M15 8h5v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};

function viewFor() {
  switch (ui.tab) {
    case 'today': return viewToday();
    case 'train': return ui.sub.train === 'history' ? viewTrainHistory() : viewTrainLog();
    case 'fuel': return ui.sub.fuel === 'recipes' ? viewFuelRecipes() : viewFuelLog();
    case 'body': return { weight: viewBodyWeight, measure: viewBodyMeasure, settings: viewBodySettings }[ui.sub.body]?.() ?? viewBodyWeight();
  }
  return '';
}

let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3000);
}

function render(opts = {}) {
  document.documentElement.dataset.contrast = S.settings.highContrast ? 'high' : 'normal';
  const themeMeta = document.querySelector('meta[name=theme-color]');
  if (themeMeta) themeMeta.content = S.settings.highContrast ? '#000000' : '#121211';
  document.getElementById('title').textContent = ui.tab === 'today' ? 'Gym & Fuel' : TABS.find(([k]) => k === ui.tab)[1];
  const mac = macrosOn(today());
  document.getElementById('kcal-pill').textContent = `${Math.round(mac.kcal)} / ${S.settings.kcalGoal} kcal`;
  const subs = SUBTABS[ui.tab];
  document.getElementById('view').innerHTML = (subs ? `<div class="subtabs">${segmented('sub', subs, ui.sub[ui.tab], 'Section')}</div>` : '') + viewFor();
  document.getElementById('nav').innerHTML = TABS.map(([k, label]) =>
    `<button data-tab="${k}" ${ui.tab === k ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg><span>${label}</span></button>`).join('');
  if (opts.scrollTop) window.scrollTo(0, 0);
  if (ui.tab === 'body' && ui.sub.body === 'measure') fillPhotos();
  rememberUi();
}
function commit(opts) { save(); render(opts); }

// ===========================================================================
// Actions
// ===========================================================================
function addMealFromFood(food, servings, date, slot) {
  const d = date || ui.fuelDate || today();
  const at = nowOn(d);
  S.meals.push({ id: uid(), date: d, at, name: food.name, kcal: mealKcal(food), p: food.p ?? 0, c: food.c ?? 0, f: food.f ?? 0, servings, ref: food.id, kind: food.kind || 'recipe', slot: slot || slotForTime(at) });
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
      .filter(hasData)
      .map((s) => (s.hold == null ? { kg: s.kg, reps: s.reps } : s));
    return { exId: e.id, name: e.name, tech: e.tech || '', sets, note: (dr.note || '').trim() };
  }).filter((e) => e.sets.length || e.note);
  const sess = draft._session || {};
  const w = { id: uid(), date: today(), at: new Date().toISOString(), programId: pid, programName: prog.name, family: prog.family, dayId: did, dayName: day.name, entries };
  if (sess.feel) w.feel = Number(sess.feel);
  if ((sess.note || '').trim()) w.note = sess.note.trim();
  S.workouts.push(w);
  delete ui.drafts[draftKey(pid, did)];
  saveDrafts();
  ui.dayId = null;
  toast(prSessions().has(w.id) ? 'Session saved · new personal record!' : 'Session saved');
}

function downloadText(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function restoreFrom(txt) {
  let data;
  try { data = JSON.parse(txt || ''); } catch { data = null; }
  if (!data || data.kind !== 'gym-fuel-backup' || !data.state?.settings) { toast('That isn\'t a Gym & Fuel backup file'); return; }
  ask('Replace all current data with this backup?', 'Replace', () => { S = normalise(data.state); toast('Backup restored'); });
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
  if (tab) { ui.tab = tab.dataset.tab; ui.editProgram = false; render({ scrollTop: true }); return; }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const a = el.dataset.act;
  const { pid, did, eid } = el.dataset;

  switch (a) {
    case 'sheet-close': closeSheet(); return;
    case 'ask-yes': { const f = askYes; closeSheet(); askYes = null; if (f) { f(); commit({ scrollTop: true }); } return; }
    case 'sub': ui.sub[ui.tab] = el.dataset.v; render({ scrollTop: true }); return;
    case 'go-train': ui.tab = 'train'; ui.sub.train = 'log'; ui.dayId = did || null; ui.editProgram = false; render({ scrollTop: true }); return;
    case 'go-fuel': ui.tab = 'fuel'; ui.sub.fuel = 'log'; ui.fuelDate = today(); render({ scrollTop: true }); return;

    // ---- train
    case 'family': S.settings.family = el.dataset.v; ui.dayId = null; break;
    case 'tier': S.settings.tier = el.dataset.v; ui.dayId = null; break;
    case 'pick-program': S.settings.active[S.settings.family] = el.dataset.v; ui.dayId = null; break;
    case 'pick-day': ui.dayId = el.dataset.v; render(); return;
    case 'toggle-edit': ui.editProgram = !ui.editProgram; render(); return;
    case 'feel': { const dr = (getDraft(pid, did)._session ||= {}); dr.feel = dr.feel === Number(el.dataset.v) ? null : Number(el.dataset.v); saveDrafts(); render(); return; }
    case 'set-add': case 'set-del': {
      const dr = (getDraft(pid, did)[eid] ||= {});
      dr.extra = Math.max(0, (Number(dr.extra) || 0) + (a === 'set-add' ? 1 : -1));
      if (a === 'set-del') { const { ex } = findEx(pid, did, eid); dr.sets?.splice((Number(ex.sets) || 1) + dr.extra, 1); }
      saveDrafts(); render(); return;
    }
    case 'copy-last': {
      const { ex } = findEx(pid, did, eid);
      const last = lastEntryFor(ex.name);
      if (!last) return;
      const dr = (getDraft(pid, did)[eid] ||= {});
      const sets = last.entry.sets.filter(hasData);
      dr.sets = sets.map((s) => ({ kg: s.kg ?? '', reps: s.reps ?? '', hold: s.hold ?? '' }));
      dr.extra = Math.max(0, sets.length - (Number(ex.sets) || 1));
      saveDrafts(); render(); return;
    }
    case 'rp-timer': restTimer(el); return;
    case 'complete': {
      if (!draftStarted(pid, did)) { ask('Nothing entered yet. Save this session with no sets?', 'Save anyway', () => completeSession(pid, did)); return; }
      completeSession(pid, did); break;
    }
    case 'draft-clear': ask('Clear everything entered for this session?', 'Clear', () => { delete ui.drafts[draftKey(pid, did)]; saveDrafts(); }); return;
    case 'ex-move': {
      const { prog, day, i } = findEx(pid, did, eid);
      const j = i + Number(el.dataset.dir);
      if (j < 0 || j >= day.exercises.length) return;
      [day.exercises[i], day.exercises[j]] = [day.exercises[j], day.exercises[i]];
      prog.edited = true; break;
    }
    case 'ex-del': {
      const { prog, day, i, ex } = findEx(pid, did, eid);
      ask(`Remove ${ex.name} from ${day.name}?`, 'Remove', () => { day.exercises.splice(i, 1); prog.edited = true; });
      return;
    }
    case 'ex-add': {
      const prog = S.programs[pid];
      prog.days.find((d) => d.id === did).exercises.push({ id: uid(), name: 'New exercise', sets: 3, reps: '8–12', note: '', ss: false, tech: '' });
      prog.edited = true; break;
    }
    case 'day-add': {
      const prog = S.programs[pid];
      const day = { id: uid(), name: `Day ${prog.days.length + 1}`, exercises: [] };
      prog.days.push(day); prog.edited = true; ui.dayId = day.id; break;
    }
    case 'day-del': {
      const prog = S.programs[pid];
      const day = prog.days.find((d) => d.id === did);
      ask(`Delete ${day.name}? Logged sessions are kept.`, 'Delete', () => { prog.days = prog.days.filter((d) => d.id !== did); prog.edited = true; ui.dayId = null; });
      return;
    }
    case 'prog-reset': {
      const prog = S.programs[pid];
      ask(`Reset ${prog.name} to the original? Your edits to it are lost; logged sessions are kept.`, 'Reset', () => { S.programs[pid] = programFromTemplate(PROGRAM_TEMPLATES.find((t) => t.id === prog.template)); ui.dayId = null; });
      return;
    }
    case 'open-session': ui.openSession = ui.openSession === el.dataset.id ? null : el.dataset.id; render(); return;
    case 'del-workout': ask('Delete this session?', 'Delete', () => { S.workouts = S.workouts.filter((w) => w.id !== el.dataset.id); }); return;

    // ---- fuel
    case 'fuel-date': { const dir = Number(el.dataset.dir); ui.fuelDate = dir === 0 ? today() : addDays(ui.fuelDate || today(), dir); if (ui.fuelDate > today()) ui.fuelDate = today(); render(); return; }
    case 'food-picker': openFoodPicker(); return;
    case 'pick-food': {
      const food = findFood(el.dataset.id);
      const slot = document.getElementById('picker-slot')?.value;
      if (food) openServings(food, slot);
      return;
    }
    case 'log-food': {
      const food = findFood(el.dataset.id);
      addMealFromFood(food, Number(el.dataset.servings), null, document.getElementById('serv-slot')?.value);
      closeSheet(); toast(`Logged ${food.name.split(':')[0]}`); break;
    }
    case 'oneoff': openSheet('One-off meal', mealForm('oneoff-form', { date: ui.fuelDate || today() }, `<label class="field check-field" style="grid-column:1/-1"><span>Save to my foods too</span><input type="checkbox" name="keep"></label>`)); return;
    case 'edit-meal': { const m = S.meals.find((x) => x.id === el.dataset.id); if (m) openSheet('Edit meal', mealForm('meal-edit-form', m)); return; }
    case 'del-meal': S.meals = S.meals.filter((m) => m.id !== el.dataset.id); toast('Meal removed'); break;
    case 'copy-yesterday': {
      const d = el.dataset.date, prev = mealsOn(addDays(d, -1));
      if (!prev.length) { toast('Nothing logged the day before'); return; }
      for (const m of prev) S.meals.push({ ...m, id: uid(), date: d, at: atOn(d, fmtTime(m.at)) });
      toast(`Copied ${prev.length} meal${prev.length === 1 ? '' : 's'}`); break;
    }
    case 'recipe-filter': ui.recipeFilter = el.dataset.v; render(); return;
    case 'open-recipe': ui.openRecipe = ui.openRecipe === el.dataset.id ? null : el.dataset.id; render(); return;
    case 'ing-tick': { const c = (ui.ingChecks[el.dataset.id] ||= {}); c[el.dataset.i] = !c[el.dataset.i]; render(); return; }
    case 'new-myfood': openSheet('My food or recipe', myFoodForm()); return;
    case 'edit-myfood': openSheet('Edit my food', myFoodForm(S.myFoods.find((x) => x.id === el.dataset.id))); return;
    case 'del-myfood': S.myFoods = S.myFoods.filter((x) => x.id !== el.dataset.id); closeSheet(); toast('Food deleted'); break;
    case 'scan-food': scanSheet(); return;
    case 'scan-cam': {
      scanState.status = 'camera'; scanState.msg = 'Point the camera at the barcode.'; drawScan();
      Scan.start(document.getElementById('scan-video'), (code) => scanLookup(code)).catch(() => { Scan.stop(); if (scanState) { Object.assign(scanState, { status: 'error', msg: 'The camera isn\'t available. Type the number instead.' }); drawScan(); } });
      return;
    }
    case 'scan-stop': Scan.stop(); Object.assign(scanState, { status: 'idle', msg: '' }); drawScan(); return;
    case 'scan-recent': scanLookup(el.dataset.v); return;

    // ---- body
    case 'setup': openSetup(); return;
    case 'photo-all': ui.photoAll = ui.photoAll === el.dataset.v ? null : el.dataset.v; fillPhotos(); return;
    case 'photo-del': ask('Delete this photo?', 'Delete', () => { Photos.remove(el.dataset.id).then(() => render(), () => toast('Couldn\'t delete it')); }); return;
    case 'del-meas': S.measurements = S.measurements.filter((m) => m.date !== el.dataset.date); toast('Measurements removed'); break;
    case 'del-weight': S.weights = S.weights.filter((w) => w.date !== el.dataset.date); break;
    case 'bring-iron': ask('Replace everything in Gym & Fuel with your Iron & Eggs data?', 'Replace', () => { if (bringIron()) toast('Iron & Eggs data brought over'); }); return;
    case 'bring-iron-now': closeSheet(); if (bringIron()) toast('Iron & Eggs data brought over'); break;
    case 'backup': downloadText(`gym-fuel-${today()}.json`, JSON.stringify({ kind: 'gym-fuel-backup', at: new Date().toISOString(), state: S }), 'application/json'); toast('Backup saved'); return;
    case 'reset-all': ask('Delete all Gym & Fuel data on this phone? This can\'t be undone.', 'Delete everything', () => { S = freshState(); ui.drafts = {}; saveDrafts(); Photos.clear().catch(() => {}); }); return;
    default: return;
  }
  commit();
});

// Typing into set inputs saves the draft without re-rendering (so focus isn't lost).
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.draft) {
    const [pid, did, eid, s, field] = t.dataset.draft.split('|');
    const dr = (getDraft(pid, did)[eid] ||= {});
    if (s === 'note') dr.note = t.value;
    else { dr.sets ||= []; (dr.sets[Number(s)] ||= {})[field] = t.value; }
    saveDrafts();
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
  if (t.form?.id === 'setup-form') {
    if (['kcalGoal', 'proteinGoal', 'carbGoal', 'fatGoal'].includes(t.name)) t.dataset.touched = t.value.trim() ? '1' : '';
    else refreshSetup(t.form);
    return;
  }
  if (t.dataset.live === 'picker-q') {
    const q = t.value.trim().toLowerCase();
    document.querySelectorAll('.picker-list .pick').forEach((b) => { b.hidden = !!q && !b.dataset.name.includes(q); });
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.edit) {
    const { prog, day, ex } = findEx(t.dataset.pid, t.dataset.did, t.dataset.eid);
    const k = t.dataset.edit;
    if (k === 'dayname') { if (t.value.trim()) day.name = t.value.trim(); }
    else if (ex) {
      if (k === 'ss') ex.ss = t.checked;
      else if (k === 'sets') ex.sets = Math.max(1, Math.round(num(t.value) || 1));
      else if (k === 'name') { if (t.value.trim()) ex.name = t.value.trim(); }
      else ex[k] = t.value;
    }
    prog.edited = true;
    commit();
    return;
  }
  if (t.classList?.contains('photo-in')) {
    const file = t.files?.[0];
    if (file) Photos.add(today(), t.dataset.pose, file).then(() => { toast(`${cap(t.dataset.pose)} photo saved`); fillPhotos(); }, () => toast('Couldn\'t save the photo'));
    t.value = '';
    return;
  }
  if (t.id === 'hc-toggle') { S.settings.highContrast = t.checked; commit(); return; }
  if (t.id === 'restore-file') {
    const file = t.files?.[0];
    if (file) file.text().then(restoreFrom);
    t.value = '';
  }
});

const formNum = (fd, k) => num(fd.get(k));
function macrosFrom(fd) {
  const p = formNum(fd, 'p') ?? 0, c = formNum(fd, 'c') ?? 0, f = formNum(fd, 'f') ?? 0;
  return { kcal: formNum(fd, 'kcal') ?? Math.round(4 * p + 4 * c + 9 * f), p, c, f };
}

document.addEventListener('submit', (e) => {
  const f = e.target;
  e.preventDefault();
  const fd = new FormData(f);
  switch (f.id) {
    case 'scan-form': scanLookup(document.getElementById('x-code').value.trim()); return;
    case 'scan-add': {
      const food = scanState?.food, g = num(document.getElementById('x-sg').value);
      if (!food || !g || g <= 0) { toast('Enter the grams eaten'); return; }
      const k = g / 100;
      const d = ui.fuelDate || today(), at = nowOn(d);
      S.meals.push({ id: uid(), date: d, at, name: `${food.name} (${fmtNum(g)} g)`, kcal: Math.round(food.kcal * k), p: round1(food.p * k), c: round1(food.c * k), f: round1(food.f * k), servings: 1, ref: null, kind: 'scan', slot: slotForTime(at) });
      closeSheet(); toast('Added to your log'); break;
    }
    case 'weigh-form': case 'weight-form': {
      const kg = formNum(fd, 'kg');
      if (!kg || kg < 20 || kg > 400) { toast('Enter a weight in kg'); return; }
      const date = fd.get('date') || today();
      S.weights = S.weights.filter((w) => w.date !== date);
      S.weights.push({ date, kg: round1(kg) });
      if (S.settings.startWeight == null) S.settings.startWeight = round1(kg);
      toast(`${fmtNum(round1(kg))} kg saved`); break;
    }
    case 'targets-form': {
      const st = S.settings;
      for (const k of ['kcalGoal', 'proteinGoal', 'carbGoal', 'fatGoal']) { const v = formNum(fd, k); if (v != null && v >= 0) st[k] = Math.round(v); }
      st.startWeight = formNum(fd, 'startWeight');
      { const h = formNum(fd, 'heightCm'); st.heightCm = h && h > 100 && h < 250 ? h : null; }
      st.sex = fd.get('sex') === 'female' ? 'female' : 'male';
      const tgt = formNum(fd, 'target'); if (tgt) st.target = tgt;
      if (fd.get('cycleStart')) st.cycleStart = fd.get('cycleStart');
      toast('Saved'); break;
    }
    case 'setup-form': {
      const st = S.settings;
      const age = formNum(fd, 'age'), h = formNum(fd, 'heightCm'), w = formNum(fd, 'weight'), tgt = formNum(fd, 'target');
      if (!age || age < 13 || age > 100) { toast('Enter your age'); return; }
      if (!h || h < 100 || h > 250) { toast('Enter your height in cm'); return; }
      if (!w || w < 30 || w > 400 || !tgt || tgt < 30 || tgt > 400) { toast('Enter your weight and target in kg'); return; }
      Object.assign(st, { sex: fd.get('sex') === 'female' ? 'female' : 'male', age: Math.round(age), heightCm: round1(h), target: round1(tgt), activity: fd.get('activity') });
      for (const k of ['kcalGoal', 'proteinGoal', 'carbGoal', 'fatGoal']) { const v = formNum(fd, k); if (v != null && v >= 0) st[k] = Math.round(v); }
      const prog = S.programs[fd.get('program')];
      if (prog) { st.family = prog.family; st.active[prog.family] = prog.id; if (prog.family === 'hit') st.tier = prog.tier || 'intermediate'; }
      const lw = latestWeight();
      if (!lw || lw.kg !== round1(w)) { S.weights = S.weights.filter((x) => x.date !== today()); S.weights.push({ date: today(), kg: round1(w) }); }
      if (!st.setupDone || st.startWeight == null) st.startWeight = round1(w);
      st.setupDone = true;
      ui.dayId = null;
      closeSheet(); toast('Targets saved. Good luck!'); break;
    }
    case 'meas-form': {
      const date = fd.get('date') || today();
      const row = {};
      for (const m of MEASURES) { const v = formNum(fd, m); if (v != null && v > 0 && v < 300) row[m] = round1(v); }
      if (!Object.keys(row).length) { toast('Enter at least one measurement'); return; }
      const prev = S.measurements.find((x) => x.date === date) || {};
      S.measurements = S.measurements.filter((x) => x.date !== date);
      S.measurements.push({ ...prev, ...row, date });
      toast('Measurements saved'); break;
    }
    case 'servings-form': {
      const k = formNum(fd, 'servings');
      if (!k || k <= 0) { toast('Enter how many servings'); return; }
      const food = findFood(f.dataset.id);
      addMealFromFood(food, k, null, document.getElementById('serv-slot')?.value);
      closeSheet(); toast(`Logged ${food.name.split(':')[0]}`); break;
    }
    case 'oneoff-form': case 'meal-edit-form': {
      const name = String(fd.get('name') || '').trim();
      if (!name) return;
      const date = fd.get('date') || today();
      const m = f.id === 'meal-edit-form' ? S.meals.find((x) => x.id === f.dataset.id) : { id: uid(), kind: 'oneoff', ref: null };
      if (!m) return;
      Object.assign(m, { name, date, at: atOn(date, fd.get('time')), slot: fd.get('slot'), servings: formNum(fd, 'servings') || 1, ...macrosFrom(fd) });
      if (f.id === 'oneoff-form') {
        S.meals.push(m);
        if (fd.get('keep')) S.myFoods.push({ id: uid(), name, meal: m.slot, serves: 1, kcal: m.kcal, p: m.p, c: m.c, f: m.f, ingredients: [], method: '' });
      }
      ui.fuelDate = date;
      closeSheet(); toast('Saved'); break;
    }
    case 'myfood-form': {
      const name = String(fd.get('name') || '').trim();
      if (!name) return;
      const data = {
        name, meal: fd.get('meal'), serves: Math.max(1, Math.round(formNum(fd, 'serves') || 1)), ...macrosFrom(fd),
        ingredients: String(fd.get('ingredients') || '').split('\n').map((x) => x.trim()).filter(Boolean), method: String(fd.get('method') || '').trim(),
      };
      const cur = f.dataset.id && S.myFoods.find((x) => x.id === f.dataset.id);
      if (cur) Object.assign(cur, data); else S.myFoods.push({ id: uid(), ...data });
      closeSheet(); toast('Food saved'); break;
    }
    default: return;
  }
  commit();
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
// Coming back to the app on a new day shows the new day.
document.addEventListener('visibilitychange', () => { if (!document.hidden && !document.querySelector('.sheet-wrap') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) render(); });

render();
if (S.notice === 'start') { S.notice = null; save(); showWelcome(); }

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch(() => {}));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}
