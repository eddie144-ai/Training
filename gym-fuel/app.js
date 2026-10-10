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
      family: 'cycle', tier: 'intermediate', active: { cycle: 'my4week', hit: 'mentzer_ab', custom: null }, cycleStart: weekStart(today()),
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
    targetLog: [],
    fastDays: {},
    challenge: null,
    notice: null,
  };
}

function normalise(s) {
  if (!s || typeof s !== 'object') return freshState();
  const d = freshState();
  const out = { ...d, ...s, v: 1, settings: { ...d.settings, ...s.settings, active: { ...d.settings.active, ...(s.settings?.active || {}) } } };
  for (const k of ['workouts', 'meals', 'myFoods', 'scanned', 'weights', 'measurements', 'targetLog']) if (!Array.isArray(out[k])) out[k] = [];
  if (!out.programs || typeof out.programs !== 'object') out.programs = {};
  if (!out.baselines || typeof out.baselines !== 'object') out.baselines = {};
  if (!out.fastDays || typeof out.fastDays !== 'object' || Array.isArray(out.fastDays)) out.fastDays = {};
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
const isFast = (date) => !!S.fastDays?.[date];
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

const GIRONDA_MEALS = [['gironda1', 'Eggs + patties', '6 eggs · 3 pork patties'], ['gironda2', 'Steak + eggs', '6 eggs · 250 g steak']];
const hasIron = !!rawKey(IRON_KEY);
const girondaOn = () => S.settings.girondaBar ?? (hasIron || S.meals.some((m) => GIRONDA_MEALS.some(([id]) => id === m.ref)));
// Quick-add buttons: the foods this person logs most (last 30 days), so nobody sees someone else's staples.
function quickFoods(max = 3) {
  const from = addDays(today(), -29);
  const count = {};
  const bar = girondaOn();
  for (const m of S.meals) if (m.ref && m.date >= from && !(bar && GIRONDA_MEALS.some(([id]) => id === m.ref))) count[m.ref] = (count[m.ref] || 0) + 1;
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
// ===========================================================================
// Adaptive calorie target: your real maintenance from the last 3 weeks
// ===========================================================================
// Energy balance: maintenance = average intake − (weight change × 7,700 kcal per kg). The weight change is the
// slope of a straight line through the weigh-ins, so one salty day doesn't swing it. Needs 8+ weigh-ins over 14+
// days and 12+ days logged in the 21 days before today (today is still being logged). A day marked as a fast
// day counts as logged, at 0 kcal plus anything eaten that day.
const ADAPT_DAYS = 21, KCAL_PER_KG = 7700, MAX_STEP = 300;
function adaptive() {
  const to = addDays(today(), -1), from = addDays(to, -(ADAPT_DAYS - 1));
  const ws = S.weights.filter((w) => w.date >= from && w.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  const days = [...new Set([...S.meals.filter((m) => m.date >= from && m.date <= to).map((m) => m.date), ...Object.keys(S.fastDays || {}).filter((d) => isFast(d) && d >= from && d <= to)])];
  const fasts = days.filter(isFast).length;
  const span = ws.length ? daysBetween(ws[0].date, ws[ws.length - 1].date) : 0;
  const base = { from, to, weighIns: ws.length, span, foodDays: days.length, fasts };
  if (ws.length < 8 || span < 14 || days.length < 12) return { ...base, ready: false };
  const xs = ws.map((w) => daysBetween(from, w.date)), ys = ws.map((w) => Number(w.kg));
  const mx = sum(xs, (x) => x) / xs.length, my = sum(ys, (y) => y) / ys.length;
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
  const slope = sxx ? sxy / sxx : 0; // kg per day
  const intake = sum(days, (d) => macrosOn(d).kcal) / days.length;
  const tdee = intake - slope * KCAL_PER_KG;
  const out = { ...base, ready: true, slopeWeek: slope * 7, intake, tdee, current: my + slope * (xs[xs.length - 1] - mx) };
  if (tdee < 1200 || tdee > 5000) return { ...out, ready: false, odd: true };
  const st = S.settings, gap = (st.target ?? out.current) - out.current;
  out.goal = Math.abs(gap) < 1 ? 'maintain' : gap < 0 ? 'lose' : 'gain';
  const rateWeek = out.goal === 'lose' ? -0.5 : out.goal === 'gain' ? 0.25 : 0; // kg a week
  const floor = st.sex === 'female' ? 1200 : 1500;
  const ideal = Math.max(floor, tdee + (rateWeek * KCAL_PER_KG) / 7);
  const step = Math.max(-MAX_STEP, Math.min(MAX_STEP, ideal - st.kcalGoal));
  out.ideal = Math.round(ideal / 10) * 10;
  out.suggest = Math.max(floor, Math.round((st.kcalGoal + step) / 10) * 10);
  out.delta = out.suggest - st.kcalGoal;
  out.capped = Math.abs(ideal - st.kcalGoal) > MAX_STEP;
  return out;
}
// New calories with protein kept; carbs and fat share the rest as they do now (a low-carb plan stays low-carb).
function macrosFor(kcal) {
  const st = S.settings, rest = kcal - st.proteinGoal * 4;
  const ck = st.carbGoal * 4, fk = st.fatGoal * 9, tot = ck + fk;
  if (rest <= 0 || !tot) return { kcalGoal: kcal, carbGoal: st.carbGoal, fatGoal: st.fatGoal };
  return { kcalGoal: kcal, carbGoal: Math.round((rest * ck) / tot / 4), fatGoal: Math.round((rest * fk) / tot / 9) };
}
function adaptCard(a, where) {
  const st = S.settings;
  if (!a.ready) {
    return `<section class="card"><h2>Your real maintenance</h2>
      ${a.odd ? '<p class="small">The numbers don\'t add up yet. It usually means some meals or drinks weren\'t logged. Log everything for a week and it will settle.</p>'
        : `<p class="small">Needs about 3 weeks of your own data. In the last ${ADAPT_DAYS} days:</p>
      <div class="stats"><div class="stat"><b>${a.weighIns}/8</b><span>weigh-ins</span></div><div class="stat"><b>${a.span}/14</b><span>days between first and last</span></div><div class="stat"><b>${a.foodDays}/12</b><span>days logged (food or fast)</span></div></div>`}
      <p class="muted small">Then the app works out what you really burn from your weight trend and what you ate, and suggests a calorie target.</p></section>`;
  }
  const dir = a.slopeWeek < 0 ? 'losing' : 'gaining';
  const aim = a.goal === 'lose' ? 'lose about 0.5 kg a week' : a.goal === 'gain' ? 'gain about 0.25 kg a week' : 'hold your weight';
  const same = Math.abs(a.delta) < 100;
  return `<section class="card ${where === 'today' ? 'hero-card' : ''}" id="adapt-card"><h2>Your real maintenance <span class="right">last ${ADAPT_DAYS} days</span></h2>
    <div class="stats">
      <div class="stat"><b>${Math.round(a.tdee / 10) * 10}</b><span>kcal a day burned</span></div>
      <div class="stat"><b>${Math.round(a.intake)}</b><span>kcal a day eaten</span></div>
      <div class="stat"><b>${a.slopeWeek > 0 ? '+' : a.slopeWeek < 0 ? '−' : ''}${fmtNum(Math.abs(round1(a.slopeWeek)))} kg</b><span>a week (trend)</span></div>
    </div>
    <p class="small">You're ${Math.abs(a.slopeWeek) < 0.05 ? 'holding steady' : `${dir} ${fmtNum(Math.abs(round1(a.slopeWeek)))} kg a week`} on about ${Math.round(a.intake)} kcal. To ${aim}, eat about <b>${a.ideal} kcal</b> a day.</p>
    ${same ? `<p class="small good-text">✓ Your target of ${st.kcalGoal} kcal is right where it should be.</p>`
      : `<p class="small">Suggested target: <b>${a.suggest} kcal</b> (${a.delta > 0 ? '+' : '−'}${Math.abs(a.delta)} from ${st.kcalGoal})${a.capped ? `, a step of at most ${MAX_STEP} kcal a week towards ${a.ideal}` : ''}. Protein stays at ${st.proteinGoal} g; carbs and fat keep their share.</p>
      <div class="grid2"><button class="primary" data-act="adapt-apply" data-v="${a.suggest}">Use ${a.suggest} kcal</button>${where === 'today' ? '<button data-act="adapt-snooze">Not this week</button>' : '<span></span>'}</div>`}
    <p class="muted small">Based on ${a.weighIns} weigh-ins and ${a.foodDays} days logged${a.fasts ? `, ${a.fasts} of them fast days` : ''}. It's only as good as the log: missed snacks or drinks make maintenance look lower than it is, so mark fast days rather than leaving them blank. Floors of ${st.sex === 'female' ? '1,200' : '1,500'} kcal always apply.${(S.targetLog || []).length ? ` Last change: ${fmtDate(S.targetLog.at(-1).date)}, ${S.targetLog.at(-1).from} → ${S.targetLog.at(-1).to} kcal.` : ''}</p>
  </section>`;
}

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

// ===========================================================================
// Exercise library: free-exercise-db (public domain), loaded on first use from exercises.json
// ===========================================================================
let LIB = null, libP = null;
function loadLib() {
  if (LIB) return Promise.resolve(LIB);
  return (libP ||= fetch('exercises.json').then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }).then((j) => {
    LIB = { images: j.images, items: j.items.map(([id, name, level, equipment, primary, secondary, category, mechanic, steps, images]) =>
      ({ id, name, level, equipment, primary, secondary, category, mechanic, steps, images, key: exKey(name), toks: new Set(libToks(name)) })) };
    LIB.byId = new Map(LIB.items.map((x) => [x.id, x]));
    LIB.byKey = new Map(LIB.items.map((x) => [x.key, x]));
    return LIB;
  }).catch((e) => { libP = null; throw e; }));
}
const LIB_STOP = new Set(['the', 'into', 'for', 'x', '2x', 'a', 'with', 'of', 'and', 'on', 'to']);
const LIB_SYN = { db: 'dumbbell', flye: 'fly' };
const libToks = (n) => exKey(n).split(' ').filter((t) => t && !LIB_STOP.has(t)).map((t) => LIB_SYN[t] || t);
// Generic names in the programmes (from Mentzer's books) and the library entry they mean.
const LIB_ALIAS = {
  deadlift: 'Barbell Deadlift', squat: 'Barbell Squat', 'machine or barbell squat': 'Barbell Squat', curl: 'Barbell Curl', 'machine or barbell curl': 'Barbell Curl',
  row: 'Bent Over Barbell Row', 'bench press': 'Barbell Bench Press - Medium Grip', 'incline press': 'Barbell Incline Bench Press - Medium Grip',
  'incline barbell press': 'Barbell Incline Bench Press - Medium Grip', dip: 'Dips - Triceps Version', 'weighted dip': 'Dips - Triceps Version',
  crunch: 'Crunches', 'sit up': 'Sit-Up', lateral: 'Side Lateral Raise', 'lateral raise': 'Side Lateral Raise', 'dumbbell lateral': 'Side Lateral Raise',
  'bent over dumbbell lateral': 'Reverse Flyes', 'bent over lateral raise': 'Reverse Flyes', 'reverse pec deck fly': 'Reverse Flyes',
  'leg curl': 'Lying Leg Curls', 'calf raise': 'Standing Calf Raises', 'tricep pressdown': 'Triceps Pushdown', 'reverse grip pressdown': 'Reverse Grip Triceps Pushdown',
  'pec deck': 'Butterfly', pullover: 'Bent-Arm Dumbbell Pullover', 'lat pulldown': 'Wide-Grip Lat Pulldown', shrug: 'Barbell Shrug',
  'wide grip seated row': 'Seated Cable Rows', 'palms up pulldown': 'Close-Grip Front Lat Pulldown', 'close grip palms up pulldown': 'Close-Grip Front Lat Pulldown',
  'straight arm lat machine pulldown': 'Straight-Arm Pulldown', 'hanging knee raise': 'Hanging Leg Raise', hyperextension: 'Hyperextensions (Back Extensions)',
  'hyperextension or deadlift': 'Hyperextensions (Back Extensions)', 'zottman curl': 'Zottman Curl', 'seated zottman curl': 'Zottman Curl',
  'dumbbell hammer concentration curl': 'Concentration Curls', 'flat bench dumbbell press': 'Dumbbell Bench Press', 'overhead dumbbell press': 'Dumbbell Shoulder Press',
};
// The library entry for a programme exercise: the one you linked, the same name, an alias, or the closest name
// that contains every word of yours (generic one-word names only through the alias list). null = no good match.
function libFor(e) {
  if (!LIB) return null;
  if (e.libId) return LIB.byId.get(e.libId) || null;
  const k = exKey(e.name);
  const named = (n) => (n ? LIB.byKey.get(exKey(n)) : null);
  const base = libBase(e.name);
  const hit = LIB.byKey.get(k) || named(LIB_ALIAS[k]) || named(LIB_ALIAS[exKey(base)]);
  if (hit) return hit;
  const q = libToks(base);
  if (q.length < 2) return null;
  let best = null, score = 0;
  for (const l of LIB.items) {
    if (l.category === 'stretching' && !q.includes('stretch')) continue;
    if (!q.every((t) => l.toks.has(t))) continue;
    const sc = q.length / l.toks.size;
    if (sc > score || (sc === score && l.name.length < best.name.length)) { best = l; score = sc; }
  }
  return score >= 0.4 ? best : null;
}
// "Squats (or Leg Presses)", "Pec Deck / Flyes": the first choice only.
function libBase(name) { return String(name).split(/\s+\/\s+|\s+or\s+|,|\(/i)[0].trim(); }
const libImg = (l, i) => (l.images[i] ? `${LIB.images}${encodeURIComponent(l.id)}/${l.images[i]}` : '');

const programs = (family, tier) => Object.values(S.programs).filter((p) => p.family === family && (!tier || (p.tier || 'intermediate') === tier));
function activeProgram() {
  const fam = S.settings.family;
  // My workouts: the one you picked, else your first; with none yet, Today keeps showing the 4-week cycle.
  if (fam === 'custom') return S.programs[S.settings.active.custom] || programs('custom')[0] || S.programs[S.settings.active.cycle] || programs('cycle')[0];
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
// ===========================================================================
// Growth: share my week, the 30-day challenge, backups, installing
// ===========================================================================
const APP_URL = 'eddie144-ai.github.io/Training/gym-fuel';
const CHALLENGE_DAYS = 30;
function challengeDay(d = today()) {
  const c = S.challenge;
  return c?.start ? daysBetween(c.start, d) + 1 : 0;
}
// Everything the week card shows, for the week so far (Monday to today).
function weekData(d = today()) {
  const ws = weekStart(d);
  const st = S.settings;
  const list = weightsSorted();
  const lw = list[list.length - 1];
  const prevWeek = [...list].reverse().find((w) => w.date < ws);
  const start = st.startWeight ?? list[0]?.kg ?? null;
  const sessions = S.workouts.filter((w) => w.date >= ws && w.date <= d);
  const intake = intakeAvg(ws, d);
  // Best estimated 1-rep max per lift this week, against the best before this week.
  const best = new Map(), before = new Map();
  for (const w of S.workouts) {
    for (const e of w.entries || []) {
      const v = entryBest(e);
      if (!v) continue;
      const k = exKey(e.name), m = w.date >= ws && w.date <= d ? best : w.date < ws ? before : null;
      if (m && v > (m.get(k)?.v || 0)) m.set(k, { name: e.name, v });
    }
  }
  const lifts = [...best.entries()].sort((a, b) => b[1].v - a[1].v).slice(0, 3).map(([k, l]) => {
    const was = before.get(k)?.v;
    const ch = was ? round1(l.v - was) : null;
    return { name: l.name, value: `${fmtNum(round1(l.v))} kg`, change: ch == null ? '' : ch > 0 ? `▲ +${fmtNum(ch)}` : ch < 0 ? `▼ ${fmtNum(ch)}` : '=' };
  });
  const sign = (x) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${fmtNum(Math.abs(round1(x)))} kg`;
  const day = challengeDay(d);
  return {
    title: `Week of ${parseDate(ws).getDate()} ${MON[parseDate(ws).getMonth()]}`,
    subtitle: S.challenge && day >= 1 && day <= CHALLENGE_DAYS ? `Cut with me · day ${day} of ${CHALLENGE_DAYS}` : '',
    handle: (st.handle || '').trim(),
    weight: {
      now: lw ? `${fmtNum(lw.kg)} kg` : '—',
      week: lw && prevWeek && lw.date >= ws ? `${sign(lw.kg - prevWeek.kg)} this week` : '',
      total: lw && start != null ? `${sign(lw.kg - start)} since start` : '',
    },
    trend: list.filter((w) => w.date >= addDays(d, -27)).map((w) => Number(w.kg)),
    stats: [[String(sessions.length), `session${sessions.length === 1 ? '' : 's'}`], [intake ? String(Math.round(intake.kcal)) : '—', 'avg kcal a day'], [intake ? `${Math.round(intake.p)} g` : '—', 'avg protein a day']],
    lifts,
    footer: `Tracked with Gym & Fuel · ${APP_URL}`,
    background: st.background === 'plain' ? '' : 'bg.jpg',
  };
}
let shareBlob = null;
async function openShareWeek() {
  openSheet('Share my week', '<p class="muted small" id="share-wait">Making your card…</p>');
  try {
    const cv = await Share.weekCard(weekData());
    shareBlob = await Share.toBlob(cv);
  } catch { shareBlob = null; }
  const body = document.querySelector('.sheet-wrap .sheet-body');
  if (!body || !document.getElementById('share-wait')) return;
  if (!shareBlob) { body.innerHTML = '<p class="small warn-text">Couldn\'t make the image in this browser.</p>'; return; }
  const url = URL.createObjectURL(shareBlob);
  body.innerHTML = `<img class="sharecard" id="share-img" src="${url}" alt="Your week as an image">
    <label class="field">Your name or handle on the card (optional)<input id="share-handle" maxlength="40" placeholder="@yourname" value="${esc(S.settings.handle || '')}"></label>
    <div class="grid2"><button class="primary" data-act="share-week-go">Share</button><button data-act="share-week-save">Save image</button></div>
    <p class="muted small">Post it each week: weight trend, sessions, food and your best lifts. Nothing leaves your phone unless you share it.</p>`;
  document.getElementById('share-img').onload = () => URL.revokeObjectURL(url);
}
function backupBlob() {
  return new Blob([JSON.stringify({ kind: 'gym-fuel-backup', at: new Date().toISOString(), state: S })], { type: 'application/json' });
}
async function sendBackup(share) {
  const name = `gym-fuel-${today()}.json`;
  const how = share ? await Share.file(backupBlob(), name, 'Gym & Fuel backup') : (downloadText(name, JSON.stringify({ kind: 'gym-fuel-backup', at: new Date().toISOString(), state: S }), 'application/json'), 'saved');
  if (how === 'cancelled') return;
  S.settings.lastBackup = today(); save();
  toast(how === 'shared' ? 'Backup sent' : 'Backup saved to your downloads');
  render();
}
const hasHistory = () => S.meals.length + S.workouts.length + S.weights.length >= 5;
const backupDue = () => hasHistory() && (!S.settings.lastBackup || daysBetween(S.settings.lastBackup, today()) >= 7) && !(S.settings.backupSnooze && S.settings.backupSnooze > today());
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (ui.tab === 'today') render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; S.settings.installDismissed = true; save(); });
const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function installSteps() {
  return isIOS()
    ? '<ol class="small installsteps"><li>Open this page in <b>Safari</b>.</li><li>Tap <b>Share</b> (the square with an arrow).</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>'
    : '<ol class="small installsteps"><li>Open this page in <b>Chrome</b>.</li><li>Tap the <b>⋮</b> menu, top right.</li><li>Tap <b>Install app</b> (or <b>Add to Home screen</b>).</li></ol>';
}
function growthCards(d) {
  const st = S.settings;
  const out = [];
  if (st.setupDone && !isInstalled() && !st.installDismissed) {
    out.push(`<section class="card"><h2>Install Gym & Fuel</h2><p class="small">Put it on your home screen: it opens like an app, full screen, and works offline.</p>
      ${installPrompt ? '<button class="primary" data-act="install-go">Install</button>' : installSteps()}
      <button class="ghost" data-act="install-dismiss">Done, or not now</button></section>`);
  }
  if (backupDue()) {
    out.push(`<section class="card"><h2>Back up your log</h2><p class="small">Everything lives only on this phone${st.lastBackup ? `; the last backup was ${fmtDate(st.lastBackup)}` : ' and it has never been backed up'}. Send a copy to Drive, email or a chat so a new phone or a cleared browser can't wipe it.</p>
      <div class="grid2"><button class="primary" data-act="backup-share">Back up now</button><button data-act="backup-snooze">In a few days</button></div></section>`);
  }
  const day = challengeDay(d);
  if (S.challenge && day >= 1) {
    const ws = weekStart(d);
    const sessions = S.workouts.filter((w) => w.date >= ws && w.date <= d).length;
    const weighs = S.weights.filter((w) => w.date >= ws && w.date <= d).length;
    out.push(day > CHALLENGE_DAYS
      ? `<section class="card hero-card"><h2>Cut with me: done</h2><p class="small">You finished the ${CHALLENGE_DAYS}-day challenge. Share your last card, then go again.</p>
          <div class="grid2"><button class="primary" data-act="share-week">Share my week</button><button data-act="challenge-start">Start another 30 days</button></div>
          <button class="ghost" data-act="challenge-end">Close the challenge</button></section>`
      : `<section class="card hero-card"><h2>Cut with me <span class="right">day ${day} of ${CHALLENGE_DAYS}</span></h2>
          ${bar(day, CHALLENGE_DAYS, 'good')}
          <div class="stats"><div class="stat"><b>${sessions}/3</b><span>sessions this week</span></div><div class="stat"><b>${weighs}/7</b><span>weigh-ins this week</span></div></div>
          <p class="small">Three sessions and a daily weigh-in each week, food logged, and a card posted every Sunday.</p>
          <button class="primary" data-act="share-week">Share my week</button></section>`);
  }
  return out.join('');
}

// ---- Your chains from Iron & Eggs on this phone, read from the summary it writes for the home page.
// Clean chains (no coffee and your own "No ___" chains) keep counting until you report a slip, so they move on
// by the days since Iron & Eggs last wrote; the rest show where Iron & Eggs left them. No coffee restarts on 10 Oct 2026.
const CHAINS_KEY = 'shtrainer.chains';
const COFFEE_RESTART = '2026-10-10';
const LOGGED_CHAINS = ['diet', 'cut', 'fasting', 'protein', 'training', 'sessions', 'steps', 'sleep', 'plan'];
function ironChains(d) {
  let sum = null;
  try { sum = JSON.parse(rawKey(CHAINS_KEY) || 'null'); } catch { /* unreadable: no card */ }
  if (!sum?.chains?.length || !sum.date) return null;
  const gap = Math.max(0, daysBetween(sum.date, d));
  const chains = sum.chains.map((c) => {
    let day = Number(c.day) || 0, best = Number(c.best) || 0;
    if (c.id === 'coffee' && sum.date < COFFEE_RESTART && d >= COFFEE_RESTART) day = daysBetween(COFFEE_RESTART, d) + 1;
    else if (c.unit !== 'wk' && !LOGGED_CHAINS.includes(c.id)) { day += gap; best = Math.max(best, day); }
    return { ...c, day, best };
  });
  return { date: sum.date, stale: gap > 0, chains };
}
function chainsCard(d) {
  const sum = ironChains(d);
  if (!sum) return '';
  return `<section class="card"><h2>My chains <span class="right">${sum.chains.length}</span></h2>
    <div class="list">${sum.chains.map((c) => `<div class="row between chainrow"><span class="grow"><b>${esc(c.name)}</b><br><span class="muted small">best ${c.best}${c.unit === 'wk' ? ' wk' : ''}</span></span>
      <span class="daybadge ${c.day ? '' : 'zero'}" aria-label="${c.unit === 'wk' ? `${c.day} week${c.day === 1 ? '' : 's'}` : `Day ${c.day}`}"><small>${c.unit === 'wk' ? 'Weeks' : 'Day'}</small>${c.day}</span></div>`).join('')}</div>
    <p class="muted small">${sum.stale ? `Iron & Eggs last updated these ${fmtDate(sum.date)}. ` : ''}Check in or report a slip in Iron & Eggs.</p>
    <a class="btn" href="../shredded-trainer/">Open Iron & Eggs</a></section>`;
}

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
  ${(() => { const a = adaptive(); return a.ready && Math.abs(a.delta) >= 100 && st.adaptSnooze !== weekStart(d) ? adaptCard(a, 'today') : ''; })()}
  ${!st.setupDone ? `<section class="card alert"><h2>Set up your targets</h2><p class="small">Your calorie, protein and target weight are still the app's defaults. Takes a minute.</p><button class="primary" data-act="setup">Set up my targets</button></section>` : ''}
  ${growthCards(d)}
  ${chainsCard(d)}
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
    ${photoButton()}
    <div class="row wrap">${quickAdd()}<button class="small-btn" data-act="go-fuel">Food log</button>${fastButton(d)}</div>
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
    <button data-act="share-week">Share my week</button>
    ${S.challenge ? '' : '<button class="ghost" data-act="challenge-start">Start a 30-day "Cut with me" challenge</button>'}
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
    <div class="row between"><span class="grow"><b>${esc(e.name)}</b><br><span class="muted small">${esc(e.sets)} × ${esc(e.reps)}</span>${LIB ? `<br><button class="linkish inline-link" data-act="howto" ${base}>${libFor(e) ? 'How to do it' : 'Find it in the library'}</button>` : ''}</span>${prevBadge(last)}</div>
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
      <button class="small-btn" data-act="lib-open" data-mode="swap" ${base}>Swap from library</button>
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

// Your own programmes (family 'custom'): made blank or copied from any other programme.
function cloneDays(days) {
  return clone(days).map((d) => ({ ...d, id: uid(), exercises: d.exercises.map((e) => ({ ...e, id: uid() })) }));
}
const REST_CHOICES = [['', 'No set rest: days in order'], ['1-2', '1–2 days between sessions'], ['2-3', '2–3 days'], ['4-7', '4–7 days (Mentzer style)']];
function newProgramForm(copyFrom) {
  const all = Object.values(S.programs);
  return `<form id="prog-new-form" class="grid1" autocomplete="off">
    <label class="field">Name<input name="name" required maxlength="60" placeholder="e.g. Push Pull Legs" value="${copyFrom ? esc(`${copyFrom.name} (my copy)`) : ''}"></label>
    <label class="field">Start from<select name="from"><option value="">Blank</option>${all.map((p) => `<option value="${esc(p.id)}" ${copyFrom?.id === p.id ? 'selected' : ''}>A copy of ${esc(p.name)}</option>`).join('')}</select></label>
    <label class="field">Days in the programme (for a blank one)<select name="days">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label class="field">Rest between sessions<select name="rest">${REST_CHOICES.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
    <button class="primary" type="submit">Create</button>
    <p class="muted small">It goes in My workouts. Add exercises from the library or type your own; rename days and reorder them in Edit.</p>
  </form>`;
}

function viewTrainLog() {
  const fam = S.settings.family;
  const familyTabs = segmented('family', [['cycle', '4-Week Cycle'], ['hit', 'Mentzer HIT'], ['custom', 'My workouts']], fam, 'Training style');
  if (fam === 'custom' && !programs('custom').length) {
    return `${familyTabs}
    <section class="card">
      <h2>My workouts</h2>
      <p>Build your own programme: as many days as you like, any exercises, your sets and reps.</p>
      <button class="primary" data-act="prog-new">+ Create a workout programme</button>
      <p class="muted small">Or start from a copy of any built-in programme and change it.</p>
    </section>`;
  }
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
  ${familyTabs}
  ${fam === 'hit' ? `${segmented('tier', TIERS.map(([k, l]) => [k, l]), S.settings.tier, 'Mentzer level')}<p class="muted small tierdesc">${esc(tier[2])}</p>` : ''}
  <div class="chiprow">${programs(fam, fam === 'hit' ? S.settings.tier : null).map((p) => `<button class="pchip" data-act="pick-program" data-v="${esc(p.id)}" aria-pressed="${p.id === prog.id}">${esc(p.name)}</button>`).join('')}${fam === 'custom' ? '<button class="pchip" data-act="prog-new">+ New</button>' : ''}</div>
  ${done.length ? `<section class="card slim"><p>${chip('✓ Trained today', 'good')} <span class="muted small">${done.map((w) => esc(w.dayName)).join(', ')}</span></p></section>` : ''}
  <section class="card">
    <div class="row between wrap"><h3>${esc(prog.name)}</h3>${rec ? chip(rec.text, rec.cls) : prog.family === 'cycle' ? chip(`Cycle week ${((cycleWeek() - 1) % 4 + 4) % 4 + 1}`) : chip(`${prog.days.length} day${prog.days.length === 1 ? '' : 's'}, in order`)}</div>
    ${prog.about ? `<p class="muted small">${esc(prog.about)}</p>` : ''}
    ${prog.source ? `<p class="muted small">Source: ${esc(prog.source)}</p>` : ''}
    ${dayButtons}
    <div class="row between wrap"><h3 class="dayname">${esc(day.name)}</h3>
      <button class="small-btn" data-act="toggle-edit" aria-pressed="${ui.editProgram}">${ui.editProgram ? 'Done editing' : 'Edit exercises'}</button></div>
    ${ui.editProgram ? `
      ${prog.family === 'custom' ? `<label class="field">Programme name<input value="${esc(prog.name)}" data-edit="progname" ${pd}></label>` : ''}
      <label class="field">Day name<input value="${esc(day.name)}" data-edit="dayname" ${pd}></label>
      ${prog.days.length > 1 ? `<div class="row wrap"><span class="muted small">Day order:</span>
        <button class="small-btn" data-act="day-move" data-dir="-1" ${pd} ${prog.days[0].id === day.id ? 'disabled' : ''}>← Earlier</button>
        <button class="small-btn" data-act="day-move" data-dir="1" ${pd} ${prog.days.at(-1).id === day.id ? 'disabled' : ''}>Later →</button></div>` : ''}
      ${day.exercises.length ? '' : '<p class="muted small">No exercises on this day yet.</p>'}
      ${day.exercises.map((e, i) => exerciseEditRow(prog, day, e, i)).join('')}
      <div class="grid2">
        <button data-act="ex-add" ${pd}>+ Add exercise</button>
        <button data-act="day-add" data-pid="${esc(prog.id)}">+ Add day</button>
      </div>
      ${prog.days.length > 1 ? `<button class="danger" data-act="day-del" ${pd}>Delete this day</button>` : ''}
      ${tmpl ? `<button class="ghost" data-act="prog-reset" data-pid="${esc(prog.id)}">Reset programme to the original</button>` : ''}
      <button class="ghost" data-act="prog-copy" data-pid="${esc(prog.id)}">Copy this programme to My workouts</button>
      ${prog.family === 'custom' ? `<button class="ghost danger" data-act="prog-del" data-pid="${esc(prog.id)}">Delete this programme</button>` : ''}
    ` : `
      ${day.exercises.length ? '' : `<p class="muted">No exercises on this day yet. Tap <b>Edit exercises</b>, then <b>+ Add exercise</b>.</p>`}
      ${day.exercises.map((e, i) => exerciseLogCard(prog, day, e, i)).join('')}
      ${sessionFeelCard(prog, day)}
      <button class="primary" data-act="complete" ${pd}>Complete session</button>
      ${draftStarted(prog.id, day.id) ? `<button class="ghost danger" data-act="draft-clear" ${pd}>Clear what I've entered</button>` : ''}
    `}
  </section>
  ${fam === 'hit' && S.settings.tier === 'advanced' ? techniqueCards() : ''}
  <button class="ghost" data-act="lib-open" data-mode="browse">Browse the exercise library</button>
  ${fam === 'hit' ? `<section class="card"><h2>Mentzer principles</h2><div class="list">${MENTZER_PRINCIPLES.map(([h, t]) => `<div><b>${esc(h)}</b><br><span class="muted small">${esc(t)}</span></div>`).join('')}</div></section>` : ''}`;
}

// ---- progress per lift: best estimated 1-rep max per session, over time
function liftSeries() {
  const by = new Map();
  for (const w of [...S.workouts].sort((a, b) => a.at.localeCompare(b.at))) {
    for (const e of w.entries || []) {
      const best = (e.sets || []).reduce((b, st) => { const v = e1rm(st.kg, st.reps); return v > (b?.v || 0) ? { v, st } : b; }, null);
      if (!best) continue;
      const k = exKey(e.name);
      if (!by.has(k)) by.set(k, { key: k, name: e.name, pts: [] });
      by.get(k).pts.push({ date: w.date, v: best.v, set: best.st, id: w.id });
    }
  }
  return [...by.values()].sort((a, b) => b.pts.length - a.pts.length || a.name.localeCompare(b.name));
}
// Round axis steps: 1, 2, 2.5 or 5 × a power of ten, about 4 ticks over the range.
function niceTicks(lo, hi) {
  const span = hi - lo || 1, raw = span / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw);
  const out = [];
  for (let t = Math.floor(lo / step) * step; t <= hi + step * 0.001; t += step) out.push(round1(t));
  if (out[out.length - 1] < hi) out.push(round1(out[out.length - 1] + step));
  return out;
}
function liftChart(sr) {
  const pts = sr.pts;
  const W = 340, H = 190, L = 40, R = 14, T = 16, B = 30;
  const t0 = parseDate(pts[0].date).getTime(), t1 = parseDate(pts[pts.length - 1].date).getTime();
  const vals = pts.map((p) => p.v);
  const ticks = niceTicks(Math.min(...vals), Math.max(...vals));
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const X = (d) => (t1 === t0 ? L + (W - L - R) / 2 : L + ((parseDate(d).getTime() - t0) / (t1 - t0)) * (W - L - R));
  const Y = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);
  const best = pts.reduce((a, b) => (b.v > a.v ? b : a), pts[0]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.date).toFixed(1)} ${Y(p.v).toFixed(1)}`).join('');
  const short = (d) => { const x = parseDate(d); return `${x.getDate()} ${MON[x.getMonth()]}`; };
  return `<svg class="liftchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(sr.name)}: estimated 1-rep max from ${fmtNum(round1(pts[0].v))} to ${fmtNum(round1(pts[pts.length - 1].v))} kg over ${pts.length} sessions">
    ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" class="grid"/><text x="${L - 6}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end" class="tick">${fmtNum(t)}</text>`).join('')}
    <text x="${L}" y="${H - 8}" class="tick">${short(pts[0].date)}</text>${pts.length > 1 ? `<text x="${W - R}" y="${H - 8}" text-anchor="end" class="tick">${short(pts[pts.length - 1].date)}</text>` : ''}
    ${pts.length > 1 ? `<path d="${line}" class="series"/>` : ''}
    ${pts.map((p, i) => `<g class="pt${p === best ? ' best' : ''}" data-act="chart-pt" data-i="${i}" tabindex="0" role="button" aria-label="${fmtDate(p.date)}: ${setText(p.set)}, ${fmtNum(round1(p.v))} kg estimated"><circle cx="${X(p.date).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="14" class="hit"/><circle cx="${X(p.date).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="${p === best ? 5 : 4}" class="dot"/></g>`).join('')}
    <text x="${Math.min(W - R, Math.max(L, X(best.date))).toFixed(1)}" y="${Math.max(11, Y(best.v) - 10).toFixed(1)}" text-anchor="${X(best.date) > W - 60 ? 'end' : X(best.date) < L + 40 ? 'start' : 'middle'}" class="label">Best ${fmtNum(round1(best.v))} kg</text>
  </svg>`;
}
function progressCard() {
  const all = liftSeries();
  if (!all.length) return '<section class="card"><h2>Progress</h2><p class="muted">Log a session with weights and reps and your lifts are charted here.</p></section>';
  const sr = all.find((x) => x.key === ui.chartEx) || all[0];
  const first = sr.pts[0], last = sr.pts[sr.pts.length - 1];
  const change = round1(last.v - first.v);
  return `<section class="card" id="progress-card">
    <h2>Progress <span class="right">estimated 1-rep max (kg)</span></h2>
    <label class="field">Exercise<select id="chart-ex">${all.map((x) => `<option value="${esc(x.key)}" ${x === sr ? 'selected' : ''}>${esc(x.name)} (${x.pts.length})</option>`).join('')}</select></label>
    <p class="small" id="chart-read">${sr.pts.length > 1 ? `${change >= 0 ? '+' : '−'}${fmtNum(Math.abs(change))} kg since ${fmtDate(first.date)} · ${sr.pts.length} sessions` : 'One session so far. The line appears after the next.'}</p>
    ${liftChart(sr)}
    <p class="muted small">Each dot is your best set that session, as an estimated 1-rep max (weight × (1 + reps ÷ 30)). Tap a dot for the set.</p>
    <details><summary class="small">Show as a table</summary><div class="list small">${[...sr.pts].reverse().map((p) => `<div class="row between"><span>${fmtDate(p.date)} · ${setText(p.set)}</span><b>${fmtNum(round1(p.v))} kg</b></div>`).join('')}</div></details>
  </section>`;
}

// ---- library sheets
let libMode = null; // { mode: 'add' | 'swap' | 'browse', pid, did, eid }
function openLibrary(mode) {
  libMode = mode;
  const title = mode.mode === 'add' ? 'Add an exercise' : mode.mode === 'swap' ? 'Swap or link this exercise' : 'Exercise library';
  openSheet(title, '<p class="muted small" id="lib-wait">Loading the exercise library…</p>');
  loadLib().then(() => {
    if (libMode !== mode || !document.getElementById('lib-wait')) return;
    const muscles = [...new Set(LIB.items.flatMap((x) => x.primary))].sort();
    const equip = [...new Set(LIB.items.map((x) => x.equipment).filter(Boolean))].sort();
    const cur = mode.eid ? findEx(mode.pid, mode.did, mode.eid).ex : null;
    document.querySelector('.sheet-wrap .sheet-body').innerHTML = `
      ${cur ? `<p class="small">Now: <b>${esc(cur.name)}</b>. <b>Link</b> keeps your name and just adds the how-to; <b>Swap</b> changes the exercise.</p>` : ''}
      <label class="field" for="lib-q">Search<input id="lib-q" type="search" placeholder="e.g. incline press, curl" data-live="lib-q" value="${esc(cur ? libBase(cur.name) : '')}"></label>
      <div class="grid2">
        <label class="field">Muscle<select id="lib-muscle" data-live="lib-q"><option value="">Any</option>${muscles.map((m) => `<option>${esc(m)}</option>`).join('')}</select></label>
        <label class="field">Equipment<select id="lib-equip" data-live="lib-q"><option value="">Any</option>${equip.map((m) => `<option>${esc(m)}</option>`).join('')}</select></label>
      </div>
      <div id="lib-list" class="list"></div>
      ${mode.mode === 'add' ? '<button class="ghost" data-act="ex-add-custom">+ Type my own exercise instead</button>' : ''}
      <p class="muted small">876 exercises from <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener">free-exercise-db</a> (public domain).</p>`;
    drawLib();
  }, () => { const w = document.getElementById('lib-wait'); if (w) w.textContent = 'Couldn\'t load the exercise library. It needs internet the first time.'; });
}
function drawLib() {
  const box = document.getElementById('lib-list');
  if (!box || !LIB) return;
  const q = libToks(document.getElementById('lib-q')?.value || '');
  const mus = document.getElementById('lib-muscle')?.value, eq = document.getElementById('lib-equip')?.value;
  const hits = LIB.items.filter((l) => (!mus || l.primary.includes(mus)) && (!eq || l.equipment === eq) && q.every((t) => [...l.toks].some((x) => x.startsWith(t))));
  const verb = libMode?.mode === 'add' ? 'Add' : libMode?.mode === 'swap' ? 'Swap' : '';
  box.innerHTML = hits.slice(0, 40).map((l) => `<div class="row between">
      <button class="linkish grow" data-act="lib-howto" data-lib="${esc(l.id)}"><b>${esc(l.name)}</b><br><span class="muted small">${esc([l.primary.join(', '), l.equipment, l.level].filter(Boolean).join(' · '))}</span></button>
      ${libMode?.mode === 'swap' ? `<button class="small-btn" data-act="lib-pick" data-link="1" data-lib="${esc(l.id)}">Link</button>` : ''}
      ${verb ? `<button class="small-btn primary" data-act="lib-pick" data-lib="${esc(l.id)}">${verb}</button>` : ''}</div>`).join('')
    + (hits.length > 40 ? `<p class="muted small">${hits.length - 40} more: narrow the search.</p>` : hits.length ? '' : '<p class="muted small">No matches. Try fewer words.</p>');
}
function openHowTo(l, back) {
  openSheet(l.name, `
    ${l.images.length ? `<div class="pair">${l.images.map((_, i) => `<figure><img src="${esc(libImg(l, i))}" alt="${esc(l.name)}, ${i ? 'end' : 'start'} position" loading="lazy"><figcaption>${i ? 'End' : 'Start'}</figcaption></figure>`).join('')}</div>` : ''}
    <div class="row wrap">${[l.level, l.equipment, l.mechanic].filter(Boolean).map((x) => chip(x)).join('')}</div>
    <p class="small"><b>Works:</b> ${esc(l.primary.join(', '))}${l.secondary.length ? ` <span class="muted">· also ${esc(l.secondary.join(', '))}</span>` : ''}</p>
    ${l.steps.length ? `<ol class="steps">${l.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
    ${back ? `<button class="ghost" data-act="lib-back">‹ Back to the library</button>` : ''}
    <p class="muted small">From free-exercise-db (public domain). Pictures load from GitHub when online.</p>`);
}

function viewTrainHistory() {
  const prs = prSessions();
  const hist = [...S.workouts].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
  const recs = records();
  return `
  ${progressCard()}
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
    ${recs.length ? `<div class="list">${recs.map((r) => `<button class="linkish row between" data-act="chart-ex" data-v="${esc(exKey(r.name))}"><span class="grow"><b>${esc(r.name)}</b><br><span class="muted small">${setText(r.set)} · ${fmtDate(r.date)}</span></span><b class="nowrap">${fmtNum(round1(r.e1rm))} kg</b></button>`).join('')}</div><p class="muted small">Tap one to chart it above.</p>` : '<p class="muted">Records appear once you log weight and reps.</p>'}
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
  <section class="card"><h2>Totals ${isFast(d) ? '<span class="right">fast day</span>' : ''}</h2>${macroBars(macrosOn(d))}${fastButton(d)}</section>
  <div class="grid2">
    <button class="primary" data-act="food-picker">+ Add food</button>
    <button data-act="oneoff">+ One-off meal</button>
  </div>
  <div class="grid2"><button data-act="scan-food">Scan a barcode</button>${photoButton(true)}</div>
  ${girondaBar(d)}
  ${quickAdd() ? `<div class="row wrap">${quickAdd()}</div>` : ''}
  <section class="card">
    <h2>Meals · ${d === today() ? 'today' : fmtDate(d)} <span class="right">${meals.length}</span></h2>
    ${meals.length ? `<div class="list">${meals.map((m) => `<div class="row between">
        <button class="linkish grow" data-act="edit-meal" data-id="${esc(m.id)}"><b>${esc(m.name)}</b>${(m.servings ?? 1) !== 1 ? ` <span class="chip">×${fmtNum(m.servings)}</span>` : ''}${m.photoId ? ' <span class="chip" title="Has a photo">photo</span>' : ''}<br><span class="muted small">${esc(m.slot || slotForTime(m.at))} · ${fmtTime(m.at)} · ${macroLine(mealTotals(m))}</span></button>
        <button class="icon ghost" data-act="del-meal" data-id="${esc(m.id)}" aria-label="Delete ${esc(m.name)}">✕</button></div>`).join('')}</div>` : '<p class="muted">Nothing logged for this day.</p>'}
    <button class="ghost" data-act="copy-yesterday" data-date="${d}">Copy meals from the day before</button>
    <p class="muted small">Tap a meal to change servings, macros, time or date.</p>
  </section>`;
}

// ---- Gironda bar: the two maximum-definition meals one tap away. Tap again to take it back off.
// On when Iron & Eggs is on this phone or a Gironda meal has been logged; switch it in Body → Settings.
function girondaBar(d) {
  if (!girondaOn()) return '';
  const meals = mealsOn(d);
  const btns = GIRONDA_MEALS.map(([id, label, sub]) => {
    const f = findFood(id);
    const n = meals.filter((m) => m.ref === id).length;
    return `<button class="gbtn ${n ? 'done' : ''}" data-act="gironda" data-id="${id}" data-date="${d}" aria-pressed="${!!n}">
      <b>${n ? '✓ ' : ''}${label}</b><span class="small">${sub}</span><span class="muted small">${f.kcal} kcal · ${f.p} g protein</span></button>`;
  }).join('');
  const done = GIRONDA_MEALS.filter(([id]) => meals.some((m) => m.ref === id)).length;
  return `<section class="card"><h2>Gironda bar <span class="right">${done}/2 today</span></h2>
    <div class="grid2">${btns}</div>
    <p class="muted small">Maximum definition: steak and eggs, nothing else. Tap a meal to log it, tap again to take it off.</p></section>`;
}

// ---- fast days: a day on purpose with nothing (or very little) eaten, so the adaptive target counts it
function fastButton(d) {
  if (mealsOn(d).length && !isFast(d)) return '';
  return `<button class="small-btn" data-act="fast-toggle" data-date="${d}" aria-pressed="${isFast(d)}">${isFast(d) ? '✓ Fast day' : 'Mark as a fast day'}</button>`;
}

// ---- logging from a photo (photos.js stores it; foodai.js asks Claude when there's an API key)
function photoButton(inline) {
  return `<label class="btn ${inline ? '' : 'wide'}" for="meal-photo-in">Photo of food or label</label><input id="meal-photo-in" type="file" accept="image/*" capture="environment" class="sr">`;
}
let photoState = null; // { rec, url, status: 'ready'|'loading'|'done'|'error', items, notes, kind, error, note, used }
function openPhotoLog(rec) {
  photoState = { rec, url: URL.createObjectURL(rec.blob), status: 'ready', items: [], notes: '', kind: '', error: '', note: '' };
  drawPhoto();
}
const CONF = { high: ['sure', 'good'], medium: ['estimate', ''], low: ['rough guess', 'warn'] };
function drawPhoto() {
  const ps = photoState;
  if (!ps) return;
  const hasKey = FoodAI.ready();
  const slot = document.getElementById('ph-slot')?.value || slotForTime(new Date().toISOString());
  const rows = ps.items.map((it, i) => `<div class="excard phrow">
      <div class="row between"><input value="${esc(it.name)}" aria-label="Food ${i + 1} name" data-ph="${i}|name" class="grow">
        <button class="icon ghost" data-act="ph-del" data-i="${i}" aria-label="Remove ${esc(it.name)}">✕</button></div>
      <div class="phnums">
        <label class="field">grams<input inputmode="decimal" value="${fmtNum(it.grams)}" data-ph="${i}|grams" aria-label="${esc(it.name)} grams"></label>
        <label class="field">kcal<input inputmode="decimal" value="${fmtNum(it.kcal)}" data-ph="${i}|kcal" aria-label="${esc(it.name)} calories"></label>
        <label class="field">protein<input inputmode="decimal" value="${fmtNum(it.p)}" data-ph="${i}|p" aria-label="${esc(it.name)} protein"></label>
        <label class="field">carbs<input inputmode="decimal" value="${fmtNum(it.c)}" data-ph="${i}|c" aria-label="${esc(it.name)} carbs"></label>
        <label class="field">fat<input inputmode="decimal" value="${fmtNum(it.f)}" data-ph="${i}|f" aria-label="${esc(it.name)} fat"></label>
      </div>
      ${it.confidence ? `<span class="small">${chip(CONF[it.confidence][0], CONF[it.confidence][1])}</span>` : ''}
    </div>`).join('');
  const tot = ps.items.reduce((t, it) => ({ kcal: t.kcal + (it.kcal || 0), p: t.p + (it.p || 0), c: t.c + (it.c || 0), f: t.f + (it.f || 0) }), { kcal: 0, p: 0, c: 0, f: 0 });
  const html = `
    <img class="phprev" src="${ps.url}" alt="Your photo">
    ${ps.status === 'ready' || ps.status === 'error' ? `
      <label class="field">Anything the photo doesn't show? (optional)<textarea id="ph-note" placeholder="e.g. cooked in 1 tbsp butter, 250 g steak, half eaten">${esc(ps.note)}</textarea></label>
      ${ps.error ? `<p class="small warn-text">${esc(ps.error)}</p>` : ''}
      ${hasKey ? `<button class="primary" data-act="ph-ai">Work it out with ${FoodAI.providerName()}</button>` : '<p class="muted small">To have AI work out the food and its calories from the photo, add a Gemini (free) or Anthropic API key in Body → Settings.</p>'}
      <button data-act="ph-manual">Enter it myself</button>` : ''}
    ${ps.status === 'loading' ? '<p class="small">Reading the photo… this takes a few seconds.</p>' : ''}
    ${ps.status === 'done' ? `
      ${ps.kind === 'not_food' || !ps.items.length ? '<p class="small">No food found in this photo. Add it yourself below.</p>' : ''}
      ${ps.notes ? `<p class="small tip">${esc(ps.notes)}</p>` : ''}
      ${ps.left != null ? `<p class="muted small">${ps.left} free photo${ps.left === 1 ? '' : 's'} left today.</p>` : ''}
      ${rows}
      <button class="small-btn" data-act="ph-add-row">+ Add an item</button>
      ${ps.items.length ? `<p class="small"><b>Total:</b> ${macroLine(tot)}</p>` : ''}
      ${slotSelect('ph-slot', slot)}
      <button class="primary" data-act="ph-save" ${ps.items.length ? '' : 'disabled'}>Add ${ps.items.length} item${ps.items.length === 1 ? '' : 's'} to the log</button>
      <p class="muted small">Estimates from the photo: change any number before adding. Changing grams scales that item's calories and macros.</p>` : ''}`;
  const body = document.querySelector('.sheet-wrap .sheet-body');
  if (body && document.querySelector('.sheet-wrap [aria-label="Log from a photo"]')) body.innerHTML = html;
  else openSheet('Log from a photo', html);
}
async function photoAI() {
  const ps = photoState;
  ps.note = document.getElementById('ph-note')?.value || '';
  Object.assign(ps, { status: 'loading', error: '' });
  drawPhoto();
  const res = await FoodAI.analyse(ps.rec.blob, ps.note);
  if (photoState !== ps) return;
  if (!res.ok) { Object.assign(ps, { status: 'error', error: res.error }); drawPhoto(); return; }
  Object.assign(ps, { status: 'done', kind: res.result.kind, notes: res.result.notes || '', items: res.result.items, left: res.left ?? null });
  drawPhoto();
}
async function showMealPhoto(id) {
  try {
    const rec = await Photos.get(id);
    const img = document.getElementById('meal-photo');
    if (rec && img) { const u = URL.createObjectURL(rec.blob); img.src = u; img.hidden = false; img.onload = () => URL.revokeObjectURL(u); }
  } catch { /* photos unavailable */ }
}
// A meal photo is deleted with the last meal that uses it.
function dropPhotoIfUnused(id) {
  if (id && !S.meals.some((m) => m.photoId === id)) Photos.remove(id).catch(() => {});
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
  ${adaptCard(adaptive(), 'body')}
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
    <h2>Photo logging</h2>
    <p class="small">Take a photo of a meal, drink, snack, packet, nutrition label or menu and the AI lists each food with its weight, calories and macros for you to check.</p>
    ${segmented('ai-provider', [...(FoodAI.getFreeUrl() ? [['free', 'Free']] : []), ['gemini', FoodAI.getFreeUrl() ? 'My Gemini key' : 'Gemini (free)'], ['claude', 'Claude (paid)']], FoodAI.getProvider(), 'Which AI reads the photo')}
    ${FoodAI.getProvider() === 'free' ? `
      <p class="small">No key needed: Gym & Fuel's free service reads the photo with Google's Gemini. Up to 10 photos a day per internet connection.</p>
      <p class="muted small">On Google's free tier, Google may use what's sent (your food photos and notes) to improve its products. For no daily limit, use your own key instead.</p>`
    : FoodAI.getProvider() === 'gemini' ? `
      <label class="field">Gemini API key<input id="ai-gkey" type="password" autocomplete="off" spellcheck="false" placeholder="AIza…" value="${FoodAI.getGeminiKey() ? '••••••••' : ''}"></label>
      ${FoodAI.getGeminiKey() ? '<p class="small good-text">✓ A Gemini key is saved on this phone. It\'s the same one Deliberation Council uses, so a change here changes it there too.</p><button class="ghost danger" data-act="ai-gkey-clear">Remove the Gemini key from this phone</button>' : ''}
      <label class="field">Gemini model<input id="ai-gmodel" autocomplete="off" spellcheck="false" value="${esc(FoodAI.getGeminiModel())}"></label>
      <p class="muted small">Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com</a>. The free tier has daily limits and Google may use what you send (your food photos) to improve its products. Default model ${esc(FoodAI.DEFAULT_GEMINI_MODEL)}; change it if Google retires that one.</p>`
    : `
      <label class="field">Your Anthropic API key<input id="ai-key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-…" value="${FoodAI.getKey() ? '••••••••' : ''}"></label>
      ${FoodAI.getKey() ? '<button class="ghost danger" data-act="ai-key-clear">Remove the key from this phone</button>' : ''}
      <label class="field">Model<select id="ai-model">${FoodAI.MODELS.map(([m, l]) => `<option value="${m}" ${FoodAI.getModel() === m ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <p class="muted small">Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> (pay as you go). Each photo is one request: roughly a few pence with Opus 5.5, less with Sonnet or Haiku.</p>`}
    <p class="muted small">Keys stay on this phone only, are never in backups, and are sent only to that company with your photo. Without a key you can still attach a photo and enter the food yourself.</p>
    <details class="small"><summary>Free service address (app owner)</summary>
      <label class="field">Address of the deployed free service<input id="ai-free-url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://gym-fuel-food-ai.….workers.dev" value="${esc(FoodAI.getFreeUrl())}"></label>
    </details>
  </section>
  <section class="card">
    <h2>Backup</h2>
    <p class="muted small">Everything lives only in this browser${st.lastBackup ? `. Last backup: ${fmtDate(st.lastBackup)}` : ''}. Photos aren't in backups.</p>
    <button class="primary" data-act="backup-share">Send a backup to Drive, email or a chat</button>
    <div class="grid2"><button data-act="backup">Save backup file</button><label class="btn" for="restore-file">Restore…</label></div>
    <input id="restore-file" type="file" accept="application/json,.json" class="sr">
  </section>
  <section class="card">
    <h2>Display</h2>
    <label class="field check-field"><span>High contrast</span><input type="checkbox" id="hc-toggle" ${st.highContrast ? 'checked' : ''}></label>
    <label class="field check-field"><span>Gironda bar in Fuel</span><input type="checkbox" id="gironda-toggle" ${girondaOn() ? 'checked' : ''}></label>
    <label class="field">Background<select id="bg-pick"><option value="photo" ${st.background !== 'plain' ? 'selected' : ''}>Photo</option><option value="plain" ${st.background === 'plain' ? 'selected' : ''}>Plain</option></select></label>
    <label class="field">Name or handle on your share cards<input id="handle-set" maxlength="40" placeholder="@yourname" value="${esc(st.handle || '')}"></label>
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
  if (photoState) { URL.revokeObjectURL(photoState.url); if (!photoState.used) dropPhotoIfUnused(photoState.rec.id); photoState = null; }
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
      <b>${esc(x.name)}</b><br><span class="muted small">${esc(x.meal || '')} · ${macroLine({ ...x, kcal: mealKcal(x) })} per serving</span></button>`).join('')}
      ${(S.scanned || []).map((x) => `<button class="linkish pick" data-act="open-product" data-code="${esc(x.code)}" data-name="${esc(x.name.toLowerCase())}">
      <b>${esc(x.name)}</b><br><span class="muted small">Saved product · ${macroLine(x)} per 100 g</span></button>`).join('')}</div>
    <div id="off-results" class="list" aria-live="polite"><p class="muted small">Type 3 or more letters to search Open Food Facts too.</p></div>`);
}

// Searching Open Food Facts by name from the Add food sheet: waits for a pause in typing, keeps answers for the
// session so the same words never cost a second request (the service allows about 10 searches a minute).
const offCache = new Map();
let offTimer = null, offShown = [];
function offSearchSoon(q) {
  clearTimeout(offTimer);
  const box = document.getElementById('off-results');
  if (!box) return;
  const words = q.trim().toLowerCase();
  if (words.length < 3) { box.innerHTML = '<p class="muted small">Type 3 or more letters to search Open Food Facts too.</p>'; return; }
  if (offCache.has(words)) { drawOff(words, offCache.get(words)); return; }
  if (!navigator.onLine) { box.innerHTML = '<p class="muted small">Offline: showing your own foods and saved products only.</p>'; return; }
  box.innerHTML = '<p class="muted small">Searching Open Food Facts…</p>';
  offTimer = setTimeout(async () => {
    const res = await Scan.search(words);
    if (res.ok) offCache.set(words, res);
    const input = document.getElementById('picker-q');
    if (input && input.value.trim().toLowerCase() === words) drawOff(words, res);
  }, 700);
}
function drawOff(words, res) {
  const box = document.getElementById('off-results');
  if (!box) return;
  if (!res.ok) { box.innerHTML = `<p class="small warn-text">${esc(res.error)}</p>`; return; }
  offShown = res.foods;
  box.innerHTML = res.foods.length
    ? `<p class="rlabel">Open Food Facts</p>${res.foods.map((f, i) => `<button class="linkish" data-act="off-pick" data-i="${i}"><b>${esc(f.name)}</b><br><span class="muted small">${macroLine(f)} per 100 g</span></button>`).join('')}`
    : `<p class="muted small">Nothing on Open Food Facts for "${esc(words)}".</p>`;
}
// A product (searched or saved) opens the grams sheet, the same one a scanned barcode uses.
function openProduct(food, msg) {
  scanState = { status: 'found', food, msg, code: food.code, slot: document.getElementById('picker-slot')?.value };
  drawScan();
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
  // New users start on the general 10 lbs programme rather than the owner's own plan.
  const progId = st.setupDone ? st.active[st.family] : 'tenlbs';
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
    ${isInstalled() ? '' : `<details class="small"><summary>Put it on your home screen</summary>${installSteps()}</details>`}
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
  document.documentElement.dataset.bg = S.settings.background === 'plain' ? 'plain' : 'photo';
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
  if (ui.tab === 'train' && !LIB) loadLib().then(() => { if (ui.tab === 'train' && !document.querySelector('.sheet-wrap') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) render(); }, () => {});
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
  let { pid, did, eid } = el.dataset;

  switch (a) {
    case 'sheet-close': closeSheet(); return;
    case 'ask-yes': { const f = askYes; closeSheet(); askYes = null; if (f) { f(); commit({ scrollTop: true }); } return; }
    case 'sub': ui.sub[ui.tab] = el.dataset.v; render({ scrollTop: true }); return;
    case 'go-train': ui.tab = 'train'; ui.sub.train = 'log'; ui.dayId = did || null; ui.editProgram = false; render({ scrollTop: true }); return;
    case 'go-fuel': ui.tab = 'fuel'; ui.sub.fuel = 'log'; ui.fuelDate = today(); render({ scrollTop: true }); return;

    // ---- train
    case 'family': S.settings.family = el.dataset.v; ui.dayId = null; ui.editProgram = false; break;
    case 'tier': S.settings.tier = el.dataset.v; ui.dayId = null; break;
    case 'pick-program': S.settings.active[S.settings.family] = el.dataset.v; ui.dayId = null; ui.editProgram = false; break;
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
    case 'ex-add': openLibrary({ mode: 'add', pid, did }); return;
    case 'ex-add-custom': {
      ({ pid, did } = libMode || {});
      closeSheet();
      const prog = S.programs[pid];
      if (!prog) return;
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
    case 'adapt-apply': {
      const kcal = Number(el.dataset.v), from = S.settings.kcalGoal;
      if (!kcal) return;
      Object.assign(S.settings, macrosFor(kcal));
      S.targetLog.push({ date: today(), from, to: kcal });
      toast(`Calorie target now ${kcal} kcal`); break;
    }
    case 'adapt-snooze': S.settings.adaptSnooze = weekStart(today()); break;
    case 'prog-new': openSheet('New workout programme', newProgramForm(null)); return;
    case 'prog-copy': openSheet('Copy to My workouts', newProgramForm(S.programs[pid])); return;
    case 'prog-del': {
      const prog = S.programs[pid];
      ask(`Delete ${prog.name}? Sessions you logged with it stay in your history.`, 'Delete', () => {
        delete S.programs[pid];
        if (S.settings.active.custom === pid) S.settings.active.custom = programs('custom')[0]?.id || null;
        ui.dayId = null; ui.editProgram = false;
      });
      return;
    }
    case 'day-move': {
      const prog = S.programs[pid];
      const i = prog.days.findIndex((d) => d.id === did), j = i + Number(el.dataset.dir);
      if (i < 0 || j < 0 || j >= prog.days.length) return;
      [prog.days[i], prog.days[j]] = [prog.days[j], prog.days[i]];
      prog.edited = true; ui.dayId = did; break;
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
    case 'gironda': {
      const d = el.dataset.date, mine = mealsOn(d).filter((m) => m.ref === el.dataset.id);
      const food = findFood(el.dataset.id), name = food.name.split(':')[0];
      if (mine.length) { const gone = mine[mine.length - 1]; S.meals = S.meals.filter((m) => m !== gone); toast(`${name} taken off`); } else { addMealFromFood(food, 1, d); toast(`Logged ${name}`); }
      break;
    }
    case 'log-food': {
      const food = findFood(el.dataset.id);
      addMealFromFood(food, Number(el.dataset.servings), null, document.getElementById('serv-slot')?.value);
      closeSheet(); toast(`Logged ${food.name.split(':')[0]}`); break;
    }
    case 'oneoff': openSheet('One-off meal', mealForm('oneoff-form', { date: ui.fuelDate || today() }, `<label class="field check-field" style="grid-column:1/-1"><span>Save to my foods too</span><input type="checkbox" name="keep"></label>`)); return;
    case 'edit-meal': { const m = S.meals.find((x) => x.id === el.dataset.id); if (m) { openSheet('Edit meal', `${m.photoId ? '<img id="meal-photo" class="phprev" alt="Photo of this meal" hidden>' : ''}${mealForm('meal-edit-form', m)}`); if (m.photoId) showMealPhoto(m.photoId); } return; }
    case 'del-meal': { const gone = S.meals.find((m) => m.id === el.dataset.id); S.meals = S.meals.filter((m) => m.id !== el.dataset.id); dropPhotoIfUnused(gone?.photoId); toast('Meal removed'); break; }
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
      Scan.start(document.getElementById('scan-video'), (code) => scanLookup(code)).catch((err) => { Scan.stop(); if (scanState) { Object.assign(scanState, { status: 'error', msg: /scanner|detector/.test(err?.message || '') ? 'Couldn\'t load the scanner. It needs internet the first time. Type the number instead.' : 'The camera isn\'t available. Allow camera access, or type the number instead.' }); drawScan(); } });
      return;
    }
    case 'scan-stop': Scan.stop(); Object.assign(scanState, { status: 'idle', msg: '' }); drawScan(); return;
    case 'scan-recent': scanLookup(el.dataset.v); return;
    case 'off-pick': { const f = offShown[Number(el.dataset.i)]; if (f) openProduct(f, 'From Open Food Facts. Check it against the pack.'); return; }
    case 'open-product': { const f = (S.scanned || []).find((x) => x.code === el.dataset.code); if (f) openProduct(f, 'Saved earlier, works offline.'); return; }

    // ---- body
    case 'setup': openSetup(); return;
    case 'photo-all': ui.photoAll = ui.photoAll === el.dataset.v ? null : el.dataset.v; fillPhotos(); return;
    case 'photo-del': ask('Delete this photo?', 'Delete', () => { Photos.remove(el.dataset.id).then(() => render(), () => toast('Couldn\'t delete it')); }); return;
    case 'lib-open': openLibrary({ mode: el.dataset.mode, pid, did, eid }); return;
    case 'lib-back': if (libMode) openLibrary(libMode); return;
    case 'lib-howto': { const l = LIB?.byId.get(el.dataset.lib); if (l) openHowTo(l, true); return; }
    case 'howto': {
      const { ex } = findEx(pid, did, eid);
      const l = ex && libFor(ex);
      if (l) openHowTo(l, false); else openLibrary({ mode: 'swap', pid, did, eid });
      return;
    }
    case 'lib-pick': {
      const l = LIB?.byId.get(el.dataset.lib);
      const m = libMode;
      if (!l || !m) return;
      const prog = S.programs[m.pid];
      const day = prog?.days.find((d) => d.id === m.did);
      if (!day) return;
      if (m.mode === 'add') { day.exercises.push({ id: uid(), name: l.name, sets: 3, reps: '8–12', note: '', ss: false, tech: '', libId: l.id }); toast(`${l.name} added`); }
      else {
        const ex = day.exercises.find((x) => x.id === m.eid);
        if (!ex) return;
        if (el.dataset.link) { ex.libId = l.id; toast('Linked: How to do it now shows this one'); }
        else { ex.name = l.name; ex.libId = l.id; toast(`Swapped to ${l.name}`); }
      }
      prog.edited = true;
      closeSheet(); break;
    }
    case 'chart-ex': ui.chartEx = el.dataset.v; render(); document.getElementById('progress-card')?.scrollIntoView({ block: 'start' }); return;
    case 'chart-pt': {
      const sr = liftSeries().find((x) => x.key === ui.chartEx) || liftSeries()[0];
      const p = sr?.pts[Number(el.dataset.i)];
      const out = document.getElementById('chart-read');
      if (p && out) out.innerHTML = `<b>${fmtDate(p.date)}</b> · ${esc(setText(p.set))} · ${fmtNum(round1(p.v))} kg estimated`;
      document.querySelectorAll('.liftchart .pt').forEach((g) => g.classList.toggle('on', g === el));
      return;
    }
    case 'fast-toggle': {
      const d = el.dataset.date;
      if (isFast(d)) delete S.fastDays[d]; else { S.fastDays[d] = true; toast('Fast day: counted as 0 kcal plus anything you log'); }
      break;
    }
    case 'ph-ai': photoAI(); return;
    case 'ph-manual': {
      const ps = photoState;
      const url = ps.url, id = ps.rec.id;
      // The one-off form takes over: saving it attaches the photo; cancelling drops it (closeSheet).
      openSheet('One-off meal', `<img class="phprev" src="${url}" alt="Your photo">${mealForm('oneoff-form', { date: ui.fuelDate || today(), name: (document.getElementById('ph-note')?.value || '').slice(0, 80) }, `<input type="hidden" name="photoId" value="${esc(id)}">`)}`);
      return;
    }
    case 'ph-del': photoState.items.splice(Number(el.dataset.i), 1); drawPhoto(); return;
    case 'ph-add-row': photoState.items.push({ name: 'Food', grams: 100, kcal: 0, p: 0, c: 0, f: 0, confidence: '' }); drawPhoto(); return;
    case 'ph-save': {
      const ps = photoState;
      const d = ui.fuelDate || today(), at = nowOn(d), slot = document.getElementById('ph-slot')?.value || slotForTime(at);
      for (const it of ps.items) S.meals.push({ id: uid(), date: d, at, name: it.grams ? `${it.name} (${fmtNum(it.grams)} g)` : it.name, kcal: Math.round(it.kcal || 0), p: round1(it.p || 0), c: round1(it.c || 0), f: round1(it.f || 0), servings: 1, ref: null, kind: 'photo', slot, photoId: ps.rec.id });
      ps.used = true;
      toast(`${ps.items.length} item${ps.items.length === 1 ? '' : 's'} added`);
      closeSheet(); break;
    }
    case 'ai-key-clear': FoodAI.setKey(''); toast('API key removed from this phone'); render(); return;
    case 'ai-gkey-clear': ask('Remove the Gemini key from this phone? Deliberation Council uses the same key, so it will need it again too.', 'Remove', () => { FoodAI.setGeminiKey(''); toast('Gemini key removed'); }); return;
    case 'ai-provider': FoodAI.setProvider(el.dataset.v); render(); return;
    case 'del-meas': S.measurements = S.measurements.filter((m) => m.date !== el.dataset.date); toast('Measurements removed'); break;
    case 'del-weight': S.weights = S.weights.filter((w) => w.date !== el.dataset.date); break;
    case 'bring-iron': ask('Replace everything in Gym & Fuel with your Iron & Eggs data?', 'Replace', () => { if (bringIron()) toast('Iron & Eggs data brought over'); }); return;
    case 'bring-iron-now': closeSheet(); if (bringIron()) toast('Iron & Eggs data brought over'); break;
    case 'backup': sendBackup(false); return;
    case 'backup-share': sendBackup(true); return;
    case 'backup-snooze': S.settings.backupSnooze = addDays(today(), 3); break;
    case 'share-week': openShareWeek(); return;
    case 'share-week-go': case 'share-week-save': {
      if (!shareBlob) return;
      Share.file(shareBlob, `gym-fuel-week-${today()}.png`, `My week on Gym & Fuel · ${APP_URL}`, a === 'share-week-save')
        .then((how) => { if (how !== 'cancelled') toast(how === 'shared' ? 'Shared' : 'Image saved'); });
      return;
    }
    case 'challenge-start': S.challenge = { start: today() }; toast(`Day 1 of ${CHALLENGE_DAYS}. Share your first card on Sunday`); break;
    case 'challenge-end': S.challenge = null; break;
    case 'install-go': if (installPrompt) { installPrompt.prompt(); installPrompt.userChoice?.finally(() => { installPrompt = null; render(); }); } return;
    case 'install-dismiss': S.settings.installDismissed = true; break;
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
  if (t.dataset.live === 'lib-q') { drawLib(); return; }
  if (t.dataset.ph && photoState) {
    const [i, k] = t.dataset.ph.split('|');
    const it = photoState.items[Number(i)];
    if (!it) return;
    if (k === 'name') { it.name = t.value; return; }
    const v = num(t.value) ?? 0;
    if (k === 'grams' && it.grams > 0 && v > 0) {
      // Scale this item from its previous weight, and show the new numbers without redrawing (focus stays put).
      const r = v / it.grams;
      for (const m of ['kcal', 'p', 'c', 'f']) {
        it[m] = m === 'kcal' ? Math.round(it[m] * r) : round1(it[m] * r);
        const box = document.querySelector(`[data-ph="${i}|${m}"]`);
        if (box) box.value = fmtNum(it[m]);
      }
    }
    it[k] = v;
    return;
  }
  if (t.dataset.live === 'picker-q') {
    const q = t.value.trim().toLowerCase();
    document.querySelectorAll('.picker-list .pick').forEach((b) => { b.hidden = !!q && !b.dataset.name.includes(q); });
    offSearchSoon(q);
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.edit) {
    const { prog, day, ex } = findEx(t.dataset.pid, t.dataset.did, t.dataset.eid);
    const k = t.dataset.edit;
    if (k === 'dayname') { if (t.value.trim()) day.name = t.value.trim(); }
    else if (k === 'progname') { if (t.value.trim()) prog.name = t.value.trim().slice(0, 60); }
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
  if (t.id === 'meal-photo-in') {
    const file = t.files?.[0];
    t.value = '';
    if (file) Photos.add(ui.fuelDate || today(), 'meal', file).then(openPhotoLog, () => toast('Couldn\'t save the photo'));
    return;
  }
  if (t.id === 'ai-key') { if (t.value.includes('•')) return; FoodAI.setKey(t.value); toast(t.value.trim() ? 'API key saved on this phone' : 'API key removed'); render(); return; }
  if (t.id === 'ai-model') { FoodAI.setModel(t.value); toast('Model saved'); return; }
  if (t.id === 'ai-gkey') { if (t.value.includes('•')) return; FoodAI.setGeminiKey(t.value); toast(t.value.trim() ? 'Gemini key saved on this phone' : 'Gemini key removed'); render(); return; }
  if (t.id === 'ai-free-url') { FoodAI.setFreeUrl(t.value); toast(FoodAI.getFreeUrl() ? 'Free service address saved' : 'Free service address cleared'); render(); return; }
  if (t.id === 'ai-gmodel') { FoodAI.setGeminiModel(t.value); toast('Gemini model saved'); return; }
  if (t.classList?.contains('photo-in')) {
    const file = t.files?.[0];
    if (file) Photos.add(today(), t.dataset.pose, file).then(() => { toast(`${cap(t.dataset.pose)} photo saved`); fillPhotos(); }, () => toast('Couldn\'t save the photo'));
    t.value = '';
    return;
  }
  if (t.id === 'chart-ex') { ui.chartEx = t.value; render(); return; }
  // The library list redraws on 'input' only: redrawing again on 'change' (when the search box loses focus to a
  // tap on a result) would replace the result under the finger and lose the tap.
  if (t.id === 'bg-pick') { S.settings.background = t.value === 'plain' ? 'plain' : 'photo'; commit(); return; }
  if (t.id === 'handle-set' || t.id === 'share-handle') {
    S.settings.handle = t.value.trim().slice(0, 40); save();
    if (t.id === 'share-handle') openShareWeek(); else toast('Saved');
    return;
  }
  if (t.id === 'hc-toggle') { S.settings.highContrast = t.checked; commit(); return; }
  if (t.id === 'gironda-toggle') { S.settings.girondaBar = t.checked; commit(); return; }
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
      S.meals.push({ id: uid(), date: d, at, name: `${food.name} (${fmtNum(g)} g)`, kcal: Math.round(food.kcal * k), p: round1(food.p * k), c: round1(food.c * k), f: round1(food.f * k), servings: 1, ref: null, kind: 'scan', slot: scanState.slot || slotForTime(at) });
      if (food.code) S.scanned = [food, ...(S.scanned || []).filter((x) => x.code !== food.code)].slice(0, 50); // remembered for offline use
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
    case 'prog-new-form': {
      const name = String(fd.get('name') || '').trim();
      if (!name) return;
      const src = S.programs[fd.get('from')];
      const n = Math.min(7, Math.max(1, Number(fd.get('days')) || 3));
      const rest = String(fd.get('rest') || '');
      const prog = {
        id: `my-${uid()}`, family: 'custom', name: name.slice(0, 60), edited: true,
        days: src ? cloneDays(src.days).map(({ weeks, group, ...d }) => d) : Array.from({ length: n }, (_, i) => ({ id: uid(), name: `Day ${i + 1}`, exercises: [] })),
      };
      if (rest) prog.restDays = rest.split('-').map(Number);
      else if (src?.restDays) prog.restDays = [...src.restDays];
      if (src) prog.about = `Copied from ${src.name}.`;
      S.programs[prog.id] = prog;
      S.settings.family = 'custom'; S.settings.active.custom = prog.id;
      ui.dayId = prog.days[0].id; ui.editProgram = !src; ui.tab = 'train'; ui.sub.train = 'log';
      closeSheet(); toast(src ? `${prog.name} created from a copy` : `${prog.name} created: add exercises to each day`); break;
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
        if (fd.get('photoId')) m.photoId = String(fd.get('photoId'));
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

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('.liftchart .pt')) { e.preventDefault(); e.target.closest('.pt').dispatchEvent(new MouseEvent('click', { bubbles: true })); }
});
// Coming back to the app on a new day shows the new day.
document.addEventListener('visibilitychange', () => { if (!document.hidden && !document.querySelector('.sheet-wrap') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) render(); });

render();
if (S.notice === 'start') { S.notice = null; save(); showWelcome(); }

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch(() => {}));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}
